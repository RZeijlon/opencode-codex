import type { TokenResponse } from './types.js';

interface Claims {
  email?: string;
  chatgpt_plan_type?: string;
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string;
    chatgpt_plan_type?: string;
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

export function planType(accessToken: string): string | undefined {
  const claims = parse(accessToken);
  return (
    claims?.['https://api.openai.com/auth']?.chatgpt_plan_type ??
    claims?.chatgpt_plan_type
  );
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

export function identify(tokens: TokenResponse): {
  id?: string;
  email?: string;
} {
  const fromId = fromClaims(parse(tokens.id_token));
  const fromAccess = fromClaims(parse(tokens.access_token));
  return {
    id: fromId.id ?? fromAccess.id,
    email: fromId.email ?? fromAccess.email,
  };
}
