function navItem(label, href, isActive = false) {
  const className = isActive ? "nav-link active" : "nav-link";
  return `<a class="${className}" href="${href}">${label}</a>`;
}

export function renderLayout({ appName, title, currentPath, sidebar, content, currentUser, activeSessionId = null, headExtras = "", bodyEnd = "" }) {
  const sessionsHref = activeSessionId ? `/?session_id=${activeSessionId}` : "/";
  const usersLink = currentUser?.role === "admin"
    ? navItem("Users", "/users", currentPath === "/users")
    : "";
  const auditLink = currentUser?.role === "admin"
    ? navItem("Audit", "/audit", currentPath === "/audit")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} - ${appName}</title>
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
    <link rel="stylesheet" href="/public/styles.css" />
    ${headExtras}
  </head>
  <body>
    <div class="app-shell">
      <header class="topbar">
        <div class="brand-block">
          <span class="brand-mark">T</span>
          <div>
            <div class="eyebrow">Remote Workspace</div>
            <div class="brand-name">${appName}</div>
          </div>
        </div>
        <nav class="topnav">
          ${navItem("Sessions", sessionsHref, currentPath === "/")}
          ${navItem("Settings", "/settings", currentPath === "/settings")}
          ${usersLink}
          ${auditLink}
        </nav>
        <a class="profile-pill" href="/profile">${currentUser?.username || "profile"}</a>
      </header>
      <main class="workspace">
        <aside class="sidebar">
          ${sidebar}
        </aside>
        <section class="content-panel">
          ${content}
        </section>
      </main>
    </div>
    <script type="module" src="/public/sidebar.js"></script>
    ${bodyEnd}
  </body>
</html>`;
}





