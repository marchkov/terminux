import { listUserGroups } from "./groups.js";
import { createSessionSafe, getTerminalSessionConfig, listOwnedSessions, updateSessionSafe } from "./sessions.js";
import { getUserSettings, updateUserSettings } from "./userSettings.js";

const BACKUP_FORMAT = "terminux-backup";
const BACKUP_VERSION = 1;

function normalizeImportedSession(session) {
  return {
    name: String(session?.name || "").trim(),
    host: String(session?.host || "").trim(),
    port: Number(session?.port || 22),
    username: String(session?.username || "").trim(),
    auth_type: session?.auth_type === "key" ? "key" : "password",
    password: String(session?.password || ""),
    private_key: String(session?.private_key || ""),
    passphrase: String(session?.passphrase || ""),
    notes: String(session?.notes || "").trim(),
    group_name: String(session?.group_name || "").trim()
  };
}

function sessionFingerprint(session) {
  return [session.name, session.host, session.port, session.username].join("::").toLowerCase();
}

export function exportUserBackup(db, config, currentUser) {
  const settings = getUserSettings(db, currentUser.id);
  const groups = listUserGroups(db, currentUser.id).map((group) => ({
    name: group.name,
    sort_order: group.sort_order
  }));

  const ownedSessions = listOwnedSessions(db, currentUser.id);
  const sessions = ownedSessions.map((session) => {
    const terminalConfig = getTerminalSessionConfig(db, currentUser, session.id, config.masterKey);
    return {
      name: session.name,
      group_name: session.group_name || "",
      host: session.host,
      port: session.port,
      username: session.username,
      auth_type: session.auth_type,
      password: session.auth_type === "password" ? terminalConfig.password : "",
      private_key: session.auth_type === "key" ? terminalConfig.privateKey : "",
      passphrase: terminalConfig.passphrase || "",
      notes: session.notes || ""
    };
  });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    app_name: config.appName,
    user: {
      username: currentUser.username
    },
    settings: {
      theme: settings.theme,
      terminal_font_size: settings.terminal_font_size
    },
    groups,
    sessions
  };
}

export function importUserBackup(db, config, currentUser, rawBackup) {
  const backupJson = String(rawBackup || "").trim();
  if (!backupJson) {
    return { error: "backup-empty" };
  }

  let parsed;
  try {
    parsed = JSON.parse(backupJson);
  } catch {
    return { error: "backup-invalid" };
  }

  if (parsed?.format !== BACKUP_FORMAT || Number(parsed?.version) !== BACKUP_VERSION) {
    return { error: "backup-invalid" };
  }

  if (!parsed.settings || !Array.isArray(parsed.groups) || !Array.isArray(parsed.sessions)) {
    return { error: "backup-invalid" };
  }

  const sessionRows = parsed.sessions.map(normalizeImportedSession);
  const invalidSession = sessionRows.find((session) => {
    if (!session.name || !session.host || !session.username || !Number.isInteger(session.port) || session.port < 1 || session.port > 65535) {
      return true;
    }
    if (session.auth_type === "password" && !session.password) {
      return true;
    }
    if (session.auth_type === "key" && !session.private_key) {
      return true;
    }
    return false;
  });

  if (invalidSession) {
    return { error: "backup-invalid" };
  }

  const importedSettings = {
    theme: parsed.settings.theme === "light" ? "light" : "dark",
    terminal_font_size: parsed.settings.terminal_font_size
  };

  const runImport = db.transaction(() => {
    const result = {
      groupsCreated: 0,
      sessionsCreated: 0,
      sessionsUpdated: 0
    };

    updateUserSettings(db, currentUser.id, importedSettings);

    const existingGroups = new Map(
      listUserGroups(db, currentUser.id).map((group) => [group.name.toLowerCase(), group])
    );

    for (const [index, group] of parsed.groups.entries()) {
      const groupName = String(group?.name || "").trim();
      if (!groupName) continue;

      const key = groupName.toLowerCase();
      if (!existingGroups.has(key)) {
        const insert = db.prepare(`
          INSERT INTO session_groups (owner_user_id, name, sort_order)
          VALUES (?, ?, ?)
        `).run(currentUser.id, groupName, index + 1);
        const created = db.prepare(`
          SELECT id, owner_user_id, name, sort_order, created_at, updated_at
          FROM session_groups
          WHERE id = ?
        `).get(insert.lastInsertRowid);
        existingGroups.set(key, created);
        result.groupsCreated += 1;
      }
    }

    const refreshedOwned = listOwnedSessions(db, currentUser.id);
    const existingSessions = new Map(refreshedOwned.map((session) => [sessionFingerprint(session), session]));

    for (const session of sessionRows) {
      const group = session.group_name ? existingGroups.get(session.group_name.toLowerCase()) : null;
      const payload = {
        name: session.name,
        host: session.host,
        port: session.port,
        username: session.username,
        auth_type: session.auth_type,
        password: session.password,
        private_key: session.private_key,
        passphrase: session.passphrase,
        notes: session.notes,
        group_id: group?.id || ""
      };

      const fingerprint = sessionFingerprint(session);
      const existing = existingSessions.get(fingerprint);
      if (existing) {
        const updateResult = updateSessionSafe(db, config, currentUser, existing.id, payload);
        if (updateResult.error) {
          throw new Error(updateResult.error);
        }
        result.sessionsUpdated += 1;
        continue;
      }

      const createResult = createSessionSafe(db, config, currentUser.id, payload);
      if (createResult.error) {
        throw new Error(createResult.error);
      }
      result.sessionsCreated += 1;
    }

    return result;
  });

  try {
    return { ok: true, ...runImport() };
  } catch {
    return { error: "backup-import-failed" };
  }
}
