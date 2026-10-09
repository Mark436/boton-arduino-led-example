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
cd backend
go run .
```

El servidor queda en `http://localhost:8080` y sirve el frontend directamente:

| Ruta     | Descripción                        |
| -------- | ---------------------------------- |
| `/`       | Panel del host                      |
| `/visitor`| Panel del visitor (`?sessionId=...`)|

### Frontend

Solo necesitas Chrome o Edge (Web Serial API) con una placa Arduino conectada por USB. El backend se encarga de crear la sesión (`POST /session`) y el host obtiene su `sessionId`/`clientId` automáticamente.

El frontend vive en `frontend/`:

```
frontend/index.html           → estructura
frontend/config.js            → rol, DEV_MODE, estado, sesión y refs DOM
frontend/styles/style.css     → estilos (toast, modales, botones)
frontend/favicon.svg          → icono
frontend/scripts/serial.js    → librería de comunicación serial
frontend/scripts/users-api.js → UsersApi (provisional)
frontend/scripts/ui.js        → Toast y modales (QR, usuarios)
frontend/scripts/session.js   → crear/unirse a sesión, URL del QR y render
frontend/scripts/realtime.js  → Realtime (WebSocket)
frontend/scripts/script.js    → punto de entrada: eventos e init
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

Un ejemplo completo está en [`receptor.cpp`](receptor.cpp).

## 📡 API del backend

| Método   | Ruta                            | Descripción                    |
| -------- | ------------------------------- | ------------------------------ |
| `POST`   | `/session`                      | Crear sesión (devuelve IDs)   |
| `POST`   | `/session/{sessionId}`          | Unirse como visitor            |
| `WS`     | `/ws/{sessionId}?client=...`    | Conexión en tiempo real        |

> ⚠️ **En desarrollo**: faltan endpoints para listar/eliminar usuarios (`GET`/`DELETE .../clients`) y el broadcast de estado entre clientes.

## 🗺️ Roadmap

- [ ] Sincronización de `encendido` / `arduinoConectado` vía WebSocket
- [ ] Endpoints de gestión de usuarios para el modal
- [ ] Generación del código QR real (SVG)
- [ ] Limpieza automática de sesiones inactivas

## 📄 Licencia

MIT
