const DEFAULT_SETTINGS = {
  defaultFormat: 'pdf',
  pngQuality: 100,
  filenameTemplate: '{title}_{date}',
  defaultDelay: 0,
  autoCopyToClipboard: false,
  askSaveLocation: false,
  downloadSubfolder: '',
  expandScrollable: true,
  maxScrollDepth: 50000,
  hideScrollbars: true,
  pauseAnimations: true,
  hideCookieBanners: true
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  
  // Save button
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  
  // Reset button
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  
  // Live filename preview
  document.getElementById('filenameTemplate').addEventListener('input', updateFilenamePreview);
  
  // Quality slider value display
  document.getElementById('pngQuality').addEventListener('input', (e) => {
    document.getElementById('qualityValue').textContent = e.target.value;
  });
  
  // Open folders
  document.getElementById('openDownloadsBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openDownloadsFolder' });
  });
  document.getElementById('openLastSaveBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openLastSave' });
  });
});

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('takePdfSettings', (result) => {
      const settings = { ...DEFAULT_SETTINGS, ...result.takePdfSettings };
      populateForm(settings);
      resolve(settings);
    });
  });
}

function populateForm(settings) {
  if (settings.defaultFormat === 'png') {
    document.getElementById('formatPng').checked = true;
  } else {
    document.getElementById('formatPdf').checked = true;
  }
  
  document.getElementById('pngQuality').value = settings.pngQuality;
  document.getElementById('qualityValue').textContent = settings.pngQuality;
  document.getElementById('filenameTemplate').value = settings.filenameTemplate;
  document.getElementById('defaultDelay').value = settings.defaultDelay;
  document.getElementById('autoCopyClipboard').checked = settings.autoCopyToClipboard;
  document.getElementById('askSaveLocation').checked = settings.askSaveLocation;
  document.getElementById('downloadSubfolder').value = settings.downloadSubfolder || '';
  document.getElementById('expandScrollable').checked = settings.expandScrollable;
  document.getElementById('maxScrollDepth').value = settings.maxScrollDepth;
  document.getElementById('hideScrollbars').checked = settings.hideScrollbars;
  document.getElementById('pauseAnimations').checked = settings.pauseAnimations;
  document.getElementById('hideCookieBanners').checked = settings.hideCookieBanners;
  
  updateFilenamePreview();
}

function saveSettings() {
  const settings = {
    defaultFormat: document.querySelector('input[name="format"]:checked')?.value || 'pdf',
    pngQuality: parseInt(document.getElementById('pngQuality').value),
    filenameTemplate: document.getElementById('filenameTemplate').value || '{title}_{date}',
    defaultDelay: parseInt(document.getElementById('defaultDelay').value),
    autoCopyToClipboard: document.getElementById('autoCopyClipboard').checked,
    askSaveLocation: document.getElementById('askSaveLocation').checked,
    downloadSubfolder: document.getElementById('downloadSubfolder').value.trim(),
    expandScrollable: document.getElementById('expandScrollable').checked,
    maxScrollDepth: parseInt(document.getElementById('maxScrollDepth').value) || 50000,
    hideScrollbars: document.getElementById('hideScrollbars').checked,
    pauseAnimations: document.getElementById('pauseAnimations').checked,
    hideCookieBanners: document.getElementById('hideCookieBanners').checked
  };
  
  chrome.storage.local.set({ takePdfSettings: settings }, () => {
    showSaveConfirmation();
  });
}

function resetSettings() {
  populateForm(DEFAULT_SETTINGS);
  chrome.storage.local.set({ takePdfSettings: DEFAULT_SETTINGS });
  showSaveConfirmation('Reset to defaults!');
}

function updateFilenamePreview() {
  const template = document.getElementById('filenameTemplate').value;
  const now = new Date();
  const preview = template
    .replace('{title}', 'Example Page Title')
    .replace('{date}', now.toISOString().split('T')[0])
    .replace('{timestamp}', now.toISOString().split('T')[0] + '_' + now.toTimeString().split(' ')[0].replace(/:/g, '-'))
    .replace('{domain}', 'example.com');
  const format = document.querySelector('input[name="format"]:checked')?.value || 'pdf';
  document.getElementById('filenamePreview').textContent = preview + '.' + format;
}

function showSaveConfirmation(msg = 'Settings saved!') {
  const el = document.getElementById('saveConfirmation');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}
