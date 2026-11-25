# Política de Segurança

## Versões suportadas

| Versão | Suportada |
|---|---|
| última release (ex.: v0.1.0) | Sim |
| releases anteriores | Não |

## Reportar uma vulnerabilidade

**Não abra uma issue pública para vulnerabilidades.**

Use o reporte privado do GitHub (Private Vulnerability Reporting, habilitado neste repositório):

https://github.com/marlonferreira1800-hue/Opern-source-store-/security/advisories/new

O que incluir:

1. Descrição do problema e impacto potencial
2. Passos para reproduzir (PoC, comandos, prints)
3. Versão afetada (desktop/web) e sistema operacional
4. Se possível, uma sugestão de correção

## O que está no escopo

- App desktop (Tauri/Rust): download de assets, verificação SHA-256, execução de instaladores, permissões (capabilities)
- Versão web (GitHub Pages): XSS na renderização, chamadas à API do GitHub, exposição de tokens
- CI/CD (workflows) e páginas publicadas
- Dados do catálogo (`data/`) que alimentam decisões de instalação

## Fora de escopo

- Rate limit da API pública do GitHub (60 req/h sem token) — limite conhecido, use token
- Vulnerabilidades em apps de terceiros listados no catálogo (reporte ao upstream do app)
- Dependências transitivas sem caminho de exploração conhecido no nosso app (ainda assim, reporte — avaliamos caso a caso)

## Compromisso de resposta

- Confirmação de recebimento em até **72 horas**
- Avaliação inicial e triagem em até **7 dias**
- Correção e release com crédito ao reportante (se desejar), conforme a severidade

Agradecemos reports responsáveis — veja o `CHANGELOG.md` para correções de segurança publicadas.
