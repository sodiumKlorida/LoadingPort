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
Print diatur A4 portrait dengan dua panel Bay tersusun atas-bawah per halaman (delapan panel menjadi empat halaman). Urutannya dari After Hatch di bagian atas hingga Bay 13 di bagian bawah. Pada dialog print pilih:
- Paper: A4
- Layout: Portrait
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
- Print CSS diperbaiki agar panel tidak memotong bagian IN HOLE. Pilih A4 Portrait dan aktifkan Background graphics saat menyimpan PDF.

### Perbaikan preview cetak
Preview cetak menggunakan A4 portrait dengan dua panel Bay tersusun vertikal per halaman, tinggi panel dibuat konsisten, dan isi panel dibatasi agar tidak menimpa panel di bawahnya. Pada dialog cetak, gunakan ukuran kertas A4, orientasi Portrait, skala 100% atau Default, dan matikan Headers and footers.


## Mode sinkronisasi manual (hemat kuota SheetDB)
- Sinkronisasi posisi tidak lagi berjalan otomatis setiap 7 detik.
- Saat halaman dibuka, aplikasi melakukan satu kali GET untuk mengambil posisi terakhir dari tab `STOWAGE_POSITIONS`.
- Setiap perubahan penempatan, pertukaran, edit, atau penghapusan disimpan lokal dan ditandai belum tersinkron; tidak mengirim request.
- Tekan tombol **Unggah** pada panel List Container:
  - Jika ada perubahan lokal, aplikasi mengirim perubahan (POST/PUT/DELETE) ke `STOWAGE_POSITIONS`.
  - Jika tidak ada perubahan lokal, aplikasi mengambil update terbaru dari server (GET).
- Pengguna perangkat lain perlu menekan **Unggah** untuk mengambil perubahan terbaru.
- Tab `CONTAINER_DATABASE` tetap menjadi sumber daftar kontainer. Data sumber dimuat ketika daftar dibuka dan menggunakan cache sesi browser.
- Catatan: perubahan lokal yang belum dikirim hanya ada di browser/perangkat tersebut. Tekan Unggah sebelum berpindah perangkat atau menutup sesi.


## Sinkronisasi hemat kuota: snapshot batch
Sinkronisasi manual sekarang mengirim satu snapshot lengkap melalui satu POST SheetDB, bukan satu request per kontainer. Snapshot lama tidak dihapus sehingga jika koneksi terputus saat upload, snapshot sebelumnya tetap aman. Saat membaca data, aplikasi memilih snapshot terbaru.
Tambahkan tiga header berikut di tab `STOWAGE_POSITIONS`:
- `snapshot_id`
- `record_kind`
- `snapshot_time`
Baris marker snapshot menggunakan `record_kind=SNAPSHOT`; baris kontainer menggunakan `record_kind=CONTAINER`. Data lama tanpa penanda snapshot tetap dibaca sebagai data legacy sampai snapshot pertama tersimpan.
Setiap klik Unggah yang mengirim perubahan = 1 request. Saat perangkat lain mengambil data = 1 GET request. Pembukaan aplikasi juga melakukan GET untuk memuat posisi awal.
Snapshot lama akan menumpuk di sheet; bersihkan/arsipkan snapshot lama secara berkala setelah memastikan snapshot terbaru sudah benar.


## Revisi navigasi lapangan
- Urutan area Bay vertikal dari atas ke bawah: After Hatch, Bay 01, Bay 03, Bay 05, Bay 07, Bay 09, Bay 11, lalu Bay 13. Saat aplikasi pertama dibuka, posisi scroll otomatis berada di bagian bawah pada Bay 13.
- Area Bay menggunakan scroll vertikal; auto-scroll saat drag juga mengikuti tepi atas/bawah.
- Header navigasi Bay dihilangkan. Area header utama sekarang menjadi dock List Container yang sticky di atas area Bay.
- Dock menyediakan pencarian nomor kontainer, filter Semua/20 FT/40 FT, status pemuatan database, tombol Refresh DB dan Unggah, serta kartu kontainer ringkas horizontal untuk drag-and-drop. Tombol Import Excel tersedia di Main Menu, tepat di bawah tombol cetak.
- Jika data CONTAINER_DATABASE gagal dimuat atau kosong, dock menampilkan keterangan dan tidak menampilkan daftar kosong tanpa penjelasan.
- Dropdown sidebar dihapus. Sidebar memuat Main Menu; ikon sembunyikan/tampilkan berada di kiri judul List Container dan berganti sesuai status sidebar.
- Tombol fullscreen dihapus.
- Tanda X untuk cell pasangan 40 FT dinaikkan z-index di tampilan web dan cetak.
- Aturan validasi penempatan 20/40 FT pada `stowage-rules.js` tidak diubah; seluruh pemeriksaan cell pasangan, batas Bay 13/After Hatch, dan aturan swap tetap berlaku.
