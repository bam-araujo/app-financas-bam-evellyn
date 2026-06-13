# SETUP — App de Finanças (Bam & Evellyn)

Passo a passo para subir o app do zero. Todas as etapas são gratuitas e não pedem cartão de crédito.

> Faça uma vez, na ordem. Depois do PR1 funcionando, é só atualizar `Code.gs` quando os próximos PRs forem aplicados.

---

## 1. Gerar o token compartilhado

Crie um token aleatório longo (>= 32 caracteres). Você vai colar esse mesmo valor em três lugares: `Code.gs` no Apps Script, `.env.local` no frontend e Secrets no GitHub.

Exemplos de como gerar:

- PowerShell: `[Convert]::ToBase64String([Guid]::NewGuid().ToByteArray()) + [Guid]::NewGuid().ToString('N')`
- Bash: `openssl rand -hex 32`
- Online: qualquer gerador de senha forte (use uma cadeia >= 40 chars).

Guarde esse valor — vamos chamar de **`TOKEN`** abaixo.

---

## 2. Criar a planilha (será o banco)

1. Acesse https://sheets.new e crie uma planilha em branco.
2. Renomeie para algo claro, ex.: `Finanças — Bam & Evellyn`.
3. Anote a URL inteira (vamos voltar nela; o ID da planilha está no meio da URL, entre `/d/` e `/edit`).

> O PR2 vai criar as abas (`pessoas`, `receitas`, `lancamentos`, etc.) automaticamente. No PR1 a planilha fica vazia mesmo.

---

## 3. Colar e publicar o Apps Script

1. Na planilha: menu **Extensões → Apps Script**. Abre uma aba nova.
2. Apague todo o código padrão do arquivo `Code.gs` no editor.
3. Copie e cole o conteúdo do nosso `backend/Code.gs` (deste repo).
4. (Recomendado) Em **Configurações do projeto** (ícone de engrenagem na barra lateral), marque **Mostrar o arquivo de manifesto** e cole o conteúdo de `backend/appsscript.json` no `appsscript.json` que apareceu.
5. **Salvar** (ícone de disquete ou `Ctrl+S`).
6. **Definir o token:** ainda no editor, selecione a função `setAuthToken` no dropdown, clique em **Executar** uma vez (vai dar erro porque falta argumento). Em seguida, abra o console (botão **Executar logs**), e rode no editor o snippet abaixo trocando `SEU_TOKEN` pelo `TOKEN` do passo 1:
   ```js
   function _bootstrap() { setAuthToken('SEU_TOKEN'); }
   ```
   Selecione `_bootstrap` no dropdown e clique **Executar**. Apague o snippet depois.
   Alternativa via UI: **Configurações do projeto → Propriedades de script → Adicionar propriedade** → nome `AUTH_TOKEN`, valor = seu token.

### Publicar como Web App

1. Botão **Implantar → Nova implantação**.
2. Tipo: **Aplicativo da Web**.
3. **Executar como:** *Eu (sua conta Google)*.
4. **Quem tem acesso:** *Qualquer pessoa*. — É anônimo na rede; quem protege é o `TOKEN`.
5. Clique **Implantar**. Autorize quando o Google pedir (vai pedir permissão para acessar a planilha; aceite).
6. Copie a **URL do app da Web**. Algo como `https://script.google.com/macros/s/AKfycb.../exec`.

> Toda vez que mudar `Code.gs`, é preciso **Implantar → Gerenciar implantações → editar → versão "Nova versão"** para a mudança valer na URL atual (a URL não muda).

### Teste rápido pelo navegador

Cole no navegador, trocando os valores:

```
{URL}?action=ping&token={TOKEN}
```

Deve responder:

```json
{"ok":true,"data":{"ts":1718000000000}}
```

Sem token (ou errado) deve responder:

```json
{"ok":false,"error":"unauthorized"}
```

---

## 4. Rodar o frontend local

```bash
cd frontend
cp .env.example .env.local
```

Edite `.env.local` e preencha:

```
VITE_API_URL=<URL do Web App copiada no passo 3>
VITE_API_TOKEN=<seu TOKEN>
```

Instale e suba o dev server:

```bash
npm install
npm run dev
```

Abra http://localhost:5173 — a tela deve mostrar **"Conectado"** em verde. Se aparecer erro, abra o DevTools (F12) e veja a aba *Network*: a chamada ao `?action=ping` deve voltar 200 com `ok:true`.

---

## 5. Subir pro GitHub e habilitar Pages

1. Crie um repo no GitHub (privado é fine) e faça push do projeto.
2. No repo, vá em **Settings → Secrets and variables → Actions → New repository secret** e cadastre dois secrets:
   - `VITE_API_URL` — mesma URL do passo 3.
   - `VITE_API_TOKEN` — mesmo `TOKEN`.
3. Em **Settings → Pages**:
   - **Source:** *GitHub Actions*.
4. Faça um push em `main` (ou rode a workflow manualmente em **Actions → Deploy PWA to GitHub Pages → Run workflow**).
5. Quando terminar, o link do Pages aparece na aba **Actions** (também em **Settings → Pages**). Algo como `https://<seu-user>.github.io/<repo>/`.

Abra o link — deve mostrar a mesma tela "Conectado" do dev local. No mobile, o navegador (Chrome/Safari) deve oferecer "Instalar app" / "Adicionar à tela inicial".

---

## 6. Pendências previstas

- **PR2** vai exigir rodar `initSchema()` uma vez no editor do Apps Script para criar as abas.
- **PR5** depende de confirmar se a fatura do cartão Itaú exporta em OFX/CSV (preferível) ou apenas PDF.

---

## Troubleshooting rápido

| Sintoma | Causa provável | Como resolver |
| --- | --- | --- |
| `unauthorized` no ping | Token diferente entre Apps Script e `.env.local` / Secrets | Conferir os três lugares; a URL não importa, o que precisa bater é o token |
| `Failed to fetch` no dev | URL errada ou implantação não publicada | Re-publicar Web App; testar a URL direto no navegador |
| Pages 404 | Source não está como *GitHub Actions* ou build falhou | Conferir **Settings → Pages**; reabrir **Actions** e ver erro do job |
| Mudei `Code.gs` e nada mudou | Esqueceu de criar nova versão | **Implantar → Gerenciar implantações → editar → versão: Nova versão** |
