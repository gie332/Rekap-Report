import urllib.request
import json
import sqlite3

def post(url, data):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))

def get(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))

base = 'http://127.0.0.1:8888'

print('--- TEST 1: GET REGISTERED PICS ---')
status, data = get(f'{base}/api/auth/registered-pics')
pics = data.get('pics', [])
print(f'Status: {status}, Total PICs: {len(pics)}')
for p in pics:
    print(f'  - {p["full_name"]} (@{p["username"]}) | PIC Tag: {p["pic_code"]} | SITAC: {p["sitac_count"]} | Gangguan: {p["gangguan_count"]}')

print('\n--- TEST 2: LOGIN WITH WRONG PASSWORD ---')
status, data = post(f'{base}/api/auth/login', {'username': 'harlan', 'password': 'wrongpassword'})
print(f'Status: {status} (Expected 401), Success: {data.get("success")}, Message: {data.get("message")}')

print('\n--- TEST 3: LOGIN WITH CORRECT PASSWORD ---')
status, data = post(f'{base}/api/auth/login', {'username': 'harlan', 'password': 'harlan123'})
print(f'Status: {status} (Expected 200), Success: {data.get("success")}, User: {data.get("user", {}).get("full_name")}, Token: {data.get("token", "")[:20]}...')

print('\n--- TEST 4: REGISTER NEW PIC ACCOUNT ---')
status, data = post(f'{base}/api/auth/register', {
    'username': 'dani',
    'password': 'dani123',
    'full_name': 'Dani Kusuma',
    'pic_code': 'Dani',
    'role': 'lapangan'
})
print(f'Status: {status} (Expected 200), Success: {data.get("success")}, Message: {data.get("message")}')

print('\n--- TEST 5: LOGIN AS NEW REGISTERED PIC ---')
status, data = post(f'{base}/api/auth/login', {'username': 'dani', 'password': 'dani123'})
print(f'Status: {status} (Expected 200), User: {data.get("user", {}).get("full_name")}')

print('\n--- TEST 6: CHANGE PASSWORD FOR NEW PIC ---')
status, data = post(f'{base}/api/auth/change-password', {
    'username': 'dani',
    'old_password': 'dani123',
    'new_password': 'dani456'
})
print(f'Status: {status} (Expected 200), Success: {data.get("success")}, Message: {data.get("message")}')

print('\n--- TEST 7: LOGIN WITH OLD PASSWORD (EXPECT REJECT) ---')
status, data = post(f'{base}/api/auth/login', {'username': 'dani', 'password': 'dani123'})
print(f'Status: {status} (Expected 401), Message: {data.get("message")}')

print('\n--- TEST 8: LOGIN WITH NEW PASSWORD (EXPECT SUCCESS) ---')
status, data = post(f'{base}/api/auth/login', {'username': 'dani', 'password': 'dani456'})
print(f'Status: {status} (Expected 200), Success: {data.get("success")}, Message: {data.get("message")}')

# Cleanup test account
conn = sqlite3.connect('telecom_portal.db')
c = conn.cursor()
c.execute('DELETE FROM users WHERE username = "dani"')
conn.commit()
conn.close()
print('\n[Cleaned up test account "dani" successfully]')
