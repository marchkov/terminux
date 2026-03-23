import crypto from "node:crypto";

export function createTerminalTokenStore() {
  const tokens = new Map();

  function cleanup() {
    const now = Date.now();
    for (const [token, payload] of tokens.entries()) {
      if (payload.expiresAt <= now) {
        tokens.delete(token);
      }
    }
  }

  return {
    issue(payload, ttlMs = 10 * 60 * 1000) {
      cleanup();
      const token = crypto.randomBytes(24).toString("hex");
      tokens.set(token, {
        ...payload,
        expiresAt: Date.now() + ttlMs
      });
      return token;
    },
    read(token) {
      cleanup();
      if (!token) return null;
      const payload = tokens.get(token);
      if (!payload) return null;
      if (payload.expiresAt <= Date.now()) {
        tokens.delete(token);
        return null;
      }
      return payload;
    },
    revoke(token) {
      tokens.delete(token);
    }
  };
}
