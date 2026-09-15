// Which ILO sentences a post may quote. Every rule here errs towards leaving a
// sentence out: a post with no quote is still true, a post with the wrong one
// is not something the account can take back once it has been reshared.
// Before and after changing a rule, run `npm run check-all -- --sample 20`
// against the real database and read what comes out.

const { splitSentences } = require('./sentences');
const { graphemeLength } = require('./text');
const { QUOTE_MAX_GRAPHEMES } = require('./config');

// One identifiable person: "one seafarer", "the 2nd officer", "he".
const ONE_PERSON = /\b(?:one (?:of the )?(?:crew|seafarers?)(?: members?)?|a seafarer|the seafarer|seafarer|crew member|master|captain|officer|engineer|cook|bosun|oiler|he|she|his|her|him)\b/i;
const CLINICAL = /\b(?:symptoms?|infection|diagnos\w*|haemorrhoids|hemorrhoids)\b/i;
const MEDICAL = /\b(?:medical|dental|surgery|illness|ill|sick|disease|injur\w*|hospital\w*|pain|treatment)\b/i;

const SENTENCE_RULES = [
  // Privacy. The ILO redacts people with "***"; a sentence it had to redact is
  // about a specific person, and reposting it carries it beyond the ILO's own
  // context, to where a crewing agent can read it.
  ['redaction', /\*/],
  ['email address', /@/],
  ['web address', /https?:\/\/|www\./i],
  ['phone number', /\+?\d[\d ().-]{7,}\d/],
  ['named person', /\b(?:Mr|Mrs|Ms|Miss|Dr|Capt|Captain)\b\.?\s+[\p{Lu}*]/u],
  // A death, or one crew member's health, is not for a bot to announce in a
  // sentence lifted out of its record ("1 seafarer committed suicide on board.",
  // "One of the crew has a serious case of Haemorrhoids…"). The case is still
  // posted, and the ILO link carries the full record. Crew-wide welfare ("Some
  // crew in need of medical assistance") stays quotable.
  ['death or self-harm', /\b(?:suicide|died|dies|death|deaths|deceased|killed|murder\w*|dead body|bodies|passed away)\b/i],
  ['medical detail', s => CLINICAL.test(s) || (MEDICAL.test(s) && ONE_PERSON.test(s))],
  // Voice. Posted by the account, "they are afraid to talk to us" reads as the
  // account speaking, and first-person text is usually a seafarer's own letter.
  // The lookarounds keep the "I" in "P&I" from counting.
  ['first person', /(?<![\w&/-])(?:I|me|my|mine|we|us|our|ours|We|Us|Our|Ours|My|Me|Mine)(?![\w&/-])/],
  ['second person', /\b(?:you|your|yours|You|Your|Yours)\b/],
  ['salutation', /^(?:Dear|Regards|Sincerely|Thank|Thanks|Best regards|Kind regards)\b/i],
  // Correspondence about the database rather than what happened to the crew.
  ['boilerplate', /duly noted|well received|received and processed|IMO\/ILO|ILO\/IMO|joint database|please find|attached|kindly|this is to inform|notification date|\(ILO,|this declaration|is concluded/i],
  // "From Finlay McIntosh, Inspectorate Coordination Supervisor", "From Panama
  // Maritime Authority": who sent a note, which names officials and says
  // nothing about the crew. "From December 2009 the company…" is narrative.
  ['attribution line', /^\(?(?:From|from|By|by)\s+(?:the\s+)?(?!(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)\p{Lu}|^Information (?:given|provided|received) by\b/u],
  // "…it should be displayed as 'Togo False'", "IMO Number 7938933 on IMO
  // GISIS", "…will be recorded under Abandonment ID 01725": housekeeping on the
  // database, which can contradict the fields the post is built from.
  ['record correction', /originally reported|initially reported|initially recorded|as a general practice|should be displayed|should be (?:changed|corrected|amended|updated)|correct IMO number|reported as ['‘"]|will be recorded|abandonment ID|\bGISIS\b|\bEquasis\b/i],
  ['correspondence', /\be-?mails?\b|\bcorrespondence\b|\bthe mail\b|\bletters? (?:dated|from|issued)\b|not in a format|consulted on request/i],
  ['insurance detail', /insur(?:er|ance|ed)|P&I|financial security/i],
  // Shipping shorthand for a vessel no longer trading, which a reader outside
  // the industry takes to mean people died.
  ['misreadable jargon', /\bvessel is (?:now |not )?dead\b/i],
  // A post states status with the site's label and nowhere else, and a
  // sentence saying there is nothing to say is not worth quoting.
  ['status restatement', /^(?:resolved|disputed|unresolved|inactive|closed)\W*$|^(?:the |this )?case (?:has been |is |was )?(?:now )?(?:resolved|closed|disputed|inactive)|\bclassed as (?:resolved|closed)\b|^no further (?:updates?|updated|information|info)\b|^no comments? received\b/i],
];

const count = (text, ch) => text.split(ch).length - 1;
const MINOR_WORDS = /^(?:and|of|the|for|to|in|on|at|de|du|la|y|&)$/i;

function shapeProblem(sentence) {
  if (graphemeLength(sentence) > QUOTE_MAX_GRAPHEMES) return 'too long';
  if (/:$/.test(sentence)) return 'ends with a colon';
  // "Update 06/05: Vessel arrested 17/07/03.", "No. of Seafarers: 4 (…)",
  // "IMO No. : N/A": a label, not a sentence.
  if (/^(?:\S+\s+){0,3}\S*\s?:/.test(sentence)) return 'labelled note';
  if (!/^[\p{Lu}\p{N}"'(\[]/u.test(sentence)) return 'starts mid-thought';
  if (sentence.split(/\s+/).filter(Boolean).length < 3) return 'too short';
  // The post wraps quotes in curly marks, and nesting them makes the post's own
  // quotation marks ambiguous (and the verifier's check of them unreliable).
  if (/[“”]/.test(sentence)) return 'nested quotation marks';
  if (count(sentence, '(') !== count(sentence, ')') || count(sentence, '[') !== count(sentence, ']')) return 'unbalanced brackets';
  if (count(sentence, '"') % 2) return 'unbalanced quotation marks';
  // "ships¿ mobiles": text mangled on its way into the database.
  if (/[¿�]/.test(sentence)) return 'garbled text';
  const letters = sentence.match(/\p{L}/gu) || [];
  const capitals = sentence.match(/\p{Lu}/gu) || [];
  if (letters.length >= 8 && capitals.length / letters.length > 0.6) return 'written in capitals';
  return null;
}

// "St. Kitts and Nevis International Ship Registry": a name standing alone.
// Checked last, so a line the rules above explain reports their reason.
function isHeading(sentence) {
  const significant = sentence.split(/\s+/).filter(w => w && !MINOR_WORDS.test(w));
  return !/[.!?]$/.test(sentence) && significant.length >= 3 && significant.every(w => /^[\p{Lu}\p{N}(]/u.test(w));
}

// null if the sentence may be quoted, otherwise the reason it may not.
function rejectSentence(sentence) {
  const shape = shapeProblem(sentence);
  if (shape) return shape;
  for (const [reason, test] of SENTENCE_RULES) {
    if (typeof test === 'function' ? test(sentence) : test.test(sentence)) return reason;
  }
  if (isHeading(sentence)) return 'heading';
  return null;
}

// A relayed letter ("(From the Palau Ship Registry)", "(From the seafarer
// requesting for the assistance)") is formal correspondence or a seafarer's own
// words; neither is quoted, even where one of its sentences would pass.
function rejectUpdate(update) {
  if (update.rawLines.some(line => /^\s*\(From\b/i.test(line))) return 'relayed letter';
  if (update.rawLines.some(line => /^\s*Dear\b/i.test(line))) return 'letter';
  if (!update.lines.length) return 'no text';
  return null;
}

// Quotable text from a list of lines: for each line, the run of acceptable
// sentences from its START (stopping at the first that isn't), offered longest
// first. Quotes never begin mid-paragraph, where "His contract is expired."
// would not say whose.
function quoteCandidates(lines) {
  const candidates = [];
  const seen = new Set();
  lines.forEach((line, lineIndex) => {
    const run = [];
    for (const sentence of splitSentences(line)) {
      if (rejectSentence(sentence.text)) break;
      run.push(sentence);
    }
    for (let k = run.length; k >= 1; k--) {
      const text = line.slice(run[0].start, run[k - 1].end);
      const graphemes = graphemeLength(text);
      if (graphemes > QUOTE_MAX_GRAPHEMES || seen.has(text)) continue;
      seen.add(text);
      candidates.push({ text, lineIndex, sentences: k, graphemes });
    }
  });
  return candidates;
}

module.exports = { rejectSentence, rejectUpdate, quoteCandidates };
