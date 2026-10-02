with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'pelanggan' in line.lower():
        print(f"Line {i+1}: {line.strip()[:120]}")
