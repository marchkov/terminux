function updateAuthFields(form) {
  const authSelect = form.querySelector('select[name="auth_type"]');
  if (!authSelect) return;

  const authType = authSelect.value === 'key' ? 'key' : 'password';
  const passwordField = form.querySelector('[data-auth-field="password"]');
  const keyField = form.querySelector('[data-auth-field="key"]');
  const passphraseField = form.querySelector('[data-auth-field="passphrase"]');

  const toggleField = (field, shouldShow) => {
    if (!field) return;
    field.classList.toggle('is-hidden', !shouldShow);
    for (const control of field.querySelectorAll('input, textarea, select')) {
      control.disabled = !shouldShow;
    }
  };

  toggleField(passwordField, authType === 'password');
  toggleField(keyField, authType === 'key');
  toggleField(passphraseField, authType === 'key');
}

function clearFieldState(form) {
  for (const control of form.querySelectorAll('input, textarea, select')) {
    control.removeAttribute('aria-invalid');
  }
}

function setFormError(form, message, control = null) {
  const errorBox = form.querySelector('[data-session-form-error]');
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.remove('is-hidden');
  }
  if (control) {
    control.setAttribute('aria-invalid', 'true');
    control.focus();
  }
}

function clearFormError(form) {
  const errorBox = form.querySelector('[data-session-form-error]');
  if (errorBox) {
    errorBox.textContent = '';
    errorBox.classList.add('is-hidden');
  }
}

function validateSessionForm(form) {
  clearFieldState(form);
  clearFormError(form);

  const mode = form.dataset.formMode === 'edit' ? 'edit' : 'create';
  const nameInput = form.querySelector('input[name="name"]');
  const hostInput = form.querySelector('input[name="host"]');
  const portInput = form.querySelector('input[name="port"]');
  const usernameInput = form.querySelector('input[name="username"]');
  const authSelect = form.querySelector('select[name="auth_type"]');
  const passwordInput = form.querySelector('input[name="password"]');
  const keyInput = form.querySelector('textarea[name="private_key"]');

  if (!nameInput.value.trim()) {
    setFormError(form, 'Session name is required.', nameInput);
    return false;
  }

  const host = hostInput.value.trim();
  if (!host) {
    setFormError(form, 'Host is required.', hostInput);
    return false;
  }
  if (/\s/.test(host)) {
    setFormError(form, 'Host cannot contain spaces.', hostInput);
    return false;
  }

  const port = Number(portInput.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    setFormError(form, 'Port must be a number between 1 and 65535.', portInput);
    return false;
  }

  if (!usernameInput.value.trim()) {
    setFormError(form, 'Username is required.', usernameInput);
    return false;
  }

  const authType = authSelect.value === 'key' ? 'key' : 'password';
  if (authType === 'password') {
    const password = passwordInput.value.trim();
    if (mode === 'create' && !password) {
      setFormError(form, 'Password auth requires a password when creating a session.', passwordInput);
      return false;
    }
  }

  if (authType === 'key') {
    const privateKey = keyInput.value.trim();
    if (mode === 'create' && !privateKey) {
      setFormError(form, 'Key auth requires a private key when creating a session.', keyInput);
      return false;
    }
  }

  return true;
}

function initSessionForms() {
  const forms = document.querySelectorAll('[data-session-form]');
  for (const form of forms) {
    const authSelect = form.querySelector('select[name="auth_type"]');
    if (!authSelect) continue;

    updateAuthFields(form);
    authSelect.addEventListener('change', () => {
      updateAuthFields(form);
      clearFieldState(form);
      clearFormError(form);
    });

    form.addEventListener('input', () => {
      clearFieldState(form);
      clearFormError(form);
    });

    form.addEventListener('submit', (event) => {
      if (!validateSessionForm(form)) {
        event.preventDefault();
      }
    });
  }
}

initSessionForms();
