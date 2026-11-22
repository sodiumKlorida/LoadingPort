// Sidebar desktop selalu tampil. Pada tablet/mobile, akses dan tutup sidebar
// menggunakan kontrol sidebar yang sudah tersedia agar tidak ada tombol hamburger ganda.
$('hideSidebarBtn')?.addEventListener('click', () => {
    closeMobileSidebar();
});


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
    const storageOk = safeStorageSet('stowageRecords', JSON.stringify(records));
    safeStorageSet('stowageShip', $('shipName').value);
    safeStorageSet('stowageVoyage', $('voyage').value);
    safeStorageSet('stowageDate', $('stowageDate')?.value || '');
    safeStorageSet('stowageLoadingPort', $('stowageLoadingPort')?.value || '');
    safeStorageSet('stowageDestinationPort', $('stowageDestinationPort')?.value || '');

    updateHeaderMeta();
    updateStowageContext();
    updateSummary();
    renderAvailableContainerCards();

    // Tandai perubahan lokal. Request ke SheetDB hanya dilakukan saat
    // pengguna menekan tombol Sinkronkan.
    if (typeof queueCloudSave === 'function') {
        queueCloudSave();
    }

    if (!storageOk && !storageWarningShown) {
        storageWarningShown = true;
        alert('Kontainer berhasil diletakkan pada tampilan, tetapi browser menolak penyimpanan permanen. Data hanya bertahan selama tab ini terbuka. Aktifkan izin penyimpanan situs atau buka aplikasi melalui localhost/hosting, bukan mode privat.');
    }
}

$('shipName').value = safeStorageGet('stowageShip') || 'PRAKASA PACIFIC';
$('voyage').value = safeStorageGet('stowageVoyage') || '';
if ($('stowageDate')) $('stowageDate').value = safeStorageGet('stowageDate') || '';
if ($('stowageLoadingPort')) $('stowageLoadingPort').value = safeStorageGet('stowageLoadingPort') || '';
if ($('stowageDestinationPort')) $('stowageDestinationPort').value = safeStorageGet('stowageDestinationPort') || '';
updateHeaderMeta();
updateStowageContext();

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

