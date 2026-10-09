/* ------------------------------------------------------------------ */
/* Lógica de sesión (frontend): crear/unirse, URL del QR y render      */
/* ------------------------------------------------------------------ */

/* El host crea su sesión contra el backend (POST /session) y guarda
   su sessionId/clientId igual que el visitor. */
// PENDIENTE (3): para el visitor no se llama a esto; en su lugar, si hay
// ?sessionId, se hace POST /session/{sessionId}, se guarda data.clientId y se
// arranca el WS. El host también debe arrancar el WS tras crear la sesión.
async function ensureHostSession() {
  if (session.sessionId && session.clientId) return;

  try {
    const res = await fetch("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        encendido: false,
        arduinoConectado: false,
        maxViewers: state.maxViewers,
      }),
    });
    if (!res.ok) throw new Error();

    const data = await res.json();
    session.sessionId = data.sessionId;
    session.clientId = data.clientId;
    saveSession();
  } catch (_err) {
    toast.show("No se pudo crear la sesión en el servidor.");
  }
}

/* PENDIENTE (3): join del visitor, ANTES de abrir el WS. Esqueleto:
 *
 * async function joinAsVisitor() {
 *   const res = await fetch("/session/" + session.sessionId, { method: "POST" });
 *   if (!res.ok) { toast.show("No se pudo entrar a la sesión."); return; }
 *   const data = await res.json();
 *   session.clientId = data.clientId;
 *   saveSession();
 *   applySessionState({
 *     encendido: data.ledEncendido,
 *     arduinoConectado: data.arduinoConectado,
 *     maxViewers: data.maxViewers,
 *   });
 * }
 */

/* URL que irá dentro del QR cuando se genere. */
function visitorUrl() {
  return session.sessionId
    ? `${window.location.origin}/visitor?sessionId=${session.sessionId}`
    : "";
}

/* ------------------------------------------------------------------ */
/* Render de la interfaz desde el estado central                       */
/* ------------------------------------------------------------------ */
function renderLed() {
  ledBtn.classList.toggle("on", state.encendido);
  ledBtn.classList.toggle("off", !state.encendido);
  ledLabel.textContent = state.encendido ? "ON" : "OFF";
}

function renderVisitorStatus() {
  statusEl.textContent = state.arduinoConectado
    ? "Arduino conectado (host)"
    : "Arduino sin conectar (host)";
}

/* Punto de entrada cuando el backend sincronice el estado de sesión. */
function applySessionState(partial) {
  Object.assign(state, partial);
  renderLed();
  if (ROLE === "visitor") renderVisitorStatus();
}

function applyRole() {
  if (ROLE === "visitor") {
    document.querySelectorAll(".host-panel").forEach((el) => {
      el.hidden = true;
    });
    renderVisitorStatus();
  }
}
