import type { Account } from '../accounts/index.js';
import { planType } from '../oauth/jwt.js';

/**
 * Build a progress bar split into filled/empty halves. The caller renders
 * them with different fg colors to produce a two-tone bar.
 */
export function bar(
  percentRemaining: number,
  width: number,
): { filled: string; empty: string } {
  const p = Math.max(0, Math.min(100, Math.round(percentRemaining)));
  const filled = Math.round((p / 100) * width);
  return { filled: '━'.repeat(filled), empty: '━'.repeat(width - filled) };
}

/** Short label for a window — "5h" for the 5-hour primary, "weekly" for the secondary. */
export function label(minutes: number): string {
  if (minutes <= 60 * 12) return `${Math.round(minutes / 60)}h`;
  return 'weekly';
}

/** Human countdown to a reset time ("3h", "5d", "47m", "reset"). */
export function countdown(resetAtMs: number, now = Date.now()): string {
  const diffMs = resetAtMs - now;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'reset';
  const minutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes % 60}m`;
}

/** Convert a raw `used_percent` (0-100) into clamped "left percent". */
export function left(usedPercent: number | undefined): number | undefined {
  if (typeof usedPercent !== 'number') return undefined;
  return Math.max(0, Math.min(100, 100 - usedPercent));
}

/**
 * Aggregate windows across multiple accounts into average left-percent per
 * window size. Skips accounts that haven't been fetched yet.
 */
export function aggregate(
  accounts: Account[],
): Array<{ windowMinutes: number; remaining: number }> {
  const byMinutes = new Map<number, { totalLeft: number; count: number }>();
  for (const account of accounts) {
    for (const w of account.usage?.windows ?? []) {
      const remaining = left(w.usedPercent);
      if (remaining == null) continue;
      const entry = byMinutes.get(w.windowMinutes) ?? {
        totalLeft: 0,
        count: 0,
      };
      entry.totalLeft += remaining;
      entry.count += 1;
      byMinutes.set(w.windowMinutes, entry);
    }
  }
  return [...byMinutes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([windowMinutes, entry]) => ({
      windowMinutes,
      remaining: entry.totalLeft / entry.count,
    }));
}

/** Friendly plan name, available from the saved token before usage loads. */
export function plan(account: Account | undefined): string | undefined {
  const raw = account?.usage?.planType ??
    (account?.access ? planType(account.access) : undefined);
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === 'pro') return 'Personal Pro';
  if (lower === 'plus') return 'Personal Plus';
  if (lower === 'team' || lower === 'business') return 'Business Standard';
  if (lower === 'self_serve_business_prolite') return 'Business ProLite';
  return raw;
}
