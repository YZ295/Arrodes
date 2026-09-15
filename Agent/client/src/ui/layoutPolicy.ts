export const COMPACT_NAV_BREAKPOINT = 720;

export function getWorkspaceLayout(viewportWidth: number, userCollapsed: boolean) {
  const narrow = viewportWidth < COMPACT_NAV_BREAKPOINT;
  return {
    compactNavigation: narrow || userCollapsed,
    panelPresentation: narrow ? 'full' as const : 'drawer' as const,
  };
}
