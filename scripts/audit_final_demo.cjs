const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'screenshots', 'final-demo');
const base = 'http://127.0.0.1:4173/';
const products = JSON.parse(fs.readFileSync(path.join(root, 'data', 'products.json'), 'utf8'));
const productBySlug = (slug) => products.find((product) => product.slug === slug);
const widths = [1440, 1024, 768, 430, 390];
const routes = [
  ['home', '?page=home', 'Texas Triggers'],
  ['products', '?page=products', 'Products | Texas Triggers'],
  ['pdp', '?page=product&slug=diablo-ak-47-frt-forced-reset-trigger', `${productBySlug('diablo-ak-47-frt-forced-reset-trigger').name} | Texas Triggers`],
  ['cart', '?page=cart', 'Cart | Texas Triggers'],
  ['checkout', '?page=checkout', 'Checkout | Texas Triggers'],
  ['installation', '?page=installation&platform=AK', 'Installation Center | Texas Triggers'],
  ['support', '?page=support', 'Support | Texas Triggers'],
  ['platforms', '?page=platforms', 'Platforms | Texas Triggers'],
  ['dealers', '?page=dealers', 'Dealers | Texas Triggers'],
];

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

async function spaNavigate(page, route, readySelector = 'main h1') {
  await page.evaluate((nextRoute) => {
    history.pushState({}, '', nextRoute);
    dispatchEvent(new PopStateEvent('popstate'));
  }, route);
  await page.locator(readySelector).first().waitFor();
}

async function state(page) {
  return page.evaluate(() => ({
    title: document.title,
    heading: document.querySelector('main h1')?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src),
    description: document.querySelector('meta[name="description"]')?.content || '',
    canonical: document.querySelector('link[rel="canonical"]')?.href || '',
    ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
    visibleText: document.body.innerText.replace(/\s+/g, ' ').trim(),
  }));
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/*.mp4', (route) => route.abort());
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('texas-triggers-demo-cart-v1'));

  const matrix = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    for (const [name, route, expectedTitle] of routes) {
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
      await page.locator('main h1').waitFor();
      const current = await state(page);
      const problems = [];
      if (current.title !== expectedTitle) problems.push(`title ${JSON.stringify(current.title)}`);
      if (current.ogTitle !== expectedTitle) problems.push(`og:title ${JSON.stringify(current.ogTitle)}`);
      if (!current.description) problems.push('description missing');
      if (name === 'home' ? new URL(current.canonical).search : !current.canonical.includes(route.split('&')[0].replace('?', ''))) problems.push(`canonical ${current.canonical}`);
      if (current.overflow !== 0) problems.push(`overflow ${current.overflow}px`);
      if (current.brokenImages.length) problems.push(`${current.brokenImages.length} broken images`);
      if (/local (?:video|installation|catalog)|open local installation|front-end (?:demo|demonstration)|video archive|video and document library/i.test(current.visibleText)) problems.push('developer-facing implementation language');
      if (name === 'installation') {
        const finder = await page.evaluate(() => {
          const active = document.querySelector('.installation-platforms .active')?.getBoundingClientRect();
          return { theaters: document.querySelectorAll('[data-installation-theater]').length, archiveCards: document.querySelectorAll('.video-card').length, videos: document.querySelectorAll('.installation-video').length, activeVisible: !active || (active.left >= 0 && active.right <= innerWidth) };
        });
        if (finder.theaters !== 1 || finder.archiveCards !== 0 || finder.videos !== 0 || !finder.activeVisible) problems.push(`installation initial state ${JSON.stringify(finder)}`);
      }
      if (problems.length) throw new Error(`${name} ${width}: ${problems.join('; ')}`);
      await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
      matrix.push({ name, width, title: current.title, heading: clean(current.heading) });
    }
  }

  const routeTitleChecks = [
    ['?page=products&category=Knives', 'Knives Products | Texas Triggers'],
    ['?page=platforms&platform=AK', 'AK Products | Texas Triggers'],
    ['?page=contact', 'Contact | Texas Triggers'],
    ['?page=about', 'About | Texas Triggers'],
    ['?page=kalash-bash', 'Kalash Bash | Texas Triggers'],
  ];
  for (const [route, expectedTitle] of routeTitleChecks) {
    await spaNavigate(page, route);
    const current = await state(page);
    if (current.title !== expectedTitle || current.ogTitle !== expectedTitle || !current.canonical.includes(route.replace('?', ''))) throw new Error(`Route metadata mismatch for ${route}: ${JSON.stringify(current)}`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}?page=home`, { waitUntil: 'networkidle' });
  await page.locator('main h1').waitFor();
  const navigationCount = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  await page.evaluate(() => {
    history.pushState({}, '', '?page=product&slug=diablo-ak-47-frt-forced-reset-trigger');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForFunction(() => document.title.startsWith('Diablo AK-47 FRT'));
  const firstTitle = await page.title();
  if (firstTitle !== `${productBySlug('diablo-ak-47-frt-forced-reset-trigger').name} | Texas Triggers`) throw new Error(`Diablo PDP title mismatch: ${firstTitle}`);
  const nextSlug = 'sig-p320-reaper-frt-forced-reset-trigger';
  const expectedNextTitle = `${productBySlug(nextSlug).name} | Texas Triggers`;
  await page.evaluate((slug) => {
    history.pushState({}, '', `?page=product&slug=${slug}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }, nextSlug);
  await page.waitForFunction((title) => document.title === title, expectedNextTitle);
  const secondTitle = await page.title();
  if (await page.evaluate(() => performance.getEntriesByType('navigation').length) !== navigationCount) throw new Error('PDP client navigation caused a document refresh');
  await page.goBack();
  await page.waitForFunction((title) => document.title === title, firstTitle);
  const backTitle = await page.title();
  await page.goForward();
  await page.waitForFunction((title) => document.title === title, secondTitle);
  const forwardTitle = await page.title();
  const productMetadata = await page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.content,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
  }));
  if (!productMetadata.description || !productMetadata.canonical.includes(nextSlug) || !productMetadata.ogImage) throw new Error(`Incomplete PDP metadata: ${JSON.stringify(productMetadata)}`);

  await page.evaluate(() => localStorage.removeItem('texas-triggers-demo-cart-v1'));
  await spaNavigate(page, '?page=product&slug=canik-frt-forced-reset-trigger', '[data-option-name]');
  await page.locator('[data-option-name]').selectOption({ index: 1 });
  await page.locator('#product-quantity').fill('2');
  await page.locator('[data-add-cart]').click();
  if (await page.locator('[data-cart-count]').first().innerText() !== '2') throw new Error('Cart badge did not update after PDP add');
  await page.locator('[data-cart-confirmation]').click();
  await page.locator('.cart-item').waitFor();
  if (!/Enhanced Red Grip/.test(await page.locator('.cart-item').innerText())) throw new Error('Selected variation was not preserved in cart');
  await page.locator('[data-cart-quantity="1"]').click();
  await page.locator('.cart-item').waitFor();
  if (await page.locator('[data-cart-input]').inputValue() !== '3') throw new Error('Cart quantity adjustment failed');
  await page.locator('a[href="?page=products"]').last().click();
  await page.locator(`.catalog-card a[href*="diablo-ak-47-frt-forced-reset-trigger"]`).first().click();
  await page.locator('[data-add-cart]').click();
  await page.locator('[data-cart-confirmation]').click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.cart-item').first().waitFor();
  const persistedItems = await page.locator('.cart-item').count();
  const persistedCount = await page.locator('[data-cart-count]').first().innerText();
  if (persistedItems !== 2 || persistedCount !== '4') throw new Error(`Cart did not persist across navigation/reload: ${persistedItems} lines, ${persistedCount} items`);
  const cartText = clean(await page.locator('.cart-layout').innerText());
  if (!/CA, CO, CT, DE, FL, HI, IL, MA, MD, MN, NJ, NV, NY, OR, RI, WA, or Washington, D\.C\./.test(cartText)) throw new Error('Exact Diablo restriction did not carry into cart');
  await page.locator('.cart-layout').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'journey-cart-filled-1440.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.cart-layout').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'journey-cart-filled-390.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('a[href="?page=checkout"]').click();
  await page.locator('.checkout-layout').waitFor();
  if (await page.locator('.checkout-submit').isEnabled()) throw new Error('Demo checkout transaction control is enabled');
  const checkoutText = clean(await page.locator('.checkout-layout').innerText());
  if (!/Enhanced Red Grip/.test(checkoutText) || !/Washington, D\.C\./.test(checkoutText) || !/not transmitted/i.test(checkoutText)) throw new Error('Checkout lacks selected option, restriction, or non-transmission disclosure');
  await page.locator('.checkout-layout').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'journey-checkout-filled-1440.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'journey-checkout-filled-390.png') });

  await spaNavigate(page, '?page=installation&platform=AK', '#installation-resource-select');
  await page.locator('#installation-resource-select').selectOption({ index: 2 });
  await page.waitForFunction(() => new URLSearchParams(location.search).has('resource'));
  const selectedResource = await page.locator('#installation-resource-select').inputValue();
  await page.locator('[data-theater-play]').click();
  const player = page.locator('.installation-video');
  await player.waitFor();
  if (!(await player.getAttribute('src'))?.includes('.mp4')) throw new Error('Installation theater did not load the selected video on request');
  if (await page.locator('.installation-docs a').count() !== 2) throw new Error('AK documents are not adjacent to the installation finder');
  await page.screenshot({ path: path.join(output, 'journey-installation-selected-390.png') });

  await page.setViewportSize({ width: 1440, height: 900 });
  await spaNavigate(page, '?page=installation&platform=AK', '.installation-active');
  await page.locator('.installation-active').screenshot({ path: path.join(output, 'installation-theater-1440.png') });
  await spaNavigate(page, '?page=support', '.support-directory');
  await page.locator('.support-directory').screenshot({ path: path.join(output, 'support-directory-1440.png') });
  await page.setViewportSize({ width: 768, height: 900 });
  await spaNavigate(page, '?page=support', '.support-directory');
  await page.locator('.support-directory').screenshot({ path: path.join(output, 'support-directory-768.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await spaNavigate(page, '?page=support', '.support-directory');
  await page.locator('.support-directory').screenshot({ path: path.join(output, 'support-directory-390.png') });
  await spaNavigate(page, '?page=cart', '.cart-item');
  await page.locator('[data-cart-remove]').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.cart-item').length === 1);
  const countAfterRemoval = await page.locator('[data-cart-count]').first().innerText();
  if (countAfterRemoval !== '1') throw new Error(`Cart removal did not update shared count: ${countAfterRemoval}`);

  await browser.close();
  const screenshots = fs.readdirSync(output).filter((name) => name.endsWith('.png')).sort();
  console.log(JSON.stringify({
    matrixChecks: matrix.length,
    widths,
    routes: routes.map(([name]) => name),
    metadataNavigation: { firstTitle, secondTitle, backTitle, forwardTitle, navigationCount },
    routeTitleChecks: routeTitleChecks.length,
    selectedInstallationResource: selectedResource,
    countAfterRemoval,
    screenshotCount: screenshots.length,
    screenshots,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
