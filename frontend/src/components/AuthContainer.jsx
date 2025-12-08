import { useState } from 'react'
import Login from './Login'
import Register from './Register'

function AuthContainer({ onLoginSuccess }) {
  const [view, setView] = useState('login') // 'login' or 'register'

  const handleRegisterSuccess = (username) => {
    // Show success message and switch back to login
    setView('login')
    // Could optionally auto-login here, but for now we'll just redirect to login
  }

  const handleSwitchToRegister = () => {
    setView('register')
  }

  const handleBackToLogin = () => {
    setView('login')
  }

  if (view === 'register') {
    return (
      <Register
        onRegisterSuccess={handleRegisterSuccess}
        onBackToLogin={handleBackToLogin}
      />
    )
  }

  return (
    <Login
      onLoginSuccess={onLoginSuccess}
      onSwitchToRegister={handleSwitchToRegister}
    />
  )
}

export default AuthContainer
