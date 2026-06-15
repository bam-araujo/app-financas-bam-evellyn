# BACKLOG — Roadmap de produto

Itens de produto priorizados em tiers (S = mais alto). Cada item tem **estimativa**, **por que vale**, **critério de aceite** e **dicas de implementação** apontando arquivos/padrões existentes — pra um agente futuro pegar item por item sem precisar reinventar contexto.

**Convenções:**
- Tier reflete `valor / esforço` (S = alto valor + baixo esforço).
- Esforço em "dias-tarde" (não horas).
- Status: ⬜ pendente · 🟡 em andamento · ✅ entregue.
- Ao concluir, marcar ✅ com hash do commit.

**Tese geral da v2:** o app hoje pede pra você *registrar* o que aconteceu. O próximo salto é fazê-lo *te avisar* e *te projetar* — virar raio-x ativo da situação financeira em vez de só log do passado.

> **Status atual (2026-06-14):** Tier S inteiro entregue (S1–S5, commits `5b259ee` → `010bbfe`) + A6 do Tier A entregue (`d1a531c`). Próxima onda = resto do Tier A (A7, A8, A9, A11).
>
> **Polish pós-Tier S (ainda em 2026-06-14):** série recorrente virou auto-estendida (`1bfc38a`), edit/delete em série abre dialog scope (`1bfc38a`), conversão de repetição bidirecional standalone↔série↔série (`93d825a`), form de edit aparece inline (`42c19fc`), clique-novamente fecha edit (`93d825a`), dedupe import só por data+valor + default cartão=individual + save em paralelo (`56a695e`), busca global respeita competência do item (`0e89464`), Dashboard carrega em ~5s (`96bccf9`).
>
> **Receitas ganharam série (`5e8f958`):** mesma UX de Despesas (única/parcelada/recorrente, scope dialog, conversão bidirecional). Backend `05_Series.gs` generalizado via mapa `SERIE_TABLES`. Receitas ancoram em `competencia` (não há `data`).
>
> **Infra pós-Tier S:** PWA atualiza em 1 ciclo (`b81b34a` — skipWaiting+clientsClaim+reload silencioso), HTTP cache bypass em api/client.ts (`ae0bc47` — `cache: 'no-store'` resolve dado stale entre telas).
>
> Tier S adicionou 3 tabelas (`orcamento`, `auto_categorias`, `acertos_pagos`) e 3 endpoints de série (`extend_recorrentes`, `delete_serie_forward`, `update_serie_forward`). Já refletidos no Apps Script publicado.

---

## Tier S — Implementar primeiro (alto valor, baixo esforço)

### S1. ✅ Orçamento por categoria/mês — `010bbfe`

**Esforço:** 2–3d

**Por que vale:** vira a tese de "registrar" pra "controlar". Sem orçamento, vocês veem onde gastaram, mas não sabem se foi muito ou pouco em relação ao planejado.

**Critério de aceite:**
- Página `/orcamento` com tabela editável: para a competência ativa, cada categoria de despesa tem um limite (`R$ X,XX`).
- Página Despesas + Dashboard mostram **barra de progresso** por categoria (gasto / limite).
- Quando ultrapassa, barra fica vermelha. Quando passa de 80%, amarela.
- Suporte a copiar orçamento do mês anterior em 1 clique.

**Dicas de implementação:**
- Nova tabela em [01_Schema.gs](../backend/01_Schema.gs): `orcamento(id, competencia, categoria, limite)`. Migration automática do header pega.
- `frontend/src/api/types.ts` + `client.ts` ganham `orcamento`.
- Nova página `/pages/Orcamento.tsx` usando `useCrudForm + EntityList` (padrão existente).
- Componente novo `<BudgetProgress categoria={...} gasto={...} limite={...} />` reaproveitável.
- Cálculo de "gasto" reaproveita filtro de Despesas por categoria + competência.

---

### S2. ✅ Busca global — `5b259ee`

**Esforço:** 0.5d

**Por que vale:** resolve "onde eu lancei aquilo?". Hoje só dá pra achar por scroll + filtros.

**Critério de aceite:**
- Atalho `Cmd+K` / `Ctrl+K` (desktop) ou ícone de lupa no header (mobile) abre paleta.
- Busca em `descricao`, `categoria`, `origem`, `instituicao`, `ativo` de TODAS as tabelas (lancamentos, receitas, investimentos).
- Resultados navegáveis via teclado, Enter abre a row em edição.

**Dicas de implementação:**
- Cliente já tem `list()` por tabela — palette baixa tudo no primeiro open e indexa em memória (volume baixo, 2 usuários, ok).
- Componente novo `<SearchPalette />` montado no `App.tsx`.
- Match: lowercase + substring; opcional: ordenar por proximidade de match.

---

### S3. ✅ Dedupe ao importar — `048c08b`

**Esforço:** 0.5d

**Por que vale:** evita criar transação duplicada quando reprocessa fatura ou importa intervalo sobreposto.

**Critério de aceite:**
- Na tela de revisão do Import, cada linha que tenha `data+valor+|descricao` igual a um lançamento existente fica marcada com badge "duplicado".
- Por padrão, linhas duplicadas vêm com checkbox desmarcado (não importa).
- Toggle "mostrar só duplicadas" pra revisão rápida.

**Dicas de implementação:**
- No [pages/Importar.tsx](../frontend/src/pages/Importar.tsx), após parsear, fazer `lancamentos.list({competencia: ...})` e cruzar.
- Hash de match: `${data}|${valor.toFixed(2)}|${descricao.slice(0,30).toLowerCase()}`.
- Reducer ganha action `SET_DEDUP_FLAGS`.

---

### S4. ✅ Marcar acerto como pago — `d0df6e1`

**Esforço:** 1d

**Por que vale:** hoje o app calcula "Evellyn deve R$X pra Bam" mas não tem como registrar quando isso é resolvido. Pra "zerar" o saldo, vocês têm que apagar lançamentos — quebra o histórico.

**Critério de aceite:**
- Nova tabela `acertos_pagos(id, data, competencia, de, para, valor, descricao_opcional)`.
- Tela `/acerto` ganha botão **"Marcar como pago"** quando há saldo > 0.
- Saldo do Acerto = saldo calculado (despesas) − soma de acertos_pagos do período.
- Histórico de pagamentos visível abaixo do saldo atual.

**Dicas de implementação:**
- Schema novo em [01_Schema.gs](../backend/01_Schema.gs).
- Cálculo do saldo passa por [pages/Acerto.tsx](../frontend/src/pages/Acerto.tsx) — subtrair os pagos.
- Pode reaproveitar `useCrudForm + EntityList` pra o histórico.

---

### S5. ✅ Auto-categorização por descrição — `45dbaa2`

**Esforço:** 1–2d

**Por que vale:** toda fatura importada hoje exige categorizar cada linha. Repetitivo. App pode aprender com histórico.

**Critério de aceite:**
- Ao categorizar uma despesa pela 1ª vez, salvar a relação "substring → categoria" numa tabela `auto_categorias(substring, categoria, hits)`.
- Próxima vez que aparecer descrição contendo aquela substring, categoria vem pré-selecionada (mas editável).
- Funciona tanto no Import quanto no form de Despesas.
- Página simples pra ver/editar/excluir mapeamentos aprendidos.

**Dicas de implementação:**
- Nova tabela em [01_Schema.gs](../backend/01_Schema.gs).
- Heurística de match: substring de 4+ chars que aparece em ≥2 lançamentos da mesma categoria.
- No [pages/Importar.tsx](../frontend/src/pages/Importar.tsx), depois do parse, fazer lookup e pre-set `categoria` antes do user ver a tela.
- No `useCrudForm` de Despesas, ao mudar `descricao`, sugerir categoria (não impor).

---

## Tier A — Alto valor, esforço médio (segunda onda)

### A6. ✅ Previsão de caixa 6 meses — `d1a531c`

**Esforço:** 2–3d (entregue em ~4h)

**Por que vale:** com recorrências cadastradas, parcelas em aberto e receitas projetadas, é possível dizer "em outubro o saldo conjunto vai estar em R$X". Hoje vive na cabeça do casal.

**Entregue:**
- Card "Previsão de caixa — 6 meses" no Dashboard com LineChart Recharts + tabela mês a mês (entradas, saídas, saldo). Saldo < 0 em vermelho.
- Toggle "Conta" / "Patrimônio total" — Patrimônio soma saldoInvestimentos constante.
- Input de "saldo em conta hoje" persistido em `localStorage` por pessoa (`dueto:saldoInicial:{casal|Bam|Evellyn}`).
- Respeita filtro global de pessoa: casal soma tudo; Bam/Evellyn aplicam rateio (reusa `lancamentoWeight`).
- Investimentos nominais por titular (conjunto só aparece na view casal — não há split 50/50).
- Confia 100% nos dados cadastrados (recorrentes auto-estendidas + parcelas materializadas). Sem heurística de média YTD.
- Premissas documentadas no rodapé do card: share do mês atual aplicado constante pros futuros.

**Arquivos:**
- `frontend/src/hooks/useCashflowProjection.ts`
- `frontend/src/components/charts/PrevisaoCaixa.tsx`
- `Dashboard.tsx` busca `investimentosSaldos` e calcula `saldoInvestimentosFiltrado` nominal.

**Refinamento descartado:** A7 (contas correntes) foi rejeitado em 2026-06-15 — usuário não quer rastrear saldo de conta corrente. Saldo inicial manual no card continua sendo a única opção (e é opcional — pode usar com R$ 0 pra ver só a trajetória de fluxo acumulado).

---

### A7. ❌ Contas correntes / saldo em conta — FORA DE ESCOPO (2026-06-15)

**Decisão do usuário:** o app rastreia *fluxo* (receitas/despesas) e *patrimônio aplicado* (investimentos). Saldo de conta corrente é buffer operacional que não faz parte do que importa medir — não é "guardado", é só dinheiro de passagem.

**Implicação pra A6:** o input manual de "saldo em conta hoje" continua, mas é opcional — usuário pode deixar em R$ 0 e usar a projeção como visualização de **fluxo acumulado** (trajetória) em vez de saldo absoluto.

**NÃO propor essa ideia novamente.** Se aparecer necessidade futura ("preciso saber quanto tenho em conta hoje"), o usuário avisa explicitamente.

---

### A8. ❌ Passivos (dívidas) — FORA DE ESCOPO (2026-06-15)

**Decisão do usuário:** financiamentos e outras dívidas já são cadastrados como **despesas parceladas em Despesas** (com `parcela_total` e categoria `Financiamentos`). Cada parcela "se paga" naturalmente quando o mês entra. A6 (previsão de caixa) já mostra esses comprometimentos somados nas saídas mensais futuras. Tracker separado seria trabalho duplicado — manteria 2 sistemas pra mesma informação.

**Considerada e descartada — variante v2** (card "Patrimônio líquido" no Dashboard agrupando lancamentos com `categoria=Financiamentos` e `data >= hoje` por `serie_id`, com barra de progresso e investimentos − financiamentos = líquido). Não trouxe ganho prático que justificasse o esforço — a info já está visível no gráfico de projeção do A6.

**NÃO propor essa ideia novamente.** Se aparecer necessidade futura ("preciso ver patrimônio líquido"), o usuário avisa explicitamente.

---

### A9. ⬜ Comparação MoM (mês contra mês)

**Esforço:** 1–2d

**Por que vale:** "Mercado: jun R$1.2k → jul R$1.5k (+25%)" é insight passivo que não exige interpretação.

**Critério de aceite:**
- Card no Dashboard mostrando top 5 categorias e variação % vs mês anterior.
- Sinalizar cor: vermelho se gasto subiu mais de 20%, verde se caiu mais de 20%.
- Hover/tap mostra valor absoluto dos dois meses.

**Dicas de implementação:**
- Hook puro `useMoMComparison(lancamentos, competencia)`.
- Componente em `components/charts/CompMoM.tsx`.
- Reusa filtragem de lançamentos por categoria já existente.

---

### A11. ⬜ Lembretes via push (PWA)

**Esforço:** 1–2d

**Por que vale:** vencimento de fatura, recorrência prestes a expirar — hoje não tem mecanismo de notificar.

**Critério de aceite:**
- Usuário clica em "Ativar notificações" no header → permite Web Push.
- Triggers cadastrados:
  - 3 dias antes do vencimento de cada fatura (se cadastrada).
  - Quando recorrência tem só 2 meses restantes (resolver junto com TODO de auto-extend).
- Notificação tocável que abre o app na página relevante.

**Dicas de implementação:**
- `serviceWorker` já existe (PWA). Adicionar listener `push`.
- Service Worker é registrado pelo `vite-plugin-pwa` — `registerSW.js` no dist.
- Backend (Apps Script) faz POST via Web Push (precisa de VAPID keys; geração local, sem custo).
- ⚠️ Web Push em iOS exige 16.4+ e o app **estar instalado** ("Adicionar à tela inicial"). Documentar.

---

## Tier B — Médio valor (quando o app tiver mais maturidade)

### B-dedup. ⬜ Refinar dedup do import — incluir descrição

**Esforço:** 0.5d

**Por que vale:** dedup atual usa só `data+valor`. Marca como duplicada qualquer compra do mesmo dia com o mesmo valor — falso positivo comum (ex: dois gastos de R$ 50 no mesmo dia em lojas diferentes). Usuário pediu pra apertar a regra incluindo a descrição.

**Critério de aceite:**
- Linha só vem marcada como `dupe` quando bate `data + valor + descrição` (todos iguais ao lançamento existente).
- Comparação de descrição: normalizada (lowercase + trim + colapsa espaços). Sem fuzzy match.
- Comportamento UI da `dupe`: continua igual (desmarca selected, badge no review).

**Trade-off conhecido (documentar no código):** a regra original aceitava falso positivo pra evitar falso negativo quando o usuário renomeia a descrição (ex: `PG*POSTOOSCAR` → `Posto`). Com a regra nova, se você renomeou no banco e a próxima fatura traz o nome bruto do parser, NÃO vai mais detectar como duplicada — vai criar de novo. Como mitigação, **se editar descrição, edite ANTES de importar a próxima fatura** ou aceite revisar manualmente as duplicatas.

**Dicas de implementação:**
- Ajustar `dupeKey()` em [Importar.tsx](../frontend/src/pages/Importar.tsx) — atualmente `${data}|${valor.toFixed(2)}`. Vira `${data}|${valor.toFixed(2)}|${descricao.toLowerCase().trim().replace(/\s+/g, ' ')}`.
- Atualizar comentário do dedup no mesmo arquivo + armadilha do AGENTS.md.
- Como o dedup é puro-cliente sobre data já presente em `lancamentos.list({competencia})`, nenhuma mudança de backend.

**Esforço:** 1–2d

**Por que vale:** hoje "Compras" é flat. Você não consegue olhar quanto foi pra "Roupas" especificamente, nem cortar gasto de "viagem-japão" que atravessa categorias.

**Critério de aceite:**
- Tags são strings livres separadas por vírgula no form (`viagem-japao,roupas`).
- Filtro novo por tag no Dashboard e nas listas.
- Sugestão de tags baseada em uso prévio (autocomplete).

**Dicas de implementação:**
- Coluna nova `tags` (`stringOptional`) em `lancamentos` no [01_Schema.gs](../backend/01_Schema.gs).
- UI: input com chips, separa por vírgula. Componente `<TagInput />` reaproveitável.
- Decisão: tags **substituem** sub-categorias (mais flexíveis) — não tem sub-cat hierárquica.

---

### B15. ⬜ Split custom (70/30 manual)

**Esforço:** 1d

**Por que vale:** uma despesa esporádica não segue o share padrão. Ex.: presente que Bam comprou pra Evellyn, mas dividem 70/30.

**Critério de aceite:**
- No form de Despesa, quando tipo = "conjunto", botão "Customizar rateio" que abre 2 inputs (% Bam / % Evellyn, somam 100%).
- Se não usar, segue share da competência (comportamento atual).
- Aparece destacado na lista (badge "rateio custom 70/30").

**Dicas de implementação:**
- Coluna nova `share_override` (`stringOptional`, formato `"0.70|0.30"` ou JSON) em `lancamentos`.
- Lógica de rateio em [lib/rateio.ts](../frontend/src/lib/rateio.ts) lê o override quando presente.
- Acerto reaproveita automaticamente.

---

### B16. ⬜ Alertas anômalos

**Esforço:** 2d

**Por que vale:** "gastou 2.5× a média YTD em Restaurante esse mês" é insight ativo que não depende do user olhar.

**Critério de aceite:**
- Banner no topo do Dashboard quando há anomalia detectada.
- Critério: gasto na categoria X no mês corrente ≥ 2× média YTD da mesma categoria, e gasto ≥ R$200 (evitar ruído em categoria pequena).
- Botão "ignorar até próximo mês" no banner.

**Dicas de implementação:**
- Hook puro `useAnomalias(lancamentos, competencia)`.
- Estado de "ignorado" guardado em `localStorage` por competência (não precisa persistir no backend).
- Componente `<AnomalyBanner />` no Dashboard.

---

## Tier C — Nice to have (futuro distante)

### C-gamificacao. ⬜ Streaks / gamificação leve

**Esforço:** 1–2d

Registrar despesa em N dias consecutivos vira "streak" no header. Pequeno bagde de motivação. Cuidado pra não virar pressão.

### C-onboarding. ⬜ Tour interativo

**Esforço:** 1d

Primeira vez que abre, um overlay leve aponta competência, filtros, +Novo, Acerto, Investimentos. Skipável.

### C-export. ⬜ Export CSV pra contabilidade externa

**Esforço:** 0.5d

Botão "exportar período em CSV" no Dashboard. Útil pra quem usa Excel/contador externo. Inclui receitas + lançamentos + investimentos.

### C-tir. ⬜ TIR exata de investimentos

**Esforço:** 2–3d

Rentabilidade hoje é aproximação (rendimento ÷ base). TIR money-weighted exige resolver `NPV = 0` por iteração (Newton-Raphson sobre fluxos com data). Vale só quando o casal acumular vários aportes/resgates ao longo do tempo.

### C-nf. ⬜ Anexar NF em PDF

**Esforço:** 1–2d

Anexar um arquivo PDF (nota fiscal) a um lançamento. Útil pra deduções (médico/educação). Armazenamento: Google Drive via Apps Script (gratuito até quota).

---

## Itens não priorizados (explícitos pra histórico)

Decisões registradas em 2026-06-14:

- ❌ **Resumo semanal por email** — fora de escopo, casal prefere acessar app.
- ❌ **Foto de comprovante** — anexar arquivo é suficiente quando relevante.
- ❌ **Relatório IRPF** — exportar CSV (C-export) cobre o caso quando precisar.
- ❌ **Cotação automática de ativos** — entrada manual está OK.
- ❌ **Multi-moeda** — gastos em moeda estrangeira são raros.
- ❌ **Carteira ideal vs atual** — alocação alvo não é decisão do app.

Decisões registradas em 2026-06-15:

- ❌ **A7 — Saldo de conta corrente** (detalhe em A7 acima).
- ❌ **A8 — Tracker de dívidas separado** (detalhe em A8 acima).
- ❌ **Parser Santander** — conta cancelada, não vai usar.

## Refator findings — auditoria 2026-06-15

Pontos vistos durante revisão de fim-de-sessão que NÃO foram tocados (risco > ganho ou caso não-frequente). Ficam aqui pra retomar se virar dor real:

- **Parser MP não trata multi-linha**: assume valor inline. Se MP no futuro mudar layout pra internacional com conversão em linha separada (como o Nubank), parser perde a tx. Hoje o sample não tem esse caso; adicionar tratamento "valor-only line" só quando aparecer.
- **`Pagamento em` skip do parser Nubank**: a regex `/^Pagamento em\b/i` em [nubank-fatura.ts:154](app-financas-bam-evellyn/frontend/src/lib/parsers/nubank-fatura.ts) pula a descrição. Falso positivo se uma descrição real começar com "Pagamento em" — improvável mas teórico.
- **`titular` match em MP via `raw.includes(meta.titular)`**: se titular for "Evellyn" (short) e uma compra tiver "Evellyn" no nome, a linha é pulada. Não acontece com nomes longos completos; só observar se aparecer.
- **`useCashflowProjection` assume share constante**: o share usado pra ratear conjuntas no futuro é o do mês corrente. Se a renda do casal mudar bruscamente (alguém perde emprego), a projeção fica desatualizada até o user reabrir o mês. Documentado no rodapé do card.
- **`ImportField` inline em Importar.tsx**: só usado lá, não vale extrair pra `/components` ainda — se virar pattern em outra página, extrair.
- **`autoCat.suggest` chamado a cada keystroke no form de despesa**: já é função em memória, custo desprezível. Não otimizar.
- **`Dashboard.tsx` faz progressive load (lists rápido, shares em background)**: já otimizado em `96bccf9` (20s → 5s). Sem ganho marginal previsto.
