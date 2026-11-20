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

