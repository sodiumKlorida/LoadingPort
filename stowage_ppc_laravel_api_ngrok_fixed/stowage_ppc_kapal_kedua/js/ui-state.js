// Sidebar desktop dapat disembunyikan; pada layar kecil berfungsi sebagai drawer.
function setSidebarCollapsed(collapsed) {
 const app=$('appRoot'); if(!app) return;
 if(window.innerWidth>=1024){ app.classList.toggle('sidebar-collapsed',collapsed); $('showSidebarBtn')?.classList.toggle('hidden',!collapsed); }
 else if(collapsed) closeMobileSidebar(); else openMobileSidebar();
}
$('hideSidebarBtn')?.addEventListener('click',()=>setSidebarCollapsed(true));
$('showSidebarBtn')?.addEventListener('click',()=>setSidebarCollapsed(false));
window.addEventListener('resize',()=>{ if(window.innerWidth<1024){ $('appRoot')?.classList.remove('sidebar-collapsed'); $('showSidebarBtn')?.classList.add('hidden'); }});

function printStowage() {
    window.print();
}

function updateHeaderMeta() {
    const ship = ($('shipName')?.value || 'PRAKASA PACIFIC').trim();
    const voy = ($('voyage')?.value || '').trim();
    const date = ($('stowageDate')?.value || '').trim();
    const loading = ($('stowageLoadingPort')?.value || '').trim().toUpperCase();
    const destination = ($('stowageDestinationPort')?.value || '').trim().toUpperCase();
    const label = [ship, voy, date, loading && `${loading} → ${destination}`].filter(Boolean).join(' · ');

    if ($('printSubtitle')) $('printSubtitle').textContent = label;
    if ($('mobileShipSub')) $('mobileShipSub').textContent = label;
}

function updateStowageContext() {
    const ship = ($('shipName')?.value || 'PRAKASA PACIFIC').trim();
    const voyage = ($('voyage')?.value || '').trim();
    const date = ($('stowageDate')?.value || '').trim();
    const loading = ($('stowageLoadingPort')?.value || '').trim().toUpperCase();
    const destination = ($('stowageDestinationPort')?.value || '').trim().toUpperCase();
    const parts = [ship, voyage, date, loading && destination ? `${loading} → ${destination}` : ''];
    const el = $('stowageContextText');
    if (el) el.textContent = parts.filter(Boolean).join(' · ') || 'Informasi stowage belum diisi';
}

function save() {
    // Simpan data utama terlebih dahulu. Jika storage ditolak/penuh, perubahan tetap
    // tampil selama tab ini terbuka dan pengguna diberi peringatan yang spesifik.

    updateHeaderMeta();
    updateStowageContext();
    updateSummary();
    renderAvailableContainerCards();

}

// Metadata kapal/voyage diisi dari Laravel API saat API bridge terhubung.
$('shipName').value = 'PRAKASA PACIFIC';
$('voyage').value = '';
if ($('stowageDate')) $('stowageDate').value = '';
if ($('stowageLoadingPort')) $('stowageLoadingPort').value = '';
if ($('stowageDestinationPort')) $('stowageDestinationPort').value = '';
updateHeaderMeta();
updateStowageContext();

function bayLabel(b) {
    return b === 'AH' ? 'AFTER HATCH' : `BAY ${String(b).padStart(2, '0')}`;
}

function getCellNo(bay, slot) {
    if (bay === 'AH') {
        const slotNum = Number(slot);
        return slotNum === 4 ? 'AH482' : slotNum === 3 ? 'AH382' : 'AH' + String(slotNum);
    }
    const p = CELL_LAYOUT[slot];
    return p ? String(bay) + String(p.row) + String(p.tier) : '—';
}

function slotsForBay(bay) {
    const bayId = bay === 'AH' ? 'AH' : Number(bay);
    return BAY_IDS.includes(bayId) ? ALLOWED_SLOTS : [];
}

