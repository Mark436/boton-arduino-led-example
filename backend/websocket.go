package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

// upgrader convierte una petición HTTP en WebSocket.
// Los buffers son pequeños porque los mensajes del protocolo son cortos.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// websocketHandler (GET /ws/{sessionID}?client={clientId}) sube la conexión a
// WebSocket y atiende en bucle los mensajes del cliente.
// Nota: el cliente debe existir (haber hecho join) antes de abrir el WS.
func (server *Server) websocketHandler(writer http.ResponseWriter, request *http.Request) {
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
	client, ok := session.Clients[clientID]

	if !ok {
		http.Error(writer, "Necesita unirse a la sesion", http.StatusNotAcceptable)
		session.Mutex.RUnlock()
		return
	}
	session.Mutex.RUnlock()

	connection, err := upgrader.Upgrade(writer, request, nil)

	if err != nil {
		log.Printf("Error al actualizar a WebSocket: %v", err)
		return
	}
	defer connection.Close()

	//crear conexión
	client.Mutex.Lock()
	client.Conn = connection
	client.Mutex.Unlock()
	
	session.Mutex.RLock()
	led:=session.Encendido
	arduino:=session.ArduinoConnectado
	maxViewers:=session.MaxViewers
	session.Mutex.RUnlock()
	
	client.send(mustMarshal(Mensaje{Tipo: "cambiarLED",Dato:mustMarshal(DatoLED{Encendido: led})}))
	client.send(mustMarshal(Mensaje{Tipo: "cambiarArduino",Dato:mustMarshal(DatoArduino{ArduinoConectado: arduino})}))
	client.send(mustMarshal(Mensaje{Tipo: "cambiarMaxViewers",Dato:mustMarshal(DatoMaxViewers{MaxViewers: maxViewers})}))

	defer func() {//finally para el websocket
		client.Mutex.Lock()
		if client.Conn == connection {
			client.Conn = nil
		}
		client.Mutex.Unlock()

		session.Mutex.Lock()
		delete(session.Clients,client.ID)
		session.Mutex.Unlock()
		
		session.emit(clientesMsg(session.visitors()),client.ID)// estoy casi seguro de que el client.id no es necesario porque ya no existe en session
	}()

	const (
    pongWait   = 30 * time.Second
    pingPeriod = 10 * time.Second
	)

	connection.SetReadDeadline(time.Now().Add(pongWait))
	connection.SetPongHandler(func(string) error {
		return connection.SetReadDeadline(time.Now().Add(pongWait))
	})
	
	go func() {
    ticker := time.NewTicker(pingPeriod)
    defer ticker.Stop()

    for range ticker.C {
        err := connection.WriteControl(
            websocket.PingMessage,
            nil,
            time.Now().Add(10*time.Second),
        )
        if err != nil {
            return
        }
    }
}()
	// ===================== HUECO 4a: DEADLINE DE LECTURA =======================
	// QUÉ: poner plazo a la lectura y usar ping/pong para detectar clientes muertos.
	// POR QUÉ: sin deadline, un TCP medio-abierto (se fue el wifi, cerró el
	//          portátil) deja este bucle esperando PARA SIEMPRE: goroutine viva y
	//          cupo retenido. El pong renueva la fecha mientras el cliente viva.
	// PISTA: define pongWait/pingPeriod en el paquete y, antes del for (o al
	//        inicio), instala el pong handler. El ticker de ping va en su propio
	//        goroutine para no bloquear la lectura.
	//
	// Esqueleto (descomenta y completa; requiere importar "time"):
	//
	//   const pongWait = 60 * time.Second
	//   connection.SetReadDeadline(time.Now().Add(pongWait))
	//   connection.SetPongHandler(func(string) error {
	//       return connection.SetReadDeadline(time.Now().Add(pongWait))
	//   })
	//   // go func() { ticker de pingPeriod -> connection.WriteControl(PingMessage, ...) }()
	// ===========================================================================

	for {
		_, message, err := connection.ReadMessage()
		if err != nil {
			log.Printf("Cliente %s desconectado", client.ID)
			break
		}

		// ===================== HUECO 3: NORMALIZAR EL MENSAJE ==================
		// QUÉ: validar/limpiar el JSON entrante ANTES del switch.
		// POR QUÉ: centralizas aquí las comprobaciones (tipo vacío, dato nulo…)
		//          y el switch queda limpio, sin repetir validaciones en cada case.
		// PISTA: tras el Unmarshal, si falta tipo o dato, haz `continue`.
		//
		// Esqueleto (descomenta y completa):
		//
		//   if formattedMessage.Tipo == "" || len(formattedMessage.Dato) == 0 {
		//       log.Println("Mensaje sin tipo o sin dato")
		//       continue
		//   }
		// =========================================================================
		var formattedMessage Mensaje
		if err := json.Unmarshal(message, &formattedMessage); err != nil {
			log.Println("Mensaje invalido")
			continue
		}

		log.Printf("Mensaje recibido de %s: %+v", client.ID, formattedMessage)

		// Patrón de cada case: (1) comprobar rol si aplica, (2) decodificar Dato
		// al tipo concreto, (3) actualizar la Session bajo Lock, (4) emit a todos
		// menos al emisor. Los que solo consultan (pedirClientes) usan send directo.
		switch formattedMessage.Tipo {
		case "cambiarLED":
			// Cualquier rol puede pedir el cambio del LED.
			var dato DatoLED
			if err := json.Unmarshal(formattedMessage.Dato, &dato); err != nil {
				log.Println("Dato LED inválido:", err)
				continue
			}
			session.Mutex.Lock()
			session.Encendido = dato.Encendido
			session.Mutex.Unlock()
			session.emit(formattedMessage, client.ID)

		case "cambiarArduino":
			// Solo el host controla la conexión física del Arduino.
			if client.Role != Host {
				continue
			}
			var dato DatoArduino
			if err := json.Unmarshal(formattedMessage.Dato, &dato); err != nil {
				log.Println("Dato Arduino inválido:", err)
				continue
			}
			session.Mutex.Lock()
			session.ArduinoConnectado = dato.ArduinoConectado
			session.Mutex.Unlock()
			session.emit(formattedMessage, client.ID)

		case "cambiarMaxViewers":
			// Solo el host cambia el límite.
			if client.Role != Host {
				continue
			}
			var dato DatoMaxViewers
			if err := json.Unmarshal(formattedMessage.Dato, &dato); err != nil {
				log.Println("Dato maxViewers inválido:", err)
				continue
			}
			if dato.MaxViewers < 1 {
				dato.MaxViewers = 1
			}
			session.Mutex.Lock()
			session.MaxViewers = dato.MaxViewers
			session.Mutex.Unlock()
			session.emit(formattedMessage, client.ID)

		case "pedirClientes":
			// Solo el host pide la lista de visitors.
			if client.Role != Host {
				continue
			}
			client.send(mustMarshal(clientesMsg(session.visitors())))

		case "expulsar":
			// Solo el host puede expulsar.
			if client.Role != Host {
				continue
			}
			var dato DatoExpulsar
			if err := json.Unmarshal(formattedMessage.Dato, &dato); err != nil {
				log.Println("Dato expulsar inválido:", err)
				continue
			}

			session.Mutex.Lock()
			target, ok := session.Clients[dato.ClientID]
			if ok && target.Role == Host { // no se puede expulsar al host
				ok = false
			}
			if ok {
				delete(session.Clients, dato.ClientID)
			}
			session.Mutex.Unlock()

			if ok {
				target.send(mustMarshal(expulsadoMsg()))
				target.Mutex.Lock()
				if target.Conn != nil {
					target.Conn.Close()
				}
				target.Mutex.Unlock()

				// Refresca la lista del host tras la expulsión.
				client.send(mustMarshal(clientesMsg(session.visitors())))
			}

		default:
			log.Printf("Tipo de mensaje desconocido: %s", formattedMessage.Tipo)
		}
	}
}
