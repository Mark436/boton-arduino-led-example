package main

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
