import { useState, useEffect } from 'react'
import { listDirectories, loadCandidates } from '../api/client'

export default function DirectorySelector({ onLoadComplete }) {
  const [directories, setDirectories] = useState([])
  const [selectedDir, setSelectedDir] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serverRoot, setServerRoot] = useState('')

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

  const handleLoad = async () => {
    if (!selectedDir) {
      setError('Please select a directory')
      return
    }

    try {
      setLoading(true)
      setError('')

      const csvPath = `${selectedDir}/candidates.csv`
      console.log('Loading candidates from:', csvPath)

      const response = await loadCandidates(csvPath, selectedDir)
      console.log('Candidates loaded:', response.data)

      if (onLoadComplete) {
        onLoadComplete(response.data, selectedDir)
      }
    } catch (err) {
      console.error('Error loading candidates:', err)
      setError(err.response?.data?.detail || 'Failed to load candidates')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="control-section">
      <h2>Directory Selection</h2>

      {serverRoot && (
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Server root: {serverRoot}
        </p>
      )}

      {error && (
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          marginBottom: '1rem',
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <label style={{ whiteSpace: 'nowrap' }}>Select Data Directory:</label>
        <select
          className="select-input"
          value={selectedDir}
          onChange={(e) => setSelectedDir(e.target.value)}
          disabled={loading}
          style={{ flex: 1 }}
        >
          <option value="">-- Select Directory --</option>
          {directories.map((dir) => (
            <option key={dir.path} value={dir.path}>
              {dir.name} ✓
            </option>
          ))}
        </select>

        <button
          className="btn btn-primary"
          onClick={handleLoad}
          disabled={loading || !selectedDir}
          style={{ flexShrink: 0 }}
        >
          {loading ? 'Loading...' : 'Load Candidates'}
        </button>
      </div>

      {directories.length > 0 && (
        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
          Found {directories.length} observation{directories.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
