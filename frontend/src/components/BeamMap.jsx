import { useMemo, memo } from 'react'
import Plot from 'react-plotly.js'

const BeamMap = memo(function BeamMap({ candidate, metaFile, beams = [] }) {
  const plotData = useMemo(() => {
    console.log('BeamMap rendering with:', { candidate, metaFile })

    const data = []

    // If we have metafile with beams, draw ellipses
    if (metaFile && metaFile.beams) {
      console.log('Metafile has beams:', Object.keys(metaFile.beams).length)
      // Draw all beam ellipses
      Object.values(metaFile.beams).forEach(beam => {
        // Generate ellipse points
        // Convert RA from hours to degrees for ellipse calculation
        const raDeg = beam.ra * 15.0

        const points = generateEllipse(
          raDeg,
          beam.dec,
          beam.ellipse_x,
          beam.ellipse_y,
          beam.ellipse_angle
        )

        const isCurrentBeam = candidate && beam.name === candidate.beam_name
        const isNeighbor = candidate && (beam.neighbour_beams?.includes(candidate.beam_name) ||
                          candidate.beam?.neighbour_beams?.includes(beam.name))

        data.push({
          x: points.x,
          y: points.y,
          mode: 'lines',
          type: 'scatter',
          name: beam.name,
          line: {
            color: isCurrentBeam ? '#ff6347' : isNeighbor ? '#4682b4' : '#9ca3af',
            width: isCurrentBeam ? 3 : isNeighbor ? 2 : 1
          },
          fill: isCurrentBeam ? 'toself' : 'none',
          fillcolor: isCurrentBeam ? 'rgba(255, 99, 71, 0.2)' : undefined,
          hovertemplate: `<b>${beam.name}</b><br>` +
                        `RA: ${beam.ra.toFixed(4)}h<br>` +
                        `DEC: ${beam.dec.toFixed(4)}°<br>` +
                        `<extra></extra>`,
          showlegend: false
        })

        // Add beam center point (convert RA to degrees)
        data.push({
          x: [raDeg],
          y: [beam.dec],
          mode: 'markers+text',
          type: 'scatter',
          text: [beam.name],
          textposition: 'middle center',
          textfont: {
            size: 8,
            color: isCurrentBeam ? '#ff6347' : '#666'
          },
          marker: {
            size: 4,
            color: isCurrentBeam ? '#ff6347' : isNeighbor ? '#4682b4' : '#9ca3af'
          },
          hoverinfo: 'skip',
          showlegend: false
        })
      })
    } else if (candidate) {
      // Fallback: just show candidate position if no metafile
      data.push({
        x: [candidate.ra],
        y: [candidate.dec],
        mode: 'markers+text',
        type: 'scatter',
        text: [candidate.beam_name],
        textposition: 'top center',
        marker: {
          size: 12,
          color: '#ff6347',
          symbol: 'circle'
        },
        hovertemplate: `<b>${candidate.beam_name}</b><br>` +
                      `RA: ${candidate.ra?.toFixed(4)}h<br>` +
                      `DEC: ${candidate.dec?.toFixed(4)}°<br>` +
                      `<extra></extra>`
      })
    }

    // Add boresight if available
    if (metaFile?.boresight) {
      const boresightRaDeg = metaFile.boresight.ra * 15.0
      data.push({
        x: [boresightRaDeg],
        y: [metaFile.boresight.dec],
        mode: 'markers+text',
        type: 'scatter',
        text: ['Boresight'],
        textposition: 'bottom center',
        marker: {
          size: 10,
          color: '#8b5cf6',
          symbol: 'cross'
        },
        name: 'Boresight',
        hovertemplate: `<b>Boresight</b><br>` +
                      `RA: ${metaFile.boresight.ra.toFixed(4)}h<br>` +
                      `DEC: ${metaFile.boresight.dec.toFixed(4)}°<br>` +
                      `<extra></extra>`
      })
    }

    return data
  }, [candidate, metaFile, beams])

  const layout = useMemo(() => {
    const title = candidate ? `Beam Tiling - Current: ${candidate.beam_name}` : 'Beam Tiling (No candidate selected)'

    return {
      title,
      xaxis: {
        title: 'RA (degrees)',
        showgrid: true,
        gridcolor: '#e5e7eb'
        // Removed scaleanchor to allow non-square zoom
      },
      yaxis: {
        title: 'DEC (degrees)',
        showgrid: true,
        gridcolor: '#e5e7eb'
      },
      hovermode: 'closest',
      showlegend: false,
      margin: { l: 60, r: 40, t: 60, b: 60 },
      plot_bgcolor: '#f9fafb',
      paper_bgcolor: 'white'
    }
  }, [candidate])

  const config = {
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    toImageButtonOptions: {
      format: 'png',
      filename: 'beam_tiling',
      height: 800,
      width: 1000,
      scale: 2
    }
  }

  if (!metaFile && !candidate) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        <p>Loading beam map data...</p>
      </div>
    )
  }

  if (!metaFile) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        <p>No metafile available for this UTC</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Plot
        data={plotData}
        layout={layout}
        config={config}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler={true}
      />
      <div style={{
        fontSize: '0.85rem',
        color: '#6b7280',
        padding: '0.5rem',
        borderTop: '1px solid #e5e7eb'
      }}>
        <span style={{ color: '#ff6347', fontWeight: '600' }}>■</span> Current beam
        {' | '}
        <span style={{ color: '#4682b4', fontWeight: '600' }}>■</span> Neighbor beams
        {' | '}
        <span style={{ color: '#9ca3af', fontWeight: '600' }}>■</span> Other beams
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Only re-render if beam_name or metaFile changes
  // This prevents re-rendering when other candidate properties change
  return (
    prevProps.candidate?.beam_name === nextProps.candidate?.beam_name &&
    prevProps.metaFile === nextProps.metaFile
  )
})

export default BeamMap

function generateEllipse(centerX, centerY, semiMajor, semiMinor, rotation, numPoints = 50) {
  if (!semiMajor || !semiMinor) {
    // Fallback to circle if ellipse params missing
    const radius = 0.01 // Small default radius
    const x = []
    const y = []
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI
      x.push(centerX + radius * Math.cos(angle))
      y.push(centerY + radius * Math.sin(angle))
    }
    return { x, y }
  }

  const x = []
  const y = []

  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI

    // Point on standard ellipse
    const xEllipse = semiMajor * Math.cos(angle)
    const yEllipse = semiMinor * Math.sin(angle)

    // Rotate by beam rotation angle
    const cosRot = Math.cos(rotation || 0)
    const sinRot = Math.sin(rotation || 0)

    const xRotated = xEllipse * cosRot - yEllipse * sinRot
    const yRotated = xEllipse * sinRot + yEllipse * cosRot

    // Translate to beam center
    x.push(centerX + xRotated)
    y.push(centerY + yRotated)
  }

  return { x, y }
}
