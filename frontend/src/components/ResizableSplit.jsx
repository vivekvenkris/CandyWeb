import { useState, useRef, useEffect } from 'react'

export default function ResizableSplit({ left, right, defaultLeftWidth = 50 }) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef(null)

  const handleMouseDown = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return

      const container = containerRef.current
      const containerRect = container.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

      // Clamp between 20% and 80%
      const clampedWidth = Math.max(20, Math.min(80, newLeftWidth))
      setLeftWidth(clampedWidth)

      // Trigger window resize event so Plotly plots redraw
      window.dispatchEvent(new Event('resize'))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Final resize trigger when drag ends
      window.dispatchEvent(new Event('resize'))
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        width: '100%',
        minHeight: '100%',
        position: 'relative',
        userSelect: isDragging ? 'none' : 'auto',
        alignItems: 'stretch'
      }}
    >
      <div style={{ width: `${leftWidth}%`, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {left}
      </div>

      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '8px',
          cursor: 'col-resize',
          background: isDragging ? '#667eea' : '#e5e7eb',
          transition: isDragging ? 'none' : 'background 0.2s',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10,
          alignSelf: 'stretch'
        }}
        onMouseEnter={(e) => {
          if (!isDragging) e.currentTarget.style.background = '#cbd5e1'
        }}
        onMouseLeave={(e) => {
          if (!isDragging) e.currentTarget.style.background = '#e5e7eb'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '3px',
            height: '40px',
            background: 'white',
            borderRadius: '2px',
            pointerEvents: 'none'
          }}
        />
      </div>

      <div style={{ width: `${100 - leftWidth}%`, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {right}
      </div>
    </div>
  )
}
