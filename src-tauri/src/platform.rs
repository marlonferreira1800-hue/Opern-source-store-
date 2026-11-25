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

/// Score de compatibilidade de um asset com a plataforma atual.
/// Maior = mais compatível. 0 = incompatível.
fn asset_score(asset_name: &str) -> u32 {
    let n = asset_name.to_lowercase();
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };

    // Incompatíveis com a plataforma atual: pontua como 0
    let other_platforms = [
        (
            "windows",
            vec![
                "windows", "win32", "win64", ".exe", ".msi", "-win", "_win", "win-",
            ],
        ),
        (
            "linux",
            vec![
                "linux",
                ".appimage",
                ".deb",
                ".rpm",
                ".tar.gz",
                "-linux",
                "_linux",
            ],
        ),
        (
            "macos",
            vec!["macos", "darwin", ".dmg", ".pkg", "-macos", "_macos", "osx"],
        ),
    ];
    for (plat, markers) in other_platforms {
        if plat != os && markers.iter().any(|m| n.contains(m)) {
            return 0;
        }
    }

    let mut score: u32 = 1;

    //Arquitetura
    let is_arm = cfg!(target_arch = "aarch64");
    let arch_markers_arm = ["arm64", "aarch64", "armv8"];
    let arch_markers_x64 = ["x86_64", "x64", "amd64", "win64", "x86-64"];
    if arch_markers_arm.iter().any(|m| n.contains(m)) {
        score = if is_arm { score + 40 } else { 0 };
    } else if arch_markers_x64.iter().any(|m| n.contains(m)) {
        score = if !is_arm { score + 40 } else { 0 };
    }
    if score == 0 {
        return 0;
    }

    // Preferência por formato instalador na plataforma atual
    match os {
        "windows" => {
            if n.ends_with(".msi") {
                score += 30;
            } else if n.ends_with(".exe") {
                score += 25;
            } else if n.ends_with(".zip") {
                score += 10;
            }
        }
        "linux" => {
            if n.ends_with(".appimage") {
                score += 30;
            } else if n.ends_with(".deb") {
                score += 25;
            } else if n.ends_with(".rpm") {
                score += 20;
            } else if n.ends_with(".tar.gz") || n.ends_with(".tgz") {
                score += 10;
            } else if n.ends_with(".zip") {
                score += 5;
            }
        }
        "macos" => {
            if n.ends_with(".dmg") {
                score += 30;
            } else if n.ends_with(".pkg") {
                score += 25;
            } else if n.ends_with(".zip") {
                score += 10;
            } else if n.ends_with(".app.tar.gz") {
                score += 5;
            }
        }
        _ => {}
    }

    // Evitar assets de source code ("Source code" do GitHub não vem em assets, mas zips genéricos perdem ponto)
    if n.contains("source") {
        score = score.saturating_sub(50);
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
            browser_download_url: format!("https://example.com/{name}"),
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
}
