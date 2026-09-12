const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const app = $('#app');
let products = [];
let contact = null;
let kalash = null;
let dealers = null;
let presentation = { products: {} };
let catalogImages = { products: {} };
let pageCleanup = () => {};
const cartStorageKey = 'texas-triggers-demo-cart-v1';
let cart = [];

const decodeText = (value) => {
  const area = document.createElement('textarea');
  area.innerHTML = String(value ?? '');
  return area.value;
};
const esc = (value) => decodeText(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));
const clean = (value) => decodeText(value).replace(/\s+/g, ' ').trim();
const productCopy = (product) => clean(product?.short_description_text || product?.description_text || '');
const productPresentation = (product) => presentation.products?.[product?.slug] || {};
const assetPath = (image) => image?.path || image?.duplicate_of || '';
const productImages = (product) => {
  const derivative = catalogImages.products?.[product?.slug];
  const override = productPresentation(product).primary_image;
  return [...new Set([derivative, override, ...(product?.images || []).map(assetPath)].filter(Boolean))];
};
const imageFor = (product) => productImages(product)[0] || 'assets/brand/texas-triggers-logo.png';
const categoryFor = (product) => clean(productPresentation(product).category || (product?.categories || [])[0] || 'Texas Triggers');
const priceFor = (product) => clean(product?.sale_price || product?.regular_price || 'Price not listed');
const priceNumber = (product) => {
  const value = Number(String(product?.sale_price || product?.regular_price || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : 0;
};
const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const optionLabel = (name) => clean(name).replace(/^attribute_pa_/, '').replace(/^attribute_/, '').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const cartItemKey = (slug, options = {}) => `${slug}::${Object.entries(options).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join('&')}`;
const loadCart = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(cartStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.slug && Number(item.quantity) > 0).map((item) => ({ slug: item.slug, options: item.options || {}, quantity: Math.min(99, Math.max(1, Number(item.quantity) || 1)) })) : [];
  } catch { return []; }
};
const saveCart = () => {
  try { localStorage.setItem(cartStorageKey, JSON.stringify(cart)); } catch {}
  updateCartCount();
};
const updateCartCount = () => {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  $$('[data-cart-count]').forEach((badge) => {
    badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count} item${count === 1 ? '' : 's'} in cart`);
  });
};
const detailedCart = () => cart.map((item) => {
  const product = productBySlug(item.slug);
  return product ? { ...item, key: cartItemKey(item.slug, item.options), product, unitPrice: priceNumber(product) } : null;
}).filter(Boolean);
const priceMarkup = (product) => product?.sale_price
  ? `<span class="sale-price">${esc(product.sale_price)}</span><s>${esc(product.regular_price)}</s>`
  : `<span>${esc(product?.regular_price || 'Price not listed')}</span>`;
const overviewFor = (product) => {
  const copy = productCopy(product);
  const sentences = copy.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length) return sentences.slice(0, 2).join(' ').trim();
  return copy.length > 220 ? `${copy.slice(0, 217).trim()}…` : copy;
};
const sourceSectionsFor = (product) => productPresentation(product).source_sections || {};
const sourceGroupText = (sections) => (sections || []).flatMap((section) => (section.blocks || []).flatMap((block) => block.items || block.text || [])).map(clean).filter(Boolean).join(' ');
const sourceGroupSummary = (sections, maxLength = 360) => {
  const value = sourceGroupText(sections);
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}…` : value;
};
const renderSourceBlock = (block, context = '') => {
  if (block.type === 'list') return `<ul>${(block.items || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
  const text = clean(block.text);
  if (!text) return '';
  if (context === 'shipping') {
    const match = text.match(/^(.*?cannot ship(?: this product)? to:)\s*(.+?)(Texas Triggers also does not ship.*)$/i);
    if (match) return `<p>${esc(match[1])}</p><strong class="restricted-destinations">${esc(match[2])}</strong><p>${esc(match[3])}</p>`;
  }
  return `<p>${esc(text)}</p>`;
};
const headingKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const renderSourceSections = (sections, context = '', parentTitle = '') => (sections || []).map((section) => {
  const showHeading = section.heading && headingKey(section.heading) !== headingKey(parentTitle);
  return `<div class="source-subsection">${showHeading ? `<h4>${esc(section.heading)}</h4>` : ''}${(section.blocks || []).map((block) => renderSourceBlock(block, context)).join('')}</div>`;
}).join('');
const renderInfoArticle = (title, sections, context = '', extra = '') => (!sections?.length && !extra) ? '' : `<article><h3>${esc(title)}</h3><div class="source-content">${renderSourceSections(sections, context, title)}${extra}</div></article>`;
const productBySlug = (slug) => products.find((product) => product.slug === slug);
const productMatches = (product, term) => {
  const haystack = `${product.name} ${productCopy(product)} ${(product.categories || []).join(' ')}`.toLowerCase();
  const needle = term.toLowerCase();
  if (/^[a-z0-9]{2,4}$/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
  }
  return haystack.includes(needle);
};

const platformDefs = [
  { name: 'AK', label: 'AK', keys: ['diablo', 'ak', 'beryl', 'tantal', 'zastava', 'wasr', 'draco'], art: 'assets/products/diablo-ak-47-frt-forced-reset-trigger/02.png' },
  { name: 'P320', label: 'P320', keys: ['p320', 'sig p320'], art: 'assets/products/diablo-product-02.png' },
  { name: 'Glock', label: 'Glock', keys: ['glock'], art: 'assets/products/frt-forced-reset-trigger-for-glock-gen-1-6/02.png' },
  { name: 'TX22', label: 'TX22', keys: ['tx22', 'taurus tx'], art: 'assets/products/tx22-frt-buy-one-get-one-free/02.jpg' },
  { name: '1911 / 2011', label: '1911 / 2011', keys: ['1911', '2011'], art: 'assets/products/1911-2011-frt-forced-reset-trigger/01.jpeg' },
  { name: 'SKS', label: 'SKS', keys: ['sks'], art: 'assets/products/norinco-sks-frt-forced-reset-trigger/02.jpeg' },
  { name: 'Canik', label: 'Canik', keys: ['canik'], art: 'assets/products/canik-frt-forced-reset-trigger/03.png' }
];

function productPlatforms(product) {
  return platformDefs.filter((platform) => platform.keys.some((key) => productMatches(product, key))).map((platform) => platform.name);
}

function platformProducts(platform) {
  return products.filter((product) => platform.keys.some((key) => productMatches(product, key)) && /frt|trigger/i.test(`${product.name} ${productCopy(product)}`));
}

function productCard(product, options = {}) {
  const platforms = productPlatforms(product);
  const classification = platforms.length ? platforms.join(' · ') : categoryFor(product);
  return `<article class="catalog-card ${options.featured ? 'catalog-card-featured' : ''}">
    <a class="catalog-image" href="?page=product&slug=${encodeURIComponent(product.slug)}">
      <img ${options.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} src="${esc(imageFor(product))}" alt="${esc(product.name)}" />
      <span>${esc(categoryFor(product))}</span>
    </a>
    <div class="catalog-meta">
      <small>${esc(classification)}</small>
      <h3><a href="?page=product&slug=${encodeURIComponent(product.slug)}">${esc(product.name)}</a></h3>
      <div class="card-footer"><strong class="card-price">${priceMarkup(product)}</strong><a class="text-link" href="?page=product&slug=${encodeURIComponent(product.slug)}">Details <span aria-hidden="true">↗</span></a></div>
    </div>
  </article>`;
}

function home() {
  const featuredSlugs = [
    'sig-p320-reaper-frt-forced-reset-trigger',
    'diablo-ak-47-frt-forced-reset-trigger',
    'tx22-frt-buy-one-get-one-free'
  ];
  const featured = featuredSlugs.map(productBySlug).filter(Boolean);
  return `<section class="hero-carousel" aria-roledescription="carousel" aria-label="Texas Triggers product highlights">
    <div class="hero-slide active hero-video-slide" data-hero-slide="0" aria-hidden="false">
      <video id="hero-video" muted playsinline preload="metadata" poster="assets/installation/hero-sigp320-frt-demo-poster.jpg">
        <source src="assets/installation/hero-sigp320-frt-demo.mp4" type="video/mp4" />
      </video>
      <div class="hero-shade"></div>
      <div class="hero-content"><span class="eyebrow">Texas Triggers</span><h1>Sig P320<br /><em>“Reaper” FRT</em></h1><p>Drop-in trigger kit for the Sig P320 platform.</p></div>
    </div>
    <div class="hero-slide hero-technical-slide" data-hero-slide="1" aria-hidden="true">
      <img class="hero-background" src="assets/hero/hero-reaper-frt-slide2.png" alt="Sig P320 Reaper FRT components" />
      <div class="hero-shade"></div>
      <div class="hero-content"><span class="eyebrow">Sig P320</span><h2>Reaper FRT<br /><em>components</em></h2><dl><div><dt>Product</dt><dd>Drop-in trigger kit</dd></div><div><dt>Platform</dt><dd>Sig P320</dd></div></dl></div>
    </div>
    <div class="hero-slide hero-platform-slide" data-hero-slide="2" aria-hidden="true">
      <img class="hero-background" src="assets/hero/hero-frt-platforms-slide3.png" alt="" />
      <div class="hero-shade"></div>
      <div class="hero-content"><span class="eyebrow">AK · P320 · Glock · TX22 · 1911 / 2011 · SKS · Canik</span><h2>Texas Triggers<br /><em>by platform</em></h2><a class="button button-primary" href="?page=platforms">Shop by platform <span aria-hidden="true">↗</span></a></div>
    </div>
    <div class="hero-controls" role="group" aria-label="Choose a hero slide">
      ${['Product video', 'Reaper components', 'Shop by platform'].map((label, index) => `<button class="hero-control ${index === 0 ? 'active' : ''}" data-hero-control="${index}" aria-label="${label}" ${index === 0 ? 'aria-current="true"' : ''}><span>0${index + 1}</span><i></i></button>`).join('')}
    </div>
  </section>

  <section class="home-featured page-section paper-section" id="featured-products">
    <div class="section-heading"><div><span class="eyebrow accent">Featured products</span><h2>Texas Triggers FRTs</h2></div><a class="text-link" href="?page=products&category=FRTs">View all FRTs <span aria-hidden="true">↗</span></a></div>
    <div class="featured-grid">${featured.map((product, index) => productCard(product, { featured: index === 0 })).join('')}</div>
  </section>

  <section class="platform-showcase page-section" id="platform-families">
    <div class="platform-showcase-copy"><span class="eyebrow accent">Platforms</span><h2>Seven platform families.<br /><em>One catalog.</em></h2><p>Browse products using the broad platform families already represented in the Texas Triggers catalog.</p><a class="button button-ghost" href="?page=platforms">View platforms <span aria-hidden="true">↗</span></a></div>
    <div class="platform-marquee">${platformDefs.map((platform, index) => `<a href="?page=platforms&platform=${encodeURIComponent(platform.name)}"><span>0${index + 1}</span><strong>${esc(platform.label)}</strong><img loading="lazy" src="${esc(platform.art)}" alt="" /></a>`).join('')}</div>
  </section>

  <section class="service-band page-section paper-section" id="installation-resources"><div><span class="eyebrow accent">Product support</span><h2>Installation resources</h2></div><p>Find the installation video and documentation for your product and model.</p><a class="button button-dark" href="?page=installation">Installation Center <span aria-hidden="true">↗</span></a></section>`;
}

function pageHero(eyebrow, title, body = '') {
  return `<section class="page-hero page-section"><span class="eyebrow accent">${esc(eyebrow)}</span><h1>${title}</h1>${body ? `<p>${esc(body)}</p>` : ''}</section>`;
}

function productsPage() {
  const params = new URLSearchParams(location.search);
  const category = params.get('category') || 'All products';
  const shown = category === 'All products' ? products : products.filter((product) => categoryFor(product).toLowerCase() === category.toLowerCase());
  const categories = ['FRTs', 'Magazines', 'Accessories', 'Knives', 'Merch'];
  return `${pageHero('Catalog', 'All products', `${products.length} products in the Texas Triggers catalog.`)}
    <section class="catalog-page page-section paper-section">
      <div class="catalog-toolbar"><div class="filter-chips"><a class="chip ${category === 'All products' ? 'active' : ''}" href="?page=products">All products</a>${categories.map((item) => `<a class="chip ${category === item ? 'active' : ''}" href="?page=products&category=${encodeURIComponent(item)}">${item}</a>`).join('')}</div><span>${shown.length} product${shown.length === 1 ? '' : 's'}</span></div>
      <div class="catalog-grid">${shown.map((product) => productCard(product)).join('')}</div>
    </section>`;
}

function platformsPage() {
  const selected = new URLSearchParams(location.search).get('platform');
  return `${pageHero('Product families', 'Shop by platform', 'Browse the platform families represented in the current catalog.')}
    <section class="platform-directory page-section paper-section">
      <div class="platform-directory-grid">${platformDefs.map((platform, index) => {
        const matches = platformProducts(platform);
        const active = selected === platform.name;
        return `<article class="platform-directory-card ${active ? 'selected' : ''}">
          <a class="platform-card-art" href="?page=platforms&platform=${encodeURIComponent(platform.name)}"><img loading="lazy" src="${esc(platform.art)}" alt="" /><span>0${index + 1}</span></a>
          <div><h2>${esc(platform.label)}</h2><p>${matches.length} matching trigger product${matches.length === 1 ? '' : 's'}</p><a class="text-link" href="?page=platforms&platform=${encodeURIComponent(platform.name)}">${active ? 'Selected' : 'View products'} <span aria-hidden="true">↗</span></a></div>
          ${active ? `<div class="directory-products">${matches.map((product) => productCard(product)).join('') || '<p>No matching trigger product was found in the current catalog.</p>'}</div>` : ''}
        </article>`;
      }).join('')}</div>
    </section>`;
}

const currentProduct = () => productBySlug(new URLSearchParams(location.search).get('slug')) || productBySlug('diablo-ak-47-frt-forced-reset-trigger') || products[0];

function productPage() {
  const product = currentProduct();
  if (!product) return pageHero('Catalog', 'Product not found');
  const info = productPresentation(product);
  const images = productImages(product);
  const sourceSections = sourceSectionsFor(product);
  const variations = Object.entries(product.variations || {});
  const platformRefs = productPlatforms(product);
  const compatibilitySummary = info.fitment || sourceGroupSummary(sourceSections.compatibility);
  const shippingSections = sourceSections.shipping || [];
  const unavailable = /out of stock/i.test(info.availability || '');
  const returnPolicy = presentation.policies?.return_policy || {};
  const returnPolicySections = [...(returnPolicy.returns || []), ...(returnPolicy.overview || []), ...(returnPolicy.shipping || [])];
  const hasInstallation = Boolean(sourceSections.installation?.length || info.installation_platform);
  const related = products
    .filter((candidate) => candidate.slug !== product.slug && categoryFor(candidate) === categoryFor(product))
    .sort((left, right) => Number(productPlatforms(right).some((platform) => platformRefs.includes(platform))) - Number(productPlatforms(left).some((platform) => platformRefs.includes(platform))))
    .slice(0, 3);
  const installationHref = info.installation_platform ? `?page=installation&platform=${encodeURIComponent(info.installation_platform)}` : '?page=installation';
  return `<section class="product-shell page-section">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="?page=products">Products</a><span aria-hidden="true">/</span><span>${esc(categoryFor(product))}</span></nav>
    <div class="product-primary">
      <div class="product-gallery">
        <div class="gallery-main"><img id="gallery-main-image" src="${esc(images[0])}" alt="${esc(product.name)}" /></div>
        ${images.length > 1 ? `<div class="gallery-thumbs" role="group" aria-label="Product images">${images.slice(0, 6).map((image, index) => `<button class="gallery-thumb ${index === 0 ? 'active' : ''}" data-gallery-image="${esc(image)}" aria-label="Show product image ${index + 1}"><img src="${esc(image)}" alt="" /></button>`).join('')}</div>` : ''}
      </div>
      <div class="product-decision">
        <span class="eyebrow accent">${esc(categoryFor(product))}${platformRefs.length ? ` · ${esc(platformRefs.join(' · '))}` : ''}</span>
        <h1>${esc(product.name)}</h1>
        <div class="product-price">${priceMarkup(product)}</div>
        ${info.availability ? `<div class="product-availability"><span>Published availability</span><strong>${esc(info.availability)}</strong></div>` : ''}
        ${variations.length ? `<div class="product-options">${variations.map(([name, values], index) => `<label for="option-${index}">${esc(optionLabel(name))}</label><select id="option-${index}" data-option-name="${esc(name)}">${values.map((value) => `<option>${esc(value)}</option>`).join('')}</select>`).join('')}</div>` : ''}
        ${compatibilitySummary ? `<div class="fitment-summary"><span>Compatibility / fitment</span><strong>${esc(compatibilitySummary)}</strong></div>` : ''}
        ${shippingSections.length ? `<aside class="shipping-alert" aria-label="Shipping restrictions"><span>Shipping restrictions</span>${renderSourceSections(shippingSections, 'shipping')}</aside>` : ''}
        <div class="purchase-controls"><label for="product-quantity">Quantity</label><div class="quantity-field"><button type="button" data-product-quantity-change="-1" aria-label="Decrease quantity">−</button><input id="product-quantity" type="number" min="1" max="99" value="1" inputmode="numeric" /><button type="button" data-product-quantity-change="1" aria-label="Increase quantity">+</button></div></div>
        <div class="product-actions"><button class="button button-primary" type="button" ${unavailable ? 'disabled' : `data-add-cart="${esc(product.slug)}"`}>${unavailable ? 'Out of stock' : 'Add to cart'}</button>${hasInstallation ? `<a class="button button-ghost" href="${installationHref}">Installation resources</a>` : ''}</div>
        <p class="source-note" data-purchase-note aria-live="polite"><span>Items stay in your demo cart while you browse.</span> <a href="?page=cart" data-cart-confirmation hidden>View cart</a></p>
      </div>
    </div>
  </section>
  <section class="product-information page-section paper-section">
    <div class="product-info-intro"><span class="eyebrow accent">Product information</span><h2>Published details</h2></div>
    <div class="product-info-sections">
      ${renderInfoArticle('Overview', sourceSections.overview)}
      ${renderInfoArticle('Compatibility & fitment', sourceSections.compatibility)}
      ${renderInfoArticle("What's included", sourceSections.included)}
      ${renderInfoArticle('Additional / required parts', sourceSections.required_parts)}
      ${hasInstallation ? renderInfoArticle('Installation guidance / resources', sourceSections.installation, '', `<a class="text-link" href="${installationHref}">Find installation resources <span aria-hidden="true">↗</span></a>`) : ''}
      ${renderInfoArticle('Shipping restrictions', shippingSections, 'shipping')}
      ${renderInfoArticle('Returns / warranty', sourceSections.returns, '', returnPolicySections.length ? `<details class="policy-details"><summary>Published return conditions</summary>${renderSourceSections(returnPolicySections)}</details>` : '')}
      <article><h3>Support</h3><div class="source-content"><p>General and order support: <a href="mailto:info@texastriggerusa.com">info@texastriggerusa.com</a></p><a class="text-link" href="?page=support">Support options <span aria-hidden="true">↗</span></a></div></article>
    </div>
  </section>
  ${related.length ? `<section class="related-products page-section"><div class="section-heading"><div><span class="eyebrow accent">Same category</span><h2>Related products</h2></div></div><div class="catalog-grid">${related.map((item) => productCard(item)).join('')}</div></section>` : ''}`;
}

const videos = [
  ['Sig P320 “Reaper” FRT', 'assets/installation/Sig-P320-Reaper-FRT-Install_.mp4', 'P320'],
  ['Norinco SKS FRT', 'assets/installation/Norinco-SKS-FRT-Install.mp4', 'SKS'],
  ['TX22 FRT', 'assets/installation/TX22-FRT-Install.mp4', 'TX22'],
  ['Glock Gen 1–6 FRT', 'assets/installation/Glock-Gen-1-6-FRT-Install-1.mp4', 'Glock'],
  ['Canik FRT', 'assets/installation/Canik-FRT-Install-2.mp4', 'Canik'],
  ['FB Beryl FRT', 'assets/installation/FB-Random-Beryl-FRT-install.mp4', 'AK'],
  ['Tantal FRT', 'assets/installation/Tantal-FRT-Install.mp4', 'AK'],
  ['Diablo · Zastava M70', 'assets/installation/Diablo-Trigger-Zastava-M70.mp4', 'AK'],
  ['Diablo · Zastava M85 / M92 / M70 UF', 'assets/installation/Diablo-Trigger-Zastava-M92_M85_70-UF-1.mp4', 'AK'],
  ['Diablo · SAM7', 'assets/installation/Diablo-Trigger-SAM7.mp4', 'AK'],
  ['Diablo · Romanian WASR10', 'assets/installation/Diablo-Trigger-Romanian-WASR10.mp4', 'AK'],
  ['Diablo · Riley Defense', 'assets/installation/Diablo-Trigger-Riley-Defense.mp4', 'AK'],
  ['Diablo · PSA GF3 / GF4 / GF5', 'assets/installation/Diablo-Trigger-PSA-GF3-GF4-GF5-.mp4', 'AK'],
  ['Diablo · Pioneer Arms Sporter', 'assets/installation/Diablo-Trigger-Pioneer-Arms-Sporter.mp4', 'AK'],
  ['Diablo · Pioneer Arms Hellpup', 'assets/installation/Diablo-Trigger-Pioneer-Arms-Hellpup.mp4', 'AK'],
  ['Diablo · Century Arms VSKA', 'assets/installation/Diablo-Trigger-Century-Arms-VSKA.mp4', 'AK'],
  ['Diablo · Mini / Micro Draco', 'assets/installation/Diablo-Trigger-Century-Arms-Mini_Micro-Draco.mp4', 'AK'],
  ['Diablo · BFT-47 / Draco Tactical', 'assets/installation/Diablo-Trigger-Century-Arms-BFT-47-Draco-Tactical.mp4', 'AK']
];
// Installation source videos intentionally remain local and are not included in the static deployment.
const installationVideosAvailable = false;

const installationResourceId = ([name, , platform]) => `${platform}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function installationPage() {
  const params = new URLSearchParams(location.search);
  const groups = ['P320', 'Glock', 'TX22', 'Canik', 'SKS', 'AK'];
  const requestedPlatform = params.get('platform');
  const selected = groups.includes(requestedPlatform) ? requestedPlatform : 'P320';
  const choices = videos.filter((video) => video[2] === selected);
  const requestedResource = params.get('resource');
  const active = choices.find((video) => installationResourceId(video) === requestedResource) || choices[0];
  const activeId = installationResourceId(active);
  const [activeName, activeSrc, activePlatform] = active;
  const art = platformDefs.find((item) => item.name === activePlatform)?.art || 'assets/installation/fb-beryl.png';
  const documents = selected === 'AK' ? `<section class="installation-documents" aria-labelledby="installation-documents-title"><div><span class="eyebrow accent">Step 3</span><h2 id="installation-documents-title">Documents</h2></div><div class="installation-docs"><a href="assets/Diablo-AK-47-FRT-Installation-Guide.pdf" target="_blank"><span class="eyebrow accent">PDF</span><strong>Diablo AK-47 FRT Installation Guide</strong><span>Open document <span aria-hidden="true">↗</span></span></a><a href="assets/Is-My-Rifle-Compatible-with-the-Diablo-FRT.pdf" target="_blank"><span class="eyebrow accent">PDF</span><strong>Diablo FRT compatibility guide</strong><span>Open document <span aria-hidden="true">↗</span></span></a></div></section>` : '';
  return `${pageHero('Support', 'Installation Center', 'Find the installation video and documentation for your product and model.')}
    <section class="installation-finder page-section paper-section">
      <div class="installation-selection">
        <div class="installation-step"><span class="eyebrow accent">Step 1</span><h2>Select platform</h2><div class="filter-chips installation-platforms">${groups.map((group) => `<a class="chip ${selected === group ? 'active' : ''}" href="?page=installation&platform=${encodeURIComponent(group)}">${esc(group)}</a>`).join('')}</div></div>
        <div class="installation-step"><label class="eyebrow accent" for="installation-resource-select">Step 2 · Select product or model</label><select id="installation-resource-select">${choices.map((video) => `<option value="${esc(installationResourceId(video))}" ${installationResourceId(video) === activeId ? 'selected' : ''}>${esc(video[0])}</option>`).join('')}</select></div>
      </div>
      <section class="installation-active" aria-labelledby="active-installation-title">
        <div class="installation-active-copy"><span class="eyebrow accent">${esc(activePlatform)} installation</span><h2 id="active-installation-title">${esc(activeName)}</h2><p>Select play when you are ready to view this installation resource.</p></div>
        <div class="installation-theater" data-installation-theater style="--poster:url('${esc(art)}')">
          ${installationVideosAvailable ? `<button class="theater-play" type="button" data-theater-play data-src="${esc(activeSrc)}" data-title="${esc(activeName)}"><span aria-hidden="true">▶</span><strong>Play installation video</strong></button>` : `<div class="installation-unavailable"><span class="eyebrow">Installation resource</span><strong>Installation video coming soon.</strong><p>Product and model resources remain available here. Review the related documents where provided.</p></div>`}
        </div>
      </section>
      ${choices.length > 1 ? `<nav class="installation-related" aria-label="Other ${esc(selected)} installation resources"><span class="eyebrow accent">Other ${esc(selected)} models</span><div>${choices.map((video) => `<a class="${installationResourceId(video) === activeId ? 'active' : ''}" href="?page=installation&platform=${encodeURIComponent(selected)}&resource=${encodeURIComponent(installationResourceId(video))}">${esc(video[0])}</a>`).join('')}</div></nav>` : ''}
      ${documents}
      <aside class="installation-support"><div><span class="eyebrow accent">Need help?</span><h2>Product support</h2><p>For product, installation-resource, or order questions, use the published support channels.</p></div><a class="button button-dark" href="?page=support">Support options <span aria-hidden="true">↗</span></a></aside>
    </section>`;
}

const cartRestrictions = (product) => sourceSectionsFor(product).shipping || [];
const cartOptionsMarkup = (options) => Object.entries(options || {}).length ? `<dl class="cart-options">${Object.entries(options).map(([name, value]) => `<div><dt>${esc(optionLabel(name))}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : '';
const commerceRestrictions = (items) => {
  const restricted = items.filter(({ product }) => cartRestrictions(product).length);
  if (!restricted.length) return '';
  return `<section class="commerce-restrictions" aria-labelledby="commerce-restrictions-title"><span class="eyebrow accent">Before checkout</span><h2 id="commerce-restrictions-title">Shipping restrictions</h2>${restricted.map(({ product }) => `<article class="restriction-callout"><h3>${esc(product.name)}</h3>${renderSourceSections(cartRestrictions(product), 'shipping', 'Shipping restrictions')}</article>`).join('')}</section>`;
};

function cartPage() {
  const items = detailedCart();
  if (!items.length) return `${pageHero('Shop', 'Your cart', 'Your selected products will appear here.')}
    <section class="empty-cart page-section paper-section"><span class="eyebrow accent">Cart is empty</span><h2>Find your product</h2><p>Browse products by category or platform, then add the verified configuration you want to review.</p><a class="button button-dark" href="?page=products">Continue shopping <span aria-hidden="true">↗</span></a></section>`;
  const subtotal = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  return `${pageHero('Shop', 'Your cart', `${items.reduce((total, item) => total + item.quantity, 0)} item${items.reduce((total, item) => total + item.quantity, 0) === 1 ? '' : 's'} selected for this demo checkout.`)}
    <section class="cart-layout page-section paper-section">
      <div class="cart-items" aria-label="Cart items">${items.map((item) => `<article class="cart-item" data-cart-item="${esc(item.key)}"><a class="cart-item-image" href="?page=product&slug=${encodeURIComponent(item.product.slug)}"><img src="${esc(imageFor(item.product))}" alt="${esc(item.product.name)}" /></a><div class="cart-item-copy"><span class="eyebrow accent">${esc(categoryFor(item.product))}</span><h2><a href="?page=product&slug=${encodeURIComponent(item.product.slug)}">${esc(item.product.name)}</a></h2>${cartOptionsMarkup(item.options)}<strong class="cart-unit-price">${money(item.unitPrice)} each</strong></div><div class="cart-item-controls"><div class="quantity-field" aria-label="Quantity for ${esc(item.product.name)}"><button type="button" data-cart-quantity="-1" data-cart-key="${esc(item.key)}" aria-label="Decrease quantity">−</button><input type="number" min="1" max="99" value="${item.quantity}" data-cart-input data-cart-key="${esc(item.key)}" aria-label="Quantity" /><button type="button" data-cart-quantity="1" data-cart-key="${esc(item.key)}" aria-label="Increase quantity">+</button></div><strong>${money(item.unitPrice * item.quantity)}</strong><button class="remove-item" type="button" data-cart-remove="${esc(item.key)}">Remove</button></div></article>`).join('')}</div>
      <aside class="cart-summary"><span class="eyebrow accent">Order summary</span><div><span>Subtotal</span><strong>${money(subtotal)}</strong></div><p>Shipping and tax are not calculated in this demonstration.</p><a class="button button-primary" href="?page=checkout">Continue to checkout <span aria-hidden="true">↗</span></a><a class="text-link" href="?page=products">Continue shopping</a></aside>
      ${commerceRestrictions(items)}
    </section>`;
}

function checkoutPage() {
  const items = detailedCart();
  if (!items.length) return `${pageHero('Checkout', 'Checkout', 'Add a product before reviewing the checkout presentation.')}
    <section class="empty-cart page-section paper-section"><span class="eyebrow accent">No items to review</span><h2>Your cart is empty</h2><a class="button button-dark" href="?page=products">Browse products <span aria-hidden="true">↗</span></a></section>`;
  const subtotal = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  return `${pageHero('Checkout', 'Checkout', 'Review the intended checkout experience. Information entered here is not transmitted.')}
    <section class="checkout-layout page-section paper-section">
      <form class="checkout-form" data-demo-checkout>
        <div class="checkout-notice"><strong>Demonstration only</strong><p>Information entered here is not transmitted. This form does not process payment or place an order.</p></div>
        <fieldset><legend>Contact information</legend><label for="checkout-email">Email</label><input id="checkout-email" type="email" autocomplete="email" placeholder="you@example.com" /></fieldset>
        <fieldset><legend>Shipping address</legend><div class="form-grid"><label class="full" for="checkout-name">Full name<input id="checkout-name" autocomplete="name" /></label><label class="full" for="checkout-address">Address<input id="checkout-address" autocomplete="street-address" /></label><label for="checkout-city">City<input id="checkout-city" autocomplete="address-level2" /></label><label for="checkout-state">State<input id="checkout-state" autocomplete="address-level1" /></label><label for="checkout-postal">ZIP code<input id="checkout-postal" autocomplete="postal-code" inputmode="numeric" /></label></div></fieldset>
        <fieldset><legend>Shipping method</legend><div class="shipping-method"><span>Shipping options</span><strong>Not calculated in this demonstration</strong><p>No shipping price or delivery estimate is shown.</p></div></fieldset>
        <button class="button button-primary checkout-submit" type="submit" disabled>Order placement unavailable in demo</button>
      </form>
      <aside class="checkout-summary"><span class="eyebrow accent">Order summary</span>${items.map((item) => `<div class="checkout-item"><img src="${esc(imageFor(item.product))}" alt="" /><div><strong>${esc(item.product.name)}</strong>${cartOptionsMarkup(item.options)}<span>Qty ${item.quantity}</span></div><b>${money(item.unitPrice * item.quantity)}</b></div>`).join('')}<dl class="checkout-totals"><div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div><div><dt>Shipping</dt><dd>Not calculated</dd></div><div><dt>Tax</dt><dd>Not calculated</dd></div><div class="checkout-total"><dt>Total</dt><dd>${money(subtotal)} + applicable shipping/tax</dd></div></dl><a class="text-link" href="?page=cart">Edit cart</a></aside>
      ${commerceRestrictions(items)}
    </section>`;
}

function dealersPage() {
  const wholesale = dealers.wholesale;
  return `${pageHero('Trade', 'Dealers & wholesale', 'Verified dealer, wholesale, installation-partner, and creator contact paths.')}
    <section class="dealer-page page-section paper-section">
      <article class="dealer-lead"><span class="eyebrow accent">Dealer / wholesale</span><h2>Dealer accounts</h2><p>${esc(wholesale.scope)}</p><a class="button button-dark" href="mailto:${esc(wholesale.email)}">Email ${esc(wholesale.contact_name)} <span aria-hidden="true">↗</span></a></article>
      <div class="dealer-list"><div class="section-heading"><div><span class="eyebrow accent">Installation dealers</span><h2>Published dealer contacts</h2></div></div>${dealers.installation_dealers.map((dealer) => `<article><div><h3>${esc(dealer.name)}</h3><p>${esc(dealer.evidence)}</p></div><a class="text-link" href="${esc(dealer.url)}" target="_blank" rel="noreferrer">Visit dealer <span aria-hidden="true">↗</span></a></article>`).join('')}<p class="dealer-disclaimer">${esc(dealers.installation_disclaimer)}</p></div>
      <article class="creator-path"><span class="eyebrow accent">Promoters / creators</span><h2>Creator inquiries</h2><p>${esc(dealers.promoters.instructions)}</p><a class="text-link" href="mailto:${esc(dealers.promoters.email)}">${esc(dealers.promoters.email)} <span aria-hidden="true">↗</span></a></article>
    </section>`;
}

function contactPage() {
  const details = contact.contact_information;
  return `${pageHero('Contact', 'Contact Texas Triggers', 'Use the address that matches your question.')}
    <section class="contact-layout page-section paper-section">
      <div class="contact-details"><span class="eyebrow accent">Email</span><div class="contact-card"><small>General / order support</small><a href="mailto:${esc(details.general_order_support)}">${esc(details.general_order_support)}</a></div><div class="contact-card"><small>Dealer inquiries</small><a href="mailto:${esc(details.dealer_inquiries)}">${esc(details.dealer_inquiries)}</a></div><div class="contact-card"><small>Promoter / creator inquiries</small><a href="mailto:${esc(details.promoter_creator_inquiries)}">${esc(details.promoter_creator_inquiries)}</a></div><p class="address">${esc(details.address).replace(/\n/g, '<br />')}<br />${esc(details.public_access)}</p></div>
      <div class="faq-list"><span class="eyebrow accent">Published FAQ</span>${contact.faq.map((item, index) => `<details ${index === 0 ? 'open' : ''}><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')}</div>
    </section>`;
}

function supportPage() {
  return `${pageHero('Support', 'Product & order support', 'Installation, policies, tracking, returns, warranty, and contact information.')}
    <section class="support-directory page-section paper-section">
      <article class="support-card support-card-wide"><span class="eyebrow accent">Installation</span><h2>Find your installation resource</h2><p>Select the product, platform, and exact model you need. Texas Triggers does not offer installation services.</p><a class="button button-dark" href="?page=installation">Installation Center <span aria-hidden="true">↗</span></a></article>
      <article class="support-card"><span class="eyebrow accent">Orders</span><h2>Shipping & tracking</h2><p>Review the published tracking and delivery information.</p><a class="text-link" href="?page=contact">Published FAQ <span aria-hidden="true">↗</span></a></article>
      <article class="support-card"><span class="eyebrow accent">Policies</span><h2>Returns & warranty</h2><p>Eligibility and warranty coverage depend on the product and its condition.</p><a class="text-link" href="?page=contact">Published policies <span aria-hidden="true">↗</span></a></article>
      <article class="support-card"><span class="eyebrow accent">Contact</span><h2>General support</h2><p>For order and general questions, email info@texastriggerusa.com.</p><a class="text-link" href="mailto:info@texastriggerusa.com">Email support <span aria-hidden="true">↗</span></a></article>
      <article class="support-card"><span class="eyebrow accent">Trade</span><h2>Dealers & creators</h2><p>Dealer and creator inquiries use separate contact paths.</p><a class="text-link" href="?page=dealers">Dealer information <span aria-hidden="true">↗</span></a></article>
    </section>`;
}

function aboutPage() {
  return `${pageHero('Company', 'Texas Triggers')}
    <section class="about-page-intro page-section paper-section"><div><span class="eyebrow accent">Fort Worth, Texas</span><h2>Firearm components, product support, and range presence.</h2></div><div><p>Texas Triggers operates in the firearms industry, with a current catalog of advanced trigger systems alongside firearm accessories and components. The company’s published product and support materials cover development, production, fulfillment, events, and customer-facing demonstrations.</p><p>Product pages, installation resources, and support channels are organized around the platform and product a customer is working with.</p><a class="button button-dark" href="?page=products">Browse products <span aria-hidden="true">↗</span></a></div></section>
    <section class="about-facts page-section paper-section" aria-label="Texas Triggers at a glance"><div><span>Location</span><strong>Fort Worth, Texas</strong></div><div><span>Catalog</span><strong>Trigger systems and components</strong></div><div><span>In the field</span><strong>Events and product demonstrations</strong></div></section>
    <section class="about-community"><div class="about-community-copy"><span class="eyebrow">Community and events</span><h2>See Texas Triggers in action.</h2><p>Texas Triggers participates in events including Kalash Bash and shares product-in-action updates through its verified social channels.</p><div class="community-actions"><a class="button button-primary" href="https://www.instagram.com/texastriggersusa/" target="_blank" rel="noreferrer">Follow @TexasTriggersUSA <span aria-hidden="true">↗</span></a><a class="social-link" href="?page=kalash-bash">Kalash Bash <span aria-hidden="true">↗</span></a></div></div><img src="assets/lifestyle/range-team.png" alt="Texas Triggers team members at the range" /></section>`;
}

function kalashPage() {
  return `${pageHero('Event', esc(kalash.title), kalash.subheading)}
    <section class="event-layout page-section paper-section"><div>${kalash.sections.map((section) => `<article><span class="eyebrow accent">${esc(section.heading)}</span>${(section.paragraphs || []).map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}${(section.winners || []).map((winner) => `<div class="winner"><strong>${esc(winner.name)}</strong><span>${esc(winner.location)}</span></div>`).join('')}</article>`).join('')}</div><aside><span class="eyebrow accent">Texas Triggers</span><h2>${esc(kalash.brand_line)}</h2><a class="text-link" href="https://www.instagram.com/texastriggersusa/" target="_blank" rel="noreferrer">@TexasTriggersUSA <span aria-hidden="true">↗</span></a></aside></section>`;
}

function wireCarousel() {
  const slides = $$('.hero-slide');
  const controls = $$('.hero-control');
  const video = $('#hero-video');
  if (!slides.length || !video) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 0;
  let timer = null;
  let disposed = false;
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  const schedule = (delay, next) => { if (!reducedMotion) timer = setTimeout(() => activate(next), delay); };
  const activate = (index) => {
    if (disposed) return;
    clearTimer();
    video.pause();
    video.currentTime = 0;
    current = index;
    slides.forEach((slide, slideIndex) => { const active = slideIndex === index; slide.classList.toggle('active', active); slide.setAttribute('aria-hidden', String(!active)); });
    controls.forEach((control, controlIndex) => { const active = controlIndex === index; control.classList.toggle('active', active); if (active) control.setAttribute('aria-current', 'true'); else control.removeAttribute('aria-current'); });
    if (index === 0 && !reducedMotion) video.play().catch(() => schedule(6500, 1));
    if (index === 1) schedule(6000, 2);
    if (index === 2) schedule(6500, 0);
  };
  controls.forEach((control) => control.addEventListener('click', () => activate(Number(control.dataset.heroControl))));
  video.addEventListener('ended', () => { if (current === 0) activate(1); });
  activate(0);
  pageCleanup = () => { disposed = true; clearTimer(); video.pause(); };
}

function wirePage(page) {
  if (page === 'home') wireCarousel();
  $$('.gallery-thumb').forEach((button) => button.addEventListener('click', () => {
    $('#gallery-main-image').src = button.dataset.galleryImage;
    $$('.gallery-thumb').forEach((item) => item.classList.toggle('active', item === button));
  }));
  $$('[data-product-quantity-change]').forEach((button) => button.addEventListener('click', () => {
    const input = $('#product-quantity');
    input.value = String(Math.min(99, Math.max(1, Number(input.value || 1) + Number(button.dataset.productQuantityChange))));
  }));
  $$('[data-add-cart]').forEach((button) => button.addEventListener('click', () => {
    const slug = button.dataset.addCart;
    const options = Object.fromEntries($$('[data-option-name]').map((select) => [select.dataset.optionName, select.value]));
    const quantity = Math.min(99, Math.max(1, Number($('#product-quantity')?.value || 1)));
    const key = cartItemKey(slug, options);
    const existing = cart.find((item) => cartItemKey(item.slug, item.options) === key);
    if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
    else cart.push({ slug, options, quantity });
    saveCart();
    const product = productBySlug(slug);
    const note = $('[data-purchase-note] span');
    if (note) note.textContent = `${quantity} × ${product.name} added to your cart.`;
    const confirmation = $('[data-cart-confirmation]');
    if (confirmation) confirmation.hidden = false;
  }));
  $$('[data-cart-quantity]').forEach((button) => button.addEventListener('click', () => {
    const item = cart.find((candidate) => cartItemKey(candidate.slug, candidate.options) === button.dataset.cartKey);
    if (!item) return;
    item.quantity = Math.min(99, Math.max(1, item.quantity + Number(button.dataset.cartQuantity)));
    saveCart();
    render();
  }));
  $$('[data-cart-input]').forEach((input) => input.addEventListener('change', () => {
    const item = cart.find((candidate) => cartItemKey(candidate.slug, candidate.options) === input.dataset.cartKey);
    if (!item) return;
    item.quantity = Math.min(99, Math.max(1, Number(input.value) || 1));
    saveCart();
    render();
  }));
  $$('[data-cart-remove]').forEach((button) => button.addEventListener('click', () => {
    cart = cart.filter((item) => cartItemKey(item.slug, item.options) !== button.dataset.cartRemove);
    saveCart();
    render();
  }));
  $('#installation-resource-select')?.addEventListener('change', (event) => {
    const platform = new URLSearchParams(location.search).get('platform') || 'P320';
    history.pushState({}, '', `?page=installation&platform=${encodeURIComponent(platform)}&resource=${encodeURIComponent(event.target.value)}`);
    render();
  });
  const activePlatform = $('.installation-platforms .active');
  const platformStrip = activePlatform?.parentElement;
  if (platformStrip && platformStrip.scrollWidth > platformStrip.clientWidth) {
    platformStrip.scrollLeft = activePlatform.offsetLeft + activePlatform.offsetWidth - platformStrip.clientWidth;
  }
  $('[data-theater-play]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const theater = button.closest('[data-installation-theater]');
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = button.dataset.src;
    video.className = 'installation-video';
    video.setAttribute('aria-label', button.dataset.title);
    theater.replaceChildren(video);
  });
  $('[data-demo-checkout]')?.addEventListener('submit', (event) => event.preventDefault());
  updateCartCount();
}

const titleLabels = { home: 'Texas Triggers', products: 'Products', platforms: 'Platforms', installation: 'Installation Center', contact: 'Contact', support: 'Support', dealers: 'Dealers', about: 'About', 'kalash-bash': 'Kalash Bash', cart: 'Cart', checkout: 'Checkout' };
const pageDescriptions = {
  home: 'Browse Texas Triggers products, platforms, installation resources, dealers, and support.',
  products: 'Browse the Texas Triggers product catalog by category.',
  platforms: 'Browse Texas Triggers products by supported platform family.',
  installation: 'Find the installation video and documentation for your Texas Triggers product and model.',
  contact: 'Contact Texas Triggers for general, order, dealer, or creator inquiries.',
  support: 'Find Texas Triggers installation, order, returns, warranty, and contact resources.',
  dealers: 'Texas Triggers dealer, wholesale, installation-partner, and creator contact information.',
  about: 'Learn about Texas Triggers, its Fort Worth location, product categories, events, and support resources.',
  'kalash-bash': 'Texas Triggers Kalash Bash event information.',
  cart: 'Review products and quantities selected for the Texas Triggers demo cart.',
  checkout: 'Review the non-transactional Texas Triggers checkout presentation.'
};
const conciseDescription = (value, maxLength = 160) => {
  const text = clean(value);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength + 1);
  return `${clipped.slice(0, clipped.lastIndexOf(' ') || maxLength).trim()}…`;
};
const setMeta = (selector, attribute, value, createAttributes) => {
  let element = document.head.querySelector(selector);
  if (!value) { element?.remove(); return; }
  if (!element) {
    element = document.createElement(createAttributes.tag || 'meta');
    Object.entries(createAttributes).forEach(([name, content]) => { if (name !== 'tag') element.setAttribute(name, content); });
    document.head.append(element);
  }
  element.setAttribute(attribute, value);
};
function updateDocumentMetadata(page) {
  const params = new URLSearchParams(location.search);
  const product = page === 'product' ? currentProduct() : null;
  const category = page === 'products' ? params.get('category') : null;
  const platform = page === 'platforms' ? params.get('platform') : null;
  let label = titleLabels[page] || 'Texas Triggers';
  if (product) label = product.name;
  else if (page === 'products' && category) label = `${category} Products`;
  else if (page === 'platforms' && platform) label = `${platform} Products`;
  document.title = page === 'home' ? 'Texas Triggers' : `${label} | Texas Triggers`;

  const sourceDescription = product ? (sourceGroupSummary(sourceSectionsFor(product).overview, 220) || productCopy(product)) : '';
  const description = product && clean(sourceDescription).length >= 40 ? conciseDescription(sourceDescription) : pageDescriptions[page] || '';
  setMeta('meta[name="description"]', 'content', description, { tag: 'meta', name: 'description' });
  setMeta('meta[property="og:title"]', 'content', document.title, { tag: 'meta', property: 'og:title' });
  setMeta('meta[property="og:description"]', 'content', description, { tag: 'meta', property: 'og:description' });
  setMeta('meta[property="og:type"]', 'content', product ? 'product' : 'website', { tag: 'meta', property: 'og:type' });
  setMeta('meta[property="og:image"]', 'content', product ? new URL(imageFor(product), location.href).href : '', { tag: 'meta', property: 'og:image' });

  const canonical = new URL(location.pathname, location.origin);
  if (page !== 'home') canonical.searchParams.set('page', page);
  if (page === 'product' && product) canonical.searchParams.set('slug', product.slug);
  if (page === 'products' && category) canonical.searchParams.set('category', category);
  if (page === 'platforms' && platform) canonical.searchParams.set('platform', platform);
  if (page === 'installation') {
    if (params.get('platform')) canonical.searchParams.set('platform', params.get('platform'));
    if (params.get('resource')) canonical.searchParams.set('resource', params.get('resource'));
  }
  setMeta('link[rel="canonical"]', 'href', canonical.href, { tag: 'link', rel: 'canonical' });
  setMeta('meta[property="og:url"]', 'content', canonical.href, { tag: 'meta', property: 'og:url' });
}

function render() {
  pageCleanup();
  pageCleanup = () => {};
  const page = new URLSearchParams(location.search).get('page') || 'home';
  const views = { home, products: productsPage, platforms: platformsPage, product: productPage, installation: installationPage, contact: contactPage, support: supportPage, dealers: dealersPage, about: aboutPage, 'kalash-bash': kalashPage, cart: cartPage, checkout: checkoutPage };
  app.innerHTML = (views[page] || home)();
  document.body.dataset.page = page;
  updateDocumentMetadata(views[page] ? page : 'home');
  wirePage(page);
  closeMenus();
  const hashTarget = location.hash ? document.querySelector(location.hash) : null;
  if (hashTarget) requestAnimationFrame(() => {
    hashTarget.scrollIntoView({ block: 'start', behavior: 'instant' });
    window.setTimeout(() => hashTarget.scrollIntoView({ block: 'start', behavior: 'instant' }), 250);
  });
  else window.scrollTo({ top: 0, behavior: 'auto' });
}

const menus = { products: $('#products-menu'), platforms: $('#platforms-menu') };
const navTriggers = $$('.nav-trigger');
let menuCloseTimer = null;
function closeMenus(returnFocus = false) {
  window.clearTimeout(menuCloseTimer);
  let activeTrigger = null;
  navTriggers.forEach((trigger) => { if (trigger.getAttribute('aria-expanded') === 'true') activeTrigger = trigger; trigger.setAttribute('aria-expanded', 'false'); });
  Object.values(menus).forEach((menu) => menu.classList.remove('open'));
  if (returnFocus) activeTrigger?.focus();
}
navTriggers.forEach((trigger) => trigger.addEventListener('click', () => {
  const menu = menus[trigger.dataset.menu];
  const shouldOpen = !menu.classList.contains('open');
  closeMenus();
  if (shouldOpen) { menu.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); }
}));
function openMenu(trigger) {
  if (window.matchMedia('(max-width: 900px)').matches) return;
  window.clearTimeout(menuCloseTimer);
  const menu = menus[trigger.dataset.menu];
  if (!menu || menu.classList.contains('open')) return;
  closeMenus();
  menu.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
}
function scheduleMenuClose() {
  if (window.matchMedia('(max-width: 900px)').matches) return;
  window.clearTimeout(menuCloseTimer);
  menuCloseTimer = window.setTimeout(() => closeMenus(), 140);
}
navTriggers.forEach((trigger) => {
  const menu = menus[trigger.dataset.menu];
  trigger.addEventListener('pointerenter', () => openMenu(trigger));
  trigger.addEventListener('pointerleave', scheduleMenuClose);
  trigger.addEventListener('focusin', () => openMenu(trigger));
  menu.addEventListener('pointerenter', () => window.clearTimeout(menuCloseTimer));
  menu.addEventListener('pointerleave', scheduleMenuClose);
  menu.addEventListener('focusin', () => window.clearTimeout(menuCloseTimer));
  menu.addEventListener('focusout', (event) => { if (!menu.contains(event.relatedTarget) && event.relatedTarget !== trigger) scheduleMenuClose(); });
});
document.addEventListener('click', (event) => { if (!event.target.closest('.site-header')) closeMenus(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeMenus(true); if (drawer.classList.contains('open')) closeDrawer(); } });

const drawer = $('.mobile-drawer');
const menuToggle = $('.menu-toggle');
const drawerClose = $('.drawer-close');
let drawerReturnFocus = null;
function openDrawer() {
  drawerReturnFocus = document.activeElement;
  drawer.classList.add('open');
  drawer.showModal();
  menuToggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('nav-open');
}
function closeDrawer() {
  if (!drawer.open) return;
  drawer.classList.remove('open');
  drawer.close();
  menuToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-open');
  drawerReturnFocus?.focus();
}
menuToggle.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawer.addEventListener('cancel', (event) => { event.preventDefault(); closeDrawer(); });
drawer.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusable = $$('a, button', drawer).filter((element) => !element.hidden);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="?"]');
  if (!link) return;
  event.preventDefault();
  history.pushState({}, '', link.href);
  if (drawer.classList.contains('open')) closeDrawer();
  render();
});
window.addEventListener('popstate', render);

const communityBand = $('.community-band');
if (communityBand && 'IntersectionObserver' in window) {
  new IntersectionObserver((entries, observer) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
  }), { threshold: .18 }).observe(communityBand);
} else communityBand?.classList.add('revealed');

async function boot() {
  [products, contact, kalash, dealers, presentation, catalogImages] = await Promise.all([
    fetch('data/products.json').then((response) => response.json()),
    fetch('data/pages/contact.json').then((response) => response.json()),
    fetch('data/pages/kalash-bash.json').then((response) => response.json()),
    fetch('data/pages/dealers.json').then((response) => response.json()),
    fetch('data/presentation/products.json').then((response) => response.json()),
    fetch('data/presentation/catalog-images.json').then((response) => response.json())
  ]);
  cart = loadCart();
  render();
}

boot().catch((error) => {
  console.error(error);
  app.innerHTML = '<section class="page-section"><h1>Unable to load the catalog.</h1></section>';
});
