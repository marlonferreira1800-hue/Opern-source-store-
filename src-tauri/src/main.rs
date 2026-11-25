#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod catalog;
mod commands;
mod downloader;
mod models;
mod platform;
mod store;

use commands::AppState;
use store::Store;
use tauri::Manager;

fn main() {
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let store = Store::new(app.handle())?;
            log::info!("app data dir: {}", store.root.display());
            log::info!("downloads dir: {}", store.downloads_dir().display());
            log::info!("plataforma atual: {}", platform::current_platform());
            app.manage(AppState {
                store,
                downloads: downloader::new_download_state(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_catalog,
            commands::search_apps,
            commands::get_categories,
            commands::get_app_by_id,
            commands::download_app,
            commands::cancel_download,
            commands::get_installed,
            commands::get_apps_to_update,
            commands::open_installed,
            commands::open_url,
            commands::uninstall_app,
            commands::save_github_token,
            commands::get_downloads_path,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar o Open Source Store");
}
