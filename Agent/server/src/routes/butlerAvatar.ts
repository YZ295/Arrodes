/**
 * 管家形象上传 API（独立于 butler.ts 采集引擎路由）
 * POST   /api/v1/butler-avatar  上传自定义桌宠形象（png/jpg/webp，≤5MB，multipart 字段 file）
 * GET    /api/v1/butler-avatar  获取当前自定义形象（无则 404）
 * DELETE /api/v1/butler-avatar  删除自定义形象
 *
 * 存放位置：与数据库同目录（随 DB_PATH），文件名 butler-avatar.<ext>
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

const AVATAR_BASE = 'butler-avatar';
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 png/jpg/webp 图片'));
  },
});

function avatarDir(): string {
  return path.resolve(config.dbPath);
}

function avatarFilePath(ext: string): string {
  return path.join(avatarDir(), `${AVATAR_BASE}${ext}`);
}

function findExisting(): string | null {
  for (const ext of ['.png', '.jpg', '.webp']) {
    const p = avatarFilePath(ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function createButlerAvatarRouter(): Router {
  const router = Router();

  router.post('/avatar', upload.single('file'), (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: '缺少文件字段 file' });
      return;
    }
    try {
      fs.mkdirSync(avatarDir(), { recursive: true });
      for (const ext of ['.png', '.jpg', '.webp']) {
        const old = avatarFilePath(ext);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      const target = avatarFilePath(EXT_BY_MIME[file.mimetype]);
      fs.writeFileSync(target, file.buffer);
      res.json({ ok: true, data: { url: `/api/v1/butler-avatar?ts=${Date.now()}` } });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  router.get('/avatar', (req: Request, res: Response) => {
    const file = findExisting();
    if (!file) {
      res.status(404).json({ ok: false, error: '未上传自定义形象' });
      return;
    }
    const ext = path.extname(file);
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'image/webp';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(file);
  });

  router.delete('/avatar', (_req: Request, res: Response) => {
    const file = findExisting();
    if (file) fs.unlinkSync(file);
    res.json({ ok: true });
  });

  return router;
}
