const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'screenshots', 'final');
const base = 'http://127.0.0.1:4173/';

const routes = [
  ['products-1440.png', '?page=products'],
  ['platforms-1440.png', '?page=platforms'],
  ['product-reaper-1440.png', '?page=product&slug=sig-p320-reaper-frt-forced-reset-trigger'],
  ['product-diablo-1440.png', '?page=product&slug=diablo-ak-47-frt-forced-reset-trigger'],
  ['product-tx22-1440.png', '?page=product&slug=tx22-frt-buy-one-get-one-free'],
  ['product-canik-1440.png', '?page=product&slug=canik-frt-forced-reset-trigger'],
  ['product-accessory-1440.png', '?page=product&slug=p320-side-charging-handle-strike-industries-ambidextrous-upgrade'],
  ['product-magazine-1440.png', '?page=product&slug=taurus-tx22-34-round-magazine'],
  ['installation-1440.png', '?page=installation'],
  ['dealers-1440.png', '?page=dealers'],
  ['support-1440.png', '?page=support'],
  ['contact-1440.png', '?page=contact'],
  ['about-1440.png', '?page=about'],
  ['kalash-bash-1440.png', '?page=kalash-bash'],
];

async function ready(page, route) {
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#app h1').waitFor({ state: 'visible' });
  await page.waitForTimeout(350);
}

async function snap(page, filename) {
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  for (const [filename, route] of routes) {
    await ready(page, route);
    await snap(page, filename);
  }

  for (const [filename, viewport] of [
    ['home-1440.png', { width: 1440, height: 1000 }],
    ['home-1024.png', { width: 1024, height: 900 }],
    ['home-768.png', { width: 768, height: 900 }],
    ['home-390.png', { width: 390, height: 844 }],
  ]) {
    await page.setViewportSize(viewport);
    await ready(page, '?page=home');
    await snap(page, filename);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page, '?page=home');
  await page.locator('[data-hero-control="1"]').click();
  await page.waitForTimeout(900);
  await snap(page, 'home-technical-slide-1440.png');
  await page.locator('[data-hero-control="2"]').click();
  await page.waitForTimeout(900);
  await snap(page, 'home-platform-slide-1440.png');

  await ready(page, '?page=home');
  await page.locator('#featured-products').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await snap(page, 'home-featured-1440.png');
  await page.locator('#site-footer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await snap(page, 'home-footer-1440.png');

  await ready(page, '?page=products');
  await page.locator('[data-menu="products"]').click();
  await page.waitForTimeout(250);
  await snap(page, 'products-mega-menu-1440.png');
  await page.keyboard.press('Escape');
  await page.locator('[data-menu="platforms"]').click();
  await page.waitForTimeout(250);
  await snap(page, 'platforms-mega-menu-1440.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '?page=home');
  await page.locator('.menu-toggle').click();
  await page.waitForTimeout(250);
  if (!(await page.locator('.drawer-close').evaluate((element) => element === document.activeElement))) {
    throw new Error('Mobile navigation did not move focus to the close control.');
  }
  await snap(page, 'mobile-navigation-390.png');
  await page.keyboard.press('Escape');
  if (!(await page.locator('.menu-toggle').evaluate((element) => element === document.activeElement))) {
    throw new Error('Mobile navigation did not return focus to the menu control.');
  }

  await browser.close();
  console.log(`Saved ${routes.length + 11} final screenshots to ${output}`);
})();
