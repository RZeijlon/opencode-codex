import type { Account } from '../accounts/types.js';
import { PROVIDER_ID } from '../config.js';

export const PER_ACCOUNT_PREFIX = `${PROVIDER_ID}/`;
export const LEGACY_PAREN_PREFIX = 'OpenAI ('; // earlier format: "OpenAI (email)"

export function keyFor(account: Pick<Account, 'id'>): string {
  return `${PER_ACCOUNT_PREFIX}${account.id}`;
}

export function isPerAccountKey(key: string): boolean {
  return (
    key.startsWith(PER_ACCOUNT_PREFIX) || key.startsWith(LEGACY_PAREN_PREFIX)
  );
}

export function labelFromKey(key: string): string | undefined {
  if (key.startsWith(PER_ACCOUNT_PREFIX)) return key.slice(PER_ACCOUNT_PREFIX.length);
  if (key.startsWith(LEGACY_PAREN_PREFIX) && key.endsWith(')')) {
    return key.slice(LEGACY_PAREN_PREFIX.length, -1);
  }
  return undefined;
}
