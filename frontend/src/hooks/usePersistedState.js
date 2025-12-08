import { useState, useEffect } from 'react'

/**
 * Custom hook for state that persists to localStorage
 * Similar to useState but syncs with localStorage
 */
export function usePersistedState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.error(`Error loading persisted state for ${key}:`, error)
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      console.error(`Error persisting state for ${key}:`, error)
    }
  }, [key, state])

  return [state, setState]
}

/**
 * Save entire app session state to localStorage
 */
export function saveAppSession(sessionData) {
  try {
    localStorage.setItem('app_session', JSON.stringify(sessionData))
  } catch (error) {
    console.error('Error saving app session:', error)
  }
}

/**
 * Restore app session state from localStorage
 */
export function restoreAppSession() {
  try {
    const item = localStorage.getItem('app_session')
    return item ? JSON.parse(item) : null
  } catch (error) {
    console.error('Error restoring app session:', error)
    return null
  }
}

/**
 * Clear app session from localStorage
 */
export function clearAppSession() {
  try {
    localStorage.removeItem('app_session')
  } catch (error) {
    console.error('Error clearing app session:', error)
  }
}
