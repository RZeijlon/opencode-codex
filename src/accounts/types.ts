export interface UsageWindow {
  windowMinutes: number;
  usedPercent: number;
  resetAtMs: number;
}

export interface Usage {
  fetchedAt: number;
  planType?: string;
  windows: UsageWindow[];
}

export interface Account {
  /** Unique login identity; Business users can share a ChatGPT account ID. */
  id: string;
  accountId?: string;
  email?: string;
  label?: string;
  refresh: string;
  access: string;
  expires: number;
  enterpriseUrl?: string;
  addedAt: number;
  lastUsedAt?: number;
  rateLimitUntilMs?: number;
  usage?: Usage;
}

export interface Store {
  version: 1;
  active?: string;
  accounts: Account[];
}
