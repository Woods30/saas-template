# SDD ledger — plan: docs/superpowers/plans/2026-11-20-shipany-base-refactor.md

Pre-flight:

- T1→T2/T3: shipany tree verified present at /tmp/shipany-base @3305a34. Clean.
- T4 consumes filterPublicConfigs(configs, keys)/getAdminConfigs()/saveConfigs() — signatures verified in shipany src/modules/config/service.ts. Clean.
- T6→T7/T8/T9: manual_payment_detail (orderId PK) consumed consistently; status set shared. Clean.
- T9: settleCheckoutOrder extraSteps param produced and consumed in same task. Clean.
- T12→T13: docs_enabled public key produced T12, consumed T13 beforeLoad. Clean.
  Ruling (T1): keep docs/superpowers/ (spec+plan) when clearing old tree — they are this refactor's record, not "old docs". Cost if wrong: stray doc dir in template (removable before release).
  Ruling (T1): rsync --delete wiped .superpowers/ and docs/superpowers/ (excludes didn't name them); restored from main worktree backup and re-ran rsync with --exclude .superpowers --exclude docs/superpowers. Cost if wrong: none (backup was current).
