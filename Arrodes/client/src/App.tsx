import { useEffect } from 'react';
import { eventBus, EVENTS } from './shared/events/EventBus';
import Universe from './universe/Universe';
import VoiceDialog from './voice/VoiceDialog';

function App() {
  useEffect(() => {
    // 应用初始化完成
    eventBus.emit(EVENTS.APP_READY);
  }, []);

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* 3D 宇宙场景 */}
      <Universe />

      {/* 语音对话系统 */}
      <VoiceDialog />
    </div>
  );
}

export default App;
