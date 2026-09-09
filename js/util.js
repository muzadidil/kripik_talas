import { ISI_PER_BALL } from './config.js';

/* ---------- uang ---------- */

export const rp = n =>
  'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0));

export const angka = n =>
  new Intl.NumberFormat('id-ID').format(Math.round(n || 0));

/** Bersihkan input uang yang diketik user ("90.000", "90000", "Rp 90rb"). */
export function bacaAngka(teks) {
  const bersih = String(teks ?? '').replace(/[^\d]/g, '');
  return bersih ? parseInt(bersih, 10) : 0;
}

/* ---------- satuan ---------- */

/** Sistem menyimpan bungkus. Layar produsen menampilkan ball. */
export function ball(bungkus, isi = ISI_PER_BALL) {
  const b = Math.max(0, Math.round(bungkus || 0));
  const utuh = Math.floor(b / isi);
  const sisa = b % isi;
  if (utuh && sisa) return `${utuh} ball ${sisa} bks`;
  if (utuh)         return `${utuh} ball`;
  return `${sisa} bks`;
}

/* ---------- tanggal ---------- */

const HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

export const keDate = v =>
  !v ? null : (typeof v.toDate === 'function' ? v.toDate() : new Date(v));

export function tgl(v) {
  const d = keDate(v);
  if (!d || isNaN(d)) return '-';
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function tglPanjang(v) {
  const d = keDate(v);
  if (!d || isNaN(d)) return '-';
  return `${HARI[d.getDay()]}, ${tgl(d)}`;
}

export function jam(v) {
  const d = keDate(v);
  if (!d || isNaN(d)) return '-';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function tglJam(v) {
  const d = keDate(v);
  if (!d || isNaN(d)) return '-';
  return `${tgl(d)}, ${jam(d)}`;
}

export function tglPanjangJam(v) {
  const d = keDate(v);
  if (!d || isNaN(d)) return '-';
  return `${tglPanjang(d)}, ${jam(d)}`;
}

/** Selisih hari dari hari ini. Negatif = sudah lewat. */
export function selisihHari(v) {
  const d = keDate(v);
  if (!d || isNaN(d)) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const kini = new Date();
  const b = new Date(kini.getFullYear(), kini.getMonth(), kini.getDate());
  return Math.round((a - b) / 86400000);
}

export function tempoTeks(v) {
  const s = selisihHari(v);
  if (s === null) return { teks: 'Tanpa tempo', kelas: 'aman' };
  if (s < 0)      return { teks: `Lewat ${Math.abs(s)} hari`, kelas: 'jatuh' };
  if (s === 0)    return { teks: 'Jatuh tempo hari ini', kelas: 'jatuh' };
  if (s <= 3)     return { teks: `${s} hari lagi`, kelas: 'dekat' };
  return { teks: `${s} hari lagi`, kelas: 'aman' };
}

export const hariIni = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const dariInput = s => (s ? new Date(s + 'T00:00:00') : null);

/** Kebalikan hariIni() untuk tanggal sembarang — Timestamp/Date jadi
 *  "yyyy-mm-dd" untuk nilai bawaan input type="date" saat form Ubah dibuka. */
export function keInput(v) {
  const d = keDate(v);
  if (!d || isNaN(d)) return hariIni();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Jam sekarang, format "HH:MM" — nilai bawaan input type="time". */
export const jamSekarang = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Gabungkan input type="date" + type="time" jadi satu Date dengan jam
 *  sesungguhnya — dariInput() polos selalu mengunci jam ke 00:00. */
export function dariInputJam(tglStr, jamStr) {
  if (!tglStr) return null;
  return new Date(`${tglStr}T${jamStr || '00:00'}:00`);
}

/** Tambah n bulan ke tanggal input (yyyy-mm-dd), balikkan format yang sama.
 *  31 Jan + 1 bulan jadi 28/29 Feb, bukan melompat ke Maret. */
export function plusBulan(iso, n) {
  const d = dariInput(iso) || new Date();
  const hari = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() !== hari) d.setDate(0);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- DOM ---------- */

export const $  = (sel, induk = document) => induk.querySelector(sel);
export const $$ = (sel, induk = document) => [...induk.querySelectorAll(sel)];

export const aman = s =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let jamToast;
export function toast(pesan, gagal = false) {
  const t = $('#toast');
  t.textContent = pesan;
  t.classList.toggle('gagal', !!gagal);
  t.hidden = false;
  clearTimeout(jamToast);
  jamToast = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- lembar bawah ---------- */

export function bukaSheet(html) {
  const s = $('#sheet');
  $('#sheetBody').innerHTML = html;
  s.hidden = false;
  document.body.style.overflow = 'hidden';
}

export function tutupSheet() {
  $('#sheet').hidden = true;
  $('#sheetBody').innerHTML = '';
  document.body.style.overflow = '';
}

$('#sheet').addEventListener('click', e => {
  if (e.target.hasAttribute('data-close')) tutupSheet();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) tutupSheet();
});

/* ---------- konfirmasi ---------- */

export function konfirmasi({ judul, pesan, aksi = 'Lanjut', bahaya = false }) {
  return new Promise(selesai => {
    bukaSheet(`
      <h2 class="sheet-judul">${aman(judul)}</h2>
      <p style="color:var(--tinta-lembut);margin-bottom:24px">${aman(pesan)}</p>
      <div class="btn-baris">
        <button class="btn btn-garis" id="kBatal">Batal</button>
        <button class="btn ${bahaya ? 'btn-bahaya' : 'btn-primary'}" id="kYa">${aman(aksi)}</button>
      </div>`);
    $('#kBatal').onclick = () => { tutupSheet(); selesai(false); };
    $('#kYa').onclick    = () => { tutupSheet(); selesai(true); };
  });
}
