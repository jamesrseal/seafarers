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

// The account the token must belong to. Checked before anything is published,
// the way the Bluesky poster checks the DID it logged in as, so a token for
// some other account cannot post these cases there.
const ACCOUNT_USERNAME = 'abandonedseafarers';

// Instagram's own API, on its own host: this is the "Instagram API with
// Instagram Login" setup, which needs no Facebook Page behind the account.
//
// The version is pinned deliberately. Meta retires a version about two years
// after its release, and an unpinned call follows whatever is current, so the
// upgrade should be an edit with a test run behind it rather than a surprise.
const GRAPH_HOST = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v26.0';

// A container is the post Instagram stages before publishing. An image one is
// usually ready within seconds, and it expires unpublished after 24 hours.
const CONTAINER_POLL_MS = 5000;
const CONTAINER_POLL_ATTEMPTS = 24;

module.exports = {
  COMPOSE_MAX_GRAPHEMES,
  ACCOUNT_USERNAME,
  GRAPH_HOST,
  GRAPH_VERSION,
  CONTAINER_POLL_MS,
  CONTAINER_POLL_ATTEMPTS,
};
