#!/usr/bin/env node
// Dumps the full rendered HTML of one detail page so we can see the real structure.
const { chromium } = require('playwright');
const fs = require('fs');

const ID = process.argv[2] || '1696';
const URL = `https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?p3_abandonment_id=${ID}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  const html = await page.content();
  const out = `page_${ID}.html`;
  fs.writeFileSync(out, html);
  console.log(`Saved ${html.length} chars to ${out}`);

  // Also print any visible text content to quickly see what's on the page
  const text = await page.evaluate(() => document.body.innerText);
  console.log('\n--- Visible text (first 3000 chars) ---\n');
  console.log(text.slice(0, 3000));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
