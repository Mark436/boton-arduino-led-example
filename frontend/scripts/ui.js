/* ------------------------------------------------------------------ */
/* Componentes de interfaz: Toast y modales (QR y usuarios)            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Toast (notificaciones centradas)                                    */
/* ------------------------------------------------------------------ */
class Toast {
  constructor(element) {
    this.el = element;
    this.timer = null;
  }

  show(message, duration = 2000) {
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
  constructor(overlay, openBtn, closeBtn, refreshBtn, onReset) {
    super(overlay);
    this.contentEl = document.getElementById("qrContent");
    openBtn.addEventListener("click", () => this.open());
    closeBtn.addEventListener("click", () => this.close());
    if (refreshBtn && onReset) {
      refreshBtn.addEventListener("click", () => onReset());
    }
  }

  open() {
    this.render();
    super.open();
  }

  render() {
    this.contentEl.replaceChildren();

    if (!session.sessionId) {
      this.contentEl.textContent = "No hay una sesión activa todavía.";
      return;
    }

    const url = session.visitorUrl();

    // El QR (o la URL) es un enlace: al hacer clic lleva al visitor,
    // además de poder escanearse.
    const link = document.createElement("a");
    link.className = "qr-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = url;

    // QR generado en el navegador (qrcode-generator por CDN).
    if (typeof qrcode === "function") {
      try {
        const qr = qrcode(0, "M");
        qr.addData(url);
        qr.make();
        link.innerHTML = qr.createSvgTag({
          cellSize: 4,
          margin: 2,
          scalable: true,
        });
        this.contentEl.appendChild(link);
        return;
      } catch (_err) {
        // cae al texto si algo falla
      }
    }

    // Fallback sin librería / sin internet: mostrar la URL.
    const code = document.createElement("code");
    code.className = "qr-url";
    code.textContent = url;
    link.appendChild(code);
    this.contentEl.appendChild(link);
  }
}

/* ------------------------------------------------------------------ */
/* Modal de confirmación (devuelve una promesa con true/false)         */
/* ------------------------------------------------------------------ */
class ConfirmModal {
  constructor(overlay) {
    this.overlay = overlay;
    this.titleEl = document.getElementById("confirmTitle");
    this.textEl = document.getElementById("confirmText");
    this.okBtn = document.getElementById("confirmOk");
    this.cancelBtn = document.getElementById("confirmCancel");
    this._resolve = null;

    this.okBtn.addEventListener("click", () => this._close(true));
    this.cancelBtn.addEventListener("click", () => this._close(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._close(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._close(false);
    });
  }

  ask({ title = "Confirmar", text = "" } = {}) {
    this.titleEl.textContent = title;
    this.textEl.textContent = text;
    this.overlay.hidden = false;
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  _close(value) {
    if (this.overlay.hidden) return;
    this.overlay.hidden = true;
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve(value);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Modal de usuarios: lista IDs y permite eliminar                     */
/* ------------------------------------------------------------------ */
class UsersModal extends Modal {
  constructor(overlay, openBtn, closeBtn, enviar) {
    super(overlay);
    this.enviar = enviar;
    this.listEl = document.getElementById("usersList");
    this.countEl = document.getElementById("usersCount");
    this.maxValueEl = document.getElementById("maxUsersValue");
    this.maxDecBtn = document.getElementById("maxUsersDec");
    this.maxIncBtn = document.getElementById("maxUsersInc");

    openBtn.addEventListener("click", () => this.open());
    closeBtn.addEventListener("click", () => this.close());
    this.maxDecBtn.addEventListener("click", () => this.changeMax(-1));
    this.maxIncBtn.addEventListener("click", () => this.changeMax(1));
    this.maxValueEl.addEventListener("change", () =>
      this.setMax(this.maxValueEl.value),
    );
  }

  open() {
    this.renderMax();
    super.open();
    this.refresh();
  }

  renderMax() {
    this.maxValueEl.value = state.maxViewers;
    this.maxDecBtn.disabled = state.maxViewers <= 1;
  }

  changeMax(delta) {
    return this.setMax(state.maxViewers + delta);
  }

  setMax(value) {
    const next = Math.max(1, Math.floor(Number(value) || 1));

    if (next === state.maxViewers) {
      this.renderMax();
      return;
    }

    // Actualización optimista: el backend es la fuente de verdad y confirmará
    // con un mensaje "cambiarMaxViewers".
    state.maxViewers = next;
    this.renderMax();
    this.enviar({ tipo: "cambiarMaxViewers", dato: { maxViewers: next } });
    toast.show(`Máximo de invitados: ${next}`);
  }
  // Pinta la lista cuando el servidor responde a "pedirClientes".
  renderLista(lista) {
    this.listEl.replaceChildren();

    const usuarios = lista.filter(
      ({ role }) => role.toUpperCase() === "VISITOR",
    );
    this.countEl.textContent = `${usuarios.length} usuario(s) en la sesión`;

    if (usuarios.length === 0) {
      const empty = document.createElement("li");
      empty.className = "users-empty";
      empty.textContent = "Nadie más en la sesión todavía.";
      this.listEl.appendChild(empty);
      return;
    }

    for (const usuario of usuarios) {
      this.listEl.appendChild(this._buildRow(usuario));
    }
  }

  // Pide la lista al servidor; el pintado llega por "clientes" -> renderLista.
  refresh() {
    this.listEl.replaceChildren();
    this.countEl.textContent = "Cargando...";
    this.enviar({ tipo: "pedirClientes", dato: {} });
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
    removeBtn.addEventListener("click", () => {
      removeBtn.disabled = true;
      this.enviar({ tipo: "expulsar", dato: { clientId: user.clientId } });
      this.refresh();
    });

    row.append(id, role, removeBtn);
    return row;
  }
}
