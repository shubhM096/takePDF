let captureData = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadCaptureData();
  if (!captureData) {
    showError('No capture data found. The capture may have expired.');
    return;
  }
  renderPreview();
  setupToolbar();
});

async function loadCaptureData() {
  // Try chrome.storage.session first
  const result = await chrome.storage.session.get('captureData');
  captureData = result.captureData || null;
}

function renderPreview() {
  const previewArea = document.getElementById('previewArea');
  const loading = document.getElementById('previewLoading');
  const sidebar = document.getElementById('sidebar');
  
  // Set capture info
  document.getElementById('captureInfo').textContent = 
    `${captureData.title} — ${new Date(captureData.timestamp).toLocaleString()}`;
  
  // Set filename (without extension)
  const nameWithoutExt = captureData.filename.replace(/\.[^.]+$/, '');
  document.getElementById('filenameInput').value = nameWithoutExt;
  
  // Set format dropdown
  document.getElementById('formatSelect').value = captureData.format;
  
  // Store blob URL on captureData for reuse
  const blob = base64ToBlob(captureData.base64, captureData.format === 'pdf' ? 'application/pdf' : captureData.mimeType);
  captureData._blobUrl = URL.createObjectURL(blob);
  
  if (captureData.format === 'pdf') {
    // MV3 CSP blocks blob:/data: in embed/iframe/object for PDFs.
    // Show PDF info card + "Open in PDF Viewer" button instead.
    sidebar.classList.add('visible');
    
    // Estimate page count from base64 size (rough heuristic)
    const sizeMB = (captureData.base64.length * 0.75 / (1024 * 1024)).toFixed(2);
    
    const card = document.createElement('div');
    card.className = 'pdf-preview-card';
    card.innerHTML = `
      <div class="pdf-icon">📄</div>
      <h2 class="pdf-title">${captureData.title || 'Untitled'}</h2>
      <p class="pdf-meta">${sizeMB} MB · PDF Document</p>
      <p class="pdf-url">${captureData.url || ''}</p>
      <button id="openPdfViewerBtn" class="btn-open-pdf">
        ▶ Open in PDF Viewer
      </button>
      <p class="pdf-hint">Opens in Chrome's built-in PDF viewer in a new tab</p>
    `;
    previewArea.appendChild(card);
    
    // Attach handler for the open button
    document.getElementById('openPdfViewerBtn').addEventListener('click', () => {
      window.open(captureData._blobUrl, '_blank');
    });
  } else {
    // Image preview — img tags are NOT subject to object-src CSP
    sidebar.classList.remove('visible');
    const img = document.createElement('img');
    img.src = captureData._blobUrl;
    img.className = 'preview-image';
    img.alt = 'Captured screenshot';
    previewArea.appendChild(img);
  }
  
  loading.style.display = 'none';
}

// Convert base64 string to Blob
function base64ToBlob(base64, mimeType) {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}

function setupToolbar() {
  // Save button
  document.getElementById('saveBtn').addEventListener('click', handleSave);
  
  // Copy to clipboard
  document.getElementById('copyBtn').addEventListener('click', handleCopy);
  
  // Re-capture (go back to the source tab)
  document.getElementById('recaptureBtn').addEventListener('click', handleRecapture);
  
  // Discard (close tab, clear data)
  document.getElementById('discardBtn').addEventListener('click', handleDiscard);
  
  // Close button
  document.getElementById('closeBtn').addEventListener('click', handleDiscard);
  
  // Format change — note: changing format from PDF to image requires re-capture
  document.getElementById('formatSelect').addEventListener('change', (e) => {
    const newFormat = e.target.value;
    if (captureData.format === 'pdf' && newFormat !== 'pdf') {
      // Can't convert PDF to image without re-capture
      showNotification('To change from PDF to image format, please re-capture the page.', 'warning');
      e.target.value = captureData.format;
    } else if (captureData.format !== 'pdf' && newFormat === 'pdf') {
      // Can't convert image to PDF without re-capture
      showNotification('To change from image to PDF format, please re-capture the page.', 'warning');
      e.target.value = captureData.format;
    }
    // Changing between image formats is fine (re-download with different extension)
  });
}

async function handleSave() {
  const filename = document.getElementById('filenameInput').value.trim() || 'capture';
  const format = document.getElementById('formatSelect').value;
  const ext = TakePDFUtils.getFileExtension(format);
  const fullFilename = filename + ext;
  
  // Download using Blob URL (data URLs hit size limits)
  const blob = base64ToBlob(captureData.base64, captureData.mimeType);
  const downloadUrl = URL.createObjectURL(blob);
  
  try {
    const dlId = await chrome.downloads.download({
      url: downloadUrl,
      filename: fullFilename,
      saveAs: true
    });
    showNotification(`Saved as ${fullFilename}`, 'success');
    // Revoke after download starts
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    
    // Log capture with the actual saved filename (not the auto-generated one)
    await chrome.runtime.sendMessage({
      action: 'logCapture',
      entry: {
        url: captureData.url,
        title: captureData.title,
        filename: fullFilename,
        format: captureData.format,
        timestamp: Date.now(),
        downloadId: dlId
      }
    });
  } catch (err) {
    showNotification(`Save failed: ${err.message}`, 'error');
  }
}

async function handleCopy() {
  try {
    if (captureData.format === 'pdf') {
      showNotification('Cannot copy PDF to clipboard. Use Save instead.', 'warning');
      return;
    }
    const blob = base64ToBlob(captureData.base64, captureData.mimeType);
    // Clipboard API requires image/png
    let pngBlob = blob;
    if (captureData.mimeType !== 'image/png') {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = URL.createObjectURL(blob); });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      URL.revokeObjectURL(img.src);
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    showNotification('Copied to clipboard!', 'success');
  } catch (err) {
    showNotification(`Copy failed: ${err.message}`, 'error');
  }
}

async function handleRecapture() {
  // Find the source tab and re-trigger capture
  if (captureData.sourceTabId) {
    try {
      await chrome.tabs.update(captureData.sourceTabId, { active: true });
      // Close preview tab
      window.close();
    } catch (e) {
      showNotification('Source tab may have been closed.', 'warning');
    }
  } else {
    showNotification('Cannot find the source tab.', 'warning');
  }
}

async function handleDiscard() {
  await chrome.storage.session.remove('captureData');
  window.close();
}

function showNotification(message, type = 'info') {
  // Remove existing notification if any
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.textContent = message;
  document.body.appendChild(notif);
  
  // Auto-remove after 3s
  setTimeout(() => {
    notif.classList.add('fade-out');
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function showError(message) {
  const previewArea = document.getElementById('previewArea');
  const loading = document.getElementById('previewLoading');
  loading.style.display = 'none';
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'preview-error';
  errorDiv.innerHTML = `<h2>⚠️ ${message}</h2><p>Try capturing the page again.</p>`;
  previewArea.appendChild(errorDiv);
}
