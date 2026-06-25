# College ERP

Production-focused College ERP for **KIET**, **KIEK**, and **KIEW** with contextual teacher roles (STPO / CTPO / HTPO), admin workflows, and student/teacher portals.

## Tech stack

| Layer | Technology |
|--------|------------|
| Monorepo | npm workspaces |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | NestJS, Prisma, PostgreSQL |
| Queue | Redis, BullMQ (PDF result import, worker process) |
| DevOps | Docker Compose |

## Academic model (KIET + KIEK)

- **Diploma, B.Tech, M.Tech:** one shared academic tree on **KIET**; students keep **operational campus** label (KIET or KIEK) on `user.campusId`.
- **MBA / MCA:** KIET only.
- **KIEW:** fully isolated — never merged with KIET/KIEK.

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis:

```powershell
docker compose up -d postgres redis
```

3. Install and migrate:

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed -w apps/backend
```

4. Run dev:

```powershell
npm run dev
```

- Frontend: http://localhost:5173/
- API: http://localhost:4000/api

Default admin (seed): `admin@college-erp.local` / `Admin@12345` — change before production.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Backend + frontend |
| `npm run build` | Production build |
| `npm run test` | Backend unit tests |
| `npm run smoke` | Basic API smoke check |
| `npm run check` | generate + typecheck + lint + test + build |

## Portals

| Portal | URL |
|--------|-----|
| Admin | `/admin` |
| Teacher | `/teacher` |
| Student | `/student` |
| DB browser | `/database` |

Demo teachers: `HTPO001` / `TeacherDemo@123` (see login page for all seven role combos).
