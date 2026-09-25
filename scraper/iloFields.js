// Shapes the ILO case fields the page serves as markup or packed text into the
// values the database stores. Pure: no Playwright, so its tests need no install.
//
// What is stored is this module's output, and ingest writes a history row
// whenever a stored field changes. So a change to what these functions return
// — whitespace, entity handling, entry order — rewrites every case's row on the
// next refresh. Keep the output canonical, and change it deliberately.

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// The headings the ILO uses. A heading is stored in this spelling whatever its
// case or spacing on the page, so one status never splits into two filter
// options. Anything else is kept as written.
const PAYMENT_STATUSES = ['Paid', 'Partially paid', 'Payment Pending', 'Other'];
const REPATRIATION_STATUSES = ['Repatriated', 'Repatriation pending', 'Other'];

const collapse = s => s.replace(/\s+/g, ' ').trim();

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// <br> is a line break and every other tag is dropped. Lines are trimmed, and a
// run of blank lines becomes one, which is how the ILO separates paragraphs.
function htmlToText(html) {
  const text = decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''));
  return text.split('\n').map(line => collapse(line)).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "Azerbaijan (11); Russian Federation (1); Türkiye (1)". Only a trailing
// "(digits)" is a head count, so "Iran (Islamic Republic of) (12)" keeps its
// name and "Bolivia (Plurinational State of)" has no count.
function parseNationalities(text) {
  if (!text) return [];
  return text.split(';').map(collapse).filter(Boolean).map(part => {
    const m = part.match(/^(.*?)\s*\((\d+)\)$/);
    return m && m[1] ? { country: m[1], count: Number(m[2]) } : { country: part, count: null };
  });
}

// "8 October 2025: Paid", "October 2004: Repatriated", "2004: Other".
const HEADING_DATE = /^(?:(?:(\d{1,2})\s+)?([a-z]+)\s+)?(\d{4})\s*:\s*(.*)$/i;

// Splits a heading into its date and its status. The date is kept as written
// (dateText) and as a partial ISO date — "2025-10-08", "2004-10" or "2004" —
// which sorts correctly as a string: a month-only date sorts before the days
// of that month, as it would at day 0.
function splitHeading(heading) {
  const m = heading.match(HEADING_DATE);
  const month = m && m[2] ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || (m[2] && month === -1)) return { date: null, dateText: null, status: heading };
  const parts = [m[3]];
  if (month !== -1) parts.push(String(month + 1).padStart(2, '0'));
  if (m[1]) parts.push(m[1].padStart(2, '0'));
  const dateText = heading.slice(0, heading.indexOf(':')).trim();
  return { date: parts.join('-'), dateText, status: m[4].trim() };
}

// Payment status, repatriation status and actions taken are each a list of
// entries in the page's markup:
//   <strong>4 April 2024: Payment Pending<br></strong>US$58,860<br><br>
//   <strong>21 June 2024: Paid<br></strong>Seafarers have received…<br><br>
// The markup is often malformed — a <strong> left open, or opened again before
// it closes — so an entry is found by where each <strong> begins, and its
// heading runs to the first </strong> or <br>.
//
// Entries come back newest first. The ILO lists them in either order, so they
// are sorted by date. Where dates tie or are missing, the later entry in the
// list counts as newer, as most lists run oldest first. Undated entries go last
// wherever they appear: in the lists that mix the two, the undated entry is
// the case's opening status.
function parseEntries(html) {
  if (!html || !html.trim()) return [];
  const chunks = html.split(/<strong\b[^>]*>/i);
  const entries = [];
  chunks.forEach((chunk, i) => {
    let heading;
    let rest;
    if (i === 0) {
      // Text before the first <strong>: a first line is its heading, if any.
      const text = htmlToText(chunk);
      if (!text) return;
      const lines = text.split('\n');
      heading = lines[0];
      rest = lines.slice(1).join('\n').trim();
    } else {
      const end = chunk.search(/<\/strong>|<br\s*\/?>/i);
      heading = htmlToText(end === -1 ? chunk : chunk.slice(0, end));
      rest = end === -1 ? '' : htmlToText(chunk.slice(end));
    }
    heading = collapse(heading);
    if (!heading && !rest) return;
    entries.push({ ...splitHeading(heading), detail: rest, order: i });
  });
  entries.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (!a.date !== !b.date) return a.date ? -1 : 1;
    return b.order - a.order;
  });
  return entries.map(({ date, dateText, status, detail }) => ({ date, dateText, status, detail }));
}

// The newest entry's heading, in the ILO's spelling where it is one of theirs.
function latestStatus(entries, vocabulary) {
  const status = entries.length ? collapse(entries[0].status) : '';
  return vocabulary.find(v => v.toLowerCase() === status.toLowerCase()) || status;
}

// The page's raw values, as extractApexFields reads them, to the stored fields.
// A null value — no such element on the page — is a blank field: the ILO's page
// leaves an empty field out altogether rather than rendering it empty. A field
// the ILO renamed would look the same, blank on every case, and the sanity
// guard's fill-rate check (MONITORED_FIELDS in scrape.js) stops that run.
function iloCaseFields(raw) {
  const text = value => collapse(value ?? '');
  const list = value => (value.length ? JSON.stringify(value) : '');
  const payment = parseEntries(raw.payment);
  const repatriation = parseEntries(raw.repatriation);
  return {
    vessel_type: text(raw.vessel_type),
    financial_security_provider: text(raw.financial_security_provider),
    nationalities: list(parseNationalities(raw.nationalities)),
    payment_status: list(payment),
    payment_latest: latestStatus(payment, PAYMENT_STATUSES),
    repatriation_status: list(repatriation),
    repatriation_latest: latestStatus(repatriation, REPATRIATION_STATUSES),
    actions_taken: list(parseEntries(raw.actions)),
  };
}

module.exports = {
  PAYMENT_STATUSES,
  REPATRIATION_STATUSES,
  parseNationalities,
  parseEntries,
  latestStatus,
  iloCaseFields,
};
