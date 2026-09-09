import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, getDoc, addDoc, setDoc, deleteDoc,
  query, where, orderBy, limit, runTransaction, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { firebaseConfig } from './config.js?v=2026-09-09-1';
import { keDate } from './util.js';

const app = initializeApp(firebaseConfig);

// Cache lokal supaya aplikasi tetap jalan saat sinyal hilang di jalan.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

/* ============================================================
   PRODUK
   ============================================================ */

export async function ambilProduk() {
  const s = await getDocs(query(collection(db, 'produk'), orderBy('nama')));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export const simpanProduk = (data, id = null) =>
  id ? setDoc(doc(db, 'produk', id), data, { merge: true })
     : addDoc(collection(db, 'produk'), { ...data, created_at: serverTimestamp() });

export const hapusProduk = id => deleteDoc(doc(db, 'produk', id));

/* ============================================================
   PENGAMBILAN
   ============================================================ */

export async function ambilPengambilan({ hanyaBelumLunas = false } = {}) {
  const s = await getDocs(query(collection(db, 'pengambilan'), orderBy('tanggal', 'desc')));
  let hasil = s.docs.map(d => ({ id: d.id, ...d.data() }));
  if (hanyaBelumLunas) hasil = hasil.filter(p => (p.sisa || 0) > 0);
  return hasil;
}

/**
 * items: [{ produk_id, nama, qty, harga }]  — qty dalam BUNGKUS
 */
export async function simpanPengambilan({ tanggal, items, jatuh_tempo, catatan }) {
  const total = items.reduce((n, i) => n + i.qty * i.harga, 0);

  return runTransaction(db, async tx => {
    const { cRef, urut } = await bacaUrut(tx, 'ambil');
    const no = nomorNota('AM-', urut);

    tx.set(cRef, { ambil: urut }, { merge: true });
    tx.set(doc(collection(db, 'pengambilan')), {
      no, tanggal: Timestamp.fromDate(tanggal),
      items, total, terbayar: 0, sisa: total, lunas: false,
      jatuh_tempo: jatuh_tempo ? Timestamp.fromDate(jatuh_tempo) : null,
      catatan: catatan || '',
      created_at: serverTimestamp()
    });
    return { no, total };
  });
}

/**
 * Ubah pengambilan yang salah input. Hanya boleh selama belum ada uang
 * yang menyentuhnya (terbayar === 0) -- begitu sudah dialokasikan lewat
 * setoran/retur, mengubah total di sini akan bikin angka itu tidak nyambung
 * lagi dengan yang sudah tercatat di nota lain.
 */
export async function ubahPengambilan(id, { tanggal, items, jatuh_tempo, catatan }) {
  const total = items.reduce((n, i) => n + i.qty * i.harga, 0);
  return runTransaction(db, async tx => {
    const ref  = doc(db, 'pengambilan', id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Data pengambilan sudah tidak ada. Muat ulang halaman.');
    if ((snap.data().terbayar || 0) > 0) {
      throw new Error('Sudah pernah disetor/dipotong sebagian, tidak bisa diubah lagi.');
    }
    tx.update(ref, {
      tanggal: Timestamp.fromDate(tanggal), items, total, sisa: total,
      jatuh_tempo: jatuh_tempo ? Timestamp.fromDate(jatuh_tempo) : null,
      catatan: catatan || ''
    });
    return { total };
  });
}

/** Hapus pengambilan yang salah input. Sama seperti ubah: hanya boleh
 *  selama terbayar === 0, supaya tidak meninggalkan alokasi yang menunjuk
 *  ke dokumen yang sudah tidak ada. */
export async function hapusPengambilan(p) {
  if ((p.terbayar || 0) > 0) {
    throw new Error('Sudah pernah disetor/dipotong sebagian, tidak bisa dihapus. Hapus dulu setoran/retur yang memotongnya.');
  }
  await deleteDoc(doc(db, 'pengambilan', p.id));
}

/* ============================================================
   ALOKASI FIFO
   Uang masuk melunasi batch yang paling dekat jatuh tempo dulu.
   Fungsi murni — dipakai untuk pratinjau maupun penyimpanan.
   ============================================================ */

export function alokasiFIFO(daftar, jumlah) {
  const urut = daftar
    .filter(p => (p.sisa || 0) > 0)
    .sort((a, b) => {
      const ta = keDate(a.jatuh_tempo)?.getTime() ?? Infinity;
      const tb = keDate(b.jatuh_tempo)?.getTime() ?? Infinity;
      if (ta !== tb) return ta - tb;
      return (keDate(a.tanggal)?.getTime() ?? 0) - (keDate(b.tanggal)?.getTime() ?? 0);
    });

  const alokasi = [];
  let sisa = Math.round(jumlah);

  for (const p of urut) {
    if (sisa <= 0) break;
    const bayar = Math.min(sisa, p.sisa);
    alokasi.push({
      pengambilan_id: p.id,
      no: p.no,
      jumlah: bayar,
      jatuh_tempo: p.jatuh_tempo || null,
      sisa_sebelum: p.sisa,
      sisa_sesudah: p.sisa - bayar
    });
    sisa -= bayar;
  }
  return { alokasi, lebih: sisa };
}

/* Firestore mewajibkan SEMUA baca selesai sebelum tulis pertama di dalam
   satu transaksi. Karena itu tiap operasi dipecah jadi pasangan baca/tulis
   terpisah, bukan satu fungsi yang mencampur keduanya. */

/** BACA: ambil dokumen pengambilan yang akan dipotong alokasi. */
async function bacaAlokasi(tx, alokasi) {
  const dibaca = [];
  for (const a of alokasi) {
    const ref  = doc(db, 'pengambilan', a.pengambilan_id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Data pengambilan sudah tidak ada. Muat ulang halaman.');
    dibaca.push({ ref, data: snap.data(), a });
  }
  return dibaca;
}

/** TULIS: terapkan hasil bacaAlokasi ke dokumen pengambilan. */
function tulisAlokasi(tx, dibaca) {
  for (const { ref, data, a } of dibaca) {
    if ((data.sisa || 0) < a.jumlah) {
      throw new Error('Sisa hutang berubah sejak layar ini dibuka. Muat ulang lalu ulangi.');
    }
    const terbayar = (data.terbayar || 0) + a.jumlah;
    const sisa     = (data.total || 0) - terbayar;
    tx.update(ref, { terbayar, sisa, lunas: sisa <= 0 });
  }
}

/** BACA: kembalikan dokumen pengambilan yang alokasinya mau DIBATALKAN. */
async function bacaAlokasiBalik(tx, alokasi) {
  const dibaca = [];
  for (const a of alokasi || []) {
    const ref  = doc(db, 'pengambilan', a.pengambilan_id);
    const snap = await tx.get(ref);
    // Kalau dokumennya sudah tidak ada (harusnya tidak mungkin, karena
    // pengambilan yang sudah kena alokasi tidak bisa dihapus), lewati saja
    // daripada gagal total -- yang penting sisa alokasi lain tetap dibalik.
    if (snap.exists()) dibaca.push({ ref, data: snap.data(), a });
  }
  return dibaca;
}

/** TULIS: kurangi terbayar/sisa sesuai alokasi yang dibatalkan. */
function tulisAlokasiBalik(tx, dibaca) {
  for (const { ref, data, a } of dibaca) {
    const terbayar = Math.max(0, (data.terbayar || 0) - a.jumlah);
    const sisa     = (data.total || 0) - terbayar;
    tx.update(ref, { terbayar, sisa, lunas: sisa <= 0 });
  }
}

/** BACA: nomor urut berikutnya untuk satu jenis nota. */
async function bacaUrut(tx, jenis) {
  const cRef  = doc(db, 'counters', 'nota');
  const cSnap = await tx.get(cRef);
  return { cRef, urut: ((cSnap.exists() ? cSnap.data()[jenis] : 0) || 0) + 1 };
}

const nomorNota = (awalan, urut) => awalan + String(urut).padStart(4, '0');

/* ============================================================
   SETORAN KE PRODUSEN
   ============================================================ */

export async function simpanSetoran({ tanggal, jumlah, alokasi, lebih, catatan }) {
  return runTransaction(db, async tx => {
    // ---- baca ----
    const { cRef, urut } = await bacaUrut(tx, 'setor');
    const dibaca = await bacaAlokasi(tx, alokasi);

    // ---- tulis ----
    const no = nomorNota('ST-', urut);
    tx.set(cRef, { setor: urut }, { merge: true });
    tulisAlokasi(tx, dibaca);
    tx.set(doc(collection(db, 'setoran_produsen')), {
      no, tanggal: Timestamp.fromDate(tanggal),
      jumlah, alokasi, lebih: lebih || 0,
      catatan: catatan || '',
      created_at: serverTimestamp()
    });
    return { no };
  });
}

/** Hapus setoran yang salah input. Efeknya dibalik dulu ke pengambilan
 *  yang tadi kena alokasi -- boleh dihapus kapan pun, tidak peduli urutan,
 *  karena membalik hanya mengurangi angka, bukan menimpanya. */
export async function hapusSetoran(s) {
  return runTransaction(db, async tx => {
    const dibaca = await bacaAlokasiBalik(tx, s.alokasi);
    tulisAlokasiBalik(tx, dibaca);
    tx.delete(doc(db, 'setoran_produsen', s.id));
  });
}

export async function ambilSetoran(batas = 100) {
  const s = await getDocs(query(
    collection(db, 'setoran_produsen'), orderBy('tanggal', 'desc'), limit(batas)));
  return s.docs.map(d => ({ id: d.id, jenis: 'setoran', ...d.data() }));
}

/* ============================================================
   RETUR KE PRODUSEN
   items: [{ produk_id, nama, harga, qty_tukar, qty_potong }]
   ============================================================ */

export async function simpanRetur({ tanggal, items, alokasi, lebih, catatan }) {
  const total_tukar  = items.reduce((n, i) => n + i.qty_tukar, 0);
  const total_potong = items.reduce((n, i) => n + i.qty_potong, 0);
  const nilai_potong = items.reduce((n, i) => n + i.qty_potong * i.harga, 0);

  return runTransaction(db, async tx => {
    // ---- baca ----
    const { cRef, urut } = await bacaUrut(tx, 'retur');
    const dibaca = alokasi?.length ? await bacaAlokasi(tx, alokasi) : [];

    // ---- tulis ----
    const no = nomorNota('RT-', urut);
    tx.set(cRef, { retur: urut }, { merge: true });
    tulisAlokasi(tx, dibaca);
    tx.set(doc(collection(db, 'retur_produsen')), {
      no, tanggal: Timestamp.fromDate(tanggal),
      items, total_tukar, total_potong,
      total_bungkus: total_tukar + total_potong,
      nilai_potong, alokasi: alokasi || [], lebih: lebih || 0,
      catatan: catatan || '',
      created_at: serverTimestamp()
    });
    return { no, nilai_potong };
  });
}

/** Hapus retur yang salah input. Sama seperti setoran: alokasi (kalau ada
 *  yang memotong hutang) dibalik dulu. Efek ke stok gudang otomatis ikut
 *  hilang karena stokGudang() dihitung ulang dari dokumen yang masih ada,
 *  bukan dari angka tersimpan. */
export async function hapusRetur(r) {
  return runTransaction(db, async tx => {
    const dibaca = await bacaAlokasiBalik(tx, r.alokasi);
    tulisAlokasiBalik(tx, dibaca);
    tx.delete(doc(db, 'retur_produsen', r.id));
  });
}

export async function ambilRetur(batas = 100) {
  const s = await getDocs(query(
    collection(db, 'retur_produsen'), orderBy('tanggal', 'desc'), limit(batas)));
  return s.docs.map(d => ({ id: d.id, jenis: 'retur', ...d.data() }));
}

/* ============================================================
   WARUNG
   Tiap warung menyimpan stok titipan yang masih ada di sana dan
   piutang (barang sudah laku tapi uangnya belum disetor).
     stok: { [produk_id]: { nama, qty, harga_titip } }   qty = BUNGKUS
   ============================================================ */

export async function ambilWarung({ hanyaAktif = false } = {}) {
  const s = await getDocs(query(collection(db, 'warung'), orderBy('nama')));
  let hasil = s.docs.map(d => ({ id: d.id, ...d.data() }));
  if (hanyaAktif) hasil = hasil.filter(w => w.aktif !== false);
  return hasil;
}

export const simpanWarung = (data, id = null) =>
  id ? setDoc(doc(db, 'warung', id), data, { merge: true })
     : addDoc(collection(db, 'warung'), {
         ...data, stok: {}, piutang: 0, created_at: serverTimestamp() });

export const hapusWarung = id => deleteDoc(doc(db, 'warung', id));

/** Total bungkus yang masih tertitip di satu warung. */
export const bungkusDiWarung = w =>
  Object.values(w?.stok || {}).reduce((n, s) => n + (s.qty || 0), 0);

/** Nilai jual barang yang masih tertitip di satu warung. */
export const nilaiDiWarung = w =>
  Object.values(w?.stok || {}).reduce((n, s) => n + (s.qty || 0) * (s.harga_titip || 0), 0);

/* ============================================================
   KUNJUNGAN WARUNG
   Satu kunjungan menyelesaikan semuanya sekaligus: hitung sisa
   fisik, tentukan yang laku, terima uang, titip barang baru.

   laku = stok_awal - sisa - basi     (dihitung, bukan diketik)
   ============================================================ */

export async function simpanKunjungan({ warung, tanggal, items, dibayar, catatan }) {
  const hitung = items.map(i => {
    const laku = Math.max(0, (i.stok_awal || 0) - (i.sisa || 0) - (i.basi || 0));
    return { ...i, laku, stok_akhir: (i.sisa || 0) + (i.titip_baru || 0) };
  });

  const nilai_laku  = hitung.reduce((n, i) => n + i.laku * i.harga_titip, 0);
  const nilai_basi  = hitung.reduce((n, i) => n + i.basi * i.harga_beli, 0);
  const nilai_titip = hitung.reduce((n, i) => n + i.titip_baru * i.harga_titip, 0);
  const untung      = hitung.reduce((n, i) => n + i.laku * (i.harga_titip - i.harga_beli), 0);
  const bungkus_laku = hitung.reduce((n, i) => n + i.laku, 0);
  const bungkus_basi = hitung.reduce((n, i) => n + i.basi, 0);

  return runTransaction(db, async tx => {
    // ---- baca ----
    const wRef  = doc(db, 'warung', warung.id);
    const wSnap = await tx.get(wRef);
    if (!wSnap.exists()) throw new Error('Warung sudah tidak ada. Muat ulang halaman.');
    const wData = wSnap.data();
    const { cRef, urut } = await bacaUrut(tx, 'kunjungan');

    // ---- tulis ----
    const no = nomorNota('KJ-', urut);
    const piutang_sebelum = wData.piutang || 0;
    const tagihan         = piutang_sebelum + nilai_laku;
    const piutang_sesudah = Math.max(0, tagihan - dibayar);

    const stok = {};
    hitung.forEach(i => {
      if (i.stok_akhir > 0) {
        stok[i.produk_id] = { nama: i.nama, qty: i.stok_akhir, harga_titip: i.harga_titip };
      }
    });

    tx.set(cRef, { kunjungan: urut }, { merge: true });
    tx.update(wRef, {
      stok, piutang: piutang_sesudah,
      kunjungan_terakhir: Timestamp.fromDate(tanggal)
    });
    tx.set(doc(collection(db, 'kunjungan_warung')), {
      no, warung_id: warung.id, warung_nama: warung.nama,
      tanggal: Timestamp.fromDate(tanggal),
      items: hitung,
      nilai_laku, nilai_basi, nilai_titip, untung,
      bungkus_laku, bungkus_basi,
      dibayar, tagihan, piutang_sebelum, piutang_sesudah,
      catatan: catatan || '',
      created_at: serverTimestamp()
    });

    return { no, nilai_laku, dibayar, piutang_sesudah, untung, tagihan };
  });
}

/**
 * Hapus kunjungan yang salah input. Hanya boleh untuk kunjungan TERBARU
 * pada warung itu -- kunjungan berikutnya (kalau ada) sudah membangun
 * stok/piutangnya di atas hasil kunjungan ini, jadi membalik yang lama
 * saja akan bikin datanya tidak nyambung.
 *
 * Pembalikan: stok warung dikembalikan ke stok_awal tiap item (kondisi
 * sebelum kunjungan ini), piutang dikembalikan ke piutang_sebelum, dan
 * kunjungan_terakhir dicari dari kunjungan sebelumnya (atau null kalau
 * ini kunjungan pertama).
 */
export async function hapusKunjungan(k) {
  const s = await getDocs(query(
    collection(db, 'kunjungan_warung'), where('warung_id', '==', k.warung_id)));
  const lain = s.docs.filter(d => d.id !== k.id).map(d => ({ id: d.id, ...d.data() }));

  const waktu = x => keDate(x.tanggal)?.getTime() ?? 0;
  const lebihBaru = lain.some(x => waktu(x) > waktu(k));
  if (lebihBaru) {
    throw new Error('Ada kunjungan yang lebih baru untuk warung ini. Hapus dulu yang paling baru, baru mundur ke yang ini.');
  }

  const sebelumnya = lain
    .filter(x => waktu(x) < waktu(k))
    .sort((a, b) => waktu(b) - waktu(a))[0] || null;

  return runTransaction(db, async tx => {
    const wRef  = doc(db, 'warung', k.warung_id);
    const wSnap = await tx.get(wRef);
    if (!wSnap.exists()) throw new Error('Warung sudah tidak ada. Muat ulang halaman.');

    const stok = {};
    (k.items || []).forEach(i => {
      if ((i.stok_awal || 0) > 0) {
        stok[i.produk_id] = { nama: i.nama, qty: i.stok_awal, harga_titip: i.harga_titip };
      }
    });

    tx.update(wRef, {
      stok,
      piutang: k.piutang_sebelum || 0,
      kunjungan_terakhir: sebelumnya ? sebelumnya.tanggal : null
    });
    tx.delete(doc(db, 'kunjungan_warung', k.id));
  });
}

export async function ambilKunjungan(batas = 300) {
  const s = await getDocs(query(
    collection(db, 'kunjungan_warung'), orderBy('tanggal', 'desc'), limit(batas)));
  return s.docs.map(d => ({ id: d.id, jenis: 'kunjungan', ...d.data() }));
}

/* ============================================================
   RINGKASAN & STOK
   ============================================================ */

export async function ringkasan() {
  const semua = await ambilPengambilan();
  const belum = semua.filter(p => (p.sisa || 0) > 0);

  const totalHutang = belum.reduce((n, p) => n + (p.sisa || 0), 0);
  const kini = new Date(); kini.setHours(0, 0, 0, 0);

  const lewat = belum.filter(p => {
    const d = keDate(p.jatuh_tempo);
    return d && d < kini;
  });

  const berikut = belum
    .filter(p => keDate(p.jatuh_tempo))
    .sort((a, b) => keDate(a.jatuh_tempo) - keDate(b.jatuh_tempo))[0] || null;

  return {
    totalHutang,
    jumlahBatch: belum.length,
    nilaiLewat: lewat.reduce((n, p) => n + (p.sisa || 0), 0),
    jumlahLewat: lewat.length,
    berikut,
    belum
  };
}

/**
 * Stok gudang = barang masuk − barang yang sudah dititipkan ke warung.
 *   masuk  : pengambilan dari distributor + barang tukar hasil retur
 *   keluar : titipan ke warung yang dicatat lewat kunjungan
 */
export async function stokGudang() {
  const [ambil, retur, kunjungan] = await Promise.all([
    ambilPengambilan(), ambilRetur(500), ambilKunjungan(1000)
  ]);
  const peta = new Map();

  const catat = (nama, qty, tanggal) => {
    if (!qty) return;
    const s = peta.get(nama) || { nama, qty: 0, tertua: null };
    s.qty += qty;
    const d = keDate(tanggal);
    if (d && qty > 0 && (!s.tertua || d < s.tertua)) s.tertua = d;
    peta.set(nama, s);
  };

  ambil.forEach(p => p.items?.forEach(i => catat(i.nama, i.qty, p.tanggal)));
  retur.forEach(r => r.items?.forEach(i => catat(i.nama, i.qty_tukar, r.tanggal)));
  kunjungan.forEach(k => k.items?.forEach(i => catat(i.nama, -(i.titip_baru || 0), k.tanggal)));

  return [...peta.values()]
    .filter(s => s.qty !== 0)
    .sort((a, b) => (a.tertua || 0) - (b.tertua || 0));
}

/* ============================================================
   LAPORAN
   Semua angka yang perlu dilihat sekali layar.
   ============================================================ */

export async function laporan() {
  const [ambil, warung, kunjungan, produk, gudang] = await Promise.all([
    ambilPengambilan(), ambilWarung(), ambilKunjungan(1000), ambilProduk(), stokGudang()
  ]);

  const hargaBeli = nama => produk.find(p => p.nama === nama)?.harga_beli || 0;

  /* --- 1. Hutang ke distributor --- */
  const belum  = ambil.filter(p => (p.sisa || 0) > 0);
  const hutang = belum.reduce((n, p) => n + (p.sisa || 0), 0);

  /* --- 2. Produk saya di toko --- */
  const diToko = new Map();
  let nilaiToko = 0, modalToko = 0;
  warung.forEach(w => {
    Object.entries(w.stok || {}).forEach(([pid, s]) => {
      const r = diToko.get(s.nama) || { nama: s.nama, qty: 0, warung: 0 };
      r.qty += s.qty || 0; r.warung += 1;
      diToko.set(s.nama, r);
      nilaiToko += (s.qty || 0) * (s.harga_titip || 0);
      modalToko += (s.qty || 0) * hargaBeli(s.nama);
    });
  });
  const bungkusToko = [...diToko.values()].reduce((n, r) => n + r.qty, 0);

  /* --- 3. Margin per produk --- */
  const margin = produk.map(p => ({
    nama: p.nama,
    harga_beli: p.harga_beli,
    harga_titip: p.harga_titip,
    margin: p.harga_titip - p.harga_beli,
    persen: p.harga_beli ? ((p.harga_titip - p.harga_beli) / p.harga_beli) * 100 : 0
  })).sort((a, b) => b.margin - a.margin);

  /* --- 4. Untung riil (hanya dari barang yang benar-benar laku) --- */
  const untung     = kunjungan.reduce((n, k) => n + (k.untung || 0), 0);
  const omzet      = kunjungan.reduce((n, k) => n + (k.nilai_laku || 0), 0);
  const rugiBasi   = kunjungan.reduce((n, k) => n + (k.nilai_basi || 0), 0);
  const bungkusLaku = kunjungan.reduce((n, k) => n + (k.bungkus_laku || 0), 0);
  const bungkusBasi = kunjungan.reduce((n, k) => n + (k.bungkus_basi || 0), 0);

  const kini  = new Date();
  const awalBulan = new Date(kini.getFullYear(), kini.getMonth(), 1);
  const bulanIni = kunjungan.filter(k => {
    const d = keDate(k.tanggal);
    return d && d >= awalBulan;
  });
  const untungBulanIni = bulanIni.reduce((n, k) => n + (k.untung || 0), 0);
  const omzetBulanIni  = bulanIni.reduce((n, k) => n + (k.nilai_laku || 0), 0);

  /* --- 5. Uang endap di toko --- */
  const piutang = warung.reduce((n, w) => n + (w.piutang || 0), 0);
  const endap   = nilaiToko + piutang;

  /* --- modal tertahan di gudang --- */
  const bungkusGudang = gudang.reduce((n, s) => n + s.qty, 0);
  const modalGudang   = gudang.reduce((n, s) => n + s.qty * hargaBeli(s.nama), 0);

  return {
    hutang, jumlahBatchHutang: belum.length,
    diToko: [...diToko.values()].sort((a, b) => b.qty - a.qty),
    bungkusToko, nilaiToko, modalToko,
    piutang, endap,
    margin,
    untung, untungBulanIni, omzet, omzetBulanIni,
    rugiBasi, bungkusLaku, bungkusBasi,
    gudang, bungkusGudang, modalGudang,
    jumlahWarung: warung.length,
    warungBerisi: warung.filter(w => bungkusDiWarung(w) > 0).length,
    jumlahKunjungan: kunjungan.length,
    modalTertahan: modalGudang + modalToko + piutang
  };
}

/* ============================================================
   EXPORT — cadangan bulanan
   ============================================================ */

export async function exportSemua() {
  const nama = ['produk', 'pengambilan', 'setoran_produsen', 'retur_produsen',
                'warung', 'kunjungan_warung'];
  const hasil = { diekspor: new Date().toISOString(), versi: 1 };
  for (const n of nama) {
    try {
      const s = await getDocs(collection(db, n));
      hasil[n] = s.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { hasil[n] = []; }
  }
  return hasil;
}

export { db, doc, getDoc, collection };
