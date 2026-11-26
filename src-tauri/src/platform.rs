use crate::models::GhAsset;

/// Plataforma atual do usuário, ex: "windows-x86_64", "linux-x86_64", "macos-aarch64".
pub fn current_platform() -> String {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    };
    let arch = if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "unknown"
    };
    format!("{os}-{arch}")
}

/// Extensões que nunca devem ser escolhidas como instalador principal (scripts soltos,
/// pacotes mobile ou metadados de assinatura/checksum).
const BLOCKED_ASSET_EXTENSIONS: &[&str] = &[
    ".ps1",
    ".bat",
    ".cmd",
    ".vbs",
    ".wsf",
    ".scr",
    ".hta",
    ".sh",
    ".py",
    ".rb",
    ".pl",
    ".apk",
    ".ipa",
    ".sig",
    ".asc",
    ".minisig",
    ".sha256",
    ".sha256sum",
    ".sha1",
    ".sha512",
    ".md5",
    ".zsync",
    ".ddeb",
    ".txt",
    ".json",
    ".yml",
    ".yaml",
    ".blockmap",
    ".pdb",
    ".dsym",
    ".whl",
    ".nupkg",
];

const UNSUPPORTED_OS_MARKERS: &[&str] = &[
    "freebsd",
    "openbsd",
    "netbsd",
    "dragonfly",
    "solaris",
    "illumos",
    "android",
];

fn has_word_marker(haystack: &str, marker: &str) -> bool {
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(marker) {
        let abs = start + pos;
        let before_ok = haystack[..abs]
            .chars()
            .next_back()
            .map_or(true, |c| !c.is_ascii_alphanumeric());
        let after_ok = haystack[abs + marker.len()..]
            .chars()
            .next()
            .map_or(true, |c| !c.is_ascii_alphanumeric());
        if before_ok && after_ok {
            return true;
        }
        start = abs + marker.len();
    }
    false
}

fn is_source_archive(n: &str) -> bool {
    if n.contains("-src.")
        || n.contains("_src.")
        || n.contains("-src-")
        || n.contains("_src-")
        || n.contains("_src_")
        || n.ends_with("-src")
        || n.ends_with("_src")
    {
        return true;
    }
    n.contains("source")
        && (n.ends_with(".zip")
            || n.ends_with(".tar.gz")
            || n.ends_with(".tgz")
            || n.ends_with(".tar.xz")
            || n.ends_with(".7z"))
}

fn is_other_platform(n: &str, current_os: &str) -> bool {
    let is_windows_asset = has_word_marker(n, "win")
        || n.contains("windows")
        || n.contains("win32")
        || n.contains("win64")
        || n.contains(".exe")
        || n.contains(".msi");
    let is_macos_asset = n.contains("macos")
        || n.contains("darwin")
        || n.contains(".dmg")
        || n.contains(".pkg")
        || n.contains("osx")
        || n.contains("-mac.")
        || n.contains("-mac-")
        || n.contains("_mac.")
        || n.contains("_mac_");
    let is_linux_asset = n.contains("linux")
        || n.contains(".appimage")
        || n.contains(".deb")
        || n.contains(".rpm")
        || n.contains(".snap")
        || n.contains(".flatpak")
        || n.contains(".txz")
        || n.contains(".tar.xz")
        || (n.contains(".tar.gz") && !is_macos_asset);

    match current_os {
        "windows" => is_linux_asset || is_macos_asset,
        "linux" => is_windows_asset || is_macos_asset,
        "macos" => is_windows_asset || is_linux_asset,
        _ => false,
    }
}

/// Score de compatibilidade de um asset com a plataforma atual.
/// Maior = mais compatível. 0 = incompatível ou inseguro.
fn asset_score(asset_name: &str) -> u32 {
    let n = asset_name.to_lowercase();
    if BLOCKED_ASSET_EXTENSIONS.iter().any(|ext| n.ends_with(ext)) {
        return 0;
    }
    if is_source_archive(&n) {
        return 0;
    }
    if UNSUPPORTED_OS_MARKERS.iter().any(|m| n.contains(m)) || has_word_marker(&n, "ios") {
        return 0;
    }
    if n.ends_with(".gz") && !n.ends_with(".tar.gz") {
        return 0;
    }

    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };

    if os == "windows"
        && (n.ends_with(".snap")
            || n.ends_with(".flatpak")
            || n.ends_with(".txz")
            || n.ends_with(".tar.xz")
            || n.ends_with(".bz2")
            || n.ends_with(".7z"))
    {
        return 0;
    }

    // Incompatíveis com a plataforma atual: pontua como 0
    if is_other_platform(&n, os) {
        return 0;
    }

    let mut score: u32 = 20;

    // Arquitetura
    let is_arm = cfg!(target_arch = "aarch64");
    let arch_markers_arm = ["arm64", "aarch64", "armv8"];
    let arch_markers_x64 = [
        "x86_64", "x64", "amd64", "win64", "x86-64", "64bit", "64-bit",
    ];
    if arch_markers_arm.iter().any(|m| n.contains(m)) {
        score = if is_arm { score + 40 } else { return 0 };
    } else if arch_markers_x64.iter().any(|m| n.contains(m)) {
        score = if !is_arm { score + 40 } else { return 0 };
    }

    // Preferência por formato instalador na plataforma atual (acima do bônus de arquitetura)
    match os {
        "windows" => {
            if n.ends_with(".msi") {
                score += 100;
            } else if n.ends_with(".exe") {
                score += 90;
            } else if n.ends_with(".zip") {
                score += 10;
            }
        }
        "linux" => {
            if n.ends_with(".appimage") {
                score += 100;
            } else if n.ends_with(".deb") {
                score += 90;
            } else if n.ends_with(".rpm") {
                score += 80;
            } else if n.ends_with(".tar.gz") || n.ends_with(".tgz") {
                score += 20;
            } else if n.ends_with(".zip") {
                score += 10;
            }
        }
        "macos" => {
            if n.ends_with(".dmg") {
                score += 100;
            } else if n.ends_with(".pkg") {
                score += 90;
            } else if n.ends_with(".zip") {
                score += 20;
            } else if n.ends_with(".app.tar.gz") || n.ends_with(".tar.gz") {
                score += 15;
            }
        }
        _ => {}
    }

    if has_word_marker(&n, "setup") || has_word_marker(&n, "installer") {
        score += 15;
    }
    if has_word_marker(&n, "cli")
        || n.contains("proxy")
        || n.contains("extract")
        || n.contains("portable")
    {
        score = score.saturating_sub(15).max(1);
    }

    // Penalidade residual para nomes contendo "source" não filtrados acima
    if n.contains("source") {
        score = score.saturating_sub(50).max(1);
    }

    score
}

/// Escolhe o melhor asset da release para a plataforma atual.
pub fn choose_asset(assets: &[GhAsset]) -> Option<GhAsset> {
    assets
        .iter()
        .filter(|a| a.size > 0)
        .max_by_key(|a| asset_score(&a.name))
        .filter(|a| asset_score(&a.name) > 0)
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> GhAsset {
        GhAsset {
            name: name.to_string(),
            browser_download_url: format!("https://github.com/org/app/releases/download/v1/{name}"),
            size: 1000,
            download_count: 1,
            digest: None,
        }
    }

    #[test]
    fn escolhe_asset_da_plataforma_atual() {
        let assets = vec![
            asset("app-1.0-windows-x86_64.msi"),
            asset("app-1.0-linux-x86_64.AppImage"),
            asset("app-1.0-macos-aarch64.dmg"),
            asset("app-1.0.zip"),
        ];
        let chosen = choose_asset(&assets).expect("deveria escolher algum asset");
        let plat = current_platform();
        if plat.starts_with("windows") {
            assert!(
                chosen.name.ends_with(".msi"),
                "esperava .msi, veio {}",
                chosen.name
            );
        } else if plat.starts_with("linux") {
            assert!(
                chosen.name.ends_with(".AppImage"),
                "esperava .AppImage, veio {}",
                chosen.name
            );
        } else if plat.starts_with("macos") {
            assert!(
                chosen.name.ends_with(".dmg"),
                "esperava .dmg, veio {}",
                chosen.name
            );
        }
    }

    #[test]
    fn rejeita_assets_de_outra_plataforma() {
        let assets = vec![
            asset("app-linux-x86_64.AppImage"),
            asset("app-macos-arm64.dmg"),
        ];
        let plat = current_platform();
        let chosen = choose_asset(&assets);
        if plat.starts_with("windows") {
            assert!(
                chosen.is_none(),
                "não deveria escolher asset de outra plataforma"
            );
        }
    }

    #[test]
    fn prefere_instalador_sobre_zip() {
        let assets = vec![
            asset("app-1.0.zip"),
            asset("app-1.0-windows-x64.msi"),
            asset("app-1.0-linux.deb"),
            asset("app-1.0-macos.dmg"),
        ];
        let chosen = choose_asset(&assets).unwrap();
        let plat = current_platform();
        if plat.starts_with("windows") {
            assert!(chosen.name.ends_with(".msi"));
        } else if plat.starts_with("linux") {
            assert!(chosen.name.ends_with(".deb"));
        } else if plat.starts_with("macos") {
            assert!(chosen.name.ends_with(".dmg"));
        }
    }

    #[test]
    fn plataforma_atual_e_valida() {
        let p = current_platform();
        assert!(p.starts_with("windows") || p.starts_with("linux") || p.starts_with("macos"));
    }

    #[test]
    fn rejeita_scripts_checksums_e_apks() {
        let assets = vec![
            asset("install.ps1"),
            asset("setup.sh"),
            asset("app-windows-x64.exe.sha256"),
            asset("app-release.apk"),
            asset("app-source-code.zip"),
        ];
        assert!(
            choose_asset(&assets).is_none(),
            "scripts, checksums, apks e source code nunca devem ser escolhidos"
        );
    }

    #[test]
    fn rejeita_bsd_solaris_mobile_e_src() {
        let assets = vec![
            asset("rclone-v1.68.0-freebsd-amd64.zip"),
            asset("tool-openbsd-amd64.zip"),
            asset("tool-netbsd-amd64.zip"),
            asset("restic_0.17.3_dragonfly_amd64.bz2"),
            asset("tool-solaris-x64.zip"),
            asset("tool-illumos-x64.zip"),
            asset("app-android-arm64.zip"),
            asset("app-ios-arm64.zip"),
            asset("VSCodium-1.99.0-src.zip"),
            asset("app_src.tar.gz"),
            asset("lapce-proxy-windows-x86_64.gz"),
        ];
        assert!(choose_asset(&assets).is_none());

        // "ios" dentro de "bios" ou "studios" não deve ser rejeitado
        if current_platform().starts_with("windows") {
            let valid = vec![asset("bios-updater-win64.exe")];
            assert!(choose_asset(&valid).is_some());
        }
    }

    #[test]
    fn instalador_sem_arch_supera_zip_com_arch_e_setup_vence_cli() {
        if current_platform().starts_with("windows") {
            let drawio = vec![
                asset("draw.io-x64-32.7.4.zip"),
                asset("draw.io-32.7.4-windows-installer.exe"),
            ];
            assert_eq!(
                choose_asset(&drawio).unwrap().name,
                "draw.io-32.7.4-windows-installer.exe"
            );

            let mockoon = vec![
                asset("mockoon-9.10.0.amd64.snap"),
                asset("mockoon.setup.9.10.0.exe"),
            ];
            assert_eq!(
                choose_asset(&mockoon).unwrap().name,
                "mockoon.setup.9.10.0.exe"
            );

            let calibre = vec![
                asset("calibre-9.19.0-x86_64.txz"),
                asset("calibre-64bit-9.19.0.msi"),
            ];
            assert_eq!(
                choose_asset(&calibre).unwrap().name,
                "calibre-64bit-9.19.0.msi"
            );

            let lapce = vec![
                asset("lapce-proxy-windows-x86_64.gz"),
                asset("Lapce-windows.msi"),
            ];
            assert_eq!(choose_asset(&lapce).unwrap().name, "Lapce-windows.msi");

            let mqttx = vec![
                asset("mqttx-cli-win-x64.exe"),
                asset("MQTTX-Setup-1.11.0-x64.exe"),
            ];
            assert_eq!(
                choose_asset(&mqttx).unwrap().name,
                "MQTTX-Setup-1.11.0-x64.exe"
            );

            let uefitool = vec![
                asset("UEFIExtract_NE_A68_win64.zip"),
                asset("UEFITool_NE_A68_win64.zip"),
            ];
            assert_eq!(
                choose_asset(&uefitool).unwrap().name,
                "UEFITool_NE_A68_win64.zip"
            );

            let ytm = vec![
                asset("YouTube-Music-3.12.1.nsis.7z"),
                asset("YouTube-Music-3.12.1-Setup.exe"),
            ];
            assert_eq!(
                choose_asset(&ytm).unwrap().name,
                "YouTube-Music-3.12.1-Setup.exe"
            );
        }
    }

    #[test]
    fn darwin_nao_dispara_marcador_win_no_macos() {
        assert!(!is_other_platform("app-1.0-darwin-arm64.tar.gz", "macos"));
        assert!(!is_other_platform("app-1.0-darwin-x64.dmg", "macos"));
        assert!(is_other_platform("app-1.0-win-x64.zip", "macos"));
        assert!(is_other_platform("app-1.0-windows.zip", "macos"));
    }
}
