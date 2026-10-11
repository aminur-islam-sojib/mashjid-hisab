# Decisions log (one line each: date - decision - why)
2026-10-11 - T01: Approvals queue count excludes open collection sessions (returned separately as countingSessionsToVerify) with shared where-clauses - Ensures dashboard badge count equals exact queue rows.
2026-10-11 - T02: Added Fund.openingBalance, enforced atomic fund opening credit when accounts are created, and added allocate-unallocated endpoint - Enforces accounting invariant sum(accounts) == sum(funds) and resolved historical ৳500 unallocated balance.
