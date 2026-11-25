use anyhow::Result;
use futures::StreamExt;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{watch, Mutex};

use crate::models::{App, DownloadProgress, DownloadResponse};
use crate::store::Store;

/// Estado dos downloads em andamento (app_id -> canal de cancelamento).
pub type DownloadState = Arc<Mutex<HashMap<String, watch::Sender<bool>>>>;

pub fn new_download_state() -> DownloadState {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Baixa o app e emite progresso real para o frontend via evento Tauri.
pub async fn download_app(
    app_handle: tauri::AppHandle,
    store: &Store,
    app: App,
    downloads: DownloadState,
) -> Result<DownloadResponse> {
    use tauri::Emitter;

    if app.download_url.is_empty() {
        return Ok(DownloadResponse {
            success: false,
            message:
                "Nenhum binário disponível para esta plataforma. Veja o repositório no GitHub."
                    .into(),
            file_path: None,
        });
    }

    let dir = store.downloads_dir();
    std::fs::create_dir_all(&dir)?;
    let file_path = unique_path(&dir, &app.file_name);

    let (tx_cancel, rx_cancel) = watch::channel(false);
    downloads.lock().await.insert(app.id.clone(), tx_cancel);

    let emit_progress =
        |app_id: &str, file_name: &str, downloaded: u64, total: Option<u64>, status: &str| {
            let percent = total
                .map(|t| {
                    if t > 0 {
                        (downloaded as f32 / t as f32) * 100.0
                    } else {
                        0.0
                    }
                })
                .unwrap_or(0.0);
            let payload = DownloadProgress {
                app_id: app_id.to_string(),
                file_name: file_name.to_string(),
                downloaded_bytes: downloaded,
                total_bytes: total,
                percent,
                status: status.to_string(),
            };
            let _ = app_handle.emit("download-progress", payload);
        };

    emit_progress(
        &app.id,
        &app.file_name,
        0,
        Some(app.size_bytes),
        "iniciando",
    );

    let client = reqwest::Client::builder()
        .user_agent("open-source-store/0.1")
        .build()?;
    let resp = client.get(&app.download_url).send().await?;
    if !resp.status().is_success() {
        downloads.lock().await.remove(&app.id);
        return Ok(DownloadResponse {
            success: false,
            message: format!("HTTP {} ao baixar {}", resp.status(), app.download_url),
            file_path: None,
        });
    }

    let total = resp.content_length().or(Some(app.size_bytes));
    let mut file = std::fs::File::create(&file_path)?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();

    while let Some(chunk_res) = stream.next().await {
        // verifica cancelamento
        if *rx_cancel.borrow() {
            let _ = std::fs::remove_file(&file_path);
            downloads.lock().await.remove(&app.id);
            emit_progress(&app.id, &app.file_name, downloaded, total, "cancelado");
            return Ok(DownloadResponse {
                success: false,
                message: "Download cancelado pelo usuário.".into(),
                file_path: None,
            });
        }
        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                let _ = std::fs::remove_file(&file_path);
                downloads.lock().await.remove(&app.id);
                emit_progress(&app.id, &app.file_name, downloaded, total, "falha de rede");
                return Err(e.into());
            }
        };
        file.write_all(&chunk)?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        if downloaded % (1024 * 512) < chunk.len() as u64
            || total.map(|t| downloaded >= t).unwrap_or(false)
        {
            emit_progress(&app.id, &app.file_name, downloaded, total, "baixando");
        }
    }
    file.flush()?;
    drop(file);

    // Verificação de integridade, se o GitHub informou o digest
    if let Some(digest) = &app.sha256 {
        let expected = digest.strip_prefix("sha256:").unwrap_or(digest);
        let actual = hex::encode(hasher.finalize());
        if !expected.eq_ignore_ascii_case(&actual) {
            let _ = std::fs::remove_file(&file_path);
            downloads.lock().await.remove(&app.id);
            emit_progress(
                &app.id,
                &app.file_name,
                downloaded,
                total,
                "falha de verificação",
            );
            return Ok(DownloadResponse {
                success: false,
                message: format!(
                    "Checksum SHA256 não confere (esperado {expected}, obtido {actual})"
                ),
                file_path: None,
            });
        }
    }

    downloads.lock().await.remove(&app.id);
    emit_progress(&app.id, &app.file_name, downloaded, total, "concluído");

    let path_str = file_path.to_string_lossy().into_owned();
    store.mark_installed(&app, &path_str)?;

    Ok(DownloadResponse {
        success: true,
        message: format!("{} instalado com sucesso.", app.name),
        file_path: Some(path_str),
    })
}

pub async fn cancel_download(downloads: DownloadState, app_id: &str) -> bool {
    let mut map = downloads.lock().await;
    if let Some(tx) = map.get(app_id) {
        let _ = tx.send(true);
        map.remove(app_id);
        true
    } else {
        false
    }
}

/// Gera um caminho único caso o arquivo já exista, sanitizando o nome para impedir path traversal.
fn unique_path(dir: &std::path::Path, file_name: &str) -> PathBuf {
    let safe_name = std::path::Path::new(file_name)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty() && s != "." && s != "..")
        .unwrap_or_else(|| "download.bin".to_string());
    let path = dir.join(&safe_name);
    if !path.exists() {
        return path;
    }
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    for i in 1..1000 {
        let name = if ext.is_empty() {
            format!("{stem} ({i})")
        } else {
            format!("{stem} ({i}).{ext}")
        };
        let p = dir.join(name);
        if !p.exists() {
            return p;
        }
    }
    path
}

#[cfg(test)]
mod tests {
    use super::unique_path;

    #[test]
    fn unique_path_impede_traversal() {
        let dir = std::env::temp_dir().join("oss_test_dir");
        let p = unique_path(&dir, "../../evil.exe");
        assert_eq!(p.parent().unwrap(), dir.as_path());
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), "evil.exe");
    }
}
