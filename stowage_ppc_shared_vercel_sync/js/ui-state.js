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
    safeStorageSet(SIDEBAR_HIDDEN_KEY, isHidden ? '1' : '0');
}

setDesktopSidebarState(safeStorageGet(SIDEBAR_HIDDEN_KEY) === '1');

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
    const ship = ($('shipName')?.value || 'PRAKASA PACIFIC').trim();
    const voy = ($('voyage')?.value || '').trim();
    const date = ($('stowageDate')?.value || '').trim();
    const label = [ship, voy, date].filter(Boolean).join(' · ');

    if ($('printSubtitle')) $('printSubtitle').textContent = label;
    if ($('mobileShipSub')) $('mobileShipSub').textContent = label;
}

function save() {
    // Simpan data utama terlebih dahulu. Jika storage ditolak/penuh, perubahan tetap
    // tampil selama tab ini terbuka dan pengguna diberi peringatan yang spesifik.
    const storageOk = safeStorageSet('stowageRecords', JSON.stringify(records));
    safeStorageSet('stowageShip', $('shipName').value);
    safeStorageSet('stowageVoyage', $('voyage').value);
    safeStorageSet('stowageDate', $('stowageDate')?.value || '');

    updateHeaderMeta();
    updateSummary();
    renderAvailableContainerCards();

    if (!storageOk && !storageWarningShown) {
        storageWarningShown = true;
        alert('Kontainer berhasil diletakkan pada tampilan, tetapi browser menolak penyimpanan permanen. Data hanya bertahan selama tab ini terbuka. Aktifkan izin penyimpanan situs atau buka aplikasi melalui localhost/hosting, bukan mode privat.');
    }
}

$('shipName').value = safeStorageGet('stowageShip') || 'PRAKASA PACIFIC';
$('voyage').value = safeStorageGet('stowageVoyage') || '';
if ($('stowageDate')) $('stowageDate').value = safeStorageGet('stowageDate') || '';
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

