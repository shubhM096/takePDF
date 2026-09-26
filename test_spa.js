const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  
  await page.goto('https://leetcode.com/discuss/post/8524180/giving-back-to-community-sharing-invterv-3bal/', { waitUntil: 'networkidle2' });
  
  const result = await page.evaluate(() => {
    const candidates = document.querySelectorAll('div, section, main, article, [role="main"]');
    let maxArea = 0;
    let mainContainer = null;
    const vW = window.innerWidth, vH = window.innerHeight;
    for (const el of candidates) {
      if (el.scrollHeight <= el.clientHeight + 5) continue;
      const style = getComputedStyle(el);
      if (style.overflowY !== 'scroll' && style.overflowY !== 'auto' && style.overflowY !== 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.right < 0 || rect.left > vW) continue;
      if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none') continue;
      
      const visibleWidth = Math.min(rect.width, vW);
      const visibleHeight = Math.min(rect.height, vH);
      const area = visibleWidth * visibleHeight;
      if (area > maxArea && area > (vW * vH * 0.2)) {
        maxArea = area;
        mainContainer = el;
      }
    }
    return mainContainer ? { 
      className: mainContainer.className, 
      scrollHeight: mainContainer.scrollHeight,
      clientHeight: mainContainer.clientHeight,
      id: mainContainer.id
    } : null;
  });
  
  console.log('Main SPA container:', result);
  
  await browser.close();
})();
