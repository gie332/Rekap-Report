import sqlite3
import openpyxl

conn = sqlite3.connect('telecom_portal.db')
c = conn.cursor()

wb = openpyxl.load_workbook('Report Sitac  2026 FIX.xlsx', data_only=True, read_only=True)
ws = wb['Master RAW data']

# Let's inspect the sheets in Report Sitac:
# Could those 12 rows have their biaya awal in another sheet, e.g. 'DATA AWALDAN AHIR BIAYA' or 'DATA 0 BIAYA PERIZINAN 24-25'?
excel_rows = list(ws.iter_rows(values_only=True))[1:]

c.execute("SELECT id, no_pa, pelanggan, pic_perijinan, biaya_permintaan_awal, biaya_final, progress FROM sitac_records ORDER BY id ASC")
db_rows = c.fetchall()

print("--- 12 SITAC DISCREPANCIES AUDIT ---")
for idx in range(min(len(excel_rows), len(db_rows))):
    er = excel_rows[idx]
    dr = db_rows[idx]
    
    no_pa_ex = str(er[1] or '').strip()
    pel_ex = str(er[2] or '').strip()
    b_awal_ex = float(er[9]) if isinstance(er[9], (int, float)) else 0.0
    b_fin_ex = float(er[11]) if isinstance(er[11], (int, float)) else 0.0
    prog_ex = str(er[13] or '').strip().title()

    db_id, no_pa_db, pel_db, pic_db, b_awal_db, b_fin_db, prog_db = dr

    if abs(b_awal_ex - b_awal_db) > 1 or abs(b_fin_ex - b_fin_db) > 1 or prog_ex.lower() != prog_db.lower():
        print(f"\nID {db_id}: PA='{no_pa_db}', Pel='{pel_db}' (PIC: {pic_db})")
        print(f"  Excel Master RAW: Awal={b_awal_ex:,}, Final={b_fin_ex:,}, Prog={prog_ex}")
        print(f"  DB sitac_records: Awal={b_awal_db:,}, Final={b_fin_db:,}, Prog={prog_db}")
