import * as accounts from '../accounts/index.js';
import type { Account } from '../accounts/types.js';
import * as callback from './callback.js';
import * as device from './device.js';
import { identify, loginId } from './jwt.js';
import * as paste from './paste.js';
import { pkce, state } from './pkce.js';
import { authorizeUrl, refresh as refreshTokens } from './tokens.js';
import type { TokenResponse } from './types.js';

type AuthorizeAuto = {
  url: string;
  instructions: string;
  method: 'auto';
  callback: () => Promise<SuccessResult | FailedResult>;
};

type AuthorizeCode = {
  url: string;
  instructions: string;
  method: 'code';
  callback: (code: string) => Promise<SuccessResult | FailedResult>;
};

export type AuthMethod =
  | {
      label: string;
      type: 'oauth';
      authorize: () => Promise<AuthorizeAuto | AuthorizeCode>;
    }
  | { label: string; type: 'api' };

interface SuccessResult {
  type: 'success';
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
}

interface FailedResult {
  type: 'failed';
}

const SAFE_FAIL: FailedResult = { type: 'failed' };

function tokensToAccount(tokens: TokenResponse, now = Date.now()): Account {
  const { id, email, subject } = identify(tokens);
  const accountId =
    id ??
    `unknown-${tokens.access_token.slice(-12).replace(/[^a-zA-Z0-9]/g, '')}`;
  return {
    id: loginId(accountId, subject),
    accountId,
    email,
    refresh: tokens.refresh_token,
    access: tokens.access_token,
    expires: now + (tokens.expires_in ?? 3600) * 1000,
    addedAt: now,
  };
}

async function persist(tokens: TokenResponse): Promise<SuccessResult> {
  const account = tokensToAccount(tokens);
  await accounts.save(account, { activate: true });
  return {
    type: 'success',
    refresh: tokens.refresh_token,
    access: tokens.access_token,
    expires: account.expires,
    accountId: account.accountId,
  };
}

function browserMethod(): AuthMethod {
  return {
    label: 'ChatGPT Pro/Plus (browser)',
    type: 'oauth',
    authorize: async () => {
      const { redirectUri } = await callback.start();
      const codes = await pkce();
      const st = state();
      const url = authorizeUrl(redirectUri, codes, st);
      const waiter = callback.waitForCode(codes, st);
      return {
        url,
        instructions:
          'Complete authorization in your browser. This window will close automatically.',
        method: 'auto',
        callback: async () => {
          try {
            const tokens = await waiter;
            callback.stop();
            return persist(tokens);
          } catch {
            callback.stop();
            return SAFE_FAIL;
          }
        },
      };
    },
  };
}

function deviceMethod(): AuthMethod {
  return {
    label: 'ChatGPT Pro/Plus (device code)',
    type: 'oauth',
    authorize: async () => {
      const challenge = await device.start();
      return {
        url: challenge.verification_url,
        instructions: `Enter code: ${challenge.user_code}`,
        method: 'auto',
        callback: async () => {
          try {
            const tokens = await device.poll(challenge);
            return persist(tokens);
          } catch {
            return SAFE_FAIL;
          }
        },
      };
    },
  };
}

function pasteMethod(): AuthMethod {
  return {
    label: 'ChatGPT Pro/Plus (paste callback URL)',
    type: 'oauth',
    authorize: async () => {
      const codes = await pkce();
      const st = state();
      const url = authorizeUrl(
        `http://localhost:1455/auth/callback`,
        codes,
        st,
      );
      return {
        url,
        instructions:
          'Open the URL in any browser, sign in, then paste the full callback URL you are redirected to (it starts with http://localhost:1455/auth/callback).',
        method: 'code',
        callback: async (callbackUrl: string) => {
          try {
            const tokens = await paste.fromUrl(callbackUrl, codes, st);
            return persist(tokens);
          } catch {
            return SAFE_FAIL;
          }
        },
      };
    },
  };
}

function apiKeyMethod(): AuthMethod {
  return { label: 'Manually enter API Key', type: 'api' };
}

export function methods(): AuthMethod[] {
  return [browserMethod(), deviceMethod(), pasteMethod(), apiKeyMethod()];
}

export { identify, refreshTokens as refresh };
export type { TokenResponse } from './types.js';
