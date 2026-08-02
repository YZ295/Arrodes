'use strict';

const net = require('node:net');
const { execFile } = require('node:child_process');

// 端口探测：connect 成功 = 端口已被占用；ECONNREFUSED = 空闲。
// 连接无响应（防火墙/异常状态）按占用处理，宁可拦截也不让 spawn 撞 EADDRINUSE。
function isPortInUse(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const done = (inUse) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(inUse);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(timeoutMs, () => done(true));
  });
}

// 获取监听指定端口的进程 PID（Windows 下解析 netstat -ano；其他平台返回 null）。
// 拿不到 PID 时返回 null，调用方仍须弹窗报错，只是不附 PID 信息。
function getPidByPort(port) {
  return new Promise((resolve) => {
    execFile('netstat', ['-ano'], { windowsHide: true }, (err, stdout) => {
      if (err || typeof stdout !== 'string') return resolve(null);
      const pattern = new RegExp(
        `TCP\\s+[^\\s]+:${port}\\s+[^\\s]+\\s+LISTENING\\s+(\\d+)`
      );
      const match = stdout.match(pattern);
      resolve(match ? match[1] : null);
    });
  });
}

module.exports = { isPortInUse, getPidByPort };
