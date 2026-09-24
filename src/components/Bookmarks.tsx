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
  onReorderCategories: (
    activeCategoryId: string,
    overCategoryId: string,
    position: 'before' | 'after'
  ) => void
  onMoveBookmark: (
    bookmarkId: string,
    sourceCategoryId: string,
    targetCategoryId: string,
    targetBookmarkId?: string,
    position?: 'before' | 'after'
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
  | { type: 'category'; categoryId: string }
  | { type: 'bookmark'; categoryId: string; bookmarkId: string }
  | null

type DropTarget =
  | { type: 'category'; categoryId: string; position: 'before' | 'after' }
  | {
      type: 'bookmark'
      categoryId: string
      bookmarkId?: string
      position: 'before' | 'after'
    }
  | null

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

  const resetDragState = () => {
    setDragState(null)
    setDropTarget(null)
  }

  const autoScroll = (element: HTMLElement | null, clientY: number, threshold = 24) => {
    if (!element || element.scrollHeight <= element.clientHeight) return

    const rect = element.getBoundingClientRect()
    if (clientY < rect.top + threshold) {
      element.scrollTop -= 8
    } else if (clientY > rect.bottom - threshold) {
      element.scrollTop += 8
    }
  }

  const startCategoryDrag = (event: React.DragEvent<HTMLButtonElement>, categoryId: string) => {
    if (editing.type) {
      event.preventDefault()
      return
    }

    setDragState({ type: 'category', categoryId })
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `category:${categoryId}`)

    const dragImage = event.currentTarget.closest('.category-column') as HTMLElement | null
    if (dragImage) {
      event.dataTransfer.setDragImage(dragImage, 16, 16)
    }
  }

  const startBookmarkDrag = (
    event: React.DragEvent<HTMLButtonElement>,
    categoryId: string,
    bookmarkId: string
  ) => {
    if (editing.type) {
      event.preventDefault()
      return
    }

    setDragState({ type: 'bookmark', categoryId, bookmarkId })
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `bookmark:${categoryId}:${bookmarkId}`)

    const dragImage = event.currentTarget.closest('.bookmark-item') as HTMLElement | null
    if (dragImage) {
      event.dataTransfer.setDragImage(dragImage, 12, 12)
    }
  }

  const handleCategoryDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: string
  ) => {
    if (dragState?.type !== 'category' || dragState.categoryId === categoryId) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    autoScroll(categoriesGridRef.current, event.clientY, 36)

    const rect = event.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const nearSameRow = Math.abs(event.clientY - centerY) < rect.height * 0.3
    const position =
      nearSameRow
        ? event.clientX < centerX ? 'before' : 'after'
        : event.clientY < centerY ? 'before' : 'after'

    setDropTarget({ type: 'category', categoryId, position })
  }

  const handleCategoryDrop = (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: string
  ) => {
    if (dragState?.type !== 'category' || dragState.categoryId === categoryId) return

    event.preventDefault()
    const target =
      dropTarget?.type === 'category' && dropTarget.categoryId === categoryId
        ? dropTarget
        : { type: 'category' as const, categoryId, position: 'before' as const }

    onReorderCategories(dragState.categoryId, categoryId, target.position)
    resetDragState()
  }

  const handleBookmarkDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: string,
    bookmarkId: string
  ) => {
    if (dragState?.type !== 'bookmark') return

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'

    const list = event.currentTarget.closest('.bookmarks-list') as HTMLElement | null
    autoScroll(list, event.clientY, 18)
    autoScroll(categoriesGridRef.current, event.clientY, 36)

    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropTarget({ type: 'bookmark', categoryId, bookmarkId, position })
  }

  const handleBookmarkDrop = (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: string,
    bookmarkId: string
  ) => {
    if (dragState?.type !== 'bookmark') return

    event.preventDefault()
    event.stopPropagation()

    const target =
      dropTarget?.type === 'bookmark' &&
      dropTarget.categoryId === categoryId &&
      dropTarget.bookmarkId === bookmarkId
        ? dropTarget
        : { type: 'bookmark' as const, categoryId, bookmarkId, position: 'before' as const }

    onMoveBookmark(
      dragState.bookmarkId,
      dragState.categoryId,
      categoryId,
      bookmarkId,
      target.position
    )
    resetDragState()
  }

  const handleBookmarkListDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: string
  ) => {
    if (dragState?.type !== 'bookmark') return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    autoScroll(event.currentTarget, event.clientY, 18)
    autoScroll(categoriesGridRef.current, event.clientY, 36)
    setDropTarget({ type: 'bookmark', categoryId, position: 'after' })
  }

  const handleBookmarkListDrop = (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: string
  ) => {
    if (dragState?.type !== 'bookmark') return

    event.preventDefault()
    onMoveBookmark(
      dragState.bookmarkId,
      dragState.categoryId,
      categoryId,
      undefined,
      'after'
    )
    resetDragState()
  }

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
    <div className="bookmarks-container">
      <div className="bookmarks-header">
        <div 
          className="bookmarks-toggle"
          onClick={onToggleShowBookmarks}
        >
          {showBookmarks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <h3 className="quick-links-title">QUICK LINKS</h3>
        </div>
        <button 
          className="action-btn-mini"
          style={{ opacity: isEditMode ? 1 : 0.5 }}
          onClick={handleEditModeToggle}
          title={isEditMode ? "Done editing" : "Edit bookmarks"}
        >
          {isEditMode ? <Check size={14} /> : <Pencil size={14} />}
        </button>
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
          <div className="category-column">
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
        {categories.map(cat => (
          <div 
            key={cat.id}
            className={[
              'category-column',
              dragState?.type === 'category' && dragState.categoryId === cat.id ? 'is-dragging' : '',
              dropTarget?.type === 'category' && dropTarget.categoryId === cat.id
                ? `category-drop-${dropTarget.position}`
                : '',
              dropTarget?.type === 'bookmark' && dropTarget.categoryId === cat.id
                ? 'bookmark-drop-category'
                : '',
            ].filter(Boolean).join(' ')}
            onDragOver={(event) => handleCategoryDragOver(event, cat.id)}
            onDrop={(event) => handleCategoryDrop(event, cat.id)}
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
                    draggable={!editing.type}
                    onDragStart={(event) => startCategoryDrag(event, cat.id)}
                    onDragEnd={resetDragState}
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
                className={`bookmarks-list bookmarks-list-fixed${cat.bookmarks.length > 4 ? ` bookmarks-list-scrollable${scrollHintClass(bookmarkScrollHints[cat.id] ?? { up: false, down: true })}` : ''}${editing.categoryId === cat.id && (editing.type === 'bookmark' || editing.type === 'new-bookmark') ? ' bookmarks-list-editing' : ''}${dropTarget?.type === 'bookmark' && dropTarget.categoryId === cat.id && !dropTarget.bookmarkId ? ' bookmark-list-drop-end' : ''}`}
                onScroll={cat.bookmarks.length > 4 ? (event) => handleBookmarkScroll(cat.id, event) : undefined}
                onDragOver={(event) => handleBookmarkListDragOver(event, cat.id)}
                onDrop={(event) => handleBookmarkListDrop(event, cat.id)}
              >
              {cat.bookmarks.map(bookmark => (
                <div
                  key={bookmark.id}
                  className={[
                    'bookmark-item',
                    dragState?.type === 'bookmark' && dragState.bookmarkId === bookmark.id ? 'is-dragging' : '',
                    dropTarget?.type === 'bookmark' &&
                    dropTarget.categoryId === cat.id &&
                    dropTarget.bookmarkId === bookmark.id
                      ? `bookmark-drop-${dropTarget.position}`
                      : '',
                  ].filter(Boolean).join(' ')}
                  onDragOver={(event) => handleBookmarkDragOver(event, cat.id, bookmark.id)}
                  onDrop={(event) => handleBookmarkDrop(event, cat.id, bookmark.id)}
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
                            draggable={!editing.type}
                            onDragStart={(event) => startBookmarkDrag(event, cat.id, bookmark.id)}
                            onDragEnd={resetDragState}
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
        <div className="categories-scroll-indicator-row categories-scroll-indicator-row-bottom" aria-hidden="true">
          {categoryScrollHint.down && <ChevronDown size={16} />}
        </div>
      </div>
    </div>
  )
}
