package main

import (
	"encoding/json"
	"log"
)

// ------------- protocolo de mensajes -------------
// Todos los mensajes viajan como {"tipo": "...", "dato": {...}}

// Mensaje es el sobre común. Dato se deja como json.RawMessage a propósito:
// se valida/decodifica al tipo concreto SOLO dentro de cada case del switch.
type Mensaje struct {
	Tipo string          `json:"tipo"`
	Dato json.RawMessage `json:"dato"`
}

// DatoLED acompaña al mensaje "cambiarLED".
type DatoLED struct {
	Encendido bool `json:"ledEncendido"`
}

// DatoArduino acompaña a "cambiarArduino" (estado de la conexión física).
type DatoArduino struct {
	ArduinoConectado bool `json:"arduinoConectado"`
}

// DatoMaxViewers acompaña a "cambiarMaxViewers".
type DatoMaxViewers struct {
	MaxViewers int `json:"maxViewers"`
}

// DatoExpulsar acompaña a "expulsar": a quién hay que echar.
type DatoExpulsar struct {
	ClientID string `json:"clientId"`
}

// DatoCliente es cada elemento del array del mensaje "clientes".
// Ojo: la lista NO incluye al host (ver visitors()).
type DatoCliente struct {
	ID   string `json:"clientId"`
	Role Role   `json:"role"`
}

// ------------- roles -------------
// Role es el privilegio del cliente dentro de la sesión.
type Role string

const (
	Host    Role = "HOST"
	Visitor Role = "VISITOR"
)

// mustMarshal serializa a []byte. Si falla devuelve "{}" para no romper el envío.
func mustMarshal(v any) []byte {
	data, err := json.Marshal(v)
	if err != nil {
		log.Println("Error al serializar mensaje:", err)
		return []byte(`{}`)
	}
	return data
}

// clientesMsg arma el mensaje "clientes" con la lista de visitors.
func clientesMsg(visitors []DatoCliente) Mensaje {
	return Mensaje{Tipo: "clientes", Dato: mustMarshal(visitors)}
}

// expulsadoMsg arma el mensaje "expulsado" (sin dato útil).
func expulsadoMsg() Mensaje {
	return Mensaje{Tipo: "expulsado", Dato: json.RawMessage(`{}`)}
}
