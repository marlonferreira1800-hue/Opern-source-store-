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

/// Retorna um app específico pelo id ("owner/repo"), buscado no cache local.
#[tauri::command]
pub async fn get_app_by_id(state: State<'_, AppState>, app_id: String) -> Result<Option<App>, String> {
    if let Ok(Some(cache)) = state.store.load_catalog_cache() {
        let mut apps = cache.apps;
        catalog::apply_local_state(&mut apps, &state.store);
        return Ok(apps.into_iter().find(|a| a.id == app_id));
    }
    Ok(None)
}

/// Inicia o download real de um app (com progresso via evento "download-progress").
#[tauri::command]
pub async fn download_app(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    app_id: String,
) -> Result<DownloadResponse, String> {
    // Resolve o app a partir do cache do catálogo
    let cache = state
        .store
        .load_catalog_cache()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Catálogo vazio. Atualize a loja primeiro.".to_string())?;
    let mut app = cache
        .apps
        .into_iter()
        .find(|a| a.id == app_id)
        .ok_or_else(|| format!("App não encontrado no catálogo: {app_id}"))?;
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

/// Lista apps instalados localmente.
#[tauri::command]
pub async fn get_installed(state: State<'_, AppState>) -> Result<CatalogResponse, String> {
    let cache = state.store.load_catalog_cache().map_err(|e| e.to_string())?;
    let mut apps = cache.map(|c| c.apps).unwrap_or_default();
    catalog::apply_local_state(&mut apps, &state.store);
    let installed: Vec<App> = apps.into_iter().filter(|a| a.installed).collect();
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
    let mut settings = state.store.load_settings();
    settings.github_token = if token.trim().is_empty() { None } else { Some(token.trim().to_string()) };
    state.store.save_settings(&settings).map_err(|e| e.to_string())
}

/// Retorna o caminho da pasta de downloads.
#[tauri::command]
pub async fn get_downloads_path(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.store.downloads_dir().to_string_lossy().into_owned())
}
