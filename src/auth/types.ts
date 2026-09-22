export interface OauthEntry {
  type: 'oauth';
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
  email?: string;
  enterpriseUrl?: string;
}

export interface ApiEntry {
  type: 'api';
  key: string;
  metadata?: Record<string, string>;
}

export type Entry =
  | OauthEntry
  | ApiEntry
  | { type: string; [k: string]: unknown };
