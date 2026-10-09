/* ------------------------------------------------------------------ */
/* WebSocket (PENDIENTE 4)                                             */
/* ------------------------------------------------------------------ */

/* PARA QUÉ: envolver la conexión para que el resto del código solo
   llame a realtime.send({tipo, dato}) sin saber de WebSocket.
   DÓNDE SE USA: se instancia TRAS el join/create, con sessionId y
   clientId, pasándole handleServerMessage (ver script.js).

   Esqueleto (descomenta y completa):

class Realtime {
  constructor(sessionId, clientId, onMessage) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(
      proto + "://" + location.host + "/ws/" + sessionId +
        "?client=" + clientId,
    );
    this.ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    this.ws.onclose = () => {};   // aquí reconectar si quieres
    this.ws.onerror = () => console.error("Error de WebSocket");
  }

  send(mensaje) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(mensaje));
    }
  }
}

*/
