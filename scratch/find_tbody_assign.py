import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'tbody.innerhtml' in l.lower() or 'tblinks.innerhtml' in l.lower():
        print(f"Line {i+1}: {l.strip()[:100]}")
