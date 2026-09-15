// Structure of the ILO free text, ported from ShipDetail.jsx's parseCircumstances
// and parseComments (the frontend is ESM/React, so it can't be required here).

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// A dated update header, anchored to the START of a line:
//   "15 June 2025: International Transport Workers' Federation"
// ShipDetail.jsx and the scraper match the date anywhere, which also catches
// prose such as "…on IMO GISIS before 1 January 2022: Comoros" (79 cases).
// Harmless on the site; here it would cut an update in two and put the wrong
// date on a "Latest update" quote.
const UPDATE_HEADER = /(^|\n)[ \t]*(\d{1,2})[ \t]+(January|February|March|April|May|June|July|August|September|October|November|December)[ \t]+(\d{4})[ \t]*:/gi;

// "Seafarers applied to insurer?: No", "Insurance certificate dates: TBC",
// "P&I/Financial security insurer: Shipowners' Club (reported by the ITF)".
// Wider than ShipDetail.jsx's pattern, which misses the "&" and "/" labels.
const FIELD_LINE = /^[A-Za-z][A-Za-z&/()' -]{0,60}\??\s*:(?:\s|$)/;
const YES_NO_LINE = /^[A-Za-z][A-Za-z&/()' -]{0,60}\?\s*(?:Yes|No)\b/i;

function isFieldLine(line) {
  return FIELD_LINE.test(line) || YES_NO_LINE.test(line);
}

function splitLines(text) {
  return String(text ?? '').split(/\r?\n/);
}

// Trimmed lines of prose, with "Label: value" field lines removed.
function narrativeLines(rawLines) {
  const out = [];
  let afterField = false;
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) { afterField = false; continue; }
    if (isFieldLine(line)) { afterField = true; continue; }
    // An indented line straight after a field is the rest of that field's value:
    //   "Insurance certificate dates: 10/02/26 MLC REGULATION 2.5
    //                                     Nu. 20250579 VALID TO 10/02/26"
    if (afterField && /^\s/.test(raw)) continue;
    afterField = false;
    out.push(line);
  }
  return out;
}

function circumstanceLines(circumstances) {
  return narrativeLines(splitLines(circumstances));
}

// Dated updates, newest first. The rest of the header line is the author
// ("Other", "Panama", …) and is never quoted.
function parseUpdates(comments) {
  const text = String(comments ?? '');
  const headers = [...text.matchAll(UPDATE_HEADER)];
  const updates = headers.map((m, i) => {
    const bodyStart = m.index + m[0].length;
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const body = text.slice(bodyStart, bodyEnd);
    const [authorLine, ...rawLines] = splitLines(body);
    return {
      dateLabel: `${m[2]} ${m[3]} ${m[4]}`,
      ts: Date.UTC(Number(m[4]), MONTHS.indexOf(m[3].toLowerCase()), Number(m[2])),
      order: i,
      author: authorLine.trim(),
      rawLines,
      lines: narrativeLines(rawLines),
      body,
    };
  });
  return updates.sort((a, b) => b.ts - a.ts || a.order - b.order);
}

function latestUpdate(comments) {
  return parseUpdates(comments)[0] || null;
}

module.exports = { MONTHS, isFieldLine, narrativeLines, circumstanceLines, parseUpdates, latestUpdate };
