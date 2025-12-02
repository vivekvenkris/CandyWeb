import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Maximize2, GripVertical } from 'lucide-react'

export default function ResizableAccordionContainer({ panels, containerHeight = '100%' }) {
  const [panelStates, setPanelStates] = useState(
    panels.map((p, i) => ({
      id: p.id,
      isOpen: p.defaultOpen || false,
      order: i,
      height: p.defaultHeight || 300 // Default height in pixels
    }))
  )
  const [draggedId, setDraggedId] = useState(null)
  const [resizingId, setResizingId] = useState(null)
  const [resizeStartY, setResizeStartY] = useState(0)
  const [resizeStartHeight, setResizeStartHeight] = useState(0)

  const HEADER_HEIGHT = 48
  const MARGIN_HEIGHT = 8
  const RESIZE_HANDLE_HEIGHT = 8

  const togglePanel = (id) => {
    setPanelStates(prev => prev.map(p =>
      p.id === id ? { ...p, isOpen: !p.isOpen } : p
    ))
  }

  // Drag and drop for reordering
  const handleDragStart = (e, id) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, targetId) => {
    e.preventDefault()
    if (draggedId === targetId) return

    setPanelStates(prev => {
      const draggedIndex = prev.findIndex(p => p.id === draggedId)
      const targetIndex = prev.findIndex(p => p.id === targetId)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      const newStates = [...prev]
      const [draggedItem] = newStates.splice(draggedIndex, 1)
      newStates.splice(targetIndex, 0, draggedItem)

      return newStates.map((p, i) => ({ ...p, order: i }))
    })
  }

  const handleDragEnd = () => {
    setDraggedId(null)
  }

  // Resize handling
  const handleResizeStart = (e, id) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingId(id)
    setResizeStartY(e.clientY)
    const panel = panelStates.find(p => p.id === id)
    setResizeStartHeight(panel.height)
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizingId) return

      const deltaY = e.clientY - resizeStartY
      const newHeight = Math.max(100, resizeStartHeight + deltaY) // Min 100px

      setPanelStates(prev => prev.map(p =>
        p.id === resizingId ? { ...p, height: newHeight } : p
      ))

      // Trigger Plotly resize
      window.dispatchEvent(new Event('resize'))
    }

    const handleMouseUp = () => {
      if (resizingId) {
        setResizingId(null)
        window.dispatchEvent(new Event('resize'))
      }
    }

    if (resizingId) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingId, resizeStartY, resizeStartHeight])

  const sortedPanels = panelStates
    .sort((a, b) => a.order - b.order)
    .map(state => {
      const panel = panels.find(p => p.id === state.id)
      return { ...panel, ...state }
    })

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: containerHeight,
      overflow: 'auto'
    }}>
      {sortedPanels.map((panel, index) => {
        const isOpen = panel.isOpen
        const isLast = index === sortedPanels.length - 1

        return (
          <div
            key={panel.id}
            draggable
            onDragStart={(e) => handleDragStart(e, panel.id)}
            onDragOver={(e) => handleDragOver(e, panel.id)}
            onDragEnd={handleDragEnd}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              marginBottom: isLast ? 0 : MARGIN_HEIGHT + 'px',
              backgroundColor: 'white',
              overflow: 'hidden',
              opacity: draggedId === panel.id ? 0.5 : 1,
              cursor: draggedId ? 'grabbing' : 'grab',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0
            }}
          >
            {/* Header */}
            <div
              style={{
                height: HEADER_HEIGHT + 'px',
                padding: '0.75rem 1rem',
                backgroundColor: isOpen ? '#f3f4f6' : 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none',
                borderBottom: isOpen ? '1px solid #e5e7eb' : 'none',
                flexShrink: 0
              }}
              onClick={() => togglePanel(panel.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
                <GripVertical size={16} style={{ color: '#9ca3af', cursor: 'grab' }} />
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <span>{panel.title}</span>
              </div>
              {panel.onPopOut && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    panel.onPopOut()
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#667eea'
                  }}
                  title="Pop out to floating window"
                >
                  <Maximize2 size={16} />
                </button>
              )}
            </div>

            {/* Content */}
            {isOpen && (
              <>
                <div style={{
                  height: panel.height + 'px',
                  overflow: 'auto',
                  padding: '1rem',
                  flexShrink: 0
                }}>
                  {panel.content}
                </div>

                {/* Resize Handle */}
                <div
                  onMouseDown={(e) => handleResizeStart(e, panel.id)}
                  style={{
                    height: RESIZE_HANDLE_HEIGHT + 'px',
                    cursor: 'ns-resize',
                    background: resizingId === panel.id ? '#667eea' : '#e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                    transition: resizingId ? 'none' : 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!resizingId) e.currentTarget.style.background = '#cbd5e1'
                  }}
                  onMouseLeave={(e) => {
                    if (!resizingId) e.currentTarget.style.background = '#e5e7eb'
                  }}
                >
                  <div style={{
                    width: '40px',
                    height: '3px',
                    background: 'white',
                    borderRadius: '2px'
                  }} />
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
