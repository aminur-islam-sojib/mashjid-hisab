# Mashjid Hisab Backend — API Reference

> Source: `aminur-islam-sojib/mashjid-hisab-backend`, branch `features` (read from the code: `src/routes`, `src/modules/*/*.routes.ts`, `*.validation.ts`, middlewares).
> Stack: Node.js + Express 5 + TypeScript + Prisma 7 (PostgreSQL), JWT auth, multi-tenant (one tenant = one mosque).

---

## Table of Contents

1. [Quick Start / Requirements](#1-quick-start--requirements)
2. [Global Conventions](#2-global-conventions)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [How Mosque (Tenant) Is Resolved](#4-how-mosque-tenant-is-resolved)
5. [Roles & Permission Presets](#5-roles--permission-presets)
6. [Enums](#6-enums)
7. [Endpoints](#7-endpoints)
   - 7.1 [Auth](#71-auth--apiauth) · 7.2 [Users](#72-users--apiusers) · 7.3 [Mosques](#73-mosques--apimosques) · 7.4 [Memberships](#74-members--memberships) · 7.5 [Funds](#75-funds) · 7.6 [Accounts](#76-accounts) · 7.7 [Categories](#77-categories) · 7.8 [Families](#78-families) · 7.9 [Invite Links (admin)](#79-invite-links-admin) · 7.10 [Donations](#710-donations) · 7.11 [Expenses](#711-expenses) · 7.12 [Transfers](#712-transfers) · 7.13 [Transactions](#713-transactions-unified-ledger--approvals) · 7.14 [Campaigns](#714-campaigns) · 7.15 [Pledges](#715-pledges) · 7.16 [Chanda Plans](#716-chanda-plans) · 7.17 [Dues](#717-dues) · 7.18 [Collections](#718-collections-counting-sessions) · 7.19 [Member Self-Service (`/me`)](#719-member-self-service-me) · 7.20 [Reports](#720-reports) · 7.21 [Periods](#721-accounting-periods) · 7.22 [Attachments](#722-attachments) · 7.23 [Audit Logs](#723-audit-logs) · 7.24 [Public endpoints](#724-public-endpoints-no-login)
8. [Endpoint Count Summary](#8-endpoint-count-summary)
9. [Error Codes Seen in the Code](#9-error-codes-seen-in-the-code)
10. [Notes & Caveats](#10-notes--caveats)

---

## 1. Quick Start / Requirements

### 1.1 Server requirements

| Item | Value |
|---|---|
| Runtime | Node.js (ESM, `"type": "module"`), TypeScript, run with `tsx` |
| Dev command | `npm run dev` → `tsx watch src/server.ts` |
| Test command | `npm test` |
| Database | PostgreSQL via Prisma (`@prisma/adapter-pg`), schema in `prisma/schema/*.prisma` |
| Default port | `5000` |
| Base URL | `http://localhost:5000` → all API routes are under **`/api`** |
| Health check | `GET /` → `{ "success": true, "message": "Mashjid Hisab API is running." }` |

### 1.2 Environment variables (`.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | ✅ | — | Signs access tokens |
| `JWT_REFRESH_SECRET` | ✅ | — | Signs refresh tokens |
| `NODE_ENV` | | `development` | `production` → secure cookies, `sameSite=strict`; `development` → `_dev` debug data in responses |
| `PORT` | | `5000` | HTTP port |
| `APP_URL` | | `http://localhost:5000` | Backend public URL |
| `CLIENT_URL` | | `http://localhost:3000` | **CORS origin** (single origin, credentials enabled) |
| `JWT_ACCESS_EXPIRES_IN` | | `15m` | Access token lifetime |
| `JWT_ACCESS_EXPIRES_IN_MS` | | `900000` | Access cookie max-age |
| `JWT_REFRESH_EXPIRES_IN_MS` | | `604800000` (7 d) | Refresh token / cookie lifetime |
| `BCRYPT_ROUNDS` | | `12` | Password hashing cost |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | | `""` / `587` / `""` / `""` / `no-reply@mashjid-hisab.com` | Email (verify / reset) |
| `EMAIL_VERIFY_TOKEN_TTL_MS` | | 24 h | Email verification token TTL |
| `PASSWORD_RESET_TOKEN_TTL_MS` | | 1 h | Password reset token TTL |

### 1.3 Client requirements to call the API

- Send/accept **JSON** (`Content-Type: application/json`), body limit **15 MB**. URL-encoded bodies also accepted.
- **CORS:** the browser origin must equal `CLIENT_URL`; use `credentials: "include"` (fetch) / `withCredentials: true` (axios) when relying on cookies.
- **Auth:** send the access token by header **or** cookie (see [§3](#3-authentication--authorization)).
- **Tenant:** for mosque-scoped routes, pass the mosque in the URL (`/api/mosques/:mosqueId/...`) or via `x-mosque-id` header / `mosqueId` query / body (see [§4](#4-how-mosque-tenant-is-resolved)).
- **Money** is always an **integer in minor units (poisha)** — e.g. ৳100.50 = `10050`. Send as number or numeric string. Responses serialize BigInt as **strings**.
- **Dates:** ISO-8601 strings. **Periods/months:** `YYYY-MM`.

---

## 2. Global Conventions

### 2.1 Success envelope

```json
{ "success": true, "message": "…", "data": { }, "_dev": { } }
```
`_dev` appears only when `NODE_ENV=development`.

### 2.2 Error envelope

```json
{
  "success": false,
  "error": { "code": "STRING_CODE", "message": "Human readable", "details": [ { "field": "name", "issue": "…" } ] }
}
```

| HTTP | Meaning |
|---|---|
| 400 | Bad request / malformed JSON (`INVALID_JSON_BODY`) / payload too large (`FILE_TOO_LARGE`) |
| 401 | Missing / invalid / expired token (`AUTH_UNAUTHORIZED`, `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_INVALID`) |
| 403 | Forbidden (role, inactive account, `MUST_CHANGE_PASSWORD`) |
| 404 | Not found (also used to hide mosque existence: `MOSQUE_NOT_FOUND`) |
| 409 | Conflict / duplicate (`DUPLICATE_RESOURCE`) |
| 410 | Gone |
| 422 | Validation failure — `details[]` lists **all** field problems at once |
| 429 | Rate limit (`RATE_LIMIT_EXCEEDED`) |
| 500 | `INTERNAL_SERVER_ERROR` |

### 2.3 Pagination

Offset style (`page` ≥ 1, `limit`) on most lists; **cursor style** (`cursor`, `limit`) on `/transactions`. Max `limit` is **100** where validated (collections, me, transactions, transfers). Defaults vary per module (e.g. audit logs 50, public donations feed 20, transactions 20).

---

## 3. Authentication & Authorization

### 3.1 Login flow

1. `POST /api/auth/login` → receives `accessToken` + `refreshToken` (also set as **HttpOnly cookies**).
2. Call protected endpoints with the access token.
3. When access token expires (`AUTH_TOKEN_EXPIRED`) → `POST /api/auth/refresh`.
4. `POST /api/auth/logout` to revoke.

### 3.2 Ways to send the access token (any one works)

| Where | Format |
|---|---|
| `Authorization` header | `Bearer <token>` · `JWT <token>` · `Token <token>` · raw `<token>` |
| Cookie | `accessToken` (also accepts `access_token`, `token`) |
| Custom header | `x-access-token`, `access-token`, `x-token`, `token` |
| Query string | `?token=` · `?accessToken=` · `?access_token=` |

### 3.3 Cookies set by the server

| Cookie | Path | Lifetime | Flags |
|---|---|---|---|
| `accessToken` | `/` | 15 min | HttpOnly, Secure (prod), SameSite=strict (prod) / lax (dev) |
| `refreshToken` | `/api/auth` | 7 days | same |

Refresh token can be supplied as cookie `refreshToken` / `refresh_token` **or** body field `refreshToken`.

### 3.4 Special account states

- **`mustChangePassword = true`** (admin-created accounts): only `PATCH /api/auth/change-password`, `GET /api/auth/me`, `POST /api/auth/logout` are allowed; everything else returns **403 `MUST_CHANGE_PASSWORD`**.
- **Non-ACTIVE users** (`INACTIVE`/`BLOCKED`) are rejected on mosque routes and super-admin routes.
- Membership access is **re-checked in the database on every request** (JWT `mosqueId`/`role` claims are not trusted for authorization).
- `SUPER_ADMIN` actions re-verify the role live in the DB.

### 3.5 Access legend used below

| Label | Meaning |
|---|---|
| **Public** | No token needed |
| **Auth** | Any valid token |
| **Member** | Active membership in the mosque (any role) |
| **OVERSIGHT** | `MOSQUE_ADMIN`, `TREASURER`, `COMMITTEE_MEMBER` |
| **FIN-OPS** | `MOSQUE_ADMIN`, `TREASURER` |
| **ADMIN** | `MOSQUE_ADMIN` only |
| **COLLECT-OPS** | `MOSQUE_ADMIN`, `TREASURER`, `STAFF` |
| **OPERATIONAL** | `MOSQUE_ADMIN`, `TREASURER`, `COMMITTEE_MEMBER`, `STAFF` |
| **SUPER_ADMIN** | Platform super administrator |

---

## 4. How Mosque (Tenant) Is Resolved

Every mosque-scoped route is protected by `requireMosqueMembership(...)`, which finds the mosque id in this priority order:

1. URL param `:mosqueId` (accepts the **mosque id or its slug**)
2. `?mosqueId=` query
3. `mosqueId` in JSON body
4. `x-mosque-id` header
5. Derived from the entity id in the URL (`donationId`, `expenseId`, `accountId`, `fundId`, `exportId`, `attachmentId`, or `:id`)
6. JWT claim `mosqueId`
7. The user's **only** active membership (if they have exactly one)

If none resolve → `400 INVALID_MOSQUE_ID`. If the caller has no ACTIVE membership → `404 MOSQUE_NOT_FOUND` (intentionally hides existence). Archived mosques are also 404 (except where `allowArchived`).

### 4.1 Two URL styles (dual mounting)

Most resource routers are mounted **twice**:

| Style | Example |
|---|---|
| **Nested (recommended)** | `/api/mosques/:mosqueId/donations` |
| **Flat** | `/api/donations` (mosque taken from query / body / `x-mosque-id` / token / sole membership) |

Flat mounts exist for: `memberships, accounts, donations, expenses, transfers, transactions, campaigns, pledges, chanda-plans, dues, collections, me, reports, periods, attachments, audit-logs`.
**Nested only:** `funds`, `categories`, `families`, `invite-links` (admin).

> In the tables below, paths are written in the **nested form** `/api/mosques/:mosqueId/<resource>`. Replace with the flat form where supported.

---

## 5. Roles & Permission Presets

`Role`: `SUPER_ADMIN` (platform-level, never on a membership), `MOSQUE_ADMIN`, `TREASURER`, `STAFF`, `COMMITTEE_MEMBER`, `MEMBER`.

| Preset | Roles |
|---|---|
| `OVERSIGHT_ROLES` | MOSQUE_ADMIN, TREASURER, COMMITTEE_MEMBER |
| `FINANCIAL_OPERATOR_ROLES` | MOSQUE_ADMIN, TREASURER |
| `ADMIN_ONLY_ROLES` | MOSQUE_ADMIN |
| `OPERATIONAL_ROLES` | MOSQUE_ADMIN, TREASURER, COMMITTEE_MEMBER, STAFF |
| `COLLECTION_OPERATOR_ROLES` / `EXPENSE_OPERATOR_ROLES` | MOSQUE_ADMIN, TREASURER, STAFF |

Business rules enforced in code: **STAFF entries are saved as `PENDING`** until approved; **self-approval is blocked** (`SELF_APPROVAL_NOT_ALLOWED`); **last active MOSQUE_ADMIN cannot be removed/demoted** (`LAST_ADMIN_PROTECTED`); posted financial fields are **immutable** (`TRANSACTION_IMMUTABLE`) — fix by void + re-entry.

---

## 6. Enums

| Enum | Values |
|---|---|
| `Role` | SUPER_ADMIN, MOSQUE_ADMIN, TREASURER, STAFF, COMMITTEE_MEMBER, MEMBER |
| `MembershipStatus` | PENDING, ACTIVE, SUSPENDED, REJECTED |
| `UserStatus` | ACTIVE, INACTIVE, BLOCKED |
| `FundType` | GENERAL, ZAKAT, SADAQAH, CONSTRUCTION, MADRASA, QURBANI, WAQF, IFTAR, OTHER |
| `AccountType` | CASH, BANK, MOBILE_WALLET, CARD, OTHER |
| `CategoryType` | INCOME, EXPENSE |
| `FamilyRelation` | SPOUSE, SON, DAUGHTER, FATHER, MOTHER, SIBLING, GRANDPARENT, OTHER |
| `DonationStatus` | PENDING, POSTED, REJECTED, VOIDED |
| `DonationSource` | CASH_BOX, MEMBER (default), ONLINE, BANK |
| `ExpenseStatus` | PENDING, PENDING_APPROVAL, POSTED, REJECTED, VOIDED |
| `TransferStatus` | POSTED, VOIDED |
| `CampaignStatus` | ACTIVE, CLOSED |
| `PledgeStatus` | OPEN, PARTIAL, FULFILLED, CANCELLED |
| `ChandaFrequency` | MONTHLY, YEARLY |
| `ChandaPlanStatus` | ACTIVE, PAUSED, ENDED |
| `DueStatus` | UNPAID, PARTIAL, PAID, WAIVED |
| `CollectionStatus` | OPEN, VERIFIED, REJECTED |
| `ReportType` | DASHBOARD, BALANCES, INCOME_EXPENSE, FUND_STATEMENT, ACCOUNT_STATEMENT, DONORS, FISCAL_YEAR |
| `ExportFormat` | CSV, XLSX, PDF |
| `ExportStatus` | PENDING, COMPLETED, FAILED |
| `AuditAction` | CREATE, APPROVE, VOID, WAIVE, REJECT, CLOSE_PERIOD, REOPEN_PERIOD, RECONCILE, TRANSFER |
| `AuditEntity` | DONATION, EXPENSE, TRANSFER, DUE, PERIOD, COLLECTION, ACCOUNT |

Enum inputs are case-insensitive in most validators (they are upper-cased).

---

## 7. Endpoints

Legend for the **Success** column: `200` unless stated; creates return `201`.
`req` = required, `opt` = optional.

---

### 7.1 Auth — `/api/auth`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/api/auth/register` | Public | Create User + Profile (+ optional membership). **201** |
| 2 | POST | `/api/auth/login` | Public | Credentials → token pair + cookies |
| 3 | POST | `/api/auth/refresh` | Public (valid refresh token) | New access token |
| 4 | GET | `/api/auth/me` | Auth | Current user + memberships |
| 5 | POST | `/api/auth/logout` | Auth | Revoke refresh token, clear cookies |
| 6 | POST | `/api/auth/forgot-password` | Public | Email reset token (generic response, no account enumeration) |
| 7 | POST | `/api/auth/reset-password` | Public (reset token) | Set new password; invalidates all sessions |
| 8 | POST | `/api/auth/verify-email` | Public (verify token) | Mark email verified |
| 9 | PATCH | `/api/auth/change-password` | Auth | Change password; clears `mustChangePassword`; invalidates other sessions |

**Request bodies**

| Endpoint | Fields |
|---|---|
| `register` | `name` req (2–100) · `email` req · `phone` opt (`+`?7–15 digits) · `password` req (≥8, upper+lower+digit) · `mosqueId` opt (cuid) · `locale` opt (default `bn`) |
| `login` | `identifier` req (email **or** phone) · `password` req |
| `refresh` | refresh token via cookie `refreshToken`/`refresh_token` or body `refreshToken` |
| `forgot-password` | `email` req |
| `reset-password` | `token` req · `password` (or `newPassword`) req — same password rules |
| `verify-email` | `token` req |
| `change-password` | `currentPassword` (or `oldPassword`) req · `newPassword` (or `password`) req — password rules; must differ from current |

---

### 7.2 Users — `/api/users`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | PATCH | `/api/users/me/profile` | Auth | Update own profile (not `mosqueId`/`role` → `FORBIDDEN_FIELD`) |
| 2 | PATCH | `/api/users/:userId/status` | **SUPER_ADMIN** | Set user status; sessions invalidated on block/deactivate |

| Endpoint | Body |
|---|---|
| `me/profile` (≥1 field required) | `name` (2–100) · `phone` (nullable) · `avatarUrl` (≤500, nullable) · `bio` (≤500, nullable) · `address` (≤255, nullable) · `dateOfBirth` (ISO, nullable) · `locale` |
| `:userId/status` | `status` req (`ACTIVE`/`INACTIVE`/`BLOCKED`) · `reason` opt (≤255) |

---

### 7.3 Mosques — `/api/mosques`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | GET | `/api/mosques` | Auth | List mosques the caller is an ACTIVE member of (switcher). Query: `search` |
| 2 | POST | `/api/mosques` | Auth | Create mosque + caller becomes ACTIVE `MOSQUE_ADMIN` (same transaction). **201** |
| 3 | GET | `/api/mosques/:mosqueId` | Member | Mosque settings |
| 4 | PATCH | `/api/mosques/:mosqueId` | ADMIN | Update settings |
| 5 | POST | `/api/mosques/:mosqueId/archive` | ADMIN | Soft-delete. Blocked if pending invites or non-zero account balances |

| Endpoint | Body |
|---|---|
| Create | `name` req (2–100) · `slug` opt (3–60, lowercase alnum + hyphens) · `address` opt (≤255) · `timezone` opt (IANA, e.g. `Asia/Dhaka`) · `fiscalYearStart` opt (1–12) |
| Update | `name` · `address` · `timezone` · `fiscalYearStart` (1–12) · `confirmFiscalYearChange` (`true` needed to change mid-year; alias `confirm`) · `isTransparencyPageEnabled` (alias `publicTransparency`) |

---

### 7.4 Members / Memberships

Mounted at `/api/mosques/:mosqueId/members` **and** `/api/memberships`.

| # | Method | Route (nested) | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/api/mosques/:mosqueId/members/invite` | Auth (service checks ADMIN/TREASURER) | Create invite by email/phone. **201** |
| 2 | POST | `/api/mosques/:mosqueId/members/invites/:id/accept` | Auth (must match invite contact) | Accept invite → ACTIVE membership |
| 3 | GET | `/api/mosques/:mosqueId/members` | OVERSIGHT | List members |
| 4 | POST | `/api/mosques/:mosqueId/members/direct` | FIN-OPS | Create User+Profile+ACTIVE membership; sets `mustChangePassword`. **201** |
| 5 | PATCH | `/api/mosques/:mosqueId/members/:membershipId` | ADMIN | Change role/status (`LAST_ADMIN_PROTECTED`) |
| 6 | DELETE | `/api/mosques/:mosqueId/members/me` | Member (self) | Leave mosque |
| 7 | DELETE | `/api/mosques/:mosqueId/members/:membershipId` | ADMIN | Remove member |

Flat equivalents: `POST /api/memberships/invite`, `POST /api/memberships/invites/:id/accept`, `GET /api/memberships`, etc.

| Endpoint | Fields |
|---|---|
| List (query) | `role` · `status` · `search` |
| Invite | `mosqueId` req (falls back to URL) · `email` and/or `phone` (**at least one**) · `role` (not `SUPER_ADMIN`) |
| Accept | `token` opt |
| Direct create | `name` (2–100, **required unless** `familyMemberId` given) · `email` and/or `phone` (**at least one**) · `password` opt (≥8, upper+lower+digit; auto-generated if omitted) · `role` opt (not `SUPER_ADMIN`) · `familyMemberId` opt |
| Update | `role` · `status` (`SUPER_ADMIN` rejected) |

---

### 7.5 Funds

`/api/mosques/:mosqueId/funds` (nested only)

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/funds` | ADMIN | Create fund. **201** |
| 2 | GET | `/funds` | OVERSIGHT | List (`?includeArchived=true`, `type`, `isRestricted`, `search`) |
| 3 | GET | `/funds/:fundId` | OVERSIGHT | Get one |
| 4 | PATCH | `/funds/:fundId` | ADMIN | Update; flipping `isRestricted` with existing transactions needs `confirmPolicyChange: true` |
| 5 | POST | `/funds/:fundId/archive` | ADMIN | Soft-delete; blocked if balance ≠ 0 |

Body — create: `name` req (2–100) · `type` (FundType) · `isRestricted` (bool) · `description` (≤500). Update: `name` · `description` (nullable) · `isRestricted` · `confirmPolicyChange` (aliases `confirmRestrictionChange`, `confirm`).

---

### 7.6 Accounts

`/api/mosques/:mosqueId/accounts` and `/api/accounts`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/accounts` | FIN-OPS | Create account. **201** |
| 2 | GET | `/accounts` | OVERSIGHT | List (`includeArchived`, `type`, `search`); includes `accountNumber` |
| 3 | GET | `/accounts/:accountId` | OVERSIGHT | Get one |
| 4 | PATCH | `/accounts/:accountId` | FIN-OPS | Update (openingBalance locked once transactions exist) |
| 5 | POST | `/accounts/:accountId/archive` | ADMIN | Soft-delete; blocked if balance ≠ 0 |
| 6 | POST | `/accounts/:accountId/reconciliations` | FIN-OPS | Compare system vs real balance; auto-creates adjustment (Donation for surplus / Expense for shortfall) |

Body — create: `name` req (2–100) · `type` (AccountType) · `accountNumber` (≤50, nullable) · `openingBalance` (integer poisha ≥ 0). Update: same fields, all opt. Reconciliation: `realBalance` req (poisha) · `asOf` opt · `notes` opt · `fundId` opt.

---

### 7.7 Categories

`/api/mosques/:mosqueId/categories` (nested only)

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/categories` | FIN-OPS | Create. **201** |
| 2 | GET | `/categories` | OPERATIONAL | List (`includeArchived`, `type`, `fundId`, `search`) |
| 3 | GET | `/categories/:categoryId` | OPERATIONAL | Get one |
| 4 | PATCH | `/categories/:categoryId` | FIN-OPS | Update name / fundId (no history rewrite) |
| 5 | POST | `/categories/:categoryId/archive` | ADMIN | Archive |

Body — create: `name` req (2–100) · `type` req (`INCOME`/`EXPENSE`) · `fundId` opt (restricts category to one fund). Update: `name` · `fundId` (nullable).

---

### 7.8 Families

`/api/mosques/:mosqueId/families` (nested only). Ownership/head checks happen in the service layer.

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/families` | Member | Create family; caller is head (one family per membership). **201** |
| 2 | GET | `/families` | OVERSIGHT | List all families |
| 3 | GET | `/families/:familyId` | Member (own family, or OVERSIGHT) | Detail |
| 4 | PATCH | `/families/:familyId` | Head or ADMIN | Update |
| 5 | POST | `/families/:familyId/transfer-head` | Head or ADMIN | Change head |
| 6 | POST | `/families/:familyId/members` | Head or ADMIN | Add family member (no login). **201** |
| 7 | PATCH | `/families/:familyId/members/:memberId` | Head or ADMIN | Update family member |
| 8 | DELETE | `/families/:familyId/members/:memberId` | Head or ADMIN | Remove (blocked `FAMILY_MEMBER_LINKED` if they have their own membership) |

| Endpoint | Body |
|---|---|
| Create / Update family | `name` req on create (2–100) · `address` (≤200) |
| Transfer head | `newHeadMembershipId` req · `confirm: true` req |
| Add / Update member | `name` req (2–100) · `relation` req (FamilyRelation) · `dateOfBirth` · `gender` · `phone` · `occupation` · `bloodGroup` (strings ≤100) |

---

### 7.9 Invite Links (admin)

`/api/mosques/:mosqueId/invite-links` (nested only) — all **ADMIN**.

| # | Method | Route | Purpose |
|---|---|---|---|
| 1 | POST | `/invite-links` | Generate link; raw token is returned **once** (only hash stored). **201** |
| 2 | GET | `/invite-links` | List with `useCount`, `isActive` (`role`, `includeArchived`) |
| 3 | POST | `/invite-links/:id/revoke` | Deactivate (row kept for audit) |

Body — create: `role` opt (**only `MEMBER` allowed**, default MEMBER) · `maxUses` opt (≤ 1,000,000) · `expiresAt` opt.
Public side of invite links → [§7.24](#724-public-endpoints-no-login).

---

### 7.10 Donations

`/api/mosques/:mosqueId/donations` and `/api/donations`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/donations` | COLLECT-OPS | Record income (ADMIN/TREASURER post immediately; STAFF → `PENDING`). **201** |
| 2 | GET | `/donations` | OVERSIGHT | Paginated list |
| 3 | GET | `/donations/:donationId` | Member (MEMBER: own/own family only) | Detail with receipt no., attachments, void info |
| 4 | GET | `/donations/:donationId/receipt` | Member (MEMBER: own only) | Receipt data (mosque, donor, amount, fund, receipt no., verification code) |
| 5 | PATCH | `/donations/:donationId` | FIN-OPS | Edit **non-financial** fields only |
| 6 | POST | `/donations/:donationId/void` | FIN-OPS | Void a posted donation |

**Create body**

| Field | Req | Notes |
|---|---|---|
| `amount` | ✅ | positive integer poisha |
| `accountId` | ✅ | |
| `fundId` | ✅ | |
| `categoryId` | ✅ | |
| `date` | ✅ | ISO-8601 |
| `memberId`, `familyId` | opt | link donor to member/family |
| `donorName` (≤100), `donorPhone` (≤30), `donorEmail` | opt | for non-members |
| `isAnonymousPublic` | opt | bool, default `false` |
| `campaignId`, `dueId`, `pledgeId` | opt | link to campaign / chanda due / pledge |
| `source` | opt | `CASH_BOX`/`MEMBER`/`ONLINE`/`BANK` (default `MEMBER`) |
| `notes` | opt | ≤500 |
| `attachments` | opt | array of strings (URLs / attachment ids) |
| `mosqueId` | opt | for flat route |

**List query:** `donor`, `family`, `fund`, `campaign`, `startDate`, `endDate`, `status`, `source`, `accountId`, `categoryId`, `memberId`, `familyId`, `fundId`, `search`, `page`, `limit`.
**Update body:** `notes`, `donorName`, `donorPhone`, `donorEmail`, `attachments`, `isAnonymousPublic`. Financial fields → `TRANSACTION_IMMUTABLE`.
**Void body:** `reason` req (3–500).

---

### 7.11 Expenses

`/api/mosques/:mosqueId/expenses` and `/api/expenses`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/expenses` | COLLECT-OPS (ADMIN, TREASURER, STAFF) | Record spending. STAFF → `PENDING`; over approval limit → `PENDING_APPROVAL` (needs ADMIN). **201** |
| 2 | GET | `/expenses` | OVERSIGHT | Paginated list |
| 3 | GET | `/expenses/:id` | OVERSIGHT | Detail + approval trail |
| 4 | PATCH | `/expenses/:id` | FIN-OPS | Edit **non-financial** fields only |
| 5 | POST | `/expenses/:id/void` | ADMIN | Void + reversal entry |

**Create body:** `amount` req · `accountId` req · `fundId` req · `categoryId` req · `date` req · `payee` req (2–200) · `attachments` req (**≥1** bill/receipt) · `voucherNo` opt (≤100) · `notes` opt (≤500) · `mosqueId` opt.
**List query:** `payee`, `voucherNo`, `fund`/`fundId`, `account`/`accountId`, `category`/`categoryId`, `status`, `startDate`, `endDate`, `search`, `page`, `limit`.
**Update body:** `notes`, `payee`, `attachments`. **Void body:** `reason` req (3–500).

---

### 7.12 Transfers

`/api/mosques/:mosqueId/transfers` and `/api/transfers`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/transfers` | FIN-OPS (**fund-to-fund → ADMIN + `reason`**) | Move money between accounts/funds; two linked legs atomically. **201** |
| 2 | GET | `/transfers` | OVERSIGHT | List linked pairs |
| 3 | GET | `/transfers/:id` | OVERSIGHT | Detail |
| 4 | POST | `/transfers/:id/void` | ADMIN | Reverse both legs |

**Create body:** `amount` req · `fromAccountId` req · `toAccountId` req · `fundId` / `fromFundId` req (and `toFundId` for fund-to-fund) · `date` · `reason` · `notes` (≤500). Source and destination cannot both be identical.
**List query:** `page`, `limit` (1–100), `accountId`, `fundId`, `status`, `dateFrom`, `dateTo`, `isFundTransfer` (`true`/`false`), `search`, `sortBy` (`date`/`createdAt`/`amount`), `sortOrder` (`asc`/`desc`).
**Void body:** `reason` req (≥3, ≤500).

---

### 7.13 Transactions (unified ledger & approvals)

`/api/mosques/:mosqueId/transactions` and `/api/transactions`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | GET | `/transactions` | OVERSIGHT | Master ledger (donations + expenses + transfers), cursor pagination |
| 2 | GET | `/transactions/pending` | FIN-OPS | Approval queue (STAFF entries, over-limit expenses) |
| 3 | GET | `/transactions/:id` | OVERSIGHT | Entry with history |
| 4 | POST | `/transactions/:id/approve` | FIN-OPS (over-limit expense: ADMIN) | PENDING → POSTED, assigns receipt/voucher no. `SELF_APPROVAL_NOT_ALLOWED` if approver = creator |
| 5 | POST | `/transactions/:id/reject` | FIN-OPS | Mark REJECTED (no balance effect) |

**List query:** `cursor`, `limit` (1–100), `type` (`DONATION`/`EXPENSE`/`TRANSFER`/`INCOME`), `status` (`PENDING`/`PENDING_APPROVAL`/`POSTED`/`REJECTED`/`VOIDED`), `categoryId`, `fundId`, `accountId`, `createdBy`, `search`, `startDate`, `endDate`.
**Pending query:** `limit`, `type` (`DONATION`/`EXPENSE`), `search`. **Reject body:** `reason` req (3–500).

---

### 7.14 Campaigns

`/api/mosques/:mosqueId/campaigns` and `/api/campaigns`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/campaigns` | ADMIN | Create campaign linked to a fund. **201** |
| 2 | GET | `/campaigns` | Member (non-oversight sees public only) | List |
| 3 | GET | `/campaigns/:campaignId/donors` | OVERSIGHT | Donor totals (anonymous hidden from COMMITTEE_MEMBER) |
| 4 | POST | `/campaigns/:campaignId/close` | ADMIN | Close (`CAMPAIGN_ALREADY_CLOSED` if repeated) |
| 5 | PATCH | `/campaigns/:campaignId` | ADMIN | Update (`CAMPAIGN_FUND_LOCKED`, closed = read-only) |
| 6 | GET | `/campaigns/:campaignId` | Member (non-public → 404 for non-oversight) | Detail + live progress |

**Create body:** `fundId` req · `title` req (≤200) · `startDate` req · `description` · `targetAmount` (poisha) · `endDate` · `isPublic` (bool) · `mosqueId`.
**Update body:** `title`, `description`, `targetAmount`, `startDate`, `endDate`, `isPublic`, `fundId`. **Close body:** `reason` opt (≤500).
**List query:** `status`, `fundId`, `isPublic` (oversight only), `search`, `page`, `limit`.

---

### 7.15 Pledges

`/api/mosques/:mosqueId/pledges` and `/api/pledges` (no ledger entry is created by a pledge)

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/pledges` | Member (self/own family); ADMIN/TREASURER for anyone | Record a promise. **201** |
| 2 | GET | `/pledges` | OVERSIGHT | List with paid/remaining |
| 3 | POST | `/pledges/:id/cancel` | Pledger or ADMIN | Cancel open balance |
| 4 | GET | `/pledges/:id` | OVERSIGHT; MEMBER own/own family | Detail with paying donations |

**Create body:** `amount` req · `dueDate` req · **`fundId` or `campaignId` (at least one)** · `installments` (1–360) · `memberId` · `familyId` · `donorName` (≤100) · `donorPhone` (≤30) · `donorEmail` · `notes` (≤500) · `mosqueId`.
**List query:** `status`, `fundId`, `campaignId`, `memberId`, `familyId`, `donor`, `search`, `dueDateFrom`, `dueDateTo`, `page`, `limit`. **Cancel body:** `reason` opt.

---

### 7.16 Chanda Plans

`/api/mosques/:mosqueId/chanda-plans` and `/api/chanda-plans`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/chanda-plans` | FIN-OPS | Create recurring plan (one active plan per payer per fund). **201** |
| 2 | GET | `/chanda-plans` | OVERSIGHT | List |
| 3 | GET | `/chanda-plans/:id` | OVERSIGHT | Detail |
| 4 | PATCH | `/chanda-plans/:id` | FIN-OPS | Change amount (applies from next period) |
| 5 | POST | `/chanda-plans/:id/pause` | FIN-OPS | Skip dues generation |
| 6 | POST | `/chanda-plans/:id/resume` | FIN-OPS | Resume |
| 7 | POST | `/chanda-plans/:id/end` | FIN-OPS | End (unpaid dues stay collectable) |

**Create body:** `amount` req · `fundId` req · `frequency` req (`MONTHLY`/`YEARLY`) · `startMonth` req (`YYYY-MM`) · `familyId` **or** `memberId` (payer) · `mosqueId`.
**Update body:** `amount` req. **List query:** `familyId`, `memberId`, `fundId`, `status`, `frequency`, `page`, `limit`.

---

### 7.17 Dues

`/api/mosques/:mosqueId/dues` and `/api/dues`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/dues/generate` | FIN-OPS | Generate dues for a month (idempotent per plan+period) |
| 2 | GET | `/dues/summary` | OVERSIGHT | Collection rate, outstanding, defaulters |
| 3 | GET | `/dues` | OVERSIGHT | List |
| 4 | GET | `/dues/:id` | OVERSIGHT | Detail with payments |
| 5 | POST | `/dues/:id/payments` | COLLECT-OPS (STAFF → PENDING) | Record payment, creates linked donation. Partial OK, overpayment rejected. **201** |
| 6 | POST | `/dues/:id/waive` | ADMIN | Waive (audited) |

| Endpoint | Fields |
|---|---|
| Generate | `period` req (`YYYY-MM`) · `mosqueId` |
| Summary (query) | `period` req (`YYYY-MM`) · `fundId` |
| List (query) | `period`, `status` (UNPAID/PARTIAL/PAID/WAIVED), `familyId`, `memberId`, `fundId`, `planId`, `page`, `limit` |
| Payment | `amount` req · `accountId` req · `categoryId` req · `date` · `source` · `notes` (≤500) · `attachments` · `mosqueId` |
| Waive | `reason` req |

---

### 7.18 Collections (counting sessions)

`/api/mosques/:mosqueId/collections` and `/api/collections`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/collections` | COLLECT-OPS | Start counting session (status OPEN). **201** |
| 2 | POST | `/collections/:id/verify` | FIN-OPS (a second person, not the counter) | Confirm count → posts one anonymous income entry |
| 3 | GET | `/collections` | OVERSIGHT | History |
| 4 | GET | `/collections/:id` | OVERSIGHT | Detail |

**Create body:** `occasion` req (2–100, e.g. `JUMMAH`, `EID`, `TARAWEEH`) · `date` req · `totalAmount` req (poisha) · `notes` (≤1000) · `fundId` · `accountId` · `categoryId` · `mosqueId`.
**Verify body:** `fundId`, `accountId`, `categoryId`, `notes` (validator treats as optional; the posting needs a destination fund/account/category, which may come from the session).
**List query:** `status`, `occasion`, `fundId`, `accountId`, `dateFrom`, `dateTo`, `page`, `limit` (1–100).

---

### 7.19 Member Self-Service (`/me`)

`/api/mosques/:mosqueId/me/...` and `/api/me/...` — all **Member** (any ACTIVE role).

| # | Method | Route | Query | Purpose |
|---|---|---|---|---|
| 1 | GET | `/me/donations` | `scope` (`self`/`family`, default self), `page`, `limit`, `year`, `fundId` | My donations (`family` for heads) |
| 2 | GET | `/me/dues` | `scope` (`self`/`family`/`all`), `status`, `period`, `page`, `limit` | My dues |
| 3 | GET | `/me/pledges` | `scope`, `status`, `page`, `limit` | My pledges |
| 4 | GET | `/me/statement` | `year` (4-digit, default current), `scope` | Annual giving statement per fund |

---

### 7.20 Reports

`/api/mosques/:mosqueId/reports` and `/api/reports`

| # | Method | Route | Access | Query / Body |
|---|---|---|---|---|
| 1 | GET | `/reports/dashboard` | OVERSIGHT | — |
| 2 | GET | `/reports/balances` | OVERSIGHT | `asOf` |
| 3 | GET | `/reports/income-expense` | OVERSIGHT | `startDate`, `endDate`, `groupBy` (`fund`/`category`/`month`, default `month`), `fundId` |
| 4 | GET | `/reports/funds/:fundId/statement` | OVERSIGHT | `startDate`, `endDate` |
| 5 | GET | `/reports/accounts/:accountId/statement` | FIN-OPS | `startDate`, `endDate`, `page`, `limit` |
| 6 | GET | `/reports/donors` | FIN-OPS | `startDate`, `endDate`, `groupBy` (`member`/`family`), `status` (`top`/`lapsed`/`all`), `limit` |
| 7 | GET | `/reports/fiscal-year/:year` | OVERSIGHT | `:year` 2000–2100 |
| 8 | POST | `/reports/exports` | FIN-OPS | Body: `reportType` req · `format` req (CSV/XLSX/PDF) · `parameters` opt (object). **201** |
| 9 | GET | `/reports/exports/:exportId` | Member (requester, or ADMIN/TREASURER) | Export job status / result |

---

### 7.21 Accounting Periods

`/api/mosques/:mosqueId/periods` and `/api/periods` — **ADMIN**. `:period` format `YYYY-MM`.

| # | Method | Route | Body |
|---|---|---|---|
| 1 | POST | `/periods/:period/close` | — (locks the month) |
| 2 | POST | `/periods/:period/reopen` | `reason` req |

---

### 7.22 Attachments

`/api/mosques/:mosqueId/attachments` and `/api/attachments`

| # | Method | Route | Access | Purpose |
|---|---|---|---|---|
| 1 | POST | `/attachments` | COLLECT-OPS | Upload bill/receipt. **201** — returns an attachment `id` to reference on transactions |
| 2 | GET | `/attachments/:id` | OVERSIGHT | Returns metadata + short-lived signed URL (`?download=true` streams the file directly) |
| 3 | GET | `/attachments/:id/view?token=…&expires=…` | **Signed URL only** (no login) | Streams file inline (HMAC-validated) |

Upload accepts either:
- `multipart/form-data` with file field **`file`**, or
- JSON `{ "fileName": "bill.png", "mimeType": "image/png", "contentBase64": "<base64>" }`

Limits: **5 MB**; types `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Files are never public.

---

### 7.23 Audit Logs

| # | Method | Route | Access |
|---|---|---|---|
| 1 | GET | `/api/mosques/:mosqueId/audit-logs` (or `/api/audit-logs`) | **ADMIN** |

Query: `actor`, `entity` (AuditEntity), `action` (AuditAction), `date`, `dateFrom`, `dateTo`, `page` (default 1), `limit` (default 50).

---

### 7.24 Public endpoints (no login)

Prefix `/api/public`. Transparency routes return data only if the mosque enabled `isTransparencyPageEnabled`.

| # | Method | Route | Notes |
|---|---|---|---|
| 1 | GET | `/api/public/mosques/:slug` | Minimal public mosque profile (no internal ids/account numbers/members) |
| 2 | GET | `/api/public/mosques/:slug/summary` | Fiscal-year-to-date totals per fund |
| 3 | GET | `/api/public/mosques/:slug/donations` | Newest-first donations feed; `page` (default 1), `limit` (default 20); anonymous donors masked; voids/reversals excluded |
| 4 | GET | `/api/public/mosques/:slug/expenses/summary` | Expense totals by category (current fiscal year) |
| 5 | GET | `/api/public/mosques/:slug/campaigns` | Active + recently completed (≤30 days) campaigns |
| 6 | GET | `/api/public/mosques/:slug/campaigns/:campaignId` | One campaign's progress |
| 7 | GET | `/api/public/mosques/:slug/transparency?month=YYYY-MM` | Monthly income/expense by fund & category (default: current month) |
| 8 | GET | `/api/public/invite-links/:token` | Validate invite token; returns mosque name. Generic 404 for invalid/expired/exhausted/revoked |
| 9 | POST | `/api/public/invite-links/:token/join` | Join via link (token optional-auth). Body: `name` (2–100) · `email` and/or `phone` (**at least one**) · `password` (≥8, upper+lower+digit) · `locale`. Existing user → membership created/reactivated; new → User+Profile+Membership |
| 10 | GET | `/api/public/receipts/:verificationCode` | Verify donation receipt authenticity. **Rate limit: 30 req/min per IP** (headers `X-RateLimit-*`, `Retry-After`) |

---

## 8. Endpoint Count Summary

| Module | Count | | Module | Count |
|---|---|---|---|---|
| Auth | 9 | | Pledges | 4 |
| Users | 2 | | Chanda plans | 7 |
| Mosques | 5 | | Dues | 6 |
| Members | 7 | | Collections | 4 |
| Funds | 5 | | Me | 4 |
| Accounts | 6 | | Reports | 9 |
| Categories | 5 | | Periods | 2 |
| Families | 8 | | Attachments | 3 |
| Invite links (admin) | 3 | | Audit logs | 1 |
| Donations | 6 | | Public | 10 |
| Expenses | 5 | | Health (`GET /`) | 1 |
| Transfers | 4 | | | |
| Transactions | 5 | | **Total unique handlers** | **≈ 147** |
| Campaigns | 6 | | | |

(Flat `/api/<resource>` aliases are counted once; they would roughly double the raw URL count.)

---

## 9. Error Codes Seen in the Code

`AUTH_UNAUTHORIZED` · `AUTH_TOKEN_EXPIRED` · `AUTH_TOKEN_INVALID` · `AUTH_USER_NOT_FOUND` · `MUST_CHANGE_PASSWORD` · `ACCOUNT_INACTIVE` · `FORBIDDEN` · `FORBIDDEN_ROLE` · `FORBIDDEN_SUPER_ADMIN_REQUIRED` · `FORBIDDEN_FIELD` · `INVALID_MOSQUE_ID` · `MOSQUE_NOT_FOUND` · `LAST_ADMIN_PROTECTED` · `TRANSACTION_IMMUTABLE` · `SELF_APPROVAL_NOT_ALLOWED` · `CAMPAIGN_ALREADY_CLOSED` · `CAMPAIGN_FUND_LOCKED` · `FAMILY_MEMBER_LINKED` · `DUPLICATE_RESOURCE` · `RATE_LIMIT_EXCEEDED` · `INVALID_JSON_BODY` · `FILE_TOO_LARGE` · `INVALID_FILE_TYPE` · `EMPTY_FILE` · `INVALID_BASE64` · `NO_FILE_PROVIDED` · `INVALID_ATTACHMENT_ID` · `INVALID_SLUG` / `INVALID_MOSQUE_SLUG` · `INVALID_GROUP_BY` · `INVALID_YEAR` · `INTERNAL_SERVER_ERROR`

---

## 10. Notes & Caveats

- **Generated from source code, not from a running server.** Routes, roles, field names, and constraints come directly from the router and validator files. I did not execute the API, so exact response bodies (`data` shapes) are not documented here.
- **Required vs optional:** where the TypeScript input interface and the validator disagree (e.g. `fundId`/`type`/`isRestricted` on fund creation, `openingBalance`, `isPublic`), the validator behavior is shown; the service layer may apply defaults or add further business-rule checks that return `400/409/422`.
- **Service-layer checks** (not visible in the route files) apply to: membership invites (ADMIN/TREASURER), family ownership, member-own-donation visibility, expense approval limits, collection verify (counter ≠ verifier).
- **Route order matters** in the code (e.g. `/dues/summary` before `/dues/:id`, `/transactions/pending` before `/transactions/:id`, `/members/me` before `/members/:membershipId`).
- Rate limiting is **in-memory** and applied only to receipt verification.
- `GET /api/mosques/:mosqueId/campaigns/:campaignId/donors` and a few others rely on role-based masking of anonymous donors.
