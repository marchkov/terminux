import crypto from "node:crypto";
import { Client } from "ssh2";
import { getTerminalSessionConfig } from "./sessions.js";

const MAX_HISTORY_CHARS = 250000;
const IDLE_TTL_MS = 15 * 60 * 1000;
const CLOSED_TTL_MS = 3 * 60 * 1000;

function payloadSize(payload) {
  return JSON.stringify(payload).length;
}

export function createTerminalManager({ db, config }) {
  const sessions = new Map();

  function keyFor(userId, sessionId) {
    return `${userId}:${sessionId}`;
  }

  function clearCleanup(entry) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
    entry.cleanupDeadline = null;
    entry.cleanupReason = null;
  }

  function destroyEntry(entry) {
    if (!entry || entry.destroyed) return;
    entry.destroyed = true;
    clearCleanup(entry);
    sessions.delete(entry.key);

    try { entry.channel?.close(); } catch {}
    try { entry.conn?.end(); } catch {}

    entry.channel = null;
    entry.conn = null;
    entry.clients.clear();
  }

  function broadcast(entry, payload, { persist = true } = {}) {
    if (entry.destroyed) return;

    if (persist) {
      entry.history.push(payload);
      entry.historySize += payloadSize(payload);
      while (entry.historySize > MAX_HISTORY_CHARS && entry.history.length > 1) {
        const removed = entry.history.shift();
        entry.historySize -= payloadSize(removed);
      }
    }

    for (const client of entry.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify(payload));
      }
    }
  }

  function pushStatus(entry, status, message, { persist = true } = {}) {
    const signature = `${status}:${message}`;
    entry.status = status;
    entry.statusMessage = message;
    if (entry.lastStatusSignature === signature) {
      return;
    }

    entry.lastStatusSignature = signature;
    broadcast(entry, {
      type: "status",
      status,
      message
    }, { persist });
  }

  function scheduleCleanup(entry, { reason = "idle", ttlMs = IDLE_TTL_MS } = {}) {
    if (entry.destroyed) return;

    clearCleanup(entry);
    entry.cleanupReason = reason;
    entry.cleanupDeadline = Date.now() + ttlMs;
    entry.cleanupTimer = setTimeout(() => {
      destroyEntry(entry);
    }, ttlMs);
  }

  function scheduleDetachedCleanup(entry) {
    const ttlMs = entry.status === "connected" || entry.status === "connecting"
      ? IDLE_TTL_MS
      : CLOSED_TTL_MS;
    const reason = entry.status === "connected" || entry.status === "connecting"
      ? "idle"
      : entry.status;

    scheduleCleanup(entry, { reason, ttlMs });
  }

  function lifecyclePayload(entry) {
    const ttlMs = entry.cleanupDeadline ? Math.max(0, entry.cleanupDeadline - Date.now()) : null;
    return {
      type: "lifecycle",
      state: entry.status,
      message: entry.statusMessage,
      cleanupReason: entry.cleanupReason,
      ttlMs,
      hasHistory: entry.history.length > 0,
      attachedClients: entry.clients.size
    };
  }

  function connectEntry(entry) {
    const sshConfig = entry.sshConfig;
    clearCleanup(entry);
    pushStatus(entry, "connecting", `Connecting to ${sshConfig.host}:${sshConfig.port}...`);

    const conn = new Client();
    entry.conn = conn;
    entry.channel = null;

    conn.on("ready", () => {
      if (entry.destroyed) return;

      pushStatus(entry, "connected", `Connected to ${sshConfig.name}`);

      conn.shell({ term: "xterm-256color", cols: 120, rows: 32 }, (error, stream) => {
        if (entry.destroyed) return;

        if (error) {
          pushStatus(entry, "error", `Failed to open remote shell: ${error.message}`);
          if (entry.clients.size === 0) {
            scheduleDetachedCleanup(entry);
          }
          return;
        }

        entry.channel = stream;

        stream.on("data", (data) => {
          broadcast(entry, { type: "data", data: data.toString("utf8") });
        });

        if (stream.stderr) {
          stream.stderr.on("data", (data) => {
            broadcast(entry, { type: "data", data: data.toString("utf8") });
          });
        }

        stream.on("close", () => {
          if (entry.destroyed) return;
          entry.channel = null;
          pushStatus(entry, "closed", "Remote shell closed.");
          if (entry.clients.size === 0) {
            scheduleDetachedCleanup(entry);
          }
        });
      });
    });

    conn.on("error", (error) => {
      if (entry.destroyed) return;
      pushStatus(entry, "error", `SSH connection failed: ${error.message}`);
      if (entry.clients.size === 0) {
        scheduleDetachedCleanup(entry);
      }
    });

    conn.on("close", () => {
      if (entry.destroyed) return;
      entry.conn = null;
      entry.channel = null;
      if (entry.status !== "error") {
        pushStatus(entry, "closed", "SSH connection ended.");
      }
      if (entry.clients.size === 0) {
        scheduleDetachedCleanup(entry);
      }
    });

    const connectPayload = {
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3
    };

    if (sshConfig.authType === "password") {
      connectPayload.password = sshConfig.password;
    } else {
      connectPayload.privateKey = sshConfig.privateKey;
      if (sshConfig.passphrase) {
        connectPayload.passphrase = sshConfig.passphrase;
      }
    }

    conn.connect(connectPayload);
  }

  return {
    ensureSession(currentUser, sessionId) {
      const key = keyFor(currentUser.id, sessionId);
      const existing = sessions.get(key);
      if (existing) {
        clearCleanup(existing);
        if (existing.status !== "error" && existing.status !== "closed") {
          return existing;
        }

        destroyEntry(existing);
      }

      const sshConfig = getTerminalSessionConfig(db, currentUser, sessionId, config.masterKey);
      if (!sshConfig) {
        return null;
      }

      const entry = {
        id: crypto.randomBytes(12).toString("hex"),
        key,
        sshConfig,
        conn: null,
        channel: null,
        clients: new Set(),
        history: [],
        historySize: 0,
        status: "idle",
        statusMessage: "Waiting for connection",
        lastStatusSignature: null,
        cleanupTimer: null,
        cleanupDeadline: null,
        cleanupReason: null,
        destroyed: false
      };

      sessions.set(key, entry);
      connectEntry(entry);
      return entry;
    },

    attachClient(entry, socket) {
      clearCleanup(entry);
      entry.clients.add(socket);

      for (const payload of entry.history) {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify(payload));
        }
      }

      if (socket.readyState === 1) {
        socket.send(JSON.stringify(lifecyclePayload(entry)));
      }

      socket.on("message", (raw) => {
        if (entry.destroyed) return;

        try {
          const message = JSON.parse(raw.toString());
          if (message.type === "input" && entry.channel) {
            entry.channel.write(message.data || "");
          }
          if (message.type === "resize" && entry.channel) {
            const cols = Number(message.cols || 120);
            const rows = Number(message.rows || 32);
            entry.channel.setWindow(rows, cols, 0, 0);
          }
        } catch (error) {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({
              type: "status",
              status: "error",
              message: `Invalid terminal message: ${error.message}`
            }));
          }
        }
      });

      socket.on("close", () => {
        entry.clients.delete(socket);
        if (entry.clients.size === 0) {
          scheduleDetachedCleanup(entry);
        }
      });
    }
  };
}
