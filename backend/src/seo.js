// What a search engine or link preview gets before the React app runs. A case
// link (/?ship=N) gets its own title, description and canonical URL, with the
// case written out as plain HTML; the home page describes the data as a
// schema.org Dataset; and the sitemap lists every case.

const { STATUS_LABELS } = require('./status');
const { caseCardAlt } = require('./ogCard');

const SITE_ORIGIN = 'https://abandonedseafarers.org';
const SITE_NAME = 'Abandoned Seafarers';
const ILO_DATABASE_URL = 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/search';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ESCAPES[c]);

// Case links keep the app's own ?ship= form: the Bluesky poster reads posted
// cases back from it.
const caseUrl = id => `${SITE_ORIGIN}/?ship=${id}`;
const shipName = ship => ship.ship_name || `Case ${ship.abandonment_id}`;
const statusLabel = status => STATUS_LABELS[status ?? ''] ?? status;
// ILO dates are free text ("2 July 2014", "September 2010", "2010").
const yearOf = date => /\b(\d{4})\s*$/.exec(date ?? '')?.[1] ?? null;

// Names repeat (201 are shared by more than one case), so the port and year
// keep titles apart.
function caseTitle(ship) {
  const where = ship.port_of_abandonment ? `abandoned in ${ship.port_of_abandonment}` : 'abandonment case';
  const year = yearOf(ship.abandonment_date) ?? yearOf(ship.notification_date);
  return `${shipName(ship)} ${where}${year ? ` (${year})` : ''} | ${SITE_NAME}`;
}

function caseDescription(ship) {
  const n = ship.num_seafarers;
  const crew = n ? `${n} ${n === 1 ? 'seafarer' : 'seafarers'}` : 'Seafarers';
  const details = [ship.imo_number && `IMO ${ship.imo_number}`, ship.flag && `flag ${ship.flag}`].filter(Boolean);
  const vessel = `${shipName(ship)}${details.length ? ` (${details.join(', ')})` : ''}`;
  const where = ship.port_of_abandonment ? ` in ${ship.port_of_abandonment}` : '';
  const when = ship.abandonment_date ? `, ${ship.abandonment_date}` : '';
  return `${crew} abandoned on the ${vessel}${where}${when}. ILO case ${ship.abandonment_id}, status: ${statusLabel(ship.ship_status)}.`;
}

// Blank lines separate paragraphs; single newlines are line breaks.
function paragraphs(text) {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${escapeHtml(p).replace(/\s*\n\s*/g, '<br>')}</p>`)
    .join('\n');
}

// The case as the detail panel shows it, for crawlers that don't run the app
// and readers without JavaScript.
function caseArticle(ship) {
  const facts = [
    ['Status', statusLabel(ship.ship_status)],
    ['Abandonment ID', ship.abandonment_id],
    ['IMO Number', ship.imo_number],
    ['Flag', ship.flag],
    ['Port of Abandonment', ship.port_of_abandonment],
    ['Abandonment Date', ship.abandonment_date],
    ['Notification Date', ship.notification_date],
    ['Seafarers', ship.num_seafarers],
    ['Reporting Org.', ship.reporting_member],
  ].filter(([, value]) => value != null && value !== '');
  const links = [
    /^https:\/\//.test(ship.ilo_url ?? '') && `<a href="${escapeHtml(ship.ilo_url)}">ILO record</a>`,
    '<a href="/">Map of all abandonment cases</a>',
  ].filter(Boolean);
  return [
    '<article class="case-summary">',
    `<h1>${escapeHtml(shipName(ship))}</h1>`,
    `<p>${escapeHtml(caseDescription(ship))}</p>`,
    `<dl>${facts.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`,
    ship.circumstances && `<h2>Circumstances</h2>\n${paragraphs(ship.circumstances)}`,
    ship.comments && `<h2>Updates</h2>\n${paragraphs(ship.comments)}`,
    `<p>${links.join(' · ')}</p>`,
    '</article>',
  ].filter(Boolean).join('\n');
}

// Fills in the frontend's built index.html. Each value replaces the tag's
// existing one; test/seo.test.js checks index.html still has every tag.
// Replacements are functions so a "$" in case text isn't read as a pattern.
function renderPage(template, { title, description, canonical, image, root, jsonLd }) {
  let html = template;
  const set = (pattern, tag) => { html = html.replace(pattern, () => tag); };
  if (title) {
    set(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    for (const key of ['property="og:title"', 'name="twitter:title"']) {
      set(new RegExp(`<meta ${key} content="[^"]*"`), `<meta ${key} content="${escapeHtml(title)}"`);
    }
  }
  if (description) {
    for (const key of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      set(new RegExp(`<meta ${key} content="[^"]*"`), `<meta ${key} content="${escapeHtml(description)}"`);
    }
  }
  if (canonical) {
    set(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${escapeHtml(canonical)}"`);
    set(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${escapeHtml(canonical)}"`);
  }
  if (image) {
    for (const key of ['property="og:image"', 'name="twitter:image"']) {
      set(new RegExp(`<meta ${key} content="[^"]*"`), `<meta ${key} content="${escapeHtml(image.url)}"`);
    }
    for (const key of ['property="og:image:alt"', 'name="twitter:image:alt"']) {
      set(new RegExp(`<meta ${key} content="[^"]*"`), `<meta ${key} content="${escapeHtml(image.alt)}"`);
    }
  }
  if (root) set('<div id="root"></div>', `<div id="root">${root}</div>`);
  if (jsonLd) {
    const json = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
    set('</head>', `<script type="application/ld+json">${json}</script>\n  </head>`);
  }
  return html;
}

// A share of a case shows the case's own card (ogCard.js), not the site's map.
const caseCardUrl = id => `${SITE_ORIGIN}/og/case-${id}.png`;

function casePage(template, ship) {
  return renderPage(template, {
    title: caseTitle(ship),
    description: caseDescription(ship),
    canonical: caseUrl(ship.abandonment_id),
    image: { url: caseCardUrl(ship.abandonment_id), alt: caseCardAlt(ship) },
    root: caseArticle(ship),
  });
}

// The app's views that are pages in their own right, rather than another way to
// look at the map. Each keeps its text in its React component, which search
// engines render; only the tags are filled in here. The remaining views (table,
// split) show the same cases as the map, so they stay on the home page's tags.
const VIEW_PAGES = {
  about: {
    title: `About the data and this site | ${SITE_NAME}`,
    description: 'Where the abandonment cases come from, what the ILO counts as abandoning a crew, how to read the map, who may report a case, and who built this site.',
  },
  report: {
    title: `Report a seafarer abandonment to the ILO | ${SITE_NAME}`,
    description: "The ILO's report of abandonment form, ready to fill in and email to the ILO, with who may submit one and where abandoned seafarers can get help.",
  },
  dashboard: {
    title: `Seafarer abandonment statistics | ${SITE_NAME}`,
    description: 'Charts of every reported case: how many are resolved or still open, which flags, ports and countries they cluster in, new cases per month, and what changed lately.',
  },
};

const viewUrl = view => `${SITE_ORIGIN}/?view=${view}`;

function viewPage(template, view) {
  const { title, description } = VIEW_PAGES[view];
  return renderPage(template, { title, description, canonical: viewUrl(view) });
}

// For Google Dataset Search. `modified` is when a case last changed.
function datasetJsonLd({ cases, firstYear, modified }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Abandoned Seafarers: ILO seafarer abandonment cases',
    description: `The ${cases} cases of seafarer abandonment in the ILO/IMO Joint Database on Abandonment of Seafarers${firstYear ? `, reported since ${firstYear}` : ''}, checked against it daily. Each case gives the ship's name, IMO number and flag, the port and date of abandonment, the number of seafarers, its status (unresolved, disputed, inactive or resolved), the circumstances and dated updates, with ports geocoded for the map.`,
    url: `${SITE_ORIGIN}/`,
    isBasedOn: ILO_DATABASE_URL,
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_ORIGIN}/` },
    keywords: ['seafarer abandonment', 'abandoned seafarers', 'abandoned ships', 'maritime labour', 'MLC 2006', 'ILO', 'IMO'],
    spatialCoverage: 'Worldwide',
    ...(firstYear && { temporalCoverage: `${firstYear}/..` }),
    ...(modified && { dateModified: modified }),
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE_ORIGIN}/api/ships` }],
  };
}

function homePage(template, facts) {
  return renderPage(template, { jsonLd: datasetJsonLd(facts) });
}

// `cases`: [{ abandonment_id, scraped_at }], scraped_at being the case's latest
// row, which ingest only adds when something changed.
function sitemapXml({ modified, cases }) {
  const entry = (loc, lastmod) =>
    `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}</url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry(`${SITE_ORIGIN}/`, modified),
    // No lastmod on these: they change with the app, not with the data.
    ...Object.keys(VIEW_PAGES).map(view => entry(viewUrl(view))),
    ...cases.map(c => entry(caseUrl(c.abandonment_id), c.scraped_at)),
    '</urlset>',
    '',
  ].join('\n');
}

module.exports = { caseTitle, caseDescription, casePage, viewPage, VIEW_PAGES, homePage, datasetJsonLd, sitemapXml };
