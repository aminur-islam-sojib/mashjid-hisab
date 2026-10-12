# Audit Report: Mathematical Discrepancy Investigation
**File:** `docs/AUDIT-numbers.md`  
**Date:** October 11, 2026  
**Status:** READ-ONLY INVESTIGATION (No code or database fixes applied)

---

## 1. Executive Summary

A discrepancy was identified between two core views for mosque **Baytul Nur Jame Mosque** (`slug: baitul-noor`, `id: cmuz6tvbd0005cskv0q3ct4s9`):
1. **Reports Page (`GET /reports/income-expense`):**
   - Income: **৳9,110.00**
   - Expenses: **৳4,323.00**
   - Net Surplus: **৳4,787.00** (for period `2026-01-01` to today)
2. **Dashboard (`GET /reports/dashboard`):**
   - Total Balance observed: **৳843.00** (current database value: **৳4,843.00**).

This investigation traced every ledger row, account, fund, transaction, and endpoint formula in the database. The findings explain the numbers to the exact poisha:

1. **The ৳843 vs ৳4,843 gap:**
   - Prior to a new donation of **৳4,000.00** recorded at 14:45 UTC on October 11, 2026 (`cmv3xq8kh0004pluc96hizr9l`), the cumulative account balance was exactly **৳843.00** (`500.00 opening + 5,110.00 donations - 4,767.00 expenses`).
   - With the ৳4,000.00 donation added, the Dashboard Total Balance is now **৳4,843.00**.

2. **The ৳4,787 (Report Surplus) vs ৳4,843 (Dashboard Total Balance) gap:**
   - **Opening Balance (+৳500.00):** Dashboard Total Balance is an asset balance sheet metric that includes the opening balance (**৳500.00** on `Islami Bank Main Account`). The Income & Expense report measures period flow and naturally excludes opening balances.
   - **Asymmetric Voided Expense Reversal (-৳444.00 skew):** In `getIncomeExpenseReport`, only expenses with `status: POSTED` are queried. When an expense of ৳444.00 was voided, its original record was marked `VOIDED` (+৳444.00) and an immutable reversal record was created with `status: POSTED` and a negative amount (`-৳444.00`).
     - Because `getIncomeExpenseReport` ignored the `VOIDED` record (+৳444.00) but counted the `POSTED` negative reversal (-৳444.00), total expenses were understated by ৳444.00 (**৳4,323.00** reported instead of actual **৳4,767.00**).
     - Consequently, Net Surplus was overstated by ৳444.00 (**৳4,787.00** instead of true **৳4,343.00**).

3. **Exact Mathematical Reconciliation:**
   $$\text{Dashboard Total Balance } (৳4,843.00) - \text{Reports Net Surplus } (৳4,787.00) = ৳56.00$$
   $$\text{Opening Balance } (৳500.00) - \text{Voided Reversal Skew } (৳444.00) = ৳56.00$$

---

## 2. Ledger Inventory (Baytul Nur Jame Mosque)

### A. Accounts & Funds
* **Accounts:**
  * `Islami Bank Main Account` (`cmuzwpl340002tbuc4um8fv5u`): Type `CASH`, Opening Balance: **50,000 poisha (৳500.00)**, `isArchived: false`.
  * Archived Accounts: **0**.
* **Funds:**
  * `Islami Bank` (`cmuzwuvdg0003tbucq1rk9h65`): Type `SADAQAH`, Opening Balance: **50,000 poisha (৳500.00)**, `isArchived: false`.
  * `Construction` (`cmuzwy1s20005tbucx8bupgj2`): Type `CONSTRUCTION`, Opening Balance: **0 poisha (৳0.00)**, `isArchived: false`.
  * `Zakat` (`cmuzww9ry0004tbucih3ophzp`): Type `ZAKAT`, Opening Balance: **0 poisha (৳0.00)**, `isRestricted: true`, `isArchived: false`.
* **Transfers:**
  * **0** transfer records exist in the database.

### B. Donations (All 3 are POSTED)
| ID | Amount (poisha) | Amount (BDT) | Date | Created At | Status | Fund | Account | Category |
|---|---|---|---|---|---|---|---|---|
| `cmuzzhcj20006xcucpd8oc31b` | 444,400 | ৳4,444.00 | 2026-10-08 | 2026-10-08 20:23 UTC | `POSTED` | Construction | Islami Bank Main | General |
| `cmuzzvkdq000dxcuc5ci6crwp` | 66,600 | ৳666.00 | 2026-10-08 | 2026-10-08 20:34 UTC | `POSTED` | Construction | Islami Bank Main | General |
| `cmv3xq8kh0004pluc96hizr9l` | 400,000 | ৳4,000.00 | 2026-10-09 | 2026-10-11 14:45 UTC | `POSTED` | Construction | Islami Bank Main | General |
| **Total Donations** | **911,000** | **৳9,110.00** | | | | | | |

* **Donations prior to Oct 11 14:45 UTC:** `444,400 + 66,600 = 511,000` (**৳5,110.00**).
* **Pending Donations:** **0**.
* **Cancelled / Voided Donations:** **0**.

### C. Expenses
| ID | Amount (poisha) | Amount (BDT) | Date | Status | `reversalOfId` | Reversal Entry? | Notes |
|---|---|---|---|---|---|---|---|
| `cmuzzi2rq0009xcuc2gka9auw` | 44,400 | ৳444.00 | 2026-10-08 | `VOIDED` | `null` | Yes (`cmv10o9fs...`) | Original expense |
| `cmv10o9fs0001lduc4t9bbuqz` | -44,400 | -৳444.00 | 2026-10-09 | `POSTED` | `cmuzzi2rq...` | No | Reversal of voided expense |
| `cmv10w99q0007lduckom3bjev` | 476,700 | ৳4,767.00 | 2026-10-09 | `POSTED` | `null` | No | Construction disbursement |
| **Sum of POSTED** | **432,300** | **৳4,323.00** | | | | | Net of `476,700 + (-44,400)` |
| **Net Actual Outflow** | **476,700** | **৳4,767.00** | | | | | `44,400` voided + reversed nets to 0 |

---

## 3. Endpoint Logic Comparison

### A. Dashboard Total Balance (`getDashboardReport` & `getBalancesReport`)
In `report.service.ts`:
```typescript
const balance =
  acc.openingBalance +
  (donations._sum.amount ?? 0n) -
  (expenses._sum.amount ?? 0n) +
  (transferIn._sum.amount ?? 0n) -
  (transferOut._sum.amount ?? 0n);
```
Where `expenses._sum.amount` uses:
```typescript
prisma.expense.aggregate({
  where: {
    accountId: acc.id,
    OR: [
      { status: ExpenseStatus.POSTED },
      { status: ExpenseStatus.VOIDED, reversalEntry: { isNot: null } },
    ],
  },
  _sum: { amount: true },
});
```
* **What matches the expense query:**
  * Original voided: `+44,400` (matches `VOIDED` with `reversalEntry != null`)
  * Reversal entry: `-44,400` (matches `POSTED`)
  * New expense: `+476,700` (matches `POSTED`)
  * Sum: `44,400 - 44,400 + 476,700 = 476,700 poisha` (**৳4,767.00**).
* **Balance Before Oct 11 14:45 UTC:**
  $$\text{Balance} = 50,000 \text{ (opening)} + 511,000 \text{ (donations)} - 476,700 \text{ (expenses)} = 84,300 \text{ poisha} = \mathbf{৳843.00}$$
* **Balance After Oct 11 14:45 UTC:**
  $$\text{Balance} = 50,000 + 911,000 - 476,700 = 484,300 \text{ poisha} = \mathbf{৳4,843.00}$$

### B. Income & Expense Report (`getIncomeExpenseReport`)
In `report.service.ts`:
```typescript
const expenseWhere: any = {
  mosqueId,
  status: ExpenseStatus.POSTED,
  date: { gte: startDate, lte: endDate },
};
```
* **What matches this query:**
  * Only `status: POSTED` rows are fetched.
  * Reversal entry: `-44,400` (`status: POSTED`)
  * New expense: `+476,700` (`status: POSTED`)
  * The original voided expense (`cmuzzi2rq...`, `+44,400`) is **omitted** because its status is `VOIDED`.
* **Total Expenses Computed:**
  $$\text{Total Expense} = 476,700 + (-44,400) = 432,300 \text{ poisha} = \mathbf{৳4,323.00}$$
* **Net Surplus Computed:**
  $$\text{Net Surplus} = 911,000 - 432,300 = 478,700 \text{ poisha} = \mathbf{৳4,787.00}$$

---

## 4. Root Causes Identified

1. **Dashboard ৳843 Point-in-Time:**
   The user observed the dashboard when donations totaled ৳5,110.00:
   $$500.00 \text{ (opening)} + 5,110.00 \text{ (income)} - 4,767.00 \text{ (expenses)} = \mathbf{৳843.00}$$
   When the ৳4,000.00 donation was added later, the dashboard balance updated to **৳4,843.00**.

2. **Opening Balance Treatment:**
   The dashboard displays cumulative cash in bank (**৳4,843.00**), which includes the **৳500.00** opening balance. The Income & Expense report tracks operational performance over a specific period and therefore starts from ৳0.

3. **Asymmetric Reversal Accounting Bug in `getIncomeExpenseReport`:**
   Because `getIncomeExpenseReport` aggregates only `status: POSTED` records:
   - Negative reversal entries (`-৳444.00`) are treated as expense deductions.
   - The original positive entry (`+৳444.00`) is omitted because it is `VOIDED`.
   - Result: Expenses are underreported by **৳444.00**, and Net Surplus is overreported by **৳444.00**.
   - True actual operational Net Surplus is:
     $$৳9,110.00 - ৳4,767.00 = \mathbf{৳4,343.00}$$
   - Adding opening balance:
     $$৳4,343.00 \text{ (real surplus)} + ৳500.00 \text{ (opening balance)} = \mathbf{৳4,843.00} \text{ (Dashboard Balance)}$$

---

## 5. Summary Table

| Metric | Reports Page (`income-expense`) | Dashboard (`reports/dashboard`) | Root Cause of Gap |
|---|---|---|---|
| **Income** | ৳9,110.00 | ৳9,110.00 (month) | Identical (3 POSTED donations) |
| **Expenses** | ৳4,323.00 | ৳4,323.00 (month KPI) / ৳4,767.00 (deducted in account balance) | `getIncomeExpenseReport` counted negative reversal (-৳444) without voided original (+৳444) |
| **Opening Balance** | Not included (৳0) | ৳500.00 (Islami Bank Main Account) | Balance Sheet vs Income Statement |
| **Total Balance / Surplus** | **৳4,787.00** (Surplus) | **৳4,843.00** (Current) / **৳843.00** (before ৳4,000 donation) | `৳4,843 - ৳4,787 = ৳56 = ৳500 (opening) - ৳444 (skew)`. Prior to ৳4,000 donation: `৳4,843 - ৳4,000 = ৳843`. |

---
*(End of Read-Only Audit)*

