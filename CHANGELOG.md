# Histórico de Atualizações

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e cada versão tem uma **tag** no git e uma página de **Release** no GitHub com o instalador anexado para download.

## [NãoLançado]

### Adicionado
- **Versão web no GitHub Pages** — https://marlonferreira1800-hue.github.io/open-source-store/ — publicada automaticamente a cada push na `main` pelo workflow `.github/workflows/pages.yml` (build Vite para `dist/` + `actions/deploy-pages`). No navegador, catálogo e busca ao vivo funcionam via API pública do GitHub, sem instalar o app desktop; instalar apps segue exclusivo do desktop
- **Descoberta/destaque no GitHub**: 20 topics no repositório, descrição com palavras-chave de busca, **Discussions** habilitado (6 categorias padrão + post de boas-vindas), imagem de social preview em `.github/social-preview.png`, badges no README (CI, Pages, release, licença, web)
- **Comunidade e segurança**: `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `.github/SECURITY.md` + **Private Vulnerability Reporting** habilitado, `.github/FUNDING.yml` (botão de sponsoring), contact links em `.github/ISSUE_TEMPLATE/config.yml` (Discussions, web, releases, reporte privado)
- **Release automático do desktop**: workflow `.github/workflows/release.yml` (`tauri-action`) compila Windows/Linux/macOS e cria a GitHub Release com os instaladores anexados ao dar push numa tag `v*` — processo documentado em `docs/RELEASING.md`
- **Proteção da branch `main`**: exige os checks `Frontend Build` e `Rust Check & Tests` (CI) antes de merge, com resolução de conversas obrigatória; sem force-push e sem deleção da branch
- **Dependabot configurado** (`.github/dependabot.yml`, atualização semanal de npm e cargo com PRs automáticos) e labels personalizadas: `rust`, `tauri`, `frontend`, `web`, `catalog`, `ci`, `release`

### Segurança
- Alerta Dependabot #9 (`glib`, medium, transitivo via GTK apenas no Linux, sem versão corrigida disponível) dispensado como risco tolerável; o `dependabot.yml` reabre o alerta automaticamente quando surgir correção

### Alterado
- **Repositório renomeado** de `Opern-source-store-` para **`open-source-store`** (nome descritivo, sem typo, melhor para busca no GitHub). Novas URLs: repo `github.com/marlonferreira1800-hue/open-source-store` e web `marlonferreira1800-hue.github.io/open-source-store/` — as URLs antigas redirecionam para as novas

## [0.1.0] - 2026-11-25

Primeira versão pública — loja desktop de aplicativos open source com backend 100% Rust (Tauri 2.0).

### Adicionado
- Reescrita completa em **Rust + Tauri 2.0** (removida a versão protótipo em Godot/GDScript), com estrutura correta do Tauri 2.0 (`src-tauri/`, capabilities, plugin opener) — `6fc12a1`
- Backend que consulta a **API real do GitHub** (repositórios curados + releases) com **cache local** (`catalog_cache.json`, TTL de 30 min) — `6fc12a1`
- Catálogo com os **top 100 apps open source** (mais estrelas + push recente), com filtro obrigatório de fama/atividade (`MIN_STARS=1000`, `MAX_INACTIVE_DAYS=365`) aplicado ao catálogo e à busca ao vivo — `ddea7eb`
- Seleção de asset **por sistema operacional e arquitetura** (`.msi`/`.exe` no Windows, `.AppImage`/`.deb` no Linux, `.dmg` no macOS) com testes unitários — `6fc12a1`, `ace5901`
- Download em Rust com **progresso em tempo real** via evento Tauri (`download-progress`) e verificação **SHA-256** quando disponível — `6fc12a1`
- Registro local de apps instalados (`installed.json`) com seções **INSTALADOS / NÃO INSTALADOS**, ações **ABRIR**, **ATUALIZAR**, **ATUALIZAR TODOS** e **Desinstalar** — `6fc12a1`
- **Busca ao vivo** na API do GitHub a partir da barra de busca (`search_apps`) — `6fc12a1`
- Exibição da **última atividade** (`pushed_at`) no card e no detalhe de cada app — `ddea7eb`
- Interface web (Vite + JS vanilla) com seções de instalados, busca ao vivo e atualizações — `6fc12a1`, `ace5901`, `3acf428`
- Projeto inicial estilo ArtCraft: UI de loja com cards, busca, ordenação, categorias e sistema de download com progresso — `8c4125f`, `6fbc5ec`
- Dados de seed curados (`data/curated.json`, `data/catalog-seed.json`, `data/categories.json`) e política de curadoria (`data/curation-policy.json`) — `ace5901`, `ddea7eb`
- Script `scripts/fetch-top100.mjs` para atualizar o catálogo via GitHub Search API — `ddea7eb`

### Corrigido
- **Recursão infinita no invoke do Tauri**, downloads na busca ao vivo, categorias e **escape contra XSS** na renderização — `f5c8a1e`
- Fallback para quando o app abre em **navegador puro** (sem `__TAURI_INTERNALS__`): camada `call()` usa `invoke` no Tauri e a GitHub Search API direta no navegador (modo demo), com banner explicando que o app desktop é necessário para instalar — `caff57c`
- Fallback **offline** + tratamento de rate limit (60 req/h sem token): catálogo curado servido localmente, limite de 25 repos online sem token (100 com token), aviso de offline e botão **VER NO GITHUB** quando não há asset binário — `c27a7b5`

### Alterado
- Porta de desenvolvimento alterada para a padrão do Tauri (**1420**) para evitar conflitos — `0fd1653`
- Vite atualizado para **^7** (0 vulnerabilidades), build mantido funcionando — `4e4d83e`
- Adição de `.gitattributes` (line endings + classificação Linguist) — `18e5841`
- Remoção de arquivos restantes, código morto e informações pessoais — `c826021`
- Atualizações de dados do catálogo, UI, store, estilos e configuração do Tauri — `3acf428`, `ace5901`

### Testes
- 8 testes unitários passando no backend Rust (`catalog.rs`, `platform.rs`) — `ddea7eb`

---

## Como as versões são publicadas

1. As mudanças entram via commit na `main` e são documentadas aqui.
2. Ao publicar uma versão, criamos a tag (ex.: `v0.1.0`) e uma **Release no GitHub** com as notas desta seção.
3. O instalador (`.exe`/`.msi` para Windows, `.AppImage`/`.deb` para Linux, `.dmg` para macOS) é anexado como **asset** da Release — baixe em [Releases](https://github.com/marlonferreira1800-hue/open-source-store/releases).

[0.1.0]: https://github.com/marlonferreira1800-hue/open-source-store/releases/tag/v0.1.0
