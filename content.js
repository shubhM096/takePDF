(function() {
  let expandedElements = [];
  let lastContextMenuTarget = null;
  document.addEventListener('contextmenu', (e) => {
    lastContextMenuTarget = e.target;
  }, true);

  async function preparePage(options) {
    // 1. Disable smooth scrolling
    const origScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    
    // 2. Wait for web fonts
    await document.fonts.ready;
    
    // 3. Hide scrollbars if enabled
    if (options.hideScrollbars) {
      const styleEl = document.createElement('style');
      styleEl.id = 'takepdf-hide-scrollbars';
      styleEl.textContent = `
        ::-webkit-scrollbar { display: none !important; }
        html, body { scrollbar-width: none !important; }
      `;
      document.head.appendChild(styleEl);
    }
    
    // 4. Pause CSS animations if enabled
    if (options.pauseAnimations) {
      const styleEl = document.createElement('style');
      styleEl.id = 'takepdf-pause-animations';
      styleEl.textContent = `
        *, *::before, *::after {
          animation-play-state: paused !important;
          transition: none !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
    
    // 5. Hide cookie banners if enabled
    if (options.hideCookieBanners) {
      hideCookieBanners();
    }
    
    // 6. Pre-scroll to trigger lazy loading
    const maxDepth = options.maxScrollDepth || 50000;
    await triggerLazyLoading(maxDepth);
    
    // 7. Wait for all images to load (timeout 10s)
    await waitForImages(10000);
    
    // 8. Scroll back to top
    window.scrollTo(0, 0);
    
    // 9. Return metrics
    return {
      success: true,
      metrics: {
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        devicePixelRatio: window.devicePixelRatio
      }
    };
  }

  // H2 FIX: Update totalHeight as page grows from lazy-loaded content
  async function triggerLazyLoading(maxDepth) {
    const viewportHeight = window.innerHeight;
    let totalHeight = Math.min(
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      maxDepth
    );
    let currentY = 0;
    
    while (currentY < totalHeight) {
      window.scrollTo(0, currentY);
      await new Promise(r => setTimeout(r, 300));
      currentY += viewportHeight;
      const newHeight = Math.min(
        Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        maxDepth
      );
      if (newHeight > totalHeight) {
        totalHeight = newHeight; // H2: Track new content loaded by lazy loading
      }
      
      const percent = Math.min(100, Math.round((currentY / maxDepth) * 100));
      chrome.runtime.sendMessage({ action: 'scrollProgress', percent }).catch(() => {});
    }
    window.scrollTo(0, totalHeight);
    await new Promise(r => setTimeout(r, 500));
  }

  async function waitForImages(timeout = 10000) {
    const images = Array.from(document.querySelectorAll('img'));
    const pendingImages = images.filter(img => !img.complete && img.src);
    
    if (pendingImages.length === 0) return;
    
    const imagePromises = pendingImages.map(img => 
      new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      })
    );
    
    await Promise.race([
      Promise.all(imagePromises),
      new Promise(resolve => setTimeout(resolve, timeout))
    ]);
  }

  // C2 FIX: Narrow selector to typical scrollable containers instead of '*'
  function expandScrollableContainers() {
    expandedElements = [];
    
    // C2: Only check elements likely to be scrollable containers, not every DOM node
    const scrollableSelector = 'div, section, main, article, aside, nav, pre, code, ul, ol, table, [role="region"], [role="main"], [role="complementary"]';
    const candidates = document.querySelectorAll(scrollableSelector);
    for (const el of candidates) {
      // Pre-filter: skip elements that clearly aren't scrollable (avoids expensive getComputedStyle)
      if (el.scrollHeight <= el.clientHeight + 5 && el.scrollWidth <= el.clientWidth + 5) continue;
      if (el === document.documentElement || el === document.body) continue;
      
      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      
      const isScrollableY = (overflowY === 'scroll' || overflowY === 'auto') && el.scrollHeight > el.clientHeight + 5;
      const isScrollableX = (overflowX === 'scroll' || overflowX === 'auto') && el.scrollWidth > el.clientWidth + 5;
      
      if (isScrollableY || isScrollableX) {
        if (el.scrollHeight > 30000 && el === document.querySelector('main, [role="main"], #content, .content')) continue;
        
        expandedElements.push({
          element: el,
          originalOverflow: el.style.overflow,
          originalOverflowX: el.style.overflowX,
          originalOverflowY: el.style.overflowY,
          originalMaxHeight: el.style.maxHeight,
          originalHeight: el.style.height,
          originalMaxWidth: el.style.maxWidth
        });
        
        if (isScrollableY) {
          el.style.overflowY = 'visible';
          el.style.maxHeight = 'none';
          el.style.height = 'auto';
        }
        if (isScrollableX) {
          el.style.overflowX = 'visible';
          el.style.maxWidth = 'none';
        }
      }
    }
    
    // Check for text truncation (-webkit-line-clamp) — also use narrowed selector
    const textContainers = document.querySelectorAll('p, span, div, li, h1, h2, h3, h4, h5, h6, a, td, th');
    for (const el of textContainers) {
      const style = getComputedStyle(el);
      if (style.webkitLineClamp && style.webkitLineClamp !== 'none') {
        expandedElements.push({
          element: el,
          originalWebkitLineClamp: el.style.webkitLineClamp,
          originalWebkitBoxOrient: el.style.webkitBoxOrient,
          originalDisplay: el.style.display,
          originalOverflow: el.style.overflow,
          isClamp: true
        });
        el.style.webkitLineClamp = 'unset';
        el.style.overflow = 'visible';
      }
    }
    
    return { success: true, expandedCount: expandedElements.length };
  }

  // L2 FIX: Also check/reset body overflow after hiding cookie banners
  function hideCookieBanners() {
    const selectors = [
      '[class*="cookie"]', '[id*="cookie"]',
      '[class*="consent"]', '[id*="consent"]',
      '[class*="gdpr"]', '[id*="gdpr"]',
      '[class*="notice-banner"]',
      '[aria-label*="cookie"]', '[aria-label*="consent"]',
      '.cc-banner', '.cc-window',
      '#onetrust-banner-sdk',
      '.CookieConsent', '#CybotCookiebotDialog',
      '[class*="cookieBar"]'
    ];
    
    const selector = selectors.join(', ');
    const banners = document.querySelectorAll(selector);
    let hidCount = 0;
    
    for (const banner of banners) {
      const rect = banner.getBoundingClientRect();
      const style = getComputedStyle(banner);
      if (style.position === 'fixed' || style.position === 'sticky' || 
          rect.bottom >= window.innerHeight - 10 || rect.top <= 10) {
        const origDisplay = banner.style.display;
        banner.style.display = 'none';
        expandedElements.push({
          element: banner,
          originalDisplay: origDisplay,
          isBanner: true
        });
        hidCount++;
      }
    }
    
    // L2 R2: Cookie consent modals often set body overflow:hidden to block scrolling.
    // If we hid banners, check and unlock the body so we capture the full page.
    if (hidCount > 0) {
      const bodyOverflow = getComputedStyle(document.body).overflow;
      if (bodyOverflow === 'hidden') {
        expandedElements.push({
          element: document.body,
          originalOverflow: document.body.style.overflow,
          isBodyOverflow: true // Dedicated flag — NOT isBanner (which restores display)
        });
        document.body.style.overflow = 'visible';
      }
    }
  }

  function startAreaSelection() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'takepdf-selection-overlay';
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 2147483647; cursor: crosshair; background: rgba(0,0,0,0.2);
      `;
      
      const selectionBox = document.createElement('div');
      selectionBox.style.cssText = `
        position: fixed; border: 2px dashed #00bfff; background: rgba(0,191,255,0.1);
        pointer-events: none; display: none; z-index: 2147483647;
      `;
      
      const dimensionLabel = document.createElement('div');
      dimensionLabel.style.cssText = `
        position: fixed; background: #00bfff; color: white; padding: 2px 8px;
        font-size: 12px; font-family: monospace; border-radius: 3px;
        pointer-events: none; display: none; z-index: 2147483647;
      `;
      
      document.body.appendChild(overlay);
      document.body.appendChild(selectionBox);
      document.body.appendChild(dimensionLabel);
      
      let startX, startY, isSelecting = false;
      
      overlay.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        isSelecting = true;
        selectionBox.style.display = 'block';
        dimensionLabel.style.display = 'block';
      });
      
      overlay.addEventListener('mousemove', (e) => {
        if (!isSelecting) return;
        const x = Math.min(startX, e.clientX);
        const y = Math.min(startY, e.clientY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        selectionBox.style.left = x + 'px';
        selectionBox.style.top = y + 'px';
        selectionBox.style.width = w + 'px';
        selectionBox.style.height = h + 'px';
        dimensionLabel.style.left = (x + w + 5) + 'px';
        dimensionLabel.style.top = (y + h + 5) + 'px';
        dimensionLabel.textContent = `${w} × ${h}`;
      });
      
      overlay.addEventListener('mouseup', (e) => {
        if (!isSelecting) return;
        isSelecting = false;
        const x = Math.min(startX, e.clientX) + window.scrollX;
        const y = Math.min(startY, e.clientY) + window.scrollY;
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        
        overlay.remove();
        selectionBox.remove();
        dimensionLabel.remove();
        
        if (w > 10 && h > 10) {
          resolve({ success: true, selection: { x, y, width: w, height: h, scale: 1 } });
        } else {
          resolve({ success: false, message: 'Selection too small' });
        }
      });
      
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          selectionBox.remove();
          dimensionLabel.remove();
          document.removeEventListener('keydown', escHandler);
          resolve({ success: false, message: 'Selection cancelled' });
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  }

  async function showCountdown(seconds) {
    const overlay = document.createElement('div');
    overlay.id = 'takepdf-countdown';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.5); z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `;
    
    const counter = document.createElement('div');
    counter.style.cssText = `
      font-size: 120px; font-weight: bold; color: white;
      text-shadow: 0 0 40px rgba(0,191,255,0.5);
    `;
    overlay.appendChild(counter);
    document.body.appendChild(overlay);
    
    for (let i = seconds; i > 0; i--) {
      counter.textContent = i;
      await new Promise(r => setTimeout(r, 1000));
    }
    
    overlay.remove();
    return { success: true };
  }

  function restorePage() {
    for (const item of expandedElements) {
      if (item.isClamp) {
        item.element.style.webkitLineClamp = item.originalWebkitLineClamp || '';
        item.element.style.overflow = item.originalOverflow || '';
      } else if (item.isBodyOverflow) {
        item.element.style.overflow = item.originalOverflow || '';
      } else if (item.isBanner) {
        item.element.style.display = item.originalDisplay || '';
      } else {
        item.element.style.overflow = item.originalOverflow || '';
        item.element.style.overflowX = item.originalOverflowX || '';
        item.element.style.overflowY = item.originalOverflowY || '';
        item.element.style.maxHeight = item.originalMaxHeight || '';
        item.element.style.height = item.originalHeight || '';
        item.element.style.maxWidth = item.originalMaxWidth || '';
      }
    }
    expandedElements = [];
    
    const injectedStyles = document.querySelectorAll('#takepdf-hide-scrollbars, #takepdf-pause-animations');
    injectedStyles.forEach(el => el.remove());
    
    document.documentElement.style.scrollBehavior = '';
    
    return { success: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handlers = {
      '__ping': () => ({ success: true }),
      'preparePage': () => preparePage(message),
      'expandScrollable': () => expandScrollableContainers(),
      'startAreaSelection': () => startAreaSelection(),
      'showCountdown': () => showCountdown(message.seconds),
      'restorePage': () => restorePage()
    };
    
    const handler = handlers[message.action];
    if (handler) {
      const result = handler();
      if (result instanceof Promise) {
        result.then(sendResponse).catch(err => sendResponse({ success: false, message: err.message }));
        return true;
      }
      sendResponse(result);
    }
    
    if (message.action === 'getElementRect') {
      if (lastContextMenuTarget) {
        const rect = lastContextMenuTarget.getBoundingClientRect();
        sendResponse({
          success: true,
          selection: {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
            scale: 1
          }
        });
      } else {
        sendResponse({ success: false, message: 'No element selected' });
      }
      return true;
    }
  });

})();
