# QA E2E + Notas de Refactor (snapshot histórico)

> **Snapshot de 2026-06-14.** Documento congelado — todos os refactors listados na seção "Candidatos" foram entregues entre `5de6a79` e `cd669da`. Bateria em [`backend/qa-e2e.mjs`](../backend/qa-e2e.mjs) (29/29 passes).
>
> Pra entender o estado atual e os padrões adotados, ver [AGENTS.md](../AGENTS.md). Esta página fica aqui como evidência da qualidade no ponto da migração OAuth.

## Resumo

| Categoria | Status |
|---|---|
| API E2E (29 testes) | ✅ 29/29 |
| Assets do PWA (HTML, manifest, SW, ícones) | ✅ todos 200 |
| Bugs encontrados | nenhum |

## Cobertura por PR

### PR1 — infra
- ✅ `ping` autenticado retorna `{ok:true, ts}`
- ✅ Sem token → `{ok:false, error:'unauthorized'}`

### PR2 — schema + CRUD
- ✅ Seed `pessoas` (Bam + Evellyn) e `categorias` (>0) existem
- ✅ Tabela inválida → `invalid_table`
- ✅ Receita sem `pessoa` → `missing_required:pessoa`
- ✅ Receita com `pessoa` fora do enum → erro
- ✅ Lançamento individual sem `dono` → `dono_required_when_individual`
- ✅ Lançamento conjunto COM `dono` → `dono_must_be_empty_when_conjunto`
- ✅ Ciclo `create → get → update → delete`; `competencia` derivada de `data`; `update` preserva campos não mexidos
- ✅ `get` após `delete` → `not_found`

### PR3 — parcelado + recorrente
- ✅ Parcelado 3× → 3 linhas com data shift mensal mantendo o dia
- ✅ Clamp do fim do mês: `31/jan → 28/fev → 31/mar → 30/abr`
- ✅ Recorrente → 24 linhas
- ✅ Editar uma parcela não altera as outras da série

### PR4 — share + acerto
- ✅ Share YTD: receitas Bam 6k/mês + Evellyn 3k/mês jan–ago = `Bam=2/3, Evellyn=1/3`
- ✅ `close_share` grava snapshot
- ✅ Share fechado não muda quando nova receita entra
- ✅ `reopen_share` recalcula com novos dados (Bam 78k vs Eve 24k → 0.7647)
- ✅ Saldo de acerto: Bam pagou R$300 conjunta, Eve pagou R$150, com share 2/3 → saldo zero exato

### PR5 — batch_create
- ✅ Batch parcial: 2 itens ok, 1 falha (individual sem dono); cada erro carrega `index`

### PR7 — investimentos
- ✅ Criar saldos e movimentos
- ✅ Rendimento = saldo_final − saldo_inicial − aportes + resgates → R$1.500 com R$10k inicial, R$13k final, R$2k aporte, R$500 resgate (12,5% rentabilidade)

### Parser PDF (cobertura unitária em `frontend/scripts/test-itau-parser.mjs`)
- ✅ 11/11 assertions (já executado anteriormente)

## Assets do PWA

| Asset | Status |
|---|---|
| `index.html` | 200, 796B |
| `manifest.webmanifest` | 200, válido, 3 ícones PNG |
| `sw.js` | 200, 1556B |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | 200 |

## Candidatos a refactor

### Backend (`backend/Code.gs` — 877 linhas)

Está num arquivo só, monolítico. Apps Script não suporta `import` entre arquivos `.gs` da forma como esperaríamos, mas suporta múltiplos arquivos no mesmo projeto (eles compartilham namespace global). Sugestões:

1. **Quebrar em arquivos por domínio**:
   - `Schema.gs` — `SCHEMA`, `V`, `TEXT_COLS`, `assertTable_`
   - `Sheets.gs` — `getOrCreateSheet_`, `readHeader_`, `readAll_`, `normalizeCell_`
   - `Crud.gs` — `list_`, `get_`, `create_`, `update_`, `delete_`, `batchCreate_`
   - `Series.gs` — `createSerie_`, `shiftDateMonth_`
   - `Share.gs` — `shareForCompetencia_`, `closeShare_`, `reopenShare_`, `computeShareYTD_`
   - `Main.gs` — `doGet`, `doPost`, `handle_`, `readParams_`, `reply_`, `withLock_`, `setAuthToken`

2. **Tipos como JSDoc** pra documentar contratos de entrada/saída.

### Frontend — duplicação entre Despesas e Receitas

`Despesas.tsx` (436) e `Receitas.tsx` (253) têm a mesma estrutura:
- Estado `formOpen` + `form` + `saving` + `formError`
- `fetchList`, `toggle…`, `submit`, `remove`
- Mesmo layout de header + form + lista + footer

Sugiro extrair:
- **`hooks/useCrudForm.ts`** — encapsula estado/handlers de form (toggle, submit, edit, delete) com callbacks plugados.
- **`components/EntityList.tsx`** — lista paginada genérica com edição inline + delete.

### `Investimentos.tsx` (526 linhas)

Já está dividido em sub-componentes (`FormSaldoComponent`, `FormMovComponent`). Próximos passos:
- Extrair lógica de "análise dos 12 meses" pra um hook puro (`useInvestimentoInsights`)
- Extrair gráfico de evolução pra `components/EvolucaoPatrimonio.tsx`
- Tabelas de saldos/movimentos viram `<InvestRowList kind="saldo">` reutilizável

### `Dashboard.tsx` (397 linhas)

- Cada chart é uma seção independente — podem virar `components/charts/*.tsx`
- O `weight` que combina pessoa+rateio aparece também em Despesas — extrair pra `lib/rateio.ts`

### `Importar.tsx` (449 linhas)

- A tabela de revisão é o coração; mas o estado é pesado. Reduzir com um reducer (`useReducer`) ou um Zustand minúsculo.
- Hot path: o parser PDF já está limpo (em `lib/parsers/itau-fatura.ts`). Quando o segundo parser entrar (ex.: extrato conta corrente), criar `lib/parsers/index.ts` com `parsers = { itau_fatura, ... }` e detecção automática.

### `api/client.ts` (185 linhas)

- Centralizou bem. Próximo passo: gerar tipos a partir do `SCHEMA` do backend pra não ter drift entre `types.ts` e `Code.gs` (gerador estático ou um JSON publicado pelo backend).

## Observações pra layout/UX

Pontos detectados durante o desenvolvimento que merecem revisão visual quando você for olhar com calma:

1. **Cabeçalho sticky cresceu** — competência + filtros + tabs. Em telas pequenas, pode comer espaço útil. Considerar colapsar filtros pra um ícone só.
2. **Form de Importar denso no mobile** — cada linha tem 3 sub-linhas (data/desc/valor; categoria/tipo/pagador/dono; repetição/parcelas). Funciona, mas é apertado.
3. **Cards do Dashboard empilhados em mobile** — funciona, mas faz scroll longo. Talvez agrupar em accordions ou ter um "ver mais" por seção.
4. **Acerto** — quando saldo é zero ou só uma despesa conjunta, a tabela de resumo mostra muitos campos vazios. Mensagem mais limpa nesse caso.
5. **Investimentos com poucos dados** — quando só há 1 snapshot, o gráfico de evolução fica em branco (a UI já lida com isso ocultando, ok). Mas o card de insights mostra "—" pra rentabilidade — pode ser mais explícito ("precisa de pelo menos 2 snapshots").

## Pontos não-óbvios pro próximo agente / sessão

- **Conjuntas vs share** — várias telas precisam decidir entre "valor cheio" e "rateado". Hoje:
  - **Despesas**: lista mostra valor cheio sempre. Total no header usa rateio quando filter pessoa específica + toggle on.
  - **Dashboard**: tudo usa rateio quando pessoa específica + toggle on.
  - **Acerto**: sempre usa rateio (ele é o cálculo de quem deve a quem).
- **Year inference no parser** — usa o ano do vencimento. Funciona pra fatura típica. Se o usuário importar fatura com transações de 2 anos antes (parcelas longas), pode quebrar — heurística atual assume `mes_compra > mes_venc → ano − 1`.
- **Recorrente cria 24 meses fixos** — não tem auto-extend. Quando o usuário chegar perto do fim, vai precisar de uma forma de estender (TODO mencionado nos commits).
- **Apps Script transient 500s** — o Google às vezes retorna erro de servidor, especialmente em rajadas. Retry de 30s costuma resolver. Cliente do app não tem retry hoje — pode valer adicionar pra robustez.
