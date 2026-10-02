import openpyxl
import sqlite3
import re
import datetime

FILE_COLLO = "Rekap Collo x Interkoneksi 2024 V2 ROM 22 Nov(1).xlsx"
wb = openpyxl.load_workbook(FILE_COLLO, data_only=True, read_only=True)
ws = wb["Raw Data"]

def clean_text(val):
    if val is None: return ""
    s = str(val).strip()
    if s.lower() in ("none", "null", "-"): return ""
    return s

def parse_currency(val):
    if val is None: return 0
    if isinstance(val, (int, float)): return int(round(val))
    val_str = str(val).strip()
    if not val_str or val_str in ("-", "None", "0"): return 0
    cleaned = re.sub(r'[^\d.,]', '', val_str)
    if '.' in cleaned and ',' not in cleaned:
        cleaned = cleaned.replace('.', '')
    elif ',' in cleaned and '.' in cleaned:
        cleaned = cleaned.replace('.', '').replace(',', '.')
    elif ',' in cleaned:
        cleaned = cleaned.replace(',', '.')
    try:
        return int(round(float(cleaned)))
    except:
        return 0

raw_collo = []
status_cnt = {}
rev_by_status = {}

for idx, r in enumerate(ws.iter_rows(values_only=True)):
    if idx == 0: continue
    pengelola = clean_text(r[1] if len(r) > 1 else None)
    pelanggan = clean_text(r[2] if len(r) > 2 else None)
    if not pengelola and not pelanggan: continue

    no_so = clean_text(r[9] if len(r) > 9 else "")
    sid = clean_text(r[10] if len(r) > 10 else "")
    rev_sewa = parse_currency(r[15] if len(r) > 15 else None)
    biaya_otc = parse_currency(r[17] if len(r) > 17 else None)
    biaya_sewa = parse_currency(r[18] if len(r) > 18 else None)

    status_raw = clean_text(r[22] if len(r) > 22 else "").upper()
    if "ACTIVE" in status_raw and "NON" not in status_raw and "DE" not in status_raw:
        status = "ACTIVE"
    elif "DEACTIVASI" in status_raw or "DEAKTIVASI" in status_raw:
        status = "DEACTIVASI"
    elif "NON" in status_raw:
        status = "NON ACTIVE"
    else:
        status = status_raw or "NON ACTIVE"

    status_cnt[status] = status_cnt.get(status, 0) + 1
    rev_by_status[status] = rev_by_status.get(status, 0) + rev_sewa
    raw_collo.append({
        'idx': idx + 1,
        'pengelola': pengelola,
        'pelanggan': pelanggan,
        'no_so': no_so,
        'sid': sid,
        'status': status,
        'rev_sewa': rev_sewa,
        'biaya_otc': biaya_otc,
        'biaya_sewa': biaya_sewa
    })

print(f"Total valid Collocation rows extracted from Excel 'Raw Data': {len(raw_collo)}")
print(f"Status breakdown in Excel: {status_cnt}")
print(f"Revenue breakdown in Excel: { {k: f'Rp {v:,.0f}' for k, v in rev_by_status.items()} }")

conn = sqlite3.connect('telecom_portal.db')
c = conn.cursor()
c.execute("SELECT COUNT(*) FROM collo_records")
db_count = c.fetchone()[0]
c.execute("SELECT status, COUNT(*), SUM(rev_sewa_tahun), SUM(biaya_sewa_tahun) FROM collo_records GROUP BY status")
db_stats = c.fetchall()

print(f"\nDatabase 'collo_records' count: {db_count}")
for st, cnt, rev, b in db_stats:
    print(f"  DB Status '{st}': count={cnt}, Rev={rev or 0:,.0f}, Biaya={b or 0:,.0f}")
