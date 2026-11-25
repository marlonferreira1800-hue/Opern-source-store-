use anyhow::Result;
use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;

use crate::models::{App, GhRelease, GhRepo, GhSearch};
use crate::platform::choose_asset;
use crate::store::Store;

/// Repositórios open source curados (seed do catálogo).
/// O usuário também pode buscar qualquer repositório ao vivo.
const CURATED: &str = include_str!("../../data/curated.json");

/// Critérios para um app entrar na loja: famoso (mínimo de estrelas) e ativo (push recente).
pub const MIN_STARS: u64 = 1_000;
pub const MAX_INACTIVE_DAYS: i64 = 365;

/// Verifica se o repositório é famoso o suficiente e está ativo.
pub fn is_famous_and_active(repo: &GhRepo) -> bool {
    if repo.stargazers_count < MIN_STARS {
        return false;
    }
    match &repo.pushed_at {
        Some(p) => match chrono::DateTime::parse_from_rfc3339(p) {
            Ok(t) => {
                chrono::Utc::now().signed_duration_since(t.with_timezone(&chrono::Utc)).num_days()
                    <= MAX_INACTIVE_DAYS
            }
            Err(_) => false,
        },
        None => false,
    }
}

/// Categorias fixas da loja.
const CATEGORIES: &str = include_str!("../../data/categories.json");

pub fn categories() -> Vec<serde_json::Value> {
    serde_json::from_str(CATEGORIES).unwrap_or_default()
}

fn curated_repos() -> Vec<String> {
    serde_json::from_str(CURATED).unwrap_or_default()
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
        .user_agent("open-source-store/0.1 (https://github.com/marlonferreira1800-hue/Opern-source-store-)")
        .timeout(Duration::from_secs(30))
        .default_headers(headers)
        .build()
        .expect("failed to build http client")
}

async fn fetch_repo(client: &Client, full_name: &str) -> Result<GhRepo> {
    let url = format!("https://api.github.com/repos/{full_name}");
    let repo = client.get(&url).send().await?.error_for_status()?.json::<GhRepo>().await?;
    Ok(repo)
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

/// Mapeia tópicos e descrição do repositório para uma das categorias da loja.
fn infer_category(repo: &GhRepo) -> String {
    let mut haystack = repo.topics.join(" ").to_lowercase();
    if let Some(desc) = &repo.description {
        haystack.push(' ');
        haystack.push_str(&desc.to_lowercase());
    }
    let rules: [(&str, &[&str]); 9] = [
        ("Security", &["password", "security", "privacy", "encryption", "vpn", "auth", "vault", "keepass"]),
        ("Games", &["game", "gaming", "emulator", "godot", "bevy", "engine", "minecraft"]),
        ("Multimedia", &["video", "audio", "music", "media", "player", "stream", "obs", "ffmpeg", "podcast"]),
        ("Graphics", &["image", "photo", "design", "draw", "whiteboard", "diagram", "3d", "cad", "svg", "canvas", "excalidraw", "tldraw"]),
        ("Internet", &["browser", "mail", "email", "chat", "messenger", "torrent", "download", "http", "proxy", "remote-desktop", "desk"]),
        ("Office", &["note", "notes", "markdown", "pdf", "spreadsheet", "office", "knowledge", "wiki", "notion", "joplin"]),
        ("Science", &["science", "research", "math", "physics", "bio", "ml", "ai", "data"]),
        ("Development", &["ide", "editor", "code", "git", "api", "database", "sql", "compiler", "rust", "typescript", "python", "devtools", "terminal", "shell"]),
        ("Utilities", &["utility", "utilities", "cli", "monitor", "launcher", "clipboard", "backup", "sync", "file-manager", "system"]),
    ];
    for (cat, keywords) in rules {
        if keywords.iter().any(|k| haystack.contains(k)) {
            return cat.to_string();
        }
    }
    "Other".to_string()
}

/// Monta o objeto App a partir do repo + release, escolhendo o asset da plataforma atual.
fn build_app(repo: &GhRepo, release: Option<&GhRelease>, category_hint: &str) -> App {
    let (version, release_url, published_at, downloads, asset) = match release {
        Some(r) => {
            let dl: u64 = r.assets.iter().map(|a| a.download_count).sum();
            let chosen = choose_asset(&r.assets);
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
    } else {
        infer_category(repo)
    };

    let (download_url, file_name, size_bytes, sha256) = match &asset {
        Some(a) => (
            a.browser_download_url.clone(),
            a.name.clone(),
            a.size,
            a.digest.clone(),
        ),
        None => (String::new(), String::new(), 0, None),
    };

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
        license: repo.license.as_ref().map(|l| l.spdx_id.clone()).unwrap_or_else(|| "Unknown".into()),
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
        installed: false,
        installed_version: None,
        has_update: false,
        installed_path: None,
    }
}

/// Monta um app mínimo a partir de "owner/repo" (fallback offline, sem dados da API).
fn offline_app(full_name: &str) -> App {
    let (owner, name) = full_name.split_once('/').unwrap_or(("", full_name));
    App {
        id: full_name.to_string(),
        name: name.to_string(),
        tagline: format!("{full_name} — catálogo offline (sem detalhes da API)"),
        description: String::new(),
        category: "Other".into(),
        author: owner.to_string(),
        version: String::new(),
        license: "Unknown".into(),
        stars: 0,
        pushed_at: String::new(),
        downloads: 0,
        icon_url: format!("https://avatars.githubusercontent.com/{owner}?v=4"),
        github_url: format!("https://github.com/{full_name}"),
        homepage: String::new(),
        release_url: format!("https://github.com/{full_name}/releases"),
        download_url: String::new(),
        file_name: String::new(),
        size_bytes: 0,
        sha256: None,
        published_at: String::new(),
        tags: vec![],
        installed: false,
        installed_version: None,
        has_update: false,
        installed_path: None,
    }
}

/// Busca o catálogo: usa cache local se fresco (< 30 min), senão busca na API do GitHub.
/// Se a API falhar (rate limit/rede), cai no fallback offline com os repos curados.
pub async fn fetch_catalog(store: &Store, token: Option<&str>, force_refresh: bool) -> Result<(Vec<App>, bool, bool)> {
    const TTL_SECS: i64 = 30 * 60;

    if !force_refresh {
        if let Ok(Some(cache)) = store.load_catalog_cache() {
            let fetched = chrono::DateTime::parse_from_rfc3339(&cache.fetched_at)
                .map(|d| d.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::DateTime::<chrono::Utc>::from_timestamp(0, 0).unwrap());
            if chrono::Utc::now().signed_duration_since(fetched).num_seconds() < TTL_SECS {
                log::info!("catalog: usando cache local ({} apps)", cache.apps.len());
                return Ok((cache.apps, true, false));
            }
        }
    }

    let client = Arc::new(http_client(token));
    let repos = curated_repos();
    // Sem token a API permite só 60 req/h por IP: limita a 25 repos (2 req cada) para não estourar.
    // Com token (5000 req/h) busca todos.
    let limit = if token.is_some() { repos.len() } else { repos.len().min(25) };
    log::info!("catalog: buscando {} de {} repos no GitHub", limit, repos.len());

    use futures::stream::{self, StreamExt};
    // Cada item retorna (online_ok, Option<App>)
    let results: Vec<(bool, Option<App>)> = stream::iter(repos[..limit].iter().cloned())
        .map(|full_name| {
            let client = Arc::clone(&client);
            async move {
                match fetch_repo(&client, &full_name).await {
                    Ok(repo) => {
                        if !is_famous_and_active(&repo) {
                            log::debug!("catalog: descartado {} (não atende critérios de fama/atividade)", full_name);
                            return (true, None);
                        }
                        let release = fetch_latest_release(&client, &full_name).await.ok().flatten();
                        if release.as_ref().map(|r| choose_asset(&r.assets).is_some()).unwrap_or(false) {
                            (true, Some(build_app(&repo, release.as_ref(), "")))
                        } else {
                            log::debug!("catalog: pulando {} (sem asset para esta plataforma)", full_name);
                            (true, None)
                        }
                    }
                    Err(e) => {
                        log::warn!("catalog: falha ao buscar {full_name}: {e}");
                        (false, None)
                    }
                }
            }
        })
        .buffer_unordered(8)
        .collect()
        .await;

    let mut online_ok = false;
    let mut apps = Vec::new();
    for (ok, maybe_app) in results {
        if ok {
            online_ok = true;
        }
        if let Some(app) = maybe_app {
            apps.push(app);
        }
    }

    // Fallback offline: se nada veio da API (rate limit, sem rede), lista os curados com dados mínimos
    if !online_ok {
        log::warn!("catalog: API do GitHub indisponível (rate limit/rede). Usando fallback offline.");
        let apps = repos.iter().map(|r| offline_app(r)).collect::<Vec<_>>();
        return Ok((apps, false, true));
    }

    // Ordenar por estrelas
    apps.sort_by(|a, b| b.stars.cmp(&a.stars));

    if !apps.is_empty() {
        store.save_catalog_cache(&apps)?;
    }
    Ok((apps, false, false))
}

/// Busca um único repositório ("owner/repo") + release mais recente no GitHub.
pub async fn fetch_single_app(full_name: &str, token: Option<&str>) -> Result<App> {
    let client = http_client(token);
    let repo = fetch_repo(&client, full_name).await?;
    let release = fetch_latest_release(&client, full_name).await?;
    Ok(build_app(&repo, release.as_ref(), ""))
}

/// Busca ao vivo no GitHub por repositórios (qualidade menor, cobre qualquer app).
pub async fn search_github(query: &str, token: Option<&str>, page: u32) -> Result<Vec<App>> {
    use futures::stream::{self, StreamExt};
    let client = Arc::new(http_client(token));
    let q = format!(
        "{query} in:name,description,readme fork:false archived:false"
    );
    let url = format!(
        "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page=20&page={}",
        urlencoding_encode(&q),
        page.max(1)
    );
    let search = client.get(&url).send().await?.error_for_status()?.json::<GhSearch>().await?;
    log::info!("search: '{}' -> {} resultados", query, search.total_count);

    let candidates: Vec<GhRepo> = search
        .items
        .into_iter()
        .take(20)
        .filter(is_famous_and_active)
        .collect();

    let apps: Vec<App> = stream::iter(candidates)
        .map(|repo| {
            let client = Arc::clone(&client);
            async move {
                if let Ok(Some(release)) = fetch_latest_release(&client, &repo.full_name).await {
                    if choose_asset(&release.assets).is_some() {
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

    Ok(apps)
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GhLicense, GhOwner};

    fn repo(stars: u64, pushed_at: Option<&str>) -> GhRepo {
        GhRepo {
            full_name: "a/b".into(),
            name: "b".into(),
            description: None,
            html_url: String::new(),
            homepage: None,
            stargazers_count: stars,
            pushed_at: pushed_at.map(|s| s.to_string()),
            topics: vec![],
            license: Some(GhLicense { spdx_id: "MIT".into(), name: "MIT".into() }),
            owner: GhOwner { login: "a".into(), avatar_url: String::new() },
        }
    }

    #[test]
    fn famoso_e_ativo_entra() {
        let recent = chrono::Utc::now().to_rfc3339();
        assert!(is_famous_and_active(&repo(50_000, Some(&recent))));
    }

    #[test]
    fn pouco_famoso_nao_entra() {
        let recent = chrono::Utc::now().to_rfc3339();
        assert!(!is_famous_and_active(&repo(MIN_STARS - 1, Some(&recent))));
    }

    #[test]
    fn inativo_nao_entra() {
        // push há 2 anos
        let old = (chrono::Utc::now() - chrono::Duration::days(730)).to_rfc3339();
        assert!(!is_famous_and_active(&repo(500_000, Some(&old))));
    }

    #[test]
    fn sem_data_de_push_nao_entra() {
        assert!(!is_famous_and_active(&repo(500_000, None)));
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
    }
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


