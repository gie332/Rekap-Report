import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-light-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9522;

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
    if (!pageTab) throw new Error('Could not find page tab');

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

    await send('Page.enable');
    await send('Runtime.enable');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1536,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({
          username: 'admin',
          full_name: 'Administrator',
          role: 'admin'
        }));
        localStorage.setItem('telecom_portal_token', 'mock_admin_token');
        localStorage.setItem('portal_theme', 'light');
      `
    });

    console.log('Navigating to portal...');
    await send('Page.navigate', { url: 'http://localhost:8888/' });

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

    console.log('Capturing light executive dashboard...');
    await captureScreenshot(path.join(artifactDir, 'light_executive_dashboard.png'));

    console.log('Navigating to Collo List...');
    await evaluate(`document.querySelector('[data-view="view-collo-list"]')?.click()`);
    await new Promise(r => setTimeout(r, 1500));
    await captureScreenshot(path.join(artifactDir, 'light_collo_list.png'));

    console.log('Searching for CYBERINDO (row 842)...');
    await evaluate(`
      const input = document.getElementById('colloSearchInput');
      if (input) {
        input.value = 'CYBERINDO';
        input.dispatchEvent(new Event('input'));
      }
    `);
    await new Promise(r => setTimeout(r, 1500));
    await captureScreenshot(path.join(artifactDir, 'light_collo_row_842.png'));

    console.log('Opening detail modal for multi-tenant row...');
    await evaluate(`document.querySelector('#colloTableBody .btn-view-detail')?.click()`);
    await new Promise(r => setTimeout(r, 1000));
    await captureScreenshot(path.join(artifactDir, 'light_collo_detail_modal.png'));
    await evaluate(`document.querySelector('#btnCloseDetail')?.click()`);
    await new Promise(r => setTimeout(r, 500));

    console.log('Opening quick edit modal...');
    await evaluate(`document.querySelector('#colloTableBody .btn-quick-edit')?.click()`);
    await new Promise(r => setTimeout(r, 1000));
    await captureScreenshot(path.join(artifactDir, 'light_collo_edit_modal.png'));
    await evaluate(`document.querySelector('#btnCancelQuickEdit')?.click()`);
    await new Promise(r => setTimeout(r, 500));

    console.log('Navigating to SITAC...');
    await evaluate(`document.querySelector('[data-view="view-sitac-pa"]')?.click()`);
    await new Promise(r => setTimeout(r, 1500));
    await captureScreenshot(path.join(artifactDir, 'light_sitac_pa.png'));

    console.log('All light screenshots captured successfully!');
    ws.close();
  } finally {
    edgeProc.kill();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

main().catch(console.error);
