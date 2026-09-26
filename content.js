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

  function getSpaScrollContainer() {
    const candidates = document.querySelectorAll('div, section, main, article, [role="main"]');
    let maxArea = 0;
    let mainContainer = null;
    const vW = window.innerWidth, vH = window.innerHeight;
    for (const el of candidates) {
      if (el.scrollHeight <= el.clientHeight + 5) continue;
      const style = getComputedStyle(el);
      if (style.overflowY !== 'scroll' && style.overflowY !== 'auto' && style.overflowY !== 'hidden' && style.overflowY !== 'overlay') continue;
      const rect = el.getBoundingClientRect();
      if (rect.right <= 0 || rect.left >= vW) continue;
      if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none') continue;
      
      // Skip sidebars, drawers, modals, doubt panels
      if (el.closest('aside, nav, [role="complementary"], [role="navigation"], [class*="doubt"], [class*="sidebar"], [class*="drawer"], [class*="modal"], [id*="doubt"], [id*="sidebar"], [id*="drawer"]')) continue;
      
      const visibleWidth = Math.min(rect.width, vW);
      const visibleHeight = Math.min(rect.height, vH);
      const area = visibleWidth * visibleHeight;
      if (area > maxArea && area > (vW * vH * 0.2)) {
        maxArea = area;
        mainContainer = el;
      }
    }
    return mainContainer;
  }

  // H2 FIX: Update totalHeight as page grows from lazy-loaded content
  // Also correctly handles SPAs (Gmail) by scrolling their internal container
  async function triggerLazyLoading(maxDepth) {
    const viewportHeight = window.innerHeight;
    let bodyScrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    
    let scrollTarget = window;
    let getTargetScrollHeight = () => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    
    // If body doesn't scroll much, find the SPA internal container to scroll instead
    if (bodyScrollHeight <= viewportHeight + 100) {
      const spaContainer = getSpaScrollContainer();
      if (spaContainer) {
        scrollTarget = spaContainer;
        getTargetScrollHeight = () => spaContainer.scrollHeight;
      } else {
        return; // Nothing to scroll
      }
    }
    
    let totalHeight = Math.min(getTargetScrollHeight(), maxDepth);
    let currentY = 0;
    
    while (currentY < totalHeight) {
      scrollTarget.scrollTo(0, currentY);
      await new Promise(r => setTimeout(r, 300));
      
      // If we are scrolling window but it didn't move, bail to avoid infinite fake loops
      if (scrollTarget === window && currentY > 0 && window.scrollY < 10) {
        break;
      }
      
      currentY += viewportHeight;
      const newHeight = Math.min(getTargetScrollHeight(), maxDepth);
      if (newHeight > totalHeight) {
        totalHeight = newHeight;
      }
      
      const percent = Math.min(100, Math.round((currentY / maxDepth) * 100));
      chrome.runtime.sendMessage({ action: 'scrollProgress', percent }).catch(() => {});
    }
    
    // Reset scroll back to top so capture begins from the top of the article
    scrollTarget.scrollTo(0, 0);
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 400));
  }

  // Feature 4: Wait for a CSS selector to exist on the page
  async function waitForSelector(selector, timeout = 10000) {
    if (!selector || !selector.trim()) return { success: true, found: true };
    
    // Check immediately
    if (document.querySelector(selector)) {
      return { success: true, found: true };
    }
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve({ success: true, found: false, message: `Selector "${selector}" not found within ${timeout}ms` });
      }, timeout);
      
      const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          clearTimeout(timer);
          resolve({ success: true, found: true });
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id']
      });
    });
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

  function expandScrollableContainers() {
    expandedElements = [];
    const scrollableSelector = 'div, section, main, article, aside, nav, pre, code, ul, ol, table, [role="region"], [role="main"], [role="complementary"]';
    const candidates = document.querySelectorAll(scrollableSelector);

    let maxScrollArea = 0;
    let mainScrollContainer = null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // First pass: identify all scrollables and find the main SPA container
    const scrollables = [];

    for (const el of candidates) {
      if (el.scrollHeight <= el.clientHeight + 5 && el.scrollWidth <= el.clientWidth + 5) continue;
      if (el === document.documentElement || el === document.body) continue;

      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;

      const isScrollableY = (overflowY === 'scroll' || overflowY === 'auto' || overflowY === 'hidden' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight + 5;
      const isScrollableX = (overflowX === 'scroll' || overflowX === 'auto' || overflowX === 'hidden' || overflowX === 'overlay') && el.scrollWidth > el.clientWidth + 5;

      if (!isScrollableY && !isScrollableX) continue;

      const rect = el.getBoundingClientRect();
      // Skip off-screen elements horizontally (e.g. hidden sidebars)
      if (rect.right <= 0 || rect.left >= viewportWidth) continue;
      // Skip completely hidden elements
      if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none') continue;

      scrollables.push({ el, style, rect, isScrollableY, isScrollableX });

      // Identify main scroll container for SPAs (largest central scrollable area)
      // Never pick sidebars, drawers, modals, or doubt boxes
      if (isScrollableY) {
        const isExcluded = el.closest('aside, nav, [role="complementary"], [role="navigation"], [class*="doubt"], [class*="sidebar"], [class*="drawer"], [class*="modal"], [id*="doubt"], [id*="sidebar"], [id*="drawer"]');
        const visibleWidth = Math.min(rect.width, viewportWidth);
        const visibleHeight = Math.min(rect.height, viewportHeight);
        const area = visibleWidth * visibleHeight;

        if (!isExcluded && area > maxScrollArea && visibleWidth > viewportWidth * 0.4 && visibleHeight > viewportHeight * 0.4) {
           maxScrollArea = area;
           mainScrollContainer = el;
        }
      }
    }

    const isBodyScrollable = document.documentElement.scrollHeight > viewportHeight + 100 || document.body.scrollHeight > viewportHeight + 100;

    for (const { el, style, rect, isScrollableY, isScrollableX } of scrollables) {
      const tagName = el.tagName.toLowerCase();
      const className = el.className || '';
      const isCode = tagName === 'pre' || tagName === 'code' || tagName === 'table' || 
                     (typeof className === 'string' && (className.includes('code') || className.includes('highlight') || className.includes('snippet')));

      let shouldExpand = false;
      let unlockAncestors = false;

      const isExcluded = el.closest('aside, nav, [role="complementary"], [role="navigation"], [class*="doubt"], [class*="sidebar"], [class*="drawer"], [class*="modal"], [class*="panel"], [class*="popup"], [class*="dialog"], [id*="doubt"], [id*="sidebar"], [id*="drawer"], [id*="modal"]');

      if (isCode) {
         shouldExpand = true; // Always expand code blocks
      } else if (el === mainScrollContainer && !isBodyScrollable) {
         shouldExpand = true;
         unlockAncestors = true; // SPA main container: unlock ancestors so body grows
      } else if (!isExcluded && style.position !== 'fixed' && style.position !== 'absolute' && el.scrollHeight < 8000 && rect && rect.width > 250) {
         shouldExpand = true; // Medium in-flow content containers only
      }

      if (shouldExpand) {
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
          el.style.setProperty('overflow-y', 'visible', 'important');
          el.style.setProperty('max-height', 'none', 'important');
          el.style.setProperty('height', 'auto', 'important');
        }
        if (isScrollableX) {
          el.style.setProperty('overflow-x', 'visible', 'important');
          el.style.setProperty('max-width', 'none', 'important');
        }

        if (unlockAncestors) {
          // Unlock body and documentElement so the full SPA page can expand
          expandedElements.push({
            element: document.body,
            originalOverflow: document.body.style.overflow,
            originalOverflowY: document.body.style.overflowY,
            originalHeight: document.body.style.height,
            isAncestorUnlock: true
          });
          document.body.style.setProperty('overflow', 'visible', 'important');
          document.body.style.setProperty('overflow-y', 'visible', 'important');
          document.body.style.setProperty('height', 'auto', 'important');

          expandedElements.push({
            element: document.documentElement,
            originalOverflow: document.documentElement.style.overflow,
            originalOverflowY: document.documentElement.style.overflowY,
            originalHeight: document.documentElement.style.height,
            isAncestorUnlock: true
          });
          document.documentElement.style.setProperty('overflow', 'visible', 'important');
          document.documentElement.style.setProperty('overflow-y', 'visible', 'important');
          document.documentElement.style.setProperty('height', 'auto', 'important');

          let parent = el.parentElement;
          while (parent && parent !== document.body && parent !== document.documentElement) {
            const pStyle = getComputedStyle(parent);
            if (pStyle.overflow !== 'visible' || pStyle.overflowY !== 'visible' || pStyle.height !== 'auto') {
              expandedElements.push({
                element: parent,
                originalOverflow: parent.style.overflow,
                originalOverflowY: parent.style.overflowY,
                originalHeight: parent.style.height,
                originalMaxHeight: parent.style.maxHeight,
                originalBottom: parent.style.bottom,
                isAncestorUnlock: true
              });
              parent.style.setProperty('overflow', 'visible', 'important');
              parent.style.setProperty('overflow-y', 'visible', 'important');
              parent.style.setProperty('height', 'auto', 'important');
              parent.style.setProperty('max-height', 'none', 'important');
              if (pStyle.position === 'absolute' || pStyle.position === 'fixed') {
                parent.style.setProperty('bottom', 'auto', 'important');
              }
            }
            parent = parent.parentElement;
          }
        }
      }
    }
    
    // Check for text truncation (-webkit-line-clamp)
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
        el.style.setProperty('-webkit-line-clamp', 'unset', 'important');
        el.style.setProperty('overflow', 'visible', 'important');
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
        banner.style.setProperty('display', 'none', 'important');
        expandedElements.push({
          element: banner,
          originalDisplay: origDisplay,
          isBanner: true
        });
        hidCount++;
      }
    }
    
    if (hidCount > 0) {
      const bodyOverflow = getComputedStyle(document.body).overflow;
      if (bodyOverflow === 'hidden') {
        expandedElements.push({
          element: document.body,
          originalOverflow: document.body.style.overflow,
          isBodyOverflow: true
        });
        document.body.style.setProperty('overflow', 'visible', 'important');
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
        item.element.style.removeProperty('-webkit-line-clamp');
        item.element.style.removeProperty('overflow');
        if (item.originalWebkitLineClamp) item.element.style.webkitLineClamp = item.originalWebkitLineClamp;
        if (item.originalOverflow) item.element.style.overflow = item.originalOverflow;
      } else if (item.isBodyOverflow) {
        item.element.style.removeProperty('overflow');
        if (item.originalOverflow) item.element.style.overflow = item.originalOverflow;
      } else if (item.isBanner) {
        item.element.style.removeProperty('display');
        if (item.originalDisplay) item.element.style.display = item.originalDisplay;
      } else if (item.isAncestorUnlock) {
        item.element.style.removeProperty('overflow');
        item.element.style.removeProperty('overflow-y');
        item.element.style.removeProperty('height');
        item.element.style.removeProperty('max-height');
        item.element.style.removeProperty('bottom');
        if (item.originalOverflow) item.element.style.overflow = item.originalOverflow;
        if (item.originalOverflowY) item.element.style.overflowY = item.originalOverflowY;
        if (item.originalHeight) item.element.style.height = item.originalHeight;
        if (item.originalMaxHeight) item.element.style.maxHeight = item.originalMaxHeight;
        if (item.originalBottom) item.element.style.bottom = item.originalBottom;
      } else {
        item.element.style.removeProperty('overflow');
        item.element.style.removeProperty('overflow-x');
        item.element.style.removeProperty('overflow-y');
        item.element.style.removeProperty('max-height');
        item.element.style.removeProperty('height');
        item.element.style.removeProperty('max-width');
        if (item.originalOverflow) item.element.style.overflow = item.originalOverflow;
        if (item.originalOverflowX) item.element.style.overflowX = item.originalOverflowX;
        if (item.originalOverflowY) item.element.style.overflowY = item.originalOverflowY;
        if (item.originalMaxHeight) item.element.style.maxHeight = item.originalMaxHeight;
        if (item.originalHeight) item.element.style.height = item.originalHeight;
        if (item.originalMaxWidth) item.element.style.maxWidth = item.originalMaxWidth;
      }
    }
    expandedElements = [];
    
    const injectedStyles = document.querySelectorAll('#takepdf-hide-scrollbars, #takepdf-pause-animations');
    injectedStyles.forEach(el => el.remove());
    
    document.documentElement.style.scrollBehavior = '';
    
    // Scroll back to top for the user's convenience after capture
    window.scrollTo(0, 0);
    
    return { success: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handlers = {
      '__ping': () => ({ success: true }),
      'preparePage': () => preparePage(message),
      'expandScrollable': () => expandScrollableContainers(),
      'startAreaSelection': () => startAreaSelection(),
      'showCountdown': () => showCountdown(message.seconds),
      'restorePage': () => restorePage(),
      'waitForSelector': () => waitForSelector(message.selector, message.timeout)
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
