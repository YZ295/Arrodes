/**
 * 桌宠窗口 preload：向渲染进程暴露最小窗口控制接口。
 * 拖拽 = 渲染进程 pointer 事件 → IPC → 主进程 setPosition；
 * 点击穿透切换 = 悬停桌宠时暂停穿透，离开后恢复。
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('arrodesPet', {
  moveBy: (dx: number, dy: number) => ipcRenderer.send('pet:move-by', dx, dy),
  setInteractive: (interactive: boolean) => ipcRenderer.send('pet:set-interactive', interactive),
  resize: (width: number, height: number) => ipcRenderer.send('pet:resize', width, height),
  notifyVisionState: (on: boolean) => ipcRenderer.send('pet:vision-state', on),
  onVisionToggle: (callback: (on: boolean) => void) => {
    ipcRenderer.on('pet:vision-toggle', (_event, on: boolean) => callback(on));
  },
  setOpacity: (opacity: number) => ipcRenderer.send('pet:opacity', opacity),
  onBounds: (callback: (bounds: { x: number; y: number; width: number; height: number }) => void) => {
    ipcRenderer.on('pet:bounds', (_event, bounds) => callback(bounds));
  },
});
