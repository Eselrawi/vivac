import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// Si hay versión nueva, se instala y la página se recarga sola una vez.
const hadController = !!navigator.serviceWorker?.controller
navigator.serviceWorker?.addEventListener('controllerchange', () => { if (hadController) location.reload() })
// Si tras una actualización falta un trozo de la app, recargamos una vez para coger la versión nueva.
window.addEventListener('vite:preloadError', () => { if (!sessionStorage.getItem('vivac.reloaded')) { sessionStorage.setItem('vivac.reloaded', '1'); location.reload() } })
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
