const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'screenshots', 'correction');
const base = 'http://127.0.0.1:4173/';
const widths = [1440, 1024, 768, 430, 390];
const cases = [
  ['frt', 'diablo-ak-47-frt-forced-reset-trigger', 'FRTs', true],
  ['magazine', 'promag-sig-sauer-p320-p250-9mm-32-round-magazine', 'Magazines', false],
  ['accessory', 'halo-charging-ring-for-taurustx-22', 'Accessories', true],
  ['knife', 'crkt-minimalist-drop-point-knife', 'Knives', false],
  ['merch', 'texas-triggers-snapback-hat', 'Merch', false],
];

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const presentation = JSON.parse(fs.readFileSync(path.join(root, 'data', 'presentation', 'products.json'), 'utf8'));

function sourceText(info) {
  return Object.values(info.source_sections || {}).flat().flatMap((section) =>
    (section.blocks || []).flatMap((block) => block.items || block.text || [])
  ).map(normalize).filter(Boolean).join(' ');
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  const results = [];

  for (const [kind, slug, category, expectsInstallation] of cases) {
    const info = presentation.products[slug];
    const expectedSource = sourceText(info);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}?page=product&slug=${encodeURIComponent(slug)}`, { waitUntil: 'networkidle' });
      await page.locator('.product-decision h1').waitFor();
      const state = await page.evaluate(({ expectedCategory }) => {
        const brokenImages = [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src);
        const externalProductLinks = [...document.querySelectorAll('.product-shell a[href*="texastriggerusa.com"]')].map((link) => link.href);
        const wells = ['.gallery-main', '.gallery-thumb'].flatMap((selector) => [...document.querySelectorAll(selector)]).map((element) => getComputedStyle(element).backgroundColor);
        return {
          heading: document.querySelector('.product-decision h1')?.textContent.trim(),
          category: document.querySelector('.product-decision .eyebrow')?.textContent.trim(),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          brokenImages,
          externalProductLinks,
          legacyCta: /view current product page|review the published product page for exact fitment/i.test(document.body.innerText),
          hasLocalPurchase: Boolean(document.querySelector('[data-demo-purchase], .product-actions button:disabled')),
          hasInstallationAction: Boolean(document.querySelector('.product-actions a[href*="page=installation"]')),
          hasInstallationSection: [...document.querySelectorAll('.product-info-sections article h3')].some((heading) => heading.textContent.trim().startsWith('Installation')),
          checkoutDisclosure: document.querySelector('[data-purchase-note]')?.textContent.trim(),
          wellColors: [...new Set(wells)],
          sourceSubsections: document.querySelectorAll('.product-info-sections .source-subsection').length,
          expectedCategory,
          bodyText: document.body.innerText.replace(/\s+/g, ' ').trim(),
        };
      }, { expectedCategory: category });

      const firstEvidence = normalize(expectedSource).slice(0, 70);
      const lastEvidence = normalize(expectedSource).slice(-70);
      const problems = [];
      if (!state.category.startsWith(category)) problems.push(`category was ${state.category}`);
      if (state.overflow !== 0) problems.push(`horizontal overflow ${state.overflow}px`);
      if (state.brokenImages.length) problems.push(`${state.brokenImages.length} broken images`);
      if (state.externalProductLinks.length) problems.push('legacy storefront link remains in purchase area');
      if (state.legacyCta) problems.push('legacy CTA or vague fitment placeholder remains');
      if (!state.hasLocalPurchase) problems.push('local purchase treatment missing');
      if (state.hasInstallationAction !== expectsInstallation || state.hasInstallationSection !== expectsInstallation) problems.push(`installation treatment did not match source availability (${expectsInstallation})`);
      if (!/no order will be placed/i.test(state.checkoutDisclosure || '')) problems.push('checkout disclosure missing');
      if (state.wellColors.some((color) => color !== 'rgb(255, 255, 255)')) problems.push(`non-white image well: ${state.wellColors.join(', ')}`);
      if (!state.bodyText.includes(firstEvidence) || !state.bodyText.includes(lastEvidence)) problems.push('source evidence missing from rendered PDP');
      if (kind === 'frt' && !/CA, CO, CT, DE, FL, HI, IL, MA, MD, MN, NJ, NV, NY, OR, RI, WA, or Washington, D\.C\./.test(state.bodyText)) problems.push('exact Diablo restriction list missing');
      if (problems.length) throw new Error(`${kind} ${width}: ${problems.join('; ')}`);

      if (width === 1440 || width === 390) {
        await page.locator('.product-primary').screenshot({ path: path.join(output, `${kind}-${width}-primary.png`) });
        await page.locator('.product-information').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${kind}-${width}-details.png`) });
      }
      results.push({ kind, slug, category, width, sourceCharacters: info.source_audit.presented_source_characters, sourceSubsections: state.sourceSubsections });
    }
  }

  const categoryCounts = Object.values(presentation.products).reduce((counts, item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {});
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}?page=products`, { waitUntil: 'networkidle' });
  const filters = await page.locator('.filter-chips .chip').allTextContents();
  for (const category of ['All products', 'FRTs', 'Magazines', 'Accessories', 'Knives', 'Merch']) {
    if (!filters.includes(category)) throw new Error(`Missing catalog filter: ${category}`);
  }
  for (const category of ['FRTs', 'Magazines', 'Accessories', 'Knives', 'Merch']) {
    await page.goto(`${base}?page=products&category=${encodeURIComponent(category)}`, { waitUntil: 'networkidle' });
    const count = await page.locator('.catalog-card').count();
    if (count !== categoryCounts[category]) throw new Error(`${category} filter returned ${count}, expected ${categoryCounts[category]}`);
  }
  await page.goto(`${base}?page=products`, { waitUntil: 'networkidle' });
  await page.locator('.nav-trigger[data-menu="products"]').click();
  const menuState = await page.locator('#products-menu').evaluate((element) => ({
    text: element.textContent.replace(/\s+/g, ' ').trim(),
    open: element.classList.contains('open'),
    visible: getComputedStyle(element).visibility,
  }));
  if (!menuState.open || menuState.visible !== 'visible' || !menuState.text.includes('Knives') || !menuState.text.includes('Merch')) throw new Error(`Desktop Products menu lacks visible Knives or Merch access: ${JSON.stringify(menuState)}`);
  await page.screenshot({ path: path.join(output, 'catalog-menu-1440.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}?page=products`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawerText = normalize(await page.locator('#mobile-navigation').innerText());
  if (!drawerText.includes('Knives') || !drawerText.includes('Merch')) throw new Error('Mobile navigation lacks Knives or Merch');
  await page.screenshot({ path: path.join(output, 'catalog-menu-390.png') });

  await browser.close();
  console.log(JSON.stringify({ checks: results.length, categoryCounts, screenshots: fs.readdirSync(output).length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
