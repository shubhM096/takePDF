// Mock Chrome APIs for testing
global.chrome = {
  debugger: {
    attach: jest.fn().mockResolvedValue(),
    detach: jest.fn().mockResolvedValue(),
    sendCommand: jest.fn().mockResolvedValue({}),
  },
  tabs: {
    query: jest.fn().mockResolvedValue([{ id: 1, title: 'Test Page', url: 'https://example.com/test' }]),
    sendMessage: jest.fn().mockResolvedValue({ success: true, metrics: { scrollHeight: 5000, scrollWidth: 1200, devicePixelRatio: 2 } }),
  },
  scripting: {
    executeScript: jest.fn().mockResolvedValue([{ result: {} }]),
  },
  downloads: {
    download: jest.fn().mockResolvedValue(1),
  },
  storage: {
    local: {
      get: jest.fn((key, cb) => {
        if (typeof cb === 'function') cb({});
        return Promise.resolve({});
      }),
      set: jest.fn((items, cb) => {
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }),
    },
  },
  commands: {
    onCommand: { addListener: jest.fn() },
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: { addListener: jest.fn() },
    removeAll: jest.fn((cb) => { if (cb) cb(); return Promise.resolve(); })
  },
  runtime: {
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn().mockImplementation(() => Promise.resolve()),
    onInstalled: { addListener: jest.fn() },
    getPlatformInfo: jest.fn((cb) => { if (typeof cb === 'function') cb({ os: 'win' }); }),
    openOptionsPage: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
};

// Mock importScripts for service worker context
global.importScripts = jest.fn();

// Mock window functions that may be needed
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');

// Mock document.fonts for content script
if (typeof document !== 'undefined') {
  Object.defineProperty(document, 'fonts', {
    value: { ready: Promise.resolve() },
    writable: true,
    configurable: true
  });
}
