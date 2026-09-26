const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  
  await page.goto('https://leetcode.com/discuss/post/8524180/giving-back-to-community-sharing-invterv-3bal/', { waitUntil: 'networkidle2' });
  
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log('Scroll height:', height);
  
  await browser.close();
})();
