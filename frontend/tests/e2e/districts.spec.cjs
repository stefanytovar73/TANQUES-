const { test, expect } = require('@playwright/test');

const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:5173';

test.describe('Districts: custom name editor', () => {
  test('permite escribir y guardar un nombre real en un nodo actual del snapshot sin depender de un ID fijo', async ({ page }) => {
    page.on('console', (msg) => { try { console.log('[PAGE console]', msg.text()); } catch (e) {} });

    const backendStateResp = await page.request.get(`${BASE}/api/diagram/state`);
    expect(backendStateResp.status()).toBeGreaterThanOrEqual(200);
    const backendState = await backendStateResp.json();
    const rawNodes = backendState && backendState.nodes && typeof backendState.nodes === 'object' ? backendState.nodes : {};
    const candidates = Object.keys(rawNodes).filter((id) => {
      const node = rawNodes[id] || {};
      return ['tank', 'shape', 'plant', 'district'].includes(String(node.type || 'tank'));
    });
    expect(candidates.length).toBeGreaterThan(0);

    const targetId = candidates.find((id) => id === 'tanque-belen') || candidates[0];
    const targetNode = rawNodes[targetId];
    expect(targetNode).toBeTruthy();
    const originalDisplayName = targetNode.customName || targetNode.label || targetNode.display_name || targetNode.id || 'Nodo';

    await page.goto(`${BASE}/distritos`);
    await page.waitForSelector(`[data-id="${targetId}"]`, { timeout: 20000 });

    const nodeLocator = page.locator(`[data-id="${targetId}"]`);
    const nodeBox = await nodeLocator.boundingBox();
    if (nodeBox) {
      await nodeLocator.click({
        position: { x: Math.max(8, Math.round(nodeBox.width * 0.15)), y: Math.max(8, Math.round(nodeBox.height * 0.15)) },
        force: true,
      });
    } else {
      await nodeLocator.click({ force: true });
    }

    const selectionTrace = await page.evaluate(() => { try { return window.__SELECTION_TRACE || []; } catch (e) { return []; } });
    expect(Array.isArray(selectionTrace) && selectionTrace.length > 0).toBeTruthy();

    const input = page.locator('input[placeholder="Nombre del elemento"]').first();
    await expect(input).toBeVisible();
    await input.click();
    await input.fill('PRUEBA NOMBRE');
    await expect(input).toHaveValue('PRUEBA NOMBRE');

    const [postResp] = await Promise.all([
      page.waitForResponse(resp => resp.url().endsWith('/api/diagram/state') && resp.request().method() === 'POST', { timeout: 15000 }),
      page.getByRole('button', { name: 'Guardar' }).click(),
    ]);
    expect(postResp.status()).toBeGreaterThanOrEqual(200);
    expect(postResp.status()).toBeLessThan(300);

    let postData = null;
    try { postData = JSON.parse(postResp.request().postData() || '{}'); } catch (e) { postData = null; }
    expect(postData).toBeTruthy();
    const postedNode = postData && postData.nodes ? (postData.nodes[targetId] || (Array.isArray(postData.nodes) && postData.nodes.find(n => n && n.id === targetId))) : null;
    expect(postedNode).toBeTruthy();
    expect((postedNode.customName || postedNode.label || '')).toBe('PRUEBA NOMBRE');

    const getResp = await page.request.get(`${BASE}/api/diagram/state`);
    expect(getResp.status()).toBeGreaterThanOrEqual(200);
    const serverState = await getResp.json();
    const serverNode = serverState && serverState.nodes ? (serverState.nodes[targetId] || (Array.isArray(serverState.nodes) && serverState.nodes.find(n => n && n.id === targetId))) : null;
    expect(serverNode).toBeTruthy();
    expect((serverNode.customName || serverNode.label || '')).toBe('PRUEBA NOMBRE');

    await page.reload();
    await page.waitForSelector(`[data-id="${targetId}"]`, { timeout: 20000 });
    await page.locator(`[data-id="${targetId}"]`).click({ force: true });
    await expect(page.locator('input[placeholder="Nombre del elemento"]').first()).toHaveValue('PRUEBA NOMBRE');

    await page.locator('input[placeholder="Nombre del elemento"]').first().click();
    await page.locator('input[placeholder="Nombre del elemento"]').first().fill(originalDisplayName);
    await page.getByRole('button', { name: 'Guardar nombre' }).click();

    const [postResp2] = await Promise.all([
      page.waitForResponse(resp => resp.url().endsWith('/api/diagram/state') && resp.request().method() === 'POST', { timeout: 15000 }),
      page.getByRole('button', { name: 'Guardar' }).click(),
    ]);
    expect(postResp2.status()).toBeGreaterThanOrEqual(200);

    const getResp2 = await page.request.get(`${BASE}/api/diagram/state`);
    expect(getResp2.status()).toBeGreaterThanOrEqual(200);
    const serverState2 = await getResp2.json();
    const serverNode2 = serverState2 && serverState2.nodes ? (serverState2.nodes[targetId] || (Array.isArray(serverState2.nodes) && serverState2.nodes.find(n => n && n.id === targetId))) : null;
    expect(serverNode2).toBeTruthy();
    expect((serverNode2.customName || serverNode2.label || '')).toBe(originalDisplayName);
  }, 120_000);
});
