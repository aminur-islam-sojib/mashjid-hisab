# UX principles for Mashjid Hisab

Users: mosque treasurers, staff, committee, members. Often non-technical. Mostly phones. Bangla first.
Goal: finish any daily task in under 10 seconds, and never doubt that the numbers are right.

## The 8 rules
1. **Trust first.** Every number can be explained in one click. A badge count always equals the list after clicking it. Account totals equal fund totals.
2. **One primary action per screen.** Solid button = the main thing. Everything else is outline or a menu.
3. **Plain words.** No accounting jargon (see terms table).
4. **Role-aware.** Each role sees only what it can use. Hide, don't show-then-403. Redirect before render.
5. **Prevent errors, don't just report them.** Disable on submit, Idempotency-Key, confirm destructive actions, undo toast where possible.
6. **Every list has 3 states:** skeleton, empty (with a next step button), error (with retry).
7. **Mobile first.** Thumb-reachable actions, bottom sheets for forms, card lists instead of wide tables.
8. **Bangla first.** Bangla font, Bangla numerals option, language toggle in the top bar.

## Terms table (use these words in the UI)
| Avoid | Use |
|---|---|
| Treasury balance | Total balance |
| Disbursements | Money spent |
| Dual-control approval queue | Waiting for approval |
| Master ledger | All transactions |
| Box counting session | Box count (Jummah, Eid...) |
| Physical accounts | Cash & bank |
| Accounting funds | Funds (Zakat, Sadaqah...) |
| Reconciliation | Check balance |
| Void | Cancel entry |
Add a one-line helper under Funds: "Funds say what money is for. Accounts say where it is kept."

## Navigation (target)
- Dashboard (role-aware home)
- DAILY WORK: Donations, Expenses, Transfers, Box counting
- APPROVALS (own item with live badge; admin/treasurer)
- PEOPLE: Members & Families (tabs), Chanda & Pledges (tabs: Chanda plans, Dues, Pledges), Campaigns
- RECORDS: All transactions, Reports, Audit logs (admin)
- SETUP (collapsed; admin/treasurer): Accounts, Funds, Categories, Settings
- Profile menu: My giving, language, theme, switch mosque, logout

Per role: STAFF sees Dashboard, Donations, Expenses, Box counting, My giving. MEMBER sees My giving, Pledges, Campaigns. COMMITTEE sees Dashboard, All transactions, Reports (read-only).

## Dashboard (treasurer/admin)
1. Slim one-line greeting (no big hero).
2. Action row: solid [Record donation] [Record expense]; outline [Count box] [Transfer].
3. ONE attention strip, only when something needs action. List each item with its own link:
   "2 donations + 1 expense to approve -> Approvals" and "1 box count to verify -> Box counting".
4. Three KPI cards: Total balance (with "unallocated" line only if not zero), Income this month, Spending this month, each with a vs-last-month delta. Decimals hidden on the dashboard.
5. Two columns: Recent activity (last 8) | Cash & bank / Funds tabs (both tabs total the same).
6. Hide zero-balance funds behind "Show empty funds".

## Quick-add (donation / expense)
- Bottom sheet on mobile, dialog on desktop.
- Required: amount, category (chips for the common ones), date (default today). Everything else under "More details".
- Donor autocomplete with inline "add new donor". Remember last used category/fund.
- "Save and add another". Receipt photo upload for expenses.
- Optimistic update, toast with Undo (cancel entry), submit disabled while pending.

## Review checklist (used by /ux-review)
- [ ] Does any badge/number disagree with what appears after clicking it?
- [ ] Is there one obvious primary action?
- [ ] Any jargon from the avoid column?
- [ ] Any control visible that the current role cannot use?
- [ ] Skeleton, empty, error states present?
- [ ] Works at 390px without horizontal scroll?
- [ ] Bangla text renders correctly; no hard-coded strings?
- [ ] Can a double-tap create a duplicate?

## Complexity budget (every screen must obey)
- The page header answers ONE user question, in plain words.
- 1 primary action. Max 3 headline numbers. Max 5 rows shown by default ("Show all" for the rest).
- Filters are preset chips (This month / Last month / This year), never raw date pickers by default.
- Forms: max 3 visible fields; the rest behind "More details".
- Zero jargon from the terms table. No setting, option or column that the default user doesn't need.
- Before coding any redesign, show a static mockup or screenshot and wait for approval.