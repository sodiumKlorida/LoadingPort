const DB_CACHE_KEY = 'stowageApiTemporaryCache';

// Ukuran yang dikenal aplikasi. 21 FT sengaja didukung karena tidak pernah
// masuk dari import Excel, sehingga hanya bisa dibuat lewat input manual.
const VALID_SIZE_LABELS = ['20 FT', '21 FT', '40 FT'];

function normalizeSizeLabel(value) {
    const ft = Number(String(value ?? '').match(/\d+/)?.[0] || 20);
    const label = `${ft} FT`;
    return VALID_SIZE_LABELS.includes(label) ? label : '20 FT';
}

function sizeFtFromLabel(value) {
    return Number(normalizeSizeLabel(value).replace(/\D/g, ''));
}

// 20 FT dan 21 FT menempati 1 cell, jadi boleh saling diubah.
// 40 FT memakai 2 bay + arah Depan/Belakang, jadi tidak boleh diubah lewat edit.
function isSingleCellSize(value) {
    return [20, 21].includes(sizeFtFromLabel(value));
}

let databaseRows = [];
let selectedDatabaseRow = null;
let activeBay = 13;
let isProgrammaticScroll = false;
let programmaticScrollTimer = null;

// Sidebar View & Filter State
let sidebarViewMode = 'main'; // 'main' | 'containers'
let sidebarSizeFilter = 'ALL'; // 'ALL' | '20' | '21' | '40'
let sidebarTonnageSort = 'none'; // 'none' | 'asc' | 'desc'

// Drag & Drop State (baik dari slot bay maupun dari list container sidebar)
let draggedItem = null; // { source: 'slot', record: {...} } | { source: 'pool', container: {...} }
let autoScrollRaf = null;
let autoScrollVelocity = 0;

// Kapal kedua menggunakan dua Cargo Hold dengan empat Bay ganjil per hold.
const BAY_IDS = [15, 13, 11, 9, 7, 5, 3, 1];
const CARGO_HOLD_GROUPS = [
    { id: 1, label: 'CARGO HOLD 1', bays: [1, 3, 5, 7] },
    { id: 2, label: 'CARGO HOLD 2', bays: [9, 11, 13, 15] }
];
const ALLOWED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const CELL_LAYOUT = {
    1: { row: 4, tier: 8 },
    2: { row: 2, tier: 8 },
    3: { row: 1, tier: 8 },
    4: { row: 3, tier: 8 },
    5: { row: 4, tier: 6 },
    6: { row: 2, tier: 6 },
    7: { row: 1, tier: 6 },
    8: { row: 3, tier: 6 },
    9: { row: 4, tier: 4 },
    10: { row: 2, tier: 4 },
    11: { row: 1, tier: 4 },
    12: { row: 3, tier: 4 },
    13: { row: 4, tier: 2 },
    14: { row: 2, tier: 2 },
    15: { row: 1, tier: 2 },
    16: { row: 3, tier: 2 },
    17: { row: 2, tier: 10 },
    18: { row: 1, tier: 10 }
};

// Browser storage tidak digunakan sebagai database atau cache sumber data.
// Data posisi selalu dimuat dari Laravel API. Browser storage bukan database.
let records = [];
const $ = (id) => document.getElementById(id);

