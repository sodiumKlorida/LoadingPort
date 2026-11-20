# Stowage Plan Container PPC — v3.10.3

## Struktur
- `index.html`: struktur halaman aplikasi.
- `css/style.css`: animasi tambahan.
- `js/config.js`: konfigurasi, konstanta, dan state utama.
- `js/ui-state.js`: state sidebar, metadata kapal, dan penyimpanan.
- `js/stowage-rules.js`: aturan validasi slot dan penempatan 40 FT.
- `js/drag-state.js`: state drag-drop, highlight, dan auto-scroll.
- `js/calculations-utils.js`: V.MOV, normalisasi data, parser CSV, utilitas.
- `js/render.js`: render BAY, slot, navigasi, pencarian, dan ringkasan.
- `js/database.js`: pemuatan database Google Sheets dan list kontainer.
- `js/modal.js`: modal, input/edit/hapus kontainer, validasi form.
- `js/app.js`: event listener dan inisialisasi aplikasi.

## Cara menjalankan
1. Ekstrak seluruh folder.
2. Jangan memindahkan file keluar dari struktur foldernya.
3. Buka `index.html` melalui browser. Untuk akses Google Sheets yang lebih konsisten,
   jalankan folder ini melalui local web server (misalnya VS Code Live Server).

## Catatan
- Tailwind CSS masih menggunakan CDN sehingga membutuhkan koneksi internet.
- File JavaScript menggunakan script klasik dan harus tetap dimuat sesuai urutan
  yang sudah ditulis di `index.html`.
- Data kontainer tersimpan pada `localStorage` browser yang digunakan.

## Animasi pertukaran kontainer
- Setelah konfirmasi pertukaran disetujui, kedua kontainer bergerak menuju posisi baru.
- Durasi animasi diatur menjadi 2 detik (2000 ms) melalui `animateSwapGlide()` di `js/calculations-utils.js`.

## Koneksi database SheetDB
- Endpoint: `https://sheetdb.io/api/v1/havitus7q8grs?sheet=DATABASE_CONTAINER`
- Pengambilan data memakai `fetch` GET dengan `mode: 'cors'` dan respons JSON.
- Header kolom yang dikenali: `Nomor Container`, `Pelabuhan Awal`, `Pelabuhan Tujuan`, `Berat`, dan `Feet`.
- Jangan mengganti `mode: 'cors'` menjadi `no-cors`; mode tersebut membuat respons tidak dapat dibaca JavaScript.

## Database SheetDB terbaru
- Endpoint: `https://sheetdb.io/api/v1/uk78l777buob7?sheet=CONTAINER_DATABASE`
- Nama sheet yang dipanggil: `CONTAINER_DATABASE`.
- Struktur kolom mengikuti JSON contoh: `Nomor Container`, `Pelabuhan Awal`, `Pelabuhan Tujuan`, `Berat`, `Feet`.
- Cache browser diperbarui ke versi V2 agar cache dari endpoint/sheet sebelumnya tidak dipakai.
