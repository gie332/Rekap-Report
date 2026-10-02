import sys
sys.stdout.reconfigure(encoding='utf-8')
import sqlite3
conn = sqlite3.connect('telecom_portal.db')
cur = conn.cursor()

# Normalize all capitalization variants
updates = [
    ("Cross Connect", "Cross connect"),
    ("Cross Connect", "cross connect"),
    ("Colocation", "COLOCATION"),
    ("Colocation", "colocation"),
]

for target, variant in updates:
    cur.execute(f"UPDATE collo_records SET jenis_sewa = ? WHERE jenis_sewa = ?", (target, variant))
    if cur.rowcount > 0:
        print(f"Updated {cur.rowcount} rows: '{variant}' -> '{target}'")

conn.commit()
conn.close()
print("Done!")
