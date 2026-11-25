# Contribuindo para a Open Source Store

Obrigado por querer contribuir! Este guia explica como reportar problemas,
sugerir melhorias e enviar código.

## Código de Conduta

Este projeto adota o [Código de Conduta](CODE_OF_CONDUCT.md). Ao participar,
você concorda em respeitá-lo.

## Como reportar bugs

1. Verifique se já existe uma issue aberta sobre o problema.
2. Se não existir, abra uma nova issue usando o template **Bug report**.
3. Inclua passos para reproduzir, comportamento esperado e logs/prints.

## Como sugerir features

Abra uma issue com o template **Feature request** descrevendo o problema que
a feature resolve e a solução proposta.

## Fluxo de trabalho para código

1. Faça fork do repositório e clone o seu fork.
2. Crie uma branch descritiva a partir da `main`:
   ```bash
   git checkout -b feat/nome-da-feature
   ```
3. Faça suas mudanças em commits pequenos e com mensagens no formato
   convencional (veja abaixo).
4. Garanta que o CI passa localmente antes de abrir o PR:
   - Web: `npm install && npm run build`
   - Rust: `cargo check`
   - Valide os JSONs: `python3 -m json.tool data/apps.json`
5. Abra um Pull Request para a branch `main` preenchendo o template de PR.
   Todo PR precisa de **pelo menos 1 review aprovada** e CI verde para merge.

## Convenção de commits

Use prefixos em inglês, no imperativo:

- `feat:` nova funcionalidade
- `fix:` correção de bug
- `docs:` documentação
- `style:` formatação (sem mudança de lógica)
- `refactor:` refatoração
- `test:` testes
- `chore:` tarefas de build/CI/config
- `build:` mudanças no sistema de build ou dependências

Exemplo: `feat: adiciona filtro por licença na busca`

## Estrutura do projeto

| Caminho | O que é |
|---|---|
| `web/` | Frontend web (Vite + JS vanilla) |
| `scripts/` `scenes/` | Camada Godot (GDScript + cenas) |
| `src/` | Backend Rust / Tauri |
| `data/` `src/data/` | Catálogo de apps e categorias (JSON) |
| `.github/` | CI, templates, CODEOWNERS |

## Dúvidas

Abra uma issue com a label `question` ou mande um e-mail para
marlonferreira1800@gmail.com.
