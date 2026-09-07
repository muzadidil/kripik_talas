// ============================================================
//  ISI BAGIAN INI. Ambil dari Firebase Console.
//  Project Settings > General > Your apps > Web app > Config
// ============================================================

export const firebaseConfig = {
  apiKey:            "AIzaSyDGsfHXmGNfL9T4aQFnF7nOKHZ6oNYCa-s",
  authDomain:        "kripik-zasha.firebaseapp.com",
  projectId:         "kripik-zasha",
  storageBucket:     "kripik-zasha.firebasestorage.app",
  messagingSenderId: "332256212762",
  appId:             "1:332256212762:web:93bf76611ec00a280adea3"
};

// ============================================================
//  Identitas usaha — dicetak di kop nota.
// ============================================================

export const usaha = {
  nama:     "Kripik Zasha",
  pemilik:  "Muzadidil",
  hp:       "082232458226",
  kota:     "Jember",
  produsen: "Distributor zasha.online"
};

// Berapa bungkus dalam 1 ball.
export const ISI_PER_BALL = 10;

// Penanda versi — tampil di menu ⋮. Berguna untuk memastikan browser
// tidak sedang menjalankan versi lama dari cache. Naikkan tiap deploy.
export const VERSI = '2026-09-07 · 5';

// ============================================================
//  Kata sandi masuk ke aplikasi.
//  PERINGATAN: ini hanya penghalang tampilan, bukan keamanan data.
//  Kode ini publik — siapa pun bisa membaca kata sandi ini lewat
//  developer console. Data Firestore aman/tidaknya bergantung
//  sepenuhnya pada firestore.rules, bukan pada kata sandi ini.
// ============================================================
export const APP_PASSWORD = "zasha";
