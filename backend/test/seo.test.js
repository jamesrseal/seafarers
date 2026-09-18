const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { caseTitle, caseDescription, casePage, viewPage, VIEW_PAGES, homePage, sitemapXml } = require('../src/seo');

// The real template: the page functions fill in its tags, so this fails if one is renamed or dropped.
const template = fs.readFileSync(path.join(__dirname, '../../frontend/index.html'), 'utf8');

const SHIP = {
  abandonment_id: '1815',
  ship_name: 'Volgo-Don 5021',
  ship_status: '',
  flag: 'Palau',
  imo_number: '8955873',
  port_of_abandonment: 'Samsun, Türkiye',
  abandonment_date: '1 July 2026',
  notification_date: '11 August 2026',
  reporting_member: "International Transport Workers' Federation",
  num_seafarers: 14,
  circumstances: '3 months owed wages\n\nSeafarers applied to insurer?: Yes \nInsurance certificate dates: 30th March 2025 to 30th September 2026',
  comments: '16 September 2026: Palau\n(From the Palau Ship Registry)\n\nPartial payments have been made.',
  ilo_url: 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?p3_abandonment_id=1815',
};

const metaContent = (html, key) => html.match(new RegExp(`<meta ${key} content="([^"]*)"`))?.[1];

test('a case page replaces every title, description and URL tag of the home page', () => {
  const html = casePage(template, SHIP);
  const title = 'Volgo-Don 5021 abandoned in Samsun, Türkiye (2026) | Abandoned Seafarers';
  const description = '14 seafarers abandoned on the Volgo-Don 5021 (IMO 8955873, flag Palau) in Samsun, Türkiye, 1 July 2026. ILO case 1815, status: Unresolved.';
  const url = 'https://abandonedseafarers.org/?ship=1815';

  assert.equal(html.match(/<title>([^<]*)<\/title>/)[1], title);
  assert.equal(metaContent(html, 'property="og:title"'), title);
  assert.equal(metaContent(html, 'name="twitter:title"'), title);
  assert.equal(metaContent(html, 'name="description"'), description);
  assert.equal(metaContent(html, 'property="og:description"'), description);
  assert.equal(metaContent(html, 'name="twitter:description"'), description);
  assert.equal(html.match(/<link rel="canonical" href="([^"]*)"/)[1], url);
  assert.equal(metaContent(html, 'property="og:url"'), url);

  // Nothing of the home page's own wording or URL is left behind.
  for (const home of [/<title>([^<]*)<\/title>/, /<meta name="description" content="([^"]*)"/, /<meta property="og:description" content="([^"]*)"/]) {
    assert.ok(!html.includes(template.match(home)[1]), `still has ${template.match(home)[1]}`);
  }
  assert.ok(!html.includes('"https://abandonedseafarers.org/"'));
});

test('a case page writes the case out in #root', () => {
  const html = casePage(template, SHIP);
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>/)[1];
  assert.match(root, /^<article class="case-summary">/);
  assert.match(root, /<h1>Volgo-Don 5021<\/h1>/);
  assert.match(root, /<dt>IMO Number<\/dt><dd>8955873<\/dd>/);
  assert.match(root, /<dt>Reporting Org.<\/dt><dd>International Transport Workers&#39; Federation<\/dd>/);
  assert.match(root, /<h2>Circumstances<\/h2>\n<p>3 months owed wages<\/p>\n<p>Seafarers applied to insurer\?: Yes<br>Insurance certificate dates/);
  assert.match(root, /<h2>Updates<\/h2>\n<p>16 September 2026: Palau<br>\(From the Palau Ship Registry\)<\/p>\n<p>Partial payments have been made.<\/p>/);
  assert.match(root, /<a href="https:\/\/wwwex.ilo.org\/dyn\/r\/abandonment\/seafarers\/details\?p3_abandonment_id=1815">ILO record<\/a>/);
});

test('case text is escaped, and a "$" in it is kept as written', () => {
  const html = casePage(template, {
    ...SHIP,
    ship_name: 'Sea <b>"Star"</b> & $& $1',
    circumstances: 'Owed US$ 50,000 <script>alert(1)</script>',
    ilo_url: 'javascript:alert(1)',
  });
  assert.ok(!html.includes('<b>') && !html.includes('<script>alert'));
  assert.match(html, /<title>Sea &lt;b&gt;&quot;Star&quot;&lt;\/b&gt; &amp; \$&amp; \$1 abandoned in/);
  assert.match(html, /Owed US\$ 50,000 &lt;script&gt;/);
  assert.ok(!html.includes('javascript:'), 'a URL that is not https is left out');
});

test('titles and descriptions leave out what a record lacks', () => {
  const sparse = { abandonment_id: '7', ship_name: 'Yang Xho', ship_status: 'resolved', abandonment_date: 'September 2010' };
  assert.equal(caseTitle(sparse), 'Yang Xho abandonment case (2010) | Abandoned Seafarers');
  assert.equal(caseDescription(sparse), 'Seafarers abandoned on the Yang Xho, September 2010. ILO case 7, status: Resolved.');
  assert.equal(caseTitle({ ...sparse, abandonment_date: null, notification_date: '3 March 2011' }), 'Yang Xho abandonment case (2011) | Abandoned Seafarers');
  assert.equal(caseDescription({ ...sparse, num_seafarers: 1, flag: 'Iran (Islamic Republic of)' }),
    '1 seafarer abandoned on the Yang Xho (flag Iran (Islamic Republic of)), September 2010. ILO case 7, status: Resolved.');
});

test('each view page has its own title, description and canonical URL', () => {
  assert.deepEqual(Object.keys(VIEW_PAGES), ['about', 'report', 'dashboard']);
  for (const [view, { title, description }] of Object.entries(VIEW_PAGES)) {
    const html = viewPage(template, view);
    const url = `https://abandonedseafarers.org/?view=${view}`;
    assert.equal(html.match(/<title>([^<]*)<\/title>/)[1], title, view);
    assert.equal(metaContent(html, 'property="og:title"'), title, view);
    // Attributes carry the escaped text ("ILO's" -> "ILO&#39;s").
    const escaped = description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    assert.equal(metaContent(html, 'name="description"'), escaped, view);
    assert.equal(metaContent(html, 'name="twitter:description"'), escaped, view);
    assert.equal(html.match(/<link rel="canonical" href="([^"]*)"/)[1], url, view);
    assert.equal(metaContent(html, 'property="og:url"'), url, view);
    assert.ok(title.endsWith('| Abandoned Seafarers'), `${view} title names the site`);
    assert.ok(description.length <= 200, `${view} description stays snippet-sized`);
    // The text is the React view, so nothing is written into #root, and the Dataset stays on the home page.
    assert.match(html, /<div id="root"><\/div>/, view);
    assert.ok(!html.includes('application/ld+json'), view);
  }
});

test('the home page keeps its own tags and adds the Dataset', () => {
  const html = homePage(template, { cases: 1790, firstYear: 2004, modified: '2026-09-17T10:24:17.238Z' });
  assert.equal(html.replace(/<script type="application\/ld\+json">.*<\/script>\n  /, ''), template);
  const dataset = JSON.parse(html.match(/<script type="application\/ld\+json">(.*)<\/script>/)[1]);
  assert.equal(dataset['@type'], 'Dataset');
  assert.ok(dataset.description.length >= 50 && dataset.description.length <= 5000, 'Google wants 50-5000 characters');
  assert.match(dataset.description, /^The 1790 cases .*, reported since 2004,/);
  assert.equal(dataset.temporalCoverage, '2004/..');
  assert.equal(dataset.dateModified, '2026-09-17T10:24:17.238Z');
});

test('the sitemap lists the home page and each case with its last change', () => {
  const xml = sitemapXml({
    modified: '2026-09-17T10:24:17.238Z',
    cases: [{ abandonment_id: '1', scraped_at: '2024-03-01T00:00:00.000Z' }, { abandonment_id: '1815', scraped_at: '2026-09-17T10:24:17.238Z' }],
  });
  assert.equal(xml, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url><loc>https://abandonedseafarers.org/</loc><lastmod>2026-09-17</lastmod></url>',
    '  <url><loc>https://abandonedseafarers.org/?view=about</loc></url>',
    '  <url><loc>https://abandonedseafarers.org/?view=report</loc></url>',
    '  <url><loc>https://abandonedseafarers.org/?view=dashboard</loc></url>',
    '  <url><loc>https://abandonedseafarers.org/?ship=1</loc><lastmod>2024-03-01</lastmod></url>',
    '  <url><loc>https://abandonedseafarers.org/?ship=1815</loc><lastmod>2026-09-17</lastmod></url>',
    '</urlset>',
    '',
  ].join('\n'));
});
