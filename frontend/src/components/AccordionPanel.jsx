import { useState } from 'react'
import { ChevronDown, ChevronUp, Maximize2 } from 'lucide-react'

export default function AccordionPanel({ title, children, defaultOpen = false, onPopOut }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      marginBottom: '0.5rem',
      backgroundColor: 'white',
      overflow: 'hidden'
    }}>
      <div
        style={{
          padding: '0.75rem 1rem',
          backgroundColor: isOpen ? '#f3f4f6' : 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
          borderBottom: isOpen ? '1px solid #e5e7eb' : 'none'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', fontSize: '1.20rem' }}>
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <span>{title}</span>
        </div>
        {onPopOut && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPopOut()
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              color: '#667eea'
            }}
            title="Pop out to floating window"
          >
            <Maximize2 size={18} />
          </button>
        )}
      </div>
      {isOpen && (
        <div style={{ padding: '1rem' }}>
          {children}
        </div>
      )}
    </div>
  )
}
