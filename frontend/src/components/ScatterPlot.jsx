import { useMemo, useState, memo } from 'react'
import Plot from 'react-plotly.js'

const PLOT_PARAMETERS = [
  { value: 'dm_user', label: 'DM user (pc/cm³)' },
  { value: 'dm_opt', label: 'DM opt (pc/cm³)' },
  { value: 'f0_user', label: 'F0 user (Hz)' },
  { value: 'f0_opt', label: 'F0 opt (Hz)' },
  { value: 'p0', label: 'P0 (s)', compute: (c) => c.f0_user ? 1/c.f0_user : c.p0 },
  { value: 'sn_fft', label: 'SNR (FFT)' },
  { value: 'sn_fold', label: 'SNR (Fold)' },
  { value: 'acc_user', label: 'Acceleration user (m/s²)' },
  { value: 'acc_opt', label: 'Acceleration opt (m/s²)' },
  { value: 'nassoc', label: 'N Associated' },
  { value: 'tobs', label: 'T_obs (s)' },
  { value: 'ra', label: 'RA (hours)' },
  { value: 'dec', label: 'DEC (degrees)' }
]

const CLASSIFICATION_COLORS = {
  'KNOWN_PSR': '#22c55e',
  'T1_CAND': '#3b82f6',
  'T2_CAND': '#8b5cf6',
  'RFI': '#ef4444',
  'NOISE': '#f97316',
  'NB_PSR': '#06b6d4',
  'UNCAT': '#9ca3af'
}

const CLASSIFICATION_LABELS = {
  'KNOWN_PSR': 'Known PSR',
  'T1_CAND': 'Tier 1',
  'T2_CAND': 'Tier 2',
  'RFI': 'RFI',
  'NOISE': 'Noise',
  'NB_PSR': 'NB PSR',
  'UNCAT': 'Uncategorized'
}

const ScatterPlot = memo(function ScatterPlot({ candidates = [], currentCandidate = null }) {
  const [xParam, setXParam] = useState('dm_user')
  const [yParam, setYParam] = useState('p0')
  const [logX, setLogX] = useState(false)
  const [logY, setLogY] = useState(true)
  const [colorBy, setColorBy] = useState('classification')

  const plotData = useMemo(() => {
    console.log('ScatterPlot rendering with candidates:', candidates.length)
    if (!candidates || candidates.length === 0) return []

    // Group candidates by classification
    const groups = {}
    candidates.forEach(cand => {
      const classification = cand.candidate_type || 'UNCAT'
      if (!groups[classification]) {
        groups[classification] = []
      }
      groups[classification].push(cand)
    })
    console.log('ScatterPlot groups:', Object.keys(groups), Object.values(groups).map(g => g.length))

    const data = []

    // Create a trace for each classification type
    Object.entries(groups).forEach(([classification, cands]) => {
      const xValues = []
      const yValues = []
      const textLabels = []
      const isCurrentList = []

      cands.forEach(cand => {
        const xParamDef = PLOT_PARAMETERS.find(p => p.value === xParam)
        const yParamDef = PLOT_PARAMETERS.find(p => p.value === yParam)

        const xVal = xParamDef?.compute ? xParamDef.compute(cand) : cand[xParam]
        const yVal = yParamDef?.compute ? yParamDef.compute(cand) : cand[yParam]

        if (xVal !== null && xVal !== undefined && yVal !== null && yVal !== undefined) {
          xValues.push(xVal)
          yValues.push(yVal)
          textLabels.push(`Beam: ${cand.beam_name}<br>Line: ${cand.line_num}<br>${xParamDef?.label}: ${xVal.toFixed(4)}<br>${yParamDef?.label}: ${yVal.toFixed(4)}`)
          isCurrentList.push(currentCandidate && cand.line_num === currentCandidate.line_num)
        }
      })

      if (xValues.length > 0) {
        data.push({
          x: xValues,
          y: yValues,
          mode: 'markers',
          type: 'scatter',
          name: CLASSIFICATION_LABELS[classification] || classification,
          text: textLabels,
          hovertemplate: '%{text}<extra></extra>',
          marker: {
            size: isCurrentList.map(isCurrent => isCurrent ? 14 : 8),
            color: CLASSIFICATION_COLORS[classification] || '#9ca3af',
            symbol: isCurrentList.map(isCurrent => isCurrent ? 'star' : 'circle'),
            line: {
              color: isCurrentList.map(isCurrent => isCurrent ? '#000' : undefined),
              width: isCurrentList.map(isCurrent => isCurrent ? 2 : 0)
            }
          }
        })
      }
    })

    return data
  }, [candidates, currentCandidate, xParam, yParam, colorBy])

  const layout = useMemo(() => {
    const xParamLabel = PLOT_PARAMETERS.find(p => p.value === xParam)?.label || xParam
    const yParamLabel = PLOT_PARAMETERS.find(p => p.value === yParam)?.label || yParam

    return {
      title: `${yParamLabel} vs ${xParamLabel}`,
      xaxis: {
        title: xParamLabel,
        showgrid: true,
        gridcolor: '#e5e7eb',
        type: logX ? 'log' : 'linear'
      },
      yaxis: {
        title: yParamLabel,
        showgrid: true,
        gridcolor: '#e5e7eb',
        type: logY ? 'log' : 'linear'
      },
      hovermode: 'closest',
      showlegend: true,
      legend: {
        x: 1.02,
        y: 1,
        xanchor: 'left',
        yanchor: 'top'
      },
      margin: { l: 60, r: 150, t: 60, b: 60 },
      plot_bgcolor: '#f9fafb',
      paper_bgcolor: 'white'
    }
  }, [xParam, yParam, logX, logY])

  const config = {
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    toImageButtonOptions: {
      format: 'png',
      filename: `scatter_${yParam}_vs_${xParam}`,
      height: 800,
      width: 1000,
      scale: 2
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Controls */}
      <div style={{
        padding: '0.75rem',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>X:</label>
          <select
            value={xParam}
            onChange={(e) => setXParam(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem'
            }}
          >
            {PLOT_PARAMETERS.map(param => (
              <option key={param.value} value={param.value}>{param.label}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={logX}
              onChange={(e) => setLogX(e.target.checked)}
            />
            Log
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Y:</label>
          <select
            value={yParam}
            onChange={(e) => setYParam(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem'
            }}
          >
            {PLOT_PARAMETERS.map(param => (
              <option key={param.value} value={param.value}>{param.label}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={logY}
              onChange={(e) => setLogY(e.target.checked)}
            />
            Log
          </label>
        </div>

        <div style={{
          marginLeft: 'auto',
          fontSize: '0.875rem',
          color: '#6b7280'
        }}>
          {candidates.length} candidates
        </div>
      </div>

      {/* Plot */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {candidates.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            <p>Load candidates to view scatter plot</p>
          </div>
        ) : (
          <Plot
            data={plotData}
            layout={layout}
            config={config}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        )}
      </div>
    </div>
  )
})

export default ScatterPlot
