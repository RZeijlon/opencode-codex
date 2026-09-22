import { promises as fs } from 'node:fs';
import { PROVIDER_ID } from '../config.js';
import * as authFile from '../auth/file.js';
import { isPerAccountKey, keyFor, labelFromKey } from '../auth/keys.js';
import type { Entry, OauthEntry } from '../auth/types.js';
import { identify, loginId } from '../oauth/jwt.js';
import type { Account, Store } from './types.js';

const EMPTY: Store = { version: 1, accounts: [] };

export function empty(): Store {
  return structuredClone(EMPTY);
}

export function file(): string {
  return authFile.authJsonPath();
}

function idFor(entry: OauthEntry): string {
  const identity = identify({ access_token: entry.access });
  const accountId =
    entry.accountId ??
    identity.id ??
    `imported-${entry.access.slice(-12).replace(/[^a-zA-Z0-9]/g, '')}`;
  return loginId(accountId, identity.subject);
}

function accountFromEntry(key: string, entry: OauthEntry): Account {
  const label = labelFromKey(key);
  const identity = identify({ access_token: entry.access });
  const id = idFor(entry);
  return {
    id,
    accountId: entry.accountId ?? identity.id,
    email:
      entry.email ??
      identity.email ??
      (label?.includes('@') ? label : undefined),
    label: label && label !== id && !label.includes('@') ? label : undefined,
    refresh: entry.refresh,
    access: entry.access,
    expires: entry.expires,
    enterpriseUrl: entry.enterpriseUrl,
    addedAt: 0,
  };
}

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

function oauth(entry: Entry | undefined): OauthEntry | undefined {
  return entry?.type === 'oauth' ? (entry as OauthEntry) : undefined;
}

export async function read(): Promise<Store> {
  const all = await authFile.read();
  const byID = new Map<string, Account>();
  for (const [key, entry] of Object.entries(all)) {
    const e = oauth(entry);
    if (!e || !isPerAccountKey(key)) continue;
    const account = accountFromEntry(key, e);
    byID.set(account.id, { ...byID.get(account.id), ...account });
  }

  const canonical = oauth(all[PROVIDER_ID]);
  let active = canonical ? idFor(canonical) : undefined;
  if (canonical && byID.size === 0) {
    const account = accountFromEntry(PROVIDER_ID, canonical);
    byID.set(account.id, account);
  }
  if (active && !byID.has(active)) active = undefined;
  return { version: 1, active, accounts: Array.from(byID.values()) };
}

export async function write(store: Store): Promise<number | undefined> {
  const all = await authFile.read();
  const writes: Record<string, OauthEntry> = {};
  const wanted = new Set<string>();

  for (const account of store.accounts) {
    const key = keyFor(account);
    writes[key] = toEntry(account);
    wanted.add(key);
  }

  const active = store.active
    ? store.accounts.find((account) => account.id === store.active)
    : store.accounts[0];
  if (active) writes[PROVIDER_ID] = toEntry(active);

  const removes: string[] = [];
  for (const key of Object.keys(all)) {
    if (key === PROVIDER_ID) {
      if (!active) removes.push(key);
      continue;
    }
    if (isPerAccountKey(key) && !wanted.has(key)) removes.push(key);
  }

  await authFile.bulk({ writes, removes });
  try {
    return (await fs.stat(file())).mtimeMs;
  } catch {
    return undefined;
  }
}
