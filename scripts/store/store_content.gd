extends Control
## StoreContent - Conteúdo principal da loja com lista de aplicativos

@onready var grid_container: GridContainer = $ScrollContainer/GridContainer

@export var app_card_scene: PackedScene

var all_apps: Array = []
var displayed_apps: Array = []
var current_category: String = "Todos"
var current_sort: String = ""

signal app_selected(app_id: String)
signal app_download_started(app_id: String)


func _ready() -> void:
	# Carregar cena do card (se não carregada)
	if not app_card_scene:
		app_card_scene = preload("res://scenes/store/app_card.tscn")
	
	# Conectar sinais
	DataManager.apps_loaded.connect(_on_apps_loaded)
	DownloadManager.download_started.connect(_on_download_started)


func _on_apps_loaded(apps: Array) -> void:
	all_apps = apps
	# Aplicar sort inicial
	sort_apps("name_asc")
	update_apps(apps)


func update_apps(apps: Array) -> void:
	all_apps = apps
	
	if current_category == "Todos":
		displayed_apps = all_apps
	else:
		displayed_apps = DataManager.get_apps_by_category(current_category)
	
	# Aplicar sort
	if current_sort != "":
		sort_apps(current_sort)
	
	display_apps()


func display_apps() -> void:
	# Limpar grid
	for child in grid_container.get_children():
		child.queue_free()
	
	# Adicionar cards de aplicativos
	for app in displayed_apps:
		var card = app_card_scene.instantiate()
		card.app_data = app
		card.connect("app_selected", _on_app_selected)
		card.connect("download_clicked", _on_download_clicked)
		card.connect("github_clicked", _on_github_clicked)
		card.connect("more_options_clicked", _on_more_options)
		
		# Verificar se tem atualização
		card.set_has_update(app.get("has_update", false))
		
		grid_container.add_child(card)


func search_apps(query: String) -> void:
	var results = DataManager.search_apps(query)
	displayed_apps = results
	display_apps()


func show_category(category: String) -> void:
	current_category = category
	
	if category == "Todos":
		displayed_apps = all_apps
	else:
		displayed_apps = DataManager.get_apps_by_category(category)
	
	# Reaplicar sort
	if current_sort != "":
		sort_apps(current_sort)
	
	display_apps()


func sort_apps(sort_by: String) -> void:
	current_sort = sort_by
	
	var comparator = null
	
	match sort_by:
		"name_asc":
			comparator = func(a, b): return a.get("name", "").to_lower() < b.get("name", "").to_lower()
		"name_desc":
			comparator = func(a, b): return a.get("name", "").to_lower() > b.get("name", "").to_lower()
		"recent":
			comparator = func(a, b): return a.get("recent", false) and not b.get("recent", false)
		"popular":
			comparator = func(a, b): return a.get("downloads", 0) > b.get("downloads", 0)
		"rating":
			comparator = func(a, b): return a.get("rating", 0) > b.get("rating", 0)
		_:
			comparator = func(a, b): return a.get("name", "").to_lower() < b.get("name", "").to_lower()
	
	if comparator:
		displayed_apps.sort_custom(comparator)
	
	# Redisplay
	display_apps()


func _on_app_selected(app_id: String) -> void:
	app_selected.emit(app_id)


func _on_download_clicked(app_id: String) -> void:
	var app = DataManager.get_app_by_id(app_id)
	if app:
		DownloadManager.download_app(app_id, app)
		app_download_started.emit(app_id)


func _on_github_clicked(url: String) -> void:
	if url:
		# Abrir URL no navegador
		OS.shell_open(url)


func _on_more_options(app_id: String) -> void:
	# Mostrar menu de opções
	print("More options for app: ", app_id)


func _on_download_started(app_id: String, app_name: String) -> void:
	# Atualizar UI para mostrar download em andamento
	for child in grid_container.get_children():
		if child is AppCard and child.app_data.get("id", "") == app_id:
			child.set_downloading(true)
