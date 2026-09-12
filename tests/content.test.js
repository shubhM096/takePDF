// content.js is an IIFE. It sets up a chrome.runtime.onMessage listener.
// Some handlers are async (preparePage, showCountdown, startAreaSelection) and return true from listener.
// Some handlers are sync (expandScrollable, restorePage) and call sendResponse directly.

// Mock document.fonts
Object.defineProperty(document, 'fonts', {
  value: { ready: Promise.resolve() },
  writable: true,
  configurable: true
});

// Mock window.scrollTo
window.scrollTo = jest.fn();

require('../content.js');

// Get the message listener
const getContentMessageListener = () => {
  const calls = chrome.runtime.onMessage.addListener.mock.calls;
  // content.js is the last to register (after setup.js if it registers any)
  return calls[calls.length - 1][0];
};

describe('Content Script Message Handling', () => {
  let messageListener;
  beforeAll(() => {
    messageListener = getContentMessageListener();
  });

  test('message listener is registered', () => {
    expect(messageListener).toBeDefined();
    expect(typeof messageListener).toBe('function');
  });

  test('responds to expandScrollable action synchronously', () => {
    const sendResponse = jest.fn();
    const result = messageListener({ action: 'expandScrollable' }, {}, sendResponse);
    // Sync handlers don't return true
    expect(result).not.toBe(true);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('responds to restorePage action synchronously', () => {
    const sendResponse = jest.fn();
    const result = messageListener({ action: 'restorePage' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('preparePage action returns true (async)', () => {
    const sendResponse = jest.fn();
    const result = messageListener({ action: 'preparePage' }, {}, sendResponse);
    // preparePage is async, so listener returns true to keep channel open
    expect(result).toBe(true);
  });

  test('showCountdown action returns true (async)', () => {
    const sendResponse = jest.fn();
    const result = messageListener({ action: 'showCountdown', seconds: 0 }, {}, sendResponse);
    expect(result).toBe(true);
  });

  test('startAreaSelection action returns true (async)', () => {
    const sendResponse = jest.fn();
    const result = messageListener({ action: 'startAreaSelection' }, {}, sendResponse);
    expect(result).toBe(true);
  });

  test('ignores unknown actions', () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'nonexistent' }, {}, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('preparePage', () => {
  let messageListener;
  beforeAll(() => {
    messageListener = getContentMessageListener();
  });

  test('disables smooth scrolling on prepare', async () => {
    document.documentElement.style.scrollBehavior = 'smooth';
    const sendResponse = jest.fn();
    messageListener({ action: 'preparePage' }, {}, sendResponse);
    // Wait for async preparePage to start
    await new Promise(r => setTimeout(r, 50));
    expect(document.documentElement.style.scrollBehavior).toBe('auto');
  });

  test('preparePage calls sendResponse with metrics', async () => {
    const sendResponse = jest.fn();
    messageListener({ action: 'preparePage', maxScrollDepth: 100 }, {}, sendResponse);
    // Wait for async operations including lazy loading
    await new Promise(r => setTimeout(r, 2000));
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        metrics: expect.objectContaining({
          scrollHeight: expect.any(Number),
          scrollWidth: expect.any(Number),
          devicePixelRatio: expect.any(Number)
        })
      })
    );
  }, 10000);
});

describe('expandScrollableContainers', () => {
  test('expands elements and returns count', () => {
    const sendResponse = jest.fn();
    const messageListener = getContentMessageListener();
    messageListener({ action: 'expandScrollable' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        expandedCount: expect.any(Number)
      })
    );
  });
});

describe('restorePage', () => {
  test('removes injected style elements', () => {
    // Add a takepdf style element
    const styleEl = document.createElement('style');
    styleEl.id = 'takepdf-hide-scrollbars';
    document.head.appendChild(styleEl);

    const sendResponse = jest.fn();
    const messageListener = getContentMessageListener();
    messageListener({ action: 'restorePage' }, {}, sendResponse);

    expect(document.getElementById('takepdf-hide-scrollbars')).toBeNull();
  });

  test('restores scroll behavior', () => {
    document.documentElement.style.scrollBehavior = 'auto';
    const sendResponse = jest.fn();
    const messageListener = getContentMessageListener();
    messageListener({ action: 'restorePage' }, {}, sendResponse);
    expect(document.documentElement.style.scrollBehavior).toBe('');
  });
});
