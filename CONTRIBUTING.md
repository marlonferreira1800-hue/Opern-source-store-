# Contribuindo com a Open Source Store

Obrigado pelo interesse em contribuir!

## Pré-requisitos

- **Node.js** 18+
- **Rust** (stable, >= 1.77) com `rustfmt` e `clippy`
- Dependências de sistema do [Tauri 2.0](https://v2.tauri.app/start/prerequisites/) (WebView2 no Windows; `webkit2gtk` no Linux)

## Rodando localmente

```bash
npm install
npm run tauri:dev
```

Para testar apenas a interface web no navegador (modo demo via GitHub API):

```bash
npm run dev
```

## Adicionando aplicativos ao catálogo

1. Edite [`data/curated.json`](data/curated.json) mantendo o formato `"owner/repo"`.
2. Verifique se o repositório é ativo, possui código aberto e publica binários nas GitHub Releases.
3. Para atualizar automaticamente a lista com os top 100 repositórios ativos:

```bash
npm run catalog:update
```

## Verificações antes de abrir um PR

```bash
npm run build
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## Padrão de commits

Prefira mensagens no padrão [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` nova funcionalidade
- `fix:` correção de bug
- `chore:` manutenção, dependências ou scripts
- `docs:` documentação
- `refactor:` reorganização de código sem alterar comportamento
