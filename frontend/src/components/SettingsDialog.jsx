import { Settings } from 'lucide-react'

export default function SettingsDialog({ sessionSettings, setSessionSettings, onClose }) {
  return (
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
    onClick={onClose}
    >
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        maxWidth: '600px',
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
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.40rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={24} />
            Session Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.65rem',
              color: '#6b7280',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          <div style={{
            marginBottom: '1rem',
            padding: '1rem',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '6px',
            fontSize: '1.05rem'
          }}>
            <strong>Note:</strong> These settings apply only to the current session and will reset on logout.
          </div>

          {/* PSC2 Scraper Radius */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '1.10rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              PSC2 Search Radius (degrees)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={sessionSettings.pulsarScraperRadius}
              onChange={(e) => setSessionSettings({ ...sessionSettings, pulsarScraperRadius: parseFloat(e.target.value) || 5.0 })}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1.05rem'
              }}
            />
            <p style={{ fontSize: '1.00rem', color: '#6b7280', marginTop: '0.5rem', margin: '0.5rem 0 0 0' }}>
              Search radius for PSC2 pulsar database queries (default: 5.0°)
            </p>
          </div>

          {/* PSC2 DM Tolerance */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '1.10rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              PSC2 DM Tolerance (pc/cm³)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={sessionSettings.pulsarScraperDmTol}
              onChange={(e) => setSessionSettings({ ...sessionSettings, pulsarScraperDmTol: parseFloat(e.target.value) || 10.0 })}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1.05rem'
              }}
            />
            <p style={{ fontSize: '1.00rem', color: '#6b7280', marginTop: '0.5rem', margin: '0.5rem 0 0 0' }}>
              DM tolerance for PSC2 searches (default: 10.0 pc/cm³)
            </p>
          </div>

          {/* PSRCAT Search Radius */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '1.10rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              PSRCAT Search Radius (degrees)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={sessionSettings.psrcatSearchRadius}
              onChange={(e) => setSessionSettings({ ...sessionSettings, psrcatSearchRadius: parseFloat(e.target.value) || 2.0 })}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1.05rem'
              }}
            />
            <p style={{ fontSize: '1.00rem', color: '#6b7280', marginTop: '0.5rem', margin: '0.5rem 0 0 0' }}>
              Search radius for PSRCAT database queries (default: 2.0°)
            </p>
          </div>

          {/* Autosave Interval */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '1.10rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Autosave Interval (minutes)
            </label>
            <input
              type="number"
              step="1"
              min="1"
              max="60"
              value={sessionSettings.autosaveInterval}
              onChange={(e) => setSessionSettings({ ...sessionSettings, autosaveInterval: parseInt(e.target.value) || 2 })}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1.05rem'
              }}
            />
            <p style={{ fontSize: '1.00rem', color: '#6b7280', marginTop: '0.5rem', margin: '0.5rem 0 0 0' }}>
              How often to auto-save classifications (default: 2 minutes)
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button
              onClick={() => {
                setSessionSettings({
                  pulsarScraperRadius: 5.0,
                  pulsarScraperDmTol: 10.0,
                  psrcatSearchRadius: 2.0,
                  autosaveInterval: 2
                })
              }}
              style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1.05rem',
                fontWeight: '600'
              }}
            >
              Reset to Defaults
            </button>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1.05rem',
                fontWeight: '600'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
