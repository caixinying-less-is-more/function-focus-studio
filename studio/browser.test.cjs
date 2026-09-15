const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => failures.push(error.message));
    const server = JSON.parse(fs.readFileSync(path.join(__dirname, '../studio-server.json')));
    await page.goto(server.url);
    await page.locator('#apply:enabled').waitFor();
    const call = page.locator('.token[data-role="fn"]').filter({ hasText: /^enrich_actors$/ });
    const weight = () => call.evaluate(node => getComputedStyle(node).fontWeight);
    const color = () => call.evaluate(node => getComputedStyle(node).color);
    assert.equal(await weight(), '700');
    assert.equal(await color(), 'rgb(0, 95, 204)');
    await page.locator('label').filter({ hasText: /^函数调用加粗$/ }).click();
    assert.equal(await weight(), '400');
    await page.locator('#undo').click();
    assert.equal(await weight(), '700');

    const original = await page.locator('#hex').inputValue();
    const box = await page.locator('#picker .IroBox').first().boundingBox();
    await page.mouse.move(box.x + box.width * .9, box.y + box.height * .25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .1, { steps: 6 });
    await page.mouse.up();
    const dragged = await page.locator('#hex').inputValue();
    assert.notEqual(dragged, original);
    assert.notEqual(await color(), 'rgb(0, 95, 204)');
    await page.locator('#undo').click();
    assert.equal(await page.locator('#hex').inputValue(), original);
    await page.locator('#redo').click();
    assert.equal(await page.locator('#hex').inputValue(), dragged);

    await page.locator('#hex').fill('#7C238C');
    await page.locator('#hex').press('Enter');
    assert.equal(await color(), 'rgb(124, 35, 140)');
    await page.reload();
    await page.locator('#apply:enabled').waitFor();
    assert.equal(await page.locator('#hex').inputValue(), '#7C238C');
    await page.locator('#reset').click();
    assert.equal(await color(), 'rgb(0, 95, 204)');

    await page.locator('[data-role="parameter"].role-button').click();
    assert.equal(await page.locator('#hex').inputValue(), '#A35F00');
    await page.locator('#hue').focus();
    await page.locator('#hue').press('ArrowRight');
    assert.notEqual(await page.locator('#hex').inputValue(), '#A35F00');
    await page.locator('#undo').click();
    await page.locator('label').filter({ hasText: /^参数加粗$/ }).click();
    assert.equal(await page.locator('.token[data-role="parameter"]').first().evaluate(node => getComputedStyle(node).fontWeight), '700');
    await page.locator('#undo').click();

    await page.locator('#dark').click();
    assert.equal(await page.locator('#editor').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(27, 30, 34)');
    assert.equal(await page.locator('#hex').inputValue(), '#FFD166');
    const download = page.waitForEvent('download');
    await page.locator('#export').click();
    const downloaded = await download;
    const exported = JSON.parse(fs.readFileSync(await downloaded.path()));
    assert.equal(exported.semanticTokenColors.function.bold, true);
    assert.equal(exported.semanticTokenColors.parameter.foreground, '#FFD166');
    await page.screenshot({ path: path.join(__dirname, '../studio-dark.png'), fullPage: true });

    await page.locator('#light').click();
    await page.locator('#reset').click();
    await page.locator('[data-role="fn"].role-button').click();
    await page.locator('#apply').click();
    await page.waitForFunction(() => document.getElementById('save-state').textContent === '已应用');
    const unauthorized = await page.request.post(server.url + '/api/apply', { data: {} });
    assert.equal(unauthorized.status(), 403);
    await page.locator('#samples').getByRole('tab', { name: '提示词与分支' }).click();
    assert(await page.locator('#code').innerText().then(text => text.includes('def play_once(self):')));
    await page.locator('#samples').getByRole('tab', { name: '生成与测试' }).click();
    await page.locator('#wrap').click();
    assert((await page.locator('#code').getAttribute('class')).includes('wrap'));
    await page.locator('#font-size').fill('17');
    assert.equal(await page.locator('#code').evaluate(node => getComputedStyle(node).fontSize), '17px');
    await page.locator('#font-size').fill('14');
    await page.locator('#wrap').click();
    await page.screenshot({ path: path.join(__dirname, '../studio-desktop.png'), fullPage: true });

    for (const [width, height] of [[1024, 768], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0, 'overflow at ' + width);
      const label = page.locator('.preview-bottom > span');
      const bounds = await label.boundingBox();
      assert(bounds.height < 25, 'font-size label wrapped');
    }
    await page.locator('#reset-compact').click();
    await page.screenshot({ path: path.join(__dirname, '../studio-mobile.png'), fullPage: true });
    assert.deepEqual(failures, []);
    console.log('Browser passed: drag picker, sliders, HEX, bold toggles, undo/redo, persistence, reset, both themes, export, Cursor apply, wrapping, font size, and responsive layouts.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
