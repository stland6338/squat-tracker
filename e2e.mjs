import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:8765/'); await p.screenshot({ path: '/tmp/s-camera.png', fullPage: true });
await p.click('#start'); await p.waitForFunction(() => document.querySelector('#angles').textContent || document.querySelector('#feedback').textContent, null, { timeout: 90000 });
console.log('feedback:', await p.textContent('#feedback'), '| err:', await p.textContent('#camerr'));
await p.screenshot({ path: '/tmp/s-live.png' });
await p.click('nav button[data-tab=log]'); await p.click('#manual button'); console.log('history rows', await p.locator('#history tr').count());
await p.screenshot({ path: '/tmp/s-log.png', fullPage: true });
await p.click('nav button[data-tab=body]');
for (const [d, w] of [['2026-10-20', 91], ['2026-10-23', 90.2], ['2026-10-25', 89.6]]) { await p.fill('#bodyform [name=date]', d); await p.fill('#bodyform [name=weight]', String(w)); await p.fill('#bodyform [name=waist]', String(w + 5)); await p.click('#bodyform button'); }
await p.screenshot({ path: '/tmp/s-body.png', fullPage: true });
await p.click('nav button[data-tab=howto]'); await p.screenshot({ path: '/tmp/s-howto.png', fullPage: true });
console.log('sw:', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
console.log('errors:', errs); await b.close();
