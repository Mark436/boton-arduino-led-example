package main

import (
	"encoding/json"
	"log"
	"sync"
)

// Session es una sala.
// - Encendido/ArduinoConnectado/MaxViewers: estado compartido (fuente de verdad).
// - Clients: TODOS los participantes, incluido el HOST.
// - Mutex: protege el estado y el mapa Clients.
type Session struct {
	ID                string `json:"sessionId"`
	Encendido         bool   `json:"encendido"`
	ArduinoConnectado bool   `json:"arduinoConectado"`
	MaxViewers        int    `json:"maxViewers"`

	Clients map[string]*Client `json:"-"`
	Mutex   sync.RWMutex       `json:"-"`
}

// emit manda el mensaje a TODOS los clientes de la sesión MENOS a exceptID.
//   - Se pasa exceptID = id del emisor para no devolverle su propio cambio
//     (y, si es el host, evitar que escriba dos veces en el serial).
//   - Copia la lista bajo RLock y LUEGO envía: así no sostiene el lock de la
//     sesión mientras escribe por red (un cliente lento no bloquea a los demás).
func (session *Session) emit(mensaje any, exceptID string) {
	data, err := json.Marshal(mensaje)
	if err != nil {
		log.Println("Error al serializar mensaje:", err)
		return
	}

	session.Mutex.RLock()
	clients := make([]*Client, 0, len(session.Clients))
	for _, client := range session.Clients {
		if client == nil {
			continue
		}
		clients = append(clients, client)
	}
	session.Mutex.RUnlock()

	for _, client := range clients {
		if client.ID == exceptID {
			continue
		}
		client.send(data)
	}
}

// visitors devuelve los clientes que NO son host (lo que se lista y se expulsa).
// Ojo: no cuenta al host, tal como pediste.
func (session *Session) visitors() []DatoCliente {
	session.Mutex.RLock()
	defer session.Mutex.RUnlock()

	visitors := make([]DatoCliente, 0, len(session.Clients))
	for _, client := range session.Clients {
		if client == nil {
			continue
		}
		if client.Role == Host {
			continue
		}
		visitors = append(visitors, DatoCliente{ID: client.ID, Role: client.Role})
	}
	return visitors
}
