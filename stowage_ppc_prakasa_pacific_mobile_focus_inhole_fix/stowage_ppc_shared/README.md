# Stowage Plan PPC – Sinkronisasi bersama (Vercel + Google Sheets)

## 1. Buat tab baru di Google Sheets
Gunakan spreadsheet yang sama dengan database `CONTAINER_DATABASE`, lalu tambahkan tab bernama **STOWAGE_POSITIONS**.

Baris pertama (header) harus persis seperti ini:

`id | nomor_container | feet | bay | row | tier | cell_no | type | dir40 | loading_port | destination_port | weight_ton | mov`

Satu baris = satu kontainer yang benar-benar diletakkan pada posisi kapal. Jangan isi data posisi secara manual saat aplikasi sedang dipakai, kecuali untuk migrasi awal.

## 2. Konfigurasi SheetDB
SheetDB harus terhubung ke spreadsheet yang sama. Endpoint yang digunakan aplikasi:
`https://sheetdb.io/api/v1/uk78l777buob7?sheet=STOWAGE_POSITIONS`

Pastikan API SheetDB mengizinkan GET, POST, PUT, DELETE untuk sheet ini. Jangan membagikan endpoint write ke publik bila konfigurasi SheetDB Anda memakai API key/fitur keamanan yang belum disiapkan.

## 3. Deploy ke Vercel
Upload seluruh isi folder project dengan struktur:
- `index.html`
- `css/style.css`
- `js/*.js`

Commit/push ke GitHub lalu tunggu deployment Vercel selesai. Semua visitor harus membuka URL deployment yang sama.

## 4. Cara kerja
- Saat aplikasi dibuka, posisi diambil dari tab `STOWAGE_POSITIONS`.
- Saat ada visitor menambah/mengedit/menghapus posisi, perubahan dikirim ke SheetDB.
- Tab lain memeriksa pembaruan setiap 7 detik.
- Kolom `id` menjadi kunci update dan delete.

## 5. Arah 40 FT
- **Ke Depan (menuju Bay 01)** = bay pasangan bernomor 2 lebih kecil (misalnya Bay 05 menuju Bay 03).
- **Ke Belakang (menuju Bay 13)** = bay pasangan bernomor 2 lebih besar (misalnya Bay 05 menuju Bay 07).
- Arah depan tetap menggunakan aturan fisik bay -2; teks pilihan diperjelas dan drag dari daftar memakai arah depan sebagai pilihan awal.

## 6. Cetak
Print diatur A4 landscape dengan 4 panel bay per halaman, sehingga 8 panel ditargetkan menjadi 2 halaman. Pada dialog print pilih:
- Paper: A4
- Layout: Landscape
- Scale: 100% atau Fit to printable area
- Margins: Default/Minimum
- Matikan Header and Footer browser

## Catatan penting sebelum dipakai ramai-ramai
Versi ini memakai SheetDB sebagai penyimpanan bersama dengan polling 7 detik. Dua orang yang mengedit posisi yang sama hampir bersamaan masih dapat menghasilkan konflik (last write wins). Untuk penggunaan operasional multi-user yang kritis, backend dengan transaksi/locking dan autentikasi (mis. Supabase/Firebase) lebih aman. SheetDB API key/endpoint write yang tertanam di frontend dapat dilihat oleh visitor; batasi akses sesuai kemampuan paket SheetDB Anda.

Sebelum penggunaan produksi, uji tambah, edit, hapus, 40 FT, dan buka URL dari dua perangkat/browser sekaligus.


## Revisi mode lapangan dan informasi voyage
- Tombol **Fokus Bay** mengaktifkan fullscreen browser (jika didukung) dan menyembunyikan sidebar agar navigasi Bay serta konten Bay menjadi fokus.
- Main Menu kini memiliki Pelabuhan Awal dan Pelabuhan Tujuan.
- Tambahkan kolom berikut pada tab `STOWAGE_POSITIONS` setelah kolom `mov`: `stowage_loading_port`, `stowage_destination_port`, `ship_name`, `voyage`, `stowage_date`. Informasi voyage disimpan bersama setiap posisi agar dapat dibaca perangkat lain.
- Kontainer yang sudah ditempatkan otomatis hilang dari list tersedia; saat dihapus dari Bay, akan muncul kembali. Nomor kontainer duplikat juga ditolak.
- Print CSS diperbaiki agar panel tidak memotong bagian IN HOLE. Tetap pilih A4 Landscape dan aktifkan Background graphics saat menyimpan PDF.
