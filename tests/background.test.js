// background.js uses importScripts('utils.js') which we mock.
// Load utils first (sets global.TakePDFUtils)
require('../utils.js');

// Now load background.js - importScripts is mocked
require('../background.js');

// CAPTURE the message listener BEFORE any beforeEach clears mocks
const messageListenerCalls = chrome.runtime.onMessage.addListener.mock.calls;
const messageListener = messageListenerCalls[messageListenerCalls.length - 1]?.[0];

// Also capture the onInstalled listener before mocks are cleared
const installListenerCalls = chrome.runtime.onInstalled.addListener.mock.calls;
const installListener = installListenerCalls[0]?.[0];

beforeEach(() => {
  jest.clearAllMocks();
  chrome.debugger.sendCommand.mockImplementation((target, method, params) => {
    if (method === 'Emulation.setEmulatedMedia') return Promise.resolve();
    if (method === 'Emulation.setDeviceMetricsOverride') return Promise.resolve();
    if (method === 'Emulation.clearDeviceMetricsOverride') return Promise.resolve();
    if (method === 'Runtime.evaluate') {
      // Return mock viewport dimensions for PDF capture
      return Promise.resolve({
        result: { value: JSON.stringify({ viewportWidth: 1280, scrollHeight: 5000 }) }
      });
    }
    if (method === 'Page.getLayoutMetrics') {
      return Promise.resolve({
        cssContentSize: { width: 1200, height: 5000 },
        cssLayoutViewport: { clientWidth: 1280 },
        contentSize: { width: 1200, height: 5000 }
      });
    }
    if (method === 'Page.printToPDF') {
      return Promise.resolve({ data: btoa('fake-pdf-content') });
    }
    if (method === 'Page.captureScreenshot') {
      return Promise.resolve({ data: btoa('fake-png-content') });
    }
    return Promise.resolve({});
  });
  chrome.tabs.sendMessage.mockResolvedValue({
    success: true,
    metrics: { scrollHeight: 5000, scrollWidth: 1200, devicePixelRatio: 2 }
  });
  chrome.runtime.sendMessage.mockImplementation(() => Promise.resolve());
  chrome.debugger.attach.mockResolvedValue();
  chrome.debugger.detach.mockResolvedValue();
  chrome.downloads.download.mockResolvedValue(1);
  chrome.scripting.executeScript.mockResolvedValue([{ result: {} }]);
});

describe('Message Listener', () => {
  test('message listener is captured and defined', () => {
    expect(messageListener).toBeDefined();
    expect(typeof messageListener).toBe('function');
  });

  test('handles capture action via message listener', () => {
    const sendResponse = jest.fn();
    const result = messageListener(
      { action: 'capture', format: 'pdf', mode: 'full' },
      {},
      sendResponse
    );
    expect(result).toBe(true);
  });

  test('handles batchCapture action', () => {
    const sendResponse = jest.fn();
    const result = messageListener({ action: 'batchCapture', format: 'pdf' }, {}, sendResponse);
    expect(result).toBe(true);
  });

  // Wait for async captures to settle so activeCaptures Set is cleared
  afterEach(async () => {
    await new Promise(r => setTimeout(r, 800));
  });
});

describe('Capture via message listener - PDF flow', () => {
  test('attaches debugger with protocol 1.3 on PDF capture', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 700));
    expect(chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 1 }, '1.3');
  });

  test('detaches debugger after successful PDF capture', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 700));
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 1 });
  });

  test('sets emulated media to screen for PDF', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 700));
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      'Emulation.setEmulatedMedia',
      { media: 'screen' }
    );
  });

  test('calls Page.getLayoutMetrics for PDF', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 700));
    // PDF now uses Runtime.evaluate for viewport dimensions instead of Page.getLayoutMetrics
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      'Runtime.evaluate',
      expect.objectContaining({ returnByValue: true })
    );
  });

  test('calls Page.printToPDF with correct params', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 700));
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      'Page.printToPDF',
      expect.objectContaining({
        paperWidth: expect.any(Number),
        paperHeight: expect.any(Number),
        printBackground: true,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0
      })
    );
  });

  test('downloads PDF via data URI', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 700));
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringMatching(/^data:application\/pdf;base64,/),
        filename: expect.stringMatching(/\.pdf$/)
      })
    );
  });
});

describe('Capture via message listener - PNG flow', () => {
  test('calls Page.captureScreenshot with captureBeyondViewport for PNG', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'png', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 1200));
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      'Page.captureScreenshot',
      expect.objectContaining({ captureBeyondViewport: true })
    );
  });

  test('downloads PNG via data URI', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'png', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 1200));
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringMatching(/^data:image\/png;base64,/),
        filename: expect.stringMatching(/\.png$/)
      })
    );
  });
});

describe('Error handling', () => {
  test('detaches debugger on capture error', async () => {
    chrome.debugger.sendCommand.mockRejectedValue(new Error('CDP Error'));
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 300));
    expect(chrome.debugger.detach).toHaveBeenCalled();
  });

  test('returns error status for restricted URLs', async () => {
    chrome.tabs.query.mockResolvedValueOnce([{ id: 1, title: 'Settings', url: 'chrome://settings' }]);
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 300));
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });

  // H4: Concurrency lock test
  test('rejects concurrent capture on same tab', async () => {
    // Make the first capture slow by delaying CDP responses
    let callCount = 0;
    chrome.debugger.sendCommand.mockImplementation(async (target, method) => {
      callCount++;
      if (callCount <= 3) {
        // Slow down the first capture's CDP calls
        await new Promise(r => setTimeout(r, 200));
      }
      if (method === 'Page.getLayoutMetrics') {
        return { cssContentSize: { width: 1200, height: 5000 }, contentSize: { width: 1200, height: 5000 } };
      }
      if (method === 'Page.printToPDF') return { data: btoa('fake-pdf') };
      if (method === 'Page.captureScreenshot') return { data: btoa('fake-png') };
      return {};
    });

    const sendResponse1 = jest.fn();
    const sendResponse2 = jest.fn();
    // Start first capture (will be in progress due to delays)
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse1);
    // Wait just enough for the first capture to acquire the lock
    await new Promise(r => setTimeout(r, 50));
    // Start second capture on same tab — should be rejected
    messageListener({ action: 'capture', format: 'pdf', mode: 'full' }, {}, sendResponse2);
    await new Promise(r => setTimeout(r, 100));
    // Second should fail with error immediately
    expect(sendResponse2).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', message: expect.stringContaining('already in progress') })
    );
    // Wait for first to finish to clean up
    await new Promise(r => setTimeout(r, 1000));
  }, 10000);

  // H1: Area selection cancel test
  test('aborts capture when area selection is cancelled', async () => {
    chrome.tabs.sendMessage.mockImplementation(async (tabId, msg) => {
      if (msg.action === 'startAreaSelection') {
        return { success: false, message: 'Selection cancelled' };
      }
      return { success: true, metrics: { scrollHeight: 5000, scrollWidth: 1200, devicePixelRatio: 2 } };
    });
    const sendResponse = jest.fn();
    messageListener({ action: 'capture', format: 'png', mode: 'area' }, {}, sendResponse);
    await new Promise(r => setTimeout(r, 300));
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });
});

describe('Context menus', () => {
  test('install listener is defined', () => {
    expect(installListener).toBeDefined();
  });

  test('registers context menus on install', () => {
    installListener();
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'takepdf-capture-pdf' })
    );
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'takepdf-capture-png' })
    );
  });
});
