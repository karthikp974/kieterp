# Delivery gates (run in order)

## Gate 0 — Environment (once per machine)

```powershell
cd c:\erp
copy .env.example .env
docker compose up -d postgres redis
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed -w apps/backend
```

## Gate 1 — Engineering build

```powershell
npm run check
npm run smoke
```

Backend must be running for smoke (`apps/backend`: `npm run dev`).

## Gate 2 — Admin UI (your phase 1)

For each module: **list → create → save → list again**. Watch browser Network for 4xx/5xx.

Priority modules: Structure, Students, Teachers, Announcements, Applications, Finance, Promotions.

**KIET/KIEK P0**

- KIEK campus + student on shared B.Tech section
- KIEK student sees announcements/applications
- KIEW never mixed with KIET/KIEK in lists

## Gate 3 — Teacher portal

- HTPO/CTPO on shared section: attendance, applications, students list
- Notification badge loads (no console error)

## Gate 4 — Student portal

- Login, dashboard, announcements, applications, feedback

## Gate 5 — Production

- Change all seed passwords
- `prisma migrate deploy` on prod (no casual `seed` on live DB)
- `docker compose up` full stack or your host runbook
- Pilot one branch before college-wide
