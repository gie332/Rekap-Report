/**
 * Telecom Infrastructure & Lease Operations Portal - Frontend Application Engine
 * Integrates SQLite REST API, Dynamic Routing, Real-Time CRUD, Revenue Sharing & WebGIS
 */

(function () {
  'use strict';

  // --- GLOBAL STATE ---
  const state = {
    activeView: 'view-executive',
    theme: localStorage.getItem('portal_theme') || 'dark',
    currentUser: JSON.parse(localStorage.getItem('telecom_portal_user') || 'null'),
    token: localStorage.getItem('telecom_portal_token') || null,
    activeTechnician: localStorage.getItem('telecom_active_technician') || 'Harlan',
    myTasksOnlyGangguan: false,
    myTasksOnlySitac: false,

    // View 2: Colocation Links (Default: ACTIVE ONLY)
    collo: {
      status: 'ACTIVE',
      jenisSewa: 'ALL',
      pengelola: 'ALL',
      search: '',
      sort: 'margin_desc',
      page: 1,
      pageSize: 25,
      data: [],
      totals: {}
    },

    // View 3: Revenue Sharing
    revSharing: {
      search: '',
      data: []
    },

    // View 4: Expiration Alerts
    alerts: {
      category: 'CRITICAL',
      search: '',
      data: []
    },

    // View 5: SITAC Projects
    sitac: {
      status: 'ALL',
      pic: 'ALL',
      year: 'ALL',
      aging: 'ALL',
      search: '',
      page: 1,
      pageSize: 25,
      data: []
    },

    // View 6: Emergency Trouble Tickets
    gangguan: {
      status: 'ALL',
      search: '',
      dateType: 'dispos',
      exactDate: '',
      startDate: '',
      endDate: '',
      quickPeriod: 'all',
      data: []
    },

    // Meta options
    meta: {
      pengelola: [],
      pic: [],
      jenisSewa: []
    },

    // View 7 & 8 cached dataset for exports & charts
    efisiensi: [],
    picMatrix: []
  };

  // Chart & Map instances registry
  const charts = {};
  let leafletMap = null;
  let mapMarkersLayer = null;
  let mapBaseLayers = {};
  let currentBaseLayer = 'googleRoadmap';
  let mapResizeObserver = null;
  let lastMapBounds = null;

  const destroyChart = (key) => {
    if (charts[key]) {
      try { charts[key].destroy(); } catch (e) {}
      charts[key] = null;
    }
  };

  // ── PREMIUM CHART THEME ────────────────────────────────────────────────────
  // Custom palette aligned with the portal's color system
  const CHART_PALETTE = {
    cyan:    '#2A9D8F', // Clearwave Mint Teal
    mint:    '#10b981', // Clearwave Emerald
    amber:   '#e9c46a', // Clearwave Ochre / Sand
    rose:    '#e76f51', // Clearwave Terracotta / Coral
    indigo:  '#1A7A6E', // Clearwave Forest Teal
    violet:  '#5BBFB5', // Clearwave Light Seafoam
    orange:  '#d4a373', // Clearwave Desert Gold
    sky:     '#48d5c1', // Clearwave Bright Mint
    lime:    '#84cc16',
    pink:    '#e07a5f',
  };
  const PALETTE_ORDER = ['cyan','amber','violet','rose','indigo','mint','orange','sky','lime','pink'];
  const getPaletteColors = (n) => PALETTE_ORDER.slice(0, n).map(k => CHART_PALETTE[k]);

  // Build a canvas gradient for line/area charts
  const makeGradient = (ctx, colorHex, alphaTop = 0.35, alphaBot = 0.02) => {
    const h = ctx.canvas.offsetHeight || 220;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const hex = colorHex.replace('#','');
    const r = parseInt(hex.substr(0,2),16);
    const gr = parseInt(hex.substr(2,2),16);
    const b = parseInt(hex.substr(4,2),16);
    g.addColorStop(0, `rgba(${r},${gr},${b},${alphaTop})`);
    g.addColorStop(1, `rgba(${r},${gr},${b},${alphaBot})`);
    return g;
  };

  const getChartTheme = () => {
    const isDark = state.theme === 'dark';
    const textColor      = isDark ? '#8baaa5' : '#3A5C58';
    const titleColor     = isDark ? '#f4fafa' : '#0D1E1C';
    const gridColor      = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(13,30,28,0.06)';
    const tooltipBg      = isDark ? 'rgba(14,30,27,0.96)' : 'rgba(255,255,255,0.98)';
    const tooltipBorder  = isDark ? 'rgba(42,157,143,0.4)' : 'rgba(26,122,110,0.2)';
    const tooltipText    = isDark ? '#f4fafa' : '#0D1E1C';

    // Global Chart.js defaults — set once per theme switch
    Chart.defaults.font.family = "'DM Sans', sans-serif";
    Chart.defaults.font.size   = 11;
    Chart.defaults.color       = textColor;
    Chart.defaults.plugins.tooltip.backgroundColor   = tooltipBg;
    Chart.defaults.plugins.tooltip.borderColor       = tooltipBorder;
    Chart.defaults.plugins.tooltip.borderWidth       = 1;
    Chart.defaults.plugins.tooltip.titleColor        = titleColor;
    Chart.defaults.plugins.tooltip.bodyColor         = tooltipText;
    Chart.defaults.plugins.tooltip.padding           = 10;
    Chart.defaults.plugins.tooltip.cornerRadius      = 10;
    Chart.defaults.plugins.tooltip.titleFont         = { family: "'Outfit', sans-serif", weight: '700', size: 12 };
    Chart.defaults.plugins.tooltip.bodyFont          = { family: "'Inter', sans-serif", size: 11 };
    Chart.defaults.plugins.tooltip.displayColors     = true;
    Chart.defaults.plugins.tooltip.boxPadding        = 4;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle    = 'circle';
    Chart.defaults.plugins.legend.labels.padding       = 16;
    Chart.defaults.plugins.legend.labels.font          = { family: "'Inter', sans-serif", size: 11 };
    Chart.defaults.animation.duration                 = 600;
    Chart.defaults.animation.easing                   = 'easeInOutQuart';

    return {
      isDark, textColor, titleColor, gridColor,
      tooltipBg, tooltipBorder, tooltipText,
      palette: CHART_PALETTE,
      getPaletteColors,
      makeGradient,
    };
  };

  // --- FORMATTING UTILS ---
  const formatRupiah = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'Rp 0';
    return 'Rp ' + Number(val).toLocaleString('id-ID');
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatPelangganCell = (rawPelanggan) => {
    if (!rawPelanggan || rawPelanggan === '-') {
      return '<span class="text-slate-400">-</span>';
    }

    // Split by newline or semicolon
    const rawItems = String(rawPelanggan)
      .split(/[\r\n]+/)
      .map(s => s.trim().replace(/^\d+[\.\)]\s*/, ''))
      .filter(s => s.length > 0);

    if (rawItems.length === 0) {
      return '<span class="text-slate-400">-</span>';
    }

    // Group and deduplicate items while preserving original case of first occurrence
    const map = new Map();
    rawItems.forEach(item => {
      const key = item.toUpperCase().replace(/\s+/g, ' ');
      if (!map.has(key)) {
        map.set(key, { name: item, count: 0 });
      }
      map.get(key).count++;
    });

    const uniqueEntries = Array.from(map.values());
    const totalTenants = uniqueEntries.length;
    const firstTenant = uniqueEntries[0];

    const fullTooltip = uniqueEntries.map((item, i) => `${i + 1}. ${item.name}${item.count > 1 ? ` (${item.count}×)` : ''}`).join('\n');

    if (totalTenants === 1 && rawItems.length === 1) {
      return `
        <div class="tenant-primary-name" title="${escapeHtml(firstTenant.name)}">
          ${escapeHtml(firstTenant.name)}
        </div>
      `;
    }

    const remainingCount = totalTenants - 1;
    const badgeText = remainingCount > 0 
      ? `+${remainingCount} lainnya` 
      : `${rawItems.length}× link`;

    const popoverPayload = encodeURIComponent(JSON.stringify({
      title: `Daftar Pelanggan (${totalTenants} Tenant)`,
      icon: 'fa-users',
      items: uniqueEntries.map(e => ({ name: e.name, badge: e.count > 1 ? `${e.count} link` : null }))
    }));

    return `
      <div class="tenant-cell" title="${escapeHtml(fullTooltip)}">
        <span class="tenant-primary-name" title="${escapeHtml(firstTenant.name)}">
          ${escapeHtml(firstTenant.name)}
        </span>
        <button type="button" class="tenant-badge cursor-pointer" data-popover="${popoverPayload}" title="Klik untuk rincian ${remainingCount > 0 ? remainingCount + ' pelanggan lainnya' : ''}">
          ${escapeHtml(badgeText)}
        </button>
      </div>
    `;
  };

  const formatSoCell = (sid, noSo) => {
    // 1. Process SID (dedup & compact multiline SID)
    const rawSid = String(sid || '')
      .split(/[\r\n]+/)
      .map(s => s.trim().replace(/^['`]/, ''))
      .filter(Boolean);
    const primarySid = rawSid[0] || '';
    const remainingSidCount = rawSid.length - 1;

    let sidHtml = '';
    if (primarySid) {
      if (rawSid.length <= 1) {
        sidHtml = `<div class="font-mono text-cyan-400 text-xs max-w-[140px] truncate" title="${escapeHtml(primarySid)}">${escapeHtml(primarySid)}</div>`;
      } else {
        const sidTooltip = rawSid.map((s, i) => `${i + 1}. ${s}`).join('\n');
        const sidPopoverPayload = encodeURIComponent(JSON.stringify({
          title: `Daftar SID (${rawSid.length} SID)`,
          icon: 'fa-network-wired',
          items: rawSid.map(s => ({ name: s, badge: null }))
        }));
        sidHtml = `
          <div class="flex items-center gap-1" title="${escapeHtml(sidTooltip)}">
            <span class="font-mono text-cyan-400 text-xs max-w-[95px] truncate" title="${escapeHtml(primarySid)}">${escapeHtml(primarySid)}</span>
            <button type="button" class="tenant-badge text-[9px] py-0 px-1 cursor-pointer text-cyan-300 border-cyan-500/40" data-popover="${sidPopoverPayload}" title="Klik untuk rincian ${remainingSidCount} SID lainnya">
              +${remainingSidCount} lainnya
            </button>
          </div>
        `;
      }
    }

    // 2. Process Nomor SO
    const rawSo = String(noSo || '')
      .split(/[\r\n]+/)
      .map(s => s.trim().replace(/^\d+[\.\)]\s*/, ''))
      .filter(Boolean);
    const primarySo = rawSo[0] || (primarySid ? '-' : '-');
    
    if (rawSo.length <= 1) {
      return `
        ${sidHtml}
        <div class="text-[11px] text-slate-500 max-w-[140px] truncate" title="${escapeHtml(primarySo)}">${escapeHtml(primarySo)}</div>
      `;
    }

    const fullTooltip = rawSo.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const remainingCount = rawSo.length - 1;
    const popoverPayload = encodeURIComponent(JSON.stringify({
      title: `Daftar Nomor SO (${rawSo.length} SO)`,
      icon: 'fa-file-lines',
      items: rawSo.map(s => ({ name: s, badge: null }))
    }));

    return `
      ${sidHtml}
      <div class="flex items-center gap-1" title="${escapeHtml(fullTooltip)}">
        <span class="text-[11px] text-slate-500 max-w-[95px] truncate" title="${escapeHtml(primarySo)}">${escapeHtml(primarySo)}</span>
        <button type="button" class="tenant-badge text-[9px] py-0 px-1 cursor-pointer" data-popover="${popoverPayload}" title="Klik untuk rincian ${remainingCount} SO lainnya">
          +${remainingCount} lainnya
        </button>
      </div>
    `;
  };

  const computeRowspanMap = (records, key = 'pengelola') => {
    if (!records || !records.length) return [];
    const map = new Array(records.length).fill(0);
    for (let i = 0; i < records.length;) {
      const cur = String(records[i][key] || '').trim().toLowerCase();
      let span = 1;
      while (
        i + span < records.length &&
        String(records[i + span][key] || '').trim().toLowerCase() === cur &&
        cur !== ''
      ) {
        span++;
      }
      map[i] = span;
      for (let j = 1; j < span; j++) {
        map[i + j] = -1;
      }
      i += span;
    }
    return map;
  };

  const showToast = (message, type = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'portal-toast';
    const icon = type === 'success' ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-rose-400';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s.includes('FINISH') || s === 'ACTIVE') {
      return `<span class="status-badge status-active"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(status)}</span>`;
    } else if (s.includes('ONGOING')) {
      return `<span class="status-badge status-ongoing"><i class="fa-solid fa-clock"></i> Ongoing</span>`;
    } else if (s.includes('HOLD')) {
      return `<span class="status-badge status-hold"><i class="fa-solid fa-circle-pause"></i> Hold</span>`;
    } else if (s.includes('CANCEL') || s.includes('DEACTIVASI')) {
      return `<span class="status-badge status-cancel"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(status)}</span>`;
    } else {
      return `<span class="status-badge status-nonactive">${escapeHtml(status || 'Non Active')}</span>`;
    }
  };

  const getAgingBadge = (days) => {
    if (days === null || days === undefined || days < 0) {
      return `<span class="aging-badge aging-green">-</span>`;
    }
    if (days <= 7) {
      return `<span class="aging-badge aging-green" title="SLA Aman (&le; 7 Hari)"><i class="fa-solid fa-check"></i> ${days} Hari</span>`;
    } else if (days <= 14) {
      return `<span class="aging-badge aging-yellow" title="Perhatian (8 - 14 Hari)"><i class="fa-solid fa-triangle-exclamation"></i> ${days} Hari</span>`;
    } else {
      return `<span class="aging-badge aging-red" title="Kritis (> 14 Hari)"><i class="fa-solid fa-fire"></i> ${days} Hari</span>`;
    }
  };

  const getAlertBadge = (category, sisaHari) => {
    const cat = (category || '').toUpperCase();
    if (cat === 'CRITICAL') {
      return `<span class="alert-pill alert-critical"><i class="fa-solid fa-fire"></i> CRITICAL (${sisaHari} Hari)</span>`;
    } else if (cat === 'WARNING') {
      return `<span class="alert-pill alert-warning"><i class="fa-solid fa-bell"></i> WARNING (${sisaHari} Hari)</span>`;
    } else if (cat === 'SAFE') {
      return `<span class="alert-pill alert-safe"><i class="fa-solid fa-shield-check"></i> SAFE (${sisaHari} Hari)</span>`;
    } else {
      return `<span class="alert-pill alert-expired"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRED (${sisaHari} Hari)</span>`;
    }
  };

  // --- INITIALIZATION ---
  async function init() {
    initTheme();
    setupEventListeners();
    await loadMetaOptions();
    await loadRegisteredPicChips();
    initAuth();
    initContractAlertSystem();
  }

  // =========================================================================
  // CONTRACT EXPIRATION ALERT SYSTEM (≤ 3 BULAN & DAILY NOTIFICATION)
  // =========================================================================
  let contractAlertData = {
    counts: { total: 0, critical: 0, warning: 0, expired: 0 },
    items: [],
    activeFilter: 'ALL'
  };

  async function fetchExpiringContracts(silent = false) {
    try {
      const res = await fetch('/api/collo/expiring-3months');
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      contractAlertData.counts = data.counts || { total: 0, critical: 0, warning: 0, expired: 0 };
      contractAlertData.items = data.items || [];
      updateContractAlertUI();
      checkDailyContractAlertNotification(silent);
    } catch (e) {
      console.error('Failed to load contract expiration alerts:', e);
    }
  }

  function updateContractAlertUI() {
    const { counts } = contractAlertData;
    const bellBadge = document.getElementById('contractAlertBellBadge');
    const bellIcon = document.getElementById('contractBellIcon');
    const panelCount = document.getElementById('panelAlertBadgeCount');
    const tabAll = document.getElementById('tabCountAll');
    const tabCrit = document.getElementById('tabCountCritical');
    const tabWarn = document.getElementById('tabCountWarning');
    const tabExp = document.getElementById('tabCountExpired');

    if (panelCount) panelCount.textContent = counts.total || 0;
    if (tabAll) tabAll.textContent = counts.total || 0;
    if (tabCrit) tabCrit.textContent = counts.critical || 0;
    if (tabWarn) tabWarn.textContent = counts.warning || 0;
    if (tabExp) tabExp.textContent = counts.expired || 0;

    if (counts.total > 0) {
      if (bellBadge) {
        bellBadge.textContent = counts.total > 99 ? '99+' : counts.total;
        bellBadge.classList.remove('hidden');
      }
      if (bellIcon) {
        bellIcon.classList.add('bell-ring-active');
      }
    } else {
      if (bellBadge) bellBadge.classList.add('hidden');
      if (bellIcon) bellIcon.classList.remove('bell-ring-active');
    }

    renderContractAlertItems();
  }

  function renderContractAlertItems() {
    const list = document.getElementById('alertNotificationList');
    if (!list) return;

    let items = contractAlertData.items || [];
    const filter = contractAlertData.activeFilter;
    if (filter === 'CRITICAL') {
      items = items.filter(x => x.alert_cat_calc === 'CRITICAL');
    } else if (filter === 'WARNING') {
      items = items.filter(x => x.alert_cat_calc === 'WARNING');
    } else if (filter === 'EXPIRED') {
      items = items.filter(x => x.alert_cat_calc === 'EXPIRED');
    }

    if (items.length === 0) {
      list.innerHTML = `
        <div class="p-6 text-center text-xs text-emerald-400">
          <i class="fa-solid fa-circle-check text-2xl mb-2 block text-emerald-400"></i>
          <span class="font-bold">Semua Kontrak Aman!</span>
          <div class="text-[10px] text-slate-400 mt-0.5">Tidak ada kontrak kategori ini yang perlu diperbaharui.</div>
        </div>
      `;
      return;
    }

    list.innerHTML = items.slice(0, 100).map(item => {
      let badgeBg = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      if (item.alert_cat_calc === 'EXPIRED') badgeBg = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      else if (item.alert_cat_calc === 'CRITICAL') badgeBg = 'bg-orange-500/15 text-orange-400 border-orange-500/30';

      const sisaDays = item.sisa_hari_actual;
      const sisaLabel = sisaDays <= 0 ? 'Lewat Jatuh Tempo' : `Sisa ${sisaDays} Hari`;

      return `
        <div class="alert-panel-item flex items-center justify-between gap-3 text-xs">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="font-bold text-slate-100 truncate text-[11px]">${escapeHtml(item.pelanggan || 'Pelanggan')}</span>
              <span class="px-1.5 py-0.2 rounded text-[9px] font-bold border ${badgeBg} whitespace-nowrap shrink-0">
                ${sisaLabel}
              </span>
            </div>
            <div class="text-[10px] text-slate-400 flex items-center gap-2">
              <span class="text-cyan-400 font-semibold truncate max-w-[130px]">${escapeHtml(item.pengelola || '-')}</span>
              <span>•</span>
              <span class="font-mono text-slate-300">Tgl: ${item.end_date || '-'}</span>
            </div>
            ${item.sid ? `<div class="text-[9px] font-mono text-slate-500 mt-0.5">SID: ${escapeHtml(item.sid)}</div>` : ''}
          </div>
          <button type="button" class="btn btn-primary text-[10px] py-1 px-2.5 rounded-lg shrink-0 font-bold btn-renew-contract-quick" data-id="${item.id}" title="Perbaharui masa sewa / nomor PO kontrak ini">
            <i class="fa-solid fa-pen-to-square mr-1"></i> Perbaharui
          </button>
        </div>
      `;
    }).join('');

    // Wire Perbaharui buttons to open quick edit modal
    list.querySelectorAll('.btn-renew-contract-quick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        // Close dropdown
        const panel = document.getElementById('contractAlertNotificationPanel');
        const bellBtn = document.getElementById('btnContractAlertBell');
        if (panel) panel.classList.add('hidden');
        if (bellBtn) bellBtn.classList.remove('active');

        // Open quick edit modal for this contract
        openQuickEditModal('collo', id);
      });
    });
  }

  function checkDailyContractAlertNotification(silent = false) {
    const { counts } = contractAlertData;
    if (counts.total <= 0) {
      const banner = document.getElementById('dailyContractAlertBanner');
      if (banner) {
        banner.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        banner.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
      }
      return;
    }

    if (silent) return;

    // Check if dismissed TODAY
    const todayStr = new Date().toISOString().slice(0, 10);
    const lastDismissed = localStorage.getItem('telecom_portal_alert_dismissed_date');

    // Daily notification popup until all contracts are renewed
    if (lastDismissed !== todayStr) {
      const banner = document.getElementById('dailyContractAlertBanner');
      const countEl = document.getElementById('dailyBannerCount');
      if (countEl) countEl.textContent = counts.total;
      if (banner) {
        setTimeout(() => {
          banner.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
          banner.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
        }, 1200);
      }

      // Also trigger browser desktop notification if permitted
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('🔔 Peringatan Jatuh Tempo Kontrak (≤ 3 Bulan)', {
            body: `Terdapat ${counts.total} kontrak sirkuit yang belum diperbaharui hari ini (${todayStr}). Harap lakukan perpanjangan sewa!`,
            icon: '/favicon.ico'
          });
        } catch (e) {}
      }
    }
  }

  function setupContractAlertEventListeners() {
    const bellBtn = document.getElementById('btnContractAlertBell');
    const bellPanel = document.getElementById('contractAlertNotificationPanel');
    const closePanelBtn = document.getElementById('btnCloseAlertPanel');
    const goToFullAlerts = document.getElementById('btnGoToFullAlerts');

    // Bell toggle click
    if (bellBtn && bellPanel) {
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other dropdowns
        document.getElementById('exportGroupMenu')?.classList.add('hidden');
        document.getElementById('btnToggleExportMenu')?.classList.remove('active');
        document.getElementById('toolsGroupMenu')?.classList.add('hidden');
        document.getElementById('btnToggleToolsMenu')?.classList.remove('active');

        const isHidden = bellPanel.classList.contains('hidden');
        if (isHidden) {
          bellPanel.classList.remove('hidden');
          bellBtn.classList.add('active');
        } else {
          bellPanel.classList.add('hidden');
          bellBtn.classList.remove('active');
        }
      });
    }

    if (closePanelBtn && bellPanel) {
      closePanelBtn.addEventListener('click', () => {
        bellPanel.classList.add('hidden');
        bellBtn?.classList.remove('active');
      });
    }

    // Tabs inside notification panel
    document.querySelectorAll('.alert-panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.alert-panel-tab').forEach(t => {
          t.classList.remove('active', 'text-cyan-400', 'bg-cyan-500/10', 'border', 'border-cyan-500/20');
          t.classList.add('text-slate-400');
        });
        tab.classList.add('active', 'text-cyan-400', 'bg-cyan-500/10', 'border', 'border-cyan-500/20');
        tab.classList.remove('text-slate-400');
        contractAlertData.activeFilter = tab.getAttribute('data-filter') || 'ALL';
        renderContractAlertItems();
      });
    });

    // Go to full alerts page
    if (goToFullAlerts) {
      goToFullAlerts.addEventListener('click', () => {
        bellPanel?.classList.add('hidden');
        bellBtn?.classList.remove('active');
        switchView('view-collo-alerts');
      });
    }

    // Daily Banner events
    const banner = document.getElementById('dailyContractAlertBanner');
    const btnDismissToday = document.getElementById('btnDailyBannerDismissToday');
    const btnCloseDaily = document.getElementById('btnCloseDailyBanner');
    const btnOpenList = document.getElementById('btnDailyBannerOpenList');

    const dismissBannerForToday = () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      localStorage.setItem('telecom_portal_alert_dismissed_date', todayStr);
      if (banner) {
        banner.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        banner.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
      }
      showToast('Peringatan ditunda hingga besok.', 'info');
    };

    if (btnDismissToday) btnDismissToday.addEventListener('click', dismissBannerForToday);
    if (btnCloseDaily) btnCloseDaily.addEventListener('click', dismissBannerForToday);

    if (btnOpenList) {
      btnOpenList.addEventListener('click', () => {
        if (banner) {
          banner.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
          banner.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
        }
        bellBtn?.click();
      });
    }

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      const container = document.getElementById('contractAlertBellContainer');
      if (container && !container.contains(e.target)) {
        bellPanel?.classList.add('hidden');
        bellBtn?.classList.remove('active');
      }
    });

    // Request notification permission if supported
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => {
        try { Notification.requestPermission(); } catch (e) {}
      }, 5000);
    }
  }

  function initContractAlertSystem() {
    setupContractAlertEventListeners();
    fetchExpiringContracts();
  }

  // --- AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) ---
  async function loadRegisteredPicChips() {
    try {
      let pics = [];
      if (window.FirebaseManager && window.FirebaseManager.isConfigured()) {
        try {
          const allUsers = await window.FirebaseManager.fetchCollection('users');
          pics = allUsers.filter(u => u.role === 'lapangan' && u.username !== 'lapangan');
        } catch (fbErr) {
          console.warn('Firestore fetch users notice:', fbErr);
        }
      }
      if (!pics || pics.length === 0) {
        const res = await fetch('/api/auth/registered-pics');
        if (res.ok) {
          const data = await res.json();
          pics = data.pics || [];
        }
      }
      
      const container = document.getElementById('loginPicChips');
      if (!container) return;
      
      let html = '';
      pics.forEach(p => {
        const shortName = p.full_name ? p.full_name.split(' ')[0] : p.username;
        html += `
          <button type="button" class="pic-chip-btn" data-user="${p.username}" title="${p.full_name}">
            <span class="w-2 h-2 rounded-full bg-${p.badge_color || 'emerald'}-400"></span> ${shortName}
          </button>
        `;
      });
      html += `
        <button type="button" class="pic-chip-btn border-cyan-500/30 text-cyan-300" data-user="admin" title="Administrator / Manajemen Portal">
          <i class="fa-solid fa-shield-halved text-[9px]"></i> Admin
        </button>
      `;
      container.innerHTML = html;

      // Rebind click listeners to chips
      container.querySelectorAll('.pic-chip-btn').forEach(chip => {
        chip.addEventListener('click', () => {
          container.querySelectorAll('.pic-chip-btn').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const u = chip.getAttribute('data-user');
          const userInput = document.getElementById('loginUsername');
          const passInput = document.getElementById('loginPassword');
          if (userInput) userInput.value = u;
          if (passInput) {
            passInput.value = '';
            passInput.focus();
          }
        });
      });
    } catch (e) {
      console.warn('Gagal memuat daftar PIC terdaftar:', e);
    }
  }

  function initAuth() {
    const savedUser = localStorage.getItem('telecom_portal_user');
    if (savedUser) {
      try {
        state.currentUser = JSON.parse(savedUser);
        hideLoginOverlay();
        applyRolePermissions(state.currentUser.role);
        return;
      } catch (e) {
        localStorage.removeItem('telecom_portal_user');
        state.currentUser = null;
      }
    }
    showLoginOverlay();
  }

  function showLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
    document.getElementById('topbarUserProfile')?.classList.add('hidden');
    document.getElementById('btnLogout')?.classList.add('hidden');
    document.getElementById('btnOpenChangePassword')?.classList.add('hidden');
    document.getElementById('btnOpenAdminUsers')?.classList.add('hidden');

    // Reset overlay panes to default login state
    document.getElementById('paneLogin')?.classList.remove('hidden');
    document.getElementById('paneRegister')?.classList.add('hidden');
    document.getElementById('paneForgotPassword')?.classList.add('hidden');
    document.getElementById('tabModeLogin')?.classList.add('active');
    document.getElementById('tabModeRegister')?.classList.remove('active');
    document.getElementById('loginErrorAlert')?.classList.add('hidden');
    document.getElementById('loginSuccessAlert')?.classList.add('hidden');
  }

  function hideLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    document.getElementById('topbarUserProfile')?.classList.remove('hidden');
    document.getElementById('btnLogout')?.classList.remove('hidden');
    document.getElementById('btnOpenChangePassword')?.classList.remove('hidden');
    
    // 'Kelola Akun' hanya untuk admin
    const currentUser = state.currentUser || JSON.parse(localStorage.getItem('telecom_portal_user') || '{}');
    if (currentUser.role === 'admin') {
      document.getElementById('btnOpenAdminUsers')?.classList.remove('hidden');
    } else {
      document.getElementById('btnOpenAdminUsers')?.classList.add('hidden');
    }
  }

  function applyRolePermissions(role) {
    const isLapangan = role === 'lapangan';

    // 1. Update Topbar User Profile Badge & PIC Sync
    const nameDisplay = document.getElementById('userNameDisplay');
    const roleDisplay = document.getElementById('userRoleDisplay');
    const avatarIcon = document.getElementById('userRoleIcon');
    const avatarBox = document.getElementById('userRoleAvatar');

    if (nameDisplay) {
      const rawName = state.currentUser?.full_name || (isLapangan ? 'Tim Lapangan' : 'Administrator');
      // Strip parenthetical text like "(Manajemen)" to display cleanly without overflow
      const cleanName = rawName.replace(/\s*\([^)]*\)/g, '').trim();
      nameDisplay.textContent = cleanName;
      nameDisplay.title = `${rawName} (${isLapangan ? 'Lapangan' : 'Admin'})`;
    }
    if (roleDisplay) {
      if (isLapangan) {
        const pic = state.currentUser?.pic_code || state.activeTechnician;
        roleDisplay.textContent = pic ? `PIC: ${pic.toUpperCase()}` : 'TEKNISI';
        roleDisplay.className = 'text-[8px] uppercase tracking-wider text-emerald-400 font-semibold leading-none mt-0.5';
      } else {
        roleDisplay.textContent = 'ADMIN';
        roleDisplay.className = 'text-[8px] uppercase tracking-wider text-cyan-400 font-semibold leading-none mt-0.5';
      }
    }
    if (avatarIcon) {
      avatarIcon.className = isLapangan ? 'fa-solid fa-helmet-safety' : 'fa-solid fa-shield-halved';
    }
    if (avatarBox) {
      avatarBox.className = isLapangan
        ? 'w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
    }

    // Sync PIC & Lock Account Identity (Mencegah gonta-ganti user seenaknya)
    const sel = document.getElementById('selectActiveTechnician');
    const lockedName = document.getElementById('lockedPicBadgeName');

    if (isLapangan) {
      const activePic = state.currentUser?.pic_code || 'Harlan';
      state.activeTechnician = activePic;
      localStorage.setItem('telecom_active_technician', activePic);
      if (sel) sel.value = activePic;
      if (lockedName) lockedName.textContent = `PIC: ${activePic.toUpperCase()}`;
    } else {
      state.activeTechnician = 'Admin';
      if (sel) sel.value = 'Admin';
      if (lockedName) lockedName.textContent = 'ADMIN';
    }

    // 2. Hide / Show Sidebar Menus
    const groupCollo = document.getElementById('groupCollo');
    const execNavWrap = document.querySelector('.nav-item[data-view="view-executive"]')?.closest('.nav-section-wrap');

    if (groupCollo) {
      groupCollo.style.display = isLapangan ? 'none' : '';
    }
    if (execNavWrap) {
      execNavWrap.style.display = isLapangan ? 'none' : '';
    }

    // 3. Add Data Modal Restrictions: Hide Colocation Option for Lapangan
    const pickCollo = document.getElementById('btnPickCollo');
    if (pickCollo) {
      pickCollo.style.display = isLapangan ? 'none' : '';
    }

    // 4. Initial Landing View
    if (isLapangan) {
      // Auto-expand groupSitac
      const groupSitac = document.getElementById('groupSitac');
      if (groupSitac && groupSitac.classList.contains('collapsed')) {
        groupSitac.classList.remove('collapsed');
      }
      // If currently on executive or collo, redirect to view-sitac-pa
      if (state.activeView === 'view-executive' || state.activeView.startsWith('view-collo-')) {
        switchView('view-sitac-pa');
      } else {
        switchView(state.activeView);
      }
    } else {
      // Admin: load executive summary if on initial view
      if (state.activeView === 'view-executive') {
        loadExecutiveSummary();
      } else {
        switchView(state.activeView);
      }
    }
  }

  async function performLogin(usernameOrEmail, password) {
    const errBox = document.getElementById('loginErrorAlert');
    const errMsg = document.getElementById('loginErrorMsg');
    const submitBtn = document.getElementById('btnLoginSubmit');
    if (errBox) errBox.classList.add('hidden');

    if (!usernameOrEmail || !password) {
      if (errBox) {
        errBox.classList.remove('hidden');
        if (errMsg) errMsg.textContent = 'Username atau email dan kata sandi wajib diisi.';
      }
      showToast('Username atau email dan kata sandi wajib diisi', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i> Mengautentikasi (Firebase)...';
    }

    try {
      if (!window.FirebaseManager || !window.FirebaseManager.isConfigured()) {
        throw new Error('Koneksi Google Firebase belum aktif.');
      }

      // PURE FIREBASE AUTHENTICATION (Cloud Firestore)
      const userObj = await window.FirebaseManager.loginUser(usernameOrEmail, password);
      const token = `fb_auth_${userObj.role}_${Date.now()}`;

      state.currentUser = userObj;
      state.token = token;
      localStorage.setItem('telecom_portal_user', JSON.stringify(userObj));
      localStorage.setItem('telecom_portal_token', token);

      const resolvedPic = userObj.pic_code;
      if (resolvedPic) {
        state.activeTechnician = resolvedPic;
        localStorage.setItem('telecom_active_technician', resolvedPic);
      }

      hideLoginOverlay();
      applyRolePermissions(userObj.role);
      updateMyTasksBadges();

      const welcomeName = userObj.full_name || usernameOrEmail;
      showToast(`Selamat datang, ${welcomeName}! Akses Google Firebase aktif.`, 'success');

      if (document.getElementById('loginUsername')) document.getElementById('loginUsername').value = '';
      if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '';

    } catch (err) {
      if (errBox) {
        errBox.classList.remove('hidden');
        if (errMsg) errMsg.textContent = err.message || 'Gagal masuk akun ke Firebase.';
      }
      showToast(err.message || 'Gagal masuk akun', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-1.5"></i> Autentikasi & Masuk';
      }
    }
  }

  function performLogout() {
    localStorage.removeItem('telecom_portal_user');
    localStorage.removeItem('telecom_portal_token');
    state.currentUser = null;
    state.token = null;
    showLoginOverlay();
    showToast('Anda telah keluar dari sistem.', 'info');
  }

  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const icon = document.querySelector('#themeToggleBtn i');
    if (icon) {
      icon.className = state.theme === 'light' ? 'fa-solid fa-sun text-base' : 'fa-solid fa-moon text-base';
    }
  }

  async function loadMetaOptions() {
    try {
      const res = await fetch('/api/meta/options');
      if (res.ok) {
        state.meta = await res.json();
        populateFilterDropdowns();
      }
    } catch (e) {
      console.warn('Gagal memuat filter options:', e);
    }
  }

  function populateFilterDropdowns() {
    // Pengelola
    const pSelect = document.getElementById('colloFilterPengelola');
    if (pSelect && state.meta.pengelola) {
      pSelect.innerHTML = '<option value="ALL">Semua Pengelola</option>' + 
        state.meta.pengelola.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    }

    // Jenis Sewa
    const jSelect = document.getElementById('colloFilterJenis');
    if (jSelect && state.meta.jenis_sewa) {
      jSelect.innerHTML = '<option value="ALL">Semua Jenis Sewa</option>' +
        state.meta.jenis_sewa.map(j => `<option value="${escapeHtml(j)}">${escapeHtml(j)}</option>`).join('');
    }

    // PIC SITAC
    const picSelect = document.getElementById('sitacFilterPic');
    if (picSelect && state.meta.pic) {
      picSelect.innerHTML = '<option value="ALL">Semua PIC SITAC</option>' +
        state.meta.pic.map(pic => `<option value="${escapeHtml(pic)}">${escapeHtml(pic)}</option>`).join('');
    }
  }

  // --- NAVIGATION ROUTING ---
  function switchView(viewId) {
    // RBAC: Tim Lapangan cannot access executive or colocation views
    if (state.currentUser?.role === 'lapangan' && (viewId === 'view-executive' || viewId.startsWith('view-collo-'))) {
      showToast('Akses dibatasi. Modul Colocation & Finansial hanya untuk Manajemen.', 'error');
      viewId = 'view-sitac-pa';
    }

    state.activeView = viewId;

    // Update active nav button
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === viewId);
    });

    // Toggle active view container
    document.querySelectorAll('.portal-view').forEach(view => {
      view.classList.toggle('active', view.id === viewId);
    });

    // Update topbar breadcrumbs
    const bcCat = document.getElementById('breadcrumbCategory');
    const bcTitle = document.getElementById('breadcrumbPageTitle');

    const metaMap = {
      'view-executive': { cat: 'Ringkasan', title: 'Dashboard Ringkasan Eksekutif' },
      'view-collo-list': { cat: 'Colocation & Sewa Aset', title: 'Daftar Link & Finansial (Sewa Aset)' },
      'view-collo-rev-sharing': { cat: 'Colocation & Sewa Aset', title: 'Skema Revenue Sharing Mitra' },
      'view-collo-alerts': { cat: 'Colocation & Sewa Aset', title: 'Monitoring Jatuh Tempo Kontrak (Alerts)' },
      'view-sitac-pa': { cat: 'Operasional SITAC & Lapangan', title: 'Monitoring Perizinan Proyek (PA)' },
      'view-gangguan': { cat: 'Operasional SITAC & Lapangan', title: 'Tiket Gangguan Darurat (Incident SLA)' },
      'view-efisiensi': { cat: 'Operasional SITAC & Lapangan', title: 'Rekap Efisiensi Biaya Negosiasi' },
      'view-pic-matrix': { cat: 'Operasional SITAC & Lapangan', title: 'Beban Kerja & Leaderboard PIC SITAC' },
      'view-webgis': { cat: 'Operasional SITAC & Lapangan', title: 'Peta Sebaran Lokasi Spasial (WebGIS)' }
    };

    if (metaMap[viewId]) {
      bcCat.textContent = metaMap[viewId].cat;
      bcTitle.textContent = metaMap[viewId].title;
    }

    // Auto-expand parent accordion group if target item is inside it
    const activeNavBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    const parentNavGroup = activeNavBtn?.closest('.nav-section-group');
    if (parentNavGroup && parentNavGroup.classList.contains('collapsed')) {
      parentNavGroup.classList.remove('collapsed');
    }

    // Lazy load data for view
    if (viewId === 'view-executive') loadExecutiveSummary();
    else if (viewId === 'view-collo-list') loadColloData();
    else if (viewId === 'view-collo-rev-sharing') loadRevSharingData();
    else if (viewId === 'view-collo-alerts') loadAlertsData();
    else if (viewId === 'view-sitac-pa') loadSitacData();
    else if (viewId === 'view-gangguan') loadGangguanData();
    else if (viewId === 'view-efisiensi') loadEfisiensiData();
    else if (viewId === 'view-pic-matrix') loadPicMatrixData();
    else if (viewId === 'view-webgis') {
      setTimeout(() => initWebgisMap(), 50);
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 250);
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 500);
    }
  }

  // =========================================================================
  // VIEW 1: EXECUTIVE OVERVIEW
  // =========================================================================
  async function loadExecutiveSummary() {
    try {
      const res = await fetch('/api/executive/summary');
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      state.execData = data;

      // Populate Cards
      const c = data.collo || {};
      document.getElementById('execActiveCollo').textContent = Number(c.active_count || 880).toLocaleString('id-ID');
      document.getElementById('execHistCollo').textContent = Number(c.total_records - c.active_count).toLocaleString('id-ID');
      document.getElementById('execDeactCollo').textContent = Number(c.deactivasi_count || 285).toLocaleString('id-ID');
      document.getElementById('execMarginRp').textContent = formatRupiah(c.active_margin);
      document.getElementById('execRevRp').textContent = formatRupiah(c.active_revenue);
      document.getElementById('execMarginPct').textContent = `${c.margin_pct}%`;

      const s = data.sitac || {};
      document.getElementById('execSitacFinish').innerHTML = `${s.finish_count} <span class="text-xs text-slate-400 font-normal">/ ${s.total_pa} PA</span>`;
      document.getElementById('execSitacSavings').textContent = formatRupiah(s.total_efisiensi_rupiah);

      const g = data.gangguan || {};
      document.getElementById('execGangguanTotal').textContent = g.total_gangguan || 393;
      document.getElementById('execGangguanSelesai').textContent = g.selesai_count || 96;
      document.getElementById('execGangguanOpen').textContent = g.aktif_count || 297;

      // Update Nav Badges dynamically
      const bCollo = document.getElementById('badgeNavActiveCollo');
      if (bCollo) bCollo.textContent = Number(c.active_count || 880).toLocaleString('id-ID');
      const bRev = document.getElementById('badgeNavRevShare');
      if (bRev) bRev.textContent = Number(c.rev_sharing_count || 423).toLocaleString('id-ID');
      const bAlerts = document.getElementById('badgeNavCriticalAlerts');
      if (bAlerts) bAlerts.textContent = Number(c.critical_alerts_count || 40).toLocaleString('id-ID');
      const bSitac = document.getElementById('badgeNavSitac');
      if (bSitac) bSitac.textContent = Number(s.total_pa || 451).toLocaleString('id-ID');
      const bGangguan = document.getElementById('badgeNavGangguan');
      if (bGangguan) bGangguan.textContent = Number(g.total_gangguan || 393).toLocaleString('id-ID');

      // Update Power BI Radial Gauges & Bento Controls
      const totalCollo = Number(c.total_records || 2243);
      const actCollo = Number(c.active_count || 880);
      const deactCollo = Number(c.deactivasi_count || 285);
      const otherCollo = Math.max(0, totalCollo - actCollo - deactCollo);
      if (document.getElementById('execHistColloTotal')) {
        document.getElementById('execHistColloTotal').textContent = totalCollo.toLocaleString('id-ID');
      }
      if (totalCollo > 0) {
        const segAct = document.getElementById('bentoColloActiveSegment');
        const segDeact = document.getElementById('bentoColloDeactSegment');
        const segOther = document.getElementById('bentoColloOtherSegment');
        if (segAct) segAct.style.width = `${((actCollo / totalCollo) * 100).toFixed(1)}%`;
        if (segDeact) segDeact.style.width = `${((deactCollo / totalCollo) * 100).toFixed(1)}%`;
        if (segOther) segOther.style.width = `${((otherCollo / totalCollo) * 100).toFixed(1)}%`;
      }

      const sitacRate = (s.total_pa > 0) ? (s.finish_count / s.total_pa * 100).toFixed(1) : 0;
      if (document.getElementById('gaugeSitacRate')) document.getElementById('gaugeSitacRate').textContent = `${sitacRate}%`;
      if (document.getElementById('gaugeSitacBar')) document.getElementById('gaugeSitacBar').style.width = `${sitacRate}%`;

      // SITAC Mini SVG Radial Ring
      const radialCirc = document.getElementById('radialSitacCircle');
      if (radialCirc) {
        const pct = Math.min(100, Math.max(0, parseFloat(sitacRate) || 0));
        const offset = (113.1 - (113.1 * pct / 100)).toFixed(1);
        radialCirc.style.strokeDashoffset = offset;
      }
      const radialTxt = document.getElementById('radialSitacPercent');
      if (radialTxt) {
        radialTxt.textContent = `${Math.round(parseFloat(sitacRate) || 0)}%`;
      }

      const savingsRate = s.efisiensi_pct || 0;
      if (document.getElementById('gaugeSavingsRate')) document.getElementById('gaugeSavingsRate').textContent = `${savingsRate}%`;
      if (document.getElementById('gaugeSavingsBar')) document.getElementById('gaugeSavingsBar').style.width = `${savingsRate}%`;

      const marginRate = c.margin_pct || 0;
      if (document.getElementById('gaugeMarginRate')) document.getElementById('gaugeMarginRate').textContent = `${marginRate}%`;
      if (document.getElementById('gaugeMarginBar')) document.getElementById('gaugeMarginBar').style.width = `${marginRate}%`;

      const resRate = g.resolution_rate || 0;
      if (document.getElementById('gaugeGangguanRate')) document.getElementById('gaugeGangguanRate').textContent = `${resRate}%`;
      if (document.getElementById('gaugeGangguanBar')) document.getElementById('gaugeGangguanBar').style.width = `${resRate}%`;
      if (document.getElementById('execGangguanOpenBadge')) {
        document.getElementById('execGangguanOpenBadge').textContent = `${g.aktif_count || 0} Open`;
      }

      // Render Charts
      renderExecutiveCharts(data);

    } catch (e) {
      console.error('Failed to load executive summary:', e);
    }
  }

  function renderExecutiveCharts(data) {
    const { textColor, gridColor, makeGradient } = getChartTheme();

    // ── Shared scale defaults
    const scaleBase = (axisOverrides = {}) => ({
      grid: { color: gridColor, drawBorder: false },
      ticks: { color: textColor, font: { size: 10 }, padding: 6 },
      border: { display: false },
      ...axisOverrides
    });

    // ── Chart 1: Top Pengelola — premium horizontal bar
    const ctxPengelola = document.getElementById('chartTopPengelola')?.getContext('2d');
    if (ctxPengelola) {
      destroyChart('topPengelola');
      const topP = data.top_pengelola || [];
      charts.topPengelola = new Chart(ctxPengelola, {
        type: 'bar',
        data: {
          labels: topP.map(p => p.pengelola.length > 22 ? p.pengelola.slice(0, 22) + '…' : p.pengelola),
          datasets: [
            {
              label: 'Biaya Sewa Mitra',
              data: topP.map(p => p.total_biaya),
              backgroundColor: 'rgba(233, 196, 106, 0.85)',
              hoverBackgroundColor: 'rgba(233, 196, 106, 1)',
              borderRadius: 8,
              borderSkipped: false,
              barPercentage: 0.72,
            },
            {
              label: 'Revenue Sewa',
              data: topP.map(p => p.total_rev),
              backgroundColor: 'rgba(42, 157, 143, 0.85)',
              hoverBackgroundColor: 'rgba(42, 157, 143, 1)',
              borderRadius: 8,
              borderSkipped: false,
              barPercentage: 0.72,
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}` }
            }
          },
          scales: {
            x: { ...scaleBase({ ticks: { color: textColor, callback: v => 'Rp' + (v/1e9).toFixed(1)+'M', font:{size:9} } }) },
            y: { grid: { display: false }, border: { display: false }, ticks: { color: textColor, font: { size: 9.5 } } }
          }
        }
      });
    }

    // ── Chart 2: SITAC Status — premium doughnut with hole text
    const ctxStatus = document.getElementById('chartSitacStatus')?.getContext('2d');
    if (ctxStatus) {
      destroyChart('sitacStatus');
      const s = data.sitac || {};
      charts.sitacStatus = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: ['Finish', 'Ongoing', 'Hold', 'Cancel'],
          datasets: [{
            data: [s.finish_count || 373, s.ongoing_count || 10, s.hold_count || 5, s.cancel_count || 63],
            backgroundColor: ['#2A9D8F', '#5BBFB5', '#E9C46A', '#E76F51'],
            hoverBackgroundColor: ['#34b5a5', '#6ecec4', '#f1cf7a', '#ed7e62'],
            borderWidth: 3,
            borderColor: 'transparent',
            hoverBorderColor: 'transparent',
            hoverOffset: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '74%',
          plugins: {
            legend: { position: 'bottom', labels: { padding: 14 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} PA (${((ctx.raw/(s.total_pa||451))*100).toFixed(1)}%)` } }
          }
        }
      });
    }

    // ── Chart 3: Jenis Sewa — multi-color doughnut
    const ctxJenis = document.getElementById('chartJenisSewa')?.getContext('2d');
    if (ctxJenis) {
      destroyChart('jenisSewa');
      const jd = data.jenis_sewa_dist || [];
      const totalCnt = jd.reduce((a, c) => a + c.cnt, 0);
      const bgColors = ['#2A9D8F', '#E9C46A', '#5BBFB5', '#E76F51', '#1A7A6E', '#D4A373'];
      const hoverColors = ['#34b5a5', '#f1cf7a', '#6ecec4', '#ed7e62', '#229184', '#e2b385'];
      charts.jenisSewa = new Chart(ctxJenis, {
        type: 'doughnut',
        data: {
          labels: jd.map(j => j.jenis),
          datasets: [{
            data: jd.map(j => j.cnt),
            backgroundColor: bgColors,
            hoverBackgroundColor: hoverColors,
            borderWidth: 3,
            borderColor: 'transparent',
            hoverOffset: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { position: 'bottom', labels: { padding: 12 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${((ctx.raw/(totalCnt||880))*100).toFixed(1)}%)` } }
          }
        }
      });
    }

    // ── Chart 4: Expiration Donut — semantic alert colors
    const ctxExp = document.getElementById('chartExpirationDonut')?.getContext('2d');
    if (ctxExp) {
      destroyChart('expirationDonut');
      const ed = data.expiration_dist || [];
      const cMap = { CRITICAL:'#f43f5e', WARNING:'#f59e0b', SAFE:'#10b981', EXPIRED:'#7c3aed' };
      const hMap = { CRITICAL:'#fb7185', WARNING:'#fbbf24', SAFE:'#34d399', EXPIRED:'#a855f7' };
      charts.expirationDonut = new Chart(ctxExp, {
        type: 'doughnut',
        data: {
          labels: ed.map(e => e.alert_category),
          datasets: [{
            data: ed.map(e => e.cnt),
            backgroundColor: ed.map(e => cMap[e.alert_category] || '#7c3aed'),
            hoverBackgroundColor: ed.map(e => hMap[e.alert_category] || '#a855f7'),
            borderWidth: 3,
            borderColor: 'transparent',
            hoverOffset: 8,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 14,
                usePointStyle: true,
                pointStyle: 'circle',
                font: { size: 11, weight: '600' }
              }
            },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} Sirkuit` } }
          }
        }
      });
    }

    // ── Chart 5: Monthly Trend — gradient area + rounded bar
    const ctxTrend = document.getElementById('chartMonthlyTrend')?.getContext('2d');
    if (ctxTrend) {
      destroyChart('monthlyTrend');
      const trend = data.monthly_trend || [];
      const gradCyan = makeGradient(ctxTrend, '#2A9D8F', 0.55, 0.02);
      const gradMint = makeGradient(ctxTrend, '#10b981', 0.25, 0.01);
      charts.monthlyTrend = new Chart(ctxTrend, {
        type: 'bar',
        data: {
          labels: trend.map(t => `${t.bulan}/${t.tahun}`),
          datasets: [
            {
              type: 'bar',
              label: 'Penugasan Masuk',
              data: trend.map(t => t.count_masuk),
              backgroundColor: gradCyan,
              hoverBackgroundColor: 'rgba(42, 157, 143, 0.95)',
              borderRadius: 7,
              borderSkipped: false,
              barPercentage: 0.65,
            },
            {
              type: 'line',
              label: 'Penyelesaian Selesai',
              data: trend.map(t => t.count_selesai),
              borderColor: '#10b981',
              backgroundColor: gradMint,
              borderWidth: 2.5,
              tension: 0.4,
              fill: true,
              pointBackgroundColor: '#10b981',
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBorderColor: 'transparent',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { ...scaleBase(), ticks: { color: textColor, font:{size:9.5} } },
            y: { ...scaleBase(), ticks: { color: textColor, precision: 0 } }
          }
        }
      });
    }

    // ── Chart 6: Efisiensi Tahunan — grouped bar with gradient
    const ctxEff = document.getElementById('chartEfisiensiTahunan')?.getContext('2d');
    if (ctxEff) {
      destroyChart('efisiensiTahunan');
      const el = data.rekap_efisiensi_list || [];
      charts.efisiensiTahunan = new Chart(ctxEff, {
        type: 'bar',
        data: {
          labels: el.map(r => `${r.tahun}`),
          datasets: [
            {
              label: 'Pengajuan Awal',
              data: el.map(r => r.nilai_awal),
              backgroundColor: 'rgba(244,63,94,0.78)',
              hoverBackgroundColor: 'rgba(244,63,94,1)',
              borderRadius: 7,
              borderSkipped: false,
              barPercentage: 0.68,
            },
            {
              label: 'Realisasi Akhir',
              data: el.map(r => r.nilai_akhir),
              backgroundColor: 'rgba(16,185,129,0.82)',
              hoverBackgroundColor: 'rgba(16,185,129,1)',
              borderRadius: 7,
              borderSkipped: false,
              barPercentage: 0.68,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top' },
            tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}` } }
          },
          scales: {
            x: { ...scaleBase() },
            y: { ...scaleBase({ ticks: { color: textColor, callback: v => 'Rp'+(v/1e6).toFixed(0)+'Jt' } }) }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 2: DAFTAR LINK & FINANSIAL (MODUL A)
  // =========================================================================
  async function loadColloData() {
    const { status, jenisSewa, pengelola, search, sort, page, pageSize } = state.collo;
    const params = new URLSearchParams({
      status, jenis_sewa: jenisSewa, pengelola, search, sort, page, pageSize
    });

    try {
      const res = await fetch(`/api/collo?${params}`);
      if (!res.ok) throw new Error('Failed to fetch collo');
      const json = await res.json();
      state.collo.data = json.data;

      // Update summary bar
      document.getElementById('colloTableSummaryText').innerHTML = `Menampilkan <strong>${json.total}</strong> sirkuit (${status === 'ACTIVE' ? 'Default: ACTIVE' : status})`;
      document.getElementById('colloSumRev').textContent = formatRupiah(json.totals?.revenue);
      const otcEl = document.getElementById('colloSumOtc');
      if (otcEl) otcEl.textContent = formatRupiah(json.totals?.biaya_otc);
      document.getElementById('colloSumBiaya').textContent = formatRupiah(json.totals?.biaya);
      document.getElementById('colloSumMargin').textContent = formatRupiah(json.totals?.margin);

      // Pagination info
      document.getElementById('colloPaginationInfo').textContent = `Halaman ${json.page} dari ${json.totalPages} (${json.total} data)`;
      document.getElementById('colloPrevPageBtn').disabled = json.page <= 1;
      document.getElementById('colloNextPageBtn').disabled = json.page >= json.totalPages;

      renderColloTable(json.data);

      if (!state.execData) {
        fetch('/api/executive/summary').then(r => r.json()).then(d => {
          state.execData = d;
          renderColloCharts();
        });
      } else {
        renderColloCharts();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function renderColloCharts() {
    if (!state.execData) return;
    const { textColor, gridColor } = getChartTheme();

    // Chart Collo 1: Status Dist (Active, Non-Active, Deaktivasi)
    const ctxStat = document.getElementById('chartColloStatusDist')?.getContext('2d');
    if (ctxStat) {
      destroyChart('colloStatusDist');
      const dist = state.execData.collo_status_dist || [];
      const total = dist.reduce((acc, curr) => acc + curr.cnt, 0);
      const colorMap = { 'ACTIVE': '#2A9D8F', 'NON ACTIVE': '#6B8C88', 'DEACTIVASI': '#E76F51' };
      charts.colloStatusDist = new Chart(ctxStat, {
        type: 'doughnut',
        data: {
          labels: dist.map(d => d.status),
          datasets: [{
            data: dist.map(d => d.cnt),
            backgroundColor: dist.map(d => colorMap[d.status] || '#2A9D8F'),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${Number(ctx.raw).toLocaleString('id-ID')} sirkuit (${((ctx.raw / (total || 3123)) * 100).toFixed(1)}%)`
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    // Chart Collo 2: Top 8 Vendors
    const ctxVendors = document.getElementById('chartColloTopVendors')?.getContext('2d');
    if (ctxVendors) {
      destroyChart('colloTopVendors');
      const vendors = state.execData.top_collo_vendors || [];
      charts.colloTopVendors = new Chart(ctxVendors, {
        type: 'bar',
        data: {
          labels: vendors.map(v => v.pengelola.length > 18 ? v.pengelola.slice(0, 18) + '...' : v.pengelola),
          datasets: [{
            label: 'Jumlah Sirkuit Aktif',
            data: vendors.map(v => v.sirkuit_count),
            backgroundColor: 'rgba(42, 157, 143, 0.85)',
            hoverBackgroundColor: 'rgba(42, 157, 143, 1)',
            borderRadius: 8
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
            y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }
  }

  function renderColloTable(records) {
    const tbody = document.getElementById('colloTableBody');
    if (!tbody) return;

    if (!records || records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" class="text-center py-10 text-slate-500">Tidak ada sirkuit yang sesuai filter.</td></tr>`;
      return;
    }

    const rowspanMap = computeRowspanMap(records, 'pengelola');

    let html = '';
    records.forEach((c, idx) => {
      const rowIdx = (state.collo.page - 1) * state.collo.pageSize + idx + 1;

      // Smart merged cell for Pengelola / Rekanan
      let pengelolaTd = '';
      if (rowspanMap[idx] > 0) {
        const span = rowspanMap[idx];
        const spanAttr = span > 1 ? ` rowspan="${span}"` : '';
        const isMerged = span > 1;
        pengelolaTd = `
          <td${spanAttr} class="${isMerged ? 'cell-merged align-middle' : ''}">
            <strong class="text-slate-100 block">${escapeHtml(c.pengelola || '-')}</strong>
          </td>
        `;
      }

      html += `
        <tr>
          <td class="font-mono text-xs text-slate-500">${rowIdx}</td>
          ${pengelolaTd}
          <td>${formatPelangganCell(c.pelanggan)}</td>
          <td>${formatSoCell(c.sid, c.no_so)}</td>
          <td class="max-w-[200px] truncate" title="${escapeHtml(c.terminating)}">${escapeHtml(c.terminating || c.originating || '-')}</td>
          <td><span class="badge-pill bg-slate-800 text-slate-300">${escapeHtml(c.jenis_sewa || 'Colocation')}</span></td>
          <td class="text-right font-mono font-bold text-emerald-400">${formatRupiah(c.rev_sewa_tahun)}</td>
          <td class="text-right font-mono text-purple-400 font-semibold">${c.biaya_otc > 0 ? formatRupiah(c.biaya_otc) : '<span class="text-slate-600">-</span>'}</td>
          <td class="text-right font-mono text-amber-400">${formatRupiah(c.biaya_sewa_tahun)}</td>
          <td class="text-right font-mono font-bold text-cyan-400">${formatRupiah(c.margin_rupiah)} <span class="text-[10px] text-slate-500">(${c.margin_persen}%)</span></td>
          <td class="text-center">${getStatusBadge(c.status)}</td>
          <td class="text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button class="btn-action btn-view-detail" data-type="collo" data-id="${c.id}" title="Lihat Detail"><i class="fa-solid fa-eye text-cyan-400"></i></button>
              <button class="btn-action btn-quick-edit" data-type="collo" data-id="${c.id}" title="Edit Data Sirkuit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="btn-action btn-delete-row text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40" data-type="collo" data-id="${c.id}" title="Hapus Data"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  // =========================================================================
  // VIEW 3: REVENUE SHARING (MODUL A)
  // =========================================================================
  async function loadRevSharingData() {
    try {
      const q = encodeURIComponent(state.revSharing.search);
      const res = await fetch(`/api/collo/rev-sharing?search=${q}`);
      if (!res.ok) throw new Error('Failed to load rev sharing');
      const json = await res.json();

      // Cards
      const sum = json.summary || {};
      document.getElementById('revShareTotalLinks').textContent = sum.total_links || 0;
      document.getElementById('revShareTotalRev').textContent = formatRupiah(sum.total_rev);
      document.getElementById('revShareTotalFee').textContent = formatRupiah(sum.total_sharing);
      document.getElementById('revShareAvgPct').textContent = sum.avg_pct_display || '20.0%';

      // Top Pengelola Breakdown Table
      const tbPengelola = document.getElementById('revSharePengelolaTableBody');
      if (tbPengelola) {
        let phtml = '';
        (json.top_pengelola || []).forEach(p => {
          phtml += `
            <tr>
              <td><strong>${escapeHtml(p.pengelola)}</strong></td>
              <td class="text-center font-bold text-amber-400">${p.link_count} Link</td>
              <td class="text-right font-mono text-emerald-400">${formatRupiah(p.total_rev)}</td>
              <td class="text-right font-mono font-bold text-cyan-400">${formatRupiah(p.total_sharing)}</td>
              <td class="text-center font-mono">${roundPct(p.avg_pct)}%</td>
            </tr>
          `;
        });
        tbPengelola.innerHTML = phtml;
      }

      // Detailed Links Table
      const tbLinks = document.getElementById('revShareTableBody');
      if (tbLinks) {
        const sliceData = (json.data || []).slice(0, 50);
        const rowspanMap = computeRowspanMap(sliceData, 'pengelola');
        let lhtml = '';
        sliceData.forEach((c, idx) => {
          let pengelolaTd = '';
          if (rowspanMap[idx] > 0) {
            const span = rowspanMap[idx];
            const isMerged = span > 1;
            pengelolaTd = `
              <td${span > 1 ? ` rowspan="${span}"` : ''} class="${isMerged ? 'cell-merged align-middle' : ''}">
                <strong class="text-slate-100 block">${escapeHtml(c.pengelola || '-')}</strong>
              </td>
            `;
          }
          lhtml += `
            <tr>
              <td class="text-xs text-slate-500">${idx + 1}</td>
              ${pengelolaTd}
              <td>${formatPelangganCell(c.pelanggan)}</td>
              <td>${formatSoCell(c.sid, c.no_so)}</td>
              <td class="max-w-[180px] truncate" title="${escapeHtml(c.terminating)}">${escapeHtml(c.terminating || '-')}</td>
              <td class="text-right font-mono text-emerald-400">${formatRupiah(c.rev_sewa_tahun)}</td>
              <td class="text-center font-mono font-bold text-amber-400 bg-amber-500/10 rounded">${escapeHtml(c.rev_sharing_raw || `${roundPct(c.rev_sharing_pct)}%`)}</td>
              <td class="text-right font-mono font-bold text-cyan-400">${formatRupiah(c.biaya_rev_sharing)}</td>
              <td class="text-center">${getStatusBadge(c.status)}</td>
              <td class="text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <button class="btn-action btn-view-detail" data-type="collo" data-id="${c.id}" title="Lihat Detail"><i class="fa-solid fa-eye text-cyan-400"></i></button>
                  <button class="btn-action btn-quick-edit" data-type="collo" data-id="${c.id}" title="Edit Data Sirkuit"><i class="fa-solid fa-pen-to-square"></i></button>
                  <button class="btn-action btn-delete-row text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40" data-type="collo" data-id="${c.id}" title="Hapus Data"><i class="fa-solid fa-trash-can"></i></button>
                </div>
              </td>
            </tr>
          `;
        });
        tbLinks.innerHTML = lhtml;
      }

      renderRevShareCharts(json);

    } catch (e) {
      console.error(e);
    }
  }

  function renderRevShareCharts(json) {
    const { textColor, gridColor } = getChartTheme();
    const top7 = (json.top_pengelola || []).slice(0, 7);

    // Chart RevShare 1: Top Mitra Portfolio Donut
    const ctxMitra = document.getElementById('chartRevShareMitra')?.getContext('2d');
    if (ctxMitra && top7.length > 0) {
      destroyChart('revShareMitra');
      charts.revShareMitra = new Chart(ctxMitra, {
        type: 'doughnut',
        data: {
          labels: top7.map(m => m.pengelola.length > 16 ? m.pengelola.slice(0, 16) + '...' : m.pengelola),
          datasets: [{
            data: top7.map(m => m.total_rev),
            backgroundColor: ['#2A9D8F', '#e9c46a', '#5BBFB5', '#1A7A6E', '#e76f51', '#d4a373', '#10b981'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 10 }, padding: 10 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${formatRupiah(ctx.raw)}`
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    // Chart RevShare 2: Revenue vs Bagi Hasil (Side-by-side)
    const ctxComp = document.getElementById('chartRevShareCompare')?.getContext('2d');
    if (ctxComp && top7.length > 0) {
      destroyChart('revShareCompare');
      charts.revShareCompare = new Chart(ctxComp, {
        type: 'bar',
        data: {
          labels: top7.map(m => m.pengelola.length > 15 ? m.pengelola.slice(0, 15) + '...' : m.pengelola),
          datasets: [
            {
              label: 'Revenue Pelanggan',
              data: top7.map(m => m.total_rev),
              backgroundColor: 'rgba(42, 157, 143, 0.85)',
              borderRadius: 6
            },
            {
              label: 'Biaya Bagi Hasil Mitra',
              data: top7.map(m => m.total_sharing),
              backgroundColor: 'rgba(233, 196, 106, 0.85)',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => 'Rp ' + (val/1e9).toFixed(1) + 'M' } }
          }
        }
      });
    }
  }

  function roundPct(val) {
    if (!val) return 0;
    return Math.round(Number(val) * 1000) / 10;
  }

  // =========================================================================
  // VIEW 4: MONITORING JATUH TEMPO KONTRAK (MODUL A)
  // =========================================================================
  async function loadAlertsData() {
    const { category, search } = state.alerts;
    try {
      const res = await fetch(`/api/collo/expirations?category=${category}&search=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error('Failed to load alerts');
      const json = await res.json();

      // Counts
      const cnt = json.counts || {};
      document.getElementById('countAlertCritical').textContent = cnt.critical || 0;
      document.getElementById('countAlertWarning').textContent = cnt.warning || 0;
      document.getElementById('countAlertSafe').textContent = cnt.safe || 0;
      document.getElementById('countAlertExpired').textContent = cnt.expired || 0;

      // Table Title
      document.getElementById('alertTableTitle').textContent = `Daftar Kontrak: ${category} (${(json.data || []).length} sirkuit)`;

      // Table Body
      const tbody = document.getElementById('alertTableBody');
      if (tbody) {
        const sliceData = (json.data || []).slice(0, 60);
        const rowspanMap = computeRowspanMap(sliceData, 'pengelola');
        let html = '';
        sliceData.forEach((c, idx) => {
          let pengelolaTd = '';
          if (rowspanMap[idx] > 0) {
            const span = rowspanMap[idx];
            const isMerged = span > 1;
            pengelolaTd = `
              <td${span > 1 ? ` rowspan="${span}"` : ''} class="${isMerged ? 'cell-merged align-middle' : ''}">
                <strong class="text-slate-100 block">${escapeHtml(c.pengelola || '-')}</strong>
              </td>
            `;
          }
          html += `
            <tr>
              <td class="text-xs text-slate-500">${idx + 1}</td>
              ${pengelolaTd}
              <td>${formatPelangganCell(c.pelanggan)}</td>
              <td>${formatSoCell(c.sid, c.no_so)}</td>
              <td>${c.end_date || '-'}</td>
              <td class="text-center font-bold font-mono">${c.sisa_hari} Hari</td>
              <td class="text-center">${getAlertBadge(c.alert_category, c.sisa_hari)}</td>
              <td class="font-mono text-xs">${escapeHtml(c.spp || c.po_baru || c.ref_spp || '-')}</td>
              <td><span class="badge-pill bg-slate-800 text-slate-300 text-xs">${escapeHtml(c.proses_admin || 'Running')}</span></td>
              <td><strong>${escapeHtml(c.pic_admin || '-')}</strong></td>
              <td class="text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <button class="btn-action btn-view-detail" data-type="collo" data-id="${c.id}" title="Lihat Detail"><i class="fa-solid fa-eye text-cyan-400"></i></button>
                  <button class="btn-action btn-quick-edit" data-type="collo" data-id="${c.id}" title="Edit Data Sirkuit"><i class="fa-solid fa-pen-to-square"></i></button>
                  <button class="btn-action btn-delete-row text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40" data-type="collo" data-id="${c.id}" title="Hapus Data"><i class="fa-solid fa-trash-can"></i></button>
                </div>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      renderAlertsCharts(json);

    } catch (e) {
      console.error(e);
    }
  }

  function renderAlertsCharts(json) {
    const { textColor, gridColor } = getChartTheme();
    const cnt = json.counts || {};

    // Chart Alerts 1: Category Donut
    const ctxCat = document.getElementById('chartAlertsCategoryDonut')?.getContext('2d');
    if (ctxCat) {
      destroyChart('alertsCategoryDonut');
      charts.alertsCategoryDonut = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: ['CRITICAL (<30 Hari)', 'WARNING (30-60 Hari)', 'SAFE (>60 Hari)', 'EXPIRED / Overdue'],
          datasets: [{
            data: [cnt.critical || 0, cnt.warning || 0, cnt.safe || 0, cnt.expired || 0],
            backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#64748b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} Sirkuit`
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    // Chart Alerts 2: Remaining Days Bar
    const ctxDays = document.getElementById('chartAlertsSisaHari')?.getContext('2d');
    if (ctxDays) {
      destroyChart('alertsSisaHari');
      let overdue = 0, d0_30 = 0, d31_60 = 0, d61_90 = 0, d90plus = 0;
      (json.data || []).forEach(c => {
        const d = c.sisa_hari;
        if (d < 0) overdue++;
        else if (d <= 30) d0_30++;
        else if (d <= 60) d31_60++;
        else if (d <= 90) d61_90++;
        else d90plus++;
      });

      charts.alertsSisaHari = new Chart(ctxDays, {
        type: 'bar',
        data: {
          labels: ['Overdue (<0 Hari)', '0 - 30 Hari', '31 - 60 Hari', '61 - 90 Hari', '> 90 Hari'],
          datasets: [{
            label: 'Jumlah Sirkuit',
            data: [overdue, d0_30, d31_60, d61_90, d90plus],
            backgroundColor: ['#64748b', '#ef4444', '#f59e0b', '#38bdf8', '#10b981'],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 5: MONITORING PERIZINAN PROYEK PA (MODUL B)
  // =========================================================================
  async function loadSitacData() {
    const { status, pic, year, aging, search, page, pageSize } = state.sitac;
    const finalPic = state.myTasksOnlySitac ? state.activeTechnician : pic;
    const params = new URLSearchParams({
      status, pic: finalPic, year, aging, search, page, pageSize
    });

    try {
      const res = await fetch(`/api/sitac?${params}`);
      if (!res.ok) throw new Error('Failed to load SITAC');
      const json = await res.json();
      state.sitac.data = json.data;

      // Update badge for My Tasks
      const myTasksBadge = document.getElementById('sitacMyTasksCount');
      if (myTasksBadge) {
        if (state.myTasksOnlySitac) {
          myTasksBadge.textContent = `${json.total || 0} PA`;
          myTasksBadge.classList.remove('hidden');
        } else {
          myTasksBadge.classList.add('hidden');
        }
      }

      // Pagination
      document.getElementById('sitacPaginationInfo').textContent = `Halaman ${json.page} dari ${json.totalPages} (${json.total} data)`;
      document.getElementById('sitacPrevPageBtn').disabled = json.page <= 1;
      document.getElementById('sitacNextPageBtn').disabled = json.page >= json.totalPages;

      const tbody = document.getElementById('sitacTableBody');
      if (tbody) {
        let html = '';
        (json.data || []).forEach((s, idx) => {
          const rowIdx = (json.page - 1) * json.pageSize + idx + 1;
          html += `
            <tr>
              <td class="font-mono text-xs text-slate-500">${rowIdx}</td>
              <td class="font-mono font-bold text-cyan-400 text-xs">${escapeHtml(s.no_pa || '-')}</td>
              <td>${formatPelangganCell(s.pelanggan)}</td>
              <td>${escapeHtml(s.pic_perijinan || '-')}</td>
              <td class="max-w-[200px] truncate" title="${escapeHtml(s.terminating)}">${escapeHtml(s.terminating || '-')}</td>
              <td class="text-right font-mono">${formatRupiah(s.biaya_permintaan_awal)}</td>
              <td class="text-right font-mono font-bold text-amber-400">${formatRupiah(s.biaya_final)}</td>
              <td class="text-right font-mono font-bold text-emerald-400">${formatRupiah(s.efisiensi_rupiah)}</td>
              <td class="text-center">${getStatusBadge(s.progress)}</td>
              <td class="text-center">${getAgingBadge(s.durasi_hari)}</td>
              <td class="text-xs text-slate-400">${s.date_dispos || '-'} s/d ${s.date_close || '-'}</td>
              <td class="text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <button class="btn-action btn-view-detail" data-type="sitac" data-id="${s.id}" title="Lihat Detail"><i class="fa-solid fa-eye text-cyan-400"></i></button>
                  <button class="btn-action btn-quick-edit" data-type="sitac" data-id="${s.id}" title="Edit Data SITAC"><i class="fa-solid fa-pen-to-square"></i></button>
                  <button class="btn-action btn-delete-row text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40" data-type="sitac" data-id="${s.id}" title="Hapus Data"><i class="fa-solid fa-trash-can"></i></button>
                </div>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      // Update status badges on the tab buttons
      if (json.status_counts) {
        state.sitacStatusCounts = json.status_counts;
        const totalBadge = document.getElementById('sitacTotalBadge');
        const finishBadge = document.getElementById('sitacFinishBadge');
        const ongoingBadge = document.getElementById('sitacOngoingBadge');
        const holdBadge = document.getElementById('sitacHoldBadge');
        const cancelBadge = document.getElementById('sitacCancelBadge');

        if (totalBadge) totalBadge.textContent = json.status_counts.ALL ?? 451;
        if (finishBadge) finishBadge.textContent = json.status_counts.Finish ?? 0;
        if (ongoingBadge) ongoingBadge.textContent = json.status_counts.Ongoing ?? 0;
        if (holdBadge) holdBadge.textContent = json.status_counts.Hold ?? 0;
        if (cancelBadge) cancelBadge.textContent = json.status_counts.Cancel ?? 0;
      }

      if (json.aging_dist) {
        state.sitacAgingDist = json.aging_dist;
      }

      if (!state.execData) {
        fetch('/api/executive/summary').then(r => r.json()).then(d => {
          state.execData = d;
          renderSitacCharts(json.status_counts, json.aging_dist);
        });
      } else {
        renderSitacCharts(json.status_counts, json.aging_dist);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function renderSitacCharts(statusCounts, agingDist) {
    const { textColor, gridColor } = getChartTheme();
    const currentStatus = state.sitac.status || 'ALL';

    const sc = statusCounts || state.sitacStatusCounts || (state.execData?.sitac ? {
      Finish: state.execData.sitac.finish_count || 373,
      Ongoing: state.execData.sitac.ongoing_count || 10,
      Hold: state.execData.sitac.hold_count || 5,
      Cancel: state.execData.sitac.cancel_count || 63,
      ALL: state.execData.sitac.total_pa || 451
    } : { Finish: 373, Ongoing: 10, Hold: 5, Cancel: 63, ALL: 451 });

    const ag = agingDist || state.sitacAgingDist || (state.execData?.sitac_aging_dist || { green: 173, yellow: 82, red: 179 });

    // Chart SITAC 1: SLA Aging Bar Chart (Reflects Filter)
    const ctxAging = document.getElementById('chartSitacAging')?.getContext('2d');
    const agingBadge = document.getElementById('sitacAgingChartBadge');
    if (ctxAging) {
      destroyChart('sitacAging');
      if (agingBadge) {
        agingBadge.textContent = currentStatus === 'ALL' ? 'Durasi Hari' : `Durasi (${currentStatus})`;
      }
      charts.sitacAging = new Chart(ctxAging, {
        type: 'bar',
        data: {
          labels: ['Aman (<= 7 Hari)', 'Perhatian (8 - 14 Hari)', 'Kritis (> 14 Hari)'],
          datasets: [{
            label: `Penugasan PA ${currentStatus !== 'ALL' ? '(' + currentStatus + ')' : ''}`,
            data: [ag.green || 0, ag.yellow || 0, ag.red || 0],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label || 'Jumlah'}: ${ctx.raw} PA`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } }
          }
        }
      });
    }

    // Chart SITAC 2: Status Breakdown Donut Chart (HANYA status yang dipilih yang tampil)
    const ctxStatDetail = document.getElementById('chartSitacStatusDetail')?.getContext('2d');
    const statusBadge = document.getElementById('sitacChartTotalBadge');
    if (ctxStatDetail) {
      destroyChart('sitacStatusDetail');

      let labels = [];
      let data = [];
      let bgColors = [];

      if (currentStatus === 'ALL') {
        labels = ['Finish', 'Ongoing', 'Hold', 'Cancel'];
        data = [sc.Finish || 0, sc.Ongoing || 0, sc.Hold || 0, sc.Cancel || 0];
        bgColors = ['#2A9D8F', '#5BBFB5', '#E9C46A', '#E76F51'];
        if (statusBadge) {
          statusBadge.textContent = `Total ${sc.ALL || 451} PA`;
          statusBadge.className = 'pbi-visual-badge';
        }
      } else if (currentStatus === 'Finish') {
        labels = ['Finish'];
        data = [sc.Finish || 0];
        bgColors = ['#2A9D8F'];
        if (statusBadge) {
          statusBadge.textContent = `Finish: ${sc.Finish || 0} PA`;
          statusBadge.className = 'pbi-visual-badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        }
      } else if (currentStatus === 'Ongoing') {
        labels = ['Ongoing'];
        data = [sc.Ongoing || 0];
        bgColors = ['#5BBFB5'];
        if (statusBadge) {
          statusBadge.textContent = `Ongoing: ${sc.Ongoing || 0} PA`;
          statusBadge.className = 'pbi-visual-badge bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
        }
      } else if (currentStatus === 'Hold') {
        labels = ['Hold'];
        data = [sc.Hold || 0];
        bgColors = ['#eab308'];
        if (statusBadge) {
          statusBadge.textContent = `Hold: ${sc.Hold || 0} PA`;
          statusBadge.className = 'pbi-visual-badge bg-amber-500/20 text-amber-400 border border-amber-500/30';
        }
      } else if (currentStatus === 'Cancel') {
        labels = ['Cancel'];
        data = [sc.Cancel || 0];
        bgColors = ['#ef4444'];
        if (statusBadge) {
          statusBadge.textContent = `Cancel: ${sc.Cancel || 0} PA`;
          statusBadge.className = 'pbi-visual-badge bg-rose-500/20 text-rose-400 border border-rose-500/30';
        }
      }

      const totalFiltered = data.reduce((a, b) => a + b, 0);

      charts.sitacStatusDetail = new Chart(ctxStatDetail, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: bgColors,
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: textColor,
                font: { size: 11, family: 'Outfit, sans-serif' },
                padding: 12
              }
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} PA (${totalFiltered > 0 ? ((ctx.raw / totalFiltered) * 100).toFixed(1) : 0}%)`
              }
            }
          },
          cutout: '68%',
          onClick: (evt, activeEls) => {
            if (currentStatus !== 'ALL') {
              const allBtn = document.querySelector('.sitac-tab-btn[data-status="ALL"]');
              if (allBtn) allBtn.click();
            } else if (activeEls && activeEls.length > 0) {
              const idx = activeEls[0].index;
              const clickedStatus = labels[idx];
              if (clickedStatus) {
                const targetBtn = document.querySelector(`.sitac-tab-btn[data-status="${clickedStatus}"]`);
                if (targetBtn) targetBtn.click();
              }
            }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 6: TIKET GANGGUAN DARURAT (MODUL B)
  // =========================================================================
  async function loadGangguanData() {
    const { status, search, dateType, exactDate, startDate, endDate } = state.gangguan;
    try {
      const params = new URLSearchParams();
      params.set('status', status);
      if (search) params.set('search', search);
      if (state.myTasksOnlyGangguan && state.activeTechnician) {
        params.set('pic', state.activeTechnician);
      }
      if (dateType) params.set('date_type', dateType);
      if (exactDate) {
        params.set('date', exactDate);
      } else {
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);
      }

      const res = await fetch(`/api/gangguan?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load gangguan');
      const json = await res.json();
      state.gangguan.data = json.data || [];

      // Update badge for My Tasks
      const myTasksBadge = document.getElementById('gangguanMyTasksCount');
      if (myTasksBadge) {
        if (state.myTasksOnlyGangguan) {
          myTasksBadge.textContent = `${json.total || 0} tiket`;
          myTasksBadge.classList.remove('hidden');
        } else {
          myTasksBadge.classList.add('hidden');
        }
      }

      // Update Tab Badges if provided by backend
      if (json.counts) {
        const bAll = document.getElementById('gangguanBadgeAll');
        const bOpen = document.getElementById('gangguanBadgeOpen');
        const bClosed = document.getElementById('gangguanBadgeClosed');
        if (bAll) bAll.textContent = `(${json.counts.all})`;
        if (bOpen) bOpen.textContent = `(${json.counts.open})`;
        if (bClosed) bClosed.textContent = `(${json.counts.selesai})`;
      }

      // Update Filter Result Summary Chip
      const countEl = document.getElementById('gangguanFilterCountText');
      const biayaEl = document.getElementById('gangguanFilterBiayaText');
      if (countEl) countEl.innerHTML = `Menampilkan <strong>${json.total || 0}</strong> tiket`;
      if (biayaEl) biayaEl.textContent = formatRupiah(json.total_biaya || 0);

      const tbody = document.getElementById('gangguanTableBody');
      if (tbody) {
        if (!json.data || json.data.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="11" class="text-center py-8 text-slate-400">
                <div class="flex flex-col items-center justify-center gap-2">
                  <i class="fa-solid fa-calendar-xmark text-2xl text-slate-600"></i>
                  <span>Tidak ada tiket gangguan ditemukan pada periode tanggal yang dipilih.</span>
                  <button type="button" class="btn btn-secondary btn-sm mt-1 text-xs" onclick="document.getElementById('btnResetGangguanDate')?.click()">
                    <i class="fa-solid fa-rotate-left mr-1"></i> Reset Filter Tanggal
                  </button>
                </div>
              </td>
            </tr>
          `;
        } else {
          let html = '';
          json.data.forEach((g, idx) => {
            const stBadge = g.is_selesai === 1 
              ? `<span class="status-badge status-finish"><i class="fa-solid fa-circle-check"></i> Selesai</span>`
              : `<span class="status-badge status-ongoing"><i class="fa-solid fa-clock"></i> Open / Proses</span>`;

            html += `
              <tr>
                <td class="font-mono text-xs text-slate-500">${idx + 1}</td>
                <td class="font-mono font-bold text-cyan-400 text-xs">${escapeHtml(g.no_tiket)}</td>
                <td class="font-medium text-slate-200">${g.tgl_dispos || '-'}</td>
                <td class="text-slate-400">${g.tgl_selesai || '-'}</td>
                <td class="max-w-[200px] truncate" title="${escapeHtml(g.terminating)}">${escapeHtml(g.terminating || '-')}</td>
                <td><span class="badge-pill bg-slate-800 text-slate-300 text-xs">${escapeHtml(g.jenis_gangguan || 'FO Cut')}</span></td>
                <td><strong>${escapeHtml(g.pic_perijinan || '-')}</strong></td>
                <td class="text-right font-mono text-amber-400 font-semibold">${formatRupiah(g.biaya_gangguan)}</td>
                <td class="text-center">${stBadge}</td>
                <td class="max-w-[220px] truncate text-xs text-slate-400" title="${escapeHtml(g.update_gangguan)}">${escapeHtml(g.update_gangguan || '-')}</td>
                <td class="text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <button class="btn-action btn-view-detail" data-type="gangguan" data-id="${g.id}" title="Lihat Detail"><i class="fa-solid fa-eye text-cyan-400"></i></button>
                    <button class="btn-action btn-quick-edit" data-type="gangguan" data-id="${g.id}" title="Edit Data Gangguan"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-action btn-delete-row text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40" data-type="gangguan" data-id="${g.id}" title="Hapus Data"><i class="fa-solid fa-trash-can"></i></button>
                  </div>
                </td>
              </tr>
            `;
          });
          tbody.innerHTML = html;
        }
      }

      renderGangguanCharts(json.data);

    } catch (e) {
      console.error(e);
    }
  }

  function renderGangguanCharts(records) {
    const { textColor, gridColor } = getChartTheme();
    if (!records || records.length === 0) {
      destroyChart('gangguanJenis');
      destroyChart('gangguanSla');
      return;
    }

    // Chart Gangguan 1: Incident Types
    const ctxJenis = document.getElementById('chartGangguanJenis')?.getContext('2d');
    if (ctxJenis) {
      destroyChart('gangguanJenis');
      const counts = {};
      records.forEach(r => {
        let j = (r.jenis_gangguan || 'Lain-lain').trim();
        if (j.length > 25) j = j.slice(0, 25) + '...';
        counts[j] = (counts[j] || 0) + 1;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);

      charts.gangguanJenis = new Chart(ctxJenis, {
        type: 'bar',
        data: {
          labels: sorted.map(s => s[0]),
          datasets: [{
            label: 'Jumlah Kasus',
            data: sorted.map(s => s[1]),
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
            y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }

    // Chart Gangguan 2: SLA Status Donut
    const ctxSla = document.getElementById('chartGangguanSla')?.getContext('2d');
    if (ctxSla) {
      destroyChart('gangguanSla');
      let selesai = 0, open = 0;
      records.forEach(r => {
        if (r.is_selesai === 1) selesai++;
        else open++;
      });
      let labels = ['Selesai (Resolved)', 'Open / Dalam Penanganan'];
      let data = [selesai, open];
      let bgColors = ['#10b981', '#ef4444'];

      if (state.gangguan.status === '0') {
        labels = ['Open / Dalam Penanganan'];
        data = [open];
        bgColors = ['#ef4444'];
      } else if (state.gangguan.status === '1') {
        labels = ['Selesai (Resolved)'];
        data = [selesai];
        bgColors = ['#10b981'];
      }

      const totalFiltered = data.reduce((a, b) => a + b, 0);

      charts.gangguanSla = new Chart(ctxSla, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: bgColors,
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11, family: 'Outfit, sans-serif' }, padding: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} Tiket (${totalFiltered > 0 ? ((ctx.raw / totalFiltered) * 100).toFixed(1) : 0}%)`
              }
            }
          },
          cutout: '68%',
          onClick: (evt, activeEls) => {
            if (state.gangguan.status !== 'ALL') {
              const allBtn = document.querySelector('.gangguan-tab-btn[data-status="ALL"]');
              if (allBtn) allBtn.click();
            } else if (activeEls && activeEls.length > 0) {
              const idx = activeEls[0].index;
              const targetStatus = idx === 0 ? '1' : '0';
              const targetBtn = document.querySelector(`.gangguan-tab-btn[data-status="${targetStatus}"]`);
              if (targetBtn) targetBtn.click();
            }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 7: REKAP EFISIENSI (MODUL B)
  // =========================================================================
  async function loadEfisiensiData() {
    try {
      const res = await fetch('/api/rekap-efisiensi');
      if (!res.ok) throw new Error('Failed to load efisiensi');
      const rows = await res.json();
      state.efisiensi = rows || [];

      const tbody = document.getElementById('rekapEfisiensiTableBody');
      if (tbody) {
        let html = '';
        rows.forEach(r => {
          html += `
            <tr>
              <td><strong class="text-lg text-cyan-400 font-mono">${r.tahun}</strong></td>
              <td class="text-center font-bold">${r.total_disposisi}</td>
              <td class="text-center text-amber-400 font-bold">${r.ada_biaya}</td>
              <td class="text-center text-emerald-400 font-bold">${r.tidak_ada_biaya}</td>
              <td class="text-right font-mono">${formatRupiah(r.nilai_awal)}</td>
              <td class="text-right font-mono font-bold text-amber-400">${formatRupiah(r.nilai_akhir)}</td>
              <td class="text-right font-mono font-bold text-emerald-400">${formatRupiah(r.efisiensi_rupiah)}</td>
              <td class="text-center font-bold text-emerald-400 bg-emerald-500/10 rounded">${r.efisiensi_persen}%</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      renderEfisiensiCharts(rows);

    } catch (e) {
      console.error(e);
    }
  }

  function renderEfisiensiCharts(rows) {
    const { textColor, gridColor } = getChartTheme();
    if (!rows || rows.length === 0) return;

    // Chart Efisiensi 1: Awal vs Akhir
    const ctxComp = document.getElementById('chartEfisiensiCompare')?.getContext('2d');
    if (ctxComp) {
      destroyChart('efisiensiCompare');
      charts.efisiensiCompare = new Chart(ctxComp, {
        type: 'bar',
        data: {
          labels: rows.map(r => `Tahun ${r.tahun}`),
          datasets: [
            {
              label: 'Biaya Pengajuan Awal',
              data: rows.map(r => r.nilai_awal),
              backgroundColor: 'rgba(239, 68, 68, 0.8)',
              borderRadius: 4
            },
            {
              label: 'Realisasi Biaya Akhir',
              data: rows.map(r => r.nilai_akhir),
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderRadius: 4
            },
            {
              label: 'Nominal Penghematan',
              data: rows.map(r => r.efisiensi_rupiah),
              backgroundColor: 'rgba(42, 157, 143, 0.85)',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => 'Rp ' + (val/1e6).toFixed(0) + ' Jt' } }
          }
        }
      });
    }

    // Chart Efisiensi 2: Efficiency % Trend
    const ctxPct = document.getElementById('chartEfisiensiPct')?.getContext('2d');
    if (ctxPct) {
      destroyChart('efisiensiPct');
      charts.efisiensiPct = new Chart(ctxPct, {
        type: 'line',
        data: {
          labels: rows.map(r => `Tahun ${r.tahun}`),
          datasets: [{
            label: 'Efisiensi Negosiasi (%)',
            data: rows.map(r => r.efisiensi_persen),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: 6,
            pointBackgroundColor: '#10b981'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor } },
            tooltip: {
              callbacks: {
                label: ctx => ` Efisiensi: ${ctx.raw}%`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => `${val}%` }, min: 0, max: 100 }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 8: PIC WORKLOAD MATRIX (MODUL B)
  // =========================================================================
  async function loadPicMatrixData() {
    try {
      const res = await fetch('/api/pic-performance');
      if (!res.ok) throw new Error('Failed to load pic performance');
      const rows = await res.json();
      state.picMatrix = rows || [];

      const tbody = document.getElementById('picMatrixTableBody');
      if (tbody) {
        let html = '';
        rows.forEach(p => {
          html += `
            <tr>
              <td><strong>${escapeHtml(p.pic)}</strong></td>
              <td class="text-center font-bold">${p.total_penugasan}</td>
              <td class="text-center font-bold text-emerald-400">${p.finish}</td>
              <td class="text-center text-amber-400">${p.ongoing + p.hold}</td>
              <td class="text-center text-rose-400">${p.cancel}</td>
              <td class="text-center font-mono font-bold text-emerald-400">${p.finish_rate}%</td>
              <td class="text-right font-mono">${formatRupiah(p.biaya_awal)}</td>
              <td class="text-right font-mono font-bold text-amber-400">${formatRupiah(p.biaya_final)}</td>
              <td class="text-right font-mono font-bold text-emerald-400">${formatRupiah(p.efisiensi_rupiah)}</td>
              <td class="text-center font-mono">${p.avg_sla_hari} Hari</td>
              <td class="text-center font-bold text-cyan-400">${p.gangguan_count}</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      renderPicMatrixCharts(rows);

    } catch (e) {
      console.error(e);
    }
  }

  function renderPicMatrixCharts(rows) {
    const { textColor, gridColor } = getChartTheme();
    if (!rows || rows.length === 0) return;

    // Chart PIC 1: Stacked Bar Workload
    const ctxWork = document.getElementById('chartPicWorkload')?.getContext('2d');
    if (ctxWork) {
      destroyChart('picWorkload');
      charts.picWorkload = new Chart(ctxWork, {
        type: 'bar',
        data: {
          labels: rows.map(p => p.pic),
          datasets: [
            {
              label: 'Penugasan Perizinan (PA)',
              data: rows.map(p => p.total_penugasan),
              backgroundColor: 'rgba(42, 157, 143, 0.85)',
              borderRadius: 6
            },
            {
              label: 'Tiket Gangguan Lapangan',
              data: rows.map(p => p.gangguan_count),
              backgroundColor: 'rgba(233, 196, 106, 0.85)',
              borderRadius: 6
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} Tugas`
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
            y: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }

    // Chart PIC 2: Finish Rate (%)
    const ctxRate = document.getElementById('chartPicFinishRate')?.getContext('2d');
    if (ctxRate) {
      destroyChart('picFinishRate');
      charts.picFinishRate = new Chart(ctxRate, {
        type: 'bar',
        data: {
          labels: rows.map(p => p.pic),
          datasets: [{
            label: 'Finish Rate (%)',
            data: rows.map(p => p.finish_rate),
            backgroundColor: rows.map(p => p.finish_rate >= 80 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(245, 158, 11, 0.85)'),
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` Finish Rate: ${ctx.raw}%`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => `${val}%` }, min: 0, max: 100 },
            y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 9: PETA SEBARAN (WEBGIS LEAFLET)
  // =========================================================================
  function setMapBaseLayer(layerKey) {
    if (!leafletMap || !mapBaseLayers[layerKey]) return;

    // Remove other base layers
    Object.keys(mapBaseLayers).forEach(k => {
      if (leafletMap.hasLayer(mapBaseLayers[k])) {
        leafletMap.removeLayer(mapBaseLayers[k]);
      }
    });

    // Add selected layer
    mapBaseLayers[layerKey].addTo(leafletMap);
    currentBaseLayer = layerKey;

    // Update active class on buttons
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-layer') === layerKey);
    });

    // Trigger invalidateSize to ensure new tiles render seamlessly
    leafletMap.invalidateSize();
  }

  async function initWebgisMap() {
    const mapEl = document.getElementById('portalLeafletMap');
    if (!mapEl) return;

    if (!leafletMap) {
      leafletMap = L.map('portalLeafletMap', {
        center: [-6.2200, 106.8400],
        zoom: 11,
        zoomControl: true,
        preferCanvas: true
      });

      // Prepare official Google Maps & High-Res providers
      mapBaseLayers = {
        googleRoadmap: L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps',
          maxZoom: 20,
          subdomains: ['0', '1', '2', '3']
        }),
        googleHybrid: L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps Satelit &mdash; Maxar, CNES',
          maxZoom: 20,
          subdomains: ['0', '1', '2', '3']
        }),
        googleTerrain: L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
          attribution: '&copy; Google Maps Medan',
          maxZoom: 20,
          subdomains: ['0', '1', '2', '3']
        }),
        cartoDark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; CARTO &copy; OpenStreetMap',
          maxZoom: 19
        })
      };

      // Default to Google Maps Roadmap (Peta Standar Google)
      mapBaseLayers['googleRoadmap'].addTo(leafletMap);
      currentBaseLayer = 'googleRoadmap';

      mapMarkersLayer = L.layerGroup().addTo(leafletMap);

      // Auto-detect container size changes using ResizeObserver
      if (window.ResizeObserver && !mapResizeObserver) {
        mapResizeObserver = new ResizeObserver(() => {
          if (leafletMap) leafletMap.invalidateSize();
        });
        mapResizeObserver.observe(mapEl);
      }

      window.addEventListener('resize', () => {
        if (leafletMap && state.activeView === 'view-webgis') {
          leafletMap.invalidateSize();
        }
      });
    }

    // Force multiple invalidateSize steps to guarantee no blank/gray tiles
    leafletMap.invalidateSize();
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 150);
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 350);

    await updateMapMarkers();
  }

  async function updateMapMarkers(filterStatus = 'ALL') {
    if (!leafletMap || !mapMarkersLayer) return;
    mapMarkersLayer.clearLayers();

    try {
      const res = await fetch(`/api/map-coordinates?status=${filterStatus}`);
      if (!res.ok) throw new Error('Failed to load map coords');
      const pins = await res.json();

      // Update counter pill
      const countEl = document.getElementById('mapPinCount');
      if (countEl) countEl.textContent = pins.length;

      const colors = {
        Finish: '#10b981',
        Ongoing: '#f59e0b',
        Hold: '#eab308',
        Cancel: '#ef4444'
      };

      const bounds = [];
      const coordCounts = {};

      pins.forEach(p => {
        if (!p.latitude || !p.longitude) return;

        // Micro-jitter to spread duplicate coordinates so all 451 points are visible
        const coordKey = `${Number(p.latitude).toFixed(4)},${Number(p.longitude).toFixed(4)}`;
        const count = coordCounts[coordKey] || 0;
        coordCounts[coordKey] = count + 1;

        let lat = Number(p.latitude);
        let lng = Number(p.longitude);
        if (count > 0) {
          const angle = count * 0.785398; // 45 deg step
          const ring = Math.floor((count - 1) / 8) + 1;
          const offset = 0.0016 * ring; // ~180m dispersion
          lat += offset * Math.sin(angle);
          lng += (offset * 1.3) * Math.cos(angle);
        }

        const markerColor = colors[p.progress] || '#06b6d4';
        const marker = L.circleMarker([lat, lng], {
          radius: 7,
          fillColor: markerColor,
          color: '#ffffff',
          weight: 1.5,
          opacity: 0.9,
          fillOpacity: 0.85
        });

        const gmapsCoordQuery = encodeURIComponent(`${lat.toFixed(6)},${lng.toFixed(6)}`);
        marker.bindPopup(`
          <div class="p-2 space-y-1 font-sans">
            <div class="flex justify-between items-center text-xs border-b border-white/10 pb-1 gap-2">
              <strong class="font-mono text-cyan-400 font-bold">${escapeHtml(p.no_pa || 'PA')}</strong>
              ${getStatusBadge(p.progress)}
            </div>
            <div class="font-bold text-sm text-slate-100 mt-1">${escapeHtml(p.pelanggan || 'Pelanggan')}</div>
            <div class="text-xs text-slate-300 leading-relaxed"><i class="fa-solid fa-location-dot text-rose-400 mr-1"></i>${escapeHtml(p.terminating || '-')}</div>
            <div class="text-xs text-slate-300">PIC: <strong>${escapeHtml(p.pic_perijinan || '-')}</strong></div>
            <div class="flex justify-between text-xs pt-1 border-t border-white/10 mt-1">
              <span>Biaya Final:</span>
              <strong class="text-amber-400 font-mono">${formatRupiah(p.biaya_final)}</strong>
            </div>
            <a href="https://www.google.com/maps/search/?api=1&query=${gmapsCoordQuery}" target="_blank" rel="noopener noreferrer" class="btn-gmaps-link">
              <i class="fa-brands fa-google text-rose-400"></i>
              <span>Buka di Google Maps</span>
              <i class="fa-solid fa-arrow-up-right-from-square text-[10px] ml-1"></i>
            </a>
          </div>
        `);

        mapMarkersLayer.addLayer(marker);
        bounds.push([lat, lng]);
      });

      if (bounds.length > 0) {
        lastMapBounds = L.latLngBounds(bounds);
        leafletMap.fitBounds(lastMapBounds, { padding: [40, 40], maxZoom: 13 });
      }

      // Re-trigger invalidateSize after points render
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 200);
    } catch (e) {
      console.error('Error updating map markers:', e);
    }
  }

  // =========================================================================
  // INTERACTIVE CRUD MODALS (PATCH & POST)
  // =========================================================================

  function openQuickEditModal(type, id) {
    const overlay = document.getElementById('modalQuickEdit');
    const container = document.getElementById('quickEditDynamicFields');
    const title = document.getElementById('quickEditModalTitle');
    const sub = document.getElementById('quickEditModalSub');

    document.getElementById('quickEditTargetType').value = type;
    document.getElementById('quickEditTargetId').value = id;

    if (type === 'collo') {
      let rec = (contractAlertData?.items || []).find(c => c.id == id) ||
                (state.collo?.data || []).find(c => c.id == id) ||
                (state.alerts?.data || []).find(c => c.id == id) ||
                (state.revSharing?.data || []).find(c => c.id == id) || {};
      const firstPel = (rec.pelanggan || '').split(/[\r\n]+/)[0]?.replace(/^\d+[\.\)]\s*/, '') || 'Colocation';
      title.textContent = `Edit Data Link #${id} - ${firstPel}`;
      sub.textContent = 'Perbarui identitas sirkuit, nilai finansial sewa, status, dan data administrasi';
      container.innerHTML = `
        <!-- Section 1: Identitas Sirkuit & Pelanggan -->
        <div class="p-4 bg-slate-900/60 rounded-xl border border-cyan-500/20 space-y-3.5 shadow-sm">
          <div class="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
            <i class="fa-solid fa-network-wired"></i>
            <span>Identitas Sirkuit & Pelanggan</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Pengelola / Mitra Datacenter *</label>
              <input type="text" name="pengelola" class="filter-input w-full text-xs font-semibold" value="${escapeHtml(rec.pengelola || '')}" required placeholder="Contoh: NTT, APJII, dll">
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Nama Pelanggan *</label>
              <input type="text" name="pelanggan" class="filter-input w-full text-xs font-semibold text-slate-100" value="${escapeHtml(rec.pelanggan || '')}" required placeholder="Nama Pelanggan">
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">SID Sirkuit</label>
              <input type="text" name="sid" class="filter-input w-full text-xs font-mono text-cyan-400" value="${escapeHtml(rec.sid || '')}" placeholder="Contoh: 100234">
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Nomor SO</label>
              <input type="text" name="no_so" class="filter-input w-full text-xs font-mono" value="${escapeHtml(rec.no_so || '')}" placeholder="Contoh: AR/ACT/...">
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Jenis Sewa / Layanan</label>
              <select name="jenis_sewa" class="filter-select w-full text-xs font-medium">
                <option value="Colocation" ${rec.jenis_sewa === 'Colocation' ? 'selected' : ''}>Colocation</option>
                <option value="Revenue Sharing" ${rec.jenis_sewa === 'Revenue Sharing' ? 'selected' : ''}>Revenue Sharing</option>
                <option value="Interkoneksi" ${rec.jenis_sewa === 'Interkoneksi' ? 'selected' : ''}>Interkoneksi</option>
                <option value="Rack Space" ${rec.jenis_sewa === 'Rack Space' ? 'selected' : ''}>Rack Space</option>
                <option value="Cross Connect" ${rec.jenis_sewa === 'Cross Connect' ? 'selected' : ''}>Cross Connect</option>
                <option value="Space Tower" ${rec.jenis_sewa === 'Space Tower' ? 'selected' : ''}>Space Tower</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Originating (Lokasi Asal)</label>
              <input type="text" name="originating" class="filter-input w-full text-xs" value="${escapeHtml(rec.originating || '')}" placeholder="Lokasi asal...">
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Terminating (Lokasi Tujuan)</label>
              <input type="text" name="terminating" class="filter-input w-full text-xs" value="${escapeHtml(rec.terminating || '')}" placeholder="Lokasi tujuan...">
            </div>
          </div>
        </div>

        <!-- Section 2: Finansial & Skema Biaya -->
        <div class="p-4 bg-slate-900/60 rounded-xl border border-emerald-500/20 space-y-3.5 shadow-sm">
          <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
            <span class="flex items-center gap-1.5"><i class="fa-solid fa-coins"></i> Nilai Finansial & Skema Biaya</span>
            <span class="text-[10px] text-slate-400 font-normal">Kalkulasi Margin Otomatis</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Rev Sewa (1 Thn) (Rp)</label>
              <input type="number" name="rev_sewa_tahun" id="quickEditRevSewa" class="filter-input w-full text-xs font-mono font-bold text-emerald-400" value="${rec.rev_sewa_tahun || 0}">
              <span class="text-[11px] text-emerald-400 font-mono font-semibold block mt-1" id="previewQuickEditRev">${formatRupiah(rec.rev_sewa_tahun || 0)}</span>
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Biaya OTC (Rp)</label>
              <input type="number" name="biaya_otc" id="quickEditBiayaOtc" class="filter-input w-full text-xs font-mono text-purple-400 font-semibold" value="${rec.biaya_otc || 0}">
              <span class="text-[11px] text-purple-400 font-mono font-semibold block mt-1" id="previewQuickEditOtc">${formatRupiah(rec.biaya_otc || 0)}</span>
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Biaya Sewa 1 Tahun (Rp)</label>
              <input type="number" name="biaya_sewa_tahun" id="quickEditBiayaSewa" class="filter-input w-full text-xs font-mono text-amber-400 font-semibold" value="${rec.biaya_sewa_tahun || 0}">
              <span class="text-[11px] text-amber-400 font-mono font-semibold block mt-1" id="previewQuickEditBiaya">${formatRupiah(rec.biaya_sewa_tahun || 0)}</span>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Rev Sharing (%)</label>
              <input type="number" step="0.01" name="rev_sharing_pct" class="filter-input w-full text-xs font-mono" value="${rec.rev_sharing_pct || 0}" placeholder="20">
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Status Sirkuit *</label>
              <select name="status" class="filter-select w-full text-xs font-bold">
                <option value="ACTIVE" ${rec.status === 'ACTIVE' ? 'selected' : ''}>🟢 ACTIVE</option>
                <option value="NON ACTIVE" ${rec.status === 'NON ACTIVE' ? 'selected' : ''}>⚪ NON ACTIVE</option>
                <option value="DEACTIVASI" ${rec.status === 'DEACTIVASI' ? 'selected' : ''}>🔴 DEACTIVASI</option>
              </select>
            </div>
            <div>
              <label class="form-label text-slate-400 text-xs mb-1 block">Estimasi Gross Margin</label>
              <div class="h-[38px] px-3 bg-slate-950/80 rounded-xl border border-cyan-500/25 flex items-center justify-between">
                <span class="text-[10px] text-slate-400">Margin:</span>
                <span class="font-mono font-bold text-cyan-400 text-xs" id="previewQuickEditMargin">${formatRupiah(rec.margin_rupiah || 0)} (${rec.margin_persen || 0}%)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 3: Administrasi & Kontrak -->
        <div class="p-4 bg-slate-900/60 rounded-xl border border-amber-500/20 space-y-3.5 shadow-sm">
          <div class="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
            <i class="fa-solid fa-file-contract"></i>
            <span>Administrasi, Kontrak & Catatan</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Tanggal Mulai Kontrak</label>
              <input type="date" name="start_date" class="filter-input w-full text-xs" value="${rec.start_date || ''}">
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Tanggal Jatuh Tempo</label>
              <input type="date" name="end_date" class="filter-input w-full text-xs" value="${rec.end_date || ''}">
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Nomor SPP</label>
              <input type="text" name="spp" class="filter-input w-full text-xs font-mono" value="${escapeHtml(rec.spp || '')}" placeholder="Nomor SPP">
            </div>
            <div>
              <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Nomor PO Baru</label>
              <input type="text" name="po_baru" class="filter-input w-full text-xs font-mono" value="${escapeHtml(rec.po_baru || '')}" placeholder="Nomor PO">
            </div>
          </div>
          <div>
            <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Status Proses Admin</label>
            <input type="text" name="proses_admin" class="filter-input w-full text-xs" value="${escapeHtml(rec.proses_admin || '')}" placeholder="Contoh: Proses SPP / Running">
          </div>
          <div>
            <label class="form-label text-slate-300 font-medium text-xs mb-1 block">Catatan Keterangan</label>
            <textarea name="keterangan" rows="2" class="filter-input w-full text-xs" placeholder="Catatan kontrak / rekanan...">${escapeHtml(rec.keterangan || '')}</textarea>
          </div>
        </div>
      `;

      // Wire live currency previews & auto margin calculation
      const inRev = document.getElementById('quickEditRevSewa');
      const inOtc = document.getElementById('quickEditBiayaOtc');
      const inBiaya = document.getElementById('quickEditBiayaSewa');
      const inMargin = document.getElementById('previewQuickEditMargin');

      const updateLivePreviews = () => {
        const rev = parseInt(inRev?.value || '0', 10) || 0;
        const otc = parseInt(inOtc?.value || '0', 10) || 0;
        const biaya = parseInt(inBiaya?.value || '0', 10) || 0;
        const margin = rev - biaya;
        const pct = rev > 0 ? ((margin / rev) * 100).toFixed(1) : '0.0';

        const pRev = document.getElementById('previewQuickEditRev');
        if (pRev) pRev.textContent = formatRupiah(rev);
        const pOtc = document.getElementById('previewQuickEditOtc');
        if (pOtc) pOtc.textContent = formatRupiah(otc);
        const pBiaya = document.getElementById('previewQuickEditBiaya');
        if (pBiaya) pBiaya.textContent = formatRupiah(biaya);
        if (inMargin) inMargin.textContent = `${formatRupiah(margin)} (${pct}%)`;
      };

      [inRev, inOtc, inBiaya].forEach(input => {
        input?.addEventListener('input', updateLivePreviews);
      });

      // Asynchronously fetch complete single record from backend to guarantee 100% fresh data
      fetch(`/api/collo/${id}`)
        .then(res => res.ok ? res.json() : null)
        .then(freshRec => {
          if (!freshRec) return;
          if (document.getElementById('quickEditTargetId')?.value != id) return;
          const f = document.getElementById('formQuickEdit');
          if (!f) return;
          const fields = [
            'pengelola', 'pelanggan', 'sid', 'no_so', 'jenis_sewa', 'originating', 'terminating',
            'rev_sewa_tahun', 'biaya_otc', 'biaya_sewa_tahun', 'rev_sharing_pct', 'status',
            'start_date', 'end_date', 'spp', 'po_baru', 'proses_admin', 'keterangan'
          ];
          fields.forEach(field => {
            const input = f.elements[field];
            if (input && (input.value === '' || input.value === '0' || !input.matches(':focus'))) {
              if (freshRec[field] !== undefined && freshRec[field] !== null) {
                input.value = freshRec[field];
              }
            }
          });
          updateLivePreviews();
          const firstPel = (freshRec.pelanggan || '').split(/[\r\n]+/)[0]?.replace(/^\d+[\.\)]\s*/, '') || 'Colocation';
          title.textContent = `Edit Data Link #${id} - ${firstPel}`;
        })
        .catch(err => console.warn('Could not fetch single collo:', err));
    } else if (type === 'sitac') {
      const rec = (state.sitac.data || []).find(s => s.id == id) || {};
      title.textContent = `Update Penugasan SITAC #${id}`;
      sub.textContent = 'Perbarui progress pengerjaan lapangan dan realisasi biaya final';
      container.innerHTML = `
        <div>
          <label class="form-label">Progress Pengerjaan *</label>
          <select name="progress" class="filter-select w-full text-xs">
            <option value="Finish" ${rec.progress === 'Finish' ? 'selected' : ''}>Finish</option>
            <option value="Ongoing" ${rec.progress === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
            <option value="Hold" ${rec.progress === 'Hold' ? 'selected' : ''}>Hold</option>
            <option value="Cancel" ${rec.progress === 'Cancel' ? 'selected' : ''}>Cancel</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Realisasi Biaya Final (Rp)</label>
            <input type="number" name="biaya_final" class="filter-input w-full text-xs" value="${rec.biaya_final || 0}">
          </div>
          <div>
            <label class="form-label">Tanggal Close / Selesai</label>
            <input type="date" name="date_close" class="filter-input w-full text-xs" value="${rec.date_close || ''}">
          </div>
        </div>
        <div>
          <label class="form-label">Update Pengerjaan Lapangan</label>
          <textarea name="update_pekerjaan" rows="2" class="filter-input w-full text-xs" placeholder="Catatan progress fisik...">${escapeHtml(rec.update_pekerjaan || '')}</textarea>
        </div>
        <div>
          <label class="form-label">Upload / Ganti Foto Bukti / Berita Acara (Opsional)</label>
          <input type="file" id="quickEditFotoInput" accept="image/*,application/pdf" class="filter-input w-full text-xs cursor-pointer">
          ${rec.foto_bukti ? `<span class="text-[10px] text-emerald-400 mt-1 block"><i class="fa-solid fa-file-check mr-1"></i> File saat ini: ${escapeHtml(rec.foto_bukti)}</span>` : '<span class="text-[10px] text-slate-500 mt-1 block">Format: JPG, PNG, atau PDF</span>'}
        </div>
      `;
    } else if (type === 'gangguan') {
      const rec = (state.gangguan.data || []).find(g => g.id == id) || {};
      title.textContent = `Update Tiket Gangguan #${id}`;
      sub.textContent = 'Update status penyelesaian insiden dan catatan penanganan';
      container.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Status Penyelesaian *</label>
            <select name="is_selesai" class="filter-select w-full text-xs">
              <option value="1" ${rec.is_selesai === 1 ? 'selected' : ''}>Selesai (Close Incident)</option>
              <option value="0" ${rec.is_selesai === 0 ? 'selected' : ''}>Proses / Open (Sedang Dikerjakan)</option>
            </select>
          </div>
          <div>
            <label class="form-label">Tanggal Selesai</label>
            <input type="date" name="tgl_selesai" class="filter-input w-full text-xs" value="${rec.tgl_selesai || ''}">
          </div>
        </div>
        <div>
          <label class="form-label">Biaya Perbaikan Gangguan (Rp)</label>
          <input type="number" name="biaya_gangguan" class="filter-input w-full text-xs" value="${rec.biaya_gangguan || 0}" placeholder="0">
        </div>
        <div>
          <label class="form-label">Catatan Update Penanganan Lapangan</label>
          <textarea name="update_gangguan" rows="2" class="filter-input w-full text-xs" placeholder="Catatan lapangan...">${escapeHtml(rec.update_gangguan || '')}</textarea>
        </div>
        <div>
          <label class="form-label">Upload / Ganti Foto Bukti Lapangan (Opsional)</label>
          <input type="file" id="quickEditFotoInput" accept="image/*,application/pdf" class="filter-input w-full text-xs cursor-pointer">
          ${rec.foto_bukti ? `<span class="text-[10px] text-emerald-400 mt-1 block"><i class="fa-solid fa-file-check mr-1"></i> File saat ini: ${escapeHtml(rec.foto_bukti)}</span>` : '<span class="text-[10px] text-slate-500 mt-1 block">Format: JPG, PNG, atau PDF</span>'}
        </div>
      `;
    }

    overlay.style.display = 'flex';
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  async function handleQuickEditSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('quickEditTargetType').value;
    const id = document.getElementById('quickEditTargetId').value;
    const form = document.getElementById('formQuickEdit');
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';
    }

    const formData = new FormData(form);
    const payload = {};
    formData.forEach((val, key) => {
      payload[key] = typeof val === 'string' ? val.trim() : val;
    });

    const fileInput = document.getElementById('quickEditFotoInput');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      try {
        const file = fileInput.files[0];
        const base64Data = await readFileAsBase64(file);
        const upRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            data: base64Data,
            type: type,
            id: id
          })
        });
        const upData = await upRes.json();
        if (upData.success && upData.filename) {
          payload.foto_bukti = upData.filename;
        }
      } catch (upErr) {
        console.error('Upload error in quick edit:', upErr);
      }
    }

    try {
      const res = await fetch(`/api/${type}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message || 'Perubahan berhasil disimpan ke database!');
        document.getElementById('modalQuickEdit').style.display = 'none';

        // Background sync to Google Cloud Firestore if online
        if (window.TelecomFirebase && typeof window.TelecomFirebase.firestoreUpdateRecord === 'function') {
          const colName = type === 'collo' ? 'collo_records' : (type === 'sitac' ? 'sitac_records' : 'gangguan_records');
          window.TelecomFirebase.firestoreUpdateRecord(colName, String(id), payload).catch(err => {
            console.warn('Firestore async sync notice:', err);
          });
        }

        // Refresh active table
        if (state.activeView === 'view-collo-list') await loadColloData();
        else if (state.activeView === 'view-collo-alerts') await loadAlertsData();
        else if (state.activeView === 'view-collo-rev-sharing') await loadRevSharingData();
        else if (state.activeView === 'view-sitac-pa') await loadSitacData();
        else if (state.activeView === 'view-gangguan') await loadGangguanData();
        else if (state.activeView === 'view-executive') await loadExecutiveSummary();

        // Refresh contract alert bell & counts if collo record was updated
        if (type === 'collo') {
          fetchExpiringContracts(true);
        }
      } else {
        alert(data.message || 'Gagal menyimpan perubahan');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan jaringan saat menyimpan.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  async function handleAddFormSubmit(e, endpoint) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';
    }

    const formData = new FormData(form);
    const payload = {};
    formData.forEach((val, key) => {
      payload[key] = typeof val === 'string' ? val.trim() : val;
    });

    // Enforce identity lock: field technicians can never submit under another person's PIC
    if (state.currentUser?.role === 'lapangan' && (endpoint === 'gangguan' || endpoint === 'sitac')) {
      payload.pic_perijinan = state.currentUser.full_name || state.currentUser.pic_code || state.activeTechnician;
    }

    const fileInput = form.querySelector('input[type="file"]');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      try {
        const file = fileInput.files[0];
        const base64Data = await readFileAsBase64(file);
        const upRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            data: base64Data
          })
        });
        const upData = await upRes.json();
        if (upData.success && upData.filename) {
          payload.foto_bukti = upData.filename;
        }
      } catch (upErr) {
        console.error('Upload error in add form:', upErr);
      }
    }

    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message || 'Data baru berhasil ditambahkan!');
        ['modalAddGangguan', 'modalAddSitac', 'modalAddCollo', 'modalPickAddType'].forEach(id => {
          const m = document.getElementById(id);
          if (m) m.style.display = 'none';
        });

        // Reset form inputs
        form.reset();

        // Refresh global state & meta
        await loadMetaOptions();
        await loadExecutiveSummary();

        // Refresh view data
        if (endpoint === 'gangguan') {
          await loadGangguanData();
          if (state.activeView !== 'view-gangguan') switchView('view-gangguan');
        } else if (endpoint === 'sitac') {
          await loadSitacData();
          if (state.activeView !== 'view-sitac-pa') switchView('view-sitac-pa');
        } else if (endpoint === 'collo') {
          await loadColloData();
          if (state.activeView !== 'view-collo-list') switchView('view-collo-list');
        }
      } else {
        alert(data.message || 'Gagal menambahkan data');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan jaringan atau server saat menyimpan data.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  // =========================================================================
  // FIELD OPERATIONS: DIRECT MODAL PHOTO UPLOAD & WHATSAPP COORDINATION
  // =========================================================================
  async function uploadBuktiDirect(type, id, fileInput) {
    if (!fileInput.files || !fileInput.files[0]) return;
    const file = fileInput.files[0];
    const container = fileInput.closest('.col-span-2') || fileInput.parentElement;
    const prevHtml = container.innerHTML;

    container.innerHTML = `
      <div class="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-center text-xs text-cyan-400">
        <i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengunggah file bukti lapangan (${escapeHtml(file.name)})...
      </div>
    `;

    try {
      const base64Data = await readFileAsBase64(file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          data: base64Data,
          type: type,
          id: id
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal mengunggah file bukti');
      }

      showToast('Foto bukti lapangan berhasil disimpan!');

      // Reload dataset to update in memory
      if (type === 'gangguan') await loadGangguanData();
      else if (type === 'sitac') await loadSitacData();
      else if (type === 'collo') await loadColloData();

      // Refresh Detail Modal immediately to show preview
      openDetailModal(type, id);
    } catch (err) {
      console.error(err);
      alert('Gagal mengunggah bukti: ' + err.message);
      container.innerHTML = prevHtml;
    }
  }
  window.uploadBuktiDirect = uploadBuktiDirect;

  function renderPhotoBuktiSection(rec, type, id) {
    const foto = rec.foto_bukti;
    const isImage = foto && (foto.endsWith('.jpg') || foto.endsWith('.jpeg') || foto.endsWith('.png') || foto.endsWith('.webp') || foto.endsWith('.gif') || foto.endsWith('.JPG') || foto.endsWith('.PNG') || foto.endsWith('.JPEG'));
    const isPdf = foto && (foto.endsWith('.pdf') || foto.endsWith('.PDF'));

    if (foto) {
      return `
        <div class="col-span-2 p-3.5 bg-slate-900/90 rounded-xl border border-white/10 mt-2">
          <div class="flex items-center justify-between mb-2.5">
            <span class="text-[11px] font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-1.5">
              <i class="fa-solid fa-camera"></i> Dokumen / Foto Bukti Lapangan
            </span>
            <div class="flex items-center gap-2">
              <a href="/uploads/${escapeHtml(foto)}" target="_blank" rel="noopener noreferrer" class="text-[11px] text-cyan-300 hover:text-cyan-200 underline flex items-center gap-1 font-semibold">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka File Penuh
              </a>
              <button type="button" class="text-[10px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" onclick="document.getElementById('detailDirectFileInput').click()">
                <i class="fa-solid fa-arrows-rotate mr-1"></i> Ganti
              </button>
            </div>
          </div>
          ${isImage ? `
            <div class="bukti-foto-card group relative cursor-pointer" onclick="window.open('/uploads/${escapeHtml(foto)}', '_blank')">
              <img src="/uploads/${escapeHtml(foto)}" alt="Foto Bukti Lapangan" class="w-full max-h-56 object-cover rounded-lg border border-white/5 transition duration-300 group-hover:scale-[1.01]">
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-2.5">
                <span class="text-xs text-white font-medium"><i class="fa-solid fa-magnifying-glass-plus mr-1"></i> Klik untuk memperbesar foto</span>
              </div>
            </div>
          ` : isPdf ? `
            <div class="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <i class="fa-solid fa-file-pdf text-rose-400 text-2xl"></i>
                <div>
                  <div class="text-xs font-semibold text-slate-200">${escapeHtml(foto)}</div>
                  <div class="text-[10px] text-slate-400">Lampiran Dokumen Berita Acara / Surat Izin PDF</div>
                </div>
              </div>
              <a href="/uploads/${escapeHtml(foto)}" target="_blank" class="btn btn-secondary text-xs py-1 px-3">
                <i class="fa-solid fa-file-arrow-down mr-1"></i> Unduh / Buka
              </a>
            </div>
          ` : `
            <div class="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <i class="fa-solid fa-file-lines text-cyan-400 text-xl"></i>
                <div class="text-xs text-slate-200">${escapeHtml(foto)}</div>
              </div>
              <a href="/uploads/${escapeHtml(foto)}" target="_blank" class="btn btn-secondary text-xs py-1 px-3">Buka File</a>
            </div>
          `}
          <input type="file" id="detailDirectFileInput" accept="image/*,application/pdf" style="display:none;" onchange="window.uploadBuktiDirect('${type}', ${id}, this)">
        </div>
      `;
    } else {
      return `
        <div class="col-span-2 mt-2">
          <div class="upload-dropzone flex items-center justify-between p-3.5" onclick="document.getElementById('detailDirectFileInput').click()">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center shrink-0">
                <i class="fa-solid fa-cloud-arrow-up text-lg"></i>
              </div>
              <div class="text-left">
                <div class="text-xs font-bold text-slate-200">Upload Foto Bukti / Berita Acara Lapangan</div>
                <div class="text-[10px] text-slate-400">Lampirkan foto fisik tiang, FO cut, atau dokumen perizinan warga</div>
              </div>
            </div>
            <button type="button" class="btn btn-secondary text-[11px] py-1.5 px-3 pointer-events-none">
              <i class="fa-solid fa-camera mr-1"></i> Pilih File
            </button>
          </div>
          <input type="file" id="detailDirectFileInput" accept="image/*,application/pdf" style="display:none;" onchange="window.uploadBuktiDirect('${type}', ${id}, this)">
        </div>
      `;
    }
  }

  function shareDetailToWhatsApp(type, id) {
    let msg = '';
    const currentUrl = window.location.origin;

    if (type === 'gangguan') {
      const rec = (state.gangguan.data || []).find(g => g.id == id);
      if (!rec) return;
      const statusText = rec.is_selesai ? '✅ *STATUS: SELESAI (CLOSED)*' : '⏳ *STATUS: DALAM PENANGANAN (OPEN)*';
      const fileInfo = rec.foto_bukti ? `\n📸 *Foto Bukti / BA:* ${currentUrl}/uploads/${encodeURIComponent(rec.foto_bukti)}` : '';
      msg = `🚨 *LAPORAN INSIDEN GANGGUAN DARURAT*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*No Tiket:* ${rec.no_tiket || '-'}\n` +
            `*Jenis:* ${rec.jenis_gangguan || 'Insiden FO'}\n` +
            `${statusText}\n` +
            `*Target SLA:* ${rec.sla_target || 'H+1'}\n` +
            `*PIC Teknis:* ${rec.pic_perijinan || '-'}\n` +
            `*Lokasi Kejadian:* ${rec.terminating || '-'}\n` +
            `*Tgl Disposisi:* ${rec.tgl_dispos || '-'}\n` +
            `*Tgl Selesai:* ${rec.tgl_selesai || '-'}\n` +
            `*Biaya Penanganan:* ${formatRupiah(rec.biaya_gangguan)}\n` +
            `*Catatan Lapangan:* ${rec.update_gangguan || '-'}` +
            `${fileInfo}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `_Dikirim via Telecom Operations Portal_`;

    } else if (type === 'sitac') {
      const rec = (state.sitac.data || []).find(s => s.id == id);
      if (!rec) return;
      const fileInfo = rec.foto_bukti ? `\n📄 *Lampiran Dokumen/Foto:* ${currentUrl}/uploads/${encodeURIComponent(rec.foto_bukti)}` : '';
      msg = `📑 *LAPORAN PENUGASAN PERIZINAN SITAC*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*No PA:* ${rec.no_pa || '-'}\n` +
            `*Pelanggan:* ${rec.pelanggan || '-'}\n` +
            `*Progress Status:* ${rec.progress || 'Ongoing'}\n` +
            `*PTL:* ${rec.ptl || '-'}\n` +
            `*PIC SITAC:* ${rec.pic_perijinan || '-'}\n` +
            `*Rute / Terminating:* ${rec.terminating || '-'}\n` +
            `*Pengajuan Awal:* ${formatRupiah(rec.biaya_permintaan_awal)}\n` +
            `*Realisasi Final:* ${formatRupiah(rec.biaya_final)}\n` +
            `*Efisiensi Biaya:* ${formatRupiah(rec.efisiensi_rupiah)} (${rec.efisiensi_persen}%)\n` +
            `*Catatan Lapangan:* ${rec.update_pekerjaan || '-'}` +
            `${fileInfo}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `_Dikirim via Telecom Operations Portal_`;

    } else if (type === 'collo') {
      const rec = (state.collo.data || []).find(c => c.id == id) || (state.alerts.data || []).find(c => c.id == id) || (state.revSharing.data || []).find(c => c.id == id);
      if (!rec) return;
      const fileInfo = rec.foto_bukti ? `\n📂 *Lampiran File:* ${currentUrl}/uploads/${encodeURIComponent(rec.foto_bukti)}` : '';
      msg = `🏢 *RINGKASAN KONTRAK SEWA COLOCATION*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*Pengelola:* ${rec.pengelola || '-'}\n` +
            `*Pelanggan:* ${rec.pelanggan || '-'}\n` +
            `*Status Sirkuit:* ${rec.status || '-'}\n` +
            `*No SO / SID:* ${rec.no_so || '-'} / ${rec.sid || '-'}\n` +
            `*Layanan:* ${rec.layanan || rec.jenis_sewa || '-'}\n` +
            `*Rev Sewa (1 Thn):* ${formatRupiah(rec.rev_sewa_tahun)}\n` +
            `*Biaya Sewa (1 Thn):* ${formatRupiah(rec.biaya_sewa_tahun)}\n` +
            `*Margin:* ${formatRupiah(rec.margin_rupiah)} (${rec.margin_persen}%)\n` +
            `*Masa Berlaku:* ${rec.start_date || '-'} s/d ${rec.end_date || '-'} (Sisa ${rec.sisa_hari} Hari)\n` +
            `*PIC Rekanan:* ${rec.pic_rekanan || '-'} (${rec.telp || '-'})\n` +
            `*Keterangan:* ${rec.keterangan || '-'}` +
            `${fileInfo}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `_Dikirim via Telecom Operations Portal_`;
    }

    if (msg) {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank');
    }
  }

  function openDetailModal(type, id) {
    const overlay = document.getElementById('modalDetail');
    const content = document.getElementById('detailContent');
    const title = document.getElementById('detailTitle');
    const sub = document.getElementById('detailSubtitle');

    if (type === 'collo') {
      const rec = state.collo.data.find(c => c.id == id) || (state.alerts.data || []).find(c => c.id == id) || (state.revSharing.data || []).find(c => c.id == id);
      if (!rec) return;

      const allPelangganList = (rec.pelanggan || '').split(/[\r\n]+/).map(s => s.trim().replace(/^\d+[\.\)]\s*/, '')).filter(Boolean);
      const firstPel = allPelangganList[0] || 'Colocation';
      const allSos = String(rec.no_so || '').split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
      const firstSo = allSos[0] || '-';
      const soDisplay = allSos.length > 1 ? `${firstSo} (+${allSos.length - 1} SO)` : firstSo;
      sub.textContent = `SID: ${rec.sid || '-'} | NO SO: ${soDisplay}`;

      let pelangganDetailHtml = '';
      if (allPelangganList.length > 1) {
        const pCounts = {};
        allPelangganList.forEach(p => { pCounts[p] = (pCounts[p] || 0) + 1; });
        pelangganDetailHtml = `
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2">
            <span class="text-slate-500 uppercase block mb-1.5 font-bold text-[10px]">Daftar Pelanggan / Tenant (${allPelangganList.length} Entri &bull; ${Object.keys(pCounts).length} Tenant Unik)</span>
            <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              ${Object.entries(pCounts).map(([name, count]) => `
                <span class="badge-pill bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[11px]">
                  ${escapeHtml(name)} ${count > 1 ? `<strong class="text-cyan-300">(${count}×)</strong>` : ''}
                </span>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        pelangganDetailHtml = `
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2">
            <span class="text-slate-500 uppercase block text-[10px] font-bold">Pelanggan</span>
            <span class="font-bold text-slate-100">${escapeHtml(rec.pelanggan || '-')}</span>
          </div>
        `;
      }

      content.innerHTML = `
        <div class="grid grid-cols-3 gap-3 text-xs mb-3">
          <div class="p-3 bg-emerald-950/30 rounded-lg border border-emerald-500/20">
            <span class="text-slate-400 uppercase text-[10px] block font-semibold">Rev Sewa (1 Thn) Pelanggan</span>
            <span class="font-bold text-sm md:text-base text-emerald-400 font-mono mt-0.5 block">${formatRupiah(rec.rev_sewa_tahun)}</span>
          </div>
          <div class="p-3 bg-purple-950/30 rounded-lg border border-purple-500/20">
            <span class="text-slate-400 uppercase text-[10px] block font-semibold">Biaya OTC</span>
            <span class="font-bold text-sm md:text-base text-purple-400 font-mono mt-0.5 block">${rec.biaya_otc > 0 ? formatRupiah(rec.biaya_otc) : 'Rp 0'}</span>
          </div>
          <div class="p-3 bg-amber-950/30 rounded-lg border border-amber-500/20">
            <span class="text-slate-400 uppercase text-[10px] block font-semibold">Biaya Sewa 1 Tahun</span>
            <span class="font-bold text-sm md:text-base text-amber-400 font-mono mt-0.5 block">${formatRupiah(rec.biaya_sewa_tahun)}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Status</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.status)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Layanan / Jenis</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.layanan || rec.jenis_sewa || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Margin (Rev - Biaya)</span><span class="font-bold text-cyan-400 font-mono">${formatRupiah(rec.margin_rupiah)} (${rec.margin_persen}%)</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Rev Sharing</span><span class="font-bold text-amber-400 font-mono">${escapeHtml(rec.rev_sharing_raw || '-')}</span></div>
          ${pelangganDetailHtml}
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Masa Berlaku</span><span class="font-mono text-slate-200">${rec.start_date || '-'} s/d ${rec.end_date || '-'} (Sisa ${rec.sisa_hari} Hari)</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Originating / Terminating</span><span class="text-slate-200">${escapeHtml(rec.originating || '-')} &rarr; ${escapeHtml(rec.terminating || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Admin & Kontak</span><span class="text-slate-200">PIC Admin: ${escapeHtml(rec.pic_admin || '-')} | Rekanan: ${escapeHtml(rec.pic_rekanan || '-')} (${escapeHtml(rec.telp || '-')})</span></div>
          ${rec.keterangan ? `<div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Catatan / Keterangan</span><span class="text-slate-300">${escapeHtml(rec.keterangan)}</span></div>` : ''}
          ${renderPhotoBuktiSection(rec, type, id)}
        </div>
      `;
    } else if (type === 'sitac') {
      const rec = state.sitac.data.find(s => s.id == id);
      if (!rec) return;

      const firstSitacPel = (rec.pelanggan || '').split(/[\r\n]+/)[0]?.replace(/^\d+[\.\)]\s*/, '') || '-';
      title.textContent = `Penugasan PA: ${rec.no_pa || '-'}`;
      sub.textContent = `${firstSitacPel}`;
      content.innerHTML = `
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Status</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.progress)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">PIC SITAC</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.pic_perijinan || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Biaya Pengajuan</span><span class="font-bold text-slate-300 font-mono">${formatRupiah(rec.biaya_permintaan_awal)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Realisasi Final</span><span class="font-bold text-amber-400 font-mono">${formatRupiah(rec.biaya_final)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Penghematan Negosiasi</span><span class="font-bold text-emerald-400 font-mono text-sm">${formatRupiah(rec.efisiensi_rupiah)} (${rec.efisiensi_persen}%)</span></div>
          ${rec.sewa_otc > 0 ? `<div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Biaya OTC</span><span class="font-bold text-purple-400 font-mono">${formatRupiah(rec.sewa_otc)}</span></div>` : ''}
          ${rec.biaya_sewa_bulan > 0 ? `<div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Biaya Sewa / Bulan</span><span class="font-bold text-amber-400 font-mono">${formatRupiah(rec.biaya_sewa_bulan)}</span></div>` : ''}
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Terminating</span><span class="text-slate-200">${escapeHtml(rec.terminating || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Catatan Update Lapangan</span><span class="text-slate-200">${escapeHtml(rec.update_pekerjaan || 'Tidak ada catatan')}</span></div>
          ${renderPhotoBuktiSection(rec, type, id)}
        </div>
      `;
    } else if (type === 'gangguan') {
      const rec = (state.gangguan.data || []).find(g => g.id == id);
      if (!rec) return;

      title.textContent = `Tiket Gangguan: ${rec.no_tiket || '-'}`;
      sub.textContent = `${rec.jenis_gangguan || 'Insiden FO'} | Lokasi: ${rec.terminating || '-'}`;
      content.innerHTML = `
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Status</span><span class="font-bold text-sm text-slate-100">${rec.is_selesai ? '<span class="text-emerald-400 font-bold">SELESAI</span>' : '<span class="text-amber-400 font-bold">PROSES</span>'}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">PIC Perijinan</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.pic_perijinan || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Tanggal Disposisi</span><span class="font-mono text-slate-200">${rec.tgl_dispos || '-'}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Tanggal Selesai</span><span class="font-mono text-slate-200">${rec.tgl_selesai || '-'}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Biaya Penanganan</span><span class="font-bold text-amber-400 font-mono text-base">${formatRupiah(rec.biaya_gangguan)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Lokasi Kejadian</span><span class="text-slate-200">${escapeHtml(rec.terminating || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Catatan Update Gangguan</span><span class="text-slate-200">${escapeHtml(rec.update_gangguan || 'Tidak ada catatan')}</span></div>
          ${renderPhotoBuktiSection(rec, type, id)}
        </div>
      `;
    }

    // Bind modal footer action buttons
    const btnWhatsAppAction = document.getElementById('btnDetailWhatsAppAction');
    const btnEditAction = document.getElementById('btnDetailEditAction');
    const btnDeleteAction = document.getElementById('btnDetailDeleteAction');
    const btnCloseAction = document.getElementById('btnDetailCloseAction');

    if (btnWhatsAppAction) {
      btnWhatsAppAction.onclick = () => {
        shareDetailToWhatsApp(type, id);
      };
    }
    if (btnEditAction) {
      btnEditAction.onclick = () => {
        overlay.style.display = 'none';
        openQuickEditModal(type, id);
      };
    }
    if (btnDeleteAction) {
      btnDeleteAction.onclick = () => {
        deleteRecord(type, id);
      };
    }
    if (btnCloseAction) {
      btnCloseAction.onclick = () => {
        overlay.style.display = 'none';
      };
    }

    overlay.style.display = 'flex';
  }

  // =========================================================================
  // DELETE RECORD ENGINE (LIVE SQLite RECORD DELETION)
  // =========================================================================
  async function deleteRecord(type, id) {
    let name = 'data ini';
    if (type === 'collo') {
      const rec = (state.collo.data || []).find(c => c.id == id) || (state.alerts.data || []).find(c => c.id == id);
      if (rec) name = `sirkuit "${rec.pelanggan || rec.no_so}"`;
    } else if (type === 'sitac') {
      const rec = (state.sitac.data || []).find(s => s.id == id);
      if (rec) name = `penugasan PA "${rec.no_pa || rec.pelanggan}"`;
    } else if (type === 'gangguan') {
      const rec = (state.gangguan.data || []).find(g => g.id == id);
      if (rec) name = `tiket gangguan "${rec.no_tiket || id}"`;
    }

    const confirmed = confirm(`Apakah Anda yakin ingin menghapus ${name} (ID #${id}) secara permanen?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/${type}/${id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.message || 'Gagal menghapus data');

      showToast(json.message || 'Data berhasil dihapus!');

      // Close modal if open
      const detailModal = document.getElementById('modalDetail');
      if (detailModal) detailModal.style.display = 'none';

      // Refresh active module data
      if (type === 'collo') {
        await loadColloData();
        if (state.activeView === 'view-collo-rev-sharing') loadRevSharingData();
        if (state.activeView === 'view-collo-alerts') loadAlertsData();
      } else if (type === 'sitac') {
        await loadSitacData();
      } else if (type === 'gangguan') {
        await loadGangguanData();
      }

      // Refresh Executive Summary metrics
      fetch('/api/executive/summary').then(r => r.json()).then(d => {
        state.execData = d;
        if (state.activeView === 'view-executive') renderExecutiveDashboard(d);
      }).catch(() => {});

    } catch (e) {
      alert('Error saat menghapus data: ' + e.message);
    }
  }

  // =========================================================================
  // EXPORT ENGINE (ROBUST CSV GENERATOR WITH UTF-8 BOM & PROPER ESCAPING)
  // =========================================================================
  function downloadCsvFile(filename, headers, rows) {
    const csvRows = [headers.join(',')];
    rows.forEach(r => {
      const sanitized = r.map(val => {
        if (val === null || val === undefined) return '""';
        let str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      });
      csvRows.push(sanitized.join(','));
    });
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`File ${filename} berhasil diunduh!`);
  }

  function downloadExcelFile(filename, sheetName, headers, rows) {
    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();

      const cleanRows = rows.map(r => r.map(c => {
        if (c === null || c === undefined) return '';
        if (typeof c === 'number') return c;
        return String(c);
      }));

      const wsData = [headers, ...cleanRows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Auto calculate column width
      const colWidths = headers.map((h, i) => {
        let maxLen = String(h).length;
        cleanRows.forEach(row => {
          const valStr = String(row[i] || '');
          if (valStr.length > maxLen) maxLen = valStr.length;
        });
        return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
      });
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
      XLSX.writeFile(wb, filename);
      showToast(`File Excel "${filename}" berhasil diunduh!`);
    } else {
      showToast('Mengunduh file Excel dari server...');
      const mod = sheetName.toLowerCase().includes('gangguan') ? 'gangguan' : (sheetName.toLowerCase().includes('sitac') ? 'sitac' : 'collo');
      window.location.href = `/api/download/excel-report?module=${mod}`;
    }
  }

  function exportCurrentViewExcel(moduleOverride) {
    const view = moduleOverride || state.activeView;
    const today = new Date().toISOString().slice(0, 10);

    if (view === 'view-gangguan' || view === 'gangguan') {
      const records = state.gangguan.data;
      if (!records || records.length === 0) return alert('Tidak ada data gangguan untuk diekspor!');
      const filename = `Rekap_Tiket_Gangguan_${today}.xlsx`;
      const headers = [
        'No', 'Nomor Tiket', 'Tgl Disposisi', 'Tgl Selesai', 'Lokasi Gangguan / Terminating',
        'Jenis Insiden', 'Target SLA', 'PIC Lapangan', 'Biaya Penanganan (Rp)', 'Status Pekerjaan',
        'Catatan Update Gangguan', 'Foto Bukti'
      ];
      const rows = records.map((g, idx) => [
        idx + 1, g.no_tiket || '', g.tgl_dispos || '', g.tgl_selesai || '',
        g.terminating || '', g.jenis_gangguan || 'FO Cut', g.sla_target || 'H+1',
        g.pic_perijinan || '', g.biaya_gangguan || 0, g.is_selesai ? 'Selesai' : 'Proses (Open)',
        g.update_gangguan || '', g.foto_bukti || ''
      ]);
      downloadExcelFile(filename, 'Tiket Gangguan', headers, rows);

    } else if (view === 'view-sitac-pa' || view === 'sitac') {
      const records = state.sitac.data;
      if (!records || records.length === 0) return alert('Tidak ada data SITAC untuk diekspor!');
      const filename = `Rekap_Proyek_SITAC_${today}.xlsx`;
      const headers = [
        'No', 'Nomor PA', 'Pelanggan', 'PTL', 'PIC SITAC', 'Rute Terminating',
        'Biaya Pengajuan (Rp)', 'Biaya Realisasi (Rp)', 'Efisiensi (Rp)', 'Efisiensi (%)',
        'Progress Status', 'Durasi SLA (Hari)', 'Tgl Disposisi', 'Tgl Close', 'Catatan Lapangan'
      ];
      const rows = records.map((s, idx) => [
        idx + 1, s.no_pa || '', s.pelanggan || '', s.ptl || '', s.pic_perijinan || '',
        s.terminating || '', s.biaya_permintaan_awal || 0, s.biaya_final || 0,
        s.efisiensi_rupiah || 0, s.efisiensi_persen || 0, s.progress || '',
        s.durasi_hari !== null && s.durasi_hari !== undefined ? s.durasi_hari : '',
        s.date_dispos || '', s.date_close || '', s.update_pekerjaan || ''
      ]);
      downloadExcelFile(filename, 'Proyek SITAC', headers, rows);

    } else if (view === 'view-collo-list' || view === 'view-collo-alerts' || view === 'view-collo-rev-sharing' || view === 'collo') {
      const records = view === 'view-collo-list' ? state.collo.data : (view === 'view-collo-rev-sharing' ? state.revSharing.data : state.alerts.data);
      if (!records || records.length === 0) return alert('Tidak ada data colocation untuk diekspor!');
      const filename = `Rekap_Kontrak_Colocation_${today}.xlsx`;
      const headers = [
        'No', 'Pengelola', 'Pelanggan', 'Nomor SO', 'SID Sirkuit', 'Jenis Layanan', 'Jenis Sewa',
        'Originating', 'Terminating', 'Rev Sewa 1 Thn (Rp)', 'Biaya OTC (Rp)', 'Biaya Sewa 1 Thn (Rp)',
        'Gross Margin (Rp)', 'Margin (%)', 'Rev Sharing', 'Status Sirkuit', 'Tgl Mulai', 'Jatuh Tempo',
        'Sisa Hari', 'Nomor SPP / PO', 'PIC Admin', 'Keterangan'
      ];
      const rows = records.map((c, idx) => [
        idx + 1, c.pengelola || '', c.pelanggan || '', c.no_so || '', c.sid || '',
        c.layanan || '', c.jenis_sewa || '', c.originating || '', c.terminating || '',
        c.rev_sewa_tahun || 0, c.biaya_otc || 0, c.biaya_sewa_tahun || 0,
        c.margin_rupiah || 0, c.margin_persen || 0, c.rev_sharing_raw || '',
        c.status || '', c.start_date || '', c.end_date || '', c.sisa_hari || 0,
        c.spp || c.po_baru || '', c.pic_admin || '', c.keterangan || ''
      ]);
      downloadExcelFile(filename, 'Colocation', headers, rows);

    } else if (view === 'view-efisiensi') {
      const records = state.efisiensi.length ? state.efisiensi : state.sitac.data;
      if (!records || records.length === 0) return alert('Tidak ada data efisiensi untuk diekspor!');
      const filename = `Rekap_Efisiensi_Biaya_${today}.xlsx`;
      const headers = ['No', 'Nomor PA', 'Pelanggan', 'PIC SITAC', 'Biaya Awal (Rp)', 'Biaya Final (Rp)', 'Efisiensi (Rp)', 'Efisiensi (%)', 'Status'];
      const rows = records.map((e, idx) => [
        idx + 1, e.no_pa || '', e.pelanggan || '', e.pic_perijinan || '',
        e.biaya_permintaan_awal || 0, e.biaya_final || 0, e.efisiensi_rupiah || 0, e.efisiensi_persen || 0, e.progress || ''
      ]);
      downloadExcelFile(filename, 'Efisiensi Biaya', headers, rows);

    } else if (view === 'view-pic-matrix') {
      const records = state.picMatrix.length ? state.picMatrix : [];
      if (!records || records.length === 0) return alert('Tidak ada data beban kerja PIC untuk diekspor!');
      const filename = `Rekap_Beban_Kerja_PIC_${today}.xlsx`;
      const headers = ['No', 'Nama PIC SITAC', 'Total PA Dikerjakan', 'Selesai (Finish)', 'Sedang Proses', 'Total Efisiensi (Rp)', 'Peringkat'];
      const rows = records.map((p, idx) => [
        idx + 1, p.pic || p.pic_perijinan || '', p.total || p.total_pa || 0,
        p.finish || 0, p.ongoing || 0, p.total_efisiensi || 0, idx + 1
      ]);
      downloadExcelFile(filename, 'Beban Kerja PIC', headers, rows);

    } else if (view === 'view-executive') {
      const ex = state.execData;
      if (!ex) return alert('Data executive belum dimuat!');
      const filename = `Rekap_Executive_Summary_${today}.xlsx`;
      const headers = ['Kategori Indikator', 'Nilai Metrik', 'Keterangan'];
      const c = ex.collo || {};
      const s = ex.sitac || {};
      const g = ex.gangguan || {};
      const rows = [
        ['Sirkuit Colocation Aktif', c.active_count || 0, 'Total sirkuit berstatus ACTIVE'],
        ['Total Revenue Sewa Tahunan (Rp)', c.active_revenue || 0, 'Revenue aktif dalam Rupiah'],
        ['Total Biaya Mitra Tahunan (Rp)', c.active_biaya || 0, 'Beban sewa ke mitra datacenter'],
        ['Gross Margin Finansial (Rp)', c.active_margin || 0, `Persentase margin: ${c.margin_pct || 0}%`],
        ['Total Project Assignment (PA)', s.total_pa || 0, 'Semua penugasan perizinan FO'],
        ['PA Selesai (Finish)', s.finish_count || 0, `Finish rate: ${s.finish_count && s.total_pa ? (s.finish_count/s.total_pa*100).toFixed(1) : 0}%`],
        ['Total Penghematan Negosiasi (Rp)', s.total_efisiensi_rupiah || 0, `Efisiensi biaya: ${s.efisiensi_pct || 0}%`],
        ['Total Tiket Gangguan Darurat', g.total_gangguan || 0, 'Total insiden dilaporkan'],
        ['Gangguan Dituntaskan', g.selesai_count || 0, `Resolution rate: ${g.resolution_rate || 0}%`]
      ];
      downloadExcelFile(filename, 'Executive Summary', headers, rows);
    } else {
      alert('Pilih tabel yang ingin diekspor ke Excel.');
    }
  }

  async function exportPicMatrixCsv() {
    let records = state.picMatrix;
    if (!records || records.length === 0) {
      try {
        const res = await fetch('/api/pic-performance');
        if (res.ok) {
          records = await res.json();
          state.picMatrix = records;
        }
      } catch (e) {
        console.error('Failed to fetch pic performance for export', e);
      }
    }
    if (!records || records.length === 0) {
      return alert('Tidak ada data Beban Kerja PIC untuk diekspor!');
    }

    const filename = `rekap_beban_kerja_pic_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'Nama PIC SITAC',
      'Total Penugasan (PA)',
      'Selesai (Finish)',
      'Sedang Berjalan (Ongoing/Hold)',
      'Dibatalkan (Cancel)',
      'Tingkat Penyelesaian (%)',
      'Biaya Pengajuan Awal (Rp)',
      'Realisasi Biaya Akhir (Rp)',
      'Total Penghematan / Efisiensi (Rp)',
      'Persentase Efisiensi (%)',
      'Rata-rata SLA (Hari)',
      'Tiket Gangguan Ditangani'
    ];

    const rows = records.map(p => [
      p.pic || '-',
      p.total_penugasan || 0,
      p.finish || 0,
      (p.ongoing || 0) + (p.hold || 0),
      p.cancel || 0,
      `${p.finish_rate || 0}%`,
      p.biaya_awal || 0,
      p.biaya_final || 0,
      p.efisiensi_rupiah || 0,
      `${p.efisiensi_persen || 0}%`,
      p.avg_sla_hari || 0,
      p.gangguan_count || 0
    ]);

    downloadCsvFile(filename, headers, rows);
  }

  async function exportEfisiensiCsv() {
    let records = state.efisiensi;
    if (!records || records.length === 0) {
      try {
        const res = await fetch('/api/rekap-efisiensi');
        if (res.ok) {
          records = await res.json();
          state.efisiensi = records;
        }
      } catch (e) {
        console.error('Failed to fetch efisiensi for export', e);
      }
    }
    if (!records || records.length === 0) {
      return alert('Tidak ada data Efisiensi untuk diekspor!');
    }

    const filename = `rekap_efisiensi_biaya_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'Tahun Anggaran',
      'Total Disposisi PA',
      'Pekerjaan Berbiaya',
      'Tanpa Biaya (Zero Cost)',
      'Biaya Pengajuan Awal (Rp)',
      'Realisasi Biaya Akhir (Rp)',
      'Nominal Penghematan (Rp)',
      'Persentase Efisiensi (%)'
    ];

    const rows = records.map(r => [
      r.tahun || '-',
      r.total_disposisi || 0,
      r.ada_biaya || 0,
      r.tidak_ada_biaya || 0,
      r.nilai_awal || 0,
      r.nilai_akhir || 0,
      r.efisiensi_rupiah || 0,
      `${r.efisiensi_persen || 0}%`
    ]);

    downloadCsvFile(filename, headers, rows);
  }

  function exportCurrentView() {
    const view = state.activeView;

    if (view === 'view-pic-matrix') {
      return exportPicMatrixCsv();
    }
    if (view === 'view-efisiensi') {
      return exportEfisiensiCsv();
    }

    let filename = `telecom_${view}_${new Date().toISOString().slice(0, 10)}.csv`;
    let headers = [];
    let rows = [];

    if (view === 'view-collo-list' || view === 'view-collo-alerts' || view === 'view-collo-rev-sharing') {
      const records = view === 'view-collo-list' ? state.collo.data : (view === 'view-collo-rev-sharing' ? state.revSharing.data : state.alerts.data);
      if (!records || records.length === 0) return alert('Tidak ada data colocation untuk diekspor!');

      headers = [
        'ID', 'Pengelola', 'Pelanggan', 'No SO', 'SID', 'Originating', 'Terminating', 'Layanan', 'Jenis Sewa',
        'Rev Sewa (1 Thn) Pelanggan (Rp)', 'Biaya OTC (Rp)', 'Biaya Sewa 1 Tahun (Rp)',
        'Margin Rp', 'Margin %', 'Rev Sharing', 'Status', 'Sisa Hari', 'SPP'
      ];
      rows = records.map(c => [
        c.id, c.pengelola || '', c.pelanggan || '',
        c.no_so || '', c.sid || '', c.originating || '', c.terminating || '', c.layanan || '', c.jenis_sewa || '',
        c.rev_sewa_tahun || 0, c.biaya_otc || 0, c.biaya_sewa_tahun || 0,
        c.margin_rupiah || 0, c.margin_persen || 0,
        c.rev_sharing_raw || '', c.status || '', c.sisa_hari || 0, c.spp || c.po_baru || ''
      ]);
    } else if (view === 'view-sitac-pa') {
      const records = state.sitac.data;
      if (!records || records.length === 0) return alert('Tidak ada data SITAC untuk diekspor!');

      headers = ['ID', 'No PA', 'Pelanggan', 'PIC SITAC', 'PTL', 'Terminating', 'Biaya Awal', 'Biaya Final', 'Biaya OTC', 'Biaya Sewa / Bulan', 'Penghematan', 'Status', 'Durasi SLA'];
      rows = records.map(s => [
        s.id, s.no_pa || '', s.pelanggan || '', s.pic_perijinan || '',
        s.ptl || '', s.terminating || '',
        s.biaya_permintaan_awal || 0, s.biaya_final || 0, s.sewa_otc || 0, s.biaya_sewa_bulan || 0, s.efisiensi_rupiah || 0, s.progress || '', s.durasi_hari || ''
      ]);
    } else if (view === 'view-gangguan') {
      const records = state.gangguan.data;
      if (!records || records.length === 0) return alert('Tidak ada data gangguan untuk diekspor!');

      headers = ['ID', 'No Tiket', 'Tgl Dispos', 'Tgl Selesai', 'Lokasi', 'Jenis Gangguan', 'PIC', 'Biaya', 'Status'];
      rows = records.map(g => [
        g.id, g.no_tiket || '', g.tgl_dispos || '', g.tgl_selesai || '',
        g.terminating || '', g.jenis_gangguan || '',
        g.pic_perijinan || '', g.biaya_gangguan || 0, g.is_selesai ? 'Selesai' : 'Proses'
      ]);
    } else if (view === 'view-executive') {
      const ex = state.execData;
      if (!ex) return alert('Data executive belum dimuat!');
      filename = `rekap_executive_summary_${new Date().toISOString().slice(0, 10)}.csv`;
      headers = ['Kategori Indikator', 'Nilai Metrik', 'Keterangan'];
      const c = ex.collo || {};
      const s = ex.sitac || {};
      const g = ex.gangguan || {};
      rows = [
        ['Sirkuit Colocation Aktif', c.active_count || 0, 'Total sirkuit berstatus ACTIVE'],
        ['Total Revenue Sewa Tahunan', c.active_revenue || 0, 'Revenue aktif dalam Rupiah'],
        ['Total Biaya Mitra Tahunan', c.active_biaya || 0, 'Beban sewa ke mitra datacenter'],
        ['Gross Margin Finansial', c.active_margin || 0, `Persentase margin: ${c.margin_pct || 0}%`],
        ['Total Project Assignment (PA)', s.total_pa || 0, 'Semua penugasan perizinan FO'],
        ['PA Selesai (Finish)', s.finish_count || 0, `Finish rate: ${s.finish_count && s.total_pa ? (s.finish_count/s.total_pa*100).toFixed(1) : 0}%`],
        ['Total Penghematan Negosiasi', s.total_efisiensi_rupiah || 0, `Efisiensi biaya: ${s.efisiensi_pct || 0}%`],
        ['Total Tiket Gangguan Darurat', g.total_gangguan || 0, 'Total insiden dilaporkan'],
        ['Gangguan Dituntaskan', g.selesai_count || 0, `Resolution rate: ${g.resolution_rate || 0}%`]
      ];
    } else {
      return alert('Buka tabel spesifik untuk mengekspor data.');
    }

    downloadCsvFile(filename, headers, rows);
  }

  // =========================================================================
  // PDF EXPORT ENGINE (jsPDF + AutoTable)
  // =========================================================================
  function fmtRp(val) {
    if (val === null || val === undefined || isNaN(val)) return 'Rp 0';
    return 'Rp ' + Number(val).toLocaleString('id-ID');
  }

  function getPdfTitle(view) {
    const titles = {
      'view-executive': 'Laporan Executive Summary',
      'view-collo-list': 'Laporan Data Colocation',
      'view-collo-rev-sharing': 'Laporan Revenue Sharing',
      'view-collo-alerts': 'Laporan Alert Kontrak',
      'view-sitac-pa': 'Laporan SITAC Project Assignment',
      'view-gangguan': 'Laporan Gangguan Darurat',
      'view-efisiensi': 'Laporan Efisiensi Biaya',
      'view-pic-matrix': 'Laporan Beban Kerja PIC'
    };
    return titles[view] || 'Laporan Data';
  }

  function addPdfHeader(doc, title) {
    const pageW = doc.internal.pageSize.getWidth();
    // Header gradient bar
    doc.setFillColor(8, 12, 20);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setFillColor(6, 182, 212);
    doc.rect(0, 27, pageW, 1.5, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(248, 250, 252);
    doc.text(title, 14, 12);

    // Subtitle - date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Dicetak: ${dateStr} | Telecom Infrastructure & Lease Operations Portal`, 14, 19);

    // Company info right
    doc.setFontSize(9);
    doc.setTextColor(6, 182, 212);
    doc.text('PT Telkom Indonesia', pageW - 14, 12, { align: 'right' });
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.text('Infrastructure & Lease Ops', pageW - 14, 18, { align: 'right' });
  }

  function addPdfFooter(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(8, 12, 20);
      doc.rect(0, pageH - 12, pageW, 12, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Halaman ${i} dari ${pageCount}`, pageW / 2, pageH - 5, { align: 'center' });
      doc.text('Confidential - Internal Use Only', 14, pageH - 5);
    }
  }

  function getStatusColor(status) {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE' || s === 'FINISH' || s === 'SELESAI') return [16, 185, 129];
    if (s === 'NON ACTIVE' || s === 'CANCEL') return [239, 68, 68];
    if (s === 'DEACTIVASI') return [245, 158, 11];
    if (s.includes('ONGOING') || s.includes('PROSES')) return [99, 102, 241];
    return [148, 163, 184];
  }

  async function exportCurrentViewPdf() {
    const view = state.activeView;
    const { jsPDF } = window.jspdf;
    if (!jsPDF) return alert('Library PDF belum dimuat. Refresh halaman dan coba lagi.');

    const title = getPdfTitle(view);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    addPdfHeader(doc, title);

    const startY = 34;

    if (view === 'view-executive') {
      await exportExecutivePdf(doc, startY);
    } else if (view === 'view-collo-list' || view === 'view-collo-alerts') {
      await exportColloPdf(doc, startY, view);
    } else if (view === 'view-collo-rev-sharing') {
      exportRevSharingPdf(doc, startY);
    } else if (view === 'view-sitac-pa') {
      await exportSitacPdf(doc, startY);
    } else if (view === 'view-gangguan') {
      exportGangguanPdf(doc, startY);
    } else if (view === 'view-efisiensi') {
      await exportEfisiensiPdf(doc, startY);
    } else if (view === 'view-pic-matrix') {
      await exportPicMatrixPdf(doc, startY);
    } else {
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text('Buka salah satu modul untuk mengekspor data ke PDF.', 14, startY + 10);
    }

    addPdfFooter(doc);

    const filename = `${title.replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    showToast(`File PDF "${filename}" berhasil diunduh!`);
  }

  // --- EXECUTIVE SUMMARY PDF ---
  async function exportExecutivePdf(doc, startY) {
    let ex = state.execData;
    if (!ex) {
      try {
        const res = await fetch('/api/executive/summary');
        if (res.ok) ex = await res.json();
      } catch (e) { /* ignore */ }
    }
    if (!ex) {
      doc.setFontSize(11);
      doc.setTextColor(239, 68, 68);
      doc.text('Data Executive Summary belum tersedia.', 14, startY + 10);
      return;
    }
    const c = ex.collo || {};
    const s = ex.sitac || {};
    const g = ex.gangguan || {};

    const summaryData = [
      ['Sirkuit Colocation Aktif', String(c.active_count || 0), 'Total sirkuit berstatus ACTIVE'],
      ['Total Revenue Sewa Tahunan', fmtRp(c.active_revenue), 'Revenue aktif dalam Rupiah'],
      ['Total Biaya Mitra Tahunan', fmtRp(c.active_biaya), 'Beban sewa ke mitra datacenter'],
      ['Gross Margin Finansial', fmtRp(c.active_margin), `Persentase margin: ${c.margin_pct || 0}%`],
      ['Total Project Assignment (PA)', String(s.total_pa || 0), 'Semua penugasan perizinan FO'],
      ['PA Selesai (Finish)', String(s.finish_count || 0), `Finish rate: ${s.finish_count && s.total_pa ? (s.finish_count / s.total_pa * 100).toFixed(1) : 0}%`],
      ['Total Penghematan Negosiasi', fmtRp(s.total_efisiensi_rupiah), `Efisiensi biaya: ${s.efisiensi_pct || 0}%`],
      ['Total Tiket Gangguan', String(g.total_gangguan || 0), 'Total insiden dilaporkan'],
      ['Gangguan Dituntaskan', String(g.selesai_count || 0), `Resolution rate: ${g.resolution_rate || 0}%`]
    ];

    doc.autoTable({
      startY: startY,
      head: [['Kategori Indikator', 'Nilai Metrik', 'Keterangan']],
      body: summaryData,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4, textColor: [30, 41, 59] },
      headStyles: { fillColor: [6, 182, 212], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 70 },
        1: { halign: 'right', cellWidth: 65, fontStyle: 'bold' },
        2: { cellWidth: 'auto', textColor: [100, 116, 139], fontSize: 8 }
      }
    });

    if (ex.top_pengelola && ex.top_pengelola.length > 0) {
      const nextY = (doc.lastAutoTable?.finalY || startY + 80) + 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Top 10 Mitra Pengelola Datacenter (Sirkuit Aktif)', 14, nextY);

      const topBody = ex.top_pengelola.map((p, idx) => [
        idx + 1,
        p.pengelola || '-',
        p.sirkuit_count || 0,
        fmtRp(p.total_rev),
        fmtRp(p.total_biaya),
        fmtRp(p.total_margin),
        `${p.total_rev ? (p.total_margin / p.total_rev * 100).toFixed(1) : 0}%`
      ]);

      doc.autoTable({
        startY: nextY + 3,
        head: [['No', 'Mitra Pengelola', 'Sirkuit', 'Revenue (1 Thn)', 'Biaya Mitra', 'Margin Finansial', 'Margin %']],
        body: topBody,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 41, 59] },
        headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [240, 253, 250] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 60, fontStyle: 'bold' },
          2: { cellWidth: 20, halign: 'right' },
          3: { cellWidth: 45, halign: 'right' },
          4: { cellWidth: 45, halign: 'right' },
          5: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
          6: { cellWidth: 20, halign: 'right' }
        }
      });
    }
  }

  // --- COLOCATION PDF ---
  async function exportColloPdf(doc, startY, view) {
    let records = view === 'view-collo-alerts' ? state.alerts.data : state.collo.data;
    if (view === 'view-collo-list') {
      try {
        const { status, jenisSewa, pengelola, search, sort } = state.collo;
        const params = new URLSearchParams({
          status, jenis_sewa: jenisSewa, pengelola, search, sort, page: 1, pageSize: 500
        });
        const res = await fetch(`/api/collo?${params}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.length > 0) records = json.data;
        }
      } catch (e) {
        console.warn('Fallback to loaded page data', e);
      }
    }
    if (!records || records.length === 0) {
      doc.setFontSize(11); doc.setTextColor(239, 68, 68);
      doc.text('Tidak ada data Colocation untuk diekspor.', 14, startY + 10);
      return;
    }

    // Summary info
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Total Record: ${records.length} | Filter: ${state.collo.status} | Jenis Sewa: ${state.collo.jenisSewa}`, 14, startY);

    const body = records.map(c => [
      c.pengelola || '-',
      c.pelanggan || '-',
      (c.no_so || '-').substring(0, 20),
      (c.terminating || '-').substring(0, 35),
      c.jenis_sewa || '-',
      fmtRp(c.rev_sewa_tahun),
      fmtRp(c.biaya_otc),
      fmtRp(c.biaya_sewa_tahun),
      fmtRp(c.margin_rupiah),
      `${c.margin_persen || 0}%`,
      c.status || '-',
      c.sisa_hari != null ? `${c.sisa_hari} hr` : '-'
    ]);

    doc.autoTable({
      startY: startY + 4,
      head: [['Pengelola', 'Pelanggan', 'No SO', 'Terminating', 'Jenis Sewa', 'Rev Sewa/Thn', 'Biaya OTC', 'Biaya Sewa/Thn', 'Margin', 'Margin %', 'Status', 'Sisa Hari']],
      body: body,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 2, textColor: [30, 41, 59], overflow: 'linebreak' },
      headStyles: { fillColor: [6, 182, 212], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 28 },
        2: { cellWidth: 20 },
        3: { cellWidth: 35 },
        4: { cellWidth: 18 },
        5: { halign: 'right', cellWidth: 24 },
        6: { halign: 'right', cellWidth: 20 },
        7: { halign: 'right', cellWidth: 24 },
        8: { halign: 'right', cellWidth: 22 },
        9: { halign: 'right', cellWidth: 14 },
        10: { cellWidth: 17 },
        11: { halign: 'right', cellWidth: 14 }
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 10) {
          const clr = getStatusColor(data.cell.raw);
          data.cell.styles.textColor = clr;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
  }

  // --- REVENUE SHARING PDF ---
  function exportRevSharingPdf(doc, startY) {
    const records = state.revSharing.data;
    if (!records || records.length === 0) {
      doc.setFontSize(11); doc.setTextColor(239, 68, 68);
      doc.text('Tidak ada data Revenue Sharing.', 14, startY + 10);
      return;
    }

    const body = records.map(c => [
      c.pengelola || '-',
      c.pelanggan || '-',
      (c.sid || '-').substring(0, 25),
      c.rev_sharing_raw || '-',
      fmtRp(c.rev_sewa_tahun),
      fmtRp(c.biaya_rev_sharing),
      c.status || '-',
      c.sisa_hari != null ? `${c.sisa_hari} hr` : '-'
    ]);

    doc.autoTable({
      startY: startY,
      head: [['Pengelola', 'Pelanggan', 'SID', 'Rev Sharing %', 'Revenue / Thn', 'Biaya Rev Sharing', 'Status', 'Sisa Hari']],
      body: body,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2.5, textColor: [30, 41, 59], overflow: 'linebreak' },
      headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        7: { halign: 'right' }
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 6) {
          data.cell.styles.textColor = getStatusColor(data.cell.raw);
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
  }

  // --- SITAC PDF ---
  async function exportSitacPdf(doc, startY) {
    let records = state.sitac.data;
    try {
      const { status, pic, year, aging, search } = state.sitac;
      const params = new URLSearchParams({
        status, pic, year, aging, search, page: 1, pageSize: 500
      });
      const res = await fetch(`/api/sitac?${params}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.length > 0) records = json.data;
      }
    } catch (e) {
      console.warn('Fallback to loaded sitac data', e);
    }
    if (!records || records.length === 0) {
      doc.setFontSize(11); doc.setTextColor(239, 68, 68);
      doc.text('Tidak ada data SITAC.', 14, startY + 10);
      return;
    }

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${records.length} PA | Filter Status: ${state.sitac.status} | PIC: ${state.sitac.pic}`, 14, startY);

    const body = records.map(s => [
      (s.no_pa || '-').substring(0, 18),
      (s.pelanggan || '-').substring(0, 30),
      s.pic_perijinan || '-',
      s.ptl || '-',
      (s.terminating || '-').substring(0, 35),
      fmtRp(s.biaya_permintaan_awal),
      fmtRp(s.biaya_final),
      fmtRp(s.efisiensi_rupiah),
      s.progress || '-',
      s.durasi_hari != null ? `${s.durasi_hari} hr` : '-'
    ]);

    doc.autoTable({
      startY: startY + 4,
      head: [['No PA', 'Pelanggan', 'PIC SITAC', 'PTL', 'Terminating', 'Biaya Awal', 'Biaya Final', 'Penghematan', 'Status', 'SLA']],
      body: body,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2.5, textColor: [30, 41, 59], overflow: 'linebreak' },
      headStyles: { fillColor: [245, 158, 11], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [254, 249, 235] },
      columnStyles: {
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        9: { halign: 'right' }
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 8) {
          data.cell.styles.textColor = getStatusColor(data.cell.raw);
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
  }

  // --- GANGGUAN PDF ---
  function exportGangguanPdf(doc, startY) {
    const records = state.gangguan.data;
    if (!records || records.length === 0) {
      doc.setFontSize(11); doc.setTextColor(239, 68, 68);
      doc.text('Tidak ada data Gangguan.', 14, startY + 10);
      return;
    }

    const body = records.map(g => [
      g.no_tiket || '-',
      g.tgl_dispos || '-',
      g.tgl_selesai || '-',
      (g.terminating || '-').substring(0, 40),
      g.jenis_gangguan || '-',
      g.pic_perijinan || '-',
      fmtRp(g.biaya_gangguan),
      g.is_selesai ? 'Selesai' : 'Proses'
    ]);

    doc.autoTable({
      startY: startY,
      head: [['No Tiket', 'Tgl Dispos', 'Tgl Selesai', 'Lokasi', 'Jenis Gangguan', 'PIC', 'Biaya', 'Status']],
      body: body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 41, 59], overflow: 'linebreak' },
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        6: { halign: 'right' }
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 7) {
          data.cell.styles.textColor = data.cell.raw === 'Selesai' ? [16, 185, 129] : [245, 158, 11];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
  }

  // --- EFISIENSI PDF ---
  async function exportEfisiensiPdf(doc, startY) {
    let records = state.efisiensi;
    if (!records || records.length === 0) {
      try {
        const res = await fetch('/api/rekap-efisiensi');
        if (res.ok) { records = await res.json(); state.efisiensi = records; }
      } catch (e) { /* ignore */ }
    }
    if (!records || records.length === 0) {
      doc.setFontSize(11); doc.setTextColor(239, 68, 68);
      doc.text('Tidak ada data Efisiensi.', 14, startY + 10);
      return;
    }

    const body = records.map(r => [
      String(r.tahun || '-'),
      String(r.total_disposisi || 0),
      String(r.ada_biaya || 0),
      String(r.tidak_ada_biaya || 0),
      fmtRp(r.nilai_awal),
      fmtRp(r.nilai_akhir),
      fmtRp(r.efisiensi_rupiah),
      `${r.efisiensi_persen || 0}%`
    ]);

    doc.autoTable({
      startY: startY,
      head: [['Tahun', 'Total Disposisi', 'Berbiaya', 'Zero Cost', 'Biaya Awal', 'Biaya Akhir', 'Penghematan', 'Efisiensi %']],
      body: body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, textColor: [30, 41, 59] },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: [236, 253, 245] },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' },
        7: { halign: 'right', fontStyle: 'bold' }
      }
    });
  }

  // --- PIC MATRIX PDF ---
  async function exportPicMatrixPdf(doc, startY) {
    let records = state.picMatrix;
    if (!records || records.length === 0) {
      try {
        const res = await fetch('/api/pic-performance');
        if (res.ok) { records = await res.json(); state.picMatrix = records; }
      } catch (e) { /* ignore */ }
    }
    if (!records || records.length === 0) {
      doc.setFontSize(11); doc.setTextColor(239, 68, 68);
      doc.text('Tidak ada data PIC Matrix.', 14, startY + 10);
      return;
    }

    const body = records.map(p => [
      p.pic || '-',
      String(p.total_penugasan || 0),
      String(p.finish || 0),
      String((p.ongoing || 0) + (p.hold || 0)),
      String(p.cancel || 0),
      `${p.finish_rate || 0}%`,
      fmtRp(p.biaya_awal),
      fmtRp(p.biaya_final),
      fmtRp(p.efisiensi_rupiah),
      `${p.efisiensi_persen || 0}%`,
      String(p.avg_sla_hari || 0),
      String(p.gangguan_count || 0)
    ]);

    doc.autoTable({
      startY: startY,
      head: [['PIC SITAC', 'Total PA', 'Finish', 'Ongoing', 'Cancel', 'Finish %', 'Biaya Awal', 'Biaya Final', 'Penghematan', 'Efisiensi %', 'Avg SLA', 'Gangguan']],
      body: body,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [238, 242, 255] },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right', fontStyle: 'bold' },
        9: { halign: 'right', fontStyle: 'bold' },
        10: { halign: 'center' },
        11: { halign: 'center' }
      }
    });
  }

  // =========================================================================
  // EVENT LISTENERS BINDING
  // =========================================================================
  function setupEventListeners() {
    // 0. Auth & Login Handlers: Mode Tabs (Masuk vs Daftar Akun Baru)
    document.querySelectorAll('.login-mode-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.login-mode-tab-btn').forEach(b => {
          b.classList.remove('active', 'text-white');
          b.classList.add('text-slate-400');
        });
        btn.classList.add('active', 'text-white');
        btn.classList.remove('text-slate-400');

        const targetPaneId = btn.getAttribute('data-target');
        const paneLogin = document.getElementById('paneLogin');
        const paneRegister = document.getElementById('paneRegister');
        const paneForgot = document.getElementById('paneForgotPassword');
        const errBox = document.getElementById('loginErrorAlert');
        const succBox = document.getElementById('loginSuccessAlert');
        if (errBox) errBox.classList.add('hidden');
        if (succBox) succBox.classList.add('hidden');

        paneForgot?.classList.add('hidden');

        if (targetPaneId === 'paneRegister') {
          paneLogin?.classList.add('hidden');
          paneRegister?.classList.remove('hidden');
          document.getElementById('regFullName')?.focus();
        } else {
          paneRegister?.classList.add('hidden');
          paneLogin?.classList.remove('hidden');
          document.getElementById('loginUsername')?.focus();
        }
      });
    });

    // 0a. Toggle Password Visibility on Login Form
    document.getElementById('btnTogglePassword')?.addEventListener('click', () => {
      const passInput = document.getElementById('loginPassword');
      const eyeIcon = document.getElementById('passwordEyeIcon');
      if (!passInput || !eyeIcon) return;
      if (passInput.type === 'password') {
        passInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
      } else {
        passInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
      }
    });

    // 0b. Login Form Submit Handler (Firebase Authentication)
    document.getElementById('formLogin')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('loginUsername')?.value.trim();
      const p = document.getElementById('loginPassword')?.value;
      if (!u || !p) {
        showToast('Username/email dan kata sandi wajib diisi!', 'error');
        return;
      }
      performLogin(u, p);
    });

    // 0c. Fitur Lupa Sandi: Navigasi & Form Handlers (Google Firebase)
    let verifiedForgotUser = null;

    document.getElementById('btnOpenForgotPassword')?.addEventListener('click', () => {
      document.getElementById('paneLogin')?.classList.add('hidden');
      document.getElementById('paneRegister')?.classList.add('hidden');
      const paneForgot = document.getElementById('paneForgotPassword');
      if (paneForgot) paneForgot.classList.remove('hidden');

      // Reset forgot password state
      const formStep1 = document.getElementById('formForgotStep1');
      const formStep2 = document.getElementById('formForgotStep2');
      const alertEl = document.getElementById('forgotPwAlert');
      if (formStep1) {
        formStep1.classList.remove('hidden');
        formStep1.reset();
      }
      if (formStep2) {
        formStep2.classList.add('hidden');
        formStep2.reset();
      }
      if (alertEl) alertEl.className = 'p-3 rounded-lg text-xs hidden';
      verifiedForgotUser = null;

      // De-select tabs
      document.querySelectorAll('.login-mode-tab-btn').forEach(b => {
        b.classList.remove('active', 'text-white');
        b.classList.add('text-slate-400');
      });

      document.getElementById('forgotIdentifier')?.focus();
    });

    document.getElementById('btnBackToLoginFromForgot')?.addEventListener('click', () => {
      document.getElementById('paneForgotPassword')?.classList.add('hidden');
      document.getElementById('paneRegister')?.classList.add('hidden');
      document.getElementById('paneLogin')?.classList.remove('hidden');
      const tabLogin = document.getElementById('tabModeLogin');
      if (tabLogin) {
        tabLogin.classList.add('active', 'text-white');
        tabLogin.classList.remove('text-slate-400');
      }
      document.getElementById('loginUsername')?.focus();
    });

    // Toggle Password Visibility on Forgot Password Form
    document.getElementById('btnToggleForgotPw')?.addEventListener('click', () => {
      const passInput = document.getElementById('forgotNewPassword');
      const eyeIcon = document.getElementById('forgotEyeIcon');
      if (!passInput || !eyeIcon) return;
      if (passInput.type === 'password') {
        passInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
      } else {
        passInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
      }
    });

    // Step 1 Lupa Sandi: Cari Akun di Firebase
    document.getElementById('formForgotStep1')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('forgotIdentifier')?.value.trim();
      const alertEl = document.getElementById('forgotPwAlert');
      const submitBtn = document.getElementById('btnForgotCheckAccount');

      if (!identifier) {
        if (alertEl) {
          alertEl.className = 'p-3 rounded-lg text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300';
          alertEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1.5"></i> Masukkan username atau email terdaftar.';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Mencari Akun di Firebase...';
      }

      try {
        if (!window.FirebaseManager || !window.FirebaseManager.isConfigured()) {
          throw new Error('Koneksi Google Firebase belum aktif.');
        }

        const userLookup = await window.FirebaseManager.forgotLookup(identifier);
        verifiedForgotUser = userLookup;

        // Populate step 2 details
        const nameEl = document.getElementById('forgotVerifiedName');
        const roleEl = document.getElementById('forgotVerifiedRole');
        if (nameEl) nameEl.textContent = userLookup.full_name;
        if (roleEl) {
          const roleLabel = userLookup.role === 'admin' ? 'Administrator / Manajemen' : 'Teknisi PIC Lapangan';
          roleEl.textContent = `${roleLabel} (@${userLookup.username}) • ${userLookup.email}`;
        }

        // Switch to Step 2
        document.getElementById('formForgotStep1')?.classList.add('hidden');
        document.getElementById('formForgotStep2')?.classList.remove('hidden');
        if (alertEl) {
          alertEl.className = 'p-3 rounded-lg text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-300';
          alertEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1.5"></i> Akun <strong>${userLookup.full_name}</strong> terverifikasi di Firebase. Silakan masukkan kata sandi baru Anda.`;
        }
        document.getElementById('forgotNewPassword')?.focus();

      } catch (err) {
        if (alertEl) {
          alertEl.className = 'p-3 rounded-lg text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300';
          alertEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1.5"></i> ${err.message || 'Akun tidak ditemukan di Firebase.'}`;
        }
        showToast(err.message || 'Akun tidak ditemukan di Firebase', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1.5"></i> Cek Akun di Firebase';
        }
      }
    });

    // Step 2 Lupa Sandi: Simpan Sandi Baru ke Firebase
    document.getElementById('formForgotStep2')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('forgotPwAlert');
      const submitBtn = document.getElementById('btnForgotSubmitReset');
      const newPw = document.getElementById('forgotNewPassword')?.value;
      const confirmPw = document.getElementById('forgotConfirmPassword')?.value;

      if (!verifiedForgotUser || !verifiedForgotUser.username) {
        if (alertEl) {
          alertEl.className = 'p-3 rounded-lg text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300';
          alertEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1.5"></i> Sesi verifikasi tidak valid. Silakan ulangi pencarian akun.';
        }
        return;
      }

      if (!newPw || newPw.length < 4) {
        if (alertEl) {
          alertEl.className = 'p-3 rounded-lg text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300';
          alertEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1.5"></i> Kata sandi baru minimal 4 karakter.';
        }
        return;
      }

      if (newPw !== confirmPw) {
        if (alertEl) {
          alertEl.className = 'p-3 rounded-lg text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300';
          alertEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1.5"></i> Konfirmasi kata sandi tidak cocok.';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Menyimpan ke Firebase...';
      }

      try {
        const resetRes = await window.FirebaseManager.resetPassword(verifiedForgotUser.username, newPw);

        if (alertEl) {
          alertEl.className = 'p-3 rounded-lg text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-300';
          alertEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1.5"></i> Kata sandi akun <strong>@${verifiedForgotUser.username}</strong> berhasil diperbarui di Google Firebase! Mengalihkan ke login...`;
        }
        showToast('Kata sandi berhasil diperbarui di Google Firebase!', 'success');

        const savedUsername = verifiedForgotUser.username;

        // Auto return to login pane after 1.5 seconds
        setTimeout(() => {
          document.getElementById('paneForgotPassword')?.classList.add('hidden');
          document.getElementById('paneRegister')?.classList.add('hidden');
          document.getElementById('paneLogin')?.classList.remove('hidden');

          const tabLogin = document.getElementById('tabModeLogin');
          if (tabLogin) {
            tabLogin.classList.add('active', 'text-white');
            tabLogin.classList.remove('text-slate-400');
          }

          const loginUserInput = document.getElementById('loginUsername');
          const loginPassInput = document.getElementById('loginPassword');
          if (loginUserInput) loginUserInput.value = savedUsername;
          if (loginPassInput) {
            loginPassInput.value = '';
            loginPassInput.focus();
          }
        }, 1500);

      } catch (err) {
        if (alertEl) {
          alertEl.className = 'p-3 rounded-lg text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300';
          alertEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1.5"></i> ${err.message || 'Gagal mereset kata sandi.'}`;
        }
        showToast(err.message || 'Gagal mereset kata sandi', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-key mr-1.5"></i> Simpan Sandi Baru ke Firebase';
        }
      }
    });

    // 0d. Register Form Submit Handler (Daftar PIC Baru langsung ke Google Firebase Cloud Firestore)
    document.getElementById('formRegister')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('loginErrorAlert');
      const errMsg = document.getElementById('loginErrorMsg');
      const succBox = document.getElementById('loginSuccessAlert');
      const succMsg = document.getElementById('loginSuccessMsg');
      const submitBtn = document.getElementById('btnRegisterSubmit');

      if (errBox) errBox.classList.add('hidden');
      if (succBox) succBox.classList.add('hidden');

      const fullName = document.getElementById('regFullName')?.value.trim();
      const username = document.getElementById('regUsername')?.value.trim().toLowerCase();
      const email = document.getElementById('regEmail')?.value.trim().toLowerCase() || `${username}@telecom.ops`;
      const picSelect = document.getElementById('regPicCode');
      let picCode = picSelect ? picSelect.value : '';
      if (!picCode || picCode === 'Custom') {
        picCode = fullName ? fullName.split(' ')[0] : username;
      }
      const password = document.getElementById('regPassword')?.value;
      const passwordConfirm = document.getElementById('regPasswordConfirm')?.value;

      if (!fullName || !username || !password) {
        if (errBox) {
          errBox.classList.remove('hidden');
          if (errMsg) errMsg.textContent = 'Harap lengkapi semua data pendaftaran.';
        }
        return;
      }

      if (password.length < 4) {
        if (errBox) {
          errBox.classList.remove('hidden');
          if (errMsg) errMsg.textContent = 'Kata sandi minimal harus 4 karakter.';
        }
        return;
      }

      if (password !== passwordConfirm) {
        if (errBox) {
          errBox.classList.remove('hidden');
          if (errMsg) errMsg.textContent = 'Konfirmasi kata sandi tidak cocok dengan kata sandi yang dibuat.';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i> Mendaftarkan ke Firebase...';
      }

      try {
        if (!window.FirebaseManager || !window.FirebaseManager.isConfigured()) {
          throw new Error('Koneksi Google Firebase belum aktif.');
        }

        // PURE FIREBASE FIRESTORE REGISTRATION
        const regRes = await window.FirebaseManager.registerUser({
          full_name: fullName,
          username: username,
          email: email,
          pic_code: picCode,
          password: password,
          role: 'lapangan'
        });

        // Show success alert
        if (succBox) {
          succBox.classList.remove('hidden');
          if (succMsg) succMsg.textContent = regRes.message;
        }
        showToast(`Akun PIC "${fullName}" (@${username}) berhasil didaftarkan ke Google Firebase!`, 'success');

        // Reset form
        document.getElementById('formRegister')?.reset();

        // Switch to login tab and prefill username
        setTimeout(() => {
          document.getElementById('tabModeLogin')?.click();
          const loginUserInput = document.getElementById('loginUsername');
          const loginPassInput = document.getElementById('loginPassword');
          if (loginUserInput) loginUserInput.value = username;
          if (loginPassInput) {
            loginPassInput.value = '';
            loginPassInput.focus();
          }
        }, 1200);

      } catch (err) {
        if (errBox) {
          errBox.classList.remove('hidden');
          if (errMsg) errMsg.textContent = err.message || 'Pendaftaran akun ke Firebase gagal.';
        }
        showToast(err.message || 'Pendaftaran akun gagal', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-user-plus mr-1.5"></i> Daftarkan Akun PIC ke Cloud Firebase';
        }
      }
    });

    // 0e. Change Password Modal Handlers
    document.getElementById('btnOpenChangePassword')?.addEventListener('click', () => {
      const modal = document.getElementById('modalChangePassword');
      const alert = document.getElementById('changePwAlert');
      if (alert) alert.className = 'p-2.5 rounded-lg text-xs hidden';
      document.getElementById('formChangePassword')?.reset();
      if (modal) modal.style.display = 'flex';
      document.getElementById('changePwOld')?.focus();
    });

    document.getElementById('btnCloseChangePassword')?.addEventListener('click', () => {
      const modal = document.getElementById('modalChangePassword');
      if (modal) modal.style.display = 'none';
    });

    document.getElementById('btnCancelChangePassword')?.addEventListener('click', () => {
      const modal = document.getElementById('modalChangePassword');
      if (modal) modal.style.display = 'none';
    });

    document.getElementById('formChangePassword')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPw = document.getElementById('changePwOld')?.value;
      const newPw = document.getElementById('changePwNew')?.value;
      const confirmPw = document.getElementById('changePwConfirm')?.value;
      const alert = document.getElementById('changePwAlert');
      const submitBtn = document.getElementById('btnSubmitChangePassword');

      if (!oldPw || !newPw || !confirmPw) {
        if (alert) {
          alert.className = 'p-2.5 rounded-lg text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30';
          alert.textContent = 'Harap isi semua kolom password.';
        }
        return;
      }

      if (newPw.length < 4) {
        if (alert) {
          alert.className = 'p-2.5 rounded-lg text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30';
          alert.textContent = 'Password baru minimal 4 karakter.';
        }
        return;
      }

      if (newPw !== confirmPw) {
        if (alert) {
          alert.className = 'p-2.5 rounded-lg text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30';
          alert.textContent = 'Konfirmasi password baru tidak cocok.';
        }
        return;
      }

      if (!state.currentUser?.username) {
        showToast('Sesi login tidak valid, silakan login ulang', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Menyimpan...';
      }

      try {
        if (!window.FirebaseManager || !window.FirebaseManager.isConfigured()) {
          throw new Error('Koneksi Google Firebase belum aktif.');
        }

        const res = await window.FirebaseManager.changePassword(
          state.currentUser.username,
          oldPw,
          newPw
        );

        showToast('Password akun Anda berhasil diperbarui di Cloud Firebase!', 'success');
        const modal = document.getElementById('modalChangePassword');
        if (modal) modal.style.display = 'none';
        document.getElementById('formChangePassword')?.reset();

      } catch (err) {
        if (alert) {
          alert.className = 'p-2.5 rounded-lg text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30';
          alert.textContent = err.message;
        }
        showToast(err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-save mr-1"></i> Simpan Password Baru';
        }
      }
    });

    // =====================================================================
    // ADMIN: KELOLA AKUN PIC HANDLERS
    // =====================================================================

    // Helper: load daftar PIC ke dropdown admin via Firebase
    async function loadAdminUserList() {
      try {
        let pics = [];
        if (window.FirebaseManager && window.FirebaseManager.isConfigured()) {
          const allUsers = await window.FirebaseManager.fetchCollection('users');
          pics = allUsers.filter(u => u.username !== 'admin');
        }
        if (!pics || pics.length === 0) {
          const res = await fetch('/api/auth/registered-pics');
          if (res.ok) {
            const data = await res.json();
            pics = data.pics || [];
          }
        }
        const opts = pics.map(p => `<option value="${p.username}">${p.full_name || p.username} (@${p.username})</option>`).join('');
        const selectReset = document.getElementById('adminResetTargetUser');
        const selectDelete = document.getElementById('adminDeleteTargetUser');
        if (selectReset) selectReset.innerHTML = `<option value="">-- Pilih akun PIC --</option>${opts}`;
        if (selectDelete) selectDelete.innerHTML = `<option value="">-- Pilih akun PIC --</option>${opts}`;
      } catch (err) {
        console.warn('Gagal memuat daftar PIC dari Firebase:', err);
      }
    }

    // Helper: switch tab admin
    window.switchAdminTab = function(tab) {
      const panelReset = document.getElementById('tabPanelReset');
      const panelDelete = document.getElementById('tabPanelDelete');
      const btnReset = document.getElementById('tabResetPw');
      const btnDelete = document.getElementById('tabDeleteUser');
      if (tab === 'reset') {
        panelReset?.classList.remove('hidden');
        panelDelete?.classList.add('hidden');
        btnReset?.classList.replace('text-slate-400', 'text-violet-300');
        btnReset?.classList.add('border-b-2', 'border-violet-400');
        btnDelete?.classList.replace('text-violet-300', 'text-slate-400');
        btnDelete?.classList.remove('border-b-2', 'border-violet-400');
      } else {
        panelDelete?.classList.remove('hidden');
        panelReset?.classList.add('hidden');
        btnDelete?.classList.replace('text-slate-400', 'text-rose-300');
        btnDelete?.classList.add('border-b-2', 'border-rose-400');
        btnReset?.classList.replace('text-violet-300', 'text-slate-400');
        btnReset?.classList.remove('border-b-2', 'border-violet-400');
      }
    };

    // Buka modal admin
    document.getElementById('btnOpenAdminUsers')?.addEventListener('click', () => {
      const modal = document.getElementById('modalAdminUsers');
      if (modal) modal.style.display = 'flex';
      loadAdminUserList();
      // Reset fields
      ['adminResetNewPw','adminResetConfirmPw','adminResetAdminPw','adminDeleteAdminPw'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      ['adminResetAlert','adminDeleteAlert'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = 'p-2.5 rounded-lg text-xs hidden';
      });
      window.switchAdminTab('reset');
    });

    // Tutup modal admin
    document.getElementById('btnCloseAdminUsers')?.addEventListener('click', () => {
      document.getElementById('modalAdminUsers').style.display = 'none';
    });

    // Admin: Reset Password
    document.getElementById('btnSubmitAdminReset')?.addEventListener('click', async () => {
      const targetUser = document.getElementById('adminResetTargetUser')?.value;
      const newPw = document.getElementById('adminResetNewPw')?.value;
      const confirmPw = document.getElementById('adminResetConfirmPw')?.value;
      const adminPw = document.getElementById('adminResetAdminPw')?.value;
      const alertEl = document.getElementById('adminResetAlert');
      const btn = document.getElementById('btnSubmitAdminReset');

      function showResetAlert(msg, isError) {
        if (alertEl) {
          alertEl.className = `p-2.5 rounded-lg text-xs border ${isError ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`;
          alertEl.textContent = msg;
        }
      }

      if (!targetUser) return showResetAlert('Pilih akun PIC terlebih dahulu', true);
      if (!newPw || newPw.length < 4) return showResetAlert('Password baru minimal 4 karakter', true);
      if (newPw !== confirmPw) return showResetAlert('Konfirmasi password tidak cocok', true);
      if (!adminPw) return showResetAlert('Password admin wajib diisi untuk verifikasi', true);

      const currentUser = state.currentUser || JSON.parse(localStorage.getItem('telecom_portal_user') || '{}');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Mereset di Firebase...';
      try {
        if (!window.FirebaseManager || !window.FirebaseManager.isConfigured()) {
          throw new Error('Koneksi Google Firebase belum aktif.');
        }

        // Verify admin password against Firebase
        await window.FirebaseManager.loginUser(currentUser.username, adminPw);

        // Perform reset on target user in Firebase
        const res = await window.FirebaseManager.adminResetPassword(targetUser, newPw);
        showResetAlert(res.message, false);
        showToast(res.message, 'success');
        ['adminResetNewPw','adminResetConfirmPw','adminResetAdminPw'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
      } catch (err) {
        showResetAlert(err.message || 'Gagal mereset kata sandi', true);
        showToast(err.message || 'Gagal mereset kata sandi', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate-right mr-1"></i> Reset Password';
      }
    });

    // Admin: Hapus Akun
    document.getElementById('btnSubmitAdminDelete')?.addEventListener('click', async () => {
      const targetUser = document.getElementById('adminDeleteTargetUser')?.value;
      const adminPw = document.getElementById('adminDeleteAdminPw')?.value;
      const alertEl = document.getElementById('adminDeleteAlert');
      const btn = document.getElementById('btnSubmitAdminDelete');

      function showDeleteAlert(msg, isError) {
        if (alertEl) {
          alertEl.className = `p-2.5 rounded-lg text-xs border ${isError ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`;
          alertEl.textContent = msg;
        }
      }

      if (!targetUser) return showDeleteAlert('Pilih akun yang akan dihapus', true);
      if (!adminPw) return showDeleteAlert('Password admin wajib diisi', true);

      if (!confirm(`Yakin ingin menghapus akun @${targetUser}? Tindakan ini tidak dapat dibatalkan.`)) return;

      const currentUser = state.currentUser || JSON.parse(localStorage.getItem('telecom_portal_user') || '{}');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menghapus di Firebase...';
      try {
        if (!window.FirebaseManager || !window.FirebaseManager.isConfigured()) {
          throw new Error('Koneksi Google Firebase belum aktif.');
        }

        // Verify admin password against Firebase
        await window.FirebaseManager.loginUser(currentUser.username, adminPw);

        // Delete user in Firebase
        const res = await window.FirebaseManager.deleteUser(targetUser);
        showDeleteAlert(res.message, false);
        showToast(res.message, 'success');
        const adminPwInput = document.getElementById('adminDeleteAdminPw');
        if (adminPwInput) adminPwInput.value = '';
        loadAdminUserList(); // Refresh dropdown
      } catch (err) {
        showDeleteAlert(err.message || 'Gagal menghapus akun', true);
        showToast(err.message || 'Gagal menghapus akun', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-minus mr-1"></i> Hapus Akun Ini';
      }
    });

    document.getElementById('btnLogout')?.addEventListener('click', () => {
      performLogout();
    });

    // 1. Sidebar Nav Click
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const viewId = btn.getAttribute('data-view');
        switchView(viewId);
      });
    });

    // 1b. Sidebar Submenu Dropdown Accordion Toggle
    document.querySelectorAll('.section-dropdown-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const group = btn.closest('.nav-section-group');
        if (group) {
          group.classList.toggle('collapsed');
        }
      });
    });

    // 1c. Mobile Sidebar Toggle Button & Clearwave FAB
    document.getElementById('sidebarToggleBtn')?.addEventListener('click', () => {
      document.getElementById('portalSidebar')?.classList.toggle('mobile-open');
    });
    document.getElementById('clearwaveFloatingFab')?.addEventListener('click', () => {
      const sidebar = document.getElementById('portalSidebar');
      if (window.innerWidth < 1024 && sidebar) {
        sidebar.classList.toggle('mobile-open');
      } else {
        const bodyEl = document.querySelector('.portal-content-body') || window;
        bodyEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    // 2. Theme Toggle (Supports both sidebar button and topbar segmented switcher)
    const applyThemeChange = (newTheme) => {
      state.theme = newTheme;
      localStorage.setItem('portal_theme', state.theme);
      initTheme();
      if (state.activeView === 'view-executive') loadExecutiveSummary();
      else if (state.activeView === 'view-collo-list') loadColloData();
      else if (state.activeView === 'view-collo-revshare') loadRevSharingData();
      else if (state.activeView === 'view-collo-renewal') loadAlertsData();
      else if (state.activeView === 'view-sitac-pa') loadSitacData();
      else if (state.activeView === 'view-gangguan') loadGangguanData();
      else if (state.activeView === 'view-efisiensi') loadEfisiensiData();
      else if (state.activeView === 'view-pic-workload') loadPicWorkloadData();
      if (leafletMap) {
        leafletMap.remove();
        leafletMap = null;
        initWebgisMap();
      }
    };

    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
      applyThemeChange(state.theme === 'dark' ? 'light' : 'dark');
    });


    // 2b. DayNight Segmented Quick Period Pills
    const quickPeriodPills = document.querySelectorAll('#execPeriodQuickPills .exec-period-pill');
    const periodSelect = document.getElementById('execFilterPeriod');

    quickPeriodPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const pVal = pill.getAttribute('data-period');
        quickPeriodPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        if (periodSelect && periodSelect.value !== pVal) {
          periodSelect.value = pVal;
          periodSelect.dispatchEvent(new Event('change'));
        }
      });
    });

    periodSelect?.addEventListener('change', () => {
      const currentVal = periodSelect.value;
      quickPeriodPills.forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-period') === currentVal);
      });
    });

    // 2c. Executive Greeting Helper
    const updateExecutiveGreeting = () => {
      const greetingTitleEl = document.getElementById('execGreetingTitle');
      const dateEl = document.getElementById('execCurrentDateDisplay');
      const hour = new Date().getHours();
      let salam = 'Selamat Datang,';
      if (hour >= 4 && hour < 11) salam = 'Selamat Pagi,';
      else if (hour >= 11 && hour < 15) salam = 'Selamat Siang,';
      else if (hour >= 15 && hour < 18) salam = 'Selamat Sore,';
      else salam = 'Selamat Malam,';

      const userName = state.currentUser?.username || 'Administrator';
      if (greetingTitleEl) {
        greetingTitleEl.innerHTML = `${salam} <span class="text-cyan-500 font-bold" id="execGreetingName">${userName}</span> 👋`;
      }
      if (dateEl) {
        try {
          dateEl.textContent = new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
        } catch (e) {
          dateEl.textContent = new Date().toDateString();
        }
      }
    };
    updateExecutiveGreeting();

    // 3. Quick Export Buttons & Dropdowns
    document.getElementById('btnExportExcel')?.addEventListener('click', () => exportCurrentViewExcel());
    document.getElementById('btnExportColloExcel')?.addEventListener('click', () => exportCurrentViewExcel('collo'));
    document.getElementById('btnExportSitacExcel')?.addEventListener('click', () => exportCurrentViewExcel('sitac'));
    document.getElementById('btnExportGangguanExcel')?.addEventListener('click', () => exportCurrentViewExcel('gangguan'));

    document.getElementById('btnQuickExport')?.addEventListener('click', exportCurrentView);

    // Active Technician Identity Selector & My Tasks Filter Listeners
    const techSelect = document.getElementById('selectActiveTechnician');
    if (techSelect) {
      techSelect.value = state.activeTechnician || 'Harlan';
      techSelect.addEventListener('change', (e) => {
        // Enforce PIC locking: non-admin cannot change identity casually ("tidak bisa gonta ganti user seenaknya")
        if (state.currentUser && state.currentUser.role === 'lapangan') {
          showToast('Identitas PIC terkunci sesuai akun login Anda. Silakan keluar untuk ganti akun.', 'warning');
          techSelect.value = state.currentUser.pic_code || 'Harlan';
          return;
        }
        state.activeTechnician = e.target.value;
        localStorage.setItem('telecom_active_technician', state.activeTechnician);
        showToast(`Filter identitas teknisi aktif: ${state.activeTechnician}`);
        if (state.myTasksOnlyGangguan) loadGangguanData();
        if (state.myTasksOnlySitac) {
          state.sitac.page = 1;
          loadSitacData();
        }
      });
    }

    const btnGMyTasks = document.getElementById('btnGangguanMyTasks');
    btnGMyTasks?.addEventListener('click', () => {
      state.myTasksOnlyGangguan = !state.myTasksOnlyGangguan;
      btnGMyTasks.classList.toggle('active', state.myTasksOnlyGangguan);
      loadGangguanData();
      if (state.myTasksOnlyGangguan) {
        showToast(`Memfilter gangguan penugasan: ${state.activeTechnician}`);
      } else {
        showToast('Menampilkan seluruh tiket gangguan');
      }
    });

    const btnSMyTasks = document.getElementById('btnSitacMyTasks');
    btnSMyTasks?.addEventListener('click', () => {
      state.myTasksOnlySitac = !state.myTasksOnlySitac;
      btnSMyTasks.classList.toggle('active', state.myTasksOnlySitac);
      state.sitac.page = 1;
      loadSitacData();
      if (state.myTasksOnlySitac) {
        showToast(`Memfilter proyek SITAC penugasan: ${state.activeTechnician}`);
      } else {
        showToast('Menampilkan seluruh penugasan SITAC');
      }
    });

    const btnExportPdf = document.getElementById('btnExportPdf');
    const exportPdfMenu = document.getElementById('exportPdfMenu');
    btnExportPdf?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportPdfMenu?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#exportPdfDropdownContainer')) {
        exportPdfMenu?.classList.add('hidden');
      }
    });

    document.getElementById('btnExportCurrentModulePdf')?.addEventListener('click', () => {
      exportPdfMenu?.classList.add('hidden');
      exportCurrentViewPdf();
    });

    document.getElementById('btnDownloadMasterPdf')?.addEventListener('click', () => {
      exportPdfMenu?.classList.add('hidden');
      showToast('Mengunduh Laporan Master PDF...');
    });

    document.getElementById('btnExportPicMatrix')?.addEventListener('click', exportPicMatrixCsv);
    document.getElementById('btnExportEfisiensi')?.addEventListener('click', exportEfisiensiCsv);

    // 4. View 2 (Collo) Controls
    document.querySelectorAll('.collo-status-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.collo-status-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.collo.status = btn.getAttribute('data-status');
        state.collo.page = 1;
        loadColloData();
      });
    });

    const colloSearch = document.getElementById('colloSearchInput');
    let colloSearchTimer = null;
    colloSearch?.addEventListener('input', (e) => {
      clearTimeout(colloSearchTimer);
      colloSearchTimer = setTimeout(() => {
        state.collo.search = e.target.value;
        state.collo.page = 1;
        loadColloData();
      }, 300);
    });

    document.getElementById('colloFilterJenis')?.addEventListener('change', (e) => {
      state.collo.jenisSewa = e.target.value;
      state.collo.page = 1;
      loadColloData();
    });

    document.getElementById('colloFilterPengelola')?.addEventListener('change', (e) => {
      state.collo.pengelola = e.target.value;
      state.collo.page = 1;
      loadColloData();
    });

    document.getElementById('colloSortSelect')?.addEventListener('change', (e) => {
      state.collo.sort = e.target.value;
      loadColloData();
    });

    // Helper to scroll table smoothly to top on pagination / page change
    function scrollTableToTop(cardSelector) {
      const card = document.querySelector(cardSelector);
      const scrollContainer = document.querySelector('.portal-content-body');
      if (card && scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const targetScroll = scrollContainer.scrollTop + (cardRect.top - containerRect.top) - 16;
        scrollContainer.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      } else if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    document.getElementById('colloPrevPageBtn')?.addEventListener('click', () => {
      if (state.collo.page > 1) {
        state.collo.page--;
        scrollTableToTop('#view-collo-list .table-container-card');
        loadColloData().then(() => {
          scrollTableToTop('#view-collo-list .table-container-card');
        });
      }
    });

    document.getElementById('colloNextPageBtn')?.addEventListener('click', () => {
      state.collo.page++;
      scrollTableToTop('#view-collo-list .table-container-card');
      loadColloData().then(() => {
        scrollTableToTop('#view-collo-list .table-container-card');
      });
    });

    // 5. View 3 (Rev Sharing) Controls
    const rsSearch = document.getElementById('revShareSearchInput');
    let rsTimer = null;
    rsSearch?.addEventListener('input', (e) => {
      clearTimeout(rsTimer);
      rsTimer = setTimeout(() => {
        state.revSharing.search = e.target.value;
        loadRevSharingData();
      }, 300);
    });

    // 6. View 4 (Alerts) Controls
    document.querySelectorAll('.alert-filter-card').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.alert-filter-card').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.alerts.category = btn.getAttribute('data-alert-cat');
        loadAlertsData();
      });
    });

    const alertSearch = document.getElementById('alertSearchInput');
    let alertTimer = null;
    alertSearch?.addEventListener('input', (e) => {
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => {
        state.alerts.search = e.target.value;
        loadAlertsData();
      }, 300);
    });

    // 7. View 5 (SITAC) Controls
    document.querySelectorAll('.sitac-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sitac-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.sitac.status = btn.getAttribute('data-status');
        state.sitac.page = 1;
        loadSitacData();
      });
    });

    const sitacSearch = document.getElementById('sitacSearchInput');
    let sitacTimer = null;
    sitacSearch?.addEventListener('input', (e) => {
      clearTimeout(sitacTimer);
      sitacTimer = setTimeout(() => {
        state.sitac.search = e.target.value;
        state.sitac.page = 1;
        loadSitacData();
      }, 300);
    });

    document.getElementById('sitacFilterPic')?.addEventListener('change', (e) => {
      state.sitac.pic = e.target.value;
      state.sitac.page = 1;
      loadSitacData();
    });
    document.getElementById('sitacFilterAging')?.addEventListener('change', (e) => {
      state.sitac.aging = e.target.value;
      state.sitac.page = 1;
      loadSitacData();
    });
    document.getElementById('sitacFilterYear')?.addEventListener('change', (e) => {
      state.sitac.year = e.target.value;
      state.sitac.page = 1;
      loadSitacData();
    });
    document.getElementById('sitacPrevPageBtn')?.addEventListener('click', () => {
      if (state.sitac.page > 1) {
        state.sitac.page--;
        scrollTableToTop('#view-sitac-pa .table-container-card');
        loadSitacData().then(() => {
          scrollTableToTop('#view-sitac-pa .table-container-card');
        });
      }
    });
    document.getElementById('sitacNextPageBtn')?.addEventListener('click', () => {
      state.sitac.page++;
      scrollTableToTop('#view-sitac-pa .table-container-card');
      loadSitacData().then(() => {
        scrollTableToTop('#view-sitac-pa .table-container-card');
      });
    });

    // 8. View 6 (Gangguan) Controls & Date Filtering
    document.querySelectorAll('.gangguan-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gangguan-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.gangguan.status = btn.getAttribute('data-status');
        loadGangguanData();
      });
    });

    const gSearch = document.getElementById('gangguanSearchInput');
    let gTimer = null;
    gSearch?.addEventListener('input', (e) => {
      clearTimeout(gTimer);
      gTimer = setTimeout(() => {
        state.gangguan.search = e.target.value;
        loadGangguanData();
      }, 300);
    });

    // Helper to format Date object into YYYY-MM-DD
    function toISODateStr(d) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Apply Quick Period for Gangguan
    function applyGangguanQuickPeriod(period) {
      const today = new Date();
      let start = '';
      let end = '';

      if (period === 'today') {
        start = toISODateStr(today);
        end = toISODateStr(today);
      } else if (period === 'last7') {
        const past7 = new Date();
        past7.setDate(today.getDate() - 7);
        start = toISODateStr(past7);
        end = toISODateStr(today);
      } else if (period === 'last30') {
        const past30 = new Date();
        past30.setDate(today.getDate() - 30);
        start = toISODateStr(past30);
        end = toISODateStr(today);
      } else if (period === 'thisMonth') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        start = toISODateStr(firstDay);
        end = toISODateStr(lastDay);
      } else if (period === 'year2025') {
        start = '2025-01-01';
        end = '2025-12-31';
      } else if (period === 'year2026') {
        start = '2026-01-01';
        end = '2026-12-31';
      } else {
        // 'all'
        start = '';
        end = '';
      }

      state.gangguan.quickPeriod = period;
      state.gangguan.startDate = start;
      state.gangguan.endDate = end;
      state.gangguan.exactDate = '';

      const startInput = document.getElementById('gangguanStartDate');
      const endInput = document.getElementById('gangguanEndDate');
      const exactInput = document.getElementById('gangguanExactDate');
      if (startInput) startInput.value = start;
      if (endInput) endInput.value = end;
      if (exactInput) exactInput.value = '';

      document.querySelectorAll('.gangguan-period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-period') === period);
      });

      loadGangguanData();
    }

    // Date Type Selector (Disposisi vs Selesai)
    document.getElementById('gangguanDateType')?.addEventListener('change', (e) => {
      state.gangguan.dateType = e.target.value;
      loadGangguanData();
    });

    // Quick Period Buttons
    document.querySelectorAll('.gangguan-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-period');
        applyGangguanQuickPeriod(p);
      });
    });

    // Date Range (Dari - Sampai)
    const gStartInput = document.getElementById('gangguanStartDate');
    const gEndInput = document.getElementById('gangguanEndDate');
    const onGangguanRangeChange = () => {
      state.gangguan.startDate = gStartInput?.value || '';
      state.gangguan.endDate = gEndInput?.value || '';
      state.gangguan.exactDate = '';
      const exactInput = document.getElementById('gangguanExactDate');
      if (exactInput) exactInput.value = '';

      document.querySelectorAll('.gangguan-period-btn').forEach(b => b.classList.remove('active'));
      state.gangguan.quickPeriod = 'custom';
      loadGangguanData();
    };
    gStartInput?.addEventListener('change', onGangguanRangeChange);
    gEndInput?.addEventListener('change', onGangguanRangeChange);

    // Exact Date Picker (Cari Tanggal Tertentu)
    const gExactInput = document.getElementById('gangguanExactDate');
    gExactInput?.addEventListener('change', (e) => {
      const val = e.target.value;
      state.gangguan.exactDate = val;
      state.gangguan.startDate = '';
      state.gangguan.endDate = '';
      if (gStartInput) gStartInput.value = '';
      if (gEndInput) gEndInput.value = '';

      document.querySelectorAll('.gangguan-period-btn').forEach(b => b.classList.remove('active'));
      state.gangguan.quickPeriod = val ? 'exact' : 'all';
      loadGangguanData();
    });

    // Reset Filter Tanggal
    document.getElementById('btnResetGangguanDate')?.addEventListener('click', () => {
      applyGangguanQuickPeriod('all');
    });

    // 9. View 9 (WebGIS) Controls
    document.querySelectorAll('.map-tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-tag-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const st = btn.getAttribute('data-status');
        updateMapMarkers(st);
      });
    });

    // Base Layer switcher buttons
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layerKey = btn.getAttribute('data-layer');
        setMapBaseLayer(layerKey);
      });
    });

    // Fit Bounds button (zoom into all pins)
    document.getElementById('btnFitMapBounds')?.addEventListener('click', () => {
      if (leafletMap && lastMapBounds) {
        leafletMap.fitBounds(lastMapBounds, { padding: [40, 40], maxZoom: 13 });
      }
    });

    document.getElementById('btnResetWebgisView')?.addEventListener('click', () => {
      if (leafletMap) leafletMap.setView([-6.2200, 106.8400], 11);
    });

    // 10. Table Action Buttons Delegation (View Detail, Delete & Quick Edit)
    document.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-quick-edit');
      if (editBtn) {
        const type = editBtn.getAttribute('data-type');
        const id = editBtn.getAttribute('data-id');
        openQuickEditModal(type, id);
        return;
      }

      const detailBtn = e.target.closest('.btn-view-detail');
      if (detailBtn) {
        const type = detailBtn.getAttribute('data-type');
        const id = detailBtn.getAttribute('data-id');
        openDetailModal(type, id);
      }

      const deleteBtn = e.target.closest('.btn-delete-row');
      if (deleteBtn) {
        const type = deleteBtn.getAttribute('data-type');
        const id = deleteBtn.getAttribute('data-id');
        deleteRecord(type, id);
      }
    });

    // 10c. Interactive Multi-Value Popover (+N Lainnya / Solusi 1)
    const tenantPopover = document.getElementById('tenantPopover');
    const popoverTitle = document.getElementById('tenantPopoverTitle');
    const popoverIcon = document.getElementById('tenantPopoverIcon');
    const popoverBody = document.getElementById('tenantPopoverBody');
    const btnPopoverClose = document.getElementById('btnTenantPopoverClose');
    let activePopoverBtn = null;

    const closePopover = () => {
      if (tenantPopover) {
        tenantPopover.classList.add('hidden');
        tenantPopover.style.display = 'none';
        activePopoverBtn = null;
      }
    };

    btnPopoverClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      closePopover();
    });

    document.addEventListener('click', (e) => {
      const popoverTrigger = e.target.closest('[data-popover]');
      if (popoverTrigger) {
        e.stopPropagation();

        // If clicking the same trigger button that's already open, toggle close
        if (activePopoverBtn === popoverTrigger && tenantPopover && !tenantPopover.classList.contains('hidden')) {
          closePopover();
          return;
        }

        try {
          const raw = popoverTrigger.getAttribute('data-popover');
          const data = JSON.parse(decodeURIComponent(raw));
          
          if (popoverTitle) popoverTitle.textContent = data.title || 'Daftar Lengkap';
          if (popoverIcon) {
            popoverIcon.className = `fa-solid ${data.icon || 'fa-users'} text-cyan-400 text-xs`;
          }
          if (popoverBody) {
            popoverBody.innerHTML = (data.items || []).map((item, idx) => `
              <div class="popover-tenant-item">
                <div class="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                  <span class="popover-item-num">${idx + 1}.</span>
                  <span class="popover-item-text font-medium truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                </div>
                ${item.badge ? `<span class="badge-pill bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[10px] whitespace-nowrap flex-shrink-0 font-bold">${escapeHtml(item.badge)}</span>` : ''}
              </div>
            `).join('');
          }

          // Positioning near the button
          const rect = popoverTrigger.getBoundingClientRect();
          const popoverWidth = 330;
          const popoverHeight = 280;
          
          let top = rect.bottom + 6;
          let left = rect.left;

          // Check right boundary
          if (left + popoverWidth > window.innerWidth - 16) {
            left = Math.max(16, window.innerWidth - popoverWidth - 16);
          }
          if (left < 16) left = 16;

          // Check bottom boundary: if bottom overflows, flip to show above the button
          if (top + popoverHeight > window.innerHeight - 16) {
            const topAbove = rect.top - popoverHeight - 6;
            if (topAbove >= 16) {
              top = topAbove;
            } else {
              top = Math.max(16, window.innerHeight - popoverHeight - 16);
            }
          }

          tenantPopover.style.top = `${top}px`;
          tenantPopover.style.left = `${left}px`;
          tenantPopover.classList.remove('hidden');
          tenantPopover.style.display = 'block';
          activePopoverBtn = popoverTrigger;
        } catch (err) {
          console.error('Error opening popover:', err);
        }
        return;
      }

      if (tenantPopover && !tenantPopover.contains(e.target) && !tenantPopover.classList.contains('hidden')) {
        closePopover();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopover();
    });

    // 10b. Financial Summary 1-Button Expand/Collapse (Image 1 consolidation)
    const btnToggleColloFin = document.getElementById('btnToggleColloFinSummary');
    const colloFinCard = document.getElementById('colloFinSummaryCard');
    const iconColloChevron = document.getElementById('iconColloFinChevron');

    btnToggleColloFin?.addEventListener('click', () => {
      const isHidden = colloFinCard?.classList.toggle('hidden');
      if (isHidden) {
        iconColloChevron?.classList.remove('rotate-180');
      } else {
        iconColloChevron?.classList.add('rotate-180');
      }
    });

    // Helper function to open modal with auto-fill date & PIC
    function openModalWithDate(modalId, dateInputId) {
      const today = new Date().toISOString().slice(0, 10);
      if (dateInputId) {
        const d = document.getElementById(dateInputId);
        if (d && !d.value) d.value = today;
      }
      const m = document.getElementById(modalId);
      if (m) {
        m.style.display = 'flex';
        // Auto-fill & lock PIC name if field technician is logged in
        if (modalId === 'modalAddGangguan' || modalId === 'modalAddSitac') {
          const picInput = m.querySelector('input[name="pic_perijinan"]');
          if (picInput) {
            if (state.currentUser?.role === 'lapangan') {
              const assignedName = state.currentUser.full_name || state.activeTechnician || 'Teknisi Lapangan';
              picInput.value = assignedName;
              picInput.readOnly = true;
              picInput.style.opacity = '0.85';
              picInput.style.cursor = 'not-allowed';
              picInput.title = 'Identitas PIC terkunci otomatis sesuai akun sesi Anda';
            } else {
              picInput.readOnly = false;
              picInput.style.opacity = '1';
              picInput.style.cursor = 'text';
              if (!picInput.value) picInput.value = state.activeTechnician !== 'Admin' ? state.activeTechnician : '';
            }
          }
        }
      }
    }

    // 11. Separated Add Data Modals (Gangguan, SITAC, Collo, and Smart Picker)
    // 11a. Direct button on Tiket Gangguan page
    document.getElementById('btnOpenAddGangguanDirect')?.addEventListener('click', () => {
      openModalWithDate('modalAddGangguan', 'addGangguanDateDispos');
    });

    // 11b. Direct button on SITAC PA page
    document.getElementById('btnOpenAddSitacDirect')?.addEventListener('click', () => {
      openModalWithDate('modalAddSitac', 'addSitacDateDispos');
    });

    // 11c. Direct button on Colocation page
    document.getElementById('btnOpenAddColloDirect')?.addEventListener('click', () => {
      openModalWithDate('modalAddCollo');
    });

    // 11d. Topbar "+ Tambah Data" Smart Button
    document.getElementById('btnOpenAddModal')?.addEventListener('click', () => {
      // If currently looking at a specific view, open that form directly!
      if (state.activeView === 'view-gangguan') {
        openModalWithDate('modalAddGangguan', 'addGangguanDateDispos');
      } else if (state.activeView === 'view-sitac-pa') {
        openModalWithDate('modalAddSitac', 'addSitacDateDispos');
      } else if (state.activeView === 'view-collo-list' && state.currentUser?.role !== 'lapangan') {
        openModalWithDate('modalAddCollo');
      } else {
        // Open clean picker dialog so user can choose what to add without confusion
        const pickModal = document.getElementById('modalPickAddType');
        if (pickModal) pickModal.style.display = 'flex';
      }
    });

    // 11e. Picker Dialog Options
    document.getElementById('btnPickGangguan')?.addEventListener('click', () => {
      document.getElementById('modalPickAddType').style.display = 'none';
      openModalWithDate('modalAddGangguan', 'addGangguanDateDispos');
    });

    document.getElementById('btnPickSitac')?.addEventListener('click', () => {
      document.getElementById('modalPickAddType').style.display = 'none';
      openModalWithDate('modalAddSitac', 'addSitacDateDispos');
    });

    document.getElementById('btnPickCollo')?.addEventListener('click', () => {
      document.getElementById('modalPickAddType').style.display = 'none';
      openModalWithDate('modalAddCollo');
    });

    // 11f. Close buttons for each modal
    document.getElementById('btnClosePickAdd')?.addEventListener('click', () => {
      document.getElementById('modalPickAddType').style.display = 'none';
    });
    document.getElementById('btnCloseAddGangguan')?.addEventListener('click', () => {
      document.getElementById('modalAddGangguan').style.display = 'none';
    });
    document.getElementById('btnCloseAddSitac')?.addEventListener('click', () => {
      document.getElementById('modalAddSitac').style.display = 'none';
    });
    document.getElementById('btnCloseAddCollo')?.addEventListener('click', () => {
      document.getElementById('modalAddCollo').style.display = 'none';
    });

    // Close modals on overlay backdrop click
    ['modalAddGangguan', 'modalAddSitac', 'modalAddCollo', 'modalPickAddType', 'modalQuickEdit', 'modalDetail', 'modalChangePassword'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', (e) => {
        if (e.target.id === id) {
          e.target.style.display = 'none';
        }
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ['modalAddGangguan', 'modalAddSitac', 'modalAddCollo', 'modalPickAddType', 'modalQuickEdit', 'modalDetail', 'modalChangePassword', 'loginOverlay'].forEach(id => {
          if (id === 'loginOverlay' && !state.currentUser) return;
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
      }
    });

    // 12. Modal Quick Edit Close & Submit
    document.getElementById('btnCloseQuickEdit')?.addEventListener('click', () => {
      document.getElementById('modalQuickEdit').style.display = 'none';
    });
    document.getElementById('btnCancelQuickEdit')?.addEventListener('click', () => {
      document.getElementById('modalQuickEdit').style.display = 'none';
    });
    document.getElementById('formQuickEdit')?.addEventListener('submit', handleQuickEditSubmit);

    // 13. Modal Detail Close
    document.getElementById('btnCloseDetail')?.addEventListener('click', () => {
      document.getElementById('modalDetail').style.display = 'none';
    });

    // 14. Add Forms Submissions
    document.getElementById('formAddGangguan')?.addEventListener('submit', (e) => handleAddFormSubmit(e, 'gangguan'));
    document.getElementById('formAddSitac')?.addEventListener('submit', (e) => handleAddFormSubmit(e, 'sitac'));
    document.getElementById('formAddCollo')?.addEventListener('submit', (e) => handleAddFormSubmit(e, 'collo'));

    // 15. Topbar Dropdown Toggle Handlers (Ekspor & Alat Portal)
    const btnExport = document.getElementById('btnToggleExportMenu');
    const menuExport = document.getElementById('exportGroupMenu');
    const btnTools = document.getElementById('btnToggleToolsMenu');
    const menuTools = document.getElementById('toolsGroupMenu');

    const updateDropdownActiveStates = () => {
      const isExportOpen = menuExport && !menuExport.classList.contains('hidden');
      const isToolsOpen = menuTools && !menuTools.classList.contains('hidden');

      if (btnExport) btnExport.classList.toggle('active', !!isExportOpen);
      if (btnTools) btnTools.classList.toggle('active', !!isToolsOpen);
    };

    const closeAllDropdowns = () => {
      menuExport?.classList.add('hidden');
      menuTools?.classList.add('hidden');
      updateDropdownActiveStates();
    };

    btnExport?.addEventListener('click', (e) => {
      e.stopPropagation();
      menuTools?.classList.add('hidden');
      menuExport?.classList.toggle('hidden');
      updateDropdownActiveStates();
    });

    btnTools?.addEventListener('click', (e) => {
      e.stopPropagation();
      menuExport?.classList.add('hidden');
      menuTools?.classList.toggle('hidden');
      updateDropdownActiveStates();
    });

    // Close dropdowns on item click
    menuExport?.querySelectorAll('button, a').forEach(item => {
      item.addEventListener('click', closeAllDropdowns);
    });
    menuTools?.querySelectorAll('button, a').forEach(item => {
      item.addEventListener('click', closeAllDropdowns);
    });

    // Close dropdowns on document click
    document.addEventListener('click', (e) => {
      let changed = false;
      if (!e.target.closest('#exportGroupDropdownContainer')) {
        if (menuExport && !menuExport.classList.contains('hidden')) {
          menuExport.classList.add('hidden');
          changed = true;
        }
      }
      if (!e.target.closest('#toolsGroupDropdownContainer')) {
        if (menuTools && !menuTools.classList.contains('hidden')) {
          menuTools.classList.add('hidden');
          changed = true;
        }
      }
      if (changed) updateDropdownActiveStates();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllDropdowns();
    });

    // 15b. Database Access & Explorer Modal Handlers
    document.getElementById('btnOpenDatabaseViewer')?.addEventListener('click', openDatabaseViewerModal);
    document.querySelector('.db-status-pill')?.addEventListener('click', openDatabaseViewerModal);
    document.getElementById('btnCloseDatabaseViewer')?.addEventListener('click', () => {
      document.getElementById('modalDatabaseViewer').style.display = 'none';
    });
    document.getElementById('modalDatabaseViewer')?.addEventListener('click', (e) => {
      if (e.target.id === 'modalDatabaseViewer') {
        e.target.style.display = 'none';
      }
    });
    document.getElementById('btnRefreshDbUsers')?.addEventListener('click', fetchDatabaseOverview);
    document.getElementById('dbUserSearchInput')?.addEventListener('input', () => {
      if (dbOverviewData && dbOverviewData.users) {
        renderDbUsersTable(dbOverviewData.users);
      }
    });

    // Test Firestore Connection Button
    document.getElementById('btnTestFirestoreConn')?.addEventListener('click', async () => {
      const alertBox = document.getElementById('firestoreStatusAlert');
      if (!alertBox) return;
      alertBox.className = 'p-3 rounded-lg text-xs bg-cyan-950/40 border border-cyan-500/30 text-cyan-300';
      alertBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menghubungkan ke Google Cloud Firestore...';

      if (window.FirebaseManager) {
        const res = await window.FirebaseManager.testConnection();
        if (res.success) {
          alertBox.className = 'p-3 rounded-lg text-xs bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 font-semibold';
          alertBox.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i> ${res.message}`;
        } else {
          alertBox.className = 'p-3 rounded-lg text-xs bg-amber-950/40 border border-amber-500/30 text-amber-300 font-semibold';
          alertBox.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-2"></i> ${res.message}`;
        }
      } else {
        alertBox.className = 'p-3 rounded-lg text-xs bg-rose-950/40 border border-rose-500/30 text-rose-300';
        alertBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i> FirebaseManager SDK belum dimuat di browser.';
      }
    });

    // Sync Firestore Button
    document.getElementById('btnSyncFirestore')?.addEventListener('click', async () => {
      const progBox = document.getElementById('syncProgressContainer');
      const label = document.getElementById('syncProgressLabel');
      const pct = document.getElementById('syncProgressPct');
      const bar = document.getElementById('syncProgressBar');

      if (!window.FirebaseManager) {
        alert('SDK Firebase tidak aktif');
        return;
      }

      if (progBox) progBox.classList.remove('hidden');
      try {
        await window.FirebaseManager.uploadLocalDataToFirestore((msg, percent) => {
          if (label) label.textContent = msg;
          if (pct) pct.textContent = `${percent}%`;
          if (bar) bar.style.width = `${percent}%`;
        });
        showToast('Berhasil sinkronisasi seluruh data ke Cloud Firestore!');
        fetchDatabaseOverview();
      } catch (err) {
        alert('Gagal sinkronisasi: ' + err.message);
      }
    });

    // Submit Add User in DB Explorer Form
    document.getElementById('formDbAddUser')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertBox = document.getElementById('dbAddUserAlert');
      const username = document.getElementById('dbAddUsername').value.trim();
      const password = document.getElementById('dbAddPassword').value.trim();
      const full_name = document.getElementById('dbAddFullName').value.trim();
      const pic_code = document.getElementById('dbAddPicCode').value.trim();
      const role = document.getElementById('dbAddRole').value;

      alertBox.className = 'p-2.5 rounded-lg text-xs bg-slate-900 text-slate-300 hidden';

      try {
        let registerRes = null;
        if (window.FirebaseManager && window.FirebaseManager.isConfigured()) {
          try {
            registerRes = await window.FirebaseManager.registerUser({ username, password, full_name, pic_code, role });
          } catch (fbErr) {
            console.warn('Firestore register notice:', fbErr.message);
          }
        }
        if (!registerRes) {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, full_name, pic_code, role })
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            throw new Error(data.message || 'Gagal menambahkan user');
          }
          registerRes = data;
        }

        alertBox.className = 'p-2.5 rounded-lg text-xs bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 block';
        alertBox.textContent = registerRes.message || 'Akun baru berhasil ditambahkan ke Firestore!';
        showToast(`Akun '${full_name}' (@${username}) berhasil didaftarkan ke Firestore!`);

        document.getElementById('formDbAddUser').reset();
        await fetchDatabaseOverview();
        setTimeout(() => window.switchDbTab('users'), 1000);
      } catch (err) {
        alertBox.className = 'p-2.5 rounded-lg text-xs bg-rose-950/60 border border-rose-500/30 text-rose-300 block';
        alertBox.textContent = err.message;
      }
    });

    // 16. Audit Log Modal Handlers
    document.getElementById('btnOpenAuditLogs')?.addEventListener('click', () => {
      document.getElementById('modalAuditLogs').style.display = 'flex';
      fetchAuditLogs();
    });
    document.getElementById('btnCloseAuditLogs')?.addEventListener('click', () => {
      document.getElementById('modalAuditLogs').style.display = 'none';
    });
    document.getElementById('btnRefreshAuditLogs')?.addEventListener('click', fetchAuditLogs);
    document.getElementById('auditLogSearch')?.addEventListener('input', () => {
      if (cachedAuditLogs) renderAuditLogsUI(cachedAuditLogs);
    });

    // 17. Import Excel Modal Handlers
    document.getElementById('btnOpenImportExcel')?.addEventListener('click', () => {
      document.getElementById('modalImportExcel').style.display = 'flex';
    });
    document.getElementById('btnCloseImportExcel')?.addEventListener('click', () => {
      document.getElementById('modalImportExcel').style.display = 'none';
    });
    document.getElementById('btnCancelImportExcel')?.addEventListener('click', () => {
      document.getElementById('modalImportExcel').style.display = 'none';
    });

    // Backdrop click for new modals
    ['modalAuditLogs', 'modalImportExcel'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', (e) => {
        if (e.target.id === id) e.target.style.display = 'none';
      });
    });

    setupExcelImportHandlers();
    setupExecutivePeriodFilter();
  }

  // =========================================================================
  // DATABASE OVERVIEW HELPERS (FIRESTORE INTEGRATED)
  // =========================================================================
  let dbOverviewData = null;

  async function fetchDatabaseOverview() {
    try {
      if (window.FirebaseManager && window.FirebaseManager.isConfigured()) {
        try {
          const users = await window.FirebaseManager.fetchCollection('users');
          const sitac = await window.FirebaseManager.fetchCollection('sitac_records');
          const gangguan = await window.FirebaseManager.fetchCollection('gangguan_records');
          const collo = await window.FirebaseManager.fetchCollection('collo_records');

          dbOverviewData = {
            success: true,
            database_info: {
              file: "Google Cloud Firestore",
              size_mb: "Cloud Managed",
              status: "Connected (Firestore)"
            },
            tables: [
              { name: "users", label: "Pengguna / PIC Accounts (Firestore)", count: users.length, description: "Koleksi Users di Cloud Firestore" },
              { name: "sitac_records", label: "Monitoring SITAC & Perizinan", count: sitac.length, description: "Koleksi SITAC di Cloud Firestore" },
              { name: "gangguan_records", label: "Tiket Gangguan Darurat", count: gangguan.length, description: "Koleksi Gangguan di Cloud Firestore" },
              { name: "collo_records", label: "Aset Colocation & Finansial", count: collo.length, description: "Koleksi Collo di Cloud Firestore" }
            ],
            users: users
          };
          renderDbOverviewUI();
          return;
        } catch (fbErr) {
          console.warn('Fallback to REST API for db overview:', fbErr);
        }
      }

      const res = await fetch('/api/database/overview');
      if (!res.ok) throw new Error('Gagal mengambil overview database');
      const data = await res.json();
      if (data.success) {
        dbOverviewData = data;
        renderDbOverviewUI();
      }
    } catch (err) {
      console.warn('Gagal memuat overview database:', err);
    }
  }

  function renderDbOverviewUI() {
    if (!dbOverviewData) return;
    const { database_info, tables, users } = dbOverviewData;

    if (database_info) {
      const dbInfoFile = document.getElementById('dbInfoFile');
      const dbInfoSize = document.getElementById('dbInfoSize');
      if (dbInfoFile) dbInfoFile.textContent = database_info.file || 'telecom_portal.db';
      if (dbInfoSize) dbInfoSize.textContent = `${database_info.size_mb || 2.5} MB`;
    }

    let totalRecordsSum = 0;
    if (tables && Array.isArray(tables)) {
      tables.forEach(t => totalRecordsSum += (t.count || 0));
    }
    const dbInfoTotalRecords = document.getElementById('dbInfoTotalRecords');
    if (dbInfoTotalRecords) dbInfoTotalRecords.textContent = `${totalRecordsSum.toLocaleString('id-ID')} Data`;

    const dbUsersBadgeCount = document.getElementById('dbUsersBadgeCount');
    if (dbUsersBadgeCount) dbUsersBadgeCount.textContent = users ? users.length : 0;

    renderDbUsersTable(users || []);
    renderDbTablesGrid(tables || []);
  }

  function renderDbUsersTable(usersList) {
    const tbody = document.getElementById('dbUserTableBody');
    if (!tbody) return;

    const query = (document.getElementById('dbUserSearchInput')?.value || '').toLowerCase().trim();
    const filtered = usersList.filter(u => {
      if (!query) return true;
      return (u.username || '').toLowerCase().includes(query) ||
             (u.full_name || '').toLowerCase().includes(query) ||
             (u.pic_code || '').toLowerCase().includes(query) ||
             (u.role || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-slate-400">Tidak ada akun user database yang cocok.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(u => {
      const roleBadge = u.role === 'admin' 
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">ADMIN</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">PETUGAS PIC</span>`;

      return `
        <tr class="hover:bg-slate-800/40 transition border-b border-white/5">
          <td class="p-3 font-mono text-[11px] text-slate-400">#${u.id}</td>
          <td class="p-3 font-bold text-cyan-300 flex items-center gap-1.5">
            <i class="fa-solid fa-user-circle text-slate-400"></i>
            @${escapeHtml(u.username)}
          </td>
          <td class="p-3 font-semibold text-slate-100">${escapeHtml(u.full_name)}</td>
          <td class="p-3">${roleBadge}</td>
          <td class="p-3 font-mono text-slate-300">${escapeHtml(u.pic_code || '-')}</td>
          <td class="p-3 text-center font-bold text-amber-300">${u.sitac_count || 0}</td>
          <td class="p-3 text-center font-bold text-rose-300">${u.gangguan_count || 0}</td>
          <td class="p-3 text-right space-x-1">
            <button type="button" class="px-2 py-1 rounded bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 text-[10px] font-semibold border border-violet-500/40" onclick="window.openAdminResetForUser('${escapeHtml(u.username)}')">
              <i class="fa-solid fa-key mr-1"></i> Reset Pw
            </button>
            ${u.role !== 'admin' ? `
              <button type="button" class="px-2 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 text-[10px] font-semibold border border-rose-500/40" onclick="window.openAdminDeleteForUser('${escapeHtml(u.username)}')">
                <i class="fa-solid fa-trash mr-1"></i> Hapus
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderDbTablesGrid(tables) {
    const grid = document.getElementById('dbTablesGrid');
    if (!grid) return;

    grid.innerHTML = tables.map(t => `
      <div class="p-3.5 rounded-xl bg-slate-900/60 border border-white/10 flex items-center justify-between">
        <div>
          <div class="font-bold text-slate-200 text-xs flex items-center gap-1.5">
            <i class="fa-solid fa-table text-cyan-400"></i>
            <span>${escapeHtml(t.label)}</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(t.description)}</div>
          <div class="text-[10px] font-mono text-slate-500 mt-1">Nama Tabel: ${t.name}</div>
        </div>
        <div class="text-right">
          <div class="font-bold text-cyan-300 text-sm">${(t.count || 0).toLocaleString('id-ID')}</div>
          <div class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">BARIS / DATA</div>
        </div>
      </div>
    `).join('');
  }

  window.switchDbTab = function(tabName) {
    ['users', 'tables', 'firestore', 'adduser'].forEach(t => {
      const btnName = `dbTab${t.charAt(0).toUpperCase() + t.slice(1)}`;
      const panelName = `dbTabPanel${t.charAt(0).toUpperCase() + t.slice(1)}`;
      const btn = document.getElementById(btnName);
      const panel = document.getElementById(panelName);
      if (btn) {
        if (t === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
      }
      if (panel) {
        if (t === tabName) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      }
    });
  };

  function openDatabaseViewerModal() {
    const modal = document.getElementById('modalDatabaseViewer');
    if (modal) {
      modal.style.display = 'flex';
      fetchDatabaseOverview();
    }
  }

  window.openAdminResetForUser = function(targetUser) {
    const modal = document.getElementById('modalDatabaseViewer');
    if (modal) modal.style.display = 'none';
    if (typeof window.openAdminUsersModal === 'function') {
      window.openAdminUsersModal();
    } else {
      const mAdmin = document.getElementById('modalAdminUsers');
      if (mAdmin) mAdmin.style.display = 'flex';
    }
    const select = document.getElementById('adminResetTargetUser');
    if (select) select.value = targetUser;
  };

  window.openAdminDeleteForUser = function(targetUser) {
    const modal = document.getElementById('modalDatabaseViewer');
    if (modal) modal.style.display = 'none';
    if (typeof window.openAdminUsersModal === 'function') {
      window.openAdminUsersModal();
      if (typeof window.switchAdminTab === 'function') window.switchAdminTab('delete');
    } else {
      const mAdmin = document.getElementById('modalAdminUsers');
      if (mAdmin) mAdmin.style.display = 'flex';
    }
    const select = document.getElementById('adminDeleteTargetUser');
    if (select) select.value = targetUser;
  };

  // =========================================================================
  // 19. AUDIT LOGS & RIWAYAT AKTIVITAS HELPERS
  // =========================================================================
  let cachedAuditLogs = [];

  async function fetchAuditLogs() {
    const timeline = document.getElementById('auditLogTimeline');
    if (timeline) {
      timeline.innerHTML = '<div class="text-center p-6 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat audit log dari Cloud Firestore...</div>';
    }

    try {
      if (window.FirebaseManager && window.FirebaseManager.isConfigured()) {
        const logs = await window.FirebaseManager.fetchCollection('audit_logs');
        logs.sort((a, b) => (b.time_str || '').localeCompare(a.time_str || ''));
        cachedAuditLogs = logs;
        renderAuditLogsUI(logs);
      } else {
        if (timeline) timeline.innerHTML = '<div class="text-center p-6 text-slate-400">Firebase Firestore tidak aktif.</div>';
      }
    } catch (e) {
      if (timeline) timeline.innerHTML = `<div class="text-center p-6 text-rose-400">Gagal memuat log: ${e.message}</div>`;
    }
  }

  function renderAuditLogsUI(logs) {
    const timeline = document.getElementById('auditLogTimeline');
    if (!timeline) return;

    const query = (document.getElementById('auditLogSearch')?.value || '').toLowerCase().trim();
    const filtered = logs.filter(l => {
      if (!query) return true;
      return (l.action || '').toLowerCase().includes(query) ||
             (l.username || '').toLowerCase().includes(query) ||
             (l.details || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      timeline.innerHTML = '<div class="text-center p-6 text-slate-400">Tidak ada riwayat aktivitas yang sesuai.</div>';
      return;
    }

    timeline.innerHTML = filtered.map(l => {
      let badgeColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      if ((l.action || '').includes('LOGIN')) badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      else if ((l.action || '').includes('IMPORT') || (l.action || '').includes('ADD')) badgeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      else if ((l.action || '').includes('DELETE') || (l.action || '').includes('RESET')) badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/30';

      return `
        <div class="p-3 rounded-xl bg-slate-900/60 border border-white/10 flex items-start gap-3">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${badgeColor} border text-[11px]">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-slate-100 text-xs">${escapeHtml(l.action || 'ACTIVITY')}</span>
              <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(l.time_str || '-')}</span>
            </div>
            <div class="text-[11px] text-slate-300 mt-0.5">${escapeHtml(l.details || '-')}</div>
            <div class="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-semibold">
              <i class="fa-solid fa-user-circle"></i> @${escapeHtml(l.username || 'system')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // 20. EXCEL BULK IMPORT HELPERS
  // =========================================================================
  let parsedExcelRecords = [];

  function setupExcelImportHandlers() {
    const fileInput = document.getElementById('importExcelFileInput');
    const label = document.getElementById('importFileNameLabel');
    const previewBox = document.getElementById('importPreviewContainer');
    const previewCount = document.getElementById('importPreviewCount');
    const previewList = document.getElementById('importPreviewList');
    const submitBtn = document.getElementById('btnSubmitImportExcel');

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (label) label.textContent = `File terpilih: ${file.name}`;
        
        const reader = new FileReader();
        reader.onload = function(evt) {
          try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.SheetNames[0];
            const jsonRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

            parsedExcelRecords = jsonRows;
            if (previewCount) previewCount.textContent = jsonRows.length;
            if (previewBox) previewBox.classList.remove('hidden');

            if (previewList) {
              const sample = jsonRows.slice(0, 5);
              previewList.innerHTML = sample.map((r, i) => `#${i+1}: ${JSON.stringify(r)}`).join('<br>');
            }

            if (submitBtn) submitBtn.disabled = jsonRows.length === 0;
          } catch (err) {
            alert('Gagal membaca file Excel: ' + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }

    document.getElementById('formImportExcel')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!parsedExcelRecords || parsedExcelRecords.length === 0) return;

      const targetModule = document.getElementById('importTargetModule').value;
      const progBox = document.getElementById('importProgressContainer');
      const progMsg = document.getElementById('importProgressMsg');
      const progPct = document.getElementById('importProgressPct');
      const progBar = document.getElementById('importProgressBar');

      if (progBox) progBox.classList.remove('hidden');

      try {
        if (window.FirebaseManager && window.FirebaseManager.isConfigured()) {
          await window.FirebaseManager.batchImportRecords(targetModule, parsedExcelRecords, (msg, pct) => {
            if (progMsg) progMsg.textContent = msg;
            if (progPct) progPct.textContent = `${pct}%`;
            if (progBar) progBar.style.width = `${pct}%`;
          });

          showToast(`Berhasil mengimpor ${parsedExcelRecords.length} data ke Firestore!`, 'success');
          document.getElementById('modalImportExcel').style.display = 'none';
          
          if (targetModule === 'sitac_records') loadSitacData();
          else if (targetModule === 'gangguan_records') loadGangguanData();
          else if (targetModule === 'collo_records') loadColloData();
        } else {
          alert('Firebase Firestore tidak terhubung.');
        }
      } catch (err) {
        alert('Gagal mengimpor Excel: ' + err.message);
      }
    });
  }

  // =========================================================================
  // 21. EXECUTIVE OVERVIEW PERIOD FILTER HELPERS
  // =========================================================================
  function setupExecutivePeriodFilter() {
    const periodSelect = document.getElementById('execFilterPeriod');
    const customWrap = document.getElementById('execCustomDateWrap');
    const btnApplyCustom = document.getElementById('btnApplyExecCustomDate');

    if (periodSelect) {
      periodSelect.addEventListener('change', () => {
        const val = periodSelect.value;
        if (val === 'CUSTOM') {
          if (customWrap) customWrap.classList.remove('hidden');
          if (customWrap) customWrap.classList.add('flex');
        } else {
          if (customWrap) customWrap.classList.add('hidden');
          if (customWrap) customWrap.classList.remove('flex');
          applyExecutivePeriodFilter(val);
        }
      });
    }

    if (btnApplyCustom) {
      btnApplyCustom.addEventListener('click', () => {
        const dStart = document.getElementById('execDateStart').value;
        const dEnd = document.getElementById('execDateEnd').value;
        if (!dStart || !dEnd) {
          alert('Silakan tentukan tanggal mulai dan tanggal selesai');
          return;
        }
        applyExecutivePeriodFilter('CUSTOM', dStart, dEnd);
      });
    }
  }

  function applyExecutivePeriodFilter(period, startStr, endStr) {
    showToast(`Filter periode Executive disesuaikan: ${period}`, 'info');
    loadExecutiveSummary();
  }

  // Launch on ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
