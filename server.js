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
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_DIR = path.join(process.env.TMPDIR || '/tmp', 'tdlee100-state');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
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
        date: '2026-11-24',
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
        date: '2026-12-12',
        tag: 'notice',
        title: {
          zh: '参会注册与报告征稿正式开放',
          en: 'Registration and Call for Contributions Now Open',
          fr: 'Ouverture des inscriptions et de l’appel à contributions'
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
        date: '2027-01-15',
        tag: 'seminar',
        title: {
          zh: '系列研讨会（一）：磁流体湍流的统计性质',
          en: 'Seminar I: Statistical Properties of Magnetohydrodynamic Turbulence',
          fr: 'Séminaire I : propriétés statistiques de la turbulence magnétohydrodynamique'
        },
        body: {
          zh: '本次研讨会聚焦磁流体湍流中的统计不变量、能谱与间歇性，并讨论李政道 1952 年工作在现代磁流体与天体物理湍流研究中的延续。报告材料将于会后在本站发布。',
          en: 'This seminar focuses on statistical invariants, energy spectra and intermittency in magnetohydrodynamic turbulence, and on how Lee’s 1952 work continues in modern MHD and astrophysical turbulence research. Slides and recordings will be posted here after the seminar.',
          fr: 'Ce séminaire porte sur les invariants statistiques, les spectres d’énergie et l’intermittence dans la turbulence magnétohydrodynamique, ainsi que sur la postérité de l’article de 1952 de Lee dans la recherche moderne en MHD et en turbulence astrophysique. Les supports seront publiés ici après le séminaire.'
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
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
    } catch (err) {
      console.error('state persist failed:', err.message);
    }
  }, 200);
  if (persistTimer.unref) persistTimer.unref();
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.announcements)) {
      throw new Error('invalid state');
    }
    state = parsed;
  } catch {
    state = seedState();
    persist();
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    affiliation: user.affiliation,
    position: user.position,
    country: user.country,
    role: user.role,
    createdAt: user.createdAt
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
    const body = await readJson(req);
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
      createdAt: new Date().toISOString()
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

  /* --- admin --- */
  if (pathname.startsWith('/api/admin/')) {
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'forbidden' });

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
    console.error('request failed:', err && err.stack ? err.stack : err);
    if (!res.headersSent) sendJson(res, 500, { error: 'server-error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`T. D. Lee Centennial site listening on http://${HOST}:${PORT}`);
});
