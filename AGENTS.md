# AGENTS.md

Instruções permanentes para qualquer agente trabalhando neste repositório. **Leia inteiro antes de começar uma tarefa.** Este é o doc canônico — outros arquivos (`README`, `docs/SETUP.md`, `docs/QA-REPORT.md`) são complementares.

---

## O projeto

PWA de controle financeiro para **Bam** e **Evellyn** (casal). Custo zero, deployado em GitHub Pages, com Google Sheets como banco e Apps Script como API.

Produção: https://bam-araujo.github.io/app-financas-bam-evellyn/

Stack:
- **Frontend:** React + Vite + TypeScript, instalável como PWA, em `/frontend`
- **Backend:** Google Apps Script (9 módulos `.gs` — `00_Config` até `08_Auth`), em `/backend`
- **Banco:** Google Sheets (10 abas — schema em `01_Schema.gs`)
- **Auth:** OAuth Google (id_token) + allowlist na aba `pessoas`
- **CI/CD:** GitHub Actions → Pages, deploy automático em push pra `main`

Abas atuais: `pessoas`, `categorias`, `receitas`, `lancamentos`, `investimentos_saldos`, `investimentos_movimentos`, `share_mensal`, `orcamento`, `auto_categorias`, `acertos_pagos`.

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
  01_Schema.gs                    # SCHEMA das 10 tabelas + validators (V)
  02_Sheets.gs                    # leitura/escrita + migration idempotente de header
  03_Main.gs                      # doGet/doPost, roteador, withLock_, reply_
  04_Crud.gs                      # list/get/create/update/delete + batch_create
  05_Series.gs                    # create_serie + update/delete_serie_forward + extend_recorrentes. Mapa SERIE_TABLES: lancamentos (anchor=data) + receitas (anchor=competencia)
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
      BudgetProgress.tsx          # barra verde/amarela/vermelha pra orçamento
      CompetenciaSelector.tsx
      ConfirmDialog.tsx           # ◆ modal genérico com N opções (Promise-based)
      EntityList.tsx              # ◆ lista genérica loading/erro/vazio + delete + renderAfterRow
      Filters.tsx                 # filtros globais com badge de contagem
      InvestRowList.tsx           # variante card+título de EntityList
      LoginGate.tsx               # tela de entrada com botão GIS
      SearchPalette.tsx           # Cmd/Ctrl+K busca global
      Tabs.tsx
      charts/
        ChartCategoryPie.tsx
        ChartMonthlyFlow.tsx
        ChartStackedByPessoa.tsx
        EvolucaoPatrimonio.tsx
        OrcamentoCard.tsx         # top categorias com barra de progresso no Home
        PrevisaoCaixa.tsx         # A6 — line chart + tabela projeção 6 meses (saldoInicial em localStorage)
        ResumoTotaisCard.tsx
    hooks/
      useAuth.ts                  # GIS init + sessão + currentIdToken()
      useAutoCategorias.ts        # suggest/record substring → categoria
      useCashflowProjection.ts    # cálculo puro da projeção 6m (entradas/saídas/saldo)
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
      Acerto.tsx                  # acerto + marcar pago (acertos_pagos)
      Dashboard.tsx               # Home: progressive load (lists → shares background)
      Despesas.tsx                # useCrudForm + EntityList + form inline + dialog scope
      Importar.tsx                # importarReducer + dedupe + auto-cat
      importarReducer.ts          # 10 actions incl. SET_DUPE_FLAGS
      Investimentos.tsx           # 2x useCrudForm + useInvestimentoInsights + InvestRowList
      Orcamento.tsx               # CRUD de limite por categoria/mês + copiar mês anterior
      Receitas.tsx                # useCrudForm + EntityList + form inline + dialog scope (mesmo padrão Despesas: repetição única/parcelada/recorrente)
docs/
  SETUP.md                        # setup zero-to-prod
  QA-REPORT.md                    # snapshot histórico 2026-06-14 (29/29 passes)
  BACKLOG.md                      # roadmap priorizado de produto (S/A/B/C)
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
  renderAfterRow={(r) => /* opcional: form inline, drawer, etc. */}
  renderRow={(r) => <>...</>}
/>
```

Padrão de `editFromRow` recomendado: **toggle** — clicar de novo na mesma row com form aberto fecha:

```tsx
function editFromRow(r) {
  if (formOpen && form.id === r.id) { closeForm(); return }
  openEdit({...})
}
```

E o form vira função local `renderForm()` chamada de 2 lugares: top da página (criar novo) e `renderAfterRow` (inline pra edit). Padrão em uso em Despesas e Receitas.

Variante com card+título: `InvestRowList` (usar quando precisar do wrapper de card + count, ex.: Investimentos).

### `ConfirmDialog` ([components/ConfirmDialog.tsx](frontend/src/components/ConfirmDialog.tsx))

Modal genérico com N opções, perfeito pra escolhas tripartites tipo "esta linha / esta + futuras / cancelar". Mais flexível que `window.confirm()` que é binário.

Helper Promise-based recomendado (em uso em Despesas):

```tsx
function openDialog<T>(config: { title, message?, choices: {label, value: T, primary?, danger?}[] }): Promise<T | null> {
  return new Promise((resolve) => {
    setDialogState({
      title, message,
      options: config.choices.map((c) => ({ ...c, onClick: () => { setDialogState(null); resolve(c.value) } })),
      onClose: () => { setDialogState(null); resolve(null) },  // Esc / overlay → null = cancel
    })
  })
}

// uso:
const scope = await openDialog<'this' | 'forward'>({ ... })
if (scope === null) throw new Error('cancelado')
```

### `useReducer` ([pages/importarReducer.ts](frontend/src/pages/importarReducer.ts))

Quando a tela tem 5+ pedaços de estado correlato (Importar tem `phase + error + parsed + rawLines + lines + saveResult`). Action por evento, transições atômicas. Não usar pra páginas simples.

### Auth wiring

O `useAuth` é chamado uma vez no `App.tsx`. As páginas recebem `me: WhoamiData | null` por prop quando precisam personalizar (Despesas, Receitas, Investimentos, Importar pré-preenchem com `me.nome`). **Não importar `useAuth` em página** — sempre via prop.

### Cliente de API

Sempre via `frontend/src/api/client.ts`. Ele:
- Adiciona `id_token` automaticamente (lê de `currentIdToken()`)
- Tem retry 1× em 5xx/timeout/JSON inválido (via `TransientApiError`)
- Devolve já desempacotado (`{ok:true, data}` é unwrappado)
- Usa `cache: 'no-store'` em todo fetch (ver armadilha "HTTP cache em GET/POST")

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
- **Recorrente é auto-estendida.** Criação inicial gera 24 linhas; backend `extend_recorrentes` (chamado uma vez por sessão no boot) clona a última linha de cada série pra cobrir sempre os próximos 12 meses além da competência atual. Edição/exclusão da última linha vira o "template" pra futuras extensões.
- **Edit/Delete em série pergunta scope.** Linhas com `serie_id` abrem `<ConfirmDialog>` com escolha "esta linha" ou "esta + futuras". Backend implementa via `update_serie_forward` e `delete_serie_forward`. Os helpers `createSerie*/deleteSerieForward/updateSerieForward` no client recebem `table` como 1º arg (`'lancamentos' | 'receitas'`).
- **Série suporta lancamentos E receitas.** Definição em `SERIE_TABLES` no [05_Series.gs](backend/05_Series.gs). Lancamentos ancoram em `data` (YYYY-MM-DD, shift mantém o dia com clamp pra mês curto). Receitas ancoram em `competencia` (YYYY-MM, sem dia). Campos propagados em forward por tabela: lancamentos = `descricao, categoria, valor, pagador, tipo, dono`; receitas = `pessoa, tipo, origem, valor, conta_para_share`. Âncora (data/competencia) NUNCA propaga — fica por linha.
- **Conversão de repetição é bidirecional.** Standalone→série, série→outro tipo, série→única — todas funcionam. Conversão de série pra outro tipo (incl. única) usa `deleteSerieForward(table, id, 'forward')` + cria novo conforme o tipo. Passados da série ficam preservados.
- **Conjunto não rateia em Investimentos.** Patrimônio comum tem categoria própria (`titular = conjunto`).
- **Acerto pago é registrado, não some.** Tabela `acertos_pagos` guarda histórico. Saldo bruto = pago − devido; saldo final = saldo bruto − liquidados. Pra "zerar" um acerto, registrar pagamento (não apagar despesas).
- **Auto-categorização** ([useAutoCategorias](frontend/src/hooks/useAutoCategorias.ts)) aprende `substring → categoria` ao salvar despesa. Substring é tokenizada (≥4 chars). Em conflito (mesma substring com categoria diferente), backend NÃO sobrescreve — tenta próximo token. `record()` não refaz refetch automático; caller que chama em batch deve invocar `refetch()` ao final.
- **Dedupe no import** usa só `data + valor` (não inclui descrição). Aceita falso positivo (raro) pra evitar falso negativo se user renomeou.
- **Orçamento** ([orcamento table](backend/01_Schema.gs)) é por `(competencia, categoria)`. `BudgetProgress` rende a barra; `OrcamentoCard` no Dashboard mostra top categorias por % usado.
- **Previsão de caixa (A6)** ([PrevisaoCaixa](frontend/src/components/charts/PrevisaoCaixa.tsx) + [useCashflowProjection](frontend/src/hooks/useCashflowProjection.ts)) confia 100% nos dados cadastrados — não tem média/heurística. Saldo inicial vive em `localStorage` por pessoa (`dueto:saldoInicial:{casal|Bam|Evellyn}`). Share constante = do mês atual aplicado pros futuros. Investimentos somados nominalmente por titular (conjunto só aparece na view casal, nunca dividido 50/50).

### Frontend

- **id_token expira em 1h.** Se a sessão estourar, o app pede login de novo. Aceitar.
- **OAuth + outras sessões Google ativas:** GIS às vezes encaminha pro Gmail em vez de logar. Workaround: janela anônima ou perfil dedicado do navegador (documentado em SETUP).
- **GitHub Pages é público.** Bundle final é acessível. Não confiar em "segredo do navegador" pra nada.
- **HTTP cache em GET/POST.** [api/client.ts](frontend/src/api/client.ts) usa `cache: 'no-store'` em todo fetch. Sem isso, o Chrome reusa respostas GET do Apps Script por heurística (não há `Cache-Control: no-store` no response). Sintoma: editar em uma tela e ver dado stale em outra. NÃO remover.
- **PWA atualiza em 1 ciclo.** Workbox configurado com `skipWaiting + clientsClaim + cleanupOutdatedCaches` em [vite.config.ts](frontend/vite.config.ts), e [main.tsx](frontend/src/main.tsx) escuta `controllerchange` pra disparar 1 reload silencioso quando o SW novo assume controle. Antes era preciso fechar/abrir 2-3 vezes o PWA pra ver mudanças. O guard `hadControllerAtBoot` evita reload na 1ª instalação.

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
2. Rodar `initSchema()` no editor Apps Script pra criar a aba — OU deixar que `getOrCreateSheet_` crie sob demanda na primeira request.
3. Adicionar tipo em `frontend/src/api/types.ts`.
4. Exportar `makeTableApi('nome')` em `frontend/src/api/client.ts`.

### Adicionar série (parcelado/recorrente) a uma tabela existente

Padrão estabelecido em `lancamentos` + `receitas`. Pra habilitar série numa nova tabela:

1. **Schema** (`01_Schema.gs`): adicionar colunas `serie_id, serie_tipo, parcela_num, parcela_total` em `columns` + validators correspondentes (ver `lancamentos` ou `receitas` como referência).
2. **Série** (`05_Series.gs`): adicionar entrada em `SERIE_TABLES` com `anchor` (coluna temporal — `data` ou `competencia`) e `propagable` (campos que atravessam em scope='forward').
3. **Frontend types** (`api/types.ts`): adicionar os 4 campos no Row + `SerieTipo`.
4. **Frontend client** (`api/client.ts`): adicionar a tabela em `SerieTable` e `SerieRowMap`.
5. **Página**: copiar padrão de `Despesas.tsx`/`Receitas.tsx` (form com Repetição, dialog scope, conversão bidirecional).

### Adicionar uma categoria nova

Duas formas (a primeira é a mais rápida):

1. **Direto na planilha** (mais simples): aba `categorias` → nova linha com `id` (qualquer string única, idealmente UUID v4), `nome`, `grupo` (`despesa` ou `receita`).
2. **Via seed do `initSchema`**: editar `07_InitSchema.gs`, adicionar entrada em `cats[]`, salvar no editor, rodar `initSchema()` (idempotente — não duplica existentes).

Categorias novas aparecem nos dropdowns após F5 no app — `useCategorias` faz fetch ao montar, sem cache persistente.

### Adicionar um endpoint backend novo

1. Implementar função em algum módulo (`05_Series.gs`, `06_Share.gs`, ou módulo próprio).
2. Adicionar nome do action em `PUBLIC_ACTIONS` (`00_Config.gs`).
3. Adicionar `case` no switch de `handle_()` em `03_Main.gs` — usar `withLock_()` se for escrita.
4. Adicionar helper em `frontend/src/api/client.ts`.
5. Republicar Web App (Nova versão) — endpoints novos só são reachable depois disso.

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

## Backlog / próximos passos

Roadmap de produto priorizado vive em [docs/BACKLOG.md](docs/BACKLOG.md). Tiers S → C, cada item com estimativa, critério de aceite e dicas de implementação apontando arquivos existentes. **Pegue de lá** antes de propor coisa nova — o usuário já tomou decisão sobre o que está e o que não está em scope.

## Histórico

- **PRs originais (1–7):** ver [PRs-app-financas.md](PRs-app-financas.md) — todos entregues.
- **QA bateria 2026-06-14 (29/29):** ver [docs/QA-REPORT.md](docs/QA-REPORT.md).
- **Migração OAuth:** commit `407c0bf`. Antes era shared token público (vazava no bundle); agora é id_token Google + allowlist na planilha.
- **Tier S de produto (2026-06-14):** commits `5b259ee` → `010bbfe`. Busca global, dedupe import, marcar acerto pago, auto-categorização, orçamento por categoria.
- **Séries infinitas + edit/delete forward (1bfc38a):** recorrentes não têm mais limite de 24 meses; backend `extend_recorrentes` mantém cobertura rolling. Edit/Delete em série abre dialog "esta / esta + futuras".
- **Conversão bidirecional de repetição (93d825a):** standalone↔parcelado↔recorrente↔único, todos os sentidos.
- **Séries em Receitas (5e8f958):** `05_Series.gs` generalizado via `SERIE_TABLES`. Receitas ancoram em `competencia` (não há `data`). Helpers de série no client recebem `table` como 1º arg. Receitas.tsx ganhou mesma UX de Despesas (repetição, scope dialog, conversão).
- **PWA atualiza em 1 ciclo (b81b34a):** workbox skipWaiting+clientsClaim + reload silencioso via `controllerchange` em main.tsx. Antes exigia abrir/fechar 2-3 vezes pra ver build novo.
- **HTTP cache bypass (ae0bc47):** api/client.ts passa `cache: 'no-store'` em todo fetch. Sem isso, Chrome reusava GET por heurística e telas mostravam dado stale após updates.
- **A6 — Previsão de caixa 6m (d1a531c):** card novo no Dashboard com LineChart + tabela. Hook puro `useCashflowProjection`. Saldo inicial em localStorage por pessoa. Toggle Conta/Patrimônio total. Investimentos somados nominalmente por titular.
