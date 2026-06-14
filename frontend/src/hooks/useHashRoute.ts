import { useEffect, useState } from 'react'

/**
 * Roteamento por hash, sem lib. Retorna o path depois do "#/".
 * Ex.: window.location.hash = "#/despesas" → "despesas".
 * Default = "despesas".
 */
export function useHashRoute(defaultRoute = 'despesas'): [string, (r: string) => void] {
  const [route, setRoute] = useState(() => parseHash(defaultRoute))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(defaultRoute))
    window.addEventListener('hashchange', onChange)
    // Inicializa hash se vazio para que o back-button funcione
    if (!window.location.hash) window.location.replace(`#/${defaultRoute}`)
    return () => window.removeEventListener('hashchange', onChange)
  }, [defaultRoute])

  const navigate = (r: string) => {
    window.location.hash = `#/${r}`
  }
  return [route, navigate]
}

function parseHash(fallback: string): string {
  const h = window.location.hash.replace(/^#\/?/, '')
  return h || fallback
}
