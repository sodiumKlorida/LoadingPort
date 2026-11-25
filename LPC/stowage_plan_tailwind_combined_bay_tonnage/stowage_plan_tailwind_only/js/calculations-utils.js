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
    // Simpan/tampilkan nama pelabuhan lengkap; jangan dipendekkan menjadi SUB/WGP.
    return String(v || '').replace(/\s+/g, ' ').trim().toUpperCase();
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

function animateSwapGlide(fromRectA, toElA, fromRectB, toElB, durationMs = 2000) {
    // fromRect harus diambil SEBELUM render ulang, karena elemen lama akan dilepas dari DOM.
    // Tidak ada stylesheet runtime; efek swap memakai utility Tailwind.

    const pairs = [
        { fromRect: fromRectA, to: toElA },
        { fromRect: fromRectB, to: toElB }
    ];

    pairs.forEach(({ fromRect, to }) => {
        if (!fromRect || !to) return;

        const toRect = to.getBoundingClientRect();
        if (!fromRect.width || !toRect.width) return;

        const dx = fromRect.left - toRect.left;
        const dy = fromRect.top - toRect.top;

        to.classList.add('transition-transform', 'duration-500', 'ease-out', 'scale-[1.02]', 'ring-2', 'ring-sky-400');
        requestAnimationFrame(() => to.classList.remove('scale-[1.02]'));
        const cleanup = () => to.classList.remove('transition-transform', 'duration-500', 'ease-out', 'scale-[1.02]', 'ring-2', 'ring-sky-400');
        setTimeout(cleanup, Math.min(durationMs, 700));
    });
}

// Catatan: fragmen kode swap yang tidak berada di dalam fungsi di file sumber
