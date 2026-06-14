import { useEffect, useRef } from 'react'
import type { UseAuthResult } from '../hooks/useAuth'

/**
 * Tela de login. Recebe o resultado do useAuth e pede pro GIS renderizar
 * o botão dentro de um <div> nosso. O backend é quem checa allowlist —
 * o login no Google não garante acesso; só identifica.
 */
interface Props {
  auth: UseAuthResult
}

export function LoginGate({ auth }: Props) {
  const btnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (auth.loading || !auth.configured) return
    if (btnRef.current) auth.renderSignInButton(btnRef.current)
  }, [auth.loading, auth.configured, auth.renderSignInButton])

  return (
    <div className="login-gate">
      <div className="login-card">
        <div className="brand brand-login">
          <h1>Dueto</h1>
          <span className="tagline">app de finanças</span>
        </div>
        <p className="muted">Liberdade financeira conquistada em conjunto.</p>
        <p>Entra com o Google pra acessar os dados do casal.</p>

        {auth.loading && <p className="muted">Inicializando…</p>}
        {!auth.configured && (
          <p className="error-msg">
            App não configurado: variável <code>VITE_GOOGLE_CLIENT_ID</code> está faltando.
            Veja <code>docs/SETUP.md</code>.
          </p>
        )}
        {auth.error && auth.configured && (
          <p className="error-msg">Erro: {auth.error}</p>
        )}

        {!auth.loading && auth.configured && <div ref={btnRef} className="login-button-slot" />}

        <p className="muted-light" style={{ fontSize: '0.78rem', marginTop: '1rem' }}>
          Acesso restrito aos titulares cadastrados na planilha. Outros emails são rejeitados.
        </p>
      </div>
    </div>
  )
}
