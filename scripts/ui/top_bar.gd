extends Control
## TopBar - Barra superior da loja (estilo ArtCraft)

@onready var update_banner: PanelContainer = $UpdateBanner
@onready var update_button: Button = $UpdateBanner/Panel/UpdateHBox/UpdateButton
@onready var close_update: Button = $UpdateBanner/Panel/UpdateHBox/CloseUpdate
@onready var update_all_btn: Button = $MainBar/HBoxContainer/UpdateAllBtn
@onready var sort_btn: OptionButton = $MainBar/HBoxContainer/SortBtn
@onready var search_btn: Button = $MainBar/HBoxContainer/SearchBtn
@onready var menu_btn: Button = $MainBar/HBoxContainer/MenuBtn

signal search_requested(query: String)
signal sort_changed(sort_by: String)
signal menu_pressed
signal update_all_pressed


func _ready() -> void:
	# Conectar botões
	if update_button:
		update_button.pressed.connect(_on_update_pressed)
	
	if close_update:
		close_update.pressed.connect(_on_close_update)
	
	if update_all_btn:
		update_all_btn.pressed.connect(_on_update_all_pressed)
	
	if sort_btn:
		sort_btn.item_selected.connect(_on_sort_selected)
		# Adicionar opções de ordenação
		sort_btn.add_item("Nome (A-Z)")
		sort_btn.add_item("Nome (Z-A)")
		sort_btn.add_item("Mais recentes")
		sort_btn.add_item("Mais populares")
		sort_btn.add_item("Maior avaliação")
	
	if search_btn:
		search_btn.pressed.connect(_on_search_pressed)
	
	if menu_btn:
		menu_btn.pressed.connect(_on_menu_pressed)
	
	# Verificar se há atualizações
	AppManager.update_available.connect(_on_update_available)


func _on_update_pressed() -> void:
	# Atualizar e reiniciar
	update_banner.visible = false


func _on_close_update() -> void:
	update_banner.visible = false


func _on_update_all_pressed() -> void:
	update_all_pressed.emit()


func _on_sort_selected(index: int) -> void:
	var sort_by = ""
	match index:
		0:
			sort_by = "name_asc"
		1:
			sort_by = "name_desc"
		2:
			sort_by = "recent"
		3:
			sort_by = "popular"
		4:
			sort_by = "rating"
	
	sort_changed.emit(sort_by)


func _on_search_pressed() -> void:
	# Abrir tela de busca ou mostrar input
	# Por enquanto, emitir sinal para a store content
	search_requested.emit("")


func _on_menu_pressed() -> void:
	menu_pressed.emit()


func _on_update_available(count: int) -> void:
	if count > 0:
		update_banner.visible = true
		update_all_btn.text = "ATUALIZAR " + str(count) + " APLICATIVO" + ("S" if count > 1 else "")
		if count == 1:
			update_all_btn.text = "ATUALIZAR 1 APLICATIVO"
	else:
			update_all_btn.text = "ATUALIZAR " + str(count) + " APLICATIVOS"


func show_search_input() -> void:
	# Exibir input de busca (será implementado na cena principal)
	pass
