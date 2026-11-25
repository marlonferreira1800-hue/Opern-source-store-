use std::sync::Arc;
use tauri::State;

use crate::catalog;
use crate::downloader::{self, DownloadState};
use crate::models::{App, CatalogResponse, DownloadResponse};
use crate::store::Store;

/// Estado global da aplicação, injetado nos comandos.
pub struct AppState {
    pub store: Store,
    pub downloads: DownloadState,
}

fn token(state: &AppState) -> Option<String> {
    state.store.load_settings().github_token
}

/// Retorna o catálogo de apps (cache local se fresco, senão busca no GitHub).
#[tauri::command]
pub async fn get_catalog(
    state: State<'_, AppState>,
    force_refresh: Option<bool>,
) -> Result<CatalogResponse, String> {
    let force = force_refresh.unwrap_or(false);
    let (mut apps, from_cache, offline) = catalog::fetch_catalog(&state.store, token(&state).as_deref(), force)
        .await
        .map_err(|e| e.to_string())?;
    catalog::apply_local_state(&mut apps, &state.store);
    Ok(CatalogResponse {
        total: apps.len(),
        from_cache,
        offline,
        fetched_at: chrono::Utc::now().to_rfc3339(),
        apps,
    })
}

/// Busca ao vivo no GitHub por apps open source.
#[tauri::command]
pub async fn search_apps(
    state: State<'_, AppState>,
    query: String,
) -> Result<CatalogResponse, String> {
    let mut apps = catalog::search_github(&query, token(&state).as_deref(), 1)
        .await
        .map_err(|e| e.to_string())?;
    catalog::apply_local_state(&mut apps, &state.store);
    Ok(CatalogResponse {
        total: apps.len(),
        from_cache: false,
        offline: false,
        fetched_at: chrono::Utc::now().to_rfc3339(),
        apps,
    })
}

/// Lista as categorias da loja.
#[tauri::command]
pub fn get_categories() -> Vec<serde_json::Value> {
    catalog::categories()
}

/// Retorna um app específico pelo id ("owner/repo"), buscado no cache local ou via GitHub.
#[tauri::command]
pub async fn get_app_by_id(state: State<'_, AppState>, app_id: String) -> Result<Option<App>, String> {
    if let Ok(Some(cache)) = state.store.load_catalog_cache() {
        let mut apps = cache.apps;
        catalog::apply_local_state(&mut apps, &state.store);
        if let Some(found) = apps.into_iter().find(|a| a.id == app_id) {
            return Ok(Some(found));
        }
    }
    match catalog::fetch_single_app(&app_id, token(&state).as_deref()).await {
        Ok(mut app) => {
            catalog::apply_local_state(std::slice::from_mut(&mut app), &state.store);
            Ok(Some(app))
        }
        Err(_) => Ok(None),
    }
}

/// Inicia o download real de um app (com progresso via evento "download-progress").
#[tauri::command]
pub async fn download_app(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    app_id: String,
) -> Result<DownloadResponse, String> {
    // Tenta resolver pelo cache local; se veio de busca ao vivo, consulta o GitHub.
    let cached = state
        .store
        .load_catalog_cache()
        .map_err(|e| e.to_string())?
        .and_then(|c| c.apps.into_iter().find(|a| a.id == app_id));

    let mut app = match cached {
        Some(a) if !a.download_url.is_empty() => a,
        _ => catalog::fetch_single_app(&app_id, token(&state).as_deref())
            .await
            .map_err(|e| format!("Falha ao obter dados do app {app_id}: {e}"))?,
    };
    catalog::apply_local_state(std::slice::from_mut(&mut app), &state.store);

    downloader::download_app(app_handle, &state.store, app, Arc::clone(&state.downloads))
        .await
        .map_err(|e| e.to_string())
}

/// Cancela um download em andamento.
#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, app_id: String) -> Result<bool, String> {
    Ok(downloader::cancel_download(Arc::clone(&state.downloads), &app_id).await)
}

/// Lista apps instalados localmente (combina installed.json com metadados do cache).
#[tauri::command]
pub async fn get_installed(state: State<'_, AppState>) -> Result<CatalogResponse, String> {
    let installed_records = state.store.load_installed().map_err(|e| e.to_string())?;
    let mut cached_apps = state
        .store
        .load_catalog_cache()
        .map_err(|e| e.to_string())?
        .map(|c| c.apps)
        .unwrap_or_default();
    catalog::apply_local_state(&mut cached_apps, &state.store);

    let mut installed = Vec::with_capacity(installed_records.len());
    for rec in installed_records {
        if let Some(app) = cached_apps.iter().find(|a| a.id == rec.id) {
            installed.push(app.clone());
        } else {
            let (owner, _) = rec.id.split_once('/').unwrap_or(("", &rec.id));
            installed.push(App {
                id: rec.id.clone(),
                name: rec.name.clone(),
                tagline: "Instalado via busca".into(),
                description: String::new(),
                category: "Other".into(),
                author: owner.to_string(),
                version: rec.version.clone(),
                license: "Unknown".into(),
                stars: 0,
                downloads: 0,
                pushed_at: String::new(),
                icon_url: format!("https://avatars.githubusercontent.com/{owner}?v=4"),
                github_url: format!("https://github.com/{}", rec.id),
                homepage: String::new(),
                release_url: format!("https://github.com/{}/releases", rec.id),
                download_url: String::new(),
                file_name: rec.file_name.clone(),
                size_bytes: 0,
                sha256: None,
                published_at: rec.installed_at.clone(),
                tags: vec![],
                installed: true,
                installed_version: Some(rec.version),
                has_update: false,
                installed_path: Some(rec.file_path),
            });
        }
    }

    Ok(CatalogResponse {
        total: installed.len(),
        from_cache: true,
        offline: false,
        fetched_at: chrono::Utc::now().to_rfc3339(),
        apps: installed,
    })
}

/// Lista apps com atualização disponível.
#[tauri::command]
pub async fn get_apps_to_update(state: State<'_, AppState>) -> Result<CatalogResponse, String> {
    let cache = state.store.load_catalog_cache().map_err(|e| e.to_string())?;
    let mut apps = cache.map(|c| c.apps).unwrap_or_default();
    catalog::apply_local_state(&mut apps, &state.store);
    let updates = catalog::check_updates(&apps);
    Ok(CatalogResponse {
        total: updates.len(),
        from_cache: true,
        offline: false,
        fetched_at: chrono::Utc::now().to_rfc3339(),
        apps: updates,
    })
}

/// Abre um app instalado (abre o arquivo baixado com o aplicativo padrão do sistema).
#[tauri::command]
pub async fn open_installed(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    app_id: String,
) -> Result<bool, String> {
    use tauri_plugin_opener::OpenerExt;
    let installed = state.store.load_installed().map_err(|e| e.to_string())?;
    let inst = installed
        .iter()
        .find(|i| i.id == app_id)
        .ok_or_else(|| "App não está instalado.".to_string())?;
    let path = inst.file_path.clone();
    app_handle
        .opener()
        .open_path(&path, None::<String>)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Abre uma URL no navegador padrão.
#[tauri::command]
pub async fn open_url(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app_handle.opener().open_url(&url, None::<String>).map_err(|e| e.to_string())
}

/// Desinstala um app: remove o arquivo baixado e o registro local.
#[tauri::command]
pub async fn uninstall_app(state: State<'_, AppState>, app_id: String) -> Result<bool, String> {
    if let Some(inst) = state.store.remove_installed(&app_id).map_err(|e| e.to_string())? {
        if std::path::Path::new(&inst.file_path).exists() {
            let _ = std::fs::remove_file(&inst.file_path);
        }
        return Ok(true);
    }
    Ok(false)
}

/// Salva o token do GitHub (opcional, aumenta o rate limit da API).
#[tauri::command]
pub async fn save_github_token(state: State<'_, AppState>, token: String) -> Result<(), String> {
    let trimmed = token.trim();
    if !trimmed.is_empty() {
        reqwest::header::HeaderValue::from_str(&format!("Bearer {trimmed}"))
            .map_err(|_| "Token contém caracteres inválidos para cabeçalho HTTP.".to_string())?;
    }
    let mut settings = state.store.load_settings();
    settings.github_token = if trimmed.is_empty() { None } else { Some(trimmed.to_string()) };
    state.store.save_settings(&settings).map_err(|e| e.to_string())
}

/// Retorna o caminho da pasta de downloads.
#[tauri::command]
pub async fn get_downloads_path(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.store.downloads_dir().to_string_lossy().into_owned())
}
