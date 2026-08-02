'use strict';

// 轮询 health 端点直到返回 HTTP 200；超时抛错。
// 依赖 Node 22+ 全局 fetch（Electron 内嵌 Node ≥ 22）。
async function waitForHealth(url, { interval = 200, timeout = 10000 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(Math.min(interval, 5000)),
      });
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(
    `health 检查超时（${timeout}ms）：${url}` +
      (lastError ? `，最后错误：${lastError.message}` : '')
  );
}

module.exports = { waitForHealth };
