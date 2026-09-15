import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorkspacePanel from './WorkspacePanel';

describe('WorkspacePanel', () => {
  it('keeps the canvas available as a workspace view', () => {
    const html = renderToStaticMarkup(<WorkspacePanel onOpenCanvas={() => {}} />);

    expect(html).toContain('画布视图');
  });
});
