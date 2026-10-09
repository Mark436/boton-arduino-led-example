package main

import (
	"log"
	"sync"

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

// ===================== HUECO 4b: DEADLINE DE ESCRITURA =======================
// QUÉ: poner un plazo de tiempo a la escritura antes de WriteMessage.
// POR QUÉ: send tiene el mutex del cliente. Si el cliente es lento, WriteMessage
// se queda colgado, el mutex no se suelta y se bloquea el broadcast a TODOS.
// El deadline corta la escritura y libera el mutex.
// PISTA: define una constante, p.ej. writeWait = 10 * time.Second, y añade
// justo antes de WriteMessage (recuerda importar "time"):
// CODE: client.Conn.SetWriteDeadline(time.Now().Add(writeWait))
// Si el deadline vence, WriteMessage devuelve error y ya lo logueas abajo.
// =============================================================================
func (client *Client) send(data []byte) {
	client.Mutex.Lock()
	defer client.Mutex.Unlock()

	if client.Conn == nil {
		return
	}
	if err := client.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("Error enviando mensaje a %s: %v", client.ID, err)
	}
}
