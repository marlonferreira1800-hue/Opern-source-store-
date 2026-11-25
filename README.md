# Open Source Store - ArtCraft Style

📱 **Uma loja de aplicativos open source no estilo ArtCraft**

A Open Source Store é uma loja centralizada inspirada no **ArtCraft App Suite**, onde você pode **descobrir, baixar e gerenciar aplicativos open source** sem precisar navegar até o GitHub de cada projeto.

## 🎨 Visual do ArtCraft

![ArtCraft Style](https://img.shields.io/badge/Style-ArtCraft%20Dark-blue?style=for-the-badge)

O design segue o estilo escuro e moderno do ArtCraft, com:
- **Tema escuro** por padrão
- **Cards compactos** com informações essenciais
- **Barra superior** com opções de atualização, ordenação e busca
- **Layout responsivo** para desktop e mobile

## 🚀 Funcionalidades

### 📋 **Interface Principal**
- 🏠 **Tela inicial** com todos os aplicativos
- 🔍 **Barra de busca** para encontrar apps rapidamente
- 📊 **Ordenação** por: Nome (A-Z, Z-A), Mais recentes, Mais populares, Maior avaliação
- 🔄 **Sistema de atualizações** - Notificação de apps com atualização disponível
- ☰ **Menu lateral** para navegação

### 📱 **Cards de Aplicativos**
Cada card exibe:
- 🖼️ **Ícone do aplicativo** (48x48)
- 🆔 **Versão** (ex: V0.6.1)
- 🏷️ **Nome** do app
- 📝 **Tagline** (descrição curta)
- 📄 **Descrição completa** (opcional)
- ℹ️ **Data da última atualização**
- 💾 **Tamanho do download** em MB
- 🌐 **Botão GitHub** - Link direto para o repositório
- ⬇️ **Botões de ação**:
  - `ABRIR` - Para apps já instalados
  - `ATUALIZAR` - Se houver atualização disponível
  - `DISPONÍVEL PARA INSTALAR` - Para apps não instalados
  - `...` - Mais opções

### 📦 **Detalhes do Aplicativo**
- 🖼️ **Ícone grande**
- 📝 **Descrição completa**
- ⭐ **Avaliação em estrelas**
- 📊 **Informações**: Versão, Tamanho, Licença, Autor
- 📸 **Screenshots** (até 3 imagens)
- 🌐 **Link para GitHub**
- ⬇️ **Botão de download**

### ⬇️ **Sistema de Download**
- 🔄 **Fila de downloads** (até 3 simultâneos)
- 📊 **Progresso** do download (0% - 100%)
- ✅ **Notificações** de sucesso/falha
- 🛑 **Cancelar downloads** em andamento
- 💾 **Salvar em** `user://downloads/`

## 📊 **Aplicativos Incluídos (Exemplo)**

Baseado no estilo ArtCraft:

| App | Versão | Tagline | Tamanho | Has Update |
|-----|--------|---------|---------|------------|
| Craft Anything | V0.6.1 | Descubra como qualquer software funciona... | 67 MB | ❌ |
| EffectCraft | V0.25.1 | Motion graphics e efeitos visuais | 67 MB | ✅ |
| FilmCraft | V0.20.1 | Edição de vídeo, cor e som | 85 MB | ❌ |
| WordCraft | V0.18.1 | Escritura e design de documentos | 45 MB | ❌ |
| AniCraft | V0.2.1 | Animação vetorial 2D | 15 MB | ❌ |
| CADCraft | V0.20.1 | Desenho técnico e projeto assistido por IA | 57 MB | ❌ |
| DeckCraft | V0.18.1 | Apresentações e slides | 79 MB | ❌ |
| DesignCraft | V0.21.1 | Diagramação de páginas e publicação | 103 MB | ❌ |

## 🛠️ Tecnologias Utilizadas

- **Godot Engine 4.2** - Motor de jogo open source
- **GDScript** - Linguagem de programação do Godot
- **HTTPRequest** - Para downloads e busca de dados
- **JSON** - Formato de dados para aplicativos e categorias

## 📥 Instalação

### Método 1: Pelo Batch (Windows)
```bash
# Basta clicar duas vezes no arquivo:
Jogar_Open_Source_Store.bat
```

### Método 2: Pelo Godot
1. Abra o **Godot Engine 4.2**
2. Clique em **Importar Projeto**
3. Selecione a pasta `Open source store`
4. Clique em **Executar**

## 📁 Estrutura do Projeto

```
Open source store/
├── 📄 project.godot              # Configuração do Godot 4
├── 📄 Jogar_Open_Source_Store.bat  # Script para executar (Windows)
├── 📄 README.md                   # Documentação completa
├── 📄 LICENSE                     # Licença MIT
├── 📄 .gitignore                 # Ignorar arquivos desnecessários
│
├── 📁 assets/
│   ├── 📁 fonts/                  # Fontes Inter
│   └── 📁 icons/                  # Ícones de apps e categorias
│       ├── craft_anything.png
│       ├── effectcraft.png
│       ├── filmcraft.png
│       ├── wordcraft.png
│       └── ... (outros ícones)
│
├── 📁 data/
│   ├── 📄 apps.json              # Lista de aplicativos
│   └── 📄 categories.json        # Lista de categorias
│
├── 📁 scenes/
│   ├── 📁 app/
│   │   └── 📄 app_detail.tscn    # Cena de detalhes
│   ├── 📁 store/
│   │   ├── 📄 app_card.tscn      # Card de aplicativo
│   │   ├── 📄 main_store.tscn    # Cena principal
│   │   └── 📄 store_content.tscn # Conteúdo da loja
│   └── 📁 ui/
│       ├── 📄 nav_bar.tscn       # Barra de navegação
│       └── 📄 top_bar.tscn       # Barra superior
│
└── 📁 scripts/
    ├── 📁 app/
    │   └── 📄 app_detail.gd      # Lógica de detalhes
    ├── 📁 autoload/
    │   ├── 📄 app_manager.gd     # Gerencia cenas
    │   ├── 📄 data_manager.gd    # Gerencia dados
    │   ├── 📄 download_manager.gd # Gerencia downloads
    │   └── 📄 theme_manager.gd   # Gerencia tema
    ├── 📁 store/
    │   ├── 📄 app_card.gd        # Lógica do card
    │   ├── 📄 main_store.gd      # Lógica principal
    │   └── 📄 store_content.gd   # Lógica de listagem
    └── 📁 ui/
        ├── 📄 nav_bar.gd         # Lógica da barra de navegação
        └── 📄 top_bar.gd         # Lógica da barra superior
```

## 📝 Como Personalizar

### 1. **Adicionar Novos Aplicativos**

Edite `data/apps.json` e adicione:

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
  "icon": "res://assets/icons/novapp.png",
  "github_url": "https://github.com/user/repo",
  "download_url": "https://github.com/user/repo/releases/download/v1.0.0/App.apk",
  "screenshots": ["url1", "url2"],
  "tags": ["tag1", "tag2"]
}
```

### 2. **Adicionar Novas Categorias**

Edite `data/categories.json`:

```json
{
  "name": "Nova Categoria",
  "icon": "res://assets/icons/icon.png",
  "description": "Descrição da categoria"
}
```

### 3. **Alterar o Tema**

No `ThemeManager` (`scripts/autoload/theme_manager.gd`):

```gdscript
# Para tema claro por padrão:
@export var current_theme: String = "light"

# Para tema escuro por padrão (padrão):
@export var current_theme: String = "dark"
```

Ou altere dinamicamente:

```gdscript
ThemeManager.apply_theme("light")  # Tema claro
ThemeManager.apply_theme("dark")   # Tema escuro
```

## 🔧 Configurações do Tema

As cores do tema escuro (ArtCraft style) estão em `scripts/autoload/theme_manager.gd`:

```gdscript
var dark_theme: Dictionary = {
    "background": Color(0.08, 0.08, 0.08),      # Fundo escuro
    "surface": Color(0.15, 0.15, 0.15),          # Superfície
    "surface_dark": Color(0.12, 0.12, 0.12),    # Superfície mais escura
    "text": Color(0.95, 0.95, 0.95),           # Texto claro
    "text_secondary": Color(0.7, 0.7, 0.7),     # Texto secundário
    "text_hint": Color(0.5, 0.5, 0.5),          # Texto fracamente visível
    "primary": Color(0.3, 0.7, 1.0)             # Azul claro para destaques
}
```

## 🎯 Funcionalidades Futuras (Sugestões)

- [ ] **Sistema de login** para sincronizar favoritos
- [ ] **Favoritos** - Marque seus apps preferidos
- [ ] **Histórico de downloads**
- [ ] **Notificações push** para novas versões
- [ ] **Filtro por licença** (MIT, GPL, etc.)
- [ ] **Busca por tags**
- [ ] **Instalação automática** de APKs
- [ ] **Atualização automática** de apps instalados
- [ ] **Exportar para Android/iOS**
- [ ] **Integração com GitHub API** para buscar apps automaticamente

## 🤝 Contribuindo

Contribuições são bem-vindas! Para contribuir:

1. Faça um fork do projeto
2. Crie uma branch com sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adicionando nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a **MIT License**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🙏 Agradecimentos

- À equipe do **ArtCraft** pela inspiração no design
- À comunidade **Godot** pelo ótimo motor de jogo open source
- A todos os desenvolvedores de **aplicativos open source**
- A todos que contribuírem com este projeto

---

📧 **Contato**: marlonferreira1800@gmail.com

🌐 **Inspirado por**: ArtCraft App Suite (https://artcraft.app)
