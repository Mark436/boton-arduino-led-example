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

  static _headers() {}

  static async list() {}

  static async remove(clientId) {}

  static async setMaxViewers(max) {}
}
