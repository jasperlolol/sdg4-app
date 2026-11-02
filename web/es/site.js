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
    1: 'Informe ODS de la ONU 2026',
    2: 'Informe GEM de la UNESCO 2026',
    3: 'Informe GEM de la UNESCO 2026, capítulo 7',
    4: 'Informe mundial sobre los docentes de la UNESCO 2024',
    5: 'UNESCO, Día Internacional de la Alfabetización 2026',
    6: 'Estimaciones de financiación de la UNESCO, 2023 y 2026',
    7: 'Informe GEM de Género de la UNESCO 2026',
    8: 'Agenda 2030 de la ONU, A/RES/70/1'
  };

  // One red hue, three lightness steps: education levels are an ordered sequence.
  const LEVELS = [
    { key: 'primary', name: 'Primaria', color: '#7A1526' },
    { key: 'lower', name: 'Secundaria básica', color: '#B8344A' },
    { key: 'upper', name: 'Secundaria superior', color: '#E58B98' }
  ];

  // Completion rate worldwide (%). 2000: UNESCO GEM Report 2026. 2015 and 2024: UN SDG Report 2026.
  const TREND = [
    { year: 2000, primary: 77, lower: 60, upper: 37 },
    { year: 2015, primary: 85, lower: 75, upper: 53 },
    { year: 2024, primary: 88, lower: 78, upper: 61 }
  ];

  // Completion rate by region, 2024 (%): UN SDG Report 2026. Low-income countries: GEM Report 2026, ch. 7.
  const REGIONS = [
    { name: 'Mundo', primary: 88, lower: 78, upper: 61, world: true },
    { name: 'Europa y América del Norte', primary: 100, lower: 98, upper: 89 },
    { name: 'Asia oriental y sudoriental', primary: 98, lower: 91, upper: 79 },
    { name: 'América Latina y el Caribe', primary: 94, lower: 84, upper: 65 },
    { name: 'África del Norte y Asia occidental', primary: 90, lower: 69, upper: 61 },
    { name: 'Asia central y meridional', primary: 89, lower: 83, upper: 59 },
    { name: 'África subsahariana', primary: 68, lower: 47, upper: 28 },
    { name: 'Oceanía*', label: 'Oceanía (sin Australia ni Nueva Zelanda)', primary: 70, lower: 43, upper: 18 },
    { name: 'Países de ingreso bajo', primary: 60, lower: 37, upper: 20, income: true }
  ];
  const placeLabel = (r) => r.label || r.name;

  // Out of school by age group, 2024, millions: GEM Report 2026, ch. 7.
  const OOS = [
    { value: 79, name: 'edad de primaria', color: '#7A1526' },
    { value: 64, name: 'edad de secundaria básica', color: '#B8344A' },
    { value: 130, name: 'edad de secundaria superior', color: '#E58B98' }
  ];

  // Completion of the poorest 20% for every 100 of the richest 20% (parity index x 100): UN SDG Report 2026.
  const PARITY = [
    { name: 'Primaria', value: 91 },
    { name: 'Secundaria básica', value: 68 },
    { name: 'Secundaria superior', value: 34 }
  ];

  const TARGETS = [
    {
      code: '4.1', kind: 'outcome', short: 'Primaria y secundaria para todos',
      title: 'Primaria y secundaria gratuitas y de calidad para cada niño',
      official: 'De aquí a 2030, asegurar que todas las niñas y todos los niños terminen una educación primaria y secundaria gratuita, equitativa y de calidad, que lleve a resultados de aprendizaje pertinentes y eficaces',
      plain: 'Cada niño debería poder terminar la primaria y la secundaria gratis, y aprender de verdad por el camino. Estar sentado en el aula es solo la mitad: lo que cuenta son las competencias de lectura y matemáticas.',
      measured: 'El indicador 4.1.1 mide cuántos niños alcanzan un nivel mínimo de lectura y matemáticas en los primeros cursos, al final de la primaria y al final de la secundaria básica. El indicador 4.1.2 mide las tasas de finalización.',
      stats: [
        { value: '61%', text: 'de los jóvenes completan la secundaria superior (2024), frente al 53 % de 2015.', src: 1 },
        { value: '58%', text: 'de los estudiantes alcanzan el nivel mínimo de lectura al final de la primaria, según la estimación mundial más reciente (2019).', src: 3 }
      ],
      action: 'Organiza cada semana una sesión de lectura o matemáticas con un estudiante más joven, o crea un club de tutoría entre iguales.'
    },
    {
      code: '4.2', kind: 'outcome', short: 'Primera infancia y preprimaria',
      title: 'Un buen comienzo antes de la primaria',
      official: 'De aquí a 2030, asegurar que todas las niñas y todos los niños tengan acceso a un desarrollo, cuidado y educación preprimaria de calidad en la primera infancia, para que estén preparados para la primaria',
      plain: 'Los años antes de la primaria marcan cómo aprenden los niños el resto de su vida. Esta meta trata del cuidado, el juego y las clases preprimarias que preparan a cada niño para la escuela.',
      measured: 'El indicador 4.2.1 mide cuántos niños de 24 a 59 meses se desarrollan adecuadamente. El indicador 4.2.2 mide la participación en aprendizaje organizado un año antes de la primaria.',
      stats: [
        { value: '75%', text: 'de los niños participan en aprendizaje organizado un año antes de la primaria, una proporción que apenas ha cambiado desde 2015.', src: 3 },
        { value: '60%', text: 'han recibido realmente al menos un año de preprimaria, teniendo en cuenta a los niños que empiezan la primaria antes de tiempo.', src: 3 }
      ],
      action: 'Ofrécete como voluntario para leer con niños pequeños en un centro de educación infantil de tu zona, o reúne cuentos ilustrados para donar.'
    },
    {
      code: '4.3', kind: 'outcome', short: 'Educación técnica, profesional y universitaria',
      title: 'Formación y universidad asequibles para todos',
      official: 'De aquí a 2030, asegurar la igualdad de acceso de todas las mujeres y todos los hombres a una formación técnica, profesional y terciaria asequible y de calidad, incluida la universitaria',
      plain: 'Después de la escuela, todos deberían poder costearse una buena formación o universidad, tanto si quieren ser enfermeros, electricistas o ingenieros.',
      measured: 'El indicador 4.3.1 mide cuántos jóvenes y adultos participaron en educación y formación formales o no formales en los últimos 12 meses.',
      stats: [
        { value: '44%', text: 'matrícula en educación terciaria en el mundo en 2024: por debajo del 15 % en los países de ingreso bajo y por encima del 80 % en los de ingreso alto.', src: 3 },
        { value: '1 de cada 3', text: 'países no cobran matrícula en las universidades públicas.', src: 2 }
      ],
      action: 'Explora pronto las opciones profesionales y universitarias, y comparte información sobre becas y cursos con tus compañeros.'
    },
    {
      code: '4.4', kind: 'outcome', short: 'Competencias para el trabajo y la vida',
      title: 'Competencias para empleos dignos',
      official: 'De aquí a 2030, aumentar considerablemente el número de jóvenes y adultos con competencias pertinentes, incluidas las técnicas y profesionales, para el empleo, el trabajo decente y el emprendimiento',
      plain: 'La educación debe preparar a las personas para el trabajo real: competencias digitales, conocimientos técnicos y confianza para emprender.',
      measured: 'El indicador 4.4.1 mide cuántos jóvenes y adultos tienen competencias en tecnologías de la información y la comunicación (TIC), desde copiar archivos hasta escribir un programa informático.',
      stats: [
        { value: '33%', text: 'de los adultos del país mediano que informa pueden hacer una presentación electrónica (2022 a 2024).', src: 3 },
        { value: '6%', text: 'tienen competencias de programación. La mayoría de los países que informan de estos datos son de ingreso medio alto o alto.', src: 3 }
      ],
      action: 'Elige una competencia práctica este trimestre, como programar, hacer presupuestos o hablar en público, y enséñasela a alguien.'
    },
    {
      code: '4.5', kind: 'outcome', short: 'Igualdad de acceso para todos',
      title: 'Nadie se queda fuera de la educación',
      official: 'De aquí a 2030, eliminar las disparidades de género en la educación y garantizar el acceso igualitario a todos los niveles de educación y formación profesional para las personas vulnerables, incluidas las personas con discapacidad, los pueblos indígenas y los niños en situaciones vulnerables',
      plain: 'Ningún niño debería quedarse sin estudiar por su género, una discapacidad, su lugar de residencia o el dinero que tenga su familia.',
      measured: 'El indicador 4.5.1 compara grupos mediante índices de paridad, como niñas y niños, zonas rurales y urbanas, y los más pobres y los más ricos, en el resto de indicadores del ODS 4.',
      stats: [
        { value: '34', text: 'de los jóvenes más pobres terminan la secundaria superior por cada 100 de los más ricos.', src: 1 },
        { value: 'Casi 5 de cada 6', text: 'países no han alcanzado la paridad de género en la finalización de la secundaria superior.', src: 1 }
      ],
      action: 'Haz tu clase más inclusiva: invita a alguien nuevo a tu grupo y pide materiales de aprendizaje que todos puedan usar.'
    },
    {
      code: '4.6', kind: 'outcome', short: 'Alfabetización y cálculo',
      title: 'Todos capaces de leer, escribir y contar',
      official: 'De aquí a 2030, asegurar que todos los jóvenes y una proporción considerable de adultos, hombres y mujeres, alcancen la alfabetización y el cálculo',
      plain: 'Cada joven, y tantos adultos como sea posible, debería poder leer, escribir y usar los números con seguridad en la vida diaria.',
      measured: 'El indicador 4.6.1 mide la proporción de personas de un grupo de edad que alcanzan un nivel fijo de alfabetización y cálculo funcionales.',
      stats: [
        { value: '739M', text: 'jóvenes y adultos carecían de competencias básicas de alfabetización en 2024; alrededor de dos tercios de ellos son mujeres.', src: 5 },
        { value: '93%', text: 'de los jóvenes del mundo saben leer y escribir, frente al 87 % en 2000.', src: 3 }
      ],
      action: 'Organiza un intercambio de libros en el colegio, o ayuda a un familiar a practicar la lectura o las matemáticas cotidianas.'
    },
    {
      code: '4.7', kind: 'outcome', short: 'Sostenibilidad, paz y ciudadanía mundial',
      title: 'Aprender a construir un mundo más justo y verde',
      official: 'De aquí a 2030, asegurar que todos los estudiantes adquieran los conocimientos y competencias necesarios para promover el desarrollo sostenible, en particular mediante la educación para el desarrollo sostenible y los estilos de vida sostenibles, los derechos humanos, la igualdad de género, la promoción de una cultura de paz y no violencia, la ciudadanía mundial y la valoración de la diversidad cultural y de la contribución de la cultura al desarrollo sostenible',
      plain: 'La escuela debería ayudarnos a entender el cambio climático, los derechos humanos, la igualdad de género y otras culturas, y darnos competencias para actuar.',
      measured: 'El indicador 4.7.1 mide hasta qué punto la ciudadanía mundial y el desarrollo sostenible están integrados en las políticas educativas, los currículos, la formación docente y la evaluación del alumnado. Desde 2025 también revisa directamente los currículos en materia de medio ambiente, cambio climático y biodiversidad.',
      stats: [
        { value: '50 de 110', text: 'de los países estudiados no mencionaban el cambio climático en los programas de ciencias y ciencias sociales de sexto curso (2024).', src: 3 },
        { value: '78 de 110', text: 'no lo mencionaban en sus programas de tercer curso.', src: 3 }
      ],
      action: 'Crea o únete a un club ecológico o de temas globales, y lleva temas climáticos a tus proyectos de clase.'
    },
    {
      code: '4.a', kind: 'means', short: 'Escuelas seguras e inclusivas',
      title: 'Escuelas seguras y abiertas a todos',
      official: 'Construir y mejorar instalaciones educativas que tengan en cuenta a la infancia, la discapacidad y el género, y ofrezcan entornos de aprendizaje seguros, libres de violencia, inclusivos y eficaces para todos',
      plain: 'Las escuelas necesitan lo básico, como electricidad, agua limpia, baños, rampas e internet, y deben estar libres de violencia y acoso.',
      measured: 'El indicador 4.a.1 mide la proporción de escuelas con servicios básicos: electricidad, internet y ordenadores para la enseñanza, instalaciones adaptadas para alumnos con discapacidad, agua potable, baños separados por sexo y lavamanos.',
      stats: [
        { value: 'Más de 1 de cada 5', text: 'de las escuelas primarias del mundo carecen de electricidad, agua potable segura o saneamiento básico.', src: 1 },
        { value: '466M', text: 'niños recibieron comidas escolares en 2024, un 20 % más que en 2020.', src: 3 }
      ],
      action: 'Denuncia las instalaciones rotas o inseguras y apoya a los compañeros que sufren acoso.'
    },
    {
      code: '4.b', kind: 'means', short: 'Becas para países en desarrollo',
      title: 'Más becas para estudiantes de países en desarrollo',
      official: 'De aquí a 2020, aumentar considerablemente en todo el mundo el número de becas disponibles para los países en desarrollo, en particular los países menos adelantados, los pequeños Estados insulares en desarrollo y los países africanos, para matricularse en educación superior, incluida la formación profesional, las tecnologías de la información y la comunicación, y programas técnicos, de ingeniería y científicos, en países desarrollados y otros países en desarrollo',
      plain: 'Los países prometieron más becas para que los estudiantes de los países más pobres pudieran estudiar en la universidad, sobre todo ciencia y tecnología. Es la única meta del ODS 4 con plazo en 2020.',
      measured: 'El indicador 4.b.1 mide el monto de la ayuda oficial al desarrollo (ayuda) destinada a becas.',
      stats: [
        { value: '$1.7B', text: 'de la ayuda se destinó a becas del sector educativo en 2024, una caída tras la recuperación de la financiación en 2023.', src: 3 },
        { value: '2.8%', text: 'de los estudiantes universitarios del mundo estudiaron en otro país en 2023.', src: 3 }
      ],
      action: 'Reúne las oportunidades de becas que encuentres y compártelas en el tablón de anuncios de la clase.'
    },
    {
      code: '4.c', kind: 'means', short: 'Docentes cualificados',
      title: 'Suficientes docentes bien formados',
      official: 'De aquí a 2030, aumentar considerablemente la oferta de docentes cualificados, incluso mediante la cooperación internacional para la formación docente en los países en desarrollo, en particular los países menos adelantados y los pequeños Estados insulares en desarrollo',
      plain: 'No hay educación sin docentes. El mundo necesita millones más que estén formados, apoyados y pagados justamente, sobre todo en los países más pobres.',
      measured: 'El indicador 4.c.1 mide la proporción de docentes que tienen la titulación mínima exigida por su país.',
      stats: [
        { value: '44M', text: 'docentes más se necesitan para 2030 para la educación primaria y secundaria universal, 15 millones de ellos en África subsahariana.', src: 4 },
        { value: '1 de cada 5', text: 'de los docentes del mundo no cumple los requisitos mínimos de titulación de su país (2024).', src: 1 }
      ],
      action: 'Da las gracias a un docente esta semana y piensa si la docencia podría ser tu profesión algún día.'
    }
  ];

  const QUIZ = [
    // The goal
    { cat: 'El objetivo', q: '¿Para qué año se pretende alcanzar los Objetivos de Desarrollo Sostenible, incluido el ODS 4?', options: ['2025', '2030', '2040', '2050'], answer: 1, explain: 'Todos los Estados miembros de la ONU adoptaron la Agenda 2030 en 2015. Da al mundo hasta 2030 para alcanzar los 17 objetivos.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'El objetivo', q: '¿Cuántos Objetivos de Desarrollo Sostenible hay?', options: ['6', '8', '12', '17'], answer: 3, explain: 'Hay 17 objetivos, y la educación es el número 4. Los Objetivos de Desarrollo del Milenio anteriores eran 8.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'El objetivo', q: '¿Cuántas metas tiene el ODS 4?', options: ['10', '12', '15', '17'], answer: 0, explain: 'Diez: siete metas de resultados (de la 4.1 a la 4.7) y tres medios de implementación (4.a, 4.b y 4.c).', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'El objetivo', mix: true, q: 'Completa el objetivo: “Garantizar una educación inclusiva, equitativa y de calidad y promover … para todos.”', options: ['plazas universitarias gratuitas', 'oportunidades de aprendizaje durante toda la vida', 'dispositivos digitales', 'comedores escolares'], answer: 1, explain: 'El objetivo completo dice: garantizar una educación inclusiva, equitativa y de calidad y promover oportunidades de aprendizaje durante toda la vida para todos.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'El objetivo', q: '¿Qué meta trata del desarrollo en la primera infancia y la educación preprimaria?', options: ['Meta 4.1', 'Meta 4.2', 'Meta 4.5', 'Meta 4.c'], answer: 1, explain: 'La meta 4.2 pretende que todos los niños reciban atención y educación preprimaria de calidad en la primera infancia, para que estén preparados para la primaria.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'El objetivo', q: '¿Qué meta del ODS 4 tenía un plazo de 2020 en lugar de 2030?', options: ['4.1, primaria y secundaria gratuitas', '4.6, alfabetización y cálculo', '4.b, becas', '4.c, docentes cualificados'], answer: 2, explain: 'La meta 4.b pretendía ampliar las becas para estudiantes de países en desarrollo para 2020.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'El objetivo', mix: true, q: 'La meta 4.c trata de…', options: ['universidad gratuita para todos', 'más docentes cualificados', 'comedores escolares', 'internet en cada aula'], answer: 1, explain: 'La meta 4.c pretende aumentar considerablemente la oferta de docentes cualificados, incluso mediante la formación docente en los países en desarrollo.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'El objetivo', q: '¿Qué meta abarca el aprendizaje sobre desarrollo sostenible, derechos humanos, paz y ciudadanía mundial?', options: ['Meta 4.1', 'Meta 4.3', 'Meta 4.5', 'Meta 4.7'], answer: 3, explain: 'La meta 4.7 trata de los conocimientos y competencias necesarios para promover el desarrollo sostenible, los derechos humanos, la igualdad de género, la paz y la ciudadanía mundial.', src: 'Agenda 2030 de la ONU (2015)' },
    // Access
    { cat: 'Acceso', q: '¿Aproximadamente cuántos niños y jóvenes estaban fuera de la escuela en el mundo en 2024?', options: ['73 millones', '123 millones', '173 millones', '273 millones'], answer: 3, explain: '273 millones, es decir, uno de cada seis, y la cifra ha aumentado durante siete años seguidos.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Acceso', q: '¿Qué grupo de edad tiene más jóvenes fuera de la escuela?', options: ['Edad de primaria', 'Edad de secundaria básica', 'Edad de secundaria superior', 'Los tres son casi iguales'], answer: 2, explain: 'de los 273 millones tienen edad de secundaria superior, frente a los 79 millones de edad de primaria y los 64 millones de secundaria básica.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Acceso', q: 'Para 2024, ¿durante cuántos años seguidos había aumentado el número de niños fuera de la escuela?', options: ['2', '4', '7', '12'], answer: 2, explain: 'Siete años seguidos, impulsados por el crecimiento demográfico, las crisis y la reducción de los presupuestos.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Acceso', q: 'En los países de ingreso bajo, ¿qué proporción aproximada de niños y jóvenes en edad escolar están fuera de la escuela?', options: ['3%', '16%', '36%', '66%'], answer: 2, explain: 'Alrededor del 36 %, frente al 3 % en los países de ingreso alto.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Acceso', mix: true, q: '¿Qué dos regiones juntas concentran tres cuartas partes de los niños y jóvenes no escolarizados del mundo?', options: ['Europa y América Latina', 'África subsahariana y Asia central y meridional', 'Asia oriental y Oceanía', 'América del Norte y Asia occidental'], answer: 1, explain: 'África subsahariana y Asia central y meridional suman juntas tres cuartas partes del total mundial.', src: 'Informe ODS de la ONU 2026' },
    { cat: 'Acceso', q: '¿Cuántos estudiantes estaban matriculados en la escuela en el mundo en 2024?', options: ['500 millones', '800 millones', '1.100 millones', '1.400 millones'], answer: 3, explain: '1400 millones, es decir, 327 millones más en primaria y secundaria que en 2000.', src: 'Informe GEM de la UNESCO 2026' },
    // Completion
    { cat: 'Finalización', q: 'En África subsahariana, ¿qué proporción de jóvenes terminan la secundaria superior?', options: ['28%', '48%', '61%', '78%'], answer: 0, explain: 'En 2024, el 28 % completó la secundaria superior en África subsahariana, frente al 61 % en el mundo.', src: 'Informe ODS de la ONU 2026' },
    { cat: 'Finalización', q: 'En el mundo, ¿qué proporción de jóvenes completó la secundaria superior en 2024?', options: ['37%', '61%', '78%', '88%'], answer: 1, explain: '61 %, frente al 53 % en 2015 y al 37 % en 2000. En secundaria básica es el 78 %, y en primaria el 88 %.', src: 'Informe ODS de la ONU 2026; Informe GEM de la UNESCO 2026' },
    { cat: 'Finalización', q: 'Al ritmo actual, ¿aproximadamente cuándo terminaría el 95 % de los jóvenes del mundo la secundaria superior?', options: ['2030', '2050', '2075', '2105'], answer: 3, explain: 'La UNESCO calcula que, al ritmo actual de progreso, de unos un punto porcentual al año desde 2000, se tardaría hasta 2105.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Finalización', mix: true, q: '¿Qué región tiene la tasa de finalización de la secundaria superior más alta?', options: ['Europa y América del Norte', 'Asia oriental y sudoriental', 'América Latina y el Caribe', 'África subsahariana'], answer: 0, explain: 'Europa y América del Norte, con el 89 % en 2024. Asia oriental y sudoriental le sigue con el 79 %.', src: 'Informe ODS de la ONU 2026' },
    // Learning
    { cat: 'Aprendizaje', q: 'Según la estimación mundial más reciente (2019), ¿qué proporción de estudiantes alcanzó el nivel mínimo de lectura al final de la primaria?', options: ['58%', '68%', '78%', '88%'], answer: 0, explain: '58 % en lectura y 44 % en matemáticas. La estimación no se ha actualizado desde la pandemia.', src: 'Informe ODS de la ONU 2026' },
    { cat: 'Aprendizaje', mix: true, q: 'En 57 países en su mayoría de ingreso medio y alto, ¿qué ocurrió con las competencias de lectura entre 2012 y 2022?', options: ['Mejoraron mucho', 'Se mantuvieron más o menos igual', 'Bajaron, del 59 % al 47 % de los estudiantes en el nivel mínimo', 'Se duplicaron'], answer: 2, explain: 'La lectura bajó del 59 % al 47 % y las matemáticas del 41 % al 36 %, así que la crisis del aprendizaje va más allá de la pandemia.', src: 'Informe ODS de la ONU 2026' },
    { cat: 'Aprendizaje', q: '¿Qué proporción de jóvenes del mundo sabía leer y escribir en 2024?', options: ['63%', '73%', '83%', '93%'], answer: 3, explain: 'El 93 %, frente al 87 % en 2000. Aun así, alrededor de uno de cada cuatro jóvenes de los países de ingreso bajo no sabía leer ni escribir.', src: 'Informe GEM de la UNESCO 2026' },
    // Teachers
    { cat: 'Docentes', q: '¿Cuántos docentes adicionales necesita el mundo para 2030 para lograr la educación primaria y secundaria universal?', options: ['24 millones', '44 millones', '64 millones', '84 millones'], answer: 1, explain: '44 millones. Uno de cada tres, es decir, 15 millones, se necesita en África subsahariana.', src: 'Informe mundial sobre los docentes de la UNESCO (2024)' },
    { cat: 'Docentes', q: '¿Aproximadamente cuántos docentes del mundo no cumplen los estándares mínimos de titulación de su país?', options: ['1 de cada 50', '1 de cada 20', '1 de cada 5', '1 de cada 2'], answer: 2, explain: 'Alrededor de uno de cada cinco, es decir, el 20 % de los docentes (2024). La meta 4.c pretende cambiarlo para 2030.', src: 'Informe ODS de la ONU 2026' },
    { cat: 'Docentes', mix: true, q: '¿Qué región necesita más docentes adicionales para 2030?', options: ['Europa', 'África subsahariana', 'América del Norte', 'Oceanía'], answer: 1, explain: 'África subsahariana necesita 15 millones, uno de cada tres de todos los docentes adicionales que se necesitan en el mundo.', src: 'Informe mundial sobre los docentes de la UNESCO (2024)' },
    { cat: 'Docentes', q: '¿Qué proporción de países de ingreso bajo exige a los docentes de primaria tener un título de grado?', options: ['11%', '41%', '71%', '91%'], answer: 0, explain: 'Solo el 11 %, frente al 79 % de los países de ingreso alto.', src: 'Informe GEM de la UNESCO 2026' },
    // Equity
    { cat: 'Equidad', q: 'De los 739 millones de jóvenes y adultos que carecen de competencias básicas de alfabetización, ¿aproximadamente qué proporción son mujeres?', options: ['Alrededor de un tercio', 'Alrededor de dos tercios', 'Alrededor de tres cuartos', 'Casi todos'], answer: 1, explain: 'Alrededor de dos tercios son mujeres, por eso la alfabetización está estrechamente ligada a la igualdad de género.', src: 'UNESCO, Día Internacional de la Alfabetización 2026' },
    { cat: 'Equidad', q: 'En el mundo, ¿cuántos de los jóvenes más pobres terminan la secundaria superior por cada 100 de los más ricos?', options: ['14', '34', '64', '94'], answer: 1, explain: 'Solo 34. En primaria es 91, así que la brecha crece a medida que los niños se hacen mayores.', src: 'Informe ODS de la ONU 2026' },
    { cat: 'Equidad', q: 'Entre 2000 y 2025, la proporción de niñas casadas antes de los 18 años bajó del 25 % al…', options: ['8%', '12%', '15%', '18%'], answer: 3, explain: '18 % en 2025. El matrimonio infantil y el embarazo siguen siendo motivos importantes por los que las niñas abandonan la escuela.', src: 'Informe GEM de Género de la UNESCO 2026' },
    { cat: 'Equidad', q: 'En África subsahariana, ¿qué proporción de niñas embarazadas o madres vuelven a la escuela?', options: ['Menos del 5 %', 'Alrededor del 25 %', 'Alrededor del 50 %', 'Más del 75 %'], answer: 0, explain: 'Menos del 5 % regresan, aunque cada vez más países protegen su derecho a seguir estudiando.', src: 'Informe GEM de Género de la UNESCO 2026' },
    // Money and schools
    { cat: 'Dinero y escuelas', q: '¿De qué tamaño es la brecha anual de financiación educativa en los países de ingreso bajo y medio-bajo?', options: ['9700 millones de dólares', '97 000 millones de dólares', '970 000 millones de dólares', '9,7 billones de dólares'], answer: 1, explain: 'Unos 97 000 millones de dólares al año, de los cuales 70 000 millones corresponden a África subsahariana.', src: 'UNESCO (2023, repetido en 2026)' },
    { cat: 'Dinero y escuelas', q: '¿Cuántos países gastan más en pagar deudas que en educación?', options: ['13', '53', '113', '193'], answer: 2, explain: '113 países, hogar de 6100 millones de personas.', src: 'UNESCO, julio de 2026' },
    { cat: 'Dinero y escuelas', q: 'En 2024, la educación recibió el 7,5 % de la ayuda al desarrollo. Esa fue su proporción más baja en…', options: ['2 años', '5 años', '10 años', 'dos décadas'], answer: 3, explain: 'Dos décadas. La ayuda a la educación cayó un 8 % entre 2023 y 2024, y la ayuda a la educación básica, un 16 %.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Dinero y escuelas', q: '¿Cuántos niños recibieron comidas escolares en 2024?', options: ['46 millones', '166 millones', '466 millones', '1.400 millones'], answer: 2, explain: '466 millones, un 20 % más que en 2020.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Dinero y escuelas', q: '¿Aproximadamente cuántas escuelas primarias del mundo carecen de servicios básicos como electricidad, agua potable segura o saneamiento?', options: ['Menos de 1 de cada 20', 'Alrededor de 1 de cada 10', 'Más de 1 de cada 5', 'Alrededor de 1 de cada 2'], answer: 2, explain: 'Más de uno de cada cinco. En los países menos adelantados, más de la mitad de las escuelas no tienen electricidad.', src: 'Informe ODS de la ONU 2026' },
    // Skills
    { cat: 'Competencias', q: 'En el país mediano que informa, ¿qué proporción de adultos sabe escribir un programa informático?', options: ['6%', '26%', '46%', '66%'], answer: 0, explain: 'Solo el 6 %. Alrededor de un tercio sabe hacer una presentación electrónica, y la mayoría de los países que informan de estos datos son de ingreso medio alto o alto.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Competencias', q: '¿En cuántos de los 110 países estudiados no aparecía el cambio climático en los programas de ciencias y ciencias sociales de sexto curso?', options: ['50', '70', '90', '105'], answer: 0, explain: '50 de los 110 países. En tercer curso faltaba en 78.', src: 'Informe GEM de la UNESCO 2026' },
    { cat: 'Competencias', q: 'La educación terciaria incluye la universidad. ¿Cuál fue la tasa mundial de matrícula terciaria en 2024?', options: ['14%', '24%', '34%', '44%'], answer: 3, explain: '44 %, desde menos del 15 % en los países de ingreso bajo hasta más del 80 % en los de ingreso alto.', src: 'Informe GEM de la UNESCO 2026' },
    // History
    { cat: 'Historia', mix: true, q: '¿Qué documento, adoptado en 1948, declaró que “toda persona tiene derecho a la educación”?', options: ['La Declaración Universal de Derechos Humanos', 'El Acuerdo de París', 'Los Convenios de Ginebra', 'La Carta Olímpica'], answer: 0, explain: 'El artículo 26 de la Declaración Universal de Derechos Humanos afirma que toda persona tiene derecho a la educación, y que la educación elemental será gratuita y obligatoria.', src: 'Asamblea General de la ONU (1948)' },
    { cat: 'Historia', mix: true, q: '¿Dónde se celebró la Conferencia Mundial sobre Educación para Todos de 1990?', options: ['Jomtien, Tailandia', 'Dakar, Senegal', 'Incheon, República de Corea', 'Nueva York, Estados Unidos'], answer: 0, explain: 'En Jomtien, Tailandia, donde los países fijaron el objetivo de acceso universal a la educación primaria.', src: 'UNESCO' },
    { cat: 'Historia', q: '¿Qué Objetivo de Desarrollo del Milenio pretendía que todos los niños terminaran la primaria en 2015?', options: ['ODM 1', 'ODM 2', 'ODM 4', 'ODM 8'], answer: 1, explain: 'El ODM 2 pretendía la educación primaria universal para 2015. El ODS 4 elevó el listón a la secundaria para 2030.', src: 'Objetivos de Desarrollo del Milenio de la ONU (2000)' },
    // Early years
    { cat: 'Primeros años', q: '¿Durante qué etapa de la vida se desarrolla más rápido el cerebro?', options: ['Los primeros años de vida', 'La adolescencia', 'La edad adulta temprana', 'La vejez'], answer: 0, explain: 'El cerebro crece y forma sus conexiones básicas más rápido en los primeros años de vida, por eso la atención y el aprendizaje tempranos son tan importantes.', src: 'Harvard Center on the Developing Child' },
    { cat: 'Primeros años', q: '¿Qué es la educación preprimaria?', options: ['Aprendizaje para niños pequeños antes del primer año de primaria', 'Cursos de preparación universitaria', 'Clases nocturnas para adultos', 'Formación docente para secundaria'], answer: 0, explain: 'La educación preprimaria es el aprendizaje organizado para niños pequeños antes de empezar la primaria, como el jardín de infantes o la guardería.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'Primeros años', q: '¿Por qué la meta 4.2 busca la educación preprimaria?', options: ['Para que los niños estén listos para la primaria', 'Para que los niños puedan saltarse la primaria', 'Para que los padres puedan trabajar a tiempo completo', 'Para que las escuelas puedan cerrar antes'], answer: 0, explain: 'La meta 4.2 dice que los niños deben estar listos para la primaria, así que el aprendizaje temprano les permite tener éxito más adelante.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'Primeros años', q: '¿Qué tipo de cuidado abarca la meta 4.2?', options: ['Desarrollo y cuidado de la primera infancia', 'Cuidado de personas mayores', 'Seguro de salud', 'Vivienda'], answer: 0, explain: 'La meta 4.2 abarca el desarrollo y el cuidado de la primera infancia, además de la educación preprimaria, así que el aprendizaje empieza con el cuidado en los primeros años.', src: 'Agenda 2030 de la ONU (2015)' },
    // Literacy
    { cat: 'Alfabetización', q: '¿Qué meta abarca la alfabetización y la numeración?', options: ['Meta 4.1', 'Meta 4.6', 'Meta 4.7', 'Meta 4.b'], answer: 1, explain: 'La meta 4.6 busca que, para 2030, todos los jóvenes y una proporción considerable de adultos, hombres y mujeres, alcancen la alfabetización y la numeración.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'Alfabetización', q: '¿Cuándo se celebra el Día Internacional de la Alfabetización?', options: ['8 de marzo', '21 de febrero', '8 de septiembre', '5 de octubre'], answer: 2, explain: 'La UNESCO celebra cada año el Día Internacional de la Alfabetización el 8 de septiembre, para destacar la importancia de la alfabetización para las personas y las sociedades.', src: 'UNESCO, Día Internacional de la Alfabetización 2026' },
    { cat: 'Alfabetización', q: '¿Qué significa la numeración?', options: ['Leer con fluidez', 'Usar los números y las matemáticas básicas en la vida diaria', 'Escribir ensayos', 'Hablar una segunda lengua'], answer: 1, explain: 'La numeración es la capacidad de usar los números y las matemáticas básicas en la vida diaria, igual que la alfabetización es la capacidad de leer y escribir.', src: 'Agenda 2030 de la ONU (2015)' },
    { cat: 'Alfabetización', q: '¿A quiénes incluye la meta 4.6?', options: ['Solo los niños', 'Solo los docentes', 'Todos los jóvenes y una proporción considerable de adultos, hombres y mujeres', 'Solo las personas de las ciudades'], answer: 2, explain: 'La meta 4.6 abarca a jóvenes y adultos, hombres y mujeres, no solo a niños. Por eso la alfabetización es un objetivo para toda la vida.', src: 'Agenda 2030 de la ONU (2015)' },
    // Inclusion
    { cat: 'Inclusión', q: '¿Qué tratado establece el derecho a la educación inclusiva de las personas con discapacidad?', options: ['El Acuerdo de París', 'La Convención sobre los Derechos de las Personas con Discapacidad', 'El Protocolo de Kioto', 'Los Convenios de Ginebra'], answer: 1, explain: 'El artículo 24 de la Convención sobre los Derechos de las Personas con Discapacidad (2006) establece el derecho a la educación inclusiva en todos los niveles.', src: 'CDPD de la ONU (2006), artículo 24' },
    { cat: 'Inclusión', q: '¿Qué es el Día Internacional de la Lengua Materna, que se celebra el 21 de febrero?', options: ['Un día para dejar de enseñar inglés', 'Un día para promover la diversidad lingüística y la educación en lengua materna', 'Un descanso de los exámenes escolares', 'Un día para evaluar a los docentes'], answer: 1, explain: 'La UNESCO creó el Día Internacional de la Lengua Materna para promover la diversidad lingüística y la educación en las lenguas que las personas hablan en casa.', src: 'UNESCO, Día Internacional de la Lengua Materna' },
    { cat: 'Inclusión', q: '¿Por qué aprender en un idioma que los niños no hablan en casa puede ser un obstáculo?', options: ['Hace más difícil el aprendizaje inicial para muchos niños', 'Hace las escuelas más baratas', 'Elimina la necesidad de docentes', 'No afecta al aprendizaje'], answer: 0, explain: 'Los niños aprenden mejor primero en una lengua que entienden. La educación en lengua materna les da una base más sólida para leer y aprender después.', src: 'UNESCO, Día Internacional de la Lengua Materna' },
    { cat: 'Inclusión', q: 'En el ODS 4, ¿qué significa la educación “inclusiva”?', options: ['Educación solo para familias ricas', 'Educación que llega a todas las personas, incluidas las personas con discapacidad y los grupos marginados', 'Educación solo para adultos', 'Solo aprendizaje en línea'], answer: 1, explain: 'El ODS 4 pide una educación inclusiva: una educación que llegue a todas las personas, incluidas las personas con discapacidad, las niñas y los grupos marginados.', src: 'Agenda 2030 de la ONU (2015)' }
  ];

  const MILESTONES = [
    { year: '1948', short: 'Derecho a la educación', title: 'La educación se convierte en un derecho humano', text: 'La Declaración Universal de Derechos Humanos afirma que toda persona tiene derecho a la educación, y que la educación elemental será gratuita y obligatoria (artículo 26).', src: 'Asamblea General de la ONU, 1948' },
    { year: '1989', short: 'Derechos del niño', title: 'Una promesa hecha a cada niño', text: 'La Convención sobre los Derechos del Niño compromete a los países a hacer obligatoria y gratuita la educación primaria para todos. Es el tratado de derechos humanos más ratificado de la historia.', src: 'Convención de la ONU sobre los Derechos del Niño, 1989' },
    { year: '1990', short: 'Educación para Todos', title: 'Educación para Todos', text: 'En la Conferencia Mundial sobre Educación para Todos de Jomtien, Tailandia, los países fijaron el objetivo de acceso universal a la educación primaria.', src: 'Informe GEM de la UNESCO 2026' },
    { year: '2000', short: 'Dakar y los ODM', title: 'Cada niño debería terminar la primaria', text: 'En el Foro Mundial de Educación de Dakar, Senegal, y en los Objetivos de Desarrollo del Milenio, el mundo pretendía que todos los niños terminaran la primaria en 2015 (ODM 2). No se logró.', src: 'UNESCO; Objetivos de Desarrollo del Milenio de la ONU' },
    { year: '2015', short: 'Se acuerda el ODS 4', title: 'El ODS 4 eleva el listón', text: 'En mayo, la Declaración de Incheon fijó la visión de Educación 2030. En septiembre, todos los Estados miembros de la ONU adoptaron los 17 ODS, con el objetivo de que todos los jóvenes terminaran la secundaria.', src: 'Agenda 2030 de la ONU; UNESCO' },
    { year: '2016', short: 'Empieza la cuenta atrás', title: 'Comienza la cuenta atrás', text: 'Los ODS entraron oficialmente en vigor el 1 de enero de 2016, iniciando una cuenta atrás de 15 años hasta 2030.', src: 'Naciones Unidas' },
    { year: '2022', short: 'Cumbre de educación', title: 'Cumbre Transformar la Educación', text: 'El secretario general de la ONU reunió a líderes mundiales en Nueva York para devolver la educación al primer plano de la agenda mundial, después de que la pandemia de COVID-19 alterara la escolarización de la mayoría de los estudiantes del mundo.', src: 'Naciones Unidas' },
    { year: '2026', short: 'Hoy', now: true, title: 'Dónde estamos ahora', text: null, src: 'Informe GEM de la UNESCO 2026; Informe ODS de la ONU 2026' },
    { year: '2030', short: 'Plazo', title: 'El plazo', text: 'La fecha límite de cada compromiso del ODS 4, desde primaria y secundaria gratuitas para todos hasta suficientes docentes cualificados.', src: 'Agenda 2030 de la ONU' }
  ];

  const FACTS = [
    { num: 'Cada 2 segundos', text: 'Hace falta que un niño más entre en la escuela cada dos segundos solo para que el mundo siga encaminado a 2030.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '25 por minuto', text: 'Desde 2000, más de 25 niños adicionales han entrado en la escuela cada minuto, lo que suma 327 millones de estudiantes en primaria y secundaria.', src: 'Informe GEM de la UNESCO 2026' },
    { num: 'Del 18 % al 84 %', text: 'Etiopía elevó su tasa de matrícula en primaria del 18 % en 1974 al 84 % en 2024.', src: 'Informe GEM de la UNESCO 2026' },
    { num: 'Del 7 % a más del 60 %', text: 'China amplió el acceso a la universidad y otra educación terciaria del 7 % en 1999 a más del 60 % en 2024.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '33 puntos', text: 'Nepal cerró una brecha de 33 puntos porcentuales entre niñas y niños en la finalización de la secundaria básica entre 1990 y 2024.', src: 'Informe GEM de Género de la UNESCO 2026' },
    { num: '22 por detrás, 11 por delante', text: 'En Camboya, las niñas pasaron de estar 22 puntos por detrás de los niños en la finalización de la primaria en 1981 a estar 11 puntos por delante en 2024.', src: 'Informe GEM de Género de la UNESCO 2026' },
    { num: '1 año más', text: 'En Camboya, la electrificación por sí sola se ha relacionado con casi un año completo más de escolarización.', src: 'Informe GEM de la UNESCO 2026' },
    { num: 'Medio año', text: 'Se ha demostrado que los programas de alimentación escolar añaden hasta medio año de aprendizaje por cada 100 dólares invertidos.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '36 % más probabilidades', text: 'Los niños cuyas familias reciben transferencias de efectivo condicionadas a la asistencia escolar tienen un 36 % más de probabilidades de estar matriculados.', src: 'Informe GEM de la UNESCO 2026' },
    { num: 'Más de 1 año', text: 'En 14 países africanos, hacer obligatoria la educación, y no solo gratuita, añadió más de un año de escolarización.', src: 'Informe GEM de la UNESCO 2026' },
    { num: 'Del 8 % al 26 %', text: 'La proporción de países con 12 años de educación obligatoria se ha más que triplicado, del 8 % al 26 %.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '466 millones', text: '466 millones de niños recibieron comidas escolares en 2024, un 20 % más que en 2020.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '113 países', text: '113 países, hogar de 6100 millones de personas, gastan más en pagar deudas que en educación.', src: 'UNESCO, julio de 2026' },
    { num: '22%', text: 'Solo 41 de los 183 países con datos (22 %) cumplen ambos referentes de gasto en educación: al menos el 4 % del PIB y al menos el 15 % del gasto público.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '70 de 83', text: 'En 70 de los 83 países con datos, más de la mitad de los alumnos de secundaria básica afirmaron haber sufrido acoso.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '3909 ataques', text: 'En 2024 se registraron 3909 ataques contra la educación en 69 países, la cifra más alta desde que la Coalición Mundial para Proteger la Educación de los Ataques empezó a informar en 2013.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '1 de cada 4', text: 'Alrededor de uno de cada cuatro jóvenes de los países de ingreso bajo no sabía leer ni escribir en 2024.', src: 'Informe GEM de la UNESCO 2026' },
    { num: 'De 143 M a 86 M', text: 'El número de jóvenes que no saben leer ni escribir bajó de 143 millones en 2000 a 86 millones en 2024.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '11 % frente a 79 %', text: 'Solo el 11 % de los países de ingreso bajo exige a los docentes de primaria tener un título de grado, frente al 79 % de los países de ingreso alto.', src: 'Informe GEM de la UNESCO 2026' },
    { num: 'Menos del 5 %', text: 'Menos del 5 % de las niñas embarazadas o madres en África subsahariana vuelven a la escuela.', src: 'Informe GEM de Género de la UNESCO 2026' },
    { num: 'Reducido a la mitad', text: 'Costa de Marfil ha reducido a la mitad sus tasas de exclusión escolar de niños, adolescentes y jóvenes desde 2000.', src: 'Informe GEM de la UNESCO 2026' },
    { num: '2,4 millones', text: 'Unas 2,4 millones de niñas en Afganistán tienen prohibido acudir a la secundaria. La UNESCO advierte de que la cifra podría acercarse a 4 millones en 2030.', src: 'UNESCO, agosto de 2026' }
  ];

  const TIPS = [
    'Deja el móvil en otra habitación. Incluso un móvil en silencio sobre la mesa te distrae.',
    'Pon a prueba tus conocimientos en lugar de releer. Cierra el libro y escribe todo lo que recuerdes.',
    'Espacia el estudio. Sesiones cortas repartidas en varios días son mejores que empollar una sola noche antes.',
    'Escribe un objetivo claro para esta sesión antes de pulsar empezar.',
    'Explícalo en voz alta. Si puedes enseñarlo de forma sencilla, lo entiendes.',
    'Empieza por la tarea más difícil mientras tu concentración esté fresca.',
    'Aprovecha la pausa para moverte: levántate, estírate, bebe agua y mira a lo lejos.',
    'Mezcla temas relacionados. Alternar entre tipos de problemas te ayuda a saber cuándo usar cada método.'
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
      v.append(sw, document.createTextNode(String(d.value)), h('small', null, 'millones'));
      lab.append(v, h('span', 'sl-name', d.name));
      labels.appendChild(lab);

      const seg = h('div', 'stack-seg');
      seg.style.flex = d.value + ' 1 0';
      seg.style.background = d.color;
      seg.addEventListener('pointermove', (e) => tip.show('Fuera de la escuela, 2024', [{ color: d.color, value: d.value + ' millones', label: d.name }], e.clientX, e.clientY));
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
    sv('text', { x: x(2015) + 8, y: y(5), class: 'annot-text' }, svg).textContent = 'ODS adoptados';

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
        d.year === 2015 ? '2015, cuando se adoptaron los ODS' : String(d.year),
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
      row.setAttribute('aria-label', placeLabel(r) + ': primaria ' + r.primary + '%, secundaria básica ' + r.lower + '%, secundaria superior ' + r.upper + '%');
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

    buildTable($('#regionTable'), ['Región', 'Primaria', 'Secundaria básica', 'Secundaria superior'],
      REGIONS.map((r) => [r.name, r.primary + '%', r.lower + '%', r.upper + '%']), 'Tasa de finalización por región, 2024');
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
      row.setAttribute('aria-label', p.name + ': ' + p.value + ' de los más pobres terminan, por cada 100 de los más ricos');
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
    buildTable($('#parityTable'), ['Nivel', 'Más pobres por cada 100 más ricos'], PARITY.map((p) => [p.name, String(p.value)]),
      'Finalización entre el 20 % más pobre por cada 100 del 20 % más rico');
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
    { key: null, text: 'niños empiezan juntos' },
    { key: 'primary', text: 'terminan la primaria' },
    { key: 'lower', text: 'terminan la secundaria básica' },
    { key: 'upper', text: 'terminan la secundaria superior' }
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
      parts.push(placeLabel(r) + ': ' + n + ' de cada 100 ' + st.text);
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
    $('#journeyPlay').textContent = finished ? 'Volver a reproducir' : 'Recorre el camino';
  }

  function playJourney() {
    stopJourney();
    setStage(0, true);
    Sound.play('start');
    $('#journeyPlay').textContent = 'Parar';
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
      const want = idx === 0 ? 'África subsahariana' : 'Europa y América del Norte';
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
    const yearsWord = years === 1 ? ' año' : ' años';
    return fill('273 millones de niños y jóvenes están fuera de la escuela, una cifra que sube desde hace siete años seguidos, y la ayuda a la educación está disminuyendo. Quedan unos {0} para la fecha límite.', years + yearsWord);
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
      if (m.now) b.appendChild(h('span', 'tl-now', 'Estás aquí'));
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
    right.append(h('h3', 'tl-card-title', m.title), h('p', 'tl-card-text', milestoneText(m)), h('p', 'tl-card-src', 'Fuente: ' + m.src));
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
    nav.append(mk('Antes', -1), mk('Después', 1), h('span', 'tl-count', (tlIndex + 1) + ' de ' + MILESTONES.length));
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
    card.querySelector('.fc-src').textContent = 'Fuente: ' + f.src;
    $('#factCount').textContent = 'Dato ' + (factPos + 1) + ' de ' + FACTS.length;
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
    [['outcome', 'Metas de resultados: lo que el mundo debe lograr'], ['means', 'Medios de implementación: cómo lograrlo']].forEach((g) => {
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
    $('#targetStatus').textContent = 'Mostrando la meta ' + t.code + ': ' + t.title;
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
    titles.append(h('p', 'td-kind', t.kind === 'outcome' ? 'Meta de resultados' : 'Medios de implementación'), h('h2', 'td-title', t.title));
    head.append(h('p', 'td-code', t.code), titles);

    const official = h('blockquote', 'td-official');
    official.append(h('p', null, '“' + t.official + '”'), h('footer', null, 'Redacción oficial de la ONU para la meta ' + t.code));

    const grid = h('div', 'td-grid');
    const plain = h('section');
    plain.append(h('h3', 'td-h', 'En palabras sencillas'), h('p', 'td-p', t.plain));
    const measured = h('section');
    measured.append(h('h3', 'td-h', 'Cómo se mide'), h('p', 'td-p', t.measured));
    grid.append(plain, measured);

    const stats = h('section', 'td-section');
    stats.appendChild(h('h3', 'td-h', 'Dónde está el mundo'));
    const statRow = h('div', 'td-stats');
    t.stats.forEach((s) => {
      const d = h('div');
      d.append(h('p', 'td-stat-num', s.value), h('p', 'td-stat-text', s.text), h('p', 'td-stat-src', 'Fuente: ' + SOURCE_NAMES[s.src]));
      statRow.appendChild(d);
    });
    stats.appendChild(statRow);

    const act = h('section', 'td-section');
    act.append(h('h3', 'td-h', 'Qué puedes hacer'), h('p', 'td-p', t.action));

    const notes = h('section', 'td-section td-notes');
    const noteId = 'note-' + t.code.replace('.', '-');
    const noteLabel = h('label', 'td-h', 'Tus notas sobre la meta ' + t.code);
    noteLabel.htmlFor = noteId;
    const area = h('textarea', 'td-note');
    area.id = noteId;
    area.rows = 4;
    area.maxLength = 1000;
    area.placeholder = '¿Qué te sorprendió? ¿Qué podrían hacer tu escuela o tu ciudad al respecto?';
    const savedNotes = store.get('sdg4.notes', {}) || {};
    area.value = typeof savedNotes[t.code] === 'string' ? savedNotes[t.code] : '';
    const noteStatus = h('p', 'td-note-status', area.value ? 'Guardado en este dispositivo.' : 'Solo tú puedes ver estas notas. Se quedan en este dispositivo.');
    area.addEventListener('input', () => {
      const all = store.get('sdg4.notes', {}) || {};
      if (area.value.trim()) all[t.code] = area.value;
      else delete all[t.code];
      store.set('sdg4.notes', all);
      noteStatus.textContent = 'Guardado en este dispositivo.';
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
    nav.append(makeBtn('Meta anterior', -1), h('span', 'td-count', (vis.indexOf(targetIndex) + 1) + ' de ' + vis.length), makeBtn('Meta siguiente', 1));

    body.append(head, official, grid, stats, act, notes, nav);
    host.appendChild(body);
  }

  /* ------------------------------------------------------------------ */
  /* Quiz                                                                */
  /* ------------------------------------------------------------------ */
  const MODES = {
    classic: { name: 'Clásico', tag: 'Relajado', count: 10, timed: false, lifeline: false, desc: '10 preguntas aleatorias sin reloj. Tómate tu tiempo y lee cada explicación.' },
    challenge: { name: 'Desafío', tag: 'Contra el reloj', count: 15, timed: true, seconds: 20, lifeline: true, desc: '15 preguntas, 20 segundos cada una. Las respuestas rápidas y las rachas dan puntos extra, y tienes un 50:50.' },
    marathon: { name: 'Maratón', tag: 'Todo el banco de preguntas', count: Infinity, timed: false, lifeline: false, desc: null }
  };
  const CHAPTER_MODE = { name: 'Capítulo', tag: 'Capítulo', count: Infinity, timed: false, lifeline: false, desc: null };
  const modeInfo = (key) => (key === 'chapter' ? CHAPTER_MODE : MODES[key]);
  const CHAPTER_ORDER = ['El objetivo', 'Acceso', 'Finalización', 'Aprendizaje', 'Competencias', 'Equidad', 'Docentes', 'Dinero y escuelas', 'Historia', 'Primeros años', 'Alfabetización', 'Inclusión'];
  const BOARD_KEY = 'sdg4.quiz.board';
  const BOARD_TABS = [
    { key: 'challenge', label: 'Desafío' },
    { key: 'classic', label: 'Clásico' },
    { key: 'marathon', label: 'Maratón' },
    { key: 'chapters', label: 'Capítulos' }
  ];
  let boardGroup = 'challenge';
  let lastSavedAt = 0;
  const TIERS = [
    { title: 'Puntuación perfecta', text: 'Conoces el ODS 4 a fondo. ¿Listo para dar la clase?' },
    { title: 'Excelente trabajo', text: 'Conoces el objetivo, sus metas y las cifras que hay detrás.' },
    { title: 'Buen trabajo', text: 'Buen dominio del ODS 4. Las secciones Explorar y Metas pueden ayudarte a completar lo que falta.' },
    { title: 'Vas por buen camino', text: 'Echa un vistazo al panel y a las metas, y vuelve a intentarlo.' },
    { title: 'Sigue aprendiendo', text: 'Explora el panel y las diez metas, y vuelve a intentarlo.' }
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
      const desc = M.desc || 'Todas las ' + QUIZ.length + ' preguntas de una vez. ¿Cuánto podrá durar tu racha?';
      const best = bests[key];
      const bestText = typeof best === 'number' ? (M.timed ? 'Mejor: ' + numberFmt.format(best) + ' puntos' : 'Mejor: ' + best + ' de ' + count) : 'Todavía sin puntuación';
      const b = h('button', 'mode-card' + (key === 'challenge' ? ' is-featured' : ''));
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', 'Jugar'));
      b.append(h('span', 'mc-tag', M.tag), h('span', 'mc-name', M.name), h('span', 'mc-desc', desc), foot);
      b.addEventListener('click', () => startQuiz(key));
      grid.appendChild(b);
    });
    $('#bankSize').textContent = String(QUIZ.length);
    renderChapters();
    renderBoard();
  }

  const scoreText = () => (modeInfo(quiz.mode).timed ? numberFmt.format(quiz.points) + ' puntos' : 'Puntuación ' + quiz.correct);

  function renderStreak(bump) {
    const b = $('#streakBadge');
    if (quiz.streak >= 2) {
      const mult = modeInfo(quiz.mode).timed ? (quiz.streak >= 5 ? ' ×2' : quiz.streak >= 3 ? ' ×1.5' : '') : '';
      b.hidden = false;
      b.textContent = 'Racha ' + quiz.streak + mult;
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
    ll.textContent = 'Usar 50:50';
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
    $('#qpText').textContent = 'Pregunta ' + (quiz.i + 1) + ' de ' + total;
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
    ll.textContent = '50:50 usado';
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
    if (correct) verdict = M.timed ? '¡Correcto! +' + gained + ' puntos' + (mult > 1 ? fill(' con bonificación de racha ×{0}', mult) : '') : '¡Correcto!';
    else if (timedOut) verdict = 'Se acabó el tiempo. La respuesta es ' + q.options[q.answer] + '.';
    else verdict = 'No del todo. La respuesta es ' + q.options[q.answer] + '.';

    const fb = $('#quizFeedback');
    fb.textContent = '';
    fb.append(h('p', 'fb-verdict', verdict), h('p', 'fb-text', q.explain), h('p', 'fb-src', 'Fuente: ' + q.src));
    fb.hidden = false;
    $('#qpScore').textContent = scoreText();
    if (gained) popPoints('+' + gained);
    renderStreak(correct);
    $('#qpFill').style.width = ((quiz.i + 1) / quiz.order.length) * 100 + '%';
    if (M.lifeline) $('#lifelineBtn').disabled = true;
    const next = $('#quizNext');
    next.textContent = quiz.i === quiz.order.length - 1 ? 'Ver mi puntuación' : 'Siguiente pregunta';
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
      const bestText = typeof best === 'number' ? 'Mejor: ' + best + ' de ' + total : 'Todavía sin jugar';
      const b = h('button', 'chapter-card');
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', 'Jugar'));
      b.append(h('span', 'ch-num', 'Capítulo ' + (n + 1)), h('span', 'mc-name', cat), h('span', 'ch-count', total + ' preguntas'), foot);
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
      const score = e.group === 'challenge' ? numberFmt.format(e.score) + ' puntos' : e.correct + ' de ' + e.of;
      const meta = e.label + ' · ' + (e.group === 'challenge' ? e.correct + ' de ' + e.of + ' correctas · ' : '') + dateText(e.t);
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
      btn.textContent = 'Vuelve a pulsar para borrar todas las puntuaciones';
      btn.classList.add('is-armed');
      clearTimer = setTimeout(() => {
        clearTimer = 0;
        btn.textContent = 'Borrar clasificación';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(clearTimer);
    clearTimer = 0;
    store.set(BOARD_KEY, []);
    btn.textContent = 'Borrar clasificación';
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
      $('#ssMsg').textContent = 'Escribe primero un nombre.';
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
    $('#ssMsg').textContent = 'Guardado. Eres el número ' + rank + ' en la clasificación ' + tabLabel + '.';
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
    $('#flashCount').textContent = (fcState.i + 1) + ' de ' + total;
    $('#flashFill').style.width = ((fcState.i + 1) / total) * 100 + '%';
    $('#flashCat').textContent = q.cat;
    $('#flashFront').textContent = q.q;
    const answer = $('#flashAnswer');
    answer.textContent = '';
    answer.append(h('span', 'fa-answer', q.options[q.answer]), h('span', 'fa-why', q.explain + ' Fuente: ' + q.src + '.'));
    $('#flashPrev').disabled = fcState.i === 0;
    $('#flashNext').textContent = fcState.i === total - 1 ? 'Empezar de nuevo' : 'Siguiente tarjeta';
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
    const label = quiz.mode === 'chapter' ? fill('el capítulo {0}', quiz.chapter) : fill('modo {0}', M.name);
    const score = M.timed ? numberFmt.format(quiz.points) + ' puntos' : quiz.correct + ' de ' + total;
    const text = 'Saqué ' + score + ' en el test del ODS 4 (' + label + ') en Educación de Calidad para Todos. ¿Puedes superarlo?';
    const msg = $('#shareMsg');
    msg.hidden = false;
    msg.textContent = '';
    if (navigator.share) {
      navigator.share({ title: 'Test del ODS 4', text }).then(
        () => { msg.textContent = 'Compartido.'; },
        () => { msg.textContent = ''; }
      );
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { msg.textContent = 'Copiado. Pégalo donde quieras para compartir tu puntuación.'; },
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
    chapterEl.textContent = quiz.chapter ? 'Capítulo: ' + quiz.chapter : '';
    $('#rsTitle').textContent = tier.title;
    $('#rsText').textContent = tier.text;

    const stats = $('#resultStats');
    stats.textContent = '';
    const addStat = (value, label) => {
      const d = h('div', 'rstat');
      d.append(h('b', null, value), h('span', null, label));
      stats.appendChild(d);
    };
    addStat(Math.round(ratio * 100) + '%', 'respondidas correctamente');
    addStat(String(quiz.bestStreak), 'mejor racha');
    if (M.timed) addStat(numberFmt.format(quiz.points), 'puntos');

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
      topics = 'Tema más fuerte: ' + strong + ' (' + byCat[strong].right + ' de ' + byCat[strong].all + ').';
      if (weak !== strong && sc(weak) < 1) topics += ' Conviene repasarlo: ' + weak + ' (' + byCat[weak].right + ' de ' + byCat[weak].all + ').';
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
    reviewBtn.textContent = 'Revisar respuestas';
    quiz.answers.forEach((a) => {
      const q = QUIZ[a.qi];
      const li = h('li');
      const mk = h('span', 'rv-mark' + (a.correct ? '' : ' is-wrong'));
      const s = sv('svg', { viewBox: '0 0 30 30', 'aria-hidden': 'true' }, mk);
      sv('path', { d: a.correct ? MARKS.tick : MARKS.cross }, s);
      mk.appendChild(h('span', 'visually-hidden', a.correct ? 'Correcto' : 'Incorrecto'));
      const body = h('div');
      let line;
      if (a.correct) line = 'Tu respuesta: ' + q.options[a.chosen] + '.';
      else if (a.timedOut) line = 'Sin respuesta: se acabó el tiempo. Respuesta correcta: ' + q.options[q.answer] + '.';
      else line = 'Tu respuesta: ' + q.options[a.chosen] + '. Respuesta correcta: ' + q.options[q.answer] + '.';
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
  const MODE_LABEL = { focus: 'Concentración', short: 'Pausa corta', long: 'Pausa larga' };
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
    if (timer.mode === 'focus') return 'Sesión ' + Math.min(timer.cycle + 1, every) + ' de ' + every;
    if (timer.mode === 'short') return 'Levántate, estírate y bebe un poco de agua';
    return 'Ciclo completado. Disfruta de un buen descanso';
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
    $('#cycleLabel').textContent = left === 0 ? 'Hora de una pausa larga' : left + (left === 1 ? ' sesión de concentración' : ' sesiones de concentración') + ' hasta una pausa larga';
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
    $('#tStart').textContent = timer.running ? 'Pausar' : (timer.remaining < timer.total ? 'Reanudar' : 'Empezar');
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
    announce(MODE_LABEL[timer.mode] + ' iniciado');
  }
  function pause() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, timer.endAt - Date.now());
    timer.running = false;
    stopClock();
    renderTimer();
    Sound.play('pause');
    announce('En pausa');
  }
  const toggleTimer = () => (timer.running ? pause() : start(false));
  function resetTimer() {
    timer.running = false;
    stopClock();
    timer.remaining = timer.total;
    renderTimer();
    Sound.play('tap');
    announce('Temporizador reiniciado');
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
    announce(completed ? MODE_LABEL[was] + ' terminado. Lo siguiente: ' + MODE_LABEL[next] + '.' : 'Saltado a ' + MODE_LABEL[next] + '.');
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
    { name: 'Finalización de primaria', a: 77, b: 88 },
    { name: 'Finalización de secundaria básica', a: 60, b: 78 },
    { name: 'Finalización de secundaria superior', a: 37, b: 61 },
    { name: 'Alfabetización juvenil', a: 87, b: 93 }
  ];

  const ACTION_GROUPS = [['school', 'En la escuela'], ['community', 'En tu comunidad'], ['voice', 'Habla']];
  const ACTIONS = [
    { id: 'tutor', group: 'school', target: '4.1', title: 'Crea un club de tutoría entre iguales', text: 'Ayuda a los estudiantes más jóvenes con lectura o matemáticas una vez a la semana.' },
    { id: 'books', group: 'school', target: '4.6', title: 'Organiza un intercambio de libros', text: 'Reúne libros que ya no se usen e intercámbialos a la hora del almuerzo.' },
    { id: 'include', group: 'school', target: '4.5', title: 'Haz tu clase más inclusiva', text: 'Invita a alguien nuevo a tu grupo y pide materiales que todos puedan usar.' },
    { id: 'eco', group: 'school', target: '4.7', title: 'Crea un club ecológico o de temas globales', text: 'Lleva el cambio climático y los derechos humanos a los proyectos de clase.' },
    { id: 'safe', group: 'school', target: '4.a', title: 'Defiende una escuela segura', text: 'Informa de baños, rampas o luces rotas, y apoya a los compañeros que sufren acoso.' },
    { id: 'teacher', group: 'school', target: '4.c', title: 'Da las gracias a un docente', text: 'Escribe una nota a un docente que haya marcado la diferencia para ti.' },
    { id: 'read', group: 'community', target: '4.2', title: 'Leer con niños pequeños', text: 'Lee con un familiar pequeño, o ofrécete como voluntario en un centro de educación infantil de tu zona.' },
    { id: 'supplies', group: 'community', target: '4.5', title: 'Reúne material escolar', text: 'Organiza una recogida de cuadernos, bolígrafos y mochilas para los estudiantes que los necesiten.' },
    { id: 'skill', group: 'community', target: '4.4', title: 'Enseña una competencia digital', text: 'Enseña a un familiar a hacer una presentación o a navegar seguro por internet.' },
    { id: 'scholar', group: 'community', target: '4.b', title: 'Comparte información sobre becas', text: 'Reúne oportunidades de becas y cursos y publícalas para tu clase.' },
    { id: 'talk', group: 'voice', target: 'Todos', title: 'Da una charla sobre el ODS 4', text: 'Presenta los datos de este sitio a tu clase o en una asamblea.' },
    { id: 'write', group: 'voice', target: 'Financiación', title: 'Escribe a una persona que toma decisiones', text: 'Pide a los responsables de tu escuela o a tu representante local que protejan el presupuesto educativo.' },
    { id: 'share', group: 'voice', target: 'Todos', title: 'Comparte un dato a la semana', text: 'Publica un dato de la máquina de datos, siempre con su fuente.' }
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
    if (label) label.textContent = on ? 'Sonido activado' : 'Silenciar';
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
    buildTable($('#slopeTable'), ['Año', 'Primaria', 'Secundaria básica', 'Secundaria superior'],
      TREND.map((d) => [String(d.year), d.primary + '%', d.lower + '%', d.upper + '%']), 'Tasa de finalización en todo el mundo');
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
        btn.textContent = open ? 'Mostrar tabla de datos' : 'Ocultar tabla de datos';
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
      btn.textContent = open ? 'Revisar respuestas' : 'Ocultar respuestas';
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
      announce(MODE_LABEL[timer.mode] + ' seleccionado');
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
    l1.append(h('i'), document.createTextNode('Proporción en el año elegido (%)'));
    const l2 = h('span');
    const line = h('i', 'line');
    l2.append(line, document.createTextNode('Nivel en 2000'));
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
        r.delta.textContent = y === 2024 ? '+' + (r.d.b - r.d.a) + ' puntos' : '';
        tweenTo(r, v, animate);
      });
      $('#tnStatus').textContent = 'Mostrando ' + y + ': ' + rows.map((r) => r.d.name + ' ' + (y === 2000 ? r.d.a : r.d.b) + '%').join(', ') + '.';
    };
    const stopPlay = () => {
      clearTimeout(playing);
      playing = 0;
      $('#tnPlay').textContent = 'Reproducir el cambio';
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
      $('#tnPlay').textContent = 'Reproduciendo';
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
    const tagText = (a) => (/^\d/.test(a.target) ? 'Meta ' + a.target : a.target === 'Todos' ? 'Todas las metas' : a.target);
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
      pickCount.textContent = state.picks.length + ' de ' + MAX_PICKS + ' elegidas';
      const badge = $('#plBadge');
      badge.textContent = state.mine ? 'Tu compromiso' : 'Ejemplo de compromiso: cámbialo para que sea tuyo';
      badge.classList.toggle('is-mine', state.mine);
      const list = $('#plList');
      list.textContent = '';
      if (!state.picks.length) {
        list.appendChild(h('li', 'pl-empty', 'Elige hasta tres acciones para añadirlas aquí.'));
      }
      state.picks.forEach((id) => {
        const a = byId(id);
        const isDone = state.done.indexOf(id) >= 0;
        const li = h('li', 'pl-item' + (isDone ? ' is-done' : ''));
        const text = h('div');
        text.append(h('span', 'pl-item-title', a.title), h('span', 'pl-item-tag', tagText(a)));
        const btn = h('button', 'pl-done', isDone ? 'Hecho' : 'Marcar como hecho');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(isDone));
        btn.setAttribute('aria-label', (isDone ? 'Hecho: ' : 'Marcar como hecho: ') + a.title);
        btn.addEventListener('click', () => markDone(id));
        li.append(text, btn);
        list.appendChild(li);
      });
      const done = state.picks.filter((id) => state.done.indexOf(id) >= 0).length;
      const total = state.picks.length;
      $('#plCount').textContent = total ? done + ' de ' + total + ' hechos' : 'Todavía no has elegido nada';
      $('#plFill').style.width = (total ? (done / total) * 100 : 0) + '%';
      $('#plDate').textContent = state.made ? 'Creado el ' + niceDate(state.made) : 'Se guarda en este navegador en cuanto lo cambies';
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
        status('Puedes elegir hasta tres acciones. Quita una primero.');
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
        status(all ? 'Todo hecho. Ese es todo tu compromiso.' : 'Muy bien. Sigue así.');
      }
      save();
      render();
      const again = $('#plList [aria-label$="' + byId(id).title + '"]');
      if (again) again.focus({ preventScroll: true });
    }

    function pledgeText() {
      const lines = ['Mi compromiso con el ODS 4'];
      if (state.name.trim()) lines.push('Nombre: ' + state.name.trim());
      state.picks.forEach((id, i) => {
        const a = byId(id);
        lines.push((i + 1) + '. ' + a.title + (state.done.indexOf(id) >= 0 ? ' (done)' : ''));
      });
      lines.push('Creado el ' + niceDate(state.made || todayISO()) + ' para Educación de Calidad para Todos, ODS 4.');
      return lines.join('\n');
    }

    nameInput.addEventListener('input', () => {
      state.name = nameInput.value.slice(0, 40);
      save();
      render();
    });

    $('#plCopy').addEventListener('click', () => {
      if (!state.picks.length) {
        status('Elige al menos una acción primero.');
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
        status('Selecciona el texto de abajo y cópialo.');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            area.hidden = true;
            status('Copiado. Pégalo donde quieras.');
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
      status('Borrado. Elige hasta tres acciones.');
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
      count.textContent = q ? n + ' de ' + items.length + ' términos' : items.length + ' términos';
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
      $('#deckStatus').textContent = 'Diapositiva ' + (cur + 1) + ' de ' + total;
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
      const label = fsEl() ? 'Salir de pantalla completa' : 'Pantalla completa';
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
      if (key === 'Inicio') { e.preventDefault(); show(0, -1, false); return; }
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
    const toTop = h('button', 'to-top', 'Volver arriba');
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
    $('#qotdCat').textContent = 'Tema: ' + q.cat;
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
      if (answered) fb.textContent = (answered.correct ? 'Correcto. ' : 'No del todo. ') + q.explain + ' Fuente: ' + q.src + '.';
    }
    paint();
  }

  /* My progress: badges, a summary, and backup, restore or erase of saved data. */
  const getStats = () => store.get('sdg4.stats', {}) || {};
  const chapterTotal = (cat) => QUIZ.filter((q) => q.cat === cat).length;
  const BADGES = [
    { name: 'Primer test', text: 'Termina un test.', earned: () => getStats().quizzes >= 1 },
    { name: 'Ronda perfecta', text: 'Acierta todas las preguntas en un solo test.', earned: () => getStats().perfect >= 1 },
    { name: 'En racha', text: 'Consigue una racha de cinco respuestas correctas.', earned: () => getStats().bestStreak >= 5 },
    { name: 'Contra el reloj', text: 'Consigue puntos en el modo Desafío.', earned: () => typeof (store.get('sdg4.quiz.bests', {}) || {}).challenge === 'number' },
    {
      name: 'Campeón de capítulo', text: 'Acierta todas las preguntas en cada capítulo.',
      earned: () => {
        const bests = store.get('sdg4.quiz.bests', {}) || {};
        return CHAPTER_ORDER.every((cat) => bests['chapter:' + cat] === chapterTotal(cat));
      }
    },
    { name: 'Completador de tarjetas', text: 'Da la vuelta a las 52 tarjetas.', earned: () => fcSeen().length >= QUIZ.length },
    { name: 'Lector de metas', text: 'Abre las diez metas.', earned: () => (store.get('sdg4.seen.targets', []) || []).length >= TARGETS.length },
    { name: 'Tomador de notas', text: 'Escribe notas en tres metas.', earned: () => Object.keys(store.get('sdg4.notes', {}) || {}).length >= 3 },
    { name: 'Pregunta del día', text: 'Responde la pregunta del día.', earned: () => !!store.get('sdg4.qotd', null) },
    { name: 'Hora de concentración', text: 'Estudia durante 60 minutos con el temporizador.', earned: () => getStats().focusMinutes >= 60 },
    { name: 'Hazlo tuyo', text: 'Crea tu propio compromiso en la página Actúa.', earned: () => { const p = store.get('sdg4.pledge', null); return !!(p && p.made); } },
    { name: 'Habla', text: 'Guarda una puntuación en la clasificación.', earned: () => readBoard().length > 0 }
  ];

  function renderProgress() {
    const stats = getStats();
    const summary = [
      [stats.quizzes || 0, 'tests terminados'],
      [stats.perfect || 0, 'rondas perfectas'],
      [stats.focusMinutes || 0, 'minutos de concentración'],
      [fcSeen().length + ' de ' + QUIZ.length, 'tarjetas vistas'],
      [(store.get('sdg4.seen.targets', []) || []).length + ' de ' + TARGETS.length, 'metas leídas'],
      [Object.keys(store.get('sdg4.notes', {}) || {}).length, 'metas con notas']
    ];
    const sum = $('#progSummary');
    sum.textContent = '';
    summary.forEach(([num, label]) => {
      const d = h('div', 'prog-stat');
      d.append(h('b', null, String(num)), h('span', null, label));
      sum.appendChild(d);
    });
    const earned = BADGES.filter((b) => b.earned()).length;
    $('#badgeCount').textContent = earned + ' de ' + BADGES.length + ' insignias obtenidas';
    const grid = $('#badgeGrid');
    grid.textContent = '';
    BADGES.forEach((b) => {
      const got = b.earned();
      const card = h('div', 'badge' + (got ? ' is-earned' : ''));
      card.append(h('span', 'badge-state', got ? 'Obtenida' : 'Todavía no'), h('p', 'badge-name', b.name), h('p', 'badge-text', b.text));
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
    setDataMsg('Tus datos se guardaron en un archivo llamado sdg4-progress.json.');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      const data = parsed && parsed.app === 'sdg4-website' && parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
      if (!data) {
        setDataMsg('Ese archivo no es un archivo de progreso del ODS 4.');
        return;
      }
      const keys = Object.keys(data).filter((k) => k.indexOf(DATA_PREFIX) === 0);
      keys.forEach((k) => store.set(k, data[k]));
      renderProgress();
      setDataMsg('Importados ' + keys.length + ' elementos guardados. Las demás páginas los mostrarán cuando los abras.');
    };
    reader.readAsText(file);
  }

  let eraseTimer = 0;
  function eraseData() {
    const btn = $('#dataReset');
    if (!eraseTimer) {
      btn.textContent = 'Vuelve a pulsar para borrarlo todo';
      btn.classList.add('is-armed');
      eraseTimer = setTimeout(() => {
        eraseTimer = 0;
        btn.textContent = 'Borrar mis datos de este dispositivo';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(eraseTimer);
    eraseTimer = 0;
    savedKeys().forEach((k) => {
      try { window.localStorage.removeItem(k); } catch (e) { /* storage unavailable */ }
    });
    btn.textContent = 'Borrar mis datos de este dispositivo';
    btn.classList.remove('is-armed');
    renderProgress();
    setDataMsg('Se han borrado todos los datos guardados en este dispositivo.');
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
        $('#certNote').textContent = fill('Consigue al menos {0} insignias para desbloquear tu certificado. Hasta ahora tienes {1}.', CERT_MIN_BADGES, earned);
        return;
      }
      if (!name) {
        $('#certNote').textContent = 'Escribe primero tu nombre.';
        return;
      }
      store.set('sdg4.quiz.name', name);
      const quizzes = getStats().quizzes || 0;
      $('#certNote').textContent = '';
      $('#certOut').textContent = name;
      $('#certBody').textContent = fill('ha aprendido sobre el Objetivo de Desarrollo Sostenible 4 de la ONU, Educación de Calidad, y ha conseguido {0} de {1} insignias tras {2} tests.', earned, BADGES.length, quizzes);
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
    { title: 'Los datos', href: 'facts.html', text: 'Gráficos sobre quién está fuera de la escuela, quién termina, quién aprende y quién se queda atrás' },
    { title: 'Las 10 metas', href: 'targets.html', text: 'Cada compromiso del ODS 4 con palabras sencillas y las cifras más recientes' },
    { title: 'Explorar', href: 'explore.html', text: 'Sigue a 100 niños en la escuela, viaja de 1948 a 2030, la máquina de datos' },
    { title: 'Soluciones', href: 'solutions.html', text: 'Lo que ha funcionado, desde los comedores escolares hasta las transferencias de efectivo' },
    { title: 'Actúa', href: 'action.html', text: 'Elige acciones y crea tu propio compromiso' },
    { title: 'Quiz', href: 'quiz.html', text: 'El test, los capítulos, las tarjetas y la clasificación' },
    { title: 'Temporizador', href: 'timer.html', text: 'Estudia en bloques de concentración con pausas cortas' },
    { title: 'Acerca de', href: 'about.html', text: 'Acerca de este proyecto escolar, el glosario y todas las fuentes' },
    { title: 'Diapositivas para clase', href: 'slides.html', text: 'Diapositivas a pantalla completa con las cifras clave' },
    { title: 'Mi progreso', href: 'progress.html', text: 'Insignias, un resumen y exportar, importar o borrar tus datos guardados' },
    { title: 'Obtén la aplicación', href: 'download.html', text: 'Descarga para Windows, Mac y Android, o añade el sitio a tu pantalla de inicio' }
  ];
  let searchIndex = null;

  function buildSearchIndex() {
    const items = SEARCH_PAGES.map((p) => ({ kind: 'Página', title: p.title, text: p.text, href: p.href }));
    TARGETS.forEach((t) => items.push({ kind: 'Meta ' + t.code, title: t.title, text: t.plain + ' ' + t.action, href: 'targets.html' }));
    FACTS.forEach((f) => items.push({ kind: 'Dato', title: f.num, text: f.text, href: 'facts.html' }));
    QUIZ.forEach((q) => items.push({ kind: 'Pregunta del test', title: q.q, text: q.explain, href: 'quiz.html' }));
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
