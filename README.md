# Buku Kripik

Catatan hutang ke distributor dan titipan ke warung untuk usaha kripik. Web statis,
jalan di GitHub Pages, data di Firestore. Tidak perlu server, tidak perlu build,
tidak perlu npm.

Alurnya dua arah: **distributor → kamu** (ambil barang, bayar hutang, retur basi) dan
**kamu → warung** (titip barang, terima uang saat laku, tarik yang basi).

**Satuan sistem adalah bungkus.** Layar produsen menampilkan ball (1 ball = 10 bungkus).
Ini disengaja: warung membeli per bungkus, jadi kalau sistem menyimpan ball, angkanya
tidak akan pernah cocok dengan kenyataan begitu Tahap 2 jalan.

---

## Pasang — 15 menit

### 1. Buat project Firebase

Buka [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
Google Analytics boleh dimatikan.

### 2. Buat database

**Build → Firestore Database → Create database → Start in production mode.**
Pilih lokasi `asia-southeast2` (Jakarta) — paling dekat, paling cepat.

Production mode artinya semua akses ditolak sampai langkah 4. Itu benar.

### 3. Tempel config

**Project settings ⚙ → General → Your apps → Web `</>`**
Daftarkan app, salin objek `firebaseConfig`, tempel ke **`js/config.js`**.

Sekalian isi bagian `usaha` di file yang sama — itu yang tercetak di kop nota.
Ganti juga `APP_PASSWORD` kalau tidak mau pakai `"zasha"`.

### 4. Pasang security rules

Buka **Firestore Database → Rules**. Hapus isinya, tempel isi **`firestore.rules`**,
lalu **Publish**.

> **PENTING — dibaca dulu sebelum lanjut.**
> Aplikasi ini sengaja **tidak pakai Firebase Auth**. Layar kata sandi ("zasha")
> hanya penghalang tampilan di browser, bukan pengaman data. `firestore.rules`
> di sini terbuka (`allow read, write: if true;`) — artinya **siapa pun yang
> tahu `projectId` kamu (terlihat di source kode publik) bisa membaca dan
> MENGHAPUS seluruh catatan hutang, langsung lewat API, tanpa buka aplikasinya
> sama sekali.** Ini pilihan yang disadari demi kesederhanaan, bukan bug.
> Kalau berubah pikiran, pasang Firebase Auth dan kunci rules ke UID pemilik.
> Karena tidak ada pengaman, **cadangan rutin (lihat bagian di bawah) menjadi
> jauh lebih penting**, bukan sekadar jaga-jaga.

### 5. Naikkan ke GitHub Pages

```bash
git init
git add .
git commit -m "Buku Kripik tahap 1"
git branch -M main
git remote add origin https://github.com/USERNAME/kripik.git
git push -u origin main
```

**Settings → Pages → Source: Deploy from a branch → main / (root) → Save.**

### 6. Arahkan domain

Di pengelola DNS `zasha.online`, tambahkan satu record:

| Tipe | Nama | Nilai |
|---|---|---|
| CNAME | `kripik` | `USERNAME.github.io` |

File `CNAME` sudah ada di repo. Tunggu DNS menyebar (5–30 menit),
lalu centang **Enforce HTTPS** di Settings → Pages.

### 7. Mulai pakai

Buka `kripik.zasha.online`, masukkan kata sandi, lalu urutannya:

1. **Menu ⋮ → Produk** — daftarkan kripik singkong, talas original, talas balado
   beserta harga beli dan harga titipnya
2. **Ambil** — catat pengambilan pertama dari distributor
3. **Warung** — daftarkan warung, lalu **Catat kunjungan** untuk menitipkan barang
4. **Laporan** — semua angkanya muncul di sini setelah ada data

---

## Cara kerjanya

**Alokasi FIFO.** Setiap pengambilan punya jatuh tempo sendiri. Waktu kamu setor uang,
sistem otomatis melunasi batch yang paling dekat jatuh temponya dulu. Rincian alokasi
tampil sebelum kamu simpan, dan ikut tercetak di nota — jadi produsen tahu persis
uangnya masuk ke pengambilan mana.

**Jatuh tempo otomatis 2 bulan.** Itu jatah tempo dari distributor, jadi form
pengambilan mengisinya sendiri dari tanggal ambil. Kalau tanggal ambil diganti,
tempo ikut geser — kecuali kamu sudah mengubahnya manual, yang berarti ada
kesepakatan lain. Angka 2 bulan ada di `TEMPO_BULAN` pada `js/app.js`.

**Nota dibuat ulang, bukan disimpan.** Yang tersimpan adalah datanya. PDF dirakit
ulang setiap kali diminta, jadi nota 8 bulan lalu tetap bisa dicetak dengan isi
yang persis sama. Empat jenis nota — pengambilan, setoran, retur, kunjungan warung —
semuanya bisa dicetak ulang dari tab **Nota**.

**Retur bisa dipecah.** Barang basi bisa sebagian ditukar barang baru, sebagian
memotong hutang. Yang memotong hutang masuk alokasi FIFO seperti setoran.
Yang ditukar tidak mengubah hutang dan tidak membuat batch baru.

**Kunjungan warung menyelesaikan semuanya sekaligus.** Satu form: hitung sisa fisik
di rak, sistem menghitung sendiri berapa yang laku (`stok tercatat − sisa − basi`),
lalu kamu isi uang yang diterima dan barang yang dititipkan lagi. Kurang bayar jadi
piutang warung, kelebihan tidak hilang. Warung boleh nyicil atau lunas, sistem tidak
memaksa.

**Untung dihitung hanya dari yang benar-benar laku.** `laku × (harga titip − harga
beli)`. Barang yang masih di gudang atau masih di rak warung belum dihitung untung —
itu masih modal tertahan, bukan laba.

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
warung            nama, pemilik, hp, alamat,
                  stok{produk_id: {nama, qty, harga_titip}},
                  piutang, kunjungan_terakhir
kunjungan_warung  no, warung_id, tanggal, items[],
                  nilai_laku, untung, dibayar,
                  piutang_sebelum, piutang_sesudah
counters/nota     penomoran berurutan: ambil, setor, retur, kunjungan
```

---

## Rutin yang jangan dilewati

**Cadangan sebulan sekali — atau lebih sering.** Menu ⋮ → Simpan cadangan → pindahkan
file JSON ke Google Drive. Firestore paket gratis tidak punya backup otomatis, dan
karena Tahap 1 ini tidak pakai Firebase Auth (lihat peringatan di langkah 4), data
bisa hilang bukan cuma karena kesalahan sendiri, tapi juga karena orang lain yang
menemukan `projectId` ini. Kamu pindah dari buku tulis karena takut hilang — jangan
bikin masalah yang sama bentuknya lain.

**Nomor nota boleh bolong kalau itu koreksi kesalahan lewat aplikasi — jangan
pernah lewat Firebase Console.** Menghapus lewat aplikasi (lihat di bawah)
membalik efeknya dengan benar (hutang/piutang/stok ikut disesuaikan) dan
nomornya memang sengaja dilewati, itu wajar. Menghapus langsung dari Firebase
Console tidak membalik apa pun — hutang/piutang jadi salah tanpa jejak. Jangan
edit data dari console.

---

## Salah input? Ubah atau hapus

**Pengambilan** boleh diubah atau dihapus bebas selama belum ada setoran/retur
yang menyentuhnya (`terbayar` masih 0). Begitu sudah kena alokasi sekali saja,
kedua tombol itu hilang — supaya angka di nota setoran yang sudah tercetak
tidak pernah jadi bohong.

**Setoran dan retur** boleh dihapus kapan pun, urutan berapa pun. Menghapusnya
membalik alokasi FIFO-nya — pengambilan yang tadi kena potong otomatis balik
ke sisa hutang semula. Tidak ada mode "ubah" untuk keduanya: kalau salah,
hapus lalu catat ulang yang benar. Itu lebih aman daripada mengedit alokasi
yang sudah menyebar ke beberapa dokumen sekaligus.

**Kunjungan warung** hanya boleh dihapus kalau itu kunjungan **paling baru**
untuk warung tersebut. Kalau sudah ada kunjungan berikutnya yang dicatat di
atasnya, hapus dulu yang paling baru itu, baru mundur. Menghapusnya
mengembalikan stok dan piutang warung persis seperti sebelum kunjungan itu
terjadi.

Semua penghapusan lewat aplikasi minta konfirmasi dulu dan tidak bisa
dibatalkan setelah ditekan.

---

## Belum ada

- Peta lokasi warung (Leaflet + OpenStreetMap, gratis, tanpa kartu kredit)
- Barang basi yang ditarik dari warung belum otomatis masuk ke form Retur —
  masih harus diketik ulang di tab Retur saat mau dikembalikan ke distributor
- Grafik tren penjualan per bulan
- Belum ada pencarian/filter di daftar warung (belum perlu selama warungnya
  masih sedikit)

---

## Menjalankan di komputer

ES modules butuh HTTP, tidak bisa dibuka lewat `file://`.

```bash
php -S localhost:8000
```

Buka `http://localhost:8000`.
