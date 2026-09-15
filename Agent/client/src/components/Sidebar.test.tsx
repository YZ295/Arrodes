import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

describe('Sidebar', () => {
  it('shows only available destinations and leaves connection status to the status bar', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        currentView="conversation"
        onViewChange={vi.fn()}
        collapsed={false}
        onToggle={vi.fn()}
        currentSessionId={null}
        isConnected
      />,
    );

    expect(html).not.toContain('待开发');
    expect(html).not.toContain('工作流');
    expect(html).not.toContain('移动端');
    expect(html).not.toContain('>画布<');
    expect(html).not.toContain('已连接');
  });

  it('keeps the product identity quiet and discloses secondary tools on demand', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        currentView="conversation"
        onViewChange={vi.fn()}
        collapsed={false}
        onToggle={vi.fn()}
        currentSessionId={null}
        isConnected
      />,
    );

    expect(html).toContain('aria-label="阿罗德斯"');
    expect(html).not.toContain('虚空之镜');
    expect(html).toContain('>对话<');
    expect(html).toContain('>工作区<');
    expect(html).toContain('>观察<');
    expect(html).toContain('>记忆<');
    expect(html).toContain('展开工具与设置');
    expect(html).not.toContain('>壁纸<');
    expect(html).not.toContain('>画像<');
    expect(html).not.toContain('>高级<');
  });

  it('keeps workspace selected while its canvas view is open', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        currentView="canvas"
        onViewChange={vi.fn()}
        collapsed={false}
        onToggle={vi.fn()}
        currentSessionId={null}
        isConnected
      />,
    );

    const activeItem = html.match(/<button aria-current="page"[\s\S]*?<\/button>/)?.[0];
    expect(activeItem).toContain('工作区');
  });
});
