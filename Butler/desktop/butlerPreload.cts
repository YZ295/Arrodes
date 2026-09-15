/**
 * 主窗口预加载：管家标签页所需的 Electron 能力
 * 仅暴露最小面：启动/唤起桌宠窗口
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('arrodesButler', {
  launchPet: () => ipcRenderer.invoke('butler:launch-pet'),
});
