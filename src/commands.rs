use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::api::path::download_dir;
use tauri::Manager;

// App data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct App {
    pub id: String,
    pub name: String,
    pub tagline: String,
    pub description: String,
    pub description_pt: Option<String>,
    pub category: String,
    pub author: String,
    pub version: String,
    pub size_mb: u32,
    pub license: String,
    pub rating: f32,
    pub downloads: u32,
    pub featured: bool,
    pub popular: bool,
    pub recent: bool,
    pub has_update: bool,
    pub last_update: Option<String>,
    pub icon: Option<String>,
    pub icon_url: Option<String>,
    pub github_url: Option<String>,
    pub download_url: String,
    pub screenshots: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
}

// Category structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub name: String,
    pub icon: Option<String>,
    pub description: Option<String>,
}

// Response structures
#[derive(Debug, Clone, Serialize)]
pub struct AppListResponse {
    pub apps: Vec<App>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryListResponse {
    pub categories: Vec<Category>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppResponse {
    pub app: Option<App>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub app_id: String,
    pub progress: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadResponse {
    pub success: bool,
    pub message: Option<String>,
    pub file_path: Option<String>,
}

// Load apps from JSON file
fn load_apps() -> Vec<App> {
    let json_path = Path::new("src").join("data").join("apps.json");
    
    match fs::read_to_string(json_path) {
        Ok(content) => {
            serde_json::from_str(&content).unwrap_or_else(|_| {
                log::error!("Failed to parse apps.json");
                Vec::new()
            })
        }
        Err(_) => {
            log::error!("Failed to read apps.json");
            Vec::new()
        }
    }
}

// Load categories from JSON file
fn load_categories() -> Vec<Category> {
    let json_path = Path::new("src").join("data").join("categories.json");
    
    match fs::read_to_string(json_path) {
        Ok(content) => {
            serde_json::from_str(&content).unwrap_or_else(|_| {
                log::error!("Failed to parse categories.json");
                Vec::new()
            })
        }
        Err(_) => {
            log::error!("Failed to read categories.json");
            Vec::new()
        }
    }
}

// Get all apps
#[tauri::command]
pub fn get_apps() -> AppListResponse {
    let apps = load_apps();
    AppListResponse {
        apps,
        total: apps.len(),
    }
}

// Get apps by category
#[tauri::command]
pub fn get_apps_by_category(category: String) -> AppListResponse {
    let apps = load_apps();
    let filtered: Vec<App> = apps
        .into_iter()
        .filter(|app| app.category == category)
        .collect();
    
    AppListResponse {
        apps: filtered,
        total: filtered.len(),
    }
}

// Get featured apps
#[tauri::command]
pub fn get_featured_apps() -> AppListResponse {
    let apps = load_apps();
    let featured: Vec<App> = apps
        .into_iter()
        .filter(|app| app.featured)
        .collect();
    
    AppListResponse {
        apps: featured,
        total: featured.len(),
    }
}

// Get popular apps
#[tauri::command]
pub fn get_popular_apps() -> AppListResponse {
    let apps = load_apps();
    let popular: Vec<App> = apps
        .into_iter()
        .filter(|app| app.popular)
        .collect();
    
    AppListResponse {
        apps: popular,
        total: popular.len(),
    }
}

// Get recent apps
#[tauri::command]
pub fn get_recent_apps() -> AppListResponse {
    let apps = load_apps();
    let recent: Vec<App> = apps
        .into_iter()
        .filter(|app| app.recent)
        .collect();
    
    AppListResponse {
        apps: recent,
        total: recent.len(),
    }
}

// Get all categories
#[tauri::command]
pub fn get_categories() -> CategoryListResponse {
    let categories = load_categories();
    CategoryListResponse {
        categories,
        total: categories.len(),
    }
}

// Get app by ID
#[tauri::command]
pub fn get_app_by_id(app_id: String) -> AppResponse {
    let apps = load_apps();
    let app = apps.into_iter().find(|app| app.id == app_id);
    AppResponse { app }
}

// Search apps
#[tauri::command]
pub fn search_apps(query: String) -> AppListResponse {
    let apps = load_apps();
    let query_lower = query.to_lowercase();
    
    let results: Vec<App> = apps
        .into_iter()
        .filter(|app| {
            app.name.to_lowercase().contains(&query_lower) ||
            app.tagline.to_lowercase().contains(&query_lower) ||
            app.description.to_lowercase().contains(&query_lower) ||
            app.description_pt.as_ref().map_or(false, |d| d.to_lowercase().contains(&query_lower)) ||
            app.author.to_lowercase().contains(&query_lower) ||
            app.category.to_lowercase().contains(&query_lower) ||
            app.tags.as_ref().map_or(false, |tags| {
                tags.iter().any(|tag| tag.to_lowercase().contains(&query_lower))
            })
        })
        .collect();
    
    AppListResponse {
        apps: results,
        total: results.len(),
    }
}

// Get apps that have updates
#[tauri::command]
pub fn get_apps_to_update() -> AppListResponse {
    let apps = load_apps();
    let updates: Vec<App> = apps
        .into_iter()
        .filter(|app| app.has_update)
        .collect();
    
    AppListResponse {
        apps: updates,
        total: updates.len(),
    }
}

// Check for updates (simulate)
#[tauri::command]
pub fn check_for_updates() -> AppListResponse {
    get_apps_to_update()
}

// Get app data path
#[tauri::command]
pub fn get_app_data_path(app: tauri::AppHandle) -> Result<String, String> {
    match app.path_resolver().app_data_dir() {
        Some(path) => Ok(path.to_string_lossy().into_owned()),
        None => Err("Failed to get app data path".to_string()),
    }
}

// Open URL in browser
#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    tauri::api::shell::open(&url, None)
        .map_err(|e| e.to_string())
}

// Download app
#[tauri::command]
pub async fn download_app(
    app_id: String,
    download_url: String,
    file_name: String,
    app: tauri::AppHandle,
) -> Result<DownloadResponse, String> {
    use reqwest::Client;
    use std::io::Write;
    
    log::info!("Starting download: {} from {}", file_name, download_url);
    
    // Get downloads directory
    let downloads_dir = match app.path_resolver().app_data_dir() {
        Some(path) => path.join("downloads"),
        None => return Err("Failed to get downloads directory".to_string()),
    };
    
    // Create downloads directory if it doesn't exist
    std::fs::create_dir_all(&downloads_dir).map_err(|e| {
        log::error!("Failed to create downloads directory: {}", e);
        e.to_string()
    })?;
    
    // Full file path
    let file_path = downloads_dir.join(&file_name);
    
    // Download the file
    let client = Client::new();
    let response = client.get(&download_url).send().await.map_err(|e| {
        log::error!("Failed to start download: {}", e);
        e.to_string()
    })?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    // Get total size
    let total_size = response.content_length();
    
    // Create file
    let mut file = std::fs::File::create(&file_path).map_err(|e| {
        log::error!("Failed to create file: {}", e);
        e.to_string()
    })?;
    
    // Download in chunks
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            log::error!("Failed to read chunk: {}", e);
            e.to_string()
        })?;
        
        file.write_all(&chunk).map_err(|e| {
            log::error!("Failed to write chunk: {}", e);
            e.to_string()
        })?;
        
        downloaded += chunk.len() as u64;
        
        // Emit progress (this would need to be handled differently in Tauri 2.0)
        // For now, we'll just log it
        if let Some(total) = total_size {
            let progress = (downloaded as f32 / total as f32) * 100.0;
            log::info!("Download progress: {:.2}% ({}/{} bytes)", progress, downloaded, total);
        }
    }
    
    log::info!("Download completed: {}", file_path.display());
    
    Ok(DownloadResponse {
        success: true,
        message: Some("Download completed successfully".to_string()),
        file_path: Some(file_path.to_string_lossy().into_owned()),
    })
}
