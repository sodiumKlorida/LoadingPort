// =========================================================================
// UI PILIHAN ARAH 40 FT DI DALAM MODAL (AUTO-DISABLE JIKA CELL TUJUAN TERISI)
// =========================================================================
function update40FtDirectionUI(preferredDir = null) {
    const container = $('dir40Container');
    if (!container) return;

    const size = $('fFeet').value;
    const type = $('fType').value;
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
        $('dirForwardText').textContent = `Ke Depan (Bay 01) → ${bayLabel(fwdDir.targetBay)} (${getCellNo(fwdDir.targetBay, fwdDir.targetSlot)})`;
    } else {
        fwdRadio.disabled = true;
        fwdRadio.checked = false;
        fwdLabel.classList.add('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        fwdLabel.classList.remove('cursor-pointer', 'bg-white', 'border-amber-300');
        if (fwdDir && fwdDir.occupiedBy) {
            $('dirForwardText').textContent = `Ke Depan → ${getCellNo(fwdDir.targetBay, fwdDir.targetSlot)} (Terisi: ${fwdDir.occupiedBy.number})`;
        } else {
            $('dirForwardText').textContent = 'Ke Depan menuju Bay 01 (Tidak tersedia)';
        }
    }

    // Arah Belakang (Stern)
    if (bwdDir && bwdDir.available) {
        bwdRadio.disabled = false;
        bwdLabel.classList.remove('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        bwdLabel.classList.add('cursor-pointer', 'bg-white', 'border-amber-300');
        $('dirBackwardText').textContent = `Ke Belakang (Bay 13) → ${bayLabel(bwdDir.targetBay)} (${getCellNo(bwdDir.targetBay, bwdDir.targetSlot)})`;
    } else {
        bwdRadio.disabled = true;
        bwdRadio.checked = false;
        bwdLabel.classList.add('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        bwdLabel.classList.remove('cursor-pointer', 'bg-white', 'border-amber-300');
        if (bwdDir && bwdDir.occupiedBy) {
            $('dirBackwardText').textContent = `Ke Belakang → ${getCellNo(bwdDir.targetBay, bwdDir.targetSlot)} (Terisi: ${bwdDir.occupiedBy.number})`;
        } else {
            $('dirBackwardText').textContent = 'Ke Belakang menuju Bay 13 (Tidak tersedia)';
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
    $('fType').value = r?.type || 'DC';
    $('fFeet').value = r?.size || '20 FT';

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
    if (typeof window.loadDatabaseFromLaravel === 'function') {
        return window.loadDatabaseFromLaravel(forceRefresh);
    }
    const status = $('dbStatus');
    if (status) status.textContent = 'Menunggu koneksi Laravel API...';
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
                        `<option value="${r.index}">${esc(r.number)} · ${esc(r.loadingPort)} → ${esc(r.port)} · ${esc(r.weight)} ton · ${esc(r.type || 'DC')} (${esc(r.feet)})</option>`
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

    $('fWeight').value = r.weight;
    $('fType').value = r.type || 'DC';
    $('fFeet').value = is40Ft ? '40 FT' : '20 FT';
    $('fType').value = r.type || 'DC';

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
    const loadingPort = ($('stowageLoadingPort')?.value || '').trim().toUpperCase();
    const port = ($('stowageDestinationPort')?.value || '').trim().toUpperCase();
    const number = $('fNumber').value.trim().toUpperCase();
    const weight = $('fWeight').value;
    const size = $('fFeet').value;
    const type = $('fType').value;

    if (
        (bay !== 'AH' && !BAY_IDS.includes(bay)) ||
        !slotsForBay(bay).includes(slot) ||
        (bay !== 'AH' && !CELL_LAYOUT[slot])
    ) {
        alert('Posisi tidak valid. Tutup form lalu pilih posisi yang tersedia.');
        return;
    }

    if (!number || weight === '' || !Number.isFinite(Number(weight)) || Number(weight) < 0) {
        alert('Lengkapi nomor kontainer dan berat dengan benar. Pelabuhan mengikuti Main Menu.');
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
    const duplicate = records.find((x) => x.id !== id && String(x.number || '').trim().toUpperCase() === number);
    if (duplicate) {
        alert(`Kontainer ${number} sudah ditempatkan di ${bayLabel(duplicate.bay)} · ${getCellNo(duplicate.bay, duplicate.slot)}.`);
        return;
    }
    const item = {
        id: id || String(Date.now()) + '-' + Math.random().toString(16).slice(2),
        containerId: old?.containerId || selectedDatabaseRow?.id || databaseRows.find((x) => String(x.number || '').trim().toUpperCase() === number)?.id || null,
        bay,
        slot,
        cellNo: getCellNo(bay, slot),
        number,
        type,
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
    const modal = $('clearDataModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    $('clearContentOnlyBtn').focus();
}

function closeClearDataModal() {
    const modal = $('clearDataModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function clearAllData(includeLocalDatabase = false) {
    if (!includeLocalDatabase) {
        records = [];
        save();
        handleContainerSearch(false);
        return;
    }

    if (!window.StowageAPI || typeof window.StowageAPI.resetImportedDatabase !== 'function') {
        alert('Koneksi Laravel API belum siap. Database tidak diubah.');
        return;
    }

    const confirmed = confirm(
        'RESET SELURUH DATABASE KONTTAINER IMPORT?\n\n' +
        'Semua posisi stowage di seluruh voyage dan plan akan dikosongkan. ' +
        'Semua master kontainer hasil import Excel akan dihapus. ' +
        'Kontainer manual, voyage, plan, dan histori snapshot tetap dipertahankan.\n\n' +
        'Tindakan ini tidak dapat dibatalkan.'
    );
    if (!confirmed) return;

    const button = $('clearLocalDatabaseBtn');
    if (button) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = 'Mereset database...';
    }

    try {
        const result = await window.StowageAPI.resetImportedDatabase();
        records = [];
        if (typeof render === 'function') render(false);
        if (typeof updateSummary === 'function') updateSummary();
        handleContainerSearch(false);
        if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
        const removedPositions = Number(result.deleted_positions ?? 0);
        const removedContainers = Number(result.deleted_containers ?? 0);
        const message = `Reset berhasil. ${removedPositions} posisi dikosongkan dan ${removedContainers} kontainer import dihapus.`;
        if ($('availableDbStatus')) $('availableDbStatus').textContent = message;
        alert(message);
    } catch (error) {
        console.error('Reset database gagal:', error);
        alert(`Reset database gagal: ${error.message}\n\nTidak ada perubahan yang dianggap berhasil. Periksa endpoint Laravel dan log server.`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.originalText || 'Reset Database';
            delete button.dataset.originalText;
        }
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

