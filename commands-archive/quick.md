# /quick — fast, low-ceremony change

Make the requested change with minimal ceremony.

For this invocation:

- TDD is NOT required. Do not write new tests unless the request or a referenced spec explicitly asks for them, just update the existing ones, if necessary.
- Do NOT run the full test suite, evals, `ng build`, or any repo-wide verification.
- Verification budget: at most ONE targeted check — the single test file or command that directly exercises the changed code (backend mocha: `timeout 120 npx mocha --exit --timeout 0 <file>`), or a quick syntax/type check (`node --check`, scoped `tsc --noEmit`) if no such file exists. If it passes, stop.
- No commits.
- Scope guard: if the change turns out to touch more than ~3 files or alter shared behavior, stop and say so instead of silently expanding scope.

Report what changed and the one check you ran (or that none was needed).
