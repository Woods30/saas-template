# SDD ledger — plan: docs/superpowers/plans/2026-11-20-shipany-base-refactor.md

Pre-flight:

- T1→T2/T3: shipany tree verified present at /tmp/shipany-base @3305a34. Clean.
- T4 consumes filterPublicConfigs(configs, keys)/getAdminConfigs()/saveConfigs() — signatures verified in shipany src/modules/config/service.ts. Clean.
- T6→T7/T8/T9: manual_payment_detail (orderId PK) consumed consistently; status set shared. Clean.
- T9: settleCheckoutOrder extraSteps param produced and consumed in same task. Clean.
- T12→T13: docs_enabled public key produced T12, consumed T13 beforeLoad. Clean.
  Ruling (T1): keep docs/superpowers/ (spec+plan) when clearing old tree — they are this refactor's record, not "old docs". Cost if wrong: stray doc dir in template (removable before release).
  Ruling (T1): rsync --delete wiped .superpowers/ and docs/superpowers/ (excludes didn't name them); restored from main worktree backup and re-ran rsync with --exclude .superpowers --exclude docs/superpowers. Cost if wrong: none (backup was current).
  Task 1: complete (commit 3a00c80, base vendored @3305a34, pnpm db:push + rbac:init OK, GET / → 200 on :3005 — :3000 occupied by another local process)
  Task 2: complete (commit below; typecheck 0, node:test 115/115 pass, build OK)
  Task 2: Ruling: admin-client's legacy SHIPANY_* env prefixes and ~/.shipany store fallback were deleted rather than renamed — they are upstream compatibility shims with no users in this template; SITE_* naming is kept. Cost if wrong: a user migrating from an earlier clone loses auto-detected credentials (re-add project).
  Task 2: Ruling: dropped the "legacy env pair without SITE_ADMIN_CONFIG must throw" assertion in tests/admin-agent.test.ts — it existed only to police the deleted fallback path. Cost if wrong: none (covered by the SITE_* tests).
  Task 2: Ruling: deleted the SeeAPI settings-test case in tests/admin-agent.test.ts and tests/product-copy.test.ts + tests/footer-badges.test.ts wholesale — they assert deleted features. Cost if wrong: config masking coverage still holds via the surviving "configuration secrets are masked" test.
