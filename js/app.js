import { usaha, ISI_PER_BALL, APP_PASSWORD } from './config.js?v=2026-09-09-1';
import {
  rp, angka, bacaAngka, ball, tgl, tglPanjang, tempoTeks, selisihHari,
  hariIni, dariInput, keInput, plusBulan, keDate, $, $$, aman, toast,
  bukaSheet, tutupSheet, konfirmasi
} from './util.js';
import * as S from './store.js?v=2026-09-09-1';
import {
  barisPengambilan, barisSetoran, barisRetur, barisKunjungan,
  pratinjauHTML, kirimPDF
} from './nota.js?v=2026-09-09-1';

/** Jatah tempo bawaan dari distributor, dalam bulan. Masih bisa diubah per nota. */
const TEMPO_BULAN = 2;

/** Tampil di menu ⋮ — untuk memastikan browser tidak menjalankan versi lama
 *  dari cache. Sengaja di sini, bukan di config.js: config.js adalah berkas
 *  yang kamu sunting sendiri, sedangkan ini ikut tiap deploy. */
const VERSI = '2026-09-09 · 1';

/* ============================================================
   GERBANG KATA SANDI
   Ini bukan keamanan data — hanya penghalang tampilan.
   Keamanan data sesungguhnya ada (atau sengaja tidak ada) di
   firestore.rules.
   ============================================================ */

const KUNCI_SESI = 'kripik_masuk';

function bukaGerbang() {
  $('#gate').hidden  = true;
  $('#shell').hidden = false;
  jalankanRute();
}

// Beri tahu pengaman di index.html bahwa modul berhasil jalan.
window.bukuKripikSiap?.();

$('#boot').hidden = true;
if (localStorage.getItem(KUNCI_SESI) === '1') {
  bukaGerbang();
} else {
  $('#gate').hidden = false;
}

$('#gBtn').onclick = () => {
  const salah = $('#gErr');
  if ($('#gPass').value === APP_PASSWORD) {
    localStorage.setItem(KUNCI_SESI, '1');
    salah.hidden = true;
    bukaGerbang();
  } else {
    salah.textContent = 'Kata sandi salah.';
    salah.hidden = false;
  }
};

$('#gPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#gBtn').click(); });

/* ============================================================
   MENU LAINNYA
   ============================================================ */

$('#menuBtn').onclick = () => {
  bukaSheet(`
    <h2 class="sheet-judul">Lainnya</h2>
    <button class="sheet-menu" data-go="#/setor">Setor ke distributor<small>Bayar hutang pengambilan</small></button>
    <button class="sheet-menu" data-go="#/retur">Retur ke distributor<small>Kembalikan barang basi</small></button>
    <button class="sheet-menu" data-go="#/produk">Produk<small>Harga beli dan harga titip</small></button>
    <button class="sheet-menu" data-go="#/stok">Stok gudang<small>Lihat umur stok, keluarkan yang tua dulu</small></button>
    <button class="sheet-menu" id="mExport">Simpan cadangan<small>Unduh semua data sebagai file JSON</small></button>
    <button class="sheet-menu" id="mSegar">Muat ulang versi terbaru<small>Pakai kalau ada yang aneh setelah aplikasi diperbarui</small></button>
    <button class="sheet-menu" id="mKeluar" style="color:var(--merah)">Keluar</button>
    <p class="field-hint" style="text-align:center;margin-top:16px">Versi ${aman(VERSI)}</p>`);

  $('#mSegar').onclick = async () => {
    tutupSheet();
    toast('Mengambil versi terbaru…');
    // Mengganti query di URL hanya menyegarkan index.html — modul JS di
    // dalamnya tetap diambil dari cache. Jadi tiap berkas ditarik ulang
    // dengan cache:'reload', yang sekalian memperbarui isi cache browser,
    // baru halaman dimuat ulang.
    const berkas = [
      'index.html', 'assets/style.css',
      'js/app.js', 'js/store.js', 'js/util.js', 'js/nota.js', 'js/config.js'
    ];
    await Promise.all(berkas.map(f =>
      fetch(f, { cache: 'reload' }).catch(() => {})));
    location.reload();
  };

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
    if (await konfirmasi({ judul: 'Keluar?', pesan: 'Kamu perlu masukkan kata sandi lagi nanti.', aksi: 'Keluar', bahaya: true })) {
      localStorage.removeItem(KUNCI_SESI);
      location.reload();
    }
  };
};

/* ============================================================
   ROUTER
   ============================================================ */

const RUTE = {
  beranda: { judul: 'Beranda',      tab: 'beranda', render: vBeranda },
  warung:  { judul: 'Warung',       tab: 'warung',  render: vWarung },
  ambil:   { judul: 'Pengambilan',  tab: 'ambil',   render: vAmbil },
  nota:    { judul: 'Riwayat nota', tab: 'nota',    render: vNota },
  laporan: { judul: 'Laporan',      tab: 'laporan', render: vLaporan },
  setor:   { judul: 'Setoran',      tab: '',        render: vSetor },
  retur:   { judul: 'Retur',        tab: '',        render: vRetur },
  produk:  { judul: 'Produk',       tab: '',        render: vProduk },
  stok:    { judul: 'Stok gudang',  tab: '',        render: vStok }
};

function pecahRute() {
  const bagian = (location.hash || '#/beranda').replace(/^#\/?/, '').split('/');
  return { nama: bagian[0] || 'beranda', anak: bagian[1] || '', cucu: bagian[2] || '' };
}

async function jalankanRute() {
  if ($('#shell').hidden) return;
  const { nama, anak, cucu } = pecahRute();
  const r = RUTE[nama] || RUTE.beranda;

  $('#viewTitle').textContent = r.judul;
  $$('.tabbar a').forEach(a =>
    a.toggleAttribute('aria-current', a.dataset.tab === r.tab));

  const wadah = $('#view');
  wadah.innerHTML = `<div class="kosong"><p>Memuat…</p></div>`;
  window.scrollTo(0, 0);

  try {
    await r.render(wadah, anak, cucu);
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
  const [r, warung] = await Promise.all([S.ringkasan(), S.ambilWarung()]);
  const tempo = r.berikut ? tempoTeks(r.berikut.jatuh_tempo) : null;

  const endap = warung.reduce((n, x) => n + S.nilaiDiWarung(x) + (x.piutang || 0), 0);
  const bksWarung = warung.reduce((n, x) => n + S.bungkusDiWarung(x), 0);
  const perluCek = warung.filter(x => {
    const h = x.kunjungan_terakhir ? Math.abs(selisihHari(x.kunjungan_terakhir)) : null;
    return (h === null || h >= 7) && S.bungkusDiWarung(x) > 0;
  });

  const peringatan = r.jumlahLewat
    ? `<div class="peringatan">${r.jumlahLewat} pengambilan sudah lewat jatuh tempo, senilai ${rp(r.nilaiLewat)}. Hubungi produsen hari ini.</div>`
    : '';

  const daftar = r.belum.length
    ? `<div class="ledger">${r.belum
        .slice()
        .sort((a, b) => (keDate(a.jatuh_tempo) ?? 8e15) - (keDate(b.jatuh_tempo) ?? 8e15))
        .map(barisHutang).join('')}</div>`
    : `<div class="kosong"><h3>Tidak ada hutang berjalan</h3>
         <p>Semua pengambilan sudah lunas.</p>
         <a class="btn btn-primary" href="#/ambil/baru">Catat pengambilan</a></div>`;

  const cekWarung = perluCek.length
    ? `<div class="catatan">${perluCek.length} warung belum dicek seminggu lebih: ${aman(perluCek.slice(0, 3).map(x => x.nama).join(', '))}${perluCek.length > 3 ? ', dan lainnya' : ''}.</div>`
    : '';

  w.innerHTML = `
    ${peringatan}
    ${cekWarung}
    <section class="kop">
      <p class="kop-label">Hutang ke ${aman(usaha.produsen)}</p>
      <p class="kop-angka">${rp(r.totalHutang)}</p>
      <p class="kop-sub">${r.jumlahBatch} pengambilan belum lunas</p>
      <div class="kop-pisah"></div>
      <div class="kop-grid">
        <div><p>Jatuh tempo terdekat</p><p class="${tempo?.kelas === 'jatuh' ? 'merah' : ''}">${tempo ? aman(tempo.teks) : '—'}</p></div>
        <div><p>Tanggalnya</p><p>${r.berikut ? tgl(r.berikut.jatuh_tempo) : '—'}</p></div>
      </div>
      <div class="kop-pisah"></div>
      <div class="kop-grid">
        <div><p>Uang endap di warung</p><p>${rp(endap)}</p></div>
        <div><p>Barang di warung</p><p>${bksWarung} bks</p></div>
      </div>
    </section>

    <div class="btn-baris">
      <a class="btn btn-primary" href="#/warung">Cek warung</a>
      <a class="btn btn-garis" href="#/setor">Setor uang</a>
    </div>

    <div class="bagian"><h2>Hutang berjalan</h2><span>urut jatuh tempo</span></div>
    ${daftar}`;
}

/** Satu baris hutang berjalan di Beranda. Bukan nota — itu barisPengambilan()
 *  dari nota.js, yang namanya sengaja dibedakan supaya tidak bentrok. */
function barisHutang(p) {
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

async function vAmbil(w, anak, cucu) {
  const produk = await S.ambilProduk();

  if (anak === 'baru') {
    if (!produk.length) {
      w.innerHTML = `<div class="kosong"><h3>Belum ada produk</h3>
        <p>Daftarkan produk beserta harga belinya dulu.</p>
        <a class="btn btn-primary" href="#/produk">Tambah produk</a></div>`;
      return;
    }
    const belum = await S.ambilPengambilan({ hanyaBelumLunas: true });
    return formPengambilan(w, produk, belum.reduce((n, p) => n + (p.sisa || 0), 0));
  }

  if (anak === 'ubah' && cucu) {
    const semua = await S.ambilPengambilan();
    const p = semua.find(x => x.id === cucu);
    if (!p) {
      w.innerHTML = `<div class="kosong"><h3>Tidak ditemukan</h3>
        <a class="btn btn-garis" href="#/ambil">Kembali</a></div>`;
      return;
    }
    if ((p.terbayar || 0) > 0) {
      w.innerHTML = `<div class="kosong"><h3>Tidak bisa diubah</h3>
        <p>${aman(p.no)} sudah pernah disetor/dipotong sebagian, jadi tidak aman diubah lagi.</p>
        <a class="btn btn-garis" href="#/ambil">Kembali</a></div>`;
      return;
    }
    const hutangSebelum = semua
      .filter(x => x.id !== p.id)
      .reduce((n, x) => n + (x.sisa || 0), 0);
    return formPengambilan(w, produk, hutangSebelum, p);
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

function formPengambilan(w, produk, hutangSebelum = 0, existing = null) {
  const items = existing
    ? existing.items.map(i => ({ produk_id: i.produk_id, ball: i.qty / ISI_PER_BALL }))
    : [{ produk_id: produk[0].id, ball: 1 }];

  // Disimpan di luar gambar() supaya tidak hilang saat form digambar ulang.
  const form = {
    tgl: existing ? keInput(existing.tanggal) : hariIni(),
    tempo: existing?.jatuh_tempo ? keInput(existing.jatuh_tempo) : plusBulan(hariIni(), TEMPO_BULAN),
    catatan: existing?.catatan || '',
    tempoDiubah: !!existing?.jatuh_tempo
  };

  const gambar = () => {
    w.innerHTML = `
      <div class="catatan">Isi jumlah dalam ball. Sistem menyimpannya sebagai bungkus (1 ball = ${ISI_PER_BALL} bungkus).</div>

      <label class="field"><span>Tanggal ambil</span>
        <input type="date" id="fTgl" value="${form.tgl}"></label>

      <div class="bagian"><h2>Barang diambil</h2></div>
      <div id="fItems"></div>
      <button class="btn btn-garis btn-block" id="fTambah" style="margin-bottom:24px">Tambah produk lain</button>

      <label class="field"><span>Jatuh tempo yang disepakati</span>
        <input type="date" id="fTempo" value="${form.tempo}">
        <span class="field-hint">Otomatis ${TEMPO_BULAN} bulan dari tanggal ambil — jatah dari ${aman(usaha.produsen)}. Ubah kalau kesepakatannya lain.</span></label>

      <label class="field"><span>Catatan negosiasi</span>
        <input id="fCatatan" value="${aman(form.catatan)}" placeholder="mis. boleh dicicil"></label>

      <div class="rincian" id="fTotal"></div>
      <button class="btn btn-primary btn-block" id="fSimpan">${existing ? 'Simpan perubahan' : 'Simpan pengambilan'}</button>`;

    $('#fTgl').onchange = () => {
      form.tgl = $('#fTgl').value;
      // Tempo ikut geser selama belum diubah manual.
      if (!form.tempoDiubah && form.tgl) {
        form.tempo = plusBulan(form.tgl, TEMPO_BULAN);
        $('#fTempo').value = form.tempo;
      }
    };
    $('#fTempo').onchange  = () => { form.tempo = $('#fTempo').value; form.tempoDiubah = true; };
    $('#fCatatan').oninput = () => { form.catatan = $('#fCatatan').value; };

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
      const tanggal = dariInput($('#fTgl').value) || new Date();
      const catatan = $('#fCatatan').value.trim();

      if (existing) {
        const hasil = await S.ubahPengambilan(existing.id, {
          tanggal, items: jadi, jatuh_tempo: tempo, catatan
        });
        tampilkanNota(
          barisPengambilan({
            no: existing.no, tanggal, items: jadi, total: hasil.total,
            jatuh_tempo: tempo, catatan, terbayar: 0, sisa: hasil.total
          }, hutangSebelum),
          `${existing.no}.pdf`, `${existing.no} diperbarui`, '#/ambil');
      } else {
        const hasil = await S.simpanPengambilan({
          tanggal, items: jadi, jatuh_tempo: tempo, catatan
        });
        tampilkanNota(
          barisPengambilan({
            no: hasil.no, tanggal, items: jadi, total: hasil.total,
            jatuh_tempo: tempo, catatan, terbayar: 0, sisa: hasil.total
          }, hutangSebelum),
          `${hasil.no}.pdf`, `${hasil.no} tersimpan`, '#/ambil');
      }
    } catch (e) {
      toast(e.message || 'Gagal menyimpan.', true);
      b.disabled = false; b.textContent = existing ? 'Simpan perubahan' : 'Simpan pengambilan';
    }
  }

  gambar();
}

function rincianPengambilan(p) {
  if (!p) return;
  const bks = (p.items || []).reduce((n, i) => n + i.qty, 0);
  const t = p.lunas ? { teks: 'Lunas' } : tempoTeks(p.jatuh_tempo);
  const bolehUbah = (p.terbayar || 0) === 0;

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
    <button class="btn btn-primary btn-block" id="pNota" style="margin-top:24px;margin-bottom:12px">Cetak nota</button>
    ${bolehUbah
      ? `<button class="btn btn-garis btn-block" id="pUbah" style="margin-bottom:12px">Ubah</button>
         <button class="btn btn-bahaya btn-block" id="pHapusAmbil" style="margin-bottom:12px">Hapus</button>`
      : `<p class="field-hint" style="text-align:center;margin-bottom:12px">Sudah pernah disetor/dipotong sebagian, jadi tidak bisa diubah atau dihapus lagi.</p>`}
    <button class="btn btn-garis btn-block" data-close>Tutup</button>`);

  $('#pNota').onclick = () =>
    tampilkanNota(barisPengambilan(p), `${p.no}.pdf`, `Cetak ulang ${p.no}`);

  if (bolehUbah) {
    $('#pUbah').onclick = () => { tutupSheet(); location.hash = `#/ambil/ubah/${p.id}`; };

    $('#pHapusAmbil').onclick = async () => {
      tutupSheet();
      if (!await konfirmasi({
        judul: `Hapus ${p.no}?`,
        pesan: `Pengambilan ini akan dihapus dan hutang ${rp(p.total)}-nya ikut hilang. Nomor nota akan bolong — itu wajar untuk koreksi kesalahan. Tidak bisa dibatalkan.`,
        aksi: 'Hapus', bahaya: true
      })) return;
      try {
        await S.hapusPengambilan(p);
        toast(`${p.no} dihapus.`);
        jalankanRute();
      } catch (e) { toast(e.message || 'Gagal menghapus.', true); }
    };
  }
}

/* ============================================================
   WARUNG
   ============================================================ */

async function vWarung(w, anak, cucu) {
  if (anak === 'kunjungan' && cucu) return formKunjungan(w, cucu);

  const daftar = await S.ambilWarung();

  if (!daftar.length) {
    w.innerHTML = `<div class="kosong"><h3>Belum ada warung</h3>
      <p>Daftarkan warung tempat kamu menitipkan barang.</p></div>
      <button class="btn btn-primary btn-block" id="wBaru" style="margin-top:16px">Tambah warung</button>`;
    $('#wBaru').onclick = () => formWarung();
    return;
  }

  const totalTitip   = daftar.reduce((n, x) => n + S.bungkusDiWarung(x), 0);
  const totalPiutang = daftar.reduce((n, x) => n + (x.piutang || 0), 0);
  const totalNilai   = daftar.reduce((n, x) => n + S.nilaiDiWarung(x), 0);

  w.innerHTML = `
    <div class="rincian">
      <h3>Uang kamu yang ada di warung</h3>
      <div class="rincian-baris"><span>Barang tertitip (${totalTitip} bks)</span><span>${rp(totalNilai)}</span></div>
      <div class="rincian-baris"><span>Belum dibayar warung</span><span>${rp(totalPiutang)}</span></div>
      <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px">
        <span>Total endap</span><span>${rp(totalNilai + totalPiutang)}</span></div>
    </div>

    <button class="btn btn-primary btn-block" id="wBaru" style="margin-bottom:16px">Tambah warung</button>

    <div class="ledger">${daftar.map(x => {
      const bks   = S.bungkusDiWarung(x);
      const hari  = x.kunjungan_terakhir ? Math.abs(selisihHari(x.kunjungan_terakhir)) : null;
      const perlu = hari === null || hari >= 7;
      return `<button class="baris ${perlu ? 'dekat' : bks ? 'aman' : 'lunas'}" data-warung="${x.id}">
        <div class="baris-atas">
          <span class="baris-judul">${aman(x.nama)}</span>
          <span class="baris-nilai">${bks} bks</span>
        </div>
        <div class="baris-bawah">
          <span>${x.piutang > 0 ? `<span class="merah">belum bayar ${rp(x.piutang)}</span>` : 'tidak ada tagihan'}</span>
          <span>${hari === null ? 'belum pernah dicek' : hari === 0 ? 'dicek hari ini' : `${hari} hari lalu`}</span>
        </div></button>`;
    }).join('')}</div>`;

  $('#wBaru').onclick = () => formWarung();
  $$('[data-warung]').forEach(b =>
    b.onclick = () => rincianWarung(daftar.find(x => x.id === b.dataset.warung)));
}

function rincianWarung(x) {
  if (!x) return;
  const stok = Object.values(x.stok || {});
  const bks  = S.bungkusDiWarung(x);

  bukaSheet(`
    <h2 class="sheet-judul">${aman(x.nama)}</h2>
    ${x.pemilik || x.hp ? `<p style="color:var(--tinta-lembut);font-size:.88rem;margin-bottom:12px">
      ${aman(x.pemilik || '')}${x.pemilik && x.hp ? ' · ' : ''}${aman(x.hp || '')}</p>` : ''}
    ${x.alamat ? `<p style="color:var(--tinta-lembut);font-size:.88rem;margin-bottom:16px">${aman(x.alamat)}</p>` : ''}

    <div class="rincian">
      <h3>Barang tertitip sekarang</h3>
      ${stok.length
        ? stok.map(s => `<div class="rincian-baris"><span>${aman(s.nama)}</span><span>${s.qty} bks</span></div>`).join('')
        : '<div class="rincian-baris"><span>Kosong</span><span>0 bks</span></div>'}
      <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px">
        <span>Nilai titipan</span><span>${rp(S.nilaiDiWarung(x))}</span></div>
      <div class="rincian-baris"><span>Belum dibayar</span><span>${rp(x.piutang || 0)}</span></div>
    </div>

    <div class="rincian-baris"><span>Dicek terakhir</span><span>${x.kunjungan_terakhir ? tglPanjang(x.kunjungan_terakhir) : 'belum pernah'}</span></div>
    ${x.catatan ? `<p style="margin-top:12px;color:var(--tinta-lembut);font-size:.88rem">${aman(x.catatan)}</p>` : ''}

    <button class="btn btn-primary btn-block" id="wKunjung" style="margin-top:24px;margin-bottom:12px">Catat kunjungan</button>
    <button class="btn btn-garis btn-block" id="wUbah">Ubah data warung</button>`);

  $('#wKunjung').onclick = () => { tutupSheet(); location.hash = `#/warung/kunjungan/${x.id}`; };
  $('#wUbah').onclick    = () => { tutupSheet(); formWarung(x); };
}

function formWarung(x = null) {
  bukaSheet(`
    <h2 class="sheet-judul">${x ? 'Ubah warung' : 'Warung baru'}</h2>
    <label class="field"><span>Nama warung</span>
      <input id="wNama" value="${aman(x?.nama || '')}" placeholder="Warung Bu Sri"></label>
    <div class="duo">
      <label class="field"><span>Pemilik</span>
        <input id="wPemilik" value="${aman(x?.pemilik || '')}" placeholder="Bu Sri"></label>
      <label class="field"><span>Nomor HP</span>
        <input id="wHp" type="tel" inputmode="tel" value="${aman(x?.hp || '')}" placeholder="08..."></label>
    </div>
    <label class="field"><span>Alamat / patokan</span>
      <input id="wAlamat" value="${aman(x?.alamat || '')}" placeholder="depan SD, jalan Kalimantan"></label>
    <label class="field"><span>Catatan</span>
      <input id="wCatatan" value="${aman(x?.catatan || '')}" placeholder="mis. bayarnya suka telat"></label>
    <button class="btn btn-primary btn-block" id="wSimpan" style="margin-bottom:12px">Simpan</button>
    ${x ? `<button class="btn btn-bahaya btn-block" id="wHapus">Hapus warung</button>` : ''}`);

  $('#wSimpan').onclick = async () => {
    const nama = $('#wNama').value.trim();
    if (!nama) return toast('Nama warung belum diisi.', true);
    try {
      await S.simpanWarung({
        nama,
        pemilik: $('#wPemilik').value.trim(),
        hp:      $('#wHp').value.trim(),
        alamat:  $('#wAlamat').value.trim(),
        catatan: $('#wCatatan').value.trim(),
        aktif:   true
      }, x?.id);
      tutupSheet(); toast('Warung tersimpan.'); jalankanRute();
    } catch { toast('Gagal menyimpan warung.', true); }
  };

  if (x) $('#wHapus').onclick = async () => {
    tutupSheet();
    const bks  = S.bungkusDiWarung(x);
    const utang = x.piutang || 0;
    if (bks > 0 || utang > 0) {
      toast(`Tidak bisa dihapus: masih ada ${bks} bks titipan dan ${rp(utang)} belum dibayar.`, true);
      return;
    }
    if (!await konfirmasi({
      judul: `Hapus ${x.nama}?`,
      pesan: 'Riwayat kunjungan tetap tersimpan dan tetap bisa dicetak.',
      aksi: 'Hapus', bahaya: true
    })) return;
    try { await S.hapusWarung(x.id); toast('Warung dihapus.'); jalankanRute(); }
    catch { toast('Gagal menghapus.', true); }
  };
}

/* ============================================================
   KUNJUNGAN — hitung sisa, terima uang, titip lagi
   ============================================================ */

async function formKunjungan(w, warungId) {
  const [semuaWarung, produk] = await Promise.all([S.ambilWarung(), S.ambilProduk()]);
  const warung = semuaWarung.find(x => x.id === warungId);

  if (!warung) {
    w.innerHTML = `<div class="kosong"><h3>Warung tidak ditemukan</h3>
      <a class="btn btn-garis" href="#/warung">Kembali</a></div>`;
    return;
  }
  if (!produk.length) {
    w.innerHTML = `<div class="kosong"><h3>Belum ada produk</h3>
      <p>Daftarkan produk dulu supaya harga titipnya bisa dihitung.</p>
      <a class="btn btn-primary" href="#/produk">Tambah produk</a></div>`;
    return;
  }

  const cariProduk = (pid, nama) =>
    produk.find(p => p.id === pid) || produk.find(p => p.nama === nama) || null;

  // Baris awal: semua produk yang sedang tertitip di warung ini.
  const baris = Object.entries(warung.stok || {}).map(([pid, s]) => {
    const p = cariProduk(pid, s.nama);
    return {
      produk_id: pid,
      nama: s.nama,
      harga_titip: s.harga_titip ?? p?.harga_titip ?? 0,
      harga_beli:  p?.harga_beli ?? 0,
      stok_awal: s.qty || 0,
      sisa: s.qty || 0,   // anggap belum laku sampai diisi
      basi: 0,
      titip_baru: 0
    };
  });

  const form = { tgl: hariIni(), bayar: '0', catatan: '' };

  const gambar = () => {
    w.innerHTML = `
      <div class="catatan">Kunjungan ke <b>${aman(warung.nama)}</b>. Isi sisa fisik yang kamu hitung di rak — yang laku dihitung otomatis.</div>

      <label class="field"><span>Tanggal kunjungan</span>
        <input type="date" id="kTgl" value="${form.tgl}"></label>

      <div class="bagian"><h2>Barang di warung</h2></div>
      <div id="kItems"></div>
      <button class="btn btn-garis btn-block" id="kTambah" style="margin-bottom:24px">Titip produk lain</button>

      <div id="kRingkas"></div>

      <label class="field uang"><span>Uang diterima hari ini</span>
        <input type="text" inputmode="numeric" id="kBayar" value="${aman(form.bayar)}"></label>
      <div id="kSisa"></div>

      <label class="field"><span>Catatan (ikut tercetak di nota)</span>
        <input id="kCatatan" value="${aman(form.catatan)}" placeholder="mis. minta tambah rasa balado"></label>

      <button class="btn btn-primary btn-block" id="kSimpan">Simpan &amp; buat nota</button>`;

    $('#kTgl').onchange    = () => { form.tgl = $('#kTgl').value; };
    $('#kCatatan').oninput = () => { form.catatan = $('#kCatatan').value; };

    $('#kItems').innerHTML = baris.length ? baris.map((it, n) => `
      <div class="item">
        <div class="item-kepala">
          <strong>${aman(it.nama)}</strong>
          ${it.stok_awal === 0 ? `<button class="item-buang" data-buang="${n}">Hapus</button>` : ''}
        </div>
        <div class="rincian-baris" style="padding:0 0 8px">
          <span style="color:var(--tinta-lembut);font-size:.84rem">Tercatat di warung</span>
          <span style="font-weight:700">${it.stok_awal} bks</span>
        </div>
        ${it.stok_awal > 0 ? `
        <div class="duo">
          <label class="field" style="margin-bottom:12px"><span>Sisa fisik (bks)</span>
            <input type="number" min="0" max="${it.stok_awal}" step="1" inputmode="numeric" data-sisa="${n}" value="${it.sisa}"></label>
          <label class="field" style="margin-bottom:12px"><span>Basi/rusak (bks)</span>
            <input type="number" min="0" max="${it.stok_awal}" step="1" inputmode="numeric" data-basi="${n}" value="${it.basi}"></label>
        </div>` : ''}
        <label class="field" style="margin-bottom:0"><span>Titip lagi (bks)</span>
          <input type="number" min="0" step="1" inputmode="numeric" data-titip="${n}" value="${it.titip_baru}"></label>
        <div data-hasil="${n}" style="font-size:.84rem;color:var(--tinta-lembut);margin-top:8px"></div>
      </div>`).join('')
      : `<div class="kosong" style="padding:24px 16px"><p style="margin:0">Belum ada barang di warung ini. Tambahkan produk yang mau dititipkan.</p></div>`;

    $$('[data-sisa]').forEach(i => i.oninput  = () => { baris[+i.dataset.sisa].sisa  = batas(i, baris[+i.dataset.sisa]); hitung(); });
    $$('[data-basi]').forEach(i => i.oninput  = () => { baris[+i.dataset.basi].basi  = batas(i, baris[+i.dataset.basi]); hitung(); });
    $$('[data-titip]').forEach(i => i.oninput = () => { baris[+i.dataset.titip].titip_baru = Math.max(0, +i.value || 0); hitung(); });
    $$('[data-buang]').forEach(b => b.onclick = () => { baris.splice(+b.dataset.buang, 1); gambar(); });

    $('#kTambah').onclick = () => pilihProdukTitip();
    $('#kBayar').oninput  = () => { form.bayar = $('#kBayar').value; hitung(); };
    $('#kSimpan').onclick = simpan;
    hitung();
  };

  const batas = (input, it) => Math.min(it.stok_awal, Math.max(0, +input.value || 0));

  function pilihProdukTitip() {
    const belumAda = produk.filter(p => !baris.some(b => b.produk_id === p.id));
    if (!belumAda.length) return toast('Semua produk sudah ada di daftar.');

    bukaSheet(`
      <h2 class="sheet-judul">Titip produk apa?</h2>
      ${belumAda.map(p => `<button class="sheet-menu" data-pilih="${p.id}">${aman(p.nama)}
        <small>titip ${rp(p.harga_titip)}/bks · modal ${rp(p.harga_beli)}/bks</small></button>`).join('')}`);

    $$('[data-pilih]').forEach(b => b.onclick = () => {
      const p = produk.find(x => x.id === b.dataset.pilih);
      baris.push({
        produk_id: p.id, nama: p.nama,
        harga_titip: p.harga_titip, harga_beli: p.harga_beli,
        stok_awal: 0, sisa: 0, basi: 0, titip_baru: 0
      });
      tutupSheet(); gambar();
    });
  }

  const hitungBaris = it => {
    const laku = Math.max(0, it.stok_awal - it.sisa - it.basi);
    return { laku, nilai: laku * it.harga_titip, akhir: it.sisa + it.titip_baru };
  };

  function hitung() {
    let nilaiLaku = 0, bksLaku = 0, bksBasi = 0, bksAkhir = 0, untung = 0;

    baris.forEach((it, n) => {
      const h = hitungBaris(it);
      nilaiLaku += h.nilai; bksLaku += h.laku;
      bksBasi   += it.basi; bksAkhir += h.akhir;
      untung    += h.laku * (it.harga_titip - it.harga_beli);

      const el = $(`[data-hasil="${n}"]`);
      if (el) {
        el.innerHTML = it.stok_awal > 0
          ? `Laku <b>${h.laku} bks</b> = ${rp(h.nilai)} · tinggal ${h.akhir} bks di warung`
          : `Titipan baru · tinggal ${h.akhir} bks di warung`;
      }
    });

    const piutangLama = warung.piutang || 0;
    const tagihan     = piutangLama + nilaiLaku;
    const dibayar     = bacaAngka($('#kBayar')?.value || 0);
    const sisaTagihan = Math.max(0, tagihan - dibayar);

    $('#kRingkas').innerHTML = `
      <div class="rincian">
        <h3>Hasil kunjungan</h3>
        <div class="rincian-baris"><span>Laku ${bksLaku} bks</span><span>${rp(nilaiLaku)}</span></div>
        ${piutangLama > 0 ? `<div class="rincian-baris"><span>Sisa tagihan lalu</span><span>${rp(piutangLama)}</span></div>` : ''}
        <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px">
          <span>Total tagihan</span><span>${rp(tagihan)}</span></div>
        <div class="rincian-baris"><span>Untung dari yang laku</span><span class="hijau">${rp(untung)}</span></div>
        ${bksBasi ? `<div class="rincian-baris"><span>Basi ditarik</span><span class="merah">${bksBasi} bks</span></div>` : ''}
        <div class="rincian-baris"><span>Tinggal di warung</span><span>${bksAkhir} bks</span></div>
      </div>`;

    $('#kSisa').innerHTML = `
      <div class="rincian ${dibayar > tagihan ? 'bahaya' : ''}" style="margin-top:-8px">
        <div class="rincian-baris"><span>Sisa tagihan sesudah bayar</span><span>${rp(sisaTagihan)}</span></div>
        ${dibayar > tagihan ? `<div class="rincian-baris"><span>Kelebihan bayar</span><span>${rp(dibayar - tagihan)}</span></div>` : ''}
      </div>`;

    const adaIsi = baris.some(it => it.stok_awal > 0 || it.titip_baru > 0);
    $('#kSimpan').disabled = !adaIsi;
  }

  async function simpan() {
    const dibayar = bacaAngka($('#kBayar').value);
    const items   = baris.filter(it => it.stok_awal > 0 || it.titip_baru > 0);
    if (!items.length) return toast('Belum ada barang yang diisi.', true);

    const b = $('#kSimpan');
    b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      const data = {
        warung,
        tanggal: dariInput($('#kTgl').value) || new Date(),
        items, dibayar,
        catatan: $('#kCatatan').value.trim()
      };
      const hasil = await S.simpanKunjungan(data);
      const lengkap = {
        no: hasil.no, warung_nama: warung.nama, tanggal: data.tanggal,
        items: items.map(it => {
          const h = hitungBaris(it);
          return { ...it, laku: h.laku, stok_akhir: h.akhir };
        }),
        nilai_laku: hasil.nilai_laku, tagihan: hasil.tagihan,
        dibayar, piutang_sebelum: warung.piutang || 0,
        piutang_sesudah: hasil.piutang_sesudah,
        catatan: data.catatan
      };
      tampilkanNota(barisKunjungan(lengkap), `${hasil.no}.pdf`,
        `${hasil.no} tersimpan`, '#/warung');
    } catch (e) {
      toast(e.message || 'Gagal menyimpan.', true);
      b.disabled = false; b.textContent = 'Simpan & buat nota';
    }
  }

  gambar();
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

  const form = { tgl: hariIni(), catatan: '' };

  const gambar = () => {
    w.innerHTML = `
      <div class="catatan">Barang basi yang kamu kembalikan ke distributor. Isi dalam bungkus. Bagi antara ditukar barang baru dan potong hutang.</div>

      <label class="field"><span>Tanggal retur</span>
        <input type="date" id="rTgl" value="${form.tgl}"></label>

      <div class="bagian"><h2>Barang basi</h2></div>
      <div id="rItems"></div>
      <button class="btn btn-garis btn-block" id="rTambah" style="margin-bottom:24px">Tambah produk lain</button>

      <div id="rPratinjau"></div>

      <label class="field"><span>Catatan (ikut tercetak di nota)</span>
        <input id="rCatatan" value="${aman(form.catatan)}" placeholder="mis. dari warung Bu Sri, tengik"></label>

      <button class="btn btn-primary btn-block" id="rSimpan">Simpan &amp; buat nota</button>`;

    $('#rTgl').onchange    = () => { form.tgl = $('#rTgl').value; };
    $('#rCatatan').oninput = () => { form.catatan = $('#rCatatan').value; };

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

function tampilkanNota(baris, namaFile, pesan, kembali = '') {
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

  $('#nTutup').onclick = () => {
    tutupSheet();
    if (kembali && location.hash !== kembali) location.hash = kembali;
    else jalankanRute();
  };
}

async function vNota(w) {
  const [setoran, retur, ambil, kunjungan] = await Promise.all([
    S.ambilSetoran(), S.ambilRetur(), S.ambilPengambilan(), S.ambilKunjungan()
  ]);

  const semua = [
    ...setoran, ...retur, ...kunjungan,
    ...ambil.map(p => ({ ...p, jenis: 'pengambilan' }))
  ].sort((a, b) => (keDate(b.tanggal) ?? 0) - (keDate(a.tanggal) ?? 0));

  if (!semua.length) {
    w.innerHTML = `<div class="kosong"><h3>Belum ada nota</h3>
      <p>Setiap setoran dan retur otomatis tercatat di sini, dan bisa dicetak ulang kapan saja.</p></div>`;
    return;
  }

  const gaya = { setoran: 'lunas', retur: 'aman', kunjungan: 'dekat', pengambilan: 'jatuh' };
  const label = {
    setoran:     'Setoran ke distributor',
    retur:       'Retur barang basi',
    kunjungan:   'Kunjungan warung',
    pengambilan: 'Ambil dari distributor'
  };
  const nilai = n =>
    n.jenis === 'setoran'     ? rp(n.jumlah)
  : n.jenis === 'kunjungan'   ? rp(n.dibayar || 0)
  : n.jenis === 'pengambilan' ? rp(n.total)
  :                             `${n.total_bungkus} bks`;

  w.innerHTML = `
    <div class="catatan">Semua nota disimpan sebagai data, bukan file. Kapan pun bisa dicetak ulang dengan isi yang persis sama.</div>
    <div class="ledger">${semua.map(n => `
      <button class="baris ${gaya[n.jenis] || 'aman'}" data-nota="${n.jenis}:${n.id}">
        <div class="baris-atas">
          <span class="baris-judul">${aman(n.no)}${n.warung_nama ? ' · ' + aman(n.warung_nama) : ''}</span>
          <span class="baris-nilai">${nilai(n)}</span>
        </div>
        <div class="baris-bawah">
          <span>${label[n.jenis]}</span>
          <span>${tgl(n.tanggal)}</span>
        </div></button>`).join('')}</div>`;

  const cetakUlang = (jenis, n) => {
    if (jenis === 'retur')       return tampilkanNota(barisRetur(n), `${n.no}.pdf`, `Cetak ulang ${n.no}`);
    if (jenis === 'kunjungan')   return tampilkanNota(barisKunjungan(n), `${n.no}.pdf`, `Cetak ulang ${n.no}`);
    if (jenis === 'pengambilan') return tampilkanNota(barisPengambilan(n), `${n.no}.pdf`, `Cetak ulang ${n.no}`);

    // Hutang pada saat nota itu dibuat = sisa saat ini + semua yang dibayar sejak nota tsb.
    const sesudah = setoran
      .filter(s => (keDate(s.tanggal) ?? 0) >= (keDate(n.tanggal) ?? 0))
      .reduce((t, s) => t + s.jumlah, 0);
    const hutangKini = ambil.reduce((t, p) => t + (p.sisa || 0), 0);
    return tampilkanNota(barisSetoran(n, hutangKini + sesudah), `${n.no}.pdf`, `Cetak ulang ${n.no}`);
  };

  /** Apakah satu nota masih boleh dihapus, dan kenapa kalau tidak. */
  const bolehHapus = (jenis, n) => {
    if (jenis === 'kunjungan') {
      const waktu = x => keDate(x.tanggal)?.getTime() ?? 0;
      const lebihBaru = kunjungan.some(x =>
        x.warung_id === n.warung_id && x.id !== n.id && waktu(x) > waktu(n));
      return lebihBaru
        ? { boleh: false, alasan: 'Ada kunjungan yang lebih baru untuk warung ini. Hapus dulu yang paling baru.' }
        : { boleh: true };
    }
    return { boleh: true }; // setoran & retur: aman dihapus urutan berapa pun
  };

  const hapusNota = async (jenis, n) => {
    tutupSheet();
    if (!await konfirmasi({
      judul: `Hapus ${n.no}?`,
      pesan: `${label[jenis]} ini akan dihapus dan efeknya dibalik (hutang/piutang ikut disesuaikan). Nomor nota akan bolong — itu wajar untuk koreksi kesalahan. Tidak bisa dibatalkan.`,
      aksi: 'Hapus', bahaya: true
    })) return;
    try {
      if (jenis === 'setoran')        await S.hapusSetoran(n);
      else if (jenis === 'retur')     await S.hapusRetur(n);
      else if (jenis === 'kunjungan') await S.hapusKunjungan(n);
      toast(`${n.no} dihapus.`);
      jalankanRute();
    } catch (e) { toast(e.message || 'Gagal menghapus.', true); }
  };

  const ringkasNota = (jenis, n) => ({
    setoran:   `<div class="rincian-baris"><span>Jumlah setor</span><span>${rp(n.jumlah)}</span></div>`,
    retur:     `<div class="rincian-baris"><span>Ditukar</span><span>${n.total_tukar} bks</span></div>
                <div class="rincian-baris"><span>Potong hutang</span><span>${rp(n.nilai_potong)}</span></div>`,
    kunjungan: `<div class="rincian-baris"><span>Warung</span><span>${aman(n.warung_nama)}</span></div>
                <div class="rincian-baris"><span>Diterima</span><span>${rp(n.dibayar || 0)}</span></div>
                <div class="rincian-baris"><span>Sisa tagihan</span><span>${rp(n.piutang_sesudah || 0)}</span></div>`
  }[jenis] || '');

  const rincianNota = (jenis, n) => {
    const izin = bolehHapus(jenis, n);
    bukaSheet(`
      <h2 class="sheet-judul">${aman(n.no)}</h2>
      <p style="color:var(--tinta-lembut);font-size:.88rem;margin-bottom:16px">${aman(label[jenis])} · ${aman(tgl(n.tanggal))}</p>
      <div class="rincian">${ringkasNota(jenis, n)}</div>
      <button class="btn btn-primary btn-block" id="rnCetak" style="margin-top:20px;margin-bottom:12px">Cetak nota</button>
      ${izin.boleh
        ? `<button class="btn btn-bahaya btn-block" id="rnHapus" style="margin-bottom:12px">Hapus</button>`
        : `<p class="field-hint" style="text-align:center;margin-bottom:12px">${aman(izin.alasan)}</p>`}
      <button class="btn btn-garis btn-block" data-close>Tutup</button>`);

    $('#rnCetak').onclick = () => { tutupSheet(); cetakUlang(jenis, n); };
    if (izin.boleh) $('#rnHapus').onclick = () => hapusNota(jenis, n);
  };

  $$('[data-nota]').forEach(b => b.onclick = () => {
    const [jenis, id] = b.dataset.nota.split(':');
    const n = semua.find(x => x.id === id);
    if (jenis === 'pengambilan') return rincianPengambilan(n);
    rincianNota(jenis, n);
  });
}

/* ============================================================
   LAPORAN
   ============================================================ */

async function vLaporan(w) {
  const r = await S.laporan();

  const bulan = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  w.innerHTML = `
    <section class="kop">
      <p class="kop-label">Uang saya yang endap di toko</p>
      <p class="kop-angka">${rp(r.endap)}</p>
      <p class="kop-sub">belum jadi uang tunai di tangan</p>
      <div class="kop-pisah"></div>
      <div class="kop-grid">
        <div><p>Barang tertitip</p><p>${rp(r.nilaiToko)}</p></div>
        <div><p>Belum dibayar warung</p><p class="${r.piutang ? 'merah' : ''}">${rp(r.piutang)}</p></div>
      </div>
    </section>

    <div class="bagian"><h2>Hutang saya</h2><span>ke ${aman(usaha.produsen)}</span></div>
    <div class="rincian">
      <div class="rincian-baris"><span>Sisa hutang</span><span class="${r.hutang ? 'merah' : 'hijau'}">${rp(r.hutang)}</span></div>
      <div class="rincian-baris"><span>Dari pengambilan belum lunas</span><span>${r.jumlahBatchHutang}</span></div>
    </div>

    <div class="bagian"><h2>Untung saya</h2><span>dari barang yang laku</span></div>
    <div class="rincian">
      <div class="rincian-baris"><span>Untung ${aman(bulan)}</span><span class="hijau">${rp(r.untungBulanIni)}</span></div>
      <div class="rincian-baris"><span>Omzet ${aman(bulan)}</span><span>${rp(r.omzetBulanIni)}</span></div>
      <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px">
        <span>Untung sejak awal</span><span class="hijau">${rp(r.untung)}</span></div>
      <div class="rincian-baris"><span>Omzet sejak awal</span><span>${rp(r.omzet)}</span></div>
      <div class="rincian-baris"><span>Terjual ${r.bungkusLaku} bks</span><span>${ball(r.bungkusLaku)}</span></div>
      ${r.rugiBasi ? `<div class="rincian-baris"><span>Basi ditarik dari warung (${r.bungkusBasi} bks)</span><span class="merah">${rp(r.rugiBasi)}</span></div>
      <div style="font-size:.8rem;color:var(--tinta-lembut);margin-top:-2px">senilai modal — belum jadi rugi kalau diretur ke distributor</div>` : ''}
    </div>

    <div class="bagian"><h2>Produk saya di toko</h2><span>${r.warungBerisi} dari ${r.jumlahWarung} warung</span></div>
    ${r.diToko.length
      ? `<div class="ledger">${r.diToko.map(x => `
          <div class="baris aman" style="cursor:default">
            <div class="baris-atas">
              <span class="baris-judul">${aman(x.nama)}</span>
              <span class="baris-nilai">${x.qty} bks</span>
            </div>
            <div class="baris-bawah">
              <span>tersebar di ${x.warung} warung</span>
              <span>${ball(x.qty)}</span>
            </div></div>`).join('')}</div>`
      : `<div class="kosong" style="padding:24px 16px"><p style="margin:0">Belum ada barang tertitip di warung.</p></div>`}

    <div class="bagian"><h2>Margin saya</h2><span>per bungkus</span></div>
    ${r.margin.length
      ? `<div class="ledger">${r.margin.map(m => `
          <div class="baris ${m.margin > 0 ? 'lunas' : 'jatuh'}" style="cursor:default">
            <div class="baris-atas">
              <span class="baris-judul">${aman(m.nama)}</span>
              <span class="baris-nilai ${m.margin > 0 ? 'hijau' : 'merah'}">+${rp(m.margin)}</span>
            </div>
            <div class="baris-bawah">
              <span>beli ${rp(m.harga_beli)} · titip ${rp(m.harga_titip)}</span>
              <span>${Math.round(m.persen)}% · ${rp(m.margin * ISI_PER_BALL)}/ball</span>
            </div></div>`).join('')}</div>`
      : `<div class="kosong" style="padding:24px 16px"><p style="margin:0">Belum ada produk terdaftar.</p></div>`}

    <div class="bagian"><h2>Modal tertahan</h2><span>belum jadi uang</span></div>
    <div class="rincian">
      <div class="rincian-baris"><span>Stok di gudang (${r.bungkusGudang} bks)</span><span>${rp(r.modalGudang)}</span></div>
      <div class="rincian-baris"><span>Stok di warung (${r.bungkusToko} bks)</span><span>${rp(r.modalToko)}</span></div>
      <div class="rincian-baris"><span>Belum dibayar warung</span><span>${rp(r.piutang)}</span></div>
      <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px">
        <span>Total modal tertahan</span><span>${rp(r.modalTertahan)}</span></div>
      <div class="rincian-baris"><span>Dikurangi hutang distributor</span><span class="merah">−${rp(r.hutang)}</span></div>
      <div class="rincian-baris" style="border-top:1px solid var(--cap);margin-top:8px;padding-top:8px">
        <span>Posisi bersih</span><span class="${r.modalTertahan - r.hutang >= 0 ? 'hijau' : 'merah'}">${rp(r.modalTertahan - r.hutang)}</span></div>
    </div>

    <p class="field-hint" style="margin-top:16px">
      Untung dihitung hanya dari barang yang benar-benar laku di warung (harga titip − harga beli).
      Barang yang masih di gudang atau masih di rak warung belum dihitung sebagai untung.
    </p>`;
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
    <p class="field-hint" style="margin-top:16px">Ini stok yang masih di gudang kamu — sudah dikurangi yang dititipkan ke warung.</p>`;
}

/* ---------- delegasi klik baris beranda ---------- */

$('#view').addEventListener('click', async e => {
  const b = e.target.closest('[data-lihat]');
  if (!b || pecahRute().nama !== 'beranda') return;
  const daftar = await S.ambilPengambilan();
  rincianPengambilan(daftar.find(p => p.id === b.dataset.lihat));
});
