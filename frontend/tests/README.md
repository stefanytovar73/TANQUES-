Reproducing Districts critical flow tests

Prerequisites
- Node.js and npm installed
- From project root: run backend (`php artisan serve`) if you want the real backend available. The tests intercept /api/tanques by default and do not require the backend to be running.

Install Playwright (locally in frontend):

```bash
cd frontend
npm install -D @playwright/test
npx playwright install chromium
```

Run the test

```bash
cd frontend
npx playwright test tests/e2e/districts.spec.js --headed
```

What the test does
- Loads `/distritos` and serves a deterministic IBAL payload from `tests/fixtures/ibal_ok.json`.
- Verifies percentages are visible.
- Drags the first node and clicks `Guardar`.
- Simulates IBAL failure by aborting `/api/tanques`, reloads and verifies:
  - visible alert with message about IBAL connection
  - dynamic metrics are not shown
  - `district_state` (positions) remained unchanged
- Restores IBAL response and reloads; verifies metrics return and positions remain intact.

Notes
- The test intercepts network calls and is deterministic.
- Do not run while other tools are also intercepting network for the same origin.
- If you prefer to test against the real backend, remove or adjust the route interception in the test.

No commits or pushes are performed by this test.
