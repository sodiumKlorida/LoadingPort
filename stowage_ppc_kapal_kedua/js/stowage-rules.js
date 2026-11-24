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
    if (numBay < 1 || numBay > 17) return [];
    if (!slotsForBay(numBay).includes(numSlot)) return [];

    const dirs = [];

    // Ke Depan (bay - 2, minimal bay 1)
    const forwardBay = numBay - 2;
    if (forwardBay >= 1 && forwardBay <= 17 && slotsForBay(forwardBay).includes(numSlot)) {
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
    if (backwardBay >= 1 && backwardBay <= 17 && slotsForBay(backwardBay).includes(numSlot)) {
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
    return numBay + 2 <= 17 ? numBay + 2 : null;
}

function getBlockedTarget(bay, slot, dir = 'backward') {
    if (bay === 'AH') return null;
    const numBay = Number(bay);
    const numSlot = Number(slot);
    const targetBay = dir === 'forward' ? numBay - 2 : numBay + 2;
    if (targetBay < 1 || targetBay > 17) return null;
    if (!slotsForBay(targetBay).includes(numSlot)) return null;
    return { bay: targetBay, slot: numSlot };
}

function getBlockingRecord(bay, slot, ignoreRecordIds = null) {
    if (bay === 'AH') return null;
    const numBay = Number(bay);
    const numSlot = Number(slot);
    if (numBay < 1 || numBay > 17) return null;
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

