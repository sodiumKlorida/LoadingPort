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
            type: c.type || 'DC',
            dir40: 'forward'
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

