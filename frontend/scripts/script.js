/* ------------------------------------------------------------------ */
/* Punto de entrada (frontend)                                         */
/*                                                                    */
/* La clase App cablea el serial, los botones, los modales y arranca   */
/* la sesión. La lógica está repartida por responsabilidad:            */
/*   config.js     -> rol, DEV_MODE, estado, refs DOM                  */
/*   serial.js     -> SerialConnection (Web Serial)                    */
/*   ui.js         -> Toast, QrModal, UsersModal, ConfirmModal         */
/*   session.js    -> Session (crear/unirse, reset, URL del QR)        */
/*   realtime.js   -> Realtime (WebSocket con cierre intencional)      */
/* ------------------------------------------------------------------ */

class App {
  constructor() {
    this.connection = new SerialConnection({ dev: DEV_MODE });
    this.realtime = null;
    this.qrModal = null;
    this.usersModal = null;
    this.confirm = null;
    this.opened = false;
    this.recovered = false;
  }

  async init() {
    this.bindSerial();
    this.bindLedButton();
    this.bindModals();
    this.applyRole();
    this.renderLed();
    await this.startRealtime();
  }

  /* -------------------------------------------------------------- */
  /* Conexión serial (solo el host la usa)                          */
  /* -------------------------------------------------------------- */
  bindSerial() {
    this.connection.onStatusChange = (message, connected) => {
      // El host avisa del cambio de conexión física a los visitors:
      this.realtime?.send({
        tipo: "cambiarArduino",
        dato: { arduinoConectado: connected },
      });
      state.arduinoConectado = connected;
      statusEl.textContent = message;
      connectBtn.textContent = connected
        ? `Desconectar${DEV_MODE ? " (dev)" : ""}`
        : `Conectar Arduino (COM)${DEV_MODE ? " · dev" : ""}`;
      connectBtn.classList.toggle("connected", connected);
    };

    connectBtn.addEventListener("click", () => {
      if (this.connection.connected) {
        this.connection.disconnect();
      } else {
        this.connection.connect();
      }
    });
  }

  /* -------------------------------------------------------------- */
  /* Botón LED                                                      */
  /* -------------------------------------------------------------- */
  bindLedButton() {
    ledBtn.addEventListener("click", () => this.handleLedClick());
  }

  async handleLedClick() {
    if (ROLE === "visitor") {
      if (!state.arduinoConectado) {
        toast.show(
          "El Arduino no está conectado. Conéctalo desde el equipo del host para poder interactuar.",
        );
        return;
      }

      // El visitor pide el cambio por WS (el estado real vuelve en "cambiarLED"):
      this.realtime.send({
        tipo: "cambiarLED",
        dato: { ledEncendido: !state.encendido },
      });
      this.applyState({ encendido: !state.encendido });

      return;
    }

    if (!this.connection.connected) {
      const ok = await this.connection.connect();
      if (!ok) return;
    }

    const ok = await this.connection.setLed(!state.encendido);
    if (!ok) return;

    state.encendido = !state.encendido;
    this.renderLed();

    this.realtime.send({
      tipo: "cambiarLED",
      dato: { ledEncendido: state.encendido },
    });
  }

  /* -------------------------------------------------------------- */
  /* Render de la interfaz desde el estado central                  */
  /* -------------------------------------------------------------- */
  renderLed() {
    ledBtn.classList.toggle("on", state.encendido);
    ledBtn.classList.toggle("off", !state.encendido);
    ledLabel.textContent = state.encendido ? "ON" : "OFF";
  }

  renderVisitorStatus() {
    if (!state.hostConectado) {
      statusEl.textContent = "Host desconectado";
      return;
    }
    statusEl.textContent = state.arduinoConectado
      ? "Arduino conectado (host)"
      : "Arduino sin conectar (host)";
  }

  /* Punto de entrada cuando el backend sincroniza el estado de sesión. */
  applyState(partial) {
    Object.assign(state, partial);
    this.renderLed();
    if (ROLE === "visitor") this.renderVisitorStatus();
  }

  applyRole() {
    if (ROLE === "visitor") {
      document.querySelectorAll(".host-panel").forEach((el) => {
        el.hidden = true;
      });
      this.renderVisitorStatus();
    }
  }

  /* -------------------------------------------------------------- */
  /* Modales                                                        */
  /* -------------------------------------------------------------- */
  bindModals() {
    this.confirm = new ConfirmModal(document.getElementById("confirmModal"));

    this.qrModal = new QrModal(
      document.getElementById("qrModal"),
      document.getElementById("qrBtn"),
      document.getElementById("qrClose"),
      document.getElementById("qrRefresh"),
      () => this.resetSession(),
    );

    this.usersModal = new UsersModal(
      document.getElementById("usersModal"),
      document.getElementById("usersBtn"),
      document.getElementById("usersClose"),
      (mensaje) => this.realtime?.send(mensaje),
    );
  }

  /* -------------------------------------------------------------- */
  /* Inicio de la sesión y WebSocket                                */
  /* -------------------------------------------------------------- */
  async startRealtime() {
    if (ROLE === "host") {
      const ok = await session.createHost({
        encendido: state.encendido,
        arduinoConectado: state.arduinoConectado,
        maxViewers: state.maxViewers,
      });
      if (!ok) return;

      this.openRealtime();
      return;
    }

    const data = await session.joinVisitor();
    if (!data) return;
    this.applyState(data);
    this.openRealtime();
  }

  openRealtime() {
    this.opened = false;
    this.realtime = new Realtime(session.sessionId, session.clientId, {
      onMessage: (message) => this.handleServerMessage(message),
      onOpen: () => {
        this.opened = true;
      },
      onClose: () => this.handleRealtimeClose(),
      onError: (event) => {
        toast.show("Error en websocket");
        console.error(event);
      },
    });
  }

  // Se llama solo si el cierre NO fue intencional (ver realtime.js).
  handleRealtimeClose() {
    if (ROLE !== "host") return; // la reconexión del visitor la maneja su rama

    if (this.opened) {
      // Cayó después de conectar: recargamos para reconectar con los ids.
      toast.show("Conexión perdida. Reintentando...");
      setTimeout(() => window.location.reload(), 1000);
      return;
    }

    // Nunca abrió: la sesión ya no existe (expiró, reset o reinicio server).
    if (this.recovered) {
      toast.show("No se pudo conectar a una sesión.");
      return;
    }
    this.recovered = true;
    toast.show("La sesión ya no existe. Creando una nueva...");
    session.reset();
    this.startRealtime();
  }

  /* -------------------------------------------------------------- */
  /* Reinicio de sesión (botón del modal QR)                        */
  /* -------------------------------------------------------------- */
  async resetSession() {
    const ok = await this.confirm.ask({
      title: "Nueva sesión",
      text: "Se expulsará a todos los invitados y se creará una sesión nueva conservando el estado. ¿Continuar?",
    });
    if (!ok) return;

    if (this.realtime) this.realtime.close();

    const done = await session.restart();
    if (!done) {
      session.reset();
      const created = await session.createHost({
        encendido: state.encendido,
        arduinoConectado: state.arduinoConectado,
        maxViewers: state.maxViewers,
      });
      if (!created) {
        toast.show("No se pudo reiniciar la sesión.");
        return;
      }
    }

    this.recovered = false;
    this.openRealtime();
    if (this.qrModal) this.qrModal.render();
    toast.show("Sesión reiniciada");
  }

  /* -------------------------------------------------------------- */
  /* Mensajes del servidor                                          */
  /* -------------------------------------------------------------- */
  handleServerMessage(mensaje) {
    const mensajes = {
      cambiarLED: ({ ledEncendido }) => {
        this.applyState({ encendido: ledEncendido });
      },
      cambiarArduino: ({ arduinoConectado }) => {
        this.applyState({ arduinoConectado });
      },
      cambiarMaxViewers: ({ maxViewers }) => {
        this.applyState({ maxViewers });
      },
      cambiarHostConectado: ({ hostConectado }) => {
        this.applyState({ hostConectado });
      },
      clientes: (lista) => {
        this.usersModal.renderLista(lista);
      },
      // CORREGIDO: el backend ahora manda el motivo en "expulsado". Antes se
      // usaba window.close() (que no cierra pestañas normales) y el visitor
      // quedaba "vivo". Ahora se limpia la sesión, se cierra el WS sin
      // reconectar y se deshabilita la interacción.
      expulsado: ({ motivo } = {}) => this.handleExpulsado(motivo),
    };
    const ejecutar =
      mensajes[mensaje.tipo] ??
      (() => {
        toast.show(`${mensaje.tipo} no es un mensaje valido`);
      });
    ejecutar(mensaje.dato);
  }

  handleExpulsado(motivo) {
    toast.show(motivo || "La sesión se cerró");
    session.reset();
    if (this.realtime) this.realtime.close();
    ledBtn.disabled = true;
    connectBtn.disabled = true;
  }
}

const app = new App();
app.init();
