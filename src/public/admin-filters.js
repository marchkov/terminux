function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function initUserFilters() {
  const root = document.querySelector('[data-user-filters]');
  if (!root) return;

  const searchInput = root.querySelector('[data-user-search]');
  const roleSelect = root.querySelector('[data-user-role]');
  const statusSelect = root.querySelector('[data-user-status]');
  const rows = Array.from(document.querySelectorAll('[data-user-row]'));
  const emptyState = document.querySelector('[data-user-filter-empty]');
  const meta = document.querySelector('[data-user-filter-meta]');

  function apply() {
    const search = normalize(searchInput?.value);
    const role = roleSelect?.value || 'all';
    const status = statusSelect?.value || 'all';
    let visible = 0;

    for (const row of rows) {
      const username = normalize(row.dataset.username);
      const rowRole = normalize(row.dataset.role);
      const rowStatus = normalize(row.dataset.status);
      const matchesSearch = !search || username.includes(search);
      const matchesRole = role === 'all' || rowRole === role;
      const matchesStatus = status === 'all' || rowStatus === status;
      const matches = matchesSearch && matchesRole && matchesStatus;
      row.classList.toggle('is-hidden', !matches);
      if (matches) visible += 1;
    }

    if (emptyState) emptyState.classList.toggle('is-hidden', visible > 0);
    if (meta) {
      meta.textContent = visible === rows.length
        ? 'Showing all accounts.'
        : `Showing ${visible} of ${rows.length} accounts.`;
    }
  }

  searchInput?.addEventListener('input', apply);
  roleSelect?.addEventListener('change', apply);
  statusSelect?.addEventListener('change', apply);
  apply();
}

function matchesAuditAction(filterValue, action) {
  if (filterValue === 'all') return true;
  if (filterValue === 'login' || filterValue === 'logout') {
    return action === filterValue;
  }
  return action.startsWith(`${filterValue}.`);
}

function initAuditFilters() {
  const root = document.querySelector('[data-audit-filters]');
  if (!root) return;

  const searchInput = root.querySelector('[data-audit-search]');
  const actionSelect = root.querySelector('[data-audit-action]');
  const actorInput = root.querySelector('[data-audit-actor]');
  const rows = Array.from(document.querySelectorAll('[data-audit-row]'));
  const emptyState = document.querySelector('[data-audit-filter-empty]');
  const meta = document.querySelector('[data-audit-filter-meta]');

  function apply() {
    const search = normalize(searchInput?.value);
    const actionFilter = actionSelect?.value || 'all';
    const actorFilter = normalize(actorInput?.value);
    let visible = 0;

    for (const row of rows) {
      const action = normalize(row.dataset.action);
      const actor = normalize(row.dataset.actor);
      const details = normalize(row.dataset.details);
      const matchesSearch = !search || action.includes(search) || actor.includes(search) || details.includes(search);
      const matchesActor = !actorFilter || actor.includes(actorFilter);
      const matchesAction = matchesAuditAction(actionFilter, action);
      const matches = matchesSearch && matchesActor && matchesAction;
      row.classList.toggle('is-hidden', !matches);
      if (matches) visible += 1;
    }

    if (emptyState) emptyState.classList.toggle('is-hidden', visible > 0);
    if (meta) {
      meta.textContent = visible === rows.length
        ? 'Showing the latest audit events.'
        : `Showing ${visible} of ${rows.length} audit events.`;
    }
  }

  searchInput?.addEventListener('input', apply);
  actorInput?.addEventListener('input', apply);
  actionSelect?.addEventListener('change', apply);
  apply();
}

initUserFilters();
initAuditFilters();
