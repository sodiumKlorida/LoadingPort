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

function animateSwapGlide(fromRectA, toElA, fromRectB, toElB, durationMs = 2000) {
    // fromRect harus diambil SEBELUM render ulang, karena elemen lama akan dilepas dari DOM.
    if (!document.getElementById('swap-glide-style')) {
        const style = document.createElement('style');
        style.id = 'swap-glide-style';
        style.textContent = `
            @keyframes swapGlideToTarget {
                0% {
                    transform: translate3d(var(--swap-dx, 0px), var(--swap-dy, 0px), 0) scale(1.04);
                    z-index: 50;
                    box-shadow: 0 18px 30px -8px rgba(15, 23, 42, 0.30);
                    filter: brightness(1.08);
                }
                65% {
                    transform: translate3d(calc(var(--swap-dx, 0px) * -0.035), calc(var(--swap-dy, 0px) * -0.035), 0) scale(1.025);
                    z-index: 50;
                }
                100% {
                    transform: translate3d(0, 0, 0) scale(1);
                    z-index: 10;
                    box-shadow: none;
                    filter: none;
                }
            }
            .swap-glide-anim {
                animation-name: swapGlideToTarget;
                animation-duration: var(--swap-duration, 500ms);
                animation-timing-function: cubic-bezier(0.22, 0.75, 0.25, 1);
                animation-fill-mode: both;
                will-change: transform, filter;
                transform-origin: center;
            }
            @media (prefers-reduced-motion: reduce) {
                .swap-glide-anim { animation-duration: 1ms !important; }
            }
        `;
        document.head.appendChild(style);
    }

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

        to.style.setProperty('--swap-dx', `${dx}px`);
        to.style.setProperty('--swap-dy', `${dy}px`);
        to.style.setProperty('--swap-duration', `${durationMs}ms`);
        to.classList.remove('swap-glide-anim');
        void to.offsetWidth;
        to.classList.add('swap-glide-anim');

        const cleanup = () => {
            to.classList.remove('swap-glide-anim');
            to.style.removeProperty('--swap-dx');
            to.style.removeProperty('--swap-dy');
            to.style.removeProperty('--swap-duration');
        };

        to.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, durationMs + 50);
    });
}

// Catatan: fragmen kode swap yang tidak berada di dalam fungsi di file sumber
