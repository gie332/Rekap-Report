import subprocess
import time
import json
import urllib.request
import os
import websocket
import base64

cmd = [
    r'C:\Users\anggi\AppData\Local\Google\Chrome\Application\chrome.exe',
    '--headless=new',
    '--remote-debugging-port=9225',
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--window-size=1280,900',
    'http://localhost:8888/'
]
proc = subprocess.Popen(cmd)
time.sleep(2)

try:
    tabs = json.loads(urllib.request.urlopen('http://localhost:9225/json').read().decode())
    ws_url = tabs[0]['webSocketDebuggerUrl']
    ws = websocket.create_connection(ws_url)
    
    def cdp_send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        ws.send(json.dumps(msg))
        return json.loads(ws.recv())

    # Set auth in localStorage
    cdp_send('Runtime.evaluate', {
        'expression': """
        localStorage.setItem('telecom_portal_user', JSON.stringify({id: 1, username: 'admin', role: 'admin', full_name: 'Administrator'}));
        localStorage.setItem('telecom_portal_token', 'token123');
        """
    })

    # Reload page with auth
    cdp_send('Page.navigate', {'url': 'http://localhost:8888/'})
    time.sleep(2)

    # Click on Revenue Sharing nav item
    cdp_send('Runtime.evaluate', {
        'expression': """
        document.querySelector('[data-view="view-collo-rev-sharing"]').click();
        """
    })
    time.sleep(2)

    # Capture initial view screenshot
    shot = cdp_send('Page.captureScreenshot')
    with open('shot_revshare_initial.png', 'wb') as f:
        f.write(base64.b64decode(shot['result']['data']))
    print("Initial screenshot saved to shot_revshare_initial.png")

    # Scroll page to Breakdown table
    cdp_send('Runtime.evaluate', {
        'expression': """
        document.querySelector('.portal-content-body').scrollTop = 800;
        """
    })
    time.sleep(1)

    shot2 = cdp_send('Page.captureScreenshot')
    with open('shot_revshare_scrolled.png', 'wb') as f:
        f.write(base64.b64decode(shot2['result']['data']))
    print("Scrolled screenshot saved to shot_revshare_scrolled.png")

finally:
    proc.terminate()
