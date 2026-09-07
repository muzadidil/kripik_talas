# Buku Kripik — Tahap 1

Catatan hutang ke produsen untuk usaha kripik. Web statis, jalan di GitHub Pages,
data di Firestore. Tidak perlu server, tidak perlu build, tidak perlu npm.

**Satuan sistem adalah bungkus.** Layar produsen menampilkan ball (1 ball = 10 bungkus).
Ini disengaja: warung membeli per bungkus, jadi kalau sistem menyimpan ball, angkanya
tidak akan pernah cocok dengan kenyataan begitu Tahap 2 jalan.

---

## Pasang — 15 menit

### 1. Buat project Firebase

Buka [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
Google Analytics boleh dimatikan.

### 2. Aktifkan login

**Build → Authentication → Get started → Email/Password → Enable → Save**

Lalu buka tab **Users → Add user**. Isi email dan kata sandi kamu.
**Salin `User UID`** yang muncul — dipakai di langkah 5.

Jangan aktifkan penyedia login lain. Kamu satu-satunya pengguna.

### 3. Buat database

**Build → Firestore Database → Create database → Start in production mode.**
Pilih lokasi `asia-southeast2` (Jakarta) — paling dekat, paling cepat.

Production mode artinya semua akses ditolak sampai langkah 5. Itu benar.

### 4. Tempel config

**Project settings ⚙ → General → Your apps → Web `</>`**
Daftarkan app, salin objek `firebaseConfig`, tempel ke **`js/config.js`**.

Sekalian isi bagian `usaha` di file yang sama — itu yang tercetak di kop nota.

### 5. Pasang security rules

Buka **Firestore Database → Rules**. Hapus isinya, tempel isi **`firestore.rules`**,
lalu ganti `UID_PEMILIK` dengan UID dari langkah 2. **Publish.**

> Kode aplikasi ini publik. `apiKey` bisa dilihat siapa saja — itu normal untuk Firebase.
> Tapi artinya file rules ini satu-satunya pengaman data kamu.
> **Kalau langkah ini dilewati, siapa pun bisa menghapus seluruh catatan kamu.**

### 6. Naikkan ke GitHub Pages

```bash
git init
git add .
git commit -m "Buku Kripik tahap 1"
git branch -M main
git remote add origin https://github.com/USERNAME/kripik.git
git push -u origin main
```

**Settings → Pages → Source: Deploy from a branch → main / (root) → Save.**

### 7. Arahkan domain

Di pengelola DNS `zasha.online`, tambahkan satu record:

| Tipe | Nama | Nilai |
|---|---|---|
| CNAME | `kripik` | `USERNAME.github.io` |

File `CNAME` sudah ada di repo. Tunggu DNS menyebar (5–30 menit),
lalu centang **Enforce HTTPS** di Settings → Pages.

Terakhir: **Authentication → Settings → Authorized domains → Add domain**
→ `kripik.zasha.online`. Tanpa ini login akan ditolak.

### 8. Mulai pakai

Buka `kripik.zasha.online`, masuk, lalu **menu ⋮ → Produk**.
Daftarkan kripik singkong, talas original, talas balado.
Setelah itu **Ambil** untuk mencatat pengambilan pertama.

---

## Cara kerjanya

**Alokasi FIFO.** Setiap pengambilan punya jatuh tempo sendiri. Waktu kamu setor uang,
sistem otomatis melunasi batch yang paling dekat jatuh temponya dulu. Rincian alokasi
tampil sebelum kamu simpan, dan ikut tercetak di nota — jadi produsen tahu persis
uangnya masuk ke pengambilan mana.

**Nota dibuat ulang, bukan disimpan.** Yang tersimpan adalah datanya. PDF dirakit
ulang setiap kali diminta, jadi nota 8 bulan lalu tetap bisa dicetak dengan isi
yang persis sama. Buka tab **Nota**.

**Retur bisa dipecah.** Barang basi bisa sebagian ditukar barang baru, sebagian
memotong hutang. Yang memotong hutang masuk alokasi FIFO seperti setoran.
Yang ditukar tidak mengubah hutang dan tidak membuat batch baru.

**Offline.** Firestore menyimpan cache di HP. Kalau sinyal hilang di jalan, aplikasi
tetap terbuka dan bisa dibaca. Perubahan tersinkron sendiri saat sinyal kembali.

---

## Struktur data

```
produk            nama, harga_beli, harga_titip          (per bungkus)
pengambilan       no, tanggal, items[], total,
                  terbayar, sisa, jatuh_tempo, lunas
setoran_produsen  no, tanggal, jumlah, alokasi[]
retur_produsen    no, tanggal, items[], nilai_potong, alokasi[]
counters/nota     penomoran berurutan: ambil, setor, retur
```

`warung` dan `mutasi_warung` menyusul di Tahap 2. Strukturnya sudah disiapkan
di fungsi export, jadi tidak perlu bongkar data.

---

## Rutin yang jangan dilewati

**Cadangan sebulan sekali.** Menu ⋮ → Simpan cadangan → pindahkan file JSON ke
Google Drive. Firestore paket gratis tidak punya backup otomatis. Kamu pindah dari
buku tulis karena takut hilang — jangan bikin masalah yang sama bentuknya lain.

**Nomor nota jangan sampai loncat.** Penomoran berurutan otomatis. Kalau kamu
menghapus dokumen langsung dari Firebase Console, nomornya bolong dan produsen
berhak curiga. Jangan edit data dari console.

---

## Belum ada di Tahap 1

- Warung: titip, setoran bertahap, retur bagus, retur basi
- Peta lokasi warung (Leaflet + OpenStreetMap, gratis, tanpa kartu kredit)
- Daftar "warung perlu dicek"
- Stok gudang masih hanya menghitung barang masuk

Layar **Stok gudang** sudah ada tapi belum dikurangi titipan ke warung.
Angkanya baru akurat setelah Tahap 2.

---

## Menjalankan di komputer

ES modules butuh HTTP, tidak bisa dibuka lewat `file://`.

```bash
php -S localhost:8000
```

Buka `http://localhost:8000`. Tambahkan `localhost` ke Authorized domains
di Firebase Authentication kalau mau login dari sini.
