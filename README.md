# Open Source Store

Uma loja centralizada de aplicativos **open source**: em vez de procurar repositório por repositório no GitHub, você busca, instala e atualiza tudo de um só lugar.

**100% Rust no backend** com [Tauri 2.0](https://tauri.app) e interface modular em Vite + JavaScript vanilla.

## Download

Baixe o instalador na página de [Releases](https://github.com/marlonferreira1800-hue/Opern-source-store-/releases/latest):

| Plataforma | Arquivo |
|---|---|
| Windows (x64) | [`Open.Source.Store_0.1.0_x64-setup.exe`](https://github.com/marlonferreira1800-hue/Opern-source-store-/releases/download/v0.1.0/Open.Source.Store_0.1.0_x64-setup.exe) (2,2 MB) |

O histórico completo de versões e suas mudanças está em [`CHANGELOG.md`](CHANGELOG.md) e na página de [Releases](https://github.com/marlonferreira1800-hue/Opern-source-store-/releases).

## Como funciona

1. O backend Rust consulta a **API do GitHub** (`/repos/{owner}/{repo}` + `/releases/latest`) para os repositórios curados em [`data/curated.json`](data/curated.json).
2. Para cada release, [`platform.rs`](src-tauri/src/platform.rs) **escolhe o asset compatível com seu sistema operacional e arquitetura** (`.msi`/`.exe` no Windows, `.AppImage`/`.deb` no Linux, `.dmg` no macOS).
3. O catálogo fica em **cache local** (`catalog_cache.json`, TTL de 30 min) para evitar estourar o rate limit da API.
4. O download ocorre em Rust com **progresso em tempo real** via evento Tauri (`download-progress`) e verificação **SHA-256** quando informada pelo GitHub.
5. Apps baixados são registrados em `installed.json` — exibindo **INSTALADOS**, **NÃO INSTALADOS**, **ABRIR**, **ATUALIZAR** e **Desinstalar**.
6. Busca ao vivo: qualquer repositório open source do GitHub pode ser pesquisado pela barra de busca (`search_apps`).

## Estrutura do Repositório

```text
open-source-store/
├── .github/
│   ├── ISSUE_TEMPLATE/             # Templates de bug, feature e sugestão de app
│   ├── workflows/ci.yml            # CI (Build Vite + cargo fmt/clippy/test)
│   └── PULL_REQUEST_TEMPLATE.md
├── data/
│   ├── categories.json             # Categorias da loja
│   └── curated.json                # Seed curada de repositórios (owner/repo)
├── docs/
│   └── ARCHITECTURE.md             # Visão detalhada da arquitetura
├── scripts/
│   ├── copy-assets.mjs             # Copia web/assets/icons para dist/
│   ├── fetch-top100.mjs            # Atualiza data/curated.json via GitHub Search API
│   └── gen-icons.py                # Gera ícones padrão do app
├── src-tauri/                      # Backend desktop (Tauri 2.0 + Rust)
│   ├── capabilities/default.json   # Permissões (core, opener)
│   ├── icons/                      # Ícones do executável/bundle
│   ├── src/
│   │   ├── main.rs                 # Setup, plugins e registro de comandos
│   │   ├── commands.rs             # Handlers #[tauri::command]
│   │   ├── catalog.rs              # Integração com GitHub API + cache
│   │   ├── downloader.rs           # Streaming, progresso e SHA-256
│   │   ├── platform.rs             # Seleção de asset por OS/arch + testes
│   │   ├── store.rs                # Persistência JSON local
│   │   └── models.rs               # Structs serde
│   ├── Cargo.toml
│   └── tauri.conf.json
├── web/                            # Frontend WebView (Vite)
│   ├── assets/icons/               # Ícone fallback padrão
│   ├── src/
│   │   ├── api/client.js           # IPC Tauri + fallback navegador
│   │   ├── state/store.js          # Estado global, filtros e ordenação
│   │   ├── styles/style.css        # Estilos da interface
│   │   ├── ui/render.js            # Renderização de cards, modais e sidebar
│   │   ├── utils/format.js         # Sanitização (XSS), URL segura e formatação
│   │   └── main.js                 # Entrypoint e binding de eventos
│   └── index.html
├── .editorconfig
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── README.md
└── vite.config.ts
```

## Executando o Projeto

Pré-requisitos: **Rust** (stable >= 1.77), **Node.js** (18+) e os [pré-requisitos do Tauri 2.0](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri:dev      # Modo desenvolvimento (Vite + Tauri desktop)
npm run tauri:build    # Gera executável e instaladores
```

### Scripts disponíveis

| Script | Descrição |
|---|---|
| `npm run dev` | Sobe apenas o frontend Vite em `localhost:1420` (modo demo) |
| `npm run build` | Compila o frontend em `dist/` e copia os assets |
| `npm run tauri:dev` | Inicia o app desktop completo em modo desenvolvimento |
| `npm run tauri:build` | Gera build de produção e instaladores |
| `npm run catalog:update` | Atualiza `data/curated.json` com os top 100 apps ativos |
| `npm run icons:generate` | Regenera `icon.png`, `icon.ico` e `app_default.png` |

### Testes do Backend Rust

```bash
cd src-tauri
cargo test
```

## Comandos Tauri (Frontend → Rust)

| Comando | Descrição |
|---|---|
| `get_catalog(force_refresh)` | Carrega catálogo (cache local ou GitHub) |
| `search_apps(query)` | Busca ao vivo no GitHub |
| `get_categories()` | Lista categorias da loja |
| `get_app_by_id(app_id)` | Detalhes de um app específico |
| `download_app(app_id)` | Download com evento `download-progress` e SHA-256 |
| `cancel_download(app_id)` | Cancela download em andamento |
| `get_installed()` | Lista apps instalados |
| `get_apps_to_update()` | Lista apps com nova release disponível |
| `open_installed(app_id)` | Abre o aplicativo instalado |
| `uninstall_app(app_id)` | Remove o arquivo baixado e o registro |
| `open_url(url)` | Abre URL externa no navegador padrão |
| `save_github_token(token)` | Salva token opcional para ampliar o rate limit |
| `get_downloads_path()` | Retorna o diretório local de downloads |

## Documentação e Contribuição

- Arquitetura técnica: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Guia de contribuição: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Licença: [MIT](LICENSE)
