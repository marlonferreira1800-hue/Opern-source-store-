extends Control
## NavBar - Barra de navegação com categorias

@onready var scroll_container: ScrollContainer = $ScrollContainer
@onready var hbox: HBoxContainer = $ScrollContainer/HBoxContainer

signal category_selected(category: String)

var category_buttons: Dictionary = {}
var current_category: String = "Todos"


func _ready() -> void:
	# Conectar botão "Todos"
	var all_button: Button = $ScrollContainer/HBoxContainer/AllButton
	if all_button:
		all_button.pressed.connect(_on_category_pressed.bind("Todos"))


func update_categories(categories: Array) -> void:
	# Limpar categorias antigas (exceto "Todos")
	for child in hbox.get_children():
		if child.name != "AllButton":
			child.queue_free()
		category_buttons.clear()
	
	# Adicionar botões para cada categoria
	for category in categories:
		var category_name = category.get("name", "")
		var button = Button.new()
		button.text = category_name
		button.flat = true
		button.name = category_name
		
		# Adicionar margens
		button.add_theme_constant_override("margin_left", 5)
		button.add_theme_constant_override("margin_right", 5)
		button.add_theme_constant_override("margin_top", 5)
		button.add_theme_constant_override("margin_bottom", 5)
		
		button.pressed.connect(_on_category_pressed.bind(category_name))
		
		hbox.add_child(button)
		category_buttons[category_name] = button


func _on_category_pressed(category_name: String) -> void:
	current_category = category_name
	category_selected.emit(category_name)
	
	# Atualizar estado visual dos botões
	for button_name in category_buttons:
		var button = category_buttons[button_name]
		button.button_pressed = (button_name == category_name)
	
	# Also update AllButton
	var all_button: Button = $ScrollContainer/HBoxContainer/AllButton
	if all_button:
		all_button.button_pressed = (category_name == "Todos")


func select_category(category_name: String) -> void:
	_on_category_pressed(category_name)
