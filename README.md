# takePDF — Extension User Guide

> Capture full web pages as PDF (with clickable hyperlinks) or PNG screenshots.

---

## Table of Contents

1. [What is takePDF?](#what-is-takepdf)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Features](#features)
5. [Capture Modes](#capture-modes)
6. [Settings & Configuration](#settings--configuration)
7. [Keyboard Shortcuts](#keyboard-shortcuts)
8. [Tips & Best Practices](#tips--best-practices)
9. [Troubleshooting](#troubleshooting)
10. [Limitations](#limitations)
11. [FAQ](#faq)

---

## What is takePDF?

takePDF is a Chrome extension that captures entire web pages as:

- **PDF files** — A single continuous page with all **hyperlinks preserved and clickable**. Not a screenshot — actual PDF text with working links.
- **PNG screenshots** — Full-page pixel-perfect screenshots, even for pages that extend far below the visible area.
- **Area selections** — Capture just a specific rectangular region of a page.

### Why Not Just "Print to PDF"?

| Feature | Chrome's Print to PDF | takePDF |
|---------|----------------------|---------|
| Preserves page layout | ❌ Reformats for print | ✅ Matches screen exactly |
| Clickable hyperlinks | ❌ Often broken | ✅ Fully preserved |
| Full-page single page | ❌ Multi-page with breaks | ✅ Single continuous page |
| Captures lazy content | ❌ Only visible content | ✅ Pre-scrolls to load all |
| Expands code blocks | ❌ No | ✅ Automatically |
| Hides cookie banners | ❌ No | ✅ Automatically |

---

## Installation

### From Source (Developer Mode)

1. Download or clone the takePDF folder to your computer
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **"Developer mode"** (toggle in the top-right corner)
4. Click **"Load unpacked"**
5. Select the `takePDF` folder
6. The takePDF icon will appear in your toolbar

### Pin the Extension

After installation, click the puzzle piece icon (🧩) in Chrome's toolbar and pin takePDF for easy access.

---

## Quick Start

1. **Navigate** to any web page you want to capture
2. **Click** the takePDF icon in your toolbar
3. **Choose** your capture format:
   - 📄 **Capture as PDF** — Full page with clickable links
   - 🖼️ **Capture as PNG** — Full page screenshot
   - ✂️ **Select Area** — Draw a rectangle to capture
4. **Wait** for the capture to complete (status shown in popup)
5. **Done!** The file is saved to your Downloads folder

---

## Features

### PDF Capture
- **Single continuous page** — No page breaks, no headers, no footers
- **Clickable hyperlinks** — All links in the PDF work
- **Screen-accurate** — Uses `@media screen` CSS, not `@media print`
- **Background colors & images** — All visual elements preserved
- **Full width** — Paper size matches your browser viewport exactly

### PNG Capture
- **Full-page screenshot** — Captures content below the fold
- **High resolution** — Uses your screen's native pixel density
- **Clipboard support** — Optionally copy directly to clipboard
- **Maximum height: 16,384px** — Chrome GPU limit; use PDF for longer pages

### Smart Page Preparation
- **Lazy loading trigger** — Pre-scrolls the page to load all lazy-loaded images and content
- **Image waiting** — Waits up to 10 seconds for all images to finish loading
- **Font loading** — Waits for web fonts to render
- **Cookie banner removal** — Automatically detects and hides consent banners
- **Scrollbar hiding** — Removes scrollbars from the capture
- **Animation pausing** — Freezes CSS animations for clean snapshots

### Scrollable Content Expansion
- **Code blocks** — Embedded `<pre>` and `<code>` blocks with scroll are expanded to show full content
- **Scrollable panels** — `<div>` sections with `overflow: scroll/auto` are expanded
- **Truncated text** — Text hidden by `-webkit-line-clamp` is fully revealed
- **Safe limits** — Main content areas larger than 30,000px are left alone to prevent massive captures

### Batch Capture
- Capture **all open tabs** in the current window sequentially
- Each tab is activated and captured individually
- Original active tab is restored when done

### Area Selection
- Click **"Select Area"** to activate crosshair mode
- **Click and drag** to draw a rectangle
- **Dimension label** shows width × height in pixels as you draw
- Press **Escape** to cancel
- Minimum selection: 10×10 pixels

---

## Capture Modes

### Full Page PDF
Best for: **Documentation, articles, reference material**
- Preserves clickable links (internal and external)
- Full background rendering
- No page size limits
- Single continuous page

### Full Page PNG
Best for: **Visual archives, design reference, bug reports**
- Pixel-perfect screenshot
- Maximum height: 16,384 pixels (use PDF for longer pages)
- Can be copied to clipboard (if enabled)

### Area Selection
Best for: **Specific sections, charts, code snippets**
- Draw a rectangle on the page
- Captures at full resolution
- Always outputs PNG

---

## Settings & Configuration

Open settings by clicking the ⚙️ gear icon in the popup footer, or right-click the extension icon → "Options".

### Capture Preferences

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| **Default Format** | PDF / PNG | PDF | Which format to use by default |
| **PNG Quality** | 1-100 slider | 100 | Compression quality for PNG captures |
| **Default Delay** | 0 / 3 / 5 / 10 seconds | 0 | Countdown before capture starts. Useful for pages with hover states or dropdowns you want to keep open |
| **Copy to Clipboard** | On / Off | Off | Automatically copy PNG captures to clipboard |

### File Output

| Setting | Description | Default |
|---------|-------------|---------|
| **Filename Template** | Pattern for saved files. Tokens: `{title}`, `{date}`, `{timestamp}`, `{domain}`, `{url}` | `{title}_{date}` |
| **Download Subfolder** | Save files into a subfolder under Chrome's Downloads directory. Example: `takePDF-captures` saves to `Downloads/takePDF-captures/` | Empty (saves to Downloads root) |
| **Prompt "Save As"** | Show a file picker dialog for every capture | Off |

#### Filename Template Tokens

| Token | Example Output | Description |
|-------|---------------|-------------|
| `{title}` | `My_Blog_Post` | Page title (sanitized) |
| `{date}` | `2026-09-11` | Current date |
| `{timestamp}` | `2026-09-11_14-30-00` | Date and time |
| `{domain}` | `example.com` | Page hostname |
| `{url}` | `httpswww.example.compath` | Full URL (sanitized) |

A live preview shows you what the final filename will look like.

### Page Processing

| Setting | Description | Default |
|---------|-------------|---------|
| **Expand scrollable sections** | Expand scrollable code blocks and panels to show full content | On |
| **Max scroll depth** | Maximum pixels to scroll for lazy loading (prevents infinite scroll pages from running forever) | 50,000 px |
| **Hide scrollbars** | Remove scrollbar chrome from the capture | On |
| **Pause animations** | Freeze CSS animations and transitions | On |
| **Hide cookie banners** | Detect and remove consent banners | On |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + Shift + P` | Capture full page as PDF |
| `Alt + Shift + S` | Capture full page as PNG |

### Customizing Shortcuts

1. Go to `chrome://extensions/shortcuts`
2. Find "takePDF"
3. Click the pencil icon next to any command
4. Press your desired key combination

---

## Tips & Best Practices

### For Best PDF Quality
- **Wait for the page to fully load** before capturing
- **Disable ad blockers temporarily** if they cause layout issues
- **Use the delay option** (3-5 seconds) for pages that load content dynamically
- **Enable "Expand scrollable sections"** to capture full code blocks

### For Long Pages
- **Use PDF format** — it has no height limit
- **PNG is capped at 16,384px** — content beyond that is cut off
- **Set max scroll depth** to a reasonable value to prevent timeouts on infinite-scroll sites

### For Custom Save Locations
- Set a **Download Subfolder** in settings (e.g., `web-captures/2026`)
- Files will save to `<Chrome Downloads>/web-captures/2026/filename.pdf`
- To change the root Downloads directory, update Chrome's settings at `chrome://settings/downloads`

### For Area Selection
- The popup closes automatically after starting area selection — this is expected
- Draw your rectangle on the visible page area
- Press **Escape** to cancel and start over

---

## Troubleshooting

### "Cannot capture this page" Error
**Cause**: You're on a restricted page (`chrome://`, `edge://`, `about:`, `chrome-extension://`).
**Fix**: Navigate to a regular `http://` or `https://` web page.

### Blank or Empty PDF
**Cause**: The page uses heavy JavaScript rendering that hasn't completed.
**Fix**:
1. Enable a 3-5 second delay in settings or the popup dropdown
2. Wait for the page to fully load before clicking capture
3. Try refreshing the page and capturing again

### Content Cut Off at Bottom
**Cause**: The page has infinite scrolling or the max scroll depth is too low.
**Fix**: Increase "Max scroll depth" in settings (try 100,000 or higher).

### PDF Shows Print Styles (Wrong Colors/Layout)
**Cause**: The page's `@media print` CSS is interfering.
**Fix**: This should be handled automatically. If it persists, the page may have aggressive print stylesheets that override the extension's emulation.

### Extension Freezes During Capture
**Cause**: Very long page or slow connection causing image loading to hang.
**Fix**:
1. Reduce max scroll depth
2. Disable "Expand scrollable sections"
3. Try PNG instead of PDF for a quicker capture

### File Not Saving to Custom Subfolder
**Cause**: Invalid characters in subfolder name.
**Fix**: Use simple folder names without special characters. Forward slashes (`/`) create nested folders. Example: `captures/web` creates `Downloads/captures/web/`.

### "A capture is already in progress" Error
**Cause**: You clicked capture twice on the same tab.
**Fix**: Wait for the current capture to finish. Only one capture per tab at a time.

---

## Limitations

| Limitation | Details | Workaround |
|-----------|---------|------------|
| **PNG max height** | 16,384 pixels (Chrome GPU texture limit) | Use PDF for longer pages |
| **File size** | Very large captures (>45MB) can't be copied to clipboard | Use file download instead |
| **Restricted pages** | Can't capture `chrome://`, `about:`, `devtools:` pages | No workaround (browser security) |
| **iframes** | Content inside cross-origin iframes may not be fully captured | No reliable workaround |
| **DRM/Protected content** | Pages with DRM or content protection may block capture | No workaround |
| **Custom save directory** | Can't set an absolute filesystem path | Use subfolder under Chrome's Downloads directory |
| **Multiple monitors** | Area selection uses the primary display coordinates | Ensure the target page is on your main display |
| **Infinite scroll pages** | May take a long time or never complete scrolling | Set a max scroll depth |

---

## FAQ

**Q: Are links clickable in the PDF?**
A: Yes! takePDF uses Chrome's `Page.printToPDF` with `generateTaggedPDF: true`, which preserves all hyperlinks as clickable PDF annotations.

**Q: Does it modify the web page I'm viewing?**
A: Minimally and temporarily. During capture, it may briefly modify CSS to expand code blocks and hide banners. All changes are reversed immediately after capture. The fixed/sticky header handling is done via Chrome DevTools Protocol — invisible to you.

**Q: Can I capture a page that requires login?**
A: Yes! The extension captures the page exactly as you see it in your browser, including logged-in content.

**Q: Does it work on Edge/Brave/other Chromium browsers?**
A: It should work on any Chromium-based browser that supports Manifest V3 and the `chrome.debugger` API.

**Q: Why does Chrome show "takePDF started debugging this tab"?**
A: The extension uses Chrome's DevTools Protocol to capture the page. This notification is a Chrome security feature and cannot be suppressed. It disappears when the capture finishes.

**Q: Can I capture PDFs with multiple pages?**
A: takePDF always creates a single continuous page. For multi-page PDFs, use Chrome's built-in Print → Save as PDF.

**Q: What happens to cookie consent banners?**
A: They're automatically hidden during capture (can be disabled in settings). Only elements matching known consent banner patterns are hidden — regular page content is never affected. Banners reappear after capture.

---

## Permissions Explained

takePDF requests the following Chrome permissions:

| Permission | Why It's Needed |
|-----------|-----------------|
| **Active Tab** | Access the tab you're capturing |
| **Scripting** | Inject content script to prepare the page |
| **Debugger** | Use Chrome DevTools Protocol for capture |
| **Downloads** | Save the captured file |
| **Context Menus** | Right-click "Capture" menu |
| **Storage** | Save your settings |
| **Clipboard Write** | Copy PNG to clipboard (optional feature) |
| **Tabs** | Get tab title/URL for filenames |
| **Host Permissions** | Required for dynamic content script injection on any webpage |

The extension does **NOT**:
- Send any data to external servers
- Track your browsing history
- Access pages you don't actively capture
- Run in the background when you're not using it
