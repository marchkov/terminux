import { decryptSecret, encryptSecret } from "./encryption.js";

export function listOwnedSessions(db, userId) {
  return db.prepare(`
    SELECT s.id, s.owner_user_id, s.group_id, s.name, s.host, s.port, s.username, s.auth_type,
           s.notes, s.created_at, s.updated_at, g.name AS group_name
    FROM ssh_sessions s
    LEFT JOIN session_groups g ON g.id = s.group_id
    WHERE s.owner_user_id = ?
    ORDER BY COALESCE(g.sort_order, 999999) ASC, g.name COLLATE NOCASE ASC, s.name COLLATE NOCASE ASC
  `).all(userId);
}

export function listSharedSessions(db, userId) {
  return db.prepare(`
    SELECT s.id, s.owner_user_id, s.group_id, s.name, s.host, s.port, s.username, s.auth_type,
           s.notes, s.created_at, s.updated_at, owner.username AS owner_username
    FROM session_shares sh
    JOIN ssh_sessions s ON s.id = sh.session_id
    JOIN users owner ON owner.id = s.owner_user_id
    WHERE sh.shared_with_user_id = ?
    ORDER BY owner.username COLLATE NOCASE ASC, s.name COLLATE NOCASE ASC
  `).all(userId);
}

export function listSessionShares(db, sessionId) {
  return db.prepare(`
    SELECT u.id, u.username, u.role
    FROM session_shares sh
    JOIN users u ON u.id = sh.shared_with_user_id
    WHERE sh.session_id = ?
    ORDER BY u.username COLLATE NOCASE ASC
  `).all(sessionId);
}

export function getAccessibleSession(db, currentUser, sessionId) {
  if (!sessionId) {
    return null;
  }

  const base = db.prepare(`
    SELECT s.id, s.owner_user_id, s.group_id, s.name, s.host, s.port, s.username, s.auth_type,
           s.notes, s.created_at, s.updated_at,
           owner.username AS owner_username,
           g.name AS group_name
    FROM ssh_sessions s
    JOIN users owner ON owner.id = s.owner_user_id
    LEFT JOIN session_groups g ON g.id = s.group_id
    WHERE s.id = ?
  `).get(sessionId);

  if (!base) {
    return null;
  }

  if (currentUser.role === "admin" || base.owner_user_id === currentUser.id) {
    return base;
  }

  const shared = db.prepare(`
    SELECT 1
    FROM session_shares
    WHERE session_id = ? AND shared_with_user_id = ?
  `).get(sessionId, currentUser.id);

  return shared ? base : null;
}

export function getEditableSession(db, currentUser, sessionId) {
  const session = db.prepare(`
    SELECT s.*, g.name AS group_name
    FROM ssh_sessions s
    LEFT JOIN session_groups g ON g.id = s.group_id
    WHERE s.id = ?
  `).get(sessionId);

  if (!session) {
    return null;
  }

  if (currentUser.role !== "admin" && session.owner_user_id !== currentUser.id) {
    return null;
  }

  return {
    id: session.id,
    owner_user_id: session.owner_user_id,
    group_id: session.group_id,
    name: session.name,
    host: session.host,
    port: session.port,
    username: session.username,
    auth_type: session.auth_type,
    notes: session.notes,
    group_name: session.group_name
  };
}

export function getTerminalSessionConfig(db, currentUser, sessionId, masterKey) {
  const session = getAccessibleSession(db, currentUser, sessionId);
  if (!session) {
    return null;
  }

  const secrets = db.prepare(`
    SELECT encrypted_password, encrypted_private_key, encrypted_passphrase
    FROM ssh_sessions
    WHERE id = ?
  `).get(sessionId);

  return {
    id: session.id,
    ownerUserId: session.owner_user_id,
    name: session.name,
    host: session.host,
    port: session.port,
    username: session.username,
    authType: session.auth_type,
    password: decryptSecret(secrets.encrypted_password, masterKey),
    privateKey: decryptSecret(secrets.encrypted_private_key, masterKey),
    passphrase: decryptSecret(secrets.encrypted_passphrase, masterKey)
  };
}

function normalizePayload(payload) {
  return {
    name: String(payload.name || "").trim(),
    host: String(payload.host || "").trim(),
    username: String(payload.username || "").trim(),
    authType: payload.auth_type === "key" ? "key" : "password",
    notes: String(payload.notes || "").trim(),
    port: Number(payload.port || 22),
    groupId: payload.group_id ? Number(payload.group_id) : null,
    password: String(payload.password || ""),
    privateKey: String(payload.private_key || ""),
    passphrase: String(payload.passphrase || "")
  };
}

function validatePayload(db, ownerUserId, normalized) {
  if (!normalized.name || !normalized.host || !normalized.username || !Number.isInteger(normalized.port) || normalized.port < 1 || normalized.port > 65535) {
    return "session-invalid";
  }

  if (normalized.groupId) {
    const group = db.prepare("SELECT id FROM session_groups WHERE id = ? AND owner_user_id = ?").get(normalized.groupId, ownerUserId);
    if (!group) {
      return "group-not-found";
    }
  }

  return null;
}

export function createSessionSafe(db, config, ownerUserId, payload) {
  const normalized = normalizePayload(payload);
  const validationError = validatePayload(db, ownerUserId, normalized);
  if (validationError) return { error: validationError };

  if (normalized.authType === "password" && !normalized.password) {
    return { error: "session-password-required" };
  }

  if (normalized.authType === "key" && !normalized.privateKey) {
    return { error: "session-key-required" };
  }

  const result = db.prepare(`
    INSERT INTO ssh_sessions (
      owner_user_id, group_id, name, host, port, username, auth_type,
      encrypted_password, encrypted_private_key, encrypted_passphrase, notes
    ) VALUES (
      @owner_user_id, @group_id, @name, @host, @port, @username, @auth_type,
      @encrypted_password, @encrypted_private_key, @encrypted_passphrase, @notes
    )
  `).run({
    owner_user_id: ownerUserId,
    group_id: normalized.groupId,
    name: normalized.name,
    host: normalized.host,
    port: normalized.port,
    username: normalized.username,
    auth_type: normalized.authType,
    encrypted_password: normalized.authType === "password" ? encryptSecret(normalized.password, config.masterKey) : null,
    encrypted_private_key: normalized.authType === "key" ? encryptSecret(normalized.privateKey, config.masterKey) : null,
    encrypted_passphrase: normalized.passphrase ? encryptSecret(normalized.passphrase, config.masterKey) : null,
    notes: normalized.notes
  });

  return { sessionId: result.lastInsertRowid };
}

export function updateSessionSafe(db, config, currentUser, sessionId, payload) {
  const existing = db.prepare("SELECT * FROM ssh_sessions WHERE id = ?").get(sessionId);
  if (!existing) {
    return { error: "session-not-found" };
  }

  if (currentUser.role !== "admin" && existing.owner_user_id !== currentUser.id) {
    return { error: "session-forbidden" };
  }

  const normalized = normalizePayload(payload);
  const validationError = validatePayload(db, existing.owner_user_id, normalized);
  if (validationError) return { error: validationError };

  let encryptedPassword = existing.encrypted_password;
  let encryptedPrivateKey = existing.encrypted_private_key;
  let encryptedPassphrase = existing.encrypted_passphrase;

  if (normalized.authType === "password") {
    if (normalized.password) {
      encryptedPassword = encryptSecret(normalized.password, config.masterKey);
    }
    if (!encryptedPassword) {
      return { error: "session-password-required" };
    }
    encryptedPrivateKey = null;
    encryptedPassphrase = normalized.passphrase ? encryptSecret(normalized.passphrase, config.masterKey) : null;
  } else {
    if (normalized.privateKey) {
      encryptedPrivateKey = encryptSecret(normalized.privateKey, config.masterKey);
    }
    if (!encryptedPrivateKey) {
      return { error: "session-key-required" };
    }
    encryptedPassword = null;
    encryptedPassphrase = normalized.passphrase
      ? encryptSecret(normalized.passphrase, config.masterKey)
      : existing.auth_type === "key" ? existing.encrypted_passphrase : null;
  }

  db.prepare(`
    UPDATE ssh_sessions
    SET group_id = @group_id,
        name = @name,
        host = @host,
        port = @port,
        username = @username,
        auth_type = @auth_type,
        encrypted_password = @encrypted_password,
        encrypted_private_key = @encrypted_private_key,
        encrypted_passphrase = @encrypted_passphrase,
        notes = @notes,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: sessionId,
    group_id: normalized.groupId,
    name: normalized.name,
    host: normalized.host,
    port: normalized.port,
    username: normalized.username,
    auth_type: normalized.authType,
    encrypted_password: encryptedPassword,
    encrypted_private_key: encryptedPrivateKey,
    encrypted_passphrase: encryptedPassphrase,
    notes: normalized.notes
  });

  return { ok: true };
}

export function deleteSessionForUser(db, currentUser, sessionId) {
  const session = db.prepare("SELECT id, owner_user_id FROM ssh_sessions WHERE id = ?").get(sessionId);
  if (!session) {
    return { error: "session-not-found" };
  }

  if (currentUser.role !== "admin" && session.owner_user_id !== currentUser.id) {
    return { error: "session-forbidden" };
  }

  db.prepare("DELETE FROM ssh_sessions WHERE id = ?").run(sessionId);
  return { ok: true };
}

export function shareSessionWithUser(db, currentUser, sessionId, targetUserId) {
  const session = db.prepare("SELECT id, owner_user_id FROM ssh_sessions WHERE id = ?").get(sessionId);
  if (!session) {
    return { error: "session-not-found" };
  }

  if (currentUser.role !== "admin" && session.owner_user_id !== currentUser.id) {
    return { error: "share-forbidden" };
  }

  if (session.owner_user_id === targetUserId) {
    return { error: "share-owner" };
  }

  const user = db.prepare("SELECT id, is_active FROM users WHERE id = ?").get(targetUserId);
  if (!user || !user.is_active) {
    return { error: "share-user-not-found" };
  }

  const existing = db.prepare("SELECT id FROM session_shares WHERE session_id = ? AND shared_with_user_id = ?").get(sessionId, targetUserId);
  if (existing) {
    return { error: "share-exists" };
  }

  db.prepare("INSERT INTO session_shares (session_id, shared_with_user_id) VALUES (?, ?)").run(sessionId, targetUserId);
  return { ok: true };
}

export function revokeSessionShare(db, currentUser, sessionId, targetUserId) {
  const session = db.prepare("SELECT id, owner_user_id FROM ssh_sessions WHERE id = ?").get(sessionId);
  if (!session) {
    return { error: "session-not-found" };
  }

  if (currentUser.role !== "admin" && session.owner_user_id !== currentUser.id) {
    return { error: "share-forbidden" };
  }

  db.prepare("DELETE FROM session_shares WHERE session_id = ? AND shared_with_user_id = ?").run(sessionId, targetUserId);
  return { ok: true };
}
