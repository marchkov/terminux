import { renderLayout } from "../views/layout.js";
import { authenticateUser, requireAdmin, requireAuth, requireGuest } from "../services/auth.js";
import { createGroupSafe, deleteGroupForOwner, listUserGroups } from "../services/groups.js";
import {
  addSessionFavorite,
  createSessionSafe,
  deleteSessionForUser,
  getAccessibleSession,
  getEditableSession,
  listFavoriteSessions,
  listOwnedSessions,
  listSessionShares,
  listSharedSessions,
  removeSessionFavorite,
  revokeSessionShare,
  shareSessionWithUser,
  updateSessionSafe
} from "../services/sessions.js";
import { changeUserPasswordSafe, createUserSafe, deleteUser, findUserById, listActiveUsers, listUsers, setUserActive } from "../services/users.js";
import { listAuditLogs, writeAuditLog } from "../services/audit.js";
import { exportUserBackup, importUserBackup } from "../services/backup.js";
import { getUpdateStatus } from "../services/updateCheck.js";
import { getUserSettings, updateUserSettings } from "../services/userSettings.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, selectedSessionId) {
  const groupedOwned = groups.map((group) => {
    const sessions = ownedSessions.filter((session) => session.group_id === group.id);
    const countLabel = sessions.length === 1 ? "1 session" : `${sessions.length} sessions`;
    const links = sessions.length
      ? sessions.map((session) => {
          const activeClass = session.id === selectedSessionId ? "session-link active" : "session-link";
          return `<a class="${activeClass}" href="/?session_id=${session.id}" data-session-name="${escapeHtml(session.name)}">${escapeHtml(session.name)}</a>`;
        }).join("")
      : '<div class="empty-note" data-empty-note>No sessions yet.</div>';

    return `
      <div class="group-card" data-group-card data-group-name="${escapeHtml(group.name)}">
        <div class="group-row">
          <div class="group-title-block">
            <button class="group-toggle" type="button">${escapeHtml(group.name)}</button>
            <div class="group-count">${countLabel}</div>
          </div>
          <form method="post" action="/groups/${group.id}/delete" class="inline-form" onsubmit="return confirm('Delete group ${escapeHtml(group.name)}?');">
            <button class="group-delete-button" type="submit" aria-label="Delete group" title="Delete group">-</button>
          </form>
        </div>
        <div class="group-links" data-group-links>
          ${links}
        </div>
      </div>
    `;
  }).join("");

  const ungrouped = ownedSessions.filter((session) => !session.group_id);
  const ungroupedBlock = ungrouped.length
    ? `
      <div class="group-card" data-group-card data-group-name="Ungrouped">
        <div class="group-row">
          <div class="group-title-block">
            <button class="group-toggle" type="button">Ungrouped</button>
            <div class="group-count">${ungrouped.length === 1 ? "1 session" : `${ungrouped.length} sessions`}</div>
          </div>
        </div>
        <div class="group-links" data-group-links>
          ${ungrouped.map((session) => {
            const activeClass = session.id === selectedSessionId ? "session-link active" : "session-link";
            return `<a class="${activeClass}" href="/?session_id=${session.id}" data-session-name="${escapeHtml(session.name)}">${escapeHtml(session.name)}</a>`;
          }).join("")}
        </div>
      </div>
    `
    : "";

  const sharedBlock = sharedSessions.length
    ? sharedSessions.map((session) => {
        const activeClass = session.id === selectedSessionId ? "session-link active" : "session-link";
        return           `<div class="group-card shared" data-shared-card data-session-name="${escapeHtml(session.name)}" data-owner-name="${escapeHtml(session.owner_username)}">
            <div class="share-meta">from ${escapeHtml(session.owner_username)}</div>
            <a class="${activeClass}" href="/?session_id=${session.id}">${escapeHtml(session.name)}</a>
          </div>
        `;
      }).join("")
    : '<div class="empty-note" data-shared-empty>Nothing shared with you yet.</div>';

  const favoritesBlock = favoriteSessions.length
    ? favoriteSessions.map((session) => {
        const activeClass = session.id === selectedSessionId ? "session-link active" : "session-link";
        const ownerLabel = session.is_shared ? `from ${escapeHtml(session.owner_username || "shared")}` : escapeHtml(session.host);
        return `
          <div class="group-card shared" data-favorite-card data-session-name="${escapeHtml(session.name)}" data-owner-name="${escapeHtml(session.owner_username || "")}">
            <div class="share-meta">${ownerLabel}</div>
            <a class="${activeClass}" href="/?session_id=${session.id}">${escapeHtml(session.name)}</a>
          </div>
        `;
      }).join("")
    : '<div class="empty-note" data-favorites-empty>No favorites yet.</div>';


  return `
    <div class="sidebar-header">
      <div>
        <div class="sidebar-title">Sessions</div>
        <div class="sidebar-subtitle">Signed in as ${escapeHtml(currentUser.username)} (${escapeHtml(currentUser.role)})</div>
      </div>
      <a class="create-fab" href="/create" title="Create">+</a>
    </div>

    <div class="sidebar-search-wrap">
      <label class="field sidebar-search-field">
        <span>Quick search</span>
        <input class="sidebar-search-input" type="search" placeholder="Search groups or sessions" data-sidebar-search />
      </label>
      <div class="sidebar-search-meta" data-sidebar-search-meta>Type to filter your workspace.</div>
    </div>

    <div class="sidebar-section" data-sidebar-favorites>
      <div class="section-label">Favorites</div>
      ${favoritesBlock}
      <div class="empty-note is-hidden" data-favorites-filter-empty>No favorite sessions match this search.</div>
    </div>


    <div class="sidebar-section" data-sidebar-owned>
      <div class="section-label">My Sessions</div>
      ${groupedOwned || '<div class="empty-note" data-owned-empty>Create your first group or session.</div>'}
      ${ungroupedBlock}
      <div class="empty-note is-hidden" data-owned-filter-empty>No matching groups or sessions.</div>
    </div>

    <div class="sidebar-section" data-sidebar-shared>
      <div class="section-label">Shared With Me</div>
      ${sharedBlock}
      <div class="empty-note is-hidden" data-shared-filter-empty>No shared sessions match this search.</div>
    </div>

    <form method="post" action="/logout">
      <button class="ghost-button wide" type="submit">Logout</button>
    </form>
  `;
}
function renderFlash(params) {
  const { ok, error } = params;
  if (ok === "user-created") return '<div class="flash success">User created successfully.</div>';
  if (ok === "user-updated") return '<div class="flash success">User status updated.</div>';
  if (ok === "user-deleted") return '<div class="flash success">User deleted successfully.</div>';
  if (ok === "group-created") return '<div class="flash success">Group created successfully.</div>';
  if (ok === "group-deleted") return '<div class="flash success">Group deleted successfully.</div>';
  if (ok === "session-created") return '<div class="flash success">SSH session created successfully.</div>';
  if (ok === "session-updated") return '<div class="flash success">SSH session updated successfully.</div>';
  if (ok === "session-deleted") return '<div class="flash success">SSH session deleted successfully.</div>';
  if (ok === "session-shared") return '<div class="flash success">Access granted successfully.</div>';
  if (ok === "session-unshared") return '<div class="flash success">Access revoked successfully.</div>';
  if (error === "username-taken") return '<div class="flash error">That username is already in use.</div>';
  if (error === "password-too-short") return '<div class="flash error">Password must be at least 6 characters long.</div>';
  if (error === "missing-fields") return '<div class="flash error">Username and password are required.</div>';
  if (error === "self-disable") return '<div class="flash error">You cannot disable your own account.</div>';
  if (error === "self-delete") return '<div class="flash error">You cannot delete your own account.</div>';
  if (error === "user-not-found") return '<div class="flash error">User not found.</div>';
  if (error === "group-name-required") return '<div class="flash error">Group name is required.</div>';
  if (error === "group-name-taken") return '<div class="flash error">You already have a group with that name.</div>';
  if (error === "group-not-found") return '<div class="flash error">Selected group was not found.</div>';
  if (error === "session-invalid") return '<div class="flash error">Session name, host, username and a valid port are required.</div>';
  if (error === "session-password-required") return '<div class="flash error">Password auth requires a password.</div>';
  if (error === "session-key-required") return '<div class="flash error">Key auth requires a private key.</div>';
  if (error === "session-not-found") return '<div class="flash error">Session not found.</div>';
  if (error === "session-forbidden") return '<div class="flash error">You do not have permission to modify that session.</div>';
  if (error === "share-forbidden") return '<div class="flash error">You cannot manage sharing for that session.</div>';
  if (error === "share-user-not-found") return '<div class="flash error">Selected user is not available for sharing.</div>';
  if (error === "share-owner") return '<div class="flash error">The owner already has access to this session.</div>';
  if (error === "share-exists") return '<div class="flash error">That user already has access.</div>';
  if (ok === "settings-saved") return '<div class="flash success">Settings saved successfully.</div>';
  if (ok === "password-updated") return '<div class="flash success">Password updated successfully.</div>';
  if (error === "backup-empty") return '<div class="flash error">Choose a backup file or paste backup JSON before importing.</div>';
  if (error === "backup-invalid") return '<div class="flash error">The backup file is not a valid terminux backup.</div>';
  if (error === "backup-import-failed") return '<div class="flash error">Backup import failed. Check the file contents and try again.</div>';
  if (error === "password-missing-fields") return '<div class="flash error">Fill in current password, new password and confirmation.</div>';
  if (error === "password-current-invalid") return '<div class="flash error">Current password is incorrect.</div>';
  if (error === "password-confirm-mismatch") return '<div class="flash error">New password and confirmation do not match.</div>';
  return "";
}

function renderSessionForm({ title, action, groups, session = null, submitLabel }) {
  const groupOptions = groups.map((group) => {
    const selected = session?.group_id === group.id ? "selected" : "";
    return `<option value="${group.id}" ${selected}>${escapeHtml(group.name)}</option>`;
  }).join("");

  const authType = session?.auth_type || "password";
  const formMode = session ? "edit" : "create";
  const secretHint = session
    ? "Leave secret fields blank if you want to keep the current encrypted value."
    : "Secrets are encrypted before they are stored in SQLite.";

  return `
    <section class="info-card">
      <div class="eyebrow">SSH</div>
      <h1>${title}</h1>
      <p class="inline-hint">${secretHint}</p>
      <form class="stack-form" method="post" action="${action}" data-session-form data-form-mode="${formMode}" novalidate>
        <label class="field">
          <span>Session name</span>
          <input name="name" type="text" value="${escapeHtml(session?.name || "")}" placeholder="Production API" maxlength="120" required />
          <small class="field-help">Give the session a short label that is easy to scan in the sidebar.</small>
        </label>
        <label class="field">
          <span>Host</span>
          <input name="host" type="text" value="${escapeHtml(session?.host || "")}" placeholder="server.example.com or 10.0.0.15" inputmode="url" autocapitalize="off" spellcheck="false" required />
          <small class="field-help">Use a hostname or IPv4/IPv6 address reachable from the server running terminux.</small>
        </label>
        <div class="two-col">
          <label class="field">
            <span>Port</span>
            <input name="port" type="number" min="1" max="65535" value="${escapeHtml(session?.port || 22)}" placeholder="22" required />
            <small class="field-help">SSH usually runs on port 22 unless your server uses a custom port.</small>
          </label>
          <label class="field">
            <span>Username</span>
            <input name="username" type="text" value="${escapeHtml(session?.username || "")}" placeholder="root or deploy" autocapitalize="off" spellcheck="false" required />
            <small class="field-help">This account is used for the terminal connection and command execution.</small>
          </label>
        </div>
        <div class="two-col">
          <label class="field">
            <span>Group</span>
            <select name="group_id">
              <option value="">Ungrouped</option>
              ${groupOptions}
            </select>
            <small class="field-help">Groups keep the left sidebar tidy. You can move the session later.</small>
          </label>
          <label class="field">
            <span>Auth type</span>
            <select name="auth_type">
              <option value="password" ${authType === "password" ? "selected" : ""}>Password</option>
              <option value="key" ${authType === "key" ? "selected" : ""}>Private key</option>
            </select>
            <small class="field-help">Choose whether terminux connects with a password or an SSH private key.</small>
          </label>
        </div>
        <label class="field" data-auth-field="password">
          <span>Password ${session ? "(leave blank to keep current)" : ""}</span>
          <input name="password" type="password" placeholder="Enter the SSH password" />
          <small class="field-help">Only required when auth type is set to Password.</small>
        </label>
        <label class="field" data-auth-field="key">
          <span>Private key ${session ? "(leave blank to keep current)" : ""}</span>
          <textarea name="private_key" rows="5" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea>
          <small class="field-help">Paste the full private key including BEGIN and END lines.</small>
        </label>
        <label class="field" data-auth-field="passphrase">
          <span>Passphrase ${session ? "(optional, leave blank to keep current key passphrase)" : "(optional)"}</span>
          <input name="passphrase" type="password" placeholder="Key passphrase" />
          <small class="field-help">Use this only if the private key itself is protected with a passphrase.</small>
        </label>
        <label class="field">
          <span>Notes</span>
          <textarea name="notes" rows="4" placeholder="Deployment box, jump host, maintenance notes or ownership details">${escapeHtml(session?.notes || "")}</textarea>
          <small class="field-help">Optional notes help teammates understand what the server is for.</small>
        </label>
        <div class="form-error is-hidden" data-session-form-error></div>
        <button class="primary-button" type="submit">${submitLabel}</button>
      </form>
    </section>
  `;
}

function renderSharePanel(selectedSession, shareCandidates, sharedUsers) {
  if (!selectedSession) return "";

  const items = sharedUsers.length
    ? sharedUsers.map((user) => `
        <div class="share-item">
          <div>
            <div class="table-primary">${escapeHtml(user.username)}</div>
            <div class="share-meta">${escapeHtml(user.role)}</div>
          </div>
          <form method="post" action="/sessions/${selectedSession.id}/unshare/${user.id}" class="inline-form">
            <button class="ghost-button compact danger-button" type="submit">Revoke</button>
          </form>
        </div>
      `).join("")
    : '<div class="empty-note">This session is not shared with anyone yet.</div>';

  const options = shareCandidates.length
    ? shareCandidates.map((user) => `<option value="${user.id}">${escapeHtml(user.username)} (${escapeHtml(user.role)})</option>`).join("")
    : '<option value="">No available users</option>';

  return `
    <section class="info-card">
      <div class="eyebrow">Sharing</div>
      <h1>Access</h1>
      <div class="share-list">${items}</div>
      <form class="stack-form" method="post" action="/sessions/${selectedSession.id}/share">
        <label class="field">
          <span>Grant access to user</span>
          <select name="user_id" ${shareCandidates.length ? "" : "disabled"}>
            <option value="">Select user</option>
            ${options}
          </select>
        </label>
        <button class="primary-button" type="submit" ${shareCandidates.length ? "" : "disabled"}>Share session</button>
      </form>
    </section>
  `;
}

function renderConnectionPanel(selectedSession, ownerLine) {
  return `
    <section class="info-card">
      <div class="eyebrow">Connection</div>
      <h1>${escapeHtml(selectedSession.host)}</h1>
      <div class="meta-list">
        <div><span>Username</span><strong>${escapeHtml(selectedSession.username)}</strong></div>
        <div><span>Port</span><strong>${selectedSession.port}</strong></div>
        <div><span>Auth</span><strong>${escapeHtml(selectedSession.auth_type)}</strong></div>
        <div><span>Group</span><strong>${escapeHtml(selectedSession.group_name || "Ungrouped")}</strong></div>
        <div><span>Access</span><strong>${ownerLine}</strong></div>
      </div>
    </section>
  `;
}

function renderSessionLinkList(items, emptyMessage) {
  if (!items.length) {
    return `<div class="empty-note">${emptyMessage}</div>`;
  }

  return items.map((session) => {
    const ownerLabel = session.owner_user_id ? (session.owner_username || "you") : "you";
    return `
      <a class="dashboard-session-link" href="/?session_id=${session.id}">
        <span class="dashboard-session-main">${escapeHtml(session.name)}</span>
        <span class="dashboard-session-meta">${escapeHtml(session.host)} - ${escapeHtml(ownerLabel)}</span>
      </a>
    `;
  }).join("");
}

function renderConnectedSession(selectedSession, currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, shareCandidates, sharedUsers, terminalToken, terminalFontSize) {
  if (!selectedSession) {
    const groupCount = groups.length;
    const ownedCount = ownedSessions.length;
    const sharedCount = sharedSessions.length;
    const totalCount = ownedCount + sharedCount;

    return `
      <div class="hero-panel dashboard-hero">
        <div>
          <div class="eyebrow">Workspace</div>
          <h1>Welcome back, ${escapeHtml(currentUser.username)}</h1>
          <p>Terminux keeps your SSH sessions organized in one dark workspace with groups, sharing and encrypted secrets.</p>
        </div>
        <div class="status-pill">${totalCount} saved connections ready</div>
      </div>

      <div class="dashboard-grid">
        <section class="info-card dashboard-card dashboard-card-stat">
          <div class="eyebrow">Overview</div>
          <div class="dashboard-stat-value">${ownedCount}</div>
          <div class="dashboard-stat-label">My Sessions</div>
        </section>

        <section class="info-card dashboard-card dashboard-card-stat">
          <div class="eyebrow">Shared</div>
          <div class="dashboard-stat-value">${sharedCount}</div>
          <div class="dashboard-stat-label">Shared With Me</div>
        </section>

        <section class="info-card dashboard-card dashboard-card-stat">
          <div class="eyebrow">Groups</div>
          <div class="dashboard-stat-value">${groupCount}</div>
          <div class="dashboard-stat-label">Session Groups</div>
        </section>
      </div>

      <div class="dashboard-grid dashboard-grid-main">
        <section class="info-card dashboard-card dashboard-card-wide">
          <div class="eyebrow">Quick Start</div>
          <h1>Open a session or create a new one</h1>
          <p>Pick a saved connection from the left sidebar to open the terminal, or jump straight into setup from the create screen.</p>
          <div class="hero-actions dashboard-actions">
            <a class="primary-button" href="/create">Create session</a>
            <a class="ghost-button" href="/settings">Terminal settings</a>
          </div>
        </section>

        <section class="info-card dashboard-card">
          <div class="eyebrow">At A Glance</div>
          <h1>What lives here</h1>
          <div class="dashboard-list">
            <div><span>Saved sessions</span><strong>${ownedCount}</strong></div>
            <div><span>Shared access</span><strong>${sharedCount}</strong></div>
            <div><span>Groups</span><strong>${groupCount}</strong></div>
            <div><span>Role</span><strong>${escapeHtml(currentUser.role)}</strong></div>
          </div>
        </section>
      </div>

      <div class="dashboard-grid dashboard-grid-main">
        <section class="info-card dashboard-card">
          <div class="eyebrow">Favorites</div>
          <h1>Starred Sessions</h1>
          <div class="dashboard-session-list">${renderSessionLinkList(favoriteSessions, "No favorite sessions yet.")}</div>
        </section>

        <section class="info-card dashboard-card">
          <div class="eyebrow">Recent</div>
          <h1>Recently Opened</h1>
          <div class="dashboard-session-list">${renderSessionLinkList(recentSessions, "Open a session to build your recent list.")}</div>
        </section>
      </div>
    `;
  }

  const canManage = currentUser.role === "admin" || currentUser.id === selectedSession.owner_user_id;

  return `
    <div class="hero-panel">
      <div class="terminal-meta">
        <div>
          <div class="eyebrow">Connected Session</div>
          <h1>${escapeHtml(selectedSession.name)}</h1>
        </div>
        <div class="hero-actions">
          <div class="status-pill status-pill-connecting js-terminal-status" data-terminal-state="connecting">Connecting...</div>
          <button class="ghost-button compact js-terminal-reconnect" type="button">Reconnect</button>
          <a class="ghost-button compact" href="/sessions/close">Close</a>
          <form method="post" action="/sessions/${selectedSession.id}/favorite-toggle" class="inline-form">
            <button class="ghost-button compact" type="submit">${selectedSession.is_favorite ? "Unfavorite" : "Favorite"}</button>
          </form>
          ${canManage ? `
            <a class="ghost-button" href="/sessions/${selectedSession.id}/edit">Edit</a>
            <form method="post" action="/sessions/${selectedSession.id}/delete" onsubmit="return confirm('Delete session ${escapeHtml(selectedSession.name)}?');">
              <button class="ghost-button danger-button" type="submit">Delete</button>
            </form>
          ` : ""}
        </div>
      </div>
    </div>

    <section class="terminal-placeholder terminal-shell">
      <div class="terminal-bar">
        <span class="terminal-dot red"></span>
        <span class="terminal-dot yellow"></span>
        <span class="terminal-dot green"></span>
        <span class="terminal-title">SSH Terminal</span>
      </div>
      <div class="terminal-banner js-terminal-banner is-hidden"></div>
      <div class="js-terminal terminal-mount" data-terminal-token="${escapeHtml(terminalToken || "")}" data-terminal-font-size="${escapeHtml(terminalFontSize || 14)}"></div>
    </section>
  `;
}
function renderCreatePage(appName, currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId, params) {
  const sidebar = renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId);

  return renderLayout({
    appName,
    title: "Create",
    currentPath: "/create",
    sidebar,
    currentUser,
    activeSessionId,
    bodyEnd: '<script type="module" src="/public/session-form.js"></script>',
    content: `
      ${renderFlash(params)}
      <div class="hero-panel">
        <div>
          <div class="eyebrow">Create</div>
          <h1>New Group Or Session</h1>
        </div>
      </div>

      <div class="split-grid forms-grid no-top-gap">
        <section class="info-card">
          <div class="eyebrow">Groups</div>
          <h1>Create Group</h1>
          <form class="stack-form" method="post" action="/groups/create">
            <label class="field">
              <span>Group name</span>
              <input name="name" type="text" required />
            </label>
            <button class="primary-button" type="submit">Create group</button>
          </form>
        </section>

        ${renderSessionForm({ title: "Create Session", action: "/sessions/create", groups, submitLabel: "Save session" })}
      </div>
    `
  });
}

function renderEditPage(appName, currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId, session, shareCandidates, sharedUsers, params) {
  const sidebar = renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId || session.id);
  const canManage = currentUser.role === "admin" || currentUser.id === session.owner_user_id;
  const ownerLine = currentUser.id === session.owner_user_id
    ? "Owned by you"
    : `Shared by ${escapeHtml(session.owner_username)}`;
  const connectionPanel = renderConnectionPanel(session, ownerLine);
  const sharingPanel = canManage ? renderSharePanel(session, shareCandidates, sharedUsers) : "";
  const lowerPanels = sharingPanel
    ? `<div class="detail-grid lower-grid">${connectionPanel}${sharingPanel}</div>`
    : `<div class="single-panel-row">${connectionPanel}</div>`;

  return renderLayout({
    appName,
    title: "Edit Session",
    currentPath: "/",
    sidebar,
    currentUser,
    activeSessionId: activeSessionId || session.id,
    bodyEnd: '<script type="module" src="/public/session-form.js"></script>',
    content: `
      ${renderFlash(params)}
      <div class="hero-panel">
        <div>
          <div class="eyebrow">Edit</div>
          <h1>${escapeHtml(session.name)}</h1>
        </div>
      </div>

      <div class="single-panel-row">
        ${renderSessionForm({ title: "Edit Session", action: `/sessions/${session.id}/update`, groups, session, submitLabel: "Update session" })}
      </div>

      ${lowerPanels}
    `
  });
}

function renderHomePage(appName, currentUser, groups, ownedSessions, sharedSessions, selectedSession, favoriteSessions, recentSessions, shareCandidates, sharedUsers, terminalToken, terminalFontSize, params) {
  const activeSessionId = selectedSession?.id || null;
  const sidebar = renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId);

  return renderLayout({
    appName,
    title: "Sessions",
    currentPath: "/",
    sidebar,
    currentUser,
    activeSessionId,
    headExtras: '<link rel="stylesheet" href="/vendor/@xterm/xterm/css/xterm.css" />',
    bodyEnd: selectedSession ? '<script type="module" src="/public/terminal.js"></script>' : '',
    content: `
      ${renderFlash(params)}
      ${renderConnectedSession(selectedSession, currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, shareCandidates, sharedUsers, terminalToken, terminalFontSize)}
    `
  });
}

function renderSimplePage(appName, title, currentPath, description, currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId) {
  return renderLayout({
    appName,
    title,
    currentPath,
    sidebar: renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId),
    currentUser,
    activeSessionId,
    content: `
      <div class="info-card">
        <div class="eyebrow">Stage 2</div>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
    `
  });
}

function renderUsersPage(appName, currentUser, users, params, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId) {
  const rows = users.map((user) => {
    const isSelf = user.id === currentUser.id;
    const statusLabel = user.is_active ? "Active" : "Disabled";
    const actionLabel = user.is_active ? "Disable" : "Enable";
    const badgeClass = user.is_active ? "status-pill online" : "status-pill offline";
    const disabledAttr = isSelf ? "disabled" : "";
    const helper = isSelf ? '<span class="inline-hint">current user</span>' : "";

    return `
      <tr data-user-row data-username="${escapeHtml(user.username)}" data-role="${escapeHtml(user.role)}" data-status="${user.is_active ? "active" : "disabled"}">
        <td>
          <div class="table-primary">${escapeHtml(user.username)}</div>
          ${helper}
        </td>
        <td><span class="role-badge">${escapeHtml(user.role)}</span></td>
        <td><span class="${badgeClass}">${statusLabel}</span></td>
        <td>${user.created_at}</td>
        <td>
          <div class="actions-cell">
            <form method="post" action="/users/${user.id}/status" class="inline-form">
              <input type="hidden" name="is_active" value="${user.is_active ? 0 : 1}" />
              <button class="ghost-button compact" type="submit" ${disabledAttr}>${actionLabel}</button>
            </form>
            <form method="post" action="/users/${user.id}/delete" class="inline-form" onsubmit="return confirm('Delete user ${escapeHtml(user.username)}?');">
              <button class="ghost-button compact danger-button" type="submit" ${disabledAttr}>Delete</button>
            </form>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  return renderLayout({
    appName,
    title: "Users",
    currentPath: "/users",
    sidebar: renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId),
    currentUser,
    activeSessionId,
    bodyEnd: '<script type="module" src="/public/admin-filters.js"></script>',
    content: `
      ${renderFlash(params)}
      <section class="info-card">
        <div class="table-heading">
          <div>
            <div class="eyebrow">Directory</div>
            <h1>Account List</h1>
          </div>
          <a class="circle-action" href="/users/new" title="Create user" aria-label="Create user">+</a>
        </div>
        <div class="table-controls" data-user-filters>
          <label class="field table-filter-field table-filter-search">
            <span>Search</span>
            <input type="search" placeholder="Find by username" data-user-search />
          </label>
          <label class="field table-filter-field">
            <span>Role</span>
            <select data-user-role>
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </label>
          <label class="field table-filter-field">
            <span>Status</span>
            <select data-user-status>
              <option value="all">Any status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>
        <div class="table-filter-meta" data-user-filter-meta>Showing all accounts.</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="empty-note is-hidden" data-user-filter-empty>No accounts match the current filters.</div>
      </section>
    `
  });
}

function renderCreateUserPage(appName, currentUser, params, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId) {
  return renderLayout({
    appName,
    title: "Create User",
    currentPath: "/users",
    sidebar: renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId),
    currentUser,
    activeSessionId,
    content: `
      ${renderFlash(params)}
      <section class="info-card narrow-card">
        <div class="eyebrow">Admin</div>
        <h1>Create User</h1>
        <p>Set the account name, password and role for the new user.</p>
        <form class="stack-form" method="post" action="/users/create">
          <label class="field">
            <span>Username</span>
            <input name="username" type="text" required />
          </label>
          <label class="field">
            <span>Password</span>
            <input name="password" type="password" required />
          </label>
          <label class="field">
            <span>Role</span>
            <select name="role">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div class="actions-cell">
            <button class="primary-button" type="submit">Create user</button>
            <a class="ghost-button" href="/users">Back</a>
          </div>
        </form>
      </section>
    `
  });
}

function formatAuditMeta(metaJson) {
  try {
    const meta = JSON.parse(metaJson || '{}');
    const parts = [];
    for (const [key, value] of Object.entries(meta)) {
      if (value === null || value === undefined || value === '') continue;
      parts.push(`${escapeHtml(key)}: ${escapeHtml(String(value))}`);
    }
    return parts.length ? parts.join(' - ') : 'No extra details';
  } catch {
    return 'Unable to parse metadata';
  }
}

function renderAuditPage(appName, currentUser, entries, params, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId) {
  const rows = entries.length
    ? entries.map((entry) => {
        const actor = entry.actor_username || "system";
        const details = formatAuditMeta(entry.meta_json);
        return `
        <tr data-audit-row data-action="${escapeHtml(entry.action)}" data-actor="${escapeHtml(actor)}" data-details="${escapeHtml(details)}">
          <td>
            <div class="table-primary">${escapeHtml(entry.action)}</div>
            <div class="inline-hint">${escapeHtml(entry.target_type)}${entry.target_id ? ` #${entry.target_id}` : ""}</div>
          </td>
          <td>${escapeHtml(actor)}</td>
          <td>${details}</td>
          <td>${entry.created_at}</td>
        </tr>
      `;
      }).join("")
    : '<tr><td colspan="4" class="empty-note">No audit entries yet.</td></tr>';

  return renderLayout({
    appName,
    title: "Audit",
    currentPath: "/audit",
    sidebar: renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId),
    currentUser,
    activeSessionId,
    bodyEnd: '<script type="module" src="/public/admin-filters.js"></script>',
    content: `
      ${renderFlash(params)}
      <div class="hero-panel">
        <div>
          <div class="eyebrow">Admin</div>
          <h1>Audit Log</h1>
        </div>
        <div class="status-pill">Latest 100 events</div>
      </div>

      <section class="info-card">
        <div class="eyebrow">Security</div>
        <h1>Recent Activity</h1>
        <div class="table-controls" data-audit-filters>
          <label class="field table-filter-field table-filter-search">
            <span>Search</span>
            <input type="search" placeholder="Action, actor or details" data-audit-search />
          </label>
          <label class="field table-filter-field">
            <span>Action</span>
            <select data-audit-action>
              <option value="all">All actions</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="session">Session events</option>
              <option value="user">User events</option>
              <option value="group">Group events</option>
              <option value="profile">Profile events</option>
              <option value="settings">Settings events</option>
            </select>
          </label>
          <label class="field table-filter-field">
            <span>Actor</span>
            <input type="search" placeholder="admin or system" data-audit-actor />
          </label>
        </div>
        <div class="table-filter-meta" data-audit-filter-meta>Showing the latest audit events.</div>
        <div class="table-wrap">
          <table class="data-table audit-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Details</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="empty-note is-hidden" data-audit-filter-empty>No audit events match the current filters.</div>
      </section>
    `
  });
}
function renderSettingsPage(appName, currentUser, settings, updateStatus, params, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId) {
  return renderLayout({
    appName,
    title: "Settings",
    currentPath: "/settings",
    sidebar: renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId),
    currentUser,
    activeSessionId,
    bodyEnd: '<script type="module" src="/public/settings-backup.js"></script>',
    content: `
      ${renderFlash(params)}
      <div class="split-grid profile-grid settings-grid">
        <section class="info-card">
          <div class="eyebrow">Version</div>
          <h1>Update status</h1>
          <div class="meta-list">
            <div><span>Current version</span><strong>${escapeHtml(updateStatus.currentVersion)}</strong></div>
            <div><span>Latest version</span><strong>${escapeHtml(updateStatus.latestVersion)}</strong></div>
            <div><span>Status</span><strong>${updateStatus.hasUpdate ? "Update available" : updateStatus.error ? "Unable to check" : "Up to date"}</strong></div>
            <div><span>Last checked</span><strong>${escapeHtml(updateStatus.checkedAt ? new Date(updateStatus.checkedAt).toLocaleString("en-GB") : "Not checked yet")}</strong></div>
          </div>
          <p class="inline-hint">Version checks are shared across the whole workspace and run at most once every 24 hours. Source: ${escapeHtml(updateStatus.source)}</p>
          ${updateStatus.error ? `<div class="form-error">${escapeHtml(updateStatus.error)}</div>` : ""}
        </section>
        <section class="info-card">
          <div class="eyebrow">Preferences</div>
          <h1>Settings</h1>
          <p>Choose how the terminal should look and behave for your account.</p>
          <form class="stack-form" method="post" action="/settings">
            <label class="field">
              <span>Theme</span>
              <select name="theme">
                <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
                <option value="light" ${settings.theme === "light" ? "selected" : ""}>Soft light</option>
              </select>
            </label>
            <label class="field">
              <span>Terminal font size</span>
              <input name="terminal_font_size" type="number" min="12" max="20" value="${escapeHtml(settings.terminal_font_size)}" required />
            </label>
            <button class="primary-button" type="submit">Save settings</button>
          </form>
        </section>

        <section class="info-card settings-backup-card">
          <div class="eyebrow">Backup</div>
          <h1>Export or restore your workspace</h1>
          <p>Download your own settings, groups and SSH sessions as a portable JSON backup. Import restores them under your current account and re-encrypts secrets for this instance.</p>
          <div class="backup-split">
            <section class="backup-pane">
              <div class="eyebrow">Export</div>
              <h2>Download a fresh copy</h2>
              <p>Save your current workspace as a JSON file that you can keep offline or restore later on another instance.</p>
              <a class="primary-button" href="/settings/backup">Download backup JSON</a>
            </section>
            <section class="backup-pane">
              <div class="eyebrow">Import</div>
              <h2>Restore into this account</h2>
              <p>Choose a backup exported from terminux. The file stays local until you submit the import form.</p>
              <form class="stack-form no-top-gap" method="post" action="/settings/backup/import" data-backup-import-form>
                <label class="field">
                  <span>Backup file</span>
                  <input type="file" accept="application/json,.json" data-backup-file />
                </label>
                <div class="table-filter-meta" data-backup-file-meta>No file selected yet.</div>
                <textarea class="is-hidden" name="backup_json" data-backup-json></textarea>
                <button class="ghost-button" type="submit" data-backup-submit disabled>Import backup</button>
              </form>
            </section>
          </div>
        </section>
      </div>
    `
  });
}

function renderProfilePage(appName, currentUser, params, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId) {
  return renderLayout({
    appName,
    title: "Profile",
    currentPath: "/profile",
    sidebar: renderSidebar(currentUser, groups, ownedSessions, sharedSessions, favoriteSessions, recentSessions, activeSessionId),
    currentUser,
    activeSessionId,
    content: `
      ${renderFlash(params)}
      <div class="split-grid profile-grid">
        <section class="info-card">
          <div class="eyebrow">Account</div>
          <h1>${escapeHtml(currentUser.username)}</h1>
          <div class="meta-list">
            <div><span>Role</span><strong>${escapeHtml(currentUser.role)}</strong></div>
            <div><span>Status</span><strong>${currentUser.is_active ? "Active" : "Disabled"}</strong></div>
          </div>
        </section>

        <section class="info-card">
          <div class="eyebrow">Security</div>
          <h1>Change Password</h1>
          <form class="stack-form" method="post" action="/profile/password">
            <label class="field">
              <span>Current password</span>
              <input name="current_password" type="password" required />
            </label>
            <label class="field">
              <span>New password</span>
              <input name="next_password" type="password" required />
            </label>
            <label class="field">
              <span>Confirm new password</span>
              <input name="confirm_password" type="password" required />
            </label>
            <button class="primary-button" type="submit">Update password</button>
          </form>
        </section>
      </div>
    `
  });
}
function renderLoginPage(appName, errorMessage = "") {
  const errorBlock = errorMessage ? `<div class="form-error">${errorMessage}</div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Login - ${appName}</title>
    <link rel="stylesheet" href="/public/styles.css" />
  </head>
  <body>
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-header">
          <div class="brand-block">
            <span class="brand-mark">T</span>
            <div>
              <div class="eyebrow">Remote Workspace</div>
              <div class="brand-name">${appName}</div>
            </div>
          </div>
          <h1>Login</h1>
          <p>Sign in to reach your saved SSH sessions and shared access.</p>
        </div>

        <form class="auth-form" method="post" action="/login">
          ${errorBlock}
          <label class="field">
            <span>Username</span>
            <input name="username" type="text" autocomplete="username" required />
          </label>
          <label class="field">
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <button class="primary-button wide" type="submit">Sign In</button>
        </form>

        <div class="auth-hint">
          First run uses the seeded admin credentials from <code>.env</code>. Default development login is <code>admin / admin123</code>.
        </div>
      </div>
    </div>
  </body>
</html>`;
}


function pushRecentSession(request, sessionId) {
  if (!sessionId) return;
  const nextId = Number(sessionId);
  if (!Number.isInteger(nextId)) return;

  const current = Array.isArray(request.session.recentSessionIds)
    ? request.session.recentSessionIds.map((value) => Number(value)).filter((value) => Number.isInteger(value))
    : [];

  request.session.recentSessionIds = [nextId, ...current.filter((value) => value !== nextId)].slice(0, 6);
}

function listRecentSessions(app, currentUser, recentSessionIds = [], excludeSessionId = null) {
  const results = [];
  const seen = new Set();

  for (const rawId of recentSessionIds) {
    const sessionId = Number(rawId);
    if (!Number.isInteger(sessionId) || seen.has(sessionId) || sessionId === excludeSessionId) continue;
    const session = getAccessibleSession(app.db, currentUser, sessionId);
    if (session) {
      results.push(session);
      seen.add(sessionId);
    }
  }

  return results;
}
function destroySession(request) {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function loadWorkspaceData(app, currentUser, options = {}) {
  const {
    selectedSessionId = null,
    rememberedSessionId = null,
    recentSessionIds = [],
    includeSelected = true,
    startTerminal = false,
    allowFallback = true
  } = options;

  const groups = listUserGroups(app.db, currentUser.id);
  const ownedSessions = listOwnedSessions(app.db, currentUser.id);
  const sharedSessions = listSharedSessions(app.db, currentUser.id);
  const favoriteSessions = listFavoriteSessions(app.db, currentUser);
  const recentSessions = listRecentSessions(app, currentUser, recentSessionIds, selectedSessionId || rememberedSessionId || null);

  let selectedSession = null;
  let terminalToken = "";
  let sharedUsers = [];
  let shareCandidates = [];

  if (includeSelected) {
    const candidateIds = [];
    for (const candidateId of [selectedSessionId, rememberedSessionId]) {
      if (candidateId && !candidateIds.includes(candidateId)) {
        candidateIds.push(candidateId);
      }
    }

    if (allowFallback) {
      for (const candidateId of [ownedSessions[0]?.id, sharedSessions[0]?.id]) {
        if (candidateId && !candidateIds.includes(candidateId)) {
          candidateIds.push(candidateId);
        }
      }
    }

    for (const candidateId of candidateIds) {
      const session = getAccessibleSession(app.db, currentUser, candidateId);
      if (session) {
        selectedSession = session;
        break;
      }
    }
  }

  if (selectedSession && startTerminal) {
    app.terminalManager.ensureSession(currentUser, selectedSession.id);
    terminalToken = app.terminalTokens.issue({
      userId: currentUser.id,
      role: currentUser.role,
      sessionId: selectedSession.id
    });
  }

  if (selectedSession && (currentUser.role === "admin" || selectedSession.owner_user_id === currentUser.id)) {
    sharedUsers = listSessionShares(app.db, selectedSession.id);
    const activeUsers = listActiveUsers(app.db);
    const sharedUserIds = new Set(sharedUsers.map((user) => user.id));
    shareCandidates = activeUsers.filter((user) => user.id !== selectedSession.owner_user_id && !sharedUserIds.has(user.id));
  }

  return {
    groups,
    ownedSessions,
    sharedSessions,
    favoriteSessions,
    recentSessions,
    selectedSession,
    sharedUsers,
    shareCandidates,
    terminalToken,
    activeSessionId: selectedSession?.id || null
  };
}
export async function registerWebRoutes(app, { config }) {
  app.get("/login", { preHandler: requireGuest }, async (_request, reply) => {
    reply.type("text/html").send(renderLoginPage(config.appName));
  });

  app.post("/login", { preHandler: requireGuest }, async (request, reply) => {
    const username = String(request.body?.username || "").trim();
    const password = String(request.body?.password || "");
    const user = await authenticateUser(app.db, { username, password });

    if (!user) {
      reply.code(401).type("text/html").send(renderLoginPage(config.appName, "Invalid username or password."));
      return;
    }

    request.session.userId = user.id;
    delete request.session.activeSessionId;
    writeAuditLog(app.db, {
      actorUserId: user.id,
      action: "login",
      targetType: "user",
      targetId: user.id,
      meta: { username: user.username }
    });
    reply.redirect("/");
  });

  app.post("/logout", { preHandler: requireAuth }, async (request, reply) => {
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "logout",
      targetType: "user",
      targetId: request.currentUser.id,
      meta: { username: request.currentUser.username }
    });
    await destroySession(request);
    reply.redirect("/login");
  });

  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    const selectedSessionId = request.query?.session_id ? Number(request.query.session_id) : null;
    const rememberedSessionId = request.session.activeSessionId ? Number(request.session.activeSessionId) : null;
    const data = loadWorkspaceData(app, request.currentUser, {
      selectedSessionId,
      rememberedSessionId,
      recentSessionIds: request.session.recentSessionIds || [],
      includeSelected: true,
      startTerminal: true,
      allowFallback: false
    });

    if (data.activeSessionId) {
      request.session.activeSessionId = data.activeSessionId;
      pushRecentSession(request, data.activeSessionId);
    } else {
      delete request.session.activeSessionId;
    }

    reply.type("text/html").send(
      renderHomePage(
        config.appName,
        request.currentUser,
        data.groups,
        data.ownedSessions,
        data.sharedSessions,
        data.selectedSession,
        data.favoriteSessions,
        data.recentSessions,
        data.shareCandidates,
        data.sharedUsers,
        data.terminalToken,
        getUserSettings(app.db, request.currentUser.id).terminal_font_size,
        request.query || {}
      )
    );
  });

  app.get("/sessions/close", { preHandler: requireAuth }, async (request, reply) => {
    delete request.session.activeSessionId;
    reply.redirect("/");
  });

  app.post("/sessions/:id/favorite-toggle", { preHandler: requireAuth }, async (request, reply) => {
    const sessionId = Number(request.params.id);
    const session = getAccessibleSession(app.db, request.currentUser, sessionId);
    if (!session) {
      reply.redirect("/?error=session-not-found");
      return;
    }
    const result = session.is_favorite
      ? removeSessionFavorite(app.db, request.currentUser, sessionId)
      : addSessionFavorite(app.db, request.currentUser, sessionId);
    if (result.error) {
      reply.redirect(`/?session_id=${sessionId}&error=${result.error}`);
      return;
    }
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: session.is_favorite ? "session.unfavorite" : "session.favorite",
      targetType: "session",
      targetId: sessionId,
      meta: { name: session.name }
    });
    reply.redirect(`/?session_id=${sessionId}`);
  });

  app.get("/create", { preHandler: requireAuth }, async (request, reply) => {
    const data = loadWorkspaceData(app, request.currentUser, {
      rememberedSessionId: request.session.activeSessionId ? Number(request.session.activeSessionId) : null,
      includeSelected: true,
      startTerminal: false,
      allowFallback: false
    });
    reply.type("text/html").send(
      renderCreatePage(config.appName, request.currentUser, data.groups, data.ownedSessions, data.sharedSessions, data.favoriteSessions, data.recentSessions, data.activeSessionId, request.query || {})
    );
  });

  app.get("/sessions/:id/edit", { preHandler: requireAuth }, async (request, reply) => {
    const sessionId = Number(request.params.id);
    const session = getEditableSession(app.db, request.currentUser, sessionId);
    if (!session) {
      reply.redirect("/?error=session-not-found");
      return;
    }

    const data = loadWorkspaceData(app, request.currentUser, {
      selectedSessionId: sessionId,
      rememberedSessionId: request.session.activeSessionId ? Number(request.session.activeSessionId) : null,
      includeSelected: true,
      startTerminal: false,
      allowFallback: false
    });
    reply.type("text/html").send(
      renderEditPage(config.appName, request.currentUser, data.groups, data.ownedSessions, data.sharedSessions, data.favoriteSessions, data.recentSessions, data.activeSessionId, session, data.shareCandidates, data.sharedUsers, request.query || {})
    );
  });

  app.post("/groups/create", { preHandler: requireAuth }, async (request, reply) => {
    const result = createGroupSafe(app.db, request.currentUser.id, request.body?.name);
    if (result.error) {
      reply.redirect(`/create?error=${result.error}`);
      return;
    }
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "group.create",
      targetType: "group",
      targetId: result.group.id,
      meta: { name: result.group.name }
    });
    reply.redirect("/create?ok=group-created");
  });

  app.post("/groups/:id/delete", { preHandler: requireAuth }, async (request, reply) => {
    const groupId = Number(request.params.id);
    deleteGroupForOwner(app.db, groupId, request.currentUser.id);
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "group.delete",
      targetType: "group",
      targetId: groupId
    });
    reply.redirect("/?ok=group-deleted");
  });

  app.post("/sessions/create", { preHandler: requireAuth }, async (request, reply) => {
    const result = createSessionSafe(app.db, config, request.currentUser.id, request.body || {});
    if (result.error) {
      reply.redirect(`/create?error=${result.error}`);
      return;
    }
    request.session.activeSessionId = Number(result.sessionId);
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "session.create",
      targetType: "session",
      targetId: Number(result.sessionId),
      meta: { name: request.body?.name, host: request.body?.host }
    });
    reply.redirect(`/?ok=session-created&session_id=${result.sessionId}`);
  });

  app.post("/sessions/:id/update", { preHandler: requireAuth }, async (request, reply) => {
    const sessionId = Number(request.params.id);
    const result = updateSessionSafe(app.db, config, request.currentUser, sessionId, request.body || {});
    if (result.error) {
      reply.redirect(`/sessions/${sessionId}/edit?error=${result.error}`);
      return;
    }
    request.session.activeSessionId = sessionId;
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "session.update",
      targetType: "session",
      targetId: sessionId,
      meta: { name: request.body?.name, host: request.body?.host }
    });
    reply.redirect(`/?ok=session-updated&session_id=${sessionId}`);
  });

  app.post("/sessions/:id/delete", { preHandler: requireAuth }, async (request, reply) => {
    const sessionId = Number(request.params.id);
    const result = deleteSessionForUser(app.db, request.currentUser, sessionId);
    if (result.error) {
      reply.redirect(`/?error=${result.error}`);
      return;
    }

    if (Number(request.session.activeSessionId) === sessionId) {
      delete request.session.activeSessionId;
    }

    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "session.delete",
      targetType: "session",
      targetId: sessionId
    });

    reply.redirect("/?ok=session-deleted");
  });

  app.post("/sessions/:id/share", { preHandler: requireAuth }, async (request, reply) => {
    const sessionId = Number(request.params.id);
    const targetUserId = Number(request.body?.user_id);
    const result = shareSessionWithUser(app.db, request.currentUser, sessionId, targetUserId);
    if (result.error) {
      reply.redirect(`/?session_id=${sessionId}&error=${result.error}`);
      return;
    }
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "session.share",
      targetType: "session",
      targetId: sessionId,
      meta: { sharedWithUserId: targetUserId }
    });
    reply.redirect(`/?session_id=${sessionId}&ok=session-shared`);
  });

  app.post("/sessions/:id/unshare/:userId", { preHandler: requireAuth }, async (request, reply) => {
    const sessionId = Number(request.params.id);
    const targetUserId = Number(request.params.userId);
    const result = revokeSessionShare(app.db, request.currentUser, sessionId, targetUserId);
    if (result.error) {
      reply.redirect(`/?session_id=${sessionId}&error=${result.error}`);
      return;
    }
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "session.unshare",
      targetType: "session",
      targetId: sessionId,
      meta: { sharedWithUserId: targetUserId }
    });
    reply.redirect(`/?session_id=${sessionId}&ok=session-unshared`);
  });

  app.get("/settings", { preHandler: requireAuth }, async (request, reply) => {
    const data = loadWorkspaceData(app, request.currentUser, {
      rememberedSessionId: request.session.activeSessionId ? Number(request.session.activeSessionId) : null,
      includeSelected: true,
      startTerminal: false,
      allowFallback: false
    });
    const settings = getUserSettings(app.db, request.currentUser.id);
    reply.type("text/html").send(
      renderSettingsPage(config.appName, request.currentUser, settings, request.query || {}, data.groups, data.ownedSessions, data.sharedSessions, data.favoriteSessions, data.recentSessions, data.activeSessionId)
    );
  });

  app.post("/settings", { preHandler: requireAuth }, async (request, reply) => {
    const settings = updateUserSettings(app.db, request.currentUser.id, request.body || {});
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "settings.update",
      targetType: "user_settings",
      targetId: request.currentUser.id,
      meta: { theme: settings.theme, terminalFontSize: settings.terminal_font_size }
    });
    reply.redirect("/settings?ok=settings-saved");
  });

  app.get("/settings/backup", { preHandler: requireAuth }, async (request, reply) => {
    const backup = exportUserBackup(app.db, config, request.currentUser);
    const safeName = String(request.currentUser.username || "user").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="terminux-backup-' + safeName + '.json"')
      .send(JSON.stringify(backup, null, 2));
  });

  app.post("/settings/backup/import", { preHandler: requireAuth }, async (request, reply) => {
    const result = importUserBackup(app.db, config, request.currentUser, request.body?.backup_json);
    if (result.error) {
      reply.redirect(`/settings?error=${result.error}`);
      return;
    }

    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "settings.backup.import",
      targetType: "user_settings",
      targetId: request.currentUser.id,
      meta: {
        groupsCreated: result.groupsCreated,
        sessionsCreated: result.sessionsCreated,
        sessionsUpdated: result.sessionsUpdated
      }
    });

    reply.redirect("/settings?ok=backup-imported");
  });

  app.get("/users/new", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const data = loadWorkspaceData(app, request.currentUser, {
      rememberedSessionId: request.session.activeSessionId ? Number(request.session.activeSessionId) : null,
      includeSelected: true,
      startTerminal: false,
      allowFallback: false
    });
    reply.type("text/html").send(renderCreateUserPage(config.appName, request.currentUser, request.query || {}, data.groups, data.ownedSessions, data.sharedSessions, data.favoriteSessions, data.recentSessions, data.activeSessionId));
  });
  app.get("/audit", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const data = loadWorkspaceData(app, request.currentUser, {
      rememberedSessionId: request.session.activeSessionId ? Number(request.session.activeSessionId) : null,
      includeSelected: true,
      startTerminal: false,
      allowFallback: false
    });
    const entries = listAuditLogs(app.db, 100);
    reply.type("text/html").send(renderAuditPage(config.appName, request.currentUser, entries, request.query || {}, data.groups, data.ownedSessions, data.sharedSessions, data.favoriteSessions, data.recentSessions, data.activeSessionId));
  });
  app.get("/users", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const data = loadWorkspaceData(app, request.currentUser, {
      rememberedSessionId: request.session.activeSessionId ? Number(request.session.activeSessionId) : null,
      includeSelected: true,
      startTerminal: false,
      allowFallback: false
    });
    const users = listUsers(app.db);
    reply.type("text/html").send(renderUsersPage(config.appName, request.currentUser, users, request.query || {}, data.groups, data.ownedSessions, data.sharedSessions, data.favoriteSessions, data.recentSessions, data.activeSessionId));
  });

  app.post("/users/create", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const result = createUserSafe(app.db, {
      username: request.body?.username,
      password: request.body?.password,
      role: request.body?.role
    });

    if (result.error) {
      reply.redirect(`/users/new?error=${result.error}`);
      return;
    }

    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "user.create",
      targetType: "user",
      targetId: result.user.id,
      meta: { username: result.user.username, role: result.user.role }
    });
    reply.redirect("/users?ok=user-created");
  });

  app.post("/users/:id/status", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const userId = Number(request.params.id);
    const user = findUserById(app.db, userId);
    if (!user) {
      reply.redirect("/users?error=user-not-found");
      return;
    }

    if (user.id === request.currentUser.id) {
      reply.redirect("/users?error=self-disable");
      return;
    }

    const nextActive = Number(request.body?.is_active) === 1 ? 1 : 0;
    setUserActive(app.db, userId, nextActive);
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "user.status",
      targetType: "user",
      targetId: userId,
      meta: { isActive: nextActive }
    });
    reply.redirect("/users?ok=user-updated");
  });

  app.post("/users/:id/delete", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const userId = Number(request.params.id);
    const user = findUserById(app.db, userId);
    if (!user) {
      reply.redirect("/users?error=user-not-found");
      return;
    }

    if (user.id === request.currentUser.id) {
      reply.redirect("/users?error=self-delete");
      return;
    }

    deleteUser(app.db, userId);
    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "user.delete",
      targetType: "user",
      targetId: userId,
      meta: { username: user.username }
    });
    reply.redirect("/users?ok=user-deleted");
  });

  app.get("/profile", { preHandler: requireAuth }, async (request, reply) => {
    const data = loadWorkspaceData(app, request.currentUser, {
      rememberedSessionId: request.session.activeSessionId ? Number(request.session.activeSessionId) : null,
      includeSelected: true,
      startTerminal: false,
      allowFallback: false
    });
    reply.type("text/html").send(
      renderProfilePage(config.appName, request.currentUser, request.query || {}, data.groups, data.ownedSessions, data.sharedSessions, data.favoriteSessions, data.recentSessions, data.activeSessionId)
    );
  });

  app.post("/profile/password", { preHandler: requireAuth }, async (request, reply) => {
    const result = changeUserPasswordSafe(app.db, request.currentUser.id, {
      currentPassword: request.body?.current_password,
      nextPassword: request.body?.next_password,
      confirmPassword: request.body?.confirm_password
    });

    if (result.error) {
      reply.redirect(`/profile?error=${result.error}`);
      return;
    }

    writeAuditLog(app.db, {
      actorUserId: request.currentUser.id,
      action: "profile.password.update",
      targetType: "user",
      targetId: request.currentUser.id,
      meta: { username: request.currentUser.username }
    });
    reply.redirect("/profile?ok=password-updated");
  });
}






























































