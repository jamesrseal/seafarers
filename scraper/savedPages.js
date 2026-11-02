// Works out which case each saved ILO page was asked for, before any is opened.
// Pure, so `npm test` needs neither Playwright nor the database.
//
// Chrome names a saved page after its title ("Armony - United Republic of
// Tanzania - 1 April 2026.mhtml") and writes the address it was saved from at
// the top of the .mhtml. That address is the case asked for, and the page's own
// Abandonment ID is the case it shows. import-pages.js compares the two, because
// an ID with no case can show the last case opened in that session.

const SAVED_PAGE  = /\.(mhtml|mht|html?)$/i;
const NAMED_BY_ID = /^(\d+)\.(mhtml|mht|html?)$/i;

// The ILO writes IDs with leading zeros (01847) on the page. Compared as numbers,
// kept as the plain string the database stores.
const plainId = raw => String(Number(raw));

function idFromAddress(head) {
  const address = head.match(/^Snapshot-Content-Location:\s*(\S+)/im);
  const id = address && address[1].match(/[?&]p3_abandonment_id=(\d+)/i);
  return id ? plainId(id[1]) : null;
}

function askedId({ name, head }) {
  const named = name.match(NAMED_BY_ID);
  const fromName = named && plainId(named[1]);
  const fromAddress = idFromAddress(head);
  if (fromName && fromAddress && fromName !== fromAddress) {
    throw new Error(`${name}: named for case ${fromName}, but saved from the address of case ${fromAddress}`);
  }
  const id = fromAddress || fromName;
  if (!id) {
    throw new Error(`${name}: can't tell which case this is: no case ID in the address it was saved from, or in its name`);
  }
  return id;
}

// `pages` is [{ name, head }], head being the start of the file. Returns
// [{ name, id }] in ID order. Two files for one case are refused rather than one
// quietly winning: they may have been saved at different times.
function identifyPages(pages) {
  const files = pages
    .map(page => ({ name: page.name, id: askedId(page) }))
    .sort((a, b) => a.id - b.id);
  files.forEach((file, i) => {
    if (i > 0 && files[i - 1].id === file.id) {
      throw new Error(`${files[i - 1].name} and ${file.name} are both case ${file.id}`);
    }
  });
  return files;
}

module.exports = { SAVED_PAGE, identifyPages };
