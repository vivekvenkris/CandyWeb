import { useState, useEffect } from 'react'
import { checkSession, logout as apiLogout } from '../api/client'
import { clearAppSession } from './usePersistedState'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  // Check session on mount and restore from localStorage
  useEffect(() => {
    const restoreSession = async () => {
      // First try to restore from localStorage
      const storedUsername = localStorage.getItem('username')
      const storedName = localStorage.getItem('name')

      if (storedUsername && storedName) {
        // Verify session is still valid with backend
        try {
          const response = await checkSession()
          const { authenticated, username, name } = response.data

          if (authenticated) {
            setUser({ username, name })
            setAuthenticated(true)
          } else {
            // Session expired, clear localStorage
            localStorage.removeItem('session_token')
            localStorage.removeItem('username')
            localStorage.removeItem('name')
            setUser(null)
            setAuthenticated(false)
          }
        } catch (err) {
          console.error('Session check failed:', err)
          // Clear localStorage on error
          localStorage.removeItem('session_token')
          localStorage.removeItem('username')
          localStorage.removeItem('name')
          setUser(null)
          setAuthenticated(false)
        }
      }

      setLoading(false)
    }

    restoreSession()
  }, [])

  const login = (userData) => {
    setUser(userData)
    setAuthenticated(true)
  }

  const logout = async () => {
    // Only call logout API if we have a valid session token
    const hasSession = localStorage.getItem('session_token')

    if (hasSession) {
      try {
        await apiLogout()
      } catch (err) {
        console.error('Logout error:', err)
      }
    }

    // Clear local state
    setUser(null)
    setAuthenticated(false)

    // Clear localStorage - both auth and app session
    localStorage.removeItem('session_token')
    localStorage.removeItem('username')
    localStorage.removeItem('name')
    clearAppSession()
  }

  return {
    user,
    authenticated,
    loading,
    login,
    logout
  }
}
