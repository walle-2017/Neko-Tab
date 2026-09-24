import { useState, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, ChevronUp, GripVertical } from 'lucide-react'
import type { BookmarkCategory, Bookmark } from '../types'
import { recordTabUsage } from '../utils/tabUsage'
import { isSafeUrl } from '../utils/browser'
import { SiteIcon } from './SiteIcon'

interface BookmarksProps {
  categories: BookmarkCategory[]
  onAddCategory: (name: string) => void
  onDeleteCategory: (id: string) => void
  onRenameCategory: (id: string, name: string) => void
  onAddBookmark: (categoryId: string, title: string, url: string) => void
  onDeleteBookmark: (categoryId: string, bookmarkId: string) => void
  onEditBookmark: (categoryId: string, bookmarkId: string, title: string, url: string) => void
  onReorderCategories: (activeCategoryId: string, targetIndex: number) => void
  onMoveBookmark: (
    bookmarkId: string,
    sourceCategoryId: string,
    targetCategoryId: string,
    targetIndex: number
  ) => void
  showBookmarks: boolean
  onToggleShowBookmarks: () => void
}

interface EditingState {
  type: 'category' | 'bookmark' | 'new-bookmark' | 'new-category' | null
  categoryId?: string
  bookmarkId?: string
  value?: string
  url?: string
}

interface ScrollHintState {
  up: boolean
  down: boolean
}

type DragState =
  | { type: 'category'; categoryId: string; label: string }
  | { type: 'bookmark'; categoryId: string; bookmarkId: string; label: string }
  | null

type DropTarget =
  | { type: 'category-slot'; index: number }
  | { type: 'bookmark-slot'; categoryId: string; index: number }
  | null

interface PointerPosition {
  x: number
  y: number
}

interface DropIndicatorGeometry {
  left: number
  top: number
  width: number
  height: number
}

interface DropSlotVisual {
  key: string
  target: Exclude<DropTarget, null>
  geometry: DropIndicatorGeometry
}

export function Bookmarks({
  categories,
  onAddCategory,
  onDeleteCategory,
  onRenameCategory,
  onAddBookmark,
  onDeleteBookmark,
  onEditBookmark,
  onReorderCategories,
  onMoveBookmark,
  showBookmarks,
  onToggleShowBookmarks,
}: BookmarksProps) {
  const [editing, setEditing] = useState<EditingState>({ type: null })
  const [isEditMode, setIsEditMode] = useState(false)
  const [topSites, setTopSites] = useState<{ title: string; url: string }[]>(() => {
    try {
      const stored = localStorage.getItem('neko-top-sites')
      return stored ? JSON.parse(stored) : []
    } catch (e) {
      return []
    }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const categoriesGridRef = useRef<HTMLDivElement>(null)
  const [categoryScrollHint, setCategoryScrollHint] = useState<ScrollHintState>({ up: false, down: false })
  const [bookmarkScrollHints, setBookmarkScrollHints] = useState<Record<string, ScrollHintState>>({})
  const [dragState, setDragState] = useState<DragState>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [dropSlotVisuals, setDropSlotVisuals] = useState<DropSlotVisual[]>([])
  const [isCancelZoneActive, setIsCancelZoneActive] = useState(false)
  const dragStateRef = useRef<DragState>(null)
  const lastValidTargetRef = useRef<DropTarget>(null)
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 })
  const dragStartPointRef = useRef<PointerPosition>({ x: 0, y: 0 })
  const cancelZoneActiveRef = useRef(false)
  const cancelZoneRef = useRef<HTMLDivElement>(null)
  const dragOverlayRef = useRef<HTMLDivElement>(null)
  const dropIndicatorRef = useRef<HTMLDivElement>(null)
  const dragFrameRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number | null>(null)
  const dropSlotFingerprintRef = useRef('')

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.topSites) {
      chrome.topSites.get((sites) => {
        const sliced = sites.slice(0, 4)
        // Update storage for the next visit
        localStorage.setItem('neko-top-sites', JSON.stringify(sliced))
        
        // Only update UI now if it was empty, otherwise wait until next tab load
        // This prevents the layout shift you noticed.
        if (topSites.length === 0 && sliced.length > 0) {
          setTopSites(sliced)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (editing.type && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing.type, editing.categoryId, editing.bookmarkId])

  const getScrollHintState = (element: HTMLElement): ScrollHintState => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    return {
      up: element.scrollTop > 1,
      down: element.scrollTop < maxScrollTop - 1,
    }
  }

  const updateCategoryScrollHint = () => {
    const element = categoriesGridRef.current
    if (!element) return

    const next = getScrollHintState(element)
    setCategoryScrollHint(prev =>
      prev.up === next.up && prev.down === next.down ? prev : next
    )
  }

  const handleBookmarkScroll = (categoryId: string, event: React.UIEvent<HTMLDivElement>) => {
    const next = getScrollHintState(event.currentTarget)
    setBookmarkScrollHints(prev => {
      const current = prev[categoryId]
      if (current?.up === next.up && current?.down === next.down) return prev
      return { ...prev, [categoryId]: next }
    })
  }

  const scrollHintClass = (hint: ScrollHintState) =>
    `${hint.up ? ' scroll-hint-top' : ''}${hint.down ? ' scroll-hint-bottom' : ''}`

  const setCancelZoneActive = (active: boolean) => {
    if (cancelZoneActiveRef.current === active) return
    cancelZoneActiveRef.current = active
    setIsCancelZoneActive(active)
  }

  const targetsEqual = (a: DropTarget, b: DropTarget) => {
    if (a === b) return true
    if (!a || !b || a.type !== b.type) return false
    if (a.type === 'category-slot' && b.type === 'category-slot') {
      return a.index === b.index
    }
    if (a.type === 'bookmark-slot' && b.type === 'bookmark-slot') {
      return a.categoryId === b.categoryId && a.index === b.index
    }
    return false
  }

  const toGridGeometry = (
    geometry: DropIndicatorGeometry
  ): DropIndicatorGeometry => {
    const gridRect = categoriesGridRef.current?.getBoundingClientRect()
    if (!gridRect) return geometry

    return {
      left: geometry.left - gridRect.left,
      top: geometry.top - gridRect.top,
      width: geometry.width,
      height: geometry.height,
    }
  }

  const updateDropIndicator = (geometry: DropIndicatorGeometry | null) => {
    const element = dropIndicatorRef.current
    if (!element) return

    if (!geometry) {
      element.style.opacity = '0'
      return
    }

    const relativeGeometry = toGridGeometry(geometry)
    element.style.left = `${relativeGeometry.left}px`
    element.style.top = `${relativeGeometry.top}px`
    element.style.width = `${relativeGeometry.width}px`
    element.style.height = `${relativeGeometry.height}px`
    element.style.opacity = '1'
  }

  const setValidTarget = (
    target: Exclude<DropTarget, null>,
    geometry: DropIndicatorGeometry
  ) => {
    const previous = lastValidTargetRef.current
    lastValidTargetRef.current = target
    if (!targetsEqual(previous, target)) {
      setDropTarget(target)
    }
    updateDropIndicator(geometry)
  }

  const resetDragState = () => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    lastFrameTimeRef.current = null
    dragStateRef.current = null
    lastValidTargetRef.current = null
    cancelZoneActiveRef.current = false
    setDragState(null)
    setDropTarget(null)
    setDropSlotVisuals([])
    dropSlotFingerprintRef.current = ''
    setIsCancelZoneActive(false)
    updateDropIndicator(null)
    document.body.classList.remove('bookmark-pointer-drag-active')
  }

  const pointInsideRect = (
    point: PointerPosition,
    rect: DOMRect,
    padding = 0
  ) =>
    point.x >= rect.left - padding &&
    point.x <= rect.right + padding &&
    point.y >= rect.top - padding &&
    point.y <= rect.bottom + padding

  const squaredDistance = (
    point: PointerPosition,
    x: number,
    y: number
  ) => {
    const dx = point.x - x
    const dy = point.y - y
    return dx * dx + dy * dy
  }

  const getUserCategoryElements = () => {
    const grid = categoriesGridRef.current
    if (!grid) return []

    return Array.from(
      grid.querySelectorAll<HTMLElement>('[data-user-category-index]')
    ).sort(
      (a, b) =>
        Number(a.dataset.userCategoryIndex) - Number(b.dataset.userCategoryIndex)
    )
  }

  const getCategoryRows = (elements: HTMLElement[]) => {
    const rows: HTMLElement[][] = []

    for (const element of elements) {
      const rect = element.getBoundingClientRect()
      const currentRow = rows[rows.length - 1]
      if (!currentRow) {
        rows.push([element])
        continue
      }

      const rowTop = currentRow[0].getBoundingClientRect().top
      if (Math.abs(rect.top - rowTop) < 8) {
        currentRow.push(element)
      } else {
        rows.push([element])
      }
    }

    return rows
  }

  const getVerticalCategorySlotGeometry = (
    x: number,
    top: number,
    bottom: number
  ): DropIndicatorGeometry => ({
    left: x - 1,
    top,
    width: 2,
    height: Math.max(24, bottom - top),
  })

  const getCategorySlotVisuals = (): DropSlotVisual[] => {
    const grid = categoriesGridRef.current
    if (!grid) return []

    const elements = getUserCategoryElements()
    if (elements.length === 0) return []

    const rows = getCategoryRows(elements)
    const gridRect = grid.getBoundingClientRect()
    const visuals: DropSlotVisual[] = []

    const edgeSlotGap = 8
    const viewportInset = 3

    rows.forEach((row, rowIndex) => {
      const first = row[0]
      const last = row[row.length - 1]
      const firstRect = first.getBoundingClientRect()
      const lastRect = last.getBoundingClientRect()
      const firstIndex = Number(first.dataset.userCategoryIndex)
      const lastIndex = Number(last.dataset.userCategoryIndex)

      const previousVisualSibling =
        first.previousElementSibling instanceof HTMLElement
          ? first.previousElementSibling
          : null
      const previousRect = previousVisualSibling?.getBoundingClientRect()
      const leftX =
        previousRect && Math.abs(previousRect.top - firstRect.top) < 8
          ? (previousRect.right + firstRect.left) / 2
          : Math.max(
              gridRect.left + viewportInset,
              firstRect.left - edgeSlotGap
            )

      visuals.push({
        key: `category-row-${rowIndex}-start-${firstIndex}`,
        target: { type: 'category-slot', index: firstIndex },
        geometry: getVerticalCategorySlotGeometry(
          leftX,
          firstRect.top,
          firstRect.bottom
        ),
      })

      for (let itemIndex = 1; itemIndex < row.length; itemIndex += 1) {
        const previous = row[itemIndex - 1]
        const current = row[itemIndex]
        const previousRect = previous.getBoundingClientRect()
        const currentRect = current.getBoundingClientRect()
        const currentIndex = Number(current.dataset.userCategoryIndex)
        const x = (previousRect.right + currentRect.left) / 2

        visuals.push({
          key: `category-row-${rowIndex}-between-${currentIndex}`,
          target: { type: 'category-slot', index: currentIndex },
          geometry: getVerticalCategorySlotGeometry(
            x,
            Math.min(previousRect.top, currentRect.top),
            Math.max(previousRect.bottom, currentRect.bottom)
          ),
        })
      }

      const rightX = Math.min(
        gridRect.right - viewportInset,
        lastRect.right + edgeSlotGap
      )

      visuals.push({
        key: `category-row-${rowIndex}-end-${lastIndex + 1}`,
        target: { type: 'category-slot', index: lastIndex + 1 },
        geometry: getVerticalCategorySlotGeometry(
          rightX,
          lastRect.top,
          lastRect.bottom
        ),
      })
    })

    return visuals
  }

  const updateCategoryTarget = (point: PointerPosition) => {
    const grid = categoriesGridRef.current
    if (!grid) return

    const gridRect = grid.getBoundingClientRect()
    if (!pointInsideRect(point, gridRect, 20)) return

    const visuals = getCategorySlotVisuals()
    let best:
      | { target: Exclude<DropTarget, null>; geometry: DropIndicatorGeometry; distance: number }
      | null = null

    for (const visual of visuals) {
      const centerX = visual.geometry.left + visual.geometry.width / 2
      const centerY = visual.geometry.top + visual.geometry.height / 2
      const distance = squaredDistance(point, centerX, centerY)
      if (!best || distance < best.distance) {
        best = {
          target: visual.target,
          geometry: visual.geometry,
          distance,
        }
      }
    }

    if (best) {
      setValidTarget(best.target, best.geometry)
    }
  }

  const getCategoryUnderPointer = (point: PointerPosition) => {
    const grid = categoriesGridRef.current
    if (!grid) return null

    const categories = Array.from(
      grid.querySelectorAll<HTMLElement>('[data-user-category-id]')
    )

    return categories.find(element =>
      pointInsideRect(point, element.getBoundingClientRect(), 4)
    ) ?? null
  }

  const getBookmarkSlotGeometry = (
    list: HTMLElement,
    index: number
  ): DropIndicatorGeometry => {
    const listRect = list.getBoundingClientRect()
    const items = Array.from(
      list.querySelectorAll<HTMLElement>('[data-bookmark-index]')
    ).sort(
      (a, b) => Number(a.dataset.bookmarkIndex) - Number(b.dataset.bookmarkIndex)
    )

    let y = listRect.top + 2
    if (items.length === 0) {
      y = listRect.top + Math.min(12, listRect.height / 2)
    } else if (index <= 0) {
      y = Math.max(listRect.top + 1, items[0].getBoundingClientRect().top - 1)
    } else if (index >= items.length) {
      y = Math.min(
        listRect.bottom - 1,
        items[items.length - 1].getBoundingClientRect().bottom + 1
      )
    } else {
      const previous = items[index - 1].getBoundingClientRect()
      const current = items[index].getBoundingClientRect()
      y = (previous.bottom + current.top) / 2
    }

    return {
      left: listRect.left,
      top: y - 1,
      width: listRect.width,
      height: 2,
    }
  }


  const getBookmarkSlotVisuals = (): DropSlotVisual[] => {
    const grid = categoriesGridRef.current
    if (!grid) return []

    const categories = Array.from(
      grid.querySelectorAll<HTMLElement>('[data-user-category-id]')
    )
    const visuals: DropSlotVisual[] = []

    categories.forEach(category => {
      const categoryId = category.dataset.userCategoryId
      const list = category.querySelector<HTMLElement>('[data-bookmark-list]')
      if (!categoryId || !list) return

      const items = Array.from(
        list.querySelectorAll<HTMLElement>('[data-bookmark-index]')
      )
      const count = items.length

      for (let index = 0; index <= count; index += 1) {
        visuals.push({
          key: `bookmark-${categoryId}-slot-${index}`,
          target: { type: 'bookmark-slot', categoryId, index },
          geometry: getBookmarkSlotGeometry(list, index),
        })
      }
    })

    return visuals
  }

  const refreshDropSlotVisuals = (activeDrag: Exclude<DragState, null>) => {
    const rawVisuals =
      activeDrag.type === 'category'
        ? getCategorySlotVisuals()
        : getBookmarkSlotVisuals()

    const visuals = rawVisuals.map(visual => ({
      ...visual,
      geometry: toGridGeometry(visual.geometry),
    }))

    const fingerprint = visuals
      .map(visual => {
        const { left, top, width, height } = visual.geometry
        return [
          visual.key,
          Math.round(left),
          Math.round(top),
          Math.round(width),
          Math.round(height),
        ].join(':')
      })
      .join('|')

    if (fingerprint !== dropSlotFingerprintRef.current) {
      dropSlotFingerprintRef.current = fingerprint
      setDropSlotVisuals(visuals)
    }
  }
  const updateBookmarkTarget = (point: PointerPosition) => {
    const category = getCategoryUnderPointer(point)
    if (!category) return

    const categoryId = category.dataset.userCategoryId
    if (!categoryId) return

    const list = category.querySelector<HTMLElement>('[data-bookmark-list]')
    if (!list) return

    const items = Array.from(
      list.querySelectorAll<HTMLElement>('[data-bookmark-index]')
    ).sort(
      (a, b) => Number(a.dataset.bookmarkIndex) - Number(b.dataset.bookmarkIndex)
    )

    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    for (let index = 0; index <= items.length; index += 1) {
      const geometry = getBookmarkSlotGeometry(list, index)
      const y = geometry.top + geometry.height / 2
      const distance = Math.abs(point.y - y)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }

    setValidTarget(
      { type: 'bookmark-slot', categoryId, index: bestIndex },
      getBookmarkSlotGeometry(list, bestIndex)
    )
  }

  const getEdgeScrollSpeed = (
    element: HTMLElement,
    point: PointerPosition,
    threshold: number,
    maxSpeed: number
  ) => {
    const maxScrollTop = element.scrollHeight - element.clientHeight
    if (maxScrollTop <= 0) return 0

    const rect = element.getBoundingClientRect()
    if (
      point.x < rect.left - 20 ||
      point.x > rect.right + 20 ||
      point.y < rect.top - 20 ||
      point.y > rect.bottom + 20
    ) {
      return 0
    }

    if (point.y <= rect.top + threshold && element.scrollTop > 0) {
      const distance = Math.max(0, point.y - rect.top)
      const strength = Math.min(1, Math.max(0, 1 - distance / threshold))
      return -(0.6 + strength * strength * maxSpeed)
    }

    if (
      point.y >= rect.bottom - threshold &&
      element.scrollTop < maxScrollTop - 1
    ) {
      const distance = Math.max(0, rect.bottom - point.y)
      const strength = Math.min(1, Math.max(0, 1 - distance / threshold))
      return 0.6 + strength * strength * maxSpeed
    }

    return 0
  }

  const updateCancelZoneFromPointer = (point: PointerPosition) => {
    const cancelZone = cancelZoneRef.current
    if (!cancelZone) {
      setCancelZoneActive(false)
      return false
    }

    const active = pointInsideRect(point, cancelZone.getBoundingClientRect())
    setCancelZoneActive(active)
    return active
  }

  const updateDragOverlay = (point: PointerPosition) => {
    const overlay = dragOverlayRef.current
    if (!overlay) return
    overlay.style.transform = `translate3d(${point.x + 14}px, ${point.y + 14}px, 0)`
  }

  const runDragFrame = (timestamp: number) => {
    const activeDrag = dragStateRef.current
    if (!activeDrag) return

    const point = pointerRef.current
    updateDragOverlay(point)

    const inCancelZone = updateCancelZoneFromPointer(point)
    const previousTime = lastFrameTimeRef.current ?? timestamp
    const frameScale = Math.min(2, Math.max(0.5, (timestamp - previousTime) / 16.67))
    lastFrameTimeRef.current = timestamp

    const movedEnough =
      squaredDistance(point, dragStartPointRef.current.x, dragStartPointRef.current.y) > 16

    refreshDropSlotVisuals(activeDrag)

    if (inCancelZone) {
      updateDropIndicator(null)
    }

    if (!inCancelZone && movedEnough) {
      let innerScrolling = false

      if (activeDrag.type === 'bookmark') {
        const category = getCategoryUnderPointer(point)
        const list = category?.querySelector<HTMLElement>('[data-bookmark-list]') ?? null
        if (list) {
          const innerSpeed = getEdgeScrollSpeed(list, point, 20, 7.5)
          if (innerSpeed !== 0) {
            list.scrollTop += innerSpeed * frameScale
            innerScrolling = true
          }
        }
      }

      const grid = categoriesGridRef.current
      if (grid && !innerScrolling) {
        const outerSpeed = getEdgeScrollSpeed(grid, point, 42, 10)
        if (outerSpeed !== 0) {
          grid.scrollTop += outerSpeed * frameScale
        }
      }

      if (activeDrag.type === 'category') {
        updateCategoryTarget(point)
      } else {
        updateBookmarkTarget(point)
      }
    }

    dragFrameRef.current = requestAnimationFrame(runDragFrame)
  }

  const startPointerDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    drag: Exclude<DragState, null>,
    initialTarget: Exclude<DropTarget, null>
  ) => {
    if (editing.type || event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    pointerRef.current = { x: event.clientX, y: event.clientY }
    dragStartPointRef.current = { x: event.clientX, y: event.clientY }
    dragStateRef.current = drag
    lastValidTargetRef.current = initialTarget
    setDragState(drag)
    setDropTarget(initialTarget)
    setDropSlotVisuals([])
    dropSlotFingerprintRef.current = ''
    setCancelZoneActive(false)
    document.body.classList.add('bookmark-pointer-drag-active')

    updateDropIndicator(null)
    requestAnimationFrame(() => {
      updateDragOverlay(pointerRef.current)
    })
  }

  const finishPointerDrag = (cancel = false) => {
    const activeDrag = dragStateRef.current
    if (!activeDrag) return

    const target = lastValidTargetRef.current
    if (!cancel && !cancelZoneActiveRef.current && target) {
      if (activeDrag.type === 'category' && target.type === 'category-slot') {
        onReorderCategories(activeDrag.categoryId, target.index)
      } else if (
        activeDrag.type === 'bookmark' &&
        target.type === 'bookmark-slot'
      ) {
        onMoveBookmark(
          activeDrag.bookmarkId,
          activeDrag.categoryId,
          target.categoryId,
          target.index
        )
      }
    }

    resetDragState()
  }

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      if (event.cancelable) event.preventDefault()
    }

    const handlePointerUp = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      updateCancelZoneFromPointer(pointerRef.current)
      finishPointerDrag(false)
    }

    const handlePointerCancel = () => finishPointerDrag(true)
    const handleWindowBlur = () => finishPointerDrag(false)

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerCancel, true)
    window.addEventListener('blur', handleWindowBlur)

    lastFrameTimeRef.current = null
    dragFrameRef.current = requestAnimationFrame(runDragFrame)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerCancel, true)
      window.removeEventListener('blur', handleWindowBlur)
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current)
        dragFrameRef.current = null
      }
    }
  }, [dragState])


  useEffect(() => {
    const element = categoriesGridRef.current
    if (!element) return

    const frame = requestAnimationFrame(updateCategoryScrollHint)
    const resizeObserver = new ResizeObserver(updateCategoryScrollHint)
    resizeObserver.observe(element)
    window.addEventListener('resize', updateCategoryScrollHint)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateCategoryScrollHint)
    }
  }, [categories, topSites.length, showBookmarks])

  const handleSave = () => {
    if (!editing.value?.trim()) {
      setEditing({ type: null })
      return
    }

    switch (editing.type) {
      case 'category':
        if (editing.categoryId) {
          onRenameCategory(editing.categoryId, editing.value)
        }
        break
      case 'new-category':
        onAddCategory(editing.value)
        break
      case 'new-bookmark':
        if (editing.categoryId && editing.url) {
          onAddBookmark(editing.categoryId, editing.value, editing.url)
        }
        break
      case 'bookmark':
        if (editing.categoryId && editing.bookmarkId && editing.url) {
          onEditBookmark(editing.categoryId, editing.bookmarkId, editing.value, editing.url)
        }
        break
    }
    setEditing({ type: null })
  }

  const handleCancelEdit = () => {
    setEditing({ type: null })
  }

  const handleEditModeToggle = () => {
    if (isEditMode) {
      // Closing the overall edit mode explicitly cancels any unfinished nested edit.
      handleCancelEdit()
      resetDragState()
      setIsEditMode(false)
      return
    }

    setIsEditMode(true)
  }

  const startEditCategory = (e: React.MouseEvent, cat: BookmarkCategory) => {
    e.stopPropagation()
    setEditing({ type: 'category', categoryId: cat.id, value: cat.name })
  }

  const startNewBookmark = (e: React.MouseEvent, categoryId: string) => {
    e.stopPropagation()
    setEditing({ type: 'new-bookmark', categoryId, value: '', url: 'https://' })
  }

  const startEditBookmark = (e: React.MouseEvent, categoryId: string, bookmark: Bookmark) => {
    e.preventDefault()
    e.stopPropagation()
    setEditing({ type: 'bookmark', categoryId, bookmarkId: bookmark.id, value: bookmark.title, url: bookmark.url })
  }

  const handleDeleteCategory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    onDeleteCategory(id)
  }

  const handleDeleteBookmark = (e: React.MouseEvent, categoryId: string, bookmarkId: string) => {
    e.preventDefault()
    e.stopPropagation()
    onDeleteBookmark(categoryId, bookmarkId)
  }

  const handleNavigate = () => {
    void recordTabUsage()
  }

  useEffect(() => {
    if (!isEditMode) return

    const handleEditorKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return

      // Escape cancels an active drag without closing edit mode.
      if (dragState) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          resetDragState()
        }
        return
      }

      // Consume exactly one edit layer per key press.
      event.preventDefault()
      event.stopPropagation()

      if (editing.type) {
        if (event.key === 'Escape') {
          handleCancelEdit()
        } else {
          handleSave()
        }
        return
      }

      // No nested edit is active: this key press exits the overall edit mode.
      setIsEditMode(false)
    }

    window.addEventListener('keydown', handleEditorKeyDown, true)
    return () => window.removeEventListener('keydown', handleEditorKeyDown, true)
  }, [isEditMode, editing, dragState])

  return (
    <div className={`bookmarks-container${dragState ? ' is-pointer-dragging' : ''}`}>
      <div className="bookmarks-header">
        <div 
          className="bookmarks-toggle"
          onClick={onToggleShowBookmarks}
        >
          {showBookmarks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <h3 className="quick-links-title">QUICK LINKS</h3>
        </div>
        <div className="bookmarks-header-actions">
          {dragState && (
            <div
              ref={cancelZoneRef}
              className={`bookmark-drag-cancel-zone${isCancelZoneActive ? ' is-active' : ''}`}
              onPointerEnter={() => setCancelZoneActive(true)}
              onPointerLeave={() => setCancelZoneActive(false)}
            >
              <X size={12} />
              <span>{isCancelZoneActive ? 'RELEASE TO CANCEL' : 'CANCEL DROP'}</span>
            </div>
          )}
          <button 
            className="action-btn-mini"
            style={{ opacity: isEditMode ? 1 : 0.5 }}
            onClick={handleEditModeToggle}
            title={isEditMode ? "Done editing" : "Edit bookmarks"}
          >
            {isEditMode ? <Check size={14} /> : <Pencil size={14} />}
          </button>
        </div>
      </div>

      <div className="categories-scroll-shell">
        <div className="categories-scroll-indicator-row categories-scroll-indicator-row-top" aria-hidden="true">
          {categoryScrollHint.up && <ChevronUp size={16} />}
        </div>
        <div 
          ref={categoriesGridRef}
          className={`categories-grid${scrollHintClass(categoryScrollHint)} ${!showBookmarks ? 'no-transition' : ''}`}
          onScroll={updateCategoryScrollHint}
          style={{ 
            opacity: showBookmarks ? 1 : 0,
            pointerEvents: showBookmarks ? 'auto' : 'none',
            transition: 'none'
          }}
        >
        {topSites.length > 0 && (
          <div className="category-column" data-fixed-category="top-sites">
            <div className="category-header">
              <span className="category-name">Frequently Visited</span>
            </div>
            <div className="bookmarks-list">
              {topSites.map((site, index) => (
                <div key={index} className="bookmark-item">
                  <a href={isSafeUrl(site.url) ? site.url : '#'} className="bookmark-link" title={site.title} onClick={handleNavigate}>
                    <SiteIcon url={site.url} title={site.title} />
                    {(() => {
                      try {
                        const url = new URL(site.url);
                        const hostname = url.hostname.replace(/^www\./, '');
                        return hostname.split('.')[0];
                      } catch (e) {
                        return site.title.length > 15 ? site.title.slice(0, 15) + '...' : site.title;
                      }
                    })()}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
        {categories.map((cat, categoryIndex) => (
          <div 
            key={cat.id}
            data-user-category-id={cat.id}
            data-user-category-index={categoryIndex}
            className={[
              'category-column',
              dragState?.type === 'category' && dragState.categoryId === cat.id ? 'is-dragging' : '',
              !isCancelZoneActive &&
              dropTarget?.type === 'bookmark-slot' &&
              dropTarget.categoryId === cat.id
                ? 'bookmark-drop-category'
                : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="category-header">
              {editing.type === 'category' && editing.categoryId === cat.id ? (
                <div className="category-edit-form">
                  <input
                    ref={inputRef}
                    type="text"
                    className="inline-input"
                    value={editing.value}
                    onChange={e => setEditing({ ...editing, value: e.target.value })}
                  />
                  <div className="edit-actions">
                    <button className="action-btn-mini" onClick={handleSave} title="Save category name">
                      <Check size={12} />
                    </button>
                    <button className="action-btn-mini" onClick={handleCancelEdit} title="Cancel category edit">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <span className="category-name category-name-user" title={cat.name}>{cat.name}</span>
              )}
              
              {isEditMode && editing.type !== 'category' && (
                <div className="category-actions">
                  <button
                    className="action-btn-mini drag-handle"
                    onPointerDown={(event) =>
                      startPointerDrag(
                        event,
                        { type: 'category', categoryId: cat.id, label: cat.name },
                        { type: 'category-slot', index: categoryIndex }
                      )
                    }
                    title="Drag to reorder category"
                    aria-label={`Reorder ${cat.name} category`}
                  >
                    <GripVertical size={12} />
                  </button>
                  <button 
                    className="action-btn-mini"
                    onClick={(e) => startNewBookmark(e, cat.id)}
                    title="Add bookmark"
                  >
                    <Plus size={12} />
                  </button>
                  <button 
                    className="action-btn-mini"
                    onClick={(e) => startEditCategory(e, cat)}
                    title="Edit category"
                  >
                    <Pencil size={12} />
                  </button>
                  <button 
                    className="action-btn-mini action-btn-danger"
                    onClick={(e) => handleDeleteCategory(e, cat.id)}
                    title="Delete category"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
            
            <div className={`bookmark-list-shell${cat.bookmarks.length > 4 ? ' bookmark-list-shell-scrollable' : ''}`}>
              <div
                data-bookmark-list
                className={`bookmarks-list bookmarks-list-fixed${cat.bookmarks.length > 4 ? ` bookmarks-list-scrollable${scrollHintClass(bookmarkScrollHints[cat.id] ?? { up: false, down: true })}` : ''}${editing.categoryId === cat.id && (editing.type === 'bookmark' || editing.type === 'new-bookmark') ? ' bookmarks-list-editing' : ''}`}
                onScroll={cat.bookmarks.length > 4 ? (event) => handleBookmarkScroll(cat.id, event) : undefined}
              >
              {cat.bookmarks.map((bookmark, bookmarkIndex) => (
                <div
                  key={bookmark.id}
                  data-bookmark-index={bookmarkIndex}
                  className={[
                    'bookmark-item',
                    dragState?.type === 'bookmark' && dragState.bookmarkId === bookmark.id ? 'is-dragging' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {editing.type === 'bookmark' && editing.bookmarkId === bookmark.id ? (
                    <div className="bookmark-edit-form">
                      <input
                        ref={inputRef}
                        type="text"
                        className="inline-input"
                        placeholder="Title"
                        value={editing.value}
                        onChange={e => setEditing({ ...editing, value: e.target.value })}
                      />
                      <input
                        type="text"
                        className="inline-input"
                        placeholder="URL"
                        value={editing.url}
                        onChange={e => setEditing({ ...editing, url: e.target.value })}
                      />
                      <div className="edit-actions">
                        <button className="action-btn-mini" onClick={handleSave}>
                          <Check size={12} />
                        </button>
                        <button className="action-btn-mini" onClick={handleCancelEdit}>
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <a
                        href={isSafeUrl(bookmark.url) ? bookmark.url : '#'}
                        className="bookmark-link"
                        onClick={handleNavigate}
                      >
                        <SiteIcon url={bookmark.url} title={bookmark.title} />
                        <span className="bookmark-title" title={bookmark.title}>{bookmark.title}</span>
                      </a>
                      {isEditMode && (
                        <div className="bookmark-actions">
                          <button
                            className="action-btn-mini drag-handle"
                            onPointerDown={(event) =>
                              startPointerDrag(
                                event,
                                {
                                  type: 'bookmark',
                                  categoryId: cat.id,
                                  bookmarkId: bookmark.id,
                                  label: bookmark.title,
                                },
                                {
                                  type: 'bookmark-slot',
                                  categoryId: cat.id,
                                  index: bookmarkIndex,
                                }
                              )
                            }
                            title="Drag to reorder bookmark"
                            aria-label={`Reorder ${bookmark.title}`}
                          >
                            <GripVertical size={10} />
                          </button>
                          <button 
                            className="action-btn-mini"
                            onClick={(e) => startEditBookmark(e, cat.id, bookmark)}
                          >
                            <Pencil size={10} />
                          </button>
                          <button 
                            className="action-btn-mini action-btn-danger"
                            onClick={(e) => handleDeleteBookmark(e, cat.id, bookmark.id)}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              
              {editing.type === 'new-bookmark' && editing.categoryId === cat.id && (
                <div className="bookmark-edit-form">
                  <input
                    ref={inputRef}
                    type="text"
                    className="inline-input"
                    placeholder="Title"
                    value={editing.value}
                    onChange={e => setEditing({ ...editing, value: e.target.value })}
                  />
                  <input
                    type="text"
                    className="inline-input"
                    placeholder="URL"
                    value={editing.url}
                    onChange={e => setEditing({ ...editing, url: e.target.value })}
                  />
                  <div className="edit-actions">
                    <button className="action-btn-mini" onClick={handleSave}>
                      <Check size={12} />
                    </button>
                    <button className="action-btn-mini" onClick={handleCancelEdit}>
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}
              </div>
              {cat.bookmarks.length > 4 && (
                <div className="bookmark-scroll-indicator-gutter" aria-hidden="true">
                  <div className="bookmark-scroll-indicator">
                    {(bookmarkScrollHints[cat.id]?.up ?? false) && <ChevronUp size={12} />}
                  </div>
                  <div className="bookmark-scroll-indicator">
                    {(bookmarkScrollHints[cat.id]?.down ?? true) && <ChevronDown size={12} />}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        </div>

        {dragState && (
          <div className="drag-drop-slot-layer" aria-hidden="true">
            {dropSlotVisuals.map(visual => (
              <div
                key={visual.key}
                className="drag-drop-slot-hint"
                style={{
                  left: visual.geometry.left,
                  top: visual.geometry.top,
                  width: visual.geometry.width,
                  height: visual.geometry.height,
                }}
              />
            ))}
            <div
              ref={dropIndicatorRef}
              className="drag-drop-indicator"
            />
          </div>
        )}

        <div className="categories-scroll-indicator-row categories-scroll-indicator-row-bottom" aria-hidden="true">
          {categoryScrollHint.down && <ChevronDown size={16} />}
        </div>
      </div>

      {dragState && (
        <div
          ref={dragOverlayRef}
          className="bookmark-drag-overlay"
          aria-hidden="true"
        >
          <GripVertical size={12} />
          <span>{dragState.label}</span>
        </div>
      )}
    </div>
  )
}
