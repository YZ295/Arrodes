import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { RequestHandler } from 'express';

export const LOCAL_ACCESS_COOKIE = 'arrodes_local_access';
export const LOCAL_ACCESS_HEADER = 'x-arrodes-local-token';

type HeadersLike = IncomingHttpHeaders | Record<string, string | string[] | undefined>;

export interface LocalAccessRequest {
  headers: HeadersLike;
}

export interface LocalAccessResult {
  ok: boolean;
  status?: 401 | 403;
  code?: 'LOCAL_ACCESS_REQUIRED' | 'LOCAL_ORIGIN_REJECTED';
}

export interface LocalAccessPolicy {
  authorize(request: LocalAccessRequest): LocalAccessResult;
  authorizeWebSocket(request: LocalAccessRequest): LocalAccessResult;
  middleware: RequestHandler;
}

function readHeader(headers: HeadersLike, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function readCookie(headers: HeadersLike, name: string): string | undefined {
  const cookie = readHeader(headers, 'cookie');
  if (!cookie) return undefined;
  for (const item of cookie.split(';')) {
    const [key, ...parts] = item.trim().split('=');
    if (key === name) return parts.join('=');
  }
  return undefined;
}

function sameToken(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

export function createLocalAccessPolicy(input: { token: string; uiOrigin: string }): LocalAccessPolicy {
  if (input.token.length < 24) throw new Error('ARRODES_LOCAL_TOKEN 必须为至少 24 字符的临时高熵凭据');
  const uiOrigin = normalizeOrigin(input.uiOrigin);

  const authorize = (request: LocalAccessRequest): LocalAccessResult => {
    const origin = readHeader(request.headers, 'origin');
    const headerToken = readHeader(request.headers, LOCAL_ACCESS_HEADER);
    if (origin) {
      try {
        if (normalizeOrigin(origin) !== uiOrigin) {
          return { ok: false, status: 403, code: 'LOCAL_ORIGIN_REJECTED' };
        }
      } catch {
        return { ok: false, status: 403, code: 'LOCAL_ORIGIN_REJECTED' };
      }
    }
    // 无 Origin 的请求仅允许明确携带令牌，避免 Cookie 被非浏览器本机请求意外使用。
    if (!origin && !headerToken) {
      return { ok: false, status: 401, code: 'LOCAL_ACCESS_REQUIRED' };
    }
    const supplied = headerToken ?? readCookie(request.headers, LOCAL_ACCESS_COOKIE);
    if (!sameToken(supplied, input.token)) {
      return { ok: false, status: 401, code: 'LOCAL_ACCESS_REQUIRED' };
    }
    return { ok: true };
  };

  return {
    authorize,
    authorizeWebSocket: authorize,
    middleware: (req, res, next) => {
      const result = authorize(req);
      if (result.ok) {
        next();
        return;
      }
      res.status(result.status ?? 401).json({
        error: result.code === 'LOCAL_ORIGIN_REJECTED' ? '请求来源不被允许' : '需要本机应用访问凭据',
        code: result.code,
      });
    },
  };
}
