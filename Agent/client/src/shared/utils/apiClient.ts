/**
 * 统一 API 客户端
 *
 * 职责：
 * - 统一 base URL（自动拼接 /api/v1）
 * - 统一错误处理与 JSON 解析
 * - 请求超时保护（默认 15s）
 * - 类型安全的泛型返回值
 *
 * 使用方式：
 * ```ts
 * const sessions = await api.get<{ sessions: SessionNode[] }>('/sessions');
 * const newSession = await api.post<SessionNode>('/sessions', { title: '...', topic: 'other' });
 * ```
 */

// ===== 配置 =====

const BASE_URL = '/api/v1';
const DEFAULT_TIMEOUT = 15000;

// ===== 自定义错误 =====

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ===== 核心 =====

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      let errorBody: { error?: string; code?: string } = {};
      try {
        errorBody = await res.json();
      } catch {
        // 无 JSON 响应体
      }
      throw new ApiError(
        errorBody.error || `请求失败 (${res.status})`,
        res.status,
        errorBody.code,
      );
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    const data = await res.json();
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('请求超时', 408);
    }
    throw new ApiError(err instanceof Error ? err.message : '网络错误', 0);
  } finally {
    clearTimeout(timer);
  }
}

// ===== 导出 =====

export const api = {
  get<T = unknown>(path: string, timeout?: number): Promise<T> {
    return request<T>(path, { method: 'GET' }, timeout);
  },

  post<T = unknown>(path: string, body?: unknown, timeout?: number): Promise<T> {
    return request<T>(
      path,
      { method: 'POST', body: body ? JSON.stringify(body) : undefined },
      timeout,
    );
  },

  patch<T = unknown>(path: string, body?: unknown, timeout?: number): Promise<T> {
    return request<T>(
      path,
      { method: 'PATCH', body: body ? JSON.stringify(body) : undefined },
      timeout,
    );
  },

  delete<T = unknown>(path: string, timeout?: number): Promise<T> {
    return request<T>(path, { method: 'DELETE' }, timeout);
  },
};
