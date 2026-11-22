# Kastriva Employee Attendance

Aplikasi Next.js untuk absensi karyawan dengan Google Apps Script (GAS) sebagai backend, Google Sheets untuk data, dan Google Drive untuk foto.

## Menjalankan aplikasi lokal

1. Pasang Node.js versi yang sesuai dengan proyek.
2. Jalankan `npm install` di folder repository.
3. Salin `.env.example` menjadi `.env.local` dan isi variabel server-only yang diperlukan.
4. Jalankan `npm run dev`, lalu buka `http://localhost:3000`.

Jangan commit `.env.local` atau membagikan nilai secret.

## Fitur yang ada di repository

- Login menggunakan NIK dan PIN, role admin/karyawan, dan session cookie `HttpOnly`.
- Pembuatan dan aktivasi/nonaktifkan karyawan oleh admin.
- Absensi masuk/pulang dengan selfie dari kamera, data lokasi, pemeriksaan radius kantor, dan timestamp pencatatan dari server.
- Proxy Next.js ke endpoint GAS; secret GAS hanya dikirim dari server.
- Foto absensi disimpan melalui GAS ke Google Drive.
- Throttle login dasar: maksimal lima percobaan per NIK selama jendela 15 menit, dengan CacheService GAS.

Throttle memakai cache sementara. Google menyatakan entri cache dapat hilang lebih awal, sehingga ini bukan pengganti rate limiting terkelola yang tahan terhadap serangan terdistribusi. Untuk penggunaan produksi, tambahkan perlindungan di edge atau layanan rate limiter yang persisten.

## Konfigurasi integrasi

Next.js memerlukan `GAS_WEB_APP_URL` dan `GAS_SHARED_SECRET` di environment server. URL harus berakhir dengan `/exec`; secret tidak boleh memakai awalan `NEXT_PUBLIC_`.

GAS memerlukan Script Properties `APP_SHARED_SECRET` dan `PIN_PEPPER`. Nilai `APP_SHARED_SECRET` harus sama dengan `GAS_SHARED_SECRET`. Endpoint GAS hanya boleh diakses melalui proxy aplikasi.

Untuk deployment baru, siapkan Spreadsheet dan proyek GAS baru terlebih dahulu. `setupSystem()` membuat sheet/header yang diperlukan dan `createFirstAdmin()` membuat admin pertama; gunakan hanya saat menyiapkan instalasi baru yang memang disetujui. **Jangan menjalankan keduanya pada instalasi yang sudah berisi data tanpa backup dan rencana migrasi.** Endpoint publik tidak menyediakan aksi `initialize`.

Deploy GAS sebagai Web App dengan izin akses yang sesuai, kemudian atur environment variables untuk environment Vercel yang dipakai. Jangan mengubah environment Production untuk sekadar menguji Preview.

## Batasan keamanan yang perlu dipahami

- Browser menyediakan koordinat GPS; server memeriksa rentang, akurasi, dan jarak, tetapi koordinat browser masih dapat dipalsukan.
- UI tidak menyediakan unggah galeri, tetapi request HTTP dapat dibuat di luar UI. Backend dapat memvalidasi format dan ukuran gambar, bukan membuktikan sumber kamera.
- Watermark dibuat di browser dan tidak menjadi bukti independen. Timestamp absensi yang disimpan GAS menggunakan waktu server.
- Pastikan folder Drive untuk foto tetap privat dan izinkan akses hanya kepada pihak berwenang.
- Throttle login berdasarkan NIK tidak membatasi percobaan berdasarkan alamat IP dan dapat kehilangan state saat cache dihapus.

## Fitur yang belum tersedia di UI

Dashboard HR dan statistik, edit/reset PIN karyawan, riwayat serta ekspor absensi, laporan, pengajuan izin/sakit, dan retensi otomatis foto belum tersedia sebagai modul lengkap. Fitur tersebut perlu dibangun dan diuji sebelum aplikasi dinyatakan siap produksi.

## Pemeriksaan sebelum rilis

- Jalankan lint, pemeriksaan TypeScript, dan build.
- Uji integrasi GAS dan alur login/absensi pada Preview yang dapat diakses.
- Pastikan Spreadsheet, izin Drive, environment Vercel, dan kebijakan retensi telah diverifikasi oleh pemiliknya.
- Jangan merge ke `main` sebelum pemeriksaan dan uji lapangan selesai.
