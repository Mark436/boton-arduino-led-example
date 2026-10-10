package app

import (
	"encoding/json"
	"log"
	"sync"
	"time"
)

// Session es una sala.
// - Encendido/ArduinoConnectado/MaxViewers: estado compartido (fuente de verdad).
// - Clients: TODOS los participantes, incluido el HOST.
// - HostDisconnectedAt: cuándo cayó el WS del host (zero = conectado/reconectado).
//   Lo usa el reaper para borrar salas abandonadas.
// - Mutex: protege el estado y el mapa Clients.
type Session struct {
	ID                string `json:"sessionId"`
	Encendido         bool   `json:"encendido"`
	ArduinoConnectado bool   `json:"arduinoConectado"`
	MaxViewers        int    `json:"maxViewers"`

	HostDisconnectedAt time.Time `json:"-"`

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

// hostConnected indica si el host tiene el WebSocket abierto. Se apoya en
// HostDisconnectedAt (zero = conectado) para no anidar locks de client + sesión.
func (session *Session) hostConnected() bool {
	session.Mutex.RLock()
	defer session.Mutex.RUnlock()
	return session.HostDisconnectedAt.IsZero()
}

// destroy echa a TODOS los visitors avisándoles con "expulsado" (motivo) y
// cierra sus conexiones. No toca al host (que es quien reinicia o el que ya
// está desconectado). La usa el endpoint de reset y el reaper.
func (session *Session) destroy(motivo string) {
	mensaje := mustMarshal(expulsadoMsg(motivo))

	session.Mutex.Lock()
	targets := make([]*Client, 0, len(session.Clients))
	for _, client := range session.Clients {
		if client == nil || client.Role == Host {
			continue
		}
		targets = append(targets, client)
	}
	session.Clients = map[string]*Client{}
	session.Mutex.Unlock()

	for _, target := range targets {
		target.send(mensaje)
		target.Mutex.Lock()
		if target.Conn != nil {
			target.Conn.Close()
		}
		target.Mutex.Unlock()
	}
}
