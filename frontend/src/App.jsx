import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import './styles/App.css'
import DirectorySelector from './components/DirectorySelector'
import UTCSelector from './components/UTCSelector'
import FilterDropdown from './components/FilterDropdown'
import ResizableSplit from './components/ResizableSplit'
import DraggablePanel from './components/DraggablePanel'
import ResizableAccordionContainer from './components/ResizableAccordionContainer'
import AccordionPanel from './components/AccordionPanel'
import BeamMap from './components/BeamMap'
import Diagnostics from './components/Diagnostics'
import BulkClassify from './components/BulkClassify'
import ScatterPlot from './components/ScatterPlot'
import { filterCandidates, classifyCandidate, saveClassification, getAllCandidates, getMetafile } from './api/client'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { Map, FileText, Users, Save, ScatterChart } from 'lucide-react'

function App() {
  const [baseDir, setBaseDir] = useState('')
  const [utcs, setUtcs] = useState([])
  const [selectedUTC, setSelectedUTC] = useState('')
  const [filteredCandidates, setFilteredCandidates] = useState([])
  const [allCandidatesInUTC, setAllCandidatesInUTC] = useState([]) // All candidates from current UTC
  const [metaFile, setMetaFile] = useState(null) // Metafile data
  const [currentIndex, setCurrentIndex] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Ready. Select a directory to begin.')
  const [loading, setLoading] = useState(false)

  // Panel state - track if each tool is popped out (floating) or docked (accordion)
  const [beamMapMode, setBeamMapMode] = useState('docked') // 'docked' or 'floating'
  const [diagnosticsMode, setDiagnosticsMode] = useState('docked')
  const [bulkClassifyMode, setBulkClassifyMode] = useState('docked')
  const [scatterPlotMode, setScatterPlotMode] = useState('docked')

  // Ref for PNG viewer (for panel snapping)
  const pngViewerRef = useRef(null)

  // Filter state
  const [filterTypes, setFilterTypes] = useState({
    UNCAT: true,
    T1_CAND: false,
    T2_CAND: false,
    RFI: false,
    NOISE: false,
    KNOWN_PSR: false,
    NB_PSR: false,
  })
  const [sortBy, setSortBy] = useState('FOLD_SNR')
  const [sortOrder, setSortOrder] = useState('desc')

  const currentCandidate = filteredCandidates[currentIndex]

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPrevious: () => handleNavigate('prev'),
    onNext: () => handleNavigate('next'),
    onClassify: (type) => handleClassify(type),
    enabled: filteredCandidates.length > 0
  })

  // Handle space key for full image
  useEffect(() => {
    const handleOpenFullImage = () => {
      if (currentCandidate?.png_path) {
        const imageUrl = `/api/files/image?path=${baseDir}/${currentCandidate.png_path}`
        window.open(imageUrl, '_blank')
      }
    }

    window.addEventListener('openFullImage', handleOpenFullImage)
    return () => window.removeEventListener('openFullImage', handleOpenFullImage)
  }, [currentCandidate, baseDir])

  const handleLoadComplete = (data, dir) => {
    console.log('Load complete:', data)
    setBaseDir(dir)
    setUtcs(data.utcs || [])
    setStatusMessage(`Loaded ${data.total_candidates} candidates from ${data.utcs?.length || 0} UTCs`)
  }

  const handleSelectUTC = async (utc) => {
    console.log('=== handleSelectUTC called with UTC:', utc)
    setSelectedUTC(utc)
    setStatusMessage(`Loading data for UTC: ${utc}...`)

    // Pre-load all candidates and metafile for this UTC
    try {
      // Fetch ALL candidates from all UTCs, then filter to this UTC
      console.log('Fetching all candidates for baseDir:', baseDir)
      const allCandidatesResponse = await getAllCandidates(baseDir)
      const allCandidates = allCandidatesResponse.data
      console.log(`Total candidates fetched: ${allCandidates.length}`)
      console.log('Sample candidate utc_start values:', allCandidates.slice(0, 5).map(c => c.utc_start))

      const candidatesInUTC = allCandidates.filter(c => c.utc_start === utc)
      setAllCandidatesInUTC(candidatesInUTC)
      console.log(`Filtered to ${candidatesInUTC.length} candidates for UTC ${utc}`)
      if (candidatesInUTC.length > 0) {
        console.log('Sample candidate:', candidatesInUTC[0])
      }

      // Fetch metafile for beam map
      try {
        console.log('Fetching metafile for UTC:', utc)
        const metafileResponse = await getMetafile(baseDir, utc)
        setMetaFile(metafileResponse.data)
        console.log('Loaded metafile with', Object.keys(metafileResponse.data.beams || {}).length, 'beams')
      } catch (err) {
        console.error('Could not load metafile:', err.response?.data || err.message)
        setMetaFile(null)
      }

      setStatusMessage(`Loaded ${candidatesInUTC.length} candidates for UTC ${utc}. Apply filters and click "Go" to view.`)
    } catch (err) {
      console.error('Error loading UTC data:', err.response?.data || err.message)
      setStatusMessage(`Error loading data for UTC ${utc}: ${err.message}`)
    }
  }

  const handleFilterCandidates = async () => {
    if (!selectedUTC) {
      setStatusMessage('Please select a UTC first')
      return
    }

    try {
      setLoading(true)
      setStatusMessage('Filtering candidates...')

      const selectedTypes = Object.keys(filterTypes).filter(key => filterTypes[key])

      console.log('Filtering with:', { baseDir, selectedUTC, selectedTypes, sortBy, sortOrder })

      // Fetch filtered candidates
      const response = await filterCandidates(baseDir, selectedUTC, selectedTypes, sortBy, sortOrder)
      const filtered = response.data

      console.log('Filtered candidates:', filtered)

      setFilteredCandidates(filtered)
      setCurrentIndex(0)

      // allCandidatesInUTC and metaFile are already loaded from handleSelectUTC

      if (filtered.length > 0) {
        setStatusMessage(`Found ${filtered.length} candidates`)
      } else {
        setStatusMessage('No candidates match your filter criteria')
      }
    } catch (err) {
      console.error('Error filtering candidates:', err)
      setStatusMessage('Error filtering candidates: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (type) => {
    setFilterTypes(prev => ({
      ...prev,
      [type]: !prev[type]
    }))
  }

  const handleNavigate = (direction) => {
    if (direction === 'prev') {
      setCurrentIndex(Math.max(0, currentIndex - 1))
    } else {
      setCurrentIndex(Math.min(filteredCandidates.length - 1, currentIndex + 1))
    }
  }

  const handleClassify = useCallback(async (candidateType) => {
    if (!currentCandidate) return

    // Capture values to avoid stale closure
    const lineNum = currentCandidate.line_num
    const nextIndex = currentIndex < filteredCandidates.length - 1 ? currentIndex + 1 : currentIndex

    // Update local state immediately for instant UI feedback
    setFilteredCandidates(prev => prev.map(c =>
      c.line_num === lineNum ? { ...c, candidate_type: candidateType } : c
    ))
    setAllCandidatesInUTC(prev => prev.map(c =>
      c.line_num === lineNum ? { ...c, candidate_type: candidateType } : c
    ))
    setStatusMessage(`Classified candidate ${lineNum} as ${candidateType}`)

    // Auto-advance immediately
    if (nextIndex !== currentIndex) {
      setCurrentIndex(nextIndex)
    }

    // Send to server in background (fire-and-forget)
    try {
      const dirName = baseDir.split('/').pop()
      classifyCandidate(dirName, lineNum, candidateType).catch(err => {
        console.error('Error classifying:', err)
        setStatusMessage('Error: ' + (err.response?.data?.detail || err.message))
      })
    } catch (err) {
      console.error('Error classifying:', err)
    }
  }, [currentCandidate, currentIndex, filteredCandidates.length, baseDir])

  const handleSave = async () => {
    try {
      setStatusMessage('Saving classifications...')

      const username = 'user' // Get from state/config
      const dirname = baseDir.split('/').pop()
      const filename = `${dirname}_${username}.csv`

      // Get all candidates with their classifications
      const allCandidates = filteredCandidates.map(c => ({
        beam_id: c.beam_id,
        utc: c.utc_start,
        png_path: c.png_path,
        classification: c.candidate_type,
        csv_line: c.csv_line
      }))

      await saveClassification(baseDir, filename, allCandidates, 'csv_header')

      setStatusMessage(`✓ Saved classifications to ${filename}`)
    } catch (err) {
      console.error('Error saving:', err)
      setStatusMessage('Error saving: ' + (err.response?.data?.detail || err.message))
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>CandyWeb - Pulsar Candidate Viewer</h1>
        <p className="subtitle">Web-based viewer for TRAPUM/MPIFR MeerKAT surveys</p>
      </header>

      {/* Horizontal Control Bar */}
      <div className="control-bar">
        <div className="control-bar-section">
          <DirectorySelector onLoadComplete={handleLoadComplete} />
        </div>

        {utcs.length > 0 && (
          <div className="control-bar-section">
            <UTCSelector
              utcs={utcs}
              selectedUTC={selectedUTC}
              onSelectUTC={handleSelectUTC}
            />
          </div>
        )}

        {selectedUTC && (
          <>
            <div className="control-bar-section">
              <FilterDropdown
                filterTypes={filterTypes}
                onFilterChange={handleFilterChange}
              />
            </div>

            <div className="control-bar-section" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem' }}>Sort:</label>
              <select
                className="select-input-compact"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="FOLD_SNR">FOLD_SNR</option>
                <option value="FFT_SNR">FFT_SNR</option>
                <option value="DM">DM</option>
                <option value="F0">F0</option>
                <option value="ACC">ACC</option>
              </select>
              <div className="btn-group">
                <button
                  className={`btn btn-small ${sortOrder === 'asc' ? 'active' : ''}`}
                  onClick={() => setSortOrder('asc')}
                >
                  ↑
                </button>
                <button
                  className={`btn btn-small ${sortOrder === 'desc' ? 'active' : ''}`}
                  onClick={() => setSortOrder('desc')}
                >
                  ↓
                </button>
              </div>
            </div>

            <div className="control-bar-section">
              <button
                className="btn btn-primary"
                onClick={handleFilterCandidates}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Go'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="app-container">
        <ResizableSplit
          defaultLeftWidth={35}
          left={
            <main className="main-content">
              {filteredCandidates.length > 0 && (
                <>
                  <div className="navigation-bar">
                    <button
                      className="btn"
                      onClick={() => handleNavigate('prev')}
                      disabled={currentIndex === 0}
                    >
                      Previous (A)
                    </button>
                    <span className="counter">
                      {currentIndex + 1} / {filteredCandidates.length}
                    </span>
                    <button
                      className="btn"
                      onClick={() => handleNavigate('next')}
                      disabled={currentIndex === filteredCandidates.length - 1}
                    >
                      Next (D)
                    </button>
                    <input
                      type="number"
                      className="goto-input"
                      placeholder="Go to..."
                      min="1"
                      max={filteredCandidates.length}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const num = parseInt(e.target.value)
                          if (num >= 1 && num <= filteredCandidates.length) {
                            setCurrentIndex(num - 1)
                          }
                        }
                      }}
                    />
                    <button
                      className="btn btn-success"
                      onClick={handleSave}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <Save size={16} />
                      Save Classification
                    </button>
                  </div>

                  <div className="image-viewer" ref={pngViewerRef}>
                    {currentCandidate?.png_path ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img
                          src={`/api/files/image?path=${baseDir}/${currentCandidate.png_path}`}
                          alt="Candidate"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            const imageUrl = `/api/files/image?path=${baseDir}/${currentCandidate.png_path}`
                            window.open(imageUrl, '_blank')
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'block'
                          }}
                          title="Click to open in new tab, or press Space"
                        />
                        <div className="image-placeholder" style={{ display: 'none' }}>
                          <p>Image not found: {currentCandidate.png_path}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="image-placeholder">
                        <p>No image available</p>
                      </div>
                    )}
                  </div>

                  <div className="classification-controls">
                    <h3>Classify Candidate (or use keyboard shortcuts):</h3>
                    <div className="btn-group-large">
                      <button
                        className="btn btn-classify btn-rfi"
                        onClick={() => handleClassify('RFI')}
                      >
                        RFI (Y)
                      </button>
                      <button
                        className="btn btn-classify btn-noise"
                        onClick={() => handleClassify('NOISE')}
                      >
                        Noise (U)
                      </button>
                      <button
                        className="btn btn-classify btn-tier1"
                        onClick={() => handleClassify('T1_CAND')}
                      >
                        Tier 1 (I)
                      </button>
                      <button
                        className="btn btn-classify btn-tier2"
                        onClick={() => handleClassify('T2_CAND')}
                      >
                        Tier 2 (O)
                      </button>
                      <button
                        className="btn btn-classify btn-known"
                        onClick={() => handleClassify('KNOWN_PSR')}
                      >
                        Known PSR (P)
                      </button>
                      <button
                        className="btn btn-classify btn-nb"
                        onClick={() => handleClassify('NB_PSR')}
                      >
                        NB PSR (L)
                      </button>
                      <button
                        className="btn btn-classify btn-reset"
                        onClick={() => handleClassify('UNCAT')}
                      >
                        Uncat (R)
                      </button>
                    </div>
                  </div>

                  {/* Bulk Classify Collapsible Pane */}
                  {currentCandidate && (
                    <div style={{ marginTop: '1rem' }}>
                      <AccordionPanel
                        title="Bulk Classify Similar Candidates"
                        defaultOpen={false}
                        onPopOut={bulkClassifyMode === 'docked' ? () => setBulkClassifyMode('floating') : null}
                      >
                        {bulkClassifyMode === 'docked' && (
                          <BulkClassify
                            candidate={currentCandidate}
                            baseDir={baseDir}
                            onClassified={() => handleFilterCandidates()}
                          />
                        )}
                      </AccordionPanel>
                    </div>
                  )}

                  {/* Candidate Info Table - moved below classification buttons */}
                  <div style={{
                    padding: '0.75rem',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    marginTop: '1rem'
                  }}>
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <div><strong>Line:</strong> {currentCandidate.line_num}</div>
                      <div><strong>Beam:</strong> {currentCandidate.beam_name}</div>
                      <div>
                        <strong>Class:</strong>
                        <span style={{
                          marginLeft: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          backgroundColor: getClassColor(currentCandidate.candidate_type),
                          color: 'white'
                        }}>
                          {currentCandidate.candidate_type}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                      <div><strong>Position:</strong> RA: {currentCandidate.ra?.toFixed(4)}h, DEC: {currentCandidate.dec?.toFixed(4)}°</div>
                      <div><strong>T_obs:</strong> {currentCandidate.tobs?.toFixed(1)} s</div>
                    </div>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>
                      <strong>PNG:</strong> {currentCandidate.png_path || 'N/A'}
                    </div>
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #d1d5db' }}>
                          <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left' }}></th>
                          <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>FFT / usr</th>
                          <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>Fold / opt</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '0.25rem 0.5rem', fontWeight: '600' }}>F0 (Hz)</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
                            {currentCandidate.f0_user?.toFixed(6) || 'N/A'}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
                            {currentCandidate.f0_opt?.toFixed(6) || 'N/A'}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.25rem 0.5rem', fontWeight: '600' }}>P0 (ms)</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
                            {currentCandidate.f0_user ? (1000 / currentCandidate.f0_user).toFixed(3) : 'N/A'}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
                            {currentCandidate.f0_opt ? (1000 / currentCandidate.f0_opt).toFixed(3) : 'N/A'}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.25rem 0.5rem', fontWeight: '600' }}>F1</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
                            {currentCandidate.f1_user ? currentCandidate.f1_user.toExponential(3) : 'N/A'}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
                            {currentCandidate.f1_opt ? currentCandidate.f1_opt.toExponential(3) : 'N/A'}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.25rem 0.5rem', fontWeight: '600' }}>ACC (m/s²)</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>{currentCandidate.acc_user?.toFixed(3) || 'N/A'}</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>{currentCandidate.acc_opt?.toFixed(3) || 'N/A'}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.25rem 0.5rem', fontWeight: '600' }}>DM (pc/cc)</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>{currentCandidate.dm_user?.toFixed(2) || 'N/A'}</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>{currentCandidate.dm_opt?.toFixed(2) || 'N/A'}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.25rem 0.5rem', fontWeight: '600' }}>SNR</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>{currentCandidate.sn_fft?.toFixed(2) || 'N/A'}</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>{currentCandidate.sn_fold?.toFixed(2) || 'N/A'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {filteredCandidates.length === 0 && selectedUTC && (
                <div className="image-viewer">
                  <div className="image-placeholder">
                    <p>Click "Go" to filter and view candidates</p>
                  </div>
                </div>
              )}

              {!selectedUTC && (
                <div className="image-viewer">
                  <div className="image-placeholder">
                    <p>Load a directory and select a UTC to begin</p>
                  </div>
                </div>
              )}

              <div className="status-bar">
                <p className="status-message">{statusMessage}</p>
              </div>
            </main>
          }
          right={
            selectedUTC && (
              <aside className="right-panel">
                <ResizableAccordionContainer
                  containerHeight="100%"
                  panels={[
                    {
                      id: 'beammap',
                      title: 'Beam Map',
                      defaultOpen: true,
                      defaultHeight: 500,
                      onPopOut: beamMapMode === 'docked' ? () => setBeamMapMode('floating') : null,
                      content: beamMapMode === 'docked' ? (
                        <BeamMap candidate={currentCandidate} metaFile={metaFile} />
                      ) : null
                    },
                    {
                      id: 'scatterplot',
                      title: 'Scatter Plot',
                      defaultOpen: false,
                      defaultHeight: 500,
                      onPopOut: scatterPlotMode === 'docked' ? () => setScatterPlotMode('floating') : null,
                      content: scatterPlotMode === 'docked' ? (
                        <ScatterPlot candidates={allCandidatesInUTC} currentCandidate={currentCandidate} />
                      ) : null
                    },
                    ...(currentCandidate ? [
                      {
                        id: 'diagnostics',
                        title: 'Diagnostics',
                        defaultOpen: false,
                        defaultHeight: 400,
                        onPopOut: diagnosticsMode === 'docked' ? () => setDiagnosticsMode('floating') : null,
                        content: diagnosticsMode === 'docked' ? (
                          <Diagnostics candidate={currentCandidate} baseDir={baseDir} />
                        ) : null
                      }
                    ] : [])
                  ]}
                />
              </aside>
            )
          }
        />
      </div>

      {/* Floating Panels (when popped out from accordion) */}
      {beamMapMode === 'floating' && (
        <DraggablePanel
          title="Beam Map"
          initialPosition={{ x: 100, y: 100 }}
          initialSize={{ width: 600, height: 500 }}
          onClose={() => setBeamMapMode('docked')}
          snapTargetRef={pngViewerRef}
        >
          <BeamMap
            candidate={currentCandidate}
            metaFile={metaFile}
          />
        </DraggablePanel>
      )}

      {scatterPlotMode === 'floating' && (
        <DraggablePanel
          title="Scatter Plot - Candidate Parameters"
          initialPosition={{ x: 125, y: 125 }}
          initialSize={{ width: 700, height: 550 }}
          onClose={() => setScatterPlotMode('docked')}
          snapTargetRef={pngViewerRef}
        >
          <ScatterPlot
            candidates={allCandidatesInUTC}
            currentCandidate={currentCandidate}
          />
        </DraggablePanel>
      )}

      {diagnosticsMode === 'floating' && (
        <DraggablePanel
          title="Diagnostics & Folding Commands"
          initialPosition={{ x: 150, y: 150 }}
          initialSize={{ width: 700, height: 600 }}
          onClose={() => setDiagnosticsMode('docked')}
          snapTargetRef={pngViewerRef}
        >
          <Diagnostics candidate={currentCandidate} baseDir={baseDir} />
        </DraggablePanel>
      )}

      {bulkClassifyMode === 'floating' && (
        <DraggablePanel
          title="Bulk Classify Similar Candidates"
          initialPosition={{ x: 200, y: 200 }}
          initialSize={{ width: 650, height: 550 }}
          onClose={() => setBulkClassifyMode('docked')}
          snapTargetRef={pngViewerRef}
        >
          <BulkClassify
            candidate={currentCandidate}
            baseDir={baseDir}
            onClassified={() => handleFilterCandidates()}
          />
        </DraggablePanel>
      )}

      <footer className="app-footer">
        <p>Backend API: <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer">http://localhost:8000/docs</a></p>
        <p>Keyboard: A/D=Navigate | Y/U/I/O/P/L/R=Classify | Space=Full Image | Drag panels to move</p>
      </footer>
    </div>
  )
}

function getClassColor(type) {
  const colors = {
    'UNCAT': '#6b7280',
    'T1_CAND': '#3b82f6',
    'T2_CAND': '#60a5fa',
    'RFI': '#ef4444',
    'NOISE': '#f59e0b',
    'KNOWN_PSR': '#8b5cf6',
    'NB_PSR': '#a78bfa'
  }
  return colors[type] || '#6b7280'
}

export default App
