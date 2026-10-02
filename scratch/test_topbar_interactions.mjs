import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function testTopbarInteractions() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-test-int-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9590;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`http://localhost:${port}/json`);
    const tabs = await res.json();
    const pageTab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const send = (m, p = {}) => new Promise((resolve, reject) => {
      const mid = id++;
      const handler = e => {
        const d = JSON.parse(e.data);
        if (d.id === mid) {
          ws.removeEventListener('message', handler);
          d.error ? reject(d.error) : resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: mid, method: m, params: p }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin',full_name:'Administrator (Manajemen)'}));
        localStorage.setItem('portal_theme', 'dark');
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2500));

    // Test 1: Click Ekspor dropdown
    const clickExport = await send('Runtime.evaluate', {
      expression: `
        document.getElementById('btnToggleExportMenu').click();
        !document.getElementById('exportGroupMenu').classList.contains('hidden');
      `,
      returnByValue: true
    });
    console.log('Export menu opened:', clickExport.result.value);

    // Test 2: Click Alat dropdown
    const clickTools = await send('Runtime.evaluate', {
      expression: `
        document.getElementById('btnToggleToolsMenu').click();
        !document.getElementById('toolsGroupMenu').classList.contains('hidden');
      `,
      returnByValue: true
    });
    console.log('Tools menu opened:', clickTools.result.value);

    // Test 3: Click Bell dropdown
    const clickBell = await send('Runtime.evaluate', {
      expression: `
        document.getElementById('btnContractAlertBell').click();
        !document.getElementById('contractAlertNotificationPanel').classList.contains('hidden');
      `,
      returnByValue: true
    });
    console.log('Bell panel opened:', clickBell.result.value);

    // Test 4: Toggle theme
    const clickTheme = await send('Runtime.evaluate', {
      expression: `
        const lightBtn = document.querySelector('.theme-seg-btn[data-theme-val="light"]');
        if (lightBtn) lightBtn.click();
        document.documentElement.getAttribute('data-theme');
      `,
      returnByValue: true
    });
    console.log('Theme after clicking light:', clickTheme.result.value);

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    edgeProc.kill();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

testTopbarInteractions();
