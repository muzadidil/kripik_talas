import { usaha, ISI_PER_BALL } from './config.js';
import { rp, ball, tgl, tglPanjang, aman, keDate } from './util.js';

/* ============================================================
   Nota dibuat ULANG dari data, bukan disimpan sebagai file.
   Jadi transaksi lama selalu bisa dicetak lagi, persis sama.
   ============================================================ */

const LEBAR   = 80;   // mm — ukuran nota kontan
const TEPI    = 6;
const ISI_LBR = LEBAR - TEPI * 2;
const KOLOM   = 40;   // karakter per baris pada courier 8pt

const bungkus = (teks, kolom = KOLOM) => {
  const kata = String(teks).split(/\s+/);
  const baris = [];
  let kini = '';
  for (const k of kata) {
    if (!kini) { kini = k; }
    else if ((kini + ' ' + k).length <= kolom) { kini += ' ' + k; }
    else { baris.push(kini); kini = k; }
  }
  if (kini) baris.push(kini);
  return baris.length ? baris : [''];
};

/* ---------- susun baris ---------- */

const K  = t => ({ t: 'kop', v: t });
const T  = t => ({ t: 'teks', v: t });
const P  = (a, b) => ({ t: 'pasang', a, b });
const PB = (a, b) => ({ t: 'pasang', a, b, tebal: true });
const G  = () => ({ t: 'garis' });
const S  = (n = 1) => ({ t: 'spasi', n });

function kepala(judul) {
  return [
    K(usaha.nama.toUpperCase()),
    T(`${usaha.pemilik} - ${usaha.hp}`),
    T(usaha.kota),
    G(),
    K(judul)
  ];
}

function kaki(catatan) {
  const b = [G()];
  if (catatan) { b.push(T(catatan), G()); }
  b.push(
    S(), T('Diterima produsen,'), S(3),
    T('(............................)'), S(),
    T('Dicetak ' + new Date().toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }))
  );
  return b;
}

/** Nota setoran uang ke produsen. */
export function barisSetoran(s, hutangSebelum) {
  const sesudah = hutangSebelum - s.jumlah;
  const b = [
    ...kepala('NOTA SETORAN'),
    P('No.', s.no),
    P('Tanggal', tgl(s.tanggal)),
    P('Kepada', usaha.produsen),
    G(),
    P('Hutang sebelumnya', rp(hutangSebelum)),
    PB('Setoran hari ini', rp(s.jumlah))
  ];
  if (s.ball_setara) b.push(T(`  setara ${s.ball_setara} ball`));

  b.push(G(), T('Dialokasikan ke:'));
  s.alokasi.forEach(a => {
    b.push(P(' ' + a.no, rp(a.jumlah)));
    const d = keDate(a.jatuh_tempo);
    b.push(T(`   tempo ${d ? tgl(d) : '-'} | sisa ${rp(a.sisa_sesudah)}`));
  });
  if (s.lebih > 0) b.push(P(' Kelebihan bayar', rp(s.lebih)));

  b.push(G(), PB('SISA HUTANG', rp(Math.max(0, sesudah))));

  const dekat = [...s.alokasi]
    .filter(a => a.sisa_sesudah > 0 && a.jatuh_tempo)
    .sort((x, y) => keDate(x.jatuh_tempo) - keDate(y.jatuh_tempo))[0];
  if (dekat) b.push(P('Jatuh tempo', tgl(dekat.jatuh_tempo)));

  return [...b, ...kaki(s.catatan)];
}

/** Nota retur barang basi ke produsen. */
export function barisRetur(r) {
  const b = [
    ...kepala('NOTA RETUR'),
    P('No.', r.no),
    P('Tanggal', tgl(r.tanggal)),
    P('Kepada', usaha.produsen),
    G(),
    T('Barang dikembalikan:')
  ];

  r.items.forEach(i => {
    const total = i.qty_tukar + i.qty_potong;
    b.push(P(' ' + i.nama, `${total} bks`));
    if (i.qty_tukar)  b.push(T(`   tukar barang  : ${i.qty_tukar} bks`));
    if (i.qty_potong) b.push(T(`   potong hutang : ${i.qty_potong} bks = ${rp(i.qty_potong * i.harga)}`));
  });

  b.push(
    G(),
    P('Total diretur', `${r.total_bungkus} bks (${ball(r.total_bungkus, ISI_PER_BALL)})`),
    P('Ditukar barang', `${r.total_tukar} bks`),
    P('Potong hutang', `${r.total_potong} bks`),
    PB('Nilai potong hutang', rp(r.nilai_potong))
  );

  if (r.alokasi?.length) {
    b.push(G(), T('Memotong batch:'));
    r.alokasi.forEach(a =>
      b.push(P(' ' + a.no, rp(a.jumlah)), T(`   sisa ${rp(a.sisa_sesudah)}`)));
  }
  if (!r.nilai_potong) b.push(T('Hutang tidak berubah (tukar barang).'));

  return [...b, ...kaki(r.catatan)];
}

/** Nota kunjungan ke warung — bukti untuk pemilik warung. */
export function barisKunjungan(k) {
  const b = [
    ...kepala('NOTA WARUNG'),
    P('No.', k.no),
    P('Tanggal', tgl(k.tanggal)),
    P('Warung', k.warung_nama),
    G(),
    T('Barang laku:')
  ];

  const laku = k.items.filter(i => i.laku > 0);
  if (laku.length) {
    laku.forEach(i => {
      b.push(P(' ' + i.nama, `${i.laku} bks`));
      b.push(T(`   ${i.laku} x ${rp(i.harga_titip)} = ${rp(i.laku * i.harga_titip)}`));
    });
  } else {
    b.push(T(' (tidak ada yang laku)'));
  }

  b.push(G());
  if (k.piutang_sebelum > 0) b.push(P('Sisa tagihan lalu', rp(k.piutang_sebelum)));
  b.push(P('Nilai laku', rp(k.nilai_laku)));
  b.push(PB('Total tagihan', rp(k.tagihan)));
  b.push(PB('Dibayar', rp(k.dibayar)));
  b.push(P('Sisa tagihan', rp(k.piutang_sesudah)));

  const basi = k.items.filter(i => i.basi > 0);
  if (basi.length) {
    b.push(G(), T('Barang basi ditarik:'));
    basi.forEach(i => b.push(P(' ' + i.nama, `${i.basi} bks`)));
  }

  const titip = k.items.filter(i => i.titip_baru > 0);
  if (titip.length) {
    b.push(G(), T('Titipan baru:'));
    titip.forEach(i => b.push(P(' ' + i.nama, `${i.titip_baru} bks`)));
  }

  const sisa = k.items.filter(i => i.stok_akhir > 0);
  if (sisa.length) {
    b.push(G(), T('Barang tinggal di warung:'));
    sisa.forEach(i => b.push(P(' ' + i.nama, `${i.stok_akhir} bks`)));
  }

  return [...b, ...kakiWarung(k.catatan, k.warung_nama)];
}

function kakiWarung(catatan, warungNama) {
  const b = [G()];
  if (catatan) { b.push(T(catatan), G()); }
  b.push(
    S(), T(`Diterima ${warungNama || 'warung'},`), S(3),
    T('(............................)'), S(),
    T('Dicetak ' + new Date().toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }))
  );
  return b;
}

/* ---------- render PDF ---------- */

const TINGGI = { kop: 5.4, teks: 4.3, pasang: 4.3, garis: 3.4, spasi: 2.6 };

function ukur(baris) {
  let h = TEPI * 2;
  for (const b of baris) {
    if (b.t === 'spasi') { h += TINGGI.spasi * (b.n || 1); continue; }
    if (b.t === 'garis') { h += TINGGI.garis; continue; }
    if (b.t === 'pasang') { h += TINGGI.pasang; continue; }
    h += bungkus(b.v).length * TINGGI[b.t];
  }
  return Math.max(90, h);
}

export function buatPDF(baris) {
  const { jsPDF } = window.jspdf;
  const tinggi = ukur(baris);
  const d = new jsPDF({ unit: 'mm', format: [LEBAR, tinggi], compress: true });

  const kiri  = TEPI;
  const kanan = LEBAR - TEPI;
  let y = TEPI + 4;

  for (const b of baris) {
    if (b.t === 'spasi') { y += TINGGI.spasi * (b.n || 1); continue; }

    if (b.t === 'garis') {
      d.setDrawColor(140); d.setLineWidth(0.15);
      d.setLineDashPattern([0.8, 0.8], 0);
      d.line(kiri, y - 1.4, kanan, y - 1.4);
      d.setLineDashPattern([], 0);
      y += TINGGI.garis;
      continue;
    }

    if (b.t === 'kop') {
      d.setFont('helvetica', 'bold'); d.setFontSize(11);
      bungkus(b.v, 26).forEach(t => { d.text(t, LEBAR / 2, y, { align: 'center' }); y += TINGGI.kop; });
      continue;
    }

    if (b.t === 'pasang') {
      d.setFont('courier', b.tebal ? 'bold' : 'normal');
      d.setFontSize(b.tebal ? 9 : 8);
      d.text(String(b.a), kiri, y);
      d.text(String(b.b), kanan, y, { align: 'right' });
      y += TINGGI.pasang;
      continue;
    }

    d.setFont('courier', 'normal'); d.setFontSize(8);
    bungkus(b.v).forEach(t => { d.text(t, kiri, y); y += TINGGI.teks; });
  }

  return d;
}

/* ---------- pratinjau di layar ---------- */

export function pratinjauHTML(baris) {
  return baris.map(b => {
    if (b.t === 'spasi')  return '<div style="height:' + (b.n || 1) * 8 + 'px"></div>';
    if (b.t === 'garis')  return '<div style="border-top:1px dashed #999;margin:8px 0"></div>';
    if (b.t === 'kop')    return `<div class="slip-kop"><b>${aman(b.v)}</b></div>`;
    if (b.t === 'pasang') return `<div class="slip-baris"${b.tebal ? ' style="font-weight:700"' : ''}><span>${aman(b.a)}</span><span>${aman(b.b)}</span></div>`;
    return `<div>${aman(b.v)}</div>`;
  }).join('');
}

/* ---------- kirim / simpan ---------- */

export async function kirimPDF(baris, namaFile) {
  const blob = buatPDF(baris).output('blob');
  const file = new File([blob], namaFile, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: namaFile });
      return 'terkirim';
    } catch (e) {
      if (e.name === 'AbortError') return 'batal';
    }
  }

  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: namaFile });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'terunduh';
}
