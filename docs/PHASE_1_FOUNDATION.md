# College ERP — Current Scope

This document describes what is implemented today. The original “Phase 1 skeleton only” plan has been superseded by full modules.

## Campuses

| Code | Group |
|------|--------|
| KIET | Shared with KIEK |
| KIEK | Shared with KIET |
| KIEW | Isolated |

## Shared programs (KIET + KIEK)

Diploma, B.Tech, M.Tech use `Program.structureScope = GROUP_SHARED` on the KIET tree. Students enrolled on shared sections use **`user.campusId`** as the operational label (KIET or KIEK).

## Implemented modules

- Structure: campus → program → branch → batch → class → section
- Teachers (STPO / CTPO / HTPO) and students
- Attendance, timetable, results (incl. PDF import via background job)
- Finance: fee structure, payments, student receipts
- Promotions, teams, announcements, feedback, applications
- Reports (admin + teacher; exports are synchronous HTTP downloads today)
- Admin, teacher, and student portals with light (admin ERP) and dark themes
- Background jobs: result PDF import via BullMQ; promotion bulk and report export job types are reserved for a later pass

## Build order for new work

1. Confirm behavior (especially KIET+KIEK operational vs structure campus).
2. Extend Prisma schema if needed.
3. Backend endpoints + permission checks.
4. Tests for risky logic.
5. Frontend screens.
6. Run `npm run check`.
