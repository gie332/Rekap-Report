import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-inspect-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9449;

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
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

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
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2000));

    // Switch to collo list and open modal
    await send('Runtime.evaluate', {
      expression: `
        document.querySelector('[data-view="view-collo-list"]')?.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));

    await send('Runtime.evaluate', {
      expression: `
        document.querySelector('#colloTableBody .btn-quick-edit')?.click();
      `
    });
    await new Promise(r => setTimeout(r, 800));

    const check = await send('Runtime.evaluate', {
      expression: `(function() {
        const modal = document.getElementById('modalQuickEdit');
        const modalRect = modal?.getBoundingClientRect();
        const card = modal?.querySelector('.portal-modal-card');
        const cardRect = card?.getBoundingClientRect();
        const header = document.querySelector('header.portal-topbar');
        const headerRect = header?.getBoundingClientRect();

        const elAtPoint = document.elementFromPoint(cardRect.left + 50, cardRect.top + 20);

        return {
          modalStyle: {
            display: modal?.style.display,
            className: modal?.className,
            zIndex: window.getComputedStyle(modal).zIndex,
            position: window.getComputedStyle(modal).position
          },
          cardRect,
          headerRect,
          headerStyle: {
            zIndex: window.getComputedStyle(header).zIndex,
            position: window.getComputedStyle(header).position
          },
          elAtPoint: {
            tagName: elAtPoint?.tagName,
            id: elAtPoint?.id,
            className: elAtPoint?.className,
            text: elAtPoint?.textContent?.slice(0, 50)
          }
        };
      })()`,
      returnByValue: true
    });

    console.log('CHECK RESULT:', JSON.stringify(check.result.value, null, 2));
    ws.close();
  } finally {
    edgeProc.kill();
  }
}

main().catch(console.error);
