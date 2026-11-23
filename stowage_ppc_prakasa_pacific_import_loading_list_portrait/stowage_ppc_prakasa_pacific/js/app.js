// Event Listeners
function updateMobileAccessLock() {
    const shouldLock = window.matchMedia('(max-width: 767px)').matches &&
        !$('mobileAccessPrompt').classList.contains('hidden');
    const backgroundElements = [$('appRoot'), document.querySelector('body > header')];

    backgroundElements.forEach((element) => {
        if (!element) return;
        if (shouldLock) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
    });
}

updateMobileAccessLock();
window.addEventListener('resize', updateMobileAccessLock);

$('mobileAccessContinueBtn').addEventListener('click', () => {
    $('mobileAccessPrompt').classList.add('hidden');
    updateMobileAccessLock();
});
$('mobileAccessDeclineBtn').addEventListener('click', () => {
    $('mobileAccessChoice').classList.add('hidden');
    $('mobileAccessDeclined').classList.remove('hidden');
    $('mobileAccessReconsiderBtn').focus({ preventScroll: true });
});
$('mobileAccessReconsiderBtn').addEventListener('click', () => {
    $('mobileAccessDeclined').classList.add('hidden');
    $('mobileAccessChoice').classList.remove('hidden');
    $('mobileAccessContinueBtn').focus({ preventScroll: true });
});
if (window.matchMedia('(max-width: 767px)').matches) {
    $('mobileAccessContinueBtn').focus({ preventScroll: true });
}

$('printPdfBtn').addEventListener('click', printStowage);
$('mobilePrintBtn').addEventListener('click', printStowage);
$('mobileSidebarBtn').addEventListener('click', openMobileSidebar);
$('tabletSidebarBtn')?.addEventListener('click', openMobileSidebar);

// Mode fokus layar penuh untuk pekerjaan lapangan di tablet/ponsel.
$('closeSidebarBtn').addEventListener('click', closeMobileSidebar);
$('sidebarBackdrop').addEventListener('click', closeMobileSidebar);

$('bays').addEventListener('pointerdown', releaseProgrammaticScrollLock, { passive: true });
$('bays').addEventListener('touchstart', releaseProgrammaticScrollLock, { passive: true });

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

    updateBayAutoScrollFromClientX(e.clientY);

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
                loadingPort: normalizePort($('stowageLoadingPort')?.value || currentDrag.container.loadingPort),
                port: normalizePort($('stowageDestinationPort')?.value || currentDrag.container.port),
                weight: currentDrag.container.weight,
                type: currentDrag.container.type || 'DC',
                remarks: currentDrag.container.remarks || '',
                dir40: 'forward'
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

        // Simpan koordinat visual sebelum render; elemen lama akan diganti oleh render().
        const originElBefore = $(`cell-${originBay}-${originSlot}`);
        const targetElBefore = $(`cell-${targetBay}-${targetSlot}`);
        const originRectBefore = originElBefore?.getBoundingClientRect();
        const targetRectBefore = targetElBefore?.getBoundingClientRect();

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
        requestAnimationFrame(() => {
            const originElAfter = $(`cell-${originBay}-${originSlot}`);
            const targetElAfter = $(`cell-${targetBay}-${targetSlot}`);

            // Kontainer A bergerak ke slot tujuan, kontainer B bergerak ke slot asal.
            animateSwapGlide(
                originRectBefore,
                targetElAfter,
                targetRectBefore,
                originElAfter,
                2000
            );
        });
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
        const duplicate = records.find((r) => String(r.number || '').trim().toUpperCase() === String(c.number || '').trim().toUpperCase());
        if (duplicate) {
            alert(`Kontainer ${c.number} sudah berada di ${bayLabel(duplicate.bay)} · ${getCellNo(duplicate.bay, duplicate.slot)}.`);
            return;
        }
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
            type: c.type || 'DC',
            remarks: c.remarks || '',
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
$('stowageDate')?.addEventListener('change', save);
$('stowageLoadingPort')?.addEventListener('change', save);
$('stowageDestinationPort')?.addEventListener('change', save);
$('clearAllBtn').addEventListener('click', clearAll);
$('resetAllBtn')?.addEventListener('click', clearAll);
$('containerActionsMenu')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) e.currentTarget.open = false;
});

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

// Muat daftar kontainer langsung ke dock tetap di bagian atas.
window.addEventListener('load', () => { ensureSidebarDatabaseLoaded(); });
