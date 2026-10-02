import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const artDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-shot-'));
  const port = 9488;
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
  if (!tabs?.length) {
    console.error('Edge failed to start');
    proc.kill();
    return;
  }

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
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artDir, name), Buffer.from(r.data, 'base64'));
    console.log('Saved', name);
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

  console.log('Navigating to http://localhost:8888/ ...');
  await send('Page.navigate', { url: 'http://localhost:8888/' });

  await sleep(4000);
  await ev(`document.documentElement.setAttribute('data-theme','light')`);
  await ev(`document.body.setAttribute('data-theme','light')`);
  await sleep(1000);

  await shot('shot_light_dashboard.png');

  await ev(`document.querySelector('[data-view="view-collo-list"]')?.click()`);
  await sleep(2000);
  await shot('shot_light_collo.png');

  ws.close();
  proc.kill();
  console.log('Done!');
}

main().catch(console.error);
