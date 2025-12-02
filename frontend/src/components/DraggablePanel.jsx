import { useState, useRef, useEffect } from 'react'
import { X, Move, Minimize2, Maximize2 } from 'lucide-react'

const SNAP_THRESHOLD = 50 // pixels from edge to trigger snap

export default function DraggablePanel({
  title,
  children,
  initialPosition = { x: 100, y: 100 },
  initialSize = { width: 400, height: 300 },
  onClose,
  defaultCollapsed = false,
  snapTargetRef = null // Reference to the PNG viewer element to snap near
}) {
  const [position, setPosition] = useState(initialPosition)
  const [size, setSize] = useState(initialSize)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showSnapZones, setShowSnapZones] = useState(false)
  const panelRef = useRef(null)

  // Add resize observer to trigger Plotly redraw when panel is resized
  useEffect(() => {
    if (!panelRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      // Trigger window resize event so Plotly redraws
      window.dispatchEvent(new Event('resize'))
    })

    resizeObserver.observe(panelRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  const getSnapPosition = (newX, newY) => {
    if (!snapTargetRef || !snapTargetRef.current) return { x: newX, y: newY }

    const snapTarget = snapTargetRef.current.getBoundingClientRect()
    const panelWidth = size.width
    const panelHeight = size.height

    // Check if panel is near left edge of snap target
    const distToLeft = Math.abs(newX + panelWidth - snapTarget.left)
    if (distToLeft < SNAP_THRESHOLD) {
      return {
        x: snapTarget.left - panelWidth - 10, // 10px gap
        y: newY
      }
    }

    // Check if panel is near right edge of snap target
    const distToRight = Math.abs(newX - snapTarget.right)
    if (distToRight < SNAP_THRESHOLD) {
      return {
        x: snapTarget.right + 10, // 10px gap
        y: newY
      }
    }

    return { x: newX, y: newY }
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.x
        const dy = e.clientY - dragStart.y
        const newX = position.x + dx
        const newY = position.y + dy

        // Calculate snap position
        const snappedPos = getSnapPosition(newX, newY)

        setPosition(snappedPos)
        setDragStart({ x: e.clientX, y: e.clientY })
      } else if (isResizing) {
        const dx = e.clientX - dragStart.x
        const dy = e.clientY - dragStart.y
        setSize(prev => ({
          width: Math.max(300, prev.width + dx),
          height: Math.max(200, prev.height + dy)
        }))
        setDragStart({ x: e.clientX, y: e.clientY })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
      setShowSnapZones(false)
    }

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, dragStart, position, size, snapTargetRef])

  const handleMouseDown = (e) => {
    if (e.target.closest('.panel-header')) {
      setIsDragging(true)
      setDragStart({ x: e.clientX, y: e.clientY })
      setShowSnapZones(true)
      e.preventDefault()
    }
  }

  const handleResizeStart = (e) => {
    setIsResizing(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: collapsed ? 'auto' : `${size.width}px`,
        height: collapsed ? 'auto' : `${size.height}px`,
        zIndex: 1000,
        backgroundColor: 'white',
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div
        className="panel-header"
        onMouseDown={handleMouseDown}
        style={{
          padding: '0.75rem 1rem',
          backgroundColor: '#667eea',
          color: 'white',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Move size={16} />
          <span style={{ fontWeight: '600' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center'
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '1rem'
          }}>
            {children}
          </div>

          <div
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: '20px',
              height: '20px',
              cursor: 'nwse-resize',
              background: 'linear-gradient(135deg, transparent 0%, transparent 50%, #667eea 50%, #667eea 100%)',
              borderBottomRightRadius: '8px'
            }}
            title="Drag to resize"
          />
        </>
      )}
    </div>
  )
}
