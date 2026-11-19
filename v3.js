const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSBUPaF4x5uLIQFlcBPrWmC5G8ZVe1WwBlU0xRT70OrpjeoA5c0QuZCdUfYR8yrDOETb-wiqrqSg2fy/pub?gid=831792460&single=true&output=csv';
const DB_CACHE_KEY = 'stowageGoogleSheetCache';

let databaseRows = [];
let selectedDatabaseRow = null;
let activeBay = 'AH';
let isProgrammaticScroll = false;
let programmaticScrollTimer = null;

const BAY_IDS = ['AH', 1, 3, 5, 7, 9, 11, 13];
const ALLOWED_SLOTS = [2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const BAY_SLOTS = { AH: [4, 3], 13: [5, 6, 7, 8] };

const CELL_LAYOUT = {
    2: { row: 2, tier: 84 },
    3: { row: 1, tier: 84 },
    5: { row: 4, tier: 82 },
    6: { row: 2, tier: 82 },
    7: { row: 1, tier: 82 },
    8: { row: 3, tier: 82 },
    9: { row: 4, tier: 4 },
    10: { row: 2, tier: 4 },
    11: { row: 1, tier: 4 },
    12: { row: 3, tier: 4 },
    13: { row: 4, tier: 2 },
    14: { row: 2, tier: 2 },
    15: { row: 1, tier: 2 },
    16: { row: 3, tier: 2 }
};

let records = JSON.parse(localStorage.getItem('stowageRecords') || '[]');
const $ = (id) => document.getElementById(id);

const SIDEBAR_HIDDEN_KEY = 'stowageDesktopSidebarHidden';

function setDesktopSidebarState(isHidden) {
    const sidebar = $('appSidebar');
    const icon = $('fabSidebarIcon');
    const fab = $('desktopSidebarFab');
    if (!sidebar || !icon || !fab) return;

    if (isHidden) {
        sidebar.classList.add('lg:hidden');
        icon.classList.add('rotate-180');
        fab.title = 'Tampilkan Sidebar';
    } else {
        sidebar.classList.remove('lg:hidden');
        icon.classList.remove('rotate-180');
        fab.title = 'Sembunyikan Sidebar';
    }
    localStorage.setItem(SIDEBAR_HIDDEN_KEY, isHidden ? '1' : '0');
}

function toggleDesktopSidebar() {
    const isCurrentlyHidden = $('appSidebar').classList.contains('lg:hidden');
    setDesktopSidebarState(!isCurrentlyHidden);
}

// Inisialisasi state sidebar saat halaman dimuat
setDesktopSidebarState(localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1');

// Event Listener FAB
$('desktopSidebarFab')?.addEventListener('click', toggleDesktopSidebar);

function printStowage() {
    window.print();
}

function updateHeaderMeta() {
    const ship = ($('shipName')?.value || 'KM LOTUS PACIFIC').trim();
    const voy = ($('voyage')?.value || '').trim();
    const label = voy ? `${ship} · ${voy}` : ship;

    if ($('printSubtitle')) $('printSubtitle').textContent = label;
    if ($('mobileShipSub')) $('mobileShipSub').textContent = label;
}

function save() {
    localStorage.setItem('stowageRecords', JSON.stringify(records));
    localStorage.setItem('stowageShip', $('shipName').value);
    localStorage.setItem('stowageVoyage', $('voyage').value);
    updateHeaderMeta();
    updateSummary();
}

$('shipName').value = localStorage.getItem('stowageShip') || 'KM LOTUS PACIFIC';
$('voyage').value = localStorage.getItem('stowageVoyage') || '';
updateHeaderMeta();

function bayLabel(b) {
    return b === 'AH' ? 'AFTER HATCH' : `BAY ${String(b).padStart(2, '0')}`;
}

function getCellNo(bay, slot) {
    if (bay === 'AH') {
        return slot === 4 ? 'AH482' : slot === 3 ? 'AH382' : 'AH' + String(slot);
    }
    const p = CELL_LAYOUT[slot];
    return p ? String(bay) + String(p.row) + String(p.tier) : '—';
}

function slotsForBay(bay) {
    return BAY_SLOTS[bay] || ALLOWED_SLOTS;
}

// Validasi apakah posisi bay & slot boleh memuat 40 FT
// - After Hatch (AH): tidak bisa 40 FT
// - Bay 11: hanya Tier 82 (slot 5, 6, 7, 8) yang bisa 40 FT
// - Bay 13: ujung kapal, tidak ada bay setelahnya untuk pasangan 40 FT
function canLoad40Ft(bay, slot) {
    if (bay === 'AH') return false;
    const numBay = Number(bay);
    const numSlot = Number(slot);
    if (numBay === 13) return false;
    if (numBay === 11) {
        return [5, 6, 7, 8].includes(numSlot);
    }
    return Boolean(getBlockedTarget(bay, numSlot));
}

// 40 FT Bay Pairing Helpers (berlaku ke semua bay berurutan, kecuali AH -> Bay 1)
function getNextBayFor40Ft(bay) {
    if (bay === 'AH') return null;
    const idx = BAY_IDS.findIndex((x) => String(x) === String(bay));
    if (idx === -1 || idx + 1 >= BAY_IDS.length) return null;
    return BAY_IDS[idx + 1];
}

function getPrevBayFor40Ft(bay) {
    if (bay === 'AH' || Number(bay) === 1) return null;
    const idx = BAY_IDS.findIndex((x) => String(x) === String(bay));
    if (idx <= 0) return null;
    const prev = BAY_IDS[idx - 1];
    return prev === 'AH' ? null : prev;
}

function getBlockedTarget(bay, slot) {
    const nextBay = getNextBayFor40Ft(bay);
    if (!nextBay) return null;
    if (!slotsForBay(nextBay).includes(Number(slot))) return null;
    return { bay: nextBay, slot: Number(slot) };
}

function getBlockingRecord(bay, slot) {
    const prevBay = getPrevBayFor40Ft(bay);
    if (!prevBay) return null;
    if (!slotsForBay(bay).includes(Number(slot))) return null;
    return (
        records.find(
            (x) =>
                String(x.bay) === String(prevBay) &&
                Number(x.slot) === Number(slot) &&
                x.size === '40 FT'
        ) || null
    );
}

function normalizePort(v) {
    const s = String(v || '').trim().toUpperCase();
    if (s === 'SUB' || s.includes('SURABAYA')) return 'SUB';
    if (s === 'WGP' || s.includes('WAINGAPU')) return 'WGP';
    return s;
}

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

function parseCSV(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        const next = clean[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field.trim());
            field = '';
        } else if (ch === '\r' && next === '\n') {
            row.push(field.trim());
            rows.push(row);
            row = [];
            field = '';
            i++;
        } else if (ch === '\n' || ch === '\r') {
            row.push(field.trim());
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field.trim());
        rows.push(row);
    }

    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    return rows.slice(1).map((cols) => {
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = cols[idx] ?? '';
        });
        return obj;
    });
}

function getSearchMatches(rawQuery) {
    const q = String(rawQuery || '').trim().toLowerCase();
    if (!q) return [];
    const matches = [];
    BAY_IDS.forEach((b) => {
        const slots = slotsForBay(b);
        slots.forEach((s) => {
            const r = records.find((x) => String(x.bay) === String(b) && Number(x.slot) === Number(s));
            if (r && String(r.number || '').toLowerCase().includes(q)) {
                const blockedTarget = r.size === '40 FT' ? getBlockedTarget(r.bay, r.slot) : null;
                matches.push({
                    ...r,
                    blockedTarget
                });
            }
        });
    });
    return matches;
}

function slotCardHTML(b, s, isDashed = false) {
    const r = records.find((x) => String(x.bay) === String(b) && Number(x.slot) === Number(s));
    const blocker = !r ? getBlockingRecord(b, s) : null;
    const searchVal = ($('search')?.value || '').trim().toLowerCase();

    const hasRecord = Boolean(r);
    const isBlocked = Boolean(blocker);
    const activeContainer = r || blocker;

    const isSearchMatch =
        Boolean(activeContainer) &&
        searchVal !== '' &&
        String(activeContainer.number || '').toLowerCase().includes(searchVal);
    const isSearchDimmed =
        Boolean(activeContainer) && searchVal !== '' && !isSearchMatch;

    const is40 = hasRecord && r.size === '40 FT';

    const cardSurface = isSearchMatch
        ? 'border-emerald-600 bg-emerald-50 ring-4 ring-emerald-400/70 shadow-lg scale-[1.01]'
        : hasRecord
            ? is40
                ? 'border-amber-400 bg-amber-50/90 hover:border-amber-500'
                : 'border-sky-400 bg-sky-50/90 hover:border-sky-500'
            : isBlocked
                ? 'border-dashed border-amber-400 bg-amber-50/45 hover:border-amber-500'
                : isDashed
                    ? 'border-2 border-dashed border-slate-400 bg-white hover:border-sky-500 hover:bg-sky-50/30'
                    : 'border-slate-300 bg-white hover:border-sky-500 hover:bg-sky-50/30';

    const cursorClass = isBlocked ? 'cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md';
    const dimClass = isSearchDimmed ? 'opacity-30 print:opacity-100' : '';

    const headerBg = isSearchMatch
        ? 'border-emerald-300 bg-emerald-200/80 text-emerald-950'
        : hasRecord
            ? is40
                ? 'border-amber-200 bg-amber-100/80 text-amber-950'
                : 'border-sky-200 bg-sky-100/80 text-sky-950'
            : isBlocked
                ? 'border-amber-200/80 bg-amber-100/60 text-amber-900'
                : 'border-slate-200 bg-slate-100/80 text-slate-700';

    const sizeBadge = isSearchMatch
        ? 'bg-emerald-200 text-emerald-950'
        : hasRecord
            ? is40
                ? 'bg-amber-200 text-amber-950'
                : 'bg-sky-200 text-sky-950'
            : isBlocked
                ? 'bg-amber-200/80 text-amber-950'
                : 'bg-transparent text-transparent';

    const blockerCellNo = isBlocked ? esc(getCellNo(blocker.bay, blocker.slot)) : '';
    const weightLabel = hasRecord && r.weight !== ''
        ? `${esc(r.weight)} T`
        : isBlocked
            ? `DARI ${blockerCellNo}`
            : 'KOSONG';

    const loadPort = activeContainer ? esc(normalizePort(activeContainer.loadingPort) || '—') : '';
    const discPort = activeContainer ? esc(normalizePort(activeContainer.port) || '—') : '';

    return `
    <div id="cell-${esc(b)}-${s}" data-bay="${esc(b)}" data-slot="${s}"
      class="slot-card group flex h-full min-h-[100px] min-w-[128px] flex-col justify-between overflow-hidden rounded-xl border transition duration-150 print:min-h-[68px] print:min-w-0 print:rounded-md print:border-slate-800 print:shadow-none ${cursorClass} ${cardSurface} ${dimClass}">
      <!-- Top Cell & Weight Strip -->
      <div class="flex items-center justify-between gap-1.5 border-b px-2.5 py-1 text-[11px] font-bold print:border-slate-800 print:px-1 print:py-0.5 print:text-[7.5px] ${headerBg}">
        <span class="shrink-0 whitespace-nowrap tracking-tight">${esc(getCellNo(b, s))}</span>
        <span class="shrink-0 whitespace-nowrap ${hasRecord || isBlocked ? '' : 'text-slate-400 print:hidden'}">${weightLabel}</span>
      </div>

      <!-- Center Container Number -->
      <div class="flex flex-1 flex-col items-center justify-center px-2 py-1.5 text-center print:px-0.5 print:py-1">
        ${hasRecord
            ? `<span class="whitespace-nowrap font-mono text-sm font-black tracking-tight text-slate-900 print:break-all print:whitespace-normal print:text-[8.5px] print:leading-tight">${esc(r.number)}</span>`
            : isBlocked
                ? `<span class="whitespace-nowrap font-mono text-xs font-extrabold tracking-tight text-amber-900/90 print:break-all print:whitespace-normal print:text-[8px] print:leading-tight">${esc(blocker.number)}</span>
           <span class="mt-0.5 whitespace-nowrap rounded bg-amber-200/70 px-1.5 py-0.2 text-[9px] font-extrabold tracking-wider text-amber-950 uppercase print:bg-transparent print:p-0 print:text-[6.5px]">TERBLOKIR</span>`
                : `<span class="whitespace-nowrap text-xs font-semibold text-slate-400 group-hover:text-sky-600 print:hidden">+ Isi</span>`
        }
      </div>

      <!-- Bottom Route & Size Strip -->
      <div class="flex min-h-[26px] items-center justify-between gap-1.5 border-t border-slate-200/80 bg-white/70 px-2.5 py-1 text-[10px] font-bold print:min-h-[16px] print:border-slate-800 print:px-1 print:py-0.5 print:text-[7px]">
        ${hasRecord
            ? `<span class="shrink-0 whitespace-nowrap text-slate-700">${loadPort}&rarr;${discPort}</span>
               <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-extrabold print:px-1 print:py-0 print:text-[6.5px] ${sizeBadge}">
                 ${esc(r.size || '20 FT')}
               </span>`
            : isBlocked
                ? `<span class="shrink-0 whitespace-nowrap text-amber-800/80">${loadPort}&rarr;${discPort}</span>
                 <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-extrabold print:px-1 print:py-0 print:text-[6.5px] ${sizeBadge}">
                   40 FT
                 </span>`
                : `<span class="select-none text-transparent">&nbsp;</span>`
        }
      </div>
    </div>
  `;
}

function vmovCardHTML(title, rows, ttlWeight) {
    const breakdownHTML = rows
        .map(
            (item) => `
      <div class="flex items-center justify-between gap-2 border-b border-slate-100 py-1 text-xs last:border-b-0 print:py-0.5 print:text-[7.5px] print:leading-tight">
        <span class="whitespace-nowrap font-medium text-slate-500 print:text-slate-700">${item.label}</span>
        <span class="whitespace-nowrap font-bold text-slate-800">${item.weight.toFixed(2)} T</span>
      </div>
    `
        )
        .join('');

    return `
    <div class="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm print:rounded-lg print:border-slate-800 print:bg-white print:p-1.5 print:shadow-none">
      <div>
        <div class="flex items-center justify-between gap-1.5 border-b border-slate-200 pb-1.5 print:border-slate-400 print:pb-1">
          <span class="whitespace-nowrap text-[11px] font-extrabold tracking-wider text-slate-900 uppercase print:text-[7px] print:leading-tight print:tracking-normal">${title}</span>
          <span class="shrink-0 whitespace-nowrap rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 print:hidden">V.MOV</span>
        </div>
        <div class="mt-1 print:mt-0.5">
          ${breakdownHTML}
        </div>
      </div>

      <div class="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-sky-600 px-3 py-1.5 text-white print:mt-1 print:rounded print:border print:border-slate-800 print:bg-slate-100 print:px-1.5 print:py-0.5 print:text-slate-900">
        <span class="whitespace-nowrap text-[10px] font-bold tracking-wider uppercase print:text-[6.5px] print:tracking-normal">TTL</span>
        <span class="whitespace-nowrap text-xs font-extrabold sm:text-sm print:text-[8px]">${ttlWeight.toFixed(2)} TON</span>
      </div>
    </div>
  `;
}

function renderBayCard(b) {
    const list = records.filter((r) => String(r.bay) === String(b));
    const total = list.reduce((a, r) => a + Number(r.weight || 0), 0);
    const count20 = list.filter((r) => r.size === '20 FT').length;
    const count40 = list.filter((r) => r.size === '40 FT').length;
    const title = bayLabel(b);

    const panelWidthClass =
        b === 'AH'
            ? 'w-[600px] shrink-0 print:w-full print:shrink'
            : 'w-[860px] shrink-0 print:w-full print:shrink';

    let contentHTML = '';

    if (b === 'AH') {
        contentHTML = `
      <div class="grid flex-1 grid-cols-[minmax(0,1fr)_196px] gap-3 p-3 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5 print:p-2">
        <div class="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50/60 p-3 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
          <div class="mx-auto grid w-full max-w-[340px] grid-cols-2 gap-3 print:max-w-none print:gap-2">
            ${[4, 3].map((s) => slotCardHTML('AH', s, true)).join('')}
          </div>
        </div>

        <aside class="flex flex-col justify-center h-[12rem]">
          ${vmovCardHTML('AFTER HATCH', [{ label: 'Tier 82', weight: total }], total)}
        </aside>
      </div>
    `;
    } else if (Number(b) === 13) {
        const v82 = list
            .filter((r) => [5, 6, 7, 8].includes(Number(r.slot)))
            .reduce((a, r) => a + Number(r.weight || 0), 0);

        contentHTML = `
      <div class="grid flex-1 border grid-cols-[minmax(0,1fr)_196px] gap-3 p-3 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5 print:p-2">
        <div class="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50/60 p-2.5 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
          <div class="grid grid-cols-4 gap-2 print:gap-1">
            ${[5, 6, 7, 8].map((s) => slotCardHTML(13, s, false)).join('')}
          </div>
        </div>

        <aside class="flex flex-col justify-center h-[12rem]">
          ${vmovCardHTML('BAY 13 ON DECK', [{ label: 'Tier 82', weight: v82 }], v82)}
        </aside>
      </div>
    `;
    } else {
        const deck84 = list
            .filter((r) => [2, 3].includes(Number(r.slot)))
            .reduce((a, r) => a + Number(r.weight || 0), 0);
        const deck82 = list
            .filter((r) => [5, 6, 7, 8].includes(Number(r.slot)))
            .reduce((a, r) => a + Number(r.weight || 0), 0);
        const hole04 = list
            .filter((r) => [9, 10, 11, 12].includes(Number(r.slot)))
            .reduce((a, r) => a + Number(r.weight || 0), 0);
        const hole02 = list
            .filter((r) => [13, 14, 15, 16].includes(Number(r.slot)))
            .reduce((a, r) => a + Number(r.weight || 0), 0);

        contentHTML = `
      <div class="flex flex-1 flex-col gap-4 p-2.5 print:space-y-1.5 print:p-2">
        <!-- ON DECK ZONE -->
        <div class="grid flex-1 grid-cols-[minmax(0,1fr)_196px] gap-2.5 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5">
          <section class="flex flex-col p-2 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
            <div class="grid flex-1 grid-rows-2 gap-2 print:gap-1">
              <!-- Tier 84 (2 center slots) -->
              <div class="grid h-full grid-cols-4 gap-2 print:gap-1">
                <div></div>
                ${slotCardHTML(b, 2, true)}
                ${slotCardHTML(b, 3, true)}
                <div></div>
              </div>
              <!-- Tier 82 (4 full slots) -->
              <div class="grid h-full grid-cols-4 gap-2 print:gap-1">
                ${[5, 6, 7, 8].map((s) => slotCardHTML(b, s, false)).join('')}
              </div>
            </div>
          </section>

          <aside class="flex flex-col justify-center h-[12rem]">
            ${vmovCardHTML(
            `BAY ${String(b).padStart(2, '0')} ON DECK`,
            [
                { label: 'Tier 84', weight: deck84 },
                { label: 'Tier 82', weight: deck82 }
            ],
            deck84 + deck82
        )}
          </aside>
        </div>

        <!-- HATCH COVER DIVIDER -->
        <div class="relative flex shrink-0 items-center justify-center py-0.5 print:py-0">
          <div class="h-1.5 w-full rounded-full bg-slate-800 print:h-0.5 print:bg-slate-900"></div>
          <span class="absolute whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-0.5 text-[9px] font-extrabold tracking-widest text-slate-600 uppercase print:px-2 print:py-0 print:text-[7px]">
            COVER
          </span>
        </div>

        <!-- IN HOLE ZONE -->
        <div class="grid flex-1 grid-cols-[minmax(0,1fr)_196px] gap-2.5 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5">
          <section class="flex flex-col p-2 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
            <div class="grid flex-1 grid-rows-2 gap-2 print:gap-1">
              <!-- Tier 04 -->
              <div class="grid h-full grid-cols-4 gap-2 print:gap-1">
                ${[9, 10, 11, 12].map((s) => slotCardHTML(b, s, false)).join('')}
              </div>
              <!-- Tier 02 -->
              <div class="grid h-full grid-cols-4 gap-2 print:gap-1">
                ${[13, 14, 15, 16].map((s) => slotCardHTML(b, s, false)).join('')}
              </div>
            </div>
          </section>

          <aside class="flex flex-col justify-center h-[12rem]">
            ${vmovCardHTML(
            `BAY ${String(b).padStart(2, '0')} IN HOLE`,
            [
                { label: 'Tier 04', weight: hole04 },
                { label: 'Tier 02', weight: hole02 }
            ],
            hole04 + hole02
        )}
          </aside>
        </div>
      </div>
    `;
    }

    return `
    <article id="panel-${b}" data-bay-panel="${b}"
      class="bay-panel flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md print:break-inside-avoid print:rounded-lg print:border-slate-800 print:shadow-none ${panelWidthClass}">
      <!-- Bay Card Header -->
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-900 px-4 py-2.5 text-white print:bg-slate-100 print:px-2.5 print:py-1.5 print:text-slate-900">
        <div class="flex items-center gap-2.5 print:gap-1.5">
          <h2 class="whitespace-nowrap text-base font-extrabold tracking-wide print:text-xs">${title}</h2>
          <div class="flex items-center gap-1.5 text-[11px] print:gap-1 print:text-[8.5px]">
            <span class="whitespace-nowrap rounded-lg bg-sky-500/20 px-2 py-0.5 font-bold text-sky-300 print:rounded print:border print:border-slate-400 print:bg-transparent print:px-1.5 print:py-0 print:text-slate-800">
              20FT: ${count20}
            </span>
            <span class="whitespace-nowrap rounded-lg bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300 print:rounded print:border print:border-slate-400 print:bg-transparent print:px-1.5 print:py-0 print:text-slate-800">
              40FT: ${count40}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 text-xs font-bold print:gap-1.5 print:text-[8.5px]">
          <span class="whitespace-nowrap text-slate-300 print:text-slate-700">${list.length} / ${slotsForBay(b).length} Unit</span>
          <span class="whitespace-nowrap rounded-xl bg-sky-600 px-3 py-1 text-white print:rounded print:border print:border-slate-800 print:bg-white print:px-1.5 print:py-0.5 print:text-slate-900">
            V.MOV ${total.toFixed(2)} TON
          </span>
        </div>
      </div>

      ${contentHTML}
    </article>
  `;
}

function getNavButtonClasses(b) {
    const searchVal = ($('search')?.value || '').trim().toLowerCase();
    const bayRecords = records.filter((r) => String(r.bay) === String(b));
    const count = bayRecords.length;
    const isActive = String(activeBay) === String(b);

    const slots = slotsForBay(b);
    const hasSearchHit =
        searchVal !== '' &&
        slots.some((s) => {
            const r = records.find((x) => String(x.bay) === String(b) && Number(x.slot) === Number(s));
            const blocker = !r ? getBlockingRecord(b, s) : null;
            const target = r || blocker;
            return target && String(target.number || '').toLowerCase().includes(searchVal);
        });

    const btnClass = isActive
        ? 'border-sky-600 bg-sky-600 text-white shadow-md ring-2 ring-sky-200'
        : hasSearchHit
            ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-300'
            : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-slate-100';

    const badgeClass = isActive
        ? 'bg-sky-800 text-sky-100'
        : hasSearchHit
            ? 'bg-emerald-600 text-white'
            : count > 0
                ? 'bg-sky-100 text-sky-800'
                : 'bg-slate-200 text-slate-600';

    return { btnClass, badgeClass };
}

function renderNavButtons() {
    const navButtons = $('bayNavButtons');

    navButtons.innerHTML = BAY_IDS.map((b) => {
        const bayRecords = records.filter((r) => String(r.bay) === String(b));
        const count = bayRecords.length;
        const maxSlots = slotsForBay(b).length;
        const { btnClass, badgeClass } = getNavButtonClasses(b);

        return `
      <button type="button" data-bay="${b}"
        class="bay-nav-btn flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-extrabold transition ${btnClass}">
        <span>${bayLabel(b)}</span>
        <span data-bay-badge="${b}" class="rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}">${count}/${maxSlots}</span>
      </button>
    `;
    }).join('');
}

function scrollNavPillIntoView(bay) {
    const navContainer = $('bayNavButtons');
    const activeBtn = navContainer?.querySelector(`button[data-bay="${bay}"]`);
    if (!navContainer || !activeBtn) return;

    const btnLeft = activeBtn.offsetLeft;
    const btnRight = btnLeft + activeBtn.offsetWidth;
    const viewLeft = navContainer.scrollLeft;
    const viewRight = viewLeft + navContainer.clientWidth;

    if (btnLeft < viewLeft + 12) {
        navContainer.scrollTo({ left: Math.max(0, btnLeft - 12), behavior: 'smooth' });
    } else if (btnRight > viewRight - 12) {
        navContainer.scrollTo({ left: btnRight - navContainer.clientWidth + 12, behavior: 'smooth' });
    }
}

function syncNavActiveUI(scrollPill = true) {
    const navContainer = $('bayNavButtons');
    if (!navContainer) return;

    BAY_IDS.forEach((b) => {
        const btn = navContainer.querySelector(`button[data-bay="${b}"]`);
        const badge = navContainer.querySelector(`span[data-bay-badge="${b}"]`);
        if (!btn || !badge) return;

        const { btnClass, badgeClass } = getNavButtonClasses(b);
        btn.className = `bay-nav-btn flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-extrabold transition ${btnClass}`;
        badge.className = `rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`;
    });

    if (scrollPill) {
        scrollNavPillIntoView(activeBay);
    }
}

function setProgrammaticScrollLock() {
    isProgrammaticScroll = true;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = setTimeout(() => {
        isProgrammaticScroll = false;
    }, 650);
}

function releaseProgrammaticScrollLock() {
    if (isProgrammaticScroll) {
        isProgrammaticScroll = false;
        if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
    }
}

function detectActiveBayOnScroll() {
    if (isProgrammaticScroll) return;

    const container = $('bays');
    if (!container) return;

    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll <= 0) return;

    let detectedBay = BAY_IDS[0];

    if (container.scrollLeft <= 6) {
        detectedBay = BAY_IDS[0];
    } else if (container.scrollLeft >= maxScroll - 6) {
        detectedBay = BAY_IDS[BAY_IDS.length - 1];
    } else {
        const rect = container.getBoundingClientRect();
        const focalX = rect.left + rect.width * 0.4;
        let bestBay = activeBay;
        let minDistance = Infinity;

        BAY_IDS.forEach((b) => {
            const panel = $('panel-' + b);
            if (!panel) return;
            const pRect = panel.getBoundingClientRect();
            if (focalX >= pRect.left && focalX <= pRect.right) {
                bestBay = b;
                minDistance = 0;
            } else if (minDistance > 0) {
                const panelCenter = (pRect.left + pRect.right) / 2;
                const dist = Math.abs(panelCenter - focalX);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestBay = b;
                }
            }
        });

        detectedBay = bestBay;
    }

    if (String(detectedBay) !== String(activeBay)) {
        activeBay = detectedBay === 'AH' ? 'AH' : Number(detectedBay);
        syncNavActiveUI(true);
    }
}

function render(preserveScroll = false) {
    const baysEl = $('bays');
    const prevScrollLeft = preserveScroll && baysEl ? baysEl.scrollLeft : 0;

    renderNavButtons();
    baysEl.innerHTML = BAY_IDS.map((b) => renderBayCard(b)).join('');

    if (preserveScroll && baysEl) {
        baysEl.scrollLeft = prevScrollLeft;
    }

    updateSummary();
}

function focusContainerCell(bay, slot, closeMobile = false) {
    activeBay = bay === 'AH' ? 'AH' : Number(bay);
    render(true);

    if (closeMobile) {
        closeMobileSidebar();
    }

    scrollNavPillIntoView(activeBay);

    requestAnimationFrame(() => {
        const cellEl = $(`cell-${activeBay}-${slot}`);
        if (cellEl) {
            setProgrammaticScrollLock();
            cellEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    });
}

function handleContainerSearch(autoJump = true) {
    const rawVal = $('search').value || '';
    const query = rawVal.trim();
    const clearBtn = $('clearSearchBtn');
    const resultBox = $('searchResultBox');
    const statusText = $('searchStatusText');
    const matchList = $('searchMatchList');

    clearBtn.classList.toggle('hidden', query === '');

    if (!query) {
        resultBox.classList.add('hidden');
        matchList.innerHTML = '';
        render(true);
        return;
    }

    const matches = getSearchMatches(query);
    resultBox.classList.remove('hidden');

    if (matches.length === 0) {
        resultBox.className = 'space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5';
        statusText.className = 'text-[11px] font-semibold text-amber-900';
        statusText.textContent = 'Kontainer tidak ditemukan di semua Bay.';
        matchList.innerHTML = '';
        render(true);
        return;
    }

    resultBox.className = 'space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-2.5';
    statusText.className = 'text-[11px] font-bold text-emerald-900';
    statusText.textContent = `Ditemukan ${matches.length} kontainer:`;

    matchList.innerHTML = matches
        .map((m) => {
            const primaryLoc = `${bayLabel(m.bay)} · ${getCellNo(m.bay, m.slot)}`;
            const blockedLoc = m.blockedTarget
                ? ` / ${getCellNo(m.blockedTarget.bay, m.blockedTarget.slot)}`
                : '';
            return `
      <button type="button" data-jump-bay="${esc(m.bay)}" data-jump-slot="${m.slot}"
        class="search-jump-btn flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-900 shadow-sm transition hover:bg-emerald-100">
        <span class="truncate font-mono">${esc(m.number)}</span>
        <span class="shrink-0 whitespace-nowrap rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
          ${esc(primaryLoc + blockedLoc)}
        </span>
      </button>
    `;
        })
        .join('');

    if (autoJump) {
        const first = matches[0];
        focusContainerCell(first.bay, first.slot, false);
    } else {
        render(true);
    }
}

function goBay(b) {
    activeBay = b === 'AH' ? 'AH' : Number(b);
    syncNavActiveUI(true);

    const el = $('panel-' + b);
    if (el) {
        setProgrammaticScrollLock();
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }
}

function updateSummary() {
    const totalCount = records.length;
    const count20 = records.filter((r) => r.size === '20 FT').length;
    const count40 = records.filter((r) => r.size === '40 FT').length;
    const totalMov = records.reduce((a, r) => a + Number(r.weight || 0), 0).toFixed(2);

    $('mTotal').textContent = totalCount;
    $('m20').textContent = count20;
    $('m40').textContent = count40;
    $('mMov').textContent = totalMov;

    if ($('printSummaryLine')) {
        $('printSummaryLine').textContent = `Total: ${totalCount} Unit (20FT: ${count20} | 40FT: ${count40}) · Total V.MOV: ${totalMov} TON`;
    }
}

function openSlot(b, s) {
    const bayVal = b === 'AH' ? 'AH' : Number(b);
    const slotVal = Number(s);
    const blocker = getBlockingRecord(bayVal, slotVal);

    if (blocker) {
        alert(
            `Cell ${getCellNo(bayVal, slotVal)} otomatis terblokir karena digunakan oleh kontainer 40 FT (${blocker.number}) di Cell ${getCellNo(blocker.bay, blocker.slot)}.`
        );
        return;
    }

    const r = records.find((x) => String(x.bay) === String(bayVal) && Number(x.slot) === slotVal);

    $('recordId').value = r ? r.id : '';
    $('fBay').value = String(bayVal);
    $('fSlot').value = slotVal;
    $('fNumber').value = r?.number || '';
    $('fFeet').value = r?.size || '20 FT';
    $('fPort').value = normalizePort(r?.port || '');
    $('fLoadingPort').value = normalizePort(r?.loadingPort || '');
    $('fWeight').value = r?.weight ?? '';

    $('modalBadge').textContent = `${bayLabel(bayVal)} · CELL ${getCellNo(bayVal, slotVal)}`;
    $('modalTitle').textContent = r ? 'Edit Data Kontainer' : `Isi Kontainer (${getCellNo(bayVal, slotVal)})`;

    selectedDatabaseRow = null;
    $('deleteBtn').classList.toggle('hidden', !r);

    if (r) {
        showManual();
    } else {
        showDatabase();
    }

    const modal = $('modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = $('modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function loadDatabase(forceRefresh = false) {
    const status = $('dbStatus');
    const select = $('dbSelect');

    if (!GOOGLE_SHEET_CSV_URL || GOOGLE_SHEET_CSV_URL.includes('TEMPEL_TAUTAN_CSV')) {
        status.textContent = 'Tautan CSV Google Sheets belum dikonfigurasi.';
        select.innerHTML = '<option value="">Tautan CSV belum dikonfigurasi</option>';
        return;
    }

    if (!forceRefresh) {
        const cached = sessionStorage.getItem(DB_CACHE_KEY);
        if (cached) {
            databaseRows = JSON.parse(cached);
            filterDatabase();
            status.textContent = `${databaseRows.length} data kontainer siap dipilih.`;
            return;
        }
    }

    status.textContent = 'Mengambil data dari Google Sheets...';
    select.innerHTML = '<option value="">Memuat...</option>';

    try {
        const separator = GOOGLE_SHEET_CSV_URL.includes('?') ? '&' : '?';
        const fetchUrl = forceRefresh ? `${GOOGLE_SHEET_CSV_URL}${separator}t=${Date.now()}` : GOOGLE_SHEET_CSV_URL;

        const response = await fetch(fetchUrl, { method: 'GET' });
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const csvText = await response.text();
        if (csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) {
            throw new Error('Tautan menghasilkan halaman HTML, pastikan format publikasi dipilih sebagai CSV (.csv).');
        }

        const parsedRows = parseCSV(csvText);
        databaseRows = parsedRows
            .map((r, i) => ({
                raw: r,
                index: i,
                number: String(r['nomor container'] ?? '').trim(),
                loadingPort: normalizePort(r['pelabuhan awal']),
                port: normalizePort(r['pelabuhan tujuan']),
                weight: String(r['berat'] ?? '').replace(',', '.').trim(),
                feet: String(r['feet'] ?? '20 FT').trim().toUpperCase()
            }))
            .filter((r) => r.number);

        sessionStorage.setItem(DB_CACHE_KEY, JSON.stringify(databaseRows));
        filterDatabase();
        status.textContent = `${databaseRows.length} data kontainer dimuat.`;
    } catch (err) {
        console.error(err);
        status.textContent = 'Gagal memuat: ' + err.message;
        select.innerHTML = '<option value="">Data tidak dapat dimuat</option>';
    }
}

function setSourceTabUI(mode) {
    const dbBtn = $('showDatabaseBtn');
    const manBtn = $('showManualBtn');
    if (mode === 'db') {
        dbBtn.className = 'rounded-lg bg-white px-3 py-2 text-xs font-bold text-sky-700 shadow-sm transition';
        manBtn.className = 'rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition hover:text-slate-900';
    } else {
        manBtn.className = 'rounded-lg bg-white px-3 py-2 text-xs font-bold text-sky-700 shadow-sm transition';
        dbBtn.className = 'rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition hover:text-slate-900';
    }
}

function showDatabase() {
    setSourceTabUI('db');
    $('manualPanel').classList.add('hidden');
    $('databasePanel').classList.remove('hidden');
    loadDatabase(false);
}

function showManual() {
    setSourceTabUI('man');
    $('databasePanel').classList.add('hidden');
    $('manualPanel').classList.remove('hidden');
    selectedDatabaseRow = null;
}

function filterDatabase() {
    const q = ($('dbSearch').value || '').toLowerCase();
    const filtered = databaseRows.filter((r) =>
        String(r.number || '').toLowerCase().includes(q)
    );
    $('dbSelect').innerHTML = filtered.length
        ? filtered
            .map(
                (r) =>
                    `<option value="${r.index}">${esc(r.number)} · ${esc(r.loadingPort)} → ${esc(r.port)} · ${esc(r.weight)} ton (${esc(r.feet)})</option>`
            )
            .join('')
        : '<option value="">Tidak ada data yang cocok</option>';
}

function selectDatabaseRecord() {
    const index = Number($('dbSelect').value);
    const r = databaseRows.find((x) => x.index === index);
    if (!r) return;

    const bay = $('fBay').value === 'AH' ? 'AH' : Number($('fBay').value);
    const slot = Number($('fSlot').value);
    const is40Ft = r.feet.includes('40');

    if (is40Ft && !canLoad40Ft(bay, slot)) {
        alert('40 ft tidak bisa dimuat disini');
        $('dbSelect').value = '';
        return;
    }

    selectedDatabaseRow = r;
    $('fNumber').value = r.number;
    $('fLoadingPort').value = r.loadingPort;
    $('fPort').value = r.port;
    $('fWeight').value = r.weight;
    $('fFeet').value = is40Ft ? '40 FT' : '20 FT';

    setSourceTabUI('man');
    $('databasePanel').classList.add('hidden');
    $('manualPanel').classList.remove('hidden');
}

function submitContainer(e) {
    if (e && e.preventDefault) e.preventDefault();

    const bay = $('fBay').value === 'AH' ? 'AH' : Number($('fBay').value);
    const slot = Number($('fSlot').value);
    const id = $('recordId').value;
    const loadingPort = $('fLoadingPort').value.trim().toUpperCase();
    const port = $('fPort').value.trim().toUpperCase();
    const number = $('fNumber').value.trim().toUpperCase();
    const weight = $('fWeight').value;
    const size = $('fFeet').value;

    if (
        (bay !== 'AH' && !BAY_IDS.includes(bay)) ||
        !slotsForBay(bay).includes(slot) ||
        (bay !== 'AH' && !CELL_LAYOUT[slot])
    ) {
        alert('Posisi tidak valid. Tutup form lalu pilih posisi yang tersedia.');
        return;
    }

    if (!loadingPort || !port || !number || weight === '' || !Number.isFinite(Number(weight)) || Number(weight) < 0) {
        alert('Lengkapi pelabuhan awal, pelabuhan tujuan, nomor kontainer, dan berat dengan benar.');
        return;
    }

    const selfBlocker = getBlockingRecord(bay, slot);
    if (selfBlocker) {
        alert(
            `Posisi ${getCellNo(bay, slot)} terblokir oleh kontainer 40 FT (${selfBlocker.number}) di ${getCellNo(selfBlocker.bay, selfBlocker.slot)}.`
        );
        return;
    }

    if (records.some((r) => String(r.bay) === String(bay) && Number(r.slot) === slot && r.id !== id)) {
        alert('Posisi ini sudah terisi. Silakan pilih posisi lain.');
        return;
    }

    if (size === '40 FT') {
        if (!canLoad40Ft(bay, slot)) {
            alert('40 ft tidak bisa dimuat disini');
            return;
        }

        const target = getBlockedTarget(bay, slot);
        if (target) {
            const targetRecord = records.find(
                (r) => String(r.bay) === String(target.bay) && Number(r.slot) === Number(target.slot) && r.id !== id
            );
            if (targetRecord) {
                alert(
                    `Tidak dapat menempatkan kontainer 40 FT di Cell ${getCellNo(bay, slot)} karena Cell ${getCellNo(target.bay, target.slot)} sudah terisi (${targetRecord.number}).`
                );
                return;
            }

            const targetBlocker = getBlockingRecord(target.bay, target.slot);
            if (targetBlocker && targetBlocker.id !== id) {
                alert(
                    `Tidak dapat menempatkan kontainer 40 FT di Cell ${getCellNo(bay, slot)} karena Cell ${getCellNo(target.bay, target.slot)} sudah terblokir.`
                );
                return;
            }
        }
    }

    const old = id ? records.find((x) => x.id === id) : null;
    const item = {
        id: id || String(Date.now()) + '-' + Math.random().toString(16).slice(2),
        bay,
        slot,
        cellNo: getCellNo(bay, slot),
        number,
        size,
        port: normalizePort(port),
        loadingPort: normalizePort(loadingPort),
        weight,
        mov: old?.mov ?? 1
    };

    if (old) {
        records = records.map((r) => (r.id === id ? item : r));
    } else {
        records.push(item);
    }

    try {
        save();
        closeModal();
        handleContainerSearch(false);
    } catch (err) {
        console.error(err);
        alert('Data gagal disimpan di browser. Periksa izin penyimpanan browser.');
    }
}

function deleteRecord() {
    const id = $('recordId').value;
    if (id && confirm('Hapus data kontainer ini?')) {
        records = records.filter((r) => r.id !== id);
        save();
        closeModal();
        handleContainerSearch(false);
    }
}

function clearAll() {
    if (confirm('Hapus seluruh data kontainer dari browser ini?')) {
        records = [];
        save();
        handleContainerSearch(false);
    }
}

function openMobileSidebar() {
    $('appSidebar').classList.remove('-translate-x-full');
    $('sidebarBackdrop').classList.remove('hidden');
}

function closeMobileSidebar() {
    $('appSidebar').classList.add('-translate-x-full');
    $('sidebarBackdrop').classList.add('hidden');
}

// Event Listeners
$('printPdfBtn').addEventListener('click', printStowage);
$('mobilePrintBtn').addEventListener('click', printStowage);
$('mobileSidebarBtn').addEventListener('click', openMobileSidebar);
$('closeSidebarBtn').addEventListener('click', closeMobileSidebar);
$('sidebarBackdrop').addEventListener('click', closeMobileSidebar);

$('bayNavButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-bay]');
    if (btn) goBay(btn.dataset.bay);
});

// Release programmatic lock immediately on manual user interaction with #bays
$('bays').addEventListener('pointerdown', releaseProgrammaticScrollLock, { passive: true });
$('bays').addEventListener('touchstart', releaseProgrammaticScrollLock, { passive: true });

// Smooth mouse-wheel to horizontal scroll on #bays & sync active bay nav
$('bays').addEventListener(
    'wheel',
    (e) => {
        releaseProgrammaticScrollLock();
        const el = $('bays');
        const canScrollX = el.scrollWidth > el.clientWidth;
        const fitsVertically = el.scrollHeight <= el.clientHeight + 2;
        if (canScrollX && fitsVertically && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        }
    },
    { passive: false }
);

let scrollTicking = false;
$('bays').addEventListener(
    'scroll',
    () => {
        if (isProgrammaticScroll) {
            if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
            programmaticScrollTimer = setTimeout(() => {
                isProgrammaticScroll = false;
            }, 150);
            return;
        }
        if (!scrollTicking) {
            scrollTicking = true;
            requestAnimationFrame(() => {
                detectActiveBayOnScroll();
                scrollTicking = false;
            });
        }
    },
    { passive: true }
);

$('search').addEventListener('input', () => handleContainerSearch(true));
$('search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const matches = getSearchMatches($('search').value);
        if (matches.length > 0) {
            focusContainerCell(matches[0].bay, matches[0].slot, true);
        }
    }
});

$('clearSearchBtn').addEventListener('click', () => {
    $('search').value = '';
    handleContainerSearch(false);
    $('search').focus();
});

$('searchMatchList').addEventListener('click', (e) => {
    const btn = e.target.closest('.search-jump-btn');
    if (btn) {
        focusContainerCell(btn.dataset.jumpBay, Number(btn.dataset.jumpSlot), true);
    }
});

$('bays').addEventListener('click', (e) => {
    const slotCard = e.target.closest('.slot-card');
    if (slotCard) {
        openSlot(slotCard.dataset.bay, Number(slotCard.dataset.slot));
    }
});

$('shipName').addEventListener('input', save);
$('voyage').addEventListener('input', save);
$('clearAllBtn').addEventListener('click', clearAll);

$('showDatabaseBtn').addEventListener('click', showDatabase);
$('showManualBtn').addEventListener('click', showManual);
$('dbSearch').addEventListener('input', filterDatabase);
$('dbSelect').addEventListener('change', selectDatabaseRecord);
$('dbSelect').addEventListener('click', (e) => {
    if (e.target.tagName === 'OPTION' && e.target.value !== '') {
        selectDatabaseRecord();
    }
});
$('reloadDbBtn').addEventListener('click', () => loadDatabase(true));
$('fFeet').addEventListener('change', (e) => {
    const bay = $('fBay').value === 'AH' ? 'AH' : Number($('fBay').value);
    const slot = Number($('fSlot').value);
    if (e.target.value === '40 FT' && !canLoad40Ft(bay, slot)) {
        alert('40 ft tidak bisa dimuat disini');
        e.target.value = '20 FT';
    }
});
$('containerForm').addEventListener('submit', submitContainer);
$('deleteBtn').addEventListener('click', deleteRecord);
$('cancelModalBtn').addEventListener('click', closeModal);
$('closeModalIconBtn').addEventListener('click', closeModal);

$('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) closeModal();
});

render(false);