import json

with open('sitac_collo_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for r in data.get('collo_records', []):
    pel = str(r.get('pelanggan') or '').strip()
    lines = [line.strip() for line in pel.split('\n') if line.strip()]
    if len(lines) > 2:
        print(f"ID {r.get('id')}: {len(lines)} lines, unique={len(set(lines))}")
        print("   Sample:", lines[:3])
