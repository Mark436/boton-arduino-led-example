# Protocolo de mensajes (WebSocket)

Toda la comunicación en tiempo real usa WebSocket con un sobre común:

```json
{ "tipo": "cambiarLED", "dato": { "ledEncendido": true } }
```

- `tipo`: nombre del mensaje (string).
- `dato`: payload del mensaje. Los mensajes "sin datos" igualmente mandan `{}` (solo se omite si el cliente escribe mal el mensaje).

## Roles

| Rol      | Valor    | Permisos                                     |
| -------- | -------- | --------------------------------------------- |
| Host     | `HOST`   | Todo: LED, Arduino, máximo, listar y expulsar |
| Visitor  | `VISITOR`| Solo `cambiarLED`                            |

## Conexión

1. `POST /session` crea la sala y devuelve los IDs del host:

```json
{ "sessionId": "uuid", "clientId": "uuid" }
```

2. `POST /session/{sessionId}` une a un visitor y devuelve el estado actual:

```json
{
  "sessionId": "uuid",
  "clientId": "uuid",
  "ledEncendido": false,
  "arduinoConectado": false,
  "maxViewers": 1
}
```

3. WebSocket:

```
ws(s)://host/ws/{sessionId}?client={clientId}
```

Al conectarse, el servidor empuja el estado actual en 4 mensajes (fuente de verdad):

```json
{ "tipo": "cambiarLED",           "dato": { "ledEncendido": false } }
{ "tipo": "cambiarArduino",       "dato": { "arduinoConectado": false } }
{ "tipo": "cambiarMaxViewers",    "dato": { "maxViewers": 1 } }
{ "tipo": "cambiarHostConectado", "dato": { "hostConectado": true } }
```

## Reconexión y ciclo de vida de la sala

- **El host persiste al desconectarse**: no se borra de `Session.Clients`, así que
  puede reconectar con el **mismo `clientId`** (p. ej. tras un F5) sin crear sala.
- **Los visitors sí se borran** al desconectarse (y se reenvía `clientes`).
- **El host reconectado** vuelve a marcar `hostConectado: true`; mientras está
  caído se emite `hostConectado: false` a los visitors.
- **Reaper**: si el host lleva `sessionTTL` (1.5 min por defecto) sin reconectar,
  la sala se borra y sus visitors reciben `expulsado { motivo: "La sesión expiró" }`.
- **Reset** (`POST /session/{id}/reset`, solo host): expulsa a todos los visitors
  con `motivo: "La sesión fue cerrada por el host"`, borra la sala y crea una
  nueva conservando estado (LED, Arduino y `maxViewers`).

## Cliente → servidor

| `tipo`          | Quién lo envía | Efecto                                                    |
| --------------- | -------------- | --------------------------------------------------------- |
| `cambiarLED`    | cualquier rol  | Cambia el estado del LED y lo propaga                      |
| `cambiarArduino`| solo host      | Actualiza el estado de la conexión física y lo propaga    |
| `cambiarMaxViewers` | solo host  | Cambia el cupo de visitors (mínimo 1) y lo propaga         |
| `pedirClientes` | solo host      | Pide la lista de visitors (responde `clientes`)           |
| `expulsar`      | solo host      | Expulsa a un visitor (`expulsado` + cierra su conexión)    |

### Ejemplos

```json
// Prender el LED (host o visitor)
{ "tipo": "cambiarLED", "dato": { "ledEncendido": true } }

// Host conectó el Arduino
{ "tipo": "cambiarArduino", "dato": { "arduinoConectado": true } }

// Host sube el cupo a 3 visitors
{ "tipo": "cambiarMaxViewers", "dato": { "maxViewers": 3 } }

// Host pide refrescar la lista
{ "tipo": "pedirClientes", "dato": {} }

// Host expulsa a un visitor
{ "tipo": "expulsar", "dato": { "clientId": "uuid-del-visitor" } }
```

## Servidor → cliente

| `tipo`             | Dato                                                                 | Cuándo                                          |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------------------- |
| `cambiarLED`       | `{ "ledEncendido": bool }`                                            | Al conectar y ante todo cambio de LED           |
| `cambiarArduino`   | `{ "arduinoConectado": bool }`                                        | Al conectar y ante todo cambio de Arduino       |
| `cambiarMaxViewers`| `{ "maxViewers": int }`                                               | Al conectar y ante todo cambio de cupo          |
| `cambiarHostConectado` | `{ "hostConectado": bool }`                                       | Al conectar y cuando el host cae/reconecta      |
| `clientes`         | `[ { "clientId": "...", "role": "VISITOR" } ]` (no incluye al host)   | Al pedirla, y tras cada alta/baja de un visitor |
| `expulsado`        | `{ "motivo": string }`                                                | Cuando te echan: expulsión o cierre de sesión   |

### Ejemplos

```json
{ "tipo": "cambiarLED",        "dato": { "ledEncendido": true } }

{ "tipo": "cambiarArduino",    "dato": { "arduinoConectado": false } }

{ "tipo": "cambiarMaxViewers", "dato": { "maxViewers": 2 } }

{ "tipo": "cambiarHostConectado", "dato": { "hostConectado": false } }

{ "tipo": "clientes", "dato": [ { "clientId": "uuid", "role": "VISITOR" } ] }

{ "tipo": "expulsado", "dato": { "motivo": "Expulsado por el host" } }
```

### Motivos de `expulsado`

| Motivo                              | Cuándo                                            |
| ----------------------------------- | ------------------------------------------------- |
| `"Expulsado por el host"`           | El host expulsa a un visitor concreto             |
| `"La sesión fue cerrada por el host"` | El host reinicia la sesión (`POST .../reset`)   |
| `"La sesión expiró"`                | El reaper borra la sala tras `sessionTTL` sin host|

## Reglas de oro

- El emisor **no recibe su propio eco**: el servidor propaga a todos menos al que envió (así el host no escribe el serial dos veces).
- La lista `clientes` **nunca incluye al host** (solo visitors).
- El host **no se puede expulsar** a sí mismo (`expulsar` contra un `HOST` se ignora).
- Los mensajes host-only se ignoran si los envía un visitor (`type` check por rol antes del `switch`).
- Al desconectarse un **visitor** (o al ser expulsado), el servidor lo borra de la sala y reenvía `clientes` para que el host actualice su lista. El **host** NO se borra: persiste para poder reconectar.
- `expulsado` siempre lleva `motivo` (expulsión individual, reset de sesión o expiración).

## ✅ Estado en el frontend

El backend y el frontend están **completamente cableados**: el frontend envía
todos los mensajes cliente→servidor y maneja todos los servidor→cliente
(incluidos `cambiarHostConectado`, `clientes` → `UsersModal.renderLista` y
`expulsado` con `motivo`). Detalle y `archivo:línea` en
[`README.md` → Integración frontend/backend](../README.md#-integración-frontendbackend).
