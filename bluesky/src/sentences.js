// Splits one line of ILO text into sentences, keeping offsets so every sentence
// (and every run of them) is an exact slice of the source. When unsure it does
// NOT split: a missed boundary only makes a quote longer, and it stays verbatim.

// Words that end in a period without ending the sentence. Case-sensitive, so
// "IMO No. 9134361" holds together while a sentence ending "…said no." splits.
const ABBREVIATIONS = new Set([
  'No', 'Nos', 'Mr', 'Mrs', 'Ms', 'Dr', 'Capt', 'Co', 'Ltd', 'Inc', 'St', 'Jr', 'Sr',
  'approx', 'Approx', 'etc', 'vs', 'Pvt', 'Corp', 'Govt', 'Ref', 'Tel', 'Messrs', 'Rs', 'Mt',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
]);

const TERMINATORS = '.!?';
const CLOSERS = `"'”’)]`;
// "2 Indian Officers have…" starts a sentence, so digits count as a start.
const SENTENCE_START = /[\p{Lu}\p{N}"“‘'(\[]/u;

function endsInAbbreviation(before) {
  const token = (before.match(/(\S+)$/) || ['', ''])[1].replace(/^[("“‘'\[]+/, '');
  if (ABBREVIATIONS.has(token)) return true;
  if (/^\p{Lu}$/u.test(token)) return true; // an initial: "J. Smith"
  if (/^(?:\p{L}\.)+\p{L}$/u.test(token)) return true; // "U.S", "M.V", "e.g"
  return false;
}

function splitSentences(line) {
  const sentences = [];
  const push = (from, to) => {
    let start = from;
    let end = to;
    while (start < end && /\s/.test(line[start])) start++;
    while (end > start && /\s/.test(line[end - 1])) end--;
    if (end > start) sentences.push({ text: line.slice(start, end), start, end });
  };

  let sentenceStart = 0;
  let depth = 0; // brackets: "(Crew said. Owner left.)" is one sentence
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') { depth = Math.max(0, depth - 1); continue; }
    if (!TERMINATORS.includes(c) || depth > 0) continue;

    let j = i + 1;
    while (j < line.length && TERMINATORS.includes(line[j])) j++;
    while (j < line.length && CLOSERS.includes(line[j])) j++;
    if (j >= line.length) break;
    if (!/\s/.test(line[j])) continue; // "1.5", "U.S.A", "No.5"
    let k = j;
    while (k < line.length && /\s/.test(line[k])) k++;
    if (k >= line.length || !SENTENCE_START.test(line[k])) continue;
    if (c === '.' && endsInAbbreviation(line.slice(0, i))) continue;

    push(sentenceStart, j);
    sentenceStart = k;
    i = k - 1;
  }
  push(sentenceStart, line.length);
  return sentences;
}

module.exports = { splitSentences };
