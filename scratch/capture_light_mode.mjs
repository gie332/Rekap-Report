import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const artDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'el5-'));
  const port = 9472;
  const proc = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    '--window-size=1536,900',
    '--disable-extensions', '--no-sandbox', '--disable-gpu',
    'about:blank'
  ]);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let tabs;
  for (let i = 0; i < 20; i++) {
    try { const r = await fetch(`http://localhost:${port}/json`); tabs = await r.json(); if (tabs.length) break; } catch(e) {}
    await sleep(400);
  }
  console.log('Edge ready, tabs:', tabs?.length);

  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let mid = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = mid++;
    const h = e => { const m = JSON.parse(e.data); if (m.id !== id) return; ws.removeEventListener('message', h); m.error ? rej(m.error) : res(m.result); };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const ev = async expr => { try { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result?.value; } catch(e) { return null; } };

  const shot = async name => {
    console.log('Capturing', name, '...');
    // Use fullPage: false and no clip to avoid hang
    const r = await Promise.race([
      send('Page.captureScreenshot', { format: 'png', fromSurface: true }),
      sleep(15000).then(() => { throw new Error('Screenshot timeout'); })
    ]);
    fs.writeFileSync(path.join(artDir, name), Buffer.from(r.data, 'base64'));
    console.log('✓ Saved', name, `(${Math.round(r.data.length * 0.75 / 1024)}KB)`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1536, height: 900, deviceScaleFactor: 1, mobile: false,
    screenWidth: 1536, screenHeight: 900
  });

  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',full_name:'Administrator',role:'admin'}));
    localStorage.setItem('portal_theme','light');
  `});

  console.log('Navigating...');
  await send('Page.navigate', { url: 'http://localhost:8888/' });

  // Wait for DOMContentLoaded
  for (let i = 0; i < 80; i++) {
    const ok = await ev(`document.readyState !== 'loading'`);
    if (ok) break;
    await sleep(250);
  }
  console.log('DOM ready, readyState:', await ev(`document.readyState`));
  
  // Apply light theme  
  await ev(`document.documentElement.setAttribute('data-theme','light')`);
  
  // Wait for fonts/images but don't wait too long
  await sleep(3000);
  console.log('Theme:', await ev(`document.documentElement.getAttribute('data-theme')`));

  await shot('light_dashboard.png');

  await ev(`document.querySelector('[data-view="view-collo-list"]')?.click()`);
  await sleep(2500);
  await shot('light_collo_list.png');

  const clicked = await ev(`!!document.querySelector('#colloTableBody .btn-quick-edit')`);
  console.log('Edit btn exists:', clicked);
  if (clicked) {
    await ev(`document.querySelector('#colloTableBody .btn-quick-edit').click()`);
    await sleep(1200);
    await shot('light_collo_modal.png');
    await ev(`document.querySelector('#btnCancelQuickEdit')?.click()`);
    await sleep(400);
  }

  await ev(`document.querySelector('[data-view="view-sitac-pa"]')?.click()`);
  await sleep(2500);
  await shot('light_sitac.png');

  console.log('All done!');
  ws.close();
  proc.kill();
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
