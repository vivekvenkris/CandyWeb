import { useState } from 'react'

export default function UTCSelector({ utcs, selectedUTC, onSelectUTC }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const handleSelect = (utc, index) => {
    setCurrentIndex(index)
    if (onSelectUTC) {
      onSelectUTC(utc)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1
      handleSelect(utcs[newIndex], newIndex)
    }
  }

  const handleNext = () => {
    if (currentIndex < utcs.length - 1) {
      const newIndex = currentIndex + 1
      handleSelect(utcs[newIndex], newIndex)
    }
  }

  if (!utcs || utcs.length === 0) {
    return null
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <button
        className="btn btn-small"
        onClick={handlePrevious}
        disabled={currentIndex === 0}
        title="Previous UTC"
      >
        {'<<'}
      </button>

      <select
        className="select-input-compact"
        value={selectedUTC || ''}
        onChange={(e) => {
          const index = utcs.indexOf(e.target.value)
          handleSelect(e.target.value, index)
        }}
        style={{ minWidth: '180px' }}
      >
        <option value="">Select UTC...</option>
        {utcs.map((utc) => (
          <option key={utc} value={utc}>
            {utc}
          </option>
        ))}
      </select>

      <button
        className="btn btn-small"
        onClick={handleNext}
        disabled={currentIndex === utcs.length - 1}
        title="Next UTC"
      >
        {'>>'}
      </button>
    </div>
  )
}
