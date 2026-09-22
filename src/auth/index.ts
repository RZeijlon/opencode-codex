import * as accounts from '../accounts/index.js';
import type { Account, Store } from '../accounts/types.js';
import { PROVIDER_ID } from '../config.js';
import * as file from './file.js';
import { isPerAccountKey, keyFor } from './keys.js';
import type { OauthEntry } from './types.js';

function toEntry(account: Account): OauthEntry {
  return {
    type: 'oauth',
    refresh: account.refresh,
    access: account.access,
    expires: account.expires,
    accountId: account.accountId ?? account.id,
    email: account.email,
    enterpriseUrl: account.enterpriseUrl,
  };
}

export function fingerprint(store: Store): string {
  return JSON.stringify({
    active: store.active,
    accounts: store.accounts.map((account) => ({
      id: account.id,
      accountId: account.accountId,
      email: account.email,
      access: account.access,
      refresh: account.refresh,
      expires: account.expires,
      enterpriseUrl: account.enterpriseUrl,
    })),
  });
}

/**
 * Normalize auth.json from its own OAuth entries:
 * - Keep one `openai/<login-id>` entry per Codex login.
 * - Keep `openai` as a compatibility mirror for OpenCode's provider auth.
 */
export async function sync(): Promise<void> {
  const store = await accounts.reload();
  const all = await file.read();
  const writes: Record<string, OauthEntry> = {};
  const want = new Set<string>();
  for (const account of store.accounts) {
    const k = keyFor(account);
    writes[k] = toEntry(account);
    want.add(k);
  }
  const a = accounts.active(store);
  if (a) writes[PROVIDER_ID] = toEntry(a);
  const removes: string[] = [];
  for (const k of Object.keys(all)) {
    if (k === PROVIDER_ID) continue;
    if (!isPerAccountKey(k)) continue;
    if (!want.has(k)) removes.push(k);
  }
  if (!a && PROVIDER_ID in all) removes.push(PROVIDER_ID);
  await file.bulk({ writes, removes }).catch(() => undefined);
}
