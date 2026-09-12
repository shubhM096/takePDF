importScripts('utils.js');

// --- C4 FIX: Clear existing interval to prevent leaks ---
let keepAliveInterval = null;
function startKeepAlive() {
  // M3: Keep-alive is mostly obsolete (Chrome 118+ keeps SW alive during debugger sessions)
  // but retained as a safety net for the pre-debugger phase (delay countdown, page prep).
  if (keepAliveInterval) clearInterval(keepAliveInterval); // C4: prevent leak on double-call
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 25000);
}
function stopKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = null;
}

// --- H4 FIX: Concurrency lock to prevent double-captures on same tab ---
const activeCaptures = new Set();
let lastDownloadId = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'takepdf-capture-pdf', title: 'Capture Full Page as PDF', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'takepdf-capture-png', title: 'Capture Full Page as PNG', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'takepdf-capture-jpeg', title: 'Capture Full Page as JPEG', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'takepdf-capture-webp', title: 'Capture Full Page as WebP', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'takepdf-element-pdf', title: 'Capture This Element as PDF', contexts: ['all'] });
  chrome.contextMenus.create({ id: 'takepdf-element-png', title: 'Capture This Element as PNG', contexts: ['all'] });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-pdf') handleCapture({ format: 'pdf', mode: 'full', delay: 0, expandScrollable: true });
  if (command === 'capture-png') handleCapture({ format: 'png', mode: 'full', delay: 0, expandScrollable: true });
  if (command === 'capture-jpeg') handleCapture({ format: 'jpeg', mode: 'full', delay: 0, expandScrollable: true });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'takepdf-capture-pdf') handleCapture({ format: 'pdf', mode: 'full', delay: 0, expandScrollable: true }, tab);
  if (info.menuItemId === 'takepdf-capture-png') handleCapture({ format: 'png', mode: 'full', delay: 0, expandScrollable: true }, tab);
  if (info.menuItemId === 'takepdf-capture-jpeg') handleCapture({ format: 'jpeg', mode: 'full', delay: 0, expandScrollable: true }, tab);
  if (info.menuItemId === 'takepdf-capture-webp') handleCapture({ format: 'webp', mode: 'full', delay: 0, expandScrollable: true }, tab);
  
  if (info.menuItemId === 'takepdf-element-pdf' || info.menuItemId === 'takepdf-element-png') {
    const format = info.menuItemId === 'takepdf-element-pdf' ? 'pdf' : 'png';
    const rectRes = await sendToContent(tab.id, { action: 'getElementRect' }).catch(() => null);
    if (rectRes && rectRes.success) {
      handleCapture({ format, mode: 'area', delay: 0, clipRegion: rectRes.selection, expandScrollable: false }, tab);
    } else {
      sendStatus({ status: 'error', message: rectRes ? rectRes.message : 'Could not get element' });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture') {
    handleCapture(message).then(result => sendResponse(result)).catch(err => sendResponse({ status: 'error', message: err.message }));
    return true;
  }
  if (message.action === 'cancelCapture') {
    sendResponse({ status: 'cancelled' });
  }
  if (message.action === 'batchCapture') {
    handleBatchCapture(message).then(result => sendResponse(result)).catch(err => sendResponse({ status: 'error', message: err.message }));
    return true;
  }
  if (message.action === 'openLastSave') {
    if (lastDownloadId) {
      chrome.downloads.show(lastDownloadId);
    } else {
      chrome.downloads.showDefaultFolder();
    }
    sendResponse({ status: 'ok' });
  }
  if (message.action === 'openDownloadsFolder') {
    chrome.downloads.showDefaultFolder();
    sendResponse({ status: 'ok' });
  }
  if (message.action === 'scrollProgress') {
    sendStatus({ status: 'scrolling', message: `Loading content... ${message.percent}%`, step: 2, totalSteps: 6, progress: message.percent });
  }
});

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|devtools|view-source):/.test(url);
}

function sendStatus(statusObj) {
  chrome.runtime.sendMessage(statusObj).catch(() => {
    // Popup might be closed, ignore
  });
}

// --- M2 FIX: Ensure content script is injected before messaging ---
async function ensureContentScript(tabId) {
  try {
    // Try pinging the content script first
    await chrome.tabs.sendMessage(tabId, { action: '__ping' });
  } catch (e) {
    // Content script not present — inject it dynamically
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    // Brief wait for script to initialize
    await new Promise(r => setTimeout(r, 100));
  }
}

// --- Helper: safely send message to content script (with auto-inject fallback) ---
async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    // Content script missing — inject and retry once
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await new Promise(r => setTimeout(r, 100));
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

// --- C3 FIX (R2): data URI approach for chrome.downloads.download ---
// URL.createObjectURL is NOT available in MV3 service workers.
// chrome.downloads.download handles data URIs internally (not subject to navigation URI limits).
function makeDownloadUrl(base64, mimeType) {
  return `data:${mimeType};base64,${base64}`;
}

// --- L3: Max PNG capture height (Chrome GPU texture limit) ---
const MAX_PNG_HEIGHT = 16384;

async function handleCapture(options, providedTab) {
  startKeepAlive();
  let tabId;
  try {
    // 1. Get the active tab
    const tab = providedTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    tabId = tab.id;
    
    // 2. Validate URL
    if (isRestrictedUrl(tab.url)) {
      throw new Error('Cannot capture this page. Chrome internal pages are restricted.');
    }
    
    // H4: Reject if capture already in progress for this tab
    if (activeCaptures.has(tabId)) {
      throw new Error('A capture is already in progress for this tab.');
    }
    activeCaptures.add(tabId);
    
    // 3. Send status update
    sendStatus({ status: 'preparing', message: 'Preparing page...', step: 1, totalSteps: 6 });
    
    // 4. Load settings
    const settings = await TakePDFUtils.getSettings();
    const mergedOptions = { ...settings, ...options };
    
    // 5. Handle delay countdown
    if (mergedOptions.delay > 0) {
      sendStatus({ status: 'counting', message: `Capturing in ${mergedOptions.delay}s...`, countdown: mergedOptions.delay });
      await sendToContent(tabId, { action: 'showCountdown', seconds: mergedOptions.delay });
      await new Promise(resolve => setTimeout(resolve, mergedOptions.delay * 1000));
    }
    
    // 6. Prepare page via content script (M2: auto-injects if missing)
    sendStatus({ status: 'preparing', message: 'Loading content...', step: 2, totalSteps: 6, progress: 0 });
    await sendToContent(tabId, { 
      action: 'preparePage',
      format: mergedOptions.format,
      maxScrollDepth: mergedOptions.maxScrollDepth,
      hideScrollbars: mergedOptions.hideScrollbars,
      pauseAnimations: mergedOptions.pauseAnimations,
      hideCookieBanners: mergedOptions.hideCookieBanners
    });
    
    // 6b. Wait for CSS selector if configured (Feature 4)
    if (mergedOptions.waitForSelector) {
      sendStatus({ status: 'preparing', message: `Waiting for "${mergedOptions.waitForSelector}"...`, step: 2, totalSteps: 6 });
      const waitResult = await sendToContent(tabId, {
        action: 'waitForSelector',
        selector: mergedOptions.waitForSelector,
        timeout: mergedOptions.waitForSelectorTimeout || 10000
      });
      if (waitResult && !waitResult.found) {
        console.warn(`takePDF: ${waitResult.message}. Continuing anyway.`);
      }
    }
    
    // 7. Expand scrollable containers if enabled
    sendStatus({ status: 'preparing', message: 'Expanding containers...', step: 3, totalSteps: 6 });
    if (mergedOptions.expandScrollable) {
      await sendToContent(tabId, { action: 'expandScrollable' });
    }
    
    // 8. Handle area selection mode
    let clipRegion = mergedOptions.clipRegion || null;
    if (mergedOptions.mode === 'area' && !clipRegion) {
      sendStatus({ status: 'preparing', message: 'Select an area to capture...' });
      const selResult = await sendToContent(tabId, { action: 'startAreaSelection' });
      // H1 FIX: Abort if selection was cancelled or failed
      if (!selResult || !selResult.success) {
        throw new Error(selResult?.message || 'Area selection cancelled.');
      }
      clipRegion = selResult.selection;
    }
    
    // 9. Attach debugger
    sendStatus({ status: 'capturing', message: `Capturing ${mergedOptions.format.toUpperCase()}...`, step: 4, totalSteps: 6 });
    await chrome.debugger.attach({ tabId }, '1.3');
    
    let downloadData;
    let mimeType;
    let extension;
    
    if (mergedOptions.format === 'pdf') {
      // 10a. PDF Capture via CDP
      await chrome.debugger.sendCommand({ tabId }, 'Emulation.setEmulatedMedia', { media: 'screen' });
      
      // Get exact viewport dimensions via CDP Runtime (most reliable source)
      const dimResult = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: `JSON.stringify({
          viewportWidth: document.documentElement.clientWidth,
          scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
        })`,
        returnByValue: true
      });
      const dims = JSON.parse(dimResult.result.value);
      
      // Force the viewport to the full page height so Chrome renders everything in one shot
      await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', {
        width: dims.viewportWidth,
        height: dims.scrollHeight,
        deviceScaleFactor: 1,
        mobile: false
      });
      
      // Feature 5: Inject temporary styles and handle sticky elements based on stickyHandling mode
      const stickyMode = mergedOptions.stickyHandling || 'auto';
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: `((mode) => {
          const s = document.createElement('style');
          s.id = 'takepdf-print-fix';
          s.textContent = '@page { margin: 0 !important; size: auto !important; }';
          document.head.appendChild(s);
          
          if (mode === 'none') return;
          
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          
          document.querySelectorAll('header, nav, footer, aside, div, section, [role="banner"], [role="navigation"]').forEach(el => {
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
            
            el.dataset.takepdfOrigPos = el.style.position;
            el.dataset.takepdfOrigDisplay = el.style.display;
            
            if (mode === 'hide') {
              // Hide all fixed/sticky elements
              el.style.setProperty('display', 'none', 'important');
            } else if (mode === 'flatten') {
              // Convert all to absolute (legacy behavior)
              el.style.setProperty('position', 'absolute', 'important');
            } else {
              // 'auto' mode: smart detection
              const rect = el.getBoundingClientRect();
              const isWide = rect.width > vw * 0.8; // Spans >80% viewport width
              const isAtEdge = rect.top < 100 || rect.bottom > vh - 100; // Near top/bottom
              const zIndex = parseInt(cs.zIndex) || 0;
              const isOverlay = zIndex > 10;
              
              if (isWide && isAtEdge && isOverlay) {
                // Likely a header/footer bar — hide it completely
                el.style.setProperty('display', 'none', 'important');
              } else {
                // Not a header/footer — just flatten position
                el.style.setProperty('position', 'absolute', 'important');
              }
            }
          });
        })('${stickyMode}')`
      });
      
      // Brief pause for layout to settle after viewport + style changes
      await new Promise(r => setTimeout(r, 300));
      
      const paperWidth = dims.viewportWidth / 96;
      const paperHeight = dims.scrollHeight / 96;
      
      // Feature 6 & 10: PDF options (footer, page size)
      const pdfParams = {
        printBackground: true,
        preferCSSPageSize: false,
        generateTaggedPDF: true,
        scale: 1,
        transferMode: 'ReturnAsBase64'
      };
      
      // Feature 10: Page size
      const pageSize = mergedOptions.pdfPageSize || 'continuous';
      if (pageSize === 'continuous') {
        pdfParams.paperWidth = paperWidth;
        pdfParams.paperHeight = paperHeight;
        pdfParams.marginTop = 0;
        pdfParams.marginBottom = 0;
        pdfParams.marginLeft = 0;
        pdfParams.marginRight = 0;
      } else {
        // Standard page sizes (inches)
        const sizes = { a4: [8.27, 11.69], letter: [8.5, 11.0], legal: [8.5, 14.0] };
        const [w, h] = sizes[pageSize] || sizes.a4;
        pdfParams.paperWidth = w;
        pdfParams.paperHeight = h;
        pdfParams.marginTop = 0.4;
        pdfParams.marginBottom = 0.4;
        pdfParams.marginLeft = 0.4;
        pdfParams.marginRight = 0.4;
      }
      
      // Feature 6: PDF footer with source URL & date
      if (mergedOptions.pdfShowFooter) {
        pdfParams.displayHeaderFooter = true;
        pdfParams.headerTemplate = '<span></span>';
        pdfParams.footerTemplate = '<div style="font-size:8px;color:#999;width:100%;text-align:center;padding:4px 16px;"><span class="url"></span> — Captured <span class="date"></span></div>';
        // Ensure enough margin for footer when in continuous mode
        if (pageSize === 'continuous') {
          pdfParams.marginBottom = 0.4;
        }
      } else {
        pdfParams.displayHeaderFooter = false;
      }
      
      const pdfResult = await chrome.debugger.sendCommand({ tabId }, 'Page.printToPDF', pdfParams);
      
      // Clean up: restore fixed elements and remove injected style
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: `(() => {
          document.getElementById('takepdf-print-fix')?.remove();
          document.querySelectorAll('[data-takepdf-orig-pos]').forEach(el => {
            el.style.position = el.dataset.takepdfOrigPos || '';
            el.style.display = el.dataset.takepdfOrigDisplay || '';
            delete el.dataset.takepdfOrigPos;
            delete el.dataset.takepdfOrigDisplay;
          });
        })()`
      });
      
      // Clear device metrics override
      await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
      
      downloadData = pdfResult.data;
      mimeType = 'application/pdf';
      extension = '.pdf';
      
    } else {
      // 10b. Image Capture: PNG, JPEG, or WebP
      const metrics = await chrome.debugger.sendCommand({ tabId }, 'Page.getLayoutMetrics');
      const contentWidth = metrics.cssContentSize ? metrics.cssContentSize.width : metrics.contentSize.width;
      let contentHeight = metrics.cssContentSize ? metrics.cssContentSize.height : metrics.contentSize.height;
      
      // L3 FIX: Cap PNG height at Chrome's max texture size
      if (contentHeight > MAX_PNG_HEIGHT) {
        console.warn(`takePDF: Page height ${contentHeight}px exceeds max PNG height ${MAX_PNG_HEIGHT}px. Capping. Use PDF for full capture.`);
        contentHeight = MAX_PNG_HEIGHT;
      }
      
      const format = mergedOptions.format; // 'png', 'jpeg', or 'webp'
      const captureParams = {
        format: format === 'jpeg' ? 'jpeg' : format === 'webp' ? 'webp' : 'png',
        quality: format === 'jpeg' ? (mergedOptions.jpegQuality || 85) : 
                 format === 'webp' ? (mergedOptions.webpQuality || 90) : undefined,
        captureBeyondViewport: true,
        fromSurface: true,
        clip: clipRegion || {
          x: 0,
          y: 0,
          width: contentWidth,
          height: contentHeight,
          scale: 1
        }
      };
      if (captureParams.clip && !captureParams.clip.scale) captureParams.clip.scale = 1;
      
      const screenshotResult = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', captureParams);
      
      downloadData = screenshotResult.data;
      mimeType = TakePDFUtils.getMimeType(format);
      extension = TakePDFUtils.getFileExtension(format);
    }
    
    // 11. Detach debugger
    await chrome.debugger.detach({ tabId });
    
    // 12. Restore page IMMEDIATELY after detach (before download) to minimize visible changes
    await sendToContent(tabId, { action: 'restorePage' }).catch(() => {});
    
    // 13. Generate filename (with optional subfolder prefix)
    let filename = TakePDFUtils.generateFilename(mergedOptions.filenameTemplate || '{title}_{date}', tab.title, tab.url) + extension;
    if (mergedOptions.downloadSubfolder) {
      // Sanitize subfolder: remove leading/trailing slashes, normalize separators
      const subfolder = mergedOptions.downloadSubfolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (subfolder) {
        filename = subfolder + '/' + filename;
      }
    }
    
    // 14. Handle clipboard copy (C1 FIX R2: check base64 string length, not decoded size)
    if (mergedOptions.copyToClipboard && ['png', 'jpeg', 'webp'].includes(mergedOptions.format)) {
      const base64SizeMB = downloadData.length / (1024 * 1024); // Raw string size
      if (base64SizeMB > 45) {
        // Too large for IPC (~64MB limit) — download instead and warn
        console.warn(`takePDF: Image too large for clipboard (${base64SizeMB.toFixed(1)}MB base64). Downloading instead.`);
      const downloadUrl = makeDownloadUrl(downloadData, mimeType);
        const dlId = await chrome.downloads.download({ url: downloadUrl, filename, saveAs: !!mergedOptions.askSaveLocation });
        if (dlId) lastDownloadId = dlId;
        sendStatus({ status: 'done', message: `Downloaded (too large for clipboard)`, filename, step: 6, totalSteps: 6 });
      } else {
        // Safe size — use content script for clipboard
        // Note: Chrome's Clipboard API only supports image/png for ClipboardItem.
        // For JPEG/WebP, we convert to PNG via canvas before writing to clipboard.
        await chrome.scripting.executeScript({
          target: { tabId },
          func: async (base64Data, mt) => {
            const blob = await fetch(`data:${mt};base64,${base64Data}`).then(r => r.blob());
            let pngBlob = blob;
            if (mt !== 'image/png') {
              // Convert to PNG via canvas (Clipboard API requires image/png)
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
          },
          args: [downloadData, mimeType]
        });
        sendStatus({ status: 'done', message: 'Copied to clipboard!', filename, step: 6, totalSteps: 6 });
      }
    } else {
      // 15. Download file via data URI
      const downloadUrl = makeDownloadUrl(downloadData, mimeType);
      const dlId = await chrome.downloads.download({
        url: downloadUrl,
        filename: filename,
        saveAs: !!mergedOptions.askSaveLocation
      });
      if (dlId) lastDownloadId = dlId;
      sendStatus({ status: 'done', message: 'Download complete!', filename, downloadId: dlId, step: 6, totalSteps: 6 });
    }
    
    return { status: 'done', message: 'Capture complete!', filename };
    
  } catch (error) {
    console.error('takePDF capture error:', error);
    if (tabId) {
      await chrome.debugger.detach({ tabId }).catch(() => {});
      await sendToContent(tabId, { action: 'restorePage' }).catch(() => {});
    }
    sendStatus({ status: 'error', message: error.message || 'Capture failed' });
    return { status: 'error', message: error.message || 'Capture failed' };
  } finally {
    // H4: Release concurrency lock
    if (tabId) activeCaptures.delete(tabId);
    stopKeepAlive();
  }
}

// H3 FIX: Activate each tab before capture in batch mode
async function handleBatchCapture(options) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const validTabs = tabs.filter(t => !isRestrictedUrl(t.url));
  const originalTabId = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  
  for (let i = 0; i < validTabs.length; i++) {
    sendStatus({ status: 'capturing', message: `Capturing tab ${i + 1} of ${validTabs.length}...` });
    // H3: Bring tab to foreground so renderer is active
    await chrome.tabs.update(validTabs[i].id, { active: true });
    await new Promise(r => setTimeout(r, 500)); // Let renderer paint
    await handleCapture({ ...options, delay: 0 }, validTabs[i]);
    await new Promise(r => setTimeout(r, 300));
  }
  
  // Restore original active tab
  if (originalTabId) {
    await chrome.tabs.update(originalTabId, { active: true }).catch(() => {});
  }
  
  sendStatus({ status: 'done', message: `Batch capture complete! ${validTabs.length} pages captured.` });
}
