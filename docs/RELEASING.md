# Como publicar uma release

## Processo

1. Atualize a versão nos três lugares:
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
2. Mova a seção `[NãoLançado]` do [`CHANGELOG.md`](../CHANGELOG.md) para `[x.y.z] - AAAA-MM-DD`.
3. Commit na `main` e push (o CI precisa passar — a `main` é protegida e exige `Frontend Build` + `Rust Check & Tests`).
4. Crie a tag e faça o push dela:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. O workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) compila automaticamente em Windows, Linux e macOS (via `tauri-action`) e **cria a GitHub Release** com os instaladores anexados (`.exe`/`.msi`, `.AppImage`/`.deb`, `.dmg`).

## Canais de distribuição

| Canal | URL | Atualização |
|---|---|---|
| Release (desktop) | `github.com/marlonferreira1800-hue/open-source-store/releases` | automática via tag `v*` |
| Versão web | `marlonferreira1800-hue.github.io/open-source-store/` | automática a cada push na `main` (workflow `pages.yml`) |

## Notas

- A `main` tem proteção de branch: sem force-push, sem delete, e PRs só mergeiam com os 2 checks do CI verdes.
- O Dependabot abre PRs semanais (npm + cargo) — revise e mergeie para manter o `Cargo.lock`/`package-lock.json` à frente dos alertas de segurança.
- Para o app desktop se auto-atualizar (plugin updater), será preciso gerar uma chave de assinatura e configurar os secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — o release.yml já está pronto para isso.
