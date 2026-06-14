# App de Finanças — Bam & Evellyn

PWA de controle financeiro do casal. **Custo zero**: Google Sheets (banco) + Google Apps Script (API) + GitHub Pages (host).

- Regras do projeto: `AGENTS.md`
- Backlog dos PRs: `PRs-app-financas.md`
- Setup passo a passo: `docs/SETUP.md`

## Estrutura

```
frontend/   # PWA React + Vite + TS
backend/    # Google Apps Script (módulos 00_Config..08_Auth)
docs/       # SETUP.md e afins
```

## Rodar local (após SETUP.md)

```bash
cd frontend
cp .env.example .env.local   # preencher VITE_API_URL e VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
```
