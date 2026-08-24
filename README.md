# CareFlow — Healthcare Appointment & Follow-up Manager

This repository contains the scaffolding for CareFlow, a production-quality
full-stack application for managing healthcare appointments and follow-ups.

This initial commit contains the project structure, build and lint
configuration, and minimal app router skeleton. No feature implementations are
included — those will be added based on the provided requirements document.

Getting started
1. Copy `.env.example` to `.env` and fill required variables.
2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client after setting `DATABASE_URL` (optional until schema is added):

```bash
npm run prisma:generate
```

4. Run development server:

```bash
npm run dev
```

Project structure (high level)
- `app/` — Next.js App Router entrypoints and pages
- `styles/` — Global CSS and Tailwind
- `prisma/` — Prisma schema
- `lib/` — Small helpers (env handling)
- `.env.example` — Environment variables template (secrets excluded)

Next steps
- Implement role-based authentication and authorization
- Add Prisma models based on requirements
- Integrate Google Calendar (OAuth 2.0) and OpenAI APIs
- Add background job worker and email integration

License
This repo is a job-evaluation project; add a license if required.

AI-powered healthcare appointment and follow-up management platform with role-based portals, concurrency-safe booking, LLM summaries, notifications and Google Calendar integration.
