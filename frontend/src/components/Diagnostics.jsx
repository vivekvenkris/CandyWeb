import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function Diagnostics({ candidate, baseDir }) {
  const [copiedCommand, setCopiedCommand] = useState(null)

  if (!candidate) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        <p>Select a candidate to view diagnostics</p>
      </div>
    )
  }

  const copyToClipboard = (text, commandName) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCommand(commandName)
      setTimeout(() => setCopiedCommand(null), 2000)
    })
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
    </div>
  )
}
