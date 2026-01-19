import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import './styles/App.css'
import AuthContainer from './components/AuthContainer'
import DirectorySelector from './components/DirectorySelector'
import UTCSelector from './components/UTCSelector'
import FilterDropdown from './components/FilterDropdown'
import ResizableSplit from './components/ResizableSplit'
import DraggablePanel from './components/DraggablePanel'
import ResizableAccordionContainer from './components/ResizableAccordionContainer'
import AccordionPanel from './components/AccordionPanel'
import BeamMapCanvas from './components/BeamMapCanvas'
import Diagnostics from './components/Diagnostics'
import BulkClassify from './components/BulkClassify'
import ScatterPlot from './components/ScatterPlot'
import SettingsDialog from './components/SettingsDialog'
import { loadCandidates, filterCandidates, classifyCandidate, saveClassification, getAllCandidates, getMetafile } from './api/client'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAuth } from './hooks/useAuth'
import { saveAppSession, restoreAppSession, clearAppSession } from './hooks/usePersistedState'
import { Map, FileText, Users, Save, ScatterChart, LogOut, Settings } from 'lucide-react'

function App() {
  // Authentication state
  const { user, authenticated, loading: authLoading, login, logout } = useAuth()
  const [baseDir, setBaseDir] = useState('')
  const [csvPath, setCsvPath] = useState('') // Store CSV path for reloading
  const [utcs, setUtcs] = useState([])
  const [selectedUTC, setSelectedUTC] = useState('')
  const [filteredCandidates, setFilteredCandidates] = useState([])
  const [allCandidatesInUTC, setAllCandidatesInUTC] = useState([]) // All candidates from current UTC
  const [metaFile, setMetaFile] = useState(null) // Metafile data
  const [currentIndex, setCurrentIndex] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Ready. Select a directory to begin.')
  const [loading, setLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)

  // Panel state - track if each tool is popped out (floating) or docked (accordion)
  const [beamMapMode, setBeamMapMode] = useState('docked') // 'docked' or 'floating'
  const [diagnosticsMode, setDiagnosticsMode] = useState('docked')
  const [bulkClassifyMode, setBulkClassifyMode] = useState('docked')
  const [scatterPlotMode, setScatterPlotMode] = useState('docked')

  // BulkClassify counts for title
  const [bulkClassifyCounts, setBulkClassifyCounts] = useState({ unclassified: 0, classified: 0 })

  // Settings dialog state
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [sessionSettings, setSessionSettings] = useState({
    pulsarScraperRadius: 5.0,
    pulsarScraperDmTol: 10.0,
    psrcatSearchRadius: 2.0,
    autosaveInterval: 2
  })

  // Track if there are unsaved changes (any classified candidates that haven't been saved)
  const [lastSaveTimestamp, setLastSaveTimestamp] = useState(null)
  const [hasClassified, setHasClassified] = useState(false)

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

  // Preload next and previous images for faster navigation
  useEffect(() => {
    if (filteredCandidates.length === 0 || !baseDir) return

    const preloadImages = []

    // Preload next image
    if (currentIndex < filteredCandidates.length - 1) {
      const nextCandidate = filteredCandidates[currentIndex + 1]
      if (nextCandidate?.png_path) {
        const img = new Image()
        img.src = `/api/files/image?path=${baseDir}/${nextCandidate.png_path}`
        preloadImages.push(img)
      }
    }

    // Preload previous image
    if (currentIndex > 0) {
      const prevCandidate = filteredCandidates[currentIndex - 1]
      if (prevCandidate?.png_path) {
        const img = new Image()
        img.src = `/api/files/image?path=${baseDir}/${prevCandidate.png_path}`
        preloadImages.push(img)
      }
    }

    // Preload 2 images ahead for smoother experience
    if (currentIndex < filteredCandidates.length - 2) {
      const nextNextCandidate = filteredCandidates[currentIndex + 2]
      if (nextNextCandidate?.png_path) {
        const img = new Image()
        img.src = `/api/files/image?path=${baseDir}/${nextNextCandidate.png_path}`
        preloadImages.push(img)
      }
    }

    return () => {
      // Cleanup
      preloadImages.forEach(img => {
        img.src = ''
      })
    }
  }, [currentIndex, filteredCandidates, baseDir])

  // Restore session on mount (after authentication) or clear on logout
  useEffect(() => {
    if (authenticated) {
      const session = restoreAppSession()
      if (session) {
        console.log('Restoring app session:', session)
        setBaseDir(session.baseDir || '')
        setCsvPath(session.csvPath || '')
        setUtcs(session.utcs || [])
        setSelectedUTC(session.selectedUTC || '')
        setFilteredCandidates(session.filteredCandidates || [])
        setAllCandidatesInUTC(session.allCandidatesInUTC || [])
        setMetaFile(session.metaFile || null)
        setCurrentIndex(session.currentIndex || 0)
        setFilterTypes(session.filterTypes || {
          UNCAT: true,
          T1_CAND: false,
          T2_CAND: false,
          RFI: false,
          NOISE: false,
          KNOWN_PSR: false,
          NB_PSR: false,
        })
        setSortBy(session.sortBy || 'FOLD_SNR')
        setSortOrder(session.sortOrder || 'desc')

        if (session.baseDir && session.filteredCandidates && session.filteredCandidates.length > 0) {
          setStatusMessage(`Session restored: ${session.filteredCandidates.length} candidates loaded`)
        }
      }
    } else {
      // Clear all state when logged out
      console.log('Clearing app state on logout')
      setBaseDir('')
      setCsvPath('')
      setUtcs([])
      setSelectedUTC('')
      setFilteredCandidates([])
      setAllCandidatesInUTC([])
      setMetaFile(null)
      setCurrentIndex(0)
      setFilterTypes({
        UNCAT: true,
        T1_CAND: false,
        T2_CAND: false,
        RFI: false,
        NOISE: false,
        KNOWN_PSR: false,
        NB_PSR: false,
      })
      setSortBy('FOLD_SNR')
      setSortOrder('desc')
      setStatusMessage('Ready. Select a directory to begin.')
    }
  }, [authenticated])

  // Save session whenever important state changes
  useEffect(() => {
    if (authenticated && baseDir) {
      const sessionData = {
        baseDir,
        csvPath,
        utcs,
        selectedUTC,
        filteredCandidates,
        allCandidatesInUTC,
        metaFile,
        currentIndex,
        filterTypes,
        sortBy,
        sortOrder,
        timestamp: new Date().toISOString()
      }
      saveAppSession(sessionData)
    }
  }, [authenticated, baseDir, csvPath, utcs, selectedUTC, filteredCandidates, allCandidatesInUTC,
      metaFile, currentIndex, filterTypes, sortBy, sortOrder])

  // Reset counts when no candidate is selected
  useEffect(() => {
    if (!currentCandidate) {
      setBulkClassifyCounts({ unclassified: 0, classified: 0 })
    }
  }, [currentCandidate])

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

    // Fully reset application state
    setBaseDir(dir)
    setCsvPath(`${dir}/candidates.csv`)
    setUtcs(data.utcs || [])
    setSelectedUTC('')
    setFilteredCandidates([])
    setAllCandidatesInUTC([])
    setMetaFile(null)
    setCurrentIndex(0)

    // Reset filter state to defaults
    setFilterTypes({
      UNCAT: true,
      T1_CAND: false,
      T2_CAND: false,
      RFI: false,
      NOISE: false,
      KNOWN_PSR: false,
      NB_PSR: false,
    })
    setSortBy('FOLD_SNR')
    setSortOrder('desc')

    // Reset panel visibility modes to docked
    setBeamMapMode('docked')
    setDiagnosticsMode('docked')
    setBulkClassifyMode('docked')
    setScatterPlotMode('docked')

    // Reset save tracking
    setLastSaveTimestamp(null)
    setHasClassified(false)

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

  const handleBulkClassified = async () => {
    // After bulk classification, reload all candidates for this UTC to update scatter plot
    if (!selectedUTC) return

    // Mark that we have classified something
    setHasClassified(true)

    try {
      const allCandidatesResponse = await getAllCandidates(baseDir)
      const allCandidates = allCandidatesResponse.data
      const candidatesInUTC = allCandidates.filter(c => c.utc_start === selectedUTC)
      setAllCandidatesInUTC(candidatesInUTC)

      // Also refresh the filtered candidates
      await handleFilterCandidates()
    } catch (err) {
      console.error('Error refreshing candidates after bulk classification:', err)
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

      // If backend cache is empty, reload candidates and retry
      if (err.response?.status === 404 && err.response?.data?.detail === 'Candidates not loaded') {
        if (csvPath && selectedUTC) {
          console.log('Backend cache empty, reloading candidates from:', csvPath)
          setStatusMessage('Reloading candidates...')

          try {
            // Reload candidates into backend cache
            const loadResponse = await loadCandidates(csvPath, baseDir)
            console.log('Candidates reloaded:', loadResponse.data)

            // Preserve existing classifications from session
            const existingClassifications = {}
            filteredCandidates.forEach(c => {
              existingClassifications[c.line_num] = c.candidate_type
            })
            allCandidatesInUTC.forEach(c => {
              if (!existingClassifications[c.line_num]) {
                existingClassifications[c.line_num] = c.candidate_type
              }
            })

            // Reload all candidates for the UTC (needed for scatter plots)
            const allCandidatesResponse = await getAllCandidates(baseDir)
            let allCandidates = allCandidatesResponse.data
            const candidatesInUTC = allCandidates.filter(c => c.utc_start === selectedUTC)

            // Restore classifications for candidates that were previously classified
            const restoredCandidatesInUTC = candidatesInUTC.map(c => {
              if (existingClassifications[c.line_num]) {
                return { ...c, candidate_type: existingClassifications[c.line_num] }
              }
              return c
            })
            setAllCandidatesInUTC(restoredCandidatesInUTC)

            // Send classifications back to backend
            for (const [lineNum, candidateType] of Object.entries(existingClassifications)) {
              try {
                await classifyCandidate(baseDir, parseInt(lineNum), candidateType)
              } catch (classifyErr) {
                console.error(`Failed to restore classification for line ${lineNum}:`, classifyErr)
              }
            }

            // Reload metafile
            try {
              const metaResponse = await getMetafile(baseDir, selectedUTC)
              setMetaFile(metaResponse.data)
            } catch (metaErr) {
              console.error('Could not load metafile:', metaErr.response?.data || metaErr.message)
              setMetaFile(null)
            }

            // Retry filtering
            const response = await filterCandidates(baseDir, selectedUTC, selectedTypes, sortBy, sortOrder)
            let filtered = response.data

            // Restore classifications in filtered candidates too
            filtered = filtered.map(c => {
              if (existingClassifications[c.line_num]) {
                return { ...c, candidate_type: existingClassifications[c.line_num] }
              }
              return c
            })

            setFilteredCandidates(filtered)
            setCurrentIndex(0)

            if (filtered.length > 0) {
              setStatusMessage(`Found ${filtered.length} candidates (restored ${Object.keys(existingClassifications).length} classifications)`)
            } else {
              setStatusMessage('No candidates match your filter criteria')
            }
            return
          } catch (reloadErr) {
            console.error('Error reloading candidates:', reloadErr)
            setStatusMessage('Error reloading candidates: ' + (reloadErr.response?.data?.detail || reloadErr.message))
            return
          }
        }
      }

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

    // Mark that we have classified something
    setHasClassified(true)

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

      const username = user?.username || 'user'
      const dirname = baseDir.split('/').pop()
      const filename = `${dirname}_${username}.csv`

      // Get ALL candidates from ALL UTCs (not just filtered ones)
      const allCandidatesResponse = await getAllCandidates(baseDir)
      const allCandidatesData = allCandidatesResponse.data

      // Map to the format expected by the backend
      const allCandidates = allCandidatesData.map(c => ({
        beam_id: c.beam_id,
        utc: c.utc_start,
        png_path: c.png_path,
        classification: c.candidate_type,
        csv_line: c.csv_line
      }))

      // Save to backend
      await saveClassification(baseDir, filename, allCandidates, 'csv_header')

      // Create CSV content for download
      const csvHeader = 'beam_id,utc,png_path,classification,csv_line\n'
      const csvRows = allCandidates.map(c =>
        `${c.beam_id},${c.utc},${c.png_path},${c.classification},${c.csv_line}`
      ).join('\n')
      const csvContent = csvHeader + csvRows

      // Trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // Update save tracking
      setLastSaveTimestamp(new Date())
      setHasClassified(false)

      setStatusMessage(`✓ Saved ${allCandidates.length} classifications to ${filename} (server + downloaded)`)
    } catch (err) {
      console.error('Error saving:', err)
      setStatusMessage('Error saving: ' + (err.response?.data?.detail || err.message))
    }
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    // If we've classified something and haven't saved, there are unsaved changes
    return hasClassified && baseDir !== ''
  }, [hasClassified, baseDir])

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '1.35rem'
      }}>
        Checking authentication...
      </div>
    )
  }

  // Show login/register page if not authenticated
  if (!authenticated) {
    return <AuthContainer onLoginSuccess={login} />
  }

  return (
    <div className="app">
      {/* Compact Toolbar with Logo */}
      <div className="toolbar">
        <div className="toolbar-controls">
          <DirectorySelector onLoadComplete={handleLoadComplete} hasUnsavedChanges={hasUnsavedChanges} />

          {utcs.length > 0 && (
            <UTCSelector
              utcs={utcs}
              selectedUTC={selectedUTC}
              onSelectUTC={handleSelectUTC}
            />
          )}

          {selectedUTC && (
            <>
              <FilterDropdown
                filterTypes={filterTypes}
                onFilterChange={handleFilterChange}
              />

              <div className="toolbar-sort-group">
                <label>Sort:</label>
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

              <button
                className="btn btn-primary btn-go"
                onClick={handleFilterCandidates}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Go'}
              </button>
            </>
          )}
        </div>

        <div className="toolbar-logo">
          <div style={{ marginLeft: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.00rem', color: '#6b7280' }}>
              {user?.name || user?.username}
            </span>
            <button
              onClick={() => setShowSettingsDialog(true)}
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                fontSize: '1.00rem'
              }}
              title="Settings"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={logout}
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                fontSize: '1.00rem'
              }}
              title="Logout"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
          <span className="logo-text">CandyWeb</span>
        </div>
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
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        {imageLoading && (
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: '#667eea',
                            fontSize: '1.2rem',
                            fontWeight: '600'
                          }}>
                            Loading image...
                          </div>
                        )}
                        <img
                          src={`/api/files/image?path=${baseDir}/${currentCandidate.png_path}`}
                          alt="Candidate"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            cursor: 'pointer',
                            opacity: imageLoading ? 0.3 : 1,
                            transition: 'opacity 0.2s'
                          }}
                          onClick={() => {
                            const imageUrl = `/api/files/image?path=${baseDir}/${currentCandidate.png_path}`
                            window.open(imageUrl, '_blank')
                          }}
                          onLoadStart={() => setImageLoading(true)}
                          onLoad={() => setImageLoading(false)}
                          onError={(e) => {
                            setImageLoading(false)
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


                  {/* Candidate Info Table - moved below classification buttons */}
                  <div style={{
                    padding: '0.75rem',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    fontSize: '1.00rem',
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
                          fontSize: '0.90rem',
                          fontWeight: '600',
                          backgroundColor: getClassColor(currentCandidate.candidate_type),
                          color: 'white'
                        }}>
                          {currentCandidate.candidate_type}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.5rem', fontSize: '0.95rem', color: '#6b7280' }}>
                      <div><strong>Position:</strong> RA: {currentCandidate.ra?.toFixed(4)}h, DEC: {currentCandidate.dec?.toFixed(4)}°</div>
                      <div><strong>T_obs:</strong> {currentCandidate.tobs?.toFixed(1)} s</div>
                    </div>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.90rem', color: '#6b7280', fontFamily: 'monospace' }}>
                      <strong>PNG:</strong> {currentCandidate.png_path || 'N/A'}
                    </div>
                    <table style={{ width: '100%', fontSize: '1.00rem', borderCollapse: 'collapse' }}>
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
              <aside className="right-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* All panels in resizable accordion */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <ResizableAccordionContainer
                    containerHeight="100%"
                    panels={[
                      {
                        id: 'beammap-diagnostics',
                        title: 'Beam Map & Diagnostics',
                        defaultOpen: true,
                        defaultHeight: 400,
                        onPopOut: null,
                        content: (
                          <div style={{ display: 'flex', gap: '1rem', height: '100%' }}>
                            {/* BeamMap - Left half */}
                            <div style={{ flex: 1, background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                              <div style={{
                                padding: '0.75rem 1rem',
                                borderBottom: '1px solid #e5e7eb',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#f9fafb'
                              }}>
                                <h3 style={{ margin: 0, fontSize: '1.10rem', fontWeight: '600' }}>Beam Map</h3>
                                {beamMapMode === 'docked' && (
                                  <button
                                    onClick={() => setBeamMapMode('floating')}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#667eea',
                                      cursor: 'pointer',
                                      fontSize: '1.00rem',
                                      padding: '0.25rem 0.5rem'
                                    }}
                                    title="Pop out to floating panel"
                                  >
                                    ↗
                                  </button>
                                )}
                              </div>
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                {beamMapMode === 'docked' && <BeamMapCanvas candidate={currentCandidate} metaFile={metaFile} />}
                              </div>
                            </div>

                            {/* Diagnostics - Right half */}
                            <div style={{ flex: 1, background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                              <div style={{
                                padding: '0.75rem 1rem',
                                borderBottom: '1px solid #e5e7eb',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#f9fafb'
                              }}>
                                <h3 style={{ margin: 0, fontSize: '1.10rem', fontWeight: '600' }}>Diagnostics</h3>
                                {diagnosticsMode === 'docked' && (
                                  <button
                                    onClick={() => setDiagnosticsMode('floating')}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#667eea',
                                      cursor: 'pointer',
                                      fontSize: '1.00rem',
                                      padding: '0.25rem 0.5rem'
                                    }}
                                    title="Pop out to floating panel"
                                  >
                                    ↗
                                  </button>
                                )}
                              </div>
                              <div style={{ flex: 1, overflow: 'auto' }}>
                                {diagnosticsMode === 'docked' && (
                                  <Diagnostics candidate={currentCandidate} baseDir={baseDir} />
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      },
                      {
                        id: 'scatterplot',
                        title: 'Scatter Plots',
                        defaultOpen: true,
                        defaultHeight: 500,
                        onPopOut: scatterPlotMode === 'docked' ? () => setScatterPlotMode('floating') : null,
                        content: scatterPlotMode === 'docked' ? (
                          <ResizableSplit
                            left={<ScatterPlot candidates={allCandidatesInUTC} currentCandidate={currentCandidate} />}
                            right={<ScatterPlot candidates={allCandidatesInUTC} currentCandidate={currentCandidate} />}
                            defaultLeftWidth={50}
                          />
                        ) : null
                      },
                      {
                        id: 'bulkclassify',
                        title: `Bulk Classify (${bulkClassifyCounts.unclassified} uncat, ${bulkClassifyCounts.classified} cat)`,
                        defaultOpen: false,
                        defaultHeight: 400,
                        onPopOut: bulkClassifyMode === 'docked' ? () => setBulkClassifyMode('floating') : null,
                        content: bulkClassifyMode === 'docked' && currentCandidate ? (
                          <BulkClassify
                            candidate={currentCandidate}
                            baseDir={baseDir}
                            onClassified={handleBulkClassified}
                            onCountsUpdate={setBulkClassifyCounts}
                          />
                        ) : null
                      }
                    ]}
                  />
                </div>
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
          <BeamMapCanvas
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
          title={`Bulk Classify Similar Candidates (${bulkClassifyCounts.unclassified} unclassified, ${bulkClassifyCounts.classified} classified)`}
          initialPosition={{ x: 200, y: 200 }}
          initialSize={{ width: 650, height: 550 }}
          onClose={() => setBulkClassifyMode('docked')}
          snapTargetRef={pngViewerRef}
        >
          <BulkClassify
            candidate={currentCandidate}
            baseDir={baseDir}
            onClassified={handleBulkClassified}
            onCountsUpdate={setBulkClassifyCounts}
          />
        </DraggablePanel>
      )}

      {/* Settings Dialog */}
      {showSettingsDialog && (
        <SettingsDialog
          sessionSettings={sessionSettings}
          setSessionSettings={setSessionSettings}
          onClose={() => setShowSettingsDialog(false)}
        />
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
