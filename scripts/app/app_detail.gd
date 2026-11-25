extends Control
## AppDetail - Cena de detalhes do aplicativo

@onready var back_button: Button = $TopBar/HBoxContainer/BackButton
@onready var app_icon: TextureRect = $ScrollContainer/VBoxContainer/Header/AppIcon
@onready var app_name: Label = $ScrollContainer/VBoxContainer/Header/AppInfo/AppName
@onready var app_category: Label = $ScrollContainer/VBoxContainer/Header/AppInfo/AppCategory
@onready var rating_stars: Label = $ScrollContainer/VBoxContainer/Header/AppInfo/AppRating/RatingStars
@onready var rating_count: Label = $ScrollContainer/VBoxContainer/Header/AppInfo/AppRating/RatingCount
@onready var download_button: Button = $ScrollContainer/VBoxContainer/Header/DownloadButton
@onready var app_description: Label = $ScrollContainer/VBoxContainer/AppDescription
@onready var version_value: Label = $ScrollContainer/VBoxContainer/Details/VersionValue
@onready var size_value: Label = $ScrollContainer/VBoxContainer/Details/SizeValue
@onready var license_value: Label = $ScrollContainer/VBoxContainer/Details/LicenseValue
@onready var author_value: Label = $ScrollContainer/VBoxContainer/Details/AuthorValue
@onready var screenshot1: TextureRect = $ScrollContainer/VBoxContainer/Screenshots/Screenshot1
@onready var screenshot2: TextureRect = $ScrollContainer/VBoxContainer/Screenshots/Screenshot2
@onready var screenshot3: TextureRect = $ScrollContainer/VBoxContainer/Screenshots/Screenshot3

signal back_pressed
signal download_clicked(app_id: String)

var app_id: String = ""


func _ready() -> void:
	# Conectar botão voltar
	if back_button:
		back_button.pressed.connect(_on_back_pressed)
	
	# Conectar botão download
	if download_button:
		download_button.pressed.connect(_on_download_pressed)
	
	# Carregar dados
	update_detail()


func set_app(app_data: Dictionary) -> void:
	app_id = app_data.get("id", "")
	update_detail()


func update_detail() -> void:
	if app_id.is_empty():
		return
	
	var app = DataManager.get_app_by_id(app_id)
	if not app:
		return
	
	# Atualizar ícone
	if app_icon:
		var icon_path = app.get("icon", "res://assets/icons/app_default.png")
		if ResourceLoader.exists(icon_path):
			app_icon.texture = load(icon_path)
		else:
			load_icon_from_url(app.get("icon_url", ""))
	
	# Atualizar nome
	if app_name:
		app_name.text = app.get("name", "Unknown App")
	
	# Atualizar categoria
	if app_category:
		app_category.text = app.get("category", "Various")
	
	# Atualizar rating
	if rating_stars:
		var rating = app.get("rating", 5.0)
		var stars = ""
		for i in range(5):
			if i < floor(rating):
				stars += "⭐"
			elif i < rating:
				stars += "★"
			else:
				stars += "☆"
		rating_stars.text = stars
	
	if rating_count:
		rating_count.text = "(" + str(app.get("downloads", 0)) + " downloads)"
	
	# Atualizar descrição
	if app_description:
		app_description.text = app.get("description", "No description available")
	
	# Atualizar detalhes
	if version_value:
		version_value.text = app.get("version", "1.0.0")
	
	if size_value:
		var size_mb = app.get("size_mb", 10)
		size_value.text = str(size_mb) + " MB"
	
	if license_value:
		license_value.text = app.get("license", "MIT")
	
	if author_value:
		author_value.text = app.get("author", "Unknown")
	
	# Atualizar screenshots
	load_screenshots(app)


func _on_back_pressed() -> void:
	back_pressed.emit()


func _on_download_pressed() -> void:
	download_clicked.emit(app_id)


func load_icon_from_url(url: String) -> void:
	if url.is_empty():
		return
	
	var http_request = HTTPRequest.new()
	add_child(http_request)
	
	http_request.request_completed.connect(_on_icon_loaded.bind(url))
	
	var headers = ["Accept: image/png"]
	http_request.request(url, headers, true, HTTPClient.METHOD_GET)


func _on_icon_loaded(url: String, result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200 and body.size() > 0:
		var image = Image.new()
		if image.load_png_from_buffer(body):
			image.resize(120, 120, Image.INTERPOLATE_BILINEAR)
			var texture = ImageTexture.new()
			texture.set_image(image)
			app_icon.texture = texture


func load_screenshots(app: Dictionary) -> void:
	var screenshots = app.get("screenshots", [])
	
	# Limpar screenshots antigos
	if screenshot1:
		screenshot1.texture = null
	if screenshot2:
		screenshot2.texture = null
	if screenshot3:
		screenshot3.texture = null
	
	# Carregar até 3 screenshots
	for i in range(min(screenshots.size(), 3)):
		var screenshot_url = screenshots[i]
		var texture_rect = null
		
		match i:
			0:
				texture_rect = screenshot1
			1:
				texture_rect = screenshot2
			2:
				texture_rect = screenshot3
		
		if texture_rect:
			load_screenshot_from_url(texture_rect, screenshot_url)


func load_screenshot_from_url(texture_rect: TextureRect, url: String) -> void:
	if url.is_empty():
		return
	
	var http_request = HTTPRequest.new()
	add_child(http_request)
	
	http_request.request_completed.connect(_on_screenshot_loaded.bind(texture_rect, url))
	
	var headers = ["Accept: image/png"]
	http_request.request(url, headers, true, HTTPClient.METHOD_GET)


func _on_screenshot_loaded(texture_rect: TextureRect, url: String, result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200 and body.size() > 0:
		var image = Image.new()
		if image.load_png_from_buffer(body):
			# Redimensionar mantendo proporção
			var max_width = 200
			var max_height = 350
			var scale = min(float(max_width) / image.get_width(), float(max_height) / image.get_height())
			image.resize(image.get_width() * scale, image.get_height() * scale, Image.INTERPOLATE_BILINEAR)
			
			var texture = ImageTexture.new()
			texture.set_image(image)
			texture_rect.texture = texture
