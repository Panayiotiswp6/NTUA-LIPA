/**
 * End-to-end check of the judges' path. Needs a running app (docker compose up) and Playwright:
 *   BASE_URL=http://localhost:3000 node scripts/e2e.cjs
 * Load demo persona → Persona page shows facts → Reply Studio shows a draft → Fidelity Lab renders.
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const step = (name) => console.log(`✓ ${name}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(BASE_URL);
    await page.getByRole('button', { name: 'Digital Twin' }).click();
    await page.locator('.tw-sidebar button', { hasText: 'Import' }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Φόρτωση demo persona' }).click();
    await page.waitForSelector('.tw-table tbody tr', { timeout: 30000 });
    step(`demo persona imported (${await page.locator('.tw-table tbody tr').count()} sources)`);
    await page.locator('.tw-sidebar button', { hasText: 'Persona' }).click();
    await page.waitForSelector('.tw-fact');
    const fact = await page.locator('.tw-fact p').first().textContent();
    if (!/αρνείται|αναλαμβάνει|ζητά|κώδικα/.test(fact)) throw new Error(`Unexpected first decision fact: ${fact}`);
    step(`persona shows facts: «${fact.slice(0, 70)}…»`);
    await page.locator('.tw-sidebar button', { hasText: 'Reply Studio' }).click();
    await page.waitForFunction(() => (document.querySelector('.tw-draft textarea')?.value ?? '').length > 5, null, { timeout: 30000 });
    step(`reply studio draft: «${(await page.locator('.tw-draft textarea').inputValue()).slice(0, 70)}»`);
    await page.locator('.tw-sidebar button', { hasText: 'Fidelity Lab' }).click();
    await page.waitForSelector('.tw-metric');
    step('fidelity lab renders');
    if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
    console.log('E2E OK');
  } catch (error) {
    console.error(`E2E FAILED: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
