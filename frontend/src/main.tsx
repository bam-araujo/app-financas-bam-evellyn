import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Auto-reload silencioso quando o service worker novo assume controle.
// Combinado com workbox skipWaiting+clientsClaim no vite.config, faz a
// versão nova em prod aparecer já na 1ª abertura do PWA (com 1 reload),
// em vez de exigir abrir/fechar o app 2-3 vezes pro cache do SW antigo
// sair do caminho. O guard `hadControllerAtBoot` evita reload na 1ª
// instalação (quando ainda não havia SW controlando).
if ('serviceWorker' in navigator) {
  const hadControllerAtBoot = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadControllerAtBoot) return
    refreshing = true
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
