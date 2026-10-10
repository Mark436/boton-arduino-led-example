/* ------------------------------------------------------------------ */
/* Configuración y estado compartido (frontend)                        */
/*                                                                    */
/* Este archivo se carga ANTES que los demás: define los globales     */
/* (rol, DEV_MODE, estado y referencias DOM) que usan los otros       */
/* módulos. La sesión vive en la clase Session (scripts/session.js).  */
/* Orden de carga en index.html:                                      */
/*   serial.js, config.js, session.js, ui.js, realtime.js, script.js  */
/* ------------------------------------------------------------------ */

const ROLE = window.location.pathname === "/visitor" ? "visitor" : "host";

/* Simula el serial por consola (no requiere Arduino).
   Cambiar a true para desarrollar el resto de la interfaz. */
const DEV_MODE = true;

/* Estado central de la sesión. El backend es la fuente de verdad;
   cuando llega un mensaje del servidor se aplica con App.applyState(). */
const state = {
  encendido: false,
  arduinoConectado: false,
  hostConectado: false,
  maxViewers: 1,
};

/* Referencias DOM compartidas. El HTML ya está cargado porque los <script>
   van al final del <body>. */
const statusEl = document.getElementById("status");
const connectBtn = document.getElementById("connectBtn");
const ledBtn = document.getElementById("ledButton");
const ledLabel = document.getElementById("ledLabel");
