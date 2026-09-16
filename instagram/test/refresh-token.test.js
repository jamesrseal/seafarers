const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../refresh-token');
const { response, fakeFetch } = require('../../bluesky/test/helpers');

const NOW = new Date('2026-09-16T12:00:00Z');
const SIXTY_DAYS = 60 * 24 * 60 * 60;

function world(answer = response(200, { access_token: 'NEW-TOKEN', token_type: 'bearer', expires_in: SIXTY_DAYS })) {
  return fakeFetch([[url => url.includes('refresh_access_token'), () => answer]]);
}

function run(argv, { env = { INSTAGRAM_ACCESS_TOKEN: 'OLD-TOKEN' }, fake = world(), ...deps } = {}) {
  const commands = [];
  const promise = main(argv, env, {
    fetch: fake.fetch,
    log: () => {},
    now: () => NOW,
    run: (command, args, input) => { commands.push({ command, args, input }); return ''; },
    ...deps,
  });
  return { promise, fake, commands };
}

test('refreshing reports how long the new token lasts', async () => {
  const { promise } = run([]);
  const result = await promise;
  assert.equal(result.days, 60);
  assert.equal(result.wrote, false);
});

test('without --set-secret, nothing is written anywhere', async () => {
  const { promise, commands } = run([]);
  await promise;
  assert.deepEqual(commands, []);
});

test('--set-secret writes the new token through gh, on stdin rather than the command line', async () => {
  const { promise, commands } = run(['--set-secret', '--repo', 'jamesrseal/seafarers']);
  await promise;
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args, ['secret', 'set', 'INSTAGRAM_ACCESS_TOKEN', '--repo', 'jamesrseal/seafarers']);
  assert.equal(commands[0].input, 'NEW-TOKEN');
  assert.ok(!commands[0].args.includes('NEW-TOKEN'), 'the token is not an argument');
});

test('the secret name can be changed, for trying it somewhere else first', async () => {
  const { promise, commands } = run(['--set-secret', '--repo', 'a/b', '--secret', 'INSTAGRAM_TEST_TOKEN']);
  await promise;
  assert.equal(commands[0].args[2], 'INSTAGRAM_TEST_TOKEN');
});

test('writing the secret without knowing the repository is refused', async () => {
  await assert.rejects(run(['--set-secret'], { env: { INSTAGRAM_ACCESS_TOKEN: 'OLD' } }).promise, /needs the repository/);
});

test('a dead token says what has to happen, rather than retrying forever', async () => {
  const dead = world(response(400, { error: { message: 'Invalid OAuth 2.0 Access Token', code: 190 } }));
  await assert.rejects(run([], { fake: dead }).promise, /authorise the app again in a browser/);
});

test('no token at all is an error before any request', async () => {
  const fake = world();
  await assert.rejects(run([], { env: {}, fake }).promise, /INSTAGRAM_ACCESS_TOKEN must be set/);
  assert.deepEqual(fake.calls, []);
});
