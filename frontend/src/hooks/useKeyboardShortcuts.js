import { useEffect } from 'react'

export function useKeyboardShortcuts({
  onPrevious,
  onNext,
  onClassify,
  enabled = true
}) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyPress = (e) => {
      // Don't trigger if typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }

      const key = e.key.toLowerCase()

      switch (key) {
        // Navigation
        case 'a':
          e.preventDefault()
          onPrevious?.()
          break
        case 'd':
          e.preventDefault()
          onNext?.()
          break

        // Classification
        case 'y':
          e.preventDefault()
          onClassify?.('RFI')
          break
        case 'u':
          e.preventDefault()
          onClassify?.('NOISE')
          break
        case 'i':
          e.preventDefault()
          onClassify?.('T1_CAND')
          break
        case 'o':
          e.preventDefault()
          onClassify?.('T2_CAND')
          break
        case 'p':
          e.preventDefault()
          onClassify?.('KNOWN_PSR')
          break
        case 'l':
          e.preventDefault()
          onClassify?.('NB_PSR')
          break
        case 'r':
          e.preventDefault()
          onClassify?.('UNCAT')
          break

        // Image viewer
        case ' ':
          e.preventDefault()
          // Space key handled in main app for opening image
          const event = new CustomEvent('openFullImage')
          window.dispatchEvent(event)
          break

        default:
          break
      }
    }

    document.addEventListener('keydown', handleKeyPress)

    return () => {
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [enabled, onPrevious, onNext, onClassify])
}
