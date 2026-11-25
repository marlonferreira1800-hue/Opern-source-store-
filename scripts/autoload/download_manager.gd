extends Node
## DownloadManager - Gerencia downloads de APKs

signal download_started(app_id: String, app_name: String)
signal download_progress(app_id: String, progress: float)
signal download_completed(app_id: String, file_path: String)
signal download_failed(app_id: String, error: String)
signal download_cancelled(app_id: String)

@export var download_folder: String = "user://downloads/"
@export var max_simultaneous_downloads: int = 3

var active_downloads: Dictionary = {}
var download_queue: Array = []


func _ready() -> void:
	# Criar pasta de downloads
	var dir = DirAccess.open(download_folder)
	if not dir:
		DirAccess.make_dir_abs(download_folder)


func download_app(app_id: String, app_data: Dictionary) -> void:
	var app_name = app_data.get("name", "Unknown")
	var download_url = app_data.get("download_url", "")
	
	if download_url.is_empty():
		download_failed.emit(app_id, "URL de download não encontrada")
		return
	
	# Verificar se já está na fila ou em download
	if active_downloads.has(app_id) or download_queue.has(app_id):
		return
	
	# Criar request de download
	var download_request = {
		"app_id": app_id,
		"app_name": app_name,
		"download_url": download_url,
		"file_name": app_name.to_lower().replace(" ", "_") + ".apk"
	}
	
	# Se tiver espaço para download simultâneo
	if active_downloads.size() < max_simultaneous_downloads:
		start_download(download_request)
	else:
		# Adicionar à fila
		download_queue.append(download_request)
		await download_queue.size() > 0
		# Processar fila quando houver espaço
		process_queue()


func start_download(download_request: Dictionary) -> void:
	var app_id = download_request["app_id"]
	var app_name = download_request["app_name"]
	var download_url = download_request["download_url"]
	var file_name = download_request["file_name"]
	
	var http_request = HTTPRequest.new()
	add_child(http_request)
	
	active_downloads[app_id] = {
		"http_request": http_request,
		"app_name": app_name,
		"file_name": file_name,
		"bytes_received": 0,
		"file_path": download_folder + file_name
	}
	
	download_started.emit(app_id, app_name)
	
	# Configurar o download
	http_request.request_completed.connect(_on_download_completed.bind(app_id))
	http_request.download_progress.connect(_on_download_progress.bind(app_id))
	http_request.download_buffer_full.connect(_on_download_buffer_full.bind(app_id))
	
	# Iniciar o download
	var headers = ["Accept: application/octet-stream"]
	http_request.request(download_url, headers, true, HTTPClient.METHOD_GET)


func _on_download_progress(app_id: String, bytes_downloaded: int, total_bytes: int) -> void:
	if active_downloads.has(app_id):
		var download_info = active_downloads[app_id]
		
		# Atualizar bytes recebidos
		download_info["bytes_received"] = bytes_downloaded
		
		# Calcular progresso (evitar divisão por zero)
		var progress: float = 0.0
		if total_bytes > 0:
			progress = float(bytes_downloaded) / float(total_bytes)
		
		download_progress.emit(app_id, progress)


func _on_download_buffer_full(app_id: String, buffer: PackedByteArray) -> void:
	if active_downloads.has(app_id):
		var download_info = active_downloads[app_id]
		var file = FileAccess.open(download_info["file_path"], FileAccess.WRITE)
		if file:
			file.seek_end()
			file.write_buffer(buffer)
			file.close()


func _on_download_completed(app_id: String, result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if not active_downloads.has(app_id):
		return
	
	var download_info = active_downloads[app_id]
	
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
		# Download concluído com sucesso
		var file = FileAccess.open(download_info["file_path"], FileAccess.WRITE)
		if file:
			file.write_buffer(body)
			file.close()
			download_completed.emit(app_id, download_info["file_path"])
	else:
		# Download falhou
		var error_msg = "Erro ao fazer download"
		if result == HTTPRequest.RESULT_CANT_RESOLVE:
			error_msg = "Não foi possível resolver o endereço"
		elif result == HTTPRequest.RESULT_CANT_CONNECT:
			error_msg = "Não foi possível conectar ao servidor"
		elif result == HTTPRequest.RESULT_SSL_HANDSHAKE_ERROR:
			error_msg = "Erro de SSL"
		elif result == HTTPRequest.RESULT_TIMEOUT:
			error_msg = "Tempo esgotado"
		elif response_code != 200:
			error_msg = "HTTP Error: " + str(response_code)
		
		download_failed.emit(app_id, error_msg)
	
	# Remover do dicionário de downloads ativos
	active_downloads.erase(app_id)
	
	# Processar próxima fila
	process_queue()


func cancel_download(app_id: String) -> void:
	if active_downloads.has(app_id):
		var download_info = active_downloads[app_id]
		if download_info.has("http_request"):
			var http_request = download_info["http_request"]
			http_request.close()
			
		# Remover arquivo parcialmente baixado
		if FileAccess.file_exists(download_info["file_path"]):
			DirAccess.remove_absolute(download_info["file_path"])
		
		active_downloads.erase(app_id)
		download_cancelled.emit(app_id)
		
		# Processar próxima fila
		process_queue()


func process_queue() -> void:
	# Remover downloads concluídos da fila
	for i in range(download_queue.size() - 1, -1, -1):
		if active_downloads.has(download_queue[i]["app_id"]):
			download_queue.remove_at(i)
	
	# Iniciar novos downloads se houver espaço
	while download_queue.size() > 0 and active_downloads.size() < max_simultaneous_downloads:
		var next_download = download_queue.pop_front()
		start_download(next_download)


func get_download_info(app_id: String) -> Dictionary:
	return active_downloads.get(app_id, {})


func is_downloading(app_id: String) -> bool:
	return active_downloads.has(app_id)


func is_in_queue(app_id: String) -> bool:
	for request in download_queue:
		if request["app_id"] == app_id:
			return true
	return false
