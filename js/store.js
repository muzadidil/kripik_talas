import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, getDoc, addDoc, setDoc, deleteDoc,
  query, where, orderBy, limit, runTransaction, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { firebaseConfig } from './config.js';
import { keDate } from './util.js';

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Cache lokal supaya aplikasi tetap jalan saat sinyal hilang di jalan.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

/* ============================================================
   AUTH
   ============================================================ */

export const masuk  = (email, sandi) => signInWithEmailAndPassword(auth, email, sandi);
export const keluar = () => signOut(auth);
export const pantauAuth = cb => onAuthStateChanged(auth, cb);

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
    const cRef  = doc(db, 'counters', 'nota');
    const cSnap = await tx.get(cRef);
    const urut  = ((cSnap.exists() ? cSnap.data().ambil : 0) || 0) + 1;
    const no    = 'AM-' + String(urut).padStart(4, '0');

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

/** Terapkan alokasi ke dokumen pengambilan di dalam sebuah transaksi. */
async function terapkanAlokasi(tx, alokasi) {
  const dibaca = [];
  for (const a of alokasi) {
    const ref  = doc(db, 'pengambilan', a.pengambilan_id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Data pengambilan sudah tidak ada. Muat ulang halaman.');
    dibaca.push({ ref, data: snap.data(), a });
  }
  for (const { ref, data, a } of dibaca) {
    if ((data.sisa || 0) < a.jumlah) {
      throw new Error('Sisa hutang berubah sejak layar ini dibuka. Muat ulang lalu ulangi.');
    }
    const terbayar = (data.terbayar || 0) + a.jumlah;
    const sisa     = (data.total || 0) - terbayar;
    tx.update(ref, { terbayar, sisa, lunas: sisa <= 0 });
  }
}

async function nomorBaru(tx, jenis, awalan) {
  const cRef  = doc(db, 'counters', 'nota');
  const cSnap = await tx.get(cRef);
  const urut  = ((cSnap.exists() ? cSnap.data()[jenis] : 0) || 0) + 1;
  tx.set(cRef, { [jenis]: urut }, { merge: true });
  return awalan + String(urut).padStart(4, '0');
}

/* ============================================================
   SETORAN KE PRODUSEN
   ============================================================ */

export async function simpanSetoran({ tanggal, jumlah, alokasi, lebih, catatan }) {
  return runTransaction(db, async tx => {
    const no = await nomorBaru(tx, 'setor', 'ST-');   // baca counter
    await terapkanAlokasi(tx, alokasi);               // baca pengambilan
    tx.set(doc(collection(db, 'setoran_produsen')), {
      no, tanggal: Timestamp.fromDate(tanggal),
      jumlah, alokasi, lebih: lebih || 0,
      catatan: catatan || '',
      created_at: serverTimestamp()
    });
    return { no };
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
    const no = await nomorBaru(tx, 'retur', 'RT-');
    if (alokasi?.length) await terapkanAlokasi(tx, alokasi);
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

export async function ambilRetur(batas = 100) {
  const s = await getDocs(query(
    collection(db, 'retur_produsen'), orderBy('tanggal', 'desc'), limit(batas)));
  return s.docs.map(d => ({ id: d.id, jenis: 'retur', ...d.data() }));
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
 * Stok gudang Tahap 1: masuk dari pengambilan + barang tukar dari retur.
 * Tahap 2 akan mengurangi ini dengan titipan ke warung.
 */
export async function stokGudang() {
  const [ambil, retur] = await Promise.all([ambilPengambilan(), ambilRetur(500)]);
  const peta = new Map();

  const catat = (nama, qty, tanggal) => {
    if (!qty) return;
    const s = peta.get(nama) || { nama, qty: 0, tertua: null };
    s.qty += qty;
    const d = keDate(tanggal);
    if (d && (!s.tertua || d < s.tertua)) s.tertua = d;
    peta.set(nama, s);
  };

  ambil.forEach(p => p.items?.forEach(i => catat(i.nama, i.qty, p.tanggal)));
  retur.forEach(r => r.items?.forEach(i => catat(i.nama, i.qty_tukar, r.tanggal)));

  return [...peta.values()].sort((a, b) => (a.tertua || 0) - (b.tertua || 0));
}

/* ============================================================
   EXPORT — cadangan bulanan
   ============================================================ */

export async function exportSemua() {
  const nama = ['produk', 'pengambilan', 'setoran_produsen', 'retur_produsen', 'warung', 'mutasi_warung'];
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
