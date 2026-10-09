/**
 * Librería de comunicación con el Arduino vía Web Serial API.
 * No conoce la interfaz: solo conecta, desconecta y envía datos al puerto.
 */
class SerialConnection {
  constructor({ baudRate = 9600, dev = false } = {}) {
    this.port = null;
    this.connected = false;
    this.connecting = false;
    this.baudRate = baudRate;
    this.dev = dev;
    this.onStatusChange = null;
  }

  get supported() {
    return "serial" in navigator;
  }

  async connect() {
    if (this.connected || this.connecting) return this.connected;

    if (this.dev) {
      return this._connectDev();
    }

    if (!this.supported) {
      this._notify("Tu navegador no soporta Web Serial (usa Chrome o Edge)");
      return false;
    }

    this.connecting = true;
    this._notify("Conectando...");

    try {
      this.port = await navigator.serial.requestPort({});
      await this.port.open({ baudRate: this.baudRate });

      this.connected = true;
      this._notify("Conectado al puerto COM");
      return true;
    } catch (_err) {
      this.port = null;
      this.connected = false;
      this._notify("Error al conectar");
      return false;
    } finally {
      this.connecting = false;
    }
  }

  async _connectDev() {
    this.connecting = true;
    this._notify("Conectando... (modo dev)");

    await new Promise((resolve) => setTimeout(resolve, 400));

    this.connecting = false;
    this.connected = true;
    console.log(
      `[serial:dev] conexión simulada @${this.baudRate} (sin Arduino real)`,
    );
    this._notify("Conectado (modo dev)");
    return true;
  }

  async disconnect() {
    if (this.dev) {
      if (!this.connected) return true;
      this.connected = false;
      console.log("[serial:dev] desconexión simulada");
      this._notify("Desconectado (modo dev)");
      return true;
    }

    if (this.port === null) return true;

    try {
      await this.port.close();
    } catch (_err) {
      this._notify("Error al desconectar");
      return false;
    }

    this.port = null;
    this.connected = false;
    this._notify("Desconectado");
    return true;
  }

  async write(data) {
    if (!this.connected) return false;

    if (this.dev) {
      const led = data === "1" ? "ON" : "OFF";
      console.log(`[serial:dev] TX "${data}" → LED ${led}`);
      return true;
    }

    const encoder = new TextEncoder();
    const writer = this.port.writable.getWriter();

    try {
      await writer.write(encoder.encode(data));
    } catch (_err) {
      this._notify("Error al escribir");
      return false;
    } finally {
      writer.releaseLock();
    }

    return true;
  }

  async setLed(on) {
    return this.write(on ? "1" : "0");
  }

  async encender() {
    return this.setLed(true);
  }

  async apagar() {
    return this.setLed(false);
  }

  _notify(message) {
    if (this.onStatusChange) {
      this.onStatusChange(message, this.connected);
    }
  }
}
