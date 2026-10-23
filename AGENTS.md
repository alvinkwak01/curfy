# Agent operating rules — Curfy

Read `ENGINEERING_PLAYBOOK.md` before proposing a change. Read relevant source and `CONTEXT.md` and/or `MEMORY.md` for historical context, but **do not treat an outdated historical spec as overriding newer confirmed user decisions**. Flag contradictions. In particular, current goal is **Apple-supported OS-level selected-app shielding**, not the existing in-app soft lock; the native design is **not proven** yet.

1. No coding before stating objective, changed files, risk, tests, and rollback in short form.
2. Do not modify `main` directly, merge, auto-merge, deploy, purchase services, or initiate paid cloud builds without human authorization.
3. Never declare a feature verified unless you actually ran a relevant check or have recorded device evidence. Mark claims as PASS / FAIL / NOT RUN; quote errors, don't hide them.
4. Prefer tiny PRs, local verification, deterministic tests, and simple solutions; no speculative rewrites or agent swarms.
5. Preserve user intent: bedtime-only iOS selected-app blocking is the target; free tier intended for one app, possible premium for multiple; retain a 120-second hold escape with approximately 15-minute respite, subject to Apple-supported feasibility. Do not bypass system restrictions or promise unsupported shield interfaces, auto-opening, or unrevokable authorization.
6. Keep secrets/keys/PII out of commits, logs, AI prompts, screenshots, and public documentation.
7. Explain code behavior in plain English and teach the human one engineering concept per PR.
8. Native iOS behavior must be verified with Xcode/EAS development build and physical iPhone where needed; Expo Go/JS mocks do not prove it.
9. When product decisions change, update project truth in a dedicated reviewable commit. Avoid turning transient instructions into permanent coding rules.

The CI workflow currently checks TypeScript only; a green check is **not** a passing test suite or App Store proof.
