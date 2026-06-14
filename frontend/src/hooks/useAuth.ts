import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Integração com Google Identity Services (GIS) + sessão local.
 *
 * Fluxo:
 *  1. GIS callback recebe um id_token (JWT) quando o usuário aprova
 *  2. Decodificamos o payload (sem verify de assinatura — quem valida é o
 *     backend) só pra extrair email/name/picture/exp pra UX
 *  3. Persistimos em sessionStorage; o token vale 1h (Google)
 *  4. Em cada request, client.ts pega `currentIdToken()` e manda no body
 *  5. Quando expira, o app pede login de novo
 *
 * O backend valida ASSINATURA do token via oauth2.googleapis.com/tokeninfo.
 * O frontend só decodifica o payload pra UX — confiar nele aqui não é problema
 * porque a autorização real está no backend.
 */

const STORAGE_KEY = 'dueto.session'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

export interface AuthSession {
  idToken: string
  email: string
  name: string
  picture: string
  expiresAt: number // unix seconds
}

interface JwtPayload {
  email?: string
  name?: string
  picture?: string
  exp?: number
}

// Decode base64url-encoded JWT payload. Não verifica assinatura — quem
// valida é o backend. Usado só pra extrair email/exp pra UX.
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '==='.slice((b64.length + 3) % 4)
    return JSON.parse(atob(padded)) as JwtPayload
  } catch {
    return null
  }
}

function loadSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as AuthSession
    if (!s.idToken || !s.expiresAt) return null
    // Margem de 30s antes do exp pra evitar token expirando in-flight.
    if (s.expiresAt * 1000 < Date.now() + 30_000) return null
    return s
  } catch {
    return null
  }
}

function saveSession(s: AuthSession | null) {
  if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  else sessionStorage.removeItem(STORAGE_KEY)
}

// Ref exposta pra client.ts pegar o token corrente sem precisar de prop drill.
let currentTokenRef: { token: string | null } = { token: null }
export function currentIdToken(): string | null {
  return currentTokenRef.token
}
export function clearCurrentIdToken() {
  currentTokenRef.token = null
}

interface GisAccountsId {
  initialize: (config: {
    client_id: string
    callback: (response: { credential: string }) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
  }) => void
  prompt: (callback?: (notification: unknown) => void) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
  disableAutoSelect: () => void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GisAccountsId } }
  }
}

/**
 * Aguarda window.google.accounts.id ficar disponível (script GIS é async).
 * Resolve quando pronto; rejeita após timeoutMs.
 */
function waitForGis(timeoutMs = 8000): Promise<GisAccountsId> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      const id = window.google?.accounts?.id
      if (id) return resolve(id)
      if (Date.now() - start > timeoutMs) return reject(new Error('gis_timeout'))
      setTimeout(tick, 100)
    }
    tick()
  })
}

export interface UseAuthResult {
  session: AuthSession | null
  loading: boolean
  error: string | null
  configured: boolean
  renderSignInButton: (el: HTMLElement) => void
  signOut: () => void
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const gisRef = useRef<GisAccountsId | null>(null)
  const configured = !!CLIENT_ID

  // Mantém currentTokenRef alinhado com session pra client.ts ler.
  useEffect(() => {
    currentTokenRef.token = session?.idToken ?? null
  }, [session])

  const handleCredential = useCallback((credential: string) => {
    const payload = decodeJwtPayload(credential)
    if (!payload || !payload.email || !payload.exp) {
      setError('id_token_inválido')
      return
    }
    const next: AuthSession = {
      idToken: credential,
      email: payload.email,
      name: payload.name || '',
      picture: payload.picture || '',
      expiresAt: payload.exp,
    }
    saveSession(next)
    setSession(next)
    setError(null)
  }, [])

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      setError('VITE_GOOGLE_CLIENT_ID não configurado')
      return
    }
    let cancelled = false
    waitForGis()
      .then((gis) => {
        if (cancelled) return
        gisRef.current = gis
        gis.initialize({
          client_id: CLIENT_ID as string,
          callback: (response) => handleCredential(response.credential),
          auto_select: false,
          cancel_on_tap_outside: false,
        })
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [configured, handleCredential])

  const renderSignInButton = useCallback((el: HTMLElement) => {
    const gis = gisRef.current
    if (!gis || !el) return
    el.innerHTML = ''
    gis.renderButton(el, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
    })
  }, [])

  const signOut = useCallback(() => {
    gisRef.current?.disableAutoSelect()
    saveSession(null)
    setSession(null)
  }, [])

  return { session, loading, error, configured, renderSignInButton, signOut }
}
