/* Quality Education for All: one script for every page of the site. Plain JavaScript, no libraries, works offline. */
(() => {
  'use strict';

  // Set by build.py on every page: number and date formats for the page's language.
  const LOCALES = window.SDG4_LOCALES || {};

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, parent) => {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(n);
    return n;
  };
  // Fills numbered gaps in a translated sentence: fill('{0} of {1}', 3, 12) gives '3 of 12'.
  const fill = (text, ...vals) => vals.reduce((s, v, i) => s.split('{' + i + '}').join(String(v)), text);
  // Reads text aloud with the browser's voices, in the language of the page.
  const speak = (text) => {
    if (!text || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = document.documentElement.lang || 'en';
      window.speechSynthesis.speak(u);
    } catch (e) { /* speech is not available here */ }
  };
  const store = {
    get(key, fallback) {
      try {
        const v = window.localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
  };
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const numberFmt = new Intl.NumberFormat(LOCALES.num || 'en-US');
  const BASE_TITLE = document.title;
  const smooth = reduceMotion ? 'auto' : 'smooth';
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const restartAnimation = (node, cls) => {
    if (reduceMotion) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  };

  /* ------------------------------------------------------------------ */
  /* Sound effects: synthesised with Web Audio, so nothing is downloaded */
  /* ------------------------------------------------------------------ */
  const Sound = (() => {
    let ctx = null;
    let master = null;
    let enabled = store.get('sdg4.sound', true) !== false;

    function ensure() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!ctx) {
          ctx = new AC();
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -16;
          comp.knee.value = 10;
          comp.ratio.value = 4;
          comp.attack.value = 0.003;
          comp.release.value = 0.2;
          master = ctx.createGain();
          master.gain.value = 0.6;
          master.connect(comp);
          comp.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch (e) {
        return null;
      }
    }

    // One enveloped note. f2 glides the pitch, hold keeps it at full volume before the fade, lp or hp adds a filter.
    function note(f, t, dur, o) {
      const opt = o || {};
      const vol = opt.vol || 0.2;
      const atk = opt.atk || 0.006;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opt.type || 'sine';
      osc.frequency.setValueAtTime(f, t);
      if (opt.f2) osc.frequency.exponentialRampToValueAtTime(opt.f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + atk);
      if (opt.hold) g.gain.setValueAtTime(vol, t + atk + opt.hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      let out = g;
      if (opt.lp || opt.hp) {
        const filt = ctx.createBiquadFilter();
        filt.type = opt.lp ? 'lowpass' : 'highpass';
        filt.frequency.value = opt.lp || opt.hp;
        g.connect(filt);
        out = filt;
      }
      out.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    // Levels are balanced so every effect is audible on laptop speakers without clipping.
    const RECIPES = {
      tap: (t) => note(1500, t, 0.05, { type: 'triangle', vol: 0.2, f2: 1000 }),
      select: (t) => note(740, t, 0.1, { type: 'triangle', vol: 0.26, f2: 1180 }),
      correct: (t) => { // the "di-ding"
        note(1318.5, t, 0.2, { vol: 0.2 });
        note(2637, t, 0.16, { vol: 0.04 });
        note(1975.5, t + 0.1, 0.6, { vol: 0.24 });
        note(3951, t + 0.1, 0.4, { vol: 0.05 });
      },
      wrong: (t) => { // a double game-show buzzer, the second one sagging
        note(160, t, 0.15, { type: 'square', vol: 0.18, hold: 0.1, lp: 1300 });
        note(163, t, 0.15, { type: 'sawtooth', vol: 0.13, hold: 0.1, lp: 1100 });
        note(160, t + 0.19, 0.3, { type: 'square', vol: 0.18, hold: 0.16, f2: 118, lp: 1300 });
        note(163, t + 0.19, 0.3, { type: 'sawtooth', vol: 0.13, hold: 0.16, f2: 120, lp: 1100 });
      },
      streak: (t) => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(f, t + i * 0.065, 0.28, { type: 'triangle', vol: 0.17 })),
      tick: (t) => note(1700, t, 0.04, { type: 'square', vol: 0.22, hp: 900 }),
      timeup: (t) => {
        note(392, t, 0.22, { type: 'square', vol: 0.13, hold: 0.12, lp: 1400 });
        note(262, t + 0.22, 0.55, { type: 'square', vol: 0.14, hold: 0.25, lp: 1100 });
      },
      lifeline: (t) => {
        note(520, t, 0.12, { vol: 0.22, f2: 1040 });
        note(780, t + 0.08, 0.16, { vol: 0.17, f2: 1560 });
      },
      start: (t) => {
        note(660, t, 0.09, { type: 'triangle', vol: 0.17 });
        note(990, t + 0.08, 0.16, { type: 'triangle', vol: 0.17 });
      },
      pause: (t) => {
        note(990, t, 0.09, { type: 'triangle', vol: 0.16 });
        note(660, t + 0.08, 0.16, { type: 'triangle', vol: 0.16 });
      },
      fanfare: (t) => {
        [523.25, 659.25, 783.99].forEach((f, i) => note(f, t + i * 0.12, 0.28, { type: 'triangle', vol: 0.22 }));
        [523.25, 659.25, 783.99, 1046.5].forEach((f) => note(f, t + 0.38, 1.2, { type: 'triangle', vol: 0.13 }));
      },
      perfect: (t) => {
        RECIPES.fanfare(t);
        [2093, 2637, 3136, 4186].forEach((f, i) => note(f, t + 0.55 + i * 0.07, 0.35, { vol: 0.1 }));
      },
      flat: (t) => {
        note(392, t, 0.25, { type: 'triangle', vol: 0.32 });
        note(349.2, t + 0.22, 0.45, { type: 'triangle', vol: 0.3 });
      },
      pop: (t) => note(380, t, 0.12, { vol: 0.46, f2: 900 }),
      drop: (t, level) => { // pitch falls further at each stage, as more children drop out
        const l = level || 1;
        note(560 - l * 70, t, 0.4, { type: 'triangle', vol: 0.55, f2: 190 - l * 25 });
      },
      chime: (t) => [659.25, 830.61, 987.77].forEach((f, i) => note(f, t + i * 0.16, 1.6, { vol: 0.2, atk: 0.02 }))
    };

    return {
      play(name, arg) {
        if (!enabled || !RECIPES[name]) return;
        const c = ensure();
        if (!c) return;
        try { RECIPES[name](c.currentTime + 0.012, arg); } catch (e) { /* audio unavailable */ }
      },
      prime() { if (enabled) ensure(); },
      isOn: () => enabled,
      set(on) {
        enabled = !!on;
        store.set('sdg4.sound', enabled);
        if (enabled) ensure();
      }
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Data, compiled 28 October 2026 (see the Sources list on the page)   */
  /* ------------------------------------------------------------------ */
  const SOURCE_NAMES = {
    1: 'Laporan SDG PBB 2026',
    2: 'Laporan GEM UNESCO 2026',
    3: 'Laporan GEM UNESCO 2026, Bab 7',
    4: 'Laporan Global tentang Guru UNESCO 2024',
    5: 'UNESCO, Hari Literasi Internasional 2026',
    6: 'Estimasi pembiayaan UNESCO, 2023 dan 2026',
    7: 'Laporan GEM Gender UNESCO 2026',
    8: 'Agenda PBB 2030, A/RES/70/1'
  };

  // One red hue, three lightness steps: education levels are an ordered sequence.
  const LEVELS = [
    { key: 'primary', name: 'SD', color: '#7A1526' },
    { key: 'lower', name: 'Menengah pertama', color: '#B8344A' },
    { key: 'upper', name: 'Menengah atas', color: '#E58B98' }
  ];

  // Completion rate worldwide (%). 2000: UNESCO GEM Report 2026. 2015 and 2024: UN SDG Report 2026.
  const TREND = [
    { year: 2000, primary: 77, lower: 60, upper: 37 },
    { year: 2015, primary: 85, lower: 75, upper: 53 },
    { year: 2024, primary: 88, lower: 78, upper: 61 }
  ];

  // Completion rate by region, 2024 (%): UN SDG Report 2026. Low-income countries: GEM Report 2026, ch. 7.
  const REGIONS = [
    { name: 'Dunia', primary: 88, lower: 78, upper: 61, world: true },
    { name: 'Eropa dan Amerika Utara', primary: 100, lower: 98, upper: 89 },
    { name: 'Asia Timur dan Asia Tenggara', primary: 98, lower: 91, upper: 79 },
    { name: 'Amerika Latin dan Karibia', primary: 94, lower: 84, upper: 65 },
    { name: 'Afrika Utara dan Asia Barat', primary: 90, lower: 69, upper: 61 },
    { name: 'Asia Tengah dan Asia Selatan', primary: 89, lower: 83, upper: 59 },
    { name: 'Afrika sub-Sahara', primary: 68, lower: 47, upper: 28 },
    { name: 'Oseania*', label: 'Oseania (tidak termasuk Australia dan Selandia Baru)', primary: 70, lower: 43, upper: 18 },
    { name: 'Negara berpendapatan rendah', primary: 60, lower: 37, upper: 20, income: true }
  ];
  const placeLabel = (r) => r.label || r.name;

  // Out of school by age group, 2024, millions: GEM Report 2026, ch. 7.
  const OOS = [
    { value: 79, name: 'usia sekolah dasar', color: '#7A1526' },
    { value: 64, name: 'usia menengah pertama', color: '#B8344A' },
    { value: 130, name: 'usia menengah atas', color: '#E58B98' }
  ];

  // Completion of the poorest 20% for every 100 of the richest 20% (parity index x 100): UN SDG Report 2026.
  const PARITY = [
    { name: 'SD', value: 91 },
    { name: 'Menengah pertama', value: 68 },
    { name: 'Menengah atas', value: 34 }
  ];

  const TARGETS = [
    {
      code: '4.1', kind: 'outcome', short: 'Sekolah dasar dan menengah untuk semua',
      title: 'Sekolah dasar dan menengah gratis dan berkualitas untuk setiap anak',
      official: 'Pada 2030, pastikan semua anak perempuan dan laki-laki menyelesaikan pendidikan dasar dan menengah yang gratis, adil, dan berkualitas, yang menghasilkan capaian belajar yang relevan dan efektif',
      plain: 'Setiap anak seharusnya bisa menyelesaikan sekolah dasar dan menengah secara gratis, dan benar-benar belajar sepanjang jalan. Duduk di kelas hanyalah separuhnya: yang penting adalah kemampuan membaca dan matematika.',
      measured: 'Indikator 4.1.1 melacak berapa banyak anak yang mencapai tingkat minimum membaca dan matematika di kelas awal, di akhir sekolah dasar, dan di akhir menengah pertama. Indikator 4.1.2 melacak tingkat penyelesaian.',
      stats: [
        { value: '61%', text: 'remaja menyelesaikan sekolah menengah atas (2024), naik dari 53% pada 2015.', src: 1 },
        { value: '58%', text: 'siswa mencapai tingkat membaca minimum pada akhir sekolah dasar, berdasarkan estimasi global terbaru (2019).', src: 3 }
      ],
      action: 'Adakan sesi membaca atau matematika mingguan bersama siswa yang lebih muda, atau mulai klub les sebaya.'
    },
    {
      code: '4.2', kind: 'outcome', short: 'Anak usia dini dan prasekolah',
      title: 'Awal yang kuat sebelum sekolah dasar',
      official: 'Pada 2030, pastikan semua anak perempuan dan laki-laki memiliki akses ke perkembangan, pengasuhan, dan pendidikan prasekolah anak usia dini yang berkualitas agar siap mengikuti pendidikan dasar',
      plain: 'Tahun-tahun sebelum sekolah dasar membentuk cara anak belajar sepanjang hidup mereka. Target ini berkaitan dengan pengasuhan, bermain, dan kelas prasekolah yang menyiapkan setiap anak untuk sekolah.',
      measured: 'Indikator 4.2.1 melacak berapa banyak anak usia 24 hingga 59 bulan yang perkembangannya sesuai. Indikator 4.2.2 melacak partisipasi dalam pembelajaran terstruktur satu tahun sebelum sekolah dasar.',
      stats: [
        { value: '75%', text: 'anak mengikuti pembelajaran terstruktur satu tahun sebelum sekolah dasar, angka yang hampir tidak berubah sejak 2015.', src: 3 },
        { value: '60%', text: 'benar-benar pernah mengikuti setidaknya satu tahun prasekolah, setelah memperhitungkan anak yang masuk SD lebih awal.', src: 3 }
      ],
      action: 'Jadi sukarelawan membacakan buku untuk anak kecil di pusat belajar anak usia dini setempat, atau kumpulkan buku bergambar untuk disumbangkan.'
    },
    {
      code: '4.3', kind: 'outcome', short: 'Pendidikan teknik, vokasi, dan universitas',
      title: 'Pelatihan dan universitas terjangkau untuk semua',
      official: 'Pada 2030, pastikan kesetaraan akses bagi semua perempuan dan laki-laki ke pendidikan teknik, vokasi, dan tinggi yang terjangkau dan berkualitas, termasuk universitas',
      plain: 'Setelah sekolah, setiap orang seharusnya mampu membiayai pelatihan atau universitas yang baik, baik ingin menjadi perawat, teknisi listrik, atau insinyur.',
      measured: 'Indikator 4.3.1 melacak berapa banyak remaja dan orang dewasa yang mengikuti pendidikan dan pelatihan formal atau nonformal dalam 12 bulan terakhir.',
      stats: [
        { value: '44%', text: 'pendaftaran pendidikan tinggi di seluruh dunia pada 2024: di bawah 15% di negara berpendapatan rendah dan di atas 80% di negara berpendapatan tinggi.', src: 3 },
        { value: '1 dari 3', text: 'negara tidak memungut biaya kuliah di universitas negeri.', src: 2 }
      ],
      action: 'Jelajahi jalur vokasi dan universitas sejak dini, dan bagikan informasi beasiswa dan kursus kepada teman sekelas.'
    },
    {
      code: '4.4', kind: 'outcome', short: 'Keterampilan untuk kerja dan kehidupan',
      title: 'Keterampilan untuk pekerjaan layak',
      official: 'Pada 2030, secara signifikan tingkatkan jumlah remaja dan orang dewasa yang memiliki keterampilan yang relevan, termasuk keterampilan teknik dan vokasi, untuk pekerjaan, pekerjaan layak, dan kewirausahaan',
      plain: 'Pendidikan harus menyiapkan orang untuk pekerjaan nyata: keterampilan digital, pengetahuan teknis, dan keberanian memulai usaha.',
      measured: 'Indikator 4.4.1 melacak berapa banyak remaja dan orang dewasa yang memiliki keterampilan teknologi informasi dan komunikasi (TIK), dari menyalin berkas hingga menulis program komputer.',
      stats: [
        { value: '33%', text: 'orang dewasa di negara median yang melapor dapat membuat presentasi elektronik (2022 hingga 2024).', src: 3 },
        { value: '6%', text: 'memiliki keterampilan pemrograman. Sebagian besar negara yang melaporkan data ini berpendapatan menengah atas atau tinggi.', src: 3 }
      ],
      action: 'Pilih satu keterampilan praktis semester ini, misalnya coding, mengatur anggaran, atau berbicara di depan umum, dan ajarkan kepada orang lain.'
    },
    {
      code: '4.5', kind: 'outcome', short: 'Akses setara untuk semua',
      title: 'Tidak ada yang tertinggal dari pendidikan',
      official: 'Pada 2030, hapus kesenjangan gender dalam pendidikan dan pastikan akses yang setara ke semua jenjang pendidikan dan pelatihan vokasi bagi kelompok rentan, termasuk penyandang disabilitas, masyarakat adat, dan anak-anak dalam situasi rentan',
      plain: 'Tidak ada anak yang boleh tertinggal karena gender, disabilitas, tempat tinggal, atau kekayaan keluarganya.',
      measured: 'Indikator 4.5.1 membandingkan kelompok dengan indeks paritas, misalnya anak perempuan dan laki-laki, perdesaan dan perkotaan, serta termiskin dan terkaya, di seluruh indikator SDG 4 lainnya.',
      stats: [
        { value: '34', text: 'remaja termiskin menyelesaikan sekolah menengah atas untuk setiap 100 dari yang terkaya.', src: 1 },
        { value: 'Hampir 5 dari 6', text: 'negara belum mencapai kesetaraan gender dalam penyelesaian menengah atas.', src: 1 }
      ],
      action: 'Buat kelasmu lebih inklusif: ajak seseorang yang baru ke kelompokmu dan minta bahan belajar yang bisa dipakai semua orang.'
    },
    {
      code: '4.6', kind: 'outcome', short: 'Literasi dan numerasi',
      title: 'Semua orang mampu membaca, menulis, dan berhitung',
      official: 'Pada 2030, pastikan semua remaja dan sebagian besar orang dewasa, baik laki-laki maupun perempuan, mencapai literasi dan numerasi',
      plain: 'Setiap remaja, dan sebanyak mungkin orang dewasa, harus mampu membaca, menulis, dan menggunakan angka dengan percaya diri dalam kehidupan sehari-hari.',
      measured: 'Indikator 4.6.1 melacak porsi orang dalam kelompok usia tertentu yang mencapai tingkat literasi dan numerasi fungsional tertentu.',
      stats: [
        { value: '739M', text: 'remaja dan orang dewasa tidak memiliki keterampilan literasi dasar pada 2024; sekitar dua pertiganya adalah perempuan.', src: 5 },
        { value: '93%', text: 'remaja di seluruh dunia dapat membaca dan menulis, naik dari 87% pada 2000.', src: 3 }
      ],
      action: 'Adakan tukar buku di sekolah, atau bantu anggota keluarga berlatih membaca atau matematika sehari-hari.'
    },
    {
      code: '4.7', kind: 'outcome', short: 'Keberlanjutan, perdamaian, dan kewarganegaraan global',
      title: 'Belajar membangun dunia yang lebih adil dan hijau',
      official: 'Pada 2030, pastikan semua pembelajar memperoleh pengetahuan dan keterampilan yang diperlukan untuk mendorong pembangunan berkelanjutan, antara lain melalui pendidikan untuk pembangunan berkelanjutan dan gaya hidup berkelanjutan, hak asasi manusia, kesetaraan gender, promosi budaya damai dan anti-kekerasan, kewarganegaraan global, serta penghargaan terhadap keragaman budaya dan kontribusi budaya bagi pembangunan berkelanjutan',
      plain: 'Sekolah seharusnya membantu kita memahami perubahan iklim, hak asasi manusia, kesetaraan gender, dan budaya lain, serta memberi kita keterampilan untuk bertindak.',
      measured: 'Indikator 4.7.1 melacak sejauh mana kewarganegaraan global dan pembangunan berkelanjutan terintegrasi dalam kebijakan pendidikan, kurikulum, pelatihan guru, dan penilaian siswa. Sejak 2025, indikator ini juga memeriksa kurikulum secara langsung untuk lingkungan, perubahan iklim, dan keanekaragaman hayati.',
      stats: [
        { value: '50 dari 110', text: 'negara yang diteliti tidak menyebut perubahan iklim dalam silabus IPA dan IPS kelas 6 (2024).', src: 3 },
        { value: '78 dari 110', text: 'tidak menyebutkannya dalam silabus kelas 3 mereka.', src: 3 }
      ],
      action: 'Mulai atau ikuti klub lingkungan atau isu global, dan bawa topik iklim ke proyek kelasmu.'
    },
    {
      code: '4.a', kind: 'means', short: 'Sekolah yang aman dan inklusif',
      title: 'Sekolah yang aman dan terbuka untuk semua',
      official: 'Bangun dan tingkatkan fasilitas pendidikan yang ramah anak, disabilitas, dan gender, serta menyediakan lingkungan belajar yang aman, anti-kekerasan, inklusif, dan efektif untuk semua',
      plain: 'Sekolah membutuhkan hal dasar seperti listrik, air bersih, toilet, jalur landai, dan internet, serta harus bebas dari kekerasan dan perundungan.',
      measured: 'Indikator 4.a.1 melacak porsi sekolah dengan layanan dasar: listrik, internet dan komputer untuk pengajaran, fasilitas yang disesuaikan untuk siswa disabilitas, air minum, toilet terpisah menurut jenis kelamin, dan tempat cuci tangan.',
      stats: [
        { value: 'Lebih dari 1 dari 5', text: 'sekolah dasar di seluruh dunia tidak memiliki listrik, air minum yang aman, atau sanitasi dasar.', src: 1 },
        { value: '466M', text: 'anak menerima makan siang sekolah pada 2024, 20% lebih banyak dibanding 2020.', src: 3 }
      ],
      action: 'Bersuaralah tentang fasilitas yang rusak atau tidak aman, dan dukung teman sekelas yang sedang di-bully.'
    },
    {
      code: '4.b', kind: 'means', short: 'Beasiswa untuk negara berkembang',
      title: 'Lebih banyak beasiswa untuk pelajar dari negara berkembang',
      official: 'Pada 2020, secara signifikan memperluas jumlah beasiswa secara global yang tersedia bagi negara berkembang, khususnya negara kurang berkembang, negara berkembang pulau kecil, dan negara-negara Afrika, untuk pendaftaran di pendidikan tinggi, termasuk pelatihan vokasi, teknologi informasi dan komunikasi, serta program teknik, rekayasa, dan sains, di negara maju dan negara berkembang lainnya',
      plain: 'Negara-negara berjanji menyediakan lebih banyak beasiswa agar pelajar dari negara termiskin bisa kuliah, terutama sains dan teknologi. Ini satu-satunya target SDG 4 dengan batas waktu 2020.',
      measured: 'Indikator 4.b.1 melacak jumlah bantuan pembangunan resmi (bantuan) yang dibelanjakan untuk beasiswa.',
      stats: [
        { value: '$1.7B', text: 'dari bantuan dialokasikan untuk beasiswa di sektor pendidikan pada 2024, turun setelah pendanaan pulih pada 2023.', src: 3 },
        { value: '2.8%', text: 'mahasiswa di seluruh dunia kuliah di negara lain pada 2023.', src: 3 }
      ],
      action: 'Kumpulkan peluang beasiswa yang kamu temukan dan bagikan di papan pengumuman kelas.'
    },
    {
      code: '4.c', kind: 'means', short: 'Guru berkualifikasi',
      title: 'Cukup banyak guru terlatih',
      official: 'Pada 2030, secara signifikan meningkatkan ketersediaan guru berkualifikasi, termasuk melalui kerja sama internasional untuk pelatihan guru di negara berkembang, khususnya negara kurang berkembang dan negara berkembang pulau kecil',
      plain: 'Tidak ada pendidikan tanpa guru. Dunia membutuhkan jutaan guru lagi yang terlatih, didukung, dan dibayar dengan adil, terutama di negara-negara termiskin.',
      measured: 'Indikator 4.c.1 melacak porsi guru yang memiliki kualifikasi minimum yang disyaratkan negaranya.',
      stats: [
        { value: '44M', text: 'guru lagi dibutuhkan pada 2030 untuk pendidikan dasar dan menengah universal, 15 juta di antaranya di Afrika sub-Sahara.', src: 4 },
        { value: '1 dari 5', text: 'guru di seluruh dunia tidak memenuhi standar kualifikasi minimum negara mereka (2024).', src: 1 }
      ],
      action: 'Ucapkan terima kasih kepada seorang guru minggu ini, dan pikirkan apakah mengajar bisa menjadi karirmu suatu hari nanti.'
    }
  ];

  const QUIZ = [
    // The goal
    { cat: 'Tujuannya', q: 'Pada tahun berapa Tujuan Pembangunan Berkelanjutan, termasuk SDG 4, dimaksudkan untuk dicapai?', options: ['2025', '2030', '2040', '2050'], answer: 1, explain: 'Semua negara anggota PBB mengadopsi Agenda 2030 pada 2015. Agenda ini memberi dunia waktu hingga 2030 untuk mencapai 17 tujuan.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tujuannya', q: 'Berapa banyak Tujuan Pembangunan Berkelanjutan yang ada?', options: ['6', '8', '12', '17'], answer: 3, explain: 'Ada 17 tujuan, dan pendidikan adalah nomor 4. Tujuan Pembangunan Milenium sebelumnya berjumlah 8.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tujuannya', q: 'Berapa target yang dimiliki SDG 4?', options: ['10', '12', '15', '17'], answer: 0, explain: 'Sepuluh: tujuh target hasil (4.1 sampai 4.7) dan tiga sarana implementasi (4.a, 4.b, dan 4.c).', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tujuannya', mix: true, q: 'Lengkapi tujuannya: “Menjamin pendidikan berkualitas yang inklusif dan adil serta mendorong … untuk semua.”', options: ['tempat kuliah gratis', 'kesempatan belajar sepanjang hayat', 'perangkat digital', 'makan siang sekolah'], answer: 1, explain: 'Bunyi lengkap tujuannya: menjamin pendidikan berkualitas yang inklusif dan adil serta mendorong kesempatan belajar sepanjang hayat untuk semua.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tujuannya', q: 'Target mana yang berkaitan dengan perkembangan anak usia dini dan pendidikan prasekolah?', options: ['Target 4.1', 'Target 4.2', 'Target 4.5', 'Target 4.c'], answer: 1, explain: 'Target 4.2 bertujuan memberi setiap anak perawatan dan pendidikan prasekolah yang berkualitas, agar mereka siap masuk sekolah dasar.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tujuannya', q: 'Target SDG 4 mana yang batas waktunya 2020, bukan 2030?', options: ['4.1, sekolah dasar dan menengah gratis', '4.6, literasi dan numerasi', '4.b, beasiswa', '4.c, guru berkualifikasi'], answer: 2, explain: 'Target 4.b bertujuan memperluas beasiswa bagi pelajar dari negara berkembang pada 2020.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tujuannya', mix: true, q: 'Target 4.c tentang…', options: ['kuliah gratis untuk semua orang', 'lebih banyak guru berkualifikasi', 'makan siang sekolah', 'internet di setiap kelas'], answer: 1, explain: 'Target 4.c bertujuan secara signifikan meningkatkan ketersediaan guru berkualifikasi, termasuk melalui pelatihan guru di negara berkembang.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tujuannya', q: 'Target mana yang mencakup pembelajaran tentang pembangunan berkelanjutan, hak asasi manusia, perdamaian, dan kewarganegaraan global?', options: ['Target 4.1', 'Target 4.3', 'Target 4.5', 'Target 4.7'], answer: 3, explain: 'Target 4.7 berkaitan dengan pengetahuan dan keterampilan yang dibutuhkan untuk mendorong pembangunan berkelanjutan, hak asasi manusia, kesetaraan gender, perdamaian, dan kewarganegaraan global.', src: 'Agenda PBB 2030 (2015)' },
    // Access
    { cat: 'Akses', q: 'Kira-kira berapa anak dan remaja yang tidak bersekolah di seluruh dunia pada 2024?', options: ['73 juta', '123 juta', '173 juta', '273 juta'], answer: 3, explain: '273 juta, atau satu dari enam, dan jumlahnya naik tujuh tahun berturut-turut.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Akses', q: 'Kelompok usia mana yang paling banyak remajanya tidak bersekolah?', options: ['Usia sekolah dasar', 'Usia menengah pertama', 'Usia menengah atas', 'Ketiganya kurang lebih sama'], answer: 2, explain: 'dari 273 juta berusia menengah atas, dibandingkan dengan 79 juta usia SD dan 64 juta usia menengah pertama.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Akses', q: 'Sampai 2024, jumlah anak yang tidak bersekolah naik berapa tahun berturut-turut?', options: ['2', '4', '7', '12'], answer: 2, explain: 'Tujuh tahun berturut-turut, didorong oleh pertumbuhan penduduk, krisis, dan anggaran yang menyusut.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Akses', q: 'Di negara berpendapatan rendah, kira-kira berapa porsi anak dan remaja usia sekolah yang tidak bersekolah?', options: ['3%', '16%', '36%', '66%'], answer: 2, explain: 'Sekitar 36%, dibandingkan dengan 3% di negara berpendapatan tinggi.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Akses', mix: true, q: 'Dua kawasan mana yang bersama-sama menampung tiga perempat anak dan remaja tidak bersekolah di dunia?', options: ['Eropa dan Amerika Latin', 'Afrika sub-Sahara dan Asia Tengah dan Selatan', 'Asia Timur dan Oseania', 'Amerika Utara dan Asia Barat'], answer: 1, explain: 'Afrika sub-Sahara dan Asia Tengah dan Selatan bersama-sama menyumbang tiga perempat dari total global.', src: 'Laporan SDG PBB 2026' },
    { cat: 'Akses', q: 'Berapa banyak siswa yang terdaftar di sekolah di seluruh dunia pada 2024?', options: ['500 juta', '800 juta', '1,1 miliar', '1,4 miliar'], answer: 3, explain: '1,4 miliar, yaitu 327 juta lebih banyak di pendidikan dasar dan menengah dibanding 2000.', src: 'Laporan GEM UNESCO 2026' },
    // Completion
    { cat: 'Penyelesaian', q: 'Di Afrika sub-Sahara, berapa porsi remaja yang menyelesaikan sekolah menengah atas?', options: ['28%', '48%', '61%', '78%'], answer: 0, explain: 'Pada 2024, 28% menyelesaikan sekolah menengah atas di Afrika sub-Sahara, dibandingkan 61% di seluruh dunia.', src: 'Laporan SDG PBB 2026' },
    { cat: 'Penyelesaian', q: 'Di seluruh dunia, berapa porsi remaja yang menyelesaikan sekolah menengah atas pada 2024?', options: ['37%', '61%', '78%', '88%'], answer: 1, explain: '61%, naik dari 53% pada 2015 dan 37% pada 2000. Untuk menengah pertama 78%, dan untuk sekolah dasar 88%.', src: 'Laporan SDG PBB 2026; Laporan GEM UNESCO 2026' },
    { cat: 'Penyelesaian', q: 'Dengan laju saat ini, kira-kira kapan 95% remaja di seluruh dunia menyelesaikan sekolah menengah atas?', options: ['2030', '2050', '2075', '2105'], answer: 3, explain: 'UNESCO memperkirakan butuh sampai 2105 dengan laju kemajuan saat ini, sekitar satu poin persentase per tahun sejak 2000.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Penyelesaian', mix: true, q: 'Kawasan mana yang memiliki tingkat penyelesaian menengah atas tertinggi?', options: ['Eropa dan Amerika Utara', 'Asia Timur dan Asia Tenggara', 'Amerika Latin dan Karibia', 'Afrika sub-Sahara'], answer: 0, explain: 'Eropa dan Amerika Utara, 89% pada 2024. Asia Timur dan Asia Tenggara menyusul dengan 79%.', src: 'Laporan SDG PBB 2026' },
    // Learning
    { cat: 'Belajar', q: 'Menurut estimasi global terbaru (2019), berapa porsi siswa yang mencapai tingkat membaca minimum pada akhir sekolah dasar?', options: ['58%', '68%', '78%', '88%'], answer: 0, explain: '58% dalam membaca dan 44% dalam matematika. Estimasi ini belum diperbarui sejak pandemi.', src: 'Laporan SDG PBB 2026' },
    { cat: 'Belajar', mix: true, q: 'Di 57 negara yang sebagian besar berpendapatan menengah dan tinggi, apa yang terjadi pada kemampuan membaca antara 2012 dan 2022?', options: ['Membaiknya sangat banyak', 'Kurang lebih tetap sama', 'Menurun, dari 59% menjadi 47% siswa di tingkat minimum', 'Berlipat dua'], answer: 2, explain: 'Membaca turun dari 59% menjadi 47%, dan matematika dari 41% menjadi 36%, sehingga krisis pembelajaran melampaui pandemi.', src: 'Laporan SDG PBB 2026' },
    { cat: 'Belajar', q: 'Berapa porsi remaja di seluruh dunia yang dapat membaca dan menulis pada 2024?', options: ['63%', '73%', '83%', '93%'], answer: 3, explain: '93%, naik dari 87% pada 2000. Meski begitu, sekitar satu dari empat remaja di negara berpendapatan rendah tidak dapat membaca dan menulis.', src: 'Laporan GEM UNESCO 2026' },
    // Teachers
    { cat: 'Guru', q: 'Berapa tambahan guru yang dibutuhkan dunia pada 2030 untuk mencapai pendidikan dasar dan menengah universal?', options: ['24 juta', '44 juta', '64 juta', '84 juta'], answer: 1, explain: '44 juta. Sepertiganya, 15 juta, dibutuhkan di Afrika sub-Sahara.', src: 'Laporan Global tentang Guru UNESCO (2024)' },
    { cat: 'Guru', q: 'Kira-kira berapa guru di seluruh dunia yang tidak memenuhi standar kualifikasi minimum negaranya?', options: ['1 dari 50', '1 dari 20', '1 dari 5', '1 dari 2'], answer: 2, explain: 'Sekitar satu dari lima, atau 20% guru (2024). Target 4.c bertujuan mengubah hal itu pada 2030.', src: 'Laporan SDG PBB 2026' },
    { cat: 'Guru', mix: true, q: 'Kawasan mana yang paling membutuhkan tambahan guru pada 2030?', options: ['Eropa', 'Afrika sub-Sahara', 'Amerika Utara', 'Oseania'], answer: 1, explain: 'Afrika sub-Sahara membutuhkan 15 juta, sepertiga dari seluruh tambahan guru yang dibutuhkan di dunia.', src: 'Laporan Global tentang Guru UNESCO (2024)' },
    { cat: 'Guru', q: 'Berapa porsi negara berpendapatan rendah yang mewajibkan guru SD memiliki gelar sarjana?', options: ['11%', '41%', '71%', '91%'], answer: 0, explain: 'Hanya 11%, dibandingkan 79% negara berpendapatan tinggi.', src: 'Laporan GEM UNESCO 2026' },
    // Equity
    { cat: 'Kesetaraan', q: 'Dari 739 juta remaja dan orang dewasa yang tidak memiliki keterampilan literasi dasar, kira-kira berapa porsinya perempuan?', options: ['Sekitar sepertiga', 'Sekitar dua pertiga', 'Sekitar tiga perempat', 'Hampir semuanya'], answer: 1, explain: 'Sekitar dua pertiganya adalah perempuan, sehingga literasi erat kaitannya dengan kesetaraan gender.', src: 'UNESCO, Hari Literasi Internasional 2026' },
    { cat: 'Kesetaraan', q: 'Di seluruh dunia, berapa banyak remaja termiskin yang menyelesaikan sekolah menengah atas untuk setiap 100 dari yang terkaya?', options: ['14', '34', '64', '94'], answer: 1, explain: 'Hanya 34. Di tingkat SD angkanya 91, jadi kesenjangannya melebar seiring anak bertambah besar.', src: 'Laporan SDG PBB 2026' },
    { cat: 'Kesetaraan', q: 'Antara 2000 dan 2025, porsi anak perempuan yang menikah sebelum usia 18 tahun turun dari 25% menjadi…', options: ['8%', '12%', '15%', '18%'], answer: 3, explain: '18% pada 2025. Pernikahan dini dan kehamilan masih menjadi alasan utama anak perempuan keluar dari sekolah.', src: 'Laporan GEM Gender UNESCO 2026' },
    { cat: 'Kesetaraan', q: 'Di Afrika sub-Sahara, berapa porsi anak perempuan hamil dan yang sudah menjadi orang tua yang kembali bersekolah?', options: ['Di bawah 5%', 'Sekitar 25%', 'Sekitar 50%', 'Di atas 75%'], answer: 0, explain: 'Kurang dari 5% yang kembali, meskipun kini semakin banyak negara melindungi hak mereka untuk tetap bersekolah.', src: 'Laporan GEM Gender UNESCO 2026' },
    // Money and schools
    { cat: 'Uang dan sekolah', q: 'Seberapa besar kesenjangan pendanaan pendidikan tahunan di negara berpendapatan rendah dan menengah-bawah?', options: ['US$9,7 miliar', 'US$97 miliar', 'US$970 miliar', 'US$9,7 triliun'], answer: 1, explain: 'Sekitar US$97 miliar per tahun, dengan US$70 miliar di antaranya di Afrika sub-Sahara.', src: 'UNESCO (2023, diulang pada 2026)' },
    { cat: 'Uang dan sekolah', q: 'Berapa negara yang membelanjakan lebih banyak untuk pembayaran utang daripada untuk pendidikan?', options: ['13', '53', '113', '193'], answer: 2, explain: '113 negara, yang dihuni 6,1 miliar orang.', src: 'UNESCO, Juli 2026' },
    { cat: 'Uang dan sekolah', q: 'Pada 2024, pendidikan menerima 7,5% dari bantuan pembangunan. Itu porsi terendahnya dalam…', options: ['2 tahun', '5 tahun', '10 tahun', 'dua dekade'], answer: 3, explain: 'Dua dekade. Bantuan untuk pendidikan turun 8% antara 2023 dan 2024, dan bantuan untuk pendidikan dasar turun 16%.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Uang dan sekolah', q: 'Berapa banyak anak yang menerima makan siang sekolah pada 2024?', options: ['46 juta', '166 juta', '466 juta', '1,4 miliar'], answer: 2, explain: '466 juta, 20% lebih banyak dibanding 2020.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Uang dan sekolah', q: 'Kira-kira berapa sekolah dasar di seluruh dunia yang tidak memiliki layanan dasar seperti listrik, air minum yang aman, atau sanitasi?', options: ['Kurang dari 1 dari 20', 'Sekitar 1 dari 10', 'Lebih dari 1 dari 5', 'Sekitar 1 dari 2'], answer: 2, explain: 'Lebih dari satu dari lima. Di negara kurang berkembang, lebih dari separuh sekolah tidak memiliki listrik.', src: 'Laporan SDG PBB 2026' },
    // Skills
    { cat: 'Keterampilan', q: 'Di negara median yang melapor, berapa porsi orang dewasa yang bisa menulis program komputer?', options: ['6%', '26%', '46%', '66%'], answer: 0, explain: 'Hanya 6%. Sekitar sepertiga bisa membuat presentasi elektronik, dan sebagian besar negara yang melaporkan data ini berpendapatan menengah atas atau tinggi.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Keterampilan', q: 'Perubahan iklim tidak ada dalam silabus IPA dan IPS kelas 6 di berapa dari 110 negara yang diteliti?', options: ['50', '70', '90', '105'], answer: 0, explain: '50 dari 110 negara. Di kelas 3, tidak ada di 78 negara.', src: 'Laporan GEM UNESCO 2026' },
    { cat: 'Keterampilan', q: 'Pendidikan tinggi mencakup universitas. Berapa angka partisipasi pendidikan tinggi di seluruh dunia pada 2024?', options: ['14%', '24%', '34%', '44%'], answer: 3, explain: '44%, dari di bawah 15% di negara berpendapatan rendah hingga di atas 80% di negara berpendapatan tinggi.', src: 'Laporan GEM UNESCO 2026' },
    // History
    { cat: 'Sejarah', mix: true, q: 'Dokumen mana yang diadopsi pada 1948 dan menyatakan bahwa “setiap orang berhak atas pendidikan”?', options: ['Deklarasi Universal Hak Asasi Manusia', 'Perjanjian Paris', 'Konvensi Jenewa', 'Piagam Olimpiade'], answer: 0, explain: 'Pasal 26 Deklarasi Universal Hak Asasi Manusia menyatakan setiap orang berhak atas pendidikan, dan bahwa pendidikan dasar harus gratis dan wajib.', src: 'Majelis Umum PBB (1948)' },
    { cat: 'Sejarah', mix: true, q: 'Di mana Konferensi Dunia tentang Pendidikan untuk Semua 1990 diselenggarakan?', options: ['Jomtien, Thailand', 'Dakar, Senegal', 'Incheon, Republik Korea', 'New York, Amerika Serikat'], answer: 0, explain: 'Di Jomtien, Thailand, tempat negara-negara menetapkan tujuan akses universal ke pendidikan dasar.', src: 'UNESCO' },
    { cat: 'Sejarah', q: 'Tujuan Pembangunan Milenium mana yang bertujuan agar setiap anak menyelesaikan sekolah dasar pada 2015?', options: ['MDG 1', 'MDG 2', 'MDG 4', 'MDG 8'], answer: 1, explain: 'MDG 2 bertujuan pendidikan dasar universal pada 2015. SDG 4 menaikkan target hingga sekolah menengah pada 2030.', src: 'Tujuan Pembangunan Milenium PBB (2000)' },
    // Early years
    { cat: 'Tahun-tahun awal', q: 'Pada masa hidup yang mana otak berkembang paling cepat?', options: ['Beberapa tahun pertama kehidupan', 'Masa remaja', 'Masa dewasa awal', 'Usia lanjut'], answer: 0, explain: 'Otak tumbuh dan membentuk sambungan dasarnya paling cepat di tahun-tahun pertama kehidupan. Itulah mengapa perawatan dan pembelajaran dini sangat penting.', src: 'Harvard Center on the Developing Child' },
    { cat: 'Tahun-tahun awal', q: 'Apa itu pendidikan pra-SD?', options: ['Belajar untuk anak kecil sebelum kelas satu SD', 'Kursus persiapan universitas', 'Kelas malam untuk orang dewasa', 'Pelatihan guru untuk sekolah menengah'], answer: 0, explain: 'Pendidikan pra-SD adalah pembelajaran terstruktur untuk anak kecil sebelum mulai SD, seperti taman kanak-kanak atau prasekolah.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tahun-tahun awal', q: 'Mengapa Target 4.2 menargetkan pendidikan pra-SD?', options: ['Agar anak siap masuk SD', 'Agar anak bisa melewati SD', 'Agar orang tua bisa bekerja penuh waktu', 'Agar sekolah bisa tutup lebih cepat'], answer: 0, explain: 'Target 4.2 menyatakan anak harus siap masuk SD, sehingga pembelajaran dini membantu mereka berhasil di kemudian hari.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Tahun-tahun awal', q: 'Jenis perawatan apa yang tercakup dalam Target 4.2?', options: ['Tumbuh kembang dan perawatan anak usia dini', 'Perawatan lansia', 'Asuransi kesehatan', 'Perumahan'], answer: 0, explain: 'Target 4.2 mencakup tumbuh kembang dan perawatan anak usia dini serta pendidikan pra-SD, sehingga pembelajaran dimulai dari perawatan di tahun-tahun awal.', src: 'Agenda PBB 2030 (2015)' },
    // Literacy
    { cat: 'Literasi', q: 'Target mana yang mencakup literasi dan numerasi?', options: ['Target 4.1', 'Target 4.6', 'Target 4.7', 'Target 4.b'], answer: 1, explain: 'Target 4.6 bertujuan memastikan bahwa semua remaja dan sebagian besar orang dewasa, laki-laki dan perempuan, mencapai literasi dan numerasi pada 2030.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Literasi', q: 'Kapan Hari Literasi Internasional dirayakan?', options: ['8 Maret', '21 Februari', '8 September', '5 Oktober'], answer: 2, explain: 'UNESCO memperingati Hari Literasi Internasional setiap tahun pada 8 September untuk menyoroti pentingnya literasi bagi manusia dan masyarakat.', src: 'UNESCO, Hari Literasi Internasional 2026' },
    { cat: 'Literasi', q: 'Apa arti numerasi?', options: ['Membaca dengan lancar', 'Menggunakan angka dan matematika dasar dalam kehidupan sehari-hari', 'Menulis esai', 'Berbicara dalam bahasa kedua'], answer: 1, explain: 'Numerasi adalah kemampuan menggunakan angka dan matematika dasar dalam kehidupan sehari-hari, sama seperti literasi adalah kemampuan membaca dan menulis.', src: 'Agenda PBB 2030 (2015)' },
    { cat: 'Literasi', q: 'Siapa saja yang tercakup dalam Target 4.6?', options: ['Hanya anak-anak', 'Hanya guru', 'Semua remaja dan sebagian besar orang dewasa, laki-laki dan perempuan', 'Hanya orang di kota'], answer: 2, explain: 'Target 4.6 mencakup remaja dan orang dewasa, laki-laki dan perempuan, tidak hanya anak-anak. Dengan begitu, literasi menjadi tujuan seumur hidup.', src: 'Agenda PBB 2030 (2015)' },
    // Inclusion
    { cat: 'Inklusi', q: 'Perjanjian apa yang mengatur hak atas pendidikan inklusif bagi penyandang disabilitas?', options: ['Perjanjian Paris', 'Konvensi tentang Hak-Hak Penyandang Disabilitas', 'Protokol Kyoto', 'Konvensi Jenewa'], answer: 1, explain: 'Pasal 24 Konvensi tentang Hak-Hak Penyandang Disabilitas (2006) mengatur hak atas pendidikan inklusif di semua jenjang.', src: 'Konvensi PBB CRPD (2006), Pasal 24' },
    { cat: 'Inklusi', q: 'Apa itu Hari Bahasa Ibu Internasional, yang dirayakan pada 21 Februari?', options: ['Hari untuk berhenti mengajarkan bahasa Inggris', 'Hari untuk mendorong keberagaman bahasa dan pendidikan bahasa ibu', 'Libur dari ujian sekolah', 'Hari untuk menguji guru'], answer: 1, explain: 'UNESCO menetapkan Hari Bahasa Ibu Internasional untuk mendorong keberagaman bahasa dan pendidikan dalam bahasa yang dipakai orang di rumah.', src: 'UNESCO, Hari Bahasa Ibu Internasional' },
    { cat: 'Inklusi', q: 'Mengapa belajar dengan bahasa yang tidak dipakai anak di rumah bisa menjadi hambatan?', options: ['Membuat belajar awal lebih sulit bagi banyak anak', 'Membuat sekolah lebih murah', 'Menghilangkan kebutuhan akan guru', 'Tidak berpengaruh pada belajar'], answer: 0, explain: 'Anak paling mudah belajar lebih dulu dalam bahasa yang mereka pahami. Pendidikan bahasa ibu memberi dasar yang lebih kuat untuk membaca dan belajar selanjutnya.', src: 'UNESCO, Hari Bahasa Ibu Internasional' },
    { cat: 'Inklusi', q: 'Dalam SDG 4, apa arti pendidikan “inklusif”?', options: ['Pendidikan hanya untuk keluarga kaya', 'Pendidikan yang menjangkau semua orang, termasuk penyandang disabilitas dan kelompok terpinggirkan', 'Pendidikan hanya untuk orang dewasa', 'Hanya pembelajaran daring'], answer: 1, explain: 'SDG 4 menuntut pendidikan inklusif: pendidikan yang menjangkau semua orang, termasuk penyandang disabilitas, anak perempuan, dan kelompok terpinggirkan.', src: 'Agenda PBB 2030 (2015)' }
  ];

  const MILESTONES = [
    { year: '1948', short: 'Hak atas pendidikan', title: 'Pendidikan menjadi hak asasi manusia', text: 'Deklarasi Universal Hak Asasi Manusia menyatakan bahwa setiap orang berhak atas pendidikan, dan bahwa pendidikan dasar harus gratis dan wajib (Pasal 26).', src: 'Majelis Umum PBB, 1948' },
    { year: '1989', short: 'Hak-hak anak', title: 'Janji yang diberikan kepada setiap anak', text: 'Konvensi Hak Anak mewajibkan negara-negara menjadikan pendidikan dasar wajib dan gratis untuk semua. Ini adalah perjanjian hak asasi manusia yang paling banyak diratifikasi dalam sejarah.', src: 'Konvensi PBB tentang Hak Anak, 1989' },
    { year: '1990', short: 'Pendidikan untuk Semua', title: 'Pendidikan untuk Semua', text: 'Di Konferensi Dunia tentang Pendidikan untuk Semua di Jomtien, Thailand, negara-negara menetapkan tujuan akses universal ke pendidikan dasar.', src: 'Laporan GEM UNESCO 2026' },
    { year: '2000', short: 'Dakar dan MDG', title: 'Setiap anak seharusnya menyelesaikan sekolah dasar', text: 'Di Forum Pendidikan Dunia di Dakar, Senegal, dan dalam Tujuan Pembangunan Milenium, dunia menargetkan setiap anak menyelesaikan sekolah dasar pada 2015 (MDG 2). Target ini tidak tercapai.', src: 'UNESCO; Tujuan Pembangunan Milenium PBB' },
    { year: '2015', short: 'SDG 4 disepakati', title: 'SDG 4 menaikkan target', text: 'Pada Mei, Deklarasi Incheon menetapkan visi Pendidikan 2030. Pada September, semua negara anggota PBB mengadopsi 17 SDG, dengan target setiap remaja menyelesaikan sekolah menengah.', src: 'Agenda PBB 2030; UNESCO' },
    { year: '2016', short: 'Hitung mundur dimulai', title: 'Hitungan mundur dimulai', text: 'SDG secara resmi berlaku pada 1 Januari 2016, memulai hitung mundur 15 tahun menuju 2030.', src: 'Perserikatan Bangsa-Bangsa' },
    { year: '2022', short: 'KTT pendidikan', title: 'Transforming Education Summit', text: 'Sekjen PBB mempertemukan para pemimpin dunia di New York untuk menempatkan kembali pendidikan di puncak agenda global, setelah pandemi COVID-19 mengganggu sekolah bagi sebagian besar siswa di dunia.', src: 'Perserikatan Bangsa-Bangsa' },
    { year: '2026', short: 'Hari ini', now: true, title: 'Posisi kita sekarang', text: null, src: 'Laporan GEM UNESCO 2026; Laporan SDG PBB 2026' },
    { year: '2030', short: 'Batas waktu', title: 'Batas waktunya', text: 'Tanggal target untuk setiap janji SDG 4, mulai dari sekolah dasar dan menengah gratis untuk semua hingga cukup guru berkualifikasi.', src: 'Agenda PBB 2030' }
  ];

  const FACTS = [
    { num: 'Setiap 2 detik', text: 'Satu anak lagi perlu masuk sekolah setiap dua detik hanya agar dunia tetap di jalur untuk 2030.', src: 'Laporan GEM UNESCO 2026' },
    { num: '25 per menit', text: 'Sejak 2000, lebih dari 25 anak tambahan masuk sekolah setiap menit, menambah 327 juta siswa di pendidikan dasar dan menengah.', src: 'Laporan GEM UNESCO 2026' },
    { num: '18% menjadi 84%', text: 'Etiopia menaikkan angka partisipasi sekolah dasarnya dari 18% pada 1974 menjadi 84% pada 2024.', src: 'Laporan GEM UNESCO 2026' },
    { num: '7% menjadi 60%+', text: 'Tiongkok memperluas akses ke universitas dan pendidikan tinggi lainnya dari 7% pada 1999 menjadi lebih dari 60% pada 2024.', src: 'Laporan GEM UNESCO 2026' },
    { num: '33 poin', text: 'Nepal menutup kesenjangan 33 poin persentase antara anak perempuan dan laki-laki dalam penyelesaian menengah pertama antara 1990 dan 2024.', src: 'Laporan GEM Gender UNESCO 2026' },
    { num: 'tertinggal 22, unggul 11', text: 'Di Kamboja, anak perempuan berpindah dari tertinggal 22 poin dari anak laki-laki dalam penyelesaian sekolah dasar pada 1981 menjadi unggul 11 poin pada 2024.', src: 'Laporan GEM Gender UNESCO 2026' },
    { num: '1 tahun tambahan', text: 'Di Kamboja, elektrifikasi saja dikaitkan dengan hampir satu tahun penuh tambahan masa sekolah.', src: 'Laporan GEM UNESCO 2026' },
    { num: 'Setengah tahun', text: 'Program makan sekolah terbukti menambah hingga setengah tahun pembelajaran untuk setiap US$100 yang dibelanjakan.', src: 'Laporan GEM UNESCO 2026' },
    { num: '36% lebih mungkin', text: 'Anak yang keluarganya menerima transfer tunai terkait kehadiran sekolah 36% lebih mungkin terdaftar.', src: 'Laporan GEM UNESCO 2026' },
    { num: '1+ tahun', text: 'Di 14 negara Afrika, menjadikan pendidikan wajib, dan tidak hanya gratis, menambah lebih dari setahun masa sekolah.', src: 'Laporan GEM UNESCO 2026' },
    { num: '8% menjadi 26%', text: 'Porsi negara dengan 12 tahun pendidikan wajib lebih dari tiga kali lipat, dari 8% menjadi 26%.', src: 'Laporan GEM UNESCO 2026' },
    { num: '466 juta', text: '466 juta anak menerima makan siang sekolah pada 2024, 20% lebih banyak dibanding 2020.', src: 'Laporan GEM UNESCO 2026' },
    { num: '113 negara', text: '113 negara, yang dihuni 6,1 miliar orang, membelanjakan lebih banyak untuk pembayaran utang daripada untuk pendidikan.', src: 'UNESCO, Juli 2026' },
    { num: '22%', text: 'Hanya 41 dari 183 negara yang memiliki data (22%) memenuhi kedua patokan belanja pendidikan: minimal 4% PDB dan minimal 15% belanja publik.', src: 'Laporan GEM UNESCO 2026' },
    { num: '70 dari 83', text: 'Di 70 dari 83 negara yang memiliki data, lebih dari separuh siswa menengah pertama mengatakan mereka pernah di-bully.', src: 'Laporan GEM UNESCO 2026' },
    { num: '3.909 serangan', text: 'Pada 2024, tercatat 3.909 serangan terhadap pendidikan di 69 negara, jumlah tertinggi sejak Global Coalition to Protect Education from Attack mulai melapor pada 2013.', src: 'Laporan GEM UNESCO 2026' },
    { num: '1 dari 4', text: 'Sekitar satu dari empat remaja di negara berpendapatan rendah tidak bisa membaca dan menulis pada 2024.', src: 'Laporan GEM UNESCO 2026' },
    { num: '143 juta menjadi 86 juta', text: 'Jumlah remaja yang tidak bisa membaca dan menulis turun dari 143 juta pada 2000 menjadi 86 juta pada 2024.', src: 'Laporan GEM UNESCO 2026' },
    { num: '11% vs 79%', text: 'Hanya 11% negara berpendapatan rendah mewajibkan guru SD memiliki gelar sarjana, dibandingkan 79% negara berpendapatan tinggi.', src: 'Laporan GEM UNESCO 2026' },
    { num: 'Di bawah 5%', text: 'Kurang dari 5% anak perempuan hamil dan yang sudah menjadi orang tua di Afrika sub-Sahara kembali bersekolah.', src: 'Laporan GEM Gender UNESCO 2026' },
    { num: 'Setengahnya', text: 'Pantai Gading telah memangkas separuh angka tidak bersekolah untuk anak, remaja, dan pemuda sejak 2000.', src: 'Laporan GEM UNESCO 2026' },
    { num: '2,4 juta', text: 'Sekitar 2,4 juta anak perempuan di Afghanistan dilarang bersekolah menengah. UNESCO memperingatkan jumlahnya bisa mendekati 4 juta pada 2030.', src: 'UNESCO, Agustus 2026' }
  ];

  const TIPS = [
    'Letakkan ponselmu di ruangan lain. Bahkan ponsel yang senyap di meja tetap menarik perhatianmu.',
    'Uji dirimu daripada hanya membaca ulang. Tutup buku dan tulis semua yang kamu ingat.',
    'Atur jaraknya. Sesi singkat yang tersebar beberapa hari lebih baik daripada satu sesi panjang semalam sebelumnya.',
    'Tulis satu tujuan yang jelas untuk sesi ini sebelum menekan mulai.',
    'Jelaskan dengan suara keras. Jika kamu bisa mengajarkannya dengan sederhana, berarti kamu memahaminya.',
    'Mulai dengan tugas yang paling sulit selagi fokusmu masih segar.',
    'Gunakan istirahatmu untuk bergerak: berdiri, regangkan badan, minum air, dan pandang ke kejauhan.',
    'Campur topik yang berkaitan. Berganti antar jenis soal membantu kamu belajar kapan menggunakan setiap metode.'
  ];

  const DEADLINE = new Date(2031, 0, 1);
  const daysToDeadline = () => Math.max(0, Math.ceil((DEADLINE - new Date()) / 86400000));

  /* ------------------------------------------------------------------ */
  /* Tooltip (shared by every chart)                                     */
  /* ------------------------------------------------------------------ */
  const tip = {
    node: null,
    show(title, rows, x, y) {
      const n = this.node;
      n.textContent = '';
      if (title) n.appendChild(h('p', 'tt-title', title));
      rows.forEach((r) => {
        const row = h('p', 'tt-row');
        const key = h('span', 'tt-key');
        key.style.background = r.color;
        row.append(key, h('b', null, r.value), h('span', null, r.label));
        n.appendChild(row);
      });
      n.hidden = false;
      const pad = 14;
      const w = n.offsetWidth;
      const ht = n.offsetHeight;
      let left = x + pad;
      let top = y - ht - pad;
      if (left + w > window.innerWidth - 8) left = x - w - pad;
      if (left < 8) left = 8;
      if (top < 8) top = y + pad;
      n.style.left = left + 'px';
      n.style.top = top + 'px';
    },
    hide() {
      if (this.node) this.node.hidden = true;
    }
  };

  function buildLegend(ul, keyClass) {
    ul.textContent = '';
    LEVELS.forEach((L) => {
      const li = h('li');
      const k = h('span', keyClass);
      k.style.background = L.color;
      li.append(k, h('span', null, L.name));
      ul.appendChild(li);
    });
  }

  function buildTable(host, head, rows, caption) {
    const table = h('table');
    if (caption) table.appendChild(h('caption', 'visually-hidden', caption));
    const thead = h('thead');
    const tr = h('tr');
    head.forEach((t) => {
      const th = h('th', null, t);
      th.scope = 'col';
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = h('tbody');
    rows.forEach((r) => {
      const row = h('tr');
      r.forEach((c, i) => {
        const cell = h(i === 0 ? 'th' : 'td', null, c);
        if (i === 0) cell.scope = 'row';
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    host.textContent = '';
    host.appendChild(table);
  }

  /* ------------------------------------------------------------------ */
  /* Dashboard                                                           */
  /* ------------------------------------------------------------------ */
  // Every countdown on a page: [data-days], [data-era-pct] and [data-era-fill].
  function renderCountdown() {
    const now = new Date();
    const start = new Date(2016, 0, 1);
    const pct = Math.max(0, Math.min(100, ((now - start) / (DEADLINE - start)) * 100));
    const days = numberFmt.format(daysToDeadline());
    $$('[data-days]').forEach((n) => { n.textContent = days; });
    $$('[data-era-pct]').forEach((n) => { n.textContent = String(Math.floor(pct)); });
    $$('[data-era-fill]').forEach((n) => { n.style.width = pct.toFixed(1) + '%'; });
  }

  // A row of people, the last few highlighted (data-count, data-out; 1 in 6 by default).
  function renderPeople(host) {
    const count = Number(host.dataset.count) || 6;
    const out = Number(host.dataset.out) || 1;
    for (let i = 0; i < count; i++) {
      const p = sv('svg', { viewBox: '0 0 36 80', class: 'person' + (i >= count - out ? ' is-out' : '') }, host);
      sv('circle', { cx: 18, cy: 11, r: 9 }, p);
      sv('path', { d: 'M4 78V40a14 14 0 0 1 28 0v38z' }, p);
    }
  }

  function renderOOS() {
    const labels = $('#oosLabels');
    const stack = $('#oosStack');
    OOS.forEach((d) => {
      const lab = h('div', 'stack-label');
      lab.style.flex = d.value + ' 1 0';
      const v = h('p', 'sl-value');
      const sw = h('i');
      sw.style.background = d.color;
      v.append(sw, document.createTextNode(String(d.value)), h('small', null, 'juta'));
      lab.append(v, h('span', 'sl-name', d.name));
      labels.appendChild(lab);

      const seg = h('div', 'stack-seg');
      seg.style.flex = d.value + ' 1 0';
      seg.style.background = d.color;
      seg.addEventListener('pointermove', (e) => tip.show('Tidak bersekolah, 2024', [{ color: d.color, value: d.value + ' juta', label: d.name }], e.clientX, e.clientY));
      seg.addEventListener('pointerleave', () => tip.hide());
      stack.appendChild(seg);
    });
  }

  let slopeIndex = TREND.length - 1;
  function renderSlope() {
    const host = $('#slopeChart');
    const W = Math.round(host.clientWidth);
    if (!W) return;
    const compact = W < 470;
    const H = Math.round(Math.max(250, Math.min(330, W * 0.6)));
    const m = { top: 12, right: compact ? 48 : 150, bottom: 34, left: 42 };
    const pw = W - m.left - m.right;
    const ph = H - m.top - m.bottom;
    const x = (yr) => m.left + ((yr - 2000) / 24) * pw;
    const y = (v) => m.top + (1 - v / 100) * ph;

    host.textContent = '';
    const svg = sv('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' }, host);

    [0, 25, 50, 75, 100].forEach((v) => {
      sv('line', { x1: m.left, x2: m.left + pw, y1: y(v), y2: y(v), class: 'grid-line' }, svg);
      sv('text', { x: m.left - 10, y: y(v) + 4, 'text-anchor': 'end', class: 'axis-text' }, svg).textContent = v + '%';
    });
    TREND.forEach((d) => {
      sv('text', { x: x(d.year), y: H - 10, 'text-anchor': 'middle', class: 'axis-text' }, svg).textContent = String(d.year);
    });
    sv('line', { x1: x(2015), x2: x(2015), y1: y(30), y2: y(0), class: 'annot-line' }, svg);
    sv('text', { x: x(2015) + 8, y: y(5), class: 'annot-text' }, svg).textContent = 'SDG disepakati';

    const cross = sv('line', { x1: 0, x2: 0, y1: m.top, y2: m.top + ph, class: 'crosshair', opacity: 0 }, svg);
    LEVELS.forEach((L) => {
      sv('polyline', {
        points: TREND.map((d) => x(d.year) + ',' + y(d[L.key])).join(' '),
        fill: 'none', stroke: L.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }, svg);
    });
    LEVELS.forEach((L) => {
      TREND.forEach((d) => sv('circle', { cx: x(d.year), cy: y(d[L.key]), r: 4.5, fill: L.color, stroke: '#fff', 'stroke-width': 2 }, svg));
    });
    const last = TREND[TREND.length - 1];
    LEVELS.forEach((L) => {
      const t = sv('text', { x: x(last.year) + 12, y: y(last[L.key]) + 4.5, class: 'end-value' }, svg);
      t.textContent = last[L.key] + '%';
      if (!compact) sv('tspan', { class: 'end-name', dx: 6 }, t).textContent = L.name;
    });

    const hit = sv('rect', { x: m.left - 18, y: m.top, width: pw + 36, height: ph, fill: 'transparent' }, svg);
    const showAt = (i, cx, cy) => {
      const d = TREND[i];
      cross.setAttribute('x1', x(d.year));
      cross.setAttribute('x2', x(d.year));
      cross.setAttribute('opacity', 1);
      tip.show(
        d.year === 2015 ? '2015, ketika SDG disepakati' : String(d.year),
        LEVELS.map((L) => ({ color: L.color, value: d[L.key] + '%', label: L.name })),
        cx, cy
      );
    };
    const nearest = (px) => {
      let best = 0;
      let bd = Infinity;
      TREND.forEach((d, i) => {
        const dd = Math.abs(x(d.year) - px);
        if (dd < bd) { bd = dd; best = i; }
      });
      return best;
    };
    const clear = () => { cross.setAttribute('opacity', 0); tip.hide(); };
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      slopeIndex = nearest(e.clientX - r.left);
      showAt(slopeIndex, e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', clear);
    const showFocused = () => {
      const r = svg.getBoundingClientRect();
      const d = TREND[slopeIndex];
      showAt(slopeIndex, r.left + x(d.year), r.top + y(d.primary));
    };
    host.onfocus = showFocused;
    host.onblur = clear;
    host.onkeydown = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      e.stopPropagation();
      slopeIndex = Math.max(0, Math.min(TREND.length - 1, slopeIndex + (e.key === 'ArrowRight' ? 1 : -1)));
      showFocused();
    };
  }

  function renderRegions() {
    const host = $('#regionPlot');
    host.textContent = '';
    const grid = h('div', 'dp-grid');
    grid.setAttribute('aria-hidden', 'true');
    host.appendChild(grid);
    const axis = h('div', 'dp-axis');
    axis.setAttribute('aria-hidden', 'true');
    axis.appendChild(h('span'));
    const ticks = h('div', 'dp-ticks');
    [0, 25, 50, 75, 100].forEach((v) => {
      const s = h('span', null, v + '%');
      s.style.left = v + '%';
      ticks.appendChild(s);
    });
    axis.appendChild(ticks);
    host.appendChild(axis);

    REGIONS.forEach((r) => {
      if (r.income) {
        const div = h('div', 'dp-divider');
        div.setAttribute('aria-hidden', 'true');
        host.appendChild(div);
      }
      const row = h('div', 'dp-row' + (r.world ? ' is-world' : ''));
      row.tabIndex = 0;
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', placeLabel(r) + ': dasar ' + r.primary + '%, menengah pertama ' + r.lower + '%, menengah atas ' + r.upper + '%');
      const track = h('div', 'dp-track');
      const vals = LEVELS.map((L) => r[L.key]);
      const lo = Math.min.apply(null, vals);
      const hi = Math.max.apply(null, vals);
      const range = h('span', 'dp-range');
      range.style.left = lo + '%';
      range.style.width = (hi - lo) + '%';
      track.appendChild(range);
      LEVELS.slice().reverse().forEach((L) => {
        const dot = h('span', 'dp-dot');
        dot.style.left = r[L.key] + '%';
        dot.style.background = L.color;
        track.appendChild(dot);
      });
      row.append(h('span', 'dp-name', r.name), track);
      const show = (cx, cy) => tip.show(r.name + ', 2024', LEVELS.map((L) => ({ color: L.color, value: r[L.key] + '%', label: L.name })), cx, cy);
      row.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
      row.addEventListener('pointerleave', () => tip.hide());
      row.addEventListener('focus', () => {
        const b = track.getBoundingClientRect();
        show(b.left + (b.width * r.upper) / 100, b.top + 10);
      });
      row.addEventListener('blur', () => tip.hide());
      host.appendChild(row);
    });

    buildTable($('#regionTable'), ['Kawasan', 'SD', 'Menengah pertama', 'Menengah atas'],
      REGIONS.map((r) => [r.name, r.primary + '%', r.lower + '%', r.upper + '%']), 'Tingkat penyelesaian menurut wilayah, 2024');
  }

  function renderWaffle(host) {
    const v = Number(host.dataset.value);
    for (let i = 0; i < 100; i++) {
      const c = h('i');
      if (i < v) c.className = 'on';
      host.appendChild(c);
    }
  }

  function renderParity() {
    const host = $('#parityChart');
    PARITY.forEach((p) => {
      const row = h('div', 'parity-row');
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', p.name + ': ' + p.value + ' dari yang termiskin menuntaskan, untuk setiap 100 dari yang terkaya');
      const track = h('div', 'parity-track');
      const bar = h('div', 'parity-bar', String(p.value));
      bar.style.width = p.value + '%';
      track.appendChild(bar);
      row.append(h('span', 'parity-name', p.name), track);
      host.appendChild(row);
    });
    const axis = h('div', 'parity-axis');
    axis.setAttribute('aria-hidden', 'true');
    axis.appendChild(h('span'));
    const scale = h('div', 'parity-scale');
    [['0', 0], ['50', 50], ['100', 100]].forEach((pair) => {
      const s = h('span', null, pair[0]);
      s.style.left = pair[1] + '%';
      scale.appendChild(s);
    });
    axis.appendChild(scale);
    host.appendChild(axis);
    buildTable($('#parityTable'), ['Jenjang', 'Termiskin per 100 terkaya'], PARITY.map((p) => [p.name, String(p.value)]),
      'Penyelesaian di antara 20% termiskin untuk setiap 100 dari 20% terkaya');
  }

  /* ------------------------------------------------------------------ */
  /* Explore                                                             */
  /* ------------------------------------------------------------------ */
  const openedAt = Date.now();
  function tickLive() {
    const node = $('#liveCount');
    const txt = numberFmt.format(Math.floor((Date.now() - openedAt) / 2000));
    if (node.textContent !== txt) node.textContent = txt;
  }

  const STAGES = [
    { key: null, text: 'anak memulai bersama-sama' },
    { key: 'primary', text: 'menyelesaikan sekolah dasar' },
    { key: 'lower', text: 'menyelesaikan sekolah menengah pertama' },
    { key: 'upper', text: 'menyelesaikan sekolah menengah atas' }
  ];
  let stage = 0;
  let journeyTimer = 0;
  let tweenSeq = 0;

  function tweenNumber(node, to, animate) {
    const from = Number(node.textContent) || 0;
    const id = String(++tweenSeq);
    node.dataset.tween = id;
    if (!animate || reduceMotion || from === to) { node.textContent = String(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      if (node.dataset.tween !== id) return;
      const t = Math.min(1, (now - t0) / 450);
      const e = 1 - Math.pow(1 - t, 3);
      node.textContent = String(Math.round(from + (to - from) * e));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderJourney(animate) {
    const parts = [];
    ['A', 'B'].forEach((side) => {
      const r = REGIONS[Number($('#place' + side).value)];
      const st = STAGES[stage];
      const n = st.key ? r[st.key] : 100;
      const fig = $('#journey' + side);
      fig.querySelector('.j-place').textContent = placeLabel(r);
      fig.querySelector('.j-stage').textContent = st.text;
      tweenNumber(fig.querySelector('.j-num b'), n, animate);
      // Dots switch one after another: leaving from the end of the grid, returning from the front.
      const changing = [];
      $$('.dot', fig).forEach((d, i) => {
        const off = i >= n;
        if (d.classList.contains('is-off') !== off) changing.push({ d, off, i });
      });
      changing.sort((a, b) => (a.off ? b.i - a.i : a.i - b.i));
      changing.forEach((c, k) => {
        c.d.style.transitionDelay = animate && !reduceMotion ? Math.min(k * 7, 520) + 'ms' : '0ms';
        c.d.classList.toggle('is-off', c.off);
      });
      parts.push(placeLabel(r) + ': ' + n + ' dari 100 ' + st.text);
    });
    $('#journeyStatus').textContent = parts.join('. ') + '.';
  }

  function setStage(s, silent) {
    const prev = stage;
    stage = s;
    $$('#stageBar .stage-btn').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.stage) === s)));
    renderJourney(true);
    if (!silent) Sound.play(s > prev ? 'drop' : 'select', s);
  }

  function stopJourney(finished) {
    if (journeyTimer) {
      clearInterval(journeyTimer);
      journeyTimer = 0;
    }
    $('#journeyPlay').textContent = finished ? 'Mainkan lagi' : 'Mainkan perjalanannya';
  }

  function playJourney() {
    stopJourney();
    setStage(0, true);
    Sound.play('start');
    $('#journeyPlay').textContent = 'Berhenti';
    let s = 0;
    journeyTimer = setInterval(() => {
      s += 1;
      setStage(s);
      if (s >= STAGES.length - 1) stopJourney(true);
    }, 1400);
  }

  function initJourney() {
    ['A', 'B'].forEach((side, idx) => {
      const sel = $('#place' + side);
      REGIONS.forEach((r, i) => {
        const o = h('option', null, placeLabel(r));
        o.value = String(i);
        sel.appendChild(o);
      });
      const want = idx === 0 ? 'Afrika sub-Sahara' : 'Eropa dan Amerika Utara';
      sel.value = String(REGIONS.findIndex((r) => r.name === want));
      const dots = $('#journey' + side + ' .dots');
      for (let i = 0; i < 100; i++) dots.appendChild(h('span', 'dot'));
      sel.addEventListener('change', () => {
        Sound.play('select');
        renderJourney(true);
      });
    });
    $$('#stageBar .stage-btn').forEach((b) => b.addEventListener('click', () => {
      stopJourney();
      setStage(Number(b.dataset.stage));
    }));
    $('#journeyPlay').addEventListener('click', () => (journeyTimer ? stopJourney() : playJourney()));
    renderJourney(false);
  }

  let tlIndex = 0;
  function milestoneText(m) {
    if (!m.now) return m.text;
    const years = Math.round(daysToDeadline() / 365.25);
    const yearsWord = years === 1 ? ' tahun' : ' tahun';
    return fill('273 juta anak dan remaja tidak bersekolah, angka yang naik selama tujuh tahun berturut-turut, dan bantuan untuk pendidikan menurun. Sekitar {0} tersisa sampai batas waktu.', years + yearsWord);
  }

  function renderTimeline() {
    const list = $('#timeline');
    list.textContent = '';
    MILESTONES.forEach((m, i) => {
      const li = h('li');
      const b = h('button', 'tl-pin');
      b.type = 'button';
      b.setAttribute('aria-current', String(i === tlIndex));
      b.append(h('span', 'tl-dot'), h('span', 'tl-year', m.year), h('span', 'tl-short', m.short));
      if (m.now) b.appendChild(h('span', 'tl-now', 'Anda di sini'));
      b.addEventListener('click', () => {
        if (i !== tlIndex) Sound.play('select');
        selectMilestone(i);
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    renderMilestone(false);
  }

  function selectMilestone(i, keepFocus) {
    tlIndex = Math.max(0, Math.min(MILESTONES.length - 1, i));
    const pins = $$('#timeline .tl-pin');
    pins.forEach((b, j) => b.setAttribute('aria-current', String(j === tlIndex)));
    const pin = pins[tlIndex];
    const wrap = $('.timeline-wrap');
    if (pin && wrap) {
      const pr = pin.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      if (pr.left < wr.left || pr.right > wr.right) wrap.scrollLeft += pr.left - wr.left - 24;
    }
    renderMilestone(true);
    if (keepFocus) {
      // The card is rebuilt, so put focus back on the same button, or the other one at either end.
      const again = $('#tlCard [data-dir="' + keepFocus + '"]');
      const other = $('#tlCard [data-dir="' + (keepFocus === '1' ? '-1' : '1') + '"]');
      const target = again && !again.disabled ? again : other;
      if (target) target.focus({ preventScroll: true });
    }
  }

  function renderMilestone(animate) {
    const m = MILESTONES[tlIndex];
    const card = $('#tlCard');
    card.textContent = '';
    const body = h('div', 'tl-body' + (animate && !reduceMotion ? ' is-swapping' : ''));
    const right = h('div');
    right.append(h('h3', 'tl-card-title', m.title), h('p', 'tl-card-text', milestoneText(m)), h('p', 'tl-card-src', 'Sumber: ' + m.src));
    const nav = h('div', 'tl-nav');
    const mk = (label, dir) => {
      const b = h('button', 'btn-outline', label);
      b.type = 'button';
      b.dataset.dir = String(dir);
      b.disabled = dir < 0 ? tlIndex === 0 : tlIndex === MILESTONES.length - 1;
      b.addEventListener('click', () => {
        Sound.play('tap');
        selectMilestone(tlIndex + dir, String(dir));
      });
      return b;
    };
    nav.append(mk('Sebelumnya', -1), mk('Kemudian', 1), h('span', 'tl-count', (tlIndex + 1) + ' dari ' + MILESTONES.length));
    right.appendChild(nav);
    body.append(h('p', 'tl-card-year', m.year), right);
    card.appendChild(body);
  }

  let factOrder = [];
  let factPos = 0;
  function showFact(animate) {
    const f = FACTS[factOrder[factPos]];
    const card = $('#factCard');
    card.querySelector('.fc-num').textContent = f.num;
    card.querySelector('.fc-text').textContent = f.text;
    card.querySelector('.fc-src').textContent = 'Sumber: ' + f.src;
    $('#factCount').textContent = 'Fakta ' + (factPos + 1) + ' dari ' + FACTS.length;
    if (animate) restartAnimation(card, 'is-swapping');
  }
  function nextFact() {
    factPos += 1;
    if (factPos >= factOrder.length) {
      const last = factOrder[factOrder.length - 1];
      do { factOrder = shuffle(factOrder); } while (factOrder.length > 1 && factOrder[0] === last);
      factPos = 0;
    }
    showFact(true);
    Sound.play('pop');
  }

  /* ------------------------------------------------------------------ */
  /* Targets                                                             */
  /* ------------------------------------------------------------------ */
  let targetFilter = 'all';
  let targetIndex = 0;
  const visibleTargets = () => TARGETS.map((t, i) => i).filter((i) => targetFilter === 'all' || TARGETS[i].kind === targetFilter);

  function renderTargetList() {
    const list = $('#targetList');
    list.textContent = '';
    [['outcome', 'Target hasil: apa yang harus dicapai dunia'], ['means', 'Sarana implementasi: cara mencapainya']].forEach((g) => {
      if (targetFilter !== 'all' && targetFilter !== g[0]) return;
      list.appendChild(h('li', 'target-group', g[1]));
      TARGETS.forEach((t, i) => {
        if (t.kind !== g[0]) return;
        const li = h('li');
        const b = h('button', 'target-item');
        b.type = 'button';
        b.dataset.index = String(i);
        b.setAttribute('aria-current', i === targetIndex ? 'true' : 'false');
        b.append(h('span', 'ti-code', t.code), h('span', 'ti-name', t.short));
        b.addEventListener('click', () => {
          if (i !== targetIndex) Sound.play('select');
          selectTarget(i, true);
        });
        li.appendChild(b);
        list.appendChild(li);
      });
    });
  }

  function selectTarget(i, fromList) {
    targetIndex = i;
    $$('.target-item').forEach((b) => b.setAttribute('aria-current', Number(b.dataset.index) === i ? 'true' : 'false'));
    renderTargetDetail();
    const t = TARGETS[i];
    $('#targetStatus').textContent = 'Menampilkan target ' + t.code + ': ' + t.title;
    if (fromList && window.innerWidth <= 1060) $('#targetDetail').scrollIntoView({ behavior: smooth, block: 'start' });
  }

  function stepTarget(dir) {
    const vis = visibleTargets();
    let pos = vis.indexOf(targetIndex);
    pos = pos < 0 ? 0 : (pos + dir + vis.length) % vis.length;
    Sound.play('select');
    selectTarget(vis[pos], false);
  }

  function renderTargetDetail() {
    const t = TARGETS[targetIndex];
    const host = $('#targetDetail');
    const seenTargets = store.get('sdg4.seen.targets', []) || [];
    if (seenTargets.indexOf(t.code) < 0) store.set('sdg4.seen.targets', seenTargets.concat(t.code));
    host.textContent = '';
    const body = h('div', 'td-body');
    if (!reduceMotion) body.classList.add('is-swapping');

    const head = h('div', 'td-head');
    const titles = h('div');
    titles.append(h('p', 'td-kind', t.kind === 'outcome' ? 'Target hasil' : 'Sarana implementasi'), h('h2', 'td-title', t.title));
    head.append(h('p', 'td-code', t.code), titles);

    const official = h('blockquote', 'td-official');
    official.append(h('p', null, '“' + t.official + '”'), h('footer', null, 'Rumusan resmi PBB untuk target ' + t.code));

    const grid = h('div', 'td-grid');
    const plain = h('section');
    plain.append(h('h3', 'td-h', 'Dengan kata sederhana'), h('p', 'td-p', t.plain));
    const measured = h('section');
    measured.append(h('h3', 'td-h', 'Cara pengukurannya'), h('p', 'td-p', t.measured));
    grid.append(plain, measured);

    const stats = h('section', 'td-section');
    stats.appendChild(h('h3', 'td-h', 'Posisi dunia saat ini'));
    const statRow = h('div', 'td-stats');
    t.stats.forEach((s) => {
      const d = h('div');
      d.append(h('p', 'td-stat-num', s.value), h('p', 'td-stat-text', s.text), h('p', 'td-stat-src', 'Sumber: ' + SOURCE_NAMES[s.src]));
      statRow.appendChild(d);
    });
    stats.appendChild(statRow);

    const act = h('section', 'td-section');
    act.append(h('h3', 'td-h', 'Apa yang bisa kamu lakukan'), h('p', 'td-p', t.action));

    const notes = h('section', 'td-section td-notes');
    const noteId = 'note-' + t.code.replace('.', '-');
    const noteLabel = h('label', 'td-h', 'Catatanmu tentang target ' + t.code);
    noteLabel.htmlFor = noteId;
    const area = h('textarea', 'td-note');
    area.id = noteId;
    area.rows = 4;
    area.maxLength = 1000;
    area.placeholder = 'Apa yang mengejutkanmu? Apa yang bisa dilakukan sekolah atau kotamu?';
    const savedNotes = store.get('sdg4.notes', {}) || {};
    area.value = typeof savedNotes[t.code] === 'string' ? savedNotes[t.code] : '';
    const noteStatus = h('p', 'td-note-status', area.value ? 'Disimpan di perangkat ini.' : 'Hanya kamu yang bisa melihat catatan ini. Catatan tetap berada di perangkat ini.');
    area.addEventListener('input', () => {
      const all = store.get('sdg4.notes', {}) || {};
      if (area.value.trim()) all[t.code] = area.value;
      else delete all[t.code];
      store.set('sdg4.notes', all);
      noteStatus.textContent = 'Disimpan di perangkat ini.';
    });
    notes.append(noteLabel, area, noteStatus);

    const nav = h('div', 'td-nav');
    const vis = visibleTargets();
    const makeBtn = (label, dir) => {
      const b = h('button', 'btn-outline', label);
      b.type = 'button';
      b.dataset.dir = String(dir);
      b.addEventListener('click', () => {
        stepTarget(dir);
        const again = $('#targetDetail [data-dir="' + dir + '"]');
        if (again) again.focus({ preventScroll: true });
      });
      return b;
    };
    nav.append(makeBtn('Target sebelumnya', -1), h('span', 'td-count', (vis.indexOf(targetIndex) + 1) + ' dari ' + vis.length), makeBtn('Target berikutnya', 1));

    body.append(head, official, grid, stats, act, notes, nav);
    host.appendChild(body);
  }

  /* ------------------------------------------------------------------ */
  /* Quiz                                                                */
  /* ------------------------------------------------------------------ */
  const MODES = {
    classic: { name: 'Klasik', tag: 'Santai', count: 10, timed: false, lifeline: false, desc: '10 soal acak tanpa waktu. Ambil waktumu dan baca setiap penjelasan.' },
    challenge: { name: 'Tantangan', tag: 'Melawan waktu', count: 15, timed: true, seconds: 20, lifeline: true, desc: '15 soal, masing-masing 20 detik. Jawaban cepat dan rentetan benar mendapat poin bonus, dan kamu mendapat satu 50:50.' },
    marathon: { name: 'Maraton', tag: 'Seluruh bank soal', count: Infinity, timed: false, lifeline: false, desc: null }
  };
  const CHAPTER_MODE = { name: 'Bab', tag: 'Bab', count: Infinity, timed: false, lifeline: false, desc: null };
  const modeInfo = (key) => (key === 'chapter' ? CHAPTER_MODE : MODES[key]);
  const CHAPTER_ORDER = ['Tujuannya', 'Akses', 'Penyelesaian', 'Belajar', 'Keterampilan', 'Kesetaraan', 'Guru', 'Uang dan sekolah', 'Sejarah', 'Tahun-tahun awal', 'Literasi', 'Inklusi'];
  const BOARD_KEY = 'sdg4.quiz.board';
  const BOARD_TABS = [
    { key: 'challenge', label: 'Tantangan' },
    { key: 'classic', label: 'Klasik' },
    { key: 'marathon', label: 'Maraton' },
    { key: 'chapters', label: 'Bab' }
  ];
  let boardGroup = 'challenge';
  let lastSavedAt = 0;
  const TIERS = [
    { title: 'Skor sempurna', text: 'Kamu paham SDG 4 luar dalam. Siap mengajar kelas?' },
    { title: 'Kerja bagus sekali', text: 'Kamu memahami tujuan, target, dan angka di baliknya.' },
    { title: 'Kerja bagus', text: 'Pemahaman SDG 4 yang cukup baik. Bagian Jelajahi dan Target bisa membantu melengkapi yang kurang.' },
    { title: 'Hampir sampai', text: 'Lihat dasbor dan target, lalu coba lagi.' },
    { title: 'Terus belajar', text: 'Jelajahi dasbor dan sepuluh target, lalu coba lagi.' }
  ];
  const MARKS = { tick: 'M6 15.5l6 6L24 8', cross: 'M8 8l14 14M22 8L8 22' };
  const quiz = {
    mode: 'classic', chapter: null, saved: false, order: [], view: [0, 1, 2, 3], i: 0, correct: 0, points: 0, streak: 0, bestStreak: 0, answers: [],
    locked: false, state: 'start', lifelineUsed: false, qEnd: 0, qTotal: 0, qTimer: 0, lastTick: 0, paused: null
  };

  function quizScreen(name) {
    quiz.state = name;
    const site = $('.site');
    if (site) site.classList.toggle('is-playing', name !== 'start');
    $('#quizStart').hidden = name !== 'start';
    $('#quizPlay').hidden = name !== 'play';
    $('#quizResult').hidden = name !== 'result';
  }

  function renderModes() {
    const grid = $('#modeGrid');
    grid.textContent = '';
    const bests = store.get('sdg4.quiz.bests', {}) || {};
    Object.keys(MODES).forEach((key) => {
      const M = MODES[key];
      const count = Math.min(M.count, QUIZ.length);
      const desc = M.desc || 'Semua ' + QUIZ.length + ' soal sekaligus. Berapa lama rentetanmu bisa bertahan?';
      const best = bests[key];
      const bestText = typeof best === 'number' ? (M.timed ? 'Terbaik: ' + numberFmt.format(best) + ' poin' : 'Terbaik: ' + best + ' dari ' + count) : 'Belum ada skor';
      const b = h('button', 'mode-card' + (key === 'challenge' ? ' is-featured' : ''));
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', 'Main'));
      b.append(h('span', 'mc-tag', M.tag), h('span', 'mc-name', M.name), h('span', 'mc-desc', desc), foot);
      b.addEventListener('click', () => startQuiz(key));
      grid.appendChild(b);
    });
    $('#bankSize').textContent = String(QUIZ.length);
    renderChapters();
    renderBoard();
  }

  const scoreText = () => (modeInfo(quiz.mode).timed ? numberFmt.format(quiz.points) + ' poin' : 'Skor ' + quiz.correct);

  function renderStreak(bump) {
    const b = $('#streakBadge');
    if (quiz.streak >= 2) {
      const mult = modeInfo(quiz.mode).timed ? (quiz.streak >= 5 ? ' ×2' : quiz.streak >= 3 ? ' ×1.5' : '') : '';
      b.hidden = false;
      b.textContent = 'Rentetan ' + quiz.streak + mult;
      if (bump) restartAnimation(b, 'is-bump');
    } else {
      b.hidden = true;
    }
  }

  function startQuiz(mode, chapter) {
    const M = modeInfo(mode);
    const pool = QUIZ.map((q, i) => i).filter((i) => !chapter || QUIZ[i].cat === chapter);
    quiz.mode = mode;
    quiz.chapter = chapter || null;
    quiz.order = shuffle(pool).slice(0, Math.min(M.count, pool.length));
    Object.assign(quiz, { i: 0, correct: 0, points: 0, streak: 0, bestStreak: 0, answers: [], lifelineUsed: false, paused: null, saved: false });
    quizScreen('play');
    $('#qTimer').hidden = !M.timed;
    const ll = $('#lifelineBtn');
    ll.hidden = !M.lifeline;
    ll.disabled = false;
    ll.textContent = 'Pakai 50:50';
    window.scrollTo(0, 0);
    Sound.play('start');
    renderQuestion();
  }

  function stopQTimer() {
    if (quiz.qTimer) {
      clearInterval(quiz.qTimer);
      quiz.qTimer = 0;
    }
  }

  function qTick() {
    const left = Math.max(0, quiz.qEnd - Date.now());
    const secs = Math.ceil(left / 1000);
    $('#qtFill').style.width = (left / quiz.qTotal) * 100 + '%';
    $('#qtSecs').textContent = secs + 's';
    $('#qTimer').classList.toggle('is-urgent', secs <= 5);
    if (secs < quiz.lastTick) {
      quiz.lastTick = secs;
      if (secs > 0 && secs <= 5) Sound.play('tick');
    }
    if (left <= 0) {
      stopQTimer();
      answer(-1);
    }
  }

  function startQTimer(fresh) {
    stopQTimer();
    quiz.qTotal = modeInfo(quiz.mode).seconds * 1000;
    const remaining = fresh || quiz.paused === null ? quiz.qTotal : quiz.paused;
    quiz.paused = null;
    quiz.qEnd = Date.now() + remaining;
    quiz.lastTick = Math.ceil(remaining / 1000);
    quiz.qTimer = setInterval(qTick, 100);
    qTick();
  }

  function renderQuestion() {
    const total = quiz.order.length;
    const q = QUIZ[quiz.order[quiz.i]];
    quiz.locked = false;
    $('#qpText').textContent = 'Soal ' + (quiz.i + 1) + ' dari ' + total;
    $('#qpScore').textContent = scoreText();
    $('#qpFill').style.width = (quiz.i / total) * 100 + '%';
    $('#qCat').textContent = q.cat;
    renderStreak(false);
    if (modeInfo(quiz.mode).lifeline) $('#lifelineBtn').disabled = quiz.lifelineUsed;
    $('#quizQ').textContent = q.q;
    // quiz.view[j] is the original option shown in position j. Options with a natural order stay in it.
    const natural = q.options.map((o, i) => i);
    quiz.view = q.mix ? shuffle(natural) : natural;
    // The text the Read aloud button speaks: the question, then the answers in the order shown.
    quiz.spoken = [q.q].concat(quiz.view.map((orig, j) => 'ABCD'[j] + '. ' + q.options[orig])).join('. ');
    const opts = $('#quizOptions');
    opts.textContent = '';
    quiz.view.forEach((orig, j) => {
      const b = h('button', 'opt');
      b.type = 'button';
      b.append(h('span', 'opt-key', 'ABCD'[j]), h('span', 'opt-text', q.options[orig]), h('span', 'opt-mark'));
      b.addEventListener('click', () => answer(j));
      opts.appendChild(b);
    });
    const fb = $('#quizFeedback');
    fb.hidden = true;
    fb.textContent = '';
    $('#quizNext').hidden = true;
    $('#quizQ').focus({ preventScroll: true });
    if (modeInfo(quiz.mode).timed) startQTimer(true);
  }

  // Prepare a path to be "drawn" like a pen stroke: the CSS animation runs its dash offset to 0.
  function primeStroke(path) {
    let len = 0;
    try { len = path.getTotalLength(); } catch (e) { len = 0; }
    if (!len) return;
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
  }

  function drawMark(holder, kind) {
    const s = sv('svg', { viewBox: '0 0 30 30', 'aria-hidden': 'true' }, holder);
    primeStroke(sv('path', { d: MARKS[kind] }, s));
  }

  function popPoints(text) {
    if (reduceMotion) return;
    const host = $('#qpScore');
    const s = h('span', 'points-pop', text);
    host.appendChild(s);
    setTimeout(() => s.remove(), 1200);
  }

  function useLifeline() {
    if (!modeInfo(quiz.mode).lifeline || quiz.lifelineUsed || quiz.locked || quiz.state !== 'play') return;
    quiz.lifelineUsed = true;
    const q = QUIZ[quiz.order[quiz.i]];
    const remove = shuffle(quiz.view.map((orig, j) => j).filter((j) => quiz.view[j] !== q.answer)).slice(0, 2);
    $$('#quizOptions .opt').forEach((b, j) => {
      if (remove.indexOf(j) >= 0) {
        b.disabled = true;
        b.classList.add('is-removed');
      }
    });
    const ll = $('#lifelineBtn');
    ll.disabled = true;
    ll.textContent = '50:50 terpakai';
    Sound.play('lifeline');
  }

  function answer(k) {
    if (quiz.locked || quiz.state !== 'play') return;
    const buttons = $$('#quizOptions .opt');
    if (k >= 0 && (!buttons[k] || buttons[k].disabled)) return;
    quiz.locked = true;
    const M = modeInfo(quiz.mode);
    const left = M.timed ? Math.max(0, quiz.qEnd - Date.now()) : 0;
    stopQTimer();
    const qi = quiz.order[quiz.i];
    const q = QUIZ[qi];
    const timedOut = k < 0;
    const chosen = timedOut ? -1 : quiz.view[k];
    const correct = chosen === q.answer;
    let gained = 0;
    let mult = 1;
    if (correct) {
      quiz.correct += 1;
      quiz.streak += 1;
      quiz.bestStreak = Math.max(quiz.bestStreak, quiz.streak);
      if (M.timed) {
        mult = quiz.streak >= 5 ? 2 : quiz.streak >= 3 ? 1.5 : 1;
        gained = Math.round((100 + Math.round((left / 1000) * 5)) * mult);
        quiz.points += gained;
      }
    } else {
      quiz.streak = 0;
    }
    quiz.answers.push({ qi, chosen, correct, timedOut, cat: q.cat });

    buttons.forEach((b, j) => {
      b.disabled = true;
      if (quiz.view[j] === q.answer) { b.classList.add('is-correct'); drawMark(b.querySelector('.opt-mark'), 'tick'); }
      else if (j === k) { b.classList.add('is-wrong'); drawMark(b.querySelector('.opt-mark'), 'cross'); }
      else if (!b.classList.contains('is-removed')) b.classList.add('is-muted');
    });

    if (correct) {
      Sound.play('correct');
      if (quiz.streak === 3 || (quiz.streak >= 5 && quiz.streak % 5 === 0)) setTimeout(() => Sound.play('streak'), 280);
    } else {
      Sound.play(timedOut ? 'timeup' : 'wrong');
    }

    let verdict;
    if (correct) verdict = M.timed ? 'Benar! +' + gained + ' poin' + (mult > 1 ? fill(' dengan bonus rentetan ×{0}', mult) : '') : 'Benar!';
    else if (timedOut) verdict = 'Waktu habis. Jawabannya ' + q.options[q.answer] + '.';
    else verdict = 'Belum tepat. Jawabannya ' + q.options[q.answer] + '.';

    const fb = $('#quizFeedback');
    fb.textContent = '';
    fb.append(h('p', 'fb-verdict', verdict), h('p', 'fb-text', q.explain), h('p', 'fb-src', 'Sumber: ' + q.src));
    fb.hidden = false;
    $('#qpScore').textContent = scoreText();
    if (gained) popPoints('+' + gained);
    renderStreak(correct);
    $('#qpFill').style.width = ((quiz.i + 1) / quiz.order.length) * 100 + '%';
    if (M.lifeline) $('#lifelineBtn').disabled = true;
    const next = $('#quizNext');
    next.textContent = quiz.i === quiz.order.length - 1 ? 'Lihat skorku' : 'Soal berikutnya';
    next.hidden = false;
    next.focus({ preventScroll: true });
    const r = next.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 12) next.scrollIntoView({ behavior: smooth, block: 'end' });
  }

  function nextQuestion() {
    if (quiz.state !== 'play' || !quiz.locked) return;
    if (quiz.i < quiz.order.length - 1) {
      quiz.i += 1;
      renderQuestion();
      const top = $('#quizPlay').getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: window.scrollY + top - 96, behavior: smooth });
    } else {
      finishQuiz();
    }
  }

  /* Chapters and the leaderboard. Everything is kept in this browser. */
  const dateText = (t) => new Date(t).toLocaleDateString(LOCALES.short, { day: 'numeric', month: 'short' });

  function renderChapters() {
    const grid = $('#chapterGrid');
    grid.textContent = '';
    const bests = store.get('sdg4.quiz.bests', {}) || {};
    CHAPTER_ORDER.forEach((cat, n) => {
      const total = QUIZ.filter((q) => q.cat === cat).length;
      const best = bests['chapter:' + cat];
      const bestText = typeof best === 'number' ? 'Terbaik: ' + best + ' dari ' + total : 'Belum dimainkan';
      const b = h('button', 'chapter-card');
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', 'Main'));
      b.append(h('span', 'ch-num', 'Bab ' + (n + 1)), h('span', 'mc-name', cat), h('span', 'ch-count', total + ' soal'), foot);
      b.addEventListener('click', () => startQuiz('chapter', cat));
      grid.appendChild(b);
    });
  }

  const readBoard = () => {
    const list = store.get(BOARD_KEY, []);
    return Array.isArray(list) ? list.filter((e) => e && typeof e.score === 'number' && typeof e.t === 'number') : [];
  };

  const boardRows = (group, board) => board
    .filter((e) => e.group === group)
    .sort((a, b) => (group === 'chapters' ? b.pct - a.pct : 0) || b.score - a.score || a.t - b.t);

  function renderBoard() {
    const tabs = $('#boardTabs');
    tabs.textContent = '';
    BOARD_TABS.forEach((t) => {
      const b = h('button', 'board-tab', t.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(t.key === boardGroup));
      b.addEventListener('click', () => {
        boardGroup = t.key;
        Sound.play('tap');
        renderBoard();
      });
      tabs.appendChild(b);
    });
    const board = readBoard();
    const rows = boardRows(boardGroup, board);
    const list = $('#boardList');
    list.textContent = '';
    rows.slice(0, 10).forEach((e, i) => {
      const score = e.group === 'challenge' ? numberFmt.format(e.score) + ' poin' : e.correct + ' dari ' + e.of;
      const meta = e.label + ' · ' + (e.group === 'challenge' ? e.correct + ' dari ' + e.of + ' benar · ' : '') + dateText(e.t);
      const li = h('li', 'board-row' + (e.t === lastSavedAt ? ' is-new' : ''));
      li.append(h('span', 'br-rank', String(i + 1)), h('span', 'br-name', e.name), h('span', 'br-score', score), h('span', 'br-meta', meta));
      list.appendChild(li);
    });
    $('#boardEmpty').hidden = rows.length > 0;
    $('#boardClear').hidden = board.length === 0;
  }

  let clearTimer = 0;
  function clearBoard() {
    const btn = $('#boardClear');
    if (!clearTimer) {
      btn.textContent = 'Ketuk sekali lagi untuk menghapus semua skor';
      btn.classList.add('is-armed');
      clearTimer = setTimeout(() => {
        clearTimer = 0;
        btn.textContent = 'Hapus papan peringkat';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(clearTimer);
    clearTimer = 0;
    store.set(BOARD_KEY, []);
    btn.textContent = 'Hapus papan peringkat';
    btn.classList.remove('is-armed');
    Sound.play('tap');
    renderBoard();
  }

  function setupSaveForm() {
    quiz.saved = false;
    const input = $('#ssName');
    $('#saveScore').hidden = false;
    input.value = store.get('sdg4.quiz.name', '') || '';
    input.readOnly = false;
    $('#ssBtn').disabled = false;
    $('#ssMsg').textContent = '';
  }

  function saveScore(e) {
    e.preventDefault();
    if (quiz.saved) return;
    const input = $('#ssName');
    const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!name) {
      $('#ssMsg').textContent = 'Tulis namamu dulu.';
      input.focus();
      return;
    }
    const M = modeInfo(quiz.mode);
    const isChapter = quiz.mode === 'chapter';
    const group = isChapter ? 'chapters' : quiz.mode;
    const now = Date.now();
    const total = quiz.order.length;
    const board = readBoard();
    board.push({
      name,
      group,
      label: isChapter ? quiz.chapter : M.name,
      score: M.timed ? quiz.points : quiz.correct,
      correct: quiz.correct,
      of: total,
      pct: total ? quiz.correct / total : 0,
      t: now
    });
    store.set(BOARD_KEY, board.slice(-300));
    store.set('sdg4.quiz.name', name);
    quiz.saved = true;
    lastSavedAt = now;
    boardGroup = group;
    const rank = boardRows(group, board).findIndex((e) => e.t === now) + 1;
    const tabLabel = BOARD_TABS.find((t) => t.key === group).label;
    input.readOnly = true;
    $('#ssBtn').disabled = true;
    $('#ssMsg').textContent = 'Tersimpan. Kamu nomor ' + rank + ' di papan ' + tabLabel + '.';
    $('#ssMsg').focus({ preventScroll: true });
    Sound.play('select');
    renderBoard();
  }

  /* Flashcards: the whole quiz bank, one card at a time. */
  const fcState = { order: [], i: 0, open: false };
  const fcSeen = () => store.get('sdg4.flash', []) || [];

  function fcRender() {
    const total = fcState.order.length;
    const q = QUIZ[fcState.order[fcState.i]];
    $('#flashCount').textContent = (fcState.i + 1) + ' dari ' + total;
    $('#flashFill').style.width = ((fcState.i + 1) / total) * 100 + '%';
    $('#flashCat').textContent = q.cat;
    $('#flashFront').textContent = q.q;
    const answer = $('#flashAnswer');
    answer.textContent = '';
    answer.append(h('span', 'fa-answer', q.options[q.answer]), h('span', 'fa-why', q.explain + ' Sumber: ' + q.src + '.'));
    $('#flashPrev').disabled = fcState.i === 0;
    $('#flashNext').textContent = fcState.i === total - 1 ? 'Mulai lagi' : 'Kartu berikutnya';
    fcShowAnswer(false);
  }

  function fcShowAnswer(show) {
    $('#flashFront').hidden = show;
    $('#flashAnswer').hidden = !show;
    $('#flashCard').setAttribute('aria-expanded', String(show));
    if (show) {
      const idx = fcState.order[fcState.i];
      const seen = fcSeen();
      if (seen.indexOf(idx) < 0) store.set('sdg4.flash', seen.concat(idx));
    }
  }

  function fcMove(dir) {
    const total = fcState.order.length;
    fcState.i = (fcState.i + dir + total) % total;
    fcRender();
  }

  function fcOpen() {
    fcState.open = true;
    fcState.order = shuffle(QUIZ.map((q, i) => i));
    fcState.i = 0;
    $('#quizStart').hidden = true;
    $('#flashPlay').hidden = false;
    fcRender();
    window.scrollTo(0, 0);
    Sound.play('tap');
    $('#flashCard').focus({ preventScroll: true });
  }

  function fcClose() {
    fcState.open = false;
    $('#flashPlay').hidden = true;
    $('#quizStart').hidden = false;
    Sound.play('tap');
    window.scrollTo(0, 0);
    $('#flashOpen').focus({ preventScroll: true });
  }

  function shareScore() {
    const M = modeInfo(quiz.mode);
    const total = quiz.order.length;
    const label = quiz.mode === 'chapter' ? fill('bab {0}', quiz.chapter) : fill('mode {0}', M.name);
    const score = M.timed ? numberFmt.format(quiz.points) + ' poin' : quiz.correct + ' dari ' + total;
    const text = 'Skorku ' + score + ' pada kuis SDG 4 (' + label + ') di Pendidikan Berkualitas untuk Semua. Bisakah kamu mengalahkannya?';
    const msg = $('#shareMsg');
    msg.hidden = false;
    msg.textContent = '';
    if (navigator.share) {
      navigator.share({ title: 'Kuis SDG 4', text }).then(
        () => { msg.textContent = 'Dibagikan.'; },
        () => { msg.textContent = ''; }
      );
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { msg.textContent = 'Disalin. Tempel di mana saja untuk membagikan skormu.'; },
        () => { msg.textContent = text; }
      );
      return;
    }
    msg.textContent = text;
  }

  function quitQuiz() {
    stopQTimer();
    quiz.paused = null;
    Sound.play('tap');
    renderModes();
    quizScreen('start');
    window.scrollTo(0, 0);
  }

  function finishQuiz() {
    stopQTimer();
    quizScreen('result');
    const M = modeInfo(quiz.mode);
    const total = quiz.order.length;
    const ratio = total ? quiz.correct / total : 0;
    const tier = ratio === 1 ? TIERS[0] : ratio >= 0.8 ? TIERS[1] : ratio >= 0.6 ? TIERS[2] : ratio >= 0.4 ? TIERS[3] : TIERS[4];
    $('#rsScore').textContent = String(quiz.correct);
    $('#rsOf').textContent = '/' + total;
    const chapterEl = $('#rsChapter');
    chapterEl.hidden = !quiz.chapter;
    chapterEl.textContent = quiz.chapter ? 'Bab: ' + quiz.chapter : '';
    $('#rsTitle').textContent = tier.title;
    $('#rsText').textContent = tier.text;

    const stats = $('#resultStats');
    stats.textContent = '';
    const addStat = (value, label) => {
      const d = h('div', 'rstat');
      d.append(h('b', null, value), h('span', null, label));
      stats.appendChild(d);
    };
    addStat(Math.round(ratio * 100) + '%', 'dijawab dengan benar');
    addStat(String(quiz.bestStreak), 'rentetan terbaik');
    if (M.timed) addStat(numberFmt.format(quiz.points), 'poin');

    const byCat = {};
    quiz.answers.forEach((a) => {
      const c = byCat[a.cat] || (byCat[a.cat] = { right: 0, all: 0 });
      c.all += 1;
      if (a.correct) c.right += 1;
    });
    const cats = Object.keys(byCat).filter((c) => byCat[c].all >= 2);
    let topics = '';
    if (cats.length) {
      const sc = (c) => byCat[c].right / byCat[c].all;
      const strong = cats.slice().sort((a, b) => sc(b) - sc(a) || byCat[b].all - byCat[a].all)[0];
      const weak = cats.slice().sort((a, b) => sc(a) - sc(b) || byCat[b].all - byCat[a].all)[0];
      topics = 'Topik terkuat: ' + strong + ' (' + byCat[strong].right + ' dari ' + byCat[strong].all + ').';
      if (weak !== strong && sc(weak) < 1) topics += ' Perlu dilihat lagi: ' + weak + ' (' + byCat[weak].right + ' dari ' + byCat[weak].all + ').';
    }
    $('#rsTopics').textContent = topics;

    const bestKey = quiz.mode === 'chapter' ? 'chapter:' + quiz.chapter : quiz.mode;
    const bests = store.get('sdg4.quiz.bests', {}) || {};
    const metric = M.timed ? quiz.points : quiz.correct;
    const isNew = metric > 0 && !(typeof bests[bestKey] === 'number' && bests[bestKey] >= metric);
    if (isNew) {
      bests[bestKey] = metric;
      store.set('sdg4.quiz.bests', bests);
    }
    $('#newBest').hidden = !isNew;
    setupSaveForm();
    $('#shareMsg').hidden = true;
    const lifetime = getStats();
    lifetime.quizzes = (lifetime.quizzes || 0) + 1;
    if (total && quiz.correct === total) lifetime.perfect = (lifetime.perfect || 0) + 1;
    lifetime.bestStreak = Math.max(lifetime.bestStreak || 0, quiz.bestStreak);
    store.set('sdg4.stats', lifetime);

    const ring = $('#resultScore');
    ring.classList.remove('is-drawn');
    primeStroke(ring.querySelector('path'));
    void ring.offsetWidth;
    ring.classList.add('is-drawn');
    Sound.play(ratio === 1 ? 'perfect' : ratio >= 0.6 ? 'fanfare' : 'flat');

    const list = $('#quizReview');
    list.textContent = '';
    list.hidden = true;
    const reviewBtn = $('#quizReviewBtn');
    reviewBtn.setAttribute('aria-expanded', 'false');
    reviewBtn.textContent = 'Tinjau jawaban';
    quiz.answers.forEach((a) => {
      const q = QUIZ[a.qi];
      const li = h('li');
      const mk = h('span', 'rv-mark' + (a.correct ? '' : ' is-wrong'));
      const s = sv('svg', { viewBox: '0 0 30 30', 'aria-hidden': 'true' }, mk);
      sv('path', { d: a.correct ? MARKS.tick : MARKS.cross }, s);
      mk.appendChild(h('span', 'visually-hidden', a.correct ? 'Benar' : 'Salah'));
      const body = h('div');
      let line;
      if (a.correct) line = 'Jawabanmu: ' + q.options[a.chosen] + '.';
      else if (a.timedOut) line = 'Tidak dijawab: waktu habis. Jawaban benar: ' + q.options[q.answer] + '.';
      else line = 'Jawabanmu: ' + q.options[a.chosen] + '. Jawaban benar: ' + q.options[q.answer] + '.';
      body.append(h('p', 'rv-q', q.q), h('p', 'rv-a', line));
      li.append(mk, body);
      list.appendChild(li);
    });
    window.scrollTo(0, 0);
    $('#rsTitle').focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */
  /* Focus timer                                                         */
  /* ------------------------------------------------------------------ */
  const MODE_LABEL = { focus: 'Fokus', short: 'Istirahat singkat', long: 'Istirahat panjang' };
  const RING_C = 2 * Math.PI * 128;
  const timer = {
    s: Object.assign({ focus: 25, short: 5, long: 15, every: 4, auto: true, sound: true }, store.get('sdg4.timer.settings', {})),
    mode: 'focus', running: false, endAt: 0, total: 0, remaining: 0, cycle: 0, interval: 0, timeout: 0, shown: ''
  };
  (function sanitize() {
    const s = timer.s;
    const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
    s.focus = clamp(s.focus, 5, 90, 25);
    s.short = clamp(s.short, 1, 30, 5);
    s.long = clamp(s.long, 5, 60, 15);
    s.every = clamp(s.every, 2, 8, 4);
    s.auto = s.auto !== false;
    s.sound = s.sound !== false;
  })();

  const saveSettings = () => store.set('sdg4.timer.settings', timer.s);
  const durationMs = (mode) => timer.s[mode] * 60000;
  const announce = (msg) => {
    const n = $('#timerStatus');
    n.textContent = '';
    setTimeout(() => { n.textContent = msg; }, 40);
  };

  function renderTicks() {
    const g = $('#dialTicks');
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const major = i % 5 === 0;
      const r1 = major ? 139 : 144;
      const r2 = 151;
      sv('line', {
        x1: (160 + r1 * Math.cos(a)).toFixed(2), y1: (160 + r1 * Math.sin(a)).toFixed(2),
        x2: (160 + r2 * Math.cos(a)).toFixed(2), y2: (160 + r2 * Math.sin(a)).toFixed(2),
        class: major ? 'major' : ''
      }, g);
    }
    const ring = $('#dialProgress');
    ring.style.strokeDasharray = String(RING_C);
    ring.style.strokeDashoffset = '0';
  }

  function sessionText() {
    const every = timer.s.every;
    if (timer.mode === 'focus') return 'Sesi ' + Math.min(timer.cycle + 1, every) + ' dari ' + every;
    if (timer.mode === 'short') return 'Berdiri, regangkan badan, dan minum air';
    return 'Siklus selesai. Nikmati istirahat yang cukup';
  }

  function renderCycle() {
    const host = $('#cycleDots');
    host.textContent = '';
    const done = Math.min(timer.cycle, timer.s.every);
    for (let i = 0; i < timer.s.every; i++) {
      const dot = h('span');
      if (i < done) dot.className = 'on';
      host.appendChild(dot);
    }
    const left = timer.s.every - done;
    $('#cycleLabel').textContent = left === 0 ? 'Saatnya istirahat panjang' : left + (left === 1 ? ' sesi fokus' : ' sesi fokus') + ' sampai istirahat panjang';
  }

  function renderModeUI() {
    $('#dialPanel').classList.toggle('is-break', timer.mode !== 'focus');
    $$('#modeTabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === timer.mode)));
    $('#dialMode').textContent = MODE_LABEL[timer.mode];
    $('#dialSession').textContent = sessionText();
    renderCycle();
  }

  function renderTimer() {
    const secs = Math.ceil(timer.remaining / 1000);
    const text = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
    if (text !== timer.shown) {
      timer.shown = text;
      $('#dialTime').textContent = text;
    }
    const title = timer.running ? text + ' ' + MODE_LABEL[timer.mode] + ' | ' + BASE_TITLE : BASE_TITLE;
    if (document.title !== title) document.title = title;
    const frac = timer.total ? 1 - timer.remaining / timer.total : 0;
    $('#dialProgress').style.strokeDashoffset = String(-RING_C * frac);
    $('#tStart').textContent = timer.running ? 'Jeda' : (timer.remaining < timer.total ? 'Lanjutkan' : 'Mulai');
  }

  function stopClock() {
    clearInterval(timer.interval);
    clearTimeout(timer.timeout);
  }
  function startClock() {
    stopClock();
    timer.interval = setInterval(tick, 250);
    timer.timeout = setTimeout(tick, timer.remaining + 30);
  }
  function tick() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, timer.endAt - Date.now());
    renderTimer();
    if (timer.remaining <= 0) finishSession();
  }

  function setMode(mode) {
    stopClock();
    timer.mode = mode;
    timer.running = false;
    timer.total = durationMs(mode);
    timer.remaining = timer.total;
    renderModeUI();
    renderTimer();
  }

  function start(silent) {
    if (timer.running) return;
    if (!silent) Sound.play('start');
    else Sound.prime();
    if (timer.remaining <= 0) timer.remaining = timer.total;
    timer.running = true;
    timer.endAt = Date.now() + timer.remaining;
    startClock();
    renderTimer();
    announce(MODE_LABEL[timer.mode] + ' dimulai');
  }
  function pause() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, timer.endAt - Date.now());
    timer.running = false;
    stopClock();
    renderTimer();
    Sound.play('pause');
    announce('Dijeda');
  }
  const toggleTimer = () => (timer.running ? pause() : start(false));
  function resetTimer() {
    timer.running = false;
    stopClock();
    timer.remaining = timer.total;
    renderTimer();
    Sound.play('tap');
    announce('Pengatur waktu diatur ulang');
  }

  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  };
  function getToday() {
    const s = store.get('sdg4.timer.today', null);
    return s && s.date === todayKey() ? s : { date: todayKey(), sessions: 0, minutes: 0 };
  }
  function renderToday() {
    const s = getToday();
    $('#tsSessions').textContent = String(s.sessions);
    $('#tsMinutes').textContent = String(s.minutes);
  }
  function addToday(minutes) {
    const s = getToday();
    s.sessions += 1;
    s.minutes += minutes;
    store.set('sdg4.timer.today', s);
    const stats = getStats();
    stats.focusMinutes = (stats.focusMinutes || 0) + minutes;
    store.set('sdg4.stats', stats);
    renderToday();
  }

  function advance(completed) {
    const was = timer.mode;
    let next;
    if (was === 'focus') {
      if (completed) addToday(timer.s.focus);
      timer.cycle += 1;
      next = timer.cycle >= timer.s.every ? 'long' : 'short';
    } else {
      if (was === 'long') timer.cycle = 0;
      next = 'focus';
    }
    setMode(next);
    announce(completed ? MODE_LABEL[was] + ' selesai. Berikutnya: ' + MODE_LABEL[next] + '.' : 'Dilewati ke ' + MODE_LABEL[next] + '.');
    if (completed && timer.s.auto) start(true);
  }
  function finishSession() {
    timer.running = false;
    stopClock();
    if (timer.s.sound) Sound.play('chime');
    advance(true);
  }
  const skipTimer = () => {
    Sound.play('tap');
    advance(false);
  };

  function renderSettings() {
    $$('.setting').forEach((row) => {
      const k = row.dataset.key;
      const unit = row.dataset.unit;
      row.querySelector('output').textContent = timer.s[k] + (unit ? ' ' + unit : '');
    });
    $('#optAuto').checked = !!timer.s.auto;
    $('#optSound').checked = !!timer.s.sound;
  }

  let tipIndex = Math.floor(Math.random() * TIPS.length);
  const showTip = () => { $('#tipText').textContent = TIPS[tipIndex]; };

  /* ------------------------------------------------------------------ */
  /* Data for the Solutions and Take action pages                        */
  /* ------------------------------------------------------------------ */
  // 2000 and 2024 values (%). Completion: UNESCO GEM Report 2026. Youth literacy: GEM Report 2026, ch. 7.
  const THEN_NOW = [
    { name: 'Penyelesaian sekolah dasar', a: 77, b: 88 },
    { name: 'Penyelesaian menengah pertama', a: 60, b: 78 },
    { name: 'Penyelesaian menengah atas', a: 37, b: 61 },
    { name: 'Literasi remaja', a: 87, b: 93 }
  ];

  const ACTION_GROUPS = [['school', 'Di sekolah'], ['community', 'Di komunitasmu'], ['voice', 'Bersuaralah']];
  const ACTIONS = [
    { id: 'tutor', group: 'school', target: '4.1', title: 'Mulai klub les sebaya', text: 'Bantu siswa yang lebih muda dengan membaca atau matematika seminggu sekali.' },
    { id: 'books', group: 'school', target: '4.6', title: 'Adakan tukar buku', text: 'Kumpulkan buku yang sudah selesai dibaca dan tukarkan saat makan siang.' },
    { id: 'include', group: 'school', target: '4.5', title: 'Buat kelasmu lebih inklusif', text: 'Ajak seseorang yang baru ke kelompokmu dan minta bahan yang bisa dipakai semua orang.' },
    { id: 'eco', group: 'school', target: '4.7', title: 'Mulai klub lingkungan atau isu global', text: 'Bawa perubahan iklim dan hak asasi manusia ke proyek kelas.' },
    { id: 'safe', group: 'school', target: '4.a', title: 'Bersuara untuk sekolah yang aman', text: 'Laporkan toilet, jalur landai, atau lampu yang rusak, dan dukung teman sekelas yang di-bully.' },
    { id: 'teacher', group: 'school', target: '4.c', title: 'Ucapkan terima kasih kepada guru', text: 'Tulis surat untuk guru yang berarti bagimu.' },
    { id: 'read', group: 'community', target: '4.2', title: 'Membaca bersama anak kecil', text: 'Membaca bersama saudara yang lebih muda, atau menjadi relawan di pusat belajar anak usia dini setempat.' },
    { id: 'supplies', group: 'community', target: '4.5', title: 'Kumpulkan perlengkapan sekolah', text: 'Adakan penggalangan buku tulis, pulpen, dan tas untuk siswa yang membutuhkan.' },
    { id: 'skill', group: 'community', target: '4.4', title: 'Ajarkan keterampilan digital', text: 'Ajari anggota keluarga cara membuat presentasi atau tetap aman di internet.' },
    { id: 'scholar', group: 'community', target: '4.b', title: 'Bagikan informasi beasiswa', text: 'Kumpulkan peluang beasiswa dan kursus, lalu bagikan untuk kelasmu.' },
    { id: 'talk', group: 'voice', target: 'Semua', title: 'Berikan presentasi tentang SDG 4', text: 'Presentasikan fakta dari situs ini kepada kelasmu atau di acara sekolah.' },
    { id: 'write', group: 'voice', target: 'Pendanaan', title: 'Tulis surat kepada pembuat keputusan', text: 'Minta pimpinan sekolah atau wakil daerahmu untuk menjaga anggaran pendidikan.' },
    { id: 'share', group: 'voice', target: 'Semua', title: 'Bagikan satu fakta seminggu', text: 'Unggah satu fakta dari mesin fakta, selalu dengan sumbernya.' }
  ];
  const EXAMPLE_PLEDGE = ['tutor', 'books', 'talk'];
  const MAX_PICKS = 3;

  /* ------------------------------------------------------------------ */
  /* Site chrome: sound toggle, menu, shortcuts, keyboard                */
  /* ------------------------------------------------------------------ */
  let pageKeys = null;
  const dlg = $('#shortcuts');

  function renderSoundButtons() {
    const on = Sound.isOn();
    const btn = $('#soundBtn');
    if (btn) btn.setAttribute('aria-pressed', String(on));
    const label = $('#soundLabel');
    if (label) label.textContent = on ? 'Suara aktif' : 'Matikan suara';
  }
  function toggleSound() {
    Sound.set(!Sound.isOn());
    renderSoundButtons();
    Sound.play('select');
  }

  function openShortcuts() {
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }
  function closeShortcuts() {
    if (!dlg) return;
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  function initMenu() {
    const header = $('#siteHeader');
    const btn = $('#menuBtn');
    if (!header || !btn) return;
    const setOpen = (open) => {
      header.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => {
      setOpen(!header.classList.contains('is-open'));
      Sound.play('tap');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && header.classList.contains('is-open')) {
        setOpen(false);
        btn.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (header.classList.contains('is-open') && !header.contains(e.target)) setOpen(false);
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 1180) setOpen(false); });
  }

  // Language selectors (top bar, menu and slides) jump to the same page in the chosen language.
  function initLang() {
    $$('.lang-sel').forEach((sel) => {
      sel.addEventListener('change', () => {
        if (sel.value) window.location.href = sel.value;
      });
    });
  }

  function initChrome() {
    tip.node = $('#tooltip');
    renderCountdown();
    setInterval(renderCountdown, 60000);
    renderSoundButtons();
    const soundBtn = $('#soundBtn');
    if (soundBtn) soundBtn.addEventListener('click', toggleSound);
    // Browsers only allow audio after the first tap or key press.
    document.addEventListener('pointerdown', () => Sound.prime(), { capture: true, once: true });
    document.addEventListener('keydown', () => Sound.prime(), { capture: true, once: true });
    initMenu();
    if (dlg) {
      $('#scClose').addEventListener('click', closeShortcuts);
      dlg.addEventListener('click', (e) => {
        const r = dlg.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeShortcuts();
      });
    }
    $$('.people').forEach(renderPeople);
    $$('.waffle').forEach(renderWaffle);
    window.addEventListener('scroll', () => tip.hide(), { passive: true });

    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (dlg && dlg.open) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      const onControl = tag === 'button' || tag === 'a';
      const key = e.key;
      if (key === 'm' || key === 'M') { e.preventDefault(); toggleSound(); return; }
      if (key === '?' && dlg) { e.preventDefault(); openShortcuts(); return; }
      if (pageKeys) pageKeys(e, key, onControl);
    });
  }

  // Keep keyboard focus with the selection, so the focus ring never points at the old item.
  const focusedIs = (cls) => {
    const ae = document.activeElement;
    return !!(ae && ae.classList && ae.classList.contains(cls));
  };
  const focusedNav = (scope) => {
    const ae = document.activeElement;
    return ae && ae.closest ? ae.closest(scope + ' [data-dir]') : null;
  };

  /* ------------------------------------------------------------------ */
  /* Pages                                                               */
  /* ------------------------------------------------------------------ */
  function initFacts() {
    renderOOS();
    buildLegend($('#slopeLegend'), 'key-line');
    buildLegend($('#regionLegend'), 'key-dot');
    renderRegions();
    renderParity();
    buildTable($('#slopeTable'), ['Tahun', 'SD', 'Menengah pertama', 'Menengah atas'],
      TREND.map((d) => [String(d.year), d.primary + '%', d.lower + '%', d.upper + '%']), 'Tingkat penyelesaian di seluruh dunia');
    renderSlope();
    window.addEventListener('load', renderSlope);
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      tip.hide();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderSlope, 120);
    });

    $$('.table-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.getAttribute('aria-controls'));
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        target.hidden = open;
        btn.textContent = open ? 'Tampilkan tabel data' : 'Sembunyikan tabel data';
        Sound.play('tap');
      });
    });
    $$('.src-ref').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const li = document.getElementById('src-' + a.dataset.src);
        if (!li) return;
        Sound.play('tap');
        li.scrollIntoView({ behavior: smooth, block: 'center' });
        li.classList.add('is-flash');
        setTimeout(() => li.classList.remove('is-flash'), 1800);
      });
    });
  }

  function initTargets() {
    renderTargetList();
    renderTargetDetail();
    $$('#targetFilter button').forEach((b) => {
      b.addEventListener('click', () => {
        targetFilter = b.dataset.filter;
        $$('#targetFilter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        const vis = visibleTargets();
        if (vis.indexOf(targetIndex) < 0) targetIndex = vis[0];
        Sound.play('tap');
        renderTargetList();
        renderTargetDetail();
      });
    });
    pageKeys = (e, key) => {
      if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = key === 'ArrowRight' ? 1 : -1;
      const onItem = focusedIs('target-item');
      const nav = focusedNav('#targetDetail');
      stepTarget(dir);
      const target = onItem ? $('.target-item[aria-current="true"]') : nav ? $('#targetDetail [data-dir="' + nav.dataset.dir + '"]') : null;
      if (target) target.focus({ preventScroll: true });
    };
  }

  function initExplore() {
    tickLive();
    setInterval(tickLive, 500);
    initJourney();
    renderTimeline();
    factOrder = shuffle(FACTS.map((f, i) => i));
    factPos = 0;
    showFact(false);
    $('#factBtn').addEventListener('click', nextFact);
    pageKeys = (e, key) => {
      if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = Math.max(0, Math.min(MILESTONES.length - 1, tlIndex + (key === 'ArrowRight' ? 1 : -1)));
      if (next === tlIndex) return;
      const onPin = focusedIs('tl-pin');
      const nav = focusedNav('#tlCard');
      Sound.play('tap');
      selectMilestone(next, nav ? nav.dataset.dir : null);
      if (onPin) $$('#timeline .tl-pin')[tlIndex].focus({ preventScroll: true });
    };
  }

  function initQuiz() {
    const saved = readBoard();
    if (saved.length) boardGroup = saved[saved.length - 1].group;
    renderModes();
    quizScreen('start');
    $('#quizNext').addEventListener('click', nextQuestion);
    $('#quizQuit').addEventListener('click', quitQuiz);
    const speakBtn = $('#quizSpeak');
    if (speakBtn) {
      if (!('speechSynthesis' in window)) speakBtn.hidden = true;
      speakBtn.addEventListener('click', () => speak(quiz.spoken || ''));
    }
    $('#lifelineBtn').addEventListener('click', useLifeline);
    $('#quizRetry').addEventListener('click', () => startQuiz(quiz.mode, quiz.chapter));
    $('#saveScore').addEventListener('submit', saveScore);
    $('#boardClear').addEventListener('click', clearBoard);
    $('#quizShare').addEventListener('click', shareScore);
    $('#flashOpen').addEventListener('click', fcOpen);
    $('#flashBack').addEventListener('click', fcClose);
    $('#flashCard').addEventListener('click', () => fcShowAnswer($('#flashAnswer').hidden));
    $('#flashPrev').addEventListener('click', () => fcMove(-1));
    $('#flashNext').addEventListener('click', () => fcMove(1));
    $('#flashShuffle').addEventListener('click', () => {
      fcState.order = shuffle(QUIZ.map((q, i) => i));
      fcState.i = 0;
      Sound.play('tap');
      fcRender();
    });
    $('#quizModes').addEventListener('click', () => {
      Sound.play('tap');
      renderModes();
      quizScreen('start');
      window.scrollTo(0, 0);
    });
    $('#quizReviewBtn').addEventListener('click', () => {
      const list = $('#quizReview');
      const btn = $('#quizReviewBtn');
      const open = !list.hidden;
      list.hidden = open;
      btn.setAttribute('aria-expanded', String(!open));
      btn.textContent = open ? 'Tinjau jawaban' : 'Sembunyikan jawaban';
      Sound.play('tap');
    });
    pageKeys = (e, key, onControl) => {
      if (fcState.open) {
        if (key === 'ArrowRight' || key === 'ArrowLeft') {
          e.preventDefault();
          fcMove(key === 'ArrowRight' ? 1 : -1);
        }
        return;
      }
      if (quiz.state !== 'play') return;
      const letter = key.length === 1 ? 'abcd'.indexOf(key.toLowerCase()) : -1;
      const digit = ['1', '2', '3', '4'].indexOf(key);
      const pick = letter >= 0 ? letter : digit;
      if (pick >= 0) {
        e.preventDefault();
        if (!quiz.locked) answer(pick);
        return;
      }
      if (key === 'Enter' && quiz.locked && !onControl) {
        e.preventDefault();
        nextQuestion();
      }
    };
  }

  function initTimer() {
    renderTicks();
    setMode('focus');
    renderSettings();
    renderToday();
    showTip();
    $('#tStart').addEventListener('click', toggleTimer);
    $('#tReset').addEventListener('click', resetTimer);
    $('#tSkip').addEventListener('click', skipTimer);
    $$('#modeTabs button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.mode === timer.mode && !timer.running && timer.remaining === timer.total) return;
      Sound.play('tap');
      setMode(b.dataset.mode);
      announce(MODE_LABEL[timer.mode] + ' dipilih');
    }));
    $$('.setting').forEach((row) => {
      row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const k = row.dataset.key;
        const min = Number(row.dataset.min);
        const max = Number(row.dataset.max);
        const step = Number(row.dataset.step);
        const v = Math.max(min, Math.min(max, timer.s[k] + step * Number(b.dataset.delta)));
        if (v === timer.s[k]) return;
        timer.s[k] = v;
        saveSettings();
        renderSettings();
        Sound.play('tap');
        if (k === 'every') {
          renderCycle();
          $('#dialSession').textContent = sessionText();
        } else if (k === timer.mode && !timer.running && timer.remaining === timer.total) {
          timer.total = durationMs(k);
          timer.remaining = timer.total;
          renderTimer();
        }
      }));
    });
    $('#optAuto').addEventListener('change', (e) => { timer.s.auto = e.target.checked; saveSettings(); Sound.play('tap'); });
    $('#optSound').addEventListener('change', (e) => {
      timer.s.sound = e.target.checked;
      saveSettings();
      if (timer.s.sound) Sound.play('chime');
    });
    const task = $('#taskInput');
    task.value = store.get('sdg4.timer.task', '') || '';
    task.addEventListener('input', () => store.set('sdg4.timer.task', task.value));
    task.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); task.blur(); } });
    $('#tipNext').addEventListener('click', () => {
      tipIndex = (tipIndex + 1) % TIPS.length;
      showTip();
      Sound.play('pop');
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    pageKeys = (e, key, onControl) => {
      if (key === ' ' && !onControl) { e.preventDefault(); toggleTimer(); return; }
      if (key === 'r' || key === 'R') { e.preventDefault(); resetTimer(); return; }
      if (key === 's' || key === 'S') { e.preventDefault(); skipTimer(); }
    };
  }

  // Solutions: one bar per indicator, switching between 2000 and 2024.
  function initSolutions() {
    const host = $('#thenNow');
    const rows = THEN_NOW.map((d) => {
      const row = h('div', 'tn-row');
      const track = h('div', 'tn-track');
      const bar = h('span', 'tn-bar');
      const ghost = h('span', 'tn-ghost');
      ghost.style.left = d.a + '%';
      track.append(bar, ghost);
      const val = h('p', 'tn-val');
      const num = h('b');
      const delta = h('span', 'tn-delta');
      val.append(num, delta);
      row.append(h('p', 'tn-name', d.name), track, val);
      host.appendChild(row);
      return { d, bar, ghost, num, delta, shown: 0 };
    });
    const legend = h('p', 'tn-legend');
    const l1 = h('span');
    l1.append(h('i'), document.createTextNode('Porsi pada tahun yang dipilih (%)'));
    const l2 = h('span');
    const line = h('i', 'line');
    l2.append(line, document.createTextNode('Tingkat pada 2000'));
    legend.append(l1, l2);
    host.appendChild(legend);

    let year = 2024;
    let playing = 0;
    const tweenTo = (r, to, animate) => {
      const from = r.shown;
      r.shown = to;
      if (!animate || reduceMotion) { r.num.textContent = to + '%'; return; }
      const t0 = performance.now();
      const step = (now) => {
        if (r.shown !== to) return;
        const t = Math.min(1, (now - t0) / 800);
        const e = 1 - Math.pow(1 - t, 3);
        r.num.textContent = Math.round(from + (to - from) * e) + '%';
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const show = (y, animate) => {
      year = y;
      $$('#tnYears button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.year) === y)));
      rows.forEach((r) => {
        const v = y === 2000 ? r.d.a : r.d.b;
        if (!animate) {
          r.bar.style.transition = 'none';
          r.bar.style.width = v + '%';
          void r.bar.offsetWidth;
          r.bar.style.transition = '';
        } else {
          r.bar.style.width = v + '%';
        }
        r.ghost.style.opacity = y === 2000 ? '0' : '.55';
        r.delta.textContent = y === 2024 ? '+' + (r.d.b - r.d.a) + ' poin' : '';
        tweenTo(r, v, animate);
      });
      $('#tnStatus').textContent = 'Menampilkan ' + y + ': ' + rows.map((r) => r.d.name + ' ' + (y === 2000 ? r.d.a : r.d.b) + '%').join(', ') + '.';
    };
    const stopPlay = () => {
      clearTimeout(playing);
      playing = 0;
      $('#tnPlay').textContent = 'Putar perubahannya';
    };
    $$('#tnYears button').forEach((b) => b.addEventListener('click', () => {
      stopPlay();
      const y = Number(b.dataset.year);
      if (y === year) return;
      show(y, true);
      Sound.play(y === 2024 ? 'select' : 'tap');
    }));
    $('#tnPlay').addEventListener('click', () => {
      stopPlay();
      Sound.play('start');
      show(2000, true);
      $('#tnPlay').textContent = 'Memutar';
      playing = setTimeout(() => {
        show(2024, true);
        Sound.play('correct');
        playing = setTimeout(stopPlay, 900);
      }, reduceMotion ? 300 : 1300);
    });
    show(2024, false);
  }

  // Take action: choose up to three actions and keep a pledge in this browser.
  function initAction() {
    const KEY = 'sdg4.pledge';
    const known = (id) => ACTIONS.some((a) => a.id === id);
    const saved = store.get(KEY, null);
    let state;
    if (saved && Array.isArray(saved.picks)) {
      const picks = saved.picks.filter(known).slice(0, MAX_PICKS);
      state = {
        name: typeof saved.name === 'string' ? saved.name.slice(0, 40) : '',
        picks,
        done: Array.isArray(saved.done) ? saved.done.filter((id) => picks.indexOf(id) >= 0) : [],
        mine: true,
        made: typeof saved.made === 'string' ? saved.made : null
      };
    } else {
      state = { name: '', picks: EXAMPLE_PLEDGE.slice(), done: [], mine: false, made: null };
    }

    const byId = (id) => ACTIONS.find((a) => a.id === id);
    const tagText = (a) => (/^\d/.test(a.target) ? 'Target ' + a.target : a.target === 'Semua' ? 'Semua target' : a.target);
    const todayISO = () => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const niceDate = (iso) => {
      const p = String(iso).split('-').map(Number);
      const d = p.length === 3 ? new Date(p[0], p[1] - 1, p[2]) : new Date();
      return d.toLocaleDateString(LOCALES.date || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    const status = (msg) => { $('#plStatus').textContent = msg; };
    const save = () => {
      state.mine = true;
      if (!state.made) state.made = todayISO();
      store.set(KEY, { name: state.name, picks: state.picks, done: state.done, made: state.made });
    };

    const host = $('#actChoices');
    let pickCount = null;
    ACTION_GROUPS.forEach((g, gi) => {
      const group = h('section', 'act-group');
      const head = h('div', 'act-group-head');
      head.appendChild(h('h2', 'act-group-title', g[1]));
      if (gi === 0) {
        pickCount = h('p', 'act-pick-count');
        head.appendChild(pickCount);
      }
      group.appendChild(head);
      const list = h('div', 'act-list');
      ACTIONS.filter((a) => a.group === g[0]).forEach((a) => {
        const b = h('button', 'act-card');
        b.type = 'button';
        b.dataset.id = a.id;
        b.append(h('span', 'ac-tag', tagText(a)), h('span', 'ac-title', a.title), h('span', 'ac-desc', a.text), h('span', 'ac-check'));
        b.addEventListener('click', () => toggle(a.id));
        list.appendChild(b);
      });
      group.appendChild(list);
      host.appendChild(group);
    });

    const nameInput = $('#plName');
    nameInput.value = state.name;

    function render() {
      $$('.act-card', host).forEach((b) => b.setAttribute('aria-pressed', String(state.picks.indexOf(b.dataset.id) >= 0)));
      pickCount.textContent = state.picks.length + ' dari ' + MAX_PICKS + ' dipilih';
      const badge = $('#plBadge');
      badge.textContent = state.mine ? 'Janjimu' : 'Contoh janji: ubah agar sesuai dengan kamu';
      badge.classList.toggle('is-mine', state.mine);
      const list = $('#plList');
      list.textContent = '';
      if (!state.picks.length) {
        list.appendChild(h('li', 'pl-empty', 'Pilih hingga tiga tindakan untuk menambahkannya di sini.'));
      }
      state.picks.forEach((id) => {
        const a = byId(id);
        const isDone = state.done.indexOf(id) >= 0;
        const li = h('li', 'pl-item' + (isDone ? ' is-done' : ''));
        const text = h('div');
        text.append(h('span', 'pl-item-title', a.title), h('span', 'pl-item-tag', tagText(a)));
        const btn = h('button', 'pl-done', isDone ? 'Selesai' : 'Tandai selesai');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(isDone));
        btn.setAttribute('aria-label', (isDone ? 'Selesai: ' : 'Tandai selesai: ') + a.title);
        btn.addEventListener('click', () => markDone(id));
        li.append(text, btn);
        list.appendChild(li);
      });
      const done = state.picks.filter((id) => state.done.indexOf(id) >= 0).length;
      const total = state.picks.length;
      $('#plCount').textContent = total ? done + ' dari ' + total + ' selesai' : 'Belum ada yang dipilih';
      $('#plFill').style.width = (total ? (done / total) * 100 : 0) + '%';
      $('#plDate').textContent = state.made ? 'Dibuat pada ' + niceDate(state.made) : 'Disimpan di peramban ini setelah kamu mengubahnya';
    }

    function toggle(id) {
      const i = state.picks.indexOf(id);
      if (i >= 0) {
        state.picks.splice(i, 1);
        state.done = state.done.filter((d) => d !== id);
        Sound.play('tap');
        status('');
      } else if (state.picks.length >= MAX_PICKS) {
        Sound.play('pause');
        status('Kamu bisa memilih hingga tiga tindakan. Hapus satu dulu.');
        return;
      } else {
        state.picks.push(id);
        Sound.play('select');
        status('');
      }
      save();
      render();
    }

    function markDone(id) {
      const i = state.done.indexOf(id);
      if (i >= 0) {
        state.done.splice(i, 1);
        Sound.play('tap');
        status('');
      } else {
        state.done.push(id);
        const all = state.picks.every((p) => state.done.indexOf(p) >= 0);
        Sound.play(all ? 'fanfare' : 'correct');
        status(all ? 'Semua selesai. Itulah seluruh janjimu.' : 'Bagus. Teruskan.');
      }
      save();
      render();
      const again = $('#plList [aria-label$="' + byId(id).title + '"]');
      if (again) again.focus({ preventScroll: true });
    }

    function pledgeText() {
      const lines = ['Janji SDG 4 saya'];
      if (state.name.trim()) lines.push('Nama: ' + state.name.trim());
      state.picks.forEach((id, i) => {
        const a = byId(id);
        lines.push((i + 1) + '. ' + a.title + (state.done.indexOf(id) >= 0 ? ' (done)' : ''));
      });
      lines.push('Dibuat pada ' + niceDate(state.made || todayISO()) + ' untuk Pendidikan Berkualitas untuk Semua, TPB 4.');
      return lines.join('\n');
    }

    nameInput.addEventListener('input', () => {
      state.name = nameInput.value.slice(0, 40);
      save();
      render();
    });

    $('#plCopy').addEventListener('click', () => {
      if (!state.picks.length) {
        status('Pilih setidaknya satu tindakan dulu.');
        Sound.play('pause');
        return;
      }
      const text = pledgeText();
      const area = $('#plText');
      const fallback = () => {
        area.value = text;
        area.hidden = false;
        area.focus();
        area.select();
        status('Pilih teks di bawah dan salin.');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            area.hidden = true;
            status('Disalin. Tempel di mana saja.');
            Sound.play('pop');
          }, fallback);
        } else {
          fallback();
        }
      } catch (e) {
        fallback();
      }
    });

    $('#plReset').addEventListener('click', () => {
      state = { name: '', picks: [], done: [], mine: true, made: null };
      nameInput.value = '';
      store.set(KEY, { name: '', picks: [], done: [], made: null });
      $('#plText').hidden = true;
      Sound.play('tap');
      status('Dihapus. Pilih hingga tiga tindakan.');
      render();
    });

    render();
  }

  function initAbout() {
    const input = $('#glossFilter');
    const items = $$('#gloss .g-item');
    const count = $('#glossCount');
    const empty = $('#glossEmpty');
    const update = () => {
      const q = input.value.trim().toLowerCase();
      let n = 0;
      items.forEach((it) => {
        const match = !q || it.textContent.toLowerCase().indexOf(q) >= 0;
        it.hidden = !match;
        if (match) n += 1;
      });
      count.textContent = q ? n + ' dari ' + items.length + ' istilah' : items.length + ' istilah';
      empty.hidden = n > 0;
    };
    input.addEventListener('input', update);
    update();
  }

  // Slides: one slide at a time, arrow keys, taps, swipes and a #slide-N link for each.
  function initSlides() {
    const stage = $('#deckStage');
    const slides = $$('.slide', stage);
    const total = slides.length;
    let cur = slides.findIndex((s) => !s.hidden);
    if (cur < 0) cur = 0;

    const fromHash = () => {
      const m = /^#slide-(\d+)$/.exec(window.location.hash || '');
      return m ? Math.min(total, Math.max(1, Number(m[1]))) - 1 : null;
    };
    const setHash = (i) => {
      try { window.location.replace('#slide-' + (i + 1)); } catch (e) { /* hash not writable here */ }
    };
    function show(i, dir, silent) {
      const next = Math.max(0, Math.min(total - 1, i));
      if (next !== cur) {
        slides[cur].hidden = true;
        slides[next].classList.toggle('is-back', dir < 0);
        slides[next].hidden = false;
        cur = next;
        if (!silent) Sound.play(dir < 0 ? 'tap' : 'select');
      }
      $('#deckCount').textContent = (cur + 1) + ' / ' + total;
      $('#deckFill').style.width = ((cur + 1) / total) * 100 + '%';
      $('#deckPrev').disabled = cur === 0;
      $('#deckNext').disabled = cur === total - 1;
      $('#deckStatus').textContent = 'Slide ' + (cur + 1) + ' dari ' + total;
      setHash(cur);
    }
    const step = (dir) => {
      const target = cur + dir;
      if (target < 0 || target >= total) return;
      show(target, dir, false);
    };

    $('#deckPrev').addEventListener('click', () => step(-1));
    $('#deckNext').addEventListener('click', () => step(1));

    let swipeX = null;
    let swiped = false;
    stage.addEventListener('pointerdown', (e) => { swipeX = e.clientX; swiped = false; });
    stage.addEventListener('pointerup', (e) => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) > 50) {
        swiped = true;
        step(dx < 0 ? 1 : -1);
      }
    });
    stage.addEventListener('click', (e) => {
      if (swiped) { swiped = false; return; }
      if (e.target.closest && e.target.closest('a, button')) return;
      const r = stage.getBoundingClientRect();
      step(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
    });

    window.addEventListener('hashchange', () => {
      const i = fromHash();
      if (i !== null && i !== cur) show(i, i > cur ? 1 : -1, true);
    });

    const fullBtn = $('#deckFull');
    const de = document.documentElement;
    const canFull = !!(de.requestFullscreen || de.webkitRequestFullscreen);
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
    const toggleFull = () => {
      try {
        if (!fsEl()) {
          const req = de.requestFullscreen || de.webkitRequestFullscreen;
          if (req) { const p = req.call(de); if (p && p.catch) p.catch(() => {}); }
        } else {
          const ex = document.exitFullscreen || document.webkitExitFullscreen;
          if (ex) { const p = ex.call(document); if (p && p.catch) p.catch(() => {}); }
        }
      } catch (e) { /* full screen not allowed here */ }
    };
    const updateFull = () => {
      const label = fsEl() ? 'Keluar dari layar penuh' : 'Layar penuh';
      $('#deckFullLabel').textContent = label;
      fullBtn.title = label + ' (F)';
    };
    if (!canFull) fullBtn.hidden = true;
    fullBtn.addEventListener('click', toggleFull);
    document.addEventListener('fullscreenchange', updateFull);
    document.addEventListener('webkitfullscreenchange', updateFull);

    pageKeys = (e, key, onControl) => {
      if (key === 'ArrowRight' || key === 'PageDown' || (key === ' ' && !onControl)) { e.preventDefault(); step(1); return; }
      if (key === 'ArrowLeft' || key === 'PageUp') { e.preventDefault(); step(-1); return; }
      if (key === 'Beranda') { e.preventDefault(); show(0, -1, false); return; }
      if (key === 'End') { e.preventDefault(); show(total - 1, 1, false); return; }
      if ((key === 'f' || key === 'F') && canFull) { e.preventDefault(); toggleFull(); }
    };

    const start = fromHash();
    show(start === null ? cur : start, 1, true);
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /* On every page: reading progress and back to top                     */
  /* ------------------------------------------------------------------ */
  function initReadingBar() {
    const bar = h('div', 'read-bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = h('span');
    bar.appendChild(fill);
    const toTop = h('button', 'to-top', 'Kembali ke atas');
    toTop.type = 'button';
    document.body.append(bar, toTop);
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      fill.style.transform = 'scaleX(' + pct + ')';
      toTop.classList.toggle('is-shown', window.scrollY > 600);
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener('resize', update);
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    update();
  }

  /* Home: one question a day, from the quiz bank. The answer is kept on this device. */
  function initQuestionOfDay() {
    const d = new Date();
    const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    const q = QUIZ[day % QUIZ.length];
    const opts = $('#qotdOptions');
    $('#qotdCat').textContent = 'Topik: ' + q.cat;
    $('#qotdQ').textContent = q.q;
    opts.textContent = '';
    q.options.forEach((text, i) => {
      const b = h('button', 'qotd-opt', text);
      b.type = 'button';
      b.dataset.index = String(i);
      b.addEventListener('click', () => {
        const prev = store.get('sdg4.qotd', null);
        if (prev && prev.day === day) return;
        store.set('sdg4.qotd', { day, chosen: i, correct: i === q.answer });
        Sound.play(i === q.answer ? 'correct' : 'wrong');
        paint();
      });
      opts.appendChild(b);
    });
    function paint() {
      const now = store.get('sdg4.qotd', null);
      const answered = now && now.day === day ? now : null;
      $$('.qotd-opt', opts).forEach((b) => {
        const i = Number(b.dataset.index);
        b.classList.toggle('is-correct', !!answered && i === q.answer);
        b.classList.toggle('is-wrong', !!answered && answered.chosen === i && i !== q.answer);
        b.setAttribute('aria-disabled', String(!!answered));
      });
      const fb = $('#qotdFeedback');
      fb.hidden = !answered;
      if (answered) fb.textContent = (answered.correct ? 'Benar. ' : 'Belum tepat. ') + q.explain + ' Sumber: ' + q.src + '.';
    }
    paint();
  }

  /* My progress: badges, a summary, and backup, restore or erase of saved data. */
  const getStats = () => store.get('sdg4.stats', {}) || {};
  const chapterTotal = (cat) => QUIZ.filter((q) => q.cat === cat).length;
  const BADGES = [
    { name: 'Kuis pertama', text: 'Selesaikan satu kuis.', earned: () => getStats().quizzes >= 1 },
    { name: 'Ronde sempurna', text: 'Jawab semua soal dengan benar dalam satu kuis.', earned: () => getStats().perfect >= 1 },
    { name: 'Sedang lancar', text: 'Capai rentetan lima jawaban benar.', earned: () => getStats().bestStreak >= 5 },
    { name: 'Melawan waktu', text: 'Raih poin di mode Tantangan.', earned: () => typeof (store.get('sdg4.quiz.bests', {}) || {}).challenge === 'number' },
    {
      name: 'Juara bab', text: 'Jawab semua soal dengan benar di setiap bab.',
      earned: () => {
        const bests = store.get('sdg4.quiz.bests', {}) || {};
        return CHAPTER_ORDER.every((cat) => bests['chapter:' + cat] === chapterTotal(cat));
      }
    },
    { name: 'Penyelesai kartu belajar', text: 'Balik semua 52 kartu belajar.', earned: () => fcSeen().length >= QUIZ.length },
    { name: 'Pembaca target', text: 'Buka kesepuluh target.', earned: () => (store.get('sdg4.seen.targets', []) || []).length >= TARGETS.length },
    { name: 'Pencatat', text: 'Tulis catatan di tiga target.', earned: () => Object.keys(store.get('sdg4.notes', {}) || {}).length >= 3 },
    { name: 'Pertanyaan hari ini', text: 'Jawab pertanyaan hari ini.', earned: () => !!store.get('sdg4.qotd', null) },
    { name: 'Satu jam fokus', text: 'Belajar selama 60 menit di pengatur waktu.', earned: () => getStats().focusMinutes >= 60 },
    { name: 'Jadikan milikmu', text: 'Buat janjimu sendiri di halaman Bertindak.', earned: () => { const p = store.get('sdg4.pledge', null); return !!(p && p.made); } },
    { name: 'Bersuaralah', text: 'Simpan skor ke papan peringkat.', earned: () => readBoard().length > 0 }
  ];

  function renderProgress() {
    const stats = getStats();
    const summary = [
      [stats.quizzes || 0, 'kuis selesai'],
      [stats.perfect || 0, 'ronde sempurna'],
      [stats.focusMinutes || 0, 'menit fokus'],
      [fcSeen().length + ' dari ' + QUIZ.length, 'kartu dibalik'],
      [(store.get('sdg4.seen.targets', []) || []).length + ' dari ' + TARGETS.length, 'target dibaca'],
      [Object.keys(store.get('sdg4.notes', {}) || {}).length, 'target dengan catatan']
    ];
    const sum = $('#progSummary');
    sum.textContent = '';
    summary.forEach(([num, label]) => {
      const d = h('div', 'prog-stat');
      d.append(h('b', null, String(num)), h('span', null, label));
      sum.appendChild(d);
    });
    const earned = BADGES.filter((b) => b.earned()).length;
    $('#badgeCount').textContent = earned + ' dari ' + BADGES.length + ' lencana diraih';
    const grid = $('#badgeGrid');
    grid.textContent = '';
    BADGES.forEach((b) => {
      const got = b.earned();
      const card = h('div', 'badge' + (got ? ' is-earned' : ''));
      card.append(h('span', 'badge-state', got ? 'Diraih' : 'Belum'), h('p', 'badge-name', b.name), h('p', 'badge-text', b.text));
      grid.appendChild(card);
    });
  }

  const DATA_PREFIX = 'sdg4.';
  const setDataMsg = (msg) => { $('#dataMsg').textContent = msg; };

  function savedKeys() {
    const keys = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.indexOf(DATA_PREFIX) === 0) keys.push(k);
      }
    } catch (e) { /* storage unavailable */ }
    return keys;
  }

  function exportData() {
    const data = {};
    savedKeys().forEach((k) => { data[k] = store.get(k, null); });
    const text = JSON.stringify({ app: 'sdg4-website', version: 1, exported: new Date().toISOString(), data }, null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a');
    a.href = url;
    a.download = 'sdg4-progress.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDataMsg('Datamu disimpan ke file bernama sdg4-progress.json.');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      const data = parsed && parsed.app === 'sdg4-website' && parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
      if (!data) {
        setDataMsg('File itu bukan file kemajuan SDG 4.');
        return;
      }
      const keys = Object.keys(data).filter((k) => k.indexOf(DATA_PREFIX) === 0);
      keys.forEach((k) => store.set(k, data[k]));
      renderProgress();
      setDataMsg('Diimpor ' + keys.length + ' item tersimpan. Halaman lain akan menampilkannya saat kamu membukanya.');
    };
    reader.readAsText(file);
  }

  let eraseTimer = 0;
  function eraseData() {
    const btn = $('#dataReset');
    if (!eraseTimer) {
      btn.textContent = 'Ketuk sekali lagi untuk menghapus semuanya';
      btn.classList.add('is-armed');
      eraseTimer = setTimeout(() => {
        eraseTimer = 0;
        btn.textContent = 'Hapus datamu di perangkat ini';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(eraseTimer);
    eraseTimer = 0;
    savedKeys().forEach((k) => {
      try { window.localStorage.removeItem(k); } catch (e) { /* storage unavailable */ }
    });
    btn.textContent = 'Hapus datamu di perangkat ini';
    btn.classList.remove('is-armed');
    renderProgress();
    setDataMsg('Semua data tersimpan di perangkat ini telah dihapus.');
  }

  /* Certificate: unlocks after three badges. Type a name, then print it or save it as a PDF. */
  const CERT_MIN_BADGES = 3;
  function initCertificate() {
    const input = $('#certName');
    if (!input) return;
    input.value = store.get('sdg4.quiz.name', '') || '';
    $('#certMake').addEventListener('click', () => {
      const name = input.value.trim();
      const earned = BADGES.filter((b) => b.earned()).length;
      const cert = $('#certificate');
      const actions = $('#certActions');
      cert.hidden = true;
      actions.hidden = true;
      if (earned < CERT_MIN_BADGES) {
        $('#certNote').textContent = fill('Raih minimal {0} lencana untuk membuka sertifikatmu. Kamu baru punya {1}.', CERT_MIN_BADGES, earned);
        return;
      }
      if (!name) {
        $('#certNote').textContent = 'Ketik namamu dulu.';
        return;
      }
      store.set('sdg4.quiz.name', name);
      const quizzes = getStats().quizzes || 0;
      $('#certNote').textContent = '';
      $('#certOut').textContent = name;
      $('#certBody').textContent = fill('telah belajar tentang Tujuan Pembangunan Berkelanjutan 4 PBB, Pendidikan Berkualitas, dan telah meraih {0} dari {1} lencana setelah {2} kuis.', earned, BADGES.length, quizzes);
      $('#certDate').textContent = new Date().toLocaleDateString(LOCALES.date || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      cert.hidden = false;
      actions.hidden = false;
      cert.scrollIntoView({ behavior: smooth, block: 'center' });
    });
    $('#certPrint').addEventListener('click', () => window.print());
  }

  function initProgress() {
    renderProgress();
    $('#dataExport').addEventListener('click', exportData);
    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });
    $('#dataReset').addEventListener('click', eraseData);
    initCertificate();
  }

  /* Search: pages, targets, facts and quiz questions, found as you type. Press / to open. */
  const SEARCH_PAGES = [
    { title: 'Fakta', href: 'facts.html', text: 'Grafik tentang siapa yang tidak bersekolah, siapa yang menyelesaikan sekolah, siapa yang belajar, dan siapa yang tertinggal' },
    { title: '10 target', href: 'targets.html', text: 'Setiap janji SDG 4 dengan bahasa sederhana, beserta angka terbaru' },
    { title: 'Jelajahi', href: 'explore.html', text: 'Ikuti 100 anak melalui sekolah, perjalanan 1948 hingga 2030, mesin fakta' },
    { title: 'Solusi', href: 'solutions.html', text: 'Apa yang sudah berhasil, dari makan siang sekolah hingga transfer tunai' },
    { title: 'Bertindak', href: 'action.html', text: 'Pilih tindakan dan buat janjimu sendiri' },
    { title: 'Kuis', href: 'quiz.html', text: 'Kuis, bab, kartu belajar, dan papan peringkat' },
    { title: 'Pengatur waktu', href: 'timer.html', text: 'Belajar dalam blok fokus dengan istirahat singkat' },
    { title: 'Tentang', href: 'about.html', text: 'Tentang proyek sekolah ini, glosarium, dan setiap sumber' },
    { title: 'Slide untuk kelas', href: 'slides.html', text: 'Slide layar penuh dengan angka-angka penting' },
    { title: 'Kemajuanku', href: 'progress.html', text: 'Lencana, ringkasan, dan ekspor, impor, atau hapus data tersimpan' },
    { title: 'Dapatkan aplikasinya', href: 'download.html', text: 'Unduh untuk Windows, Mac, dan Android, atau tambahkan situs ke Layar Utama' }
  ];
  let searchIndex = null;

  function buildSearchIndex() {
    const items = SEARCH_PAGES.map((p) => ({ kind: 'Halaman', title: p.title, text: p.text, href: p.href }));
    TARGETS.forEach((t) => items.push({ kind: 'Target ' + t.code, title: t.title, text: t.plain + ' ' + t.action, href: 'targets.html' }));
    FACTS.forEach((f) => items.push({ kind: 'Fakta', title: f.num, text: f.text, href: 'facts.html' }));
    QUIZ.forEach((q) => items.push({ kind: 'Soal kuis', title: q.q, text: q.explain, href: 'quiz.html' }));
    return items;
  }

  function runSearch(query) {
    const list = $('#searchResults');
    list.textContent = '';
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    $('#searchEmpty').hidden = true;
    if (!words.length) return;
    if (!searchIndex) searchIndex = buildSearchIndex();
    const hits = searchIndex.filter((it) => {
      const hay = (it.title + ' ' + it.text).toLowerCase();
      return words.every((w) => hay.indexOf(w) >= 0);
    }).slice(0, 12);
    hits.forEach((it) => {
      const link = h('a', 'sd-hit');
      link.href = it.href;
      const text = it.text.length > 150 ? it.text.slice(0, 147) + '…' : it.text;
      link.append(h('span', 'sd-kind', it.kind), h('span', 'sd-title2', it.title), h('span', 'sd-text', text));
      const li = h('li');
      li.appendChild(link);
      list.appendChild(li);
    });
    $('#searchEmpty').hidden = hits.length > 0;
  }

  function openSearch() {
    const dlg = $('#searchDlg');
    if (dlg.open) return;
    if (!searchIndex) searchIndex = buildSearchIndex();
    dlg.showModal();
    $('#searchInput').focus();
    Sound.play('tap');
  }

  function initSearch() {
    const dlg = $('#searchDlg');
    if (!dlg || !$('#searchBtn')) return;
    $('#searchBtn').addEventListener('click', openSearch);
    $('#searchClose').addEventListener('click', () => dlg.close());
    $('#searchInput').addEventListener('input', (e) => runSearch(e.target.value));
    dlg.addEventListener('click', (e) => {
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || dlg.open) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      e.preventDefault();
      openSearch();
    });
  }

  const MODULES = {
    home: initQuestionOfDay,
    progress: initProgress,
    facts: initFacts,
    targets: initTargets,
    explore: initExplore,
    solutions: initSolutions,
    action: initAction,
    quiz: initQuiz,
    timer: initTimer,
    about: initAbout,
    slides: initSlides
  };
  const siteNode = document.querySelector('.site[data-page]');
  const PAGE = siteNode ? siteNode.dataset.page : '';
  initChrome();
  initLang();
  if (PAGE !== 'slides') {
    initReadingBar();
    initSearch();
  }
  if (MODULES[PAGE]) MODULES[PAGE]();
})();
