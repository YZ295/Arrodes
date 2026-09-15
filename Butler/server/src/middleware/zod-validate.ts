/**
 * zod 请求体验证中间件
 * 替代手写 validate.ts：schema 定义即类型（z.infer），校验失败返回 400
 */
import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/**
 * 创建基于 zod schema 的请求体验证中间件
 *
 * @example
 * const schema = z.object({ title: z.string().min(1).max(200), topic: z.enum([...]) });
 * router.post('/', createZodValidator(schema), handler);
 */
export function createZodValidator(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // 提取第一个错误，返回明确信息
      const issue = result.error.issues[0];
      const field = issue?.path?.join('.') || 'body';
      const message = issue?.message || '请求体无效';
      res.status(400).json({
        error: `字段 ${field}: ${message}`,
        code: 'VALIDATION_ERROR',
      });
      return;
    }
    // 校验通过 → 用解析后的值替换 body（zod 会做默认值/类型转换）
    req.body = result.data;
    next();
  };
}
