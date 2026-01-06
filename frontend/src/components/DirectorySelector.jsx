import { useState, useEffect } from 'react'
import { listDirectories, loadCandidates } from '../api/client'

export default function DirectorySelector({ onLoadComplete, hasUnsavedChanges }) {
  const [directories, setDirectories] = useState([])
  const [selectedDir, setSelectedDir] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serverRoot, setServerRoot] = useState('')
  const [showWarning, setShowWarning] = useState(false)
  const [pendingDir, setPendingDir] = useState(null)

  useEffect(() => {
    fetchDirectories()
  }, [])

  const fetchDirectories = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await listDirectories()

      console.log('Directories response:', response.data)

      setServerRoot(response.data.server_root)

      // Filter to only show directories with candidates.csv
      const dirsWithCsv = response.data.directories.filter(d => d.has_candidates_csv)
      setDirectories(dirsWithCsv)

      if (dirsWithCsv.length === 0) {
        setError(`No directories with candidates.csv found in ${response.data.server_root}`)
      }
    } catch (err) {
      console.error('Error fetching directories:', err)
      setError(err.response?.data?.detail || 'Failed to fetch directories')
    } finally {
      setLoading(false)
    }
  }

  const handleDirectoryChange = (e) => {
    const newDir = e.target.value

    // Check if there are unsaved changes when changing directory
    if (selectedDir && hasUnsavedChanges && hasUnsavedChanges()) {
      setPendingDir(newDir)
      setShowWarning(true)
      return
    }

    setSelectedDir(newDir)
  }

  const handleLoad = async () => {
    if (!selectedDir) {
      setError('Please select a directory')
      return
    }

    await performLoad(selectedDir)
  }

  const performLoad = async (dirToLoad) => {
    try {
      setLoading(true)
      setError('')

      const csvPath = `${dirToLoad}/candidates.csv`
      console.log('Loading candidates from:', csvPath)

      const response = await loadCandidates(csvPath, dirToLoad)
      console.log('Candidates loaded:', response.data)

      if (onLoadComplete) {
        onLoadComplete(response.data, dirToLoad)
      }
    } catch (err) {
      console.error('Error loading candidates:', err)
      setError(err.response?.data?.detail || 'Failed to load candidates')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmChange = async () => {
    setShowWarning(false)
    if (pendingDir) {
      setSelectedDir(pendingDir)
      // Automatically load the new directory after confirming the change
      await performLoad(pendingDir)
      setPendingDir(null)
    }
  }

  const handleCancelChange = () => {
    setShowWarning(false)
    setPendingDir(null)
    // Keep the current selection, don't change it
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <select
          className="select-input-compact"
          value={selectedDir}
          onChange={handleDirectoryChange}
          disabled={loading}
          style={{ minWidth: '200px' }}
          title={serverRoot ? `Server root: ${serverRoot}` : 'Select a data directory'}
        >
          <option value="">Select Directory...</option>
          {directories.map((dir) => (
            <option key={dir.path} value={dir.path} title={dir.path}>
              {dir.name}
            </option>
          ))}
        </select>

        <button
          className="btn btn-primary"
          onClick={handleLoad}
          disabled={loading || !selectedDir}
          style={{ whiteSpace: 'nowrap' }}
        >
          {loading ? 'Loading...' : 'Load Candidates'}
        </button>
      </div>

      {/* Warning Dialog */}
      {showWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h2 style={{ marginTop: 0, color: '#ef4444' }}>Unsaved Changes</h2>
            <p style={{ marginBottom: '1.5rem', fontSize: '1.05rem' }}>
              You have unsaved classifications. Changing directory will discard all unsaved work.
            </p>
            <p style={{ marginBottom: '1.5rem', fontWeight: '600' }}>
              Do you want to continue without saving?
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={handleCancelChange}
                style={{ padding: '0.75rem 1.5rem' }}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleConfirmChange}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#ef4444',
                  color: 'white'
                }}
              >
                Continue Without Saving
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
