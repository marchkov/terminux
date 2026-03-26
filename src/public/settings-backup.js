function initSettingsBackup() {
  const form = document.querySelector('[data-backup-import-form]');
  if (!form) return;

  const fileInput = form.querySelector('[data-backup-file]');
  const jsonField = form.querySelector('[data-backup-json]');
  const meta = form.querySelector('[data-backup-file-meta]');
  const submitButton = form.querySelector('[data-backup-submit]');

  function setMeta(text, isError = false) {
    if (!meta) return;
    meta.textContent = text;
    meta.classList.toggle('form-error', isError);
  }

  function setReady(isReady) {
    if (submitButton) submitButton.disabled = !isReady;
  }

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      jsonField.value = '';
      setMeta('No file selected yet.');
      setReady(false);
      return;
    }

    try {
      const text = await file.text();
      JSON.parse(text);
      jsonField.value = text;
      setMeta(`Loaded backup file: ${file.name}`);
      setReady(true);
    } catch {
      jsonField.value = '';
      setMeta('The selected file is not valid JSON.', true);
      setReady(false);
    }
  });
}

initSettingsBackup();
