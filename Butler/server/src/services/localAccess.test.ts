import { describe, expect, it } from 'vitest';
import { LOCAL_ACCESS_COOKIE, createLocalAccessPolicy } from './localAccess.js';

const token = 'test-local-access-token-0123456789';
const origin = 'http://localhost:3002';

describe('本机访问策略', () => {
  it('仅接受正确 Cookie 和允许的 UI Origin', () => {
    const policy = createLocalAccessPolicy({ token, uiOrigin: origin });
    expect(policy.authorize({ headers: { origin, cookie: `${LOCAL_ACCESS_COOKIE}=${token}` } })).toEqual({ ok: true });
  });

  it.each([
    ['缺少凭据', { origin }],
    ['错误凭据', { origin, cookie: `${LOCAL_ACCESS_COOKIE}=wrong` }],
    ['错误来源', { origin: 'https://evil.example', cookie: `${LOCAL_ACCESS_COOKIE}=${token}` }],
    ['非法来源', { origin: 'not a URL', cookie: `${LOCAL_ACCESS_COOKIE}=${token}` }],
  ])('%s 时拒绝受保护请求', (_label, headers) => {
    const policy = createLocalAccessPolicy({ token, uiOrigin: origin });
    expect(policy.authorize({ headers }).ok).toBe(false);
  });

  it('允许无 Origin 的本机诊断请求仅通过显式请求头携带凭据', () => {
    const policy = createLocalAccessPolicy({ token, uiOrigin: origin });
    expect(policy.authorize({ headers: { 'x-arrodes-local-token': token } })).toEqual({ ok: true });
    expect(policy.authorize({ headers: {} }).ok).toBe(false);
  });

  it('HTTP 与 WebSocket 握手复用同一策略', () => {
    const policy = createLocalAccessPolicy({ token, uiOrigin: origin });
    const request = { headers: { origin, cookie: `${LOCAL_ACCESS_COOKIE}=${token}` } };
    expect(policy.authorize(request)).toEqual({ ok: true });
    expect(policy.authorizeWebSocket(request)).toEqual({ ok: true });
  });
});
