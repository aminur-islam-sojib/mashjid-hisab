# Roadmap (agent: do tasks in order; tick the box when done and merged)

Order matters. Track A fixes trust, B is the UX redesign, C is safety, D is new value.
Each task: plan first, wait for approval, implement, test, /ship.

## Track A: Trust (do first)

- [x] **T01 Pending-count consistency** (backend + frontend)
  Why: AUDIT s3. Dashboard card/banner count includes OPEN counting sessions, but /transactions/pending does not, so the user sees "1" then an empty queue.
  Do: Approvals queue = PENDING donations + PENDING/PENDING_APPROVAL expenses. Counting sessions to verify are returned separately as `countingSessionsToVerify`. Extract ONE shared where-clause/helper used by both /reports/dashboard and getPendingTransactions. Dashboard strip lists each non-zero item with its own link; hidden if all zero.
  Done when: badge == rows in queue (test); counting session shown separately; copy matches data.

- [x] **T02 Unallocated money** (backend + frontend)
  Why: AUDIT s4. Account.openingBalance has no fund counterpart; sum(accounts) != sum(funds) by the opening balance.
  Do: Enforce invariant sum(account balances) == sum(fund balances). Propose a design in the plan (recommended: creating an account with openingBalance requires `openingFundId`, default General, and the fund side records it). Provide a one-time fix for the existing mosque (show SQL, wait for approval; pg_dump first). Reports API returns `unallocated`. UI shows an "Unallocated" row only when it is not zero, with an explanation and an Allocate action.
  Done when: new account with opening balance keeps the invariant (test); existing mosque shows 0 unallocated after the approved fix.

- [x] **T03 Idempotency and double-submit protection** (backend + frontend)
  Why: AUDIT risk #1. Double-click or retry creates duplicate donations/expenses/transfers.
  Do: `Idempotency-Key` header on POSTs that create or change financial records (donations, expenses, transfers, due payments, collections verify, reconciliations, approve/reject). Store key + request hash + stored response, unique per (mosque, user, key), 24h TTL. Same key + same body returns the stored response; same key + different body returns 409. Frontend: generate a key when a form opens, send it, disable submit while pending.
  Done when: tests prove a repeated request creates one record; UI cannot double-submit.

- [x] **T04 Role-aware navigation and route guards** (frontend)
  Why: AUDIT risk #9. Members can open /accounts and only then get a 403 error.
  Do: Filter sidebar by role using the target nav in docs/UX-PRINCIPLES.md and docs/SIMPLIFY.md. Add a guard in the mosque layout that redirects before render when the role cannot access the route.
  Done when: each role sees only its items; direct URL to a forbidden page redirects to the role's home.

## Track B: UX redesign (Order: T06 -> T05 -> T07 -> T07B -> T08...)

- [x] **T06 Sidebar regroup + Approvals page** (frontend + backend fix)
  Why: Nav has 18 unorganized items; approvals is buried under transactions tab; box-counting roles have backend/frontend mismatch.
  Do:
  1. Sidebar regrouping: Organize into DAILY WORK, PEOPLE, RECORDS, and collapsed SETUP. Include COMMITTEE role in nav matrix (read-only oversight). Restrict items: Admin/Treasurer (5 core areas), Staff (5 items), Member (3 items). Mobile: bottom bar (Home, Donations, Expenses, More).
  2. Approvals page: Extract approvals out of /transactions tabs into dedicated `/approvals` with live count badge. Card-based queue with 5-second delayed commit countdown (with Undo). Bulk approve for donations only (shows count & sum; excludes expenses and over-limit items).
  3. Box-counting role fix: Update backend `GET /collections` and `GET /collections/:id` to allow `COLLECTION_OPERATOR_ROLES` so Staff can view count history; update frontend `sidebar.tsx` so Committee can view count history. Keep old `/transactions?tab=pending` redirecting.
  Done when: sidebar matches SIMPLIFY.md matrix across all 5 roles; /approvals shows live badge; delayed commit works; bulk approve works for donations; staff & committee can view collections without 403.

- [ ] **T05 Dashboard redesign & Role homes** (frontend + extend /reports/dashboard)
  Why: Current dashboard has a huge hero banner, lacks role differentiation, and lacks 1-tap reporting.
  Do:
  1. Dashboard layout: Slim one-line greeting (remove hero illustration). Action row ([Record donation], [Record expense], [Count box], [Transfer]). Attention strip for pending items. 3 KPI cards with unallocated row if non-zero. Prominent 1-tap "Download Monthly Report (PDF)" button.
  2. Role homes: Staff Home (Quick add, Box count, my pending log), Member Home (redirects to `/me` My Giving), Committee (read-only financial overview).
  3. Older-user accessibility: min 16px text on inputs, 48px touch targets, WCAG AAA high contrast, large bold numerals.
  4. Extend existing `/reports/dashboard` (add comparison vs last month, recent activity, unallocated, countingSessionsToVerify). Do not create a new endpoint.
  Done when: dashboard renders slim greeting, action row, KPI cards, and role homes; 1-tap monthly report button visible; mobile passes 48px touch target check.

- [ ] **T07 Quick-add for donation and expense** (frontend + backend derivation)
  Why: Recording a donation takes 8-11 taps across 11 fields; expenses hard-block without receipts.
  Do:
  1. Quick-add Donation: 2-3 fields (Amount + Category chip; optional inline Donor autocomplete for named categories, hidden for box/Jummah categories). Bottom sheet on mobile, clean dialog on desktop. Smart "Save & Add Another" action.
  2. Backend derivation: When accountId/fundId/date omitted, derive account (user's last-used, else oldest active CASH account; clear error if none) and fund (category.fundId, else active GENERAL fund; clear error if none). Return resolved entities in API response; show resolved preview in UI summary.
  3. Quick-add Expense: 3 fields (Amount, Category chip, Payee). Mosque setting `receiptRequiredThreshold` (receipt required above ৳X, optional below). Add "Missing receipts" list.
  4. Large-amount confirmation: Modal prompt for amounts >= ৳50,000 with amount spelled out in Bengali and English words.
  5. Box-counting verification: Blind double-entry verification (verifier enters independent count; match posts, mismatch flagged with both numbers).
  6. Chanda collection flow: 1-tap mark-paid from member chanda grid.
  7. Physical transfers: Derive General Fund when balance is sufficient; 1-tap selector when insufficient. Inter-fund reallocation restricted to Admin with mandatory reason.
  Done when: walk-in donation takes <= 4 taps; backend derives account/fund safely without DB migrations; receipt policy respects threshold; blind box verification flags mismatches; large amounts require confirmation.

- [ ] **T07B First-time setup wizard** (frontend + backend; **depends on T02**)
  Why: New mosques face an empty, confusing state with unallocated balances.
  Do:
  1. 4-step guided onboarding wizard:
     - Step 1: Mosque Basics (Name, Address, Fiscal Year Start, Timezone).
     - Step 2: Primary Accounts & Opening Balances: prompt which fund each opening balance belongs to (default General, split allowed) — enforces T02 invariant.
     - Step 3: Default Funds & Categories Seed (General, Zakat, Development, Jummah Collection, Utilities, etc.).
     - Step 4: Team Invites (Treasurer, Staff, Committee WhatsApp link).
  Done when: newly created mosque completes wizard in under 2 minutes and lands on a fully-seeded dashboard with zero unallocated balance.

- [ ] **T08 Bangla i18n, font, money display** (frontend)
  next-intl with en + bn, Bangla font via next/font, language toggle, optional Bangla numerals, dashboard totals without decimals via src/lib/money.ts. Rename labels per the terms table.

- [ ] **T10 States pass** (frontend)
  Skeleton, empty, error-with-retry on every list/page. Friendly messages in plain language.

- [ ] **T11 Mobile pass** (frontend)
  390px audit of every screen; card lists instead of tables; thumb-reachable actions.

## Track C: Safety and quality

- [ ] **T12 Protect ledger data** (backend): onDelete Cascade -> Restrict on Mosque->Donation/Expense/Transfer/Account/Fund; replace hard deletes of Membership and FamilyMember with status/archived. Show migration SQL first.
- [ ] **T13 Composite indexes** (backend): (mosqueId,status,date), (accountId,status), (fundId,status). Show migration first.
- [ ] **T14 Bound the unbounded lists** (backend): pagination on accounts, funds, categories, families, public transparency. Frontend adapts.
- [ ] **T15 Audit log completeness** (backend): log account/fund/category CRUD, role changes, mosque settings, collections, campaigns, auth events. Pass req.ip and user-agent. Never swallow audit write errors silently (log loudly).
- [ ] **T16 Auth hardening** (backend): stop accepting tokens in query strings (confirm frontend does not use them), rate-limit login/register/forgot/reset (currently only receipt verify), confirm `_dev` data is off in production.
- [ ] **T17 Tests**: backend (auth, accounts, reports, collections, memberships, chanda); frontend Vitest for money.ts and key components; one Playwright smoke test for login -> add donation.

## Track D: Value features
- [ ] **T18 Monthly report PDF** (exports API exists: check status), Bangla + English.
- [ ] **T19 Receipt share** (image/PDF, WhatsApp share link).
- [ ] **T20 Chanda tracker grid** (members x months, one-tap mark paid).
- [ ] **T21 Public transparency page polish.**
