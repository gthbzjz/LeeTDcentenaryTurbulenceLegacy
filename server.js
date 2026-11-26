'use strict';

/**
 * T. D. Lee Centennial — Turbulence Legacy Lecture Series
 * Dependency-free Node.js 20 server: static hosting + small JSON API.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildRegistrationsPdf } = require('./pdf-report');

const PORT = Number(process.env.PORT) || 8000;
const HOST = '0.0.0.0';
const APP_ROOT = __dirname;
const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const DATABASE_URL = process.env.DATABASE_URL || '';
const REQUIRE_DATABASE = process.env.REQUIRE_DATABASE === '1';
const STATE_LOCK_KEY = 1952100;
let pool = null;
let stateRevision = 0;

function findWritableStateDir() {
  const candidates = [
    path.join(APP_ROOT, '.data', 'state'),
    path.join(process.env.TMPDIR || '/tmp', 'tdlee100-state')
  ];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.probe-' + process.pid);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      console.log('[state] using directory:', dir);
      return dir;
    } catch (err) {
      console.warn('[state] cannot use', dir, ':', err.code || err.message);
    }
  }
  throw new Error('no writable directory found for state');
}

const STATE_DIR = findWritableStateDir();
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
        date: '2026-11-27',
        tag: 'opening',
        title: {
          zh: '开幕报告：量子电动力学、量子色动力学与李政道',
          en: 'Opening Lecture: QED, QCD and T. D. Lee'
        },
        body: {
          zh: '“李政道的湍流遗产——纪念李政道诞辰一百周年·湍流研究遗产系列学术报告会”，将继续于北京时间11月27日 09:00–10:00线上推进。\n\n详见“预告：开幕，讨论李政道湍流统计理论及其回响”：https://sccfis-leetdturbulencelegacy.traesite.cn/\n\nJohn V. Shebalin（乔治梅森大学）教授将带来开幕式报告，题目为：“量子电动力学、量子色动力学与李政道”。\n诚邀各位学者莅临交流。\n\n腾讯会议号：319-229-633',
          en: 'T.D. Lee’s Legacy in Turbulence — Centenary Symposium Series on Turbulence Research in Honor of Tsung-Dao Lee\nThe next online session will be held 09:00–10:00, Beijing Time, November 27.\n\nFor details, see the announcement: Opening Session: Discussion on T.D. Lee’s Statistical Theory of Turbulence and Its Aftermath\nhttps://sccfis-leetdturbulencelegacy.traesite.cn/\n\nProf. John V. Shebalin (George Mason University) will deliver the opening talk titled QED, QCD and T.D. Lee.\nAll scholars are warmly invited to join and exchange ideas.\n\nTencent Meeting ID: 319-229-633'
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
        tag: 'notice',
        title: {
          zh: '预告：开幕，讨论李政道湍流统计理论及展望其影响',
          en: 'Preview: Opening Session and Discussion of T. D. Lee’s Statistical Theory of Turbulence and Its Prospective Impact'
        },
        body: {
          zh: '由于“QED 与 QCD 湍流中的统计方法——李政道 1952 年遗产”报告者所在地的时间差和个人其他考虑，该报告推迟（暂定本周五早九点），但是我们还是决定在北京时间11月25日当日开幕（线上开始交流时间为20:30），由朱建州填补报告空缺：题目：湍流的“反者道之动”与“互补原理” 报告人：朱建州 单位：速诚基础与交叉科学研究中心（湖南宁乡/江苏南京） 摘要：李政道本人发表此系列学术报告纪念活动所围绕的的文章时，非常清楚他所获得的截断保守系统的能量均分“不是湍流”，甚至“天差地别”，但还是独具慧眼地建立了与耗散湍流之间的一些联系。这一思想技术后来被多次发展和发扬以获得湍流基础性洞见（其中部分甚至获得理论物理狄拉克奖和等离子体物理麦克斯韦奖与阿尔芬奖这些不同专业的学术承认），并还在生生不息。我将以表面上否定李政道的方式来向其致敬：他所获得的欧拉方程伽辽金截断系统能量均分场其实也是“湍流”，只不过是“非线性色散湍流”，而非耗散性湍流。更具体地说，伽辽金截断操作其实由一个非线性色散项描述，类似于传统线性色散模型（比如，Korteweg-de Vries方程），伽辽金非线性色散项与原完整对流项会达成某种平衡或协作以产生和维持特定场结构。而传统湍流耗散（如纳维-斯托克斯方程中的粘性阻尼）导致的有效截断不可避免地产生部分非线性色散，这就构成了湍流（间歇性）结构的基础，甚至一般“耗散结构”的不同视角：毁灭性耗散通过其所致色散而创生结构，这真是“反者道之动”，也让人想起波尔的“互补原理”！这些哲学式的见解可以通过解析计算截断系统所支持的非线性行波和多频率（准）周期解，以及数值观察其受（微）扰演化，而得到技术性的论证：我将给出一些经典和量子系统的具体实例，来说明这条路径的颠覆性创新篇章可能才刚刚开始。',
          en: 'Because of the time difference at the speaker’s location and other personal considerations, the lecture “Statistical Methods in QED and QCD Turbulence: The Legacy of T. D. Lee’s 1952 Paper” has been postponed (provisionally to 09:00 this Friday). Nevertheless, the opening session will proceed online on November 25, Beijing Time, with discussion beginning at 20:30. Jian-Zhou Zhu will fill the vacant lecture slot. Title: Turbulence, “Reversal Is the Movement of the Dao,” and “Complementarity.” Speaker: Jian-Zhou Zhu. Affiliation: Sincere Center for Fundamental and Interdisciplinary Sciences (Ningxiang, Hunan / Nanjing, Jiangsu). Abstract: When T. D. Lee published the article around which this centenary lecture series is organized, he knew very well that the energy equipartition he obtained for the truncated conservative system was “not turbulence,” and was even “utterly different.” Yet he had the insight to establish connections with dissipative turbulence. This idea and technique were subsequently developed and extended many times, yielding fundamental insights into turbulence—some recognized by major distinctions in theoretical physics and plasma physics, including the Dirac, Maxwell and Alfvén honors—and the line of inquiry remains active. I will pay tribute to Lee by appearing to negate his conclusion: the equipartitioned energy field of his Galerkin-truncated Euler system is also “turbulence,” but “nonlinear dispersive turbulence,” rather than dissipative turbulence. More specifically, Galerkin truncation can be described by a nonlinear dispersive term analogous to those in classical linear dispersive models such as the Korteweg–de Vries equation. This nonlinear dispersive term balances or cooperates with the original full convection term to generate and maintain particular field structures. Effective truncation caused by conventional turbulent dissipation, such as viscous damping in the Navier–Stokes equations, inevitably produces some nonlinear dispersion, forming a basis for intermittent turbulent structures. It also offers a perspective on dissipative structures in general: destructive dissipation creates structures through the dispersion it induces. This is truly “reversal is the movement of the Dao,” and recalls Bohr’s “complementarity.” These philosophical insights can be supported technically by analytically computing nonlinear traveling waves and multifrequency quasiperiodic solutions of the truncated system, and by numerically observing their evolution under small perturbations. I will present concrete classical and quantum examples to show that a path of transformative innovation along these lines may only just be beginning.'
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

async function persist() {
  if (!pool) {
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
      throw err;
    }
    return;
  }

  try {
    const snapshot = createBackup().state;
    const result = await pool.query(
      `INSERT INTO tdlee100_state (id, revision, state, updated_at)
       VALUES (1, 1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
       SET revision = tdlee100_state.revision + 1,
           state = EXCLUDED.state,
           updated_at = NOW()
       RETURNING revision`,
      [JSON.stringify(snapshot)]
    );
    stateRevision = Number(result.rows[0].revision);
  } catch (err) {
    stateRevision = 0;
    throw err;
  }
}

async function initDatabase() {
  if (REQUIRE_DATABASE && !DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!DATABASE_URL) return;
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  await pool.query(
    `CREATE TABLE IF NOT EXISTS tdlee100_state (
       id SMALLINT PRIMARY KEY,
       revision BIGINT NOT NULL,
       state JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS tdlee100_sessions (
       token TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       expires_at BIGINT NOT NULL
     )`
  );
  console.log('[state] using PostgreSQL durable storage');
}

async function refreshState(force = false, client = null) {
  if (!pool) return false;
  const db = client || pool;
  const current = await db.query('SELECT revision FROM tdlee100_state WHERE id = 1');
  if (!current.rows.length) return false;
  if (!force && Number(current.rows[0].revision) <= stateRevision) return true;

  const result = await db.query('SELECT revision, state FROM tdlee100_state WHERE id = 1');
  if (!result.rows.length) return false;
  const row = result.rows[0];
  const prepared = validateBackup({
    format: 'tdlee100-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    state: row.state
  });
  restoreBackup(prepared);
  stateRevision = Number(row.revision);
  return true;
}

async function beginStateRequest(req) {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(CAST($1 AS bigint))', [STATE_LOCK_KEY]);
    req.stateLockClient = client;
  } catch (err) {
    client.release();
    throw err;
  }
  await refreshState(false, client);
}

async function endStateRequest(req) {
  const client = req.stateLockClient;
  if (!client) return;
  req.stateLockClient = null;
  try {
    await client.query('SELECT pg_advisory_unlock(CAST($1 AS bigint))', [STATE_LOCK_KEY]);
  } finally {
    client.release();
  }
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

async function loadState() {
  await initDatabase();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(CAST($1 AS bigint))', [STATE_LOCK_KEY]);
      if (await refreshState(true, client)) return;
      state = seedState();
      await persist();
      return;
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock(CAST($1 AS bigint))', [STATE_LOCK_KEY]);
      } finally {
        client.release();
      }
    }
  }

  let raw;
  try {
    raw = fs.readFileSync(STATE_FILE, 'utf8');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
    state = seedState();
    await persist();
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

  if (migrated) await persist();
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

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const exp = Date.now() + SESSION_TTL;
  if (pool) {
    await pool.query(
      'INSERT INTO tdlee100_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, userId, exp]
    );
  } else {
    sessions.set(token, { userId, exp });
  }
  return token;
}

async function destroySession(token) {
  if (pool) {
    await pool.query('DELETE FROM tdlee100_sessions WHERE token = $1', [token]);
  } else {
    sessions.delete(token);
  }
}

async function currentUser(req) {
  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  let record;
  if (pool) {
    const result = await pool.query(
      'SELECT user_id, expires_at FROM tdlee100_sessions WHERE token = $1',
      [match[1]]
    );
    if (result.rows.length) {
      record = { userId: result.rows[0].user_id, exp: Number(result.rows[0].expires_at) };
    }
  } else {
    record = sessions.get(match[1]);
  }
  if (!record) return null;
  if (record.exp < Date.now()) {
    await destroySession(match[1]);
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
  const user = await currentUser(req);

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
    await persist();
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
    await persist();
    const token = await createSession(account.id);
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
    const token = await createSession(account.id);
    return sendJson(res, 200, { token, user: publicUser(account) });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (match) await destroySession(match[1]);
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
    await persist();
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

    if (pathname === '/api/admin/registrations.pdf' && method === 'GET') {
      const registrations = state.users
        .filter((u) => u.role !== 'admin')
        .slice()
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map(publicUser);
      const pdf = buildRegistrationsPdf(registrations);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': 'attachment; filename="registrations-' +
          new Date().toISOString().slice(0, 10) + '.pdf"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(pdf);
      return;
    }

    if (pathname === '/api/admin/backup' && method === 'POST') {
      const body = await readJson(req, BACKUP_BODY_LIMIT);
      const prepared = validateBackup(body.backup);
      restoreBackup(prepared);
      await persist();
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
      await persist();
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
      await persist();
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
      await persist();
      return sendJson(res, 200, { committees: state.committees });
    }

    const deleteAnnouncement = /^\/api\/admin\/announcements\/([\w-]+)$/.exec(pathname);
    if (deleteAnnouncement && method === 'DELETE') {
      const before = state.announcements.length;
      state.announcements = state.announcements.filter((a) => a.id !== deleteAnnouncement[1]);
      if (state.announcements.length === before) return sendJson(res, 404, { error: 'not-found' });
      await persist();
      return sendJson(res, 200, { ok: true });
    }

    const deleteMaterial = /^\/api\/admin\/materials\/([\w-]+)$/.exec(pathname);
    if (deleteMaterial && method === 'DELETE') {
      const before = state.materials.length;
      state.materials = state.materials.filter((m) => m.id !== deleteMaterial[1]);
      if (state.materials.length === before) return sendJson(res, 404, { error: 'not-found' });
      await persist();
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'not-found' });
  }

  return sendJson(res, 404, { error: 'not-found' });
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

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
      await beginStateRequest(req);
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
  } finally {
    try {
      await endStateRequest(req);
    } catch (err) {
      console.error('state lock release failed:', err && err.message ? err.message : err);
    }
  }
});

async function start() {
  await loadState();
  server.listen(PORT, HOST, () => {
    console.log(`T. D. Lee Centennial site listening on http://${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error('startup failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
