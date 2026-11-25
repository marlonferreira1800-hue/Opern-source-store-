use serde::{Deserialize, Serialize};

/// Um aplicativo open source exibido na loja.
/// Os dados vêm da API do GitHub (repo + release mais recente).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct App {
    /// Identificador único: "owner/repo"
    pub id: String,
    pub name: String,
    pub tagline: String,
    pub description: String,
    pub category: String,
    pub author: String,
    /// Versão da release mais recente (tag)
    pub version: String,
    pub license: String,
    pub stars: u64,
    pub downloads: u64,
    /// Data do último push no repositório (ISO 8601) — mede se o projeto está ativo
    pub pushed_at: String,
    /// Avatar do dono do repositório
    pub icon_url: String,
    pub github_url: String,
    pub homepage: String,
    /// URL da release no GitHub
    pub release_url: String,
    /// Asset binário escolhido para a plataforma atual
    pub download_url: String,
    pub file_name: String,
    pub size_bytes: u64,
    /// Digest sha256 do asset, quando disponível (formato "sha256:...")
    pub sha256: Option<String>,
    pub published_at: String,
    pub tags: Vec<String>,
    /// Índice de segurança e confiabilidade (0-100)
    #[serde(default)]
    pub trust_score: u8,
    /// Selos positivos de verificação (ex: "osi-license", "sha256-verified")
    #[serde(default)]
    pub security_flags: Vec<String>,
    /// Alertas informativos (ex: "no-sha256-digest")
    #[serde(default)]
    pub warnings: Vec<String>,
    // ---- estado local ----
    pub installed: bool,
    pub installed_version: Option<String>,
    pub has_update: bool,
    pub installed_path: Option<String>,
}

/// Resposta do catálogo para o frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogResponse {
    pub apps: Vec<App>,
    pub total: usize,
    pub from_cache: bool,
    /// true quando a API do GitHub falhou (rate limit/rede) e servimos dados básicos offline
    #[serde(default)]
    pub offline: bool,
    pub fetched_at: String,
}

/// Asset de uma release do GitHub.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
    pub download_count: u64,
    pub digest: Option<String>,
}

/// Release do GitHub (campos usados).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub html_url: String,
    pub published_at: Option<String>,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
    pub assets: Vec<GhAsset>,
}

/// Repositório do GitHub (campos usados).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhRepo {
    pub full_name: String,
    pub name: String,
    pub description: Option<String>,
    pub html_url: String,
    pub homepage: Option<String>,
    pub stargazers_count: u64,
    pub pushed_at: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub disabled: bool,
    pub topics: Vec<String>,
    pub license: Option<GhLicense>,
    pub owner: GhOwner,
}

/// Entrada pré-validada no snapshot de seed (`data/catalog-seed.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedEntry {
    pub category: String,
    pub trust_score: u8,
    #[serde(default)]
    pub security_flags: Vec<String>,
    pub repo: GhRepo,
    pub release: GhRelease,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhLicense {
    pub spdx_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhOwner {
    pub login: String,
    pub avatar_url: String,
}

/// Resultado da busca na API do GitHub.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhSearch {
    pub total_count: u64,
    pub items: Vec<GhRepo>,
}

/// Registro de app instalado (persistência local).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub version: String,
    pub file_path: String,
    pub file_name: String,
    pub installed_at: String,
}

/// Progresso de download emitido para o frontend via evento.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub app_id: String,
    pub file_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: f32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResponse {
    pub success: bool,
    pub message: String,
    pub file_path: Option<String>,
}

/// Cache do catálogo em disco.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogCache {
    pub fetched_at: String,
    pub apps: Vec<App>,
}

/// Configurações locais (ex: token do GitHub opcional).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub github_token: Option<String>,
}
