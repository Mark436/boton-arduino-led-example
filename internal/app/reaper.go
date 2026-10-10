package app

import (
	"time"
)

// Configuración del reaper de sesiones abandonadas.
// Si el host lleva sessionTTL sin reconectar, la sala se borra y se expulsa a
// sus visitors. El ticker revisa cada reaperInterval (proporcional al TTL).
const (
	sessionTTL     = 90 * time.Second // 1.5 minutos
	reaperInterval = 30 * time.Second // TTL / 3
)

// ReapSessions borra periódicamente las salas cuyo host lleve desconectado más
// de sessionTTL, avisando a los visitors que sigan dentro.
func (server *Server) ReapSessions() {
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
