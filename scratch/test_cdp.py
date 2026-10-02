import subprocess
import time
import json
import urllib.request
import os

# Start Chrome with remote debugging
shot_path = os.path.abspath('actual_portal_shot.png')
cmd = [
    r'C:\Users\anggi\AppData\Local\Google\Chrome\Application\chrome.exe',
    '--headless=new',
    '--remote-debugging-port=9223',
    '--disable-gpu',
    '--window-size=1280,900',
    'http://localhost:8888/'
]
proc = subprocess.Popen(cmd)
time.sleep(2)

try:
    tabs = json.loads(urllib.request.urlopen('http://localhost:9223/json').read().decode())
    print('Tabs open:', len(tabs))
finally:
    proc.terminate()
