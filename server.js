'use strict';

/**
 * T. D. Lee Centennial — Turbulence Legacy Lecture Series
 * Dependency-free Node.js 20 server: static hosting + small JSON API.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8000;
const HOST = '0.0.0.0';
const APP_ROOT = __dirname;
const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const DATA_DIR = path.join(APP_ROOT, '.data');
const STATE_DIR = path.join(DATA_DIR, 'state');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const UPLOADS_DIR = path.join(STATE_DIR, 'uploads');
const MAX_PDF_SIZE = 2 * 1024 * 1024;
const PDF_BODY_LIMIT = 3 * 1024 * 1024;
const BACKUP_BODY_LIMIT = 64 * 1024 * 1024;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

const sessions = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, expected) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);
}

const SERIES_RANGE_LABELS = {
  zh: '至活动结束',
  en: 'until the end of the series',
  fr: 'jusqu’à la fin de la série',
  ru: 'до конца серии',
  de: 'bis zum Ende der Reihe',
  it: 'fino al termine del ciclo',
  es: 'hasta el final del ciclo',
  ko: '행사 종료 시까지',
  ja: 'シリーズ終了まで',
  ur: 'سلسلے کے اختتام تک',
  fa: 'تا پایان مجموعه',
  ar: 'حتى نهاية السلسلة'
};

function seedState() {
  const salt = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: crypto.randomUUID(),
        name: '会议秘书处',
        email: 'admin@tdlee100.org',
        salt,
        passwordHash: hashPassword('TDLee-1952', salt),
        affiliation: 'T. D. Lee Centennial Secretariat',
        position: 'Administrator',
        country: '—',
        notes: '',
        role: 'admin',
        createdAt: now
      }
    ],
    announcements: [
      {
        id: crypto.randomUUID(),
        date: '2026-11-25',
        tag: 'opening',
        title: {
          zh: '开幕报告：湍流统计理论的起源与回响',
          en: 'Opening Lecture: Origins and Echoes of T. D. Lee’s Statistical Theory of Turbulence',
          fr: 'Conférence inaugurale : origines et échos de la théorie statistique de la turbulence de T. D. Lee'
        },
        body: {
          zh: '系列首场报告将回顾李政道先生 1952 年关于流体与磁流体场统计性质的论文，讨论其对湍流统计力学、多体理论与重整化微扰展开的深远影响。',
          en: 'The opening lecture revisits T. D. Lee’s 1952 paper on the statistical properties of hydrodynamical and magneto-hydrodynamical fields, and traces its influence on the statistical mechanics of turbulence, many-body theory and renormalized perturbation expansions.',
          fr: 'La conférence inaugurale revient sur l’article de 1952 de T. D. Lee consacré aux propriétés statistiques des champs hydrodynamiques et magnétohydrodynamiques, et retrace son influence sur la mécanique statistique de la turbulence, la théorie des systèmes à N corps et les développements perturbatifs renormalisés.'
        },
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        date: '2026-11-24',
        dateLabel: { ...SERIES_RANGE_LABELS },
        tag: 'notice',
        title: {
          zh: '参会注册与报告征稿正式开放，揭幕',
          en: 'Registration and Call for Contributions Now Open — Kickoff',
          fr: 'Ouverture des inscriptions et de l’appel à contributions — Lancement',
          ru: 'Регистрация и приём тезисов открыты — старт',
          de: 'Anmeldung und Beitragseinreichung geöffnet — Auftakt',
          it: 'Iscrizione e call for contributions aperti — avvio',
          es: 'Inscripción y llamada a contribuciones abiertas — lanzamiento',
          ko: '등록 및 발표 신청 공식 오픈 — 킥오프',
          ja: '参加登録と報告募集正式開始——キックオフ',
          ur: 'رجسٹریشن اور تقاریر کی دعوت رسمی طور پر کھل گئی',
          fa: 'ثبت‌نام و فراخوان مقالات رسماً آغاز شد',
          ar: 'التسجيل ودعوة المساهمات مفتوحة رسميًا — انطلاق'
        },
        body: {
          zh: '即日起开放线上注册。欢迎从事湍流、统计物理与相关领域的学者报名参会，并提交拟报告题目与摘要。注册后将获得线上交流区权限。',
          en: 'Online registration is now open. Scholars working on turbulence, statistical physics and related fields are warmly invited to register and to submit a proposed title and abstract. Registered participants gain access to the online discussion area.',
          fr: 'Les inscriptions en ligne sont ouvertes. Les chercheurs travaillant sur la turbulence, la physique statistique et les domaines connexes sont chaleureusement invités à s’inscrire et à proposer un titre et un résumé. Les participants inscrits ont accès à l’espace d’échange en ligne.'
        },
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        date: '2026-11-25',
        tag: 'lecture',
        title: {
          zh: 'QED 与 QCD 湍流中的统计方法——李政道 1952 年遗产',
          en: 'Statistical Methods in QED and QCD Turbulence: The Legacy of T. D. Lee’s 1952 Paper',
          fr: 'Méthodes statistiques dans la turbulence QED et QCD : l’héritage de l’article de 1952 de T. D. Lee',
          ru: 'Статистические методы в турбулентности КЭД и КХД: наследие работы Т. Д. Ли 1952 года',
          de: 'Statistische Methoden in der QED- und QCD-Turbulenz: Das Vermächtnis von T. D. Lees Arbeit von 1952',
          it: 'Metodi statistici nella turbolenza QED e QCD: l’eredità dell’articolo di T. D. Lee del 1952',
          es: 'Métodos estadísticos en la turbulencia QED y QCD: el legado del artículo de 1952 de T. D. Lee',
          ko: 'QED 및 QCD 난류의 통계적 방법 — T. D. Lee 1952년 논문의 유산',
          ja: 'QED と QCD 乱流における統計的手法——李政道 1952 年の遺産',
          ur: 'QED اور QCD ٹربولنس میں شماریاتی طریقے: ٹی ڈی لی کے 1952 کے مقالے کا ورثہ',
          fa: 'روش‌های آماری در تلاطم QED و QCD: میراث مقاله ۱۹۵۲ تی. دی. لی',
          ar: 'الأساليب الإحصائية في اضطراب QED و QCD: إرث ورقة تي. دي. لي لعام 1952'
        },
        body: {
          zh: '1993 年关于 QED 湍流的论文引用了李政道 1952 年的工作——Dirac 方程与 Maxwell 方程耦合系统具有若干理想不变量，Lee 的统计方法为研究提供了新路径。这一思路避开了重整化微扰理论的固有困难，原则上可推广至 QCD 和夸克-胶子等离子体的统计研究。1997 年的后续论文亦隐式延续了这一方向。',
          en: 'A 1993 paper on QED turbulence cited Lee 1952: the coupled Dirac–Maxwell system possesses several ideal invariants, and Lee’s statistical approach opens a fresh avenue of investigation. This framework sidesteps the inherent difficulties of renormalized perturbation theory and can in principle be extended to QCD and the quark–gluon plasma. A 1997 follow-up paper implicitly carried forward this direction.',
          fr: 'Un article de 1993 sur la turbulence QED citait Lee 1952 : le système couplé Dirac–Maxwell possède plusieurs invariants idéaux, et l’approche statistique de Lee ouvre une nouvelle voie d’investigation. Ce cadre contourne les difficultés inhérentes à la théorie des perturbations renormalisée et peut en principe être étendu à la QCD et au plasma quark–gluon. Un article de suivi de 1997 a implicitement poursuivi cette direction.',
          ru: 'Статья 1993 года о турбулентности КЭД цитировала работу Ли 1952 года: связанная система Дирака–Максвелла обладает несколькими идеальными инвариантами, а статистический подход Ли открывает новый путь исследования. Эта структура обходит присущие теории возмущений с перенормировкой трудности и в принципе может быть распространена на КХД и кварк-глюонную плазму. Последующая статья 1997 года имплицитно продолжила это направление.',
          de: 'Ein Aufsatz von 1993 über QED-Turbulenz zitierte Lee 1952: das gekoppelte Dirac–Maxwell-System besitzt mehrere ideale Invarianten, und Lees statistischer Ansatz eröffnet einen neuen Untersuchungsweg. Dieser Rahmen umgeht die inhärenten Schwierigkeiten der renormierten Störungstheorie und lässt sich prinzipiell auf die QCD und das Quark-Gluon-Plasma erweitern. Ein Folgeaufsatz von 1997 setzte diese Richtung implizit fort.',
          it: 'Un articolo del 1993 sulla turbolenza QED citava Lee 1952: il sistema accoppiato Dirac–Maxwell possiede diversi invarianti ideali, e l’approccio statistico di Lee apre una nuova via di indagine. Questo quadro aggira le difficoltà inerenti alla teoria delle perturbazioni rinormalizzata e può in principio essere esteso alla QCD e al plasma di quark–gluoni. Un articolo di follow-up del 1997 ha implicitamente proseguito questa direzione.',
          es: 'Un artículo de 1993 sobre turbulencia QED citaba a Lee 1952: el sistema acoplado Dirac–Maxwell posee varios invariantes ideales, y el enfoque estadístico de Lee abre una nueva vía de investigación. Este marco evita las dificultades inherentes a la teoría de perturbaciones renormalizada y, en principio, puede extenderse a la QCD y al plasma de quark–gluones. Un artículo de seguimiento de 1997 continuó implícitamente esta dirección.',
          ko: 'QED 난류에 관한 1993년 논문은 Lee 1952를 인용했습니다. Dirac–Maxwell 결합 시스템은 이상 불변량을 가지며 Lee의 통계적 접근법은 새로운 연구 방향을 제시합니다. 이 틀은 재규제 섭동 이론의 고유한 어려움을 피하고 원칙적으로 QCD 및 쿼크-글루온 플라즈마로 확장될 수 있습니다. 1997년 후속 논문은 이 방향을 암묵적으로 이어갔습니다.',
          ja: 'QED 乱流に関する 1993 年の論文は Lee 1952 を引用しました。Dirac–Maxwell 結合系はいくつかの理想不変量を持ち、Lee の統計的アプローチは新しい研究経路を開きます。この枠組みは繰り込み摂動論の固有の困難さを回避し、原理的に QCD およびクォーク・グルオンプラズマに拡張できます。1997 年の追論文はこの方向を暗黙的に継承しています。',
          ur: 'QED ٹربولنس پر 1993 کے مقالے نے Lee 1952 کو حوالہ دیا۔ جوڑا Dirac–Maxwell نظام میں کئی مثالی متغیرات ہیں، اور Lee کا شماریاتی نقطہ نظر تحقیق کا نیا راستہ کھولتا ہے۔ یہ فریم ورک renormilized perturbation theory کی اندرونی مشکلات سے بچتا ہے اور اصولی طور پر QCD اور quark–gluon plasma تک پھیلایا جا سکتا ہے۔ 1997 کے فالو اپ مقالے نے اس سمت کو واضح طور پر آگے بڑھایا۔',
          fa: 'مقاله ۱۹۹۳ در مورد تلاطم QED به مقاله Lee ۱۹۵۲ ارجاع داد. سیستم جفت‌شده دیراک–ماکسول دارای چند متغیر ایده‌آل است و رویکرد آماری Lee مسیر جدیدی برای تحقیق می‌گشاید. این چارچوب مشکلات ذاتی نظریه اختلالات نرمالیزه‌شده را دور می‌زند و در اصل می‌تواند به QCD و پلاسماکوارک–گلئون گسترش یابد. مقاله پیگیری ۱۹۹۷ به‌طور ضمنی این جهت را ادامه داد.',
          ar: 'استشهد مقال عام 1993 حول اضطراب QED بـ Lee 1952: يمتلك نظام Dirac–Maxwell المقترن عدة ثوابت مثالية، ويفتح نهج Lee الإحصائي طريقًا جديدًا للتحقيق. يتجنب هذا الإطار الصعوبات الكامنة في نظرية الاضطرابات المعادلة، ويمكن من حيث المبدأ توسيعه ليشمل QCD وبلازما الكوارك–الغلون. واصلت ورقة متابعة عام 1997 هذا الاتجاه ضمنيًا.'
        },
        createdAt: now
      }
    ],
    materials: [
      {
        id: crypto.randomUUID(),
        type: 'paper',
        title: {
          zh: '论流体与磁流体场的若干统计性质',
          en: 'On Some Statistical Properties of Hydrodynamical and Magneto-Hydrodynamical Fields',
          fr: 'Sur quelques propriétés statistiques des champs hydrodynamiques et magnétohydrodynamiques'
        },
        speaker: 'T. D. Lee',
        date: '1952',
        url: 'https://scholar.google.com/scholar?q=%22On+some+statistical+properties+of+hydrodynamical+and+magneto-hydrodynamical+fields%22',
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        type: 'slides',
        title: {
          zh: '湍流统计力学导论 · 报告讲义',
          en: 'Introduction to the Statistical Mechanics of Turbulence — Lecture Slides',
          fr: 'Introduction à la mécanique statistique de la turbulence — supports de cours'
        },
        speaker: 'Organizing Committee',
        date: '2026-11-24',
        url: '',
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        type: 'video',
        title: {
          zh: '开幕报告录像',
          en: 'Opening Lecture Recording',
          fr: 'Enregistrement de la conférence inaugurale'
        },
        speaker: 'T. D. Lee Centennial Series',
        date: '2026-11-24',
        url: '',
        createdAt: now
      }
    ],
    forum: [],
    committees: {
      advisory: [],
      organizing: [],
      hosts: []
    }
  };
}

let state;
let persistTimer = null;

function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const temporaryFile = STATE_FILE + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(temporaryFile, JSON.stringify(state), 'utf8');
      fs.renameSync(temporaryFile, STATE_FILE);
    } catch (err) {
      try {
        fs.rmSync(temporaryFile, { force: true });
      } catch {
        // Keep the original persistence error.
      }
      console.error('state persist failed:', err.message);
    }
  }, 200);
  if (persistTimer.unref) persistTimer.unref();
}

function emptyPresentation() {
  return { requested: false, title: '', abstract: '', pdf: null };
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasStateShape(value) {
  return isRecord(value) &&
    Array.isArray(value.users) &&
    Array.isArray(value.announcements) &&
    Array.isArray(value.materials) &&
    Array.isArray(value.forum) &&
    isRecord(value.committees) &&
    Array.isArray(value.committees.advisory) &&
    Array.isArray(value.committees.organizing) &&
    Array.isArray(value.committees.hosts);
}

function loadState() {
  let raw;
  try {
    raw = fs.readFileSync(STATE_FILE, 'utf8');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
    state = seedState();
    persist();
    return;
  }

  const parsed = JSON.parse(raw);
  if (!hasStateShape(parsed)) throw new Error('invalid state');
  state = parsed;
  let migrated = false;

  for (const account of state.users) {
    if (!isRecord(account) || account.role === 'admin') continue;
    if (!isRecord(account.presentation)) {
      account.presentation = emptyPresentation();
      migrated = true;
      continue;
    }
    if (typeof account.presentation.requested !== 'boolean') {
      account.presentation.requested = false;
      migrated = true;
    }
    if (typeof account.presentation.title !== 'string') {
      account.presentation.title = '';
      migrated = true;
    }
    if (typeof account.presentation.abstract !== 'string') {
      account.presentation.abstract = '';
      migrated = true;
    }
    if (account.presentation.pdf === undefined) {
      account.presentation.pdf = null;
      migrated = true;
    }
  }

  // Remove the old seminar entry that has been pulled
  const oldSeminar = state.announcements.find((item) =>
    item.title && item.title.zh === '系列研讨会（一）：磁流体湍流的统计性质'
  );
  if (oldSeminar) {
    state.announcements = state.announcements.filter((item) => item !== oldSeminar);
    migrated = true;
  }

  // Normalize the registration notice — update date, dateLabel, and multilingual title
  const registrationOld = state.announcements.find((item) =>
    item.title && item.title.zh === '参会注册与报告征稿正式开放'
  );
  const registrationNew = state.announcements.find((item) =>
    item.title && item.title.zh === '参会注册与报告征稿正式开放，揭幕'
  );
  const registration = registrationNew || registrationOld;
  if (registration) {
    if (registration.date !== '2026-11-24') {
      registration.date = '2026-11-24';
      migrated = true;
    }
    if (!registrationNew) {
      registration.title = {
        zh: '参会注册与报告征稿正式开放，揭幕',
        en: 'Registration and Call for Contributions Now Open — Kickoff',
        fr: 'Ouverture des inscriptions et de l’appel à contributions — Lancement',
        ru: 'Регистрация и приём тезисов открыты — старт',
        de: 'Anmeldung und Beitragseinreichung geöffnet — Auftakt',
        it: 'Iscrizione e call for contributions aperti — avvio',
        es: 'Inscripción y llamada a contribuciones abiertas — lanzamiento',
        ko: '등록 및 발표 신청 공식 오픈 — 킥오프',
        ja: '参加登録と報告募集正式開始——キックオフ',
        ur: 'رجسٹریشن اور تقاریر کی دعوت رسمی طور پر کھل گئی',
        fa: 'ثبت‌نام و فراخوان مقالات رسماً آغاز شد',
        ar: 'التسجيل ودعوة المساهمات مفتوحة رسميًا — انطلاق'
      };
      migrated = true;
    }
    const labels = registration.dateLabel || {};
    const labelsNeedUpdate = Object.keys(SERIES_RANGE_LABELS).some((lang) => labels[lang] !== SERIES_RANGE_LABELS[lang]);
    if (labelsNeedUpdate) {
      registration.dateLabel = { ...SERIES_RANGE_LABELS };
      migrated = true;
    }
  }

  // Ensure the QED/QCD turbulence lecture is present
  const qedTitleZh = 'QED 与 QCD 湍流中的统计方法——李政道 1952 年遗产';
  if (!state.announcements.some((item) => item.title && item.title.zh === qedTitleZh)) {
    const seeded = seedState();
    const qed = seeded.announcements.find((item) => item.tag === 'lecture');
    if (qed) {
      state.announcements.push(qed);
      migrated = true;
    }
  }

  if (migrated) persist();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function publicPresentation(presentation) {
  const source = isRecord(presentation) ? presentation : emptyPresentation();
  const pdf = isRecord(source.pdf) ? source.pdf : null;
  return {
    requested: source.requested === true,
    title: typeof source.title === 'string' ? source.title : '',
    abstract: typeof source.abstract === 'string' ? source.abstract : '',
    pdf: pdf ? {
      id: pdf.id,
      name: pdf.name,
      size: pdf.size,
      updatedAt: pdf.updatedAt
    } : null
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    affiliation: user.affiliation,
    position: user.position,
    country: user.country,
    notes: typeof user.notes === 'string' ? user.notes : '',
    role: user.role,
    createdAt: user.createdAt,
    presentation: publicPresentation(user.presentation)
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, exp: Date.now() + SESSION_TTL });
  return token;
}

function currentUser(req) {
  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const record = sessions.get(match[1]);
  if (!record) return null;
  if (record.exp < Date.now()) {
    sessions.delete(match[1]);
    return null;
  }
  return state.users.find((u) => u.id === record.userId) || null;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJson(req, limit = 128 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid-json'));
      }
    });
    req.on('error', reject);
  });
}

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function tri(value, max) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    zh: text(source.zh, max),
    en: text(source.en, max),
    fr: text(source.fr, max)
  };
}

function presentationValues(value) {
  const source = isRecord(value) ? value : {};
  if (source.requested !== true) return emptyPresentation();
  const title = text(source.title, 300);
  const abstract = text(source.abstract, 5000);
  if (!title || !abstract) throw new Error('presentation-required');
  return { requested: true, title, abstract, pdf: null };
}

function cleanPdfName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}

function decodePdfBase64(value, allowDataUrl) {
  if (typeof value !== 'string') throw new Error('invalid-pdf');
  const prefix = 'data:application/pdf;base64,';
  let encoded = value;
  if (allowDataUrl && encoded.startsWith('data:')) {
    if (!encoded.startsWith(prefix)) throw new Error('invalid-pdf');
    encoded = encoded.slice(prefix.length);
  }
  const maxEncodedLength = 4 * Math.ceil(MAX_PDF_SIZE / 3);
  if (!encoded || encoded.length > maxEncodedLength || encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('invalid-pdf');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length > MAX_PDF_SIZE || buffer.toString('base64') !== encoded ||
      buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('invalid-pdf');
  }
  return buffer;
}

function parsePdfUpload(value) {
  if (!isRecord(value) || value.type !== 'application/pdf') throw new Error('invalid-pdf');
  const name = cleanPdfName(value.name);
  if (!name || path.extname(name).toLowerCase() !== '.pdf') throw new Error('invalid-pdf');
  return { name, buffer: decodePdfBase64(value.data, true) };
}

function pdfFilePath(id) {
  if (typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const resolved = path.resolve(uploadsRoot, id + '.pdf');
  if (!resolved.startsWith(uploadsRoot + path.sep)) return null;
  return resolved;
}

function savePdf(upload) {
  const id = crypto.randomUUID();
  const file = pdfFilePath(id);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(file, upload.buffer, { flag: 'wx' });
  return {
    id,
    name: upload.name,
    size: upload.buffer.length,
    updatedAt: new Date().toISOString()
  };
}

function deletePdf(pdf) {
  if (!isRecord(pdf)) return;
  const file = pdfFilePath(pdf.id);
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
}

function pdfContentDisposition(value) {
  const name = cleanPdfName(value) || 'abstract.pdf';
  const fallback = name.replace(/[^A-Za-z0-9._-]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase()
  );
  return 'attachment; filename="' + fallback + '"; filename*=UTF-8\'\'' + encoded;
}

function createBackup() {
  const snapshot = JSON.parse(JSON.stringify(state));
  for (let index = 0; index < snapshot.users.length; index += 1) {
    const pdf = snapshot.users[index].presentation && snapshot.users[index].presentation.pdf;
    if (!pdf) continue;
    const file = pdfFilePath(pdf.id);
    if (!file) throw new Error('invalid state pdf');
    pdf.data = fs.readFileSync(file).toString('base64');
  }
  return {
    format: 'tdlee100-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    state: snapshot
  };
}

function requireBackup(condition) {
  if (!condition) throw new Error('invalid-backup');
}

function validateBackup(backup) {
  requireBackup(isRecord(backup) && backup.format === 'tdlee100-backup' && backup.version === 1);
  requireBackup(typeof backup.exportedAt === 'string' && backup.exportedAt);
  requireBackup(hasStateShape(backup.state));

  const source = backup.state;
  for (const key of ['announcements', 'materials', 'forum']) {
    requireBackup(source[key].every(isRecord));
  }
  for (const key of ['advisory', 'organizing', 'hosts']) {
    requireBackup(source.committees[key].every(isRecord));
  }

  const restored = JSON.parse(JSON.stringify(source));
  const pdfFiles = [];
  const userIds = new Set();
  const emails = new Set();
  const pdfIds = new Set();

  for (let index = 0; index < source.users.length; index += 1) {
    const account = source.users[index];
    requireBackup(isRecord(account));
    for (const field of ['id', 'name', 'email', 'salt', 'passwordHash', 'role', 'createdAt']) {
      requireBackup(typeof account[field] === 'string' && account[field].length > 0);
    }
    requireBackup(account.role === 'admin' || account.role === 'member');
    requireBackup(!userIds.has(account.id) && !emails.has(account.email.toLowerCase()));
    userIds.add(account.id);
    emails.add(account.email.toLowerCase());
    for (const field of ['affiliation', 'position', 'country', 'notes']) {
      requireBackup(account[field] === undefined || typeof account[field] === 'string');
    }

    if (account.role === 'admin' && account.presentation === undefined) continue;
    const presentation = account.presentation;
    requireBackup(isRecord(presentation));
    requireBackup(typeof presentation.requested === 'boolean');
    requireBackup(typeof presentation.title === 'string' && presentation.title.length <= 300);
    requireBackup(typeof presentation.abstract === 'string' && presentation.abstract.length <= 5000);
    if (presentation.requested) {
      requireBackup(Boolean(presentation.title.trim() && presentation.abstract.trim()));
    }
    requireBackup(presentation.pdf === null || isRecord(presentation.pdf));

    if (presentation.pdf !== null) {
      const pdf = presentation.pdf;
      requireBackup(presentation.requested);
      requireBackup(pdfFilePath(pdf.id) !== null && !pdfIds.has(pdf.id));
      requireBackup(typeof pdf.name === 'string' && cleanPdfName(pdf.name) === pdf.name &&
        path.extname(pdf.name).toLowerCase() === '.pdf');
      requireBackup(pdf.type === undefined || pdf.type === 'application/pdf');
      requireBackup(Number.isInteger(pdf.size) && pdf.size > 0 && pdf.size <= MAX_PDF_SIZE);
      requireBackup(typeof pdf.updatedAt === 'string' && pdf.updatedAt);
      let buffer;
      try {
        buffer = decodePdfBase64(pdf.data, false);
      } catch (err) {
        if (err && err.message === 'invalid-pdf') throw new Error('invalid-backup');
        throw err;
      }
      requireBackup(buffer.length === pdf.size);
      pdfIds.add(pdf.id);
      pdfFiles.push({ id: pdf.id, buffer });
      restored.users[index].presentation.pdf = {
        id: pdf.id,
        name: pdf.name,
        size: pdf.size,
        updatedAt: pdf.updatedAt
      };
    }
  }

  return { state: restored, pdfFiles };
}

function cleanupDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch (err) {
    console.error('backup cleanup failed:', err.message);
  }
}

function restoreBackup(prepared) {
  const suffix = process.pid + '.' + crypto.randomUUID();
  const staging = STATE_DIR + '.staging-' + suffix;
  const previous = STATE_DIR + '.old-' + suffix;
  let stagingCreated = false;
  let previousMoved = false;
  let switched = false;

  try {
    fs.mkdirSync(path.dirname(STATE_DIR), { recursive: true });
    fs.mkdirSync(staging, { recursive: true });
    stagingCreated = true;
    fs.mkdirSync(path.join(staging, 'uploads'), { recursive: true });
    for (const pdf of prepared.pdfFiles) {
      fs.writeFileSync(path.join(staging, 'uploads', pdf.id + '.pdf'), pdf.buffer, { flag: 'wx' });
    }
    fs.writeFileSync(path.join(staging, 'state.json'), JSON.stringify(prepared.state), 'utf8');

    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      fs.renameSync(STATE_DIR, previous);
      previousMoved = true;
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }

    try {
      fs.renameSync(staging, STATE_DIR);
      switched = true;
    } catch (err) {
      if (previousMoved) {
        try {
          fs.renameSync(previous, STATE_DIR);
          previousMoved = false;
        } catch (rollbackError) {
          console.error('backup rollback failed:', rollbackError.message);
        }
      }
      throw err;
    }
  } catch (err) {
    if (!switched && stagingCreated) cleanupDirectory(staging);
    throw err;
  }

  state = prepared.state;
  cleanupDirectory(staging);
  if (previousMoved) cleanupDirectory(previous);
}

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }
  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }
  if (relative === '/' || relative === '') relative = '/index.html';
  const indexFile = path.join(PUBLIC_DIR, 'index.html');
  const resolved = path.normalize(path.join(PUBLIC_DIR, relative));
  if (resolved !== indexFile && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.stat(resolved, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(resolved).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

function contentPayload() {
  return {
    announcements: state.announcements,
    materials: state.materials,
    committees: state.committees,
    stats: {
      registrations: state.users.filter((u) => u.role !== 'admin').length,
      forum: state.forum.length,
      announcements: state.announcements.length,
      materials: state.materials.length
    }
  };
}

async function handleApi(req, res, pathname) {
  const method = req.method;
  const user = currentUser(req);

  /* --- public content --- */
  if (pathname === '/api/content' && method === 'GET') {
    return sendJson(res, 200, contentPayload());
  }

  if (pathname === '/api/forum' && method === 'GET') {
    return sendJson(res, 200, { messages: state.forum });
  }

  if (pathname === '/api/forum' && method === 'POST') {
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    const body = await readJson(req);
    const message = text(body.text, 2000);
    if (!message) return sendJson(res, 400, { error: 'empty-message' });
    const entry = {
      id: crypto.randomUUID(),
      userId: user.id,
      author: user.name,
      affiliation: user.affiliation || '',
      text: message,
      createdAt: new Date().toISOString()
    };
    state.forum.push(entry);
    if (state.forum.length > 500) state.forum.shift();
    persist();
    return sendJson(res, 201, { message: entry });
  }

  /* --- auth --- */
  if (pathname === '/api/register' && method === 'POST') {
    const body = await readJson(req, PDF_BODY_LIMIT);
    const name = text(body.name, 80);
    const email = text(body.email, 160).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!name || !email || password.length < 6) {
      return sendJson(res, 400, { error: 'invalid-fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'invalid-email' });
    }
    if (state.users.some((u) => u.email === email)) {
      return sendJson(res, 409, { error: 'email-exists' });
    }
    const presentation = presentationValues(body.presentation);
    if (presentation.requested && isRecord(body.presentation) && body.presentation.pdf != null) {
      presentation.pdf = savePdf(parsePdfUpload(body.presentation.pdf));
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const account = {
      id: crypto.randomUUID(),
      name,
      email,
      salt,
      passwordHash: hashPassword(password, salt),
      affiliation: text(body.affiliation, 160),
      position: text(body.position, 120),
      country: text(body.country, 80),
      notes: text(body.notes, 500),
      role: 'member',
      createdAt: new Date().toISOString(),
      presentation
    };
    state.users.push(account);
    persist();
    const token = createSession(account.id);
    return sendJson(res, 201, { token, user: publicUser(account) });
  }

  if (pathname === '/api/login' && method === 'POST') {
    const body = await readJson(req);
    const email = text(body.email, 160).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const account = state.users.find((u) => u.email === email);
    if (!account || !verifyPassword(password, account.salt, account.passwordHash)) {
      return sendJson(res, 401, { error: 'invalid-credentials' });
    }
    const token = createSession(account.id);
    return sendJson(res, 200, { token, user: publicUser(account) });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (match) sessions.delete(match[1]);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && method === 'GET') {
    return sendJson(res, 200, { user: user ? publicUser(user) : null });
  }

  if (pathname === '/api/me/presentation' && method === 'PUT') {
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    const body = await readJson(req, PDF_BODY_LIMIT);
    const source = isRecord(body.presentation) ? body.presentation : {};
    const next = presentationValues(source);
    const previousPdf = isRecord(user.presentation) && isRecord(user.presentation.pdf)
      ? user.presentation.pdf
      : null;
    let savedPdf = null;
    try {
      if (next.requested && source.pdf != null) savedPdf = savePdf(parsePdfUpload(source.pdf));
      if (savedPdf || body.removePdf === true || !next.requested) deletePdf(previousPdf);
    } catch (err) {
      if (savedPdf) {
        try {
          deletePdf(savedPdf);
        } catch {
          // Preserve the error that prevented the update.
        }
      }
      throw err;
    }
    next.pdf = savedPdf || (next.requested && body.removePdf !== true ? previousPdf : null);
    user.presentation = next;
    persist();
    return sendJson(res, 200, { user: publicUser(user) });
  }

  const registrationPdf = /^\/api\/registrations\/([\w-]+)\/pdf$/.exec(pathname);
  if (registrationPdf && method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    const account = state.users.find((item) => item.id === registrationPdf[1]);
    if (!account) return sendJson(res, 404, { error: 'not-found' });
    if (user.id !== account.id && user.role !== 'admin') {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    const pdf = isRecord(account.presentation) ? account.presentation.pdf : null;
    const file = isRecord(pdf) ? pdfFilePath(pdf.id) : null;
    if (!file) return sendJson(res, 404, { error: 'not-found' });
    let data;
    try {
      data = fs.readFileSync(file);
    } catch (err) {
      if (err && err.code === 'ENOENT') return sendJson(res, 404, { error: 'not-found' });
      throw err;
    }
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': data.length,
      'Content-Disposition': pdfContentDisposition(pdf.name),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
    return;
  }

  /* --- admin --- */
  if (pathname.startsWith('/api/admin/')) {
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'forbidden' });

    if (pathname === '/api/admin/backup' && method === 'GET') {
      return sendJson(res, 200, { backup: createBackup() });
    }

    if (pathname === '/api/admin/backup' && method === 'POST') {
      const body = await readJson(req, BACKUP_BODY_LIMIT);
      const prepared = validateBackup(body.backup);
      restoreBackup(prepared);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/registrations' && method === 'GET') {
      const registrations = state.users
        .filter((u) => u.role !== 'admin')
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(publicUser);
      return sendJson(res, 200, { registrations });
    }

    if (pathname === '/api/admin/announcements' && method === 'POST') {
      const body = await readJson(req);
      const title = tri(body.title, 200);
      const bodyText = tri(body.body, 2000);
      if (!title.zh && !title.en && !title.fr) {
        return sendJson(res, 400, { error: 'title-required' });
      }
      const entry = {
        id: crypto.randomUUID(),
        date: text(body.date, 10) || new Date().toISOString().slice(0, 10),
        tag: ['opening', 'notice', 'seminar'].includes(body.tag) ? body.tag : 'notice',
        title,
        body: bodyText,
        createdAt: new Date().toISOString()
      };
      state.announcements.push(entry);
      persist();
      return sendJson(res, 201, { announcement: entry });
    }

    if (pathname === '/api/admin/materials' && method === 'POST') {
      const body = await readJson(req);
      const title = tri(body.title, 200);
      if (!title.zh && !title.en && !title.fr) {
        return sendJson(res, 400, { error: 'title-required' });
      }
      const entry = {
        id: crypto.randomUUID(),
        type: ['slides', 'video', 'paper'].includes(body.type) ? body.type : 'slides',
        title,
        speaker: text(body.speaker, 120),
        date: text(body.date, 20),
        url: text(body.url, 500),
        createdAt: new Date().toISOString()
      };
      state.materials.push(entry);
      persist();
      return sendJson(res, 201, { material: entry });
    }

    if (pathname === '/api/admin/committees' && method === 'PUT') {
      const body = await readJson(req);
      const clean = (list) => {
        if (!Array.isArray(list)) return [];
        return list
          .map((item) => ({
            name: text(item && item.name, 120),
            affiliation: text(item && item.affiliation, 200)
          }))
          .filter((item) => item.name)
          .slice(0, 100);
      };
      const committees = body.committees || body;
      state.committees = {
        advisory: clean(committees.advisory),
        organizing: clean(committees.organizing),
        hosts: clean(committees.hosts)
      };
      persist();
      return sendJson(res, 200, { committees: state.committees });
    }

    const deleteAnnouncement = /^\/api\/admin\/announcements\/([\w-]+)$/.exec(pathname);
    if (deleteAnnouncement && method === 'DELETE') {
      const before = state.announcements.length;
      state.announcements = state.announcements.filter((a) => a.id !== deleteAnnouncement[1]);
      if (state.announcements.length === before) return sendJson(res, 404, { error: 'not-found' });
      persist();
      return sendJson(res, 200, { ok: true });
    }

    const deleteMaterial = /^\/api\/admin\/materials\/([\w-]+)$/.exec(pathname);
    if (deleteMaterial && method === 'DELETE') {
      const before = state.materials.length;
      state.materials = state.materials.filter((m) => m.id !== deleteMaterial[1]);
      if (state.materials.length === before) return sendJson(res, 404, { error: 'not-found' });
      persist();
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'not-found' });
  }

  return sendJson(res, 404, { error: 'not-found' });
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

loadState();

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    if (err && err.message === 'payload-too-large') {
      return sendJson(res, 413, { error: 'payload-too-large' });
    }
    if (err && err.message === 'invalid-json') {
      return sendJson(res, 400, { error: 'invalid-json' });
    }
    if (err && ['invalid-pdf', 'presentation-required', 'invalid-backup'].includes(err.message)) {
      return sendJson(res, 400, { error: err.message });
    }
    console.error('request failed:', err && err.stack ? err.stack : err);
    if (!res.headersSent) sendJson(res, 500, { error: 'server-error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`T. D. Lee Centennial site listening on http://${HOST}:${PORT}`);
});
