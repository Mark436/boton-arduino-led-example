/* ------------------------------------------------------------------ */
/* Punto de entrada (frontend)                                         */
/*                                                                     */
/* Cablea el serial, los botones y arranca la sesión. La lógica está   */
/* repartida por responsabilidad:                                      */
/*   config.js     -> rol, DEV_MODE, estado, sesión, refs DOM          */
/*   serial.js     -> SerialConnection (Web Serial)                    */
/*   users-api.js  -> UsersApi (provisional; PENDIENTE 5)              */
/*   ui.js         -> Toast, QrModal, UsersModal                       */
/*   session.js    -> crear/unirse, URL del QR, render                 */
/*   realtime.js   -> Realtime (WebSocket; PENDIENTE 4)                */
/*                                                                     */
/* PENDIENTES DE INTEGRACIÓN (el backend ya está listo):               */
/*   1) renombrar owner->host / viewer->visitor     ...... HECHO        */
/*   2) ruta /viewer -> /visitor                     ...... HECHO        */
/*   3) join del visitor + guardar clientId                            */
/*   4) WebSocket: Realtime + handleServerMessage                      */
/*   5) UsersApi (REST) -> mensajes WS                                 */
/*   6) al recibir "expulsado": toast + cerrar ventana                 */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Conexión serial (solo el host la usa)                               */
/* ------------------------------------------------------------------ */
const connection = new SerialConnection({ dev: DEV_MODE });

// PENDIENTE (4): además de actualizar la UI, cuando cambie `connected` el host
// debe avisar a los visitors por WS:
//   realtime.send({ tipo: "cambiarArduino", dato: { arduinoConectado: connected } })
connection.onStatusChange = (message, connected) => {
  state.arduinoConectado = connected;
  statusEl.textContent = message;
  connectBtn.textContent = connected
    ? `Desconectar${DEV_MODE ? " (dev)" : ""}`
    : `Conectar Arduino (COM)${DEV_MODE ? " · dev" : ""}`;
  connectBtn.classList.toggle("connected", connected);
};

connectBtn.addEventListener("click", () => {
  if (connection.connected) {
    connection.disconnect();
  } else {
    connection.connect();
  }
});

/* ------------------------------------------------------------------ */
/* Botón LED                                                           */
/* ------------------------------------------------------------------ */
async function handleLedClick() {
  if (ROLE === "visitor") {
    if (!state.arduinoConectado) {
      toast.show(
        "El Arduino no está conectado. Conéctalo desde el equipo del host para poder interactuar.",
      );
      return;
    }
    // PENDIENTE (4): el visitor pide el cambio por WS:
    //   realtime.send({ tipo: "cambiarLED", dato: { ledEncendido: !state.encendido } })
    // El estado real volverá por {tipo:"cambiarLED"} en handleServerMessage.
    return;
  }

  if (!connection.connected) {
    const ok = await connection.connect();
    if (!ok) return;
  }

  const ok = await connection.setLed(!state.encendido);
  if (!ok) return;

  state.encendido = !state.encendido;
  renderLed();

  // PENDIENTE (4): avisar a los visitors del nuevo estado del LED:
  //   realtime.send({ tipo: "cambiarLED", dato: { ledEncendido: state.encendido } })
}

ledBtn.addEventListener("click", handleLedClick);

/* ------------------------------------------------------------------ */
/* Mensajes del servidor por WebSocket (PENDIENTE 3, 4 y 6)            */
/* Completa el switch traduciendo cada mensaje del backend a la UI.    */
/* ------------------------------------------------------------------ */
function handleServerMessage(mensaje) {
  // Plantilla (usa mensaje.tipo y mensaje.dato):
  //   "cambiarLED"        -> applySessionState({ encendido: mensaje.dato.ledEncendido })
  //   "cambiarArduino"    -> applySessionState({ arduinoConectado: mensaje.dato.arduinoConectado })
  //   "cambiarMaxViewers" -> applySessionState({ maxViewers: mensaje.dato.maxViewers })
  //   "clientes"          -> usersModal.renderList(mensaje.dato)  // sustituye a UsersApi.list
  //   "expulsado"         -> (6) toast.show("Te expulsaron de la sesión.")
  //                          setTimeout(() => window.close(), 1200)
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */
applyRole();
renderLed();

// PENDIENTE (3 y 4): secuencia de arranque.
//   HOST:    await ensureHostSession(); realtime = new Realtime(session.sessionId, session.clientId, handleServerMessage);
//   VISITOR: await joinAsVisitor();       realtime = new Realtime(session.sessionId, session.clientId, handleServerMessage);
// Guarda `realtime` en una variable de módulo (p.ej. let realtime = null;) para
// que los botones puedan hacer realtime.send(...).
if (ROLE === "host") {
  ensureHostSession();
}

const qrModal = new QrModal(
  document.getElementById("qrModal"),
  document.getElementById("qrBtn"),
  document.getElementById("qrClose"),
);

const usersModal = new UsersModal(
  document.getElementById("usersModal"),
  document.getElementById("usersBtn"),
  document.getElementById("usersClose"),
);
