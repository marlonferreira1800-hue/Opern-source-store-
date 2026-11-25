extends Node
## ThemeManager - Gerencia o tema visual do aplicativo
## Tema escuro por padrão (estilo ArtCraft)

signal theme_changed(theme_name: String)

@export var current_theme: String = "dark"

# Cores do tema claro
@export var light_theme: Dictionary = {
	"primary": Color(0.2, 0.6, 1.0),
	"secondary": Color(0.0, 0.4, 0.8),
	"accent": Color(1.0, 0.5, 0.0),
	"background": Color(0.95, 0.95, 0.95),
	"surface": Color(1.0, 1.0, 1.0),
	"surface_dark": Color(0.9, 0.9, 0.9),
	"text": Color(0.1, 0.1, 0.1),
	"text_secondary": Color(0.5, 0.5, 0.5),
	"text_hint": Color(0.7, 0.7, 0.7),
	"error": Color(0.9, 0.1, 0.1),
	"success": Color(0.1, 0.8, 0.1),
	"warning": Color(1.0, 0.7, 0.0),
	"card_bg": Color(1.0, 1.0, 1.0),
	"card_shadow": Color(0.0, 0.0, 0.0, 0.1),
	"border": Color(0.8, 0.8, 0.8)
}

# Cores do tema escuro (ArtCraft style)
@export var dark_theme: Dictionary = {
	"primary": Color(0.3, 0.7, 1.0),
	"secondary": Color(0.1, 0.5, 0.9),
	"accent": Color(1.0, 0.6, 0.1),
	"background": Color(0.08, 0.08, 0.08),
	"surface": Color(0.15, 0.15, 0.15),
	"surface_dark": Color(0.12, 0.12, 0.12),
	"text": Color(0.95, 0.95, 0.95),
	"text_secondary": Color(0.7, 0.7, 0.7),
	"text_hint": Color(0.5, 0.5, 0.5),
	"error": Color(1.0, 0.3, 0.3),
	"success": Color(0.2, 0.9, 0.2),
	"warning": Color(1.0, 0.8, 0.2),
	"card_bg": Color(0.15, 0.15, 0.15),
	"card_shadow": Color(0.0, 0.0, 0.0, 0.3),
	"border": Color(0.2, 0.2, 0.2)
}

var themes: Dictionary = {}


func _ready() -> void:
	# Inicializar dicionário de temas
	themes["light"] = light_theme
	themes["dark"] = dark_theme
	
	# Aplicar tema inicial (escuro por padrão)
	apply_theme(current_theme)


func apply_theme(theme_name: String) -> void:
	if not themes.has(theme_name):
		print("Tema não encontrado: ", theme_name)
		return
	
	current_theme = theme_name
	
	# Aplicar tema a todos os nodes que suportam
	var root = get_tree().root
	apply_theme_to_node(root, themes[theme_name])
	
	# Emitir sinal de tema mudado
	theme_changed.emit(theme_name)


func get_theme() -> Dictionary:
	return themes.get(current_theme, dark_theme)


func get_color(color_name: String) -> Color:
	var theme = get_theme()
	return theme.get(color_name, Color(1, 1, 1))


func toggle_theme() -> void:
	if current_theme == "light":
		apply_theme("dark")
	else:
		apply_theme("light")


func apply_theme_to_node(node: Node, theme: Dictionary) -> void:
	# Aplicar tema a Control nodes
	if node is Control:
		var control = node as Control
		
		# Para PanelContainer
		if control is PanelContainer:
			var panel = control as PanelContainer
			panel.add_theme_color_override("panel", theme.get("surface_dark", theme.get("surface", Color(0.15, 0.15, 0.15))))
		
		# Para Button
		if control is Button:
			var button = control as Button
			button.add_theme_color_override("normal", theme.get("surface", Color(0.2, 0.2, 0.2)))
			button.add_theme_color_override("hover", theme.get("surface_dark", Color(0.25, 0.25, 0.25)))
			button.add_theme_color_override("pressed", theme.get("primary", Color(0.3, 0.7, 1.0)))
			button.add_theme_color_override("font_color", theme.get("text", Color(1, 1, 1)))
			button.add_theme_color_override("font_pressed_color", theme.get("text", Color(1, 1, 1)))
			button.add_theme_color_override("font_hover_color", theme.get("text", Color(1, 1, 1)))
			button.add_theme_color_override("font_disabled_color", theme.get("text_hint", Color(0.5, 0.5, 0.5)))
		
		# Para OptionButton
		if control is OptionButton:
			var option_button = control as OptionButton
			option_button.add_theme_color_override("normal", theme.get("surface", Color(0.2, 0.2, 0.2)))
			option_button.add_theme_color_override("hover", theme.get("surface_dark", Color(0.25, 0.25, 0.25)))
			option_button.add_theme_color_override("pressed", theme.get("primary", Color(0.3, 0.7, 1.0)))
			option_button.add_theme_color_override("font_color", theme.get("text", Color(1, 1, 1)))
		
		# Para LineEdit
		if control is LineEdit:
			var line_edit = control as LineEdit
			line_edit.add_theme_color_override("font_color", theme.get("text", Color(1, 1, 1)))
			line_edit.add_theme_color_override("font_placeholder_color", theme.get("text_hint", Color(0.5, 0.5, 0.5)))
			
		# Para Label
		if control is Label:
			var label = control as Label
			label.add_theme_color_override("font_color", theme.get("text", Color(1, 1, 1)))
			label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0))
		
		# Para Panel
		if control is Panel:
			var panel = control as Panel
			panel.add_theme_color_override("panel", theme.get("surface_dark", Color(0.15, 0.15, 0.15)))
		
		# Para ProgressBar
		if control is ProgressBar:
			var progress_bar = control as ProgressBar
			progress_bar.add_theme_color_override("background", theme.get("surface", Color(0.2, 0.2, 0.2)))
			progress_bar.add_theme_color_override("fill", theme.get("primary", Color(0.3, 0.7, 1.0)))
		
		# Para ScrollContainer
		if control is ScrollContainer:
			var scroll = control as ScrollContainer
			scroll.add_theme_color_override("panel", theme.get("background", Color(0.08, 0.08, 0.08)))
	
	# Aplicar tema a todos os filhos
	for child in node.get_children():
		apply_theme_to_node(child, theme)
