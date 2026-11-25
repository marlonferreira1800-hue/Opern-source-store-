use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use crate::models::{App, CatalogCache, InstalledApp, Settings};

/// Caminhos persistidos em disco (app data dir do Tauri).
pub struct Store {
    pub root: PathBuf,
}

impl Store {
    pub fn new(app: &tauri::AppHandle) -> Result<Self> {
        let root = app
            .path()
            .app_data_dir()
            .context("app_data_dir indisponível")?;
        fs::create_dir_all(&root)?;
        fs::create_dir_all(root.join("downloads"))?;
        Ok(Store { root })
    }

    pub fn downloads_dir(&self) -> PathBuf {
        self.root.join("downloads")
    }

    fn read_json<T: serde::de::DeserializeOwned>(&self, name: &str) -> Result<Option<T>> {
        let path = self.root.join(name);
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(&path)?;
        let parsed = serde_json::from_str(&data)?;
        Ok(Some(parsed))
    }

    fn write_json<T: serde::Serialize + ?Sized>(&self, name: &str, value: &T) -> Result<()> {
        let path = self.root.join(name);
        let data = serde_json::to_string_pretty(value)?;
        fs::write(path, data)?;
        Ok(())
    }

    // ---- catálogo cache ----
    pub fn load_catalog_cache(&self) -> Result<Option<CatalogCache>> {
        self.read_json("catalog_cache.json")
    }

    pub fn save_catalog_cache(&self, apps: &[App]) -> Result<()> {
        let cache = CatalogCache {
            fetched_at: chrono::Utc::now().to_rfc3339(),
            apps: apps.to_vec(),
        };
        self.write_json("catalog_cache.json", &cache)
    }

    // ---- instalados ----
    pub fn load_installed(&self) -> Result<Vec<InstalledApp>> {
        Ok(self.read_json("installed.json")?.unwrap_or_default())
    }

    pub fn save_installed(&self, list: &[InstalledApp]) -> Result<()> {
        self.write_json("installed.json", list)
    }

    pub fn mark_installed(&self, app: &App, file_path: &str) -> Result<()> {
        let mut list = self.load_installed()?;
        let entry = InstalledApp {
            id: app.id.clone(),
            name: app.name.clone(),
            version: app.version.clone(),
            file_path: file_path.to_string(),
            file_name: app.file_name.clone(),
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        list.retain(|i| i.id != app.id);
        list.push(entry);
        self.save_installed(&list)
    }

    pub fn remove_installed(&self, app_id: &str) -> Result<Option<InstalledApp>> {
        let mut list = self.load_installed()?;
        let pos = list.iter().position(|i| i.id == app_id);
        let removed = pos.map(|p| list.remove(p));
        if removed.is_some() {
            self.save_installed(&list)?;
        }
        Ok(removed)
    }

    // ---- settings ----
    pub fn load_settings(&self) -> Settings {
        self.read_json("settings.json")
            .ok()
            .flatten()
            .unwrap_or_default()
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        self.write_json("settings.json", settings)
    }
}
