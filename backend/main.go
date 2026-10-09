package main

import (
	"log"
	"net/http"
)

func main() {
	server := &Server{
		Sessions: make(map[string]*Session),
	}

	mux := http.NewServeMux()

	// Frontend: HTML, CSS y JS estáticos (ver frontend.go)
	registerFrontend(mux)

	// Backend
	mux.HandleFunc("/session", server.createSession)
	mux.HandleFunc("/session/{sessionID}", server.joinSession)
	mux.HandleFunc("/ws/{sessionID}", server.websocketHandler)

	log.Println("Servidor iniciado")
	log.Println("Escuchando en el puerto 8080")

	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
