const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '/home/user/webapp/ss-member.png', fullPage: true });
  console.log('Member screenshot done');
  
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('관리자')) { await btn.click(); break; }
  }
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '/home/user/webapp/ss-admin.png', fullPage: true });
  console.log('Admin screenshot done');
  
  await browser.close();
})().catch(e => console.error(e));
