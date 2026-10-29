/* Quality Education for All: one script for every page of the site. Plain JavaScript, no libraries, works offline. */
(() => {
  'use strict';

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
  const numberFmt = new Intl.NumberFormat('en-US');
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
    1: 'UN SDG Report 2026',
    2: 'UNESCO GEM Report 2026',
    3: 'UNESCO GEM Report 2026, Chapter 7',
    4: 'UNESCO Global Report on Teachers 2024',
    5: 'UNESCO, International Literacy Day 2026',
    6: 'UNESCO financing estimates, 2023 and 2026',
    7: 'UNESCO GEM Gender Report 2026',
    8: 'UN 2030 Agenda, A/RES/70/1'
  };

  // One red hue, three lightness steps: education levels are an ordered sequence.
  const LEVELS = [
    { key: 'primary', name: 'Primary', color: '#7A1526' },
    { key: 'lower', name: 'Lower secondary', color: '#B8344A' },
    { key: 'upper', name: 'Upper secondary', color: '#E58B98' }
  ];

  // Completion rate worldwide (%). 2000: UNESCO GEM Report 2026. 2015 and 2024: UN SDG Report 2026.
  const TREND = [
    { year: 2000, primary: 77, lower: 60, upper: 37 },
    { year: 2015, primary: 85, lower: 75, upper: 53 },
    { year: 2024, primary: 88, lower: 78, upper: 61 }
  ];

  // Completion rate by region, 2024 (%): UN SDG Report 2026. Low-income countries: GEM Report 2026, ch. 7.
  const REGIONS = [
    { name: 'World', primary: 88, lower: 78, upper: 61, world: true },
    { name: 'Europe and Northern America', primary: 100, lower: 98, upper: 89 },
    { name: 'Eastern and South-Eastern Asia', primary: 98, lower: 91, upper: 79 },
    { name: 'Latin America and the Caribbean', primary: 94, lower: 84, upper: 65 },
    { name: 'Northern Africa and Western Asia', primary: 90, lower: 69, upper: 61 },
    { name: 'Central and Southern Asia', primary: 89, lower: 83, upper: 59 },
    { name: 'Sub-Saharan Africa', primary: 68, lower: 47, upper: 28 },
    { name: 'Oceania*', label: 'Oceania (excluding Australia and New Zealand)', primary: 70, lower: 43, upper: 18 },
    { name: 'Low-income countries', primary: 60, lower: 37, upper: 20, income: true }
  ];
  const placeLabel = (r) => r.label || r.name;

  // Out of school by age group, 2024, millions: GEM Report 2026, ch. 7.
  const OOS = [
    { value: 79, name: 'primary-school age', color: '#7A1526' },
    { value: 64, name: 'lower-secondary age', color: '#B8344A' },
    { value: 130, name: 'upper-secondary age', color: '#E58B98' }
  ];

  // Completion of the poorest 20% for every 100 of the richest 20% (parity index x 100): UN SDG Report 2026.
  const PARITY = [
    { name: 'Primary', value: 91 },
    { name: 'Lower secondary', value: 68 },
    { name: 'Upper secondary', value: 34 }
  ];

  const TARGETS = [
    {
      code: '4.1', kind: 'outcome', short: 'Primary and secondary school for all',
      title: 'Free, quality primary and secondary school for every child',
      official: 'By 2030, ensure that all girls and boys complete free, equitable and quality primary and secondary education leading to relevant and effective learning outcomes',
      plain: 'Every child should be able to finish primary and secondary school for free, and actually learn along the way. Sitting in a classroom is only half of it: reading and maths skills are what count.',
      measured: 'Indicator 4.1.1 tracks how many children reach a minimum level in reading and maths in the early grades, at the end of primary and at the end of lower secondary. Indicator 4.1.2 tracks completion rates.',
      stats: [
        { value: '61%', text: 'of young people complete upper secondary school (2024), up from 53% in 2015.', src: 1 },
        { value: '58%', text: 'of students reach the minimum reading level by the end of primary, in the latest global estimate (2019).', src: 3 }
      ],
      action: 'Run a weekly reading or maths buddy session with a younger student, or start a peer tutoring club.'
    },
    {
      code: '4.2', kind: 'outcome', short: 'Early childhood and pre-primary',
      title: 'A strong start before primary school',
      official: 'By 2030, ensure that all girls and boys have access to quality early childhood development, care and pre-primary education so that they are ready for primary education',
      plain: 'The years before primary school shape how children learn for the rest of their lives. This target is about care, play and pre-primary classes that get every child ready for school.',
      measured: 'Indicator 4.2.1 tracks how many children aged 24 to 59 months are developmentally on track. Indicator 4.2.2 tracks participation in organised learning one year before primary school.',
      stats: [
        { value: '75%', text: 'of children take part in organised learning one year before primary, a share that has barely moved since 2015.', src: 3 },
        { value: '60%', text: 'have actually had at least one year of pre-primary, once children who start primary early are taken into account.', src: 3 }
      ],
      action: 'Volunteer to read with young children at a local early-learning centre, or collect picture books to donate.'
    },
    {
      code: '4.3', kind: 'outcome', short: 'Technical, vocational and university education',
      title: 'Affordable training and university for all',
      official: 'By 2030, ensure equal access for all women and men to affordable and quality technical, vocational and tertiary education, including university',
      plain: 'After school, everyone should be able to afford good training or university, whether they want to become a nurse, an electrician or an engineer.',
      measured: 'Indicator 4.3.1 tracks how many youth and adults took part in formal or non-formal education and training in the past 12 months.',
      stats: [
        { value: '44%', text: 'tertiary enrolment worldwide in 2024: under 15% in low-income countries and over 80% in high-income countries.', src: 3 },
        { value: '1 in 3', text: 'countries charge no tuition fees at public universities.', src: 2 }
      ],
      action: 'Explore vocational and university paths early, and share scholarship and course information with classmates.'
    },
    {
      code: '4.4', kind: 'outcome', short: 'Skills for work and life',
      title: 'Skills for decent jobs',
      official: 'By 2030, substantially increase the number of youth and adults who have relevant skills, including technical and vocational skills, for employment, decent jobs and entrepreneurship',
      plain: 'Education should prepare people for real work: digital skills, technical know-how and the confidence to start a business.',
      measured: 'Indicator 4.4.1 tracks how many youth and adults have information and communication technology (ICT) skills, from copying files to writing a computer program.',
      stats: [
        { value: '33%', text: 'of adults in the median reporting country can make an electronic presentation (2022 to 2024).', src: 3 },
        { value: '6%', text: 'have programming skills. Most countries that report this data are upper-middle or high income.', src: 3 }
      ],
      action: 'Pick one practical skill this term, such as coding, budgeting or public speaking, and teach it to someone else.'
    },
    {
      code: '4.5', kind: 'outcome', short: 'Equal access for everyone',
      title: 'No one left out of education',
      official: 'By 2030, eliminate gender disparities in education and ensure equal access to all levels of education and vocational training for the vulnerable, including persons with disabilities, indigenous peoples and children in vulnerable situations',
      plain: 'No child should miss out because of their gender, a disability, where they live or how much money their family has.',
      measured: 'Indicator 4.5.1 compares groups using parity indices, such as girls and boys, rural and urban, and poorest and richest, across the other SDG 4 indicators.',
      stats: [
        { value: '34', text: 'of the poorest young people complete upper secondary school for every 100 of the richest.', src: 1 },
        { value: 'Almost 5 in 6', text: 'countries have not reached gender parity in upper-secondary completion.', src: 1 }
      ],
      action: 'Make your class more inclusive: invite someone new into your group and ask for learning materials everyone can use.'
    },
    {
      code: '4.6', kind: 'outcome', short: 'Literacy and numeracy',
      title: 'Everyone able to read, write and count',
      official: 'By 2030, ensure that all youth and a substantial proportion of adults, both men and women, achieve literacy and numeracy',
      plain: 'Every young person, and as many adults as possible, should be able to read, write and use numbers confidently in daily life.',
      measured: 'Indicator 4.6.1 tracks the share of people in an age group who reach a fixed level of functional literacy and numeracy.',
      stats: [
        { value: '739M', text: 'youth and adults lacked basic literacy skills in 2024; about two-thirds of them are women.', src: 5 },
        { value: '93%', text: 'of young people worldwide can read and write, up from 87% in 2000.', src: 3 }
      ],
      action: 'Organise a book swap at school, or help a family member practise reading or everyday maths.'
    },
    {
      code: '4.7', kind: 'outcome', short: 'Sustainability, peace and global citizenship',
      title: 'Learning to build a fairer, greener world',
      official: 'By 2030, ensure that all learners acquire the knowledge and skills needed to promote sustainable development, including, among others, through education for sustainable development and sustainable lifestyles, human rights, gender equality, promotion of a culture of peace and non-violence, global citizenship and appreciation of cultural diversity and of culture’s contribution to sustainable development',
      plain: 'School should help us understand climate change, human rights, gender equality and other cultures, and give us the skills to act on them.',
      measured: 'Indicator 4.7.1 tracks how far global citizenship and sustainable development are built into education policies, curricula, teacher training and student assessment. Since 2025 it also checks curricula directly for the environment, climate change and biodiversity.',
      stats: [
        { value: '50 of 110', text: 'countries studied did not mention climate change in their grade 6 science and social science syllabi (2024).', src: 3 },
        { value: '78 of 110', text: 'did not mention it in their grade 3 syllabi.', src: 3 }
      ],
      action: 'Start or join an eco or global issues club, and bring climate topics into your class projects.'
    },
    {
      code: '4.a', kind: 'means', short: 'Safe, inclusive schools',
      title: 'Schools that are safe and open to all',
      official: 'Build and upgrade education facilities that are child, disability and gender sensitive and provide safe, non-violent, inclusive and effective learning environments for all',
      plain: 'Schools need the basics, like electricity, clean water, toilets, ramps and internet, and they must be free from violence and bullying.',
      measured: 'Indicator 4.a.1 tracks the share of schools with basic services: electricity, internet and computers for teaching, facilities adapted for students with disabilities, drinking water, single-sex toilets and handwashing.',
      stats: [
        { value: 'Over 1 in 5', text: 'primary schools worldwide lack electricity, safe drinking water or basic sanitation.', src: 1 },
        { value: '466M', text: 'children received school meals in 2024, 20% more than in 2020.', src: 3 }
      ],
      action: 'Speak up about broken or unsafe facilities, and stand with classmates who are being bullied.'
    },
    {
      code: '4.b', kind: 'means', short: 'Scholarships for developing countries',
      title: 'More scholarships for students from developing countries',
      official: 'By 2020, substantially expand globally the number of scholarships available to developing countries, in particular least developed countries, small island developing States and African countries, for enrolment in higher education, including vocational training and information and communications technology, technical, engineering and scientific programmes, in developed countries and other developing countries',
      plain: 'Countries promised more scholarships so that students from the poorest countries could study at university, especially science and technology. It is the only SDG 4 target with a 2020 deadline.',
      measured: 'Indicator 4.b.1 tracks the amount of official development assistance (aid) spent on scholarships.',
      stats: [
        { value: '$1.7B', text: 'in aid went to scholarships in the education sector in 2024, a fall after funding had recovered in 2023.', src: 3 },
        { value: '2.8%', text: 'of university students worldwide studied in another country in 2023.', src: 3 }
      ],
      action: 'Collect the scholarship opportunities you find and share them on a class notice board.'
    },
    {
      code: '4.c', kind: 'means', short: 'Qualified teachers',
      title: 'Enough well-trained teachers',
      official: 'By 2030, substantially increase the supply of qualified teachers, including through international cooperation for teacher training in developing countries, especially least developed countries and small island developing States',
      plain: 'There is no education without teachers. The world needs millions more who are trained, supported and fairly paid, above all in the poorest countries.',
      measured: 'Indicator 4.c.1 tracks the share of teachers who have the minimum qualifications their country requires.',
      stats: [
        { value: '44M', text: 'more teachers are needed by 2030 for universal primary and secondary education, 15 million of them in sub-Saharan Africa.', src: 4 },
        { value: '1 in 5', text: 'teachers worldwide do not meet their country’s minimum qualification standards (2024).', src: 1 }
      ],
      action: 'Thank a teacher this week, and think about whether teaching could be your career one day.'
    }
  ];

  const QUIZ = [
    // The goal
    { cat: 'The goal', q: 'By what year are the Sustainable Development Goals, including SDG 4, meant to be achieved?', options: ['2025', '2030', '2040', '2050'], answer: 1, explain: 'All UN member states adopted the 2030 Agenda in 2015. It gives the world until 2030 to reach the 17 goals.', src: 'UN 2030 Agenda (2015)' },
    { cat: 'The goal', q: 'How many Sustainable Development Goals are there?', options: ['6', '8', '12', '17'], answer: 3, explain: 'There are 17 goals, and education is number 4. The earlier Millennium Development Goals had 8.', src: 'UN 2030 Agenda (2015)' },
    { cat: 'The goal', q: 'How many targets does SDG 4 have?', options: ['10', '12', '15', '17'], answer: 0, explain: 'Ten: seven outcome targets (4.1 to 4.7) and three means of implementation (4.a, 4.b and 4.c).', src: 'UN 2030 Agenda (2015)' },
    { cat: 'The goal', mix: true, q: 'Complete the goal: “Ensure inclusive and equitable quality education and promote … for all.”', options: ['free university places', 'lifelong learning opportunities', 'digital devices', 'school meals'], answer: 1, explain: 'The full goal reads: ensure inclusive and equitable quality education and promote lifelong learning opportunities for all.', src: 'UN 2030 Agenda (2015)' },
    { cat: 'The goal', q: 'Which target is about early childhood development and pre-primary education?', options: ['Target 4.1', 'Target 4.2', 'Target 4.5', 'Target 4.c'], answer: 1, explain: 'Target 4.2 aims to give every child quality early childhood care and pre-primary education, so they are ready for primary school.', src: 'UN 2030 Agenda (2015)' },
    { cat: 'The goal', q: 'Which SDG 4 target had a deadline of 2020 instead of 2030?', options: ['4.1, free primary and secondary school', '4.6, literacy and numeracy', '4.b, scholarships', '4.c, qualified teachers'], answer: 2, explain: 'Target 4.b set out to expand scholarships for students from developing countries by 2020.', src: 'UN 2030 Agenda (2015)' },
    { cat: 'The goal', mix: true, q: 'Target 4.c is about…', options: ['free university for everyone', 'more qualified teachers', 'school meals', 'internet in every classroom'], answer: 1, explain: 'Target 4.c aims to substantially increase the supply of qualified teachers, including through teacher training in developing countries.', src: 'UN 2030 Agenda (2015)' },
    { cat: 'The goal', q: 'Which target covers learning about sustainable development, human rights, peace and global citizenship?', options: ['Target 4.1', 'Target 4.3', 'Target 4.5', 'Target 4.7'], answer: 3, explain: 'Target 4.7 is about the knowledge and skills needed to promote sustainable development, human rights, gender equality, peace and global citizenship.', src: 'UN 2030 Agenda (2015)' },
    // Access
    { cat: 'Access', q: 'About how many children and young people were out of school worldwide in 2024?', options: ['73 million', '123 million', '173 million', '273 million'], answer: 3, explain: '273 million, or one in six, and the number has risen for seven years in a row.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Access', q: 'Which age group has the most young people out of school?', options: ['Primary-school age', 'Lower-secondary age', 'Upper-secondary age', 'All three are about equal'], answer: 2, explain: '130 million of the 273 million are of upper-secondary age, compared with 79 million of primary age and 64 million of lower-secondary age.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Access', q: 'By 2024, the number of children out of school had risen how many years in a row?', options: ['2', '4', '7', '12'], answer: 2, explain: 'Seven years in a row, driven by population growth, crises and shrinking budgets.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Access', q: 'In low-income countries, roughly what share of school-age children and youth are out of school?', options: ['3%', '16%', '36%', '66%'], answer: 2, explain: 'About 36%, compared with 3% in high-income countries.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Access', mix: true, q: 'Which two regions together are home to three quarters of the world’s out-of-school children and youth?', options: ['Europe and Latin America', 'Sub-Saharan Africa and Central and Southern Asia', 'Eastern Asia and Oceania', 'Northern America and Western Asia'], answer: 1, explain: 'Sub-Saharan Africa and Central and Southern Asia together account for three quarters of the global total.', src: 'UN SDG Report 2026' },
    { cat: 'Access', q: 'How many students were enrolled in school worldwide in 2024?', options: ['500 million', '800 million', '1.1 billion', '1.4 billion'], answer: 3, explain: '1.4 billion, which is 327 million more in primary and secondary education than in 2000.', src: 'UNESCO GEM Report 2026' },
    // Completion
    { cat: 'Completion', q: 'In sub-Saharan Africa, what share of young people complete upper secondary school?', options: ['28%', '48%', '61%', '78%'], answer: 0, explain: 'In 2024, 28% completed upper secondary school in sub-Saharan Africa, compared with 61% worldwide.', src: 'UN SDG Report 2026' },
    { cat: 'Completion', q: 'Worldwide, what share of young people completed upper secondary school in 2024?', options: ['37%', '61%', '78%', '88%'], answer: 1, explain: '61%, up from 53% in 2015 and 37% in 2000. For lower secondary it is 78%, and for primary 88%.', src: 'UN SDG Report 2026; UNESCO GEM Report 2026' },
    { cat: 'Completion', q: 'At today’s pace, roughly when would 95% of young people worldwide complete upper secondary school?', options: ['2030', '2050', '2075', '2105'], answer: 3, explain: 'UNESCO estimates it would take until 2105 at the current rate of progress, about one percentage point a year since 2000.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Completion', mix: true, q: 'Which region has the highest upper-secondary completion rate?', options: ['Europe and Northern America', 'Eastern and South-Eastern Asia', 'Latin America and the Caribbean', 'Sub-Saharan Africa'], answer: 0, explain: 'Europe and Northern America, at 89% in 2024. Eastern and South-Eastern Asia comes next at 79%.', src: 'UN SDG Report 2026' },
    // Learning
    { cat: 'Learning', q: 'In the latest global estimate (2019), what share of students reached the minimum reading level by the end of primary school?', options: ['58%', '68%', '78%', '88%'], answer: 0, explain: '58% in reading and 44% in maths. The estimate has not been updated since the pandemic.', src: 'UN SDG Report 2026' },
    { cat: 'Learning', mix: true, q: 'In 57 mostly middle- and high-income countries, what happened to reading skills between 2012 and 2022?', options: ['They improved a lot', 'They stayed about the same', 'They fell, from 59% to 47% of students at the minimum level', 'They doubled'], answer: 2, explain: 'Reading fell from 59% to 47%, and maths from 41% to 36%, so the learning crisis goes beyond the pandemic.', src: 'UN SDG Report 2026' },
    { cat: 'Learning', q: 'What share of young people worldwide could read and write in 2024?', options: ['63%', '73%', '83%', '93%'], answer: 3, explain: '93%, up from 87% in 2000. Even so, about one in four young people in low-income countries could not read and write.', src: 'UNESCO GEM Report 2026' },
    // Teachers
    { cat: 'Teachers', q: 'How many additional teachers does the world need by 2030 to achieve universal primary and secondary education?', options: ['24 million', '44 million', '64 million', '84 million'], answer: 1, explain: '44 million. One in three of them, 15 million, are needed in sub-Saharan Africa.', src: 'UNESCO Global Report on Teachers (2024)' },
    { cat: 'Teachers', q: 'Roughly how many teachers worldwide do not meet their country’s minimum qualification standards?', options: ['1 in 50', '1 in 20', '1 in 5', '1 in 2'], answer: 2, explain: 'About one in five, or 20% of teachers (2024). Target 4.c aims to change that by 2030.', src: 'UN SDG Report 2026' },
    { cat: 'Teachers', mix: true, q: 'Which region needs the most additional teachers by 2030?', options: ['Europe', 'Sub-Saharan Africa', 'Northern America', 'Oceania'], answer: 1, explain: 'Sub-Saharan Africa needs 15 million, one in three of all the extra teachers needed worldwide.', src: 'UNESCO Global Report on Teachers (2024)' },
    { cat: 'Teachers', q: 'What share of low-income countries require primary teachers to have a bachelor’s degree?', options: ['11%', '41%', '71%', '91%'], answer: 0, explain: 'Only 11%, compared with 79% of high-income countries.', src: 'UNESCO GEM Report 2026' },
    // Equity
    { cat: 'Equity', q: 'Of the 739 million youth and adults who lack basic literacy skills, roughly what share are women?', options: ['About a third', 'About two-thirds', 'About three-quarters', 'Almost all'], answer: 1, explain: 'About two-thirds are women, which is why literacy is closely linked to gender equality.', src: 'UNESCO, International Literacy Day 2026' },
    { cat: 'Equity', q: 'Worldwide, how many of the poorest young people complete upper secondary school for every 100 of the richest?', options: ['14', '34', '64', '94'], answer: 1, explain: 'Only 34. At primary level it is 91, so the gap widens as children get older.', src: 'UN SDG Report 2026' },
    { cat: 'Equity', q: 'Between 2000 and 2025, the share of girls married before age 18 fell from 25% to…', options: ['8%', '12%', '15%', '18%'], answer: 3, explain: '18% in 2025. Early marriage and pregnancy are still major reasons girls leave school.', src: 'UNESCO GEM Gender Report 2026' },
    { cat: 'Equity', q: 'In sub-Saharan Africa, what share of pregnant and parenting girls return to school?', options: ['Under 5%', 'About 25%', 'About 50%', 'Over 75%'], answer: 0, explain: 'Fewer than 5% return, even though more countries now protect their right to keep studying.', src: 'UNESCO GEM Gender Report 2026' },
    // Money and schools
    { cat: 'Money and schools', q: 'How big is the yearly education funding gap in low- and lower-middle-income countries?', options: ['$9.7 billion', '$97 billion', '$970 billion', '$9.7 trillion'], answer: 1, explain: 'About $97 billion a year, with $70 billion of it in sub-Saharan Africa.', src: 'UNESCO (2023, repeated in 2026)' },
    { cat: 'Money and schools', q: 'How many countries spend more on debt repayments than on education?', options: ['13', '53', '113', '193'], answer: 2, explain: '113 countries, home to 6.1 billion people.', src: 'UNESCO, July 2026' },
    { cat: 'Money and schools', q: 'In 2024, education got 7.5% of development aid. That was its lowest share in…', options: ['2 years', '5 years', '10 years', 'two decades'], answer: 3, explain: 'Two decades. Aid to education fell 8% between 2023 and 2024, and aid to basic education fell 16%.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Money and schools', q: 'How many children received school meals in 2024?', options: ['46 million', '166 million', '466 million', '1.4 billion'], answer: 2, explain: '466 million, 20% more than in 2020.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Money and schools', q: 'Roughly how many primary schools worldwide lack basic services such as electricity, safe drinking water or sanitation?', options: ['Fewer than 1 in 20', 'About 1 in 10', 'More than 1 in 5', 'About 1 in 2'], answer: 2, explain: 'More than one in five. In the least developed countries, more than half of schools have no electricity.', src: 'UN SDG Report 2026' },
    // Skills
    { cat: 'Skills', q: 'In the median reporting country, what share of adults can write a computer program?', options: ['6%', '26%', '46%', '66%'], answer: 0, explain: 'Just 6%. About a third can make an electronic presentation, and most countries that report this data are upper-middle or high income.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Skills', q: 'Climate change was missing from the grade 6 science and social science syllabi of how many of the 110 countries studied?', options: ['50', '70', '90', '105'], answer: 0, explain: '50 of 110 countries. In grade 3 it was missing in 78.', src: 'UNESCO GEM Report 2026' },
    { cat: 'Skills', q: 'Tertiary education includes university. What was the worldwide tertiary enrolment rate in 2024?', options: ['14%', '24%', '34%', '44%'], answer: 3, explain: '44%, ranging from under 15% in low-income countries to over 80% in high-income countries.', src: 'UNESCO GEM Report 2026' },
    // History
    { cat: 'History', mix: true, q: 'Which document, adopted in 1948, declared that “everyone has the right to education”?', options: ['The Universal Declaration of Human Rights', 'The Paris Agreement', 'The Geneva Conventions', 'The Olympic Charter'], answer: 0, explain: 'Article 26 of the Universal Declaration of Human Rights says everyone has the right to education, and that elementary education shall be free and compulsory.', src: 'UN General Assembly (1948)' },
    { cat: 'History', mix: true, q: 'Where was the 1990 World Conference on Education for All held?', options: ['Jomtien, Thailand', 'Dakar, Senegal', 'Incheon, Republic of Korea', 'New York, United States'], answer: 0, explain: 'In Jomtien, Thailand, where countries set the goal of universal access to primary education.', src: 'UNESCO' },
    { cat: 'History', q: 'Which Millennium Development Goal aimed for every child to complete primary school by 2015?', options: ['MDG 1', 'MDG 2', 'MDG 4', 'MDG 8'], answer: 1, explain: 'MDG 2 aimed for universal primary education by 2015. SDG 4 raised the bar to secondary school by 2030.', src: 'UN Millennium Development Goals (2000)' }
  ];

  const MILESTONES = [
    { year: '1948', short: 'Right to education', title: 'Education becomes a human right', text: 'The Universal Declaration of Human Rights says that everyone has the right to education, and that elementary education shall be free and compulsory (Article 26).', src: 'UN General Assembly, 1948' },
    { year: '1989', short: 'Rights of the Child', title: 'A promise made to every child', text: 'The Convention on the Rights of the Child commits countries to make primary education compulsory and free for all. It is the most widely ratified human rights treaty in history.', src: 'UN Convention on the Rights of the Child, 1989' },
    { year: '1990', short: 'Education for All', title: 'Education for All', text: 'At the World Conference on Education for All in Jomtien, Thailand, countries set the goal of universal access to primary education.', src: 'UNESCO GEM Report 2026' },
    { year: '2000', short: 'Dakar and the MDGs', title: 'Every child should finish primary school', text: 'At the World Education Forum in Dakar, Senegal, and in the Millennium Development Goals, the world aimed for every child to complete primary school by 2015 (MDG 2). It fell short.', src: 'UNESCO; UN Millennium Development Goals' },
    { year: '2015', short: 'SDG 4 agreed', title: 'SDG 4 raises the bar', text: 'In May, the Incheon Declaration set out the vision for Education 2030. In September, all UN member states adopted the 17 SDGs, aiming for every young person to complete secondary school.', src: 'UN 2030 Agenda; UNESCO' },
    { year: '2016', short: 'The clock starts', title: 'The countdown begins', text: 'The SDGs officially took effect on 1 January 2016, starting a 15-year countdown to 2030.', src: 'United Nations' },
    { year: '2022', short: 'Education summit', title: 'Transforming Education Summit', text: 'The UN Secretary-General brought world leaders together in New York to put education back at the top of the global agenda after the COVID-19 pandemic disrupted schooling for most of the world’s students.', src: 'United Nations' },
    { year: '2026', short: 'Today', now: true, title: 'Where we are now', text: null, src: 'UNESCO GEM Report 2026; UN SDG Report 2026' },
    { year: '2030', short: 'Deadline', title: 'The deadline', text: 'The target date for every SDG 4 promise, from free primary and secondary school for all to enough qualified teachers.', src: 'UN 2030 Agenda' }
  ];

  const FACTS = [
    { num: 'Every 2 seconds', text: 'One more child needs to enter school every two seconds just for the world to stay on track for 2030.', src: 'UNESCO GEM Report 2026' },
    { num: '25 a minute', text: 'Since 2000, more than 25 extra children have entered school every minute, adding 327 million students in primary and secondary education.', src: 'UNESCO GEM Report 2026' },
    { num: '18% to 84%', text: 'Ethiopia raised its primary enrolment rate from 18% in 1974 to 84% in 2024.', src: 'UNESCO GEM Report 2026' },
    { num: '7% to 60%+', text: 'China expanded access to university and other tertiary education from 7% in 1999 to over 60% in 2024.', src: 'UNESCO GEM Report 2026' },
    { num: '33 points', text: 'Nepal closed a 33-percentage-point gap between girls and boys in lower-secondary completion between 1990 and 2024.', src: 'UNESCO GEM Gender Report 2026' },
    { num: '22 behind, 11 ahead', text: 'In Cambodia, girls went from 22 points behind boys in primary completion in 1981 to 11 points ahead in 2024.', src: 'UNESCO GEM Gender Report 2026' },
    { num: '1 extra year', text: 'In Cambodia, electrification alone has been linked to nearly a full extra year of schooling.', src: 'UNESCO GEM Report 2026' },
    { num: 'Half a year', text: 'School feeding programmes have been shown to add up to half a year of learning for every US$100 spent.', src: 'UNESCO GEM Report 2026' },
    { num: '36% more likely', text: 'Children whose families get cash transfers tied to school attendance are 36% more likely to be enrolled.', src: 'UNESCO GEM Report 2026' },
    { num: '1+ year', text: 'In 14 African countries, making education compulsory, and not just free, added over a year of schooling.', src: 'UNESCO GEM Report 2026' },
    { num: '8% to 26%', text: 'The share of countries with 12 years of compulsory education has more than tripled, from 8% to 26%.', src: 'UNESCO GEM Report 2026' },
    { num: '466 million', text: '466 million children received school meals in 2024, 20% more than in 2020.', src: 'UNESCO GEM Report 2026' },
    { num: '113 countries', text: '113 countries, home to 6.1 billion people, spend more on debt repayments than on education.', src: 'UNESCO, July 2026' },
    { num: '22%', text: 'Only 41 of 183 countries with data (22%) meet both spending benchmarks for education: at least 4% of GDP and at least 15% of public spending.', src: 'UNESCO GEM Report 2026' },
    { num: '70 of 83', text: 'In 70 of 83 countries with data, more than half of lower-secondary students said they had been bullied.', src: 'UNESCO GEM Report 2026' },
    { num: '3,909 attacks', text: 'In 2024, 3,909 attacks on education were recorded in 69 countries, the most since the Global Coalition to Protect Education from Attack began reporting in 2013.', src: 'UNESCO GEM Report 2026' },
    { num: '1 in 4', text: 'About one in four young people in low-income countries could not read and write in 2024.', src: 'UNESCO GEM Report 2026' },
    { num: '143M to 86M', text: 'The number of young people who cannot read and write fell from 143 million in 2000 to 86 million in 2024.', src: 'UNESCO GEM Report 2026' },
    { num: '11% vs 79%', text: 'Only 11% of low-income countries require primary teachers to have a bachelor’s degree, compared with 79% of high-income countries.', src: 'UNESCO GEM Report 2026' },
    { num: 'Under 5%', text: 'Fewer than 5% of pregnant and parenting girls in sub-Saharan Africa return to school.', src: 'UNESCO GEM Gender Report 2026' },
    { num: 'Halved', text: 'Côte d’Ivoire has halved its out-of-school rates for children, adolescents and youth since 2000.', src: 'UNESCO GEM Report 2026' },
    { num: '2.4 million', text: 'About 2.4 million girls in Afghanistan are barred from secondary school. UNESCO warns the number could approach 4 million by 2030.', src: 'UNESCO, August 2026' }
  ];

  const TIPS = [
    'Put your phone in another room. Even a silent phone on the desk pulls at your attention.',
    'Test yourself instead of rereading. Close the book and write down everything you remember.',
    'Space it out. Short sessions spread over several days beat one long cram the night before.',
    'Write one clear goal for this session before you press start.',
    'Explain it out loud. If you can teach it simply, you understand it.',
    'Start with the hardest task while your focus is fresh.',
    'Use your break to move: stand up, stretch, drink water and look into the distance.',
    'Mix related topics. Switching between types of problems helps you learn when to use each method.'
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
      v.append(sw, document.createTextNode(String(d.value)), h('small', null, 'million'));
      lab.append(v, h('span', 'sl-name', d.name));
      labels.appendChild(lab);

      const seg = h('div', 'stack-seg');
      seg.style.flex = d.value + ' 1 0';
      seg.style.background = d.color;
      seg.addEventListener('pointermove', (e) => tip.show('Out of school, 2024', [{ color: d.color, value: d.value + ' million', label: d.name }], e.clientX, e.clientY));
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
    sv('text', { x: x(2015) + 8, y: y(5), class: 'annot-text' }, svg).textContent = 'SDGs adopted';

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
        d.year === 2015 ? '2015, when the SDGs were adopted' : String(d.year),
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
      row.setAttribute('aria-label', placeLabel(r) + ': primary ' + r.primary + '%, lower secondary ' + r.lower + '%, upper secondary ' + r.upper + '%');
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

    buildTable($('#regionTable'), ['Region', 'Primary', 'Lower secondary', 'Upper secondary'],
      REGIONS.map((r) => [r.name, r.primary + '%', r.lower + '%', r.upper + '%']), 'Completion rate by region, 2024');
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
      row.setAttribute('aria-label', p.name + ': ' + p.value + ' of the poorest complete for every 100 of the richest');
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
    buildTable($('#parityTable'), ['Level', 'Poorest per 100 richest'], PARITY.map((p) => [p.name, String(p.value)]),
      'Completion among the poorest 20% for every 100 of the richest 20%');
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
    { key: null, text: 'children start out together' },
    { key: 'primary', text: 'finish primary school' },
    { key: 'lower', text: 'finish lower secondary school' },
    { key: 'upper', text: 'finish upper secondary school' }
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
      parts.push(placeLabel(r) + ': ' + n + ' of 100 ' + st.text);
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
    $('#journeyPlay').textContent = finished ? 'Play it again' : 'Play the journey';
  }

  function playJourney() {
    stopJourney();
    setStage(0, true);
    Sound.play('start');
    $('#journeyPlay').textContent = 'Stop';
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
      const want = idx === 0 ? 'Sub-Saharan Africa' : 'Europe and Northern America';
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
    return '273 million children and young people are out of school, a number that has risen seven years in a row, and aid to education is falling. About ' + years + ' year' + (years === 1 ? '' : 's') + ' remain until the deadline.';
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
      if (m.now) b.appendChild(h('span', 'tl-now', 'You are here'));
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
    right.append(h('h3', 'tl-card-title', m.title), h('p', 'tl-card-text', milestoneText(m)), h('p', 'tl-card-src', 'Source: ' + m.src));
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
    nav.append(mk('Earlier', -1), mk('Later', 1), h('span', 'tl-count', (tlIndex + 1) + ' of ' + MILESTONES.length));
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
    card.querySelector('.fc-src').textContent = 'Source: ' + f.src;
    $('#factCount').textContent = 'Fact ' + (factPos + 1) + ' of ' + FACTS.length;
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
    [['outcome', 'Outcome targets: what the world should achieve'], ['means', 'Means of implementation: how to get there']].forEach((g) => {
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
    $('#targetStatus').textContent = 'Showing target ' + t.code + ': ' + t.title;
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
    titles.append(h('p', 'td-kind', t.kind === 'outcome' ? 'Outcome target' : 'Means of implementation'), h('h2', 'td-title', t.title));
    head.append(h('p', 'td-code', t.code), titles);

    const official = h('blockquote', 'td-official');
    official.append(h('p', null, '“' + t.official + '”'), h('footer', null, 'Official UN wording of target ' + t.code));

    const grid = h('div', 'td-grid');
    const plain = h('section');
    plain.append(h('h3', 'td-h', 'In plain words'), h('p', 'td-p', t.plain));
    const measured = h('section');
    measured.append(h('h3', 'td-h', 'How it is measured'), h('p', 'td-p', t.measured));
    grid.append(plain, measured);

    const stats = h('section', 'td-section');
    stats.appendChild(h('h3', 'td-h', 'Where the world stands'));
    const statRow = h('div', 'td-stats');
    t.stats.forEach((s) => {
      const d = h('div');
      d.append(h('p', 'td-stat-num', s.value), h('p', 'td-stat-text', s.text), h('p', 'td-stat-src', 'Source: ' + SOURCE_NAMES[s.src]));
      statRow.appendChild(d);
    });
    stats.appendChild(statRow);

    const act = h('section', 'td-section');
    act.append(h('h3', 'td-h', 'What you can do'), h('p', 'td-p', t.action));

    const notes = h('section', 'td-section td-notes');
    const noteId = 'note-' + t.code.replace('.', '-');
    const noteLabel = h('label', 'td-h', 'Your notes on target ' + t.code);
    noteLabel.htmlFor = noteId;
    const area = h('textarea', 'td-note');
    area.id = noteId;
    area.rows = 4;
    area.maxLength = 1000;
    area.placeholder = 'What surprised you? What could your school or town do about it?';
    const savedNotes = store.get('sdg4.notes', {}) || {};
    area.value = typeof savedNotes[t.code] === 'string' ? savedNotes[t.code] : '';
    const noteStatus = h('p', 'td-note-status', area.value ? 'Saved on this device.' : 'Only you can see these notes. They stay on this device.');
    area.addEventListener('input', () => {
      const all = store.get('sdg4.notes', {}) || {};
      if (area.value.trim()) all[t.code] = area.value;
      else delete all[t.code];
      store.set('sdg4.notes', all);
      noteStatus.textContent = 'Saved on this device.';
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
    nav.append(makeBtn('Previous target', -1), h('span', 'td-count', (vis.indexOf(targetIndex) + 1) + ' of ' + vis.length), makeBtn('Next target', 1));

    body.append(head, official, grid, stats, act, notes, nav);
    host.appendChild(body);
  }

  /* ------------------------------------------------------------------ */
  /* Quiz                                                                */
  /* ------------------------------------------------------------------ */
  const MODES = {
    classic: { name: 'Classic', tag: 'Relaxed', count: 10, timed: false, lifeline: false, desc: '10 random questions with no clock. Take your time and read every explanation.' },
    challenge: { name: 'Challenge', tag: 'Against the clock', count: 15, timed: true, seconds: 20, lifeline: true, desc: '15 questions, 20 seconds each. Fast answers and streaks earn bonus points, and you get one 50:50.' },
    marathon: { name: 'Marathon', tag: 'The whole bank', count: Infinity, timed: false, lifeline: false, desc: null }
  };
  const CHAPTER_MODE = { name: 'Chapter', tag: 'Chapter', count: Infinity, timed: false, lifeline: false, desc: null };
  const modeInfo = (key) => (key === 'chapter' ? CHAPTER_MODE : MODES[key]);
  const CHAPTER_ORDER = ['The goal', 'Access', 'Completion', 'Learning', 'Skills', 'Equity', 'Teachers', 'Money and schools', 'History'];
  const BOARD_KEY = 'sdg4.quiz.board';
  const BOARD_TABS = [
    { key: 'challenge', label: 'Challenge' },
    { key: 'classic', label: 'Classic' },
    { key: 'marathon', label: 'Marathon' },
    { key: 'chapters', label: 'Chapters' }
  ];
  let boardGroup = 'challenge';
  let lastSavedAt = 0;
  const TIERS = [
    { title: 'Perfect score', text: 'You know SDG 4 inside out. Ready to teach the class?' },
    { title: 'Excellent work', text: 'You know the goal, its targets and the numbers behind them.' },
    { title: 'Good work', text: 'A solid grasp of SDG 4. The Explore and Targets sections can fill in the gaps.' },
    { title: 'Getting there', text: 'Have a look at the dashboard and the targets, then try again.' },
    { title: 'Keep learning', text: 'Explore the dashboard and the ten targets, then give it another go.' }
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
      const desc = M.desc || 'All ' + QUIZ.length + ' questions in one go. How long can your streak last?';
      const best = bests[key];
      const bestText = typeof best === 'number' ? (M.timed ? 'Best: ' + numberFmt.format(best) + ' points' : 'Best: ' + best + ' of ' + count) : 'No score yet';
      const b = h('button', 'mode-card' + (key === 'challenge' ? ' is-featured' : ''));
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', 'Play'));
      b.append(h('span', 'mc-tag', M.tag), h('span', 'mc-name', M.name), h('span', 'mc-desc', desc), foot);
      b.addEventListener('click', () => startQuiz(key));
      grid.appendChild(b);
    });
    $('#bankSize').textContent = String(QUIZ.length);
    renderChapters();
    renderBoard();
  }

  const scoreText = () => (modeInfo(quiz.mode).timed ? numberFmt.format(quiz.points) + ' points' : 'Score ' + quiz.correct);

  function renderStreak(bump) {
    const b = $('#streakBadge');
    if (quiz.streak >= 2) {
      const mult = modeInfo(quiz.mode).timed ? (quiz.streak >= 5 ? ' ×2' : quiz.streak >= 3 ? ' ×1.5' : '') : '';
      b.hidden = false;
      b.textContent = 'Streak ' + quiz.streak + mult;
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
    ll.textContent = 'Use 50:50';
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
    $('#qpText').textContent = 'Question ' + (quiz.i + 1) + ' of ' + total;
    $('#qpScore').textContent = scoreText();
    $('#qpFill').style.width = (quiz.i / total) * 100 + '%';
    $('#qCat').textContent = q.cat;
    renderStreak(false);
    if (modeInfo(quiz.mode).lifeline) $('#lifelineBtn').disabled = quiz.lifelineUsed;
    $('#quizQ').textContent = q.q;
    // quiz.view[j] is the original option shown in position j. Options with a natural order stay in it.
    const natural = q.options.map((o, i) => i);
    quiz.view = q.mix ? shuffle(natural) : natural;
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
    ll.textContent = '50:50 used';
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
    if (correct) verdict = M.timed ? 'Correct! +' + gained + ' points' + (mult > 1 ? ' with a ×' + mult + ' streak bonus' : '') : 'Correct!';
    else if (timedOut) verdict = 'Time’s up. The answer is ' + q.options[q.answer] + '.';
    else verdict = 'Not quite. The answer is ' + q.options[q.answer] + '.';

    const fb = $('#quizFeedback');
    fb.textContent = '';
    fb.append(h('p', 'fb-verdict', verdict), h('p', 'fb-text', q.explain), h('p', 'fb-src', 'Source: ' + q.src));
    fb.hidden = false;
    $('#qpScore').textContent = scoreText();
    if (gained) popPoints('+' + gained);
    renderStreak(correct);
    $('#qpFill').style.width = ((quiz.i + 1) / quiz.order.length) * 100 + '%';
    if (M.lifeline) $('#lifelineBtn').disabled = true;
    const next = $('#quizNext');
    next.textContent = quiz.i === quiz.order.length - 1 ? 'See my score' : 'Next question';
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
  const dateText = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  function renderChapters() {
    const grid = $('#chapterGrid');
    grid.textContent = '';
    const bests = store.get('sdg4.quiz.bests', {}) || {};
    CHAPTER_ORDER.forEach((cat, n) => {
      const total = QUIZ.filter((q) => q.cat === cat).length;
      const best = bests['chapter:' + cat];
      const bestText = typeof best === 'number' ? 'Best: ' + best + ' of ' + total : 'Not played yet';
      const b = h('button', 'chapter-card');
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', 'Play'));
      b.append(h('span', 'ch-num', 'Chapter ' + (n + 1)), h('span', 'mc-name', cat), h('span', 'ch-count', total + ' questions'), foot);
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
      const score = e.group === 'challenge' ? numberFmt.format(e.score) + ' points' : e.correct + ' of ' + e.of;
      const meta = e.label + ' · ' + (e.group === 'challenge' ? e.correct + ' of ' + e.of + ' right · ' : '') + dateText(e.t);
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
      btn.textContent = 'Tap again to clear every score';
      btn.classList.add('is-armed');
      clearTimer = setTimeout(() => {
        clearTimer = 0;
        btn.textContent = 'Clear leaderboard';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(clearTimer);
    clearTimer = 0;
    store.set(BOARD_KEY, []);
    btn.textContent = 'Clear leaderboard';
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
      $('#ssMsg').textContent = 'Type a name first.';
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
    $('#ssMsg').textContent = 'Saved. You are number ' + rank + ' on the ' + tabLabel + ' board.';
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
    $('#flashCount').textContent = (fcState.i + 1) + ' of ' + total;
    $('#flashFill').style.width = ((fcState.i + 1) / total) * 100 + '%';
    $('#flashCat').textContent = q.cat;
    $('#flashFront').textContent = q.q;
    const answer = $('#flashAnswer');
    answer.textContent = '';
    answer.append(h('span', 'fa-answer', q.options[q.answer]), h('span', 'fa-why', q.explain + ' Source: ' + q.src + '.'));
    $('#flashPrev').disabled = fcState.i === 0;
    $('#flashNext').textContent = fcState.i === total - 1 ? 'Start again' : 'Next card';
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
    const label = quiz.mode === 'chapter' ? 'the ' + quiz.chapter + ' chapter' : M.name + ' mode';
    const score = M.timed ? numberFmt.format(quiz.points) + ' points' : quiz.correct + ' of ' + total;
    const text = 'I scored ' + score + ' on the SDG 4 quiz (' + label + ') on Quality Education for All. Can you beat it?';
    const msg = $('#shareMsg');
    msg.hidden = false;
    msg.textContent = '';
    if (navigator.share) {
      navigator.share({ title: 'SDG 4 quiz', text }).then(
        () => { msg.textContent = 'Shared.'; },
        () => { msg.textContent = ''; }
      );
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { msg.textContent = 'Copied. Paste it anywhere to share your score.'; },
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
    chapterEl.textContent = quiz.chapter ? 'Chapter: ' + quiz.chapter : '';
    $('#rsTitle').textContent = tier.title;
    $('#rsText').textContent = tier.text;

    const stats = $('#resultStats');
    stats.textContent = '';
    const addStat = (value, label) => {
      const d = h('div', 'rstat');
      d.append(h('b', null, value), h('span', null, label));
      stats.appendChild(d);
    };
    addStat(Math.round(ratio * 100) + '%', 'answered correctly');
    addStat(String(quiz.bestStreak), 'best streak');
    if (M.timed) addStat(numberFmt.format(quiz.points), 'points');

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
      topics = 'Strongest topic: ' + strong + ' (' + byCat[strong].right + ' of ' + byCat[strong].all + ').';
      if (weak !== strong && sc(weak) < 1) topics += ' Worth another look: ' + weak + ' (' + byCat[weak].right + ' of ' + byCat[weak].all + ').';
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
    reviewBtn.textContent = 'Review answers';
    quiz.answers.forEach((a) => {
      const q = QUIZ[a.qi];
      const li = h('li');
      const mk = h('span', 'rv-mark' + (a.correct ? '' : ' is-wrong'));
      const s = sv('svg', { viewBox: '0 0 30 30', 'aria-hidden': 'true' }, mk);
      sv('path', { d: a.correct ? MARKS.tick : MARKS.cross }, s);
      mk.appendChild(h('span', 'visually-hidden', a.correct ? 'Correct' : 'Incorrect'));
      const body = h('div');
      let line;
      if (a.correct) line = 'Your answer: ' + q.options[a.chosen] + '.';
      else if (a.timedOut) line = 'No answer: time ran out. Correct answer: ' + q.options[q.answer] + '.';
      else line = 'Your answer: ' + q.options[a.chosen] + '. Correct answer: ' + q.options[q.answer] + '.';
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
  const MODE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
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
    if (timer.mode === 'focus') return 'Session ' + Math.min(timer.cycle + 1, every) + ' of ' + every;
    if (timer.mode === 'short') return 'Stand up, stretch and drink some water';
    return 'Cycle complete. Enjoy a proper rest';
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
    $('#cycleLabel').textContent = left === 0 ? 'Time for a long break' : left + ' focus session' + (left === 1 ? '' : 's') + ' until a long break';
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
    $('#tStart').textContent = timer.running ? 'Pause' : (timer.remaining < timer.total ? 'Resume' : 'Start');
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
    announce(MODE_LABEL[timer.mode] + ' started');
  }
  function pause() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, timer.endAt - Date.now());
    timer.running = false;
    stopClock();
    renderTimer();
    Sound.play('pause');
    announce('Paused');
  }
  const toggleTimer = () => (timer.running ? pause() : start(false));
  function resetTimer() {
    timer.running = false;
    stopClock();
    timer.remaining = timer.total;
    renderTimer();
    Sound.play('tap');
    announce('Timer reset');
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
    announce(completed ? MODE_LABEL[was] + ' finished. Next up: ' + MODE_LABEL[next] + '.' : 'Skipped to ' + MODE_LABEL[next] + '.');
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
    { name: 'Primary completion', a: 77, b: 88 },
    { name: 'Lower-secondary completion', a: 60, b: 78 },
    { name: 'Upper-secondary completion', a: 37, b: 61 },
    { name: 'Youth literacy', a: 87, b: 93 }
  ];

  const ACTION_GROUPS = [['school', 'At school'], ['community', 'In your community'], ['voice', 'Speak up']];
  const ACTIONS = [
    { id: 'tutor', group: 'school', target: '4.1', title: 'Start a peer tutoring club', text: 'Help younger students with reading or maths once a week.' },
    { id: 'books', group: 'school', target: '4.6', title: 'Run a book swap', text: 'Collect books people have finished and swap them at lunch.' },
    { id: 'include', group: 'school', target: '4.5', title: 'Make your class more inclusive', text: 'Invite someone new into your group and ask for materials everyone can use.' },
    { id: 'eco', group: 'school', target: '4.7', title: 'Start an eco or global issues club', text: 'Bring climate change and human rights into class projects.' },
    { id: 'safe', group: 'school', target: '4.a', title: 'Speak up for a safe school', text: 'Report broken toilets, ramps or lights, and stand with classmates who are bullied.' },
    { id: 'teacher', group: 'school', target: '4.c', title: 'Thank a teacher', text: 'Write a note to a teacher who made a difference to you.' },
    { id: 'read', group: 'community', target: '4.2', title: 'Read with young children', text: 'Read with a younger relative, or volunteer at a local early-learning centre.' },
    { id: 'supplies', group: 'community', target: '4.5', title: 'Collect school supplies', text: 'Organise a drive for notebooks, pens and bags for students who need them.' },
    { id: 'skill', group: 'community', target: '4.4', title: 'Teach a digital skill', text: 'Show a family member how to make a presentation or stay safe online.' },
    { id: 'scholar', group: 'community', target: '4.b', title: 'Share scholarship information', text: 'Collect scholarship and course opportunities and post them for your class.' },
    { id: 'talk', group: 'voice', target: 'All', title: 'Give a talk about SDG 4', text: 'Present the facts from this site to your class or at an assembly.' },
    { id: 'write', group: 'voice', target: 'Funding', title: 'Write to a decision-maker', text: 'Ask your school leaders or local representative to protect money for education.' },
    { id: 'share', group: 'voice', target: 'All', title: 'Share one fact a week', text: 'Post a fact from the fact machine, always with its source.' }
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
    if (label) label.textContent = on ? 'Sound on' : 'Sound off';
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
    buildTable($('#slopeTable'), ['Year', 'Primary', 'Lower secondary', 'Upper secondary'],
      TREND.map((d) => [String(d.year), d.primary + '%', d.lower + '%', d.upper + '%']), 'Completion rate worldwide');
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
        btn.textContent = open ? 'Show data table' : 'Hide data table';
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
      btn.textContent = open ? 'Review answers' : 'Hide answers';
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
      announce(MODE_LABEL[timer.mode] + ' selected');
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
    l1.append(h('i'), document.createTextNode('Share in the chosen year (%)'));
    const l2 = h('span');
    const line = h('i', 'line');
    l2.append(line, document.createTextNode('Level in 2000'));
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
        r.delta.textContent = y === 2024 ? '+' + (r.d.b - r.d.a) + ' points' : '';
        tweenTo(r, v, animate);
      });
      $('#tnStatus').textContent = 'Showing ' + y + ': ' + rows.map((r) => r.d.name + ' ' + (y === 2000 ? r.d.a : r.d.b) + '%').join(', ') + '.';
    };
    const stopPlay = () => {
      clearTimeout(playing);
      playing = 0;
      $('#tnPlay').textContent = 'Play the change';
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
      $('#tnPlay').textContent = 'Playing';
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
    const tagText = (a) => (/^\d/.test(a.target) ? 'Target ' + a.target : a.target === 'All' ? 'All targets' : a.target);
    const todayISO = () => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const niceDate = (iso) => {
      const p = String(iso).split('-').map(Number);
      const d = p.length === 3 ? new Date(p[0], p[1] - 1, p[2]) : new Date();
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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
      pickCount.textContent = state.picks.length + ' of ' + MAX_PICKS + ' chosen';
      const badge = $('#plBadge');
      badge.textContent = state.mine ? 'Your pledge' : 'Example pledge: change it to make it yours';
      badge.classList.toggle('is-mine', state.mine);
      const list = $('#plList');
      list.textContent = '';
      if (!state.picks.length) {
        list.appendChild(h('li', 'pl-empty', 'Choose up to three actions to add them here.'));
      }
      state.picks.forEach((id) => {
        const a = byId(id);
        const isDone = state.done.indexOf(id) >= 0;
        const li = h('li', 'pl-item' + (isDone ? ' is-done' : ''));
        const text = h('div');
        text.append(h('span', 'pl-item-title', a.title), h('span', 'pl-item-tag', tagText(a)));
        const btn = h('button', 'pl-done', isDone ? 'Done' : 'Mark as done');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(isDone));
        btn.setAttribute('aria-label', (isDone ? 'Done: ' : 'Mark as done: ') + a.title);
        btn.addEventListener('click', () => markDone(id));
        li.append(text, btn);
        list.appendChild(li);
      });
      const done = state.picks.filter((id) => state.done.indexOf(id) >= 0).length;
      const total = state.picks.length;
      $('#plCount').textContent = total ? done + ' of ' + total + ' done' : 'Nothing chosen yet';
      $('#plFill').style.width = (total ? (done / total) * 100 : 0) + '%';
      $('#plDate').textContent = state.made ? 'Made on ' + niceDate(state.made) : 'Saved in this browser once you change it';
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
        status('You can choose up to three actions. Remove one first.');
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
        status(all ? 'All done. That is your whole pledge.' : 'Nice one. Keep going.');
      }
      save();
      render();
      const again = $('#plList [aria-label$="' + byId(id).title + '"]');
      if (again) again.focus({ preventScroll: true });
    }

    function pledgeText() {
      const lines = ['My SDG 4 pledge'];
      if (state.name.trim()) lines.push('Name: ' + state.name.trim());
      state.picks.forEach((id, i) => {
        const a = byId(id);
        lines.push((i + 1) + '. ' + a.title + (state.done.indexOf(id) >= 0 ? ' (done)' : ''));
      });
      lines.push('Made on ' + niceDate(state.made || todayISO()) + ' for Quality Education for All, SDG 4.');
      return lines.join('\n');
    }

    nameInput.addEventListener('input', () => {
      state.name = nameInput.value.slice(0, 40);
      save();
      render();
    });

    $('#plCopy').addEventListener('click', () => {
      if (!state.picks.length) {
        status('Choose at least one action first.');
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
        status('Select the text below and copy it.');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            area.hidden = true;
            status('Copied. Paste it anywhere.');
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
      status('Cleared. Choose up to three actions.');
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
      count.textContent = q ? n + ' of ' + items.length + ' terms' : items.length + ' terms';
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
      $('#deckStatus').textContent = 'Slide ' + (cur + 1) + ' of ' + total;
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
      const label = fsEl() ? 'Exit full screen' : 'Full screen';
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
      if (key === 'Home') { e.preventDefault(); show(0, -1, false); return; }
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
    const toTop = h('button', 'to-top', 'Back to top');
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
    $('#qotdCat').textContent = 'Topic: ' + q.cat;
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
      if (answered) fb.textContent = (answered.correct ? 'Correct. ' : 'Not quite. ') + q.explain + ' Source: ' + q.src + '.';
    }
    paint();
  }

  /* My progress: badges, a summary, and backup, restore or erase of saved data. */
  const getStats = () => store.get('sdg4.stats', {}) || {};
  const chapterTotal = (cat) => QUIZ.filter((q) => q.cat === cat).length;
  const BADGES = [
    { name: 'First quiz', text: 'Finish a quiz.', earned: () => getStats().quizzes >= 1 },
    { name: 'Perfect round', text: 'Get every question right in one quiz.', earned: () => getStats().perfect >= 1 },
    { name: 'On a roll', text: 'Reach a streak of five right answers.', earned: () => getStats().bestStreak >= 5 },
    { name: 'Against the clock', text: 'Score points in Challenge mode.', earned: () => typeof (store.get('sdg4.quiz.bests', {}) || {}).challenge === 'number' },
    {
      name: 'Chapter champion', text: 'Get every question right in every chapter.',
      earned: () => {
        const bests = store.get('sdg4.quiz.bests', {}) || {};
        return CHAPTER_ORDER.every((cat) => bests['chapter:' + cat] === chapterTotal(cat));
      }
    },
    { name: 'Flashcard finisher', text: 'Turn over all 40 flashcards.', earned: () => fcSeen().length >= QUIZ.length },
    { name: 'Target reader', text: 'Open all ten targets.', earned: () => (store.get('sdg4.seen.targets', []) || []).length >= TARGETS.length },
    { name: 'Note taker', text: 'Write notes on three targets.', earned: () => Object.keys(store.get('sdg4.notes', {}) || {}).length >= 3 },
    { name: 'Question of the day', text: 'Answer the question of the day.', earned: () => !!store.get('sdg4.qotd', null) },
    { name: 'Focus hour', text: 'Study for 60 minutes in the timer.', earned: () => getStats().focusMinutes >= 60 },
    { name: 'Make it yours', text: 'Make your own pledge on the Take action page.', earned: () => { const p = store.get('sdg4.pledge', null); return !!(p && p.made); } },
    { name: 'Speak up', text: 'Save a score to the leaderboard.', earned: () => readBoard().length > 0 }
  ];

  function renderProgress() {
    const stats = getStats();
    const summary = [
      [stats.quizzes || 0, 'quizzes finished'],
      [stats.perfect || 0, 'perfect rounds'],
      [stats.focusMinutes || 0, 'minutes of focus'],
      [fcSeen().length + ' of ' + QUIZ.length, 'flashcards turned'],
      [(store.get('sdg4.seen.targets', []) || []).length + ' of ' + TARGETS.length, 'targets read'],
      [Object.keys(store.get('sdg4.notes', {}) || {}).length, 'targets with notes']
    ];
    const sum = $('#progSummary');
    sum.textContent = '';
    summary.forEach(([num, label]) => {
      const d = h('div', 'prog-stat');
      d.append(h('b', null, String(num)), h('span', null, label));
      sum.appendChild(d);
    });
    const earned = BADGES.filter((b) => b.earned()).length;
    $('#badgeCount').textContent = earned + ' of ' + BADGES.length + ' badges earned';
    const grid = $('#badgeGrid');
    grid.textContent = '';
    BADGES.forEach((b) => {
      const got = b.earned();
      const card = h('div', 'badge' + (got ? ' is-earned' : ''));
      card.append(h('span', 'badge-state', got ? 'Earned' : 'Not yet'), h('p', 'badge-name', b.name), h('p', 'badge-text', b.text));
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
    setDataMsg('Your data was saved to a file called sdg4-progress.json.');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      const data = parsed && parsed.app === 'sdg4-website' && parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
      if (!data) {
        setDataMsg('That file is not an SDG 4 progress file.');
        return;
      }
      const keys = Object.keys(data).filter((k) => k.indexOf(DATA_PREFIX) === 0);
      keys.forEach((k) => store.set(k, data[k]));
      renderProgress();
      setDataMsg('Imported ' + keys.length + ' saved items. Other pages will show them when you open them.');
    };
    reader.readAsText(file);
  }

  let eraseTimer = 0;
  function eraseData() {
    const btn = $('#dataReset');
    if (!eraseTimer) {
      btn.textContent = 'Tap again to erase everything';
      btn.classList.add('is-armed');
      eraseTimer = setTimeout(() => {
        eraseTimer = 0;
        btn.textContent = 'Erase my data on this device';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(eraseTimer);
    eraseTimer = 0;
    savedKeys().forEach((k) => {
      try { window.localStorage.removeItem(k); } catch (e) { /* storage unavailable */ }
    });
    btn.textContent = 'Erase my data on this device';
    btn.classList.remove('is-armed');
    renderProgress();
    setDataMsg('All saved data on this device was erased.');
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
  }

  /* Search: pages, targets, facts and quiz questions, found as you type. Press / to open. */
  const SEARCH_PAGES = [
    { title: 'The facts', href: 'facts.html', text: 'Charts on who is out of school, who finishes, who learns and who is left behind' },
    { title: 'The 10 targets', href: 'targets.html', text: 'Every SDG 4 promise in plain words, with the latest numbers' },
    { title: 'Explore', href: 'explore.html', text: 'Follow 100 children through school, travel from 1948 to 2030, the fact machine' },
    { title: 'Solutions', href: 'solutions.html', text: 'What has worked, from school meals to cash transfers' },
    { title: 'Take action', href: 'action.html', text: 'Choose actions and build your own pledge' },
    { title: 'Quiz', href: 'quiz.html', text: 'The quiz, chapters, flashcards and the leaderboard' },
    { title: 'Study timer', href: 'timer.html', text: 'Study in focus blocks with short breaks' },
    { title: 'About', href: 'about.html', text: 'About this school project, the glossary and every source' },
    { title: 'Slides for class', href: 'slides.html', text: 'Full-screen slides with the key numbers' },
    { title: 'My progress', href: 'progress.html', text: 'Badges, a summary and export, import or erase for your saved data' },
    { title: 'Get the app', href: 'download.html', text: 'Download for Windows, Mac and Android, or add the site to your Home Screen' }
  ];
  let searchIndex = null;

  function buildSearchIndex() {
    const items = SEARCH_PAGES.map((p) => ({ kind: 'Page', title: p.title, text: p.text, href: p.href }));
    TARGETS.forEach((t) => items.push({ kind: 'Target ' + t.code, title: t.title, text: t.plain + ' ' + t.action, href: 'targets.html' }));
    FACTS.forEach((f) => items.push({ kind: 'Fact', title: f.num, text: f.text, href: 'facts.html' }));
    QUIZ.forEach((q) => items.push({ kind: 'Quiz question', title: q.q, text: q.explain, href: 'quiz.html' }));
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
  if (PAGE !== 'slides') {
    initReadingBar();
    initSearch();
  }
  if (MODULES[PAGE]) MODULES[PAGE]();
})();
