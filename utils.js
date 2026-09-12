// Since service workers can't use ES modules easily, use a self-executing pattern
// that adds utils to globalThis/self

const TakePDFUtils = {
  generateFilename(template, pageTitle, pageUrl) {
    const date = this.getDateString();
    const timestamp = this.getTimestamp();
    const title = this.sanitizeFilename(pageTitle || 'document');
    let domain = 'unknown';
    try {
      const urlObj = new URL(pageUrl);
      domain = urlObj.hostname;
    } catch (e) {}
    const urlSanitized = this.sanitizeFilename(pageUrl || '');

    return template
      .replace(/{title}/g, title)
      .replace(/{date}/g, date)
      .replace(/{timestamp}/g, timestamp)
      .replace(/{domain}/g, domain)
      .replace(/{url}/g, urlSanitized);
  },
  
  sanitizeFilename(name) {
    if (!name) return '';
    return name
      .replace(/[\/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 200);
  },
  
  getMimeType(format) {
    if (format === 'png') return 'image/png';
    if (format === 'jpeg') return 'image/jpeg';
    if (format === 'webp') return 'image/webp';
    return 'application/pdf';
  },
  
  getFileExtension(format) {
    if (format === 'png') return '.png';
    if (format === 'jpeg') return '.jpg';
    if (format === 'webp') return '.webp';
    return '.pdf';
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  getTimestamp() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}_${h}-${min}-${s}`;
  },
  
  getDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  DEFAULT_SETTINGS: {
    defaultFormat: 'pdf',
    pngQuality: 100,
    jpegQuality: 85,
    webpQuality: 90,
    waitForSelector: '',
    waitForSelectorTimeout: 10000,
    stickyHandling: 'auto',
    pdfShowFooter: false,
    pdfPageSize: 'continuous',
    showPreview: false,
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
  },

  async getSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get('takePdfSettings', (result) => {
        resolve({ ...this.DEFAULT_SETTINGS, ...(result.takePdfSettings || {}) });
      });
    });
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.TakePDFUtils = TakePDFUtils;
} else if (typeof self !== 'undefined') {
  self.TakePDFUtils = TakePDFUtils;
}
