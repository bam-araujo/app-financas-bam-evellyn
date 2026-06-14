# AGENTS.md

Instruções permanentes para qualquer agente trabalhando neste repositório. **Leia inteiro antes de começar uma tarefa.** Este é o doc canônico — outros arquivos (`README`, `docs/SETUP.md`, `docs/QA-REPORT.md`) são complementares.

---

## O projeto

PWA de controle financeiro para **Bam** e **Evellyn** (casal). Custo zero, deployado em GitHub Pages, com Google Sheets como banco e Apps Script como API.

Produção: https://bam-araujo.github.io/app-financas-bam-evellyn/

Stack:
- **Frontend:** React + Vite + TypeScript, instalável como PWA, em `/frontend`
- **Backend:** Google Apps Script (8 módulos `.gs`), em `/backend`
- **Banco:** Google Sheets (7 abas — schema em `01_Schema.gs`)
- **Auth:** OAuth Google (id_token) + allowlist na aba `pessoas`
- **CI/CD:** GitHub Actions → Pages, deploy automático em push pra `main`

---

## Regras inegociáveis (nunca violar)

1. **Custo zero.** Nada pago. Nenhum cadastro que peça cartão. Se uma solução exige pagamento, parar e sinalizar.
2. **Sem integração bancária automática.** Open Finance é pago, fora de escopo. Dados entram por digitação ou import de arquivo.
3. **Privacidade dos extratos.** Parsing de OFX/CSV/PDF é **100% client-side**. Arquivos do banco nunca sobem pra servidor algum.
4. **Toda escrita na planilha usa `LockService`.** Dois usuários simultâneos não podem corromper linhas. Use `withLock_()` em `03_Main.gs`.
5. **Não commitar segredos.** Tokens em Script Properties (backend) ou GitHub Secrets (CI). Bundle do frontend é público — só vão pra lá coisas que podem ser públicas (URL, Client ID OAuth).
6. **Não inventar schema.** Tabelas e colunas são as definidas em `01_Schema.gs`. Não criar campo novo sem motivo claro. Em dúvida, perguntar.

---

## Modelo de autenticação

**Fluxo padrão (web):**

```
Usuário → GIS popup → id_token JWT → frontend salva em sessionStorage
                                   ↓
                                   id_token em cada request
                                   ↓
Apps Script → verifyIdToken_ → tokeninfo (assinatura+exp+aud)
            → getUserByEmail_ → linha em `pessoas` com email matching
            → request processada com user.{email, nome, cor}
```

**Allowlist:** coluna `email` na aba `pessoas`. Sem email cadastrado = sem acesso. Configurada manualmente pelo Bam/Evellyn editando a planilha.

**Fail-closed:**
- Sem `OAUTH_CLIENT_ID` (Script Property) → recusa tudo
- Sem `email_verified` na resposta tokeninfo → recusa
- Token expirado ou sem `exp` → recusa

**Scripts `.mjs` locais (QA, cleanup):** usam shared secret `SERVICE_TOKEN` (Script Property + env var `API_TOKEN`). Esse caminho NUNCA aparece no bundle do frontend. Mandam `service_token` no body.

**Cache:** verifyIdToken_ cacheia validação em `CacheService` por 5min (id_token Google dura 1h).

---

## Onde vivem as coisas

```
.github/workflows/deploy.yml      # build + Pages
backend/
  00_Config.gs                    # PUBLIC_ACTIONS, RECORRENTE_HORIZON_MESES
  01_Schema.gs                    # SCHEMA das 7 tabelas + validators (V)
  02_Sheets.gs                    # leitura/escrita + migration idempotente de header
  03_Main.gs                      # doGet/doPost, roteador, withLock_, reply_
  04_Crud.gs                      # list/get/create/update/delete + batch_create
  05_Series.gs                    # create_serie (parcelado/recorrente) + shiftDateMonth_
  06_Share.gs                     # share YTD + close/reopen
  07_InitSchema.gs                # initSchema() one-shot
  08_Auth.gs                      # verifyIdToken_, getUserByEmail_, verifyAndIdentify_
  qa-e2e.mjs                      # bateria de 29 testes
  smoke-*.mjs                     # scripts auxiliares
  cleanup.mjs                     # limpa abas pra rodar bateria limpa
  update-categorias.mjs           # diff de categorias na planilha viva
frontend/
  index.html                      # script GIS + theme bootstrap inline
  src/
    App.tsx                       # gate de auth, header, roteamento por hash
    main.tsx                      # entry
    index.css                     # paleta segmentada [data-theme=light|dark]
    api/
      client.ts                   # fetch + retry + auth (id_token)
      types.ts                    # tipos do schema (manualmente sync com backend)
    components/
      CompetenciaSelector.tsx
      EntityList.tsx              # ◆ lista genérica loading/erro/vazio + delete
      Filters.tsx                 # filtros globais com badge de contagem
      InvestRowList.tsx           # variante card+título de EntityList
      LoginGate.tsx               # tela de entrada com botão GIS
      Tabs.tsx
      charts/
        ChartCategoryPie.tsx
        ChartMonthlyFlow.tsx
        ChartStackedByPessoa.tsx
        EvolucaoPatrimonio.tsx
        ResumoTotaisCard.tsx
    hooks/
      useAuth.ts                  # GIS init + sessão + currentIdToken()
      useCategorias.ts
      useCrudForm.ts              # ◆ form genérico (open/save/edit/close)
      useHashRoute.ts
      useInvestimentoInsights.ts  # cálculos puros dos 12 meses
      useTheme.ts
    lib/
      colors.ts                   # paleta por pessoa e categoria
      competencia.ts              # YYYY-MM helpers
      format.ts                   # BRL, datas pt-BR, parseBRL
      greeting.ts                 # saudação por horário
      rateio.ts                   # peso de lançamento conjunto pra rateio
      parsers/
        itau-fatura.ts            # parser Itaú PDF
        pdf-extract.ts            # pdf.js wrapper
    pages/
      Acerto.tsx
      Dashboard.tsx
      Despesas.tsx                # usa useCrudForm + EntityList
      Importar.tsx                # usa importarReducer
      importarReducer.ts          # 9 actions: PARSE_START/OK/FAIL, UPDATE_LINE...
      Investimentos.tsx           # 2x useCrudForm + useInvestimentoInsights + InvestRowList
      Receitas.tsx                # usa useCrudForm + EntityList
docs/
  SETUP.md                        # setup zero-to-prod
  QA-REPORT.md                    # snapshot histórico 2026-06-14 (29/29 passes)
PRs-app-financas.md               # histórico dos 7 PRs originais
README.md                         # entry point
AGENTS.md                         # este arquivo
```

◆ = padrão reutilizável (veja "Padrões" abaixo).

---

## Comandos

**Frontend** (rodar de dentro de `/frontend`):

| Comando | O que faz |
|---|---|
| `npm install` | Instala deps |
| `npm run dev` | Dev server em http://localhost:5173 |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve build localmente |
| `npm run lint` | `tsc --noEmit` (typecheck) |

**Backend (Apps Script):** sem build. Editar `.gs` no editor do Apps Script (Extensões → Apps Script). Pra publicar mudança: **Implantar → Gerenciar implantações → editar → Nova versão**. URL não muda.

**QA local** (rodar de dentro de `/backend`, `VITE_API_URL` e `API_TOKEN` no env):

| Comando | O que faz |
|---|---|
| `node qa-e2e.mjs` | Bateria completa (29 testes; chama `cleanup` antes) |
| `node smoke-share.mjs` | Só share/acerto |
| `node smoke-serie.mjs` | Só séries (parcelado/recorrente) |
| `node smoke-test.mjs` | CRUD básico |
| `node cleanup.mjs` | Limpa lancamentos/receitas/investimentos |

---

## Padrões reutilizáveis (use antes de inventar)

### `useCrudForm<TForm>` ([hooks/useCrudForm.ts](frontend/src/hooks/useCrudForm.ts))

Cuida da mecânica de form CRUD: `formOpen`, `saving`, `formError`, `toggleNew`, `openEdit`, `closeForm`, `submit`. A página só fornece `emptyForm/validate/save/onSaved` e desenha os campos.

```tsx
const crud = useCrudForm<MeuForm>({
  emptyForm: () => ({ ...DEFAULTS, data: todayISO(), pagador: me?.nome }),
  validate: (form) => form.data ? null : 'data obrigatória',
  save: async (form) => form.id ? api.update(form.id, form) : api.create(form),
  onSaved: fetchList,
})
```

Usar em **toda página com formulário criar/editar** (Despesas, Receitas, Investimentos x2 fazem isso hoje).

### `EntityList<T>` ([components/EntityList.tsx](frontend/src/components/EntityList.tsx))

Lista padrão com loading/erro/vazio + linha clicável (edita) + delete.

```tsx
<EntityList
  loading={loading} error={error}
  emptyMsg="Nenhum lançamento."
  items={filtered} itemKey={(r) => r.id}
  onEdit={editFromRow} onDelete={remove}
  renderRow={(r) => <>...</>}
/>
```

Variante com card+título: `InvestRowList` (usar quando precisar do wrapper de card + count, ex.: Investimentos).

### `useReducer` ([pages/importarReducer.ts](frontend/src/pages/importarReducer.ts))

Quando a tela tem 5+ pedaços de estado correlato (Importar tem `phase + error + parsed + rawLines + lines + saveResult`). Action por evento, transições atômicas. Não usar pra páginas simples.

### Auth wiring

O `useAuth` é chamado uma vez no `App.tsx`. As páginas recebem `me: WhoamiData | null` por prop quando precisam personalizar (Despesas, Receitas, Investimentos, Importar pré-preenchem com `me.nome`). **Não importar `useAuth` em página** — sempre via prop.

### Cliente de API

Sempre via `frontend/src/api/client.ts`. Ele:
- Adiciona `id_token` automaticamente (lê de `currentIdToken()`)
- Tem retry 1× em 5xx/timeout/JSON inválido (via `TransientApiError`)
- Devolve já desempacotado (`{ok:true, data}` é unwrappado)

Use `makeTableApi('nome_tabela').list/get/create/update/remove` em vez de chamadas avulsas.

---

## Convenções de código

- **TypeScript estrito** no front. Não usar `any` (preferir `unknown` + narrow).
- **Moeda:** `formatBRL()` de `lib/format.ts`. Parsing: `parseBRL()` (aceita `100,50` e `100.50`).
- **Datas:** sempre `YYYY-MM-DD` no banco. UI usa `formatDateBR()`. Competência é `YYYY-MM`.
- **Gráficos:** Recharts. Não usar libs comerciais.
- **Estados de UI:** toda tela tem loading / erro / vazio (mesmo que minimal).
- **Comentários:** só pra WHY não-óbvio. Não comentar WHAT — código bem nomeado já comunica.
- **Sem segredos no front.** Variáveis `VITE_*` ficam no bundle público. Use só pra coisas que podem ser públicas (URL, Client ID OAuth).

---

## Armadilhas conhecidas (releia antes de mexer)

### Apps Script

- **Sem CORS configurável.** Sempre `ContentService` retornando JSON e fetch com `Content-Type: text/plain` pra evitar preflight.
- **5xx transientes.** Apps Script às vezes solta 500 em rajadas. `api/client.ts` já tem 1 retry; não invente outro.
- **`doPost` lê body em `e.postData.contents`** (JSON como string). Use `readParams_` em `03_Main.gs`.
- **IDs:** sempre `Utilities.getUuid()`.
- **Migration de schema é automática** em `getOrCreateSheet_` (adiciona colunas faltantes no header). Pra adicionar coluna: edita SCHEMA, próxima request migra. Idempotente.

### Domínio

- **Conjuntas vs share:** Despesas mostra valor cheio na lista; Dashboard e Acerto usam rateio quando pessoa específica + toggle. Toggle só aparece quando filtra pessoa.
- **Year inference no parser Itaú:** heurística `mes_compra > mes_venc → ano − 1`. Quebra em parcelas longas de 2+ anos antes — caso real raro, mas saiba que existe.
- **Recorrente cria 24 meses fixos.** Sem auto-extend. Usuário precisa estender manualmente perto do fim.
- **Conjunto não rateia em Investimentos.** Patrimônio comum tem categoria própria (`titular = conjunto`).

### Frontend

- **id_token expira em 1h.** Se a sessão estourar, o app pede login de novo. Aceitar.
- **OAuth + outras sessões Google ativas:** GIS às vezes encaminha pro Gmail em vez de logar. Workaround: janela anônima ou perfil dedicado do navegador (documentado em SETUP).
- **GitHub Pages é público.** Bundle final é acessível. Não confiar em "segredo do navegador" pra nada.

---

## Cookbook — tarefas comuns

### Adicionar uma coluna numa tabela existente

1. Editar `01_Schema.gs`: adicionar nome em `columns` e validator em `validators`.
2. Salvar no editor do Apps Script e republicar (Nova versão).
3. Na próxima request, o header da planilha é migrado automaticamente.
4. Atualizar `frontend/src/api/types.ts` com o novo campo (sync manual).
5. Se o campo é editável, adicionar na UI da página correspondente.

### Adicionar uma página nova

1. Criar `frontend/src/pages/MinhaPage.tsx`.
2. Importar em `App.tsx`, adicionar rota e tab em `TABS`.
3. Se tem CRUD: usar `useCrudForm + EntityList`. Se precisar de auth-personalização, receber `me` por prop.

### Adicionar uma tabela nova

1. Definir schema em `01_Schema.gs` (tabela vira parte de `SCHEMA`, entra em `TABLES`).
2. Rodar `initSchema()` no editor Apps Script pra criar a aba.
3. Adicionar tipo em `frontend/src/api/types.ts`.
4. Exportar `makeTableApi('nome')` em `frontend/src/api/client.ts`.

### Mudar a regra de algum cálculo (share, rendimento, rateio)

Procurar onde está implementado:
- Share: `backend/06_Share.gs` (verdade canônica). Frontend usa `getShare()`.
- Rendimento de investimentos: `frontend/src/hooks/useInvestimentoInsights.ts`.
- Rateio de despesa conjunta: `frontend/src/lib/rateio.ts` (peso por pessoa).

Atualizar testes em `backend/qa-e2e.mjs` se afetar a bateria.

### Rotacionar credenciais

- `OAUTH_CLIENT_ID`: criar novo client no Google Cloud Console, rodar `setOAuthClientId(...)` no editor, atualizar `VITE_GOOGLE_CLIENT_ID` no GitHub Secret. Cliente antigo pode ser apagado.
- `SERVICE_TOKEN`: rodar `setServiceToken(...)` no editor com valor novo (>= 16 chars), atualizar `API_TOKEN` local.

---

## Quando parar e perguntar

- A tarefa parece exigir algo pago (Open Finance, lib comercial, etc.).
- Falta uma definição de schema ou regra de negócio (ex.: "como calcular X?").
- Mudança em segurança/auth — confirmar modelo de ameaça antes.
- Mudança que precisa de **ação manual do usuário** (rodar função no editor Apps Script, editar planilha, etc.) — sempre listar essas ações explicitamente no fim.

---

## Workflow Apps Script (lembretes operacionais)

Cada `.gs` é um arquivo separado no editor. Pra atualizar:

1. Copiar conteúdo do arquivo do repo.
2. Colar em **Extensões → Apps Script → arquivo correspondente**.
3. `Ctrl+S` em cada arquivo modificado.
4. **Implantar → Gerenciar implantações → ícone de lápis na implantação ativa → Versão: Nova versão → Implantar**.

A URL não muda — só o código por trás dela. Mudanças no editor sem "Nova versão" só valem no editor (Run), não na URL do Web App.

Funções com `_` no início ficam escondidas do dropdown de Execução do editor. Convenção:
- `_helper_` (interno) → escondido no editor (correto)
- `setOAuthClientId` (entry point pra setup) → visível (sem underscore inicial)

---

## Histórico

- **PRs originais (1–7):** ver [PRs-app-financas.md](PRs-app-financas.md) — todos entregues.
- **QA bateria 2026-06-14 (29/29):** ver [docs/QA-REPORT.md](docs/QA-REPORT.md).
- **Migração OAuth:** commit `407c0bf`. Antes era shared token público (vazava no bundle); agora é id_token Google + allowlist na planilha.
