import { useState } from 'react'
import { ChevronDown, ChevronUp, Maximize2, GripVertical } from 'lucide-react'

export default function FlexibleAccordionContainer({ panels, containerHeight = '100%' }) {
  const [panelStates, setPanelStates] = useState(
    panels.map((p, i) => ({ id: p.id, isOpen: p.defaultOpen || false, order: i }))
  )
  const [draggedId, setDraggedId] = useState(null)

  const openCount = panelStates.filter(p => p.isOpen).length
  const closedCount = panelStates.length - openCount

  // Calculate heights
  const HEADER_HEIGHT = 48 // Height of each accordion header in px
  const MARGIN_HEIGHT = 8 // Margin between accordions
  const totalHeaderHeight = panelStates.length * HEADER_HEIGHT
  const totalMarginHeight = (panelStates.length - 1) * MARGIN_HEIGHT

  // Available height for content (distributed among open panels)
  const availableContentHeight = `calc(${containerHeight} - ${totalHeaderHeight}px - ${totalMarginHeight}px)`

  const togglePanel = (id) => {
    setPanelStates(prev => prev.map(p =>
      p.id === id ? { ...p, isOpen: !p.isOpen } : p
    ))
  }

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
      overflow: 'hidden'
    }}>
      {sortedPanels.map((panel) => {
        const isOpen = panel.isOpen
        const contentHeight = openCount > 0
          ? `calc(${availableContentHeight} / ${openCount})`
          : '0px'

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
              marginBottom: MARGIN_HEIGHT + 'px',
              backgroundColor: 'white',
              overflow: 'hidden',
              opacity: draggedId === panel.id ? 0.5 : 1,
              cursor: 'grab',
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
              <div style={{
                height: contentHeight,
                overflow: 'auto',
                padding: '1rem',
                flexShrink: 0
              }}>
                {panel.content}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
