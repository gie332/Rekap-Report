import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-views-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9447;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    '--window-size=1536,900',
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`http://localhost:${port}/json`);
    const tabs = await res.json();
    const pageTab = tabs.find(t => t.type === 'page');
    if (!pageTab) throw new Error('Could not find blank page tab');

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.id === id) {
            ws.removeEventListener('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true });
      return res.result?.value;
    }

    async function captureScreenshot(filepath) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
      console.log('Saved screenshot to:', filepath);
    }

    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        console.log('[BROWSER CONSOLE]', msg.params.type, text);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails);
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');

    // Explicitly override viewport dimensions
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1536,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Pre-populate admin user in localStorage before portal scripts run
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({
          username: 'admin',
          full_name: 'Administrator',
          role: 'admin'
        }));
        localStorage.setItem('telecom_portal_token', 'mock_admin_token');
      `
    });

    console.log('Navigating to portal...');
    await send('Page.navigate', { url: 'http://localhost:8888/' });

    // Wait until portal has loaded data
    for (let i = 0; i < 40; i++) {
      const ready = await evaluate(`
        document.readyState === 'complete' && 
        document.getElementById('userNameDisplay')?.textContent.includes('Administrator')
      `);
      if (ready) break;
      await new Promise(r => setTimeout(r, 250));
    }

    await new Promise(r => setTimeout(r, 2000));

    const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';

    // 1. Dashboard screenshot
    console.log('Capturing dashboard screenshot...');
    await captureScreenshot(path.join(artifactDir, 'view_dashboard.png'));

    // 2. Colocation List screenshot
    console.log('Switching to Colocation...');
    await evaluate(`(function() {
      const link = document.querySelector('[data-view="view-collo-list"]');
      if (link) link.click();
    })()`);
    await new Promise(r => setTimeout(r, 2000));
    await captureScreenshot(path.join(artifactDir, 'view_collo_list.png'));

    // 3. Open Quick Edit Modal in Colocation
    console.log('Opening Quick Edit Modal...');
    await evaluate(`(function() {
      const btn = document.querySelector('#colloTableBody .btn-quick-edit');
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1000));
    await captureScreenshot(path.join(artifactDir, 'view_collo_edit_modal.png'));

    // Close modal
    await evaluate(`document.querySelector('#btnCancelQuickEdit')?.click()`);
    await new Promise(r => setTimeout(r, 500));

    // 4. SITAC PA view screenshot
    console.log('Switching to SITAC PA...');
    await evaluate(`(function() {
      const link = document.querySelector('[data-view="view-sitac-pa"]');
      if (link) link.click();
    })()`);
    await new Promise(r => setTimeout(r, 2000));
    await captureScreenshot(path.join(artifactDir, 'view_sitac_pa.png'));

    // 5. Gangguan view screenshot
    console.log('Switching to Gangguan...');
    await evaluate(`(function() {
      const link = document.querySelector('[data-view="view-gangguan"]');
      if (link) link.click();
    })()`);
    await new Promise(r => setTimeout(r, 2000));
    await captureScreenshot(path.join(artifactDir, 'view_gangguan.png'));

    console.log('All screenshots captured successfully!');
    ws.close();
  } finally {
    edgeProc.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
