const DEFAULT_SETTINGS = {
  defaultFormat: 'pdf',
  pngQuality: 100,
  jpegQuality: 85,
  webpQuality: 90,
  filenameTemplate: '{title}_{date}',
  defaultDelay: 0,
  autoCopyToClipboard: false,
  askSaveLocation: false,
  downloadSubfolder: '',
  expandScrollable: true,
  maxScrollDepth: 50000,
  hideScrollbars: true,
  pauseAnimations: true,
  hideCookieBanners: true,
  waitForSelector: '',
  waitForSelectorTimeout: 10000,
  stickyHandling: 'auto',
  pdfPageSize: 'continuous',
  pdfShowFooter: false
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
  document.getElementById('jpegQuality').addEventListener('input', (e) => {
    document.getElementById('jpegQualityValue').textContent = e.target.value;
  });
  document.getElementById('webpQuality').addEventListener('input', (e) => {
    document.getElementById('webpQualityValue').textContent = e.target.value;
  });
  
  // Format radio buttons -> show/hide quality sliders
  const formatRadios = document.querySelectorAll('input[name="format"]');
  formatRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('pngQualityGroup').style.display = radio.value === 'png' ? 'flex' : 'none';
      document.getElementById('jpegQualityGroup').style.display = radio.value === 'jpeg' ? 'flex' : 'none';
      document.getElementById('webpQualityGroup').style.display = radio.value === 'webp' ? 'flex' : 'none';
      updateFilenamePreview();
    });
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
  } else if (settings.defaultFormat === 'jpeg') {
    document.getElementById('formatJpeg').checked = true;
  } else if (settings.defaultFormat === 'webp') {
    document.getElementById('formatWebp').checked = true;
  } else {
    document.getElementById('formatPdf').checked = true;
  }
  
  // Trigger change to update visibility
  const selectedFormat = document.querySelector('input[name="format"]:checked');
  if(selectedFormat) {
    selectedFormat.dispatchEvent(new Event('change'));
  }
  
  document.getElementById('pngQuality').value = settings.pngQuality;
  document.getElementById('qualityValue').textContent = settings.pngQuality;
  
  document.getElementById('jpegQuality').value = settings.jpegQuality;
  document.getElementById('jpegQualityValue').textContent = settings.jpegQuality;
  
  document.getElementById('webpQuality').value = settings.webpQuality;
  document.getElementById('webpQualityValue').textContent = settings.webpQuality;
  
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
  
  document.getElementById('waitForSelector').value = settings.waitForSelector || '';
  document.getElementById('waitForSelectorTimeout').value = settings.waitForSelectorTimeout || 10000;
  document.getElementById('stickyHandling').value = settings.stickyHandling || 'auto';
  document.getElementById('pdfPageSize').value = settings.pdfPageSize || 'continuous';
  document.getElementById('pdfShowFooter').checked = settings.pdfShowFooter || false;
  
  updateFilenamePreview();
}

function saveSettings() {
  const settings = {
    defaultFormat: document.querySelector('input[name="format"]:checked')?.value || 'pdf',
    pngQuality: parseInt(document.getElementById('pngQuality').value),
    jpegQuality: parseInt(document.getElementById('jpegQuality').value),
    webpQuality: parseInt(document.getElementById('webpQuality').value),
    filenameTemplate: document.getElementById('filenameTemplate').value || '{title}_{date}',
    defaultDelay: parseInt(document.getElementById('defaultDelay').value),
    autoCopyToClipboard: document.getElementById('autoCopyClipboard').checked,
    askSaveLocation: document.getElementById('askSaveLocation').checked,
    downloadSubfolder: document.getElementById('downloadSubfolder').value.trim(),
    expandScrollable: document.getElementById('expandScrollable').checked,
    maxScrollDepth: parseInt(document.getElementById('maxScrollDepth').value) || 50000,
    hideScrollbars: document.getElementById('hideScrollbars').checked,
    pauseAnimations: document.getElementById('pauseAnimations').checked,
    hideCookieBanners: document.getElementById('hideCookieBanners').checked,
    waitForSelector: document.getElementById('waitForSelector').value.trim(),
    waitForSelectorTimeout: parseInt(document.getElementById('waitForSelectorTimeout').value) || 10000,
    stickyHandling: document.getElementById('stickyHandling').value,
    pdfPageSize: document.getElementById('pdfPageSize').value,
    pdfShowFooter: document.getElementById('pdfShowFooter').checked
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
  let format = document.querySelector('input[name="format"]:checked')?.value || 'pdf';
  if (format === 'jpeg') format = 'jpg';
  document.getElementById('filenamePreview').textContent = preview + '.' + format;
}

function showSaveConfirmation(msg = 'Settings saved!') {
  const el = document.getElementById('saveConfirmation');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}
