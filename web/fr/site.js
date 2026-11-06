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
  // SVG attributes cannot read CSS variables, so a var(--name) colour is looked up from the page when it is drawn.
  const cssValue = (v) => {
    if (typeof v !== 'string' || v.indexOf('var(--') !== 0) return v;
    const root = document.querySelector('.site') || document.documentElement;
    return getComputedStyle(root).getPropertyValue(v.slice(4, -1)).trim() || v;
  };
  const sv = (tag, attrs, parent) => {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, cssValue(attrs[k])));
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
      // Tell the badge check that something was saved.
      window.dispatchEvent(new CustomEvent('sdg4:save', { detail: key }));
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
    1: 'Rapport ODD de l’ONU 2026',
    2: 'Rapport GEM de l’UNESCO 2026',
    3: 'Rapport GEM de l’UNESCO 2026, chapitre 7',
    4: 'Rapport mondial sur les enseignants de l’UNESCO 2024',
    5: 'UNESCO, Journée internationale de l’alphabétisation 2026',
    6: 'Estimations de financement de l’UNESCO, 2023 et 2026',
    7: 'Rapport GEM sur le genre de l’UNESCO 2026',
    8: 'Programme 2030 de l’ONU, A/RES/70/1'
  };

  // One red hue, three lightness steps: education levels are an ordered sequence.
  const LEVELS = [
    { key: 'primary', name: 'Primaire', color: 'var(--chart-1)' },
    { key: 'lower', name: 'Premier cycle du secondaire', color: 'var(--chart-2)' },
    { key: 'upper', name: 'Second cycle du secondaire', color: 'var(--chart-3)' }
  ];

  // Completion rate worldwide (%). 2000: UNESCO GEM Report 2026. 2015 and 2024: UN SDG Report 2026.
  const TREND = [
    { year: 2000, primary: 77, lower: 60, upper: 37 },
    { year: 2015, primary: 85, lower: 75, upper: 53 },
    { year: 2024, primary: 88, lower: 78, upper: 61 }
  ];

  // Completion rate by region, 2024 (%): UN SDG Report 2026. Low-income countries: GEM Report 2026, ch. 7.
  const REGIONS = [
    { name: 'Monde', primary: 88, lower: 78, upper: 61, world: true },
    { name: 'Europe et Amérique du Nord', primary: 100, lower: 98, upper: 89 },
    { name: 'Asie orientale et Asie du Sud-Est', primary: 98, lower: 91, upper: 79 },
    { name: 'Amérique latine et Caraïbes', primary: 94, lower: 84, upper: 65 },
    { name: 'Afrique du Nord et Asie occidentale', primary: 90, lower: 69, upper: 61 },
    { name: 'Asie centrale et Asie du Sud', primary: 89, lower: 83, upper: 59 },
    { name: 'Afrique subsaharienne', primary: 68, lower: 47, upper: 28 },
    { name: 'Océanie*', label: 'Océanie (hors Australie et Nouvelle-Zélande)', primary: 70, lower: 43, upper: 18 },
    { name: 'Pays à faible revenu', primary: 60, lower: 37, upper: 20, income: true }
  ];
  const placeLabel = (r) => r.label || r.name;

  // Out of school by age group, 2024, millions: GEM Report 2026, ch. 7.
  const OOS = [
    { value: 79, name: 'âge du primaire', color: 'var(--chart-1)' },
    { value: 64, name: 'âge du premier cycle du secondaire', color: 'var(--chart-2)' },
    { value: 130, name: 'âge du second cycle du secondaire', color: 'var(--chart-3)' }
  ];

  // Completion of the poorest 20% for every 100 of the richest 20% (parity index x 100): UN SDG Report 2026.
  const PARITY = [
    { name: 'Primaire', value: 91 },
    { name: 'Premier cycle du secondaire', value: 68 },
    { name: 'Second cycle du secondaire', value: 34 }
  ];

  const TARGETS = [
    {
      code: '4.1', kind: 'outcome', short: 'Primaire et secondaire pour tous',
      title: 'Primaire et secondaire gratuits et de qualité pour chaque enfant',
      official: 'D’ici 2030, faire en sorte que toutes les filles et tous les garçons achèvent un cycle complet d’enseignement primaire et secondaire gratuit, équitable et de qualité, qui débouche sur des acquis d’apprentissage pertinents et efficaces',
      plain: 'Chaque enfant devrait pouvoir achever le primaire et le secondaire gratuitement, et apprendre réellement en chemin. Être assis en classe ne suffit pas : ce qui compte, ce sont les compétences en lecture et en mathématiques.',
      measured: 'L’indicateur 4.1.1 suit le nombre d’enfants qui atteignent un niveau minimum en lecture et en mathématiques dans les premières classes, à la fin du primaire et à la fin du premier cycle du secondaire. L’indicateur 4.1.2 suit les taux d’achèvement.',
      stats: [
        { value: '61%', text: 'des jeunes achèvent le second cycle du secondaire (2024), contre 53 % en 2015.', src: 1 },
        { value: '58%', text: 'des élèves atteignent le niveau minimum de lecture à la fin du primaire, selon la dernière estimation mondiale (2019).', src: 3 }
      ],
      action: 'Organisez chaque semaine une séance de lecture ou de mathématiques avec un élève plus jeune, ou lancez un club de tutorat entre pairs.'
    },
    {
      code: '4.2', kind: 'outcome', short: 'Petite enfance et préprimaire',
      title: 'Un bon départ avant l’école primaire',
      official: 'D’ici 2030, faire en sorte que toutes les filles et tous les garçons aient accès à un développement, des soins et un enseignement préprimaire de qualité dans la petite enfance, afin d’être prêts pour l’école primaire',
      plain: 'Les années précédant l’école primaire façonnent la manière dont les enfants apprendront toute leur vie. Cette cible concerne les soins, le jeu et les classes préprimaires qui préparent chaque enfant à l’école.',
      measured: 'L’indicateur 4.2.1 suit le nombre d’enfants âgés de 24 à 59 mois dont le développement est adapté. L’indicateur 4.2.2 suit la participation à un apprentissage organisé un an avant l’école primaire.',
      stats: [
        { value: '75%', text: 'des enfants participent à un apprentissage organisé un an avant l’école primaire, une part à peine modifiée depuis 2015.', src: 3 },
        { value: '60%', text: 'ont réellement bénéficié d’au moins une année de préprimaire, une fois pris en compte les enfants qui entrent tôt à l’école primaire.', src: 3 }
      ],
      action: 'Proposez-vous comme bénévole pour lire avec de jeunes enfants dans un centre d’éveil local, ou collectez des albums illustrés à donner.'
    },
    {
      code: '4.3', kind: 'outcome', short: 'Enseignement technique, professionnel et universitaire',
      title: 'Formation et université abordables pour tous',
      official: 'D’ici 2030, garantir à toutes les femmes et à tous les hommes un accès égal à un enseignement technique, professionnel et supérieur abordable et de qualité, y compris l’université',
      plain: 'Après l’école, chacun devrait pouvoir financer une bonne formation ou des études universitaires, qu’il veuille devenir infirmier, électricien ou ingénieur.',
      measured: 'L’indicateur 4.3.1 suit le nombre de jeunes et d’adultes ayant suivi un enseignement ou une formation formels ou non formels au cours des 12 derniers mois.',
      stats: [
        { value: '44%', text: 'taux de scolarisation dans le supérieur dans le monde en 2024 : moins de 15 % dans les pays à faible revenu et plus de 80 % dans les pays à revenu élevé.', src: 3 },
        { value: '1 sur 3', text: 'pays ne font payer aucun frais de scolarité dans les universités publiques.', src: 2 }
      ],
      action: 'Explorez tôt les parcours professionnels et universitaires, et partagez les informations sur les bourses et les formations avec vos camarades.'
    },
    {
      code: '4.4', kind: 'outcome', short: 'Compétences pour le travail et la vie',
      title: 'Compétences pour des emplois décents',
      official: 'D’ici 2030, augmenter considérablement le nombre de jeunes et d’adultes disposant des compétences utiles, y compris techniques et professionnelles, pour l’emploi, le travail décent et l’entrepreneuriat',
      plain: 'L’éducation doit préparer aux emplois réels : compétences numériques, savoir-faire technique et confiance pour créer une entreprise.',
      measured: 'L’indicateur 4.4.1 suit le nombre de jeunes et d’adultes disposant de compétences en technologies de l’information et de la communication (TIC), de la copie de fichiers à l’écriture d’un programme informatique.',
      stats: [
        { value: '33%', text: 'des adultes du pays médian ayant transmis des données savent réaliser une présentation électronique (2022 à 2024).', src: 3 },
        { value: '6%', text: 'possèdent des compétences en programmation. La plupart des pays qui communiquent ces données sont à revenu intermédiaire supérieur ou élevé.', src: 3 }
      ],
      action: 'Choisissez une compétence pratique ce trimestre, comme la programmation, la gestion de budget ou la prise de parole en public, et enseignez-la à quelqu’un.'
    },
    {
      code: '4.5', kind: 'outcome', short: 'Un accès égal pour tous',
      title: 'Personne laissé de côté dans l’éducation',
      official: 'D’ici 2030, éliminer les disparités entre les sexes dans l’éducation et garantir un accès égal à tous les niveaux d’enseignement et de formation professionnelle aux personnes vulnérables, y compris les personnes handicapées, les peuples autochtones et les enfants en situation de vulnérabilité',
      plain: 'Aucun enfant ne devrait être privé d’école à cause de son genre, d’un handicap, de son lieu de vie ou des revenus de sa famille.',
      measured: 'L’indicateur 4.5.1 compare des groupes à l’aide d’indices de parité, par exemple filles et garçons, zones rurales et urbaines, plus pauvres et plus riches, pour l’ensemble des autres indicateurs de l’ODD 4.',
      stats: [
        { value: '34', text: 'des jeunes les plus pauvres achèvent le second cycle du secondaire pour 100 des plus riches.', src: 1 },
        { value: 'Presque 5 sur 6', text: 'pays n’ont pas atteint la parité de genre dans l’achèvement du second cycle du secondaire.', src: 1 }
      ],
      action: 'Rendez votre classe plus inclusive : invitez quelqu’un de nouveau dans votre groupe et demandez des supports d’apprentissage accessibles à tous.'
    },
    {
      code: '4.6', kind: 'outcome', short: 'Alphabétisation et calcul',
      title: 'Chacun capable de lire, d’écrire et de compter',
      official: 'D’ici 2030, faire en sorte que tous les jeunes et une part importante des adultes, hommes et femmes, acquièrent les compétences en lecture et en calcul',
      plain: 'Chaque jeune, et autant d’adultes que possible, devrait pouvoir lire, écrire et utiliser les nombres avec assurance au quotidien.',
      measured: 'L’indicateur 4.6.1 suit la part des personnes d’une tranche d’âge qui atteignent un niveau fixé d’alphabétisation et de calcul fonctionnels.',
      stats: [
        { value: '739M', text: 'jeunes et adultes ne disposaient pas de compétences de base en lecture et en écriture en 2024 ; environ deux tiers d’entre eux sont des femmes.', src: 5 },
        { value: '93%', text: 'des jeunes dans le monde savent lire et écrire, contre 87 % en 2000.', src: 3 }
      ],
      action: 'Organisez un échange de livres à l’école, ou aidez un membre de votre famille à s’entraîner à la lecture ou aux calculs du quotidien.'
    },
    {
      code: '4.7', kind: 'outcome', short: 'Durabilité, paix et citoyenneté mondiale',
      title: 'Apprendre à construire un monde plus juste et plus vert',
      official: 'D’ici 2030, faire en sorte que tous les apprenants acquièrent les connaissances et compétences nécessaires pour promouvoir le développement durable, notamment par l’éducation au développement durable et à des modes de vie durables, les droits humains, l’égalité des genres, la promotion d’une culture de paix et de non-violence, la citoyenneté mondiale et la valorisation de la diversité culturelle et de la contribution de la culture au développement durable',
      plain: 'L’école devrait nous aider à comprendre le changement climatique, les droits humains, l’égalité des genres et d’autres cultures, et nous donner les compétences pour agir.',
      measured: 'L’indicateur 4.7.1 mesure dans quelle mesure la citoyenneté mondiale et le développement durable sont intégrés aux politiques éducatives, aux programmes, à la formation des enseignants et à l’évaluation des élèves. Depuis 2025, il examine aussi directement les programmes sur l’environnement, le changement climatique et la biodiversité.',
      stats: [
        { value: '50 sur 110', text: 'des pays étudiés ne mentionnaient pas le changement climatique dans les programmes de sciences et de sciences sociales de la 6e année (2024).', src: 3 },
        { value: '78 sur 110', text: 'ne le mentionnaient pas dans leurs programmes de 3e année.', src: 3 }
      ],
      action: 'Créez ou rejoignez un club écologique ou sur les enjeux mondiaux, et intégrez les questions climatiques à vos projets de classe.'
    },
    {
      code: '4.a', kind: 'means', short: 'Des écoles sûres et inclusives',
      title: 'Des écoles sûres et ouvertes à tous',
      official: 'Construire et améliorer des équipements éducatifs adaptés aux enfants, aux personnes handicapées et aux questions de genre, offrant à tous des environnements d’apprentissage sûrs, non violents, inclusifs et efficaces',
      plain: 'Les écoles ont besoin de l’essentiel, comme l’électricité, l’eau propre, des toilettes, des rampes et internet, et doivent être exemptes de violence et de harcèlement.',
      measured: 'L’indicateur 4.a.1 suit la part des écoles disposant de services de base : électricité, internet et ordinateurs pour l’enseignement, installations adaptées aux élèves handicapés, eau potable, toilettes séparées par sexe et points d’eau pour se laver les mains.',
      stats: [
        { value: 'Plus d’un sur cinq', text: 'des écoles primaires dans le monde n’ont pas l’électricité, d’eau potable sûre ou d’installations sanitaires de base.', src: 1 },
        { value: '466M', text: 'enfants ont reçu des repas scolaires en 2024, soit 20 % de plus qu’en 2020.', src: 3 }
      ],
      action: 'Signalez les équipements défectueux ou dangereux, et soutenez les camarades victimes de harcèlement.'
    },
    {
      code: '4.b', kind: 'means', short: 'Bourses pour les pays en développement',
      title: 'Davantage de bourses pour les étudiants des pays en développement',
      official: 'D’ici 2020, augmenter considérablement le nombre de bourses disponibles à l’échelle mondiale pour les pays en développement, en particulier les pays les moins avancés, les petits États insulaires en développement et les pays africains, afin de financer des inscriptions dans l’enseignement supérieur, y compris la formation professionnelle, les technologies de l’information et de la communication, et les filières techniques, d’ingénierie et scientifiques, dans les pays développés et dans d’autres pays en développement',
      plain: 'Les pays se sont engagés à offrir davantage de bourses pour que les étudiants des pays les plus pauvres puissent suivre des études universitaires, en particulier en sciences et technologies. C’est la seule cible de l’ODD 4 dont l’échéance est fixée à 2020.',
      measured: 'L’indicateur 4.b.1 suit le montant de l’aide publique au développement (aide) consacré aux bourses.',
      stats: [
        { value: '$1.7B', text: 'de l’aide a été consacrée aux bourses dans le secteur de l’éducation en 2024, en baisse après une reprise des financements en 2023.', src: 3 },
        { value: '2.8%', text: 'des étudiants universitaires dans le monde ont étudié dans un autre pays en 2023.', src: 3 }
      ],
      action: 'Recueillez les opportunités de bourses que vous trouvez et partagez-les sur le panneau d’affichage de la classe.'
    },
    {
      code: '4.c', kind: 'means', short: 'Enseignants qualifiés',
      title: 'Assez d’enseignants bien formés',
      official: 'D’ici 2030, augmenter considérablement le nombre d’enseignants qualifiés, y compris grâce à la coopération internationale pour la formation des enseignants dans les pays en développement, en particulier les pays les moins avancés et les petits États insulaires en développement',
      plain: 'Il n’y a pas d’éducation sans enseignants. Le monde a besoin de millions d’enseignants supplémentaires formés, soutenus et correctement rémunérés, surtout dans les pays les plus pauvres.',
      measured: 'L’indicateur 4.c.1 suit la part des enseignants qui possèdent les qualifications minimales exigées par leur pays.',
      stats: [
        { value: '44M', text: 'enseignants supplémentaires sont nécessaires d’ici 2030 pour une éducation primaire et secondaire universelle, dont 15 millions en Afrique subsaharienne.', src: 4 },
        { value: '1 sur 5', text: 'des enseignants dans le monde ne répondent pas aux normes minimales de qualification de leur pays (2024).', src: 1 }
      ],
      action: 'Remerciez un enseignant cette semaine, et réfléchissez à la possibilité d’en faire un jour votre métier.'
    }
  ];

  const QUIZ = [
    // The goal
    { cat: 'L’objectif', q: 'À quelle année les Objectifs de développement durable, y compris l’ODD 4, doivent-ils être atteints ?', options: ['2025', '2030', '2040', '2050'], answer: 1, explain: 'Tous les États membres de l’ONU ont adopté le Programme 2030 en 2015. Il laisse au monde jusqu’en 2030 pour atteindre les 17 objectifs.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'L’objectif', q: 'Combien y a-t-il d’Objectifs de développement durable ?', options: ['6', '8', '12', '17'], answer: 3, explain: 'Il y a 17 objectifs, et l’éducation est le numéro 4. Les Objectifs du Millénaire pour le développement précédents étaient au nombre de 8.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'L’objectif', q: 'Combien de cibles compte l’ODD 4 ?', options: ['10', '12', '15', '17'], answer: 0, explain: 'Dix : sept cibles de résultats (4.1 à 4.7) et trois moyens de mise en œuvre (4.a, 4.b et 4.c).', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'L’objectif', mix: true, q: 'Complétez l’objectif : « Assurer à tous une éducation équitable, inclusive et de qualité et promouvoir … »', options: ['places universitaires gratuites', 'possibilités d’apprentissage tout au long de la vie', 'appareils numériques', 'repas scolaires'], answer: 1, explain: 'L’objectif complet se lit ainsi : assurer à tous une éducation équitable, inclusive et de qualité et promouvoir les possibilités d’apprentissage tout au long de la vie.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'L’objectif', q: 'Quelle cible concerne le développement de la petite enfance et l’enseignement préprimaire ?', options: ['Cible 4.1', 'Cible 4.2', 'Cible 4.5', 'Cible 4.c'], answer: 1, explain: 'La cible 4.2 vise à offrir à chaque enfant des soins et un enseignement préprimaire de qualité, afin qu’il soit prêt pour l’école primaire.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'L’objectif', q: 'Quelle cible de l’ODD 4 avait une échéance fixée à 2020 au lieu de 2030 ?', options: ['4.1, primaire et secondaire gratuits', '4.6, alphabétisation et calcul', '4.b, bourses', '4.c, enseignants qualifiés'], answer: 2, explain: 'La cible 4.b visait à élargir les bourses pour les étudiants des pays en développement d’ici 2020.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'L’objectif', mix: true, q: 'La cible 4.c concerne…', options: ['université gratuite pour tous', 'davantage d’enseignants qualifiés', 'repas scolaires', 'internet dans chaque classe'], answer: 1, explain: 'La cible 4.c vise à augmenter considérablement le nombre d’enseignants qualifiés, notamment grâce à la formation des enseignants dans les pays en développement.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'L’objectif', q: 'Quelle cible couvre l’apprentissage du développement durable, des droits humains, de la paix et de la citoyenneté mondiale ?', options: ['Cible 4.1', 'Cible 4.3', 'Cible 4.5', 'Cible 4.7'], answer: 3, explain: 'La cible 4.7 concerne les connaissances et compétences nécessaires pour promouvoir le développement durable, les droits humains, l’égalité des genres, la paix et la citoyenneté mondiale.', src: 'Programme 2030 de l’ONU (2015)' },
    // Access
    { cat: 'Accès', q: 'Environ combien d’enfants et de jeunes étaient non scolarisés dans le monde en 2024 ?', options: ['73 millions', '123 millions', '173 millions', '273 millions'], answer: 3, explain: '273 millions, soit un sur six, et ce nombre augmente depuis sept ans.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Accès', q: 'Quelle tranche d’âge compte le plus de jeunes non scolarisés ?', options: ['Âge de l’école primaire', 'Âge du premier cycle du secondaire', 'Âge du second cycle du secondaire', 'Les trois sont à peu près égaux'], answer: 2, explain: 'des 273 millions sont en âge du second cycle du secondaire, contre 79 millions en âge de primaire et 64 millions en âge du premier cycle du secondaire.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Accès', q: 'En 2024, le nombre d’enfants non scolarisés avait augmenté pendant combien d’années consécutives ?', options: ['2', '4', '7', '12'], answer: 2, explain: 'Sept années consécutives, sous l’effet de la croissance démographique, des crises et de la baisse des budgets.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Accès', q: 'Dans les pays à faible revenu, quelle est à peu près la part des enfants et jeunes en âge scolaire non scolarisés ?', options: ['3%', '16%', '36%', '66%'], answer: 2, explain: 'Environ 36 %, contre 3 % dans les pays à revenu élevé.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Accès', mix: true, q: 'Quelles deux régions regroupent à elles seules les trois quarts des enfants et jeunes non scolarisés dans le monde ?', options: ['Europe et Amérique latine', 'Afrique subsaharienne et Asie centrale et du Sud', 'Asie orientale et Océanie', 'Amérique du Nord et Asie occidentale'], answer: 1, explain: 'L’Afrique subsaharienne et l’Asie centrale et du Sud représentent ensemble les trois quarts du total mondial.', src: 'Rapport ODD de l’ONU 2026' },
    { cat: 'Accès', q: 'Combien d’élèves étaient inscrits dans les écoles du monde en 2024 ?', options: ['500 millions', '800 millions', '1,1 milliard', '1,4 milliard'], answer: 3, explain: '1,4 milliard, soit 327 millions de plus dans le primaire et le secondaire qu’en 2000.', src: 'Rapport GEM de l’UNESCO 2026' },
    // Completion
    { cat: 'Achèvement', q: 'En Afrique subsaharienne, quelle part des jeunes achève le second cycle du secondaire ?', options: ['28%', '48%', '61%', '78%'], answer: 0, explain: 'En 2024, 28 % ont achevé le second cycle du secondaire en Afrique subsaharienne, contre 61 % dans le monde.', src: 'Rapport ODD de l’ONU 2026' },
    { cat: 'Achèvement', q: 'Dans le monde, quelle part des jeunes a achevé le second cycle du secondaire en 2024 ?', options: ['37%', '61%', '78%', '88%'], answer: 1, explain: '61 %, contre 53 % en 2015 et 37 % en 2000. Pour le premier cycle du secondaire, c’est 78 %, et pour le primaire 88 %.', src: 'Rapport ODD de l’ONU 2026 ; Rapport GEM de l’UNESCO 2026' },
    { cat: 'Achèvement', q: 'Au rythme actuel, à peu près quand 95 % des jeunes du monde achèveraient-ils le second cycle du secondaire ?', options: ['2030', '2050', '2075', '2105'], answer: 3, explain: 'L’UNESCO estime qu’au rythme actuel de progression, soit environ un point de pourcentage par an depuis 2000, il faudrait attendre 2105.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Achèvement', mix: true, q: 'Quelle région affiche le taux d’achèvement du second cycle du secondaire le plus élevé ?', options: ['Europe et Amérique du Nord', 'Asie orientale et Asie du Sud-Est', 'Amérique latine et Caraïbes', 'Afrique subsaharienne'], answer: 0, explain: 'Europe et Amérique du Nord, avec 89 % en 2024. L’Asie orientale et l’Asie du Sud-Est viennent ensuite avec 79 %.', src: 'Rapport ODD de l’ONU 2026' },
    // Learning
    { cat: 'Apprentissage', q: 'Selon la dernière estimation mondiale (2019), quelle part des élèves avait atteint le niveau minimum de lecture à la fin du primaire ?', options: ['58%', '68%', '78%', '88%'], answer: 0, explain: '58 % en lecture et 44 % en mathématiques. L’estimation n’a pas été actualisée depuis la pandémie.', src: 'Rapport ODD de l’ONU 2026' },
    { cat: 'Apprentissage', mix: true, q: 'Dans 57 pays pour la plupart à revenu intermédiaire ou élevé, que s’est-il passé pour les compétences en lecture entre 2012 et 2022 ?', options: ['Elles se sont beaucoup améliorées', 'Elles sont restées à peu près stables', 'Elles ont baissé, de 59 % à 47 % des élèves au niveau minimum', 'Elles ont doublé'], answer: 2, explain: 'La lecture est passée de 59 % à 47 %, et les mathématiques de 41 % à 36 %, si bien que la crise de l’apprentissage dépasse la pandémie.', src: 'Rapport ODD de l’ONU 2026' },
    { cat: 'Apprentissage', q: 'Quelle part des jeunes dans le monde savait lire et écrire en 2024 ?', options: ['63%', '73%', '83%', '93%'], answer: 3, explain: '93 %, contre 87 % en 2000. Malgré tout, environ un jeune sur quatre dans les pays à faible revenu ne savait ni lire ni écrire.', src: 'Rapport GEM de l’UNESCO 2026' },
    // Teachers
    { cat: 'Enseignants', q: 'De combien d’enseignants supplémentaires le monde a-t-il besoin d’ici 2030 pour une éducation primaire et secondaire universelle ?', options: ['24 millions', '44 millions', '64 millions', '84 millions'], answer: 1, explain: '44 millions. Un sur trois, soit 15 millions, est nécessaire en Afrique subsaharienne.', src: 'Rapport mondial sur les enseignants de l’UNESCO (2024)' },
    { cat: 'Enseignants', q: 'Environ combien d’enseignants dans le monde ne répondent pas aux normes minimales de qualification de leur pays ?', options: ['1 sur 50', '1 sur 20', '1 sur 5', '1 sur 2'], answer: 2, explain: 'Environ un enseignant sur cinq, soit 20 % (2024). La cible 4.c vise à changer cela d’ici 2030.', src: 'Rapport ODD de l’ONU 2026' },
    { cat: 'Enseignants', mix: true, q: 'Quelle région a le plus besoin d’enseignants supplémentaires d’ici 2030 ?', options: ['Europe', 'Afrique subsaharienne', 'Amérique du Nord', 'Océanie'], answer: 1, explain: 'L’Afrique subsaharienne en a besoin de 15 millions, soit un tiers de tous les enseignants supplémentaires nécessaires dans le monde.', src: 'Rapport mondial sur les enseignants de l’UNESCO (2024)' },
    { cat: 'Enseignants', q: 'Quelle part des pays à faible revenu exige que les enseignants du primaire soient titulaires d’une licence ?', options: ['11%', '41%', '71%', '91%'], answer: 0, explain: 'Seulement 11 %, contre 79 % dans les pays à revenu élevé.', src: 'Rapport GEM de l’UNESCO 2026' },
    // Equity
    { cat: 'Équité', q: 'Parmi les 739 millions de jeunes et d’adultes qui ne disposent pas de compétences de base en lecture et en écriture, quelle part environ sont des femmes ?', options: ['Environ un tiers', 'Environ les deux tiers', 'Environ les trois quarts', 'Presque tous'], answer: 1, explain: 'Environ deux tiers sont des femmes, ce qui explique le lien étroit entre alphabétisation et égalité des genres.', src: 'UNESCO, Journée internationale de l’alphabétisation 2026' },
    { cat: 'Équité', q: 'Dans le monde, combien de jeunes les plus pauvres achèvent le second cycle du secondaire pour 100 des plus riches ?', options: ['14', '34', '64', '94'], answer: 1, explain: 'Seulement 34. Au primaire, c’est 91, si bien que l’écart se creuse à mesure que les enfants grandissent.', src: 'Rapport ODD de l’ONU 2026' },
    { cat: 'Équité', q: 'Entre 2000 et 2025, la part des filles mariées avant 18 ans est passée de 25 % à…', options: ['8%', '12%', '15%', '18%'], answer: 3, explain: '18 % en 2025. Le mariage précoce et les grossesses restent des raisons majeures pour lesquelles les filles quittent l’école.', src: 'Rapport GEM sur le genre de l’UNESCO 2026' },
    { cat: 'Équité', q: 'En Afrique subsaharienne, quelle part des filles enceintes ou mères retournent à l’école ?', options: ['Moins de 5 %', 'Environ 25 %', 'Environ 50 %', 'Plus de 75 %'], answer: 0, explain: 'Moins de 5 % reviennent, même si de plus en plus de pays protègent leur droit de poursuivre leurs études.', src: 'Rapport GEM sur le genre de l’UNESCO 2026' },
    // Money and schools
    { cat: 'Argent et écoles', q: 'Quelle est l’ampleur du déficit annuel de financement de l’éducation dans les pays à faible revenu et à revenu intermédiaire de la tranche inférieure ?', options: ['9,7 milliards de dollars', '97 milliards de dollars', '970 milliards de dollars', '9,7 billions de dollars'], answer: 1, explain: 'Environ 97 milliards de dollars par an, dont 70 milliards en Afrique subsaharienne.', src: 'UNESCO (2023, reconduit en 2026)' },
    { cat: 'Argent et écoles', q: 'Combien de pays consacrent davantage au remboursement de leur dette qu’à l’éducation ?', options: ['13', '53', '113', '193'], answer: 2, explain: '113 pays, où vivent 6,1 milliards de personnes.', src: 'UNESCO, juillet 2026' },
    { cat: 'Argent et écoles', q: 'En 2024, l’éducation a reçu 7,5 % de l’aide au développement. C’était sa part la plus faible depuis…', options: ['2 ans', '5 ans', '10 ans', 'deux décennies'], answer: 3, explain: 'Deux décennies. L’aide à l’éducation a baissé de 8 % entre 2023 et 2024, et l’aide à l’éducation de base de 16 %.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Argent et écoles', q: 'Combien d’enfants ont reçu des repas scolaires en 2024 ?', options: ['46 millions', '166 millions', '466 millions', '1,4 milliard'], answer: 2, explain: '466 millions, soit 20 % de plus qu’en 2020.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Argent et écoles', q: 'Environ combien d’écoles primaires dans le monde n’ont pas de services de base comme l’électricité, l’eau potable sûre ou l’assainissement ?', options: ['Moins d’un sur vingt', 'Environ un sur dix', 'Plus d’un sur cinq', 'Environ une sur deux'], answer: 2, explain: 'Plus d’un sur cinq. Dans les pays les moins avancés, plus de la moitié des écoles n’ont pas l’électricité.', src: 'Rapport ODD de l’ONU 2026' },
    // Skills
    { cat: 'Compétences', q: 'Dans le pays médian ayant transmis des données, quelle part des adultes sait écrire un programme informatique ?', options: ['6%', '26%', '46%', '66%'], answer: 0, explain: 'Seulement 6 %. Environ un tiers sait réaliser une présentation électronique, et la plupart des pays qui communiquent ces données sont à revenu intermédiaire supérieur ou élevé.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Compétences', q: 'Dans combien des 110 pays étudiés le changement climatique était-il absent des programmes de sciences et de sciences sociales de 6e année ?', options: ['50', '70', '90', '105'], answer: 0, explain: '50 pays sur 110. En 3e année, il était absent dans 78 pays.', src: 'Rapport GEM de l’UNESCO 2026' },
    { cat: 'Compétences', q: 'L’enseignement supérieur comprend l’université. Quel était le taux mondial de scolarisation dans le supérieur en 2024 ?', options: ['14%', '24%', '34%', '44%'], answer: 3, explain: '44 %, allant de moins de 15 % dans les pays à faible revenu à plus de 80 % dans les pays à revenu élevé.', src: 'Rapport GEM de l’UNESCO 2026' },
    // History
    { cat: 'Histoire', mix: true, q: 'Quel document, adopté en 1948, déclare que « toute personne a droit à l’éducation » ?', options: ['La Déclaration universelle des droits de l’homme', 'L’accord de Paris', 'Les Conventions de Genève', 'La Charte olympique'], answer: 0, explain: 'L’article 26 de la Déclaration universelle des droits de l’homme affirme que toute personne a droit à l’éducation, et que l’enseignement élémentaire est obligatoire et gratuit.', src: 'Assemblée générale des Nations unies (1948)' },
    { cat: 'Histoire', mix: true, q: 'Où s’est tenue la Conférence mondiale sur l’éducation pour tous de 1990 ?', options: ['Jomtien, Thaïlande', 'Dakar, Sénégal', 'Incheon, République de Corée', 'New York, États-Unis'], answer: 0, explain: 'À Jomtien, en Thaïlande, où les pays ont fixé l’objectif d’un accès universel à l’enseignement primaire.', src: 'UNESCO' },
    { cat: 'Histoire', q: 'Quel Objectif du Millénaire pour le développement visait à ce que chaque enfant achève l’école primaire d’ici 2015 ?', options: ['OMD 1', 'OMD 2', 'OMD 4', 'OMD 8'], answer: 1, explain: 'L’OMD 2 visait l’enseignement primaire universel d’ici 2015. L’ODD 4 a relevé la barre jusqu’au secondaire d’ici 2030.', src: 'Objectifs du Millénaire pour le développement de l’ONU (2000)' },
    // Early years
    { cat: 'Les premières années', q: 'À quel moment de la vie le cerveau se développe-t-il le plus vite ?', options: ['Les premières années de la vie', 'L’adolescence', 'Le début de l’âge adulte', 'La vieillesse'], answer: 0, explain: 'Le cerveau grandit et forme ses connexions de base le plus vite pendant les premières années de la vie, ce qui explique l’importance des soins et de l’apprentissage précoces.', src: 'Harvard Center on the Developing Child' },
    { cat: 'Les premières années', q: 'Qu’est-ce que l’enseignement préprimaire ?', options: ['Apprentissage des jeunes enfants avant la première année de primaire', 'Cours de préparation à l’université', 'Cours du soir pour adultes', 'Formation des enseignants du secondaire'], answer: 0, explain: 'L’enseignement préprimaire est un apprentissage organisé pour les jeunes enfants avant l’entrée en primaire, comme la maternelle ou la crèche éducative.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'Les premières années', q: 'Pourquoi la cible 4.2 vise-t-elle l’enseignement préprimaire ?', options: ['Pour que les enfants soient prêts pour l’école primaire', 'Pour que les enfants puissent sauter l’école primaire', 'Pour que les parents puissent travailler à temps plein', 'Pour que les écoles puissent fermer plus tôt'], answer: 0, explain: 'La cible 4.2 vise à ce que les enfants soient prêts pour l’école primaire : l’apprentissage précoce les prépare à réussir plus tard.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'Les premières années', q: 'Quel type de prise en charge couvre la cible 4.2 ?', options: ['Développement et soins de la petite enfance', 'Soins aux personnes âgées', 'Assurance maladie', 'Logement'], answer: 0, explain: 'La cible 4.2 couvre le développement et les soins de la petite enfance ainsi que l’enseignement préprimaire : l’apprentissage commence par les soins des premières années.', src: 'Programme 2030 de l’ONU (2015)' },
    // Literacy
    { cat: 'Alphabétisation', q: 'Quelle cible couvre la littératie et la numératie ?', options: ['Cible 4.1', 'Cible 4.6', 'Cible 4.7', 'Cible 4.b'], answer: 1, explain: 'La cible 4.6 vise à ce que, d’ici 2030, tous les jeunes et une part importante des adultes, hommes et femmes, acquièrent la littératie et la numératie.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'Alphabétisation', q: 'Quand célèbre-t-on la Journée internationale de l’alphabétisation ?', options: ['8 mars', '21 février', '8 septembre', '5 octobre'], answer: 2, explain: 'L’UNESCO célèbre chaque année la Journée internationale de l’alphabétisation le 8 septembre, pour souligner l’importance de la littératie pour les personnes et les sociétés.', src: 'UNESCO, Journée internationale de l’alphabétisation 2026' },
    { cat: 'Alphabétisation', q: 'Que signifie la numératie ?', options: ['Lire couramment', 'Utiliser les nombres et les mathématiques de base au quotidien', 'Rédiger des dissertations', 'Parler une deuxième langue'], answer: 1, explain: 'La numératie est la capacité d’utiliser les nombres et les mathématiques de base au quotidien, comme la littératie est la capacité de lire et d’écrire.', src: 'Programme 2030 de l’ONU (2015)' },
    { cat: 'Alphabétisation', q: 'Qui la cible 4.6 concerne-t-elle ?', options: ['Seulement les enfants', 'Seulement les enseignants', 'Tous les jeunes et une part importante des adultes, hommes et femmes', 'Seulement les habitants des villes'], answer: 2, explain: 'La cible 4.6 concerne les jeunes et les adultes, hommes et femmes, et pas seulement les enfants. La littératie devient ainsi un objectif tout au long de la vie.', src: 'Programme 2030 de l’ONU (2015)' },
    // Inclusion
    { cat: 'Inclusion', q: 'Quel traité établit le droit à l’éducation inclusive des personnes handicapées ?', options: ['L’accord de Paris', 'La Convention relative aux droits des personnes handicapées', 'Le protocole de Kyoto', 'Les Conventions de Genève'], answer: 1, explain: 'L’article 24 de la Convention relative aux droits des personnes handicapées (2006) établit le droit à l’éducation inclusive à tous les niveaux.', src: 'CDPH de l’ONU (2006), article 24' },
    { cat: 'Inclusion', q: 'Qu’est-ce que la Journée internationale de la langue maternelle, célébrée le 21 février ?', options: ['Un jour pour arrêter d’enseigner l’anglais', 'Une journée pour promouvoir la diversité linguistique et l’enseignement dans la langue maternelle', 'Une pause dans les examens scolaires', 'Une journée pour évaluer les enseignants'], answer: 1, explain: 'L’UNESCO a créé la Journée internationale de la langue maternelle pour promouvoir la diversité linguistique et l’enseignement dans les langues parlées à la maison.', src: 'UNESCO, Journée internationale de la langue maternelle' },
    { cat: 'Inclusion', q: 'Pourquoi apprendre dans une langue que les enfants ne parlent pas à la maison peut-il être un obstacle ?', options: ['Il rend l’apprentissage initial plus difficile pour beaucoup d’enfants', 'Il rend les écoles moins coûteuses', 'Il supprime le besoin d’enseignants', 'Il n’a aucun effet sur l’apprentissage'], answer: 0, explain: 'Les enfants apprennent mieux d’abord dans une langue qu’ils comprennent. L’enseignement dans la langue maternelle leur offre des bases plus solides pour lire et apprendre ensuite.', src: 'UNESCO, Journée internationale de la langue maternelle' },
    { cat: 'Inclusion', q: 'Dans l’ODD 4, que signifie l’éducation « inclusive » ?', options: ['Une éducation réservée aux familles riches', 'Une éducation qui atteint tout le monde, y compris les personnes handicapées et les groupes marginalisés', 'Une éducation réservée aux adultes', 'Uniquement l’apprentissage en ligne'], answer: 1, explain: 'L’ODD 4 demande une éducation inclusive : une éducation qui atteint tout le monde, y compris les personnes handicapées, les filles et les groupes marginalisés.', src: 'Programme 2030 de l’ONU (2015)' }
  ];

  const MILESTONES = [
    { year: '1948', short: 'Droit à l’éducation', title: 'L’éducation devient un droit humain', text: 'La Déclaration universelle des droits de l’homme affirme que toute personne a droit à l’éducation, et que l’enseignement élémentaire est gratuit et obligatoire (article 26).', src: 'Assemblée générale des Nations unies, 1948' },
    { year: '1989', short: 'Droits de l’enfant', title: 'Une promesse faite à chaque enfant', text: 'La Convention relative aux droits de l’enfant engage les pays à rendre l’enseignement primaire obligatoire et gratuit pour tous. C’est le traité relatif aux droits humains le plus largement ratifié de l’histoire.', src: 'Convention des Nations unies relative aux droits de l’enfant, 1989' },
    { year: '1990', short: 'Éducation pour tous', title: 'Éducation pour tous', text: 'À la Conférence mondiale sur l’éducation pour tous de Jomtien, en Thaïlande, les pays ont fixé l’objectif d’un accès universel à l’enseignement primaire.', src: 'Rapport GEM de l’UNESCO 2026' },
    { year: '2000', short: 'Dakar et les OMD', title: 'Chaque enfant devrait achever l’école primaire', text: 'Au Forum mondial sur l’éducation de Dakar, au Sénégal, et dans les Objectifs du Millénaire pour le développement, le monde visait à ce que chaque enfant achève l’école primaire d’ici 2015 (OMD 2). L’objectif n’a pas été atteint.', src: 'UNESCO ; Objectifs du Millénaire pour le développement de l’ONU' },
    { year: '2015', short: 'L’ODD 4 est adopté', title: 'L’ODD 4 relève la barre', text: 'En mai, la Déclaration d’Incheon a défini la vision de l’Éducation 2030. En septembre, tous les États membres de l’ONU ont adopté les 17 ODD, visant à ce que chaque jeune achève le secondaire.', src: 'Programme 2030 de l’ONU ; UNESCO' },
    { year: '2016', short: 'Le compte à rebours commence', title: 'Le compte à rebours commence', text: 'Les ODD sont entrés officiellement en vigueur le 1er janvier 2016, lançant un compte à rebours de 15 ans jusqu’en 2030.', src: 'Nations unies' },
    { year: '2022', short: 'Sommet sur l’éducation', title: 'Sommet Transformer l’éducation', text: 'Le secrétaire général de l’ONU a réuni les dirigeants mondiaux à New York pour replacer l’éducation au sommet de l’agenda mondial, après que la pandémie de COVID-19 a perturbé la scolarité de la plupart des élèves du monde.', src: 'Nations unies' },
    { year: '2026', short: 'Aujourd’hui', now: true, title: 'Où en sommes-nous', text: null, src: 'Rapport GEM de l’UNESCO 2026 ; Rapport ODD de l’ONU 2026' },
    { year: '2030', short: 'Échéance', title: 'L’échéance', text: 'La date cible de chaque engagement de l’ODD 4, de l’école primaire et secondaire gratuite pour tous à un nombre suffisant d’enseignants qualifiés.', src: 'Programme 2030 de l’ONU' }
  ];

  const FACTS = [
    { num: 'Toutes les 2 secondes', text: 'Il faut qu’un enfant de plus entre à l’école toutes les deux secondes pour que le monde reste sur la bonne voie en 2030.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '25 par minute', text: 'Depuis 2000, plus de 25 enfants supplémentaires entrent à l’école chaque minute, soit 327 millions d’élèves de plus dans le primaire et le secondaire.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: 'De 18 % à 84 %', text: 'L’Éthiopie a porté son taux de scolarisation dans le primaire de 18 % en 1974 à 84 % en 2024.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: 'De 7 % à plus de 60 %', text: 'La Chine a élargi l’accès à l’université et aux autres formations supérieures, de 7 % en 1999 à plus de 60 % en 2024.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '33 points', text: 'Le Népal a comblé un écart de 33 points de pourcentage entre filles et garçons dans l’achèvement du premier cycle du secondaire entre 1990 et 2024.', src: 'Rapport GEM sur le genre de l’UNESCO 2026' },
    { num: '22 en retard, 11 en avance', text: 'Au Cambodge, les filles sont passées de 22 points de retard sur les garçons dans l’achèvement du primaire en 1981 à 11 points d’avance en 2024.', src: 'Rapport GEM sur le genre de l’UNESCO 2026' },
    { num: '1 an de plus', text: 'Au Cambodge, la seule électrification a été associée à près d’une année entière de scolarité supplémentaire.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: 'Un semestre', text: 'Il a été démontré que les programmes de restauration scolaire ajoutent jusqu’à un semestre d’apprentissage pour chaque tranche de 100 dollars dépensée.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '36 % de chances en plus', text: 'Les enfants dont les familles reçoivent des transferts monétaires liés à la fréquentation scolaire ont 36 % de chances en plus d’être inscrits.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: 'Plus d’un an', text: 'Dans 14 pays africains, rendre l’éducation obligatoire, et pas seulement gratuite, a ajouté plus d’un an de scolarité.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: 'De 8 % à 26 %', text: 'La part des pays dotés de 12 années d’enseignement obligatoire a plus que triplé, passant de 8 % à 26 %.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '466 millions', text: '466 millions d’enfants ont reçu des repas scolaires en 2024, soit 20 % de plus qu’en 2020.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '113 pays', text: '113 pays, où vivent 6,1 milliards de personnes, consacrent davantage au remboursement de leur dette qu’à l’éducation.', src: 'UNESCO, juillet 2026' },
    { num: '22%', text: 'Seuls 41 des 183 pays disposant de données (22 %) respectent les deux repères de dépenses pour l’éducation : au moins 4 % du PIB et au moins 15 % des dépenses publiques.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '70 sur 83', text: 'Dans 70 des 83 pays disposant de données, plus de la moitié des élèves du premier cycle du secondaire ont déclaré avoir été victimes de harcèlement.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '3 909 attaques', text: 'En 2024, 3 909 attaques contre l’éducation ont été recensés dans 69 pays, le chiffre le plus élevé depuis que la Coalition mondiale pour protéger l’éducation contre les attaques a commencé à publier des rapports en 2013.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '1 sur 4', text: 'Environ un jeune sur quatre dans les pays à faible revenu ne savait pas lire ni écrire en 2024.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: 'De 143 M à 86 M', text: 'Le nombre de jeunes qui ne savent ni lire ni écrire est passé de 143 millions en 2000 à 86 millions en 2024.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '11 % contre 79 %', text: 'Seulement 11 % des pays à faible revenu exigent que les enseignants du primaire soient titulaires d’une licence, contre 79 % des pays à revenu élevé.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: 'Moins de 5 %', text: 'Moins de 5 % des filles enceintes ou mères en Afrique subsaharienne retournent à l’école.', src: 'Rapport GEM sur le genre de l’UNESCO 2026' },
    { num: 'Divisé par deux', text: 'La Côte d’Ivoire a réduit de moitié ses taux de non-scolarisation des enfants, des adolescents et des jeunes depuis 2000.', src: 'Rapport GEM de l’UNESCO 2026' },
    { num: '2,4 millions', text: 'Environ 2,4 millions de filles en Afghanistan se voient interdire l’accès au secondaire. L’UNESCO avertit que ce nombre pourrait approcher 4 millions d’ici 2030.', src: 'UNESCO, août 2026' }
  ];

  const TIPS = [
    'Mettez votre téléphone dans une autre pièce. Même silencieux, un téléphone posé sur le bureau attire l’attention.',
    'Testez-vous au lieu de relire. Fermez le livre et notez tout ce dont vous vous souvenez.',
    'Espacez vos révisions. De courtes sessions réparties sur plusieurs jours valent mieux qu’un bachotage la veille.',
    'Écrivez un objectif clair pour cette session avant d’appuyer sur démarrer.',
    'Expliquez-le à voix haute. Si vous pouvez l’enseigner simplement, c’est que vous l’avez compris.',
    'Commencez par la tâche la plus difficile tant que votre concentration est fraîche.',
    'Profitez de la pause pour bouger : levez-vous, étirez-vous, buvez de l’eau et regardez au loin.',
    'Mélangez des sujets proches. Alterner entre différents types de problèmes vous aide à savoir quand utiliser chaque méthode.'
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
      v.append(sw, document.createTextNode(String(d.value)), h('small', null, 'millions'));
      lab.append(v, h('span', 'sl-name', d.name));
      labels.appendChild(lab);

      const seg = h('div', 'stack-seg');
      seg.style.flex = d.value + ' 1 0';
      seg.style.background = d.color;
      seg.addEventListener('pointermove', (e) => tip.show('Non scolarisés, 2024', [{ color: d.color, value: d.value + ' millions', label: d.name }], e.clientX, e.clientY));
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
    sv('text', { x: x(2015) + 8, y: y(5), class: 'annot-text' }, svg).textContent = 'ODD adoptés';

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
        d.year === 2015 ? '2015, année d’adoption des ODD' : String(d.year),
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
      row.setAttribute('aria-label', placeLabel(r) + ' : primaire ' + r.primary + '%, premier cycle ' + r.lower + '%, second cycle ' + r.upper + '%');
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

    buildTable($('#regionTable'), ['Région', 'Primaire', 'Premier cycle du secondaire', 'Second cycle du secondaire'],
      REGIONS.map((r) => [r.name, r.primary + '%', r.lower + '%', r.upper + '%']), 'Taux d’achèvement par région, 2024');
  }

  function renderWaffle(host) {
    const v = Number(host.dataset.value);
    for (let i = 0; i < 100; i++) {
      const c = h('i');
      if (i < v) c.className = 'activé';
      host.appendChild(c);
    }
  }

  function renderParity() {
    const host = $('#parityChart');
    PARITY.forEach((p) => {
      const row = h('div', 'parity-row');
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', p.name + ': ' + p.value + ' des plus pauvres achèvent, pour 100 des plus riches');
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
    buildTable($('#parityTable'), ['Niveau', 'Plus pauvres pour 100 plus riches'], PARITY.map((p) => [p.name, String(p.value)]),
      'Achèvement parmi les 20 % les plus pauvres pour 100 des 20 % les plus riches');
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
    { key: null, text: 'enfants commencent ensemble' },
    { key: 'primary', text: 'achèvent l’école primaire' },
    { key: 'lower', text: 'achèvent le premier cycle du secondaire' },
    { key: 'upper', text: 'achèvent le second cycle du secondaire' }
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
      parts.push(placeLabel(r) + ': ' + n + ' sur 100 ' + st.text);
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
    $('#journeyPlay').textContent = finished ? 'Rejouer' : 'Parcourir le chemin';
  }

  function playJourney() {
    stopJourney();
    setStage(0, true);
    Sound.play('start');
    $('#journeyPlay').textContent = 'Arrêter';
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
      const want = idx === 0 ? 'Afrique subsaharienne' : 'Europe et Amérique du Nord';
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
    const yearsWord = years === 1 ? ' an' : ' ans';
    return fill('273 millions d’enfants et de jeunes sont non scolarisés, un chiffre en hausse depuis sept années consécutives, et l’aide à l’éducation recule. Il reste environ {0} avant l’échéance.', years + yearsWord);
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
      if (m.now) b.appendChild(h('span', 'tl-now', 'Vous êtes ici'));
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
    right.append(h('h3', 'tl-card-title', m.title), h('p', 'tl-card-text', milestoneText(m)), h('p', 'tl-card-src', 'Source : ' + m.src));
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
    nav.append(mk('Plus tôt', -1), mk('Plus tard', 1), h('span', 'tl-count', (tlIndex + 1) + ' sur ' + MILESTONES.length));
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
    card.querySelector('.fc-src').textContent = 'Source : ' + f.src;
    $('#factCount').textContent = 'Fait ' + (factPos + 1) + ' sur ' + FACTS.length;
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
    [['outcome', 'Cibles de résultats : ce que le monde doit atteindre'], ['means', 'Moyens de mise en œuvre : comment y parvenir']].forEach((g) => {
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
    $('#targetStatus').textContent = 'Affichage de la cible ' + t.code + ': ' + t.title;
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
    titles.append(h('p', 'td-kind', t.kind === 'outcome' ? 'Cible de résultats' : 'Moyens de mise en œuvre'), h('h2', 'td-title', t.title));
    head.append(h('p', 'td-code', t.code), titles);

    const official = h('blockquote', 'td-official');
    official.append(h('p', null, '“' + t.official + '”'), h('footer', null, 'Formulation officielle de l’ONU pour la cible ' + t.code));

    const grid = h('div', 'td-grid');
    const plain = h('section');
    plain.append(h('h3', 'td-h', 'En termes simples'), h('p', 'td-p', t.plain));
    const measured = h('section');
    measured.append(h('h3', 'td-h', 'Comment elle est mesurée'), h('p', 'td-p', t.measured));
    grid.append(plain, measured);

    const stats = h('section', 'td-section');
    stats.appendChild(h('h3', 'td-h', 'Où en est le monde'));
    const statRow = h('div', 'td-stats');
    t.stats.forEach((s) => {
      const d = h('div');
      d.append(h('p', 'td-stat-num', s.value), h('p', 'td-stat-text', s.text), h('p', 'td-stat-src', 'Source : ' + SOURCE_NAMES[s.src]));
      statRow.appendChild(d);
    });
    stats.appendChild(statRow);

    const act = h('section', 'td-section');
    act.append(h('h3', 'td-h', 'Ce que vous pouvez faire'), h('p', 'td-p', t.action));

    const notes = h('section', 'td-section td-notes');
    const noteId = 'note-' + t.code.replace('.', '-');
    const noteLabel = h('label', 'td-h', 'Vos notes sur la cible ' + t.code);
    noteLabel.htmlFor = noteId;
    const area = h('textarea', 'td-note');
    area.id = noteId;
    area.rows = 4;
    area.maxLength = 1000;
    area.placeholder = 'Qu’est-ce qui vous a surpris ? Que pourraient faire votre école ou votre ville ?';
    const savedNotes = store.get('sdg4.notes', {}) || {};
    area.value = typeof savedNotes[t.code] === 'string' ? savedNotes[t.code] : '';
    const noteStatus = h('p', 'td-note-status', area.value ? 'Enregistré sur cet appareil.' : 'Vous seul pouvez voir ces notes. Elles restent sur cet appareil.');
    area.addEventListener('input', () => {
      const all = store.get('sdg4.notes', {}) || {};
      if (area.value.trim()) all[t.code] = area.value;
      else delete all[t.code];
      store.set('sdg4.notes', all);
      noteStatus.textContent = 'Enregistré sur cet appareil.';
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
    nav.append(makeBtn('Cible précédente', -1), h('span', 'td-count', (vis.indexOf(targetIndex) + 1) + ' sur ' + vis.length), makeBtn('Cible suivante', 1));

    body.append(head, official, grid, stats, act, notes, nav);
    host.appendChild(body);
  }

  /* ------------------------------------------------------------------ */
  /* Quiz                                                                */
  /* ------------------------------------------------------------------ */
  const MODES = {
    classic: { name: 'Classique', tag: 'Détendu', count: 10, timed: false, lifeline: false, desc: '10 questions au hasard sans chronomètre. Prenez votre temps et lisez chaque explication.' },
    challenge: { name: 'Défi', tag: 'Contre la montre', count: 15, timed: true, seconds: 20, lifeline: true, desc: '15 questions, 20 secondes chacune. Les réponses rapides et les séries rapportent des points bonus, et vous disposez d’un 50:50.' },
    marathon: { name: 'Marathon', tag: 'Toute la banque de questions', count: Infinity, timed: false, lifeline: false, desc: null }
  };
  const CHAPTER_MODE = { name: 'Chapitre', tag: 'Chapitre', count: Infinity, timed: false, lifeline: false, desc: null };
  const modeInfo = (key) => (key === 'chapter' ? CHAPTER_MODE : MODES[key]);
  const CHAPTER_ORDER = ['L’objectif', 'Accès', 'Achèvement', 'Apprentissage', 'Compétences', 'Équité', 'Enseignants', 'Argent et écoles', 'Histoire', 'Les premières années', 'Alphabétisation', 'Inclusion'];
  const BOARD_KEY = 'sdg4.quiz.board';
  const BOARD_TABS = [
    { key: 'challenge', label: 'Défi' },
    { key: 'classic', label: 'Classique' },
    { key: 'marathon', label: 'Marathon' },
    { key: 'chapters', label: 'Chapitres' }
  ];
  let boardGroup = 'challenge';
  let lastSavedAt = 0;
  const TIERS = [
    { title: 'Score parfait', text: 'Vous connaissez l’ODD 4 sur le bout des doigts. Prêt à faire la leçon à la classe ?' },
    { title: 'Excellent travail', text: 'Vous connaissez l’objectif, ses cibles et les chiffres qui les sous-tendent.' },
    { title: 'Bon travail', text: 'Une bonne maîtrise de l’ODD 4. Les sections Explorer et Cibles peuvent combler les lacunes.' },
    { title: 'On y arrive', text: 'Consultez le tableau de bord et les cibles, puis réessayez.' },
    { title: 'Continuez d’apprendre', text: 'Explorez le tableau de bord et les dix cibles, puis retentez votre chance.' }
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
      const desc = M.desc || 'Les ' + QUIZ.length + ' questions d’un coup. Jusqu’où ira ta série ?';
      const best = bests[key];
      const bestText = typeof best === 'number' ? (M.timed ? 'Meilleur : ' + numberFmt.format(best) + ' points' : 'Meilleur : ' + best + ' sur ' + count) : 'Pas encore de score';
      const b = h('button', 'mode-card' + (key === 'challenge' ? ' is-featured' : ''));
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', 'Jouer'));
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
      b.textContent = 'Série ' + quiz.streak + mult;
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
    ll.textContent = 'Utiliser le 50:50';
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
    $('#qpText').textContent = 'Question ' + (quiz.i + 1) + ' sur ' + total;
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
    ll.textContent = '50:50 utilisé';
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
    if (correct) verdict = M.timed ? 'Bonne réponse ! +' + gained + ' points' + (mult > 1 ? fill(' avec un bonus de série ×{0}', mult) : '') : 'Bonne réponse !';
    else if (timedOut) verdict = 'Temps écoulé. La réponse est ' + q.options[q.answer] + '.';
    else verdict = 'Pas tout à fait. La réponse est ' + q.options[q.answer] + '.';

    const fb = $('#quizFeedback');
    fb.textContent = '';
    fb.append(h('p', 'fb-verdict', verdict), h('p', 'fb-text', q.explain), h('p', 'fb-src', 'Source : ' + q.src));
    fb.hidden = false;
    $('#qpScore').textContent = scoreText();
    if (gained) popPoints('+' + gained);
    renderStreak(correct);
    $('#qpFill').style.width = ((quiz.i + 1) / quiz.order.length) * 100 + '%';
    if (M.lifeline) $('#lifelineBtn').disabled = true;
    const next = $('#quizNext');
    next.textContent = quiz.i === quiz.order.length - 1 ? 'Voir mon score' : 'Question suivante';
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
      const bestText = typeof best === 'number' ? 'Meilleur : ' + best + ' sur ' + total : 'Pas encore joué';
      const b = h('button', 'chapter-card');
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', 'Jouer'));
      b.append(h('span', 'ch-num', 'Chapitre ' + (n + 1)), h('span', 'mc-name', cat), h('span', 'ch-count', total + ' questions'), foot);
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
      const score = e.group === 'challenge' ? numberFmt.format(e.score) + ' points' : e.correct + ' sur ' + e.of;
      const meta = e.label + ' · ' + (e.group === 'challenge' ? e.correct + ' sur ' + e.of + ' justes · ' : '') + dateText(e.t);
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
      btn.textContent = 'Appuyez à nouveau pour effacer tous les scores';
      btn.classList.add('is-armed');
      clearTimer = setTimeout(() => {
        clearTimer = 0;
        btn.textContent = 'Effacer le classement';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(clearTimer);
    clearTimer = 0;
    store.set(BOARD_KEY, []);
    btn.textContent = 'Effacer le classement';
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
      $('#ssMsg').textContent = 'Saisissez d’abord un nom.';
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
    $('#ssMsg').textContent = 'Enregistré. Vous êtes le numéro ' + rank + ' au classement ' + tabLabel + '.';
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
    $('#flashCount').textContent = (fcState.i + 1) + ' sur ' + total;
    $('#flashFill').style.width = ((fcState.i + 1) / total) * 100 + '%';
    $('#flashCat').textContent = q.cat;
    $('#flashFront').textContent = q.q;
    const answer = $('#flashAnswer');
    answer.textContent = '';
    answer.append(h('span', 'fa-answer', q.options[q.answer]), h('span', 'fa-why', q.explain + ' Source : ' + q.src + '.'));
    $('#flashPrev').disabled = fcState.i === 0;
    $('#flashNext').textContent = fcState.i === total - 1 ? 'Recommencer' : 'Carte suivante';
    fcShowAnswer(false);
  }

  function fcShowAnswer(show) {
    $('#flashFront').hidden = show;
    $('#flashAnswer').hidden = !show;
    $('#flashCard').setAttribute('aria-expanded', String(show));
    if (show) {
      const idx = ALL_QUIZ.indexOf(QUIZ[fcState.order[fcState.i]]); // position in the full bank, which does not change
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
    const label = quiz.mode === 'chapter' ? fill('le chapitre {0}', quiz.chapter) : fill('mode {0}', M.name);
    const score = M.timed ? numberFmt.format(quiz.points) + ' points' : quiz.correct + ' sur ' + total;
    const text = 'J’ai obtenu ' + score + ' au quiz ODD 4 (' + label + ') sur Éducation de qualité pour tous. Peux-tu faire mieux ?';
    const msg = $('#shareMsg');
    msg.hidden = false;
    msg.textContent = '';
    if (navigator.share) {
      navigator.share({ title: 'Quiz SDG 4', text }).then(
        () => { msg.textContent = 'Partagé.'; },
        () => { msg.textContent = ''; }
      );
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { msg.textContent = 'Copié. Collez-le n’importe où pour partager votre score.'; },
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
    chapterEl.textContent = quiz.chapter ? 'Chapitre : ' + quiz.chapter : '';
    $('#rsTitle').textContent = tier.title;
    $('#rsText').textContent = tier.text;

    const stats = $('#resultStats');
    stats.textContent = '';
    const addStat = (value, label) => {
      const d = h('div', 'rstat');
      d.append(h('b', null, value), h('span', null, label));
      stats.appendChild(d);
    };
    addStat(Math.round(ratio * 100) + '%', 'bien répondues');
    addStat(String(quiz.bestStreak), 'meilleure série');
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
      topics = 'Thème le plus solide : ' + strong + ' (' + byCat[strong].right + ' sur ' + byCat[strong].all + ').';
      if (weak !== strong && sc(weak) < 1) topics += ' À revoir : ' + weak + ' (' + byCat[weak].right + ' sur ' + byCat[weak].all + ').';
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
    sendQuizScore({ pct: Math.round(ratio * 100), correct: quiz.correct, total, chapter: quiz.chapter || '', at: new Date().toISOString() });

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
    reviewBtn.textContent = 'Revoir les réponses';
    quiz.answers.forEach((a) => {
      const q = QUIZ[a.qi];
      const li = h('li');
      const mk = h('span', 'rv-mark' + (a.correct ? '' : ' is-wrong'));
      const s = sv('svg', { viewBox: '0 0 30 30', 'aria-hidden': 'true' }, mk);
      sv('path', { d: a.correct ? MARKS.tick : MARKS.cross }, s);
      mk.appendChild(h('span', 'visually-hidden', a.correct ? 'Correct' : 'Incorrect'));
      const body = h('div');
      let line;
      if (a.correct) line = 'Votre réponse : ' + q.options[a.chosen] + '.';
      else if (a.timedOut) line = 'Pas de réponse : temps écoulé. Bonne réponse : ' + q.options[q.answer] + '.';
      else line = 'Votre réponse : ' + q.options[a.chosen] + '. Bonne réponse : ' + q.options[q.answer] + '.';
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
  const MODE_LABEL = { focus: 'Concentration', short: 'Pause courte', long: 'Pause longue' };
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
    if (timer.mode === 'focus') return 'Session ' + Math.min(timer.cycle + 1, every) + ' sur ' + every;
    if (timer.mode === 'short') return 'Levez-vous, étirez-vous et buvez un peu d’eau';
    return 'Cycle terminé. Profitez d’un vrai repos';
  }

  function renderCycle() {
    const host = $('#cycleDots');
    host.textContent = '';
    const done = Math.min(timer.cycle, timer.s.every);
    for (let i = 0; i < timer.s.every; i++) {
      const dot = h('span');
      if (i < done) dot.className = 'activé';
      host.appendChild(dot);
    }
    const left = timer.s.every - done;
    $('#cycleLabel').textContent = left === 0 ? 'C’est l’heure d’une pause longue' : left + (left === 1 ? ' session de concentration' : ' sessions de concentration') + ' avant une pause longue';
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
    $('#tStart').textContent = timer.running ? 'Pause' : (timer.remaining < timer.total ? 'Reprendre' : 'Démarrer');
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
    announce(MODE_LABEL[timer.mode] + ' commencé');
  }
  function pause() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, timer.endAt - Date.now());
    timer.running = false;
    stopClock();
    renderTimer();
    Sound.play('pause');
    announce('En pause');
  }
  const toggleTimer = () => (timer.running ? pause() : start(false));
  function resetTimer() {
    timer.running = false;
    stopClock();
    timer.remaining = timer.total;
    renderTimer();
    Sound.play('tap');
    announce('Minuteur réinitialisé');
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
    announce(completed ? MODE_LABEL[was] + ' terminé. Ensuite : ' + MODE_LABEL[next] + '.' : 'Passé à ' + MODE_LABEL[next] + '.');
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
    { name: 'Achèvement du primaire', a: 77, b: 88 },
    { name: 'Achèvement du premier cycle du secondaire', a: 60, b: 78 },
    { name: 'Achèvement du second cycle du secondaire', a: 37, b: 61 },
    { name: 'Alphabétisation des jeunes', a: 87, b: 93 }
  ];

  const ACTION_GROUPS = [['school', 'À l’école'], ['community', 'Dans votre communauté'], ['voice', 'Prenez la parole']];
  const ACTIONS = [
    { id: 'tutor', group: 'school', target: '4.1', title: 'Lancez un club de tutorat entre pairs', text: 'Aidez les élèves plus jeunes en lecture ou en mathématiques une fois par semaine.' },
    { id: 'books', group: 'school', target: '4.6', title: 'Organisez un échange de livres', text: 'Rassemblez les livres déjà lus et échangez-les à l’heure du déjeuner.' },
    { id: 'include', group: 'school', target: '4.5', title: 'Rendez votre classe plus inclusive', text: 'Invitez quelqu’un de nouveau dans votre groupe et demandez des supports que tout le monde peut utiliser.' },
    { id: 'eco', group: 'school', target: '4.7', title: 'Lancez un club écologique ou sur les enjeux mondiaux', text: 'Intégrez le changement climatique et les droits humains dans les projets de classe.' },
    { id: 'safe', group: 'school', target: '4.a', title: 'Plaidez pour une école sûre', text: 'Signalez les toilettes, rampes ou lumières défectueuses, et soutenez les camarades victimes de harcèlement.' },
    { id: 'teacher', group: 'school', target: '4.c', title: 'Remerciez un enseignant', text: 'Écrivez un mot à un enseignant qui a compté pour vous.' },
    { id: 'read', group: 'community', target: '4.2', title: 'Lire avec de jeunes enfants', text: 'Lisez avec un plus jeune membre de votre famille, ou faites du bénévolat dans un centre d’éveil local.' },
    { id: 'supplies', group: 'community', target: '4.5', title: 'Collectez des fournitures scolaires', text: 'Organisez une collecte de cahiers, de stylos et de sacs pour les élèves qui en ont besoin.' },
    { id: 'skill', group: 'community', target: '4.4', title: 'Enseignez une compétence numérique', text: 'Montrez à un membre de votre famille comment faire une présentation ou rester en sécurité en ligne.' },
    { id: 'scholar', group: 'community', target: '4.b', title: 'Partagez les informations sur les bourses', text: 'Rassemblez les opportunités de bourses et de formations et affichez-les pour votre classe.' },
    { id: 'talk', group: 'voice', target: 'Tous', title: 'Faites un exposé sur l’ODD 4', text: 'Présentez les faits de ce site à votre classe ou lors d’une assemblée.' },
    { id: 'write', group: 'voice', target: 'Financement', title: 'Écrivez à un décideur', text: 'Demandez à vos responsables scolaires ou à votre représentant local de protéger les budgets de l’éducation.' },
    { id: 'share', group: 'voice', target: 'Tous', title: 'Partagez un fait par semaine', text: 'Publiez un fait de la machine à faits, toujours avec sa source.' }
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
    if (label) label.textContent = on ? 'Son activé' : 'Couper le son';
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
    buildTable($('#slopeTable'), ['Année', 'Primaire', 'Premier cycle du secondaire', 'Second cycle du secondaire'],
      TREND.map((d) => [String(d.year), d.primary + '%', d.lower + '%', d.upper + '%']), 'Taux d’achèvement dans le monde');
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
        btn.textContent = open ? 'Afficher le tableau de données' : 'Masquer le tableau de données';
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
      btn.textContent = open ? 'Revoir les réponses' : 'Masquer les réponses';
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
      announce(MODE_LABEL[timer.mode] + ' sélectionné');
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
    l1.append(h('i'), document.createTextNode('Part pour l’année choisie (%)'));
    const l2 = h('span');
    const line = h('i', 'line');
    l2.append(line, document.createTextNode('Niveau en 2000'));
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
      $('#tnStatus').textContent = 'Affichage de ' + y + ': ' + rows.map((r) => r.d.name + ' ' + (y === 2000 ? r.d.a : r.d.b) + '%').join(', ') + '.';
    };
    const stopPlay = () => {
      clearTimeout(playing);
      playing = 0;
      $('#tnPlay').textContent = 'Lancer l’évolution';
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
      $('#tnPlay').textContent = 'Lecture';
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
    const tagText = (a) => (/^\d/.test(a.target) ? 'Cible ' + a.target : a.target === 'Tous' ? 'Toutes les cibles' : a.target);
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
      pickCount.textContent = state.picks.length + ' sur ' + MAX_PICKS + ' choisies';
      const badge = $('#plBadge');
      badge.textContent = state.mine ? 'Votre engagement' : 'Exemple d’engagement : modifiez-le pour qu’il vous ressemble';
      badge.classList.toggle('is-mine', state.mine);
      const list = $('#plList');
      list.textContent = '';
      if (!state.picks.length) {
        list.appendChild(h('li', 'pl-empty', 'Choisissez jusqu’à trois actions pour les ajouter ici.'));
      }
      state.picks.forEach((id) => {
        const a = byId(id);
        const isDone = state.done.indexOf(id) >= 0;
        const li = h('li', 'pl-item' + (isDone ? ' is-done' : ''));
        const text = h('div');
        text.append(h('span', 'pl-item-title', a.title), h('span', 'pl-item-tag', tagText(a)));
        const btn = h('button', 'pl-done', isDone ? 'Terminé' : 'Marquer comme terminé');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(isDone));
        btn.setAttribute('aria-label', (isDone ? 'Terminé : ' : 'Marquer comme terminé : ') + a.title);
        btn.addEventListener('click', () => markDone(id));
        li.append(text, btn);
        list.appendChild(li);
      });
      const done = state.picks.filter((id) => state.done.indexOf(id) >= 0).length;
      const total = state.picks.length;
      $('#plCount').textContent = total ? done + ' sur ' + total + ' terminés' : 'Rien n’est encore choisi';
      $('#plFill').style.width = (total ? (done / total) * 100 : 0) + '%';
      $('#plDate').textContent = state.made ? 'Créé le ' + niceDate(state.made) : 'Enregistré dans ce navigateur dès que vous le modifiez';
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
        status('Vous pouvez choisir jusqu’à trois actions. Retirez-en une d’abord.');
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
        status(all ? 'Tout est terminé. Voilà tout votre engagement.' : 'Bravo. Continuez.');
      }
      save();
      render();
      const again = $('#plList [aria-label$="' + byId(id).title + '"]');
      if (again) again.focus({ preventScroll: true });
    }

    function pledgeText() {
      const lines = ['Mon engagement pour l’ODD 4'];
      if (state.name.trim()) lines.push('Nom : ' + state.name.trim());
      state.picks.forEach((id, i) => {
        const a = byId(id);
        lines.push((i + 1) + '. ' + a.title + (state.done.indexOf(id) >= 0 ? ' (done)' : ''));
      });
      lines.push('Créé le ' + niceDate(state.made || todayISO()) + ' pour Éducation de qualité pour tous, ODD 4.');
      return lines.join('\n');
    }

    nameInput.addEventListener('input', () => {
      state.name = nameInput.value.slice(0, 40);
      save();
      render();
    });

    $('#plCopy').addEventListener('click', () => {
      if (!state.picks.length) {
        status('Choisissez d’abord au moins une action.');
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
        status('Sélectionnez le texte ci-dessous et copiez-le.');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            area.hidden = true;
            status('Copié. Collez-le n’importe où.');
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
      status('Effacé. Choisissez jusqu’à trois actions.');
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
      count.textContent = q ? n + ' sur ' + items.length + ' termes' : items.length + ' termes';
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
      $('#deckStatus').textContent = 'Diapositive ' + (cur + 1) + ' sur ' + total;
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
      const label = fsEl() ? 'Quitter le plein écran' : 'Plein écran';
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
      if (key === 'Accueil') { e.preventDefault(); show(0, -1, false); return; }
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
    const toTop = h('button', 'to-top', 'Haut de page');
    toTop.type = 'button';
    // Inside the page's own .site wrapper, so the bar and button take that page's colours.
    ($('.site') || document.body).append(bar, toTop);
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
    $('#qotdCat').textContent = 'Thème : ' + q.cat;
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
      if (answered) fb.textContent = (answered.correct ? 'Correct. ' : 'Pas tout à fait. ') + q.explain + ' Source : ' + q.src + '.';
    }
    paint();
  }

  /* My progress: badges, a summary, and backup, restore or erase of saved data. */
  const getStats = () => store.get('sdg4.stats', {}) || {};
  const chapterTotal = (cat) => QUIZ.filter((q) => q.cat === cat).length;
  const BADGES = [
    { name: 'Premier quiz', text: 'Terminez un quiz.', earned: () => getStats().quizzes >= 1 },
    { name: 'Manche parfaite', text: 'Répondez correctement à toutes les questions d’un seul quiz.', earned: () => getStats().perfect >= 1 },
    { name: 'En pleine forme', text: 'Atteignez une série de cinq bonnes réponses.', earned: () => getStats().bestStreak >= 5 },
    { name: 'Contre la montre', text: 'Marquez des points en mode Défi.', earned: () => typeof (store.get('sdg4.quiz.bests', {}) || {}).challenge === 'number' },
    {
      name: 'Champion de chapitre', text: 'Répondez correctement à toutes les questions de chaque chapitre.',
      earned: () => {
        const bests = store.get('sdg4.quiz.bests', {}) || {};
        return CHAPTER_ORDER.every((cat) => bests['chapter:' + cat] === chapterTotal(cat));
      }
    },
    { name: 'Maître des cartes mémoire', text: 'Retournez les 52 cartes mémoire.', earned: () => fcSeen().length >= QUIZ.length },
    { name: 'Lecteur de cibles', text: 'Ouvrez les dix cibles.', earned: () => (store.get('sdg4.seen.targets', []) || []).length >= TARGETS.length },
    { name: 'Prise de notes', text: 'Rédigez des notes sur trois cibles.', earned: () => Object.keys(store.get('sdg4.notes', {}) || {}).length >= 3 },
    { name: 'Question du jour', text: 'Répondez à la question du jour.', earned: () => !!store.get('sdg4.qotd', null) },
    { name: 'Heure de concentration', text: 'Étudiez pendant 60 minutes avec le minuteur.', earned: () => getStats().focusMinutes >= 60 },
    { name: 'Faites-le vôtre', text: 'Prenez votre propre engagement sur la page Agir.', earned: () => { const p = store.get('sdg4.pledge', null); return !!(p && p.made); } },
    { name: 'Prenez la parole', text: 'Enregistrez un score dans le classement.', earned: () => readBoard().length > 0 }
  ];

  /* A pop-up when a badge is first earned. Badges already earned are remembered, so they do not pop up again. */
  const BADGE_SEEN_KEY = 'sdg4.badges.got';
  const badgeLine = [];
  let badgeBusy = false;
  let badgeToast = null;
  let badgeHideTimer = null;
  function buildBadgeToast() {
    const box = h('div', 'badge-toast');
    box.id = 'badgeToast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.hidden = true;
    const icon = h('span', 'badge-toast-icon', '★');
    icon.setAttribute('aria-hidden', 'true');
    const body = h('div', 'badge-toast-body');
    const see = h('a', 'badge-toast-link', 'Voir mes badges');
    see.href = 'progress.html';
    body.append(h('p', 'badge-toast-kicker', 'Badge obtenu !'), h('p', 'badge-toast-name'), h('p', 'badge-toast-text'), see);
    const close = h('button', 'badge-toast-close', 'Fermer');
    close.type = 'button';
    close.addEventListener('click', hideBadgeToast);
    box.append(icon, body, close);
    document.body.appendChild(box);
    return box;
  }
  function showNextBadge() {
    if (badgeBusy || !badgeLine.length) return;
    badgeBusy = true;
    const b = badgeLine.shift();
    if (!badgeToast) badgeToast = buildBadgeToast();
    badgeToast.querySelector('.badge-toast-name').textContent = b.name;
    badgeToast.querySelector('.badge-toast-text').textContent = b.text;
    badgeToast.hidden = false;
    badgeToast.classList.remove('is-in');
    void badgeToast.offsetWidth;
    badgeToast.classList.add('is-in');
    badgeHideTimer = setTimeout(hideBadgeToast, 7000);
  }
  function hideBadgeToast() {
    clearTimeout(badgeHideTimer);
    if (badgeToast) badgeToast.hidden = true;
    badgeBusy = false;
    showNextBadge();
  }
  function checkBadges() {
    const now = BADGES.filter((b) => b.earned()).map((b) => b.name);
    const seen = store.get(BADGE_SEEN_KEY, null);
    // First time: remember what is already earned, without a pop-up.
    if (!Array.isArray(seen)) {
      store.set(BADGE_SEEN_KEY, now);
      return;
    }
    const fresh = BADGES.filter((b) => now.indexOf(b.name) >= 0 && seen.indexOf(b.name) < 0);
    if (!fresh.length) return;
    store.set(BADGE_SEEN_KEY, seen.concat(fresh.map((b) => b.name)));
    fresh.forEach((b) => badgeLine.push(b));
    showNextBadge();
  }
  window.addEventListener('sdg4:save', (e) => { if (e.detail !== BADGE_SEEN_KEY) checkBadges(); });
  checkBadges();

  function renderProgress() {
    const stats = getStats();
    const summary = [
      [stats.quizzes || 0, 'quiz terminés'],
      [stats.perfect || 0, 'manches parfaites'],
      [stats.focusMinutes || 0, 'minutes de concentration'],
      [fcSeen().length + ' sur ' + QUIZ.length, 'cartes retournées'],
      [(store.get('sdg4.seen.targets', []) || []).length + ' sur ' + TARGETS.length, 'cibles lues'],
      [Object.keys(store.get('sdg4.notes', {}) || {}).length, 'cibles avec des notes']
    ];
    const sum = $('#progSummary');
    sum.textContent = '';
    summary.forEach(([num, label]) => {
      const d = h('div', 'prog-stat');
      d.append(h('b', null, String(num)), h('span', null, label));
      sum.appendChild(d);
    });
    const earned = BADGES.filter((b) => b.earned()).length;
    $('#badgeCount').textContent = earned + ' sur ' + BADGES.length + ' badges obtenus';
    const grid = $('#badgeGrid');
    grid.textContent = '';
    BADGES.forEach((b) => {
      const got = b.earned();
      const card = h('div', 'badge' + (got ? ' is-earned' : ''));
      card.append(h('span', 'badge-state', got ? 'Obtenu' : 'Pas encore'), h('p', 'badge-name', b.name), h('p', 'badge-text', b.text));
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
    setDataMsg('Vos données ont été enregistrées dans un fichier nommé sdg4-progress.json.');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      const data = parsed && parsed.app === 'sdg4-website' && parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
      if (!data) {
        setDataMsg('Ce fichier n’est pas un fichier de progression SDG 4.');
        return;
      }
      const keys = Object.keys(data).filter((k) => k.indexOf(DATA_PREFIX) === 0);
      keys.forEach((k) => store.set(k, data[k]));
      renderProgress();
      setDataMsg('Importés ' + keys.length + ' éléments enregistrés. Les autres pages les afficheront quand vous les ouvrirez.');
    };
    reader.readAsText(file);
  }

  let eraseTimer = 0;
  function eraseData() {
    const btn = $('#dataReset');
    if (!eraseTimer) {
      btn.textContent = 'Appuyez à nouveau pour tout effacer';
      btn.classList.add('is-armed');
      eraseTimer = setTimeout(() => {
        eraseTimer = 0;
        btn.textContent = 'Effacer mes données sur cet appareil';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(eraseTimer);
    eraseTimer = 0;
    savedKeys().forEach((k) => {
      try { window.localStorage.removeItem(k); } catch (e) { /* storage unavailable */ }
    });
    try { window.localStorage.removeItem(CLOUD_AUTH_KEY); } catch (e) { /* storage unavailable */ }
    btn.textContent = 'Effacer mes données sur cet appareil';
    btn.classList.remove('is-armed');
    renderProgress();
    setDataMsg('Toutes les données enregistrées sur cet appareil ont été effacées.');
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
        $('#certNote').textContent = fill('Obtenez au moins {0} badges pour débloquer votre certificat. Vous en avez {1} pour l’instant.', CERT_MIN_BADGES, earned);
        return;
      }
      if (!name) {
        $('#certNote').textContent = 'Saisissez d’abord votre nom.';
        return;
      }
      store.set('sdg4.quiz.name', name);
      const quizzes = getStats().quizzes || 0;
      $('#certNote').textContent = '';
      $('#certOut').textContent = name;
      $('#certBody').textContent = fill('a étudié l’Objectif de développement durable 4 des Nations unies, Éducation de qualité, et a obtenu {0} badges sur {1} après {2} quiz.', earned, BADGES.length, quizzes);
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

  /* ------------------------------------------------------------------ */
  /* Profile, teacher mode and classrooms                                */
  /* ------------------------------------------------------------------ */
  /* Classrooms live in a shared Firestore database. The site talks to it with plain requests,
     so no extra script is loaded. The keys go below: the project ID and the Web API key from
     the Firebase project. Until they are here, profiles and teacher mode still work on this
     device, and the classroom tools say that they are not set up yet. */
  const CLOUD = { projectId: 'jaspers-website-4ddc6', apiKey: 'AIzaSyDbVIRD2y-pkT5Fk7ZmJUgsTchxbloOPwg' };
  const PROFILE_KEY = 'sdg4.profile';
  const TEACHER_PASSWORD = 'NoHesi12345';
  const JOINED_KEY = 'sdg4.classrooms';
  const CLOUD_AUTH_KEY = 'sdg4cloud.auth';
  const PROFILE_EMOJI = ['🦉', '🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🌟', '🚀', '📚', '🌍', '🎨'];
  const PROFILE_COLOURS = [
    { name: 'Rouge', value: '#861A2B' },
    { name: 'Rose', value: '#B8344A' },
    { name: 'Vert', value: '#1F6F5C' },
    { name: 'Bleu', value: '#2D5BA8' },
    { name: 'Or', value: '#8A5A12' },
    { name: 'Violet', value: '#5B3F8C' }
  ];
  /* No I, L, O, 0 or 1, so that codes are easy to read aloud. */
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CLOUD_OFF = 'Les classes ne sont pas encore configurées sur ce site.';
  const CLOUD_ERROR = 'Impossible de joindre la base de données des classes. Vérifiez votre connexion internet et réessayez.';
  const cloudReady = () => !!(CLOUD.projectId && CLOUD.apiKey);
  /* Untouched copies of the quiz and the facts. A student's device takes turned-off items out of QUIZ and FACTS,
     but the teacher's list always uses these full copies, and their numbers match the build order. */
  const ALL_QUIZ = QUIZ.slice();
  const ALL_FACTS = FACTS.slice();

  const defaultProfile = () => ({ nickname: '', emoji: PROFILE_EMOJI[0], colour: PROFILE_COLOURS[0].value, bio: '', teacher: false });
  const cleanProfile = (p) => ({
    nickname: String(p.nickname || '').trim().replace(/\s+/g, ' ').slice(0, 20),
    emoji: PROFILE_EMOJI.indexOf(p.emoji) >= 0 ? p.emoji : PROFILE_EMOJI[0],
    colour: PROFILE_COLOURS.some((c) => c.value === p.colour) ? p.colour : PROFILE_COLOURS[0].value,
    bio: String(p.bio || '').trim().slice(0, 120),
    teacher: p.teacher === true
  });
  const loadProfile = () => cleanProfile(Object.assign(defaultProfile(), store.get(PROFILE_KEY, {}) || {}));
  const loadJoined = () => {
    const list = store.get(JOINED_KEY, []);
    if (!Array.isArray(list)) return [];
    return list
      .filter((c) => c && typeof c.code === 'string' && /^[A-Z0-9]{6}$/.test(c.code))
      .map((c) => ({ code: c.code, name: String(c.name || 'Classe').slice(0, 60) }));
  };
  const saveJoined = (list) => store.set(JOINED_KEY, list);

  /* Requests to the database. Firestore's REST format wraps every value in a type. */
  async function cloudCall(url, method, body, type, token) {
    const headers = {};
    if (type) headers['Content-Type'] = type;
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(url, { method, headers, body });
    } catch (e) {
      throw new Error('offline');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error && data.error.message) || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* Each browser gets an anonymous account, so a teacher's classrooms belong to that browser.
     The account is kept under its own key, which the progress file does not include. */
  let signingIn = null;
  function cloudAuth() {
    if (!signingIn) signingIn = cloudSignIn().finally(() => { signingIn = null; });
    return signingIn;
  }
  async function cloudSignIn() {
    const key = encodeURIComponent(CLOUD.apiKey);
    const saved = store.get(CLOUD_AUTH_KEY, null);
    if (saved && saved.uid && saved.token && saved.until > Date.now() + 60000) return saved;
    const keep = (uid, token, refresh, seconds) => {
      const auth = { uid, token, refresh, until: Date.now() + Number(seconds) * 1000 };
      store.set(CLOUD_AUTH_KEY, auth);
      return auth;
    };
    if (saved && saved.refresh) {
      try {
        const r = await cloudCall('https://securetoken.googleapis.com/v1/token?key=' + key, 'POST',
          'grant_type=refresh_token&refresh_token=' + encodeURIComponent(saved.refresh),
          'application/x-www-form-urlencoded');
        return keep(r.user_id, r.id_token, r.refresh_token, r.expires_in);
      } catch (e) {
        /* Only a sign-in the database no longer accepts starts a new account. A dropped connection keeps the old one. */
        if (e.status !== 400) throw e;
      }
    }
    const r = await cloudCall('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + key, 'POST',
      JSON.stringify({ returnSecureToken: true }), 'application/json');
    return keep(r.localId, r.idToken, r.refreshToken, r.expiresIn);
  }

  const docsUrl = () => 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(CLOUD.projectId) + '/databases/(default)/documents';
  function fsValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
    return { mapValue: { fields: fsFields(v) } };
  }
  function fsFields(obj) {
    const fields = {};
    Object.keys(obj).forEach((k) => { fields[k] = fsValue(obj[k]); });
    return fields;
  }
  function fsDecode(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsDecode);
    if ('mapValue' in v) return fsRead(v.mapValue.fields);
    return null;
  }
  function fsRead(fields) {
    const out = {};
    Object.keys(fields || {}).forEach((k) => { out[k] = fsDecode(fields[k]); });
    return out;
  }
  const fsId = (doc) => String(doc.name || '').split('/').pop();

  async function fsRequest(method, path, body, query) {
    const auth = await cloudAuth();
    return cloudCall(docsUrl() + path + (query || ''), method,
      body === undefined ? undefined : JSON.stringify(body),
      body === undefined ? '' : 'application/json', auth.token);
  }
  async function fsList(path) {
    const docs = [];
    let token = '';
    for (let page = 0; page < 10; page++) {
      const res = await fsRequest('GET', path, undefined, '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
      (res.documents || []).forEach((d) => docs.push(d));
      token = res.nextPageToken || '';
      if (!token) break;
    }
    return docs;
  }

  function randomCode() {
    const bytes = new Uint32Array(6);
    window.crypto.getRandomValues(bytes);
    let code = '';
    bytes.forEach((b) => { code += CODE_CHARS.charAt(b % CODE_CHARS.length); });
    return code;
  }

  async function cloudMakeClass(name) {
    const uid = (await cloudAuth()).uid;
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomCode();
      try {
        await fsRequest('POST', '/classrooms', { fields: fsFields({ name, teacherUid: uid, created: new Date().toISOString() }) }, '?documentId=' + code);
        return code;
      } catch (e) {
        if (e.status !== 409) throw e; /* 409: that code is already in use, so try another */
      }
    }
    throw new Error('no free code');
  }

  async function cloudMyClasses() {
    const uid = (await cloudAuth()).uid;
    const rows = await fsRequest('POST', ':runQuery', {
      structuredQuery: {
        from: [{ collectionId: 'classrooms' }],
        where: { fieldFilter: { field: { fieldPath: 'teacherUid' }, op: 'EQUAL', value: { stringValue: uid } } }
      }
    });
    return (rows || []).filter((r) => r.document).map((r) => {
      const f = fsRead(r.document.fields);
      return { code: fsId(r.document), name: f.name || 'Classe', created: f.created || '' };
    }).sort((a, b) => (a.created < b.created ? 1 : -1));
  }

  async function cloudRoster(code) {
    const [members, scores] = await Promise.all([
      fsList('/classrooms/' + code + '/members'),
      fsList('/classrooms/' + code + '/scores')
    ]);
    return {
      members: members.map((d) => Object.assign({ uid: fsId(d) }, fsRead(d.fields))),
      scores: scores.map((d) => Object.assign({ id: fsId(d) }, fsRead(d.fields)))
    };
  }

  async function cloudRemoveMember(code, uid) {
    const scores = await fsList('/classrooms/' + code + '/scores');
    const mine = scores.filter((d) => fsRead(d.fields).uid === uid);
    await Promise.all(mine.map((d) => fsRequest('DELETE', '/classrooms/' + code + '/scores/' + fsId(d))));
    await fsRequest('DELETE', '/classrooms/' + code + '/members/' + uid);
  }

  /* Deleting the classroom document does not remove what is stored under it, so each part is removed first. */
  async function cloudDeleteClass(code) {
    const [{ members, scores }, assessments] = await Promise.all([cloudRoster(code), fsList('/classrooms/' + code + '/assessments')]);
    await Promise.all([
      ...scores.map((s) => fsRequest('DELETE', '/classrooms/' + code + '/scores/' + s.id)),
      ...members.map((m) => fsRequest('DELETE', '/classrooms/' + code + '/members/' + m.uid)),
      ...assessments.map((d) => fsRequest('DELETE', '/classrooms/' + code + '/assessments/' + fsId(d)))
    ]);
    await fsRequest('DELETE', '/classrooms/' + code);
  }

  async function cloudPutMember(code, p) {
    const uid = (await cloudAuth()).uid;
    await fsRequest('PATCH', '/classrooms/' + code + '/members/' + uid, {
      fields: fsFields({ uid, nickname: p.nickname, emoji: p.emoji, colour: p.colour, bio: p.bio || '', updated: new Date().toISOString() })
    });
  }

  /* Returns the classroom's name, or null when no classroom has that code. */
  async function cloudJoin(code, p) {
    let doc;
    try {
      doc = await fsRequest('GET', '/classrooms/' + code);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
    await cloudPutMember(code, p);
    return fsRead(doc.fields).name || 'Classe';
  }

  async function cloudLeave(code) {
    const uid = (await cloudAuth()).uid;
    await fsRequest('DELETE', '/classrooms/' + code + '/members/' + uid);
  }

  async function cloudPostScore(code, entry) {
    const uid = (await cloudAuth()).uid;
    await fsRequest('POST', '/classrooms/' + code + '/scores', { fields: fsFields(Object.assign({ uid }, entry)) });
  }

  /* Turned-off pages. Each entry is a page a teacher can switch off, with its file and its English name. */
  const TURNABLE_PAGES = [
    { slug: 'facts', file: 'facts.html', name: 'Les faits' },
    { slug: 'targets', file: 'targets.html', name: 'Les 10 cibles' },
    { slug: 'explore', file: 'explore.html', name: 'Explorer' },
    { slug: 'solutions', file: 'solutions.html', name: 'Solutions' },
    { slug: 'action', file: 'action.html', name: 'Agir' },
    { slug: 'quiz', file: 'quiz.html', name: 'Quiz' },
    { slug: 'english', file: 'english.html', name: 'Apprendre l\'anglais' },
    { slug: 'timer', file: 'timer.html', name: 'Minuteur d’étude' },
    { slug: 'about', file: 'about.html', name: 'À propos' },
    { slug: 'slides', file: 'slides.html', name: 'Diapositives' }
  ];
  const clampList = (v, max) => (Array.isArray(v) ? v : []).slice(0, max);
  const isIndex = (n, size) => Number.isInteger(n) && n >= 0 && n < size;

  /* Classroom settings as the database returns them. Bad values are dropped, so a bad write cannot break a page. */
  function cleanRules(f) {
    return {
      offPages: clampList(f.offPages, 20).filter((s) => TURNABLE_PAGES.some((p) => p.slug === s)),
      offFacts: clampList(f.offFacts, 100).filter((n) => isIndex(n, ALL_FACTS.length)),
      offQuiz: clampList(f.offQuiz, 100).filter((n) => isIndex(n, ALL_QUIZ.length)),
      announcement: String(f.announcement || '').trim().slice(0, 300),
      announcedAt: String(f.announcedAt || '')
    };
  }
  async function cloudClassRules(code) {
    const doc = await fsRequest('GET', '/classrooms/' + code);
    const f = fsRead(doc.fields);
    return Object.assign({ code, name: f.name || 'Classe' }, cleanRules(f));
  }
  /* Writes only the fields named in changes, so the rest of the classroom is left alone. */
  async function cloudSaveSettings(code, changes) {
    const query = '?' + Object.keys(changes).map((n) => 'updateMask.fieldPaths=' + encodeURIComponent(n)).join('&');
    await fsRequest('PATCH', '/classrooms/' + code, { fields: fsFields(changes) }, query);
  }

  /* Assignments. A question is kept in the same shape as a quiz question. */
  function cleanQuestion(q) {
    if (!q || typeof q !== 'object') return null;
    const prompt = String(q.q || '').trim().slice(0, 300);
    const options = clampList(q.options, 4).map((o) => String(o || '').trim().slice(0, 120));
    const answer = Number(q.answer);
    if (!prompt || options.length !== 4 || options.some((o) => !o) || !isIndex(answer, 4)) return null;
    return { q: prompt, options, answer, explain: String(q.explain || '').trim().slice(0, 300) };
  }
  function cleanAssessment(f) {
    return {
      title: String(f.title || 'Devoir').slice(0, 80),
      due: /^\d{4}-\d{2}-\d{2}$/.test(String(f.due || '')) ? String(f.due) : '',
      mode: f.mode === 'custom' ? 'custom' : 'chapters',
      chapters: clampList(f.chapters, 12).filter((c) => CHAPTER_ORDER.indexOf(c) >= 0),
      count: Math.min(52, Math.max(1, Number(f.count) || 10)),
      questions: clampList(f.questions, 60).map(cleanQuestion).filter(Boolean),
      created: String(f.created || '')
    };
  }
  async function cloudAssessments(code) {
    const docs = await fsList('/classrooms/' + code + '/assessments');
    return docs.map((d) => Object.assign({ id: fsId(d) }, cleanAssessment(fsRead(d.fields))))
      .sort((a, b) => (a.created < b.created ? 1 : -1));
  }
  async function cloudAssessment(code, id) {
    const doc = await fsRequest('GET', '/classrooms/' + code + '/assessments/' + id);
    return Object.assign({ id }, cleanAssessment(fsRead(doc.fields)));
  }
  async function cloudMakeAssessment(code, a) {
    const body = Object.assign({}, a, { created: new Date().toISOString() });
    for (let attempt = 0; attempt < 6; attempt++) {
      const id = randomCode();
      try {
        await fsRequest('POST', '/classrooms/' + code + '/assessments', { fields: fsFields(body) }, '?documentId=' + id);
        return id;
      } catch (e) {
        if (e.status !== 409) throw e; /* 409: that id is already in use, so try another */
      }
    }
    throw new Error('no free code');
  }
  async function cloudDeleteAssessment(code, id) {
    await fsRequest('DELETE', '/classrooms/' + code + '/assessments/' + id);
  }
  async function cloudMembers(code) {
    const docs = await fsList('/classrooms/' + code + '/members');
    return docs.map((d) => Object.assign({ uid: fsId(d) }, fsRead(d.fields)));
  }

  /* After a quiz, the score goes to every classroom this device has joined. */
  function sendQuizScore(entry) {
    const msg = $('#classSent');
    if (!msg) return;
    const joined = loadJoined();
    msg.hidden = true;
    msg.textContent = '';
    if (!joined.length || !cloudReady() || !loadProfile().nickname) return;
    msg.hidden = false;
    msg.textContent = 'Envoi de votre score à vos classes…';
    Promise.all(joined.map((c) => cloudPostScore(c.code, entry).then(() => 'sent', (e) => (e.status === 403 || e.status === 404 ? 'left' : 'failed'))))
      .then((states) => {
        const kept = joined.filter((c, i) => states[i] !== 'left');
        if (kept.length !== joined.length) saveJoined(kept);
        const notes = [fill('Score envoyé à {0} classe(s) sur {1}.', states.filter((s) => s === 'sent').length, joined.length)];
        if (states.indexOf('failed') >= 0) notes.push('Certains n’ont pas pu être envoyés. Vérifiez votre connexion et réessayez.');
        if (states.indexOf('left') >= 0) notes.push('Vous ne faites plus partie de l’une d’elles, elle a donc été retirée de cet appareil.');
        msg.textContent = notes.join(' ');
      });
  }

  /* Buttons that need a second tap: the first tap changes the label, the second does the action. */
  function armButton(btn, idle, armed, confirm) {
    if (btn.dataset.armed === '1') {
      disarmButton(btn, idle);
      confirm();
      return;
    }
    btn.dataset.armed = '1';
    btn.classList.add('is-armed');
    btn.textContent = armed;
    setTimeout(() => { if (btn.dataset.armed === '1') disarmButton(btn, idle); }, 4000);
  }
  function disarmButton(btn, idle) {
    btn.dataset.armed = '';
    btn.classList.remove('is-armed');
    btn.textContent = idle;
  }
  function markChoice(host, active) {
    host.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === active)));
  }

  /* Profile */
  let pfPick = { emoji: PROFILE_EMOJI[0], colour: PROFILE_COLOURS[0].value };
  function readProfileForm() {
    return cleanProfile({
      nickname: $('#pfNick').value,
      emoji: pfPick.emoji,
      colour: pfPick.colour,
      bio: $('#pfBio').value,
      teacher: loadProfile().teacher
    });
  }
  function paintPreview(p) {
    const av = $('#pfAvatar');
    av.textContent = p.emoji;
    av.style.setProperty('--av', p.colour);
    $('#pfPreviewName').textContent = p.nickname || 'Votre pseudonyme';
  }
  function buildProfileChoices(p) {
    const emojis = $('#pfEmojis');
    emojis.textContent = '';
    PROFILE_EMOJI.forEach((em, i) => {
      const b = h('button', null, em);
      b.type = 'button';
      b.setAttribute('aria-label', fill('Avatar {0}', i + 1));
      b.setAttribute('aria-pressed', String(em === p.emoji));
      b.addEventListener('click', () => {
        pfPick.emoji = em;
        markChoice(emojis, b);
        paintPreview(readProfileForm());
      });
      emojis.appendChild(b);
    });
    const colours = $('#pfColours');
    colours.textContent = '';
    PROFILE_COLOURS.forEach((c) => {
      const b = h('button', 'pf-swatch');
      b.type = 'button';
      b.style.setProperty('--sw', c.value);
      b.setAttribute('aria-label', c.name);
      b.setAttribute('aria-pressed', String(c.value === p.colour));
      b.addEventListener('click', () => {
        pfPick.colour = c.value;
        markChoice(colours, b);
        paintPreview(readProfileForm());
      });
      colours.appendChild(b);
    });
  }
  function onSaveProfile(e) {
    e.preventDefault();
    const msg = $('#pfMsg');
    const p = readProfileForm();
    if (!p.nickname) {
      msg.classList.remove('is-ok');
      msg.textContent = 'Saisissez d’abord un pseudonyme.';
      $('#pfNick').focus();
      return;
    }
    store.set(PROFILE_KEY, p);
    paintPreview(p);
    msg.classList.add('is-ok');
    msg.textContent = 'Enregistré.';
    const joined = loadJoined();
    if (!joined.length || !cloudReady()) return;
    msg.textContent = 'Enregistrement dans vos classes…';
    Promise.all(joined.map((c) => cloudPutMember(c.code, p))).then(
      () => { msg.textContent = 'Enregistré. Vos classes ont votre nouveau profil.'; },
      () => {
        msg.classList.remove('is-ok');
        msg.textContent = 'Enregistré sur cet appareil, mais vos classes n’ont pas pu être mises à jour.';
      }
    );
  }

  /* Teacher mode */
  function showTeacher(on) {
    $('#teacherPanel').hidden = !on;
    $('#pfTeacher').checked = on;
    $('#pfTeacherState').textContent = on ? 'activé' : 'désactivé';
    if (on) renderClassList();
  }
  function onTeacherToggle(on) {
    const p = loadProfile();
    p.teacher = on;
    store.set(PROFILE_KEY, p);
    showTeacher(on);
  }

  let myClasses = [];
  let openCode = '';
  async function renderClassList() {
    const list = $('#clsList');
    const note = (text) => {
      list.textContent = '';
      list.appendChild(h('li', 'pf-empty', text));
    };
    if (!cloudReady()) {
      note(CLOUD_OFF);
      return;
    }
    note('Chargement de vos classes…');
    try {
      myClasses = await cloudMyClasses();
    } catch (e) {
      note(CLOUD_ERROR);
      return;
    }
    list.textContent = '';
    if (!myClasses.length) {
      note('Vous n’avez pas encore créé de classe.');
      return;
    }
    myClasses.forEach((c) => {
      const li = h('li');
      const info = h('div');
      const code = h('span', null, 'Code ');
      code.appendChild(h('span', 'cls-code', c.code));
      info.append(h('b', null, c.name), code);
      const open = h('button', 'btn-outline', 'Ouvrir');
      open.type = 'button';
      open.dataset.open = c.code;
      li.append(info, open);
      list.appendChild(li);
    });
  }
  async function onMakeClass(e) {
    e.preventDefault();
    const msg = $('#createMsg');
    const input = $('#clsName');
    const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!cloudReady()) {
      msg.textContent = CLOUD_OFF;
      return;
    }
    if (!name) {
      msg.textContent = 'Saisissez d’abord un nom pour la classe.';
      input.focus();
      return;
    }
    msg.textContent = 'Création de votre classe…';
    try {
      const code = await cloudMakeClass(name);
      input.value = '';
      msg.textContent = fill('Votre classe est prête. Le code est {0}.', code);
      myClasses.unshift({ code, name, created: new Date().toISOString() });
      openClassroom(code);
      renderClassList();
    } catch (err) {
      msg.textContent = CLOUD_ERROR;
    }
  }
  async function openClassroom(code) {
    const cls = myClasses.find((c) => c.code === code) || { code, name: 'Classe' };
    openCode = code;
    showClassQr(false);
    $('#clsDetail').hidden = false;
    $('#clsDetailName').textContent = cls.name;
    $('#clsDetailCode').textContent = code;
    disarmButton($('#clsDelete'), 'Supprimer la classe');
    $('#clsDetail').scrollIntoView({ behavior: smooth, block: 'start' });
    asgDraft = [];
    renderDraft();
    await Promise.all([loadRoster(), loadClassSettings(code)]);
  }
  async function loadRoster() {
    const code = openCode;
    const msg = $('#clsDetailMsg');
    const host = $('#clsRoster');
    if (!code) return;
    msg.classList.remove('is-ok');
    msg.textContent = 'Chargement des scores…';
    try {
      const [{ members, scores }, assessments] = await Promise.all([cloudRoster(code), cloudAssessments(code)]);
      if (code !== openCode) return;
      rosterData = { members, scores, assessments };
      host.textContent = '';
      renderAssignmentList(assessments, scores);
      renderProgressPick();
      if (!members.length) {
        msg.textContent = 'Personne n’a encore rejoint la classe. Partagez le code avec votre classe.';
        return;
      }
      msg.textContent = fill('{0} élèves et {1} quiz jusqu’à présent.', members.length, scores.length);
      const table = h('table');
      const headRow = h('tr');
      ['Élève', 'Quiz', 'Moyenne', 'Meilleur', 'Dernier', ''].forEach((t) => {
        const th = h('th', null, t);
        th.scope = 'col';
        headRow.appendChild(th);
      });
      table.appendChild(h('thead')).appendChild(headRow);
      const tbody = h('tbody');
      members.sort((a, b) => String(a.nickname || '').localeCompare(String(b.nickname || ''))).forEach((m) => {
        const mine = scores.filter((s) => s.uid === m.uid).sort((a, b) => (a.at > b.at ? 1 : -1));
        const pcts = mine.map((s) => Number(s.pct) || 0);
        const row = h('tr');
        const name = h('th', null, (m.emoji ? m.emoji + ' ' : '') + (m.nickname || 'Élève'));
        name.scope = 'row';
        row.appendChild(name);
        [
          pcts.length ? String(pcts.length) : '–',
          pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) + '%' : '–',
          pcts.length ? Math.max(...pcts) + '%' : '–',
          pcts.length ? pcts[pcts.length - 1] + '%' : '–'
        ].forEach((cell) => row.appendChild(h('td', null, cell)));
        const td = h('td');
        const remove = h('button', null, 'Retirer');
        remove.type = 'button';
        remove.dataset.remove = m.uid;
        td.appendChild(remove);
        row.appendChild(td);
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      host.appendChild(table);
    } catch (e) {
      msg.textContent = CLOUD_ERROR;
    }
  }
  function renderJoined() {
    const list = $('#joinedList');
    list.textContent = '';
    const joined = loadJoined();
    if (!joined.length) {
      list.appendChild(h('li', 'pf-empty', 'Vous n’avez pas encore rejoint de classe.'));
      return;
    }
    joined.forEach((c) => {
      const li = h('li');
      const info = h('div');
      const code = h('span', null, 'Code ');
      code.appendChild(h('span', 'cls-code', c.code));
      info.append(h('b', null, c.name), code);
      const leave = h('button', 'btn-ghost', 'Quitter');
      leave.type = 'button';
      leave.dataset.leave = c.code;
      li.append(info, leave);
      list.appendChild(li);
    });
  }
  async function onJoin(e) {
    e.preventDefault();
    const input = $('#joinCode');
    const msg = $('#joinMsg');
    const code = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    input.value = code;
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      msg.textContent = 'Un code de classe comporte six lettres ou chiffres.';
      input.focus();
      return;
    }
    const p = loadProfile();
    if (!p.nickname) {
      msg.textContent = 'Enregistrez un pseudonyme dans votre profil avant de rejoindre une classe.';
      return;
    }
    if (!cloudReady()) {
      msg.textContent = CLOUD_OFF;
      return;
    }
    if (loadJoined().some((c) => c.code === code)) {
      msg.textContent = 'Vous avez déjà rejoint cette classe.';
      return;
    }
    msg.textContent = 'Inscription…';
    try {
      const name = await cloudJoin(code, p);
      if (name === null) {
        msg.textContent = 'Aucune classe n’a ce code. Vérifiez-le auprès de votre enseignant.';
        return;
      }
      saveJoined(loadJoined().concat([{ code, name }]));
      input.value = '';
      msg.textContent = fill('Vous avez rejoint {0}.', name);
      renderJoined();
      refreshClassLists();
    } catch (err) {
      msg.textContent = CLOUD_ERROR;
    }
  }

  /* Join QR code: the teacher shows a code on screen. A student who scans it opens the profile page
     with the classroom code filled in, and joins once a nickname is saved. */
  const SITE_ADDRESS_KEY = 'sdg4.siteAddress';
  const JOIN_CODE_RE = /^[A-Z0-9]{6}$/;
  const QR_QUIET = 4; // blank border, in modules, that scanners expect around the code

  function savedSiteAddress() {
    try { return window.localStorage.getItem(SITE_ADDRESS_KEY) || ''; } catch (e) { return ''; }
  }
  function rememberSiteAddress(value) {
    try { window.localStorage.setItem(SITE_ADDRESS_KEY, value); } catch (e) { /* storage unavailable */ }
  }
  // The profile page of this site when it is opened online. On a local copy the teacher types the address.
  function thisPageAddress() {
    return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
  }
  // The address students open for this classroom, built from what the teacher typed. '' if it is not a web address.
  function joinLink(code) {
    let raw = ($('#clsSite').value || '').trim();
    if (!raw || /\s/.test(raw)) return '';
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    let u;
    try { u = new URL(raw); } catch (e) { return ''; }
    if (!/^https?:$/.test(u.protocol)) return '';
    if (u.hostname !== 'localhost' && u.hostname.indexOf('.') < 1) return '';
    if (!/\.html$/i.test(u.pathname)) u.pathname = u.pathname.replace(/\/?$/, '/') + 'profile.html';
    u.search = '?join=' + code;
    u.hash = '';
    return u.href;
  }
  // Draws the QR code for the open classroom, or says what is missing.
  function drawClassQr() {
    const link = joinLink(openCode);
    const box = $('#clsQrBox');
    const msg = $('#clsQrMsg');
    box.textContent = '';
    $('#clsLink').textContent = link;
    $('#clsQrCopy').disabled = !link;
    if (!link) {
      msg.textContent = 'Saisissez l\'adresse de votre site web, par exemple https://votre-site.example';
      return;
    }
    if (!window.SDG4QR) {
      msg.textContent = 'Le code QR n\'a pas pu se charger. Actualisez la page et réessayez.';
      return;
    }
    msg.textContent = '';
    const qr = SDG4QR.encode(link);
    const size = qr.size + QR_QUIET * 2;
    const svg = sv('svg', { viewBox: '0 0 ' + size + ' ' + size, 'shape-rendering': 'crispEdges' }, box);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Code QR pour rejoindre cette classe');
    sv('rect', { x: 0, y: 0, width: size, height: size, fill: '#ffffff' }, svg);
    let d = '';
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.dark(r, c)) d += 'M' + (c + QR_QUIET) + ' ' + (r + QR_QUIET) + 'h1v1h-1z';
      }
    }
    sv('path', { d: d, fill: '#111111' }, svg);
  }
  function showClassQr(show) {
    const btn = $('#clsQrBtn');
    $('#clsQr').hidden = !show;
    btn.textContent = show ? 'Masquer le code QR' : 'Afficher le code QR';
    btn.setAttribute('aria-expanded', String(show));
    if (show) drawClassQr();
  }
  function copyJoinLink() {
    const link = joinLink(openCode);
    const msg = $('#clsQrMsg');
    if (!link) return;
    try {
      navigator.clipboard.writeText(link).then(
        () => { msg.textContent = 'Lien copié.'; },
        () => { msg.textContent = 'Sélectionnez le lien et copiez-le.'; }
      );
    } catch (e) {
      msg.textContent = 'Sélectionnez le lien et copiez-le.';
    }
  }
  // A student who scans the code lands on ?join=CODE. The code is filled in and the student joins
  // straight away if a nickname is saved; otherwise they are asked to save one first.
  function joinFromLink() {
    const raw = (new URLSearchParams(location.search).get('join') || '').trim().toUpperCase();
    if (!JOIN_CODE_RE.test(raw)) return;
    try { window.history.replaceState(null, '', location.pathname); } catch (e) { /* keep the address as it is */ }
    $('#joinCode').value = raw;
    $('#joinForm').scrollIntoView({ behavior: 'auto', block: 'center' });
    if (loadProfile().nickname) {
      $('#joinForm').dispatchEvent(new Event('submit', { cancelable: true }));
    } else {
      $('#joinMsg').textContent = 'Enregistrez un pseudo ci-dessus, puis appuyez sur Rejoindre pour entrer dans la classe.';
    }
  }

  /* Settings a student gets from their classrooms. They are saved on the device, so a page still
     knows them when the database cannot be reached. */
  const RULES_KEY = 'sdg4.classRules';
  const NOTICE_KEY = 'sdg4.classNoticeSeen';
  const ASG_KEY = 'sdg4.assignments';
  const byName = (a, b) => String(a.nickname || '').localeCompare(String(b.nickname || ''));
  function cachedRules() {
    const all = store.get(RULES_KEY, {}) || {};
    return loadJoined().map((c) => all[c.code]).filter(Boolean);
  }
  async function refreshClassRules() {
    const joined = loadJoined();
    if (!joined.length || !cloudReady()) return;
    const found = {};
    await Promise.all(joined.map((c) => cloudClassRules(c.code).then((r) => { found[c.code] = r; }, () => {})));
    const all = store.get(RULES_KEY, {}) || {};
    const kept = {};
    joined.forEach((c) => {
      if (found[c.code]) kept[c.code] = found[c.code];
      else if (all[c.code]) kept[c.code] = all[c.code];
    });
    store.set(RULES_KEY, kept);
  }
  /* What the student's classrooms have turned off, joined across all of them. */
  function turnedOff() {
    const out = { pages: new Set(), facts: new Set(), quiz: new Set() };
    cachedRules().forEach((r) => {
      r.offPages.forEach((s) => out.pages.add(s));
      r.offFacts.forEach((n) => out.facts.add(n));
      r.offQuiz.forEach((n) => out.quiz.add(n));
    });
    return out;
  }
  /* Takes turned-off facts and quiz questions out of the lists the pages use (the copies in ALL_* stay whole),
     hides the menu links of turned-off pages, and shows the teacher's messages above the page. */
  function applyClassRules() {
    const off = turnedOff();
    if (off.facts.size) FACTS.splice(0, FACTS.length, ...ALL_FACTS.filter((f, i) => !off.facts.has(i)));
    if (off.quiz.size) QUIZ.splice(0, QUIZ.length, ...ALL_QUIZ.filter((q, i) => !off.quiz.has(i)));
    TURNABLE_PAGES.forEach((p) => {
      if (off.pages.has(p.slug)) $$('a[href="' + p.file + '"]').forEach((a) => { a.hidden = true; });
    });
    showAnnouncements();
  }
  function showAnnouncements() {
    const anchor = $('main') || $('.site');
    if (!anchor) return;
    const seen = store.get(NOTICE_KEY, {}) || {};
    cachedRules().filter((r) => r.announcement).forEach((r) => {
      const key = r.announcedAt || r.announcement;
      if (seen[r.code] === key) return;
      const box = h('section', 'class-note');
      box.setAttribute('aria-label', 'Message de votre enseignant');
      const close = h('button', 'btn-ghost', 'Fermer');
      close.type = 'button';
      close.addEventListener('click', () => {
        box.remove();
        const all = store.get(NOTICE_KEY, {}) || {};
        all[r.code] = key;
        store.set(NOTICE_KEY, all);
      });
      box.append(h('p', 'class-note-title', fill('Message de votre enseignant dans {0}', r.name)), h('p', 'class-note-text', r.announcement), close);
      anchor.parentNode.insertBefore(box, anchor);
    });
  }
  function pageIsOff() { return turnedOff().pages.has(PAGE); }
  function showOffPage() {
    const host = $('main') || $('.site');
    if (!host) return;
    host.textContent = '';
    const back = h('a', 'btn-primary', 'Aller à la page d’accueil');
    back.href = 'index.html';
    const box = h('section', 'off-page');
    box.append(h('h1', 'off-page-title', 'Cette page est désactivée'), h('p', 'block-note', 'Votre enseignant a désactivé cette page pour votre classe.'), back);
    host.appendChild(box);
  }

  /* Teacher: the open classroom's settings, assignments, progress and spreadsheet. */
  let rosterData = null; // { members, scores, assessments } for the open classroom
  let asgDraft = [];     // questions written so far for a new assignment
  const shortText = (text, n) => (text.length > n ? text.slice(0, n - 1) + '…' : text);
  function pickBox(kind, value, label, checked) {
    const row = h('label', 'pick');
    const box = h('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.dataset.kind = kind;
    box.value = String(value);
    row.append(box, h('span', null, label));
    return row;
  }
  function picked(id, asNumber) {
    return Array.from($(id).querySelectorAll('input:checked')).map((b) => (asNumber ? Number(b.value) : b.value));
  }
  function renderRules(r) {
    $('#clsAnnounce').value = r.announcement;
    const pages = $('#clsOffPages');
    pages.textContent = '';
    TURNABLE_PAGES.forEach((p) => pages.appendChild(pickBox('page', p.slug, p.name, r.offPages.indexOf(p.slug) >= 0)));
    const facts = $('#clsOffFacts');
    facts.textContent = '';
    ALL_FACTS.forEach((f, i) => facts.appendChild(pickBox('fact', i, (i + 1) + '. ' + shortText(f.num + ': ' + f.text, 120), r.offFacts.indexOf(i) >= 0)));
    const quiz = $('#clsOffQuiz');
    quiz.textContent = '';
    ALL_QUIZ.forEach((q, i) => quiz.appendChild(pickBox('quiz', i, (i + 1) + '. ' + q.cat + ': ' + shortText(q.q, 110), r.offQuiz.indexOf(i) >= 0)));
  }
  async function loadClassSettings(code) {
    try {
      const r = await cloudClassRules(code);
      if (code === openCode) renderRules(r);
    } catch (e) {
      if (code === openCode) $('#clsRulesMsg').textContent = CLOUD_ERROR;
    }
  }
  function saveRules() {
    const msg = $('#clsRulesMsg');
    if (!openCode || !cloudReady()) return;
    const code = openCode;
    const changes = { offPages: picked('#clsOffPages', false), offFacts: picked('#clsOffFacts', true), offQuiz: picked('#clsOffQuiz', true) };
    msg.classList.remove('is-ok');
    msg.textContent = 'Enregistrement…';
    cloudSaveSettings(code, changes).then(() => {
      msg.classList.add('is-ok');
      msg.textContent = 'Enregistré. Les élèves verront le changement la prochaine fois qu’ils ouvriront le site.';
    }, () => {
      msg.classList.remove('is-ok');
      msg.textContent = CLOUD_ERROR;
    });
  }
  function postAnnouncement(text) {
    const msg = $('#clsRulesMsg');
    if (!openCode || !cloudReady()) return;
    const code = openCode;
    const changes = text ? { announcement: text, announcedAt: new Date().toISOString() } : { announcement: '', announcedAt: '' };
    msg.classList.remove('is-ok');
    msg.textContent = text ? 'Publication…' : 'Suppression…';
    cloudSaveSettings(code, changes).then(() => {
      msg.classList.add('is-ok');
      msg.textContent = text ? 'Publié. Les élèves le voient en haut de leurs pages.' : 'Supprimé.';
    }, () => {
      msg.classList.remove('is-ok');
      msg.textContent = CLOUD_ERROR;
    });
  }

  function showAsgMode() {
    const custom = document.querySelector('input[name="asgMode"]:checked').value === 'custom';
    $('#asgChapterPart').hidden = custom;
    $('#asgCustomPart').hidden = !custom;
  }
  function renderDraft() {
    const list = $('#asgQList');
    list.textContent = '';
    asgDraft.forEach((q, i) => {
      const li = h('li');
      const rm = h('button', 'btn-ghost', 'Retirer');
      rm.type = 'button';
      rm.dataset.index = String(i);
      li.append(h('span', null, (i + 1) + '. ' + q.q), rm);
      list.appendChild(li);
    });
  }
  function addDraftQuestion() {
    const msg = $('#asgMsg');
    const q = cleanQuestion({ q: $('#asgQText').value, options: [0, 1, 2, 3].map((i) => $('#asgOpt' + i).value), answer: Number($('#asgCorrect').value), explain: $('#asgExplain').value });
    if (!q) {
      msg.classList.remove('is-ok');
      msg.textContent = 'Tapez d’abord la question et les quatre réponses.';
      $('#asgQText').focus();
      return;
    }
    asgDraft.push(q);
    ['#asgQText', '#asgExplain', '#asgOpt0', '#asgOpt1', '#asgOpt2', '#asgOpt3'].forEach((s) => { $(s).value = ''; });
    $('#asgCorrect').value = '0';
    renderDraft();
    msg.classList.add('is-ok');
    msg.textContent = fill('Question {0} ajoutée.', asgDraft.length);
    $('#asgQText').focus();
  }
  function resetAsgForm() {
    $('#asgTitle').value = '';
    $('#asgDue').value = '';
    $('#asgCount').value = '10';
    $('#asgChapters').querySelectorAll('input').forEach((b) => { b.checked = false; });
    document.querySelector('input[name="asgMode"][value="chapters"]').checked = true;
    asgDraft = [];
    renderDraft();
    showAsgMode();
  }
  async function onSaveAssignment(e) {
    e.preventDefault();
    const msg = $('#asgMsg');
    msg.classList.remove('is-ok');
    if (!openCode || !cloudReady()) {
      msg.textContent = CLOUD_OFF;
      return;
    }
    const title = $('#asgTitle').value.trim().replace(/\s+/g, ' ').slice(0, 80);
    const due = $('#asgDue').value;
    const mode = document.querySelector('input[name="asgMode"]:checked').value;
    if (!title) {
      msg.textContent = 'Tapez d’abord un titre.';
      $('#asgTitle').focus();
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      msg.textContent = 'Choisissez une date limite.';
      $('#asgDue').focus();
      return;
    }
    const a = { title, due, mode, chapters: [], count: 10, questions: [] };
    if (mode === 'custom') {
      if (!asgDraft.length) {
        msg.textContent = 'Ajoutez d’abord au moins une question.';
        return;
      }
      a.questions = asgDraft.slice();
    } else {
      a.chapters = picked('#asgChapters', false);
      if (!a.chapters.length) {
        msg.textContent = 'Cochez au moins un chapitre.';
        return;
      }
      const count = Math.round(Number($('#asgCount').value));
      if (!(count >= 1 && count <= 52)) {
        msg.textContent = 'Choisissez entre 1 et 52 questions.';
        $('#asgCount').focus();
        return;
      }
      a.count = count;
    }
    const code = openCode;
    msg.textContent = 'Création du devoir…';
    $('#asgSave').disabled = true;
    try {
      await cloudMakeAssessment(code, a);
      resetAsgForm();
      msg.classList.add('is-ok');
      msg.textContent = 'Le devoir est créé. Les élèves le voient sur leur page de profil.';
      if (code === openCode) loadRoster();
    } catch (err) {
      msg.textContent = CLOUD_ERROR;
    } finally {
      $('#asgSave').disabled = false;
    }
  }
  function renderAssignmentList(assessments, scores) {
    const list = $('#asgList');
    list.textContent = '';
    if (!assessments.length) {
      list.appendChild(h('li', 'pf-empty', 'Aucun devoir pour le moment.'));
      return;
    }
    assessments.forEach((a) => {
      const pcts = scores.filter((s) => s.assessment === a.id).map((s) => Number(s.pct) || 0);
      const avg = pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) + '%' : '–';
      const scope = a.mode === 'custom' ? fill('{0} questions que vous avez écrites', a.questions.length) : fill('{0} questions tirées de {1} chapitres', a.count, a.chapters.length);
      const info = h('div');
      info.append(h('b', null, a.title), h('span', null, fill('À rendre le {0} · {1}', a.due || 'no date', scope)), h('span', null, fill('{0} élèves ont terminé · moyenne {1}', pcts.length, avg)));
      const del = h('button', 'btn-ghost', 'Supprimer');
      del.type = 'button';
      del.dataset.asg = a.id;
      const li = h('li');
      li.append(info, del);
      list.appendChild(li);
    });
  }
  function renderProgressPick() {
    const sel = $('#clsProgPick');
    const members = rosterData ? rosterData.members.slice().sort(byName) : [];
    const before = sel.value;
    sel.textContent = '';
    members.forEach((m) => {
      const o = h('option', null, m.nickname || 'Élève');
      o.value = m.uid;
      sel.appendChild(o);
    });
    if (members.some((m) => m.uid === before)) sel.value = before;
    renderProgressOut();
  }
  function renderProgressOut() {
    const out = $('#clsProgOut');
    out.textContent = '';
    if (!rosterData || !rosterData.members.length) {
      out.appendChild(h('li', 'pf-empty', 'Personne n’a encore rejoint.'));
      return;
    }
    const uid = $('#clsProgPick').value;
    const mine = rosterData.scores.filter((s) => s.uid === uid && s.chapter && !s.assessment);
    CHAPTER_ORDER.forEach((c) => {
      const tries = mine.filter((s) => s.chapter === c);
      const li = h('li');
      const detail = tries.length
        ? fill('Meilleur {0} % · tentatives : {1}', Math.max(...tries.map((s) => Number(s.pct) || 0)), tries.length)
        : 'Pas encore essayé';
      li.append(h('b', null, c), h('span', null, detail));
      out.appendChild(li);
    });
  }
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    // A cell that starts with = + - or @ would run as a formula in a spreadsheet, so it is shown as text instead.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function downloadScores() {
    const msg = $('#clsDetailMsg');
    if (!rosterData) {
      msg.classList.remove('is-ok');
      msg.textContent = 'Chargez d’abord les notes.';
      return;
    }
    const { members, scores, assessments } = rosterData;
    const rows = [['Élève', 'Quiz', 'Moyenne %', 'Meilleur %', 'Dernier %'].concat(assessments.map((a) => a.title + ' %'))];
    members.slice().sort(byName).forEach((m) => {
      const mine = scores.filter((s) => s.uid === m.uid).sort((a, b) => (a.at > b.at ? 1 : -1));
      const pcts = mine.map((s) => Number(s.pct) || 0);
      const row = [m.nickname || 'Élève', pcts.length, pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) : '',
        pcts.length ? Math.max(...pcts) : '', pcts.length ? pcts[pcts.length - 1] : ''];
      assessments.forEach((a) => {
        const s = mine.find((x) => x.assessment === a.id);
        row.push(s ? Number(s.pct) || 0 : '');
      });
      rows.push(row);
    });
    // The byte order mark lets spreadsheets read names with accents and other letters correctly.
    const text = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = h('a');
    link.href = url;
    link.download = 'sdg4-scores-' + openCode + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    msg.classList.add('is-ok');
    msg.textContent = 'Les notes ont été téléchargées sous forme de feuille de calcul.';
  }

  /* Student: classmates and assignments on the profile page. */
  async function renderClassmates() {
    const block = $('#mateBlock');
    if (!block) return;
    const joined = loadJoined();
    block.hidden = !joined.length || !cloudReady();
    if (block.hidden) return;
    const host = $('#classmates');
    host.textContent = 'Chargement des camarades…';
    let me = '';
    try { me = (await cloudAuth()).uid; } catch (e) { /* show the list without the "you" mark */ }
    const groups = await Promise.all(joined.map((c) => cloudMembers(c.code).then((members) => ({ c, members }), () => ({ c, members: null }))));
    host.textContent = '';
    groups.forEach(({ c, members }) => {
      const sec = h('div', 'mate-group');
      sec.appendChild(h('h3', 'mate-name', c.name));
      if (!members) {
        sec.appendChild(h('p', 'block-note', CLOUD_ERROR));
      } else if (!members.length) {
        sec.appendChild(h('p', 'block-note', 'Personne d’autre n’a encore rejoint.'));
      } else {
        const ul = h('ul', 'mate-list');
        members.sort(byName).forEach((m) => {
          const av = h('span', 'mate-av', m.emoji || PROFILE_EMOJI[0]);
          av.style.setProperty('--av', m.colour || PROFILE_COLOURS[0].value);
          const text = h('div');
          text.appendChild(h('b', null, (m.nickname || 'Élève') + (m.uid === me ? ' (you)' : '')));
          if (m.bio) text.appendChild(h('span', 'mate-bio', m.bio));
          const li = h('li', 'mate');
          li.append(av, text);
          ul.appendChild(li);
        });
        sec.appendChild(ul);
      }
      host.appendChild(sec);
    });
  }
  const asgRecord = (code, id) => (store.get(ASG_KEY, {}) || {})[code + '/' + id] || null;
  function saveAsgRecord(code, id, rec) {
    const all = store.get(ASG_KEY, {}) || {};
    all[code + '/' + id] = rec;
    store.set(ASG_KEY, all);
  }
  /* Today as YYYY-MM-DD, with leading zeros, so it compares with a due date. */
  function isoToday() {
    const d = new Date();
    const two = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
  }
  async function renderStudentAssignments() {
    const block = $('#asgBlock');
    if (!block) return;
    const joined = loadJoined();
    block.hidden = !joined.length || !cloudReady();
    if (block.hidden) return;
    const list = $('#asgStudent');
    list.textContent = '';
    list.appendChild(h('li', 'pf-empty', 'Chargement des devoirs…'));
    const groups = await Promise.all(joined.map((c) => cloudAssessments(c.code).then((items) => items.map((a) => ({ c, a })), () => null)));
    const failed = groups.some((g) => g === null);
    const items = [].concat(...groups.filter(Boolean));
    // Earliest due date first; assignments with no date go last ('~' sorts after the digits of a date).
    items.sort((x, y) => {
      const dx = x.a.due || '~';
      const dy = y.a.due || '~';
      return dx < dy ? -1 : (dx > dy ? 1 : 0);
    });
    list.textContent = '';
    if (!items.length) {
      list.appendChild(h('li', 'pf-empty', failed ? CLOUD_ERROR : 'Aucun devoir pour le moment.'));
      return;
    }
    items.forEach(({ c, a }) => {
      const rec = asgRecord(c.code, a.id);
      const info = h('div');
      info.append(h('b', null, a.title), h('span', null, c.name + ' · ' + (a.due ? fill('À rendre le {0}', a.due) : 'Sans date limite')));
      let action;
      if (rec && rec.finished) action = h('span', 'asg-status', fill('Faite · {0} %', rec.pct));
      else if (rec && rec.started) action = h('span', 'asg-status', 'Commencé');
      else if (a.due && isoToday() > a.due) action = h('span', 'asg-status', 'Fermé');
      else {
        action = h('a', 'btn-primary', 'Démarrer');
        action.href = 'assignment.html?class=' + c.code + '&id=' + a.id;
      }
      const li = h('li');
      li.append(info, action);
      list.appendChild(li);
    });
  }
  function refreshClassLists() {
    renderClassmates();
    renderStudentAssignments();
  }

  /* Assignment page: one attempt per student. The questions come from the chapters the teacher chose,
     with turned-off questions left out, or are the questions the teacher wrote. */
  function assignmentQuestions(a) {
    if (a.mode === 'custom') return a.questions.slice();
    const off = turnedOff().quiz;
    const pool = ALL_QUIZ.filter((q, i) => a.chapters.indexOf(q.cat) >= 0 && !off.has(i));
    return shuffle(pool).slice(0, Math.min(a.count, pool.length))
      .map((q) => ({ q: q.q, options: q.options, answer: q.answer, explain: q.explain }));
  }
  function resultCard(done, title) {
    const box = h('div', 'result en-result');
    const score = h('p', 'en-score');
    score.append(h('span', null, String(done.correct)), h('span', 'en-score-of', '/' + done.total));
    box.append(score, h('p', 'rs-text', title));
    return box;
  }
  function sendAssignmentScore(host, code, a, done) {
    const box = resultCard(done, fill('Vous avez {0} bonne(s) réponse(s) sur {1}.', done.correct, done.total));
    const sent = h('p', 'block-note pf-msg', 'Envoi de votre note à votre enseignant…');
    sent.setAttribute('role', 'status');
    const retry = h('button', 'btn-outline', 'Renvoyer');
    retry.type = 'button';
    retry.hidden = true;
    box.append(sent, retry);
    host.appendChild(box);
    const send = () => {
      retry.hidden = true;
      sent.textContent = 'Envoi de votre note à votre enseignant…';
      cloudPostScore(code, { pct: done.pct, correct: done.correct, total: done.total, chapter: '', assessment: a.id, at: done.at }).then(() => {
        sent.textContent = 'Votre note a été envoyée à votre enseignant.';
      }, (e) => {
        const gone = e.status === 403 || e.status === 404;
        sent.textContent = gone
          ? 'Vous ne faites plus partie de cette classe, la note n’a donc pas pu être envoyée.'
          : 'La note n’a pas pu être envoyée. Vérifiez votre connexion, puis renvoyez-la.';
        retry.hidden = gone;
      });
    };
    retry.addEventListener('click', send);
    send();
  }
  function startAssignment(host, code, a, questions) {
    const rec = { started: new Date().toISOString() };
    saveAsgRecord(code, a.id, rec);
    const progress = h('p', 'qp-text');
    progress.setAttribute('aria-live', 'polite');
    const stage = h('div');
    const nextBtn = h('button', 'btn-primary', 'Question suivante');
    nextBtn.type = 'button';
    nextBtn.hidden = true;
    const actions = h('div', 'quiz-actions');
    actions.append(h('span'), nextBtn);
    host.append(progress, stage, actions);
    let i = 0;
    let right = 0;
    const finish = () => {
      const done = { started: rec.started, finished: true, pct: Math.round((right / questions.length) * 100), correct: right, total: questions.length, at: new Date().toISOString() };
      saveAsgRecord(code, a.id, done);
      host.textContent = '';
      sendAssignmentScore(host, code, a, done);
    };
    const show = () => {
      progress.textContent = fill('Question {0} sur {1}', i + 1, questions.length);
      stage.textContent = '';
      stage.appendChild(h('h3', 'quiz-q', questions[i].q));
      nextBtn.hidden = true;
      englishChoices(questions[i], stage, (correct) => {
        if (correct) right++;
        nextBtn.textContent = i === questions.length - 1 ? 'Voir mon score' : 'Question suivante';
        nextBtn.hidden = false;
      });
    };
    nextBtn.addEventListener('click', () => {
      if (i < questions.length - 1) {
        i++;
        show();
      } else {
        finish();
      }
    });
    show();
  }
  function openAssignment(host, code, a) {
    const head = $('#asgHead');
    if (head) head.textContent = a.title;
    const lead = $('#asgLead');
    if (lead) lead.textContent = a.due ? fill('À rendre le {0}. Vous n’avez qu’une tentative.', a.due) : 'Vous n’avez qu’une tentative.';
    const rec = asgRecord(code, a.id);
    const say = (text) => {
      host.textContent = '';
      host.appendChild(h('p', 'block-note', text));
    };
    if (rec && rec.finished) {
      host.textContent = '';
      host.appendChild(resultCard(rec, fill('Vous avez déjà fait ce devoir : {0} bonnes réponses sur {1} ({2} %).', rec.correct, rec.total, rec.pct)));
      return;
    }
    if (a.due && isoToday() > a.due) {
      say(fill('Ce devoir a été fermé le {0}.', a.due));
      return;
    }
    if (rec && rec.started) {
      say('Vous avez déjà commencé ce devoir sur cet appareil. Une seule tentative est autorisée.');
      return;
    }
    const questions = assignmentQuestions(a);
    if (!questions.length) {
      say('Il n’y a pas de questions pour ce devoir sur cet appareil. Demandez à votre enseignant.');
      return;
    }
    host.textContent = '';
    startAssignment(host, code, a, questions);
  }
  function initAssignment() {
    const host = $('#asgPlay');
    if (!host) return;
    const params = new URLSearchParams(location.search);
    const code = (params.get('class') || '').trim().toUpperCase();
    const id = (params.get('id') || '').trim().toUpperCase();
    const say = (text) => {
      host.textContent = '';
      host.appendChild(h('p', 'block-note', text));
    };
    if (!JOIN_CODE_RE.test(code) || !JOIN_CODE_RE.test(id)) {
      say('Ce lien n’est pas correct. Ouvrez le devoir depuis votre page de profil.');
      return;
    }
    if (!loadJoined().some((c) => c.code === code)) {
      say('Vous n’êtes pas inscrit à cette classe sur cet appareil. Rejoignez-la d’abord sur votre page de profil.');
      return;
    }
    if (!cloudReady()) {
      say(CLOUD_OFF);
      return;
    }
    say('Chargement du devoir…');
    cloudAssessment(code, id).then((a) => openAssignment(host, code, a), (err) => {
      say(err.status === 404 ? 'Ce devoir n’est plus ouvert. Demandez à votre enseignant.' : CLOUD_ERROR);
    });
  }

  /* Wires the teacher's tools on the profile page. */
  function initClassTools() {
    if (!$('#clsDetail')) return;
    const chapters = $('#asgChapters');
    chapters.textContent = '';
    CHAPTER_ORDER.forEach((c) => chapters.appendChild(pickBox('chapter', c, c, false)));
    $('#clsAnnounceSave').addEventListener('click', () => postAnnouncement($('#clsAnnounce').value.trim().slice(0, 300)));
    $('#clsAnnounceClear').addEventListener('click', () => {
      $('#clsAnnounce').value = '';
      postAnnouncement('');
    });
    $('#clsRulesSave').addEventListener('click', saveRules);
    $('#clsCsv').addEventListener('click', downloadScores);
    $('#clsProgPick').addEventListener('change', renderProgressOut);
    $('#asgForm').addEventListener('submit', onSaveAssignment);
    $$('input[name="asgMode"]').forEach((r) => r.addEventListener('change', showAsgMode));
    $('#asgAddQ').addEventListener('click', addDraftQuestion);
    $('#asgQList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-index]');
      if (!btn) return;
      asgDraft.splice(Number(btn.dataset.index), 1);
      renderDraft();
    });
    $('#asgList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-asg]');
      if (!btn || !openCode) return;
      armButton(btn, 'Supprimer', 'Appuyez à nouveau pour supprimer', () => {
        btn.disabled = true;
        const code = openCode;
        cloudDeleteAssessment(code, btn.dataset.asg).then(() => { if (code === openCode) loadRoster(); }, () => {
          btn.disabled = false;
          $('#asgMsg').textContent = CLOUD_ERROR;
        });
      });
    });
    showAsgMode();
  }

  function initProfile() {
    const form = $('#profileForm');
    if (!form) return;
    const p = loadProfile();
    pfPick = { emoji: p.emoji, colour: p.colour };
    $('#pfNick').value = p.nickname;
    $('#pfBio').value = p.bio;
    buildProfileChoices(p);
    paintPreview(p);
    showTeacher(p.teacher);
    $('#pfNick').addEventListener('input', () => paintPreview(readProfileForm()));
    form.addEventListener('submit', onSaveProfile);
    $('#pfTeacher').addEventListener('change', (e) => {
      if (!e.target.checked) {
        onTeacherToggle(false);
        return;
      }
      e.target.checked = false;
      $('#teacherPassForm').hidden = false;
      $('#teacherPass').focus();
    });
    $('#teacherPassForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#teacherPass');
      const msg = $('#teacherPassMsg');
      if (input.value.trim() !== TEACHER_PASSWORD) {
        msg.textContent = 'Ce mot de passe n’est pas correct.';
        input.value = '';
        input.focus();
        return;
      }
      input.value = '';
      msg.textContent = '';
      $('#teacherPassForm').hidden = true;
      onTeacherToggle(true);
    });
    $('#teacherPassCancel').addEventListener('click', () => {
      $('#teacherPass').value = '';
      $('#teacherPassMsg').textContent = '';
      $('#teacherPassForm').hidden = true;
    });
    $('#createForm').addEventListener('submit', onMakeClass);
    $('#clsList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-open]');
      if (btn) openClassroom(btn.dataset.open);
    });
    $('#clsRoster').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-remove]');
      if (!btn || !openCode) return;
      armButton(btn, 'Retirer', 'Appuyez à nouveau pour retirer', () => {
        btn.disabled = true;
        cloudRemoveMember(openCode, btn.dataset.remove)
          .then(loadRoster)
          .catch(() => { $('#clsDetailMsg').textContent = CLOUD_ERROR; });
      });
    });
    $('#clsDelete').addEventListener('click', () => {
      armButton($('#clsDelete'), 'Supprimer la classe', 'Appuyez à nouveau pour supprimer', () => {
        const code = openCode;
        $('#clsDetailMsg').textContent = 'Suppression…';
        cloudDeleteClass(code).then(() => {
          openCode = '';
          $('#clsDetail').hidden = true;
          $('#createMsg').textContent = 'Classe supprimée.';
          renderClassList();
        }, () => { $('#clsDetailMsg').textContent = CLOUD_ERROR; });
      });
    });
    $('#clsCopy').addEventListener('click', () => {
      const msg = $('#clsDetailMsg');
      try {
        navigator.clipboard.writeText(openCode).then(
          () => { msg.textContent = 'Code copié.'; },
          () => { msg.textContent = 'Sélectionnez le code et copiez-le.'; }
        );
      } catch (e) {
        msg.textContent = 'Sélectionnez le code et copiez-le.';
      }
    });
    $('#clsRefresh').addEventListener('click', loadRoster);
    $('#joinForm').addEventListener('submit', onJoin);
    $('#joinedList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-leave]');
      if (!btn) return;
      armButton(btn, 'Quitter', 'Appuyez à nouveau pour quitter', () => {
        const code = btn.dataset.leave;
        const msg = $('#joinMsg');
        const finish = () => {
          saveJoined(loadJoined().filter((c) => c.code !== code));
          renderJoined();
          refreshClassLists();
          msg.textContent = 'Vous avez quitté la classe.';
        };
        if (!cloudReady()) {
          finish();
          return;
        }
        cloudLeave(code).then(finish, (err) => {
          if (err.status === 404) finish();
          else msg.textContent = CLOUD_ERROR;
        });
      });
    });
    $('#clsSite').value = savedSiteAddress() || thisPageAddress();
    $('#clsSite').addEventListener('input', () => {
      rememberSiteAddress($('#clsSite').value.trim());
      if (!$('#clsQr').hidden) drawClassQr();
    });
    $('#clsQrBtn').addEventListener('click', () => showClassQr($('#clsQr').hidden));
    $('#clsQrCopy').addEventListener('click', copyJoinLink);
    renderJoined();
    initClassTools();
    refreshClassLists();
    if (!cloudReady()) $('#cloudStatus').textContent = CLOUD_OFF;
    joinFromLink();
  }

  /* English practice: word cards, a quiz and short reading for people learning English. The English
     words and passages stay in English in every language; the meanings and explanations are translated. */
  const ENGLISH_WORDS = [
    { word: 'literacy', pos: 'nom', level: 'Intermédiaire', meaning: 'Capacité à lire et à écrire.', example: 'Literacy rates have risen in most countries over the last fifty years.' },
    { word: 'enrol', pos: 'verbe', level: 'Débutant', meaning: 'S\'inscrire officiellement dans une école, un collège ou un cours.', example: 'She will enrol at the local school in September.' },
    { word: 'dropout', pos: 'nom', level: 'Débutant', meaning: 'Élève qui quitte l\'école avant la fin de sa scolarité.', example: 'The programme gives extra support to students at risk of becoming dropouts.' },
    { word: 'scholarship', pos: 'nom', level: 'Débutant', meaning: 'Somme d\'argent versée à un élève ou à un étudiant pour financer ses études.', example: 'She won a scholarship to study engineering at university.' },
    { word: 'out of school', pos: 'expression', level: 'Débutant', meaning: 'Qui ne va pas à l\'école, bien qu\'il ou elle soit en âge de scolarité.', example: 'Many children are out of school because their families cannot pay for uniforms or transport.' },
    { word: 'sustainable', pos: 'adjectif', level: 'Débutant', meaning: 'Qui peut durer longtemps sans nuire aux personnes ni à la planète.', example: "Sustainable development means meeting today's needs without damaging the future." },
    { word: 'curriculum', pos: 'nom', level: 'Intermédiaire', meaning: 'Les matières et les cours enseignés dans une école ou un cursus.', example: 'The new curriculum includes more maths and science.' },
    { word: 'equity', pos: 'nom', level: 'Intermédiaire', meaning: 'Équité : chacun a les mêmes chances, quelle que soit son origine.', example: "The government wants equity, so that poor children get the same chances as everyone else." },
    { word: 'inclusive', pos: 'adjectif', level: 'Intermédiaire', meaning: 'Qui accueille et inclut tout le monde, y compris les personnes handicapées.', example: 'An inclusive school makes sure every child can learn.' },
    { word: 'tuition', pos: 'nom', level: 'Intermédiaire', meaning: 'Somme versée pour suivre des cours dans un établissement scolaire ou universitaire.', example: 'Tuition fees have risen sharply in the past ten years.' },
    { word: 'qualified', pos: 'adjectif', level: 'Intermédiaire', meaning: 'Ayant réussi la formation ou les examens nécessaires pour exercer un métier.', example: 'Schools need more qualified teachers, especially in rural areas.' },
    { word: 'vocational training', pos: 'expression', level: 'Avancé', meaning: 'Formation qui enseigne des compétences pratiques pour un métier précis.', example: 'Vocational training prepares young people to work as electricians or nurses.' },
    { word: 'completion rate', pos: 'expression', level: 'Avancé', meaning: 'Part des élèves qui achèvent un niveau d\'études.', example: 'The completion rate for secondary school is still low in some regions.' },
    { word: 'pre-primary', pos: 'adjectif', level: 'Avancé', meaning: 'Avant l\'école primaire, généralement pour les enfants de trois à cinq ans.', example: 'Pre-primary education helps children get ready for their first school year.' },
    { word: 'lifelong learning', pos: 'expression', level: 'Avancé', meaning: 'Apprentissage tout au long de la vie, et pas seulement à l\'école.', example: 'Adults can join evening classes as part of lifelong learning.' },
    { word: 'gender parity', pos: 'expression', level: 'Avancé', meaning: 'Situation dans laquelle les filles et les garçons ont un accès égal à l\'éducation.', example: 'The goal is gender parity at every level of schooling.' }
  ];

  const ENGLISH_QUIZ = [
    { level: 'Débutant', q: 'Choose the correct word: She ___ to school by bus every day.', options: ['go', 'goes', 'going', 'gone'], answer: 1, explain: 'Avec he, she ou it, le présent simple prend un -s : she goes.' },
    { level: 'Débutant', q: 'Choose the correct word: There are ___ students in the class.', options: ['much', 'many', 'a lot', 'few of'], answer: 1, explain: 'Utilisez many avec les noms dénombrables, comme students. Utilisez much avec les noms non dénombrables, comme water.' },
    { level: 'Débutant', q: 'Which word means "the money paid to study at a university"?', options: ['tuition', 'curriculum', 'literacy', 'equity'], answer: 0, explain: 'Tuition désigne la somme payée pour suivre des cours. Curriculum désigne la liste des matières enseignées par une école.' },
    { level: 'Débutant', q: 'A student who leaves school before finishing is a …', options: ['dropout', 'graduate', 'teacher', 'scholar'], answer: 0, explain: 'Un dropout est un élève qui quitte l\'école avant d\'avoir terminé ses études.' },
    { level: 'Débutant', q: 'Choose the correct form: Yesterday we ___ a long test in maths.', options: ['take', 'took', 'taken', 'taking'], answer: 1, explain: 'Yesterday indique le prétérit. Took est le prétérit de take.' },
    { level: 'Intermédiaire', q: 'Choose the correct form: If I ___ more time, I would learn English faster.', options: ['have', 'had', 'has', 'having'], answer: 1, explain: 'Pour une situation imaginaire au présent, utilisez if + prétérit (had), puis would + le verbe à la forme de base.' },
    { level: 'Intermédiaire', q: 'Which sentence is correct?', options: ['I have lived here since 2019.', 'I am living here since 2019.', 'I have live here since 2019.', 'I living here since 2019.'], answer: 0, explain: 'Utilisez le present perfect avec since et un moment précis : I have lived here since 2019.' },
    { level: 'Intermédiaire', q: 'A school where every child is welcome, including children with disabilities, is …', options: ['inclusive', 'vocational', 'pre-primary', 'tuition-free'], answer: 0, explain: 'Une école inclusive accueille et intègre tout le monde.' },
    { level: 'Intermédiaire', q: 'Children do better when they are interested ___ what they learn.', options: ['in', 'at', 'about', 'for'], answer: 0, explain: 'L\'adjectif « interested » est suivi de « in » : interested in something.' },
    { level: 'Intermédiaire', q: 'Choose the correct passive: The teachers ___ by the government last year.', options: ['were trained', 'trained', 'were training', 'have trained'], answer: 0, explain: 'Le passif au prétérit se forme avec was ou were + participe passé. Teachers, au pluriel, prend were.' },
    { level: 'Intermédiaire', q: 'Equity in education means …', options: ['everyone gets a fair chance', 'only the best students get places', 'schools charge the same fees', 'every school has the same building'], answer: 0, explain: 'Equity signifie l\'équité : chacun a une chance équitable, quelle que soit son origine.' },
    { level: 'Avancé', q: 'A "completion rate" measures …', options: ['how many students finish a level of schooling', 'how much a school spends on books', 'how many teachers are qualified', 'how many new schools are built'], answer: 0, explain: 'Le taux d\'achèvement est la part des élèves qui terminent un niveau d\'études, par exemple le collège.' },
    { level: 'Avancé', q: 'Which phrase means learning throughout life, not only at school?', options: ['lifelong learning', 'vocational training', 'gender parity', 'pre-primary education'], answer: 0, explain: 'L\'apprentissage tout au long de la vie désigne l\'éducation et la formation à tout âge, y compris pour les adultes.' },
    { level: 'Avancé', q: 'A course that teaches practical skills for work as an electrician is …', options: ['vocational', 'pre-primary', 'academic', 'literate'], answer: 0, explain: 'La formation professionnelle enseigne des compétences pratiques pour un métier précis.' },
    { level: 'Avancé', q: 'What does "gender parity" in education mean?', options: ['boys and girls have equal access to education', 'only girls go to school', 'every school costs the same', 'girls study only maths'], answer: 0, explain: 'La parité de genre signifie que les filles et les garçons ont le même accès à l\'éducation.' },
    { level: 'Avancé', q: 'Which word is the noun form of "literate"?', options: ['literacy', 'literature', 'literal', 'literally'], answer: 0, explain: 'Literacy désigne la capacité à lire et à écrire. Literature désigne les œuvres écrites, comme les romans et les poèmes.' }
  ];

  const ENGLISH_READING = [
    {
      level: 'Débutant',
      title: 'Amina goes to school',
      text: "Amina is twelve years old and lives in a small village. Every morning she walks two kilometres to school. Her school has a good library, and she likes reading stories there. Last year she won a scholarship, so her family does not have to pay the school fees. Amina wants to become a doctor one day. She says school is the best thing that has ever happened to her.",
      questions: [
        { q: 'How does Amina get to school?', options: ['She takes a bus', 'She walks', 'Her father drives her', 'She rides a bicycle'], answer: 1, explain: 'Le texte dit qu\'elle marche deux kilomètres pour aller à l\'école chaque matin.' },
        { q: "Why does Amina's family not pay the school fees?", options: ['The school is free for everyone', 'She won a scholarship', 'She works at the school', 'Her teacher pays for her'], answer: 1, explain: 'L\'année dernière, elle a obtenu une bourse, si bien que sa famille n\'a pas à payer les frais de scolarité.' },
        { q: 'What does Amina want to become?', options: ['a teacher', 'a librarian', 'a doctor', 'a driver'], answer: 2, explain: 'Le texte dit qu\'elle veut devenir médecin un jour.' }
      ]
    },
    {
      level: 'Intermédiaire',
      title: 'Why girls leave school early',
      text: 'Many girls in low-income countries leave school before they finish. Sometimes the reason is money: families cannot pay for uniforms, books or transport. In other cases, girls are asked to help at home, or they are married at a young age. Schools can help. Some governments give grants to families who keep their daughters in school, and some schools have toilets for girls, so that they do not miss lessons every month. These small changes can make a big difference to whether girls stay in school.',
      questions: [
        { q: 'What is one reason families might not send girls to school?', options: ['Schools are too big', 'They cannot pay for uniforms, books or transport', 'Girls do not want to learn', 'Teachers do not like girls'], answer: 1, explain: 'Le texte dit que l\'argent nécessaire pour les uniformes, les livres ou le transport peut empêcher les filles d\'aller à l\'école.' },
        { q: 'According to the text, what can help girls stay in school?', options: ['Longer holidays', 'Grants and toilets at school', 'Fewer lessons', 'Bigger classes'], answer: 1, explain: 'Le texte mentionne les aides versées aux familles et les toilettes réservées aux filles à l\'école.' },
        { q: 'What do "these small changes" refer to?', options: ['the grants and the toilets', 'the families', 'the lessons', 'the holidays'], answer: 0, explain: '« These small changes » renvoie aux aides et aux toilettes mentionnées dans la phrase précédente.' }
      ]
    },
    {
      level: 'Avancé',
      title: 'Learning does not stop at school',
      text: 'Education is no longer something that ends when people leave school. In many countries, adults return to classrooms to learn a new language, gain a qualification or retrain for a new job. Vocational courses, online lessons and evening classes make this possible for people who work during the day. Governments and employers increasingly see lifelong learning as essential, because technology and industry change quickly. Yet adults who left school early often find it hardest to return, which is why reaching them remains a challenge.',
      questions: [
        { q: 'What is the main idea of the passage?', options: ['Schools should close in the evening', 'Learning continues throughout life and matters more and more', 'Online lessons are always better than classrooms', 'Adults should not retrain for new jobs'], answer: 1, explain: 'Le passage affirme que l\'apprentissage tout au long de la vie gagne en importance à mesure que le travail et la technologie évoluent.' },
        { q: 'Why is lifelong learning becoming essential?', options: ['Technology and industry change quickly', 'Schools are getting smaller', 'Teachers are retiring', 'Governments are reducing their budgets'], answer: 0, explain: 'Le texte dit que la technologie et l\'industrie évoluent vite, si bien que les gens doivent continuer à apprendre.' },
        { q: 'Which group often finds it hardest to return to learning?', options: ['Adults who left school early', 'Adults who work in the evening', 'Students who take online lessons', 'Teachers of vocational courses'], answer: 0, explain: 'Le passage dit que les adultes qui ont quitté l\'école tôt sont souvent ceux pour qui il est le plus difficile de revenir.' }
      ]
    }
  ];

  function initEnglish() {
    initEnglishWords();
    initEnglishQuiz();
    renderEnglishReading();
  }

  // One question with four options. The learner picks once; done(correct) is then called.
  function englishChoices(item, host, done) {
    const opts = h('div', 'quiz-options');
    const fb = h('div', 'quiz-feedback');
    fb.hidden = true;
    let locked = false;
    item.options.forEach((text, j) => {
      const b = h('button', 'opt');
      b.type = 'button';
      b.append(h('span', 'opt-key', 'ABCD'[j]), h('span', 'opt-text', text), h('span', 'opt-mark'));
      b.addEventListener('click', () => {
        if (locked) return;
        locked = true;
        const correct = j === item.answer;
        opts.querySelectorAll('.opt').forEach((o, k) => {
          o.disabled = true;
          if (k === item.answer) { o.classList.add('is-correct'); drawMark(o.querySelector('.opt-mark'), 'tick'); }
          else if (k === j) { o.classList.add('is-wrong'); drawMark(o.querySelector('.opt-mark'), 'cross'); }
          else o.classList.add('is-muted');
        });
        Sound.play(correct ? 'correct' : 'wrong');
        fb.textContent = '';
        fb.append(h('p', 'fb-verdict', correct ? 'Bonne réponse !' : 'Pas tout à fait. La réponse est ' + item.options[item.answer] + '.'), h('p', 'fb-text', item.explain));
        fb.hidden = false;
        done(correct);
      });
      opts.appendChild(b);
    });
    host.append(opts, fb);
  }

  function initEnglishWords() {
    const total = ENGLISH_WORDS.length;
    let order = ENGLISH_WORDS.map((w, n) => n);
    let i = 0;
    const card = $('#wordCard');
    const front = $('#wordFront');
    const back = $('#wordBack');

    function show(turned) {
      const w = ENGLISH_WORDS[order[i]];
      $('#wordCount').textContent = fill('{0} sur {1}', i + 1, total);
      $('#wordFill').style.width = ((i + 1) / total) * 100 + '%';
      $('#wordLevel').textContent = w.level;
      front.textContent = '';
      front.append(document.createTextNode(w.word), h('span', 'en-pos', w.pos));
      back.textContent = '';
      back.append(h('span', 'fa-answer', w.meaning), h('span', 'fa-why', w.example));
      front.hidden = turned;
      back.hidden = !turned;
      card.setAttribute('aria-expanded', String(turned));
    }

    card.addEventListener('click', () => show(back.hidden));
    $('#wordPrev').addEventListener('click', () => { i = (i - 1 + total) % total; show(false); });
    $('#wordNext').addEventListener('click', () => { i = (i + 1) % total; show(false); });
    $('#wordShuffle').addEventListener('click', () => {
      order = shuffle(order);
      i = 0;
      show(false);
      Sound.play('tap');
    });
    show(false);
  }

  function initEnglishQuiz() {
    const size = Math.min(10, ENGLISH_QUIZ.length);
    let order = [];
    let i = 0;
    let right = 0;
    const bestRecord = () => store.get('sdg4.english.best', null);

    function showBest() {
      const b = bestRecord();
      ['#enBest', '#enBestResult'].forEach((sel) => {
        $(sel).hidden = !b;
        if (b) $(sel).textContent = fill('Meilleur score jusqu\'ici : {0} sur {1}.', b.right, b.total);
      });
    }

    function ask() {
      const item = ENGLISH_QUIZ[order[i]];
      $('#enProgress').textContent = fill('Question {0} sur {1}', i + 1, order.length);
      $('#enFill').style.width = (i / order.length) * 100 + '%';
      $('#enLevel').textContent = item.level;
      $('#enQ').textContent = item.q;
      const host = $('#enAnswers');
      host.textContent = '';
      const next = $('#enNext');
      next.hidden = true;
      englishChoices(item, host, (ok) => {
        if (ok) right += 1;
        $('#enFill').style.width = ((i + 1) / order.length) * 100 + '%';
        next.textContent = i === order.length - 1 ? 'Voir mon score' : 'Question suivante';
        next.hidden = false;
        next.focus({ preventScroll: true });
      });
      $('#enQ').focus({ preventScroll: true });
    }

    function start() {
      order = shuffle(ENGLISH_QUIZ.map((q, n) => n)).slice(0, size);
      i = 0;
      right = 0;
      $('#enStart').hidden = true;
      $('#enResult').hidden = true;
      $('#enPlay').hidden = false;
      ask();
      Sound.play('tap');
    }

    function finish() {
      const total = order.length;
      const pct = right / total;
      $('#enPlay').hidden = true;
      $('#enResult').hidden = false;
      $('#enRsScore').textContent = String(right);
      $('#enRsOf').textContent = '/' + total;
      $('#enRsTitle').textContent = pct >= 0.8 ? 'Excellent travail !' : pct >= 0.5 ? 'Bons progrès.' : 'Continuez à vous entraîner.';
      $('#enRsText').textContent = fill('Vous avez {0} bonne(s) réponse(s) sur {1}.', right, total);
      const best = bestRecord();
      if (!best || right / total > best.right / best.total) store.set('sdg4.english.best', { right: right, total: total });
      showBest();
      Sound.play(pct >= 0.8 ? 'streak' : 'tap');
      $('#enRsTitle').focus({ preventScroll: true });
    }

    function backToStart() {
      $('#enResult').hidden = true;
      $('#enPlay').hidden = true;
      $('#enStart').hidden = false;
      showBest();
      Sound.play('tap');
    }

    $('#enStartBtn').addEventListener('click', start);
    $('#enAgain').addEventListener('click', start);
    $('#enBack').addEventListener('click', () => {
      backToStart();
      $('#enStartBtn').focus({ preventScroll: true });
    });
    $('#enQuit').addEventListener('click', backToStart);
    $('#enNext').addEventListener('click', () => {
      if (i < order.length - 1) {
        i += 1;
        ask();
      } else {
        finish();
      }
    });
    // A to D pick an answer while a question is showing, as on the main quiz.
    document.addEventListener('keydown', (e) => {
      if ($('#enPlay').hidden || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const k = e.key.toLowerCase();
      const pick = k.length === 1 ? 'abcd'.indexOf(k) : -1;
      if (pick < 0) return;
      const b = $$('#enAnswers .opt')[pick];
      if (b && !b.disabled) {
        e.preventDefault();
        b.click();
      }
    });
    showBest();
  }

  function renderEnglishReading() {
    const host = $('#enReading');
    ENGLISH_READING.forEach((p) => {
      const art = h('article', 'en-passage');
      const head = h('div', 'en-passage-head');
      head.append(h('span', 'q-cat', p.level), h('h3', 'en-passage-title', p.title));
      const qs = h('ol', 'en-qs');
      const score = h('p', 'en-passage-score');
      score.hidden = true;
      let answered = 0;
      let right = 0;
      p.questions.forEach((item) => {
        const li = h('li', 'en-q');
        const answers = h('div', 'en-answers');
        li.append(h('p', 'en-q-text', item.q), answers);
        englishChoices(item, answers, (ok) => {
          answered += 1;
          if (ok) right += 1;
          if (answered === p.questions.length) {
            score.textContent = fill('Vous avez {0} bonne(s) réponse(s) sur {1}.', right, answered);
            score.hidden = false;
          }
        });
        qs.appendChild(li);
      });
      art.append(head, h('p', 'en-text', p.text), qs, score);
      host.appendChild(art);
    });
  }

  /* Search: pages, targets, facts and quiz questions, found as you type. Press / to open. */
  const SEARCH_PAGES = [
    { title: 'Les faits', href: 'facts.html', text: 'Graphiques sur ceux qui sont non scolarisés, ceux qui achèvent, ceux qui apprennent et ceux qui restent à la traîne' },
    { title: 'Les 10 cibles', href: 'targets.html', text: 'Chaque engagement de l’ODD 4 en termes simples, avec les derniers chiffres' },
    { title: 'Explorer', href: 'explore.html', text: 'Suivez 100 enfants à l’école, voyage de 1948 à 2030, la machine à faits' },
    { title: 'Solutions', href: 'solutions.html', text: 'Ce qui a fonctionné, des repas scolaires aux transferts monétaires' },
    { title: 'Agir', href: 'action.html', text: 'Choisissez des actions et créez votre propre engagement' },
    { title: 'Quiz', href: 'quiz.html', text: 'Le quiz, les chapitres, les cartes mémoire et le classement' },
    { title: 'Minuteur d’étude', href: 'timer.html', text: 'Étudiez par blocs de concentration avec de courtes pauses' },
    { title: 'À propos', href: 'about.html', text: 'À propos de ce projet scolaire, du glossaire et de toutes les sources' },
    { title: 'Diapositives pour la classe', href: 'slides.html', text: 'Diapositives plein écran avec les chiffres clés' },
    { title: 'Mon profil', href: 'profile.html', text: 'Pseudonyme, avatar et couleur, rejoindre une classe avec un code, mode enseignant' },
    { title: 'Apprendre l\'anglais', href: 'english.html', text: 'Cartes de vocabulaire, quiz et courts textes sur les mots de l\'éducation, du niveau débutant au niveau avancé.' },
    { title: 'Ma progression', href: 'progress.html', text: 'Badges, un résumé et l’export, l’import ou l’effacement de vos données enregistrées' },
    { title: 'Obtenir l’application', href: 'download.html', text: 'Téléchargez pour Windows, Mac et Android, ou ajoutez le site à votre écran d’accueil' }
  ];
  let searchIndex = null;

  function buildSearchIndex() {
    // Pages a teacher has turned off for this student's class are left out of the search.
    const off = turnedOff();
    const shown = (file) => !TURNABLE_PAGES.some((t) => t.file === file && off.pages.has(t.slug));
    const items = SEARCH_PAGES.filter((p) => shown(p.href)).map((p) => ({ kind: 'Page', title: p.title, text: p.text, href: p.href }));
    if (shown('targets.html')) TARGETS.forEach((t) => items.push({ kind: 'Cible ' + t.code, title: t.title, text: t.plain + ' ' + t.action, href: 'targets.html' }));
    if (shown('facts.html')) FACTS.forEach((f) => items.push({ kind: 'Fait', title: f.num, text: f.text, href: 'facts.html' }));
    if (shown('quiz.html')) QUIZ.forEach((q) => items.push({ kind: 'Question de quiz', title: q.q, text: q.explain, href: 'quiz.html' }));
    if (shown('english.html')) ENGLISH_WORDS.forEach((w) => items.push({ kind: 'Mot anglais', title: w.word, text: w.meaning, href: 'english.html' }));
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
    slides: initSlides,
    profile: initProfile,
    english: initEnglish,
    assignment: initAssignment
  };
  const siteNode = document.querySelector('.site[data-page]');
  const PAGE = siteNode ? siteNode.dataset.page : '';
  function startPage() {
    applyClassRules();
    if (pageIsOff()) {
      showOffPage();
      return;
    }
    if (MODULES[PAGE]) MODULES[PAGE]();
  }
  initChrome();
  initLang();
  if (PAGE !== 'slides') {
    initReadingBar();
    initSearch();
  }
  if (loadJoined().length && cloudReady()) {
    // Wait a moment for the teacher's latest settings. If the database is slow, the copy saved on this device is used.
    Promise.race([refreshClassRules().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2500))]).then(startPage);
  } else {
    startPage();
  }
})();
