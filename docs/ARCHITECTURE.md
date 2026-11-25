# Arquitetura — Open Source Store

A **Open Source Store** é uma aplicação desktop construída com **Tauri 2.0**, combinando um backend 100% em **Rust** com uma interface web leve em **HTML/CSS/JavaScript modular (Vite)**.

## Visão Geral

```
┌───────────────────────────────┐        Tauri IPC (invoke / event)        ┌─────────────────────────────────┐
│       Frontend (web/)         │  ──────────────────────────────────────▶ │       Backend (src-tauri/)      │
│                               │                                          │                                 │
│  main.js (orquestração)       │  ◀────────────────────────────────────── │  commands.rs (handlers IPC)     │
│  ├── api/client.js            │        evento: download-progress         │  ├── catalog.rs (GitHub + TTL)  │
│  ├── state/store.js           │                                          │  ├── downloader.rs (stream/SHA) │
│  ├── ui/render.js             │                                          │  ├── platform.rs (OS/arch)      │
│  └── utils/format.js          │                                          │  ├── store.rs (JSON local)      │
└───────────────────────────────┘                                          │  └── models.rs (structs serde)  │
                                                                           └─────────────────────────────────┘
```

## Camadas

### 1. Frontend (`web/`)
- `web/index.html`: Estrutura semântica da UI sem handlers JS inline (compatível com CSP restrita).
- `web/src/api/client.js`: Abstrai chamadas `invoke()` do Tauri e oferece fallback automático (`webCall`) via GitHub Search API quando executado fora do Tauri (navegador puro).
- `web/src/state/store.js`: Estado em memória (`catalogApps`, `apps`, `installedApps`, filtros, ordenação e downloads em andamento).
- `web/src/ui/render.js`: Renderização segura contra XSS de cards, seções, categorias, barra de status e modais.
- `web/src/utils/format.js`: Sanitização de HTML/URLs (`esc`, `safeUrl`) e formatação de tamanhos (`formatBytes`).
- `web/src/main.js`: Inicialização, binding centralizado de eventos (`data-action`) e ligação entre estado, API e UI.

### 2. Backend Rust (`src-tauri/src/`)
- `main.rs`: Inicializa logger, plugin `tauri-plugin-opener`, estado `AppState` e registra os comandos Tauri.
- `commands.rs`: Expõe comandos assíncronos para o frontend (`get_catalog`, `search_apps`, `download_app`, `uninstall_app`, etc.).
- `catalog.rs`: Carrega `data/curated.json` e `data/categories.json` em tempo de compilação (`include_str!`), consulta `/repos/{owner}/{repo}` e `/releases/latest`, e mantém cache local com TTL de 30 minutos.
- `platform.rs`: Detecta OS/arquitetura e pontua assets das releases para escolher o instalador mais adequado (`.msi`/`.exe`, `.AppImage`/`.deb`, `.dmg`).
- `downloader.rs`: Faz download via streaming com emissão de eventos `download-progress`, suporte a cancelamento e verificação de hash SHA-256 quando fornecido pela API do GitHub.
- `store.rs`: Persiste `catalog_cache.json`, `installed.json`, `settings.json` e binários baixados no diretório de dados da aplicação.

### 3. Dados e Automação (`data/` & `scripts/`)
- `data/curated.json`: Seed curada de repositórios open source.
- `data/categories.json`: Lista oficial de categorias da loja.
- `scripts/copy-assets.mjs`: Copia `web/assets/icons` para `dist/assets/icons` após o build do Vite.
- `scripts/fetch-top100.mjs`: Atualiza `data/curated.json` consultando a Search API do GitHub.
- `scripts/gen-icons.py`: Gera os ícones padrão (`icon.png`, `icon.ico`, `app_default.png`) sem dependências externas.
