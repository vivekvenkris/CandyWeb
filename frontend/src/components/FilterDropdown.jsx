import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export default function FilterDropdown({ filterTypes, onFilterChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const selectedCount = Object.values(filterTypes).filter(Boolean).length
  const totalCount = Object.keys(filterTypes).length

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-small"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          minWidth: '120px',
          justifyContent: 'space-between'
        }}
      >
        <span>Filters ({selectedCount}/{totalCount})</span>
        <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '0.25rem',
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
          zIndex: 1000,
          minWidth: '200px',
          padding: '0.5rem'
        }}>
          {Object.keys(filterTypes).map(type => (
            <label
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.5rem',
                cursor: 'pointer',
                borderRadius: '3px',
                fontSize: '1.00rem'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <input
                type="checkbox"
                checked={filterTypes[type]}
                onChange={() => onFilterChange(type)}
                style={{ cursor: 'pointer' }}
              />
              {type}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
