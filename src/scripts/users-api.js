/* ------------------------------------------------------------------ */
/* API de usuarios (REST provisional)                                  */
/* ------------------------------------------------------------------ */
// PENDIENTE (5): borrar UsersApi y reemplazarlo por mensajes WS:
//   - list()           -> enviar {tipo:"pedirClientes"} y esperar {tipo:"clientes"}
//   - remove(id)       -> enviar {tipo:"expulsar", dato:{clientId:id}}
//   - setMaxViewers(m) -> enviar {tipo:"cambiarMaxViewers", dato:{maxViewers:m}}
// El backend ya ignora esos mensajes si no vienen del host (role check).
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
      res = await fetch(`${this._base()}/clients`, {
        headers: this._headers(),
      });
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

  static async setMaxViewers(max) {
    let res;
    try {
      res = await fetch(this._base(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...this._headers() },
        body: JSON.stringify({ maxViewers: max }),
      });
    } catch (_err) {
      throw new Error("No se pudo contactar con el servidor.");
    }

    if (res.status === 404 || res.status === 405 || res.status === 501) {
      throw new Error(
        "Cambiar el máximo no disponible todavía (backend en desarrollo).",
      );
    }
    if (!res.ok)
      throw new Error("No se pudo actualizar el máximo de usuarios.");

    return true;
  }
}
