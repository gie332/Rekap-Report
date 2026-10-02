import sqlite3

conn = sqlite3.connect('telecom_portal.db')
c = conn.cursor()
c.execute("SELECT id, pengelola, pelanggan, sid, no_so, terminating FROM collo_records WHERE id = 842")
r = c.fetchone()
print("ID:", r[0])
print("  Pengelola:", repr(r[1]))
print("  Pelanggan:", repr(r[2]))
print("  SID:", repr(r[3]))
print("  NO_SO:", repr(r[4]))
print("  Terminating:", repr(r[5]))
conn.close()
