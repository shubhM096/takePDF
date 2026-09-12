document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabTitleEl = document.getElementById('tabTitle');
  const tabUrlEl = document.getElementById('tabUrl');
  const tabFaviconEl = document.getElementById('tabFavicon');
  if (tabTitleEl) tabTitleEl.textContent = tab.title || 'Untitled';
  
  try {
    const url = new URL(tab.url);
    if (tabUrlEl) tabUrlEl.textContent = url.hostname;
    if (tabFaviconEl) tabFaviconEl.src = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
  } catch(e) {
    if (tabUrlEl) tabUrlEl.textContent = tab.url || '';
  }
  
  // 2. Load settings and apply to UI
  const settings = await loadSettings();
  const delayEl = document.getElementById('delaySelect');
  const expandEl = document.getElementById('expandToggle');
  const clipEl = document.getElementById('clipboardToggle');
  if (delayEl) delayEl.value = settings.defaultDelay || 0;
  if (expandEl) expandEl.checked = settings.expandScrollable !== false;
  if (clipEl) clipEl.checked = settings.autoCopyToClipboard || false;
  
  // 3. Button handlers
  document.getElementById('capturePdf')?.addEventListener('click', () => capture('pdf', 'full'));
  document.getElementById('capturePng')?.addEventListener('click', () => capture('png', 'full'));
  document.getElementById('captureJpeg')?.addEventListener('click', () => capture('jpeg', 'full'));
  document.getElementById('captureWebp')?.addEventListener('click', () => capture('webp', 'full'));
  document.getElementById('captureArea')?.addEventListener('click', () => capture('png', 'area'));
  
  // 4. Settings button
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage ? chrome.runtime.openOptionsPage() : window.open('settings.html');
  });
  
  // 4b. Open last save location
  document.getElementById('openLastSaveBtn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openLastSave' });
  });
  
  // 5. Listen for status updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.status) updateStatus(message);
  });
  
  // 6. Load recent captures
  loadRecentCaptures();
});

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('takePdfSettings', (result) => {
      resolve(result.takePdfSettings || {});
    });
  });
}

function capture(format, mode) {
  const delay = parseInt(document.getElementById('delaySelect').value) || 0;
  const expandScrollable = document.getElementById('expandToggle').checked;
  const copyToClipboard = document.getElementById('clipboardToggle').checked;
  
  showStatus('preparing', 'Preparing capture...');
  
  chrome.runtime.sendMessage({
    action: 'capture',
    format,
    mode,
    delay,
    expandScrollable,
    copyToClipboard
  });
  
  // Close popup after a delay if in area selection mode
  if (mode === 'area') {
    setTimeout(() => window.close(), 300);
  }
}

function updateStatus(statusObj) {
  showStatus(statusObj.status, statusObj.message, statusObj.step, statusObj.totalSteps, statusObj.progress);
  if (statusObj.status === 'done') {
    setTimeout(() => window.close(), 2000);
  }
}

function showStatus(status, message, step, totalSteps, progress) {
  const statusArea = document.getElementById('statusArea');
  const statusMessage = document.getElementById('statusMessage');
  const statusSpinner = document.getElementById('statusSpinner');
  const progressFill = document.getElementById('progressFill');
  const progressStep = document.getElementById('progressStep');
  
  statusArea.classList.remove('hidden');
  statusMessage.textContent = message;
  
  // Update progress bar
  if (step && totalSteps) {
    const percent = progress || Math.round((step / totalSteps) * 100);
    progressFill.style.width = percent + '%';
    progressStep.textContent = `Step ${step}/${totalSteps}`;
  }
  
  // Update spinner/icon based on status
  if (status === 'done') {
    statusSpinner.classList.add('done');
    statusSpinner.innerHTML = '✓';
    statusArea.classList.add('status-success');
    statusArea.classList.remove('status-error');
  } else if (status === 'error') {
    statusSpinner.classList.add('error');
    statusSpinner.innerHTML = '✗';
    statusArea.classList.add('status-error');
    statusArea.classList.remove('status-success');
  } else {
    statusSpinner.classList.remove('done', 'error');
    statusSpinner.innerHTML = '';
    statusArea.classList.remove('status-success', 'status-error');
  }
}

// Feature 9: Recent captures
async function loadRecentCaptures() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRecentCaptures' });
    const captures = response?.captures || [];
    const section = document.getElementById('recentSection');
    const list = document.getElementById('recentList');
    
    if (!section || !list || captures.length === 0) return;
    
    section.style.display = 'block';
    list.innerHTML = '';
    
    captures.forEach(cap => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.title = cap.url || '';
      
      const badge = document.createElement('span');
      badge.className = `format-badge badge-${cap.format}`;
      badge.textContent = (cap.format || 'pdf').toUpperCase();
      
      const title = document.createElement('span');
      title.className = 'recent-item-title';
      title.textContent = cap.filename || cap.title || 'Untitled';
      
      const time = document.createElement('span');
      time.className = 'recent-item-time';
      time.textContent = getRelativeTime(cap.timestamp);
      
      item.appendChild(badge);
      item.appendChild(title);
      item.appendChild(time);
      
      if (cap.downloadId) {
        item.addEventListener('click', () => chrome.downloads.show(cap.downloadId));
        item.style.cursor = 'pointer';
      }
      
      list.appendChild(item);
    });
  } catch (e) {
    // Silently fail — recent captures is non-critical
  }
}

function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
