/**
 * 主窗口预加载：管家标签页所需的 Electron 能力
 * 仅暴露最小面：启动/唤起桌宠窗口
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('arrodesButler', {
  launchPet: () => ipcRenderer.invoke('butler:launch-pet'),
  /** 诊断落盘：渲染进程没有文件权限，经主进程写进 desktop.log */
  logDiagnostic: (tag: string, payload: string) => ipcRenderer.send('diag:log', tag, payload),
  /** 取本窗口当前可见性（权威初值，避开 did-finish-load 的注册竞态） */
  getSelfVisible: () => ipcRenderer.invoke('butler:self-visible'),
  /** 订阅本窗口可见性变化（show/hide/minimize/restore） */
  onSelfVisible: (callback: (visible: boolean) => void) => {
    ipcRenderer.on('butler:self-visible', (_event, visible: boolean) => callback(visible));
  },
});
