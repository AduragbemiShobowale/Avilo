import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { LiveProvider } from './context/LiveContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LiveProvider>
          <App />
          <Toaster position="bottom-right" toastOptions={{ className: 'toast', duration: 4500 }} />
        </LiveProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
