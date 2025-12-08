import { useState, useEffect } from 'react'
import { getSimilarCandidates, bulkClassify } from '../api/client'
import { ExternalLink } from 'lucide-react'

export default function BulkClassify({ candidate, baseDir, onClassified, onCountsUpdate }) {
  const [similarCandidates, setSimilarCandidates] = useState([])
  const [loading, setLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [onlySameBeam, setOnlySameBeam] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (candidate && baseDir) {
      loadSimilarCandidates()
    }
  }, [candidate, baseDir])

  const loadSimilarCandidates = async () => {
    try {
      setLoading(true)
      setMessage('')

      // Extract base_dir name for API call (remove leading slash and path)
      const dirName = baseDir.split('/').pop()

      const response = await getSimilarCandidates(dirName, candidate.line_num)
      const similar = response.data.similar || []

      // Filter out already classified candidates
      const unclassified = similar.filter(c => c.candidate_type === 'UNCAT')
      const classified = similar.filter(c => c.candidate_type !== 'UNCAT')

      setSimilarCandidates(unclassified)

      // Notify parent about counts
      if (onCountsUpdate) {
        onCountsUpdate({ unclassified: unclassified.length, classified: classified.length })
      }

      if (unclassified.length === 0) {
        setMessage('No similar uncategorized candidates found')
      }
    } catch (err) {
      console.error('Error loading similar candidates:', err)
      setMessage('Error loading similar candidates')
      if (onCountsUpdate) {
        onCountsUpdate({ unclassified: 0, classified: 0 })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBulkClassify = async (candidateType) => {
    if (similarCandidates.length === 0) {
      setMessage('No candidates to classify')
      return
    }

    const lineNums = similarCandidates.map(c => c.line_num)

    try {
      setClassifying(true)
      setMessage(`Classifying ${lineNums.length} candidates as ${candidateType}...`)

      // Extract base_dir name for API call
      const dirName = baseDir.split('/').pop()

      await bulkClassify(
        dirName,
        lineNums,
        candidateType,
        onlySameBeam,
        onlySameBeam ? candidate.beam_name : null
      )

      setMessage(`✓ Successfully classified ${lineNums.length} candidates as ${candidateType}`)

      // Reload similar candidates
      setTimeout(() => {
        loadSimilarCandidates()
        if (onClassified) onClassified()
      }, 1000)

    } catch (err) {
      console.error('Error bulk classifying:', err)
      setMessage('Error: ' + (err.response?.data?.detail || err.message))
    } finally {
      setClassifying(false)
    }
  }

  const openImage = (pngPath) => {
    const imageUrl = `/api/files/image?path=${baseDir}/${pngPath}`
    window.open(imageUrl, '_blank')
  }

  const getFrequencyRatio = (f1, f2) => {
    if (!f1 || !f2) return 'N/A'
    const ratio = f1 / f2
    return ratio.toFixed(4)
  }

  if (!candidate) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        <p>Select a candidate to view similar candidates</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.1rem' }}>
        Similar Candidates with harmonically related frequencies and similar DM
      </h3>

      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Loading similar candidates...
        </div>
      )}

      {!loading && similarCandidates.length === 0 && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          textAlign: 'center',
          color: '#6b7280'
        }}>
          {message || 'No similar uncategorized candidates found'}
        </div>
      )}

      {!loading && similarCandidates.length > 0 && (
        <>
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '6px',
            fontSize: '0.9rem'
          }}>
            Found <strong>{similarCandidates.length}</strong> similar uncategorized candidate{similarCandidates.length !== 1 ? 's' : ''}
          </div>

          <div style={{
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            marginBottom: '1rem'
          }}>
            <table style={{
              width: '100%',
              fontSize: '0.85rem',
              borderCollapse: 'collapse'
            }}>
              <thead style={{
                backgroundColor: '#f3f4f6',
                position: 'sticky',
                top: 0
              }}>
                <tr>
                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Beam</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>P0 (ms)</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>DM</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>SNR</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Ratio</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>View</th>
                </tr>
              </thead>
              <tbody>
                {similarCandidates.map((cand, idx) => (
                  <tr key={cand.line_num} style={{
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb'
                  }}>
                    <td style={{ padding: '0.5rem' }}>{cand.beam_name}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {cand.f0_opt ? (1000 / cand.f0_opt).toFixed(3) : 'N/A'}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {cand.dm_opt?.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {cand.sn_fold?.toFixed(1)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {getFrequencyRatio(cand.f0_opt, candidate.f0_opt)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <button
                        onClick={() => openImage(cand.png_path)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#667eea',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                        title="Open image in new tab"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={onlySameBeam}
                onChange={(e) => setOnlySameBeam(e.target.checked)}
              />
              Only classify candidates in beam: <strong>{candidate.beam_name}</strong>
            </label>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
              Bulk Classify As:
            </h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem'
            }}>
              <button
                onClick={() => handleBulkClassify('RFI')}
                disabled={classifying}
                style={{
                  padding: '0.6rem',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: classifying ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  opacity: classifying ? 0.6 : 1
                }}
              >
                RFI
              </button>
              <button
                onClick={() => handleBulkClassify('NOISE')}
                disabled={classifying}
                style={{
                  padding: '0.6rem',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: classifying ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  opacity: classifying ? 0.6 : 1
                }}
              >
                Noise
              </button>
              <button
                onClick={() => handleBulkClassify('T1_CAND')}
                disabled={classifying}
                style={{
                  padding: '0.6rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: classifying ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  opacity: classifying ? 0.6 : 1
                }}
              >
                Tier 1
              </button>
              <button
                onClick={() => handleBulkClassify('T2_CAND')}
                disabled={classifying}
                style={{
                  padding: '0.6rem',
                  backgroundColor: '#60a5fa',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: classifying ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  opacity: classifying ? 0.6 : 1
                }}
              >
                Tier 2
              </button>
              <button
                onClick={() => handleBulkClassify('KNOWN_PSR')}
                disabled={classifying}
                style={{
                  padding: '0.6rem',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: classifying ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  opacity: classifying ? 0.6 : 1
                }}
              >
                Known PSR
              </button>
              <button
                onClick={() => handleBulkClassify('NB_PSR')}
                disabled={classifying}
                style={{
                  padding: '0.6rem',
                  backgroundColor: '#a78bfa',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: classifying ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  opacity: classifying ? 0.6 : 1
                }}
              >
                NB PSR
              </button>
            </div>
          </div>

          {message && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: message.startsWith('✓') ? '#d1fae5' : '#fee',
              border: `1px solid ${message.startsWith('✓') ? '#a7f3d0' : '#fcc'}`,
              borderRadius: '6px',
              fontSize: '0.9rem',
              color: message.startsWith('✓') ? '#065f46' : '#c00'
            }}>
              {message}
            </div>
          )}
        </>
      )}
    </div>
  )
}
