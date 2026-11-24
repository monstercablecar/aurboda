import type { DashboardConfig, DashboardWidget } from '@aurboda/api-spec'

/**
 * A day overview and a latest activities card show what the owner did and when, so visitors see them
 * only when the owner opted in; a stored config without the flag keeps them private. The owner's own
 * reads always get the latest activities card, and a day overview only with its flag.
 */
export const isShownToVisitors = (widget: DashboardWidget): boolean =>
  (widget.type !== 'day_overview' && widget.type !== 'recent_activities') ||
  widget.config.visible_to_visitors === true

export type DashboardViewer = 'owner' | 'visitor'

export const isResolvedFor = (widget: DashboardWidget, viewer: DashboardViewer): boolean =>
  isShownToVisitors(widget) || (viewer === 'owner' && widget.type === 'recent_activities')

/**
 * Strip viewer-useless / internal fields from a config before exposing it.
 * Quick links point into the owner's private app, so neutralize their hrefs.
 * Widgets not shown to visitors are left out.
 */
export const sanitizeConfig = (config: DashboardConfig): DashboardConfig => ({
  // Author prose is meant for public viewers — preserve it (section descriptions
  // survive via the section spread below).
  description: config.description,
  ...(config.period ? { period: config.period } : {}),
  sections: config.sections.map((section) => ({
    ...section,
    widgets: section.widgets
      .filter(isShownToVisitors)
      .map((widget) =>
        widget.type === 'quick_link' ? { ...widget, config: { ...widget.config, href: '#' } } : widget,
      ),
  })),
  version: config.version,
})
