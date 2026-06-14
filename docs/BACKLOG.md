# BACKLOG — Roadmap de produto

Itens de produto priorizados em tiers (S = mais alto). Cada item tem **estimativa**, **por que vale**, **critério de aceite** e **dicas de implementação** apontando arquivos/padrões existentes — pra um agente futuro pegar item por item sem precisar reinventar contexto.

**Convenções:**
- Tier reflete `valor / esforço` (S = alto valor + baixo esforço).
- Esforço em "dias-tarde" (não horas).
- Status: ⬜ pendente · 🟡 em andamento · ✅ entregue.
- Ao concluir, marcar ✅ com hash do commit.

**Tese geral da v2:** o app hoje pede pra você *registrar* o que aconteceu. O próximo salto é fazê-lo *te avisar* e *te projetar* — virar raio-x ativo da situação financeira em vez de só log do passado.

> **Status atual (2026-06-14):** Tier S inteiro entregue (S1–S5, commits `5b259ee` → `010bbfe`). Próxima onda = Tier A. **EXIGE redeploy do Apps Script** (Nova versão) — 3 tabelas novas (`acertos_pagos`, `auto_categorias`, `orcamento`) só aparecem na planilha quando o backend novo recebe a primeira request com elas no SCHEMA.

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

### A6. ⬜ Previsão de caixa 6 meses

**Esforço:** 2–3d

**Por que vale:** com recorrências cadastradas, parcelas em aberto e receitas projetadas, é possível dizer "em outubro o saldo conjunto vai estar em R$X". Hoje vive na cabeça do casal.

**Critério de aceite:**
- Novo card no Dashboard: linha do tempo de saldo projetado pros próximos 6 meses.
- Inputs: lançamentos recorrentes ativos, parcelas em aberto, receitas projetadas (média YTD de cada pessoa).
- Mostrar pontos de "perigo" (saldo projetado < 0) em vermelho.

**Dicas de implementação:**
- Hook puro `useCashflowProjection(lancamentos, receitas, mesesAhead=6)`.
- Componente em `components/charts/PrevisaoCaixa.tsx`.
- Saldo inicial = soma dos saldos das contas correntes (depende de **A7**) ou input manual.

---

### A7. ⬜ Contas correntes / saldo em conta

**Esforço:** 2d

**Por que vale:** investimentos têm saldo, mas conta corrente / poupança / dinheiro vivo não entram no app. Bloqueia ter visão de "quanto vocês têm hoje".

**Critério de aceite:**
- Nova tabela `contas(id, titular, banco, tipo, saldo, atualizado_em)`.
- Página `/contas` com CRUD simples (similar a Investimentos).
- Saldo total = Σ saldos das contas + Σ saldos de investimentos. Card no Dashboard.

**Dicas de implementação:**
- Schema + `useCrudForm + EntityList` (padrão estabelecido).
- "atualizado_em" pra mostrar se o saldo está velho.

---

### A8. ⬜ Passivos (dívidas)

**Esforço:** 2d

**Por que vale:** financiamento de carro, empréstimo, parcelado de longo prazo não estão modelados. Patrimônio líquido (ativos − passivos) fica incompleto.

**Critério de aceite:**
- Nova tabela `dividas(id, titular, descricao, total, juros_mes, parcelas_total, parcelas_pagas, inicio)`.
- Página `/dividas` com CRUD.
- Card no Dashboard: "Patrimônio líquido = ativos (contas + investimentos) − dívidas".
- Visão de "% pago" por dívida.

**Dicas de implementação:**
- Similar a A7, padrão CRUD.
- Cuidado: dívidas têm relação com lançamentos (a parcela paga é um lançamento) — modelar como "lançamento referencia divida_id"? Ou simplificar e tratar como tracker independente? Por simplicidade, começar independente.

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

### B13. ⬜ Sub-categorias / tags transversais

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
- ❌ **Outros bancos no import** (Nubank, Inter, etc.) — Itaú cobre 100% hoje.
- ❌ **Foto de comprovante** — anexar arquivo é suficiente quando relevante.
- ❌ **Relatório IRPF** — exportar CSV (C-export) cobre o caso quando precisar.
- ❌ **Cotação automática de ativos** — entrada manual está OK.
- ❌ **Multi-moeda** — gastos em moeda estrangeira são raros.
- ❌ **Carteira ideal vs atual** — alocação alvo não é decisão do app.
