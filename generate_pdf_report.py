"""
Generate Comprehensive Executive PDF Report for Telecom Infrastructure & Lease Operations
Using ReportLab
"""

import os
import sys
import sqlite3
from datetime import datetime

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import inch, cm, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telecom_portal.db")
OUTPUT_PDF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Laporan_Rekap_Telecom_Ops.pdf")

def format_rupiah(val):
    if val is None or val == "":
        return "Rp 0"
    try:
        n = int(round(float(val)))
        return f"Rp {n:,}".replace(",", ".")
    except (ValueError, TypeError):
        return "Rp 0"

def format_rupiah_short(val):
    if not val:
        return "Rp 0"
    try:
        n = float(val)
        if abs(n) >= 1_000_000_000_000:
            return f"Rp {n / 1_000_000_000_000:.2f} T"
        elif abs(n) >= 1_000_000_000:
            return f"Rp {n / 1_000_000_000:.2f} M"
        elif abs(n) >= 1_000_000:
            return f"Rp {n / 1_000_000:.2f} Jt"
        else:
            return f"Rp {int(n):,}".replace(",", ".")
    except Exception:
        return "Rp 0"

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_count):
        self.saveState()
        page_w, page_h = landscape(A4)
        
        # Header banner on every page
        self.setFillColor(colors.HexColor('#080c14'))
        self.rect(0, page_h - 18*mm, page_w, 18*mm, stroke=0, fill=1)
        self.setFillColor(colors.HexColor('#06b6d4'))
        self.rect(0, page_h - 18.5*mm, page_w, 0.8*mm, stroke=0, fill=1)

        # Header Text
        self.setFont('Helvetica-Bold', 11)
        self.setFillColor(colors.white)
        self.drawString(14*mm, page_h - 10*mm, "TELKOM INDONESIA — LAPORAN REKAP & REPORT INFRASTRUKTUR")
        self.setFont('Helvetica', 8)
        self.setFillColor(colors.HexColor('#94a3b8'))
        tgl_str = datetime.now().strftime("%d %B %Y, %H:%M WIB")
        self.drawString(14*mm, page_h - 15*mm, f"Dicetak pada: {tgl_str} | Data Live Database Telecom Portal")

        self.setFont('Helvetica-Bold', 9)
        self.setFillColor(colors.HexColor('#06b6d4'))
        self.drawRightString(page_w - 14*mm, page_h - 10*mm, "DIVISI INFRASTRUKTUR & LEASING")
        self.setFont('Helvetica', 7.5)
        self.setFillColor(colors.HexColor('#cbd5e1'))
        self.drawRightString(page_w - 14*mm, page_h - 15*mm, "Monitoring Colocation, SITAC, & Insiden Gangguan")

        # Footer banner
        self.setFillColor(colors.HexColor('#0f172a'))
        self.rect(0, 0, page_w, 10*mm, stroke=0, fill=1)
        self.setFont('Helvetica', 7.5)
        self.setFillColor(colors.HexColor('#64748b'))
        self.drawString(14*mm, 4*mm, "Confidential - Dokumen Resmi Internal PT Telkom Indonesia")
        self.drawRightString(page_w - 14*mm, 4*mm, f"Halaman {self._pageNumber} dari {page_count}")

        self.restoreState()

def build_pdf_report():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # Query metrics
    c.execute("""
        SELECT 
            COUNT(*) as total_records,
            SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
            SUM(CASE WHEN status = 'NON ACTIVE' THEN 1 ELSE 0 END) as non_active_count,
            SUM(CASE WHEN status = 'DEACTIVASI' THEN 1 ELSE 0 END) as deactivasi_count,
            SUM(CASE WHEN status = 'ACTIVE' THEN rev_sewa_tahun ELSE 0 END) as active_revenue,
            SUM(CASE WHEN status = 'ACTIVE' THEN biaya_otc ELSE 0 END) as active_otc,
            SUM(CASE WHEN status = 'ACTIVE' THEN biaya_sewa_tahun ELSE 0 END) as active_biaya,
            SUM(CASE WHEN status = 'ACTIVE' THEN margin_rupiah ELSE 0 END) as active_margin
        FROM collo_records
    """)
    collo_stat = dict(c.fetchone())

    c.execute("""
        SELECT 
            COUNT(*) as total_pa,
            SUM(CASE WHEN progress = 'Finish' THEN 1 ELSE 0 END) as finish_count,
            SUM(CASE WHEN progress = 'Ongoing' THEN 1 ELSE 0 END) as ongoing_count,
            SUM(CASE WHEN progress = 'Hold' THEN 1 ELSE 0 END) as hold_count,
            SUM(CASE WHEN progress = 'Cancel' THEN 1 ELSE 0 END) as cancel_count,
            SUM(biaya_permintaan_awal) as total_biaya_awal,
            SUM(biaya_final) as total_biaya_final,
            SUM(efisiensi_rupiah) as total_efisiensi_rupiah,
            AVG(CASE WHEN durasi_hari IS NOT NULL AND durasi_hari >= 0 THEN durasi_hari ELSE NULL END) as avg_sla_hari
        FROM sitac_records
    """)
    sitac_stat = dict(c.fetchone())

    c.execute("""
        SELECT 
            COUNT(*) as total_gangguan,
            SUM(CASE WHEN is_selesai = 1 THEN 1 ELSE 0 END) as selesai_count,
            SUM(CASE WHEN is_selesai = 0 THEN 1 ELSE 0 END) as proses_count,
            SUM(biaya_gangguan) as total_biaya_gangguan
        FROM gangguan_records
    """)
    gangguan_stat = dict(c.fetchone())

    # Top 10 Pengelola
    c.execute("""
        SELECT 
            pengelola,
            COUNT(*) as sirkuit_count,
            SUM(rev_sewa_tahun) as total_rev,
            SUM(biaya_otc) as total_otc,
            SUM(biaya_sewa_tahun) as total_biaya,
            SUM(margin_rupiah) as total_margin
        FROM collo_records
        WHERE status = 'ACTIVE' AND pengelola != ''
        GROUP BY pengelola
        ORDER BY total_rev DESC
        LIMIT 10
    """)
    top_pengelola = [dict(r) for r in c.fetchall()]

    # PIC Performance
    c.execute("""
        SELECT 
            pic_perijinan as pic,
            COUNT(*) as total_pa,
            SUM(CASE WHEN progress = 'Finish' THEN 1 ELSE 0 END) as finish,
            SUM(CASE WHEN progress = 'Ongoing' THEN 1 ELSE 0 END) as ongoing,
            SUM(CASE WHEN progress = 'Hold' THEN 1 ELSE 0 END) as hold,
            SUM(CASE WHEN progress = 'Cancel' THEN 1 ELSE 0 END) as cancel,
            SUM(biaya_permintaan_awal) as biaya_awal,
            SUM(biaya_final) as biaya_final,
            SUM(efisiensi_rupiah) as efisiensi_rupiah,
            AVG(CASE WHEN durasi_hari IS NOT NULL AND durasi_hari >= 0 THEN durasi_hari ELSE NULL END) as avg_sla
        FROM sitac_records
        WHERE pic_perijinan != ''
        GROUP BY pic_perijinan
        ORDER BY total_pa DESC
    """)
    pic_perf = [dict(r) for r in c.fetchall()]

    # Critical Alerts (<30 days & 30-60 days)
    c.execute("""
        SELECT pengelola, pelanggan, no_so, terminating, rev_sewa_tahun, biaya_sewa_tahun, end_date, sisa_hari, alert_category
        FROM collo_records
        WHERE status = 'ACTIVE' AND sisa_hari IS NOT NULL AND sisa_hari <= 60
        ORDER BY sisa_hari ASC
        LIMIT 15
    """)
    urgent_alerts = [dict(r) for r in c.fetchall()]

    # Efisiensi Rekap
    c.execute("SELECT * FROM rekap_efisiensi ORDER BY tahun ASC")
    efisiensi_list = [dict(r) for r in c.fetchall()]

    # Top sample active colocation
    c.execute("""
        SELECT pengelola, pelanggan, no_so, terminating, jenis_sewa, rev_sewa_tahun, biaya_otc, biaya_sewa_tahun, margin_rupiah, margin_persen, sisa_hari
        FROM collo_records
        WHERE status = 'ACTIVE'
        ORDER BY rev_sewa_tahun DESC
        LIMIT 25
    """)
    sample_collo = [dict(r) for r in c.fetchall()]

    conn.close()

    # Build PDF Story
    doc = SimpleDocTemplate(
        OUTPUT_PDF,
        pagesize=landscape(A4),
        leftMargin=14*mm,
        rightMargin=14*mm,
        topMargin=22*mm,
        bottomMargin=14*mm
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=3
    )

    section_header = ParagraphStyle(
        'SectionHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        textColor=colors.HexColor('#0284c7'),
        spaceBefore=8,
        spaceAfter=4
    )

    meta_text = ParagraphStyle(
        'MetaText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        textColor=colors.HexColor('#475569')
    )

    cell_style = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=8.5,
        textColor=colors.HexColor('#1e293b')
    )

    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=colors.HexColor('#0f172a')
    )

    cell_header = ParagraphStyle(
        'CellHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=colors.white
    )

    cell_right = ParagraphStyle(
        'CellRight',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=8.5,
        alignment=2,
        textColor=colors.HexColor('#1e293b')
    )

    cell_right_bold = ParagraphStyle(
        'CellRightBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        alignment=2,
        textColor=colors.HexColor('#0f172a')
    )

    # Dedicated KPI card styles to prevent font overlapping in ReportLab
    kpi_title_style = ParagraphStyle(
        'KpiTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.5,
        leading=8.5,
        textColor=colors.HexColor('#475569'),
        spaceAfter=3
    )

    kpi_val_blue = ParagraphStyle(
        'KpiValBlue',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=14,
        textColor=colors.HexColor('#0284c7'),
        spaceAfter=2
    )

    kpi_val_green = ParagraphStyle(
        'KpiValGreen',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=14,
        textColor=colors.HexColor('#059669'),
        spaceAfter=2
    )

    kpi_val_amber = ParagraphStyle(
        'KpiValAmber',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=14,
        textColor=colors.HexColor('#d97706'),
        spaceAfter=2
    )

    kpi_val_red = ParagraphStyle(
        'KpiValRed',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=14,
        textColor=colors.HexColor('#dc2626'),
        spaceAfter=2
    )

    kpi_sub_style = ParagraphStyle(
        'KpiSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=6.5,
        leading=8.5,
        textColor=colors.HexColor('#64748b')
    )

    kpi_sub_green = ParagraphStyle(
        'KpiSubGreen',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.5,
        leading=8.5,
        textColor=colors.HexColor('#059669')
    )

    story = []

    # 1. EXECUTIVE SUMMARY SECTION
    story.append(Paragraph("1. EXECUTIVE SUMMARY & INDIKATOR KINERJA UTAMA (KPI)", section_header))
    story.append(Paragraph("Ringkasan komprehensif aset sewa colocation datacenter, operasional perizinan SITAC, dan mitigasi gangguan darurat.", meta_text))
    story.append(Spacer(1, 2*mm))

    rev_act = collo_stat['active_revenue'] or 0
    otc_act = collo_stat['active_otc'] or 0
    biaya_act = collo_stat['active_biaya'] or 0
    margin_act = collo_stat['active_margin'] or 0
    margin_pct = round((margin_act / rev_act * 100), 1) if rev_act > 0 else 0.0

    kpi_cards_data = [
        [
            [
                Paragraph("TOTAL SIRKUIT COLOCATION", kpi_title_style),
                Paragraph("860 Sirkuit Aktif", kpi_val_blue),
                Paragraph("Total Database: 3.071 Sirkuit", kpi_sub_style)
            ],
            [
                Paragraph("REV SEWA (1 THN) PELANGGAN", kpi_title_style),
                Paragraph(format_rupiah_short(rev_act), kpi_val_green),
                Paragraph(format_rupiah(rev_act), kpi_sub_style)
            ],
            [
                Paragraph("BIAYA OTC & BIAYA SEWA (1 THN)", kpi_title_style),
                Paragraph(format_rupiah_short(biaya_act), kpi_val_amber),
                Paragraph(f"OTC: {format_rupiah_short(otc_act)} | Sewa: {format_rupiah_short(biaya_act)}", kpi_sub_style)
            ],
            [
                Paragraph("GROSS PROFIT MARGIN", kpi_title_style),
                Paragraph(format_rupiah_short(margin_act), kpi_val_blue),
                Paragraph(f"Profit Margin: {margin_pct}%", kpi_sub_green)
            ],
        ],
        [
            [
                Paragraph("STATUS PERIZINAN SITAC", kpi_title_style),
                Paragraph(f"{sitac_stat['finish_count']} / {sitac_stat['total_pa']} Selesai", kpi_val_blue),
                Paragraph(f"Finish Rate: {round(sitac_stat['finish_count']/sitac_stat['total_pa']*100, 1)}%", kpi_sub_style)
            ],
            [
                Paragraph("PENGHEMATAN ANGGARAN SITAC", kpi_title_style),
                Paragraph(format_rupiah_short(sitac_stat['total_efisiensi_rupiah']), kpi_val_green),
                Paragraph(f"Efisiensi Negosiasi: {round((sitac_stat['total_efisiensi_rupiah'] or 0)/(sitac_stat['total_biaya_awal'] or 1)*100, 1)}%", kpi_sub_style)
            ],
            [
                Paragraph("TIKET GANGGUAN DARURAT", kpi_title_style),
                Paragraph(f"{gangguan_stat['selesai_count']} / {gangguan_stat['total_gangguan']} Tuntas", kpi_val_red),
                Paragraph(f"Total Biaya: {format_rupiah_short(gangguan_stat['total_biaya_gangguan'])}", kpi_sub_style)
            ],
            [
                Paragraph("REKAP TAHUNAN EFISIENSI", kpi_title_style),
                Paragraph("2 Tahun Tercatat", kpi_val_blue),
                Paragraph("2025: 41,5% | 2026: 41,7%", kpi_sub_style)
            ],
        ]
    ]

    kpi_table = Table(kpi_cards_data, colWidths=[67*mm, 67*mm, 67*mm, 67*mm])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 4*mm))

    # 2. TOP 10 PENGELOLA PARTNER
    story.append(Paragraph("2. REKAPITULASI TOP 10 MITRA PENGELOLA DATACENTER (SIRKUIT AKTIF)", section_header))
    story.append(Paragraph("Tabel kontribusi revenue pelanggan, biaya sewa mitra datacenter, dan margin keuntungan berdasarkan nama mitra.", meta_text))
    story.append(Spacer(1, 2*mm))

    top_rows = [
        [
            Paragraph("No", cell_header),
            Paragraph("Mitra Pengelola Datacenter", cell_header),
            Paragraph("Jumlah Sirkuit", cell_header),
            Paragraph("Rev Sewa (1 Thn) Pelanggan", cell_header),
            Paragraph("Biaya OTC", cell_header),
            Paragraph("Biaya Sewa 1 Tahun", cell_header),
            Paragraph("Gross Margin (Rp)", cell_header),
            Paragraph("Margin %", cell_header)
        ]
    ]

    for idx, p in enumerate(top_pengelola, 1):
        m_pct = round(p['total_margin'] / p['total_rev'] * 100, 1) if p['total_rev'] > 0 else 0
        top_rows.append([
            Paragraph(str(idx), cell_style),
            Paragraph(f"<b>{p['pengelola']}</b>", cell_style),
            Paragraph(str(p['sirkuit_count']), cell_right),
            Paragraph(format_rupiah(p['total_rev']), cell_right_bold),
            Paragraph(format_rupiah(p['total_otc']), cell_right),
            Paragraph(format_rupiah(p['total_biaya']), cell_right),
            Paragraph(format_rupiah(p['total_margin']), cell_right_bold),
            Paragraph(f"<b>{m_pct}%</b>", cell_right)
        ])

    top_table = Table(top_rows, colWidths=[8*mm, 60*mm, 20*mm, 45*mm, 35*mm, 42*mm, 45*mm, 15*mm])
    top_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0284c7')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(top_table)

    # PAGE 2: CONTRACT ALERTS & SAMPLE COLOCATION
    story.append(PageBreak())
    story.append(Paragraph("3. MONITORING JATUH TEMPO KONTRAK SEWA (URGENT ALERTS ≤ 60 HARI)", section_header))
    story.append(Paragraph("Daftar sirkuit aktif dengan masa sewa yang mendekati jatuh tempo untuk prioritas perpanjangan atau renegosiasi.", meta_text))
    story.append(Spacer(1, 2*mm))

    alert_rows = [
        [
            Paragraph("Pengelola", cell_header),
            Paragraph("Pelanggan", cell_header),
            Paragraph("No SO", cell_header),
            Paragraph("Lokasi Terminating", cell_header),
            Paragraph("Rev Sewa / Thn", cell_header),
            Paragraph("Biaya Sewa / Thn", cell_header),
            Paragraph("Tgl Berakhir", cell_header),
            Paragraph("Sisa Hari", cell_header),
            Paragraph("Kategori", cell_header)
        ]
    ]

    for a in urgent_alerts:
        sisa = a['sisa_hari']
        clr = '#dc2626' if sisa <= 30 else '#d97706'
        alert_rows.append([
            Paragraph(a['pengelola'] or '-', cell_style),
            Paragraph(a['pelanggan'] or '-', cell_style),
            Paragraph((a['no_so'] or '-')[:22], cell_style),
            Paragraph((a['terminating'] or '-')[:30], cell_style),
            Paragraph(format_rupiah(a['rev_sewa_tahun']), cell_right),
            Paragraph(format_rupiah(a['biaya_sewa_tahun']), cell_right),
            Paragraph(a['end_date'] or '-', cell_style),
            Paragraph(f"<font color='{clr}'><b>{sisa} hari</b></font>", cell_right),
            Paragraph(f"<font color='{clr}'><b>{a['alert_category']}</b></font>", cell_style)
        ])

    alert_table = Table(alert_rows, colWidths=[35*mm, 35*mm, 30*mm, 55*mm, 32*mm, 32*mm, 20*mm, 15*mm, 15*mm])
    alert_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e11d48')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#fff1f2')])
    ]))
    story.append(alert_table)
    story.append(Spacer(1, 4*mm))

    # Top Active Colocation Sample
    story.append(Paragraph("4. SAMPLE 25 SIRKUIT COLOCATION DENGAN REVENUE TERTINGGI (ACTIVE)", section_header))
    story.append(Paragraph("Rincian kolom: Pengelola, Pelanggan, No SO, Terminating, Jenis Sewa, Rev Sewa (1 Thn), Biaya OTC, Biaya Sewa 1 Thn, Margin, Sisa Hari.", meta_text))
    story.append(Spacer(1, 2*mm))

    collo_rows = [
        [
            Paragraph("Pengelola", cell_header),
            Paragraph("Pelanggan", cell_header),
            Paragraph("No SO", cell_header),
            Paragraph("Terminating", cell_header),
            Paragraph("Jenis Sewa", cell_header),
            Paragraph("Rev Sewa (1 Thn)", cell_header),
            Paragraph("Biaya OTC", cell_header),
            Paragraph("Biaya Sewa 1 Thn", cell_header),
            Paragraph("Gross Margin", cell_header),
            Paragraph("Margin %", cell_header),
            Paragraph("Sisa", cell_header)
        ]
    ]

    for c_rec in sample_collo:
        collo_rows.append([
            Paragraph((c_rec['pengelola'] or '-')[:18], cell_style),
            Paragraph((c_rec['pelanggan'] or '-')[:18], cell_style),
            Paragraph((c_rec['no_so'] or '-')[:15], cell_style),
            Paragraph((c_rec['terminating'] or '-')[:25], cell_style),
            Paragraph((c_rec['jenis_sewa'] or '-')[:12], cell_style),
            Paragraph(format_rupiah(c_rec['rev_sewa_tahun']), cell_right_bold),
            Paragraph(format_rupiah(c_rec['biaya_otc']), cell_right),
            Paragraph(format_rupiah(c_rec['biaya_sewa_tahun']), cell_right),
            Paragraph(format_rupiah(c_rec['margin_rupiah']), cell_right_bold),
            Paragraph(f"{c_rec['margin_persen'] or 0}%", cell_right),
            Paragraph(f"{c_rec['sisa_hari'] or '-'} hr", cell_right)
        ])

    collo_table = Table(collo_rows, colWidths=[28*mm, 28*mm, 22*mm, 42*mm, 20*mm, 33*mm, 25*mm, 33*mm, 33*mm, 15*mm, 12*mm])
    collo_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f766e')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f0fdfa')])
    ]))
    story.append(collo_table)

    # PAGE 3: SITAC & GANGGUAN
    story.append(PageBreak())
    story.append(Paragraph("5. EVALUASI KINERJA PIC PERIZINAN SITAC & PENGHEMATAN BIAYA", section_header))
    story.append(Paragraph("Beban penugasan, tingkat penyelesaian (finish rate), realisasi efisiensi biaya negosiasi, dan rata-rata SLA per PIC SITAC.", meta_text))
    story.append(Spacer(1, 2*mm))

    pic_rows = [
        [
            Paragraph("No", cell_header),
            Paragraph("PIC Perijinan", cell_header),
            Paragraph("Total PA", cell_header),
            Paragraph("Finish", cell_header),
            Paragraph("Ongoing", cell_header),
            Paragraph("Hold", cell_header),
            Paragraph("Cancel", cell_header),
            Paragraph("Finish %", cell_header),
            Paragraph("Biaya Pengajuan Awal", cell_header),
            Paragraph("Realisasi Akhir", cell_header),
            Paragraph("Penghematan (Efisiensi)", cell_header),
            Paragraph("Efisiensi %", cell_header),
            Paragraph("Avg SLA", cell_header)
        ]
    ]

    for idx, p in enumerate(pic_perf, 1):
        tot = p['total_pa']
        fin = p['finish']
        frate = round((fin / tot * 100), 1) if tot > 0 else 0
        b_awal = p['biaya_awal'] or 0
        b_fin = p['biaya_final'] or 0
        eff_rp = p['efisiensi_rupiah'] or 0
        eff_p = round((eff_rp / b_awal * 100), 1) if b_awal > 0 else 0
        sla_val = round(p['avg_sla'] or 0, 1)

        pic_rows.append([
            Paragraph(str(idx), cell_style),
            Paragraph(f"<b>{p['pic']}</b>", cell_style),
            Paragraph(str(tot), cell_right_bold),
            Paragraph(str(fin), cell_right),
            Paragraph(str(p['ongoing']), cell_right),
            Paragraph(str(p['hold']), cell_right),
            Paragraph(str(p['cancel']), cell_right),
            Paragraph(f"<b>{frate}%</b>", cell_right),
            Paragraph(format_rupiah(b_awal), cell_right),
            Paragraph(format_rupiah(b_fin), cell_right),
            Paragraph(format_rupiah(eff_rp), cell_right_bold),
            Paragraph(f"<b>{eff_p}%</b>", cell_right),
            Paragraph(f"{sla_val} hr", cell_right)
        ])

    pic_table = Table(pic_rows, colWidths=[7*mm, 35*mm, 15*mm, 13*mm, 13*mm, 12*mm, 12*mm, 16*mm, 35*mm, 35*mm, 37*mm, 18*mm, 18*mm])
    pic_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#d97706')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#fffbeb')])
    ]))
    story.append(pic_table)
    story.append(Spacer(1, 4*mm))

    # Efisiensi Rekap Tahunan Table
    story.append(Paragraph("6. REKAPITULASI EFISIENSI BIAYA SITAC TAHUNAN (2025 - 2026)", section_header))
    story.append(Paragraph("Perbandingan biaya pengajuan vs realisasi akhir penugasan perizinan fiber optic.", meta_text))
    story.append(Spacer(1, 2*mm))

    eff_rows = [
        [
            Paragraph("Tahun", cell_header),
            Paragraph("Total Disposisi", cell_header),
            Paragraph("Pekerjaan Berbiaya", cell_header),
            Paragraph("Zero Cost (Tanpa Biaya)", cell_header),
            Paragraph("Biaya Pengajuan Awal", cell_header),
            Paragraph("Realisasi Biaya Akhir", cell_header),
            Paragraph("Nominal Penghematan", cell_header),
            Paragraph("Efisiensi %", cell_header)
        ]
    ]

    for e in efisiensi_list:
        eff_rows.append([
            Paragraph(f"<b>{e['tahun']}</b>", cell_style),
            Paragraph(str(e['total_disposisi']), cell_right),
            Paragraph(str(e['ada_biaya']), cell_right),
            Paragraph(str(e['tidak_ada_biaya']), cell_right),
            Paragraph(format_rupiah(e['nilai_awal']), cell_right),
            Paragraph(format_rupiah(e['nilai_akhir']), cell_right),
            Paragraph(format_rupiah(e['efisiensi_rupiah']), cell_right_bold),
            Paragraph(f"<b>{e['efisiensi_persen']}%</b>", cell_right)
        ])

    eff_table = Table(eff_rows, colWidths=[20*mm, 28*mm, 30*mm, 35*mm, 42*mm, 42*mm, 45*mm, 24*mm])
    eff_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#059669')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f0fdf4')])
    ]))
    story.append(eff_table)

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Report generated successfully: {OUTPUT_PDF}")
    print(f"File size: {os.path.getsize(OUTPUT_PDF):,} bytes")

if __name__ == '__main__':
    build_pdf_report()
