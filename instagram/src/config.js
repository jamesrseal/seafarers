// How much of a case the Instagram post carries.
//
// A Bluesky post fits 300 graphemes, and on a long case that means dropping the
// flag first, then a quote. Instagram's caption holds 2,200 characters, so the
// same composer is given a larger budget here and the flag and both quotes
// survive where Bluesky had to choose between them.
//
// It is not the caption's 2,200: the card is a fixed 1080x1350, and this is
// what its layout holds without shrinking the type past reading size. The
// caption is the same text, so one budget governs both.
const COMPOSE_MAX_GRAPHEMES = 700;

module.exports = { COMPOSE_MAX_GRAPHEMES };
