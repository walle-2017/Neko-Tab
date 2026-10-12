import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderCog } from 'lucide-react'
import { SiteIcon } from './SiteIcon'

export function BrowserBookmarks() {
  const [folders, setFolders] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isExpanded, setIsExpanded] = useState(true)
  const [error, setError] = useState('')
  const initialized = useRef(false)

  useEffect(() => {
    let mounted = true

    const refresh = () => {
      chrome.bookmarks.getTree((tree) => {
        if (!mounted) return
        if (chrome.runtime.lastError) {
          setError('Unable to read browser bookmarks.')
          return
        }

        const roots = tree.flatMap(node => node.children ?? [])
        setFolders(roots)
        setError('')

        if (!initialized.current) {
          initialized.current = true
          setExpandedIds(new Set(roots.map(node => node.id)))
        }
      })
    }

    refresh()
    chrome.bookmarks.onCreated.addListener(refresh)
    chrome.bookmarks.onRemoved.addListener(refresh)
    chrome.bookmarks.onChanged.addListener(refresh)
    chrome.bookmarks.onMoved.addListener(refresh)
    chrome.bookmarks.onChildrenReordered.addListener(refresh)
    chrome.bookmarks.onImportEnded.addListener(refresh)

    return () => {
      mounted = false
      chrome.bookmarks.onCreated.removeListener(refresh)
      chrome.bookmarks.onRemoved.removeListener(refresh)
      chrome.bookmarks.onChanged.removeListener(refresh)
      chrome.bookmarks.onMoved.removeListener(refresh)
      chrome.bookmarks.onChildrenReordered.removeListener(refresh)
      chrome.bookmarks.onImportEnded.removeListener(refresh)
    }
  }, [])

  const openTab = (url: string) => {
    void chrome.tabs.create({ url, active: true }).catch(() => {
      setError('Unable to open this bookmark.')
    })
  }

  const toggleFolder = (id: string) => {
    setExpandedIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderNode = (node: chrome.bookmarks.BookmarkTreeNode, depth: number): ReactNode => {
    const isFolder = !node.url
    const expanded = expandedIds.has(node.id)

    return (
      <div key={node.id}>
        {isFolder ? (
          <button
            type="button"
            className="browser-bookmarks-item browser-bookmarks-folder"
            style={{ paddingLeft: 8 + depth * 16 }}
            title={node.title}
            aria-expanded={expanded}
            onClick={() => toggleFolder(node.id)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Folder size={15} />
            <span className="browser-bookmarks-item-title">{node.title || 'Bookmarks'}</span>
          </button>
        ) : (
          <button
            type="button"
            className="browser-bookmarks-item browser-bookmarks-link"
            style={{ paddingLeft: 30 + depth * 16 }}
            title={node.title || node.url}
            onClick={() => openTab(node.url!)}
          >
            <SiteIcon url={node.url!} title={node.title || node.url!} size={15} />
            <span className="browser-bookmarks-item-title">{node.title || node.url}</span>
          </button>
        )}
        {isFolder && expanded && node.children?.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  const managerUrl = /Edg\//.test(navigator.userAgent)
    ? 'edge://favorites/'
    : 'chrome://bookmarks/'

  return (
    <section className={`browser-bookmarks-panel${isExpanded ? '' : ' is-collapsed'}`} aria-label="Browser Bookmarks">
      <div className="browser-bookmarks-header">
        <button
          type="button"
          className="bookmarks-toggle browser-bookmarks-toggle"
          onClick={() => setIsExpanded(previous => !previous)}
          aria-expanded={isExpanded}
          aria-controls="browser-bookmarks-tree"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="quick-links-title">BROWSER BOOKMARKS</span>
        </button>
        <button
          type="button"
          className="action-btn-mini browser-bookmarks-manage"
          onClick={() => openTab(managerUrl)}
          title="Manage bookmarks in browser"
          aria-label="Manage bookmarks in browser"
        >
          <FolderCog size={14} />
        </button>
      </div>
      {isExpanded && (
        <div className="browser-bookmarks-tree" id="browser-bookmarks-tree">
          {error && <p className="browser-bookmarks-message" role="alert">{error}</p>}
          {!error && folders.length === 0 && <p className="browser-bookmarks-message">No bookmarks found.</p>}
          {folders.map(folder => renderNode(folder, 0))}
        </div>
      )}
    </section>
  )
}
