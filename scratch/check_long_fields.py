import json

with open('sitac_collo_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for table_name in ['collo_records', 'sitac_records']:
    records = data.get(table_name, [])
    long_pelanggan = []
    for r in records:
        pel = str(r.get('pelanggan') or '').strip()
        lines = [line.strip() for line in pel.split('\n') if line.strip()]
        if len(lines) > 2 or len(pel) > 60:
            long_pelanggan.append((r.get('id'), len(lines), len(pel), lines[:3], set(lines)))
    print(f"{table_name}: {len(long_pelanggan)} records with long pelanggan out of {len(records)}")
    for item in long_pelanggan[:5]:
        print(f"  ID {item[0]}: {item[1]} lines, {item[2]} chars, {len(item[4])} unique lines. Sample: {item[3]}")
