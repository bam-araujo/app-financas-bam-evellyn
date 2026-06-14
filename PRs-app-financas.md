# App de Finanças — Bam & Evellyn · PRs 1–7 (HISTÓRICO)

> **Status: todos os 7 PRs entregues.** Este documento serve como **registro do escopo inicial** — não é mais backlog ativo. Para entender o estado atual e os padrões adotados, ver [AGENTS.md](AGENTS.md). Para o snapshot de QA, ver [docs/QA-REPORT.md](docs/QA-REPORT.md).

---

Documento de handoff que orientou a implementação inicial. Cada PR foi implementado em ordem; após a sequência completa, o app teve uma bateria de QA E2E + refactor de qualidade + migração OAuth.

## Contexto e arquitetura

App PWA para controle financeiro de duas pessoas (Bam e Evellyn), com **custo zero obrigatório** — nenhuma dependência paga, nenhum cartão de crédito em nenhum serviço.

Stack:

- **Frontend:** React + Vite + TypeScript, como PWA instalável.
- **Backend:** Google Apps Script publicado como Web App (serverless, gratuito).
- **Banco de dados:** Google Sheets.
- **Host:** GitHub Pages (estático, gratuito).
- **CI/CD:** GitHub Actions.

Por que assim: sem servidor próprio, sem free tier que pausa por inatividade, sem chave de API paga. A planilha é o banco; o Apps Script é a API; o PWA é o cliente.

## Convenções globais (valem para todos os PRs)

- **Custo zero:** proibido qualquer lib, serviço ou API paga. Gráficos com Recharts; sem libs comerciais.
- **Moeda/locale:** BRL via `Intl.NumberFormat('pt-BR')`; datas em pt-BR.
- **Formato de resposta da API:** sucesso `{ok:true, data}`; erro `{ok:false, error}`.
- **Auth:** token compartilhado (segredo de build) validado em toda requisição. Sem token → 401.
- **CORS:** Apps Script não tem CORS configurável — usar `ContentService` (JSON) e `fetch` com `Content-Type: text/plain` para evitar preflight.
- **Privacidade:** parsing de extratos é client-side; arquivos do banco não sobem para servidor nenhum.
- **Concorrência:** toda escrita na planilha usa `LockService` (dois usuários simultâneos não corrompem linhas).
- **Pessoas:** valores válidos `Bam` | `Evellyn`. Investimentos e algumas visões aceitam também `conjunto`.

---

## PR1 — Infra e fundação

**Objetivo:** repo + backend serverless + deploy do PWA, com um endpoint autenticado funcionando ponta a ponta. Sem dado de negócio.

### Escopo incluído

- Scaffold PWA (Vite + React + TS), `manifest.json` + service worker, instalável.
- Estrutura: `/frontend`, `/backend` (Apps Script), `/docs`.
- `backend/Code.gs`: roteamento por `?action=`, validação de token, helpers de leitura/escrita da planilha, endpoint `ping` → `{ok:true, ts}`.
- Config no front: `VITE_API_URL` e `VITE_GOOGLE_CLIENT_ID` (build-time) + `.env.example`. *(Pós-migração OAuth — backlog histórico mencionava `VITE_API_TOKEN` que foi removido.)*
- GitHub Action: build do front + deploy no GitHub Pages no push para `main`.
- `docs/SETUP.md` com os passos manuais do Google.

**Fora de escopo:** schema, CRUD, rateio, import, gráficos, investimentos (PRs seguintes).

### Critérios de aceite

1. `npm run build` roda local; estrutura de pastas criada.
2. PWA instalável (manifest válido, service worker registrando).
3. `Code.gs` com `ping` + auth: sem token → 401; com token → 200.
4. Tela inicial chama `ping` e exibe status "conectado".
5. Deploy automático: URL pública do GitHub Pages abre o PWA.

### Notas técnicas

- `doPost` lê o corpo em `e.postData.contents` (JSON como string).
- Token é segredo de build — não commitar `.env` real; usar GitHub Secrets na Action.

### Passos manuais (humano)

1. Criar planilha em branco, anotar o ID.
2. Extensões → Apps Script → colar `Code.gs` → salvar.
3. Implantar → Web App → executar como você → acesso "qualquer pessoa" → copiar URL.
4. Definir token no `Code.gs`; colar URL + token nos GitHub Secrets e no `.env` local.

---

## PR2 — Schema das abas + camada de acesso a dados

**Objetivo:** estrutura de dados na planilha + CRUD genérico autenticado, com proteção contra escrita concorrente. Sem UI; entrega também um client tipado no front.

### Schema (abas e colunas)

**`pessoas`** (seed fixo)
`id` · `nome` (Bam|Evellyn) · `cor` (hex, para gráficos)

**`receitas`**
`id` · `competencia` (YYYY-MM) · `pessoa` · `tipo` (salario|bonus|promocao|outro) · `origem` · `valor` · `conta_para_share` (TRUE/FALSE, default TRUE)

**`lancamentos`** (despesas)
`id` · `data` (YYYY-MM-DD) · `competencia` (YYYY-MM) · `descricao` · `categoria` · `valor` · `pagador` (Bam|Evellyn) · `tipo` (individual|conjunto) · `dono` (Bam|Evellyn — só quando tipo=individual)

**`investimentos_saldos`**
`id` · `data` (YYYY-MM-DD) · `titular` (Bam|Evellyn|conjunto) · `instituicao` · `ativo` · `valor_saldo`

**`investimentos_movimentos`**
`id` · `data` (YYYY-MM-DD) · `titular` (Bam|Evellyn|conjunto) · `instituicao` · `ativo` · `tipo` (aporte|resgate) · `valor`

**`categorias`** (lookup)
`id` · `nome` · `grupo` (despesa|receita)

### Contrato da API (router genérico)

Padrão único via `action` + `table`:

- `list` — filtro opcional por colunas (ex.: `?table=lancamentos&competencia=2026-06&tipo=conjunto`)
- `get` — por `id`
- `create` — gera `id` via `Utilities.getUuid()`, faz append
- `update` — acha linha por `id`, patch parcial
- `delete` — remove linha por `id`

### Critérios de aceite

1. `initSchema()` (rodada 1x pelo editor) cria as 6 abas com cabeçalho e popula `pessoas` (Bam, Evellyn) + categorias iniciais.
2. Dicionário de schema no `Code.gs` (tabela → colunas, obrigatórios, tipo) valida todo write: create sem campo obrigatório → 400.
3. Whitelist de tabelas: `table` inválido → 400.
4. CRUD genérico funcionando nas 5 tabelas de dados (ciclo create→get→update→list→delete passa).
5. `LockService` envolvendo toda escrita.
6. Client tipado no front (`/frontend/src/api/`) com tipos batendo o schema.

### Notas técnicas

- `competencia` é derivada de `data`: o backend preenche automaticamente no create de `lancamentos` se não vier.
- `dono` obrigatório só se `tipo=individual`; se `conjunto`, deve vir vazio (validar).
- Booleanos como TRUE/FALSE reais, não string.
- Sem FK no Sheets: checagem de `categoria`/`pessoa` é no app.

**Passo manual:** rodar `initSchema()` uma vez no editor do Apps Script.

---

## PR3 — UI de lançamentos (despesas + receitas)

**Objetivo:** telas para criar/editar/listar despesas e receitas, com filtros Bam/Evellyn/conjunto.

### Escopo incluído

- Tela Despesas: lista filtrável (competência, tipo individual/conjunto, pessoa/dono, categoria) + formulário criar/editar (data, descrição, categoria, valor, pagador, tipo, dono condicional).
- Tela Receitas: lista por competência/pessoa + formulário criar/editar (competência, pessoa, tipo, origem, valor, `conta_para_share`).
- Seletor de competência global (default = mês corrente).
- Validações no front espelhando o backend (dono só se individual; `conta_para_share` default TRUE).
- Estados de loading/erro/vazio; refetch após cada write.

### Critérios de aceite

1. Criar/editar/excluir despesa e receita funciona via client do PR2.
2. Campo `dono` desaparece quando `tipo=conjunto`.
3. Filtros recalculam a lista.
4. Valores em BRL, datas em pt-BR.
5. `competencia` da despesa derivada automaticamente da data.

**Notas:** sem libs pagas; usar o client tipado do PR2.

---

## PR4 — Motor de rateio + tela de acerto

**Objetivo:** calcular o share proporcional à renda, ratear despesas conjuntas e mostrar o saldo entre Bam e Evellyn.

**Regra do share (definida):** Para a competência M, `share_pessoa = receitas acumuladas de jan→M da pessoa (apenas conta_para_share=TRUE) ÷ total acumulado do casal jan→M`. É acumulado YTD (dilui o efeito de bônus). Reset em janeiro.

### Escopo incluído

- Cálculo do share no backend (fonte única de verdade): endpoint `action=share&competencia=YYYY-MM` → `{Bam:x, Evellyn:y}`.
- **Congelamento:** nova aba `share_mensal` (`competencia`, `pessoa`, `share`, `fechado_em`). Endpoint para "fechar mês" grava o share apurado; meses fechados não recalculam quando entra receita nova. Mês não fechado usa cálculo on-the-fly (preview).
- **Acerto:** para cada despesa conjunta da competência, devido por pessoa = `valor × share`; quem está no `pagador` recebe crédito do valor cheio. Saldo líquido = soma(pago) − soma(devido) por pessoa → "Evellyn deve R$X para Bam" (ou inverso).
- Tela Acerto: seletor de competência/intervalo, tabela de despesas conjuntas com rateio, saldo final consolidado, botão "fechar mês".

### Critérios de aceite

1. Share confere com cálculo manual (YTD acumulado).
2. Mês fechado não muda ao inserir receita nova.
3. Despesas individuais não entram no acerto.
4. Saldo líquido entre os dois exibido corretamente.

### Notas técnicas

- Adicionar `share_mensal` ao `initSchema` + função de migração para planilhas já criadas.
- Arredondar em 2 casas; resíduo de centavo atribuído ao `pagador` para fechar exato.

---

## PR5 — Import de extrato (conta + cartão)

**Objetivo:** subir arquivo do banco e gerar lançamentos em lote, com revisão antes de salvar. Ambos usam Itaú (um parser por tipo).

### Escopo incluído

- Upload de arquivo no front (OFX e CSV), parsing client-side.
- Tela de revisão: cada transação vira linha editável; usuário define categoria, tipo (individual/conjunto), dono, pagador antes de confirmar.
- Dedupe: sinalizar duplicados por `FITID` (OFX) ou `data+valor+descricao` (CSV).
- Conta corrente Itaú (OFX) primeiro — fluxo principal.
- Cartão Itaú: mesmo fluxo SE exportar OFX/CSV. **Pendência:** confirmar o formato disponível no Itaú. Se for só PDF, parsing de PDF entra como sub-tarefa separada (frágil, dependente de layout) — não bloquear o resto do PR.
- Gravação em lote: endpoint `batch create` no Apps Script (com `LockService`) para reduzir round-trips.

### Critérios de aceite

1. OFX da conta Itaú gera lista revisável.
2. Duplicados sinalizados.
3. Confirmar grava os lançamentos em lote.
4. Sinal do valor mapeado: negativo = despesa, positivo = receita/estorno.

**Notas:** arquivos nunca sobem a servidor (privacidade + custo zero).

---

## PR6 — Dashboards e gráficos

**Objetivo:** gráficos de gastos e receitas por origem, com filtros Bam/Evellyn/conjunto e período.

### Escopo incluído

- Despesas por categoria (barra/pizza) e por mês (série temporal).
- Receitas por origem/pessoa.
- Filtros: pessoa (Bam/Evellyn/conjunto), período/competência, categoria.
- Visão "conjunto": toggle "valor cheio" vs "minha parte (rateada)" — usa o share do PR4.
- Cores por pessoa (da aba `pessoas`).
- Lib: Recharts (gratuita).

### Critérios de aceite

1. Filtros recalculam os gráficos.
2. Toggle valor cheio / rateado funciona na visão conjunto.
3. BRL em eixos e tooltips.

**Notas:** agregações no front a partir do `list` (volume baixo). Endpoint de agregação no backend só se necessário (provavelmente dispensável para 2 pessoas).

---

## PR7 — Investimentos e insights de rendimento

**Objetivo:** telas de saldos e movimentos de investimento (entrada manual) e insights de rentabilidade, individual ou conjunto.

### Escopo incluído

- CRUD de `investimentos_saldos` (snapshots por data) e `investimentos_movimentos` (aportes/resgates).
- Tela de saldos: evolução do patrimônio por data; filtro por titular (Bam/Evellyn/conjunto) e instituição/ativo.
- Rendimento no período: `rendimento = saldo_final − saldo_inicial − aportes + resgates`. Rentabilidade % aproximada = `rendimento ÷ (saldo_inicial + aportes do período)` — documentar que é aproximação, não TIR/money-weighted exata.
- Insights: variação no período, % de rentabilidade, aporte total, melhor/pior ativo, evolução acumulada (texto + gráfico de linha).
- Visão consolidada do casal = soma de Bam + Evellyn + conjunto. Investimento conjunto não rateia (é patrimônio comum, categoria própria).

### Critérios de aceite

1. Rendimento separa aporte de ganho (não confunde depósito com rentabilidade).
2. Filtro por titular funciona; visão total casal soma os três grupos.
3. Gráfico de evolução por titular.

**Notas/fora de escopo:** TIR exata e cotação automática de ativos ficam como melhoria futura (sem fonte de dados gratuita garantida hoje).

---

## Resumo de dependências

```
PR1 (infra) → PR2 (schema+API) → PR3 (UI lançamentos)
                                → PR4 (rateio+acerto)
                                → PR5 (import)
                                → PR6 (dashboards)  [usa share do PR4]
                                → PR7 (investimentos)
```

PR3–PR7 dependem de PR2. PR6 depende também de PR4 (toggle rateado). PR5 tem uma pendência externa: confirmar o formato de exportação da fatura do cartão Itaú.
