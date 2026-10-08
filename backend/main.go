package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Mensaje struct {
	Tipo string `json:"tipo"`
	Dato json.RawMessage `json:"dato"`
}

type Role string

const (
	Owner  Role = "OWNER"
	Viewer Role = "VIEWER"
)

type Client struct {
  ID   string `json:"clientId"`
  Conn *websocket.Conn `json:"-"`
  Role Role `json:"-"`
}

type Session struct {
	ID                 string `json:"sessionId"`
  Encendido          bool   `json:"encendido"`
  ArduinoConnectado  bool   `json:"arduinoConectado"`
  MaxViewers         int    `json:"maxViewers"`
	
	Clients    map[string]*Client `json:"-"`
	Mutex sync.RWMutex `json:"-"`
}

type Server struct {
	Sessions map[string]*Session
	Mutex sync.RWMutex
}

func (server*Server) createSession(writer http.ResponseWriter, request *http.Request){
	//EN ESTA FUNC SE AGREGA EL TOKEN DE SESION SI LO AUTENTICAMOS
	if request.Method !=http.MethodPost{
		http.Error(writer,"Metodo no permitido", http.StatusMethodNotAllowed)
		return;
	}

	var datos struct {
  	Encendido          bool   `json:"encendido"`
  	ArduinoConnectado  bool   `json:"arduinoConectado"`
  	MaxViewers         *int    `json:"maxViewers"`
	}

	err:=json.NewDecoder(request.Body).Decode(&datos)
	if err!=nil{
		http.Error(writer,"JSON invalido",http.StatusBadRequest)
		return
	}
	
	maxViewers:=1
	if datos.MaxViewers != nil && *datos.MaxViewers > maxViewers{
		maxViewers=*datos.MaxViewers
	}

	owner:=&Client{
		ID:uuid.New().String(),
		Role: Owner,
	}
	session:= &Session{
		ID:uuid.New().String(),
		Encendido: datos.Encendido,
		ArduinoConnectado: datos.ArduinoConnectado,
		MaxViewers: maxViewers,
		Clients: map[string]*Client{owner.ID:owner},
	}

	server.Mutex.Lock()
	server.Sessions[session.ID]=session
	server.Mutex.Unlock()

	writer.Header().Set("Content-Type","application/json")
	json.NewEncoder(writer).Encode(map[string]string{
		"sessionId":session.ID,
		"clientId":owner.ID,
	})
}
func (server *Server) joinSession(writer http.ResponseWriter,request *http.Request) {
  if request.Method != http.MethodPost {
    http.Error(writer, "Metodo no permitido", http.StatusMethodNotAllowed)
    return
  }	
	sessionID:= request.PathValue("sessionID")

	server.Mutex.RLock()
	session, ok :=server.Sessions[sessionID]
	server.Mutex.RUnlock()

	if !ok {
		http.Error(writer,"Sesion no encontrada",http.StatusNotFound)
		return
	}
	
	session.Mutex.Lock()

	if len(session.Clients)-1 >= session.MaxViewers {//ya estan todos los viewers
		http.Error(writer,"Sesion llena",http.StatusNotAcceptable)
		session.Mutex.Unlock()
		return
	}

	clientID:=uuid.New().String()
	client:=&Client{
		ID:clientID,
		Role: Viewer,
	}
	session.Clients[clientID]=client	
	session.Mutex.Unlock()
	
	writer.Header().Set("Content-Type","application/json")
	json.NewEncoder(writer).Encode(map[string]any{
		"session":session,
		"clientId":client.ID,
	})
	
}

func (server*Server) getClients(writer http.ResponseWriter, request *http.Request){
	sessionID:= request.PathValue("sessionID")

	server.Mutex.RLock()
	session, ok :=server.Sessions[sessionID]
	server.Mutex.RUnlock()

	if !ok {
		http.Error(writer,"Sesion no encontrada",http.StatusNotFound)
		return
	}

	session.Mutex.RLock()
	clientIDs := make([]string, 0, len(session.Clients))

	for clientID := range session.Clients {
	    clientIDs = append(clientIDs, clientID)
	}
	session.Mutex.RUnlock()

	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(clientIDs)
}
func (server*Server) websocketHandler(writer http.ResponseWriter, request *http.Request){
	sessionID:= request.PathValue("sessionID")
	clientID:=request.URL.Query().Get("client")
	
	server.Mutex.RLock()
	session, ok :=server.Sessions[sessionID]
	server.Mutex.RUnlock()

	if !ok {
		http.Error(writer,"Sesion no encontrada",http.StatusNotFound)
		return
	}

	session.Mutex.RLock()
	client, ok :=session.Clients[clientID]

	if !ok {
		http.Error(writer,"Necesita unirse a la sesion",http.StatusNotAcceptable)
		session.Mutex.RUnlock()
		return
	}
	session.Mutex.RUnlock()

	var upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	connection,err := upgrader.Upgrade(writer,request,nil)

	if err != nil {
		log.Printf("Error al actualizar a WebSocket: %v",err)
		return
	}
	defer connection.Close()
	
	//crear conexión
	session.Mutex.Lock()
	client.Conn = connection
	session.Mutex.Unlock()
	
	for {
		_, message, err := connection.ReadMessage()

		if err != nil {
			log.Printf(
				"Cliente %s desconectado",
				client.ID,
			)
			break
		}

		var mensaje Mensaje

		err = json.Unmarshal(message,&mensaje)
		if err!=nil{
			log.Println("Mensaje invalido")
			continue
		}

		log.Printf(
		"Mensaje recibido de %s: %+v",
		client.ID,
		mensaje,
		)
		log.Printf("Tipo: %s Dato: %s",mensaje.Tipo,mensaje.Dato)
  }

	//limpiar conexión
	session.Mutex.Lock()
	client.Conn = nil
	session.Mutex.Unlock()

}

func main() {
	server:=&Server{
		Sessions: make(map[string]*Session),
	}
	log.Println("Servidor iniciado")
	log.Println("Escuchando en el puerto 8080")
//frontend
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {

    http.ServeFile(w, r, "../index.html")

	})

	http.HandleFunc("/viewer", func(w http.ResponseWriter, r *http.Request) {
		
    http.ServeFile(w, r, "../index.html")

	})
	http.Handle("/style.css", http.FileServer(http.Dir("..")))
	http.Handle("/script.js", http.FileServer(http.Dir("..")))
	http.Handle("/serial.js", http.FileServer(http.Dir("..")))
	http.Handle("/favicon.svg", http.FileServer(http.Dir("..")))
//finFrontend
// backend
	http.HandleFunc("/session",server.createSession)
	http.HandleFunc("/session/{sessionID}", server.joinSession)
	http.HandleFunc("/session/{sessionID}/clients", server.getClients)
	http.HandleFunc("/ws/{sessionID}",server.websocketHandler)
	
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}

}
