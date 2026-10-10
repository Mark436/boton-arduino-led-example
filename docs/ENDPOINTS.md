# Endpoints del backend

El servidor escucha en `:8080` (`main.go`) y expone cuatro endpoints de API más el
frontend estático. La comunicación en tiempo real usa WebSocket.

| Método | Ruta                          | Handler             | Descripción                          |
| ------ | ----------------------------- | ------------------- | ------------------------------------ |
| `POST` | `/session`                    | `createSession`     | Crea una sala y a su `HOST`          |
| `POST` | `/session/{sessionID}`        | `joinSession`       | Une un `VISITOR` a una sala          |
| `POST` | `/session/{sessionID}/reset`  | `resetSession`      | Reinicia la sesión (solo el host)    |
| `WS`   | `/ws/{sessionID}?client=...`  | `websocketHandler`  | Canal en tiempo real de la sesión    |
| `GET`  | `/` y `/visitor`              | `indexHandler`      | Sirve el frontend (`index.html`)     |
| `GET`  | `/*`                          | `http.FileServer`   | Sirve `frontend/` como estáticos     |

El registro global de salas vive en `Server.Sessions` (`server.go`), protegido por
`Server.Mutex`. El estado de cada sala vive en `Session` (`session.go`), protegido
por `Session.Mutex`.

---

## `POST /session` — crear sesión

Crea la sala, genera el `HOST` y devuelve sus IDs. El host los guarda y luego abre
el WebSocket con ellos.

**Request**

- Método: `POST`
- Body (JSON, obligatorio):

```json
{
  "encendido": false,
  "arduinoConectado": false,
  "maxViewers": 1
}
```

| Campo              | Tipo   | Obligatorio | Descripción                                   |
| ------------------ | ------ | ----------- | --------------------------------------------- |
| `encendido`        | bool   | no          | Estado inicial del LED                        |
| `arduinoConectado` | bool   | no          | Estado inicial de la conexión física          |
| `maxViewers`       | int    | no          | Cupo de visitors. Si `< 1` o falta, se usa `1` |

**Response `200`**

```json
{ "sessionId": "uuid", "clientId": "uuid" }
```

- `sessionId`: id de la sala (clave en `Server.Sessions`).
- `clientId`: id del host (clave en `Session.Clients`). El host lo usa para el WS.

**Errores**

| Código | Causa                                             |
| ------ | ------------------------------------------------- |
| `405`  | Método distinto de `POST`                         |
| `400`  | Body no es JSON válido (incluye body vacío, EOF)  |

> El host queda registrado en `Session.Clients` **con `Conn = nil`** hasta que
> abra el WebSocket.

---

## `POST /session/{sessionID}` — unirse como visitor

Mete a un `VISITOR` en la sala y devuelve el estado actual para que el invitado
pinte la UI sin esperar al WebSocket.

**Request**

- Método: `POST`
- Path: `sessionID` (debe existir).
- Body: no se lee.

**Response `200`**

```json
{
  "sessionId": "uuid",
  "clientId": "uuid",
  "ledEncendido": false,
  "arduinoConectado": false,
  "maxViewers": 1
}
```

El `clientId` es el del visitor recién creado; debe guardarse para abrir el WS.

**Errores**

| Código | Causa                                                        |
| ------ | ------------------------------------------------------------ |
| `405`  | Método distinto de `POST`                                    |
| `404`  | La sesión no existe                                          |
| `406`  | Sesión llena: `len(Clients) - 1 >= MaxViewers` (solo visitors) |

> El cupo cuenta **todos los clientes menos el host**. El visitor también queda en
> `Session.Clients` con `Conn = nil` hasta que abra el WebSocket.

---

## `POST /session/{sessionID}/reset` — reiniciar sesión

Reinicia la sesión del host: **expulsa a todos los visitors**, **borra la sala
vieja** y **crea una nueva** conservando el estado (`encendido`,
`arduinoConectado` y `maxViewers`). Pensado para el botón "Nueva sesión" del
modal QR.

**Request**

- Método: `POST`
- Path: `sessionID` (la sala actual).
- Query: `client` = `clientId` del host (autenticación).
- Body: no se lee.

**Response `200`**

```json
{ "sessionId": "uuid-nueva", "clientId": "uuid-host-nueva" }
```

**Errores**

| Código | Causa                                             |
| ------ | ------------------------------------------------- |
| `405`  | Método distinto de `POST`                         |
| `404`  | La sesión no existe                               |
| `403`  | El `client` no es el host de esa sala             |

**Efectos secundarios:** cada visitor de la sala vieja recibe
`expulsado { "motivo": "La sesión fue cerrada por el host" }` y su WS se cierra.

---

## `WS /ws/{sessionID}?client={clientId}` — WebSocket

Canal bidireccional de la sesión. Todos los mensajes usan el sobre común:

```json
{ "tipo": "cambiarLED", "dato": { "ledEncendido": true } }
```

- `tipo`: string, nombre del mensaje.
- `dato`: payload; los mensajes sin datos mandan `{}`.

### Handshake

1. El cliente debe existir antes de abrir el WS (haber hecho `createSession` o
   `joinSession`); si no, la conexión se rechaza.
2. Se hace `Upgrade` a WebSocket y se enlaza la conexión a `Client.Conn`.
3. El servidor **empuja el estado actual en 4 mensajes** (fuente de verdad):

```json
{ "tipo": "cambiarLED",           "dato": { "ledEncendido": false } }
{ "tipo": "cambiarArduino",       "dato": { "arduinoConectado": false } }
{ "tipo": "cambiarMaxViewers",    "dato": { "maxViewers": 1 } }
{ "tipo": "cambiarHostConectado", "dato": { "hostConectado": true } }
```

**Errores de handshake**

| Código | Causa                                              |
| ------ | -------------------------------------------------- |
| `404`  | La sesión no existe                                |
| `406`  | El `client` no pertenece a la sesión (falta el join) |

### Roles

| Rol       | Valor     | Permisos                                            |
| --------- | --------- | --------------------------------------------------- |
| Host      | `HOST`    | Todo: LED, Arduino, cupo, listar y expulsar         |
| Visitor   | `VISITOR` | Solo `cambiarLED`                                   |

### Cliente → servidor

| `tipo`               | Quién          | Dato                          | Efecto                                             |
| -------------------- | -------------- | ----------------------------- | -------------------------------------------------- |
| `cambiarLED`         | cualquier rol  | `{ "ledEncendido": bool }`    | Guarda el estado y lo propaga                      |
| `cambiarArduino`     | solo host      | `{ "arduinoConectado": bool }`| Guarda el estado físico y lo propaga               |
| `cambiarMaxViewers`  | solo host      | `{ "maxViewers": int }`       | Cambia el cupo (mínimo 1) y lo propaga             |
| `pedirClientes`      | solo host      | `{}`                          | Responde `clientes` solo al host                   |
| `expulsar`           | solo host      | `{ "clientId": "uuid" }`      | Expulsa al visitor: `expulsado` + cierra su WS     |

Reglas:

- Los mensajes `host-only` se **ignoran** si los envía un visitor.
- `cambiarLED` fija `session.Encendido` al valor recibido (no lo invierte).
- `expulsar` contra un `HOST` se ignora.
- Un mensaje sin `tipo` o sin `dato` se descarta.

**Ejemplos**

```json
{ "tipo": "cambiarLED",       "dato": { "ledEncendido": true } }
{ "tipo": "cambiarArduino",   "dato": { "arduinoConectado": true } }
{ "tipo": "cambiarMaxViewers","dato": { "maxViewers": 3 } }
{ "tipo": "pedirClientes",    "dato": {} }
{ "tipo": "expulsar",         "dato": { "clientId": "uuid-del-visitor" } }
```

### Servidor → cliente

| `tipo`               | Dato                                                        | Cuándo                                          |
| -------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `cambiarLED`         | `{ "ledEncendido": bool }`                                  | Al conectar y ante cada cambio de LED           |
| `cambiarArduino`     | `{ "arduinoConectado": bool }`                              | Al conectar y ante cada cambio de Arduino       |
| `cambiarMaxViewers`  | `{ "maxViewers": int }`                                     | Al conectar y ante cada cambio de cupo          |
| `cambiarHostConectado` | `{ "hostConectado": bool }`                               | Al conectar y cuando el host cae/reconecta      |
| `clientes`           | `[ { "clientId": "uuid", "role": "VISITOR" } ]`             | Al pedirla y al desconectarse un visitor        |
| `expulsado`          | `{ "motivo": string }`                                      | Expulsión individual, reset o expiración        |

- `clientes` **nunca incluye al host** (solo visitors).
- El emisor **no recibe su propio eco**: `emit` propaga a todos menos al emisor
  (`session.emit`), así el host no escribe dos veces en el serial.

### Ciclo de vida de la conexión

- **Ping/pong**: el servidor manda `Ping` cada `10s`; el cliente debe responder
  `Pong`. Si no hay `Pong` en `30s`, la conexión se cierra.
- **Desconexión** (`defer` en `websocketHandler`):
  1. `Client.Conn` se pone a `nil`.
  2. **Visitor:** se borra de `Session.Clients` y se reenvía `clientes` a los demás.
  3. **Host:** NO se borra (persiste para reconectar con el mismo `clientId`); se
     marca `HostDisconnectedAt` y se emite `cambiarHostConectado {hostConectado:false}`.
- **Reconexión del host:** limpia `HostDisconnectedAt` y emite
  `cambiarHostConectado {hostConectado:true}`.
- **Reaper** (`main.go`): cada `reaperInterval` (30s) borra las salas cuyo host
  lleve más de `sessionTTL` (90s) desconectado, avisando a sus visitors con
  `expulsado { "motivo": "La sesión expiró" }`.

---

## Notas y limitaciones actuales

Marcas: **🚧 PENDIENTE** (por hacer) · **ℹ️ COMPORTAMIENTO** (así es a propósito).

- ℹ️ `createSession` exige un body JSON válido: un body vacío devuelve `400`.
- 🚧 El `Upgrader` (`websocket.go:14`) no define `CheckOrigin`, por lo que aplica el
  default de gorilla/websocket: solo acepta el **mismo origen**. Servir el
  frontend desde otro puerto (p. ej. Live Server) hará fallar el WS.
- 🚧 **Al unirse un visitor no se reenvía `clientes` al host** (`server.go:73`,
  `joinSession`). El alta ocurre en el `joinSession` HTTP, que no emite. El host
  solo actualiza su lista al abrir el modal (`pedirClientes`) o cuando algún
  cliente se desconecta. *Arreglo:* emitir `clientesMsg(...)` al host tras el alta.
- 🚧 El endpoint `reset` y `expulsar` verifican al host por su `clientId`; **no hay
  token de sesión todavía**, así que la autorización es débil.

> **Frontend:** el frontend envía y maneja **todos** los mensajes del protocolo.
> Ver
> [`README.md` → Integración frontend/backend](../README.md#-integración-frontendbackend).
