/* ------------------------------------------------------------------ */
/* Configuración y estado compartido (frontend)                        */
/*                                                                    */
/* Este archivo se carga ANTES que los demás: define los globales     */
/* (rol, estado, sesión y referencias DOM) que usan los otros módulos.*/
/* Orden de carga en index.html:                                      */
/*   serial.js, config.js, users-api.js, ui.js, session.js,          */
/*   realtime.js, script.js                                           */
/* ------------------------------------------------------------------ */

const ROLE = window.location.pathname === "/visitor" ? "visitor" : "host";

/* Simula el serial por consola (no requiere Arduino).
   Cambiar a true para desarrollar el resto de la interfaz. */
const DEV_MODE = true;

/* Estado central de la sesión. El backend será la fuente de verdad;
   cuando haya sincronización se aplica con applySessionState(). */
const state = {
  encendido: false,
  arduinoConectado: false,
  maxViewers: 1,
};

/* Identificadores de esta pestaña, persistidos en sessionStorage. */
const session = {
  sessionId: sessionStorage.getItem("sessionId"),
  clientId: sessionStorage.getItem("clientId"),
};

/* El QR apunta a /visitor?sessionId=<id>: el visitor llega identificado
   y, cuando el backend lo soporte, aquí se haría el join automático. */
const urlSessionId = new URLSearchParams(window.location.search).get(
  "sessionId",
);
if (urlSessionId) {
  session.sessionId = urlSessionId;
  sessionStorage.setItem("sessionId", urlSessionId);
}

function saveSession() {
  sessionStorage.setItem("sessionId", session.sessionId ?? "");
  sessionStorage.setItem("clientId", session.clientId ?? "");
}

/* Referencias DOM compartidas. El HTML ya está cargado porque los <script>
   van al final del <body>. */
const statusEl = document.getElementById("status");
const connectBtn = document.getElementById("connectBtn");
const ledBtn = document.getElementById("ledButton");
const ledLabel = document.getElementById("ledLabel");
