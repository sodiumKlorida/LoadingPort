const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSBUPaF4x5uLIQFlcBPrWmC5G8ZVe1WwBlU0xRT70OrpjeoA5c0QuZCdUfYR8yrDOETb-wiqrqSg2fy/pub?gid=831792460&single=true&output=csv';
const DB_CACHE_KEY = 'stowageGoogleSheetCache';

let databaseRows = [];
let selectedDatabaseRow = null;
let activeBay = 'AH';
let isProgrammaticScroll = false;
let programmaticScrollTimer = null;

// Sidebar View & Filter State
let sidebarViewMode = 'main'; // 'main' | 'containers'
let sidebarSizeFilter = 'ALL'; // 'ALL' | '20' | '40'

// Drag & Drop State (baik dari slot bay maupun dari list container sidebar)
let draggedItem = null; // { source: 'slot', record: {...} } | { source: 'pool', container: {...} }
let autoScrollRaf = null;
let autoScrollVelocity = 0;

// Urutan dari BOW (kiri) ke STERN (kanan): AH -> 1 -> 3 -> 5 -> 7 -> 9 -> 11 -> 13
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
    const showBtn = $('showSidebarBtn');
    if (!sidebar) return;

    if (isHidden) {
        sidebar.classList.add('lg:hidden');
        if (showBtn) {
            showBtn.classList.remove('hidden');
            showBtn.classList.add('lg:flex');
        }
    } else {
        sidebar.classList.remove('lg:hidden');
        if (showBtn) {
            showBtn.classList.add('hidden');
            showBtn.classList.remove('lg:flex');
        }
    }
    localStorage.setItem(SIDEBAR_HIDDEN_KEY, isHidden ? '1' : '0');
}

setDesktopSidebarState(localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1');

$('hideSidebarBtn')?.addEventListener('click', () => {
    if (window.innerWidth >= 1024) {
        setDesktopSidebarState(true);
    } else {
        closeMobileSidebar();
    }
});

$('showSidebarBtn')?.addEventListener('click', () => {
    setDesktopSidebarState(false);
});

// =========================================================================
// SWITCH TAMPILAN SIDEBAR (DROPDOWN MAIN MENU / LIST CONTAINER)
// =========================================================================
function setSidebarView(mode) {
    sidebarViewMode = mode === 'containers' ? 'containers' : 'main';
    const select = $('sidebarViewSelect');
    if (select && select.value !== sidebarViewMode) {
        select.value = sidebarViewMode;
    }

    const mainView = $('sidebarMainMenu');
    const listView = $('sidebarContainerListView');

    if (sidebarViewMode === 'containers') {
        mainView.classList.add('hidden');
        listView.classList.remove('hidden');
        listView.classList.add('flex');
        ensureSidebarDatabaseLoaded();
    } else {
        listView.classList.add('hidden');
        listView.classList.remove('flex');
        mainView.classList.remove('hidden');
    }
}

$('sidebarViewSelect')?.addEventListener('change', (e) => {
    setSidebarView(e.target.value);
});

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
    renderAvailableContainerCards();
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

// =========================================================================
// LOGIKA 40 FT & CEK KETERSEDIAAN CELL (TERMASUK MULTIPLE IGNORE ID UNTUK SWAP)
// =========================================================================
function normalizeIgnoreSet(ignoreRecordIds) {
    if (!ignoreRecordIds) return new Set();
    if (ignoreRecordIds instanceof Set) return ignoreRecordIds;
    if (Array.isArray(ignoreRecordIds)) return new Set(ignoreRecordIds.filter(Boolean));
    return new Set([ignoreRecordIds]);
}

function isCellOccupied(bay, slot, ignoreRecordIds = null) {
    const bayStr = String(bay);
    const numSlot = Number(slot);
    const ignoreSet = normalizeIgnoreSet(ignoreRecordIds);

    const direct = records.find(
        (x) => String(x.bay) === bayStr && Number(x.slot) === numSlot && !ignoreSet.has(x.id)
    );
    if (direct) return direct;

    const blocker = getBlockingRecord(bay, numSlot, ignoreSet);
    if (blocker) return blocker;

    return null;
}

function getValid40FtDirections(bay, slot, ignoreRecordIds = null) {
    if (bay === 'AH') return [];
    const numBay = Number(bay);
    const numSlot = Number(slot);
    if (numBay === 13 || numBay < 1 || numBay > 11) return [];
    if (!slotsForBay(numBay).includes(numSlot)) return [];

    const dirs = [];

    // Ke Depan (bay - 2, minimal bay 1)
    const forwardBay = numBay - 2;
    if (forwardBay >= 1 && forwardBay <= 11 && slotsForBay(forwardBay).includes(numSlot)) {
        const blocker = isCellOccupied(forwardBay, numSlot, ignoreRecordIds);
        dirs.push({
            dir: 'forward',
            targetBay: forwardBay,
            targetSlot: numSlot,
            available: !blocker,
            occupiedBy: blocker,
            label: `Ke Depan (${bayLabel(forwardBay)})`
        });
    }

    // Ke Belakang (bay + 2, maksimal bay 11)
    const backwardBay = numBay + 2;
    if (backwardBay >= 1 && backwardBay <= 11 && slotsForBay(backwardBay).includes(numSlot)) {
        const blocker = isCellOccupied(backwardBay, numSlot, ignoreRecordIds);
        dirs.push({
            dir: 'backward',
            targetBay: backwardBay,
            targetSlot: numSlot,
            available: !blocker,
            occupiedBy: blocker,
            label: `Ke Belakang (${bayLabel(backwardBay)})`
        });
    }

    return dirs;
}

function canLoad40Ft(bay, slot, ignoreRecordIds = null) {
    return getValid40FtDirections(bay, slot, ignoreRecordIds).some((d) => d.available);
}

function getPartnerBayFor40Ft(record) {
    if (!record || record.size !== '40 FT' || record.bay === 'AH') return null;
    const numBay = Number(record.bay);
    if (record.dir40 === 'forward') {
        return numBay - 2 >= 1 ? numBay - 2 : null;
    }
    return numBay + 2 <= 11 ? numBay + 2 : null;
}

function getBlockedTarget(bay, slot, dir = 'backward') {
    if (bay === 'AH') return null;
    const numBay = Number(bay);
    const numSlot = Number(slot);
    const targetBay = dir === 'forward' ? numBay - 2 : numBay + 2;
    if (targetBay < 1 || targetBay > 11) return null;
    if (!slotsForBay(targetBay).includes(numSlot)) return null;
    return { bay: targetBay, slot: numSlot };
}

function getBlockingRecord(bay, slot, ignoreRecordIds = null) {
    if (bay === 'AH') return null;
    const numBay = Number(bay);
    const numSlot = Number(slot);
    if (numBay < 1 || numBay > 11) return null;
    const ignoreSet = normalizeIgnoreSet(ignoreRecordIds);

    return (
        records.find((x) => {
            if (ignoreSet.has(x.id)) return false;
            if (x.size !== '40 FT' || Number(x.slot) !== numSlot) return false;
            const partnerBay = getPartnerBayFor40Ft(x);
            return partnerBay !== null && Number(partnerBay) === numBay;
        }) || null
    );
}

// =========================================================================
// LOGIKA VALIDASI DRAG & DROP (PENEMPATAN KOSONG & TUKAR POSISI / SWAP)
// =========================================================================
function evaluateDropTargetForSpec(spec, targetBay, targetSlot) {
    if (!spec) return { valid: false, reason: 'Kontainer tidak ditemukan.' };

    const bayVal = targetBay === 'AH' ? 'AH' : Number(targetBay);
    const slotVal = Number(targetSlot);
    const ignoreId = spec.id || null;

    if (!slotsForBay(bayVal).includes(slotVal)) {
        return { valid: false, reason: 'Slot tidak tersedia di bay ini.' };
    }

    // Jika berasal dari bay dan dijatuhkan ke posisi asalnya sendiri (atau cell pasangan 40ft-nya sendiri)
    if (ignoreId) {
        if (String(spec.bay) === String(bayVal) && Number(spec.slot) === slotVal) {
            return { valid: false, reason: 'Posisi asal kontainer.' };
        }
        if (spec.size === '40 FT') {
            const selfPartnerBay = getPartnerBayFor40Ft(spec);
            if (selfPartnerBay !== null && Number(selfPartnerBay) === Number(bayVal) && Number(spec.slot) === slotVal) {
                return { valid: false, reason: 'Posisi asal kontainer.' };
            }
        }
    }

    // Cek apakah nomor kontainer sudah dimuat di kapal (untuk drag dari list sidebar)
    if (!ignoreId) {
        const dup = records.find(
            (x) => String(x.number || '').trim().toUpperCase() === String(spec.number || '').trim().toUpperCase()
        );
        if (dup) {
            return {
                valid: false,
                reason: `Kontainer ${spec.number} sudah dimuat di ${bayLabel(dup.bay)} (${getCellNo(dup.bay, dup.slot)}).`
            };
        }
    }

    // Cek apakah cell tujuan terisi oleh kontainer lain
    const occ = isCellOccupied(bayVal, slotVal, ignoreId);

    // =====================================================================
    // KASUS A: CELL TUJUAN KOSONG -> PENEMPATAN BIASA
    // =====================================================================
    if (!occ) {
        if (spec.size !== '40 FT') {
            return { valid: true, isSwap: false, dir40: null };
        }

        if (bayVal === 'AH' || bayVal === 13) {
            return { valid: false, reason: 'Kontainer 40 FT tidak bisa diletakkan di After Hatch atau Bay 13.' };
        }

        const allDirs = getValid40FtDirections(bayVal, slotVal, ignoreId);
        const dirs = allDirs.filter((d) => d.available);
        if (dirs.length === 0) {
            const blockers = allDirs
                .filter((d) => d.occupiedBy)
                .map((d) => `${getCellNo(d.targetBay, d.targetSlot)} (${d.occupiedBy.number})`);
            if (blockers.length > 0) {
                return {
                    valid: false,
                    reason: `Tidak dapat menempatkan kontainer 40 FT di ${getCellNo(bayVal, slotVal)} karena cell pasangan sudah terisi: ${blockers.join(', ')}.`
                };
            }
            return {
                valid: false,
                reason: `Tidak dapat menempatkan kontainer 40 FT di ${getCellNo(bayVal, slotVal)} karena cell pasangan depan/belakang tidak tersedia.`
            };
        }

        const preferred = dirs.find((d) => d.dir === (spec.dir40 || 'backward')) || dirs[0];
        return {
            valid: true,
            isSwap: false,
            dir40: preferred.dir,
            targetPartner: { bay: preferred.targetBay, slot: preferred.targetSlot }
        };
    }

    // =====================================================================
    // KASUS B: CELL TUJUAN SUDAH TERISI (occ) -> TUKAR POSISI (SWAP)
    // =====================================================================
    // Swap hanya berlaku antar kontainer yang sudah berada di Bay (source === 'slot')
    if (!ignoreId) {
        return {
            valid: false,
            reason: `Tidak dapat menempatkan di ${getCellNo(bayVal, slotVal)} karena sudah terisi kontainer ${occ.number}.`
        };
    }

    // Kedua kontainer akan berpindah posisi, sehingga ID keduanya diabaikan saat validasi ruang
    const bothIgnoreIds = new Set([ignoreId, occ.id]);

    // 1. Validasi penempatan kontainer yang sedang di-drag (spec) ke posisi target (bayVal, slotVal)
    let newSpecDir40 = null;
    if (spec.size === '40 FT') {
        if (bayVal === 'AH' || bayVal === 13) {
            return {
                valid: false,
                reason: `Tidak dapat menukar dengan ${occ.number}: Kontainer 40 FT (${spec.number}) tidak boleh ditempatkan di ${bayLabel(bayVal)}.`
            };
        }
        const specDirs = getValid40FtDirections(bayVal, slotVal, bothIgnoreIds).filter((d) => d.available);
        if (specDirs.length === 0) {
            return {
                valid: false,
                reason: `Tidak dapat menukar dengan ${occ.number}: Cell pasangan depan/belakang untuk ${spec.number} (40 FT) di ${getCellNo(bayVal, slotVal)} tidak kosong.`
            };
        }
        const prefSpecDir = specDirs.find((d) => d.dir === (spec.dir40 || 'backward')) || specDirs[0];
        newSpecDir40 = prefSpecDir.dir;
    }

    // 2. Validasi penempatan kontainer target (occ) ke posisi asal kontainer yang di-drag (spec.bay, spec.slot)
    const originBay = spec.bay === 'AH' ? 'AH' : Number(spec.bay);
    const originSlot = Number(spec.slot);
    let newOccDir40 = null;

    if (occ.size === '40 FT') {
        if (originBay === 'AH' || originBay === 13) {
            return {
                valid: false,
                reason: `Tidak dapat menukar dengan ${occ.number}: Kontainer ${occ.number} (40 FT) tidak boleh dipindah ke ${bayLabel(originBay)}.`
            };
        }

        // Pastikan pasangan 40 FT milik occ tidak bertabrakan dengan posisi baru spec
        const simulatedSpecCells = new Set([`${bayVal}-${slotVal}`]);
        if (spec.size === '40 FT' && newSpecDir40) {
            const pTarget = getBlockedTarget(bayVal, slotVal, newSpecDir40);
            if (pTarget) simulatedSpecCells.add(`${pTarget.bay}-${pTarget.slot}`);
        }

        if (simulatedSpecCells.has(`${originBay}-${originSlot}`)) {
            return {
                valid: false,
                reason: `Tidak dapat menukar dengan ${occ.number} karena cell asal dan tujuan saling tumpang tindih pada 40 FT.`
            };
        }

        const occDirs = getValid40FtDirections(originBay, originSlot, bothIgnoreIds).filter((d) => {
            if (!d.available) return false;
            return !simulatedSpecCells.has(`${d.targetBay}-${d.targetSlot}`);
        });

        if (occDirs.length === 0) {
            return {
                valid: false,
                reason: `Tidak dapat menukar dengan ${occ.number}: Cell pasangan depan/belakang untuk ${occ.number} (40 FT) di ${getCellNo(originBay, originSlot)} tidak tersedia.`
            };
        }
        const prefOccDir = occDirs.find((d) => d.dir === (occ.dir40 || 'backward')) || occDirs[0];
        newOccDir40 = prefOccDir.dir;
    } else {
        // occ adalah 20 FT: pastikan originBay-originSlot tidak termakan oleh pasangan 40 FT milik spec
        if (spec.size === '40 FT' && newSpecDir40) {
            const pTarget = getBlockedTarget(bayVal, slotVal, newSpecDir40);
            if (pTarget && String(pTarget.bay) === String(originBay) && Number(pTarget.slot) === originSlot) {
                return {
                    valid: false,
                    reason: `Tidak dapat menukar dengan ${occ.number} karena cell asal (${getCellNo(originBay, originSlot)}) dibutuhkan sebagai pasangan 40 FT milik ${spec.number}.`
                };
            }
        }
    }

    return {
        valid: true,
        isSwap: true,
        swapWith: occ,
        dir40: newSpecDir40,
        swapOccDir40: newOccDir40
    };
}

function getDraggedSpec() {
    if (!draggedItem) return null;
    if (draggedItem.source === 'slot') return draggedItem.record;
    if (draggedItem.source === 'pool') {
        const c = draggedItem.container;
        return {
            id: null,
            number: c.number,
            size: c.feet.includes('40') ? '40 FT' : '20 FT',
            loadingPort: c.loadingPort,
            port: c.port,
            weight: c.weight,
            dir40: 'backward'
        };
    }
    return null;
}

function applyDragVisualHighlights(spec) {
    document.querySelectorAll('.slot-card').forEach((card) => {
        const b = card.dataset.bay;
        const s = Number(card.dataset.slot);
        const evalRes = evaluateDropTargetForSpec(spec, b, s);

        card.classList.remove(
            'ring-2',
            'ring-emerald-500',
            'ring-amber-500',
            'ring-rose-400',
            'bg-emerald-50/80',
            'bg-emerald-50/70',
            'opacity-45',
            'drop-valid',
            'drop-swap',
            'drop-invalid'
        );

        if (evalRes.valid && evalRes.isSwap) {
            card.classList.add('drop-swap', 'ring-2', 'ring-amber-500');
        } else if (evalRes.valid) {
            card.classList.add('drop-valid', 'ring-2', 'ring-emerald-500', 'bg-emerald-50/70');
        } else {
            card.classList.add('drop-invalid', 'opacity-45');
        }
    });
}

function clearDragVisualHighlights() {
    document.querySelectorAll('.slot-card').forEach((card) => {
        card.classList.remove(
            'ring-2',
            'ring-emerald-500',
            'ring-amber-500',
            'ring-rose-400',
            'bg-emerald-50/80',
            'bg-emerald-50/70',
            'opacity-45',
            'scale-[1.03]',
            'drop-valid',
            'drop-swap',
            'drop-invalid'
        );
    });
}

// =========================================================================
// TRASH DROP ZONE (UNTUK KONTAINER YANG SUDAH DILETAKKAN DI BAY)
// =========================================================================
function showTrashDropZone() {
    const zone = $('trashDropZone');
    if (!zone) return;
    zone.classList.remove('hidden');
    zone.classList.add('flex');
}

function hideTrashDropZone() {
    const zone = $('trashDropZone');
    const target = $('trashDropTarget');
    if (!zone) return;
    zone.classList.add('hidden');
    zone.classList.remove('flex');
    if (target) {
        target.classList.remove('scale-105', 'bg-red-700', 'border-white', 'ring-4', 'ring-red-300');
    }
}

$('trashDropTarget')?.addEventListener('dragover', (e) => {
    if (!draggedItem || draggedItem.source !== 'slot') return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const target = $('trashDropTarget');
    if (target) {
        target.classList.add('scale-105', 'bg-red-700', 'border-white', 'ring-4', 'ring-red-300');
    }
});

$('trashDropTarget')?.addEventListener('dragleave', () => {
    const target = $('trashDropTarget');
    if (target) {
        target.classList.remove('scale-105', 'bg-red-700', 'border-white', 'ring-4', 'ring-red-300');
    }
});

$('trashDropTarget')?.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    stopBayAutoScroll();

    let recToTrash = draggedItem && draggedItem.source === 'slot' ? draggedItem.record : null;
    if (!recToTrash && e.dataTransfer) {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw.startsWith('slot:')) {
            recToTrash = records.find((x) => x.id === raw.slice(5)) || null;
        }
    }

    hideTrashDropZone();
    clearDragVisualHighlights();
    draggedItem = null;

    if (!recToTrash) return;

    const locText = `${bayLabel(recToTrash.bay)} (${getCellNo(recToTrash.bay, recToTrash.slot)})`;
    if (confirm(`Yakin ingin membuang kontainer ${recToTrash.number} dari ${locText}?`)) {
        records = records.filter((r) => r.id !== recToTrash.id);
        save();
        handleContainerSearch(false);
    }
});

// =========================================================================
// AUTO-SCROLL HORIZONTAL AREA BAY SAAT DRAG MENTOK KIRI / KANAN
// =========================================================================
function startBayAutoScrollLoop() {
    if (autoScrollRaf) return;
    const step = () => {
        if (!draggedItem || autoScrollVelocity === 0) {
            autoScrollRaf = null;
            return;
        }
        const baysEl = $('bays');
        if (baysEl) {
            releaseProgrammaticScrollLock();
            baysEl.scrollLeft += autoScrollVelocity;
        }
        autoScrollRaf = requestAnimationFrame(step);
    };
    autoScrollRaf = requestAnimationFrame(step);
}

function stopBayAutoScroll() {
    autoScrollVelocity = 0;
    if (autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
    }
}

function updateBayAutoScrollFromClientX(clientX) {
    const baysEl = $('bays');
    if (!baysEl || !draggedItem) {
        stopBayAutoScroll();
        return;
    }

    const rect = baysEl.getBoundingClientRect();
    if (clientX < rect.left - 40 || clientX > rect.right + 40) {
        stopBayAutoScroll();
        return;
    }

    const edgeThreshold = 110;
    const maxSpeed = 24;

    if (clientX - rect.left < edgeThreshold) {
        const ratio = Math.min(1, Math.max(0.15, (edgeThreshold - (clientX - rect.left)) / edgeThreshold));
        autoScrollVelocity = -Math.round(maxSpeed * ratio);
        startBayAutoScrollLoop();
    } else if (rect.right - clientX < edgeThreshold) {
        const ratio = Math.min(1, Math.max(0.15, (edgeThreshold - (rect.right - clientX)) / edgeThreshold));
        autoScrollVelocity = Math.round(maxSpeed * ratio);
        startBayAutoScrollLoop();
    } else {
        stopBayAutoScroll();
    }
}

document.addEventListener('dragover', (e) => {
    if (!draggedItem) return;
    updateBayAutoScrollFromClientX(e.clientX);
});

document.addEventListener('dragend', () => {
    stopBayAutoScroll();
    hideTrashDropZone();
    clearDragVisualHighlights();
    draggedItem = null;
});

document.addEventListener('drop', () => {
    stopBayAutoScroll();
    hideTrashDropZone();
});

// =========================================================================
// PERHITUNGAN BERAT / V.MOV
// =========================================================================
function getBayShareWeight(record) {
    if (!record || record.weight === '' || record.weight === null || record.weight === undefined) return 0;
    const w = Number(record.weight || 0);
    return record.size === '40 FT' ? w / 2 : w;
}

function getBayTotalWeight(bay) {
    let total = 0;
    const directList = records.filter((r) => String(r.bay) === String(bay));
    directList.forEach((r) => {
        total += getBayShareWeight(r);
    });

    if (bay !== 'AH') {
        const numBay = Number(bay);
        records.forEach((r) => {
            if (r.size === '40 FT') {
                const partnerBay = getPartnerBayFor40Ft(r);
                if (partnerBay !== null && Number(partnerBay) === numBay) {
                    total += getBayShareWeight(r);
                }
            }
        });
    }
    return total;
}

function getBaySlotsWeight(bay, slotList) {
    let total = 0;
    const numSlots = slotList.map(Number);

    records.forEach((r) => {
        if (!numSlots.includes(Number(r.slot))) return;
        if (String(r.bay) === String(bay)) {
            total += getBayShareWeight(r);
        } else if (bay !== 'AH' && r.size === '40 FT') {
            const partnerBay = getPartnerBayFor40Ft(r);
            if (partnerBay !== null && Number(partnerBay) === Number(bay)) {
                total += getBayShareWeight(r);
            }
        }
    });

    return total;
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
    const clean = String(text || '').replace(/^﻿/, '');
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
        } else if (ch === '' && next === '') {
            row.push(field.trim());
            rows.push(row);
            row = [];
            field = '';
            i++;
        } else if (ch === '' || ch === '') {
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
                const partnerBay = r.size === '40 FT' ? getPartnerBayFor40Ft(r) : null;
                const blockedTarget = partnerBay !== null ? { bay: partnerBay, slot: Number(r.slot) } : null;
                matches.push({
                    ...r,
                    blockedTarget
                });
            }
        });
    });
    return matches;
}

function formatHalfWeight(weightVal) {
    if (weightVal === '' || weightVal === null || weightVal === undefined) return '';
    const half = Number(weightVal) / 2;
    return Number.isInteger(half) ? String(half) : half.toFixed(2).replace(/\.?0+$/, '');
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
    const isDraggable = Boolean(activeContainer);
    const dragRecordId = activeContainer ? activeContainer.id : '';

    const cardSurface = isSearchMatch
        ? 'border-emerald-600 bg-emerald-50 ring-4 ring-emerald-400/70 shadow-lg scale-[1.01]'
        : hasRecord
            ? is40
                ? 'border-amber-400 bg-amber-50/90 hover:border-amber-500'
                : 'border-sky-400 bg-sky-50/90 hover:border-sky-500'
            : isBlocked
                ? 'border-dashed border-amber-400 bg-amber-50/55 hover:border-amber-500'
                : isDashed
                    ? 'border-2 border-dashed border-slate-400 bg-white hover:border-sky-500 hover:bg-sky-50/30'
                    : 'border-slate-300 bg-white hover:border-sky-500 hover:bg-sky-50/30';

    const cursorClass = isDraggable
        ? 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-md'
        : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md';
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
    let weightLabel = 'KOSONG';
    if (hasRecord && r.weight !== '') {
        weightLabel = is40 ? `${esc(formatHalfWeight(r.weight))} T` : `${esc(r.weight)} T`;
    } else if (isBlocked) {
        weightLabel = blocker.weight !== '' ? `${esc(formatHalfWeight(blocker.weight))} T` : `DARI ${blockerCellNo}`;
    }

    const loadPort = activeContainer ? esc(normalizePort(activeContainer.loadingPort) || '—') : '';
    const discPort = activeContainer ? esc(normalizePort(activeContainer.port) || '—') : '';

    return `
    <div id="cell-${esc(b)}-${s}" data-bay="${esc(b)}" data-slot="${s}"
      ${isDraggable ? `draggable="true" data-record-id="${esc(dragRecordId)}" title="Klik untuk edit, seret ke slot lain untuk pindah/tukar, atau seret ke bawah untuk membuang"` : ''}
      class="slot-card group flex h-full min-h-[96px] md:min-h-[100px] min-w-[122px] md:min-w-[128px] flex-col justify-between overflow-hidden rounded-xl border transition duration-150 print:min-h-[68px] print:min-w-0 print:rounded-md print:border-slate-800 print:shadow-none ${cursorClass} ${cardSurface} ${dimClass}">
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
           <span class="mt-0.5 whitespace-nowrap rounded bg-amber-200/70 px-1.5 py-0.2 text-[9px] font-extrabold tracking-wider text-amber-950 uppercase print:bg-transparent print:p-0 print:text-[6.5px]">DARI ${blockerCellNo}</span>`
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
    <div class="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-2.5 md:p-3 shadow-sm print:rounded-lg print:border-slate-800 print:bg-white print:p-1.5 print:shadow-none">
      <div>
        <div class="flex items-center justify-between gap-1.5 border-b border-slate-200 pb-1.5 print:border-slate-400 print:pb-1">
          <span class="whitespace-nowrap text-[10px] md:text-[11px] font-extrabold tracking-wider text-slate-900 uppercase print:text-[7px] print:leading-tight print:tracking-normal">${title}</span>
          <span class="shrink-0 whitespace-nowrap rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 print:hidden">V.MOV</span>
        </div>
        <div class="mt-1 print:mt-0.5">
          ${breakdownHTML}
        </div>
      </div>

      <div class="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-sky-600 px-2.5 py-1.5 text-white print:mt-1 print:rounded print:border print:border-slate-800 print:bg-slate-100 print:px-1.5 print:py-0.5 print:text-slate-900">
        <span class="whitespace-nowrap text-[10px] font-bold tracking-wider uppercase print:text-[6.5px] print:tracking-normal">TTL</span>
        <span class="whitespace-nowrap text-xs font-extrabold sm:text-sm print:text-[8px]">${ttlWeight.toFixed(2)} TON</span>
      </div>
    </div>
  `;
}

function getBayOccupiedSlotsCount(bay) {
    const slots = slotsForBay(bay);
    let count = 0;
    slots.forEach((s) => {
        const r = records.find((x) => String(x.bay) === String(bay) && Number(x.slot) === Number(s));
        const blocker = !r ? getBlockingRecord(bay, s) : null;
        if (r || blocker) count++;
    });
    return count;
}

function renderBayCard(b) {
    const list = records.filter((r) => String(r.bay) === String(b));
    const partner40List = b === 'AH' ? [] : records.filter((r) => r.size === '40 FT' && Number(getPartnerBayFor40Ft(r)) === Number(b));
    const total = getBayTotalWeight(b);
    const count20 = list.filter((r) => r.size === '20 FT').length;
    const count40 = list.filter((r) => r.size === '40 FT').length + partner40List.length;
    const occupiedSlots = getBayOccupiedSlotsCount(b);
    const title = bayLabel(b);

    // Pada tablet (md: 768px-1023px), panel menyesuaikan lebar layar tablet agar nyaman dilihat tanpa terpotong
    const panelWidthClass =
        b === 'AH'
            ? 'w-[540px] md:w-[680px] lg:w-[600px] shrink-0 print:w-full print:shrink'
            : 'w-[760px] md:w-[calc(100vw-1.75rem)] md:max-w-[880px] lg:w-[860px] shrink-0 print:w-full print:shrink';

    let contentHTML = '';

    if (b === 'AH') {
        contentHTML = `
      <div class="grid flex-1 grid-cols-[minmax(0,1fr)_172px] md:grid-cols-[minmax(0,1fr)_196px] gap-3 p-3 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5 print:p-2">
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
        const v82 = getBaySlotsWeight(13, [5, 6, 7, 8]);

        contentHTML = `
      <div class="grid flex-1 border grid-cols-[minmax(0,1fr)_172px] md:grid-cols-[minmax(0,1fr)_196px] gap-3 p-3 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5 print:p-2">
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
        const deck84 = getBaySlotsWeight(b, [2, 3]);
        const deck82 = getBaySlotsWeight(b, [5, 6, 7, 8]);
        const hole04 = getBaySlotsWeight(b, [9, 10, 11, 12]);
        const hole02 = getBaySlotsWeight(b, [13, 14, 15, 16]);

        contentHTML = `
      <div class="flex flex-1 flex-col gap-3 md:gap-4 p-2.5 print:space-y-1.5 print:p-2">
        <!-- ON DECK ZONE -->
        <div class="grid flex-1 grid-cols-[minmax(0,1fr)_172px] md:grid-cols-[minmax(0,1fr)_196px] gap-2 md:gap-2.5 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5">
          <section class="flex flex-col p-1.5 md:p-2 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
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
        <div class="grid flex-1 grid-cols-[minmax(0,1fr)_172px] md:grid-cols-[minmax(0,1fr)_196px] gap-2 md:gap-2.5 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5">
          <section class="flex flex-col p-1.5 md:p-2 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
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
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-900 px-3.5 md:px-4 py-2 md:py-2.5 text-white print:bg-slate-100 print:px-2.5 print:py-1.5 print:text-slate-900">
        <div class="flex items-center gap-2 md:gap-2.5 print:gap-1.5">
          <h2 class="whitespace-nowrap text-sm md:text-base font-extrabold tracking-wide print:text-xs">${title}</h2>
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
          <span class="whitespace-nowrap text-slate-300 print:text-slate-700">${occupiedSlots} / ${slotsForBay(b).length} Slot</span>
          <span class="whitespace-nowrap rounded-xl bg-sky-600 px-2.5 md:px-3 py-1 text-white print:rounded print:border print:border-slate-800 print:bg-white print:px-1.5 print:py-0.5 print:text-slate-900">
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
    const count = getBayOccupiedSlotsCount(b);
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
        const count = getBayOccupiedSlotsCount(b);
        const maxSlots = slotsForBay(b).length;
        const { btnClass, badgeClass } = getNavButtonClasses(b);

        return `
      <button type="button" data-bay="${b}"
        class="bay-nav-btn flex shrink-0 items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-extrabold transition ${btnClass}">
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
        btn.className = `bay-nav-btn flex shrink-0 items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-extrabold transition ${btnClass}`;
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
    renderAvailableContainerCards();
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

// =========================================================================
// LIST CONTAINER TERSEDIA DI SIDEBAR (DRAGGABLE KE SLOT BAY)
// =========================================================================
async function ensureSidebarDatabaseLoaded(forceRefresh = false) {
    const statusEl = $('availableDbStatus');
    const cardsEl = $('availableContainerCards');

    if (!forceRefresh && databaseRows.length > 0) {
        renderAvailableContainerCards();
        return;
    }

    if (!forceRefresh) {
        const cached = sessionStorage.getItem(DB_CACHE_KEY);
        if (cached) {
            databaseRows = JSON.parse(cached);
            renderAvailableContainerCards();
            return;
        }
    }

    if (statusEl) statusEl.textContent = 'Mengambil data kontainer...';
    if (cardsEl) {
        cardsEl.innerHTML = '<div class="rounded-xl border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">Memuat daftar kontainer...</div>';
    }

    await loadDatabase(forceRefresh);
    renderAvailableContainerCards();
}

function renderAvailableContainerCards() {
    const cardsEl = $('availableContainerCards');
    const statusEl = $('availableDbStatus');
    if (!cardsEl) return;

    const loadedNumbers = new Set(
        records.map((r) => String(r.number || '').trim().toUpperCase())
    );

    const searchQuery = ($('sidebarContainerSearch')?.value || '').trim().toLowerCase();
    const clearBtn = $('clearSidebarContainerSearchBtn');
    if (clearBtn) clearBtn.classList.toggle('hidden', searchQuery === '');

    const availableRows = databaseRows.filter(
        (r) => !loadedNumbers.has(String(r.number || '').trim().toUpperCase())
    );

    const filteredRows = availableRows.filter((r) => {
        const is40 = r.feet.includes('40');
        if (sidebarSizeFilter === '20' && is40) return false;
        if (sidebarSizeFilter === '40' && !is40) return false;

        if (!searchQuery) return true;
        const haystack = `${r.number} ${r.loadingPort} ${r.port} ${r.feet} ${r.weight}`.toLowerCase();
        return haystack.includes(searchQuery);
    });

    if (statusEl) {
        statusEl.textContent = `${availableRows.length} tersedia dari ${databaseRows.length} unit`;
    }

    if (filteredRows.length === 0) {
        cardsEl.innerHTML = `
            <div class="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                ${databaseRows.length === 0 ? 'Belum ada data database kontainer.' : 'Tidak ada kontainer tersedia yang cocok.'}
            </div>
        `;
        return;
    }

    cardsEl.innerHTML = filteredRows
        .map((r) => {
            const is40 = r.feet.includes('40');
            const sizeLabel = is40 ? '40 FT' : '20 FT';
            const cardBorder = is40
                ? 'border-amber-300 bg-amber-50/75 hover:border-amber-500'
                : 'border-sky-300 bg-sky-50/75 hover:border-sky-500';
            const badgeStyle = is40
                ? 'bg-amber-200 text-amber-950'
                : 'bg-sky-200 text-sky-950';

            return `
            <div draggable="true" data-pool-index="${r.index}"
                title="Seret (drag) kartu kontainer ini ke slot Bay"
                class="pool-container-card cursor-grab active:cursor-grabbing rounded-xl border p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardBorder}">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-xs font-black tracking-tight text-slate-900">${esc(r.number)}</span>
                    <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${badgeStyle}">${sizeLabel}</span>
                </div>
                <div class="mt-1.5 flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>${esc(r.loadingPort || '—')} &rarr; ${esc(r.port || '—')}</span>
                    <span class="font-extrabold text-slate-900">${esc(r.weight || '0')} TON</span>
                </div>
            </div>
            `;
        })
        .join('');
}

$('sidebarContainerSearch')?.addEventListener('input', renderAvailableContainerCards);
$('clearSidebarContainerSearchBtn')?.addEventListener('click', () => {
    $('sidebarContainerSearch').value = '';
    renderAvailableContainerCards();
    $('sidebarContainerSearch').focus();
});

$('refreshSidebarDbBtn')?.addEventListener('click', () => {
    ensureSidebarDatabaseLoaded(true);
});

document.querySelectorAll('.sidebar-size-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
        sidebarSizeFilter = btn.dataset.sizeFilter || 'ALL';
        document.querySelectorAll('.sidebar-size-filter').forEach((b) => {
            const active = b.dataset.sizeFilter === sidebarSizeFilter;
            b.className = active
                ? 'sidebar-size-filter flex-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white transition'
                : 'sidebar-size-filter flex-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-200';
        });
        renderAvailableContainerCards();
    });
});

// Drag start dari List Container di Sidebar (samakan opacity ghost drag seperti drag pada bay)
$('availableContainerCards')?.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.pool-container-card[draggable="true"]');
    if (!card) {
        e.preventDefault();
        return;
    }

    const poolIndex = Number(card.dataset.poolIndex);
    const container = databaseRows.find((x) => x.index === poolIndex);
    if (!container) {
        e.preventDefault();
        return;
    }

    draggedItem = { source: 'pool', container };
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'pool:' + container.index);

        // Buat drag image solid ber-opacity penuh agar jelas & identik dengan kartu bay
        const ghost = card.cloneNode(true);
        ghost.style.width = `${card.offsetWidth}px`;
        ghost.style.opacity = '1';
        ghost.style.position = 'fixed';
        ghost.style.top = '-9999px';
        ghost.style.left = '-9999px';
        ghost.style.pointerEvents = 'none';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, Math.round(card.offsetWidth / 2), Math.round(card.offsetHeight / 2));
        requestAnimationFrame(() => ghost.remove());
    }

    // Pada tablet/mobile drawer, tutup backdrop sementara atau tetap terlihat saat drag ke kanan
    if (window.innerWidth < 1024) {
        closeMobileSidebar();
    }

    const spec = getDraggedSpec();
    requestAnimationFrame(() => {
        applyDragVisualHighlights(spec);
    });
});

$('availableContainerCards')?.addEventListener('dragend', () => {
    stopBayAutoScroll();
    hideTrashDropZone();
    clearDragVisualHighlights();
    draggedItem = null;
});

// =========================================================================
// UI PILIHAN ARAH 40 FT DI DALAM MODAL (AUTO-DISABLE JIKA CELL TUJUAN TERISI)
// =========================================================================
function update40FtDirectionUI(preferredDir = null) {
    const container = $('dir40Container');
    if (!container) return;

    const size = $('fFeet').value;
    const bayRaw = $('fBay').value;
    const bay = bayRaw === 'AH' ? 'AH' : Number(bayRaw);
    const slot = Number($('fSlot').value);
    const recordId = $('recordId').value || null;

    if (size !== '40 FT') {
        container.classList.add('hidden');
        return;
    }

    const dirs = getValid40FtDirections(bay, slot, recordId);
    if (dirs.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const fwdDir = dirs.find((d) => d.dir === 'forward');
    const bwdDir = dirs.find((d) => d.dir === 'backward');

    const fwdRadio = $('dirForward');
    const bwdRadio = $('dirBackward');
    const fwdLabel = $('dirForwardLabel');
    const bwdLabel = $('dirBackwardLabel');

    // Arah Depan (Bow)
    if (fwdDir && fwdDir.available) {
        fwdRadio.disabled = false;
        fwdLabel.classList.remove('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        fwdLabel.classList.add('cursor-pointer', 'bg-white', 'border-amber-300');
        $('dirForwardText').textContent = `Ke Depan → ${bayLabel(fwdDir.targetBay)} (${getCellNo(fwdDir.targetBay, fwdDir.targetSlot)})`;
    } else {
        fwdRadio.disabled = true;
        fwdRadio.checked = false;
        fwdLabel.classList.add('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        fwdLabel.classList.remove('cursor-pointer', 'bg-white', 'border-amber-300');
        if (fwdDir && fwdDir.occupiedBy) {
            $('dirForwardText').textContent = `Ke Depan → ${getCellNo(fwdDir.targetBay, fwdDir.targetSlot)} (Terisi: ${fwdDir.occupiedBy.number})`;
        } else {
            $('dirForwardText').textContent = 'Ke Depan (Tidak tersedia)';
        }
    }

    // Arah Belakang (Stern)
    if (bwdDir && bwdDir.available) {
        bwdRadio.disabled = false;
        bwdLabel.classList.remove('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        bwdLabel.classList.add('cursor-pointer', 'bg-white', 'border-amber-300');
        $('dirBackwardText').textContent = `Ke Belakang → ${bayLabel(bwdDir.targetBay)} (${getCellNo(bwdDir.targetBay, bwdDir.targetSlot)})`;
    } else {
        bwdRadio.disabled = true;
        bwdRadio.checked = false;
        bwdLabel.classList.add('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        bwdLabel.classList.remove('cursor-pointer', 'bg-white', 'border-amber-300');
        if (bwdDir && bwdDir.occupiedBy) {
            $('dirBackwardText').textContent = `Ke Belakang → ${getCellNo(bwdDir.targetBay, bwdDir.targetSlot)} (Terisi: ${bwdDir.occupiedBy.number})`;
        } else {
            $('dirBackwardText').textContent = 'Ke Belakang (Tidak tersedia)';
        }
    }

    const fwdAvail = Boolean(fwdDir && fwdDir.available);
    const bwdAvail = Boolean(bwdDir && bwdDir.available);

    if (preferredDir === 'forward' && fwdAvail) {
        fwdRadio.checked = true;
    } else if (preferredDir === 'backward' && bwdAvail) {
        bwdRadio.checked = true;
    } else {
        if (bwdAvail && !fwdRadio.checked) bwdRadio.checked = true;
        else if (fwdAvail && !bwdRadio.checked) fwdRadio.checked = true;
    }

    update40FtPreviewText();
}

function update40FtPreviewText() {
    const preview = $('dir40Preview');
    if (!preview) return;

    const bayRaw = $('fBay').value;
    if (bayRaw === 'AH' || $('fFeet').value !== '40 FT') {
        preview.textContent = '';
        return;
    }

    const bay = Number(bayRaw);
    const slot = Number($('fSlot').value);
    const selectedDir = $('dirForward').checked ? 'forward' : $('dirBackward').checked ? 'backward' : null;
    if (!selectedDir) {
        preview.textContent = 'Semua cell pasangan depan/belakang sudah terisi.';
        return;
    }

    const target = getBlockedTarget(bay, slot, selectedDir);
    const w = Number($('fWeight').value || 0);
    const halfW = (w / 2).toFixed(2);

    if (target) {
        preview.textContent = `Mengisi ${bayLabel(bay)} (${getCellNo(bay, slot)}) & ${bayLabel(target.bay)} (${getCellNo(target.bay, target.slot)}) → ${halfW} Ton / bay.`;
    } else {
        preview.textContent = '';
    }
}

function openSlot(b, s) {
    const bayVal = b === 'AH' ? 'AH' : Number(b);
    const slotVal = Number(s);
    const blocker = getBlockingRecord(bayVal, slotVal);

    if (blocker) {
        openSlot(blocker.bay, blocker.slot);
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

    $('dirForward').checked = false;
    $('dirBackward').checked = false;

    if (r) {
        showManual();
        update40FtDirectionUI(r.dir40 || null);
    } else {
        showDatabase();
        update40FtDirectionUI(null);
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
        if (status) status.textContent = 'Tautan CSV Google Sheets belum dikonfigurasi.';
        if (select) select.innerHTML = '<option value="">Tautan CSV belum dikonfigurasi</option>';
        return;
    }

    if (!forceRefresh) {
        const cached = sessionStorage.getItem(DB_CACHE_KEY);
        if (cached) {
            databaseRows = JSON.parse(cached);
            filterDatabase();
            if (status) status.textContent = `${databaseRows.length} data kontainer siap dipilih.`;
            return;
        }
    }

    if (status) status.textContent = 'Mengambil data dari Google Sheets...';
    if (select) select.innerHTML = '<option value="">Memuat...</option>';

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
        if (status) status.textContent = `${databaseRows.length} data kontainer dimuat.`;
    } catch (err) {
        console.error(err);
        if (status) status.textContent = 'Gagal memuat: ' + err.message;
        if (select) select.innerHTML = '<option value="">Data tidak dapat dimuat</option>';
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
    const q = ($('dbSearch')?.value || '').toLowerCase();
    const filtered = databaseRows.filter((r) =>
        String(r.number || '').toLowerCase().includes(q)
    );
    if ($('dbSelect')) {
        $('dbSelect').innerHTML = filtered.length
            ? filtered
                .map(
                    (r) =>
                        `<option value="${r.index}">${esc(r.number)} · ${esc(r.loadingPort)} → ${esc(r.port)} · ${esc(r.weight)} ton (${esc(r.feet)})</option>`
                )
                .join('')
            : '<option value="">Tidak ada data yang cocok</option>';
    }
}

function selectDatabaseRecord() {
    const index = Number($('dbSelect').value);
    const r = databaseRows.find((x) => x.index === index);
    if (!r) return;

    const bay = $('fBay').value === 'AH' ? 'AH' : Number($('fBay').value);
    const slot = Number($('fSlot').value);
    const recordId = $('recordId').value || null;
    const is40Ft = r.feet.includes('40');

    if (is40Ft && !canLoad40Ft(bay, slot, recordId)) {
        alert('Kontainer 40 FT tidak dapat dimuat di sini (hanya Bay 01–11 dan cell pasangan depan/belakang harus kosong).');
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

    $('dirForward').checked = false;
    $('dirBackward').checked = false;
    update40FtDirectionUI(null);
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

    const selfBlocker = getBlockingRecord(bay, slot, id);
    if (selfBlocker) {
        alert(
            `Posisi ${getCellNo(bay, slot)} sudah terisi oleh kontainer 40 FT (${selfBlocker.number}) dari ${getCellNo(selfBlocker.bay, selfBlocker.slot)}.`
        );
        return;
    }

    if (records.some((r) => String(r.bay) === String(bay) && Number(r.slot) === slot && r.id !== id)) {
        alert('Posisi ini sudah terisi. Silakan pilih posisi lain.');
        return;
    }

    let dir40 = null;

    if (size === '40 FT') {
        if (!canLoad40Ft(bay, slot, id)) {
            alert('Kontainer 40 FT tidak dapat dimuat di sini (hanya Bay 01–11 dan cell pasangan depan/belakang harus kosong).');
            return;
        }

        if ($('dirForward').checked && !$('dirForward').disabled) dir40 = 'forward';
        else if ($('dirBackward').checked && !$('dirBackward').disabled) dir40 = 'backward';

        if (!dir40) {
            alert('Pilih arah penempatan kontainer 40 FT yang tersedia (ke Depan atau ke Belakang).');
            return;
        }

        const validDirs = getValid40FtDirections(bay, slot, id);
        const chosen = validDirs.find((d) => d.dir === dir40 && d.available);
        if (!chosen) {
            alert('Cell pasangan untuk kontainer 40 FT sudah terisi atau tidak tersedia.');
            return;
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
        dir40: size === '40 FT' ? dir40 : null,
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
$('tabletSidebarBtn')?.addEventListener('click', openMobileSidebar);
$('closeSidebarBtn').addEventListener('click', closeMobileSidebar);
$('sidebarBackdrop').addEventListener('click', closeMobileSidebar);

$('bayNavButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-bay]');
    if (btn) goBay(btn.dataset.bay);
});

$('bays').addEventListener('pointerdown', releaseProgrammaticScrollLock, { passive: true });
$('bays').addEventListener('touchstart', releaseProgrammaticScrollLock, { passive: true });

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

// =========================================================================
// DRAG & DROP EVENT LISTENERS PADA #bays (PINDAH, SWAP, & DROP DARI LIST)
// =========================================================================
$('bays').addEventListener('dragstart', (e) => {
    const slotCard = e.target.closest('.slot-card[draggable="true"]');
    if (!slotCard) {
        e.preventDefault();
        return;
    }

    const recId = slotCard.dataset.recordId;
    const rec = records.find((x) => x.id === recId);
    if (!rec) {
        e.preventDefault();
        return;
    }

    draggedItem = { source: 'slot', record: rec };
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'slot:' + rec.id);
    }

    // Tampilkan area tong sampah di bawah karena ini kontainer yang sudah diletakkan di bay
    showTrashDropZone();

    requestAnimationFrame(() => {
        applyDragVisualHighlights(rec);
    });
});

$('bays').addEventListener('dragover', (e) => {
    const spec = getDraggedSpec();
    if (!spec) return;

    updateBayAutoScrollFromClientX(e.clientX);

    const slotCard = e.target.closest('.slot-card');
    if (!slotCard) return;

    const b = slotCard.dataset.bay;
    const s = Number(slotCard.dataset.slot);

    e.preventDefault();
    const evalRes = evaluateDropTargetForSpec(spec, b, s);
    if (evalRes.valid) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        slotCard.classList.add('scale-[1.03]');
    } else if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'none';
    }
});

$('bays').addEventListener('dragleave', (e) => {
    const slotCard = e.target.closest('.slot-card');
    if (slotCard) {
        slotCard.classList.remove('scale-[1.03]');
    }
});

$('bays').addEventListener('drop', (e) => {
    e.preventDefault();
    stopBayAutoScroll();
    hideTrashDropZone();

    const slotCard = e.target.closest('.slot-card');
    let currentDrag = draggedItem;

    if (!currentDrag && e.dataTransfer) {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw.startsWith('slot:')) {
            const r = records.find((x) => x.id === raw.slice(5));
            if (r) currentDrag = { source: 'slot', record: r };
        } else if (raw.startsWith('pool:')) {
            const c = databaseRows.find((x) => x.index === Number(raw.slice(5)));
            if (c) currentDrag = { source: 'pool', container: c };
        }
    }

    const spec = currentDrag
        ? currentDrag.source === 'slot'
            ? currentDrag.record
            : {
                id: null,
                number: currentDrag.container.number,
                size: currentDrag.container.feet.includes('40') ? '40 FT' : '20 FT',
                loadingPort: currentDrag.container.loadingPort,
                port: currentDrag.container.port,
                weight: currentDrag.container.weight,
                dir40: 'backward'
            }
        : null;

    clearDragVisualHighlights();
    draggedItem = null;

    if (!slotCard || !currentDrag || !spec) return;

    const targetBay = slotCard.dataset.bay === 'AH' ? 'AH' : Number(slotCard.dataset.bay);
    const targetSlot = Number(slotCard.dataset.slot);

    const evalRes = evaluateDropTargetForSpec(spec, targetBay, targetSlot);
    if (!evalRes.valid) {
        if (evalRes.reason && evalRes.reason !== 'Posisi asal kontainer.') {
            alert(evalRes.reason);
        }
        return;
    }

    // Eksekusi Tukar Posisi (Swap) jika cell tujuan terisi oleh kontainer lain
    if (evalRes.isSwap && currentDrag.source === 'slot' && evalRes.swapWith) {
        const rec = currentDrag.record;
        const targetRec = evalRes.swapWith;
        const originBay = rec.bay === 'AH' ? 'AH' : Number(rec.bay);
        const originSlot = Number(rec.slot);

        const confirmMsg = `Yakin mau menukar posisi kontainer ${rec.number} (${getCellNo(originBay, originSlot)}) dengan kontainer ${targetRec.number} (${getCellNo(targetBay, targetSlot)})?`;
        if (!confirm(confirmMsg)) {
            return;
        }

        records = records.map((item) => {
            if (item.id === rec.id) {
                return {
                    ...item,
                    bay: targetBay,
                    slot: targetSlot,
                    cellNo: getCellNo(targetBay, targetSlot),
                    dir40: item.size === '40 FT' ? evalRes.dir40 : null
                };
            }
            if (item.id === targetRec.id) {
                return {
                    ...item,
                    bay: originBay,
                    slot: originSlot,
                    cellNo: getCellNo(originBay, originSlot),
                    dir40: item.size === '40 FT' ? evalRes.swapOccDir40 : null
                };
            }
            return item;
        });

        save();
        handleContainerSearch(false);
        return;
    }

    if (currentDrag.source === 'slot') {
        const rec = currentDrag.record;
        records = records.map((item) => {
            if (item.id !== rec.id) return item;
            return {
                ...item,
                bay: targetBay,
                slot: targetSlot,
                cellNo: getCellNo(targetBay, targetSlot),
                dir40: item.size === '40 FT' ? evalRes.dir40 : null
            };
        });
    } else if (currentDrag.source === 'pool') {
        const c = currentDrag.container;
        const is40 = c.feet.includes('40');
        const newItem = {
            id: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
            bay: targetBay,
            slot: targetSlot,
            cellNo: getCellNo(targetBay, targetSlot),
            number: String(c.number || '').trim().toUpperCase(),
            size: is40 ? '40 FT' : '20 FT',
            dir40: is40 ? evalRes.dir40 : null,
            port: normalizePort(c.port),
            loadingPort: normalizePort(c.loadingPort),
            weight: c.weight,
            mov: 1
        };
        records.push(newItem);
    }

    save();
    handleContainerSearch(false);
});

$('bays').addEventListener('dragend', () => {
    stopBayAutoScroll();
    hideTrashDropZone();
    clearDragVisualHighlights();
    draggedItem = null;
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
    const recordId = $('recordId').value || null;
    if (e.target.value === '40 FT' && !canLoad40Ft(bay, slot, recordId)) {
        alert('Kontainer 40 FT tidak dapat dimuat di sini (hanya Bay 01–11 dan cell pasangan depan/belakang harus kosong).');
        e.target.value = '20 FT';
    }
    $('dirForward').checked = false;
    $('dirBackward').checked = false;
    update40FtDirectionUI(null);
});

$('dirForward')?.addEventListener('change', update40FtPreviewText);
$('dirBackward')?.addEventListener('change', update40FtPreviewText);
$('fWeight')?.addEventListener('input', update40FtPreviewText);

$('containerForm').addEventListener('submit', submitContainer);
$('deleteBtn').addEventListener('click', deleteRecord);
$('cancelModalBtn').addEventListener('click', closeModal);
$('closeModalIconBtn').addEventListener('click', closeModal);

$('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) closeModal();
});

render(false);