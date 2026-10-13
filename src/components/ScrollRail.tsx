import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface ScrollOverflow {
  up: boolean
  down: boolean
}

interface ScrollRailProps {
  scrollRef: RefObject<HTMLDivElement>
  onOverflowChange: (overflow: ScrollOverflow) => void
}

interface ScrollMetrics {
  top: number
  height: number
  viewport: number
}

export function ScrollRail({ scrollRef, onOverflowChange }: ScrollRailProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ pointerId: number; y: number; top: number } | null>(null)
  const [metrics, setMetrics] = useState<ScrollMetrics>({ top: 0, height: 0, viewport: 0 })
  const [trackHeight, setTrackHeight] = useState(0)

  useEffect(() => {
    const scrollElement = scrollRef.current
    const track = trackRef.current
    if (!scrollElement || !track) return

    let frame: number | null = null
    const measure = () => {
      frame = null
      const next = {
        top: scrollElement.scrollTop,
        height: scrollElement.scrollHeight,
        viewport: scrollElement.clientHeight,
      }
      setMetrics(previous =>
        previous.top === next.top && previous.height === next.height && previous.viewport === next.viewport
          ? previous
          : next
      )
      setTrackHeight(previous => {
        const height = track.clientHeight
        return previous === height ? previous : height
      })
      const maxScroll = Math.max(0, next.height - next.viewport)
      onOverflowChange({ up: next.top > 1, down: next.top < maxScroll - 1 })
    }
    const queueMeasure = () => {
      if (frame === null) frame = requestAnimationFrame(measure)
    }

    scrollElement.addEventListener('scroll', queueMeasure, { passive: true })
    const resizeObserver = new ResizeObserver(queueMeasure)
    resizeObserver.observe(scrollElement)
    resizeObserver.observe(track)
    const mutationObserver = new MutationObserver(queueMeasure)
    mutationObserver.observe(scrollElement, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', queueMeasure)
    queueMeasure()

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      scrollElement.removeEventListener('scroll', queueMeasure)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', queueMeasure)
    }
  }, [scrollRef, onOverflowChange])

  const maxScroll = Math.max(0, metrics.height - metrics.viewport)
  const canScroll = maxScroll > 1 && trackHeight > 0
  const thumbHeight = canScroll
    ? Math.min(trackHeight, Math.max(24, trackHeight * metrics.viewport / metrics.height))
    : 0
  const thumbTravel = Math.max(0, trackHeight - thumbHeight)
  const thumbTop = maxScroll > 0 ? (metrics.top / maxScroll) * thumbTravel : 0

  const scrollByPage = (direction: number) => {
    const element = scrollRef.current
    if (element) element.scrollTop += direction * Math.max(80, element.clientHeight * 0.75)
  }

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget || !canScroll) return
    event.preventDefault()
    const top = event.currentTarget.getBoundingClientRect().top
    const fraction = Math.max(0, Math.min(1, (event.clientY - top - thumbHeight / 2) / Math.max(1, thumbTravel)))
    if (scrollRef.current) scrollRef.current.scrollTop = fraction * maxScroll
  }

  const onThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !canScroll) return
    event.preventDefault()
    event.stopPropagation()
    draggingRef.current = { pointerId: event.pointerId, y: event.clientY, top: metrics.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onThumbPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current
    if (!drag || drag.pointerId !== event.pointerId || !scrollRef.current) return
    event.preventDefault()
    scrollRef.current.scrollTop = drag.top +
      (event.clientY - drag.y) * maxScroll / Math.max(1, thumbTravel)
  }

  const onThumbPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current?.pointerId !== event.pointerId) return
    draggingRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onThumbKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const element = scrollRef.current
    if (!element) return
    const step = Math.max(40, element.clientHeight * 0.15)
    const movement: Record<string, number> = {
      ArrowUp: -step,
      ArrowDown: step,
      PageUp: -element.clientHeight,
      PageDown: element.clientHeight,
      Home: -maxScroll,
      End: maxScroll,
    }
    if (!(event.key in movement)) return
    event.preventDefault()
    event.stopPropagation()
    element.scrollTop += movement[event.key]
  }

  return (
    <div className="scroll-rail" style={{ visibility: canScroll ? 'visible' : 'hidden' }}>
      <button type="button" className="scroll-rail-arrow" aria-label="Scroll up"
        style={{ visibility: metrics.top > 1 ? 'visible' : 'hidden' }}
        onClick={() => scrollByPage(-1)}>
        <ChevronUp size={14} />
      </button>
      <div className="scroll-rail-track" ref={trackRef} onPointerDown={onTrackPointerDown}>
        <div className="scroll-rail-thumb" role="scrollbar" aria-label="Scroll position"
          aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={maxScroll > 0 ? Math.round(metrics.top / maxScroll * 100) : 0}
          tabIndex={canScroll ? 0 : -1}
          style={{ top: thumbTop, height: thumbHeight }}
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={onThumbPointerEnd}
          onPointerCancel={onThumbPointerEnd}
          onLostPointerCapture={() => { draggingRef.current = null }}
          onKeyDown={onThumbKeyDown}
        />
      </div>
      <button type="button" className="scroll-rail-arrow" aria-label="Scroll down"
        style={{ visibility: metrics.top < maxScroll - 1 ? 'visible' : 'hidden' }}
        onClick={() => scrollByPage(1)}>
        <ChevronDown size={14} />
      </button>
    </div>
  )
}
