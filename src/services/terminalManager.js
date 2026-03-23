import crypto from "node:crypto";
import { Client } from "ssh2";
import { getTerminalSessionConfig } from "./sessions.js";

const MAX_HISTORY_CHARS = 250000;
const IDLE_TTL_MS = 15 * 60 * 1000;

function payloadSize(payload) {
  return JSON.stringify(payload).length;
}

export function createTerminalManager({ db, config }) {
  const sessions = new Map();

  function keyFor(userId, sessionId) {
    return `${userId}:${sessionId}`;
  }

  function broadcast(entry, payload, { persist = true } = {}) {
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

  function scheduleCleanup(entry) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = setTimeout(() => {
      try { entry.channel?.close(); } catch {}
      try { entry.conn?.end(); } catch {}
      sessions.delete(entry.key);
    }, IDLE_TTL_MS);
  }

  function connectEntry(entry) {
    const sshConfig = entry.sshConfig;
    entry.status = "connecting";
    broadcast(entry, {
      type: "status",
      status: "connecting",
      message: `Connecting to ${sshConfig.host}:${sshConfig.port}...`
    });

    const conn = new Client();
    entry.conn = conn;

    conn.on("ready", () => {
      entry.status = "connected";
      broadcast(entry, {
        type: "status",
        status: "connected",
        message: `Connected to ${sshConfig.name}`
      });

      conn.shell({ term: "xterm-256color", cols: 120, rows: 32 }, (error, stream) => {
        if (error) {
          entry.status = "error";
          broadcast(entry, {
            type: "status",
            status: "error",
            message: `Failed to open remote shell: ${error.message}`
          });
          scheduleCleanup(entry);
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
          entry.status = "closed";
          entry.channel = null;
          broadcast(entry, {
            type: "status",
            status: "closed",
            message: "SSH session closed."
          });
          if (entry.clients.size === 0) {
            scheduleCleanup(entry);
          }
        });
      });
    });

    conn.on("error", (error) => {
      entry.status = "error";
      broadcast(entry, {
        type: "status",
        status: "error",
        message: `SSH connection failed: ${error.message}`
      });
      if (entry.clients.size === 0) {
        scheduleCleanup(entry);
      }
    });

    conn.on("close", () => {
      if (entry.status === "connected") {
        entry.status = "closed";
      }
      broadcast(entry, {
        type: "status",
        status: "closed",
        message: "SSH connection ended."
      });
      if (entry.clients.size === 0) {
        scheduleCleanup(entry);
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
        clearTimeout(existing.cleanupTimer);
        if (existing.status !== "error" && existing.status !== "closed") {
          return existing;
        }

        try { existing.channel?.close(); } catch {}
        try { existing.conn?.end(); } catch {}
        sessions.delete(key);
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
        cleanupTimer: null
      };

      sessions.set(key, entry);
      connectEntry(entry);
      return entry;
    },

    attachClient(entry, socket) {
      clearTimeout(entry.cleanupTimer);
      entry.clients.add(socket);

      for (const payload of entry.history) {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify(payload));
        }
      }

      socket.on("message", (raw) => {
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
          scheduleCleanup(entry);
        }
      });
    }
  };
}

