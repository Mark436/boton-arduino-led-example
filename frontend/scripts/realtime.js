/* ------------------------------------------------------------------ */
/* Realtime (WebSocket)                                                */
/*                                                                    */
/* Envuelve el socket de sesión. Distingue un cierre propio de uno     */
/* inesperado con `intentional` y avisa cuando el handshake abrió      */
/* (onOpen) para que App sepa si el fallo fue al conectar o una caída. */
/* ------------------------------------------------------------------ */
class Realtime {
  constructor(
    sessionId,
    clientId,
    {
      onMessage = () => {},
      onOpen = () => {},
      onClose = () => {},
      onError = (event) => console.error(event),
    } = {},
  ) {
    this.intentional = false;
    this.opened = false;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(
      `${proto}://${location.host}/ws/${sessionId}?client=${clientId}`,
    );

    this.ws.onopen = () => {
      this.opened = true;
      onOpen();
    };
    this.ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    this.ws.onerror = (event) => onError(event);
    this.ws.onclose = () => {
      if (!this.intentional) onClose();
    };
  }

  send(mensaje) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(mensaje));
    }
  }

  // Cierra a propósito: el onclose no dispara la lógica de reconexión.
  close() {
    this.intentional = true;
    this.ws.close();
  }
}
