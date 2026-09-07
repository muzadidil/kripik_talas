// ============================================================
//  ISI BAGIAN INI. Ambil dari Firebase Console.
//  Project Settings > General > Your apps > Web app > Config
// ============================================================

export const firebaseConfig = {
  apiKey:            "GANTI_API_KEY",
  authDomain:        "GANTI.firebaseapp.com",
  projectId:         "GANTI_PROJECT_ID",
  storageBucket:     "GANTI.appspot.com",
  messagingSenderId: "GANTI",
  appId:             "GANTI"
};

// ============================================================
//  Identitas usaha — dicetak di kop nota.
// ============================================================

export const usaha = {
  nama:     "Kripik Zasha",
  pemilik:  "Muzadidil",
  hp:       "08xxxxxxxxxx",
  kota:     "Jember",
  produsen: "Nama Produsen"
};

// Berapa bungkus dalam 1 ball.
export const ISI_PER_BALL = 10;

// ============================================================
//  Kata sandi masuk ke aplikasi.
//  PERINGATAN: ini hanya penghalang tampilan, bukan keamanan data.
//  Kode ini publik — siapa pun bisa membaca kata sandi ini lewat
//  developer console. Data Firestore aman/tidaknya bergantung
//  sepenuhnya pada firestore.rules, bukan pada kata sandi ini.
// ============================================================
export const APP_PASSWORD = "zasha";
