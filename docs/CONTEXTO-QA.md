# Contexto pra retomar melhorias de QA — app-financas-bam-evellyn

> Snapshot em 2026-06-14. Cole isso (ou peça `Read docs/CONTEXTO-QA.md`) no início da próxima sessão.

## Onde paramos

Working tree **limpo**, branch `main` sincronizada com `origin/main`. Últimos 7 commits, do mais recente:

| # | Hash | Mensagem |
|---|---|---|
| 1 | `ad2baa9` | feat(ui): toggle manual de tema claro/escuro |
| 2 | `c9ed405` | brand: logo Dueto v2 — cifrão centralizado no D |
| 3 | `6e417aa` | brand: logo DD-cifrão espelhado + tagline |
| 4 | `ecbc0b5` | brand: Dueto — paleta laranja+preto, fonte Tahoma |
| 5 | `e1f0675` | refactor(frontend): lib/rateio + chart components do Dashboard |
| 6 | `00cbdd7` | refactor(backend): quebra Code.gs em 8 módulos por domínio |
| 7 | `937a4e4` | qa: bateria e2e + relatório com 29/29 passes + notas refactor |

QA E2E está verde (29/29 — `backend/qa-e2e.mjs`). Bateria roda contra Apps Script real e cobre PRs 1–7. Relatório completo em [docs/QA-REPORT.md](QA-REPORT.md).

## Trilha de melhorias de QA — o que já foi feito

Riscado = entregue. Texto cheio = pendente.

### Refactors do QA-REPORT
- ~~Backend `Code.gs` monolítico → quebrar em 8 arquivos por domínio~~ (`00cbdd7`)
- ~~Dashboard: charts viram `components/charts/*` + `lib/rateio.ts`~~ (`e1f0675`)
- **Duplicação Despesas/Receitas** → extrair `hooks/useCrudForm.ts` + `components/EntityList.tsx`. `Despesas.tsx` ainda tem 15kB, `Receitas.tsx` 8kB com a mesma estrutura.
- **Investimentos.tsx (21kB)** → extrair `useInvestimentoInsights` (lógica dos 12 meses), `components/EvolucaoPatrimonio.tsx`, `<InvestRowList kind="saldo">`.
- **Importar.tsx (18kB)** → reduzir estado com `useReducer` (ou Zustand minúsculo). Estado de revisão hoje é gigante e disperso.
- **`api/client.ts` (185 linhas)** → gerar tipos a partir do `SCHEMA` do backend pra eliminar drift entre `types.ts` e `01_Schema.gs`.

### Observações de UX (do QA-REPORT, seção "Observações pra layout/UX")
1. **Cabeçalho sticky cresceu** — competência + filtros + tabs. Em mobile pode comer espaço. Considerar colapsar filtros pra ícone.
2. **Form de Importar denso no mobile** — 3 sub-linhas por item. Funciona mas é apertado.
3. **Cards do Dashboard empilhados em mobile** — scroll longo. Talvez accordions / "ver mais".
4. **Acerto com saldo zero** — tabela mostra muitos campos vazios; melhorar mensagem vazia.
5. **Investimentos com 1 snapshot só** — card de insights mostra "—" pra rentabilidade. Tornar explícito ("precisa de 2 snapshots").

### Pontos não-óbvios que valem reler antes de mexer
- **Conjuntas vs share**: Despesas mostra valor cheio na lista; Dashboard e Acerto usam rateio. Toggle de "valor cheio vs minha parte" só aparece quando filtra pessoa específica.
- **Year inference no parser Itaú**: heurística atual `mes_compra > mes_venc → ano − 1`. Quebra em parcelas longas de 2 anos antes.
- **Recorrente cria 24 meses fixos**, sem auto-extend (TODO do commit `a6a40c1`).
- **Apps Script transient 500s**: cliente não tem retry. Adicionar retry exponencial em `api/client.ts` quando der a real.

## Estrutura atual (pós-refactor)

```
backend/
  00_Config.gs   01_Schema.gs   02_Sheets.gs   03_Main.gs
  04_Crud.gs     05_Series.gs   06_Share.gs    07_InitSchema.gs
  qa-e2e.mjs           ← bateria principal (29 testes)
  smoke-*.mjs          ← scripts auxiliares
  cleanup.mjs          ← limpa abas pra rodar bateria limpa

frontend/src/
  App.tsx            ← header com toggle de tema (sol/lua)
  index.css          ← paleta segmentada [data-theme="light"|"dark"]
  api/{client,types}.ts
  components/
    CompetenciaSelector, Filters, Tabs
    charts/ChartCategoryPie, ChartMonthlyFlow, ChartStackedByPessoa, ResumoTotaisCard
  hooks/useCategorias, useHashRoute, useTheme
  lib/colors, competencia, format, rateio
  lib/parsers/{itau-fatura, pdf-extract}
  pages/Acerto, Dashboard, Despesas, Importar, Investimentos, Receitas
```

## Sugestão de ordem pra próxima sessão

Critério: maior alívio de duplicação primeiro, depois polimento de UX. Cada item é commitável sozinho.

- ~~**`useCrudForm` + `EntityList`** — derruba Despesas/Receitas de ~700 linhas pra ~300.~~ (`5de6a79`)
- ~~**Quebrar Investimentos** — `useInvestimentoInsights` + `EvolucaoPatrimonio` + `InvestRowList`.~~ (`efaae7d`)
- ~~**Reducer em Importar** — `importarReducer.ts` com 9 actions.~~ (`791522c`)
- ~~**Filtros mobile** — ícone de funil + badge de contagem; texto longo só desktop.~~ (`2e1e09a`)
- ~~**Retry no `api/client.ts`** — `TransientApiError` + 1 retry com 800ms.~~ (`cd669da`)
- **Tipos gerados do SCHEMA** — pendente; só vale quando outra propriedade for adicionada (drift hipotético hoje).

### Obs de UX do QA-REPORT que ainda não foram atacadas

- **Form de Importar denso no mobile** — 3 sub-linhas por item. Funciona mas é apertado. Possível: collapse em "tap para expandir".
- **Cards do Dashboard empilhados em mobile** — scroll longo. Talvez accordions / "ver mais".
- **Acerto com saldo zero** — tabela mostra muitos campos vazios; melhorar mensagem vazia.
- **Investimentos com 1 snapshot só** — card de insights mostra "—" pra rentabilidade. Tornar explícito ("precisa de 2 snapshots").

## Comandos úteis

Frontend (em `/frontend`):
```powershell
npm run dev      # http://localhost:5173
npm run build
npm run lint     # tsc --noEmit
```

QA backend (em `/backend`):
```powershell
node qa-e2e.mjs              # bateria completa (limpa antes via cleanup.mjs)
node smoke-share.mjs         # só share/acerto
node smoke-serie.mjs         # só séries (parcelado/recorrente)
```

Variáveis: `VITE_API_URL` + `VITE_API_TOKEN` no `.env` do front; mesmas vars como `API_URL` + `API_TOKEN` no env do shell pros scripts `.mjs`.

## Regras inegociáveis (de [AGENTS.md](../AGENTS.md))

Custo zero · Sem integração bancária automática · Parsing client-side · `LockService` em toda escrita · Sem segredos commitados · Não inventar schema.
