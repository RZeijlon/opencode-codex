import * as accounts from '../accounts/index.js';
import type { Account, Usage, UsageWindow } from '../accounts/index.js';
import { CODEX_USAGE_ENDPOINT } from '../config.js';
import * as token from './token.js';

interface RawWindow {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_at?: number;
  reset_after_seconds?: number;
}

interface RawPayload {
  plan_type?: string;
  rate_limit?: {
    primary_window?: RawWindow | null;
    secondary_window?: RawWindow | null;
  } | null;
}

function parseWindow(
  raw: RawWindow | null | undefined,
  now: number,
): UsageWindow | undefined {
  if (!raw) return undefined;
  const usedPercent =
    typeof raw.used_percent === 'number' ? raw.used_percent : undefined;
  const seconds =
    typeof raw.limit_window_seconds === 'number'
      ? raw.limit_window_seconds
      : undefined;
  let resetAtMs: number | undefined;
  if (
    typeof raw.reset_at === 'number' &&
    Number.isFinite(raw.reset_at) &&
    raw.reset_at > 0
  ) {
    resetAtMs = raw.reset_at > 1e12 ? raw.reset_at : raw.reset_at * 1000;
  } else if (
    typeof raw.reset_after_seconds === 'number' &&
    raw.reset_after_seconds > 0
  ) {
    resetAtMs = now + raw.reset_after_seconds * 1000;
  }
  if (usedPercent == null || seconds == null || resetAtMs == null)
    return undefined;
  return { usedPercent, windowMinutes: Math.round(seconds / 60), resetAtMs };
}

export function parse(payload: unknown): Usage | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const data = payload as RawPayload;
  const now = Date.now();
  const windows: UsageWindow[] = [];
  const primary = parseWindow(data.rate_limit?.primary_window, now);
  const secondary = parseWindow(data.rate_limit?.secondary_window, now);
  if (primary) windows.push(primary);
  if (secondary) windows.push(secondary);
  if (windows.length === 0) return undefined;
  windows.sort((a, b) => a.windowMinutes - b.windowMinutes);
  return { fetchedAt: now, planType: data.plan_type, windows };
}

const inflight = new Map<string, Promise<Usage | undefined>>();

/**
 * Fetch the usage payload for a single account and persist it to the store.
 * Concurrent calls for the same account share one in-flight request.
 */
export async function fetch(account: Account): Promise<Usage | undefined> {
  const existing = inflight.get(account.id);
  if (existing) return existing;
  const promise = (async () => {
    if (!token.isFresh(account)) return undefined;
    const response = await globalThis.fetch(CODEX_USAGE_ENDPOINT, {
      headers: {
        authorization: `Bearer ${account.access}`,
        'ChatGPT-Account-Id': account.accountId ?? account.id,
        'User-Agent': 'opencode-codex/0.1',
        accept: 'application/json',
      },
    });
    if (!response.ok) return undefined;
    const usage = parse(await response.json());
    if (!usage) return undefined;
    await accounts.updateUsage(account.id, usage);
    return usage;
  })().finally(() => inflight.delete(account.id));
  inflight.set(account.id, promise);
  return promise;
}
