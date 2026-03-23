export function getUserSettings(db, userId) {
  const existing = db.prepare(`
    SELECT user_id, theme, terminal_font_size, created_at, updated_at
    FROM user_settings
    WHERE user_id = ?
  `).get(userId);

  if (existing) {
    return existing;
  }

  db.prepare(`
    INSERT INTO user_settings (user_id, theme, terminal_font_size)
    VALUES (?, 'dark', 14)
  `).run(userId);

  return db.prepare(`
    SELECT user_id, theme, terminal_font_size, created_at, updated_at
    FROM user_settings
    WHERE user_id = ?
  `).get(userId);
}

export function updateUserSettings(db, userId, payload = {}) {
  const theme = payload.theme === 'dark' ? 'dark' : 'dark';
  const terminalFontSize = Math.max(12, Math.min(20, Number(payload.terminal_font_size || 14)));

  getUserSettings(db, userId);

  db.prepare(`
    UPDATE user_settings
    SET theme = @theme,
        terminal_font_size = @terminal_font_size,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = @user_id
  `).run({
    user_id: userId,
    theme,
    terminal_font_size: terminalFontSize
  });

  return getUserSettings(db, userId);
}
