import type { TokenResponse } from './types.js';

interface Claims {
  sub?: string;
  email?: string;
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string;
    user_email?: string;
  };
  'https://api.openai.com/profile'?: {
    email?: string;
  };
}

function parse(token: string | undefined): Claims | undefined {
  if (!token) return undefined;
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
  } catch {
    return undefined;
  }
}

function fromClaims(c: Claims | undefined): { id?: string; email?: string } {
  if (!c) return {};
  const id =
    c.chatgpt_account_id ||
    c['https://api.openai.com/auth']?.chatgpt_account_id ||
    c.organizations?.[0]?.id;
  const email =
    c.email ||
    c['https://api.openai.com/profile']?.email ||
    c['https://api.openai.com/auth']?.user_email;
  return { id, email };
}

export function identify(
  tokens: Pick<TokenResponse, 'access_token' | 'id_token'>,
): {
  id?: string;
  email?: string;
  subject?: string;
} {
  const idClaims = parse(tokens.id_token);
  const accessClaims = parse(tokens.access_token);
  const fromId = fromClaims(idClaims);
  const fromAccess = fromClaims(accessClaims);
  return {
    id: fromId.id ?? fromAccess.id,
    email: fromId.email ?? fromAccess.email,
    subject: accessClaims?.sub ?? idClaims?.sub,
  };
}

/** Keep the workspace ID for requests, and the user ID for stored logins. */
export function loginId(accountId: string, subject?: string): string {
  return subject ? `${accountId}:${subject}` : accountId;
}
