import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-perbaharui-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9580;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--window-size=1440,900',
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
    const send = (m, p = {}) => new Promise((res, rej) => {
      const mid = id++;
      const h = e => { const d = JSON.parse(e.data); if (d.id === mid) { ws.removeEventListener('message', h); d.error ? rej(d.error) : res(d.result); } };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: mid, method: m, params: p }));
    });

    const ev = async s => { const r = await send('Runtime.evaluate', { expression: s, returnByValue: true }); return r.result?.value; };

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
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin'}));
        localStorage.setItem('portal_theme', 'dark');
        localStorage.setItem('telecom_portal_alert_dismissed_date', new Date().toISOString().slice(0, 10));
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 3000));

    // Click Notification Bell to open dropdown
    await ev(`document.getElementById('btnContractAlertBell')?.click()`);
    await new Promise(r => setTimeout(r, 600));

    // Check count of items in notification list
    const itemCount = await ev(`document.querySelectorAll('#alertNotificationList .btn-renew-contract-quick').length`);
    console.log('Notification items with Perbaharui button:', itemCount);

    // Click the first Perbaharui button
    const firstItemText = await ev(`
      (() => {
        const btn = document.querySelector('#alertNotificationList .btn-renew-contract-quick');
        if (!btn) return 'NO_BUTTON';
        const card = btn.closest('.p-3');
        const text = card ? card.innerText : 'NO_CARD';
        btn.click();
        return text;
      })()
    `);
    console.log('Clicked item:', firstItemText);

    // Wait for modal to open and fetch to complete
    await new Promise(r => setTimeout(r, 1000));

    // Inspect values inside #modalQuickEdit form
    const formValues = await ev(`
      (() => {
        const modal = document.getElementById('modalQuickEdit');
        const isVisible = modal && modal.style.display !== 'none';
        const title = document.getElementById('quickEditModalTitle')?.innerText;
        const pengelola = document.querySelector('#formQuickEdit input[name="pengelola"]')?.value;
        const pelanggan = document.querySelector('#formQuickEdit input[name="pelanggan"]')?.value;
        const sid = document.querySelector('#formQuickEdit input[name="sid"]')?.value;
        const jenis_sewa = document.querySelector('#formQuickEdit select[name="jenis_sewa"]')?.value;
        const rev_sewa = document.querySelector('#formQuickEdit input[name="rev_sewa_tahun"]')?.value;
        const end_date = document.querySelector('#formQuickEdit input[name="end_date"]')?.value;
        const po_baru = document.querySelector('#formQuickEdit input[name="po_baru"]')?.value;
        return { isVisible, title, pengelola, pelanggan, sid, jenis_sewa, rev_sewa, end_date, po_baru };
      })()
    `);
    console.log('Form values in modal:', formValues);

    // Capture screenshot of the modal
    const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'perbaharui_modal_verification.png'), Buffer.from(r.data, 'base64'));
    console.log('Saved perbaharui_modal_verification.png');

    ws.close();
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(console.error);
