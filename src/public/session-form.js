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

function initSessionForms() {
  const forms = document.querySelectorAll('[data-session-form]');
  for (const form of forms) {
    const authSelect = form.querySelector('select[name="auth_type"]');
    if (!authSelect) continue;

    updateAuthFields(form);
    authSelect.addEventListener('change', () => updateAuthFields(form));
  }
}

initSessionForms();

