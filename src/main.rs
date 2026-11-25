// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use tauri::Manager;

mod commands;

fn main() {
    // Initialize logger
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    tauri::Builder::default()
        // Setup function to create app state
        .setup(|app| {
            // Create app data directory if it doesn't exist
            let app_data_dir = app.path_resolver().app_data_dir();
            let downloads_dir = app_data_dir.join("downloads");
            
            if let Some(app_data) = app_data_dir.to_str() {
                log::info!("App data directory: {}", app_data);
            }
            
            // Create downloads directory
            if let Some(downloads) = downloads_dir.to_str() {
                std::fs::create_dir_all(downloads).unwrap_or_else(|_| {
                    log::warn!("Failed to create downloads directory");
                });
                log::info!("Downloads directory: {}", downloads);
            }
            
            Ok(())
        })
        // Register all commands
        .invoke_handler(tauri::generate_handler![
            commands::get_apps,
            commands::get_categories,
            commands::get_app_by_id,
            commands::search_apps,
            commands::download_app,
            commands::get_apps_to_update,
            commands::check_for_updates,
            commands::open_url,
            commands::get_app_data_path
        ])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}
