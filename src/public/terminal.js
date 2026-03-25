import { Terminal } from "/vendor/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "/vendor/@xterm/addon-fit/lib/addon-fit.mjs";

function initTerminal() {
  const mount = document.querySelector(".js-terminal");
  const statusEl = document.querySelector(".js-terminal-status");
  const reconnectButton = document.querySelector(".js-terminal-reconnect");
  const banner = document.querySelector(".js-terminal-banner");
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

  let socket = null;
  let wasConnected = false;
  let manualReconnectPending = false;
  let disposeRequested = false;

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

  function setBanner(message = "", kind = "info") {
    if (!banner) return;
    banner.textContent = message;
    banner.className = `terminal-banner js-terminal-banner terminal-banner-${kind}`;
    banner.classList.toggle("is-hidden", !message);
  }

  function setStatus(text, state = "neutral") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.terminalState = state;
    statusEl.className = `status-pill js-terminal-status status-pill-${state}`;
  }

  function setReconnectEnabled(enabled) {
    if (reconnectButton) reconnectButton.disabled = !enabled;
  }

  function sendResize() {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
    }
  }

  function connect(isManualReconnect = false) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      setStatus("Already connected", "connected");
      setBanner("Live SSH session is already attached.", "success");
      return;
    }

    if (socket && socket.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (isManualReconnect) {
      writeOutput("\r\n[terminux] reconnect requested...\r\n");
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}/terminal/ws?token=${encodeURIComponent(token)}`);

    setStatus(isManualReconnect ? "Reconnecting..." : "Opening websocket...", "connecting");
    setBanner(isManualReconnect ? "Trying to reattach or reopen the SSH session..." : "Preparing terminal transport...", "info");
    setReconnectEnabled(false);

    socket.addEventListener("open", () => {
      setStatus(isManualReconnect ? "Reconnecting..." : "Opening websocket...", "connecting");
      fit();
      sendResize();
    });

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "data") {
        writeOutput(payload.data);
        return;
      }

      if (payload.type === "lifecycle") {
        if (payload.state === "connected" && payload.hasHistory) {
          wasConnected = true;
          setStatus("Connected", "connected");
          setBanner("Reattached to the active background session.", "success");
          setReconnectEnabled(true);
          return;
        }

        if ((payload.state === "closed" || payload.state === "error") && payload.ttlMs) {
          const seconds = Math.max(1, Math.round(payload.ttlMs / 1000));
          setBanner(`Previous terminal state is still available for about ${seconds}s while you decide whether to reconnect.`, payload.state === "error" ? "error" : "warning");
          setReconnectEnabled(true);
          return;
        }

        return;
      }

      if (payload.type !== "status") return;

      const status = payload.status || "info";
      const message = payload.message || "Terminal update";

      if (status === "connecting") {
        setStatus("Connecting...", "connecting");
        setBanner(message, "info");
        return;
      }

      if (status === "connected") {
        wasConnected = true;
        setStatus("Connected", "connected");
        setBanner("Live SSH session is ready.", "success");
        setReconnectEnabled(true);
        return;
      }

      if (status === "closed") {
        setStatus("Disconnected", "disconnected");
        setBanner(message, "warning");
        setReconnectEnabled(true);
        return;
      }

      if (status === "error") {
        setStatus("Connection error", "error");
        setBanner(message, "error");
        writeOutput(`\r\n[terminux] ${message}\r\n`);
        setReconnectEnabled(true);
        return;
      }

      setStatus(message, "neutral");
    });

    socket.addEventListener("close", () => {
      const shouldReconnect = manualReconnectPending && !disposeRequested;
      socket = null;

      if (shouldReconnect) {
        manualReconnectPending = false;
        connect(true);
        return;
      }

      if (disposeRequested) {
        return;
      }

      const message = wasConnected
        ? "Terminal transport closed. The SSH session may still be alive in the background for a while."
        : "Terminal transport closed before the session finished opening.";
      setStatus("Disconnected", "disconnected");
      setBanner(message, "warning");
      setReconnectEnabled(true);
    });

    socket.addEventListener("error", () => {
      if (disposeRequested) return;
      setStatus("Websocket error", "error");
      setBanner("Websocket transport failed. Try reconnecting.", "error");
      writeOutput("\r\n[terminux] Websocket transport error.\r\n");
      setReconnectEnabled(true);
    });
  }

  fit();
  terminal.focus();
  setReconnectEnabled(false);
  connect(false);

  terminal.onData((data) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "input", data }));
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    fit();
    sendResize();
  });
  resizeObserver.observe(mount);

  reconnectButton?.addEventListener("click", () => {
    if (socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    manualReconnectPending = true;
    setReconnectEnabled(false);
    setStatus("Reconnecting...", "connecting");
    setBanner("Closing the current transport and asking the server to resume or reopen the session...", "info");

    if (!socket || socket.readyState >= WebSocket.CLOSING) {
      manualReconnectPending = false;
      connect(true);
      return;
    }

    try {
      socket.close();
    } catch {
      manualReconnectPending = false;
      connect(true);
    }
  });

  window.addEventListener("beforeunload", () => {
    disposeRequested = true;
    resizeObserver.disconnect();
    try {
      socket?.close();
    } catch {}
    terminal.dispose();
  });
}

initTerminal();
