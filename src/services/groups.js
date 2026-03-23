export function listUserGroups(db, userId) {
  return db.prepare(`
    SELECT id, owner_user_id, name, sort_order, created_at, updated_at
    FROM session_groups
    WHERE owner_user_id = ?
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `).all(userId);
}

export function createGroupSafe(db, userId, name) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    return { error: "group-name-required" };
  }

  const existing = db.prepare(`
    SELECT id FROM session_groups
    WHERE owner_user_id = ? AND lower(name) = lower(?)
  `).get(userId, normalizedName);

  if (existing) {
    return { error: "group-name-taken" };
  }

  const { nextOrder } = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextOrder
    FROM session_groups
    WHERE owner_user_id = ?
  `).get(userId);

  const result = db.prepare(`
    INSERT INTO session_groups (owner_user_id, name, sort_order)
    VALUES (?, ?, ?)
  `).run(userId, normalizedName, nextOrder);

  return {
    group: db.prepare("SELECT * FROM session_groups WHERE id = ?").get(result.lastInsertRowid)
  };
}

export function deleteGroupForOwner(db, groupId, ownerUserId) {
  return db.prepare("DELETE FROM session_groups WHERE id = ? AND owner_user_id = ?").run(groupId, ownerUserId);
}
