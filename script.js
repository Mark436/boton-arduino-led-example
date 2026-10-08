/* ------------------------------------------------------------------ */
/* Modo de la página: owner (control completo) o viewer (solo lectura) */
/* ------------------------------------------------------------------ */
const ROLE = window.location.pathname === "/viewer" ? "viewer" : "owner";

/* Estado central de la sesión. El backend será la fuente de verdad;
   cuando haya sincronización se aplica con applySessionState(). */
const state = {
  encendido: false,
  arduinoConectado: false,
};

const session = {
  sessionId: sessionStorage.getItem("sessionId"),
  clientId: sessionStorage.getItem("clientId"),
};

/* El QR apunta a /viewer?sessionId=<id>: el viewer llega identificado
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

/* El owner crea su sesión contra el backend (POST /session) y guarda
   su sessionId/clientId igual que el viewer. */
async function ensureOwnerSession() {
  if (session.sessionId && session.clientId) return;

  try {
    const res = await fetch("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encendido: false, arduinoConectado: false }),
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

/* URL que irá dentro del QR cuando se genere. */
function viewerUrl() {
  return session.sessionId
    ? `${window.location.origin}/viewer?sessionId=${session.sessionId}`
    : "";
}

const connection = new SerialConnection();

const statusEl = document.getElementById("status");
const connectBtn = document.getElementById("connectBtn");
const ledBtn = document.getElementById("ledButton");
const ledLabel = document.getElementById("ledLabel");

/* ------------------------------------------------------------------ */
/* Toast (notificaciones centradas)                                    */
/* ------------------------------------------------------------------ */
class Toast {
  constructor(element) {
    this.el = element;
    this.timer = null;
  }

  show(message, duration = 3500) {
    clearTimeout(this.timer);
    this.el.textContent = message;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add("visible"));
    this.timer = setTimeout(() => this.hide(), duration);
  }

  hide() {
    clearTimeout(this.timer);
    this.el.classList.remove("visible");
    setTimeout(() => {
      this.el.hidden = true;
    }, 250);
  }
}

const toast = new Toast(document.getElementById("toast"));

/* ------------------------------------------------------------------ */
/* Modal base                                                          */
/* ------------------------------------------------------------------ */
class Modal {
  constructor(overlay) {
    this.overlay = overlay;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  open() {
    this.overlay.hidden = false;
  }

  close() {
    this.overlay.hidden = true;
  }
}

class QrModal extends Modal {
  constructor(overlay, openBtn, closeBtn) {
    super(overlay);
    openBtn.addEventListener("click", () => this.open());
    closeBtn.addEventListener("click", () => this.close());
  }
}

/* ------------------------------------------------------------------ */
/* API de usuarios (endpoints aún pendientes en el backend)            */
/* ------------------------------------------------------------------ */
class UsersApi {
  static _base() {
    if (!session.sessionId) {
      throw new Error("No hay una sesión activa en este equipo.");
    }
    return `/session/${session.sessionId}`;
  }

  static _headers() {
    return { "X-Client-ID": session.clientId ?? "" };
  }

  static async list() {
    let res;
    try {
      res = await fetch(`${this._base()}/clients`, { headers: this._headers() });
    } catch (_err) {
      throw new Error("No se pudo contactar con el servidor.");
    }

    if (res.status === 404 || res.status === 501) {
      throw new Error(
        "Gestión de usuarios no disponible todavía (backend en desarrollo).",
      );
    }
    if (!res.ok) throw new Error("No se pudieron cargar los usuarios.");

    try {
      return await res.json();
    } catch (_err) {
      throw new Error(
        "Gestión de usuarios no disponible todavía (backend en desarrollo).",
      );
    }
  }

  static async remove(clientId) {
    let res;
    try {
      res = await fetch(`${this._base()}/clients/${clientId}`, {
        method: "DELETE",
        headers: this._headers(),
      });
    } catch (_err) {
      throw new Error("No se pudo contactar con el servidor.");
    }

    if (res.status === 404 || res.status === 501) {
      throw new Error(
        "Eliminar usuarios no disponible todavía (backend en desarrollo).",
      );
    }
    if (!res.ok) throw new Error("No se pudo eliminar el usuario.");

    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Modal de usuarios: lista IDs y permite eliminar                     */
/* ------------------------------------------------------------------ */
class UsersModal extends Modal {
  constructor(overlay, openBtn, closeBtn) {
    super(overlay);
    this.listEl = document.getElementById("usersList");
    this.countEl = document.getElementById("usersCount");
    openBtn.addEventListener("click", () => this.open());
    closeBtn.addEventListener("click", () => this.close());
  }

  async open() {
    super.open();
    await this.refresh();
  }

  async refresh() {
    this.listEl.replaceChildren();
    this.countEl.textContent = "";

    let users;
    try {
      users = await UsersApi.list();
    } catch (err) {
      toast.show(err.message);
      this.countEl.textContent = "Sin datos de usuarios";
      return;
    }

    this.countEl.textContent = `${users.length} usuario(s) en la sesión`;

    if (users.length === 0) {
      const empty = document.createElement("li");
      empty.className = "users-empty";
      empty.textContent = "Nadie más en la sesión todavía.";
      this.listEl.appendChild(empty);
      return;
    }

    for (const user of users) {
      this.listEl.appendChild(this._buildRow(user));
    }
  }

  _buildRow(user) {
    const row = document.createElement("li");
    row.className = "user-item";

    const id = document.createElement("span");
    id.className = "user-id";
    id.textContent = user.clientId;
    id.title = user.clientId;

    const role = document.createElement("span");
    role.className = "user-role";
    role.textContent = user.role;

    const removeBtn = document.createElement("button");
    removeBtn.className = "user-delete";
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", "Eliminar usuario");
    removeBtn.disabled = user.clientId === session.clientId;
    removeBtn.addEventListener("click", async () => {
      removeBtn.disabled = true;
      try {
        await UsersApi.remove(user.clientId);
        await this.refresh();
      } catch (err) {
        removeBtn.disabled = false;
        toast.show(err.message);
      }
    });

    row.append(id, role, removeBtn);
    return row;
  }
}

/* ------------------------------------------------------------------ */
/* Render de la interfaz desde el estado central                       */
/* ------------------------------------------------------------------ */
function renderLed() {
  ledBtn.classList.toggle("on", state.encendido);
  ledBtn.classList.toggle("off", !state.encendido);
  ledLabel.textContent = state.encendido ? "ON" : "OFF";
}

function renderViewerStatus() {
  statusEl.textContent = state.arduinoConectado
    ? "Arduino conectado (host)"
    : "Arduino sin conectar (host)";
}

/* Punto de entrada cuando el backend sincronice el estado de sesión. */
function applySessionState(partial) {
  Object.assign(state, partial);
  renderLed();
  if (ROLE === "viewer") renderViewerStatus();
}

function applyRole() {
  if (ROLE === "viewer") {
    document.querySelectorAll(".owner-panel").forEach((el) => {
      el.hidden = true;
    });
    renderViewerStatus();
  }
}

/* ------------------------------------------------------------------ */
/* Conexión serial (solo el owner la usa)                              */
/* ------------------------------------------------------------------ */
connection.onStatusChange = (message, connected) => {
  state.arduinoConectado = connected;
  statusEl.textContent = message;
  connectBtn.textContent = connected
    ? "Desconectar"
    : "Conectar Arduino (COM)";
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
  if (ROLE === "viewer") {
    if (!state.arduinoConectado) {
      toast.show(
        "El Arduino no está conectado. Conéctalo desde el equipo del host para poder interactuar.",
      );
      return;
    }
    // Conexión real con el backend: el viewer pedirá el cambio de estado
    // al owner a través del WebSocket (pendiente).
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
}

ledBtn.addEventListener("click", handleLedClick);

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */
applyRole();
renderLed();

if (ROLE === "owner") {
  ensureOwnerSession();
}

new QrModal(
  document.getElementById("qrModal"),
  document.getElementById("qrBtn"),
  document.getElementById("qrClose"),
);

new UsersModal(
  document.getElementById("usersModal"),
  document.getElementById("usersBtn"),
  document.getElementById("usersClose"),
);
