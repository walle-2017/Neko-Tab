import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/* Keep dialogs at the app level instead of inside the dock's stacking context. */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const app = document.querySelector('.app')
  return createPortal(children, app ?? document.body)
}
