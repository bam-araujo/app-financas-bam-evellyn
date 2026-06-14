import { useEffect, useState } from 'react'
import { ping, whoami, type WhoamiData } from './api/client'
import { CompetenciaSelector } from './components/CompetenciaSelector'
import { DEFAULT_FILTERS, Filters, type GlobalFilters } from './components/Filters'
import { LoginGate } from './components/LoginGate'
import { SearchPalette } from './components/SearchPalette'
import { Tabs } from './components/Tabs'
import { useAuth } from './hooks/useAuth'
import { useHashRoute } from './hooks/useHashRoute'
import { useTheme } from './hooks/useTheme'
import { currentCompetencia } from './lib/competencia'
import { greeting } from './lib/greeting'
import { AcertoPage } from './pages/Acerto'
import { DashboardPage } from './pages/Dashboard'
import { DespesasPage } from './pages/Despesas'
import { ImportarPage } from './pages/Importar'
import { InvestimentosPage } from './pages/Investimentos'
import { OrcamentoPage } from './pages/Orcamento'
import { ReceitasPage } from './pages/Receitas'

type ConnStatus =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'despesas', label: 'Despesas' },
  { key: 'receitas', label: 'Receitas' },
  { key: 'orcamento', label: 'Orçamento' },
  { key: 'acerto', label: 'Acerto' },
  { key: 'investimentos', label: 'Investimentos' },
]

export default function App() {
  const auth = useAuth()
  const [conn, setConn] = useState<ConnStatus>({ kind: 'loading' })
  const [me, setMe] = useState<WhoamiData | null>(null)
  const [meError, setMeError] = useState<string | null>(null)
  const [competencia, setCompetencia] = useState<string>(currentCompetencia())
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS)
  const [route, navigate] = useHashRoute('home')
  const { theme, toggle: toggleTheme } = useTheme()
  const [searchOpen, setSearchOpen] = useState(false)

  // Atalho global Cmd/Ctrl+K abre a paleta. Listener ativo só quando logado.
  useEffect(() => {
    if (!auth.session) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [auth.session])

  useEffect(() => {
    ping()
      .then(() => setConn({ kind: 'ok' }))
      .catch((err: Error) => setConn({ kind: 'error', message: err.message }))
  }, [])

  // Quando o usuário loga (ou já estava logado e o app carregou), busca whoami
  // pra ter o nome/cor da planilha (Bam ou Evellyn). Só re-roda quando session
  // muda — `auth` é objeto novo a cada render do useAuth, então NÃO entra na
  // dep (causaria refetch infinito).
  useEffect(() => {
    if (!auth.session) { setMe(null); setMeError(null); return }
    setMeError(null)
    whoami()
      .then(setMe)
      .catch((err: Error) => {
        setMeError(err.message)
        // Se o email não tá autorizado, dá signOut: não adianta continuar logado.
        if (err.message.includes('email_not_authorized')) auth.signOut()
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.session])

  // Pré-login: tela de gate
  if (!auth.session) return <LoginGate auth={auth} />

  return (
    <>
      <header className="app-header">
        <div className="app-header-row">
          <div className="brand">
            <h1>Dueto</h1>
            <span className="tagline">app de finanças</span>
          </div>
          <div className="app-header-actions">
            {me && (
              <span className="user-pill" title={`${me.email} · sair pelo menu`}>
                {auth.session.picture && (
                  <img src={auth.session.picture} alt="" className="user-avatar" referrerPolicy="no-referrer" />
                )}
                <span className="user-nome">{me.nome}</span>
              </span>
            )}
            <button
              type="button"
              className="search-toggle"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar (Ctrl+K)"
              title="Buscar (Ctrl+K)"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="signout-btn"
              onClick={auth.signOut}
              aria-label="Sair"
              title="Sair"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
            <ConnDot status={conn} />
          </div>
        </div>
        {me && (
          <p className="greeting" aria-live="polite">
            {greeting(me.nome)}
          </p>
        )}
        <CompetenciaSelector value={competencia} onChange={setCompetencia} />
        <Filters value={filters} onChange={setFilters} />
        <Tabs tabs={TABS} current={route} onChange={navigate} />
      </header>

      <main>
        {conn.kind === 'error' && (
          <p className="error-msg">Sem conexão com a API: {conn.message}</p>
        )}
        {meError && !meError.includes('email_not_authorized') && (
          <p className="error-msg">Não consegui identificar você: {meError}</p>
        )}
        {(route === 'home' || route === 'dashboard') && <DashboardPage competencia={competencia} filters={filters} />}
        {route === 'despesas' && <DespesasPage competencia={competencia} filters={filters} me={me} />}
        {route === 'receitas' && <ReceitasPage competencia={competencia} filters={filters} me={me} />}
        {route === 'orcamento' && <OrcamentoPage competencia={competencia} />}
        {route === 'acerto' && <AcertoPage competencia={competencia} />}
        {route === 'investimentos' && <InvestimentosPage filters={filters} me={me} />}
        {route === 'importar' && <ImportarPage me={me} />}
        {!['home', 'dashboard', 'despesas', 'receitas', 'orcamento', 'acerto', 'investimentos', 'importar'].includes(route) && (
          <p className="muted">Página desconhecida.</p>
        )}
      </main>

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(route, comp) => {
          // Competência primeiro: a página destino lê via prop e filtra por ela.
          if (comp && /^\d{4}-\d{2}$/.test(comp)) setCompetencia(comp)
          window.location.hash = route
        }}
      />
    </>
  )
}

function ConnDot({ status }: { status: ConnStatus }) {
  const cls = status.kind === 'ok' ? 'ok' : status.kind === 'error' ? 'err' : 'load'
  const title =
    status.kind === 'ok' ? 'Conectado' :
    status.kind === 'error' ? `Erro: ${status.message}` :
    'Verificando conexão…'
  return (
    <span className={`status ${cls}`} title={title} aria-label={title}>
      <span className="dot" />
    </span>
  )
}
