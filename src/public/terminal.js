import { Terminal } from "/vendor/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "/vendor/@xterm/addon-fit/lib/addon-fit.mjs";

function initTerminal() {
  const mount = document.querySelector(".js-terminal");
  const statusEl = document.querySelector(".js-terminal-status");
  if (!mount) return;

  const token = mount.dataset.terminalToken;
  const terminalFontSize = Number(mount.dataset.terminalFontSize || 14);
  if (!token) {
    if (statusEl) statusEl.textContent = "No terminal token available.";
    return;
  }

  const terminal = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontSize: Number.isFinite(terminalFontSize) ? terminalFontSize : 14,
    scrollback: 10000,
    theme: {
      background: "#08111a",
      foreground: "#dbe7f3",
      cursor: "#68d2b3",
      black: "#0b1218",
      brightBlack: "#567086",
      red: "#f97373",
      green: "#67d38f",
      yellow: "#f7c35f",
      blue: "#7dd3fc",
      magenta: "#c084fc",
      cyan: "#68d2b3",
      white: "#edf3f8"
    }
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(mount);

  const viewport = () => mount.querySelector(".xterm-viewport");
  const isNearBottom = () => {
    const element = viewport();
    if (!element) return true;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distance < 24;
  };

  const fit = () => {
    requestAnimationFrame(() => {
      fitAddon.fit();
      terminal.scrollToBottom();
    });
  };

  const writeOutput = (data) => {
    const stickToBottom = isNearBottom();
    terminal.write(data, () => {
      if (stickToBottom) {
        terminal.scrollToBottom();
      }
    });
  };

  fit();
  terminal.focus();

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/terminal/ws?token=${encodeURIComponent(token)}`);

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  socket.addEventListener("open", () => {
    setStatus("Opening websocket...");
    fit();
    socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "data") {
      writeOutput(payload.data);
      return;
    }

    if (payload.type === "status") {
      setStatus(payload.message || payload.status || "Terminal update");
      if (payload.status === "error") {
        writeOutput(`\r\n[terminux] ${payload.message}\r\n`);
      }
    }
  });

  socket.addEventListener("close", () => {
    setStatus("Terminal disconnected.");
  });

  socket.addEventListener("error", () => {
    setStatus("Websocket error.");
    writeOutput("\r\n[terminux] Websocket transport error.\r\n");
  });

  terminal.onData((data) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "input", data }));
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    fit();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
    }
  });
  resizeObserver.observe(mount);

  window.addEventListener("beforeunload", () => {
    resizeObserver.disconnect();
    socket.close();
    terminal.dispose();
  });
}

initTerminal();
