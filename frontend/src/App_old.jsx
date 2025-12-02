import { useState } from 'react'
import './styles/App.css'
import DirectorySelector from './components/DirectorySelector'
import UTCSelector from './components/UTCSelector'
import { filterCandidates } from './api/client'

function App() {
  const [baseDir, setBaseDir] = useState('')
  const [utcs, setUtcs] = useState([])
  const [selectedUTC, setSelectedUTC] = useState('')
  const [candidates, setCandidates] = useState([])
  const [filteredCandidates, setFilteredCandidates] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Ready. Select a directory to begin.')
  const [loading, setLoading] = useState(false)

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

  const handleLoadComplete = (data, dir) => {
    console.log('Load complete:', data)
    setBaseDir(dir)
    setUtcs(data.utcs || [])
    setStatusMessage(`Loaded ${data.total_candidates} candidates from ${data.utcs?.length || 0} UTCs`)
  }

  const handleSelectUTC = async (utc) => {
    console.log('Selected UTC:', utc)
    setSelectedUTC(utc)
    setStatusMessage(`Selected UTC: ${utc}. Click "Go" to filter candidates.`)
  }

  const handleFilterCandidates = async () => {
    if (!selectedUTC) {
      setStatusMessage('Please select a UTC first')
      return
    }

    try {
      setLoading(true)
      setStatusMessage('Filtering candidates...')

      // Get selected filter types
      const selectedTypes = Object.keys(filterTypes).filter(key => filterTypes[key])

      console.log('Filtering with:', { baseDir, selectedUTC, selectedTypes, sortBy, sortOrder })

      const response = await filterCandidates(baseDir, selectedUTC, selectedTypes, sortBy, sortOrder)
      const filtered = response.data

      console.log('Filtered candidates:', filtered)

      setFilteredCandidates(filtered)
      setCurrentIndex(0)

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

  const currentCandidate = filteredCandidates[currentIndex]

  return (
    <div className="app">
      <header className="app-header">
        <h1>CandyWeb - Pulsar Candidate Viewer</h1>
        <p className="subtitle">Web-based viewer for TRAPUM/MPIFR MeerKAT surveys</p>
      </header>

      <div className="app-container">
        <aside className="left-panel">
          <DirectorySelector onLoadComplete={handleLoadComplete} />

          {utcs.length > 0 && (
            <UTCSelector
              utcs={utcs}
              selectedUTC={selectedUTC}
              onSelectUTC={handleSelectUTC}
            />
          )}

          {selectedUTC && (
            <div className="control-section">
              <h2>Filter & Sort</h2>
              <div className="form-group">
                <label>Filter Types:</label>
                <div className="checkbox-group">
                  {Object.keys(filterTypes).map(type => (
                    <label key={type}>
                      <input
                        type="checkbox"
                        checked={filterTypes[type]}
                        onChange={() => handleFilterChange(type)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Sort By:</label>
                <select
                  className="select-input"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="FOLD_SNR">FOLD_SNR</option>
                  <option value="FFT_SNR">FFT_SNR</option>
                  <option value="DM">DM</option>
                  <option value="F0">F0</option>
                  <option value="F1">F1</option>
                  <option value="ACC">ACC</option>
                  <option value="BEAM_NUM">BEAM_NUM</option>
                  <option value="TOBS">TOBS</option>
                  <option value="CSV_LINE">CSV_LINE</option>
                </select>
                <div className="btn-group" style={{ marginTop: '0.5rem' }}>
                  <button
                    className={`btn btn-small ${sortOrder === 'asc' ? 'active' : ''}`}
                    onClick={() => setSortOrder('asc')}
                  >
                    Asc
                  </button>
                  <button
                    className={`btn btn-small ${sortOrder === 'desc' ? 'active' : ''}`}
                    onClick={() => setSortOrder('desc')}
                  >
                    Desc
                  </button>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleFilterCandidates}
                  disabled={loading}
                  style={{ marginTop: '0.5rem', width: '100%' }}
                >
                  {loading ? 'Loading...' : 'Go'}
                </button>
              </div>
            </div>
          )}

          {currentCandidate && (
            <>
              <div className="control-section">
                <h2>Beam Map</h2>
                <div className="beam-map-placeholder">
                  <p>Beam: {currentCandidate.beam_name}</p>
                  <p className="text-muted">
                    RA: {currentCandidate.ra?.toFixed(4)}h<br />
                    DEC: {currentCandidate.dec?.toFixed(4)}°
                  </p>
                </div>
              </div>

              <div className="control-section">
                <h2>Candidate Info</h2>
                <div className="tabs">
                  <button className="tab active">Info</button>
                  <button className="tab">Diagnostics</button>
                </div>
                <div className="info-content">
                  <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <tbody>
                      <tr>
                        <td><strong>Line:</strong></td>
                        <td>{currentCandidate.line_num}</td>
                      </tr>
                      <tr>
                        <td><strong>Beam:</strong></td>
                        <td>{currentCandidate.beam_name}</td>
                      </tr>
                      <tr>
                        <td><strong>DM:</strong></td>
                        <td>{currentCandidate.dm_opt?.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td><strong>F0:</strong></td>
                        <td>{currentCandidate.f0_opt?.toFixed(6)} Hz</td>
                      </tr>
                      <tr>
                        <td><strong>SNR (fold):</strong></td>
                        <td>{currentCandidate.sn_fold?.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td><strong>SNR (fft):</strong></td>
                        <td>{currentCandidate.sn_fft?.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </aside>

        <main className="main-content">
          {filteredCandidates.length > 0 && (
            <>
              <div className="navigation-bar">
                <button
                  className="btn"
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                >
                  Previous (A)
                </button>
                <span className="counter">
                  {currentIndex + 1} / {filteredCandidates.length}
                </span>
                <button
                  className="btn"
                  onClick={() => setCurrentIndex(Math.min(filteredCandidates.length - 1, currentIndex + 1))}
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
                <button className="btn btn-success">Save Classification</button>
              </div>

              <div className="image-viewer">
                {currentCandidate?.png_path ? (
                  <div>
                    <img
                      src={`/api/files/image?path=${baseDir}/${currentCandidate.png_path}`}
                      alt="Candidate"
                      style={{ maxWidth: '100%', maxHeight: '100%' }}
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'block'
                      }}
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
                <h3>Classify Candidate:</h3>
                <div className="btn-group-large">
                  <button className="btn btn-classify btn-rfi">RFI (Y)</button>
                  <button className="btn btn-classify btn-noise">Noise (U)</button>
                  <button className="btn btn-classify btn-tier1">Tier 1 (I)</button>
                  <button className="btn btn-classify btn-tier2">Tier 2 (O)</button>
                  <button className="btn btn-classify btn-known">Known PSR (P)</button>
                  <button className="btn btn-classify btn-nb">NB PSR (L)</button>
                  <button className="btn btn-classify btn-reset">Uncat (R)</button>
                </div>
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
      </div>

      <footer className="app-footer">
        <p>Backend API: <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer">http://localhost:8000/docs</a></p>
        <p>Keyboard: A/D=Navigate | Y/U/I/O/P/L/R=Classify | Space=Full Image</p>
      </footer>
    </div>
  )
}

export default App
