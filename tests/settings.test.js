// settings.js uses chrome.storage.local directly (NOT TakePDFUtils.getSettings).
// It stores/loads under 'takePdfSettings' key.
// It has its own DEFAULT_SETTINGS constant.
// updateFilenamePreview does inline string replacement (not TakePDFUtils.generateFilename).

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();

  document.body.innerHTML = `
    <input type="radio" name="format" value="pdf" id="formatPdf" />
    <input type="radio" name="format" value="png" id="formatPng" />
    <input type="radio" name="format" value="jpeg" id="formatJpeg" />
    <input type="radio" name="format" value="webp" id="formatWebp" />
    <div id="pngQualityGroup">
      <input type="range" id="pngQuality" value="100" />
      <span id="qualityValue">100</span>
    </div>
    <div id="jpegQualityGroup">
      <input type="range" id="jpegQuality" value="85" />
      <span id="jpegQualityValue">85</span>
    </div>
    <div id="webpQualityGroup">
      <input type="range" id="webpQuality" value="90" />
      <span id="webpQualityValue">90</span>
    </div>
    <input type="text" id="filenameTemplate" value="{title}_{date}" />
    <span id="filenamePreview"></span>
    <select id="defaultDelay"><option value="0">No delay</option></select>
    <input type="checkbox" id="autoCopyClipboard" />
    <input type="checkbox" id="askSaveLocation" />
    <input type="text" id="downloadSubfolder" value="" />
    <input type="checkbox" id="expandScrollable" />
    <input type="number" id="maxScrollDepth" value="50000" />
    <input type="checkbox" id="hideScrollbars" />
    <input type="checkbox" id="pauseAnimations" />
    <input type="checkbox" id="hideCookieBanners" />
    <input type="text" id="waitForSelector" value="" />
    <input type="number" id="waitForSelectorTimeout" value="10000" />
    <select id="stickyHandling"><option value="auto">auto</option></select>
    <select id="pdfPageSize"><option value="continuous">continuous</option></select>
    <input type="checkbox" id="pdfShowFooter" />
    <input type="checkbox" id="showPreview" />
    <button id="saveBtn"></button>
    <button id="resetBtn"></button>
    <button id="openDownloadsBtn"></button>
    <button id="openLastSaveBtn"></button>
    <div id="saveConfirmation"></div>
  `;

  // Reset chrome.storage.local.get to return empty
  chrome.storage.local.get = jest.fn((key, cb) => {
    if (typeof cb === 'function') cb({});
    return Promise.resolve({});
  });
  chrome.storage.local.set = jest.fn((items, cb) => {
    if (typeof cb === 'function') cb();
    return Promise.resolve();
  });
});

async function loadSettings() {
  require('../settings.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 50));
}

describe('Settings', () => {
  test('loads settings from chrome.storage.local on init', async () => {
    await loadSettings();
    expect(chrome.storage.local.get).toHaveBeenCalledWith('takePdfSettings', expect.any(Function));
  });

  test('populates form with default format pdf when storage empty', async () => {
    await loadSettings();
    expect(document.getElementById('formatPdf').checked).toBe(true);
  });

  test('populates form with stored settings', async () => {
    chrome.storage.local.get = jest.fn((key, cb) => {
      cb({ takePdfSettings: { defaultFormat: 'png', pngQuality: 85, expandScrollable: false } });
    });
    await loadSettings();
    expect(document.getElementById('formatPng').checked).toBe(true);
    expect(document.getElementById('pngQuality').value).toBe('85');
    expect(document.getElementById('expandScrollable').checked).toBe(false);
  });

  test('saves all form values to storage under takePdfSettings key', async () => {
    await loadSettings();
    document.getElementById('formatPdf').checked = true;
    document.getElementById('saveBtn').click();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { takePdfSettings: expect.objectContaining({
        defaultFormat: 'pdf',
        pngQuality: expect.any(Number),
        filenameTemplate: expect.any(String)
      })},
      expect.any(Function)
    );
  });

  test('shows save confirmation message on save', async () => {
    await loadSettings();
    document.getElementById('saveBtn').click();
    const confirm = document.getElementById('saveConfirmation');
    expect(confirm.textContent).toBe('Settings saved!');
    expect(confirm.classList.contains('show')).toBe(true);
  });

  test('resets form to defaults and saves', async () => {
    await loadSettings();
    jest.clearAllMocks(); // Clear previous calls so we only see reset's call
    document.getElementById('resetBtn').click();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { takePdfSettings: expect.objectContaining({
        defaultFormat: 'pdf',
        pngQuality: 100,
        expandScrollable: true
      })}
    );
  });

  test('updates filename preview on template input change', async () => {
    await loadSettings();
    const input = document.getElementById('filenameTemplate');
    input.value = '{domain}';
    input.dispatchEvent(new Event('input'));
    const preview = document.getElementById('filenamePreview').textContent;
    expect(preview).toContain('example.com');
  });

  test('updates quality display on slider change', async () => {
    await loadSettings();
    const slider = document.getElementById('pngQuality');
    slider.value = '80';
    slider.dispatchEvent(new Event('input'));
    expect(document.getElementById('qualityValue').textContent).toBe('80');
  });
});
