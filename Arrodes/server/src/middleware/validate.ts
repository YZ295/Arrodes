/**
 * 轻量级请求体验证中间件
 * 不引入额外依赖（zod/joi），用简单的规则描述完成验证
 */
import type { Request, Response, NextFunction } from 'express';

interface FieldRule {
  /** 字段是否必填 */
  required?: boolean;
  /** 字段类型 */
  type?: 'string' | 'number' | 'boolean';
  /** 最小长度（仅 string） */
  minLength?: number;
  /** 最大长度（仅 string） */
  maxLength?: number;
  /** 允许的值列表 */
  enum?: string[];
}

type Schema = Record<string, FieldRule>;

/**
 * 创建请求体验证中间件
 *
 * @example
 * router.post('/', validateBody({ title: { required: true, minLength: 1, maxLength: 100 }, topic: { required: true, enum: ['work','life','creative','emotion','study','other'] } }), handler);
 */
export function validateBody(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: '请求体不能为空', code: 'INVALID_BODY' });
      return;
    }

    for (const [field, rule] of Object.entries(schema)) {
      const value = body[field];

      // 必填检查
      if (rule.required && (value === undefined || value === null || value === '')) {
        res.status(400).json({ error: `缺少必填字段: ${field}`, code: 'MISSING_FIELD' });
        return;
      }

      if (value === undefined || value === null) continue;

      // 类型检查
      if (rule.type && typeof value !== rule.type) {
        res.status(400).json({ error: `字段 ${field} 类型错误，期望 ${rule.type}`, code: 'INVALID_TYPE' });
        return;
      }

      // 字符串长度检查
      if (rule.type === 'string' && typeof value === 'string') {
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          res.status(400).json({ error: `字段 ${field} 长度不足`, code: 'TOO_SHORT' });
          return;
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
          res.status(400).json({ error: `字段 ${field} 超出最大长度`, code: 'TOO_LONG' });
          return;
        }
      }

      // 枚举检查
      if (rule.enum && !rule.enum.includes(String(value))) {
        res.status(400).json({ error: `字段 ${field} 值无效，允许: ${rule.enum.join(', ')}`, code: 'INVALID_VALUE' });
        return;
      }
    }

    next();
  };
}
