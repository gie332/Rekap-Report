import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-inspect-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9454;

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
    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2500));

    const check = await send('Runtime.evaluate', {
      expression: `(function() {
        const s = document.styleSheets[3];
        if (!s) return 'no sheet 3';
        const rules = [];
        for (let i = 0; i < s.cssRules.length; i++) {
          rules.push(i + ': ' + (s.cssRules[i].selectorText || s.cssRules[i].cssText.slice(0, 50)));
        }
        return { length: s.cssRules.length, last20: rules.slice(-20) };
      })()`,
      returnByValue: true
    });

    console.log('RULES IN SHEET 3:', JSON.stringify(check.result.value, null, 2));
    ws.close();
  } finally {
    edgeProc.kill();
  }
}

main().catch(console.error);
