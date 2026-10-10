/* ------------------------------------------------------------------ */
/* Session (frontend): ciclo de vida de la sala                        */
/*                                                                    */
/* Encapsula los IDs, la persistencia en sessionStorage, la creación   */
/* de la sesión del host (POST /session), la entrada del visitor       */
/* (POST /session/{id}) y la URL que viaja en el QR.                   */
/* ------------------------------------------------------------------ */

class Session {
  constructor() {
    this.sessionId = sessionStorage.getItem("sessionId");
    this.clientId = sessionStorage.getItem("clientId");

    // El QR apunta a /visitor?sessionId=<id>: el visitor llega identificado.
    const urlSessionId = new URLSearchParams(window.location.search).get(
      "sessionId",
    );
    if (urlSessionId) {
      this.sessionId = urlSessionId;
      sessionStorage.setItem("sessionId", urlSessionId);
    }
    this.role = ROLE;
  }

  get ready() {
    return Boolean(this.sessionId && this.clientId);
  }

  save() {
    sessionStorage.setItem("sessionId", this.sessionId ?? "");
    sessionStorage.setItem("clientId", this.clientId ?? "");
  }

  /* Deja al cliente "como nuevo" (borra ids + sessionStorage). */
  reset() {
    this.sessionId = null;
    this.clientId = null;
    sessionStorage.removeItem("sessionId");
    sessionStorage.removeItem("clientId");
  }

  /* El host reinicia la sesión: el backend expulsa a todos los visitors,
     borra la sala vieja y crea una nueva conservando el estado. Devuelve los
     ids nuevos o false si falló. */
  async restart() {
    if (!this.sessionId || !this.clientId) return false;

    try {
      const res = await fetch(
        `/session/${this.sessionId}/reset?client=${this.clientId}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error();

      const data = await res.json();
      this.sessionId = data.sessionId;
      this.clientId = data.clientId;
      this.save();
      return true;
    } catch (_err) {
      return false;
    }
  }

  /* URL que irá dentro del QR. */
  visitorUrl() {
    return this.sessionId && this.role === "host"
      ? `${window.location.origin}/visitor?sessionId=${this.sessionId}`
      : "";
  }

  /* El host crea su sesión y guarda sessionId/clientId. */
  async createHost(initial = {}) {
    if (this.ready) return true;

    try {
      const res = await fetch("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encendido: initial.encendido ?? false,
          arduinoConectado: initial.arduinoConectado ?? false,
          maxViewers: initial.maxViewers ?? 1,
        }),
      });
      if (!res.ok) throw new Error();

      const data = await res.json();
      this.sessionId = data.sessionId;
      this.clientId = data.clientId;
      this.save();
      return true;
    } catch (_err) {
      toast.show("No se pudo crear la sesión en el servidor.");
      return false;
    }
  }

  /* El visitor entra a la sala. Devuelve el estado inicial o null. */
  async joinVisitor() {
    if (!this.sessionId) {
      toast.show("Falta el sessionId para entrar a la sesión.");
      return null;
    }

    try {
      const res = await fetch(`/session/${this.sessionId}`, { method: "POST" });
      if (!res.ok) {
        toast.show(
          res.status === 406
            ? "La sesión está llena."
            : "No se pudo entrar a la sesión.",
        );
        return null;
      }

      const data = await res.json();
      this.clientId = data.clientId;
      this.save();
      return data;
    } catch (_err) {
      toast.show("No se pudo contactar con el servidor.");
      return null;
    }
  }
}

const session = new Session();
