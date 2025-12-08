import { useEffect, useRef, memo, useState } from 'react'

const BeamMapCanvas = memo(function BeamMapCanvas({ candidate, metaFile }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [hoveredBeam, setHoveredBeam] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Pan and zoom state
  const [transform, setTransform] = useState({ offsetX: 0, offsetY: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      drawBeamMap()
    }

    const drawBeamMap = () => {
      const ctx = canvas.getContext('2d')
      const width = canvas.width
      const height = canvas.height

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      if (!metaFile || !metaFile.beams) {
        ctx.fillStyle = '#6b7280'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('No beam data available', width / 2, height / 2)
        return
      }

      const beams = Object.values(metaFile.beams)
      if (beams.length === 0) return

      // Calculate bounds
      const ras = beams.map(b => b.ra * 15.0)
      const decs = beams.map(b => b.dec)
      const minRa = Math.min(...ras)
      const maxRa = Math.max(...ras)
      const minDec = Math.min(...decs)
      const maxDec = Math.max(...decs)

      // Add 10% padding
      const raRange = maxRa - minRa
      const decRange = maxDec - minDec
      const padding = 0.1
      const plotMinRa = minRa - padding * raRange
      const plotMaxRa = maxRa + padding * raRange
      const plotMinDec = minDec - padding * decRange
      const plotMaxDec = maxDec + padding * decRange

      // Coordinate transformation with pan and zoom
      const toCanvasX = (ra) => {
        const x = ((ra - plotMinRa) / (plotMaxRa - plotMinRa)) * width
        return x * transform.scale + transform.offsetX
      }
      const toCanvasY = (dec) => {
        const y = height - ((dec - plotMinDec) / (plotMaxDec - plotMinDec)) * height
        return y * transform.scale + transform.offsetY
      }

      // Inverse transformation (canvas to world coordinates)
      const fromCanvasX = (canvasX) => {
        const x = (canvasX - transform.offsetX) / transform.scale
        return plotMinRa + (x / width) * (plotMaxRa - plotMinRa)
      }
      const fromCanvasY = (canvasY) => {
        const y = (canvasY - transform.offsetY) / transform.scale
        return plotMaxDec - (y / height) * (plotMaxDec - plotMinDec)
      }

      // Draw grid and axes FIRST (before beams)
      ctx.strokeStyle = '#9ca3af'  // Darker gray for better visibility
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])

      // Draw vertical grid lines (RA) - x-axis
      const raStep = (plotMaxRa - plotMinRa) / 10
      for (let i = 0; i <= 10; i++) {
        const ra = plotMinRa + i * raStep
        const x = toCanvasX(ra)
        if (x >= -50 && x <= width + 50) {
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
          ctx.stroke()

          // Draw tick label on bottom (inside plot area to avoid clipping)
          if (x >= 0 && x <= width) {
            ctx.fillStyle = '#1f2937'
            ctx.font = '11px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'
            ctx.fillText(ra.toFixed(1), x, height - 3)
          }
        }
      }

      // Draw horizontal grid lines (DEC) - y-axis
      const decStep = (plotMaxDec - plotMinDec) / 10
      for (let i = 0; i <= 10; i++) {
        const dec = plotMinDec + i * decStep
        const y = toCanvasY(dec)
        if (y >= -50 && y <= height + 50) {
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
          ctx.stroke()

          // Draw tick label on left side (inside plot area)
          if (y >= 0 && y <= height) {
            ctx.fillStyle = '#1f2937'
            ctx.font = '11px sans-serif'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.fillText(dec.toFixed(1), 5, y)
          }
        }
      }

      ctx.setLineDash([])

      // Get current beam info
      const currentBeamName = candidate?.beam_name
      const currentBeamData = currentBeamName ? metaFile.beams[currentBeamName] : null
      const neighborBeamNames = currentBeamData?.neighbour_beams || []

      // Draw all beams (on top of grid)
      beams.forEach(beam => {
        const raDeg = beam.ra * 15.0
        const isCurrentBeam = candidate && beam.name === currentBeamName
        const isNeighbor = candidate && neighborBeamNames.includes(beam.name)
        const isHovered = hoveredBeam === beam.name

        // Draw ellipse
        if (beam.ellipse_x && beam.ellipse_y && beam.ellipse_angle !== null) {
          // Generate ellipse points
          const numPoints = 50
          const points = []
          for (let i = 0; i <= numPoints; i++) {
            const t = (i / numPoints) * 2 * Math.PI
            const x = beam.ellipse_x * Math.cos(t)
            const y = beam.ellipse_y * Math.sin(t)

            const cosAngle = Math.cos(beam.ellipse_angle)
            const sinAngle = Math.sin(beam.ellipse_angle)
            const xRot = x * cosAngle - y * sinAngle
            const yRot = x * sinAngle + y * cosAngle

            const raPoint = raDeg + xRot
            const decPoint = beam.dec + yRot

            points.push({
              x: toCanvasX(raPoint),
              y: toCanvasY(decPoint)
            })
          }

          // Draw filled ellipse for current beam
          if (isCurrentBeam) {
            ctx.beginPath()
            ctx.moveTo(points[0].x, points[0].y)
            for (let i = 1; i < points.length; i++) {
              ctx.lineTo(points[i].x, points[i].y)
            }
            ctx.closePath()
            ctx.fillStyle = 'rgba(255, 99, 71, 0.2)'
            ctx.fill()
          }

          // Draw ellipse outline
          ctx.beginPath()
          ctx.moveTo(points[0].x, points[0].y)
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y)
          }
          ctx.closePath()

          if (isCurrentBeam) {
            ctx.strokeStyle = '#ff6347'
            ctx.lineWidth = isHovered ? 4 : 3
          } else if (isNeighbor) {
            ctx.strokeStyle = '#4682b4'
            ctx.lineWidth = isHovered ? 3 : 2
          } else {
            ctx.strokeStyle = '#9ca3af'
            ctx.lineWidth = isHovered ? 2 : 1
          }
          ctx.stroke()
        }

        // Center markers removed as requested

        // Beam labels are shown as tooltips on hover instead of being drawn on canvas
      })

      // Draw boresight if available
      if (metaFile.boresight) {
        const boresightRaDeg = metaFile.boresight.ra * 15.0
        const bsX = toCanvasX(boresightRaDeg)
        const bsY = toCanvasY(metaFile.boresight.dec)

        // Draw cross marker
        ctx.strokeStyle = '#8b5cf6'
        ctx.lineWidth = 2
        const crossSize = 8
        ctx.beginPath()
        ctx.moveTo(bsX - crossSize, bsY)
        ctx.lineTo(bsX + crossSize, bsY)
        ctx.moveTo(bsX, bsY - crossSize)
        ctx.lineTo(bsX, bsY + crossSize)
        ctx.stroke()

        ctx.fillStyle = '#8b5cf6'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText('Boresight', bsX, bsY + 12)
      }

      // Draw axis spines (border frame) on top
      ctx.strokeStyle = '#374151'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.rect(0, 0, width, height)
      ctx.stroke()

      // Draw axis labels on top
      ctx.fillStyle = '#000'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('RA (degrees)', width / 2, height - 5)

      ctx.save()
      ctx.translate(15, height / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.fillText('DEC (degrees)', 0, 0)
      ctx.restore()
    }

    // Mouse wheel handler for zoom
    const handleWheel = (e) => {
      e.preventDefault()

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Zoom factor
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
      const newScale = Math.max(0.5, Math.min(10, transform.scale * zoomFactor))

      // Zoom towards mouse position
      const scaleChange = newScale / transform.scale
      const newOffsetX = mouseX - (mouseX - transform.offsetX) * scaleChange
      const newOffsetY = mouseY - (mouseY - transform.offsetY) * scaleChange

      setTransform({
        offsetX: newOffsetX,
        offsetY: newOffsetY,
        scale: newScale
      })
    }

    // Mouse down handler for pan start
    const handleMouseDown = (e) => {
      if (e.button === 0) { // Left click
        setIsPanning(true)
        setPanStart({ x: e.clientX, y: e.clientY })
      }
    }

    // Mouse move handler for pan and hover detection
    const handleMouseMove = (e) => {
      if (!metaFile || !metaFile.beams) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Handle panning
      if (isPanning) {
        const dx = e.clientX - panStart.x
        const dy = e.clientY - panStart.y

        setTransform(prev => ({
          ...prev,
          offsetX: prev.offsetX + dx,
          offsetY: prev.offsetY + dy
        }))

        setPanStart({ x: e.clientX, y: e.clientY })
        return // Skip hover detection while panning
      }

      setMousePos({ x: e.clientX, y: e.clientY })

      const beams = Object.values(metaFile.beams)
      const ras = beams.map(b => b.ra * 15.0)
      const decs = beams.map(b => b.dec)
      const minRa = Math.min(...ras)
      const maxRa = Math.max(...ras)
      const minDec = Math.min(...decs)
      const maxDec = Math.max(...decs)

      const raRange = maxRa - minRa
      const decRange = maxDec - minDec
      const padding = 0.1
      const plotMinRa = minRa - padding * raRange
      const plotMaxRa = maxRa + padding * raRange
      const plotMinDec = minDec - padding * decRange
      const plotMaxDec = maxDec + padding * decRange

      const toCanvasX = (ra) => ((ra - plotMinRa) / (plotMaxRa - plotMinRa)) * canvas.width
      const toCanvasY = (dec) => canvas.height - ((dec - plotMinDec) / (plotMaxDec - plotMinDec)) * canvas.height

      // Find closest beam center
      let closestBeam = null
      let minDist = Infinity
      const hoverRadius = 15

      beams.forEach(beam => {
        const raDeg = beam.ra * 15.0
        const centerX = toCanvasX(raDeg)
        const centerY = toCanvasY(beam.dec)
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)

        if (dist < hoverRadius && dist < minDist) {
          minDist = dist
          closestBeam = beam.name
        }
      })

      if (closestBeam !== hoveredBeam) {
        setHoveredBeam(closestBeam)
      }
    }

    const handleMouseUp = () => {
      setIsPanning(false)
    }

    const handleMouseLeave = () => {
      setHoveredBeam(null)
      setIsPanning(false)
    }

    // Double-click to reset zoom
    const handleDoubleClick = () => {
      setTransform({ offsetX: 0, offsetY: 0, scale: 1 })
    }

    resizeCanvas()
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('dblclick', handleDoubleClick)
    window.addEventListener('resize', resizeCanvas)

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('dblclick', handleDoubleClick)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [candidate, metaFile, hoveredBeam, transform, isPanning, panStart])

  // Get beam info for tooltip
  const getTooltipInfo = () => {
    if (!hoveredBeam || !metaFile || !metaFile.beams) return null
    const beam = metaFile.beams[hoveredBeam]
    if (!beam) return null

    return {
      name: beam.name,
      ra: beam.ra.toFixed(4),
      dec: beam.dec.toFixed(4)
    }
  }

  const tooltipInfo = getTooltipInfo()

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          background: '#f9fafb',
          cursor: isPanning ? 'grabbing' : (hoveredBeam ? 'pointer' : 'grab')
        }}
      />

      {/* Tooltip */}
      {tooltipInfo && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 15,
            top: mousePos.y + 15,
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'nowrap'
          }}
        >
          <div><strong>{tooltipInfo.name}</strong></div>
          <div>RA: {tooltipInfo.ra}h</div>
          <div>DEC: {tooltipInfo.dec}°</div>
        </div>
      )}

      {/* Legend and Controls */}
      <div style={{
        fontSize: '0.85rem',
        color: '#6b7280',
        padding: '0.5rem',
        borderTop: '1px solid #e5e7eb',
        background: 'white',
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          {candidate ? (
            <>
              <span style={{ color: '#ff6347', fontWeight: '600' }}>Current Beam: {candidate.beam_name}</span>
              {' | '}
              <span style={{ color: '#4682b4', fontWeight: '600' }}>■</span> Neighbor beams
              {' | '}
              <span style={{ color: '#9ca3af', fontWeight: '600' }}>■</span> Other beams
            </>
          ) : (
            <>
              <span style={{ color: '#9ca3af', fontWeight: '600' }}>Current Beam: None</span>
              {' | '}
              <span style={{ color: '#9ca3af', fontWeight: '600' }}>■</span> All beams
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Zoom: {transform.scale.toFixed(1)}x
          </span>
          <button
            onClick={() => setTransform({ offsetX: 0, offsetY: 0, scale: 1 })}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            title="Reset zoom (or double-click canvas)"
          >
            Reset View
          </button>
        </div>
      </div>

      {/* Controls hint */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        fontSize: '0.75rem',
        color: '#6b7280',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '6px 10px',
        borderRadius: '4px',
        lineHeight: '1.4'
      }}>
        🖱️ Drag to pan | 🖱️ Scroll to zoom | ⏸️ Double-click to reset
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.candidate?.beam_name === nextProps.candidate?.beam_name &&
    prevProps.metaFile === nextProps.metaFile
  )
})

export default BeamMapCanvas
