package app

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/google/uuid"
)

// Server es el registro global de sesiones. Su Mutex protege el mapa y nunca se
// sostiene mientras se opera dentro de una Session (para no encadenar locks).
type Server struct {
	Sessions map[string]*Session
	Mutex    sync.RWMutex
}

// NewServer crea el registro de sesiones vacío.
func NewServer() *Server {
	return &Server{
		Sessions: make(map[string]*Session),
	}
}

// RegisterRoutes monta en el mux el frontend y las rutas del backend.
func (server *Server) RegisterRoutes(mux *http.ServeMux) {
	// Frontend: HTML, CSS y JS estáticos (ver frontend.go)
	registerFrontend(mux)

	// Backend
	mux.HandleFunc("/session", server.createSession)
	mux.HandleFunc("/session/{sessionID}", server.joinSession)
	mux.HandleFunc("/session/{sessionID}/reset", server.resetSession)
	mux.HandleFunc("/ws/{sessionID}", server.websocketHandler)
}

// createSession (POST /session) crea la sala y a su HOST.
// Body opcional: {encendido, arduinoConectado, maxViewers}.
// Devuelve {sessionId, clientId}: el clientId del host, que el frontend guarda
// y usa después para abrir el WebSocket.
func (server *Server) createSession(writer http.ResponseWriter, request *http.Request) {
	// EN ESTA FUNC SE AGREGA EL TOKEN DE SESION SI LO AUTENTICAMOS
	if request.Method != http.MethodPost {
		http.Error(writer, "Metodo no permitido", http.StatusMethodNotAllowed)
		return
	}

	var datos struct {
		Encendido         bool `json:"encendido"`
		ArduinoConnectado bool `json:"arduinoConectado"`
		MaxViewers        *int `json:"maxViewers"`
	}

	err := json.NewDecoder(request.Body).Decode(&datos)
	if err != nil {
		http.Error(writer, "JSON invalido", http.StatusBadRequest)
		return
	}

	maxViewers := 1
	if datos.MaxViewers != nil && *datos.MaxViewers > maxViewers {
		maxViewers = *datos.MaxViewers
	}

	host := &Client{
		ID:   uuid.New().String(),
		Role: Host,
	}
	session := &Session{
		ID:                uuid.New().String(),
		Encendido:         datos.Encendido,
		ArduinoConnectado: datos.ArduinoConnectado,
		MaxViewers:        maxViewers,
		Clients:           map[string]*Client{host.ID: host},
	}

	server.Mutex.Lock()
	server.Sessions[session.ID] = session
	server.Mutex.Unlock()

	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(map[string]string{
		"sessionId": session.ID,
		"clientId":  host.ID,
	})
}

// joinSession (POST /session/{sessionID}) mete a un VISITOR en la sala.
// Aplica el cupo: los visitors no pueden pasar de MaxViewers.
// Devuelve {sessionId, clientId, ledEncendido, arduinoConectado, maxViewers}
// para que el invitado pinte el estado sin esperar al WebSocket.
func (server *Server) joinSession(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(writer, "Metodo no permitido", http.StatusMethodNotAllowed)
		return
	}
	sessionID := request.PathValue("sessionID")

	server.Mutex.RLock()
	session, ok := server.Sessions[sessionID]
	server.Mutex.RUnlock()

	if !ok {
		http.Error(writer, "Sesion no encontrada", http.StatusNotFound)
		return
	}

	session.Mutex.Lock()

	if len(session.Clients)-1 >= session.MaxViewers { //ya estan todos los visitors
		http.Error(writer, "Sesion llena", http.StatusNotAcceptable)
		session.Mutex.Unlock()
		return
	}

	clientID := uuid.New().String()
	client := &Client{
		ID:   clientID,
		Role: Visitor,
	}
	session.Clients[clientID] = client

	ledEncendido := session.Encendido
	arduinoConectado := session.ArduinoConnectado
	maxViewers := session.MaxViewers
	session.Mutex.Unlock()

	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(map[string]any{
		"sessionId":        sessionID,
		"clientId":         clientID,
		"ledEncendido":     ledEncendido,
		"arduinoConectado": arduinoConectado,
		"maxViewers":       maxViewers,
	})
}

// resetSession (POST /session/{sessionID}/reset?client={clientId}) reinicia la
// sesión del host: expulsa a todos los visitors de la sala vieja, la borra y
// crea una nueva conservando el estado (LED, Arduino y maxViewers). Devuelve
// los IDs nuevos para que el host reconecte. Solo el host puede llamarlo.
func (server *Server) resetSession(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(writer, "Metodo no permitido", http.StatusMethodNotAllowed)
		return
	}
	sessionID := request.PathValue("sessionID")
	clientID := request.URL.Query().Get("client")

	server.Mutex.RLock()
	session, ok := server.Sessions[sessionID]
	server.Mutex.RUnlock()

	if !ok {
		http.Error(writer, "Sesion no encontrada", http.StatusNotFound)
		return
	}

	session.Mutex.RLock()
	host, ok := session.Clients[clientID]
	isHost := ok && host != nil && host.Role == Host
	encendido := session.Encendido
	arduino := session.ArduinoConnectado
	maxViewers := session.MaxViewers
	session.Mutex.RUnlock()

	if !isHost {
		http.Error(writer, "Solo el host puede reiniciar la sesion", http.StatusForbidden)
		return
	}

	// Saca la sala vieja del registro y expulsa a sus visitors.
	server.Mutex.Lock()
	delete(server.Sessions, sessionID)
	server.Mutex.Unlock()
	session.destroy("La sesión fue cerrada por el host")

	// Crea la nueva sala conservando el estado anterior.
	newHost := &Client{
		ID:   uuid.New().String(),
		Role: Host,
	}
	newSession := &Session{
		ID:                uuid.New().String(),
		Encendido:         encendido,
		ArduinoConnectado: arduino,
		MaxViewers:        maxViewers,
		Clients:           map[string]*Client{newHost.ID: newHost},
	}

	server.Mutex.Lock()
	server.Sessions[newSession.ID] = newSession
	server.Mutex.Unlock()

	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(map[string]string{
		"sessionId": newSession.ID,
		"clientId":  newHost.ID,
	})
}
