export function writeAuditLog(db, { actorUserId = null, action, targetType, targetId = null, meta = {} }) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, meta_json)
    VALUES (@actor_user_id, @action, @target_type, @target_id, @meta_json)
  `).run({
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    meta_json: JSON.stringify(meta || {})
  });
}

export function listAuditLogs(db, limit = 150) {
  return db.prepare(`
    SELECT al.id, al.action, al.target_type, al.target_id, al.meta_json, al.created_at,
           u.username AS actor_username
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_user_id
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ?
  `).all(limit);
}
