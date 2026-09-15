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
