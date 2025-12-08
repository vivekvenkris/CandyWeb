import { Copy, Check, Search, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { searchPulsarScraper, searchPsrcat } from '../api/client'

export default function Diagnostics({ candidate, baseDir }) {
  // All hooks must be called unconditionally at the top
  const [copiedCommand, setCopiedCommand] = useState(null)
  const [showPulsarPopup, setShowPulsarPopup] = useState(false)
  const [pulsarScraperResults, setPulsarScraperResults] = useState(null)
  const [loadingPulsarScraper, setLoadingPulsarScraper] = useState(false)
  const [pulsarScraperError, setPulsarScraperError] = useState(null)

  // PSRCAT results - always loaded
  const [psrcatResults, setPsrcatResults] = useState(null)
  const [loadingPsrcat, setLoadingPsrcat] = useState(false)
  const [psrcatError, setPsrcatError] = useState(null)

  const copyToClipboard = (text, commandName) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCommand(commandName)
      setTimeout(() => setCopiedCommand(null), 2000)
    })
  }

  // Load PSRCAT results when candidate changes
  useEffect(() => {
    if (candidate && baseDir) {
      setLoadingPsrcat(true)
      setPsrcatError(null)
      const dirName = baseDir.split('/').pop()

      searchPsrcat(dirName, candidate.line_num)
        .then(response => {
          setPsrcatResults(response.data)
          setPsrcatError(null)
        })
        .catch(err => {
          console.error('Error loading PSRCAT data:', err)
          setPsrcatError(err.response?.data?.detail || 'Failed to load PSRCAT data')
          setPsrcatResults(null)
        })
        .finally(() => {
          setLoadingPsrcat(false)
        })
    }
  }, [candidate, baseDir])

  // Early return after all hooks are called
  if (!candidate) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        <p>Select a candidate to view diagnostics</p>
      </div>
    )
  }

  // Handler for external pulsar scraper search (popup)
  const handleSearchPulsarScraper = async () => {
    setLoadingPulsarScraper(true)
    setPulsarScraperError(null)
    setPulsarScraperResults(null)

    try {
      const dirName = baseDir.split('/').pop()
      const response = await searchPulsarScraper(dirName, candidate.line_num)
      setPulsarScraperResults(response.data)
      setShowPulsarPopup(true)
    } catch (err) {
      console.error('Error searching Pulsar Scraper database:', err)
      setPulsarScraperError(err.response?.data?.detail || 'Failed to search Pulsar Scraper database')
      setShowPulsarPopup(true)
    } finally {
      setLoadingPulsarScraper(false)
    }
  }

  // Generate prepfold command
  const generatePrepfoldCommand = () => {
    const dm = candidate.dm_opt?.toFixed(2) || '0.0'
    const f0 = candidate.f0_opt?.toFixed(6) || '1.0'
    const acc = candidate.acc_opt
    const accErr = candidate.acc_opt_err
    const filterbank = candidate.filterbank_path || '*.fil'
    const beamName = candidate.beam_name || 'beam'
    const lineNum = candidate.line_num || '0'

    let cmd = `# PRESTO prepfold command\n`
    cmd += `filtool -t 12 -i 0 --telescope meerkat -z zdot --cont -o ${beamName}_${lineNum} -f ${filterbank};\n`
    cmd += `prepfold -topo -fixchi -dm ${dm} -nsub 64 -npart 64 -f ${f0}`

    // Add acceleration if significant (>2 sigma)
    if (acc && accErr && Math.abs(acc) > 2 * Math.abs(accErr)) {
      const zdot = (acc / 299792458.0).toExponential(6) // Convert to z-dot
      cmd += ` -z ${zdot}`
    }

    cmd += ` -o ${beamName}_${lineNum} ${beamName}_${lineNum}*.fil`

    return cmd
  }

  // Generate pulsarx command
  const generatePulsarXCommand = () => {
    const dm = candidate.dm_opt?.toFixed(2) || '0.0'
    const f0 = candidate.f0_opt?.toFixed(6) || '1.0'
    const acc = candidate.acc_opt
    const filterbank = candidate.filterbank_path || '*.fil'
    const beamName = candidate.beam_name || 'beam'
    const lineNum = candidate.line_num || '0'

    let cmd = `# PulsarX folding command\n`
    cmd += `psrfold_fil -v -t 4 --dm ${dm} --f0 ${f0}`

    if (acc && Math.abs(acc) > 0) {
      cmd += ` --acc ${acc.toExponential(6)}`
    }

    cmd += ` -o ${beamName}_${lineNum} -f ${filterbank}`

    return cmd
  }

  // Generate dspsr command
  const generateDspsrCommand = () => {
    const dm = candidate.dm_opt?.toFixed(2) || '0.0'
    const filterbank = candidate.filterbank_path || '*.fil'
    const beamName = candidate.beam_name || 'beam'
    const lineNum = candidate.line_num || '0'

    let cmd = `# DSPSR folding command\n`
    cmd += `dspsr -t 4 -k meerkat -b 128 -A -Lmin 15 -L 20 -c 0.810 -D ${dm}`
    cmd += ` -O ${beamName}_${lineNum} ${filterbank}`

    return cmd
  }

  const prepfoldCmd = generatePrepfoldCommand()
  const pulsarxCmd = generatePulsarXCommand()
  const dspsrCmd = generateDspsrCommand()

  const CommandBlock = ({ title, command, commandKey }) => (
    <div style={{
      marginBottom: '1.5rem',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      overflow: 'hidden'
    }}>
      <div style={{
        backgroundColor: '#f3f4f6',
        padding: '0.5rem 0.75rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{title}</span>
        <button
          onClick={() => copyToClipboard(command, commandKey)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.25rem 0.5rem',
            fontSize: '0.85rem',
            backgroundColor: copiedCommand === commandKey ? '#10b981' : '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {copiedCommand === commandKey ? (
            <>
              <Check size={14} />
              Copied
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre style={{
        margin: 0,
        padding: '0.75rem',
        fontSize: '0.8rem',
        backgroundColor: '#1f2937',
        color: '#f3f4f6',
        overflowX: 'auto',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all'
      }}>
        {command}
      </pre>
    </div>
  )

  return (
    <div style={{ padding: '1rem' }}>
      {/* PSRCAT Known Pulsars Table - Always visible, at top */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Known Pulsars (PSRCAT)
          {loadingPsrcat && <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Loading...</span>}
        </h4>

        {psrcatError && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '0.85rem',
            marginBottom: '1rem'
          }}>
            {psrcatError}
          </div>
        )}

        {psrcatResults && psrcatResults.results && psrcatResults.results.length > 0 ? (
          <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table style={{
              width: '100%',
              fontSize: '0.8rem',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Name</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Dist (°)</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>P0 (ms)</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>DM</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>ΔDM</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>C/P</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>P/C</th>
                </tr>
              </thead>
              <tbody>
                {psrcatResults.results.slice(0, 10).map((pulsar, idx) => {
                  // Format frequency ratios with harmonic detection
                  const formatRatio = (ratio) => {
                    if (!ratio) return { value: 'N/A', isHarmonic: false }
                    const nearestInt = Math.round(ratio)
                    const isHarmonic = Math.abs(ratio - nearestInt) < 0.02 * nearestInt
                    return {
                      value: isHarmonic ? `${ratio.toFixed(2)} (${nearestInt}×)` : ratio.toFixed(2),
                      isHarmonic
                    }
                  }

                  const candPsrRatio = formatRatio(pulsar.freq_ratio_cand_psr)
                  const psrCandRatio = formatRatio(pulsar.freq_ratio_psr_cand)

                  return (
                    <tr key={idx} style={{
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb'
                    }}>
                      <td style={{ padding: '0.5rem', fontWeight: '600' }}>{pulsar.name || pulsar.name_b || 'N/A'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{pulsar.angular_distance_deg?.toFixed(4) || 'N/A'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{pulsar.p0 ? (pulsar.p0 * 1000).toFixed(2) : (pulsar.f0 ? (1000.0 / pulsar.f0).toFixed(2) : 'N/A')}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{pulsar.dm?.toFixed(1) || 'N/A'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{pulsar.delta_dm !== null && pulsar.delta_dm !== undefined ? pulsar.delta_dm.toFixed(1) : 'N/A'}</td>
                      <td style={{
                        padding: '0.5rem',
                        textAlign: 'right',
                        fontWeight: candPsrRatio.isHarmonic ? '700' : 'normal',
                        color: candPsrRatio.isHarmonic ? '#059669' : 'inherit'
                      }}>{candPsrRatio.value}</td>
                      <td style={{
                        padding: '0.5rem',
                        textAlign: 'right',
                        fontWeight: psrCandRatio.isHarmonic ? '700' : 'normal',
                        color: psrCandRatio.isHarmonic ? '#059669' : 'inherit'
                      }}>{psrCandRatio.value}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {psrcatResults.results.length > 10 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280', textAlign: 'center' }}>
                Showing 10 of {psrcatResults.count} pulsars within {psrcatResults.search_params.radius_deg}°
              </div>
            )}
          </div>
        ) : !loadingPsrcat && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '6px',
            color: '#6b7280',
            fontSize: '0.85rem',
            textAlign: 'center'
          }}>
            No known pulsars found within search radius
          </div>
        )}
      </div>

      <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>
        Folding Commands
      </h3>

      <CommandBlock
        title="PRESTO prepfold"
        command={prepfoldCmd}
        commandKey="prepfold"
      />

      <CommandBlock
        title="PulsarX psrfold_fil"
        command={pulsarxCmd}
        commandKey="pulsarx"
      />

      <CommandBlock
        title="DSPSR"
        command={dspsrCmd}
        commandKey="dspsr"
      />

      <div style={{
        marginTop: '1.5rem',
        padding: '0.75rem',
        backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '6px',
        fontSize: '0.85rem'
      }}>
        <strong>Note:</strong> Commands use optimized parameters from the candidate.
        {candidate.acc_opt && Math.abs(candidate.acc_opt) > 2 * Math.abs(candidate.acc_opt_err || 0) && (
          <div style={{ marginTop: '0.5rem' }}>
            ⚠️ Significant acceleration detected ({candidate.acc_opt.toExponential(2)} m/s²)
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Candidate Parameters</h4>
        <table style={{
          width: '100%',
          fontSize: '0.85rem',
          borderCollapse: 'collapse'
        }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem', fontWeight: '600' }}>DM (pc/cc)</td>
              <td style={{ padding: '0.5rem' }}>
                {candidate.dm_opt?.toFixed(2)} ± {candidate.dm_opt_err?.toFixed(2)}
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem', fontWeight: '600' }}>F0 (Hz)</td>
              <td style={{ padding: '0.5rem' }}>
                {candidate.f0_opt?.toFixed(6)} ± {candidate.f0_opt_err?.toFixed(6)}
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem', fontWeight: '600' }}>P0 (ms)</td>
              <td style={{ padding: '0.5rem' }}>
                {candidate.f0_opt ? (1000 / candidate.f0_opt).toFixed(3) : 'N/A'}
              </td>
            </tr>
            {candidate.f1_opt && (
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '0.5rem', fontWeight: '600' }}>F1 (Hz/s)</td>
                <td style={{ padding: '0.5rem' }}>
                  {candidate.f1_opt.toExponential(3)} ± {candidate.f1_opt_err?.toExponential(3)}
                </td>
              </tr>
            )}
            {candidate.acc_opt && (
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '0.5rem', fontWeight: '600' }}>Acc (m/s²)</td>
                <td style={{ padding: '0.5rem' }}>
                  {candidate.acc_opt.toExponential(3)} ± {candidate.acc_opt_err?.toExponential(3)}
                </td>
              </tr>
            )}
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem', fontWeight: '600' }}>SNR (fold)</td>
              <td style={{ padding: '0.5rem' }}>{candidate.sn_fold?.toFixed(2)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem', fontWeight: '600' }}>SNR (fft)</td>
              <td style={{ padding: '0.5rem' }}>{candidate.sn_fft?.toFixed(2)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', fontWeight: '600' }}>T_obs (s)</td>
              <td style={{ padding: '0.5rem' }}>{candidate.tobs?.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Search External Pulsar Scraper Button */}
      <div style={{ marginTop: '1.5rem' }}>
        <button
          onClick={handleSearchPulsarScraper}
          disabled={loadingPulsarScraper}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loadingPulsarScraper ? 'not-allowed' : 'pointer',
            fontSize: '0.95rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            opacity: loadingPulsarScraper ? 0.6 : 1
          }}
        >
          <Search size={18} />
          {loadingPulsarScraper ? 'Searching...' : 'Search PSC2'}
        </button>
      </div>

      {/* Pulsar Search Results Popup */}
      {showPulsarPopup && (
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
          zIndex: 10000,
          padding: '2rem'
        }}
        onClick={() => setShowPulsarPopup(false)}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              backgroundColor: 'white',
              zIndex: 1
            }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>
                Known Pulsar Search Results
              </h2>
              <button
                onClick={() => setShowPulsarPopup(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#6b7280'
                }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '1.5rem' }}>
              {pulsarScraperError ? (
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: '6px',
                  color: '#991b1b'
                }}>
                  <strong>Error:</strong> {pulsarScraperError}
                </div>
              ) : pulsarScraperResults ? (
                <>
                  {/* Search Parameters */}
                  <div style={{
                    marginBottom: '1.5rem',
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}>
                    <h3 style={{ marginTop: 0, fontSize: '1rem', marginBottom: '0.75rem' }}>Search Parameters</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div><strong>RA:</strong> {pulsarScraperResults.candidate.ra_deg.toFixed(5)}° ({pulsarScraperResults.candidate.ra_hours.toFixed(5)}h)</div>
                      <div><strong>DEC:</strong> {pulsarScraperResults.candidate.dec_deg.toFixed(5)}°</div>
                      <div><strong>DM:</strong> {pulsarScraperResults.candidate.dm.toFixed(2)} pc/cc</div>
                      <div><strong>Search Radius:</strong> {pulsarScraperResults.search_params.radius_arcmin} arcmin</div>
                      <div><strong>DM Tolerance:</strong> ±{pulsarScraperResults.search_params.dm_tolerance} pc/cc</div>
                    </div>
                  </div>

                  {/* Results */}
                  {pulsarScraperResults.results && pulsarScraperResults.results.length > 0 ? (
                    <div>
                      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
                        Found {Array.isArray(pulsarScraperResults.results) ? pulsarScraperResults.results.length : 0} Known Pulsar{(Array.isArray(pulsarScraperResults.results) && pulsarScraperResults.results.length !== 1) ? 's' : ''}
                      </h3>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{
                          width: '100%',
                          fontSize: '0.85rem',
                          borderCollapse: 'collapse'
                        }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f3f4f6' }}>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Name</th>
                              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>RA (deg)</th>
                              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>DEC (deg)</th>
                              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>P0 (ms)</th>
                              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>DM</th>
                              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Separation</th>
                              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Distance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pulsarScraperResults.results.map((pulsar, idx) => (
                              <tr key={idx} style={{
                                borderBottom: '1px solid #e5e7eb',
                                backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb'
                              }}>
                                <td style={{ padding: '0.75rem', fontWeight: '600' }}>{pulsar.name || pulsar.jname || 'N/A'}</td>
                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{pulsar.raj_deg?.toFixed(5) || 'N/A'}</td>
                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{pulsar.decj_deg?.toFixed(5) || 'N/A'}</td>
                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{pulsar.p0 ? (pulsar.p0 * 1000).toFixed(3) : 'N/A'}</td>
                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{pulsar.dm?.toFixed(2) || 'N/A'}</td>
                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{pulsar.angular_separation ? `${pulsar.angular_separation.toFixed(2)}'` : 'N/A'}</td>
                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{pulsar.dist ? `${pulsar.dist.toFixed(1)} kpc` : 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '2rem',
                      textAlign: 'center',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      color: '#6b7280'
                    }}>
                      No known pulsars found within search radius and DM tolerance.
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
