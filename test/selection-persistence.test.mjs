import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const dataHome = await mkdtemp(path.join(os.tmpdir(), 'opencode-codex-test-'));
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

const accounts = await import('../dist/accounts/index.js');
const { create } = await import('../dist/codex/fetch.js');

test('a request uses an account selected by another process', async () => {
  const authPath = path.join(dataHome, 'opencode', 'auth.json');
  await mkdir(path.dirname(authPath), { recursive: true });
  const entry = (id) => ({
    type: 'oauth',
    access: `token-${id}`,
    refresh: `refresh-${id}`,
    expires: Date.now() + 600_000,
    accountId: id,
  });
  const first = entry('first');
  const second = entry('second');
  const saved = {
    'openai/first': first,
    'openai/second': second,
    openai: first,
  };
  await writeFile(authPath, JSON.stringify(saved), { mode: 0o600 });
  assert.equal((await accounts.load()).active, 'first');

  saved.openai = second;
  await writeFile(authPath, JSON.stringify(saved), { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  let authorization;
  try {
    globalThis.fetch = async (_url, init) => {
      authorization = new Headers(init.headers).get('authorization');
      return new Response(null, { status: 200 });
    };
    await create()('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: '{}',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(authorization, 'Bearer token-second');
  assert.equal((await accounts.reload()).active, 'second');
  await accounts.activate('first');
  const persisted = JSON.parse(await readFile(authPath, 'utf8'));
  assert.equal(persisted.openai.accountId, 'first');
});
