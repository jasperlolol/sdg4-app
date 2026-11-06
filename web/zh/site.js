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
    1: '联合国《2026年可持续发展目标报告》',
    2: '联合国教科文组织《2026年全球教育监测报告》',
    3: '联合国教科文组织《2026年全球教育监测报告》第7章',
    4: '联合国教科文组织《2024年全球教师报告》',
    5: '联合国教科文组织，2026年国际扫盲日',
    6: '联合国教科文组织融资估算，2023年和2026年',
    7: '联合国教科文组织《2026年全球教育监测性别报告》',
    8: '联合国2030议程，A/RES/70/1'
  };

  // One red hue, three lightness steps: education levels are an ordered sequence.
  const LEVELS = [
    { key: 'primary', name: '小学', color: 'var(--chart-1)' },
    { key: 'lower', name: '初中', color: 'var(--chart-2)' },
    { key: 'upper', name: '高中', color: 'var(--chart-3)' }
  ];

  // Completion rate worldwide (%). 2000: UNESCO GEM Report 2026. 2015 and 2024: UN SDG Report 2026.
  const TREND = [
    { year: 2000, primary: 77, lower: 60, upper: 37 },
    { year: 2015, primary: 85, lower: 75, upper: 53 },
    { year: 2024, primary: 88, lower: 78, upper: 61 }
  ];

  // Completion rate by region, 2024 (%): UN SDG Report 2026. Low-income countries: GEM Report 2026, ch. 7.
  const REGIONS = [
    { name: '全球', primary: 88, lower: 78, upper: 61, world: true },
    { name: '欧洲和北美洲', primary: 100, lower: 98, upper: 89 },
    { name: '东亚和东南亚', primary: 98, lower: 91, upper: 79 },
    { name: '拉丁美洲和加勒比', primary: 94, lower: 84, upper: 65 },
    { name: '北非和西亚', primary: 90, lower: 69, upper: 61 },
    { name: '中亚和南亚', primary: 89, lower: 83, upper: 59 },
    { name: '撒哈拉以南非洲', primary: 68, lower: 47, upper: 28 },
    { name: '大洋洲*', label: '大洋洲（不含澳大利亚和新西兰）', primary: 70, lower: 43, upper: 18 },
    { name: '低收入国家', primary: 60, lower: 37, upper: 20, income: true }
  ];
  const placeLabel = (r) => r.label || r.name;

  // Out of school by age group, 2024, millions: GEM Report 2026, ch. 7.
  const OOS = [
    { value: 79, name: '小学学龄', color: 'var(--chart-1)' },
    { value: 64, name: '初中学龄', color: 'var(--chart-2)' },
    { value: 130, name: '高中学龄', color: 'var(--chart-3)' }
  ];

  // Completion of the poorest 20% for every 100 of the richest 20% (parity index x 100): UN SDG Report 2026.
  const PARITY = [
    { name: '小学', value: 91 },
    { name: '初中', value: 68 },
    { name: '高中', value: 34 }
  ];

  const TARGETS = [
    {
      code: '4.1', kind: 'outcome', short: '人人享有小学和中学教育',
      title: '为每个孩子提供免费、优质的小学和中学教育',
      official: '到2030年，确保所有男童和女童都完成免费、公平和优质的中小学教育，并取得相关且有效的学习成果',
      plain: '每个孩子都应能免费完成小学和中学教育，并在过程中真正学到知识。坐在教室里只是一半，真正重要的是阅读和数学能力。',
      measured: '指标4.1.1跟踪低年级、小学结束和初中结束时达到阅读和数学最低水平的儿童人数。指标4.1.2跟踪完成率。',
      stats: [
        { value: '61%', text: '的青少年完成高中教育（2024年），高于2015年的53%。', src: 1 },
        { value: '58%', text: '的学生在小学结束时达到最低阅读水平（根据最新全球估计，2019年）。', src: 3 }
      ],
      action: '每周与一名低年级学生开展一次阅读或数学互助活动，或成立同伴辅导社。'
    },
    {
      code: '4.2', kind: 'outcome', short: '幼儿和学前教育',
      title: '小学前的良好起步',
      official: '到2030年，确保所有男童和女童都能获得优质的幼儿发展、照护和学前教育，为接受小学教育做好准备',
      plain: '小学前的几年决定了孩子一生的学习方式。该目标关注照护、游戏以及学前班，帮助每个孩子为上学做好准备。',
      measured: '指标4.2.1跟踪24至59个月大的儿童是否发展正常。指标4.2.2跟踪小学前一年有组织学习的参与情况。',
      stats: [
        { value: '75%', text: '的儿童在小学前一年参加有组织的学习，这一比例自2015年以来几乎没有变化。', src: 3 },
        { value: '60%', text: '实际接受过至少一年学前教育（已计入提前入读小学的儿童）。', src: 3 }
      ],
      action: '在当地的幼儿学习中心做志愿者，与小朋友一起阅读；或收集绘本进行捐赠。'
    },
    {
      code: '4.3', kind: 'outcome', short: '技术、职业和大学教育',
      title: '人人负担得起的培训和大学教育',
      official: '到2030年，确保所有男女平等获得负担得起的优质技术、职业和高等教育，包括大学教育',
      plain: '完成学业后，无论想成为护士、电工还是工程师，每个人都应能负担得起良好的培训或大学教育。',
      measured: '指标4.3.1跟踪过去12个月内参加正规或非正规教育与培训的青年和成年人数。',
      stats: [
        { value: '44%', text: '2024年全球高等教育入学率：低收入国家低于15%，高收入国家超过80%。', src: 3 },
        { value: '三分之一', text: '个国家的公立大学不收取学费。', src: 2 }
      ],
      action: '尽早了解职业和大学的发展路径，并与同学分享奖学金和课程信息。'
    },
    {
      code: '4.4', kind: 'outcome', short: '工作与生活技能',
      title: '体面工作所需技能',
      official: '到2030年，大幅增加具备相关技能（包括技术和职业技能）的青年和成年人数，以促进就业、体面工作和创业',
      plain: '教育应当为真实的工作做好准备：数字技能、技术知识，以及创业的信心。',
      measured: '指标4.4.1跟踪具备信息和通信技术（ICT）技能的青年和成年人数，技能范围从复制文件到编写计算机程序。',
      stats: [
        { value: '33%', text: '报告数据的中位数国家中，成年人能够制作电子演示文稿的比例（2022至2024年）。', src: 3 },
        { value: '6%', text: '具备编程技能。报告此类数据的国家大多为中高收入或高收入国家。', src: 3 }
      ],
      action: '本学期选择一项实用技能，例如编程、预算管理或公开演讲，并教给别人。'
    },
    {
      code: '4.5', kind: 'outcome', short: '人人平等获得教育机会',
      title: '教育不让任何人掉队',
      official: '到2030年，消除教育中的性别差距，确保弱势群体（包括残疾人、土著人民和处境不利的儿童）平等获得各级教育和职业培训',
      plain: '不应有任何孩子因性别、残疾、居住地或家庭经济状况而失去受教育的机会。',
      measured: '指标4.5.1使用均等指数比较各组群体（例如女生与男生、农村与城市、最贫困与最富裕人群），覆盖SDG 4的其他指标。',
      stats: [
        { value: '34', text: '最贫困青少年完成高中教育的人数，与最富裕青少年每100人相比。', src: 1 },
        { value: '接近六分之五', text: '个国家尚未实现高中完成率的性别平等。', src: 1 }
      ],
      action: '让你的班级更加包容：邀请新同学加入你的小组，并争取大家都能使用的学习资料。'
    },
    {
      code: '4.6', kind: 'outcome', short: '识字与算术',
      title: '人人都能读写算',
      official: '到2030年，确保所有青年和相当比例的成年男女都掌握识字和算术能力',
      plain: '每位青年和尽可能多的成年人都应能在日常生活中自信地读、写和运用数字。',
      measured: '指标4.6.1跟踪某一年龄组中达到固定功能性读写和算术水平的人口比例。',
      stats: [
        { value: '739M', text: '名青年和成年人在2024年缺乏基本读写能力，其中约三分之二为女性。', src: 5 },
        { value: '93%', text: '的全球青年能够读写，高于2000年的87%。', src: 3 }
      ],
      action: '在学校组织图书交换，或帮助家人练习阅读或日常数学。'
    },
    {
      code: '4.7', kind: 'outcome', short: '可持续性、和平与全球公民意识',
      title: '学习建设更公平、更绿色的世界',
      official: '到2030年，确保所有学习者掌握促进可持续发展所需的知识和技能，包括通过可持续发展教育和可持续生活方式、人权、性别平等、弘扬和平与非暴力文化、全球公民意识，以及欣赏文化多样性和文化对可持续发展的贡献等途径获得这些知识和技能',
      plain: '学校应帮助我们理解气候变化、人权、性别平等和其他文化，并赋予我们行动的能力。',
      measured: '指标4.7.1跟踪全球公民意识和可持续发展在教育政策、课程、教师培训和学生评估中的融入程度。自2025年起，该指标还直接审查课程中关于环境、气候变化和生物多样性的内容。',
      stats: [
        { value: '50/110', text: '个被研究国家的六年级科学和社会科学课程大纲未提及气候变化（2024年）。', src: 3 },
        { value: '78/110', text: '其三年级课程大纲中未提及此内容。', src: 3 }
      ],
      action: '创办或加入环保或全球议题社团，并将气候话题融入班级项目。'
    },
    {
      code: '4.a', kind: 'means', short: '安全、包容的学校',
      title: '安全且向所有人开放的学校',
      official: '建设和改善对儿童、残疾人和性别问题敏感的教育设施，为所有人提供安全、无暴力、包容和有效的学习环境',
      plain: '学校需要基本条件，例如电力、清洁用水、厕所、无障碍坡道和网络，并且必须杜绝暴力和欺凌。',
      measured: '指标4.a.1跟踪具备基本服务的学校比例：电力、用于教学的互联网和计算机、适合残疾学生的设施、饮用水、男女分开的厕所以及洗手设施。',
      stats: [
        { value: '超过五分之一', text: '的全球小学缺乏电力、安全饮用水或基本卫生设施。', src: 1 },
        { value: '466M', text: '名儿童在2024年获得学校供餐，比2020年增加20%。', src: 3 }
      ],
      action: '勇于反映破损或不安全的设施，并支持遭受欺凌的同学。'
    },
    {
      code: '4.b', kind: 'means', short: '发展中国家的奖学金',
      title: '为发展中国家学生提供更多奖学金',
      official: '到2020年，大幅增加全球面向发展中国家（尤其是最不发达国家、小岛屿发展中国家和非洲国家）的奖学金数量，用于支持学生在发达国家和其他发展中国家接受高等教育，包括职业培训、信息通信技术、技术、工程和科学类专业',
      plain: '各国承诺增加奖学金，使最贫困国家的学生能够上大学，尤其是科学和技术专业。这是SDG 4中唯一一个截止期限为2020年的具体目标。',
      measured: '指标4.b.1跟踪用于奖学金的官方发展援助（援助）金额。',
      stats: [
        { value: '$1.7B', text: '的援助用于教育领域的奖学金（2024年），此前2023年资金已有所恢复，如今再次下降。', src: 3 },
        { value: '2.8%', text: '的全球大学生在2023年曾在其他国家学习。', src: 3 }
      ],
      action: '收集你发现的奖学金机会，并张贴在班级公告栏上分享。'
    },
    {
      code: '4.c', kind: 'means', short: '合格教师',
      title: '拥有足够多训练有素的教师',
      official: '到2030年，大幅增加合格教师的供给，包括通过国际合作为发展中国家（尤其是最不发达国家和小岛屿发展中国家）开展教师培训',
      plain: '没有教师就没有教育。世界需要数百万名经过培训、获得支持并得到公平报酬的教师，尤其是在最贫困的国家。',
      measured: '指标4.c.1跟踪具备本国规定最低资格的教师比例。',
      stats: [
        { value: '44M', text: '名教师需要在2030年前增加，以实现普及中小学教育，其中1500万在撒哈拉以南非洲。', src: 4 },
        { value: '五分之一', text: '全球教师未达到本国最低资格标准（2024年）。', src: 1 }
      ],
      action: '本周向一位老师表示感谢，并想想未来是否可以把教书作为自己的职业。'
    }
  ];

  const QUIZ = [
    // The goal
    { cat: '目标', q: '可持续发展目标（包括SDG 4）计划在哪一年实现？', options: ['2025', '2030', '2040', '2050'], answer: 1, explain: '所有联合国会员国于2015年通过了《2030年议程》，为世界实现这17项目标设定了2030年的期限。', src: '联合国2030议程（2015年）' },
    { cat: '目标', q: '可持续发展目标共有多少项？', options: ['6', '8', '12', '17'], answer: 3, explain: '共17项目标，教育是第4项。此前的千年发展目标共有8项。', src: '联合国2030议程（2015年）' },
    { cat: '目标', q: 'SDG 4 有多少项具体目标？', options: ['10', '12', '15', '17'], answer: 0, explain: '十项：七项成果目标（4.1至4.7）和三项实施手段（4.a、4.b和4.c）。', src: '联合国2030议程（2015年）' },
    { cat: '目标', mix: true, q: '补全该目标：“确保包容和公平的优质教育，并促进……全民终身学习机会。”', options: ['免费大学名额', '终身学习机会', '数字设备', '学校供餐'], answer: 1, explain: '完整目标为：确保包容和公平的优质教育，并促进全民终身学习机会。', src: '联合国2030议程（2015年）' },
    { cat: '目标', q: '哪项具体目标涉及幼儿发展和学前教育？', options: ['目标4.1', '具体目标4.2', '具体目标4.5', '具体目标4.c'], answer: 1, explain: '具体目标4.2旨在让每个孩子获得优质的幼儿照护和学前教育，为进入小学做好准备。', src: '联合国2030议程（2015年）' },
    { cat: '目标', q: '哪项SDG 4具体目标的截止期限是2020年，而非2030年？', options: ['4.1，免费的小学和中学教育', '4.6，识字与算术', '4.b，奖学金', '4.c，合格教师'], answer: 2, explain: '具体目标4.b旨在到2020年扩大发展中国家学生的奖学金。', src: '联合国2030议程（2015年）' },
    { cat: '目标', mix: true, q: '具体目标4.c涉及……', options: ['人人免费上大学', '更多合格教师', '学校供餐', '每间教室都有网络'], answer: 1, explain: '具体目标4.c旨在大幅增加合格教师的供给，包括通过在发展中国家开展教师培训。', src: '联合国2030议程（2015年）' },
    { cat: '目标', q: '哪项具体目标涵盖可持续发展、人权、和平与全球公民意识的学习？', options: ['目标4.1', '具体目标4.3', '具体目标4.5', '目标4.7'], answer: 3, explain: '具体目标4.7涉及促进可持续发展、人权、性别平等、和平与全球公民意识所需的知识和技能。', src: '联合国2030议程（2015年）' },
    // Access
    { cat: '入学机会', q: '2024年全球约有多少儿童和青少年失学？', options: ['7300万', '1.23亿', '1.73亿', '2.73亿'], answer: 3, explain: '2.73亿，即六分之一，且人数已连续七年上升。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '入学机会', q: '哪个年龄段失学的青少年最多？', options: ['小学学龄', '初中学龄', '高中学龄', '三者大致相当'], answer: 2, explain: '在2.73亿人中，有1.3亿为高中学龄，而小学学龄为7900万，初中学龄为6400万。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '入学机会', q: '到2024年，失学儿童人数已连续上升了多少年？', options: ['2', '4', '7', '12'], answer: 2, explain: '连续七年，原因包括人口增长、危机以及预算缩减。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '入学机会', q: '在低收入国家，大约有多大比例的学龄儿童和青少年失学？', options: ['3%', '16%', '36%', '66%'], answer: 2, explain: '约36%，而高收入国家为3%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '入学机会', mix: true, q: '哪两个地区合计占全球失学儿童和青少年的四分之三？', options: ['欧洲和拉丁美洲', '撒哈拉以南非洲和中亚及南亚', '东亚和大洋洲', '北美洲和西亚'], answer: 1, explain: '撒哈拉以南非洲和中亚及南亚合计占全球总数的四分之三。', src: '联合国《2026年可持续发展目标报告》' },
    { cat: '入学机会', q: '2024年全球有多少学生在校就读？', options: ['5亿', '8亿', '11亿', '14亿'], answer: 3, explain: '14亿，其中小学和中学比2000年多出3.27亿人。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    // Completion
    { cat: '完成率', q: '在撒哈拉以南非洲，有多大比例的青少年完成高中教育？', options: ['28%', '48%', '61%', '78%'], answer: 0, explain: '2024年，撒哈拉以南非洲28%的青少年完成了高中教育，而全球平均为61%。', src: '联合国《2026年可持续发展目标报告》' },
    { cat: '完成率', q: '2024年全球有多少比例的青少年完成了高中教育？', options: ['37%', '61%', '78%', '88%'], answer: 1, explain: '61%，高于2015年的53%和2000年的37%。初中为78%，小学为88%。', src: '联合国《2026年可持续发展目标报告》；联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '完成率', q: '按当前速度，全球大约在哪一年有95%的青少年能完成高中教育？', options: ['2030', '2050', '2075', '2105'], answer: 3, explain: '联合国教科文组织估计，按照自2000年以来每年约一个百分点的当前进展速度，要到2105年才能实现。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '完成率', mix: true, q: '哪个地区的高中完成率最高？', options: ['欧洲和北美洲', '东亚和东南亚', '拉丁美洲和加勒比', '撒哈拉以南非洲'], answer: 0, explain: '欧洲和北美洲，2024年为89%。东亚和东南亚紧随其后，为79%。', src: '联合国《2026年可持续发展目标报告》' },
    // Learning
    { cat: '学习成效', q: '根据最新全球估计（2019年），有多大比例的学生在小学结束时达到最低阅读水平？', options: ['58%', '68%', '78%', '88%'], answer: 0, explain: '阅读为58%，数学为44%。该估计数据自疫情以来未再更新。', src: '联合国《2026年可持续发展目标报告》' },
    { cat: '学习成效', mix: true, q: '在57个多为中等和高收入的国家中，2012至2022年间阅读技能发生了什么变化？', options: ['大幅提高', '基本保持不变', '下降了，达到最低水平的学生比例从59%降至47%', '翻了一番'], answer: 2, explain: '阅读从59%降至47%，数学从41%降至36%，因此学习危机并非仅由疫情造成。', src: '联合国《2026年可持续发展目标报告》' },
    { cat: '学习成效', q: '2024年全球有多大比例的青少年能够读写？', options: ['63%', '73%', '83%', '93%'], answer: 3, explain: '93%，高于2000年的87%。尽管如此，低收入国家约四分之一的青少年仍不能读写。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    // Teachers
    { cat: '教师', q: '到2030年，世界需要增加多少名教师才能实现普及中小学教育？', options: ['2400万', '4400万', '6400万', '8400万'], answer: 1, explain: '4400万。其中三分之一，即1500万，需要在撒哈拉以南非洲增加。', src: '联合国教科文组织《全球教师报告》（2024年）' },
    { cat: '教师', q: '全球大约有多少教师未达到本国的最低资格标准？', options: ['五十分之一', '二十分之一', '五分之一', '二分之一'], answer: 2, explain: '约五分之一，即20%的教师（2024年）。具体目标4.c旨在到2030年改变这一状况。', src: '联合国《2026年可持续发展目标报告》' },
    { cat: '教师', mix: true, q: '哪个地区到2030年需要增加的教师最多？', options: ['欧洲', '撒哈拉以南非洲', '北美洲', '大洋洲'], answer: 1, explain: '撒哈拉以南非洲需要1500万名教师，占全球所需增加教师总数的三分之一。', src: '联合国教科文组织《全球教师报告》（2024年）' },
    { cat: '教师', q: '有多大比例的低收入国家要求小学教师具备学士学位？', options: ['11%', '41%', '71%', '91%'], answer: 0, explain: '仅11%，而高收入国家为79%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    // Equity
    { cat: '公平性', q: '在缺乏基本读写能力的7.39亿青年和成年人中，大约有多大比例为女性？', options: ['约三分之一', '约三分之二', '约四分之三', '几乎全部'], answer: 1, explain: '约三分之二为女性，这也是识字与性别平等密切相关的原因。', src: '联合国教科文组织，2026年国际扫盲日' },
    { cat: '公平性', q: '全球范围内，最贫困青少年中每100名最富裕青少年对应有多少人完成高中教育？', options: ['14', '34', '64', '94'], answer: 1, explain: '仅34人。小学阶段为91人，因此随着年龄增长，差距会扩大。', src: '联合国《2026年可持续发展目标报告》' },
    { cat: '公平性', q: '2000至2025年间，18岁前结婚的女孩比例从25%降至……', options: ['8%', '12%', '15%', '18%'], answer: 3, explain: '2025年为18%。早婚和早孕仍是女孩辍学的主要原因。', src: '联合国教科文组织《2026年全球教育监测性别报告》' },
    { cat: '公平性', q: '在撒哈拉以南非洲，怀孕或为人母的女孩中有多大比例重返学校？', options: ['低于5%', '约25%', '约50%', '超过75%'], answer: 0, explain: '回归学校的不到5%，尽管现在越来越多的国家保护她们继续学习的权利。', src: '联合国教科文组织《2026年全球教育监测性别报告》' },
    // Money and schools
    { cat: '资金与学校', q: '低收入和中低收入国家每年的教育资金缺口有多大？', options: ['97亿美元', '970亿美元', '9700亿美元', '9.7万亿美元'], answer: 1, explain: '每年约970亿美元，其中700亿美元在撒哈拉以南非洲。', src: '联合国教科文组织（2023年，2026年再次确认）' },
    { cat: '资金与学校', q: '有多少个国家的偿债支出多于教育支出？', options: ['13', '53', '113', '193'], answer: 2, explain: '113个国家，人口共61亿。', src: '联合国教科文组织，2026年7月' },
    { cat: '资金与学校', q: '2024年，教育获得了发展援助的7.5%，这是其占比在……以来的最低水平。', options: ['2年', '5年', '10年', '二十年'], answer: 3, explain: '二十年。2023至2024年间，教育援助下降了8%，基础教育援助下降了16%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '资金与学校', q: '2024年有多少儿童获得学校供餐？', options: ['4600万', '1.66亿', '4.66亿', '14亿'], answer: 2, explain: '4.66亿，比2020年增加20%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '资金与学校', q: '全球大约有多少所小学缺乏电力、安全饮用水或卫生设施等基本服务？', options: ['不到二十分之一', '约十分之一', '超过五分之一', '约二分之一'], answer: 2, explain: '超过五分之一。在最不发达国家，超过一半的学校没有电力。', src: '联合国《2026年可持续发展目标报告》' },
    // Skills
    { cat: '技能', q: '在报告数据的中位数国家中，有多大比例的成年人能够编写计算机程序？', options: ['6%', '26%', '46%', '66%'], answer: 0, explain: '仅6%。约三分之一的人能制作电子演示文稿，而报告此类数据的国家大多为中高收入或高收入国家。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '技能', q: '在被研究的110个国家中，有多少个国家的六年级科学和社会科学课程大纲中缺少气候变化内容？', options: ['50', '70', '90', '105'], answer: 0, explain: '110个国家中有50个。三年级课程中缺少此内容的有78个国家。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { cat: '技能', q: '高等教育包括大学教育。2024年全球高等教育入学率是多少？', options: ['14%', '24%', '34%', '44%'], answer: 3, explain: '44%，从低收入国家的不到15%到高收入国家的超过80%不等。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    // History
    { cat: '历史', mix: true, q: '哪份1948年通过的文件宣布“人人有受教育的权利”？', options: ['《世界人权宣言》', '《巴黎协定》', '《日内瓦公约》', '《奥林匹克宪章》'], answer: 0, explain: '《世界人权宣言》第26条规定，人人有受教育的权利，初等教育应当免费并且是义务教育。', src: '联合国大会（1948年）' },
    { cat: '历史', mix: true, q: '1990年世界全民教育会议在哪里举行？', options: ['泰国朱提恩', '塞内加尔达喀尔', '韩国仁川', '美国纽约'], answer: 0, explain: '在泰国朱提恩，各国在此设定了普及初等教育的目标。', src: 'UNESCO' },
    { cat: '历史', q: '哪项千年发展目标旨在到2015年让每个孩子都完成小学教育？', options: ['千年发展目标1', '千年发展目标2', '千年发展目标4', '千年发展目标8'], answer: 1, explain: '千年发展目标2旨在2015年前普及小学教育。SDG 4则将目标提高到2030年前普及中学教育。', src: '联合国千年发展目标（2000年）' },
    // Early years
    { cat: '幼儿早期', q: '大脑在人生的哪个阶段发育最快？', options: ['出生后的最初几年', '青春期', '成年早期', '老年'], answer: 0, explain: '大脑在生命最初几年生长最快，并形成基本的神经连接，所以早期的照护和学习非常重要。', src: '哈佛大学发展儿童中心' },
    { cat: '幼儿早期', q: '什么是学前教育？', options: ['在小学一年级之前为幼儿提供的学习', '大学预科课程', '成人夜校', '中学教师培训'], answer: 0, explain: '学前教育是儿童在上小学之前接受的有组织的学习，例如幼儿园或学前班。', src: '联合国2030议程（2015年）' },
    { cat: '幼儿早期', q: '为什么目标4.2要求提供学前教育？', options: ['让儿童为小学学习做好准备', '让儿童可以跳过小学', '让家长可以全职工作', '让学校可以更早放学'], answer: 0, explain: '目标4.2指出，儿童应为进入小学做好准备，因此早期学习能帮助他们日后取得成功。', src: '联合国2030议程（2015年）' },
    { cat: '幼儿早期', q: '目标4.2涵盖哪种照护？', options: ['幼儿发展与照护', '老年人照护', '医疗保险', '住房'], answer: 0, explain: '目标4.2涵盖幼儿发展与照护以及学前教育，因此学习从生命早期的照护开始。', src: '联合国2030议程（2015年）' },
    // Literacy
    { cat: '识字能力', q: '哪个目标涵盖读写和算术能力？', options: ['目标4.1', '目标4.6', '目标4.7', '目标4.b'], answer: 1, explain: '目标4.6旨在确保到2030年，所有青年和相当比例的成年男女都具备读写和算术能力。', src: '联合国2030议程（2015年）' },
    { cat: '识字能力', q: '国际扫盲日是哪一天？', options: ['3月8日', '2月21日', '9月8日', '10月5日'], answer: 2, explain: '联合国教科文组织每年9月8日庆祝国际扫盲日，以强调读写能力对个人和社会的重要性。', src: '联合国教科文组织，2026年国际扫盲日' },
    { cat: '识字能力', q: '算术能力是什么意思？', options: ['流利阅读', '在日常生活中运用数字和基础数学', '写作文章', '说第二语言'], answer: 1, explain: '算术能力是指在日常生活中运用数字和基础数学的能力，正如读写能力是指阅读和书写的能力。', src: '联合国2030议程（2015年）' },
    { cat: '识字能力', q: '目标4.6涵盖哪些人？', options: ['只有儿童', '只有教师', '所有青年，以及相当比例的成年男女', '只有城市居民'], answer: 2, explain: '目标4.6涵盖青年和成年男女，而不仅限于儿童。因此读写能力成为终身目标。', src: '联合国2030议程（2015年）' },
    // Inclusion
    { cat: '包容', q: '哪项条约规定了残疾人接受全纳教育的权利？', options: ['《巴黎协定》', '《残疾人权利公约》', '《京都议定书》', '《日内瓦公约》'], answer: 1, explain: '《残疾人权利公约》（2006年）第24条规定了各级全纳教育的权利。', src: '联合国《残疾人权利公约》（2006年），第24条' },
    { cat: '包容', q: '2月21日的国际母语日是什么？', options: ['停止教授英语的日子', '促进语言多样性和母语教育的日子', '学校考试假期', '考核教师的日子'], answer: 1, explain: '联合国教科文组织设立国际母语日，以促进语言多样性，并推动以人们在家中使用的语言进行教育。', src: '联合国教科文组织，国际母语日' },
    { cat: '包容', q: '为什么用儿童在家不说的语言学习可能成为障碍？', options: ['这会让许多儿童的早期学习更加困难', '这会让学校费用更低', '这会不再需要教师', '对学习没有影响'], answer: 0, explain: '儿童最好先用他们能理解的语言学习。母语教育能为阅读和之后的学习打下更扎实的基础。', src: '联合国教科文组织，国际母语日' },
    { cat: '包容', q: '在SDG 4中，“包容性”教育是什么意思？', options: ['只面向富裕家庭的教育', '惠及所有人的教育，包括残疾人和被边缘化的群体', '只面向成年人的教育', '只有在线学习'], answer: 1, explain: 'SDG 4要求提供包容性教育：惠及所有人的教育，包括残疾人、女童和被边缘化的群体。', src: '联合国2030议程（2015年）' }
  ];

  const MILESTONES = [
    { year: '1948', short: '受教育权', title: '教育成为一项人权', text: '《世界人权宣言》规定人人有受教育的权利，初等教育应当免费并且是义务教育（第26条）。', src: '联合国大会，1948年' },
    { year: '1989', short: '儿童权利', title: '对每个孩子许下的承诺', text: '《儿童权利公约》要求各国使小学教育对所有人成为义务且免费。它是历史上批准国最多的人权条约。', src: '联合国《儿童权利公约》，1989年' },
    { year: '1990', short: '全民教育', title: '全民教育', text: '在泰国朱提恩举行的世界全民教育会议上，各国设定了普及初等教育的目标。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { year: '2000', short: '达喀尔与千年发展目标', title: '每个孩子都应完成小学教育', text: '在塞内加尔达喀尔世界教育论坛和千年发展目标中，世界都力争到2015年让每个孩子完成小学教育（千年发展目标2）。但未能实现。', src: '联合国教科文组织；联合国千年发展目标' },
    { year: '2015', short: 'SDG 4达成一致', title: 'SDG 4提高了标准', text: '5月，《仁川宣言》确立了“2030教育”的愿景。9月，联合国所有会员国通过了17项可持续发展目标，力求让每个年轻人都完成中学教育。', src: '联合国2030议程；联合国教科文组织' },
    { year: '2016', short: '倒计时开始', title: '倒计时开始', text: '可持续发展目标于2016年1月1日正式生效，开始了为期15年、直至2030年的倒计时。', src: '联合国' },
    { year: '2022', short: '教育峰会', title: '转变教育峰会', text: '联合国秘书长在纽约召集世界领导人，在新冠疫情打乱了全球大多数学生的学业之后，将教育重新置于全球议程的首位。', src: '联合国' },
    { year: '2026', short: '今天', now: true, title: '我们目前的位置', text: null, src: '联合国教科文组织《2026年全球教育监测报告》；联合国《2026年可持续发展目标报告》' },
    { year: '2030', short: '截止期限', title: '截止期限', text: 'SDG 4每项承诺的目标日期，从人人享有免费中小学教育到足够的合格教师。', src: '联合国2030议程' }
  ];

  const FACTS = [
    { num: '每2秒', text: '为了让世界在2030年前保持正轨，每两秒就需要有一名额外的儿童入学。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '每分钟25人', text: '自2000年以来，每分钟有超过25名额外儿童入学，小学和中学新增学生3.27亿人。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '从18%到84%', text: '埃塞俄比亚将小学入学率从1974年的18%提高到2024年的84%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '从7%到60%以上', text: '中国的大学及其他高等教育入学机会从1999年的7%扩大至2024年的60%以上。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '33个百分点', text: '1990至2024年间，尼泊尔消除了初中完成率上男女之间33个百分点的差距。', src: '联合国教科文组织《2026年全球教育监测性别报告》' },
    { num: '落后22，领先11', text: '在柬埔寨，小学完成率上女生从1981年落后男生22个百分点，变为2024年领先男生11个百分点。', src: '联合国教科文组织《2026年全球教育监测性别报告》' },
    { num: '多1年', text: '在柬埔寨，仅通电一项就与近一整年的额外受教育时间相关。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '半年', text: '研究表明，学校供餐项目每投入100美元，最多可增加半年的学习时间。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '可能性高出36%', text: '家庭获得与上学挂钩的现金转移支付的儿童，入学的可能性高出36%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '1年以上', text: '在14个非洲国家，让教育成为义务而不仅仅是免费，使受教育年限增加了一年多。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '从8%到26%', text: '设有12年义务教育的国家比例增加了两倍多，从8%升至26%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '4.66亿', text: '2024年有4.66亿名儿童获得学校供餐，比2020年增加20%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '113个国家', text: '113个国家（人口61亿）的偿债支出多于教育支出。', src: '联合国教科文组织，2026年7月' },
    { num: '22%', text: '在有数据的183个国家中，只有41个（22%）达到两项教育支出基准：至少占GDP的4%，且至少占公共支出的15%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '70/83', text: '在83个有数据的国家中，有70个国家超过一半的初中学生表示曾遭受欺凌。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '3909起袭击', text: '2024年，69个国家记录了3909起针对教育的袭击，是“全球保护教育免受袭击联盟”自2013年开始报告以来的最高数字。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '四分之一', text: '2024年，低收入国家约四分之一的青少年不会读写。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '从1.43亿降至8600万', text: '不会读写的青少年人数从2000年的1.43亿降至2024年的8600万。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '11% 对 79%', text: '只有11%的低收入国家要求小学教师具备学士学位，而高收入国家的这一比例为79%。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '低于5%', text: '撒哈拉以南非洲怀孕或为人母的女孩中，不到5%重返学校。', src: '联合国教科文组织《2026年全球教育监测性别报告》' },
    { num: '减半', text: '自2000年以来，科特迪瓦的儿童、青少年和青年失学率已减半。', src: '联合国教科文组织《2026年全球教育监测报告》' },
    { num: '240万', text: '阿富汗约240万名女孩被禁止进入中学。联合国教科文组织警告，到2030年，这一数字可能接近400万。', src: '联合国教科文组织，2026年8月' }
  ];

  const TIPS = [
    '把手机放到另一个房间。即使静音放在桌上，也会分散你的注意力。',
    '用自测代替反复阅读。合上书，把你记得的内容全部写下来。',
    '分散学习。在几天内进行的短时段学习，胜过考前一晚的突击。',
    '在按下开始之前，为本次学习写下一个清晰的目标。',
    '大声讲解出来。如果你能简单地讲明白，就说明你真正理解了。',
    '趁注意力集中时，先完成最难的任务。',
    '利用休息时间活动一下：站起来、伸伸懒腰、喝点水，并望向远方。',
    '将相关主题交错练习。在不同类型的题目之间切换，有助于你学会何时使用哪种方法。'
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
      v.append(sw, document.createTextNode(String(d.value)), h('small', null, '百万'));
      lab.append(v, h('span', 'sl-name', d.name));
      labels.appendChild(lab);

      const seg = h('div', 'stack-seg');
      seg.style.flex = d.value + ' 1 0';
      seg.style.background = d.color;
      seg.addEventListener('pointermove', (e) => tip.show('2024年失学人数', [{ color: d.color, value: d.value + ' 百万', label: d.name }], e.clientX, e.clientY));
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
    sv('text', { x: x(2015) + 8, y: y(5), class: 'annot-text' }, svg).textContent = '通过的SDG';

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
        d.year === 2015 ? '2015年，SDG通过之年' : String(d.year),
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
      row.setAttribute('aria-label', placeLabel(r) + '：小学 ' + r.primary + '%，初中 ' + r.lower + '%，高中 ' + r.upper + '%');
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

    buildTable($('#regionTable'), ['地区', '小学', '初中', '高中'],
      REGIONS.map((r) => [r.name, r.primary + '%', r.lower + '%', r.upper + '%']), '2024年各地区完成率');
  }

  function renderWaffle(host) {
    const v = Number(host.dataset.value);
    for (let i = 0; i < 100; i++) {
      const c = h('i');
      if (i < v) c.className = '开启';
      host.appendChild(c);
    }
  }

  function renderParity() {
    const host = $('#parityChart');
    PARITY.forEach((p) => {
      const row = h('div', 'parity-row');
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', p.name + ': ' + p.value + ' 名最贫困人群完成学业，对比最富有人群每100人');
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
    buildTable($('#parityTable'), ['学段', '最贫困者对比最富裕者每100人'], PARITY.map((p) => [p.name, String(p.value)]),
      '最贫困20%的完成率，对比最富裕20%每100人');
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
    { key: null, text: '儿童同时入学' },
    { key: 'primary', text: '完成小学' },
    { key: 'lower', text: '完成初中' },
    { key: 'upper', text: '完成高中' }
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
      parts.push(placeLabel(r) + ': ' + n + ' / 100 ' + st.text);
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
    $('#journeyPlay').textContent = finished ? '再次播放' : '开始求学之旅';
  }

  function playJourney() {
    stopJourney();
    setStage(0, true);
    Sound.play('start');
    $('#journeyPlay').textContent = '停止';
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
      const want = idx === 0 ? '撒哈拉以南非洲' : '欧洲和北美洲';
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
    const yearsWord = years === 1 ? ' 年' : ' 年';
    return fill('2.73亿儿童和青少年失学，这一数字已连续七年上升，教育援助也在减少。距离截止日期还有约{0}。', years + yearsWord);
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
      if (m.now) b.appendChild(h('span', 'tl-now', '你在这里'));
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
    right.append(h('h3', 'tl-card-title', m.title), h('p', 'tl-card-text', milestoneText(m)), h('p', 'tl-card-src', '来源：' + m.src));
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
    nav.append(mk('更早', -1), mk('之后', 1), h('span', 'tl-count', (tlIndex + 1) + ' / ' + MILESTONES.length));
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
    card.querySelector('.fc-src').textContent = '来源：' + f.src;
    $('#factCount').textContent = '事实 ' + (factPos + 1) + ' / ' + FACTS.length;
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
    [['outcome', '成果目标：世界应实现的目标'], ['means', '实施手段：如何实现']].forEach((g) => {
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
    $('#targetStatus').textContent = '正在显示目标 ' + t.code + ': ' + t.title;
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
    titles.append(h('p', 'td-kind', t.kind === 'outcome' ? '成果目标' : '实施手段'), h('h2', 'td-title', t.title));
    head.append(h('p', 'td-code', t.code), titles);

    const official = h('blockquote', 'td-official');
    official.append(h('p', null, '“' + t.official + '”'), h('footer', null, '联合国官方表述，目标 ' + t.code));

    const grid = h('div', 'td-grid');
    const plain = h('section');
    plain.append(h('h3', 'td-h', '简单来说'), h('p', 'td-p', t.plain));
    const measured = h('section');
    measured.append(h('h3', 'td-h', '衡量方式'), h('p', 'td-p', t.measured));
    grid.append(plain, measured);

    const stats = h('section', 'td-section');
    stats.appendChild(h('h3', 'td-h', '全球现状'));
    const statRow = h('div', 'td-stats');
    t.stats.forEach((s) => {
      const d = h('div');
      d.append(h('p', 'td-stat-num', s.value), h('p', 'td-stat-text', s.text), h('p', 'td-stat-src', '来源：' + SOURCE_NAMES[s.src]));
      statRow.appendChild(d);
    });
    stats.appendChild(statRow);

    const act = h('section', 'td-section');
    act.append(h('h3', 'td-h', '你能做什么'), h('p', 'td-p', t.action));

    const notes = h('section', 'td-section td-notes');
    const noteId = 'note-' + t.code.replace('.', '-');
    const noteLabel = h('label', 'td-h', '你对目标 ' + t.code);
    noteLabel.htmlFor = noteId;
    const area = h('textarea', 'td-note');
    area.id = noteId;
    area.rows = 4;
    area.maxLength = 1000;
    area.placeholder = '什么让你感到意外？你的学校或城镇能为此做些什么？';
    const savedNotes = store.get('sdg4.notes', {}) || {};
    area.value = typeof savedNotes[t.code] === 'string' ? savedNotes[t.code] : '';
    const noteStatus = h('p', 'td-note-status', area.value ? '已保存在本设备上。' : '只有你能看到这些笔记，它们仅保存在本设备上。');
    area.addEventListener('input', () => {
      const all = store.get('sdg4.notes', {}) || {};
      if (area.value.trim()) all[t.code] = area.value;
      else delete all[t.code];
      store.set('sdg4.notes', all);
      noteStatus.textContent = '已保存在本设备上。';
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
    nav.append(makeBtn('上一项目标', -1), h('span', 'td-count', (vis.indexOf(targetIndex) + 1) + ' / ' + vis.length), makeBtn('下一项目标', 1));

    body.append(head, official, grid, stats, act, notes, nav);
    host.appendChild(body);
  }

  /* ------------------------------------------------------------------ */
  /* Quiz                                                                */
  /* ------------------------------------------------------------------ */
  const MODES = {
    classic: { name: '经典', tag: '轻松', count: 10, timed: false, lifeline: false, desc: '10道随机题，无时间限制。慢慢作答，并阅读每条解析。' },
    challenge: { name: '挑战', tag: '与时间赛跑', count: 15, timed: true, seconds: 20, lifeline: true, desc: '15道题，每题20秒。快速作答和连对可获得额外分数，并附赠一次50:50求助。' },
    marathon: { name: '马拉松', tag: '全部题库', count: Infinity, timed: false, lifeline: false, desc: null }
  };
  const CHAPTER_MODE = { name: '章节', tag: '章节', count: Infinity, timed: false, lifeline: false, desc: null };
  const modeInfo = (key) => (key === 'chapter' ? CHAPTER_MODE : MODES[key]);
  const CHAPTER_ORDER = ['目标', '入学机会', '完成率', '学习成效', '技能', '公平性', '教师', '资金与学校', '历史', '幼儿早期', '识字能力', '包容'];
  const BOARD_KEY = 'sdg4.quiz.board';
  const BOARD_TABS = [
    { key: 'challenge', label: '挑战' },
    { key: 'classic', label: '经典' },
    { key: 'marathon', label: '马拉松' },
    { key: 'chapters', label: '章节' }
  ];
  let boardGroup = 'challenge';
  let lastSavedAt = 0;
  const TIERS = [
    { title: '满分', text: '你对SDG 4了如指掌。准备好给全班讲解了吗？' },
    { title: '非常出色', text: '你了解该目标、其具体目标及背后的数据。' },
    { title: '做得好', text: '你对SDG 4掌握扎实。“探索”和“具体目标”部分可以帮你补充不足之处。' },
    { title: '快到了', text: '看看数据面板和具体目标，然后再试一次。' },
    { title: '继续学习', text: '探索数据面板和十项具体目标，然后再试一次。' }
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
      const desc = M.desc || '全部 ' + QUIZ.length + ' 题一次作答。你的连对能坚持多久？';
      const best = bests[key];
      const bestText = typeof best === 'number' ? (M.timed ? '最佳：' + numberFmt.format(best) + ' 分' : '最佳：' + best + ' / ' + count) : '暂无分数';
      const b = h('button', 'mode-card' + (key === 'challenge' ? ' is-featured' : ''));
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', '游戏'));
      b.append(h('span', 'mc-tag', M.tag), h('span', 'mc-name', M.name), h('span', 'mc-desc', desc), foot);
      b.addEventListener('click', () => startQuiz(key));
      grid.appendChild(b);
    });
    $('#bankSize').textContent = String(QUIZ.length);
    renderChapters();
    renderBoard();
  }

  const scoreText = () => (modeInfo(quiz.mode).timed ? numberFmt.format(quiz.points) + ' 分' : '得分 ' + quiz.correct);

  function renderStreak(bump) {
    const b = $('#streakBadge');
    if (quiz.streak >= 2) {
      const mult = modeInfo(quiz.mode).timed ? (quiz.streak >= 5 ? ' ×2' : quiz.streak >= 3 ? ' ×1.5' : '') : '';
      b.hidden = false;
      b.textContent = '连对 ' + quiz.streak + mult;
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
    ll.textContent = '使用50:50';
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
    $('#qpText').textContent = '题目 ' + (quiz.i + 1) + ' / ' + total;
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
    ll.textContent = '50:50 已用';
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
    if (correct) verdict = M.timed ? '正确！+' + gained + ' 分' + (mult > 1 ? fill('，连对奖励 ×{0}', mult) : '') : '正确！';
    else if (timedOut) verdict = '时间到。答案是 ' + q.options[q.answer] + '.';
    else verdict = '不完全正确。答案是 ' + q.options[q.answer] + '.';

    const fb = $('#quizFeedback');
    fb.textContent = '';
    fb.append(h('p', 'fb-verdict', verdict), h('p', 'fb-text', q.explain), h('p', 'fb-src', '来源：' + q.src));
    fb.hidden = false;
    $('#qpScore').textContent = scoreText();
    if (gained) popPoints('+' + gained);
    renderStreak(correct);
    $('#qpFill').style.width = ((quiz.i + 1) / quiz.order.length) * 100 + '%';
    if (M.lifeline) $('#lifelineBtn').disabled = true;
    const next = $('#quizNext');
    next.textContent = quiz.i === quiz.order.length - 1 ? '查看我的分数' : '下一题';
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
      const bestText = typeof best === 'number' ? '最佳：' + best + ' / ' + total : '尚未参加';
      const b = h('button', 'chapter-card');
      b.type = 'button';
      const foot = h('span', 'mc-foot');
      foot.append(h('span', 'mc-best', bestText), h('span', 'mc-go', '游戏'));
      b.append(h('span', 'ch-num', '章节 ' + (n + 1)), h('span', 'mc-name', cat), h('span', 'ch-count', total + ' 题'), foot);
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
      const score = e.group === 'challenge' ? numberFmt.format(e.score) + ' 分' : e.correct + ' / ' + e.of;
      const meta = e.label + ' · ' + (e.group === 'challenge' ? e.correct + ' / ' + e.of + ' 题答对 · ' : '') + dateText(e.t);
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
      btn.textContent = '再点一次以清除所有分数';
      btn.classList.add('is-armed');
      clearTimer = setTimeout(() => {
        clearTimer = 0;
        btn.textContent = '清空排行榜';
        btn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(clearTimer);
    clearTimer = 0;
    store.set(BOARD_KEY, []);
    btn.textContent = '清空排行榜';
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
      $('#ssMsg').textContent = '请先输入名字。';
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
    $('#ssMsg').textContent = '已保存。你是第 ' + rank + ' 名，在 ' + tabLabel + ' 排行榜。';
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
    $('#flashCount').textContent = (fcState.i + 1) + ' / ' + total;
    $('#flashFill').style.width = ((fcState.i + 1) / total) * 100 + '%';
    $('#flashCat').textContent = q.cat;
    $('#flashFront').textContent = q.q;
    const answer = $('#flashAnswer');
    answer.textContent = '';
    answer.append(h('span', 'fa-answer', q.options[q.answer]), h('span', 'fa-why', q.explain + ' 来源：' + q.src + '.'));
    $('#flashPrev').disabled = fcState.i === 0;
    $('#flashNext').textContent = fcState.i === total - 1 ? '重新开始' : '下一张卡片';
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
    const label = quiz.mode === 'chapter' ? fill('{0}章', quiz.chapter) : fill('{0}模式', M.name);
    const score = M.timed ? numberFmt.format(quiz.points) + ' 分' : quiz.correct + ' / ' + total;
    const text = '我得了' + score + '分，SDG 4 测验（' + label + '）。人人享有优质教育。你能超过吗？';
    const msg = $('#shareMsg');
    msg.hidden = false;
    msg.textContent = '';
    if (navigator.share) {
      navigator.share({ title: 'SDG 4测验', text }).then(
        () => { msg.textContent = '已分享。'; },
        () => { msg.textContent = ''; }
      );
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { msg.textContent = '已复制。可粘贴到任何地方分享你的分数。'; },
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
    chapterEl.textContent = quiz.chapter ? '章节：' + quiz.chapter : '';
    $('#rsTitle').textContent = tier.title;
    $('#rsText').textContent = tier.text;

    const stats = $('#resultStats');
    stats.textContent = '';
    const addStat = (value, label) => {
      const d = h('div', 'rstat');
      d.append(h('b', null, value), h('span', null, label));
      stats.appendChild(d);
    };
    addStat(Math.round(ratio * 100) + '%', '答对');
    addStat(String(quiz.bestStreak), '最佳连对');
    if (M.timed) addStat(numberFmt.format(quiz.points), '分');

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
      topics = '最强主题：' + strong + ' (' + byCat[strong].right + ' / ' + byCat[strong].all + ').';
      if (weak !== strong && sc(weak) < 1) topics += ' 值得再看看：' + weak + ' (' + byCat[weak].right + ' / ' + byCat[weak].all + ').';
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
    reviewBtn.textContent = '查看答案';
    quiz.answers.forEach((a) => {
      const q = QUIZ[a.qi];
      const li = h('li');
      const mk = h('span', 'rv-mark' + (a.correct ? '' : ' is-wrong'));
      const s = sv('svg', { viewBox: '0 0 30 30', 'aria-hidden': 'true' }, mk);
      sv('path', { d: a.correct ? MARKS.tick : MARKS.cross }, s);
      mk.appendChild(h('span', 'visually-hidden', a.correct ? '正确' : '错误'));
      const body = h('div');
      let line;
      if (a.correct) line = '你的答案：' + q.options[a.chosen] + '.';
      else if (a.timedOut) line = '未作答：时间到。正确答案：' + q.options[q.answer] + '.';
      else line = '你的答案：' + q.options[a.chosen] + '。正确答案：' + q.options[q.answer] + '.';
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
  const MODE_LABEL = { focus: '专注', short: '短休息', long: '长休息' };
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
    if (timer.mode === 'focus') return '时段 ' + Math.min(timer.cycle + 1, every) + ' / ' + every;
    if (timer.mode === 'short') return '站起来、伸展身体，并喝点水';
    return '一个循环已完成。好好休息一下吧';
  }

  function renderCycle() {
    const host = $('#cycleDots');
    host.textContent = '';
    const done = Math.min(timer.cycle, timer.s.every);
    for (let i = 0; i < timer.s.every; i++) {
      const dot = h('span');
      if (i < done) dot.className = '开启';
      host.appendChild(dot);
    }
    const left = timer.s.every - done;
    $('#cycleLabel').textContent = left === 0 ? '是时候长休息了' : left + (left === 1 ? ' 专注时段' : ' 专注时段') + ' 直到长休息';
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
    $('#tStart').textContent = timer.running ? '暂停' : (timer.remaining < timer.total ? '继续' : '开始');
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
    announce(MODE_LABEL[timer.mode] + ' 已开始');
  }
  function pause() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, timer.endAt - Date.now());
    timer.running = false;
    stopClock();
    renderTimer();
    Sound.play('pause');
    announce('已暂停');
  }
  const toggleTimer = () => (timer.running ? pause() : start(false));
  function resetTimer() {
    timer.running = false;
    stopClock();
    timer.remaining = timer.total;
    renderTimer();
    Sound.play('tap');
    announce('计时器已重置');
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
    announce(completed ? MODE_LABEL[was] + '已完成。下一个：' + MODE_LABEL[next] + '.' : '已跳到 ' + MODE_LABEL[next] + '.');
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
    { name: '小学完成率', a: 77, b: 88 },
    { name: '初中完成率', a: 60, b: 78 },
    { name: '高中完成率', a: 37, b: 61 },
    { name: '青年识字率', a: 87, b: 93 }
  ];

  const ACTION_GROUPS = [['school', '在学校'], ['community', '在你的社区'], ['voice', '勇敢发声']];
  const ACTIONS = [
    { id: 'tutor', group: 'school', target: '4.1', title: '成立同伴辅导社', text: '每周一次帮助低年级学生学习阅读或数学。' },
    { id: 'books', group: 'school', target: '4.6', title: '组织图书交换', text: '收集大家已经读完的书，并在午餐时间交换。' },
    { id: 'include', group: 'school', target: '4.5', title: '让你的班级更加包容', text: '邀请新同学加入你的小组，并争取大家都能使用的学习资料。' },
    { id: 'eco', group: 'school', target: '4.7', title: '成立环保或全球议题社团', text: '将气候变化和人权融入班级项目。' },
    { id: 'safe', group: 'school', target: '4.a', title: '为安全的学校发声', text: '报告损坏的厕所、坡道或照明，并支持遭受欺凌的同学。' },
    { id: 'teacher', group: 'school', target: '4.c', title: '感谢一位老师', text: '给对你有过影响的老师写一封感谢信。' },
    { id: 'read', group: 'community', target: '4.2', title: '与小朋友一起阅读', text: '与年幼的亲属一起阅读，或在当地的幼儿学习中心做志愿者。' },
    { id: 'supplies', group: 'community', target: '4.5', title: '收集学习用品', text: '为有需要的学生组织收集笔记本、笔和书包的活动。' },
    { id: 'skill', group: 'community', target: '4.4', title: '教授一项数字技能', text: '教家人如何制作演示文稿或如何安全上网。' },
    { id: 'scholar', group: 'community', target: '4.b', title: '分享奖学金信息', text: '收集奖学金和课程机会，并为班级发布。' },
    { id: 'talk', group: 'voice', target: '全部', title: '做一场关于SDG 4的分享', text: '在班级或全校集会上介绍本网站的数据。' },
    { id: 'write', group: 'voice', target: '资金', title: '写信给决策者', text: '请校方负责人或当地代表保障教育经费。' },
    { id: 'share', group: 'voice', target: '全部', title: '每周分享一条数据', text: '发布事实机中的一条数据，并始终附上来源。' }
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
    if (label) label.textContent = on ? '声音开启' : '关闭声音';
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
    buildTable($('#slopeTable'), ['年份', '小学', '初中', '高中'],
      TREND.map((d) => [String(d.year), d.primary + '%', d.lower + '%', d.upper + '%']), '全球完成率');
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
        btn.textContent = open ? '显示数据表' : '隐藏数据表';
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
      btn.textContent = open ? '查看答案' : '隐藏答案';
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
      announce(MODE_LABEL[timer.mode] + ' 已选择');
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
    l1.append(h('i'), document.createTextNode('所选年份的比例（%）'));
    const l2 = h('span');
    const line = h('i', 'line');
    l2.append(line, document.createTextNode('2000年水平'));
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
        r.delta.textContent = y === 2024 ? '+' + (r.d.b - r.d.a) + ' 分' : '';
        tweenTo(r, v, animate);
      });
      $('#tnStatus').textContent = '正在显示 ' + y + ': ' + rows.map((r) => r.d.name + ' ' + (y === 2000 ? r.d.a : r.d.b) + '%').join(', ') + '.';
    };
    const stopPlay = () => {
      clearTimeout(playing);
      playing = 0;
      $('#tnPlay').textContent = '播放变化';
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
      $('#tnPlay').textContent = '播放中';
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
    const tagText = (a) => (/^\d/.test(a.target) ? '目标 ' + a.target : a.target === '全部' ? '全部目标' : a.target);
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
      pickCount.textContent = state.picks.length + ' / ' + MAX_PICKS + ' 已选';
      const badge = $('#plBadge');
      badge.textContent = state.mine ? '你的承诺' : '承诺示例：修改成属于你自己的内容';
      badge.classList.toggle('is-mine', state.mine);
      const list = $('#plList');
      list.textContent = '';
      if (!state.picks.length) {
        list.appendChild(h('li', 'pl-empty', '最多选择三项行动并添加到此处。'));
      }
      state.picks.forEach((id) => {
        const a = byId(id);
        const isDone = state.done.indexOf(id) >= 0;
        const li = h('li', 'pl-item' + (isDone ? ' is-done' : ''));
        const text = h('div');
        text.append(h('span', 'pl-item-title', a.title), h('span', 'pl-item-tag', tagText(a)));
        const btn = h('button', 'pl-done', isDone ? '已完成' : '标记为已完成');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(isDone));
        btn.setAttribute('aria-label', (isDone ? '已完成：' : '标记为已完成：') + a.title);
        btn.addEventListener('click', () => markDone(id));
        li.append(text, btn);
        list.appendChild(li);
      });
      const done = state.picks.filter((id) => state.done.indexOf(id) >= 0).length;
      const total = state.picks.length;
      $('#plCount').textContent = total ? done + ' / ' + total + ' 已完成' : '尚未选择任何内容';
      $('#plFill').style.width = (total ? (done / total) * 100 : 0) + '%';
      $('#plDate').textContent = state.made ? '制作于 ' + niceDate(state.made) : '一旦你修改，就会保存在本浏览器中';
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
        status('最多只能选择三项行动，请先移除一项。');
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
        status(all ? '全部完成。这就是你的全部承诺。' : '做得好，继续加油。');
      }
      save();
      render();
      const again = $('#plList [aria-label$="' + byId(id).title + '"]');
      if (again) again.focus({ preventScroll: true });
    }

    function pledgeText() {
      const lines = ['我的SDG 4承诺'];
      if (state.name.trim()) lines.push('名字：' + state.name.trim());
      state.picks.forEach((id, i) => {
        const a = byId(id);
        lines.push((i + 1) + '. ' + a.title + (state.done.indexOf(id) >= 0 ? ' (done)' : ''));
      });
      lines.push('制作于 ' + niceDate(state.made || todayISO()) + '，人人享有优质教育，SDG 4。');
      return lines.join('\n');
    }

    nameInput.addEventListener('input', () => {
      state.name = nameInput.value.slice(0, 40);
      save();
      render();
    });

    $('#plCopy').addEventListener('click', () => {
      if (!state.picks.length) {
        status('请先至少选择一项行动。');
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
        status('选中下方文字并复制。');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            area.hidden = true;
            status('已复制。可粘贴到任何地方。');
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
      status('已清空。最多选择三项行动。');
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
      count.textContent = q ? n + ' / ' + items.length + ' 个术语' : items.length + ' 个术语';
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
      $('#deckStatus').textContent = '幻灯片 ' + (cur + 1) + ' / ' + total;
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
      const label = fsEl() ? '退出全屏' : '全屏';
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
      if (key === '首页') { e.preventDefault(); show(0, -1, false); return; }
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
    const toTop = h('button', 'to-top', '返回顶部');
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
    $('#qotdCat').textContent = '主题：' + q.cat;
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
      if (answered) fb.textContent = (answered.correct ? '正确。' : '不完全正确。') + q.explain + ' 来源：' + q.src + '.';
    }
    paint();
  }

  /* My progress: badges, a summary, and backup, restore or erase of saved data. */
  const getStats = () => store.get('sdg4.stats', {}) || {};
  const chapterTotal = (cat) => QUIZ.filter((q) => q.cat === cat).length;
  const BADGES = [
    { name: '首次测验', text: '完成一次测验。', earned: () => getStats().quizzes >= 1 },
    { name: '完美一轮', text: '在一次测验中全部答对。', earned: () => getStats().perfect >= 1 },
    { name: '势如破竹', text: '连续答对五题。', earned: () => getStats().bestStreak >= 5 },
    { name: '与时间赛跑', text: '在“挑战”模式中获得分数。', earned: () => typeof (store.get('sdg4.quiz.bests', {}) || {}).challenge === 'number' },
    {
      name: '章节冠军', text: '在每个章节中全部答对。',
      earned: () => {
        const bests = store.get('sdg4.quiz.bests', {}) || {};
        return CHAPTER_ORDER.every((cat) => bests['chapter:' + cat] === chapterTotal(cat));
      }
    },
    { name: '记忆卡片达人', text: '翻看全部52张记忆卡片。', earned: () => fcSeen().length >= QUIZ.length },
    { name: '目标阅读者', text: '打开全部十项目标。', earned: () => (store.get('sdg4.seen.targets', []) || []).length >= TARGETS.length },
    { name: '笔记达人', text: '为三项目标写下笔记。', earned: () => Object.keys(store.get('sdg4.notes', {}) || {}).length >= 3 },
    { name: '今日一题', text: '回答每日一题。', earned: () => !!store.get('sdg4.qotd', null) },
    { name: '专注一小时', text: '使用计时器学习60分钟。', earned: () => getStats().focusMinutes >= 60 },
    { name: '打造你自己的', text: '在“行动起来”页面制定你自己的承诺。', earned: () => { const p = store.get('sdg4.pledge', null); return !!(p && p.made); } },
    { name: '勇敢发声', text: '将一个分数保存到排行榜。', earned: () => readBoard().length > 0 }
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
    const see = h('a', 'badge-toast-link', '查看我的徽章');
    see.href = 'progress.html';
    body.append(h('p', 'badge-toast-kicker', '获得徽章！'), h('p', 'badge-toast-name'), h('p', 'badge-toast-text'), see);
    const close = h('button', 'badge-toast-close', '关闭');
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
      [stats.quizzes || 0, '已完成测验'],
      [stats.perfect || 0, '完美轮次'],
      [stats.focusMinutes || 0, '分钟专注时间'],
      [fcSeen().length + ' / ' + QUIZ.length, '已翻卡片'],
      [(store.get('sdg4.seen.targets', []) || []).length + ' / ' + TARGETS.length, '已读目标'],
      [Object.keys(store.get('sdg4.notes', {}) || {}).length, '有笔记的目标']
    ];
    const sum = $('#progSummary');
    sum.textContent = '';
    summary.forEach(([num, label]) => {
      const d = h('div', 'prog-stat');
      d.append(h('b', null, String(num)), h('span', null, label));
      sum.appendChild(d);
    });
    const earned = BADGES.filter((b) => b.earned()).length;
    $('#badgeCount').textContent = earned + ' / ' + BADGES.length + ' 枚徽章已获得';
    const grid = $('#badgeGrid');
    grid.textContent = '';
    BADGES.forEach((b) => {
      const got = b.earned();
      const card = h('div', 'badge' + (got ? ' is-earned' : ''));
      card.append(h('span', 'badge-state', got ? '已获得' : '尚未获得'), h('p', 'badge-name', b.name), h('p', 'badge-text', b.text));
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
    setDataMsg('你的数据已保存为名为 sdg4-progress.json 的文件。');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      const data = parsed && parsed.app === 'sdg4-website' && parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
      if (!data) {
        setDataMsg('该文件不是SDG 4进度文件。');
        return;
      }
      const keys = Object.keys(data).filter((k) => k.indexOf(DATA_PREFIX) === 0);
      keys.forEach((k) => store.set(k, data[k]));
      renderProgress();
      setDataMsg('已导入 ' + keys.length + ' 项已保存内容，你打开其他页面时会看到。');
    };
    reader.readAsText(file);
  }

  let eraseTimer = 0;
  function eraseData() {
    const btn = $('#dataReset');
    if (!eraseTimer) {
      btn.textContent = '再点一次以清除全部内容';
      btn.classList.add('is-armed');
      eraseTimer = setTimeout(() => {
        eraseTimer = 0;
        btn.textContent = '清除本设备上的我的数据';
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
    btn.textContent = '清除本设备上的我的数据';
    btn.classList.remove('is-armed');
    renderProgress();
    setDataMsg('本设备上的所有已保存数据均已清除。');
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
        $('#certNote').textContent = fill('获得至少 {0} 枚徽章即可解锁证书。你目前已获得 {1} 枚。', CERT_MIN_BADGES, earned);
        return;
      }
      if (!name) {
        $('#certNote').textContent = '请先输入你的名字。';
        return;
      }
      store.set('sdg4.quiz.name', name);
      const quizzes = getStats().quizzes || 0;
      $('#certNote').textContent = '';
      $('#certOut').textContent = name;
      $('#certBody').textContent = fill('已学习联合国可持续发展目标4“优质教育”，完成 {2} 次测验，获得 {0}/{1} 枚徽章。', earned, BADGES.length, quizzes);
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
    { name: '红色', value: '#861A2B' },
    { name: '玫瑰色', value: '#B8344A' },
    { name: '绿色', value: '#1F6F5C' },
    { name: '蓝色', value: '#2D5BA8' },
    { name: '金色', value: '#8A5A12' },
    { name: '紫色', value: '#5B3F8C' }
  ];
  /* No I, L, O, 0 or 1, so that codes are easy to read aloud. */
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CLOUD_OFF = '本网站尚未设置班级功能。';
  const CLOUD_ERROR = '无法连接班级数据库。请检查网络连接后重试。';
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
      .map((c) => ({ code: c.code, name: String(c.name || '班级').slice(0, 60) }));
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
      return { code: fsId(r.document), name: f.name || '班级', created: f.created || '' };
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
    return fsRead(doc.fields).name || '班级';
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
    { slug: 'facts', file: 'facts.html', name: '事实数据' },
    { slug: 'targets', file: 'targets.html', name: '十项具体目标' },
    { slug: 'explore', file: 'explore.html', name: '探索' },
    { slug: 'solutions', file: 'solutions.html', name: '解决方案' },
    { slug: 'action', file: 'action.html', name: '行动起来' },
    { slug: 'quiz', file: 'quiz.html', name: '测验' },
    { slug: 'english', file: 'english.html', name: '学习英语' },
    { slug: 'timer', file: 'timer.html', name: '学习计时器' },
    { slug: 'about', file: 'about.html', name: '关于' },
    { slug: 'slides', file: 'slides.html', name: '幻灯片' }
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
    return Object.assign({ code, name: f.name || '班级' }, cleanRules(f));
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
      title: String(f.title || '作业').slice(0, 80),
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
    msg.textContent = '正在将你的成绩发送到班级…';
    Promise.all(joined.map((c) => cloudPostScore(c.code, entry).then(() => 'sent', (e) => (e.status === 403 || e.status === 404 ? 'left' : 'failed'))))
      .then((states) => {
        const kept = joined.filter((c, i) => states[i] !== 'left');
        if (kept.length !== joined.length) saveJoined(kept);
        const notes = [fill('成绩已发送：{1} 个班级中有 {0} 个已收到。', states.filter((s) => s === 'sent').length, joined.length)];
        if (states.indexOf('failed') >= 0) notes.push('部分成绩未能发送。请检查网络后重试。');
        if (states.indexOf('left') >= 0) notes.push('你已不在其中一个班级，因此已将其从本设备移除。');
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
    $('#pfPreviewName').textContent = p.nickname || '你的昵称';
  }
  function buildProfileChoices(p) {
    const emojis = $('#pfEmojis');
    emojis.textContent = '';
    PROFILE_EMOJI.forEach((em, i) => {
      const b = h('button', null, em);
      b.type = 'button';
      b.setAttribute('aria-label', fill('头像 {0}', i + 1));
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
      msg.textContent = '请先输入昵称。';
      $('#pfNick').focus();
      return;
    }
    store.set(PROFILE_KEY, p);
    paintPreview(p);
    msg.classList.add('is-ok');
    msg.textContent = '已保存。';
    const joined = loadJoined();
    if (!joined.length || !cloudReady()) return;
    msg.textContent = '正在保存到你的班级…';
    Promise.all(joined.map((c) => cloudPutMember(c.code, p))).then(
      () => { msg.textContent = '已保存。你的班级已使用新的资料。'; },
      () => {
        msg.classList.remove('is-ok');
        msg.textContent = '已保存在本设备上，但无法更新你的班级。';
      }
    );
  }

  /* Teacher mode */
  function showTeacher(on) {
    $('#teacherPanel').hidden = !on;
    $('#pfTeacher').checked = on;
    $('#pfTeacherState').textContent = on ? '开启' : '关闭';
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
    note('正在加载你的班级…');
    try {
      myClasses = await cloudMyClasses();
    } catch (e) {
      note(CLOUD_ERROR);
      return;
    }
    list.textContent = '';
    if (!myClasses.length) {
      note('你还没有创建班级。');
      return;
    }
    myClasses.forEach((c) => {
      const li = h('li');
      const info = h('div');
      const code = h('span', null, '代码 ');
      code.appendChild(h('span', 'cls-code', c.code));
      info.append(h('b', null, c.name), code);
      const open = h('button', 'btn-outline', '打开');
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
      msg.textContent = '请先输入班级名称。';
      input.focus();
      return;
    }
    msg.textContent = '正在创建班级…';
    try {
      const code = await cloudMakeClass(name);
      input.value = '';
      msg.textContent = fill('班级已创建。代码是 {0}。', code);
      myClasses.unshift({ code, name, created: new Date().toISOString() });
      openClassroom(code);
      renderClassList();
    } catch (err) {
      msg.textContent = CLOUD_ERROR;
    }
  }
  async function openClassroom(code) {
    const cls = myClasses.find((c) => c.code === code) || { code, name: '班级' };
    openCode = code;
    showClassQr(false);
    $('#clsDetail').hidden = false;
    $('#clsDetailName').textContent = cls.name;
    $('#clsDetailCode').textContent = code;
    disarmButton($('#clsDelete'), '删除班级');
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
    msg.textContent = '正在加载成绩…';
    try {
      const [{ members, scores }, assessments] = await Promise.all([cloudRoster(code), cloudAssessments(code)]);
      if (code !== openCode) return;
      rosterData = { members, scores, assessments };
      host.textContent = '';
      renderAssignmentList(assessments, scores);
      renderProgressPick();
      if (!members.length) {
        msg.textContent = '还没有人加入。请把代码分享给班上的同学。';
        return;
      }
      msg.textContent = fill('目前共 {0} 名学生、{1} 次测验。', members.length, scores.length);
      const table = h('table');
      const headRow = h('tr');
      ['学生', '测验', '平均', '最高', '最近', ''].forEach((t) => {
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
        const name = h('th', null, (m.emoji ? m.emoji + ' ' : '') + (m.nickname || '学生'));
        name.scope = 'row';
        row.appendChild(name);
        [
          pcts.length ? String(pcts.length) : '–',
          pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) + '%' : '–',
          pcts.length ? Math.max(...pcts) + '%' : '–',
          pcts.length ? pcts[pcts.length - 1] + '%' : '–'
        ].forEach((cell) => row.appendChild(h('td', null, cell)));
        const td = h('td');
        const remove = h('button', null, '移除');
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
      list.appendChild(h('li', 'pf-empty', '你还没有加入任何班级。'));
      return;
    }
    joined.forEach((c) => {
      const li = h('li');
      const info = h('div');
      const code = h('span', null, '代码 ');
      code.appendChild(h('span', 'cls-code', c.code));
      info.append(h('b', null, c.name), code);
      const leave = h('button', 'btn-ghost', '退出');
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
      msg.textContent = '班级代码由六个字母或数字组成。';
      input.focus();
      return;
    }
    const p = loadProfile();
    if (!p.nickname) {
      msg.textContent = '加入前请先在资料中保存昵称。';
      return;
    }
    if (!cloudReady()) {
      msg.textContent = CLOUD_OFF;
      return;
    }
    if (loadJoined().some((c) => c.code === code)) {
      msg.textContent = '你已加入该班级。';
      return;
    }
    msg.textContent = '正在加入…';
    try {
      const name = await cloudJoin(code, p);
      if (name === null) {
        msg.textContent = '没有使用该代码的班级。请向老师确认。';
        return;
      }
      saveJoined(loadJoined().concat([{ code, name }]));
      input.value = '';
      msg.textContent = fill('你已加入 {0}。', name);
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
      msg.textContent = '请输入网站地址，例如 https://your-site.example';
      return;
    }
    if (!window.SDG4QR) {
      msg.textContent = '二维码无法加载。请刷新页面后重试。';
      return;
    }
    msg.textContent = '';
    const qr = SDG4QR.encode(link);
    const size = qr.size + QR_QUIET * 2;
    const svg = sv('svg', { viewBox: '0 0 ' + size + ' ' + size, 'shape-rendering': 'crispEdges' }, box);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '加入此班级的二维码');
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
    btn.textContent = show ? '隐藏二维码' : '显示二维码';
    btn.setAttribute('aria-expanded', String(show));
    if (show) drawClassQr();
  }
  function copyJoinLink() {
    const link = joinLink(openCode);
    const msg = $('#clsQrMsg');
    if (!link) return;
    try {
      navigator.clipboard.writeText(link).then(
        () => { msg.textContent = '链接已复制。'; },
        () => { msg.textContent = '请选中链接并复制。'; }
      );
    } catch (e) {
      msg.textContent = '请选中链接并复制。';
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
      $('#joinMsg').textContent = '请先在上方保存昵称，然后点击“加入”进入班级。';
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
      box.setAttribute('aria-label', '老师的留言');
      const close = h('button', 'btn-ghost', '关闭');
      close.type = 'button';
      close.addEventListener('click', () => {
        box.remove();
        const all = store.get(NOTICE_KEY, {}) || {};
        all[r.code] = key;
        store.set(NOTICE_KEY, all);
      });
      box.append(h('p', 'class-note-title', fill('来自 {0} 老师的留言', r.name)), h('p', 'class-note-text', r.announcement), close);
      anchor.parentNode.insertBefore(box, anchor);
    });
  }
  function pageIsOff() { return turnedOff().pages.has(PAGE); }
  function showOffPage() {
    const host = $('main') || $('.site');
    if (!host) return;
    host.textContent = '';
    const back = h('a', 'btn-primary', '前往首页');
    back.href = 'index.html';
    const box = h('section', 'off-page');
    box.append(h('h1', 'off-page-title', '此页面已关闭'), h('p', 'block-note', '老师已为你们班关闭此页面。'), back);
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
    msg.textContent = '正在保存…';
    cloudSaveSettings(code, changes).then(() => {
      msg.classList.add('is-ok');
      msg.textContent = '已保存。学生下次打开网站时会看到这一变化。';
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
    msg.textContent = text ? '正在发布…' : '正在删除…';
    cloudSaveSettings(code, changes).then(() => {
      msg.classList.add('is-ok');
      msg.textContent = text ? '已发布。学生会在他们的页面顶部看到。' : '已删除。';
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
      const rm = h('button', 'btn-ghost', '移除');
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
      msg.textContent = '请先输入题目和四个选项。';
      $('#asgQText').focus();
      return;
    }
    asgDraft.push(q);
    ['#asgQText', '#asgExplain', '#asgOpt0', '#asgOpt1', '#asgOpt2', '#asgOpt3'].forEach((s) => { $(s).value = ''; });
    $('#asgCorrect').value = '0';
    renderDraft();
    msg.classList.add('is-ok');
    msg.textContent = fill('已添加第 {0} 题。', asgDraft.length);
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
      msg.textContent = '请先输入标题。';
      $('#asgTitle').focus();
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      msg.textContent = '请选择截止日期。';
      $('#asgDue').focus();
      return;
    }
    const a = { title, due, mode, chapters: [], count: 10, questions: [] };
    if (mode === 'custom') {
      if (!asgDraft.length) {
        msg.textContent = '请先添加至少一道题。';
        return;
      }
      a.questions = asgDraft.slice();
    } else {
      a.chapters = picked('#asgChapters', false);
      if (!a.chapters.length) {
        msg.textContent = '请至少勾选一个章节。';
        return;
      }
      const count = Math.round(Number($('#asgCount').value));
      if (!(count >= 1 && count <= 52)) {
        msg.textContent = '请选择 1 到 52 道题。';
        $('#asgCount').focus();
        return;
      }
      a.count = count;
    }
    const code = openCode;
    msg.textContent = '正在设置作业…';
    $('#asgSave').disabled = true;
    try {
      await cloudMakeAssessment(code, a);
      resetAsgForm();
      msg.classList.add('is-ok');
      msg.textContent = '作业已设置。学生可以在他们的个人资料页面看到。';
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
      list.appendChild(h('li', 'pf-empty', '还没有作业。'));
      return;
    }
    assessments.forEach((a) => {
      const pcts = scores.filter((s) => s.assessment === a.id).map((s) => Number(s.pct) || 0);
      const avg = pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) + '%' : '–';
      const scope = a.mode === 'custom' ? fill('你写的 {0} 道题', a.questions.length) : fill('来自 {1} 个章节的 {0} 道题', a.count, a.chapters.length);
      const info = h('div');
      info.append(h('b', null, a.title), h('span', null, fill('截止 {0} · {1}', a.due || 'no date', scope)), h('span', null, fill('{0} 名学生已完成 · 平均 {1}', pcts.length, avg)));
      const del = h('button', 'btn-ghost', '删除');
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
      const o = h('option', null, m.nickname || '学生');
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
      out.appendChild(h('li', 'pf-empty', '还没有人加入。'));
      return;
    }
    const uid = $('#clsProgPick').value;
    const mine = rosterData.scores.filter((s) => s.uid === uid && s.chapter && !s.assessment);
    CHAPTER_ORDER.forEach((c) => {
      const tries = mine.filter((s) => s.chapter === c);
      const li = h('li');
      const detail = tries.length
        ? fill('最高 {0}% · 尝试次数：{1}', Math.max(...tries.map((s) => Number(s.pct) || 0)), tries.length)
        : '尚未尝试';
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
      msg.textContent = '请先加载成绩。';
      return;
    }
    const { members, scores, assessments } = rosterData;
    const rows = [['学生', '测验', '平均 %', '最高 %', '最近 %'].concat(assessments.map((a) => a.title + ' %'))];
    members.slice().sort(byName).forEach((m) => {
      const mine = scores.filter((s) => s.uid === m.uid).sort((a, b) => (a.at > b.at ? 1 : -1));
      const pcts = mine.map((s) => Number(s.pct) || 0);
      const row = [m.nickname || '学生', pcts.length, pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) : '',
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
    msg.textContent = '成绩已下载为电子表格文件。';
  }

  /* Student: classmates and assignments on the profile page. */
  async function renderClassmates() {
    const block = $('#mateBlock');
    if (!block) return;
    const joined = loadJoined();
    block.hidden = !joined.length || !cloudReady();
    if (block.hidden) return;
    const host = $('#classmates');
    host.textContent = '正在加载同学…';
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
        sec.appendChild(h('p', 'block-note', '还没有其他人加入。'));
      } else {
        const ul = h('ul', 'mate-list');
        members.sort(byName).forEach((m) => {
          const av = h('span', 'mate-av', m.emoji || PROFILE_EMOJI[0]);
          av.style.setProperty('--av', m.colour || PROFILE_COLOURS[0].value);
          const text = h('div');
          text.appendChild(h('b', null, (m.nickname || '学生') + (m.uid === me ? ' (you)' : '')));
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
    list.appendChild(h('li', 'pf-empty', '正在加载作业…'));
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
      list.appendChild(h('li', 'pf-empty', failed ? CLOUD_ERROR : '还没有作业。'));
      return;
    }
    items.forEach(({ c, a }) => {
      const rec = asgRecord(c.code, a.id);
      const info = h('div');
      info.append(h('b', null, a.title), h('span', null, c.name + ' · ' + (a.due ? fill('截止 {0}', a.due) : '没有截止日期')));
      let action;
      if (rec && rec.finished) action = h('span', 'asg-status', fill('已完成 · {0}%', rec.pct));
      else if (rec && rec.started) action = h('span', 'asg-status', '已开始');
      else if (a.due && isoToday() > a.due) action = h('span', 'asg-status', '已结束');
      else {
        action = h('a', 'btn-primary', '开始');
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
    const box = resultCard(done, fill('你答对了 {0} 题，共 {1} 题。', done.correct, done.total));
    const sent = h('p', 'block-note pf-msg', '正在把你的成绩发送给老师…');
    sent.setAttribute('role', 'status');
    const retry = h('button', 'btn-outline', '重新发送');
    retry.type = 'button';
    retry.hidden = true;
    box.append(sent, retry);
    host.appendChild(box);
    const send = () => {
      retry.hidden = true;
      sent.textContent = '正在把你的成绩发送给老师…';
      cloudPostScore(code, { pct: done.pct, correct: done.correct, total: done.total, chapter: '', assessment: a.id, at: done.at }).then(() => {
        sent.textContent = '你的成绩已发送给老师。';
      }, (e) => {
        const gone = e.status === 403 || e.status === 404;
        sent.textContent = gone
          ? '你已不在这个班级里，因此无法发送成绩。'
          : '成绩无法发送。请检查网络连接，然后重新发送。';
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
    const nextBtn = h('button', 'btn-primary', '下一题');
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
      progress.textContent = fill('第 {0} 题，共 {1} 题', i + 1, questions.length);
      stage.textContent = '';
      stage.appendChild(h('h3', 'quiz-q', questions[i].q));
      nextBtn.hidden = true;
      englishChoices(questions[i], stage, (correct) => {
        if (correct) right++;
        nextBtn.textContent = i === questions.length - 1 ? '查看我的分数' : '下一题';
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
    if (lead) lead.textContent = a.due ? fill('截止 {0}。你只有一次作答机会。', a.due) : '你只有一次作答机会。';
    const rec = asgRecord(code, a.id);
    const say = (text) => {
      host.textContent = '';
      host.appendChild(h('p', 'block-note', text));
    };
    if (rec && rec.finished) {
      host.textContent = '';
      host.appendChild(resultCard(rec, fill('你已完成这份作业：答对 {0} / {1} 题（{2}%）。', rec.correct, rec.total, rec.pct)));
      return;
    }
    if (a.due && isoToday() > a.due) {
      say(fill('这份作业已于 {0} 结束。', a.due));
      return;
    }
    if (rec && rec.started) {
      say('你已在此设备上开始这份作业。只允许作答一次。');
      return;
    }
    const questions = assignmentQuestions(a);
    if (!questions.length) {
      say('此设备上没有这份作业的题目。请询问老师。');
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
      say('这个链接不正确。请从你的个人资料页面打开作业。');
      return;
    }
    if (!loadJoined().some((c) => c.code === code)) {
      say('此设备上你还未加入这个班级。请先在你的个人资料页面加入。');
      return;
    }
    if (!cloudReady()) {
      say(CLOUD_OFF);
      return;
    }
    say('正在加载作业…');
    cloudAssessment(code, id).then((a) => openAssignment(host, code, a), (err) => {
      say(err.status === 404 ? '这份作业已不再开放。请询问老师。' : CLOUD_ERROR);
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
      armButton(btn, '删除', '再点一次即可删除', () => {
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
        msg.textContent = '密码不正确。';
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
      armButton(btn, '移除', '再点一次即可移除', () => {
        btn.disabled = true;
        cloudRemoveMember(openCode, btn.dataset.remove)
          .then(loadRoster)
          .catch(() => { $('#clsDetailMsg').textContent = CLOUD_ERROR; });
      });
    });
    $('#clsDelete').addEventListener('click', () => {
      armButton($('#clsDelete'), '删除班级', '再点一次即可删除', () => {
        const code = openCode;
        $('#clsDetailMsg').textContent = '正在删除…';
        cloudDeleteClass(code).then(() => {
          openCode = '';
          $('#clsDetail').hidden = true;
          $('#createMsg').textContent = '班级已删除。';
          renderClassList();
        }, () => { $('#clsDetailMsg').textContent = CLOUD_ERROR; });
      });
    });
    $('#clsCopy').addEventListener('click', () => {
      const msg = $('#clsDetailMsg');
      try {
        navigator.clipboard.writeText(openCode).then(
          () => { msg.textContent = '代码已复制。'; },
          () => { msg.textContent = '请选中代码并复制。'; }
        );
      } catch (e) {
        msg.textContent = '请选中代码并复制。';
      }
    });
    $('#clsRefresh').addEventListener('click', loadRoster);
    $('#joinForm').addEventListener('submit', onJoin);
    $('#joinedList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-leave]');
      if (!btn) return;
      armButton(btn, '退出', '再点一次即可退出', () => {
        const code = btn.dataset.leave;
        const msg = $('#joinMsg');
        const finish = () => {
          saveJoined(loadJoined().filter((c) => c.code !== code));
          renderJoined();
          refreshClassLists();
          msg.textContent = '你已退出班级。';
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
    { word: 'literacy', pos: '名词', level: '中级', meaning: '读写能力。', example: 'Literacy rates have risen in most countries over the last fifty years.' },
    { word: 'enrol', pos: '动词', level: '初级', meaning: '正式入读学校、学院或课程。', example: 'She will enrol at the local school in September.' },
    { word: 'dropout', pos: '名词', level: '初级', meaning: '在完成学业前辍学的学生。', example: 'The programme gives extra support to students at risk of becoming dropouts.' },
    { word: 'scholarship', pos: '名词', level: '初级', meaning: '发给学生用于支付学业费用的钱。', example: 'She won a scholarship to study engineering at university.' },
    { word: 'out of school', pos: '短语', level: '初级', meaning: '虽已到学龄却没有上学。', example: 'Many children are out of school because their families cannot pay for uniforms or transport.' },
    { word: 'sustainable', pos: '形容词', level: '初级', meaning: '能够长期持续，不损害人类或地球。', example: "Sustainable development means meeting today's needs without damaging the future." },
    { word: 'curriculum', pos: '名词', level: '中级', meaning: '学校或课程所教授的科目和课程内容。', example: 'The new curriculum includes more maths and science.' },
    { word: 'equity', pos: '名词', level: '中级', meaning: '公平，让每个人无论出身如何都有公平的机会。', example: "The government wants equity, so that poor children get the same chances as everyone else." },
    { word: 'inclusive', pos: '形容词', level: '中级', meaning: '包容所有人，包括残障人士。', example: 'An inclusive school makes sure every child can learn.' },
    { word: 'tuition', pos: '名词', level: '中级', meaning: '在学校或大学接受教育所需支付的费用。', example: 'Tuition fees have risen sharply in the past ten years.' },
    { word: 'qualified', pos: '形容词', level: '中级', meaning: '已通过从事某项工作所需的培训或考试。', example: 'Schools need more qualified teachers, especially in rural areas.' },
    { word: 'vocational training', pos: '短语', level: '高级', meaning: '教授某一职业所需实用技能的教育。', example: 'Vocational training prepares young people to work as electricians or nurses.' },
    { word: 'completion rate', pos: '短语', level: '高级', meaning: '完成某一教育阶段的学生所占的比例。', example: 'The completion rate for secondary school is still low in some regions.' },
    { word: 'pre-primary', pos: '形容词', level: '高级', meaning: '小学前教育，通常面向三至五岁的儿童。', example: 'Pre-primary education helps children get ready for their first school year.' },
    { word: 'lifelong learning', pos: '短语', level: '高级', meaning: '终身学习，不仅限于学校。', example: 'Adults can join evening classes as part of lifelong learning.' },
    { word: 'gender parity', pos: '短语', level: '高级', meaning: '女童和男童享有同等受教育机会的状况。', example: 'The goal is gender parity at every level of schooling.' }
  ];

  const ENGLISH_QUIZ = [
    { level: '初级', q: 'Choose the correct word: She ___ to school by bus every day.', options: ['go', 'goes', 'going', 'gone'], answer: 1, explain: '与 he、she 或 it 搭配时，一般现在时动词要加 -s：she goes。' },
    { level: '初级', q: 'Choose the correct word: There are ___ students in the class.', options: ['much', 'many', 'a lot', 'few of'], answer: 1, explain: 'many 用于可数名词，如 students；much 用于不可数名词，如 water。' },
    { level: '初级', q: 'Which word means "the money paid to study at a university"?', options: ['tuition', 'curriculum', 'literacy', 'equity'], answer: 0, explain: 'tuition 指学费，即接受教学所付的钱。curriculum 指学校教授的科目清单。' },
    { level: '初级', q: 'A student who leaves school before finishing is a …', options: ['dropout', 'graduate', 'teacher', 'scholar'], answer: 0, explain: 'dropout 指在完成学业前离开学校的学生。' },
    { level: '初级', q: 'Choose the correct form: Yesterday we ___ a long test in maths.', options: ['take', 'took', 'taken', 'taking'], answer: 1, explain: 'yesterday 提示要用一般过去时。took 是 take 的过去式。' },
    { level: '中级', q: 'Choose the correct form: If I ___ more time, I would learn English faster.', options: ['have', 'had', 'has', 'having'], answer: 1, explain: '表示现在的假设情况时，用 if + 一般过去时（had），后面接 would + 动词原形。' },
    { level: '中级', q: 'Which sentence is correct?', options: ['I have lived here since 2019.', 'I am living here since 2019.', 'I have live here since 2019.', 'I living here since 2019.'], answer: 0, explain: '与 since 加具体时间点连用时，用现在完成时：I have lived here since 2019。' },
    { level: '中级', q: 'A school where every child is welcome, including children with disabilities, is …', options: ['inclusive', 'vocational', 'pre-primary', 'tuition-free'], answer: 0, explain: '全纳学校接纳并包容每一个人。' },
    { level: '中级', q: 'Children do better when they are interested ___ what they learn.', options: ['in', 'at', 'about', 'for'], answer: 0, explain: '形容词 "interested" 后面接 "in"：interested in something。' },
    { level: '中级', q: 'Choose the correct passive: The teachers ___ by the government last year.', options: ['were trained', 'trained', 'were training', 'have trained'], answer: 0, explain: '被动语态的一般过去时结构是 was 或 were + 过去分词。teachers 是复数，要用 were。' },
    { level: '中级', q: 'Equity in education means …', options: ['everyone gets a fair chance', 'only the best students get places', 'schools charge the same fees', 'every school has the same building'], answer: 0, explain: 'equity 指公平，即无论出身如何，每个人都有公平的机会。' },
    { level: '高级', q: 'A "completion rate" measures …', options: ['how many students finish a level of schooling', 'how much a school spends on books', 'how many teachers are qualified', 'how many new schools are built'], answer: 0, explain: '完成率是完成某一教育阶段（例如初中）的学生所占的比例。' },
    { level: '高级', q: 'Which phrase means learning throughout life, not only at school?', options: ['lifelong learning', 'vocational training', 'gender parity', 'pre-primary education'], answer: 0, explain: '终身学习指在各个年龄段进行的教育和培训，包括成年人的学习。' },
    { level: '高级', q: 'A course that teaches practical skills for work as an electrician is …', options: ['vocational', 'pre-primary', 'academic', 'literate'], answer: 0, explain: '职业培训教授某一职业所需的实用技能。' },
    { level: '高级', q: 'What does "gender parity" in education mean?', options: ['boys and girls have equal access to education', 'only girls go to school', 'every school costs the same', 'girls study only maths'], answer: 0, explain: '性别平等指女童和男童享有同等的受教育机会。' },
    { level: '高级', q: 'Which word is the noun form of "literate"?', options: ['literacy', 'literature', 'literal', 'literally'], answer: 0, explain: 'literacy 指读写能力。literature 指书面作品，如小说和诗歌。' }
  ];

  const ENGLISH_READING = [
    {
      level: '初级',
      title: 'Amina goes to school',
      text: "Amina is twelve years old and lives in a small village. Every morning she walks two kilometres to school. Her school has a good library, and she likes reading stories there. Last year she won a scholarship, so her family does not have to pay the school fees. Amina wants to become a doctor one day. She says school is the best thing that has ever happened to her.",
      questions: [
        { q: 'How does Amina get to school?', options: ['She takes a bus', 'She walks', 'Her father drives her', 'She rides a bicycle'], answer: 1, explain: '文中说她每天早上步行两公里去学校。' },
        { q: "Why does Amina's family not pay the school fees?", options: ['The school is free for everyone', 'She won a scholarship', 'She works at the school', 'Her teacher pays for her'], answer: 1, explain: '去年她获得了奖学金，因此家里不必支付学费。' },
        { q: 'What does Amina want to become?', options: ['a teacher', 'a librarian', 'a doctor', 'a driver'], answer: 2, explain: '文中说她希望将来成为一名医生。' }
      ]
    },
    {
      level: '中级',
      title: 'Why girls leave school early',
      text: 'Many girls in low-income countries leave school before they finish. Sometimes the reason is money: families cannot pay for uniforms, books or transport. In other cases, girls are asked to help at home, or they are married at a young age. Schools can help. Some governments give grants to families who keep their daughters in school, and some schools have toilets for girls, so that they do not miss lessons every month. These small changes can make a big difference to whether girls stay in school.',
      questions: [
        { q: 'What is one reason families might not send girls to school?', options: ['Schools are too big', 'They cannot pay for uniforms, books or transport', 'Girls do not want to learn', 'Teachers do not like girls'], answer: 1, explain: '文中说，缺少购买校服、书本或交通费用的钱，可能使女孩无法上学。' },
        { q: 'According to the text, what can help girls stay in school?', options: ['Longer holidays', 'Grants and toilets at school', 'Fewer lessons', 'Bigger classes'], answer: 1, explain: '文中提到了给家庭的补助金，以及学校为女生设置的厕所。' },
        { q: 'What do "these small changes" refer to?', options: ['the grants and the toilets', 'the families', 'the lessons', 'the holidays'], answer: 0, explain: '"These small changes"（这些小改变）指的是前一句中提到的补助金和厕所。' }
      ]
    },
    {
      level: '高级',
      title: 'Learning does not stop at school',
      text: 'Education is no longer something that ends when people leave school. In many countries, adults return to classrooms to learn a new language, gain a qualification or retrain for a new job. Vocational courses, online lessons and evening classes make this possible for people who work during the day. Governments and employers increasingly see lifelong learning as essential, because technology and industry change quickly. Yet adults who left school early often find it hardest to return, which is why reaching them remains a challenge.',
      questions: [
        { q: 'What is the main idea of the passage?', options: ['Schools should close in the evening', 'Learning continues throughout life and matters more and more', 'Online lessons are always better than classrooms', 'Adults should not retrain for new jobs'], answer: 1, explain: '文章认为，随着工作和技术的变化，终身学习变得越来越重要。' },
        { q: 'Why is lifelong learning becoming essential?', options: ['Technology and industry change quickly', 'Schools are getting smaller', 'Teachers are retiring', 'Governments are reducing their budgets'], answer: 0, explain: '文中说技术和产业变化很快，所以人们需要不断学习。' },
        { q: 'Which group often finds it hardest to return to learning?', options: ['Adults who left school early', 'Adults who work in the evening', 'Students who take online lessons', 'Teachers of vocational courses'], answer: 0, explain: '文章说，过早离开学校的成年人往往最难重返课堂。' }
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
        fb.append(h('p', 'fb-verdict', correct ? '正确！' : '不完全正确。答案是 ' + item.options[item.answer] + '.'), h('p', 'fb-text', item.explain));
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
      $('#wordCount').textContent = fill('第 {0} 个，共 {1} 个', i + 1, total);
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
        if (b) $(sel).textContent = fill('目前最高分：{0} / {1}。', b.right, b.total);
      });
    }

    function ask() {
      const item = ENGLISH_QUIZ[order[i]];
      $('#enProgress').textContent = fill('第 {0} 题，共 {1} 题', i + 1, order.length);
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
        next.textContent = i === order.length - 1 ? '查看我的分数' : '下一题';
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
      $('#enRsTitle').textContent = pct >= 0.8 ? '做得很好！' : pct >= 0.5 ? '进步不小。' : '继续练习。';
      $('#enRsText').textContent = fill('你答对了 {0} 题，共 {1} 题。', right, total);
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
            score.textContent = fill('你答对了 {0} 题，共 {1} 题。', right, answered);
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
    { title: '事实数据', href: 'facts.html', text: '关于谁失学、谁完成学业、谁在学习以及谁被落下的图表' },
    { title: '十项具体目标', href: 'targets.html', text: '以简单语言解释的每项SDG 4承诺，附最新数据' },
    { title: '探索', href: 'explore.html', text: '跟随100名儿童的求学之路，穿越1948至2030年，事实机' },
    { title: '解决方案', href: 'solutions.html', text: '行之有效的做法，从学校供餐到现金转移支付' },
    { title: '行动起来', href: 'action.html', text: '选择行动并制定你自己的承诺' },
    { title: '测验', href: 'quiz.html', text: '测验、章节、记忆卡片和排行榜' },
    { title: '学习计时器', href: 'timer.html', text: '以专注时段学习，并穿插短暂休息' },
    { title: '关于', href: 'about.html', text: '关于本学校项目、术语表及所有资料来源' },
    { title: '课堂幻灯片', href: 'slides.html', text: '展示关键数据的全屏幻灯片' },
    { title: '我的资料', href: 'profile.html', text: '昵称、头像和颜色，用代码加入班级，教师模式' },
    { title: '学习英语', href: 'english.html', text: '关于教育词汇的单词卡、测验和短文阅读，从初级到高级。' },
    { title: '我的进度', href: 'progress.html', text: '徽章、摘要，以及导出、导入或清除已保存数据' },
    { title: '获取应用', href: 'download.html', text: '下载 Windows、Mac 和 Android 版，或将网站添加到主屏幕' }
  ];
  let searchIndex = null;

  function buildSearchIndex() {
    // Pages a teacher has turned off for this student's class are left out of the search.
    const off = turnedOff();
    const shown = (file) => !TURNABLE_PAGES.some((t) => t.file === file && off.pages.has(t.slug));
    const items = SEARCH_PAGES.filter((p) => shown(p.href)).map((p) => ({ kind: '页面', title: p.title, text: p.text, href: p.href }));
    if (shown('targets.html')) TARGETS.forEach((t) => items.push({ kind: '目标 ' + t.code, title: t.title, text: t.plain + ' ' + t.action, href: 'targets.html' }));
    if (shown('facts.html')) FACTS.forEach((f) => items.push({ kind: '事实', title: f.num, text: f.text, href: 'facts.html' }));
    if (shown('quiz.html')) QUIZ.forEach((q) => items.push({ kind: '测验题目', title: q.q, text: q.explain, href: 'quiz.html' }));
    if (shown('english.html')) ENGLISH_WORDS.forEach((w) => items.push({ kind: '英语单词', title: w.word, text: w.meaning, href: 'english.html' }));
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
