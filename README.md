# Botón Arduino LED — Interfaz Web

Controla un LED de Arduino desde el navegador mediante la **Web Serial API**, con soporte multiusuario en tiempo real: un **host** controla el puerto COM y los **visitors** pueden ver e interactuar a través del backend.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=flat&logo=socketdotio&logoColor=white)

## ✨ Características

- **Host** (`/`): control completo — conectar/desconectar el Arduino (COM), encender/apagar el LED, ver el código QR de la sesión y administrar los usuarios conectados.
- **Visitor** (`/visitor?sessionId=...`): llega desde el QR con su sesión identificada; no toca el puerto serial, y si el Arduino no está conectado muestra un aviso de que necesita el host para interactuar.
- **Estado centralizado**: `encendido` y `arduinoConectado` viven en un único estado listo para sincronizarse con el backend.
- **Serial como librería**: `serial.js` es un módulo puro de comunicación (`connect`, `disconnect`, `write`, `setLed`), sin dependencias de la UI.
- **Modales** de QR y de usuarios (IDs + eliminar) con diseño redondeado y notificaciones toast.

## 🚀 Uso

### Backend (Go)

```bash
go run .
```

El servidor queda en `http://localhost:8080` y sirve el frontend directamente. El
módulo Go vive en la **raíz del repo** y sirve el sitio desde `frontend/`:

| Ruta     | Descripción                        |
| -------- | ---------------------------------- |
| `/`       | Panel del host                      |
| `/visitor`| Panel del visitor (`?sessionId=...`)|

### Frontend

Solo necesitas Chrome o Edge (Web Serial API) con una placa Arduino conectada por USB. El backend se encarga de crear la sesión (`POST /session`) y el host obtiene su `sessionId`/`clientId` automáticamente.

El frontend vive en `frontend/`:

```
frontend/index.html           → estructura
frontend/config.js            → rol, DEV_MODE, estado y refs DOM
frontend/styles/style.css     → estilos (toast, modales, botones)
frontend/favicon.svg          → icono
frontend/scripts/serial.js    → librería de comunicación serial
frontend/scripts/session.js   → Session: crear/unirse, reset, URL del QR
frontend/scripts/realtime.js  → Realtime (WebSocket, cierre intencional)
frontend/scripts/ui.js        → Toast, QrModal, UsersModal, ConfirmModal
frontend/scripts/script.js    → App: eventos, render, sesión y WS (módulo ES)
```

### Arduino

Sube un sketch simple que lea el puerto serie y encienda/apague el pin del LED:

```cpp
const int LED = 13;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    digitalWrite(LED, c == '1' ? HIGH : LOW);
  }
}
```

Un ejemplo completo está en [`docs/examples/receptor.cpp`](docs/examples/receptor.cpp).

## 📡 API del backend

| Método   | Ruta                            | Descripción                      |
| -------- | ------------------------------- | -------------------------------- |
| `POST`   | `/session`                      | Crear sesión (devuelve IDs)     |
| `POST`   | `/session/{sessionId}`          | Unirse como visitor              |
| `POST`   | `/session/{sessionId}/reset`    | Reiniciar sesión (solo el host)  |
| `WS`     | `/ws/{sessionId}?client=...`    | Conexión en tiempo real          |

> ✅ El **backend está completo** y el frontend ya está **cableado** a todos sus
> mensajes. El detalle del protocolo vive en [`docs/PROTOCOLO.md`](docs/PROTOCOLO.md)
> y [`docs/ENDPOINTS.md`](docs/ENDPOINTS.md).

## ✅ Integración frontend/backend

El frontend implementa y envía todos los mensajes del protocolo:

- **Rama visitor**: `joinVisitor` + abrir WS → `frontend/scripts/script.js:175`.
- **Envíos del host**: `cambiarArduino` (`script.js:39`) y `cambiarLED` tras el
  toggle (`script.js:96`).
- **Envío del visitor**: `cambiarLED` (`script.js:77`).
- **Modal de usuarios por WS**: `cambiarMaxViewers` (`ui.js:209`),
  `pedirClientes` (`ui.js:238`) y `expulsar` (`ui.js:262`). El modal recibe un
  emisor (`this.enviar`) inyectado desde `App`, así no depende de un global.
- **Recepción** (`handleServerMessage`): `cambiarLED` (`script.js:255`),
  `clientes` (`script.js:267`), más `cambiarArduino`, `cambiarMaxViewers`,
  `cambiarHostConectado` y `expulsado { motivo }`.
- `UsersApi` (REST) eliminado: archivo borrado y `<script>` quitado de `index.html`.

## 🚧 Pendientes (backend, opcionales)

| Marca | Qué                                                                 | Dónde                       | Debe ser |
| ----- | ------------------------------------------------------------------- | --------------------------- | -------- |
| 🚧    | Al unirse un visitor **no** se reenvía `clientes` al host           | `server.go:73`              | Emitir `clientesMsg(...)` al host tras el alta |
| 🚧    | El `Upgrader` no define `CheckOrigin` (solo mismo origen)           | `websocket.go:14`           | Definir `CheckOrigin` si se sirve el front desde otro puerto |

## 🐳 Docker

El contenedor habla **HTTP plano en el 8080**; el **HTTPS lo termina Caddy** (u
otro reverse proxy) por delante. **No hay TLS dentro del contenedor.**

```bash
# Construir la imagen y levantar el contenedor
docker compose up -d --build

# Ver logs en vivo
docker compose logs -f
```

| Archivo                          | Para qué                                                                 |
| -------------------------------- | ------------------------------------------------------------------------ |
| `Dockerfile`                     | Multi-stage: compila el backend Go y empaqueta binario + frontend. Cada línea está comentada. |
| `.dockerignore`                  | Excluye `.git`, `docs/`, `receptor.cpp`, binarios locales, etc. del build context. |
| `docker-compose.yml`             | Servicio/contenedor `led-arduino`, publica `8080:8080` y se une a la red `reverse_proxy_net`. |
| `docs/caddy/Caddyfile`           | **Ejemplo** de reverse proxy: termina el HTTPS y reenvía a `led-arduino:8080` (incluye el WebSocket). |
| `docs/caddy/docker-compose.yml`  | **Ejemplo** del compose de Caddy, enganchado a la red `reverse_proxy_net`. |

Estructura del repo:

```
go.mod / go.sum / *.go    → backend (módulo Go en la raíz)
frontend/                 → sitio estático servido por el backend
docs/                     → ENDPOINTS.md, PROTOCOLO.md
docs/examples/            → receptor.cpp (firmware) y docs/caddy/ (ejemplos de Caddy)
Dockerfile / docker-compose.yml / .dockerignore
```

El frontend usa rutas **relativas** y `window.location.origin`, así que funciona
tal cual detrás del proxy (Caddy también maneja el upgrade de WebSocket).

Si Caddy corre en la **misma red Docker**, no hace falta publicar el puerto:
Caddy llega por el nombre del servicio (`http://led-arduino:8080`). En ese caso
renombra `reverse_proxy_net` por tu red compartida y marcala como `external: true`.
Los ejemplos listos para copiar están en `docs/caddy/`.

