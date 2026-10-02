import json

with open('sitac_collo_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for item in data.get('collo_records', []):
    pel = str(item.get('pelanggan', ''))
    if 'CYBERINDO ADITAMA' in pel and 'INDOMARCO' in pel:
        print("Found matching item ID:", item.get('id'))
        print("Pelanggan content:")
        print(repr(pel))
        print("Lines count:", len(pel.split('\n')))
        print("---")
