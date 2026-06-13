# AGENTS.md

Instruções permanentes para qualquer agente trabalhando neste repositório. Ler antes de cada tarefa. O **backlog de tarefas** está em `PRs-app-financas.md` — este arquivo define *como* trabalhar, não *o que* construir.

## O projeto

PWA de controle financeiro para duas pessoas (**Bam** e **Evellyn**). Banco de dados = Google Sheets; API = Google Apps Script (Web App); cliente = PWA React; host = GitHub Pages.

## Regras inegociáveis (nunca violar)

1. **Custo zero.** Nenhuma biblioteca, serviço ou API paga. Nenhum cadastro que exija cartão de crédito. Se uma solução exige pagamento, parar e sinalizar — não implementar.
2. **Sem integração bancária automática.** Open Finance está fora de escopo (é pago). Dados entram por digitação ou import de arquivo.
3. **Privacidade dos extratos.** Parsing de OFX/CSV/PDF é **100% client-side**. Arquivos do banco nunca sobem para servidor algum.
4. **Toda escrita na planilha usa `LockService`.** Dois usuários simultâneos não podem corromper linhas.
5. **Não commitar segredos.** Token e URLs ficam em variáveis de ambiente / GitHub Secrets. Nunca em código versionado.
6. **Não inventar schema.** As tabelas e colunas são as definidas no PR2. Não criar coluna/aba nova sem isso estar num PR. Em dúvida, parar e perguntar.

## Arquitetura

- **Frontend:** React + Vite + TypeScript, PWA instalável. Pasta `/frontend`.
- **Backend:** Google Apps Script publicado como Web App. Pasta `/backend`.
- **Banco:** Google Sheets (a planilha é o banco; sem ORM, sem FK).
- **CI/CD:** GitHub Actions → deploy no GitHub Pages no push para `main`.
- **Docs:** `/docs`.

## Como trabalhar

- Implementar **um PR por vez**, na ordem de `PRs-app-financas.md`. Respeitar as dependências listadas lá.
- Não expandir escopo. Entregar exatamente o que o PR pede; ideias extras vão como sugestão, não como código.
- "Pronto" = todos os critérios de aceite do PR atendidos + build passando + sem segredo commitado.

## Comandos

Frontend (rodar de dentro de `/frontend`):

- `npm install` — instala dependências
- `npm run dev` — dev server em `http://localhost:5173`
- `npm run build` — build de produção em `dist/`
- `npm run preview` — serve o build de produção localmente
- `npm run lint` — typecheck via `tsc --noEmit`

Backend (Apps Script):

- Sem build. Editar `backend/Code.gs` e colar no editor do Apps Script (Extensões → Apps Script na planilha).
- Publicar: Implantar → Nova implantação → Tipo: Aplicativo da Web → Executar como: você → Acesso: qualquer pessoa.
- Passos detalhados em `docs/SETUP.md`.

## Convenções de código

- TypeScript em modo estrito no front.
- Moeda e datas sempre em pt-BR (`Intl.NumberFormat('pt-BR')`, datas pt-BR).
- Gráficos: **Recharts** (gratuito). Não usar libs de chart comerciais.
- Toda tela com estados de loading / erro / vazio.
- Variáveis de ambiente: `VITE_API_URL`, `VITE_API_TOKEN` (build-time).

## Contrato da API (resumo — detalhe no PR2)

- Formato de resposta: sucesso `{ok:true, data}`; erro `{ok:false, error}`.
- Auth: token validado em toda requisição. Sem token → 401.
- Router genérico por `action` + `table` (list/get/create/update/delete).

## Armadilhas do Apps Script (respeitar sempre)

- Sem CORS configurável: usar `ContentService` retornando JSON e `fetch` com `Content-Type: text/plain` para evitar preflight.
- `doPost` lê o corpo em `e.postData.contents` (JSON como string).
- IDs gerados com `Utilities.getUuid()`.
- Volume é baixo (2 usuários): preferir simplicidade a otimização prematura.

## Quando parar e perguntar

- A tarefa parece exigir algo pago.
- Falta uma definição de schema/regra de negócio.
- Um PR depende de informação externa ainda não confirmada (ex.: formato de exportação da fatura do cartão Itaú no PR5).
