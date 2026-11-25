extends Node
## DataManager - Gerencia os dados dos aplicativos open source

signal apps_loaded(apps: Array)
signal categories_loaded(categories: Array)
signal search_results(results: Array)

@export var apps_data_path: String = "res://data/apps.json"
@export var categories_data_path: String = "res://data/categories.json"

var apps: Array = []
var categories: Array = []
var featured_apps: Array = []
var popular_apps: Array = []
var recent_apps: Array = []


func _ready() -> void:
	load_all_data()


func load_all_data() -> void:
	load_categories()
	load_apps()


func load_apps() -> void:
	var file = FileAccess.open(apps_data_path, FileAccess.READ)
	if file:
		var json = JSON.new()
		var parse_result = json.parse(file.get_as_text())
		if parse_result == OK:
			var data = json.get_data()
			if data is Array:
				apps = data
				featured_apps = apps.filter(func(app): return app.get("featured", false))
				popular_apps = apps.filter(func(app): return app.get("popular", false))
				recent_apps = apps.filter(func(app): return app.get("recent", false))
				apps_loaded.emit(apps)
		file.close()


func load_categories() -> void:
	var file = FileAccess.open(categories_data_path, FileAccess.READ)
	if file:
		var json = JSON.new()
		var parse_result = json.parse(file.get_as_text())
		if parse_result == OK:
			var data = json.get_data()
			if data is Array:
				categories = data
				categories_loaded.emit(categories)
		file.close()


func search_apps(query: String, category: String = "") -> Array:
	var results: Array = []
	var lower_query = query.to_lower()
	
	for app in apps:
		var name = app.get("name", "").to_lower()
		var description = app.get("description", "").to_lower()
		var tags = app.get("tags", [])
		var app_category = app.get("category", "")
		
		var matches_search = (name.find(lower_query) != -1 or 
		                    description.find(lower_query) != -1 or
		                    any(func(tag): return tag.to_lower().find(lower_query) != -1, tags))
		
		var matches_category = category.is_empty() or app_category == category
		
		if matches_search and matches_category:
			results.append(app)
	
	search_results.emit(results)
	return results


func get_app_by_id(app_id: String) -> Dictionary:
	for app in apps:
		if app.get("id", "") == app_id:
			return app
	return {}


func get_apps_by_category(category_name: String) -> Array:
	return apps.filter(func(app): return app.get("category", "") == category_name)


func get_featured_apps() -> Array:
	return featured_apps


func get_popular_apps() -> Array:
	return popular_apps


func get_recent_apps() -> Array:
	return recent_apps
