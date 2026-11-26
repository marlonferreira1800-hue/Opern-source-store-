use anyhow::{bail, Result};
use futures::stream::{self, StreamExt};
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use crate::models::{App, GhAsset, GhRelease, GhRepo, GhSearch, SeedEntry};
use crate::platform::choose_asset;
use crate::store::Store;

/// Política oficial de curadoria, segurança e qualidade (5 Portões).
const POLICY_JSON: &str = include_str!("../../data/curation-policy.json");

/// Snapshot pré-validado dos 100 aplicativos curados (seed offline/rápida).
const CATALOG_SEED_JSON: &str = include_str!("../../data/catalog-seed.json");

/// Categorias fixas da loja.
const CATEGORIES: &str = include_str!("../../data/categories.json");

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AllowlistOverride {
    Id(String),
    Entry {
        id: String,
        #[serde(default)]
        category: Option<String>,
    },
}

impl AllowlistOverride {
    fn id(&self) -> &str {
        match self {
            Self::Id(s) => s,
            Self::Entry { id, .. } => id,
        }
    }

    fn category(&self) -> Option<&str> {
        match self {
            Self::Id(_) => None,
            Self::Entry { category, .. } => category.as_deref(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct LiveSearchThresholds {
    min_stars: u64,
    min_repo_age_days: i64,
    min_release_downloads: u64,
    grace_new_release_days: i64,
    max_inactive_push_days: i64,
    max_inactive_release_days: i64,
}

#[derive(Debug, Deserialize)]
struct PolicyThresholds {
    live_search: LiveSearchThresholds,
}

#[derive(Debug, Deserialize)]
struct CurationPolicy {
    thresholds: PolicyThresholds,
    allowed_licenses: Vec<String>,
    blocked_repos: Vec<String>,
    blocked_keywords: Vec<String>,
    blocked_name_and_topic_keywords: Vec<String>,
    non_app_keywords: Vec<String>,
    allowed_download_hosts: Vec<String>,
    #[serde(default)]
    dangerous_asset_extensions: Vec<String>,
    #[serde(default)]
    manual_allowlist_overrides: Vec<AllowlistOverride>,
}

static POLICY: OnceLock<CurationPolicy> = OnceLock::new();
static SEED_ENTRIES: OnceLock<Vec<SeedEntry>> = OnceLock::new();

fn policy() -> &'static CurationPolicy {
    POLICY.get_or_init(|| {
        serde_json::from_str(POLICY_JSON).expect("data/curation-policy.json inválido")
    })
}

fn seed_entries() -> &'static [SeedEntry] {
    SEED_ENTRIES.get_or_init(|| {
        serde_json::from_str(CATALOG_SEED_JSON).expect("data/catalog-seed.json inválido")
    })
}

fn days_since(iso: Option<&str>) -> Option<i64> {
    let raw = iso?.trim();
    if raw.is_empty() {
        return None;
    }
    let dt = chrono::DateTime::parse_from_rfc3339(raw).ok()?;
    Some(
        chrono::Utc::now()
            .signed_duration_since(dt.with_timezone(&chrono::Utc))
            .num_days(),
    )
}

fn contains_any_keyword(haystack_lower: &str, keywords: &[String]) -> bool {
    keywords
        .iter()
        .any(|kw| haystack_lower.contains(&kw.to_ascii_lowercase()))
}

fn manual_override(full_name: &str) -> Option<&'static AllowlistOverride> {
    let target = full_name.trim();
    policy()
        .manual_allowlist_overrides
        .iter()
        .find(|o| o.id().eq_ignore_ascii_case(target))
}

fn has_allowed_license(repo: &GhRepo) -> bool {
    let allowed = &policy().allowed_licenses;
    repo.license
        .as_ref()
        .map(|l| {
            allowed
                .iter()
                .any(|spdx| spdx.eq_ignore_ascii_case(l.spdx_id.trim()))
        })
        .unwrap_or(false)
}

/// Verifica se o identificador "owner/repo" está bloqueado pela política de segurança.
pub fn is_blocked_repo_id(full_name: &str) -> bool {
    let p = policy();
    let lower = full_name.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return true;
    }
    if p.blocked_repos
        .iter()
        .any(|b| b.eq_ignore_ascii_case(&lower))
    {
        return true;
    }
    contains_any_keyword(&lower, &p.blocked_keywords)
        || contains_any_keyword(&lower, &p.blocked_name_and_topic_keywords)
        || contains_any_keyword(&lower, &p.non_app_keywords)
}

/// Garante que a URL de download usa HTTPS e pertence a um host autorizado pela política.
pub fn is_allowed_download_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url.trim()) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return false;
    }
    if !parsed.port().map_or(true, |port| port == 443) {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    let host_lower = host.to_ascii_lowercase();
    policy()
        .allowed_download_hosts
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(&host_lower))
}

fn is_blocked_repo_metadata(repo: &GhRepo) -> bool {
    if is_blocked_repo_id(&repo.full_name) {
        return true;
    }
    let p = policy();
    let topics_lower = repo
        .topics
        .iter()
        .map(|t| t.to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join(" ");
    let name_and_topics = format!(
        "{} {} {}",
        repo.full_name.to_ascii_lowercase(),
        repo.name.to_ascii_lowercase(),
        topics_lower
    );
    let all_text = format!(
        "{} {}",
        name_and_topics,
        repo.description
            .as_deref()
            .unwrap_or("")
            .to_ascii_lowercase()
    );

    contains_any_keyword(&all_text, &p.blocked_keywords)
        || contains_any_keyword(&name_and_topics, &p.blocked_name_and_topic_keywords)
        || contains_any_keyword(&name_and_topics, &p.non_app_keywords)
}

/// Verifica se o repositório atende todos os portões de fama, atividade, licença e segurança.
pub fn is_famous_and_active(repo: &GhRepo) -> bool {
    if repo.fork || repo.archived || repo.disabled {
        return false;
    }
    let has_override = manual_override(&repo.full_name).is_some();
    let t = &policy().thresholds.live_search;
    if !has_override && repo.stargazers_count < t.min_stars {
        return false;
    }
    if !has_override {
        if let Some(created_at) = &repo.created_at {
            let Some(age_days) = days_since(Some(created_at.as_str())) else {
                return false;
            };
            if age_days < t.min_repo_age_days {
                return false;
            }
        }
    }
    let Some(inactive_days) = days_since(repo.pushed_at.as_deref()) else {
        return false;
    };
    if inactive_days > t.max_inactive_push_days {
        return false;
    }
    if is_blocked_repo_metadata(repo) {
        return false;
    }
    has_allowed_license(repo) || has_override
}

/// Valida se uma release é estável, recente, popular (fora da carência) e com URLs confiáveis.
pub fn is_safe_release(release: &GhRelease) -> bool {
    if release.draft || release.prerelease {
        return false;
    }
    let t = &policy().thresholds.live_search;
    let Some(age_days) = days_since(release.published_at.as_deref()) else {
        return false;
    };
    if age_days > t.max_inactive_release_days {
        return false;
    }
    let total_downloads: u64 = release.assets.iter().map(|a| a.download_count).sum();
    if age_days > t.grace_new_release_days && total_downloads < t.min_release_downloads {
        return false;
    }
    if release.assets.is_empty() {
        return false;
    }
    release
        .assets
        .iter()
        .all(|a| is_allowed_download_url(&a.browser_download_url))
}

fn is_dangerous_extension(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    policy()
        .dangerous_asset_extensions
        .iter()
        .any(|ext| lower.ends_with(&ext.to_ascii_lowercase()))
}

fn choose_safe_asset(assets: &[GhAsset]) -> Option<GhAsset> {
    let safe: Vec<GhAsset> = assets
        .iter()
        .filter(|a| {
            !is_dangerous_extension(&a.name) && is_allowed_download_url(&a.browser_download_url)
        })
        .cloned()
        .collect();
    choose_asset(&safe)
}

pub fn categories() -> Vec<serde_json::Value> {
    serde_json::from_str(CATEGORIES).unwrap_or_default()
}

pub fn http_client(token: Option<&str>) -> Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(
        "X-GitHub-Api-Version",
        reqwest::header::HeaderValue::from_static("2022-11-28"),
    );
    if let Some(t) = token.map(str::trim).filter(|t| !t.is_empty()) {
        match reqwest::header::HeaderValue::from_str(&format!("Bearer {t}")) {
            Ok(val) => {
                headers.insert(reqwest::header::AUTHORIZATION, val);
            }
            Err(e) => log::warn!("Token do GitHub inválido ignorado: {e}"),
        }
    }
    Client::builder()
        .user_agent(
            "open-source-store/0.1 (https://github.com/marlonferreira1800-hue/open-source-store)",
        )
        .timeout(Duration::from_secs(30))
        .default_headers(headers)
        .build()
        .expect("failed to build http client")
}

async fn fetch_repo(client: &Client, full_name: &str) -> Result<Option<GhRepo>> {
    let url = format!("https://api.github.com/repos/{full_name}");
    let resp = client.get(&url).send().await?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let repo = resp.error_for_status()?.json::<GhRepo>().await?;
    Ok(Some(repo))
}

async fn fetch_latest_release(client: &Client, full_name: &str) -> Result<Option<GhRelease>> {
    let url = format!("https://api.github.com/repos/{full_name}/releases/latest");
    let resp = client.get(&url).send().await?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let release = resp.error_for_status()?.json::<GhRelease>().await?;
    Ok(Some(release))
}

fn normalize_words(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push(' ');
    let mut last_space = true;
    for ch in s.chars() {
        if ch.is_alphanumeric() {
            for lc in ch.to_lowercase() {
                out.push(lc);
            }
            last_space = false;
        } else if !last_space {
            out.push(' ');
            last_space = true;
        }
    }
    if !last_space {
        out.push(' ');
    }
    out
}

fn has_word(padded_haystack: &str, phrase: &str) -> bool {
    let needle = normalize_words(phrase);
    needle.len() > 2 && padded_haystack.contains(&needle)
}

/// Mapeia tópicos, nome e descrição do repositório para uma das categorias da loja
/// usando correspondência por limites de palavra e pontuação por categoria.
fn infer_category(repo: &GhRepo) -> String {
    let raw = format!(
        "{} {} {}",
        repo.topics.join(" "),
        repo.name,
        repo.description.as_deref().unwrap_or("")
    );
    let haystack = normalize_words(&raw);
    let is_terminal = has_word(&haystack, "terminal") || has_word(&haystack, "ssh");

    let rules: [(&str, &[&str]); 9] = [
        (
            "Security",
            &[
                "password",
                "password manager",
                "keepass",
                "bitwarden",
                "2fa",
                "totp",
                "authenticator",
                "vault",
                "cryptomator",
                "veracrypt",
                "vpn",
                "tailscale",
                "wireguard",
                "cybersecurity",
                "antivirus",
                "firewall",
            ],
        ),
        (
            "Games",
            &[
                "game",
                "games",
                "gaming",
                "game engine",
                "game launcher",
                "godot",
                "bevy",
                "gdevelop",
                "minecraft",
                "retroarch",
                "pcsx2",
                "dolphin",
                "rpcs3",
                "shadps4",
            ],
        ),
        (
            "Multimedia",
            &[
                "video",
                "audio",
                "music",
                "media",
                "media player",
                "music player",
                "video editor",
                "audio editor",
                "streaming",
                "obs studio",
                "ffmpeg",
                "podcast",
                "audacity",
                "shotcut",
                "handbrake",
                "mpv",
                "kodi",
                "jellyfin",
                "transcoder",
                "screen recorder",
            ],
        ),
        (
            "Graphics",
            &[
                "image editor",
                "photo editor",
                "graphic design",
                "drawing",
                "whiteboard",
                "diagram",
                "3d",
                "cad",
                "svg",
                "canvas",
                "excalidraw",
                "tldraw",
                "krita",
                "inkscape",
                "blender",
                "slicer",
                "shader",
                "textures",
                "material maker",
                "paint",
            ],
        ),
        (
            "Internet",
            &[
                "browser",
                "mail",
                "email",
                "chat",
                "messenger",
                "torrent",
                "bittorrent",
                "downloader",
                "ftp",
                "remote desktop",
                "zulip",
                "element",
                "localsend",
            ],
        ),
        (
            "Office",
            &[
                "note",
                "notes",
                "markdown",
                "pdf",
                "spreadsheet",
                "office",
                "knowledge",
                "wiki",
                "notion",
                "joplin",
                "logseq",
                "ebook",
                "epub",
                "calibre",
                "zotero",
                "anki",
                "productivity",
                "time tracking",
                "todo",
                "tasks",
            ],
        ),
        (
            "Science",
            &[
                "science",
                "scientific",
                "research",
                "math",
                "physics",
                "biology",
                "chemistry",
                "astronomy",
                "stellarium",
                "gis",
                "qgis",
                "gephi",
                "graph visualization",
                "network analysis",
                "rstudio",
                "positron",
                "scilab",
                "machine learning",
                "llm",
                "ollama",
            ],
        ),
        (
            "Development",
            &[
                "ide",
                "editor",
                "code",
                "git",
                "api",
                "rest",
                "graphql",
                "http client",
                "database",
                "sql",
                "compiler",
                "devtools",
                "terminal",
                "shell",
                "ssh",
                "diff",
                "merge",
                "decompiler",
                "codegraph",
            ],
        ),
        (
            "Utilities",
            &[
                "utility",
                "utilities",
                "monitor",
                "launcher",
                "clipboard",
                "clipboard manager",
                "backup",
                "sync",
                "file manager",
                "system",
                "cleaner",
                "usb",
                "iso",
                "flasher",
                "uefi",
                "bios",
                "firmware",
                "screenshot",
                "image upload",
                "ocr",
                "package manager",
            ],
        ),
    ];

    let mut best_cat = "Other";
    let mut best_score = 0usize;
    for (cat, keywords) in rules {
        let mut score = keywords.iter().filter(|k| has_word(&haystack, k)).count();
        if cat == "Games" && !is_terminal && has_word(&haystack, "emulator") {
            score += 1;
        }
        if score > best_score {
            best_score = score;
            best_cat = cat;
        }
    }
    best_cat.to_string()
}

fn count_supported_platforms(assets: &[GhAsset]) -> u32 {
    let mut win = false;
    let mut linux = false;
    let mut mac = false;
    for asset in assets {
        if asset.size == 0 || is_dangerous_extension(&asset.name) {
            continue;
        }
        let n = asset.name.to_ascii_lowercase();
        if n.ends_with(".msi")
            || n.ends_with(".exe")
            || ((n.contains("win") || n.contains("windows")) && n.ends_with(".zip"))
        {
            win = true;
        }
        if n.ends_with(".appimage")
            || n.ends_with(".deb")
            || n.ends_with(".rpm")
            || (n.contains("linux") && (n.ends_with(".tar.gz") || n.ends_with(".tgz")))
        {
            linux = true;
        }
        if n.ends_with(".dmg")
            || n.ends_with(".pkg")
            || ((n.contains("macos") || n.contains("darwin") || n.contains("osx"))
                && (n.ends_with(".zip") || n.ends_with(".tar.gz")))
        {
            mac = true;
        }
    }
    u32::from(win) + u32::from(linux) + u32::from(mac)
}

fn compute_trust_and_flags(
    repo: &GhRepo,
    release: Option<&GhRelease>,
    sha256: Option<&str>,
    downloads: u64,
) -> (u8, Vec<String>, Vec<String>) {
    let has_osi_license = has_allowed_license(repo);
    let has_sha256 = sha256.is_some();
    let repo_age_days = days_since(repo.created_at.as_deref());
    let push_age_days = days_since(repo.pushed_at.as_deref());
    let release_age_days = release.and_then(|r| days_since(r.published_at.as_deref()));

    let stars_pts: u32 = match repo.stargazers_count {
        100_000.. => 20,
        25_000.. => 16,
        10_000.. => 12,
        3_000.. => 8,
        1_000.. => 4,
        _ => 0,
    };
    let dl_pts: u32 = match downloads {
        100_000.. => 20,
        20_000.. => 15,
        5_000.. => 10,
        500.. => 5,
        _ => 0,
    };
    let license_pts: u32 = if has_osi_license { 15 } else { 0 };
    let checksum_pts: u32 = if has_sha256 { 15 } else { 0 };
    let maturity_pts: u32 = match repo_age_days {
        Some(d) if d >= 730 => 10,
        Some(d) if d >= 180 => 5,
        _ => 0,
    };
    let push_pts: u32 = match push_age_days {
        Some(d) if d <= 30 => 10,
        Some(d) if d <= 90 => 7,
        Some(d) if d <= 180 => 4,
        Some(d) if d <= 365 => 2,
        _ => 0,
    };
    let rel_pts: u32 = match release_age_days {
        Some(d) if d <= 90 => 5,
        Some(d) if d <= 180 => 3,
        Some(d) if d <= 365 => 1,
        _ => 0,
    };
    let plat_pts: u32 = release
        .map(|r| (count_supported_platforms(&r.assets) * 2).min(5))
        .unwrap_or(0);

    let total = (stars_pts
        + dl_pts
        + license_pts
        + checksum_pts
        + maturity_pts
        + push_pts
        + rel_pts
        + plat_pts)
        .min(100) as u8;

    let mut security_flags = Vec::new();
    if has_osi_license {
        security_flags.push("osi-license".to_string());
    }
    if has_sha256 {
        security_flags.push("sha256-verified".to_string());
    }
    if repo_age_days.is_some_and(|d| d >= 730) {
        security_flags.push("mature-repo".to_string());
    }

    let warnings = if has_sha256 {
        Vec::new()
    } else {
        vec!["no-sha256-digest".to_string()]
    };

    (total, security_flags, warnings)
}

/// Monta o objeto App a partir do repo + release, escolhendo o asset seguro da plataforma atual.
fn build_app(repo: &GhRepo, release: Option<&GhRelease>, category_hint: &str) -> App {
    let (version, release_url, published_at, downloads, asset) = match release {
        Some(r) => {
            let dl: u64 = r.assets.iter().map(|a| a.download_count).sum();
            let chosen = choose_safe_asset(&r.assets);
            (
                r.tag_name.clone(),
                r.html_url.clone(),
                r.published_at.clone().unwrap_or_default(),
                dl,
                chosen,
            )
        }
        None => (String::new(), repo.html_url.clone(), String::new(), 0, None),
    };

    let category = if !category_hint.is_empty() {
        category_hint.to_string()
    } else if let Some(override_cat) = manual_override(&repo.full_name).and_then(|o| o.category()) {
        override_cat.to_string()
    } else {
        infer_category(repo)
    };

    let (download_url, file_name, size_bytes, sha256) = match &asset {
        Some(a) => (
            a.browser_download_url.clone(),
            a.name.clone(),
            a.size,
            a.digest
                .as_deref()
                .map(str::trim)
                .filter(|d| !d.is_empty())
                .map(str::to_string),
        ),
        None => (String::new(), String::new(), 0, None),
    };

    let (trust_score, security_flags, warnings) =
        compute_trust_and_flags(repo, release, sha256.as_deref(), downloads);

    App {
        id: repo.full_name.clone(),
        name: repo.name.clone(),
        tagline: repo.description.clone().unwrap_or_default(),
        description: release
            .and_then(|r| r.body.clone())
            .map(|b| b.chars().take(500).collect())
            .unwrap_or_else(|| repo.description.clone().unwrap_or_default()),
        category,
        author: repo.owner.login.clone(),
        version,
        license: repo
            .license
            .as_ref()
            .map(|l| l.spdx_id.clone())
            .unwrap_or_else(|| "Unknown".into()),
        stars: repo.stargazers_count,
        pushed_at: repo.pushed_at.clone().unwrap_or_default(),
        downloads,
        icon_url: repo.owner.avatar_url.clone(),
        github_url: repo.html_url.clone(),
        homepage: repo.homepage.clone().unwrap_or_default(),
        release_url,
        download_url,
        file_name,
        size_bytes,
        sha256,
        published_at,
        tags: repo.topics.clone(),
        trust_score,
        security_flags,
        warnings,
        installed: false,
        installed_version: None,
        has_update: false,
        installed_path: None,
    }
}

/// Constrói um App a partir de uma entrada pré-validada de `data/catalog-seed.json`.
pub fn build_app_from_seed(entry: &SeedEntry) -> App {
    let mut app = build_app(&entry.repo, Some(&entry.release), &entry.category);
    app.trust_score = entry.trust_score;
    let mut flags = entry.security_flags.clone();
    for flag in app.security_flags {
        if !flags.contains(&flag) {
            flags.push(flag);
        }
    }
    app.security_flags = flags;
    app
}

fn build_refreshed_seed_app(repo: &GhRepo, release: &GhRelease, seed: &SeedEntry) -> App {
    let mut app = build_app(repo, Some(release), &seed.category);
    for flag in ["security-policy", "verified-org"] {
        if seed.security_flags.iter().any(|f| f == flag)
            && !app.security_flags.iter().any(|f| f == flag)
        {
            app.security_flags.push(flag.to_string());
        }
    }
    app
}

fn load_seed_apps() -> Vec<App> {
    seed_entries()
        .iter()
        .filter(|e| !is_blocked_repo_id(&e.repo.full_name))
        .map(build_app_from_seed)
        .collect()
}

enum RefreshOutcome {
    Updated(Box<App>),
    Rejected,
    TransientError,
}

async fn refresh_seed_entry(client: &Client, entry: &SeedEntry) -> (bool, RefreshOutcome) {
    let full_name = &entry.repo.full_name;
    match fetch_repo(client, full_name).await {
        Ok(Some(repo)) => {
            if !is_famous_and_active(&repo) {
                log::debug!(
                    "catalog: descartado {full_name} (não passou nos portões de curadoria)"
                );
                return (true, RefreshOutcome::Rejected);
            }
            match fetch_latest_release(client, full_name).await {
                Ok(Some(release))
                    if is_safe_release(&release)
                        && choose_safe_asset(&release.assets).is_some() =>
                {
                    (
                        true,
                        RefreshOutcome::Updated(Box::new(build_refreshed_seed_app(
                            &repo, &release, entry,
                        ))),
                    )
                }
                Ok(_) => {
                    log::debug!("catalog: pulando {full_name} (release insegura ou sem asset)");
                    (true, RefreshOutcome::Rejected)
                }
                Err(e) => {
                    log::warn!("catalog: falha ao atualizar release de {full_name}: {e}");
                    (true, RefreshOutcome::TransientError)
                }
            }
        }
        Ok(None) => {
            log::warn!("catalog: repositório {full_name} não encontrado (404)");
            (true, RefreshOutcome::Rejected)
        }
        Err(e) => {
            log::warn!("catalog: falha ao buscar {full_name}: {e}");
            (false, RefreshOutcome::TransientError)
        }
    }
}

async fn fetch_and_merge_seed(
    store: &Store,
    token: Option<&str>,
    refresh_limit: usize,
) -> Result<(Vec<App>, bool, bool)> {
    let seeds = seed_entries();
    let limit = seeds.len().min(refresh_limit);
    let client = Arc::new(http_client(token));

    log::info!(
        "catalog: atualizando {} de {} repos curados no GitHub",
        limit,
        seeds.len()
    );

    let results: Vec<(String, bool, RefreshOutcome)> = stream::iter(seeds[..limit].iter().cloned())
        .map(|entry| {
            let client = Arc::clone(&client);
            async move {
                let id = entry.repo.full_name.clone();
                let (ok, outcome) = refresh_seed_entry(&client, &entry).await;
                (id, ok, outcome)
            }
        })
        .buffer_unordered(8)
        .collect()
        .await;

    let mut online_ok = false;
    let mut refreshed = HashMap::with_capacity(limit);
    for (id, ok, outcome) in results {
        if ok {
            online_ok = true;
        }
        refreshed.insert(id.to_ascii_lowercase(), outcome);
    }

    if !online_ok {
        log::warn!(
            "catalog: API do GitHub indisponível (rate limit/rede). Usando fallback seed validado."
        );
        let mut apps = load_seed_apps();
        apps.sort_by_key(|a| (std::cmp::Reverse(a.trust_score), std::cmp::Reverse(a.stars)));
        return Ok((apps, false, true));
    }

    let mut apps = Vec::with_capacity(seeds.len());
    for entry in seeds {
        if is_blocked_repo_id(&entry.repo.full_name) {
            continue;
        }
        let key = entry.repo.full_name.to_ascii_lowercase();
        match refreshed.remove(&key) {
            Some(RefreshOutcome::Updated(app)) => apps.push(*app),
            Some(RefreshOutcome::Rejected) => {}
            Some(RefreshOutcome::TransientError) | None => apps.push(build_app_from_seed(entry)),
        }
    }

    apps.sort_by_key(|a| (std::cmp::Reverse(a.trust_score), std::cmp::Reverse(a.stars)));
    if !apps.is_empty() {
        store.save_catalog_cache(&apps)?;
    }
    Ok((apps, false, false))
}

/// Busca o catálogo:
/// - Sem token: usa cache local fresco ou carrega os 100 apps validados de `catalog-seed.json`;
///   com `force_refresh`, atualiza o top 25 ao vivo mesclando com os 100 do seed.
/// - Com token: busca todos os curados ao vivo na API do GitHub com fallback para `SeedEntry`.
pub async fn fetch_catalog(
    store: &Store,
    token: Option<&str>,
    force_refresh: bool,
) -> Result<(Vec<App>, bool, bool)> {
    const TTL_SECS: i64 = 30 * 60;
    let clean_token = token.map(str::trim).filter(|t| !t.is_empty());

    if !force_refresh {
        if let Ok(Some(cache)) = store.load_catalog_cache() {
            let fetched = chrono::DateTime::parse_from_rfc3339(&cache.fetched_at)
                .map(|d| d.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::DateTime::<chrono::Utc>::from_timestamp(0, 0).unwrap());
            if chrono::Utc::now()
                .signed_duration_since(fetched)
                .num_seconds()
                < TTL_SECS
            {
                let raw_len = cache.apps.len();
                let apps: Vec<App> = cache
                    .apps
                    .into_iter()
                    .filter(|a| !is_blocked_repo_id(&a.id))
                    .filter(|a| {
                        a.download_url.is_empty() || is_allowed_download_url(&a.download_url)
                    })
                    .collect();
                let has_legacy_zero_score = apps.iter().any(|a| a.trust_score == 0);
                let is_incomplete = apps.len() < seed_entries().len();
                let had_blocked = apps.len() != raw_len;
                if !apps.is_empty() && !has_legacy_zero_score && !is_incomplete && !had_blocked {
                    log::info!("catalog: usando cache local ({} apps)", apps.len());
                    return Ok((apps, true, false));
                }
                log::info!(
                    "catalog: invalidando cache legado/incompleto ({} apps, zero_score={}, incomplete={}, blocked={})",
                    apps.len(),
                    has_legacy_zero_score,
                    is_incomplete,
                    had_blocked
                );
            }
        }
    }

    if clean_token.is_none() && !force_refresh {
        let mut apps = load_seed_apps();
        apps.sort_by_key(|a| (std::cmp::Reverse(a.trust_score), std::cmp::Reverse(a.stars)));
        log::info!(
            "catalog: carregando {} apps validados do snapshot catalog-seed.json",
            apps.len()
        );
        if !apps.is_empty() {
            let _ = store.save_catalog_cache(&apps);
        }
        return Ok((apps, true, false));
    }

    let refresh_limit = if clean_token.is_some() {
        seed_entries().len()
    } else {
        25
    };
    fetch_and_merge_seed(store, clean_token, refresh_limit).await
}

/// Busca um único repositório ("owner/repo") + release mais recente no GitHub.
pub async fn fetch_single_app(full_name: &str, token: Option<&str>) -> Result<App> {
    if is_blocked_repo_id(full_name) {
        bail!("Repositório bloqueado pela política de segurança da loja: {full_name}");
    }
    let client = http_client(token);
    let Some(repo) = fetch_repo(&client, full_name).await? else {
        bail!("Repositório não encontrado: {full_name}");
    };
    if is_blocked_repo_metadata(&repo) {
        bail!(
            "Repositório bloqueado pela política de segurança da loja: {}",
            repo.full_name
        );
    }
    let release = fetch_latest_release(&client, full_name)
        .await?
        .filter(is_safe_release);
    Ok(build_app(&repo, release.as_ref(), ""))
}

/// Busca ao vivo no GitHub por repositórios aplicando todos os portões de segurança e qualidade.
pub async fn search_github(query: &str, token: Option<&str>, page: u32) -> Result<Vec<App>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let client = Arc::new(http_client(token));
    let q = format!("{query} in:name,description,readme fork:false archived:false");
    let url = format!(
        "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page=20&page={}",
        urlencoding_encode(&q),
        page.max(1)
    );
    let search = client
        .get(&url)
        .send()
        .await?
        .error_for_status()?
        .json::<GhSearch>()
        .await?;
    log::info!("search: '{}' -> {} resultados", query, search.total_count);

    let candidates: Vec<GhRepo> = search
        .items
        .into_iter()
        .take(20)
        .filter(is_famous_and_active)
        .collect();

    let mut apps: Vec<App> = stream::iter(candidates)
        .map(|repo| {
            let client = Arc::clone(&client);
            async move {
                if let Ok(Some(release)) = fetch_latest_release(&client, &repo.full_name).await {
                    if is_safe_release(&release) && choose_safe_asset(&release.assets).is_some() {
                        return Some(build_app(&repo, Some(&release), ""));
                    }
                }
                None
            }
        })
        .buffer_unordered(8)
        .filter_map(|x| async move { x })
        .collect()
        .await;

    apps.sort_by_key(|a| (std::cmp::Reverse(a.trust_score), std::cmp::Reverse(a.stars)));
    Ok(apps)
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Aplica o estado local (instalados) sobre o catálogo.
pub fn apply_local_state(apps: &mut [App], store: &Store) {
    if let Ok(installed) = store.load_installed() {
        for app in apps.iter_mut() {
            if let Some(inst) = installed.iter().find(|i| i.id == app.id) {
                app.installed = true;
                app.installed_version = Some(inst.version.clone());
                app.installed_path = Some(inst.file_path.clone());
                app.has_update = !app.version.is_empty() && app.version != inst.version;
            }
        }
    }
}

/// Verifica atualizações comparando versões instaladas com o catálogo.
pub fn check_updates(apps: &[App]) -> Vec<App> {
    apps.iter().filter(|a| a.has_update).cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GhLicense, GhOwner};

    fn days_ago(days: i64) -> String {
        (chrono::Utc::now() - chrono::Duration::days(days)).to_rfc3339()
    }

    fn repo(stars: u64, pushed_at: Option<&str>) -> GhRepo {
        GhRepo {
            full_name: "safe-org/safe-app".into(),
            name: "safe-app".into(),
            description: Some("Aplicativo desktop open source".into()),
            html_url: "https://github.com/safe-org/safe-app".into(),
            homepage: None,
            stargazers_count: stars,
            pushed_at: pushed_at.map(|s| s.to_string()),
            created_at: Some(days_ago(400)),
            fork: false,
            archived: false,
            disabled: false,
            topics: vec![],
            license: Some(GhLicense {
                spdx_id: "MIT".into(),
                name: "MIT License".into(),
            }),
            owner: GhOwner {
                login: "safe-org".into(),
                avatar_url: "https://avatars.githubusercontent.com/u/1?v=4".into(),
            },
        }
    }

    fn safe_asset(name: &str, downloads: u64, digest: Option<&str>) -> GhAsset {
        GhAsset {
            name: name.to_string(),
            browser_download_url: format!(
                "https://github.com/safe-org/safe-app/releases/download/v1.0.0/{name}"
            ),
            size: 10_485_760,
            download_count: downloads,
            digest: digest.map(|d| d.to_string()),
        }
    }

    fn safe_release(days_old: i64, downloads: u64, digest: Option<&str>) -> GhRelease {
        // Asset com marcador da plataforma atual para o choose_asset selecionar
        // em qualquer SO (CI roda em Linux, dev local pode ser Windows/macOS).
        let asset_name = if cfg!(windows) {
            "safe-app-windows-x64.msi"
        } else if cfg!(target_os = "macos") {
            "safe-app-macos-arm64.dmg"
        } else {
            "safe-app-linux-x64.AppImage"
        };
        GhRelease {
            tag_name: "v1.0.0".into(),
            name: Some("v1.0.0".into()),
            body: Some("Notas da release".into()),
            html_url: "https://github.com/safe-org/safe-app/releases/tag/v1.0.0".into(),
            published_at: Some(days_ago(days_old)),
            draft: false,
            prerelease: false,
            assets: vec![safe_asset(asset_name, downloads, digest)],
        }
    }

    #[test]
    fn famoso_e_ativo_entra() {
        let recent = days_ago(5);
        assert!(is_famous_and_active(&repo(50_000, Some(&recent))));
    }

    #[test]
    fn pouco_famoso_nao_entra() {
        let recent = days_ago(5);
        let min_stars = policy().thresholds.live_search.min_stars;
        assert!(!is_famous_and_active(&repo(min_stars - 1, Some(&recent))));
    }

    #[test]
    fn inativo_nao_entra() {
        let old = days_ago(730);
        assert!(!is_famous_and_active(&repo(500_000, Some(&old))));
    }

    #[test]
    fn sem_data_de_push_nao_entra() {
        assert!(!is_famous_and_active(&repo(500_000, None)));
    }

    #[test]
    fn rejeita_licencas_nao_osi_e_ausentes() {
        let recent = days_ago(2);
        let mut r = repo(10_000, Some(&recent));
        r.license = None;
        assert!(!is_famous_and_active(&r));

        r.license = Some(GhLicense {
            spdx_id: "NOASSERTION".into(),
            name: "Other".into(),
        });
        assert!(!is_famous_and_active(&r));

        r.license = Some(GhLicense {
            spdx_id: "NONE".into(),
            name: "None".into(),
        });
        assert!(!is_famous_and_active(&r));

        r.license = Some(GhLicense {
            spdx_id: "Proprietary".into(),
            name: "Proprietary".into(),
        });
        assert!(!is_famous_and_active(&r));

        r.license = Some(GhLicense {
            spdx_id: "Apache-2.0".into(),
            name: "Apache License 2.0".into(),
        });
        assert!(is_famous_and_active(&r));
    }

    #[test]
    fn rejeita_fork_arquivado_desabilitado_e_jovem() {
        let recent = days_ago(2);

        let mut forked = repo(20_000, Some(&recent));
        forked.fork = true;
        assert!(!is_famous_and_active(&forked));

        let mut archived = repo(20_000, Some(&recent));
        archived.archived = true;
        assert!(!is_famous_and_active(&archived));

        let mut disabled = repo(20_000, Some(&recent));
        disabled.disabled = true;
        assert!(!is_famous_and_active(&disabled));

        let mut young = repo(20_000, Some(&recent));
        young.created_at = Some(days_ago(15));
        assert!(!is_famous_and_active(&young));

        let mut unknown_age = repo(20_000, Some(&recent));
        unknown_age.created_at = None;
        assert!(is_famous_and_active(&unknown_age));
    }

    #[test]
    fn bloqueia_repos_e_palavras_chave_de_risco() {
        assert!(is_blocked_repo_id("Alishahryar1/free-claude-code"));
        assert!(is_blocked_repo_id("2dust/v2rayng"));
        assert!(is_blocked_repo_id("evil/ransomware-kit"));
        assert!(!is_blocked_repo_id("zed-industries/zed"));

        let recent = days_ago(2);

        let mut explicit = repo(50_000, Some(&recent));
        explicit.full_name = "poteto/hiring-without-whiteboards".into();
        assert!(!is_famous_and_active(&explicit));

        let mut desc_blocked = repo(50_000, Some(&recent));
        desc_blocked.description = Some("Use free-claude proxy for unlimited access".into());
        assert!(!is_famous_and_active(&desc_blocked));

        let mut topic_blocked = repo(50_000, Some(&recent));
        topic_blocked.topics = vec!["paywall".into()];
        assert!(!is_famous_and_active(&topic_blocked));

        let mut non_app = repo(50_000, Some(&recent));
        non_app.topics = vec!["react-component".into()];
        assert!(!is_famous_and_active(&non_app));
    }

    #[test]
    fn valida_is_safe_release() {
        assert!(is_safe_release(&safe_release(30, 1_500, None)));
        assert!(is_safe_release(&safe_release(2, 10, None)));

        let mut draft = safe_release(5, 2_000, None);
        draft.draft = true;
        assert!(!is_safe_release(&draft));

        let mut pre = safe_release(5, 2_000, None);
        pre.prerelease = true;
        assert!(!is_safe_release(&pre));

        assert!(!is_safe_release(&safe_release(900, 10_000, None)));
        assert!(!is_safe_release(&safe_release(30, 100, None)));

        let mut no_date = safe_release(5, 2_000, None);
        no_date.published_at = None;
        assert!(!is_safe_release(&no_date));

        let mut bad_url = safe_release(5, 2_000, None);
        bad_url.assets[0].browser_download_url = "https://evil.example.com/app.msi".into();
        assert!(!is_safe_release(&bad_url));
    }

    #[test]
    fn valida_urls_de_download_permitidas() {
        assert!(is_allowed_download_url(
            "https://github.com/zed-industries/zed/releases/download/v1.0/Zed.exe"
        ));
        assert!(is_allowed_download_url(
            "https://objects.githubusercontent.com/github-production-release-asset/123"
        ));
        assert!(is_allowed_download_url(
            "https://release-assets.githubusercontent.com/asset.msi"
        ));

        assert!(!is_allowed_download_url(
            "http://github.com/zed-industries/zed/releases/download/v1.0/Zed.exe"
        ));
        assert!(!is_allowed_download_url("https://evil.com/Zed.exe"));
        assert!(!is_allowed_download_url(
            "https://github.com.evil.com/Zed.exe"
        ));
        assert!(!is_allowed_download_url("https://user@github.com/Zed.exe"));
        assert!(!is_allowed_download_url(""));
    }

    #[test]
    fn build_app_calcula_trust_score_flags_e_warnings() {
        let recent = days_ago(3);
        let mut r = repo(40_000, Some(&recent));
        r.created_at = Some(days_ago(900));

        let rel_no_sha = safe_release(10, 25_000, None);
        let app_no_sha = build_app(&r, Some(&rel_no_sha), "");
        assert!(app_no_sha.trust_score >= 60);
        assert!(app_no_sha
            .security_flags
            .contains(&"osi-license".to_string()));
        assert!(app_no_sha
            .security_flags
            .contains(&"mature-repo".to_string()));
        assert!(!app_no_sha
            .security_flags
            .contains(&"sha256-verified".to_string()));
        assert_eq!(app_no_sha.warnings, vec!["no-sha256-digest".to_string()]);

        let rel_with_sha = safe_release(10, 25_000, Some("sha256:deadbeef"));
        let app_with_sha = build_app(&r, Some(&rel_with_sha), "");
        assert!(app_with_sha.trust_score > app_no_sha.trust_score);
        assert!(app_with_sha
            .security_flags
            .contains(&"sha256-verified".to_string()));
        assert!(app_with_sha.warnings.is_empty());
    }

    #[test]
    fn carrega_seed_completo_com_100_apps_validos() {
        let entries = seed_entries();
        assert!(entries.len() >= 100);
        let on_windows = crate::platform::current_platform().starts_with("windows");
        for entry in entries {
            assert!(
                is_famous_and_active(&entry.repo),
                "seed repo reprovado em is_famous_and_active: {}",
                entry.repo.full_name
            );
            assert!(
                is_safe_release(&entry.release),
                "seed release reprovada em is_safe_release: {}",
                entry.repo.full_name
            );
        }
        let apps = load_seed_apps();
        assert_eq!(apps.len(), entries.len());
        for app in &apps {
            assert!(!app.id.is_empty());
            assert!(!is_blocked_repo_id(&app.id), "seed bloqueado: {}", app.id);
            assert!(app.trust_score > 0, "score zerado: {}", app.id);
            if on_windows {
                assert!(
                    !app.download_url.is_empty(),
                    "seed sem instalador Windows selecionado: {}",
                    app.id
                );
            }
            assert!(
                app.download_url.is_empty() || is_allowed_download_url(&app.download_url),
                "URL não permitida em {}: {}",
                app.id,
                app.download_url
            );
        }
    }

    #[tokio::test]
    async fn fetch_catalog_sem_token_carrega_100_apps_do_seed() {
        let root = std::env::temp_dir().join(format!(
            "oss_catalog_test_{}_{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let store = Store { root: root.clone() };
        let (apps, from_cache, offline) = fetch_catalog(&store, None, false).await.unwrap();
        let _ = std::fs::remove_dir_all(&root);

        assert_eq!(apps.len(), seed_entries().len());
        assert!(from_cache);
        assert!(!offline);
    }

    #[tokio::test]
    async fn fetch_catalog_invalida_cache_legado_ou_incompleto() {
        let root = std::env::temp_dir().join(format!(
            "oss_legacy_cache_test_{}_{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let store = Store { root: root.clone() };

        let mut legacy_app = build_app(&repo(5_000, Some(&days_ago(2))), None, "Utilities");
        legacy_app.trust_score = 0;
        let legacy_batch: Vec<App> = (0..20)
            .map(|i| {
                let mut a = legacy_app.clone();
                a.id = format!("legacy/app-{i}");
                a
            })
            .collect();
        store.save_catalog_cache(&legacy_batch).unwrap();

        let (apps, from_cache, offline) = fetch_catalog(&store, None, false).await.unwrap();
        let reloaded_cache = store.load_catalog_cache().unwrap().unwrap();
        let _ = std::fs::remove_dir_all(&root);

        assert_eq!(apps.len(), seed_entries().len());
        assert!(apps.iter().all(|a| a.trust_score > 0));
        assert!(from_cache);
        assert!(!offline);
        assert_eq!(reloaded_cache.apps.len(), seed_entries().len());
    }

    #[test]
    fn token_invalido_nao_causa_panic() {
        let _ = http_client(Some("token\ncom\rquebra"));
    }

    #[test]
    fn infere_categoria_correta() {
        let mut r = repo(5000, None);
        r.topics = vec!["rust".into(), "terminal".into()];
        assert_eq!(infer_category(&r), "Development");

        let mut term_emu = repo(5000, None);
        term_emu.topics = vec!["terminal".into(), "terminal-emulator".into()];
        term_emu.description = Some("A GPU-accelerated terminal emulator".into());
        assert_eq!(infer_category(&term_emu), "Development");

        let mut material = repo(5000, None);
        material.name = "material-maker".into();
        material.topics = vec![
            "3d".into(),
            "shader".into(),
            "textures".into(),
            "godot".into(),
        ];
        material.description = Some("Procedural texture authoring tool".into());
        assert_eq!(infer_category(&material), "Graphics");

        let mut rufus = repo(5000, None);
        rufus.name = "rufus".into();
        rufus.topics = vec!["usb".into(), "iso".into(), "flasher".into()];
        rufus.description = Some("Create bootable USB drives for BIOS and UEFI".into());
        assert_eq!(infer_category(&rufus), "Utilities");

        let mut copyq = repo(5000, None);
        copyq.name = "CopyQ".into();
        copyq.topics = vec!["clipboard".into(), "clipboard-manager".into()];
        assert_eq!(infer_category(&copyq), "Utilities");

        let mut picgo = repo(5000, None);
        picgo.name = "PicGo".into();
        picgo.topics = vec!["image-upload".into(), "obsidian".into()];
        assert_eq!(infer_category(&picgo), "Utilities");

        let mut doublecmd = repo(5000, None);
        doublecmd.name = "doublecmd".into();
        doublecmd.topics = vec!["file-manager".into()];
        doublecmd.description = Some("Dual panel side-by-side file manager".into());
        assert_eq!(infer_category(&doublecmd), "Utilities");

        let mut logseq = repo(5000, None);
        logseq.name = "logseq".into();
        logseq.topics = vec!["privacy".into(), "knowledge".into(), "notes".into()];
        assert_eq!(infer_category(&logseq), "Office");
    }
}
