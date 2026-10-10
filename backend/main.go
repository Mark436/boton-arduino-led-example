package main

import (
	"log"
	"net/http"
	"time"
)

// Configuración del reaper de sesiones abandonadas.
// Si el host lleva sessionTTL sin reconectar, la sala se borra y se expulsa a
// sus visitors. El ticker revisa cada reaperInterval (proporcional al TTL).
const (
	sessionTTL     = 90 * time.Second // 1.5 minutos
	reaperInterval = 30 * time.Second // TTL / 3
)

func main() {
	server := &Server{
		Sessions: make(map[string]*Session),
	}

	go server.reapSessions()

	mux := http.NewServeMux()

	// Frontend: HTML, CSS y JS estáticos (ver frontend.go)
	registerFrontend(mux)

	// Backend
	mux.HandleFunc("/session", server.createSession)
	mux.HandleFunc("/session/{sessionID}", server.joinSession)
	mux.HandleFunc("/session/{sessionID}/reset", server.resetSession)
	mux.HandleFunc("/ws/{sessionID}", server.websocketHandler)

	log.Println("Servidor iniciado")
	log.Println("Escuchando en el puerto 8080")

	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}

// reapSessions borra periódicamente las salas cuyo host lleve desconectado más
// de sessionTTL, avisando a los visitors que sigan dentro.
func (server *Server) reapSessions() {
	ticker := time.NewTicker(reaperInterval)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()

		server.Mutex.Lock()
		expiradas := make([]*Session, 0)
		for id, session := range server.Sessions {
			session.Mutex.RLock()
			caido := session.HostDisconnectedAt
			session.Mutex.RUnlock()

			if !caido.IsZero() && now.Sub(caido) > sessionTTL {
				delete(server.Sessions, id)
				expiradas = append(expiradas, session)
			}
		}
		server.Mutex.Unlock()

		for _, session := range expiradas {
			session.destroy("La sesión expiró")
		}
	}
}
