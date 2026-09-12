// popup.js sends message with flat properties: { action, format, mode, delay, expandScrollable, copyToClipboard }
// popup.js displays hostname (not full URL) from tab.url
// popup.js uses chrome.runtime.sendMessage (not chrome.tabs.sendMessage) for capture

beforeEach(() => {
  jest.clearAllMocks();
  // Re-set up DOM before each test
  document.body.innerHTML = `
    <span id="tabTitle"></span>
    <span id="tabUrl"></span>
    <img id="tabFavicon" />
    <button id="capturePdf"></button>
    <button id="capturePng"></button>
    <button id="captureJpeg"></button>
    <button id="captureWebp"></button>
    <button id="captureArea"></button>
    <select id="delaySelect">
      <option value="0">No delay</option>
      <option value="3">3 seconds</option>
      <option value="5">5 seconds</option>
    </select>
    <input type="checkbox" id="expandToggle" checked />
    <input type="checkbox" id="clipboardToggle" />
    <div id="statusArea" class="hidden"></div>
    <div id="statusSpinner"></div>
    <span id="statusMessage"></span>
    <div id="progressFill"></div>
    <span id="progressStep"></span>
    <button id="settingsBtn"></button>
    <button id="openLastSaveBtn"></button>
  `;

  // Re-require popup.js to re-register DOMContentLoaded listener
  jest.resetModules();
  // Ensure chrome mocks are fresh
  chrome.runtime.sendMessage = jest.fn().mockImplementation(() => Promise.resolve());
  chrome.runtime.onMessage = { addListener: jest.fn() };
  chrome.storage.local.get = jest.fn((key, cb) => {
    if (typeof cb === 'function') cb({});
    return Promise.resolve({});
  });
});

async function loadPopup() {
  require('../popup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  // Wait for async operations in DOMContentLoaded
  await new Promise(r => setTimeout(r, 50));
}

describe('Popup', () => {
  test('displays current tab title on load', async () => {
    await loadPopup();
    expect(document.getElementById('tabTitle').textContent).toBe('Test Page');
  });

  test('displays hostname (not full URL) on load', async () => {
    await loadPopup();
    // popup.js uses new URL(tab.url).hostname
    expect(document.getElementById('tabUrl').textContent).toBe('example.com');
  });

  test('capturePdf button sends message with format pdf', async () => {
    await loadPopup();
    document.getElementById('capturePdf').click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'capture',
        format: 'pdf',
        mode: 'full'
      })
    );
  });

  test('capturePng button sends message with format png', async () => {
    await loadPopup();
    document.getElementById('capturePng').click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'capture',
        format: 'png',
        mode: 'full'
      })
    );
  });

  test('captureArea button sends message with area mode', async () => {
    await loadPopup();
    document.getElementById('captureArea').click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'capture',
        mode: 'area'
      })
    );
  });

  test('sends delay value from dropdown as integer seconds', async () => {
    await loadPopup();
    document.getElementById('delaySelect').value = '5';
    document.getElementById('capturePdf').click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        delay: 5
      })
    );
  });

  test('showStatus makes status area visible', async () => {
    await loadPopup();
    document.getElementById('capturePdf').click();
    expect(document.getElementById('statusArea').classList.contains('hidden')).toBe(false);
  });

  test('showStatus displays the provided message', async () => {
    await loadPopup();
    document.getElementById('capturePdf').click();
    expect(document.getElementById('statusMessage').textContent).toBe('Preparing capture...');
  });
});
