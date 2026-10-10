package app

import (
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Client es un participante de una sesión.
// - ID: se devuelve al frontend y es la clave en Session.Clients.
// - Conn: el WebSocket; es nil hasta que el frontend abre /ws (el join es HTTP).
// - Role: HOST o VISITOR; define los permisos en el switch.
// - Mutex: protege Conn; una conexión NO admite escrituras concurrentes.
type Client struct {
	ID    string          `json:"clientId"`
	Conn  *websocket.Conn `json:"-"`
	Role  Role            `json:"-"`
	Mutex sync.RWMutex    `json:"-"`
}

func (client *Client) send(data []byte) {
	client.Mutex.Lock()
	defer client.Mutex.Unlock()

	if client.Conn == nil {
		return
	}

	const writeWait = 10 * time.Second

	client.Conn.SetWriteDeadline(time.Now().Add(writeWait))
	if err := client.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("Error enviando mensaje a %s: %v", client.ID, err)
	}
}
