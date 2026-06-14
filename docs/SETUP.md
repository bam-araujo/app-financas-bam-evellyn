# SETUP — App de Finanças (Bam & Evellyn)

Passo a passo para subir o app do zero. Todas as etapas são gratuitas e não pedem cartão de crédito.

> Faça uma vez, na ordem. Depois, é só atualizar os módulos `*.gs` no Apps Script quando você puxar mudanças desse repo.

---

## 1. Criar a planilha (será o banco)

1. Acesse https://sheets.new e crie uma planilha em branco.
2. Renomeie para algo claro, ex.: `Finanças — Bam & Evellyn`.
3. Anote a URL inteira (vamos voltar nela; o ID da planilha está no meio da URL, entre `/d/` e `/edit`).

> O PR2 vai criar as abas (`pessoas`, `receitas`, `lancamentos`, etc.) automaticamente quando você rodar `initSchema()` mais adiante.

---

## 2. Criar o OAuth 2.0 Client ID (Google Cloud Console)

Auth do app usa Google Identity Services. Cada usuário entra com a própria conta Google; o backend valida o ID token e checa se o email tá na aba `pessoas`.

1. Abra https://console.cloud.google.com/apis/credentials e crie ou selecione um projeto.
2. **Configurar tela de consentimento OAuth** (se nunca configurou):
   - Tipo: **Externo** (a menos que vc use Workspace, aí Interno).
   - Nome do app: `Dueto`. Email de suporte: o seu. Email do desenvolvedor: o seu.
   - Em **Test users**, adicione os emails que vão usar (Bam + Evellyn) — assim o app funciona em modo "test" sem precisar de verificação.
3. **Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - **Origens JavaScript autorizadas**:
     - `http://localhost:5173`
     - `https://<seu-user>.github.io` (ex.: `https://bam-araujo.github.io`)
   - Não precisa preencher *Redirect URIs*.
4. Copie o **Client ID** gerado (algo como `123456-abc.apps.googleusercontent.com`). Vamos chamar de **`CLIENT_ID`**.

---

## 3. (Opcional, só pra QA local) Gerar um service token

Esse token só é usado pelos scripts `.mjs` da pasta `backend/` (qa-e2e, cleanup, smoke-tests). O frontend **não usa** — usa OAuth.

Gere um valor longo (>= 32 chars):

- PowerShell: `[Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')`
- Bash: `openssl rand -hex 32`

Guarde como **`SERVICE_TOKEN`**.

---

## 4. Colar e publicar o Apps Script

1. Na planilha: menu **Extensões → Apps Script**. Abre uma aba nova.
2. Apague todo o código padrão. Crie um arquivo `.gs` pra cada módulo do nosso `backend/` (`00_Config.gs`, `01_Schema.gs`, ..., `08_Auth.gs`) e cole o conteúdo correspondente. Os nomes com prefixo `0X_` garantem a ordem de carregamento.
3. (Recomendado) Em **Configurações do projeto** (engrenagem), marque **Mostrar arquivo de manifesto** e cole o conteúdo de `backend/appsscript.json`.
4. **Salvar tudo** (`Ctrl+S`).
5. **Definir o Client ID e (opcional) Service Token:** no editor, rode esse snippet uma vez:
   ```js
   function _bootstrap() {
     setOAuthClientId('SEU_CLIENT_ID.apps.googleusercontent.com');
     setServiceToken('SEU_SERVICE_TOKEN');  // só se for usar scripts .mjs
   }
   ```
   Selecione `_bootstrap` no dropdown → **Executar** → autorize. Depois apague o snippet.

   Alternativa via UI: **Configurações do projeto → Propriedades de script → Adicionar propriedade**:
   - `OAUTH_CLIENT_ID` = seu Client ID
   - `SERVICE_TOKEN` = seu service token

### Publicar como Web App

1. Botão **Implantar → Nova implantação**.
2. Tipo: **Aplicativo da Web**.
3. **Executar como:** *Eu (sua conta Google)*.
4. **Quem tem acesso:** *Qualquer pessoa*. — É público na rede; quem protege é o OAuth + allowlist na planilha.
5. Clique **Implantar**. Autorize quando pedir.
6. Copie a **URL do app da Web** (algo como `https://script.google.com/macros/s/AKfycb.../exec`).

> Toda vez que mudar um `.gs`: **Implantar → Gerenciar implantações → editar → versão: Nova versão**. A URL não muda.

### Teste rápido pelo navegador

Cole no navegador (substituindo a URL):

```
{URL}?action=ping
```

Deve responder `{"ok":true,"data":{"ts":...}}` mesmo sem token (ping é unauth por design).

Já o `whoami` sem token retorna `{"ok":false,"error":"unauthorized"}`. Pra testar com service token:

```
{URL}?action=whoami&service_token={SERVICE_TOKEN}
```

Deve responder `{"ok":true,"data":{"email":"service@scripts","nome":"service",...}}`.

---

## 5. Inicializar a planilha + cadastrar emails

1. No editor, rode `initSchema()` uma vez. Cria as 7 abas + popula `pessoas` (Bam, Evellyn) e categorias iniciais.
2. **Abra a planilha** e vá na aba `pessoas`. Preencha a coluna `email` com:
   - Linha de **Bam** → email Google do Bam (ex.: `bam@gmail.com`)
   - Linha de **Evellyn** → email Google da Evellyn

> Sem email preenchido, o usuário não consegue entrar (mesmo com Google login válido). É a allowlist do backend.

---

## 6. Rodar o frontend local

```bash
cd frontend
cp .env.example .env.local
```

Edite `.env.local` e preencha:

```
VITE_API_URL=<URL do Web App copiada no passo 4>
VITE_GOOGLE_CLIENT_ID=<CLIENT_ID do passo 2>
```

Instale e suba o dev server:

```bash
npm install
npm run dev
```

Abra http://localhost:5173. Deve aparecer a tela de **login com Google**. Clica, escolhe sua conta, e cai no dashboard com saudação `Bom dia, Bam ☀️` (ou similar).

---

## 7. Subir pro GitHub e habilitar Pages

1. Faça push do projeto pro repo no GitHub.
2. **Settings → Secrets and variables → Actions → New repository secret** — cadastre dois secrets:
   - `VITE_API_URL` — mesma URL do passo 4.
   - `VITE_GOOGLE_CLIENT_ID` — mesmo Client ID do passo 2.
3. **Settings → Pages → Source: GitHub Actions**.
4. Push em `main` (ou **Actions → Deploy → Run workflow**).
5. Quando o build terminar, abra o link `https://<seu-user>.github.io/<repo>/`. Deve mostrar a mesma tela de login.

---

## 8. Rodar scripts de QA (opcional)

Os scripts em `backend/*.mjs` (qa-e2e, cleanup, smoke-*) usam o service token. Defina as duas vars no ambiente:

```powershell
$env:VITE_API_URL = "https://script.google.com/macros/s/.../exec"
$env:API_TOKEN = "seu_service_token"
node backend/qa-e2e.mjs
```

Bash equivalente:

```bash
VITE_API_URL=... API_TOKEN=... node backend/qa-e2e.mjs
```

---

## Troubleshooting rápido

| Sintoma | Causa provável | Como resolver |
| --- | --- | --- |
| `email_not_authorized:foo@bar.com` no login | Email do usuário não está na coluna `email` da aba `pessoas` | Editar a planilha e preencher o email corretamente |
| `id_token_wrong_audience` | OAUTH_CLIENT_ID no Apps Script não bate com o que o frontend usa | Atualizar Script Property OAUTH_CLIENT_ID pra bater com `VITE_GOOGLE_CLIENT_ID` |
| Botão Google login não aparece | Origem não está nas "Origens JavaScript autorizadas" | Adicionar `http://localhost:5173` e a URL do Pages no Client ID |
| `Failed to fetch` | URL do Web App errada, ou Apps Script não publicado | Re-publicar Web App; testar URL no navegador |
| Pages 404 | Source não está como *GitHub Actions* ou build falhou | Conferir **Settings → Pages**; reabrir **Actions** |
| Mudei `.gs` e nada mudou | Esqueceu de criar nova versão | **Implantar → Gerenciar implantações → editar → versão: Nova versão** |
| Usuário logado, mas `whoami` falha | A planilha foi reinicializada e perdeu o email | Editar a aba `pessoas` e preencher emails de novo |
