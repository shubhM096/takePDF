const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setContent(`
    <div style="height: 100vh; background: lightblue;">Content</div>
    <div style="height: 200px; background: salmon;">Footer</div>
  `);
  
  const client = await page.target().createCDPSession();
  await client.send('Emulation.setEmulatedMedia', { media: 'screen' });
  await client.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 1000, deviceScaleFactor: 1, mobile: false });
  
  const pdfParams = { 
    paperWidth: 800 / 96, 
    paperHeight: (1000 / 96) + 0.1, 
    marginTop: 0, marginBottom: 0.4, marginLeft: 0, marginRight: 0, 
    pageRanges: '1',
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:10px;">Footer</div>'
  };
  
  const result = await client.send('Page.printToPDF', pdfParams);
  const pdfDoc = await PDFDocument.load(Buffer.from(result.data, 'base64'));
  console.log('Pages with footer and pageRanges=1:', pdfDoc.getPageCount());
  
  await browser.close();
})();
