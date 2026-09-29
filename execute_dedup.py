import sqlite3
import shutil
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

db_path = 'telecom_portal.db'
backup_path = 'telecom_portal_backup_before_dedup.db'

# Ensure backup exists
if not os.path.exists(backup_path):
    shutil.copyfile(db_path, backup_path)
    print(f"[OK] Database backup created at {backup_path}")
else:
    print(f"[INFO] Backup already exists at {backup_path}")

conn = sqlite3.connect(db_path)
c = conn.cursor()

print("\n--- 1. PROCESSING GANGGUAN DUPLICATES ---")
c.execute("""
    SELECT terminating, tgl_dispos, count(*) as cnt, GROUP_CONCAT(id)
    FROM gangguan_records
    WHERE terminating IS NOT NULL AND TRIM(terminating) != ''
    GROUP BY terminating, tgl_dispos
    HAVING cnt > 1
""")
gangguan_groups = c.fetchall()

gangguan_deleted = []
for term, tgl, cnt, ids_str in gangguan_groups:
    ids = [int(x) for x in ids_str.split(',')]
    c.execute(f"SELECT id, pic_perijinan, biaya_gangguan, status_pekerjaan, update_gangguan FROM gangguan_records WHERE id IN ({','.join(map(str, ids))})")
    rows = c.fetchall()
    
    # Merge PIC names
    all_pics = []
    for r in rows:
        if r[1]:
            for p in r[1].split(','):
                p_clean = p.strip()
                if p_clean and p_clean not in all_pics:
                    all_pics.append(p_clean)
    merged_pic = ', '.join(all_pics)
    
    # Sort: highest biaya, then highest id
    sorted_rows = sorted(rows, key=lambda x: (x[2] or 0, x[0]), reverse=True)
    keep_id = sorted_rows[0][0]
    delete_ids = [x[0] for x in sorted_rows[1:]]
    
    # Update kept row with merged PIC
    c.execute("UPDATE gangguan_records SET pic_perijinan = ? WHERE id = ?", (merged_pic, keep_id))
    
    # Delete duplicate rows
    c.execute(f"DELETE FROM gangguan_records WHERE id IN ({','.join(map(str, delete_ids))})")
    gangguan_deleted.extend(delete_ids)
    print(f"  Incident '{term[:30]}' ({tgl}): Kept ID {keep_id} (PIC: {merged_pic}), Deleted IDs {delete_ids}")

print(f"[DONE] Deleted {len(gangguan_deleted)} duplicate rows from gangguan_records.")


print("\n--- 2. PROCESSING COLLO DUPLICATES ---")
collo_deleted = set()

# A. Group by (pengelola, pelanggan, no_so) where no_so is not empty
c.execute("""
    SELECT pengelola, pelanggan, no_so, count(*) as cnt, GROUP_CONCAT(id) as ids
    FROM collo_records
    WHERE no_so IS NOT NULL AND TRIM(no_so) != ''
    GROUP BY pengelola, pelanggan, no_so
    HAVING cnt > 1
""")
dup_so_groups = c.fetchall()
print(f"Duplicate SO groups found: {len(dup_so_groups)}")

for pengelola, pelanggan, no_so, cnt, ids_str in dup_so_groups:
    ids = [int(x) for x in ids_str.split(',')]
    c.execute(f"SELECT id, start_date, end_date, status, is_active, rev_sewa_tahun, biaya_sewa_tahun FROM collo_records WHERE id IN ({','.join(map(str, ids))})")
    rows = c.fetchall()
    
    # Best row: is_active=1 first, then latest end_date, then highest rev_sewa_tahun, then id
    rows_sorted = sorted(rows, key=lambda r: (r[4], str(r[2]), r[5] or 0, r[0]), reverse=True)
    keep_id = rows_sorted[0][0]
    delete_ids = [r[0] for r in rows_sorted[1:]]
    collo_deleted.update(delete_ids)

# B. Group by (pengelola, pelanggan, sid) where no_so is empty
c.execute("""
    SELECT pengelola, pelanggan, sid, count(*) as cnt, GROUP_CONCAT(id) as ids
    FROM collo_records
    WHERE (no_so IS NULL OR TRIM(no_so) = '') AND sid IS NOT NULL AND TRIM(sid) != ''
    GROUP BY pengelola, pelanggan, sid
    HAVING cnt > 1
""")
dup_sid_groups = c.fetchall()
print(f"Duplicate SID groups (empty SO) found: {len(dup_sid_groups)}")

for pengelola, pelanggan, sid, cnt, ids_str in dup_sid_groups:
    ids = [int(x) for x in ids_str.split(',') if int(x) not in collo_deleted]
    if len(ids) > 1:
        c.execute(f"SELECT id, start_date, end_date, status, is_active, rev_sewa_tahun, biaya_sewa_tahun FROM collo_records WHERE id IN ({','.join(map(str, ids))})")
        rows = c.fetchall()
        rows_sorted = sorted(rows, key=lambda r: (r[4], str(r[2]), r[5] or 0, r[0]), reverse=True)
        keep_id = rows_sorted[0][0]
        delete_ids = [r[0] for r in rows_sorted[1:]]
        collo_deleted.update(delete_ids)

# C. Group by (pengelola, pelanggan, originating, terminating) where both no_so and sid are empty
c.execute("""
    SELECT pengelola, pelanggan, originating, terminating, count(*) as cnt, GROUP_CONCAT(id) as ids
    FROM collo_records
    WHERE (no_so IS NULL OR TRIM(no_so) = '') AND (sid IS NULL OR TRIM(sid) = '')
      AND (originating IS NOT NULL AND TRIM(originating) != '' OR terminating IS NOT NULL AND TRIM(terminating) != '')
    GROUP BY pengelola, pelanggan, originating, terminating
    HAVING cnt > 1
""")
dup_loc_groups = c.fetchall()
print(f"Duplicate Location groups (empty SO & SID) found: {len(dup_loc_groups)}")

for pengelola, pelanggan, orig, term, cnt, ids_str in dup_loc_groups:
    ids = [int(x) for x in ids_str.split(',') if int(x) not in collo_deleted]
    if len(ids) > 1:
        c.execute(f"SELECT id, start_date, end_date, status, is_active, rev_sewa_tahun, biaya_sewa_tahun FROM collo_records WHERE id IN ({','.join(map(str, ids))})")
        rows = c.fetchall()
        rows_sorted = sorted(rows, key=lambda r: (r[4], str(r[2]), r[5] or 0, r[0]), reverse=True)
        keep_id = rows_sorted[0][0]
        delete_ids = [r[0] for r in rows_sorted[1:]]
        collo_deleted.update(delete_ids)

print(f"Total collo duplicate rows identified to delete: {len(collo_deleted)}")

# Execute Deletion in chunks of 500
collo_del_list = list(collo_deleted)
chunk_size = 500
for i in range(0, len(collo_del_list), chunk_size):
    chunk = collo_del_list[i:i+chunk_size]
    c.execute(f"DELETE FROM collo_records WHERE id IN ({','.join(map(str, chunk))})")

print(f"[DONE] Successfully deleted {len(collo_deleted)} duplicate rows from collo_records.")

conn.commit()

print("\n--- 3. POST-DEDUPLICATION VERIFICATION ---")
for table in ['collo_records', 'sitac_records', 'gangguan_records']:
    c.execute(f"SELECT count(*) FROM {table}")
    print(f"  {table}: {c.fetchone()[0]} rows")

c.execute("""
    SELECT 
        COUNT(*) as total_circuits,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_circuits,
        SUM(CASE WHEN status = 'ACTIVE' THEN rev_sewa_tahun ELSE 0 END) as active_revenue,
        SUM(CASE WHEN status = 'ACTIVE' THEN biaya_sewa_tahun ELSE 0 END) as active_cogs,
        SUM(CASE WHEN status = 'ACTIVE' THEN margin_rupiah ELSE 0 END) as active_margin
    FROM collo_records
""")
collo_m = c.fetchone()
print(f"\nCollo Active Circuits: {collo_m[1]} (from total {collo_m[0]})")
print(f"Collo Active Revenue: Rp {collo_m[2]:,.0f}")
print(f"Collo Active COGS: Rp {collo_m[3]:,.0f}")
print(f"Collo Active Margin: Rp {collo_m[4]:,.0f}")

c.execute("SELECT COUNT(*), SUM(biaya_gangguan) FROM gangguan_records")
g_m = c.fetchone()
print(f"\nGangguan Rows: {g_m[0]}, Total Biaya: Rp {g_m[1]:,.0f}")

conn.close()
print("\n[SUCCESS] Deduplication completed and verified!")
