import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const dataHome = await mkdtemp(
  path.join(os.tmpdir(), 'opencode-codex-test-'),
);
const previousDataHome = process.env.XDG_DATA_HOME;
const previousTrace = process.env.OPENCODE_CODEX_TRACE;
process.env.XDG_DATA_HOME = dataHome;
process.env.OPENCODE_CODEX_TRACE = '0';
after(async () => {
  if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = previousDataHome;
  if (previousTrace === undefined) delete process.env.OPENCODE_CODEX_TRACE;
  else process.env.OPENCODE_CODEX_TRACE = previousTrace;
  await rm(dataHome, { recursive: true, force: true });
});

const { read, write } = await import('../dist/accounts/storage.js');
const accounts = await import('../dist/accounts/index.js');
const { create } = await import('../dist/codex/fetch.js');
const { loginId } = await import('../dist/oauth/jwt.js');

function accessToken(accountId, subject, email) {
  const claims = {
    sub: subject,
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
    'https://api.openai.com/profile': { email },
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

function entry(accountId, subject, email) {
  return {
    type: 'oauth',
    access: accessToken(accountId, subject, email),
    refresh: 'fixture',
    expires: Date.now() + 600_000,
    accountId,
  };
}

test('keeps Business users and a personal account with one shared email', async () => {
  const authPath = path.join(dataHome, 'opencode', 'auth.json');
  await mkdir(path.dirname(authPath), { recursive: true });
  const businessA = entry(
    'business-workspace',
    'user-a',
    'shared@example.test',
  );
  const businessB = entry(
    'business-workspace',
    'user-b',
    'other@example.test',
  );
  await writeFile(
    authPath,
    JSON.stringify({
      'openai/shared@example.test': businessA,
      'openai/other@example.test': businessB,
      openai: businessA,
    }),
    { mode: 0o600 },
  );

  const store = await read();
  assert.equal(store.accounts.length, 2);
  assert.equal(new Set(store.accounts.map((account) => account.id)).size, 2);
  assert.equal(store.active, loginId('business-workspace', 'user-a'));
  assert.deepEqual(store.accounts.map((account) => account.accountId), [
    'business-workspace',
    'business-workspace',
  ]);

  const personal = entry('personal-workspace', 'user-a', 'shared@example.test');
  store.accounts.push({
    id: loginId(personal.accountId, 'user-a'),
    accountId: personal.accountId,
    email: 'shared@example.test',
    access: personal.access,
    refresh: personal.refresh,
    expires: personal.expires,
    addedAt: Date.now(),
  });
  await write(store);

  const reloaded = await read();
  assert.equal(reloaded.accounts.length, 3);
  assert.equal(new Set(reloaded.accounts.map((account) => account.id)).size, 3);
  const sharedEmail = reloaded.accounts.filter(
    (account) => account.email === 'shared@example.test',
  );
  assert.equal(sharedEmail.length, 2);
  assert.equal(reloaded.active, store.active);

  const saved = JSON.parse(await readFile(authPath, 'utf8'));
  assert.equal(
    Object.keys(saved).filter((key) => key.startsWith('openai/')).length,
    3,
  );
  assert.equal(saved.openai.accountId, 'business-workspace');

  await accounts.reload();
  const originalFetch = globalThis.fetch;
  let requestHeaders;
  try {
    globalThis.fetch = async (_url, init) => {
      requestHeaders = new Headers(init.headers);
      return new Response(null, { status: 200 });
    };
    await create()('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: '{}',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestHeaders.get('ChatGPT-Account-Id'), 'business-workspace');
  assert.equal(
    requestHeaders.get('authorization'),
    `Bearer ${businessA.access}`,
  );
});
