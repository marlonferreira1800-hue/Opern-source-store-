extends Control
## MainStore - Cena principal da loja Open Source (estilo ArtCraft)

@onready var top_bar: Control = $TopBar
@onready var nav_bar: Control = $NavBar
@onready var store_content: Control = $StoreContent

signal category_selected(category: String)
signal search_requested(query: String)
signal sort_changed(sort_by: String)


func _ready() -> void:
	# Conectar sinais
	if nav_bar:
		nav_bar.connect("category_selected", _on_category_selected)
	
	if top_bar:
		top_bar.connect("search_requested", _on_search_requested)
		top_bar.connect("sort_changed", _on_sort_changed)
		top_bar.connect("update_all_pressed", _on_update_all)
	
	# Carregar dados iniciais
	DataManager.apps_loaded.connect(_on_apps_loaded)
	DataManager.categories_loaded.connect(_on_categories_loaded)


func _on_category_selected(category: String) -> void:
	category_selected.emit(category)
	if store_content:
		store_content.show_category(category)


func _on_search_requested(query: String) -> void:
	search_requested.emit(query)
	if store_content:
		store_content.search_apps(query)


func _on_sort_changed(sort_by: String) -> void:
	sort_changed.emit(sort_by)
	if store_content:
		store_content.sort_apps(sort_by)


func _on_update_all() -> void:
	# Atualizar todos os apps
	var apps = DataManager.apps
	for app in apps:
		if app.get("has_update", false):
			DownloadManager.download_app(app.get("id", ""), app)


func _on_apps_loaded(apps: Array) -> void:
	print("Aplicativos carregados: ", apps.size())
	if store_content:
		store_content.update_apps(apps)


func _on_categories_loaded(categories: Array) -> void:
	print("Categorias carregadas: ", categories.size())
