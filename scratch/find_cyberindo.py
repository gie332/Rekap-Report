import sqlite3

conn = sqlite3.connect('telecom_portal.db')
cursor = conn.cursor()
tables = [row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
for t in tables:
    cols = [c[1] for c in cursor.execute(f'PRAGMA table_info("{t}");').fetchall()]
    for c in cols:
        try:
            res = cursor.execute(f'SELECT id, "{c}" FROM "{t}" WHERE "{c}" LIKE "%INDOMARCO%" OR "{c}" LIKE "%CYBERINDO%" LIMIT 5;').fetchall()
            if res:
                print(f'{t}.{c}:')
                for r in res:
                    print("  ID:", r[0], "-->", repr(r[1]))
        except Exception as e:
            pass
conn.close()
