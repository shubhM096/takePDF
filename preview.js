let captureData = null;
let currentZoom = 1.0;
let totalPdfPages = 0;
let selectedPages = new Set();

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
  const zoomContainer = document.getElementById('zoomContainer');
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
    sidebar.classList.add('visible');
    
    // Set up PDF container
    const pdfContainer = document.createElement('div');
    pdfContainer.className = 'pdf-container';
    zoomContainer.appendChild(pdfContainer);
    
    // Convert base64 to Uint8Array for PDF.js
    const raw = atob(captureData.base64);
    const uint8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      uint8Array[i] = raw.charCodeAt(i);
    }
    
    // Dynamically import PDF.js
    import('./lib/pdf.min.mjs').then(async (pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';
      
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdfDoc = await loadingTask.promise;
      
      totalPdfPages = pdfDoc.numPages;
      buildPageSidebar();
      
      // Render all pages
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        
        let viewport = page.getViewport({ scale: 1.5 });
        const containerWidth = previewArea.clientWidth - 40; // minus padding
        if (viewport.width > containerWidth) {
          const scale = containerWidth / viewport.width * 1.5;
          viewport = page.getViewport({ scale });
        }

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        const ctx = canvas.getContext('2d');
        
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        const transform = outputScale !== 1 
          ? [outputScale, 0, 0, outputScale, 0, 0] 
          : null;

        pdfContainer.appendChild(canvas);
        
        const renderContext = {
          canvasContext: ctx,
          transform: transform,
          viewport: viewport
        };
        
        await page.render(renderContext).promise;
      }
    }).catch(err => {
      console.error('PDF.js render error:', err);
      // Fallback to simple card if rendering fails
      pdfContainer.innerHTML = `
        <div class="pdf-preview-card">
          <div class="pdf-icon">📄</div>
          <h2 class="pdf-title">${captureData.title || 'Untitled'}</h2>
          <button id="openPdfViewerBtn" class="btn-open-pdf">▶ Open in PDF Viewer</button>
        </div>
      `;
      document.getElementById('openPdfViewerBtn').addEventListener('click', () => {
        window.open(captureData._blobUrl, '_blank');
      });
    });
  } else {
    // Image preview — img tags are NOT subject to object-src CSP
    sidebar.classList.remove('visible');
    const img = document.createElement('img');
    img.src = captureData._blobUrl;
    img.className = 'preview-image';
    img.alt = 'Captured screenshot';
    zoomContainer.appendChild(img);
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
  
  // Zoom Controls
  document.getElementById('zoomInBtn').addEventListener('click', () => setZoom(currentZoom + 0.25));
  document.getElementById('zoomOutBtn').addEventListener('click', () => setZoom(currentZoom - 0.25));
  document.getElementById('zoomResetBtn').addEventListener('click', () => setZoom(1.0));
  
  // Sidebar Controls
  document.getElementById('selectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('.page-checkbox').forEach(cb => {
      if (!cb.checked) cb.parentElement.click();
    });
  });
  document.getElementById('deselectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('.page-checkbox').forEach(cb => {
      if (cb.checked) cb.parentElement.click();
    });
  });
}

function setZoom(level) {
  currentZoom = Math.max(0.25, Math.min(level, 3.0));
  document.getElementById('zoomLevel').textContent = `${Math.round(currentZoom * 100)}%`;
  document.getElementById('zoomContainer').style.transform = `scale(${currentZoom})`;
}

function buildPageSidebar() {
  const list = document.getElementById('pageList');
  list.innerHTML = '';
  selectedPages.clear();
  
  for (let i = 1; i <= totalPdfPages; i++) {
    selectedPages.add(i);
    
    const item = document.createElement('div');
    item.className = 'page-item';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'page-checkbox';
    cb.checked = true;
    cb.dataset.page = i;
    
    const label = document.createElement('span');
    label.className = 'page-label';
    label.textContent = `Page ${i}`;
    
    item.appendChild(cb);
    item.appendChild(label);
    
    item.addEventListener('click', (e) => {
      if (e.target !== cb) cb.checked = !cb.checked;
      if (cb.checked) {
        selectedPages.add(i);
        item.classList.remove('unselected');
      } else {
        selectedPages.delete(i);
        item.classList.add('unselected');
      }
    });
    
    list.appendChild(item);
  }
  
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
  
  let finalBlob;
  
  if (format === 'pdf' && selectedPages.size < totalPdfPages) {
    if (selectedPages.size === 0) {
      showNotification('Please select at least one page', 'error');
      return;
    }
    try {
      showNotification('Processing PDF...', 'info');
      // Subsetting PDF with pdf-lib
      const raw = atob(captureData.base64);
      const uint8Array = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) uint8Array[i] = raw.charCodeAt(i);
      
      const pdfDoc = await PDFLib.PDFDocument.load(uint8Array);
      const newPdf = await PDFLib.PDFDocument.create();
      
      const pagesToCopy = Array.from(selectedPages).sort((a,b)=>a-b).map(p => p - 1);
      const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
      copiedPages.forEach(p => newPdf.addPage(p));
      
      const pdfBytes = await newPdf.save();
      finalBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    } catch (e) {
      console.error('PDF modification failed', e);
      showNotification('Failed to modify PDF', 'error');
      return;
    }
  } else {
    // Download using original Blob
    finalBlob = base64ToBlob(captureData.base64, captureData.mimeType);
  }
  
  const downloadUrl = URL.createObjectURL(finalBlob);
  
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
