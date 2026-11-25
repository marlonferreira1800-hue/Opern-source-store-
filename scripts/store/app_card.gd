extends PanelContainer
## AppCard - Card de aplicativo no estilo ArtCraft

@onready var app_icon: TextureRect = $Panel/MarginContainer/VBoxContainer/HeaderHBox/AppIcon
@onready var version_badge: Label = $Panel/MarginContainer/VBoxContainer/HeaderHBox/VersionBadge
@onready var github_btn: Button = $Panel/MarginContainer/VBoxContainer/HeaderHBox/GitHubBtn
@onready var app_name: Label = $Panel/MarginContainer/VBoxContainer/AppName
@onready var app_tagline: Label = $Panel/MarginContainer/VBoxContainer/AppTagline
@onready var app_description: Label = $Panel/MarginContainer/VBoxContainer/AppDescription
@onready var info_label: Label = $Panel/MarginContainer/VBoxContainer/InfoLabel
@onready var download_size: Label = $Panel/MarginContainer/VBoxContainer/DownloadSize
@onready var open_btn: Button = $Panel/MarginContainer/VBoxContainer/ActionHBox/OpenBtn
@onready var more_btn: Button = $Panel/MarginContainer/VBoxContainer/ActionHBox/MoreBtn
@onready var update_btn: Button = $Panel/MarginContainer/VBoxContainer/ActionHBox/UpdateBtn
@onready var install_btn: Button = $Panel/MarginContainer/VBoxContainer/ActionHBox/InstallBtn

signal app_selected(app_id: String)
signal download_clicked(app_id: String)
signal github_clicked(app_url: String)
signal more_options_clicked(app_id: String)

var app_data: Dictionary = {}
var has_update: bool = false


func _ready() -> void:
	# Conectar botões
	if open_btn:
		open_btn.pressed.connect(_on_open_pressed)
	
	if more_btn:
		more_btn.pressed.connect(_on_more_pressed)
	
	if update_btn:
		update_btn.pressed.connect(_on_download_pressed)
	
	if install_btn:
		install_btn.pressed.connect(_on_download_pressed)
	
	if github_btn:
		github_btn.pressed.connect(_on_github_pressed)
	
	# Carregar dados
	update_card()


func update_card() -> void:
	if not app_data:
		return
	
	# Atualizar ícone
	if app_icon:
		var icon_path = app_data.get("icon", "res://assets/icons/app_default.png")
		if ResourceLoader.exists(icon_path):
			app_icon.texture = load(icon_path)
		else:
			# Tentar carregar da URL
			load_icon_from_url(app_data.get("icon_url", ""))
	
	# Atualizar versão
	if version_badge:
		version_badge.text = "V" + app_data.get("version", "1.0.0")
	
	# Atualizar nome
	if app_name:
		app_name.text = app_data.get("name", "Unknown App")
	
	# Atualizar tagline
	if app_tagline:
		app_tagline.text = app_data.get("tagline", app_data.get("description", "").substr(0, 50) + "...")
	
	# Atualizar descrição em português
	if app_description:
		app_description.text = app_data.get("description_pt", "")
		app_description.visible = not app_description.text.is_empty()
	
	# Atualizar info
	if info_label:
		var last_update = app_data.get("last_update", "")
		if last_update:
			info_label.text = "Última atualização: " + last_update
		else:
			info_label.text = "Última atualização: " + get_formatted_date()
	
	# Atualizar tamanho
	if download_size:
		download_size.text = "Tamanho do download: " + str(app_data.get("size_mb", 0)) + " MB"
	
	# Verificar se tem atualização
	has_update = app_data.get("has_update", false)
	update_buttons()


func get_formatted_date() -> String:
	# Retornar uma data formatada (simulação)
	return "11 de nov. de 2026"


func update_buttons() -> void:
	if has_update:
		# App tem atualização disponível
		if update_btn:
			update_btn.visible = true
		if install_btn:
			install_btn.visible = false
		if open_btn:
			open_btn.visible = true
		if app_name:
			app_name.add_theme_color_override("font_color", Color(1, 0.6, 0))  # Laranja para apps com atualização
	else:
		# App não instalado
		if update_btn:
			update_btn.visible = false
		if install_btn:
			install_btn.visible = true
		if open_btn:
			open_btn.visible = false
		if app_name:
			app_name.add_theme_color_override("font_color", Color(1, 1, 1))


func _on_open_pressed() -> void:
	app_selected.emit(app_data.get("id", ""))


func _on_more_pressed() -> void:
	more_options_clicked.emit(app_data.get("id", ""))


func _on_download_pressed() -> void:
	download_clicked.emit(app_data.get("id", ""))


func _on_github_pressed() -> void:
	var github_url = app_data.get("github_url", "")
	if github_url:
		github_clicked.emit(github_url)
	else:
		# Tentar usar o download_url como github
		github_clicked.emit(app_data.get("download_url", ""))


func set_has_update(value: bool) -> void:
	has_update = value
	update_buttons()


func set_downloading(downloading: bool) -> void:
	if install_btn:
		install_btn.disabled = downloading
		install_btn.text = "INSTALANDO..." if downloading else "DISPONÍVEL PARA INSTALAR"
	
	if update_btn:
		update_btn.disabled = downloading
		update_btn.text = "ATUALIZANDO..." if downloading else "ATUALIZAR"


func update_download_progress(progress: float) -> void:
	# Quando houver progresso, mostrar percentual
	if install_btn or update_btn:
		var btn = install_btn if install_btn.visible else update_btn
		if btn:
			btn.text = str(int(progress * 100)) + "%"


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
			# Redimensionar para 48x48
			image.resize(48, 48, Image.INTERPOLATE_BILINEAR)
			var texture = ImageTexture.new()
			texture.set_image(image)
			app_icon.texture = texture
