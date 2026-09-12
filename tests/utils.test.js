require('../utils.js');

describe('TakePDFUtils', () => {
  describe('generateFilename', () => {
    test('replaces {title} token with sanitized page title', () => {
      // sanitizeFilename replaces spaces with underscore
      expect(TakePDFUtils.generateFilename('{title}', 'Test Title', 'http://example.com')).toBe('Test_Title');
    });
    test('replaces {date} token with YYYY-MM-DD format', () => {
      const result = TakePDFUtils.generateFilename('{date}', 'Title', 'http://example.com');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    test('replaces {timestamp} with full datetime', () => {
      const result = TakePDFUtils.generateFilename('{timestamp}', 'Title', 'http://example.com');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    });
    test('replaces {domain} with hostname from URL', () => {
      expect(TakePDFUtils.generateFilename('{domain}', 'Title', 'http://example.com/test')).toBe('example.com');
    });
    test('handles multiple tokens in one template', () => {
      const result = TakePDFUtils.generateFilename('{title}_{domain}', 'Title', 'http://example.com');
      expect(result).toBe('Title_example.com');
    });
    test('falls back to "document" when title is empty', () => {
      // sanitizeFilename('') returns '' but generateFilename passes pageTitle || 'document'
      const result = TakePDFUtils.generateFilename('{title}', '', 'http://example.com');
      expect(result).toBe('document');
    });
  });

  describe('sanitizeFilename', () => {
    test('removes illegal characters (/ \\ : * ? " < > |)', () => {
      // All special chars between 'file' and 'name' are stripped (no whitespace between them)
      const result = TakePDFUtils.sanitizeFilename('file/:*?"<>|name');
      expect(result).toBe('filename');
    });
    test('removes backslash', () => {
      expect(TakePDFUtils.sanitizeFilename('file\\name')).toBe('filename');
    });
    test('truncates filenames exceeding 200 characters', () => {
      const longName = 'a'.repeat(250);
      expect(TakePDFUtils.sanitizeFilename(longName).length).toBe(200);
    });
    test('preserves unicode characters', () => {
      expect(TakePDFUtils.sanitizeFilename('file_名称')).toBe('file_名称');
    });
    test('replaces consecutive spaces with single underscore', () => {
      expect(TakePDFUtils.sanitizeFilename('file   name')).toBe('file_name');
    });
    test('handles empty string input', () => {
      expect(TakePDFUtils.sanitizeFilename('')).toBe('');
    });
    test('handles null input', () => {
      expect(TakePDFUtils.sanitizeFilename(null)).toBe('');
    });
  });




  describe('formatFileSize', () => {
    test('formats bytes correctly', () => {
      // formatFileSize uses 'Bytes' not 'B'
      expect(TakePDFUtils.formatFileSize(500)).toBe('500 Bytes');
    });
    test('formats KB correctly', () => {
      // parseFloat removes trailing zeros: 1.00 -> 1
      expect(TakePDFUtils.formatFileSize(1024)).toBe('1 KB');
    });
    test('formats MB correctly', () => {
      expect(TakePDFUtils.formatFileSize(1048576)).toBe('1 MB');
    });
    test('formats fractional MB correctly', () => {
      // 2.4 * 1024 * 1024 = 2516582.4
      expect(TakePDFUtils.formatFileSize(2516582)).toBe('2.4 MB');
    });
    test('handles 0 bytes', () => {
      expect(TakePDFUtils.formatFileSize(0)).toBe('0 Bytes');
    });
  });

  describe('getTimestamp', () => {
    test('returns YYYY-MM-DD_HH-MM-SS format', () => {
      expect(TakePDFUtils.getTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    });
  });

  describe('getDateString', () => {
    test('returns YYYY-MM-DD format', () => {
      expect(TakePDFUtils.getDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getSettings', () => {
    test('returns default settings when storage is empty', async () => {
      chrome.storage.local.get.mockImplementationOnce((key, cb) => {
        cb({});
      });
      const settings = await TakePDFUtils.getSettings();
      expect(settings).toEqual(TakePDFUtils.DEFAULT_SETTINGS);
    });

    test('merges stored settings with defaults', async () => {
      chrome.storage.local.get.mockImplementationOnce((key, cb) => {
        // getSettings looks for result.takePdfSettings
        cb({ takePdfSettings: { defaultFormat: 'png', pngQuality: 85 } });
      });
      const settings = await TakePDFUtils.getSettings();
      expect(settings.defaultFormat).toBe('png');
      expect(settings.pngQuality).toBe(85);
      // Other defaults should still be present
      expect(settings.expandScrollable).toBe(true);
    });

    test('DEFAULT_SETTINGS has expected keys', () => {
      expect(TakePDFUtils.DEFAULT_SETTINGS).toHaveProperty('defaultFormat', 'pdf');
      expect(TakePDFUtils.DEFAULT_SETTINGS).toHaveProperty('pngQuality', 100);
      expect(TakePDFUtils.DEFAULT_SETTINGS).toHaveProperty('expandScrollable', true);
      expect(TakePDFUtils.DEFAULT_SETTINGS).toHaveProperty('filenameTemplate', '{title}_{date}');
    });
  });
});
