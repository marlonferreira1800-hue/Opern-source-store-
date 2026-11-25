# Open Source Store

Uma loja centralizada de aplicativos **open source**, estilo ArtCraft: em vez de procurar repositório por repositório no GitHub, você busca, instala e atualiza tudo de um só lugar.

**100% Rust** — backend em Rust com [Tauri 2.0](https://tauri.app) (a UI roda numa webview servida por Vite, mas toda a lógica — catálogo, download, instalação — é Rust).

## Como funciona

1. O backend Rust consulta a **API do GitHub** (`/repos/{owner}/{repo}` + `/releases/latest`) para uma lista curada de repositórios open source (`data/curated.json`).
2. Para cada release, o módulo `platform.rs` **escolhe o asset correto para o seu sistema operacional e arquitetura** (`.msi`/`.exe` no Windows, `.AppImage`/`.deb` no Linux, `.dmg` no macOS).
3. O catálogo fica em **cache local** (`catalog_cache.json`, TTL de 30 min) para não estourar o rate limit da API.
4. O download é feito em Rust com **progresso real** emitido para o frontend via evento Tauri (`download-progress`), com verificação **SHA256** quando o GitHub informa o digest.
5. Apps baixados ficam registrados em `installed.json` — a loja mostra seções **INSTALADOS** e **NÃO INSTALADOS**, com botão **ABRIR**, **ATUALIZAR** e **Desinstalar**.
6. Busca ao vivo: qualquer repositório do GitHub pode ser encontrado pela barra de busca (`search_apps`).

## Estrutura

```
open-source-store/
├── src-tauri/                  # aplicación desktop (Tauri 2.0 + Rust)
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json         # config Tauri 2.0 (app, bundle, csp)
│   ├── capabilities/default.json  # permissões (opener)
│   ├── icons/icon.ico|png
│   └── src/
│       ├── main.rs             # setup, plugins, comandos registrados
│       ├── commands.rs         # #[tauri::command] (get_catalog, download_app, ...)
│       ├── catalog.rs          # API do GitHub + cache local
│       ├── downloader.rs       # download com progresso via eventos + sha256
│       ├── platform.rs         # detecta OS/arch e escolhe o asset certo (+ testes)
│       ├── store.rs            # persistência (catalog_cache, installed, settings)
│       └── models.rs           # structs App, GhRelease, InstalledApp...
├── web/                        # frontend (webview)
│   ├── index.html
│   └── src/main.js, styles/style.css
├── data/
│   ├── curated.json            # repositórios open source (seed do catálogo)
│   └── categories.json
├── scripts/copy-assets.mjs     # copia ícones para o build
└── package.json
```

## Rodando

Pré-requisitos: Rust (stable), Node.js 18+, [Tauri CLI prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2 no Windows).

```bash
npm install
npm run tauri:dev      # modo desenvolvimento (vite + tauri)
npm run tauri:build    # gera o instalador (bundle.targets = all)
```

Testes do backend Rust:

```bash
cd src-tauri
cargo test             # testes de escolha de asset por plataforma
```

## Comandos disponíveis (frontend → Rust)

| Comando | Descrição |
|---------|-----------|
| `get_catalog(force_refresh)` | Catálogo (cache local ou GitHub) |
| `search_apps(query)` | Busca ao vivo no GitHub |
| `get_categories()` | Categorias da loja |
| `get_app_by_id(app_id)` | Detalhes de um app |
| `download_app(app_id)` | Download real com evento `download-progress` |
| `cancel_download(app_id)` | Cancela download em andamento |
| `get_installed()` | Apps instalados |
| `get_apps_to_update()` | Apps com atualização disponível |
| `open_installed(app_id)` | Abre o app instalado |
| `uninstall_app(app_id)` | Remove arquivo + registro |
| `open_url(url)` | Abre URL no navegador |
| `save_github_token(token)` | Token opcional (aumenta rate limit da API) |

## Personalizando o catálogo

Edite `data/curated.json` e adicione qualquer `"owner/repo"` open source que tenha releases com binários:

```json
["qBittorrent/qBittorrent", "helix-editor/helix", "seu-usuario/seu-app"]
```

## Licença

MIT — veja [LICENSE](LICENSE).

---

Contato: marlonferreira1800@gmail.com
