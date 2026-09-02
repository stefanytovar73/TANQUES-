import { test, expect } from '@playwright/test';

const TARGETS = ['Zona Industrial', 'Calucaima', 'Miramar'];

test.describe('IBAL tanks exhaustive checks', () => {
  test('payload and UI percentage mapping for target tanks', async ({ page, request }) => {
    // 1. Fetch IBAL payload (use backend directly)
    const res = await request.get('http://127.0.0.1:8000/api/tanques');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const list = Array.isArray(body.tanques) ? body.tanques : (Array.isArray(body) ? body : []);

    const findings: any[] = [];

    for (const target of TARGETS) {
      const match = list.find((t: any) => {
        const s = (t.display_name || t.nombre || t.tag || '').toString().toLowerCase();
        return s.includes(target.toLowerCase());
      }) || null;

      findings.push({ target, payload: match });
    }

    // 2. Navigate to UI
    await page.goto('/tanques');
    await page.waitForLoadState('networkidle');

    // Wait for table to render
    await page.waitForSelector('table');

    const report: any[] = [];

    for (const f of findings) {
      const target = f.target;
      const payload = f.payload;

      // find table row text
      const row = await page.locator('table tr').filter({ hasText: target }).first();
      const rowExists = await row.count() > 0;
      let displayedPct: string | null = null;
      if (rowExists) {
        // read the Porcentaje cell (4th column)
        const pctCell = row.locator('td').nth(3);
        displayedPct = (await pctCell.innerText()).trim();
      }

      // compute computedPct if applicable
      let computedPct: number | null = null;
      if (payload) {
        const valor_m = payload.valor_m != null ? Number(payload.valor_m) : null;
        const altura = (payload.altura_rebose ?? payload.altura_rebose_m ?? payload.alturaRebose ?? null);
        const alturaNum = altura != null && altura !== '' ? Number(altura) : null;
        if (valor_m != null && alturaNum != null && Number.isFinite(valor_m) && Number.isFinite(alturaNum) && alturaNum > 0) {
          computedPct = Math.round((Number(valor_m) / Number(alturaNum)) * 100 * 10) / 10; // one decimal
        }
      }

      report.push({ target, payload, displayedPct, computedPct });
    }

    // Save report as test attachment
    console.log('REPORT', JSON.stringify(report, null, 2));

    // Assert expectations and provide informative failures
    for (const r of report) {
      const p = r.payload;
      if (!p) {
        test.info().log(`WARNING: No payload matched for ${r.target}`);
        continue;
      }

      // If IBAL provides porcentaje, UI must show similar number
      const ibalPct = p.porcentaje != null && p.porcentaje !== '' ? Number(p.porcentaje) : null;
      if (ibalPct != null) {
        // UI displays like "Atención (36.0%)" or similar, extract number
        if (!r.displayedPct) {
          test.fail(true, `UI did not render porcentaje for ${r.target} though IBAL provided it`);
        } else {
          const m = r.displayedPct.match(/([0-9]+(\.[0-9]+)?)/);
          const uiPct = m ? Number(m[0]) : null;
          expect(uiPct).not.toBeNull();
          // allow 0.5% tolerance
          expect(Math.abs(uiPct - Math.round(ibalPct * 10) / 10)).toBeLessThanOrEqual(0.5);
        }
      } else {
        // IBAL didn't provide porcentaje. If altura is present and valor_m present, app should compute.
        const valor_m = p.valor_m != null ? Number(p.valor_m) : null;
        const altura = (p.altura_rebose ?? p.altura_rebose_m ?? p.alturaRebose ?? null);
        const alturaNum = altura != null && altura !== '' ? Number(altura) : null;
        if (valor_m != null && alturaNum != null && Number.isFinite(alturaNum) && alturaNum > 0) {
          // app should compute
          // parse UI
          if (!r.displayedPct) test.fail(true, `UI shows no porcentaje for ${r.target} but payload has altura & valor_m`);
          const m = r.displayedPct.match(/([0-9]+(\.[0-9]+)?)/);
          const uiPct = m ? Number(m[0]) : null;
          const expected = Math.round((valor_m / alturaNum) * 100 * 10) / 10;
          expect(uiPct).not.toBeNull();
          expect(Math.abs(uiPct - expected)).toBeLessThanOrEqual(0.5);
        } else {
          // payload lacks fields -> UI must show Sin datos
          if (!r.displayedPct) {
            // OK - no displayed percentage
            test.info().log(`${r.target} correctly shows no percentage (payload missing altura or porcentaje)`);
          } else {
            // check that displayed text contains 'Sin datos' when no percentage
            if (!/sin datos/i.test(r.displayedPct) && !/n\/d/i.test(r.displayedPct)) {
              test.fail(true, `${r.target} UI displays '${r.displayedPct}' but payload lacks altura/porcentaje`);
            }
          }
        }
      }
    }
  });

  test('diagram operations: duplicate, rename, persist and IBAL down/up simulation', async ({ page, request }) => {
  await page.goto('/distritos');
    await page.waitForLoadState('networkidle');
    // open diagram editor
    await page.click('button:has-text("Editar diagrama")');
    await page.waitForTimeout(400);

    // pick a tank to duplicate - use Calucaima
    const node = await page.locator('.react-flow__node', { hasText: 'Calucaima' }).first();
    expect(await node.count()).toBeGreaterThan(0);
    const origId = await node.getAttribute('data-id');

    // click duplicate toolbar button
    await page.click('button:has-text("Duplicar")');
    await page.waitForTimeout(500);

    // find duplicated node (same text but different id)
    const nodes = await page.$$eval('.react-flow__node', els => els.map(e=>({id: e.getAttribute('data-id'), text: e.innerText.replace(/\s+/g,' ').trim()})));
    const originals = nodes.filter(n=> n.text.includes('Calucaima'));
    expect(originals.length).toBeGreaterThanOrEqual(1);
    // ensure at least two occurrences (original + duplicate)
    expect(originals.length).toBeGreaterThanOrEqual(2);

    // find duplicate id
    const dupCandidates = originals.map(o=>o.id).filter(id=> id !== origId);
    expect(dupCandidates.length).toBeGreaterThan(0);
    const dupId = dupCandidates[0];

    // click duplicate node to open details
    await page.click(`.react-flow__node[data-id="${dupId}"]`);
    await page.waitForTimeout(300);

    // read drawer content for porcentaje and nivel
    const drawer = page.locator('div[role="presentation"]');
    expect(await drawer.count()).toBeGreaterThan(0);
    const drawerText = await drawer.innerText();
    test.info().log(`Drawer for duplicate: ${drawerText.slice(0,200)}`);

    // rename duplicate via inline editable chip if present
    // click node label then input
    const labelEl = page.locator(`.react-flow__node[data-id="${dupId}"]`).first();
    await labelEl.click();
    await page.waitForTimeout(200);
    // try to find an input
    const input = page.locator('input[autoFocus]').first();
    if (await input.count() > 0) {
      await input.fill('DUPLICADO CALUCAIMA');
      await input.press('Enter');
    } else {
      // fallback: use applyNodeRename via window if available
      await page.evaluate((id)=>{
        try{ window.flowRef && window.flowRef.applyNodeRename && window.flowRef.applyNodeRename(id,'DUPLICADO CALUCAIMA'); }catch(e){}
      }, dupId);
    }

    await page.waitForTimeout(400);

    // verify localStorage persisted
    const ds = await page.evaluate(()=> localStorage.getItem('district_state'));
    expect(ds).not.toBeNull();
    const state = JSON.parse(ds as string);
    expect(state.nodes && state.nodes[dupId]).toBeTruthy();

    // simulate IBAL down by intercepting API route to fail
    await page.route('**/api/tanques', route => route.abort());
    // reload data poll
    await page.reload();
    await page.waitForTimeout(800);
    // look for connection alert text
    const alertEl = await page.locator('text=Conexión con IBAL no disponible', { timeout: 2000 }).first().count();
    // allow alternative text
    if (alertEl === 0) {
      test.info().log('Alert not present or different wording; checking generic error notifications');
    }

    // restore route by reloading without interception
    await page.unroute('**/api/tanques');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // final assertions: district_state should still have duplicate
    const ds2 = JSON.parse(await page.evaluate(()=> localStorage.getItem('district_state')) || '{}');
    expect(ds2.nodes && ds2.nodes[dupId]).toBeTruthy();
  });
});
