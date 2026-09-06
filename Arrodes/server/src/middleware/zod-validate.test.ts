/**
 * zod 请求体验证中间件测试
 * 验证：合法请求放行、非法请求返回 400 + 明确错误
 */
import { describe, it, expect } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createZodValidator } from './zod-validate.js';
import { z } from 'zod';

/** 构造假 req/res/next */
function makeHarness(schema: ReturnType<typeof createZodValidator>) {
  const req = { body: {} } as Request;
  const mockRes = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
  };
  const res = mockRes as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next, mockRes };
}

import { vi } from 'vitest';

describe('zod 校验中间件', () => {
  const sessionSchema = createZodValidator(z.object({
    title: z.string().min(1).max(200),
    topic: z.enum(['work', 'life', 'creative', 'emotion', 'study', 'other']),
  }));

  it('合法请求放行（next 被调用，无 400）', () => {
    const { req, res, next, mockRes } = makeHarness(sessionSchema);
    req.body = { title: '新对话', topic: 'work' };
    sessionSchema(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockRes.statusCode).toBe(0);
  });

  it('缺少必填字段返回 400 + 明确错误', () => {
    const { req, res, next, mockRes } = makeHarness(sessionSchema);
    req.body = { topic: 'work' }; // 缺 title
    sessionSchema(req, res, next);
    expect(mockRes.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('枚举值非法返回 400', () => {
    const { req, res, next, mockRes } = makeHarness(sessionSchema);
    req.body = { title: 'x', topic: 'invalid-topic' };
    sessionSchema(req, res, next);
    expect(mockRes.statusCode).toBe(400);
  });

  it('字符串超长返回 400', () => {
    const { req, res, next, mockRes } = makeHarness(sessionSchema);
    req.body = { title: 'x'.repeat(201), topic: 'work' };
    sessionSchema(req, res, next);
    expect(mockRes.statusCode).toBe(400);
  });

  it('错误响应包含 code 与 error 字段（前端可解析）', () => {
    const { req, res, next, mockRes } = makeHarness(sessionSchema);
    req.body = {};
    sessionSchema(req, res, next);
    expect((mockRes.body as any).code).toBe('VALIDATION_ERROR');
    expect((mockRes.body as any).error).toBeTruthy();
  });
});
