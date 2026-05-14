# KIET ERP — Project Handover Manifest

This document describes the **current state** of the monorepo (`apps/frontend`, `apps/backend`, root `docker-compose.yml`). Paths are relative to the repository root unless noted.

---

## 1. Architecture and folder structure

### Monorepo layout (frontend)

There is **no** top-level `src/admin`, `src/shared`, or `src/hooks` at the repo root. The SPA lives under **`apps/frontend/src/`**.

| Area | Location | Role |
|------|----------|------|
| Admin hub UI | `apps/frontend/src/portals/` (`AdminPortal.tsx`, `AdminDashboardPage.tsx`, `DatabasePortal.tsx`, `TeacherPortal.tsx`, `StudentPortal.tsx`, …) | Shell-based portals and dashboards |
| Workflow CRUD / wizards | Feature folders: `department-branch/`, `classes-sections/`, `batches/`, `subjects/`, `syllabus/`, `teachers/`, `students/`, `promotions/`, `finance/`, `announcements/`, `feedback/`, … | Routes registered in `apps/frontend/src/App.tsx` |
| Shared UI / infra | `apps/frontend/src/shared/` | Shell, menus, loaders, route boundaries, toast, form controls, chunk recovery, etc. |
| Hooks | **No dedicated `hooks/` directory** | Logic such as `useChunkLoadRecovery` lives under `shared/`; auth hooks live under `auth/` |

### Routing split

`App.tsx` defines **two** admin-related trees:

1. **`ProtectedRoute` (ADMIN) → `LazyRouteBoundary` → workflow URLs** (e.g. `/department-branch/...`, `/feedback/...`) — full-screen workflow pages.
2. **`Shell` → `LazyRouteBoundary` → `/admin`, `/admin/modules`, `/database`** — dashboard and module hub with the main shell layout.

### `LazyRouteBoundary`

- File: `apps/frontend/src/shared/LazyRouteBoundary.tsx`.
- Wraps route output in **`Suspense`** with fallback **`AdminWorkflowRouteSkeleton`** (`shared/route-loading-shell.tsx`).
- **Convention:** one boundary per route segment; **do not** nest extra `Suspense` per page (keeps a single loading shell during lazy navigation).

### `ChunkLoadErrorBoundary`

- File: `apps/frontend/src/shared/ChunkLoadErrorBoundary.tsx`; mounted in `apps/frontend/src/main.tsx` around `BrowserRouter`.
- **Stale chunk / deploy mismatch:** if `isStaleChunkLoadError` (see `shared/chunk-load-recovery.ts`), **`reloadAppForFreshChunks()`** runs (debounced full reload).
- **Other errors:** shows `erp-fatal-shell` with message and a “Reload page” control; in dev, `componentDidCatch` logs to console.
- **`useChunkLoadRecovery`** in `App.tsx` installs window listeners for chunk failures that may escape React’s tree (`installStaleChunkListeners`).

### Manual chunks (`apps/frontend/vite.config.ts`)

**`node_modules`:** `lucide`, `react-dom`, `react-router`, `react`, `vendor` (remaining `node_modules`).

**Application splits:**

| Chunk id | Source paths |
|----------|----------------|
| `erp-promotion` | `src/promotions/` |
| `erp-finance` | `src/finance/` |
| `erp-students` | `src/students/` |
| `erp-teachers` | `src/teachers/` |
| `erp-reports` | `src/reports/` **and** `src/results/` |
| `erp-operations` | `src/timetable/` **and** `src/attendance/` |
| `erp-portals` | `src/portals/` |
| `erp-structure` | `department-branch/`, `classes-sections/`, `batches/`, `subjects/`, `syllabus/` |

**Dev proxy:** `server.proxy` maps **`/api` → `http://localhost:4000`**.

---

## 2. UI and branding standards

### Institutional blue (CSS tokens)

Defined in `apps/frontend/src/styles.css` on `:root`:

- **`--erp-blue: #004b8d`**
- **`--erp-blue-rgb: 0 75 141`**
- **`--erp-blue-strong: #003b70`**
- **`--erp-blue-soft: #e7f1fa`**

**Note:** Some Tailwind usage in `shared/Shell.tsx` uses **`#004B8D`** for brand blocks; align with tokens if standardizing on one hex. The design system does **not** currently use `#004F9F` as the primary token.

### Glass-style workflow buttons

Class **`.db-glass-button`** (e.g. `shared/OptionPage.tsx` → `OptionActionButton`):

- **Layout:** `text-align: left`, generous padding, rounded corners (~20px).
- **Glass:** light gradient fill, **`backdrop-filter: blur(16px)`**, soft slate border, elevated shadow.
- **Icon:** Lucide in a 38×38 tile, **18px**, stroke **~2.1**, institutional blue accent on soft blue tile.
- **Copy:** bold label; **description** in gray (**`#8a94a6`**, 12px).
- **Chevron:** trailing `ChevronRight` on the row action pattern.

**Wizard actions** may use **`shared/WfBtn.tsx`** (plain control) — do not assume every button is a glass row.

---

## 3. Database and backend mapping

### Department / program / branch

- UI language may say **“Department”**; Prisma model is **`Program`** (belongs to **`Campus`**).
- **Branch** is the **`Branch`** model with **`programId` → `Program`**. There is **no** `Brands` table in this schema.

### Code uniqueness (scoped)

Examples from `apps/backend/prisma/schema.prisma`:

- Program: **`@@unique([campusId, code])`**
- Branch: **`@@unique([programId, code])`**

Other entities use their own composite or single-field uniques (batches, classes, subjects, etc.) — always check the model before assuming “global” code uniqueness.

### Soft archive

Structure entities use **`StructureStatus`**, **`isArchived`**, **`archivedAt`** (e.g. `Program`, `Branch`).  
`apps/backend/src/department-branch/department-branch.service.ts` filters active, non-archived rows by default; archiving sets **archived** state and timestamps (including cascading behavior when archiving a program — see service implementation).

---

## 4. Completed surfaces (admin workflow routes + hubs)

**Definition:** Route exists, lazy page is exported from `app-lazy-pages.ts`, and route is wired in `App.tsx`.

### ADMIN workflow routes (`LazyRouteBoundary`, no `Shell` parent in the same way as `/admin`)

Includes (non-exhaustive listing by module):

- **Department & Branch:** home, add/modify/delete department & branch, history.
- **Classes & Sections:** home, add/modify/delete class & section, history.
- **Batches:** home, add, modify, delete, history.
- **Subjects / Syllabus:** home, add, modify, delete, history each.
- **Teachers / Students:** home, add, modify, delete, history each.
- **Promotion:** home, history.
- **Fee structure:** home, history.
- **Payments:** hub, register, history.
- **Announcements:** hub, create, history, modify list, modify `:id`, archive.
- **Feedback:** hub, create, active, archived, reports hub/detail, paragraph answers; **student:** `/student/feedback`, `/student/feedback/:formId`.

### Shell admin

- **`/admin`** — `AdminDashboardPage`.
- **`/admin/modules`** — `AdminPortal` (tabbed panels: structure slices, attendance, finance, results, reports, promotion, teams, timetable, announcements, applications, students, teachers, … — see `adminModules` in `AdminPortal.tsx`).
- **`/database`** — `DatabasePortal`.

### Known gap

- **`portals/PdfResultParserPortal.tsx`** exists but is **not** registered in `App.tsx` (unused unless linked elsewhere).

### Migrations / git hygiene

Many Prisma migrations may be **untracked or in flux**; treat **migration commit + deploy order** as a handover checklist item for any new environment.

---

## 5. Pending / next work (portals and product hardening)

**Note:** `TeacherPortal.tsx` and `StudentPortal.tsx` already compose multiple **panels** (attendance, timetable, results, finance, teams, applications, announcements, …). “Pending” here means **dedicated routes**, **permission audits**, **pagination/UX polish**, **E2E coverage**, and **production API routing** — not necessarily absence of UI.

### Teacher portal (attendance, marks / results)

1. Map each panel action to backend endpoints; enforce **role + scope** (`STPO` / `CTPO` / `HTPO`) on every mutating call (never UI-only).
2. Attendance: session lifecycle, mark grid, idempotent saves, correction rules vs admin.
3. Marks / results: clarify manual entry vs PDF import; heavy work via **background jobs** per project rules.
4. Empty states for zero-scope teachers; server-side pagination for large lists.

### Student portal (fees, profile, timetable)

1. Optional **`/student/profile`** (or extend `GET /api/portals/student/academic`) for a clear profile surface.
2. Harden fee views (server read-only, receipts).
3. Timetable deep links and optional child routes (`/student/timetable`, `/student/fees`) for lazy splitting and bookmarks.
4. Align `Shell` student nav with any new routes.

### Docker / same-origin API

Production **Dockerfile** for frontend runs **`vite preview`** without an **`/api` reverse proxy`**. Browsers use **`fetch("/api/...")`**. For containerized deploys, add **same-host proxy** or **`VITE_`-based API base URL** plus CORS strategy. Nest enables **`cors: true`** in `main.ts`, which helps cross-origin setups.

---

## 6. Docker and environment

### `docker-compose.yml` (repository root)

| Service | Purpose |
|---------|---------|
| `postgres` | PostgreSQL 16; DB `college_erp`; port **5432** |
| `redis` | Redis 7; port **6379** |
| `backend` | Nest API; port **4000**; `env_file: .env`; overrides `DATABASE_URL`, `REDIS_*` for service DNS names |
| `worker` | Same image; `npm run worker -w apps/backend` |
| `frontend` | Vite preview; port **5173** |

### `.env.example`

Documents local defaults: `DATABASE_URL`, `REDIS_*`, `JWT_*`, `BACKEND_PORT`, `FRONTEND_PORT`, SMTP-related vars. **JWT secrets and SMTP** must be set for real authentication and email.

### Local development

- Backend: typically port **4000** (see `.env.example`).
- Frontend: **5173** with Vite **proxying `/api` to localhost:4000**.

---

## Document control

| Item | Value |
|------|--------|
| Repo layout | Monorepo: `apps/frontend`, `apps/backend` |
| Primary institutional blue (CSS) | `#004b8d` (`--erp-blue`) |
| Department → DB | **`Program`** |
| Branch → DB | **`Branch`** (not “Brands”) |

End of manifest.
