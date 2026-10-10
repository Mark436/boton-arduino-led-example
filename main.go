package main

import (
	"log"
	"net/http"

	"github.com/mark436/LED-websocket/internal/app"
)

func main() {
	server := app.NewServer()
	go server.ReapSessions()

	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	log.Println("Servidor iniciado")
	log.Println("Escuchando en el puerto 8080")

	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
