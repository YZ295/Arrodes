import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import NeonInputBar from './NeonInputBar';

describe('NeonInputBar', () => {
  it('uses one runtime configuration entry for model and work mode', () => {
    const html = renderToStaticMarkup(
      <NeonInputBar
        text=""
        onTextChange={vi.fn()}
        onKeyDown={vi.fn()}
        isRecording={false}
        isSpeaking={false}
        isLoading={false}
        onMicDown={vi.fn()}
        onMicUp={vi.fn()}
        onMicLeave={vi.fn()}
        onStop={vi.fn()}
        onSend={vi.fn()}
        canSend={false}
        permission="default"
        onPickProject={vi.fn()}
        onSetPermission={vi.fn()}
        attachedSkills={[]}
        onToggleSkill={vi.fn()}
      />,
    );

    expect(html).toContain('title="模型与工作模式"');
    expect(html).toContain('>运行配置<');
    expect(html).not.toContain('title="切换技能模式"');
    expect(html).not.toContain('title="切换模型"');
  });
});
