import bcrypt from "bcrypt";

export function findUserById(db, id) {
  return db.prepare("SELECT id, username, role, is_active, created_at, updated_at FROM users WHERE id = ?").get(id);
}

export function findUserByUsername(db, username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

export function listUsers(db) {
  return db.prepare(`
    SELECT id, username, role, is_active, created_at, updated_at
    FROM users
    ORDER BY username COLLATE NOCASE ASC
  `).all();
}

export function listActiveUsers(db) {
  return db.prepare(`
    SELECT id, username, role
    FROM users
    WHERE is_active = 1
    ORDER BY username COLLATE NOCASE ASC
  `).all();
}

export function createUser(db, { username, password, role = "user", isActive = 1 }) {
  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role, is_active)
    VALUES (@username, @password_hash, @role, @is_active)
  `).run({
    username,
    password_hash: passwordHash,
    role,
    is_active: isActive
  });

  return findUserById(db, result.lastInsertRowid);
}

export function createUserSafe(db, { username, password, role = "user" }) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername || !password) {
    return { error: "missing-fields" };
  }

  if (password.length < 6) {
    return { error: "password-too-short" };
  }

  if (findUserByUsername(db, normalizedUsername)) {
    return { error: "username-taken" };
  }

  const user = createUser(db, {
    username: normalizedUsername,
    password,
    role: role === "admin" ? "admin" : "user",
    isActive: 1
  });

  return { user };
}

export function changeUserPasswordSafe(db, userId, { currentPassword, nextPassword, confirmPassword }) {
  const user = db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(userId);
  if (!user) {
    return { error: "user-not-found" };
  }

  const current = String(currentPassword || "");
  const next = String(nextPassword || "");
  const confirm = String(confirmPassword || "");

  if (!current || !next || !confirm) {
    return { error: "password-missing-fields" };
  }

  if (!bcrypt.compareSync(current, user.password_hash)) {
    return { error: "password-current-invalid" };
  }

  if (next.length < 6) {
    return { error: "password-too-short" };
  }

  if (next !== confirm) {
    return { error: "password-confirm-mismatch" };
  }

  const passwordHash = bcrypt.hashSync(next, 12);
  db.prepare(`
    UPDATE users
    SET password_hash = @password_hash,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: userId,
    password_hash: passwordHash
  });

  return { ok: true };
}

export function setUserActive(db, userId, isActive) {
  db.prepare(`
    UPDATE users
    SET is_active = @is_active,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: userId,
    is_active: isActive ? 1 : 0
  });

  return findUserById(db, userId);
}

export function deleteUser(db, userId) {
  return db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function ensureAdminUser(db, config) {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (count > 0) {
    return;
  }

  createUser(db, {
    username: config.adminUsername,
    password: config.adminPassword,
    role: "admin",
    isActive: 1
  });
}
