import type { PropsWithChildren } from 'react'

interface ToolbarDockProps extends PropsWithChildren {
  showChromeTab: boolean
}

export function ToolbarDock({ showChromeTab, children }: ToolbarDockProps) {
  return (
    <div
      className={`toolbar-dock${showChromeTab ? ' has-chrome-tab' : ''}`}
      role="toolbar"
      aria-label="Neko-Tab tools"
    >
      {children}
    </div>
  )
}
