# Open Source Store - Rust + Tauri

📱 **A Play Store para Aplicativos Open Source - Construída em Rust**

A Open Source Store é uma loja centralizada onde você pode **descobrir, baixar e instalar aplicativos open source** sem precisar navegar até o GitHub de cada projeto. **Construída com Rust + Tauri** para máxima performance e segurança.

## 🚀 Tecnologias

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| **Rust** | 1.70+ | Backend (lógica, downloads, gerenciamento) |
| **Tauri** | 2.0 | Framework de aplicativos desktop |
| **HTML/CSS/JS** | - | Frontend (interface do usuário) |
| **Vite** | 5.0 | Bundler do frontend |

## 🎯 Por que Rust + Tauri?

### ✅ **Rust**
- **Performance nativa** (tão rápido quanto C/C++)
- **Segurança de memória** (nenhum segfault, nenhum memory leak)
- **Concorrência segura** (thread-safe por padrão)
- **Zero-cost abstractions** (sem overhead)
- **Cross-platform** (Windows, macOS, Linux, Android, iOS)

### ✅ **Tauri**
- **Apps ultra-leves** (~5-10MB vs ~100MB do Electron)
- **Interface moderna** com HTML/CSS/JS
- **Backend em Rust** (performance máxima)
- **Cross-platform** (Windows, macOS, Linux)
- **Comunidade ativa** (2024)

### ✅ **Combinação Perfeita**
- **Backend**: Rust cuida de downloads, gerenciamento de arquivos, lógica
- **Frontend**: HTML/CSS/JS cuida da interface do usuário
- **Resultado**: Aplicativo **rápido, seguro e moderno**

## 📦 Funcionalidades

### 🎨 Interface Principal
- 🏠 **Tela inicial** com todos os aplicativos
- 🔍 **Barra de busca** em tempo real
- 📊 **Ordenação** por: Nome (A-Z, Z-A), Mais recentes, Mais populares, Maior avaliação
- 🔄 **Sistema de atualizações** - Notificação de apps com atualização disponível
- ☰ **Menu lateral** com categorias

### 📱 Cards de Aplicativos
Cada card exibe:
- 🖼️ **Ícone do aplicativo** (48x48)
- 🆔 **Versão** (ex: V0.6.1)
- 🏷️ **Nome** do app
- 📝 **Tagline** (descrição curta em português)
- 📄 **Descrição** completa
- ℹ️ **Data da última atualização**
- 💾 **Tamanho do download** em MB
- 🌐 **Botão GitHub** - Link direto para o repositório
- ⬇️ **Botões de ação**:
  - `ABRIR` - Para apps já instalados
  - `ATUALIZAR` - Se houver atualização disponível
  - `DISPONÍVEL PARA INSTALAR` - Para apps não instalados
  - `...` - Mais opções

### 📦 Detalhes do Aplicativo
- 🖼️ **Ícone grande**
- 📝 **Descrição completa** (em português)
- ⭐ **Avaliação em estrelas**
- 📊 **Informações**: Versão, Tamanho, Licença, Autor
- 📸 **Screenshots** (até 3 imagens)
- 🌐 **Link para GitHub**
- ⬇️ **Botão de download**

### ⬇️ Sistema de Download
- 🔄 **Fila de downloads** (múltiplos downloads simultâneos)
- 📊 **Progresso** do download (0% - 100%)
- ✅ **Notificações** de sucesso/falha
- 🛑 **Cancelar downloads** em andamento
- 💾 **Salvar em** `~/.open-source-store/downloads/`

## 📁 Estrutura do Projeto

```
open-source-store/
├── Cargo.toml                    # Dependências Rust
├── tauri.conf.json              # Configuração do Tauri
├── vite.config.ts               # Configuração do Vite
├── package.json                 # Dependências frontend
│
├── src/                          # Backend (Rust)
│   ├── main.rs                   # Ponto de entrada
│   ├── commands.rs               # Comandos do Tauri
│   └── data/                     # Dados JSON
│       ├── apps.json             # Lista de aplicativos
│       └── categories.json      # Lista de categorias
│
├── src-tauri/                    # Configurações do Tauri
│   └── build.rs
│
└── web/                          # Frontend (HTML/CSS/JS)
    ├── index.html                # Estrutura HTML
    └── src/
        ├── main.js               # Lógica JavaScript
        └── styles/
            └── style.css         # Estilo ArtCraft
```

## 📥 Instalação

### Pré-requisitos

1. **Rust** 1.70 ou superior
2. **Node.js** 18 ou superior
3. **Tauri CLI** (será instalado automaticamente)

### Instalação no Windows

```powershell
# 1. Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Adicionar Rust ao PATH
$env:Path += ";$env:USERPROFILE\.cargo\bin"

# 3. Instalar Node.js (baixe do site oficial)
# https://nodejs.org/

# 4. Verificar instalações
rustc --version
node --version
npm --version
```

### Instalação no Linux/macOS

```bash
# 1. Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# 2. Instalar Node.js
# Linux (Debian/Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS (Homebrew)
brew install node

# 3. Verificar instalações
rustc --version
node --version
npm --version
```

## 🚀 Executando o Projeto

### Desenvolvimento

```bash
# 1. Navegar até o diretório do projeto
cd Open-Source-Store-Rust

# 2. Instalar dependências do frontend
npm install

# 3. Executar em modo desenvolvimento
npm run tauri dev
```

O aplicativo abrirá automaticamente em uma janela.

### Produção

```bash
# 1. Build para produção
npm run tauri build

# 2. O executável será criado em:
#    - Windows: target/release/bundle/msvc/open-source-store.exe
#    - Linux: target/release/bundle/appimage/open-source-store
#    - macOS: target/release/bundle/macos/open-source-store.app
```

## 🔧 Comandos Tauri

| Comando | Descrição |
|---------|-----------|
| `npm run tauri dev` | Executa em modo desenvolvimento |
| `npm run tauri build` | Compila para produção |
| `npm run tauri lint` | Verifica erros de linting |
| `npm run dev` | Executa apenas o Vite (frontend) |
| `npm run build` | Compila apenas o frontend |

## 📝 Como Personalizar

### 1. Adicionar Novos Aplicativos

Edite `src/data/apps.json`:

```json
{
  "id": "NOVO_ID",
  "name": "Nome do App",
  "tagline": "Tagline curta em português",
  "description": "Descrição em inglês",
  "description_pt": "Descrição em português",
  "category": "Development",
  "author": "Autor",
  "version": "1.0.0",
  "size_mb": 10,
  "license": "MIT",
  "rating": 4.5,
  "downloads": 1000,
  "featured": false,
  "popular": false,
  "recent": true,
  "has_update": false,
  "last_update": "15 de nov. de 2026",
  "icon": "nome_do_icon.png",
  "github_url": "https://github.com/user/repo",
  "download_url": "https://github.com/user/repo/releases/download/v1.0.0/App.apk",
  "screenshots": ["url1", "url2"],
  "tags": ["tag1", "tag2"]
}
```

### 2. Adicionar Ícone

1. Salve o ícone em `web/assets/icons/nome_do_icon.png`
2. Atualize o campo `icon` no JSON

### 3. Marcar como "Tem Atualização"

```json
"has_update": true
```

### 4. Adicionar Novas Categorias

Edite `src/data/categories.json`:

```json
{
  "name": "Nova Categoria",
  "icon": "nome_do_icon.png",
  "description": "Descrição da categoria"
}
```

## 🔧 Backend em Rust

### Arquivos principais

- **`src/main.rs`**: Ponto de entrada do aplicativo
- **`src/commands.rs`**: Comandos disponíveis para o frontend

### Comandos disponíveis

| Comando | Descrição | Retorno |
|---------|-----------|---------|
| `get_apps` | Lista todos os aplicativos | `AppListResponse` |
| `get_categories` | Lista todas as categorias | `CategoryListResponse` |
| `get_app_by_id` | Busca app por ID | `AppResponse` |
| `search_apps` | Busca apps por query | `AppListResponse` |
| `download_app` | Baixa um aplicativo | `DownloadResponse` |
| `get_apps_to_update` | Lista apps com atualização | `AppListResponse` |
| `check_for_updates` | Verifica atualizações | `AppListResponse` |
| `open_url` | Abre URL no navegador | `Result<(), String>` |
| `get_app_data_path` | Pega caminho do diretório de dados | `Result<String, String>` |

### Adicionar novos comandos

1. Adicione o comando em `commands.rs`:

```rust
#[tauri::command]
pub async fn novo_comando(parametro: String) -> Result<Retorno, String> {
    Ok(Retorno { campo: "valor".to_string() })
}
```

2. Registre o comando em `main.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... outros comandos
    commands::novo_comando,
])
```

3. Chame do frontend:

```javascript
const resultado = await invoke('novo_comando', { parametro: 'valor' });
```

## 📊 Aplicativos Incluídos (Exemplo)

Baseado no estilo ArtCraft:

| Ícone | App | Versão | Tagline | Tamanho | Update |
|-------|-----|--------|---------|---------|--------|
| 🦅 | **Craft Anything** | V0.6.1 | Descubra como qualquer software funciona... | 67 MB | ❌ |
| 🦄 | **EffectCraft** | V0.25.1 | Motion graphics e efeitos visuais | 67 MB | ✅ |
| 🦉 | **FilmCraft** | V0.20.1 | Edição de vídeo, cor e som | 85 MB | ❌ |
| 📄 | **WordCraft** | V0.18.1 | Escritura e design de documentos | 45 MB | ❌ |
| 🐇 | **AniCraft** | V0.2.1 | Animação vetorial 2D | 15 MB | ❌ |
| 📐 | **CADCraft** | V0.20.1 | Desenho técnico e projeto assistido por IA | 57 MB | ❌ |
| 💼 | **DeckCraft** | V0.18.1 | Apresentações e slides | 79 MB | ❌ |
| 🎨 | **DesignCraft** | V0.21.1 | Diagramação de páginas e publicação | 103 MB | ❌ |

## 🎨 Estilo Visual (ArtCraft)

### Cores do Tema Escuro

| Cor | Hex | RGB | Uso |
|-----|-----|-----|-----|
| **Fundo Primário** | `#0f0f0f` | `15, 15, 15` | Fundo da janela |
| **Fundo Secundário** | `#1a1a1a` | `26, 26, 26` | Top bar, nav bar |
| **Fundo Terciário** | `#252525` | `37, 37, 37` | Cards |
| **Texto Primário** | `#f5f5f5` | `245, 245, 245` | Textos principais |
| **Texto Secundário** | `#b3b3b3` | `179, 179, 179` | Textos secundários |
| **Texto Terciário** | `#808080` | `128, 128, 128` | Textos fracos |
| **Azul Primário** | `#4dabff` | `77, 171, 255` | Destaques |
| **Azul Secundário** | `#339af0` | `51, 154, 240` | Hover |

### Fontes

- **Família**: Inter
- **Tamanhos**: 10px, 12px, 14px, 16px, 18px, 24px
- **Pesos**: 300, 400, 500, 600, 700

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch com sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adicionando nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a **MIT License**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🙏 Agradecimentos

- À equipe do **Tauri** pelo ótimo framework
- À comunidade **Rust** pela linguagem incrível
- A todos os desenvolvedores de **aplicativos open source**
- A todos que contribuírem com este projeto

---

📧 **Contato**: marlonferreira1800@gmail.com

🌐 **Inspirado por**: ArtCraft App Suite (https://artcraft.app)

💡 **Construído com**: ❤️ Rust + Tauri
