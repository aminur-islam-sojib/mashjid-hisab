# Mashjid Hisab: workspace rules (read first)

Workspace = the parent folder containing:
- mashjid-hisab-frontend/  Next.js 16 App Router, React 19, TanStack Query, zod, shadcn/Base UI
- mashjid-hisab-backend/   Express 5, TypeScript, Prisma 7 (PostgreSQL), JWT cookies, multi-tenant (1 tenant = 1 mosque)
- docs/                    PRODUCT.md, API.md, AUDIT.md, UX-PRINCIPLES.md, ROADMAP.md, DECISIONS.md

## Start of every task
1. Read docs/PRODUCT.md and docs/UX-PRINCIPLES.md.
2. Read the AGENTS.md inside each repo you will touch, and any matching .agents/skills.
3. Write a plan: files per repo, DB changes, tests. Wait for approval before editing.
4. Work on the branch already checked out (expected: `features`). Never commit to `main`. Never push.

## Source-of-truth rules
- The backend decides money, roles and tenant scope. The frontend only displays and gates UI.
- Every number on screen comes from ONE backend calculation. Never recompute totals in components.
- Any API change updates docs/API.md and the frontend types/hooks in the same task.
- Money = integer poisha (BigInt) end to end. Convert only in src/lib/money.ts.
- Posted financial records are immutable: correct via void + reversal. No hard deletes of financial data.

## Backend conventions (already established; follow them)
- Module pattern: src/modules/<name>/{*.routes,*.controller,*.service,*.validation}.ts
- Tenant: routes use requireMosqueMembership + role presets. Never trust mosqueId or role from the body.
- Errors: use the existing error classes and globalErrorHandler. Codes are UPPER_SNAKE.
- Every financial write: runs in a transaction, writes an audit log (pass req.ip and user-agent), and supports Idempotency-Key (after task T03).
- Tests: vitest. Add tests for every change. Run the typecheck (if present) and npm test.

## Frontend conventions
- Read the frontend AGENTS.md first (Next.js 16 may differ from your training data).
- Reuse components in src/components/ui. One TanStack Query hook per resource. Forms = react-hook-form + zod.
- Every list/page has: loading skeleton, empty state with a next action, error state with retry.
- Every submit button is disabled while pending. Money POSTs send an Idempotency-Key (after T03).
- User-facing strings go through i18n (en + bn) after T08. No new hard-coded text once it exists.
- Verify with browser screenshots at 390px and 1440px.

## Database safety
- Never run: prisma migrate reset, prisma db push --force-reset, DROP, TRUNCATE, or delete ledger rows.
- Show migration SQL and wait for approval. Dev database only. Remind me to pg_dump first.

## Never
- Never commit .env or secrets. Never add a dependency without justifying it in the plan.
- Never refactor unrelated files. One task = one focused diff.
- Do not run without approval: git push, migrations, package installs.

## Finishing a task
Run /ship. Tick the task in docs/ROADMAP.md. Add one line to docs/DECISIONS.md if a design choice was made.
