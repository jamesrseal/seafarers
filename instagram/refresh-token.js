#!/usr/bin/env node
/**
 * Keeps the Instagram token alive.
 *
 * A long-lived token lasts 60 days and can be refreshed as often as you like,
 * but only while it is still alive and at least 24 hours old. Miss the window
 * and it is dead for good: every call answers error 190 and someone has to
 * authorise the app again in a browser. Nothing breaks until then, which is
 * why this runs monthly rather than on the day a post fails.
 *
 * Usage:
 *   node refresh-token.js                 refresh and report how long the new one lasts
 *   node refresh-token.js --set-secret    also write it back to the repository secret
 *
 * Flags:
 *   --repo OWNER/NAME   which repository's secret to set (default GITHUB_REPOSITORY)
 *   --secret NAME       the secret to set (default INSTAGRAM_ACCESS_TOKEN)
 *   --summary FILE      append a Markdown summary (GitHub's $GITHUB_STEP_SUMMARY)
 *
 * Environment:
 *   INSTAGRAM_ACCESS_TOKEN   the token to refresh
 *   GH_TOKEN                 a token that may write secrets, for --set-secret.
 *                            GITHUB_TOKEN cannot: there is no secrets scope.
 *
 * The new token is written to the secret through gh's stdin, so it never
 * appears in a command line or in the log.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const { createClient } = require('./src/instagram');

const SECRET_NAME = 'INSTAGRAM_ACCESS_TOKEN';
const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const opts = { setSecret: false, repo: process.env.GITHUB_REPOSITORY || null, secret: SECRET_NAME, summary: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case '--set-secret': opts.setSecret = true; break;
      case '--repo': opts.repo = value(); break;
      case '--secret': opts.secret = value(); break;
      case '--summary': opts.summary = value(); break;
      default: throw new Error(`unknown argument ${arg}`);
    }
  }
  return opts;
}

function defaultRun(command, args, input) {
  return execFileSync(command, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

// gh reads the value from stdin when --body is left off, which keeps the token
// out of the process list and out of the run log.
function setSecret(token, { repo, secret, run }) {
  if (!repo) throw new Error('writing the secret needs the repository, as owner/name');
  run('gh', ['secret', 'set', secret, '--repo', repo], token);
}

async function main(argv, env = process.env, deps = {}) {
  const { fetch = globalThis.fetch, log = console.log, run = defaultRun, now = () => new Date() } = deps;
  const opts = parseArgs(argv);
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error('INSTAGRAM_ACCESS_TOKEN must be set');

  const api = createClient({ fetch, log, token });
  let refreshed;
  try {
    refreshed = await api.refreshToken();
  } catch (err) {
    if (err.isExpiredToken) {
      throw new Error('Instagram rejected the token (error 190). A refresh cannot revive it: '
        + 'authorise the app again in a browser and put the new long-lived token in the '
        + `${opts.secret} secret.`);
    }
    throw err;
  }

  const expires = new Date(now().getTime() + (refreshed.expires_in ?? 0) * 1000);
  const days = Math.round((expires - now()) / DAY_MS);
  log(`Token refreshed; the new one lasts ${days} day(s), until ${expires.toISOString().slice(0, 10)}.`);

  if (opts.setSecret) {
    setSecret(refreshed.access_token, { repo: opts.repo, secret: opts.secret, run });
    log(`Written to the ${opts.secret} secret on ${opts.repo}.`);
  } else {
    log('Not written anywhere: pass --set-secret to update the repository secret.');
  }

  if (opts.summary) {
    fs.appendFileSync(opts.summary, `## Instagram token refreshed\n\n`
      + `Good for another ${days} day(s), until ${expires.toISOString().slice(0, 10)}.`
      + `${opts.setSecret ? ` Written to the \`${opts.secret}\` secret.` : ' Not written anywhere.'}\n\n`);
  }

  return { status: 'refreshed', exitCode: 0, days, expires, wrote: opts.setSecret };
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    result => { process.exitCode = result.exitCode; },
    err => { console.error(`\n${err.message}`); process.exitCode = 1; },
  );
}

module.exports = { main, parseArgs, setSecret, SECRET_NAME };
