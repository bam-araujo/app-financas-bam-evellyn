# Dueto — App de Finanças do Casal

PWA de controle financeiro para duas pessoas (Bam e Evellyn). **Custo zero**: Google Sheets (banco) + Google Apps Script (API) + GitHub Pages (host) + Google OAuth (auth).

Produção: https://bam-araujo.github.io/app-financas-bam-evellyn/

## Stack

- **Frontend:** React + Vite + TypeScript, PWA instalável → `/frontend`
- **Backend:** Google Apps Script (9 módulos `.gs`) → `/backend`
- **Banco:** Google Sheets (10 abas)
- **Auth:** OAuth Google (id_token) + allowlist por email
- **CI/CD:** GitHub Actions → Pages

## Estrutura

```
frontend/   # PWA React + Vite + TS
backend/    # Apps Script (módulos 00_Config..08_Auth) + scripts QA .mjs
docs/       # SETUP.md (zero-to-prod) e QA-REPORT.md (histórico)
```

## Para começar

- **Quer entender o projeto antes de mexer em qualquer coisa?** [AGENTS.md](AGENTS.md) — onboarding completo: regras, arquitetura, padrões, cookbook, armadilhas.
- **O que mudou recentemente?** [docs/CHANGELOG-2026-06-14-15.md](docs/CHANGELOG-2026-06-14-15.md) — TL;DR da última sessão grande de mudanças.
- **Subir do zero (setup manual no Google Cloud + Apps Script + Pages)?** [docs/SETUP.md](docs/SETUP.md).
- **Roadmap de produto (backlog priorizado)?** [docs/BACKLOG.md](docs/BACKLOG.md).
- **Histórico dos 7 PRs originais?** [PRs-app-financas.md](PRs-app-financas.md).
- **Snapshot da bateria QA E2E?** [docs/QA-REPORT.md](docs/QA-REPORT.md).

## Rodar local (depois do SETUP)

```bash
cd frontend
cp .env.example .env.local   # preencher VITE_API_URL e VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
```

Detalhes (incluindo configurar OAuth no Google Cloud, popular a aba `pessoas`, etc.) em [docs/SETUP.md](docs/SETUP.md).
