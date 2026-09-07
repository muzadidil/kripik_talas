import { usaha, ISI_PER_BALL } from './config.js';
import {
  rp, angka, bacaAngka, ball, tgl, tglPanjang, tempoTeks, selisihHari,
  hariIni, dariInput, keDate, $, $$, aman, toast, bukaSheet, tutupSheet, konfirmasi
} from './util.js';
import * as S from './store.js';
import { barisSetoran, barisRetur, pratinjauHTML, kirimPDF } from './nota.js';

/* ============================================================
   AUTENTIKASI
   ============================================================ */

S.pantauAuth(user => {
  $('#boot').hidden = true;
  $('#gate').hidden  = !!user;
  $('#shell').hidden = !user;
  if (user) jalankanRute();
});

$('#gBtn').onclick = async () => {
  const tombol = $('#gBtn');
  const salah  = $('#gErr');
  salah.hidden = true;
  tombol.disabled = true; tombol.textContent = 'Memeriksa…';
  try {
    await S.masuk($('#gEmail').value.trim(), $('#gPass').value);
  } catch (e) {
    salah.textContent = e.code === 'auth/invalid-credential'
      ? 'Email atau kata sandi tidak cocok.'
      : 'Tidak bisa masuk. Periksa koneksi lalu coba lagi.';
    salah.hidden = false;
  } finally {
    tombol.disabled = false; tombol.textContent = 'Masuk';
  }
};

$('#gPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#gBtn').click(); });

/* ============================================================
   MENU LAINNYA
   ============================================================ */

$('#menuBtn').onclick = () => {
  bukaSheet(`
    <h2 class="sheet-judul">Lainnya</h2>
    <button class="sheet-menu" data-go="#/produk">Produk<small>Harga beli dan harga titip</small></button>
    <button class="sheet-menu" data-go="#/stok">Stok gudang<small>Lihat umur stok, keluarkan yang tua dulu</small></button>
    <button class="sheet-menu" id="mExport">Simpan cadangan<small>Unduh semua data sebagai file JSON</small></button>
    <button class="sheet-menu" id="mKeluar" style="color:var(--merah)">Keluar</button>`);

  $$('[data-go]').forEach(b => b.onclick = () => { tutupSheet(); location.hash = b.dataset.go; });

  $('#mExport').onclick = async () => {
    tutupSheet(); toast('Menyiapkan cadangan…');
    try {
      const data = await S.exportSemua();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'),
        { href: url, download: `cadangan-kripik-${hariIni()}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('Cadangan tersimpan. Pindahkan ke Drive.');
    } catch { toast('Gagal membuat cadangan.', true); }
  };

  $('#mKeluar').onclick = async () => {
    tutupSheet();
    if (await konfirmasi({ judul: 'Keluar dari akun?', pesan: 'Kamu perlu masuk lagi nanti.', aksi: 'Keluar', bahaya: true }))
      S.keluar();
  };
};

/* ============================================================
   ROUTER
   ============================================================ */

const RUTE = {
  beranda: { judul: 'Beranda',      tab: 'beranda', render: vBeranda },
  ambil:   { judul: 'Pengambilan',  tab: 'ambil',   render: vAmbil },
  setor:   { judul: 'Setoran',      tab: 'setor',   render: vSetor },
  retur:   { judul: 'Retur',        tab: 'retur',   render: vRetur },
  nota:    { judul: 'Riwayat nota', tab: 'nota',    render: vNota },
  produk:  { judul: 'Produk',       tab: '',        render: vProduk },
  stok:    { judul: 'Stok gudang',  tab: '',        render: vStok }
};

function pecahRute() {
  const bagian = (location.hash || '#/beranda').replace(/^#\/?/, '').split('/');
  return { nama: bagian[0] || 'beranda', anak: bagian[1] || '' };
}

async function jalankanRute() {
  if ($('#shell').hidden) return;
  const { nama, anak } = pecahRute();
  const r = RUTE[nama] || RUTE.beranda;

  $('#viewTitle').textContent = r.judul;
  $$('.tabbar a').forEach(a =>
    a.toggleAttribute('aria-current', a.dataset.tab === r.tab));

  const wadah = $('#view');
  wadah.innerHTML = `<div class="kosong"><p>Memuat…</p></div>`;
  window.scrollTo(0, 0);

  try {
    await r.render(wadah, anak);
  } catch (e) {
    console.error(e);
    wadah.innerHTML = `<div class="peringatan">Gagal memuat: ${aman(e.message || e)}</div>
      <button class="btn btn-garis btn-block" onclick="location.reload()">Muat ulang</button>`;
  }
}

addEventListener('hashchange', jalankanRute);

/* ============================================================
   BERANDA
   ============================================================ */

async function vBeranda(w) {
  const r = await S.ringkasan();
  const tempo = r.berikut ? tempoTeks(r.berikut.jatuh_tempo) : null;

  const peringatan = r.jumlahLewat
    ? `<div class="peringatan">${r.jumlahLewat} pengambilan sudah lewat jatuh tempo, senilai ${rp(r.nilaiLewat)}. Hubungi produsen hari ini.</div>`
    : '';

  const daftar = r.belum.length
    ? `<div class="ledger">${r.belum
        .slice()
        .sort((a, b) => (keDate(a.jatuh_tempo) ?? 8e15) - (keDate(b.jatuh_tempo) ?? 8e15))
        .map(barisPengambilan).join('')}</div>`
    : `<div class="kosong"><h3>Tidak ada hutang berjalan</h3>
         <p>Semua pengambilan sudah lunas.</p>
         <a class="btn btn-primary" href="#/ambil/baru">Catat pengambilan</a></div>`;

  w.innerHTML = `
    ${peringatan}
    <section class="kop">
      <p class="kop-label">Hutang ke ${aman(usaha.produsen)}</p>
      <p class="kop-angka">${rp(r.totalHutang)}</p>
      <p class="kop-sub">${r.jumlahBatch} pengambilan belum lunas</p>
      <div class="kop-pisah"></div>
      <div class="kop-grid">
        <div><p>Jatuh tempo terdekat</p><p class="${tempo?.kelas === 'jatuh' ? 'merah' : ''}">${tempo ? aman(tempo.teks) : '—'}</p></div>
        <div><p>Tanggalnya</p><p>${r.berikut ? tgl(r.berikut.jatuh_tempo) : '—'}</p></div>
      </div>
    </section>

    <div class="btn-baris">
      <a class="btn btn-primary" href="#/setor">Setor uang</a>
      <a class="btn btn-garis" href="#/ambil/baru">Catat ambil</a>
    </div>

    <div class="bagian"><h2>Hutang berjalan</h2><span>urut jatuh tempo</span></div>
    ${daftar}`;
}

function barisPengambilan(p) {
  const t = tempoTeks(p.jatuh_tempo);
  const bks = (p.items || []).reduce((n, i) => n + i.qty, 0);
  return `<button class="baris ${t.kelas}" data-lihat="${p.id}">
    <div class="baris-atas">
      <span class="baris-judul">${aman(p.no)} · ${ball(bks)}</span>
      <span class="baris-nilai">${rp(p.sisa)}</span>
    </div>
    <div class="baris-bawah">
      <span class="${t.kelas === 'jatuh' ? 'merah' : ''}">${aman(t.teks)}</span>
      <span>diambil ${tgl(p.tanggal)}</span>
    </div>
  </button>`;
}

/* ============================================================
   PENGAMBILAN
   ============================================================ */

async function vAmbil(w, anak) {
  const produk = await S.ambilProduk();

  if (anak === 'baru') {
    if (!produk.length) {
      w.innerHTML = `<div class="kosong"><h3>Belum ada produk</h3>
        <p>Daftarkan produk beserta harga belinya dulu.</p>
        <a class="btn btn-primary" href="#/produk">Tambah produk</a></div>`;
      return;
    }
    return formPengambilan(w, produk);
  }

  const daftar = await S.ambilPengambilan();
  w.innerHTML = `
    <a class="btn btn-primary btn-block" href="#/ambil/baru" style="margin-bottom:16px">Catat pengambilan baru</a>
    ${daftar.length
      ? `<div class="ledger">${daftar.map(p => {
          const t = p.lunas ? { teks: 'Lunas', kelas: 'lunas' } : tempoTeks(p.jatuh_tempo);
          const bks = (p.items || []).reduce((n, i) => n + i.qty, 0);
          return `<button class="baris ${t.kelas}" data-lihat="${p.id}">
            <div class="baris-atas">
              <span class="baris-judul">${aman(p.no)} · ${ball(bks)}</span>
              <span class="baris-nilai ${p.lunas ? 'hijau' : ''}">${p.lunas ? rp(p.total) : rp(p.sisa)}</span>
            </div>
            <div class="baris-bawah">
              <span class="${t.kelas === 'jatuh' ? 'merah' : t.kelas === 'lunas' ? 'hijau' : ''}">${aman(t.teks)}</span>
              <span>${tgl(p.tanggal)}</span>
            </div></button>`;
        }).join('')}</div>`
      : `<div class="kosong"><h3>Belum ada catatan</h3><p>Pengambilan pertama kamu akan muncul di sini.</p></div>`}`;

  $$('[data-lihat]').forEach(b => b.onclick = () => rincianPengambilan(daftar.find(p => p.id === b.dataset.lihat)));
}

function formPengambilan(w, produk) {
  const items = [{ produk_id: produk[0].id, ball: 1 }];

  const gambar = () => {
    w.innerHTML = `
      <div class="catatan">Isi jumlah dalam ball. Sistem menyimpannya sebagai bungkus (1 ball = ${ISI_PER_BALL} bungkus).</div>

      <label class="field"><span>Tanggal ambil</span>
        <input type="date" id="fTgl" value="${hariIni()}"></label>

      <div class="bagian"><h2>Barang diambil</h2></div>
      <div id="fItems"></div>
      <button class="btn btn-garis btn-block" id="fTambah" style="margin-bottom:24px">Tambah produk lain</button>

      <label class="field"><span>Jatuh tempo yang disepakati</span>
        <input type="date" id="fTempo">
        <span class="field-hint">Kosongkan kalau belum ada kesepakatan. Tapi lebih baik diisi.</span></label>

      <label class="field"><span>Catatan negosiasi</span>
        <input id="fCatatan" placeholder="mis. tempo 3 minggu, boleh dicicil"></label>

      <div class="rincian" id="fTotal"></div>
      <button class="btn btn-primary btn-block" id="fSimpan">Simpan pengambilan</button>`;

    const wi = $('#fItems');
    wi.innerHTML = items.map((it, n) => `
      <div class="item">
        <div class="item-kepala">
          <strong>Barang ${n + 1}</strong>
          ${items.length > 1 ? `<button class="item-buang" data-buang="${n}">Hapus</button>` : ''}
        </div>
        <label class="field"><span>Produk</span>
          <select data-produk="${n}">${produk.map(p =>
            `<option value="${p.id}" ${p.id === it.produk_id ? 'selected' : ''}>${aman(p.nama)} — ${rp(p.harga_beli)}/bks</option>`).join('')}</select></label>
        <label class="field" style="margin-bottom:0"><span>Jumlah (ball)</span>
          <input type="number" min="0" step="1" inputmode="numeric" data-ball="${n}" value="${it.ball}"></label>
      </div>`).join('');

    $$('[data-produk]').forEach(s => s.onchange = () => { items[+s.dataset.produk].produk_id = s.value; hitung(); });
    $$('[data-ball]').forEach(i => i.oninput = () => { items[+i.dataset.ball].ball = Math.max(0, +i.value || 0); hitung(); });
    $$('[data-buang]').forEach(b => b.onclick = () => { items.splice(+b.dataset.buang, 1); gambar(); });

    $('#fTambah').onclick = () => { items.push({ produk_id: produk[0].id, ball: 1 }); gambar(); };
    $('#fSimpan').onclick = simpan;
    hitung();
  };

  const susun = () => items.map(it => {
    const p = produk.find(x => x.id === it.produk_id);
    return { produk_id: p.id, nama: p.nama, harga: p.harga_beli, qty: it.ball * ISI_PER_BALL };
  }).filter(i => i.qty > 0);

  const hitung = () => {
    const jadi  = susun();
    const total = jadi.reduce((n, i) => n + i.qty * i.harga, 0);
    const bks   = jadi.reduce((n, i) => n + i.qty, 0);
    $('#fTotal').innerHTML = `
      <h3>Total pengambilan</h3>
      <div class="rincian-baris"><span>${ball(bks)} (${bks} bungkus)</span><span>${rp(total)}</span></div>
      <div class="rincian-baris"><span>Hutang bertambah</span><span>${rp(total)}</span></div>`;
    $('#fSimpan').disabled = total <= 0;
  };

  async function simpan() {
    const jadi = susun();
    if (!jadi.length) return toast('Jumlah ball belum diisi.', true);

    const tempo = dariInput($('#fTempo').value);
    if (!tempo && !await konfirmasi({
      judul: 'Simpan tanpa jatuh tempo?',
      pesan: 'Tanpa tanggal tempo, sistem tidak bisa mengingatkan kamu dan urutan pembayaran jadi menebak-nebak.',
      aksi: 'Tetap simpan'
    })) return;

    const b = $('#fSimpan');
    b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      const hasil = await S.simpanPengambilan({
        tanggal: dariInput($('#fTgl').value) || new Date(),
        items: jadi, jatuh_tempo: tempo, catatan: $('#fCatatan').value.trim()
      });
      toast(`${hasil.no} tersimpan — hutang +${rp(hasil.total)}`);
      location.hash = '#/ambil';
    } catch (e) {
      toast(e.message || 'Gagal menyimpan.', true);
      b.disabled = false; b.textContent = 'Simpan pengambilan';
    }
  }

  gambar();
}

function rincianPengambilan(p) {
  if (!p) return;
  const bks = (p.items || []).reduce((n, i) => n + i.qty, 0);
  const t = p.lunas ? { teks: 'Lunas' } : tempoTeks(p.jatuh_tempo);
  bukaSheet(`
    <h2 class="sheet-judul">${aman(p.no)}</h2>
    <div class="rincian">
      ${(p.items || []).map(i => `<div class="rincian-baris"><span>${aman(i.nama)} · ${ball(i.qty)}</span><span>${rp(i.qty * i.harga)}</span></div>`).join('')}
      <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px"><span>Total ${ball(bks)}</span><span>${rp(p.total)}</span></div>
      <div class="rincian-baris"><span>Sudah dibayar</span><span>${rp(p.terbayar)}</span></div>
      <div class="rincian-baris"><span>Sisa hutang</span><span>${rp(p.sisa)}</span></div>
    </div>
    <div class="rincian-baris"><span>Diambil</span><span>${tglPanjang(p.tanggal)}</span></div>
    <div class="rincian-baris"><span>Jatuh tempo</span><span>${p.jatuh_tempo ? tgl(p.jatuh_tempo) : 'tidak ditentukan'}</span></div>
    <div class="rincian-baris"><span>Status</span><span>${aman(t.teks)}</span></div>
    ${p.catatan ? `<p style="margin-top:12px;color:var(--tinta-lembut);font-size:.88rem">${aman(p.catatan)}</p>` : ''}
    <button class="btn btn-garis btn-block" style="margin-top:24px" data-close>Tutup</button>`);
}

/* ============================================================
   SETORAN
   ============================================================ */

async function vSetor(w) {
  const [belum, produk] = await Promise.all([
    S.ambilPengambilan({ hanyaBelumLunas: true }), S.ambilProduk()
  ]);

  if (!belum.length) {
    w.innerHTML = `<div class="kosong"><h3>Tidak ada hutang</h3>
      <p>Semua pengambilan sudah lunas. Tidak ada yang perlu disetor.</p>
      <a class="btn btn-garis" href="#/beranda">Ke beranda</a></div>`;
    return;
  }

  const totalHutang = belum.reduce((n, p) => n + p.sisa, 0);
  const hargaBall   = (produk[0]?.harga_beli || 3000) * ISI_PER_BALL;

  w.innerHTML = `
    <div class="rincian"><h3>Hutang saat ini</h3>
      <div class="rincian-baris"><span>${belum.length} pengambilan belum lunas</span><span>${rp(totalHutang)}</span></div></div>

    <label class="field"><span>Tanggal setor</span>
      <input type="date" id="sTgl" value="${hariIni()}"></label>

    <div class="duo">
      <label class="field"><span>Jumlah ball</span>
        <input type="number" min="0" step="1" inputmode="numeric" id="sBall" value="3"></label>
      <label class="field uang"><span>Rupiah</span>
        <input type="text" inputmode="numeric" id="sRp" value="${angka(3 * hargaBall)}"></label>
    </div>
    <p class="field-hint" style="margin-top:-8px;margin-bottom:16px">Acuan ${rp(hargaBall)} per ball. Ubah kolom rupiah langsung kalau jumlahnya lain.</p>

    <div id="sPratinjau"></div>

    <label class="field"><span>Catatan (ikut tercetak di nota)</span>
      <input id="sCatatan" placeholder="mis. dibayar tunai di rumah produsen"></label>

    <button class="btn btn-primary btn-block" id="sSimpan">Simpan &amp; buat nota</button>`;

  const iBall = $('#sBall'), iRp = $('#sRp');
  let terkunci = false;

  iBall.oninput = () => {
    if (terkunci) return;
    terkunci = true; iRp.value = angka((+iBall.value || 0) * hargaBall); terkunci = false;
    pratinjau();
  };
  iRp.oninput = () => {
    if (terkunci) return;
    const n = bacaAngka(iRp.value);
    terkunci = true; iBall.value = Math.round((n / hargaBall) * 100) / 100; terkunci = false;
    pratinjau();
  };

  let terakhir = null;

  function pratinjau() {
    const jumlah = bacaAngka(iRp.value);
    const wadah  = $('#sPratinjau');
    const tombol = $('#sSimpan');

    if (jumlah <= 0) {
      wadah.innerHTML = ''; tombol.disabled = true; terakhir = null; return;
    }

    const hasil = S.alokasiFIFO(belum, jumlah);
    terakhir = { jumlah, ...hasil };
    tombol.disabled = false;

    const lebih = hasil.lebih > 0
      ? `<div class="rincian bahaya" style="margin-top:12px">Kelebihan ${rp(hasil.lebih)} — melebihi total hutang. Periksa lagi angkanya.</div>`
      : '';

    wadah.innerHTML = `
      <div class="rincian">
        <h3>Akan melunasi (paling dekat tempo dulu)</h3>
        ${hasil.alokasi.map(a => `
          <div class="rincian-baris"><span>${aman(a.no)} · tempo ${a.jatuh_tempo ? tgl(a.jatuh_tempo) : '-'}</span><span>${rp(a.jumlah)}</span></div>
          <div style="font-size:.8rem;color:var(--tinta-lembut);margin:-2px 0 6px">sisa batch jadi ${rp(a.sisa_sesudah)}${a.sisa_sesudah === 0 ? ' — lunas' : ''}</div>`).join('')}
        <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px">
          <span>Sisa hutang sesudah setoran</span><span>${rp(Math.max(0, totalHutang - jumlah))}</span></div>
      </div>${lebih}`;
  }

  pratinjau();

  $('#sSimpan').onclick = async () => {
    if (!terakhir) return;
    const b = $('#sSimpan');
    b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      const data = {
        tanggal: dariInput($('#sTgl').value) || new Date(),
        jumlah: terakhir.jumlah,
        alokasi: terakhir.alokasi,
        lebih: terakhir.lebih,
        catatan: $('#sCatatan').value.trim()
      };
      const hasil = await S.simpanSetoran(data);
      const ballIsi = +iBall.value || 0;
      tampilkanNota(
        barisSetoran({ ...data, no: hasil.no, ball_setara: Number.isInteger(ballIsi) && ballIsi > 0 ? ballIsi : null }, totalHutang),
        `${hasil.no}.pdf`, `${hasil.no} tersimpan`);
    } catch (e) {
      toast(e.message || 'Gagal menyimpan.', true);
      b.disabled = false; b.textContent = 'Simpan & buat nota';
    }
  };
}

/* ============================================================
   RETUR
   ============================================================ */

async function vRetur(w) {
  const [produk, belum] = await Promise.all([
    S.ambilProduk(), S.ambilPengambilan({ hanyaBelumLunas: true })
  ]);

  if (!produk.length) {
    w.innerHTML = `<div class="kosong"><h3>Belum ada produk</h3>
      <p>Daftarkan produk dulu supaya harga potongnya bisa dihitung.</p>
      <a class="btn btn-primary" href="#/produk">Tambah produk</a></div>`;
    return;
  }

  const items = [{ produk_id: produk[0].id, tukar: 0, potong: 0 }];
  const totalHutang = belum.reduce((n, p) => n + p.sisa, 0);
  let terakhir = null;

  const gambar = () => {
    w.innerHTML = `
      <div class="catatan">Barang basi yang kamu kembalikan ke produsen. Isi dalam bungkus. Bagi antara ditukar barang baru dan potong hutang.</div>

      <label class="field"><span>Tanggal retur</span>
        <input type="date" id="rTgl" value="${hariIni()}"></label>

      <div class="bagian"><h2>Barang basi</h2></div>
      <div id="rItems"></div>
      <button class="btn btn-garis btn-block" id="rTambah" style="margin-bottom:24px">Tambah produk lain</button>

      <div id="rPratinjau"></div>

      <label class="field"><span>Catatan (ikut tercetak di nota)</span>
        <input id="rCatatan" placeholder="mis. dari warung Bu Sri, tengik"></label>

      <button class="btn btn-primary btn-block" id="rSimpan">Simpan &amp; buat nota</button>`;

    $('#rItems').innerHTML = items.map((it, n) => `
      <div class="item">
        <div class="item-kepala"><strong>Barang ${n + 1}</strong>
          ${items.length > 1 ? `<button class="item-buang" data-buang="${n}">Hapus</button>` : ''}</div>
        <label class="field"><span>Produk</span>
          <select data-produk="${n}">${produk.map(p =>
            `<option value="${p.id}" ${p.id === it.produk_id ? 'selected' : ''}>${aman(p.nama)} — ${rp(p.harga_beli)}/bks</option>`).join('')}</select></label>
        <div class="duo">
          <label class="field" style="margin-bottom:0"><span>Ditukar (bks)</span>
            <input type="number" min="0" step="1" inputmode="numeric" data-tukar="${n}" value="${it.tukar}"></label>
          <label class="field" style="margin-bottom:0"><span>Potong hutang (bks)</span>
            <input type="number" min="0" step="1" inputmode="numeric" data-potong="${n}" value="${it.potong}"></label>
        </div>
      </div>`).join('');

    $$('[data-produk]').forEach(s => s.onchange = () => { items[+s.dataset.produk].produk_id = s.value; hitung(); });
    $$('[data-tukar]').forEach(i => i.oninput  = () => { items[+i.dataset.tukar].tukar  = Math.max(0, +i.value || 0); hitung(); });
    $$('[data-potong]').forEach(i => i.oninput = () => { items[+i.dataset.potong].potong = Math.max(0, +i.value || 0); hitung(); });
    $$('[data-buang]').forEach(b => b.onclick = () => { items.splice(+b.dataset.buang, 1); gambar(); });

    $('#rTambah').onclick = () => { items.push({ produk_id: produk[0].id, tukar: 0, potong: 0 }); gambar(); };
    $('#rSimpan').onclick = simpan;
    hitung();
  };

  const susun = () => items.map(it => {
    const p = produk.find(x => x.id === it.produk_id);
    return { produk_id: p.id, nama: p.nama, harga: p.harga_beli, qty_tukar: it.tukar, qty_potong: it.potong };
  }).filter(i => i.qty_tukar + i.qty_potong > 0);

  function hitung() {
    const jadi   = susun();
    const potong = jadi.reduce((n, i) => n + i.qty_potong * i.harga, 0);
    const bks    = jadi.reduce((n, i) => n + i.qty_tukar + i.qty_potong, 0);
    const hasil  = potong > 0 ? S.alokasiFIFO(belum, potong) : { alokasi: [], lebih: 0 };
    terakhir = { items: jadi, potong, ...hasil };

    $('#rSimpan').disabled = !jadi.length;

    const lebih = hasil.lebih > 0
      ? `<div class="rincian bahaya" style="margin-top:12px">Nilai potong ${rp(hasil.lebih)} melebihi sisa hutang. Kurangi jumlah potong, atau pindahkan ke tukar barang.</div>` : '';

    $('#rPratinjau').innerHTML = !jadi.length ? '' : `
      <div class="rincian">
        <h3>Ringkasan retur</h3>
        <div class="rincian-baris"><span>Total diretur</span><span>${bks} bks (${ball(bks)})</span></div>
        <div class="rincian-baris"><span>Ditukar barang baru</span><span>${jadi.reduce((n, i) => n + i.qty_tukar, 0)} bks</span></div>
        <div class="rincian-baris"><span>Potong hutang</span><span>${rp(potong)}</span></div>
        ${hasil.alokasi.map(a => `<div style="font-size:.8rem;color:var(--tinta-lembut)">memotong ${aman(a.no)} → sisa ${rp(a.sisa_sesudah)}</div>`).join('')}
        <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px">
          <span>Hutang jadi</span><span>${rp(Math.max(0, totalHutang - potong))}</span></div>
      </div>${lebih}`;
  }

  async function simpan() {
    if (!terakhir?.items.length) return toast('Belum ada barang yang diisi.', true);
    const b = $('#rSimpan');
    b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      const data = {
        tanggal: dariInput($('#rTgl').value) || new Date(),
        items: terakhir.items, alokasi: terakhir.alokasi, lebih: terakhir.lebih,
        catatan: $('#rCatatan').value.trim()
      };
      const hasil = await S.simpanRetur(data);
      const lengkap = {
        ...data, no: hasil.no,
        total_tukar:  data.items.reduce((n, i) => n + i.qty_tukar, 0),
        total_potong: data.items.reduce((n, i) => n + i.qty_potong, 0),
        total_bungkus: data.items.reduce((n, i) => n + i.qty_tukar + i.qty_potong, 0),
        nilai_potong: hasil.nilai_potong
      };
      tampilkanNota(barisRetur(lengkap), `${hasil.no}.pdf`, `${hasil.no} tersimpan`);
    } catch (e) {
      toast(e.message || 'Gagal menyimpan.', true);
      b.disabled = false; b.textContent = 'Simpan & buat nota';
    }
  }

  gambar();
}

/* ============================================================
   NOTA — pratinjau, kirim, cetak ulang
   ============================================================ */

function tampilkanNota(baris, namaFile, pesan) {
  bukaSheet(`
    <h2 class="sheet-judul">${aman(pesan)}</h2>
    <div class="slip">${pratinjauHTML(baris)}</div>
    <button class="btn btn-primary btn-block" id="nKirim" style="margin-bottom:12px">Kirim ke WhatsApp</button>
    <button class="btn btn-garis btn-block" id="nTutup">Tutup</button>`);

  $('#nKirim').onclick = async () => {
    const b = $('#nKirim');
    b.disabled = true; b.textContent = 'Menyiapkan…';
    try {
      const hasil = await kirimPDF(baris, namaFile);
      if (hasil === 'terunduh') toast('PDF terunduh. Lampirkan manual di WhatsApp.');
      else if (hasil === 'terkirim') toast('Nota terkirim.');
    } catch { toast('Gagal membuat PDF.', true); }
    b.disabled = false; b.textContent = 'Kirim ke WhatsApp';
  };

  $('#nTutup').onclick = () => { tutupSheet(); jalankanRute(); };
}

async function vNota(w) {
  const [setoran, retur, ambil] = await Promise.all([
    S.ambilSetoran(), S.ambilRetur(), S.ambilPengambilan()
  ]);

  const semua = [...setoran, ...retur]
    .sort((a, b) => (keDate(b.tanggal) ?? 0) - (keDate(a.tanggal) ?? 0));

  if (!semua.length) {
    w.innerHTML = `<div class="kosong"><h3>Belum ada nota</h3>
      <p>Setiap setoran dan retur otomatis tercatat di sini, dan bisa dicetak ulang kapan saja.</p></div>`;
    return;
  }

  w.innerHTML = `
    <div class="catatan">Semua nota disimpan sebagai data, bukan file. Kapan pun bisa dicetak ulang dengan isi yang persis sama.</div>
    <div class="ledger">${semua.map(n => `
      <button class="baris ${n.jenis === 'setoran' ? 'lunas' : 'aman'}" data-nota="${n.jenis}:${n.id}">
        <div class="baris-atas">
          <span class="baris-judul">${aman(n.no)}</span>
          <span class="baris-nilai">${n.jenis === 'setoran' ? rp(n.jumlah) : `${n.total_bungkus} bks`}</span>
        </div>
        <div class="baris-bawah">
          <span>${n.jenis === 'setoran' ? 'Setoran uang' : 'Retur barang basi'}</span>
          <span>${tgl(n.tanggal)}</span>
        </div></button>`).join('')}</div>`;

  $$('[data-nota]').forEach(b => b.onclick = () => {
    const [jenis, id] = b.dataset.nota.split(':');
    const n = semua.find(x => x.id === id);
    if (jenis === 'retur') return tampilkanNota(barisRetur(n), `${n.no}.pdf`, `Cetak ulang ${n.no}`);

    // Hutang pada saat nota itu dibuat = sisa saat ini + semua yang dibayar sejak nota tsb.
    const sesudah = setoran
      .filter(s => (keDate(s.tanggal) ?? 0) >= (keDate(n.tanggal) ?? 0))
      .reduce((t, s) => t + s.jumlah, 0);
    const hutangKini = ambil.reduce((t, p) => t + (p.sisa || 0), 0);
    tampilkanNota(barisSetoran(n, hutangKini + sesudah), `${n.no}.pdf`, `Cetak ulang ${n.no}`);
  });
}

/* ============================================================
   PRODUK
   ============================================================ */

async function vProduk(w) {
  const daftar = await S.ambilProduk();

  w.innerHTML = `
    <button class="btn btn-primary btn-block" id="pBaru" style="margin-bottom:16px">Tambah produk</button>
    ${daftar.length
      ? `<div class="ledger">${daftar.map(p => `
          <button class="baris aman" data-produk="${p.id}">
            <div class="baris-atas">
              <span class="baris-judul">${aman(p.nama)}</span>
              <span class="baris-nilai hijau">+${rp(p.harga_titip - p.harga_beli)}/bks</span>
            </div>
            <div class="baris-bawah">
              <span>beli ${rp(p.harga_beli)} · titip ${rp(p.harga_titip)}</span>
              <span>${rp(p.harga_beli * ISI_PER_BALL)}/ball</span>
            </div></button>`).join('')}</div>`
      : `<div class="kosong"><h3>Belum ada produk</h3>
          <p>Mulai dari kripik singkong, talas original, dan talas balado.</p></div>`}`;

  $('#pBaru').onclick = () => formProduk();
  $$('[data-produk]').forEach(b => b.onclick = () => formProduk(daftar.find(p => p.id === b.dataset.produk)));
}

function formProduk(p = null) {
  bukaSheet(`
    <h2 class="sheet-judul">${p ? 'Ubah produk' : 'Produk baru'}</h2>
    <label class="field"><span>Nama produk</span>
      <input id="pNama" value="${aman(p?.nama || '')}" placeholder="Kripik singkong"></label>
    <div class="duo">
      <label class="field"><span>Harga beli / bungkus</span>
        <input type="text" inputmode="numeric" id="pBeli" value="${p ? angka(p.harga_beli) : '3.000'}"></label>
      <label class="field"><span>Harga titip / bungkus</span>
        <input type="text" inputmode="numeric" id="pTitip" value="${p ? angka(p.harga_titip) : '4.000'}"></label>
    </div>
    <div class="rincian" id="pUntung"></div>
    <button class="btn btn-primary btn-block" id="pSimpan" style="margin-bottom:12px">Simpan</button>
    ${p ? `<button class="btn btn-bahaya btn-block" id="pHapus">Hapus produk</button>` : ''}`);

  const hitung = () => {
    const beli  = bacaAngka($('#pBeli').value);
    const titip = bacaAngka($('#pTitip').value);
    const untung = titip - beli;
    $('#pUntung').innerHTML = `
      <div class="rincian-baris"><span>Untung per bungkus</span><span>${rp(untung)}</span></div>
      <div class="rincian-baris"><span>Untung per ball</span><span>${rp(untung * ISI_PER_BALL)}</span></div>
      <div class="rincian-baris"><span>1 bungkus basi menghapus</span><span>untung ${Math.max(0, Math.ceil(beli / (untung || 1)))} bungkus</span></div>`;
  };
  $('#pBeli').oninput = hitung; $('#pTitip').oninput = hitung; hitung();

  $('#pSimpan').onclick = async () => {
    const nama = $('#pNama').value.trim();
    if (!nama) return toast('Nama produk belum diisi.', true);
    const beli  = bacaAngka($('#pBeli').value);
    const titip = bacaAngka($('#pTitip').value);
    if (beli <= 0 || titip <= 0) return toast('Harga harus lebih dari nol.', true);
    if (titip <= beli && !await konfirmasi({
      judul: 'Harga titip tidak menguntungkan',
      pesan: 'Harga titip sama atau lebih rendah dari harga beli. Kamu akan rugi di setiap bungkus.',
      aksi: 'Tetap simpan', bahaya: true
    })) return;

    try {
      await S.simpanProduk({ nama, harga_beli: beli, harga_titip: titip, aktif: true }, p?.id);
      tutupSheet(); toast('Produk tersimpan.'); jalankanRute();
    } catch { toast('Gagal menyimpan produk.', true); }
  };

  if (p) $('#pHapus').onclick = async () => {
    tutupSheet();
    if (!await konfirmasi({
      judul: `Hapus ${p.nama}?`,
      pesan: 'Transaksi lama tetap utuh karena menyimpan nama dan harganya sendiri.',
      aksi: 'Hapus', bahaya: true
    })) return;
    try { await S.hapusProduk(p.id); toast('Produk dihapus.'); jalankanRute(); }
    catch { toast('Gagal menghapus.', true); }
  };
}

/* ============================================================
   STOK GUDANG
   ============================================================ */

async function vStok(w) {
  const stok = await S.stokGudang();

  if (!stok.length) {
    w.innerHTML = `<div class="kosong"><h3>Gudang kosong</h3>
      <p>Stok akan terisi setelah kamu mencatat pengambilan.</p>
      <a class="btn btn-primary" href="#/ambil/baru">Catat pengambilan</a></div>`;
    return;
  }

  w.innerHTML = `
    <div class="catatan">Urut dari yang paling tua. Keluarkan yang di atas dulu, supaya tidak keburu basi di gudang.</div>
    <div class="ledger">${stok.map(s => {
      const umur = s.tertua ? Math.abs(selisihHari(s.tertua)) : 0;
      const tua  = umur >= 10;
      return `<div class="baris ${tua ? 'jatuh' : 'aman'}" style="cursor:default">
        <div class="baris-atas">
          <span class="baris-judul">${aman(s.nama)}</span>
          <span class="baris-nilai">${s.qty} bks</span>
        </div>
        <div class="baris-bawah">
          <span class="${tua ? 'merah' : ''}">${tua ? `umur ${umur} hari — keluarkan duluan` : `umur ${umur} hari`}</span>
          <span>${ball(s.qty)}</span>
        </div></div>`;
    }).join('')}</div>
    <p class="field-hint" style="margin-top:16px">Tahap 1 belum mengurangi stok yang dititipkan ke warung. Angka ini akan akurat setelah Tahap 2 jalan.</p>`;
}

/* ---------- delegasi klik baris beranda ---------- */

$('#view').addEventListener('click', async e => {
  const b = e.target.closest('[data-lihat]');
  if (!b || pecahRute().nama !== 'beranda') return;
  const daftar = await S.ambilPengambilan();
  rincianPengambilan(daftar.find(p => p.id === b.dataset.lihat));
});
