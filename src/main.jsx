import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { setupAuthInterceptor } from './utils/fetchAuth.js'
import { ThemeProvider } from './contexts/ThemeContext.jsx'

setupAuthInterceptor();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
