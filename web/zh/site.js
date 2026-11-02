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
    { key: 'primary', name: '小学', color: '#7A1526' },
    { key: 'lower', name: '初中', color: '#B8344A' },
    { key: 'upper', name: '高中', color: '#E58B98' }
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
    { value: 79, name: '小学学龄', color: '#7A1526' },
    { value: 64, name: '初中学龄', color: '#B8344A' },
    { value: 130, name: '高中学龄', color: '#E58B98' }
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
      if (i < v) c.className = 'on';
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
      if (i < done) dot.className = 'on';
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
    { title: '我的进度', href: 'progress.html', text: '徽章、摘要，以及导出、导入或清除已保存数据' },
    { title: '获取应用', href: 'download.html', text: '下载 Windows、Mac 和 Android 版，或将网站添加到主屏幕' }
  ];
  let searchIndex = null;

  function buildSearchIndex() {
    const items = SEARCH_PAGES.map((p) => ({ kind: '页面', title: p.title, text: p.text, href: p.href }));
    TARGETS.forEach((t) => items.push({ kind: '目标 ' + t.code, title: t.title, text: t.plain + ' ' + t.action, href: 'targets.html' }));
    FACTS.forEach((f) => items.push({ kind: '事实', title: f.num, text: f.text, href: 'facts.html' }));
    QUIZ.forEach((q) => items.push({ kind: '测验题目', title: q.q, text: q.explain, href: 'quiz.html' }));
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
