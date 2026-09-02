const { test, expect } = require('@playwright/test');

// Test assumptions:
// - Frontend dev server is running at http://localhost:5174
// - We intercept /api/tanques to provide deterministic responses for the test

const BASE = 'http://localhost:5174';

test.describe('Districts flow critical path', () => {
  test('move → save → IBAL update/lose/restore preserves positions and toggles metrics', async ({ page }) => {
    // serve a healthy IBAL response first
    await page.route('**/api/tanques', async route => {
      const ok = await require('fs').promises.readFile(require('path').join(__dirname, '..', 'fixtures', 'ibal_ok.json'), 'utf8');
      route.fulfill({ status: 200, contentType: 'application/json', body: ok });
    });

    await page.goto(`${BASE}/distritos`);
    await page.waitForSelector('.react-flow__node');

    // ensure metrics are visible (percentage text)
    const nodes = await page.$$('.react-flow__node');
    expect(nodes.length).toBeGreaterThan(0);
    const percentCount = await page.$$eval('.react-flow__node', els => els.reduce((s,el)=> s + (((el.innerText||'').match(/\d+(?:\.\d+)?%/)||[]).length), 0));
    expect(percentCount).toBeGreaterThan(0);

    // read initial district_state
    const stateBefore = await page.evaluate(() => localStorage.getItem('district_state'));

    // enter edit mode if available
    const edit = await page.$('button:has-text("Editar diagrama")');
    if (edit) await edit.click();

    // move first node by dragging
    const firstNode = await page.$('.react-flow__node');
    const box = await firstNode.boundingBox();
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width/2 + 120, box.y + box.height/2 + 60, { steps: 10 });
    await page.mouse.up();

    // click Guardar
    const saveBtn = await page.$('button:has-text("Guardar")');
    expect(saveBtn).toBeTruthy();
    await saveBtn.click();

    // capture saved state
    const stateSaved = await page.evaluate(() => localStorage.getItem('district_state'));
    expect(stateSaved).toBeTruthy();

    // Now simulate IBAL failure: route to abort
    await page.unroute('**/api/tanques');
    await page.route('**/api/tanques', route => route.abort());

    // reload and expect alert and no percentage metrics
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const alertText = await page.locator('text=Conexión con IBAL no disponible').first().innerText().catch(()=>null);
    expect(alertText).toBeTruthy();
    const percentBlocked = await page.$$eval('.react-flow__node', els => els.reduce((s,el)=> s + (((el.innerText||'').match(/\d+(?:\.\d+)?%/)||[]).length), 0));
    expect(percentBlocked).toBe(0);

    // positions must remain equal
    const stateBlocked = await page.evaluate(() => localStorage.getItem('district_state'));
    expect(stateBlocked).toBe(stateSaved);

    // restore IBAL by serving healthy fixture again
    await page.unroute('**/api/tanques');
    await page.route('**/api/tanques', async route => {
      const ok = await require('fs').promises.readFile(require('path').join(__dirname, '..', 'fixtures', 'ibal_ok.json'), 'utf8');
      route.fulfill({ status: 200, contentType: 'application/json', body: ok });
    });

    await page.reload();
    await page.waitForSelector('.react-flow__node');
    const percentRestored = await page.$$eval('.react-flow__node', els => els.reduce((s,el)=> s + (((el.innerText||'').match(/\d+(?:\.\d+)?%/)||[]).length), 0));
    expect(percentRestored).toBeGreaterThan(0);

    const stateFinal = await page.evaluate(() => localStorage.getItem('district_state'));
    expect(stateFinal).toBe(stateSaved);
  }, 60_000);
});
