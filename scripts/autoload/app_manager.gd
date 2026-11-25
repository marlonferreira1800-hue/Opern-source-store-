extends Node
## AppManager - Gerenciador principal do Open Source Store
## Controla o fluxo do aplicativo e transições entre cenas

signal scene_changed(scene_name: String)
signal loading_started
signal loading_finished
signal update_available(count: int)

@export var current_scene: Node = null

var scenes_stack: Array = []
var is_loading: bool = false
var apps_to_update: int = 0


func _ready() -> void:
	# Inicializar o aplicativo com a cena principal
	change_scene("res://scenes/store/main_store.tscn")
	
	# Verificar atualizações (simulação)
	check_for_updates()


func check_for_updates() -> void:
	# Simular verificação de atualizações
	# Na versão real, isso viria de uma API
	var updates = 1  # Exemplo: 1 app com atualização disponível
	apps_to_update = updates
	update_available.emit(updates)


func change_scene(scene_path: String, transition: bool = true) -> void:
	if is_loading:
		return
	
	is_loading = true
	loading_started.emit()
	
	# Limpar a cena atual
	if current_scene:
		current_scene.queue_free()
		current_scene = null
	
	# Carregar a nova cena
	var new_scene = load(scene_path)
	if new_scene:
		current_scene = new_scene.instantiate()
		add_child(current_scene)
		
		# Emitir sinal de cena mudada
		var scene_name = scene_path.get_file().get_basename()
		scene_changed.emit(scene_name)
		
		# Adicionar ao histórico
		scenes_stack.append(scene_path)
		
		# Limitar o histórico a 10 cenas
		if scenes_stack.size() > 10:
			scenes_stack.remove_at(0)
	
	is_loading = false
	loading_finished.emit()


func go_back() -> void:
	if scenes_stack.size() <= 1:
		return
	
	scenes_stack.remove_at(scenes_stack.size() - 1)
	var previous_scene = scenes_stack[-1]
	change_scene(previous_scene, false)


func go_to_home() -> void:
	# Voltar para a tela inicial
	scenes_stack.clear()
	change_scene("res://scenes/store/main_store.tscn")


func get_apps_to_update() -> int:
	return apps_to_update
