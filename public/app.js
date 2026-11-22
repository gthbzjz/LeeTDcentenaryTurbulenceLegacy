(function () {
  'use strict';

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const LANGS = [
    { code: 'zh', name: '中文', locale: 'zh-CN', dir: 'ltr' },
    { code: 'en', name: 'English', locale: 'en-GB', dir: 'ltr' },
    { code: 'fr', name: 'Français', locale: 'fr-FR', dir: 'ltr' },
    { code: 'ru', name: 'Русский', locale: 'ru-RU', dir: 'ltr' },
    { code: 'de', name: 'Deutsch', locale: 'de-DE', dir: 'ltr' },
    { code: 'it', name: 'Italiano', locale: 'it-IT', dir: 'ltr' },
    { code: 'es', name: 'Español', locale: 'es-ES', dir: 'ltr' },
    { code: 'ko', name: '한국어', locale: 'ko-KR', dir: 'ltr' },
    { code: 'ja', name: '日本語', locale: 'ja-JP', dir: 'ltr' },
    { code: 'ur', name: 'اردو', locale: 'ur-PK', dir: 'rtl' },
    { code: 'fa', name: 'فارسی', locale: 'fa-IR', dir: 'rtl' },
    { code: 'ar', name: 'العربية', locale: 'ar', dir: 'rtl' }
  ];

  const LANG_ALIASES = {
    zh: 'zh', zho: 'zh', chi: 'zh', chinese: 'zh', mandarin: 'zh', china: 'zh',
    '中文': 'zh', '汉语': 'zh', '漢語': 'zh', '普通话': 'zh', '简体中文': 'zh', '繁體中文': 'zh',
    en: 'en', eng: 'en', english: 'en', british: 'en', american: 'en',
    '英文': 'en', '英语': 'en', '英語': 'en',
    fr: 'fr', fra: 'fr', fre: 'fr', french: 'fr', francais: 'fr', france: 'fr',
    ru: 'ru', rus: 'ru', russian: 'ru', 'русский': 'ru', 'россия': 'ru',
    de: 'de', ger: 'de', deu: 'de', german: 'de', deutsch: 'de', deutschland: 'de',
    it: 'it', ita: 'it', italian: 'it', italiano: 'it', italia: 'it',
    es: 'es', spa: 'es', spanish: 'es', espanol: 'es', castellano: 'es', espana: 'es',
    ko: 'ko', kor: 'ko', korean: 'ko', '한국어': 'ko', '한국말': 'ko', '한국': 'ko',
    ja: 'ja', jpn: 'ja', japanese: 'ja', '日本語': 'ja', 'にほんご': 'ja', '日本': 'ja',
    ur: 'ur', urd: 'ur', urdu: 'ur', 'اردو': 'ur', pakistan: 'ur',
    fa: 'fa', per: 'fa', fas: 'fa', persian: 'fa', farsi: 'fa', 'فارسی': 'fa', 'پارسی': 'fa', iran: 'fa',
    ar: 'ar', ara: 'ar', arabic: 'ar', 'العربية': 'ar', 'عربي': 'ar', 'عربى': 'ar', arab: 'ar'
  };

  function normalizeLang(value) {
    return String(value || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function matchLang(value) {
    const raw = normalizeLang(value);
    if (!raw) return '';
    if (LANG_ALIASES[raw]) return LANG_ALIASES[raw];
    const base = raw.split(/[-_]/)[0];
    return LANG_ALIASES[base] || '';
  }

  function resolveLangInput(value) {
    const direct = matchLang(value);
    if (direct) return direct;
    const words = normalizeLang(value).split(/[\s,;()\/]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      if (LANG_ALIASES[words[i]]) return LANG_ALIASES[words[i]];
    }
    return '';
  }

  function detectLang() {
    const stored = localStorage.getItem('tdl_lang');
    if (stored && window.I18N[stored]) return stored;
    const prefs = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || ''];
    for (let i = 0; i < prefs.length; i++) {
      const code = matchLang(prefs[i]);
      if (code) return code;
    }
    return 'zh';
  }

  const state = {
    lang: detectLang(),
    token: localStorage.getItem('tdl_token') || '',
    user: null,
    content: null,
    forum: [],
    registrations: [],
    authTab: 'register',
    adminTab: 'announcements'
  };

  /* ---------------- i18n ---------------- */

  function langMeta(code) {
    return LANGS.filter((item) => item.code === code)[0] || LANGS[0];
  }

  function dict() {
    return window.I18N[state.lang] || window.I18N.en || window.I18N.zh;
  }

  function t(key) {
    const d = dict();
    if (d && d[key] != null) return d[key];
    if (window.I18N.en && window.I18N.en[key] != null) return window.I18N.en[key];
    if (window.I18N.zh && window.I18N.zh[key] != null) return window.I18N.zh[key];
    return key;
  }

  function locale() {
    return langMeta(state.lang).locale;
  }

  function pick(obj) {
    if (!obj) return '';
    return obj[state.lang] || obj.en || obj.zh || obj.fr || '';
  }

  function updateLangControls() {
    const meta = langMeta(state.lang);
    $$('[data-lang]').forEach((btn) => {
      const active = btn.dataset.lang === state.lang;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const current = $('#lang-current');
    if (current) current.textContent = meta.name;
    const footer = $('#footer-lang-select');
    if (footer) footer.value = state.lang;
  }

  function applyI18n() {
    const meta = langMeta(state.lang);
    document.documentElement.lang = meta.locale;
    document.documentElement.dir = meta.dir;
    $$('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const value = t(key);
      if (value !== key) el.textContent = value;
    });
    $$('[data-i18n-ph]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    document.title = t('meta.title');
    updateLangControls();
  }

  function closeLangMenu() {
    const menu = $('#lang-menu');
    const trigger = $('#lang-trigger');
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function setLang(lang) {
    if (!window.I18N[lang]) return false;
    state.lang = lang;
    try { localStorage.setItem('tdl_lang', lang); } catch (e) {}
    applyI18n();
    renderAll();
    closeLangMenu();
    return true;
  }

  /* ---------------- helpers ---------------- */

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.href);
      return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function parseDate(value) {
    if (!value) return null;
    if (/^\d{4}$/.test(String(value))) return new Date(Number(value), 0, 1);
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(value) {
    const d = parseDate(value);
    if (!d) return value || '';
    return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  }

  function formatDateTime(value) {
    const d = parseDate(value);
    if (!d) return value || '';
    return new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  }

  function errorMessage(code) {
    const key = 'error.' + code;
    if (dict()[key] != null || window.I18N.zh[key] != null) return t(key);
    return t('error.generic');
  }

  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    let response;
    try {
      response = await fetch(path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      const err = new Error('network');
      err.code = 'network';
      throw err;
    }
    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    if (!response.ok) {
      const err = new Error((data && data.error) || 'generic');
      err.status = response.status;
      err.code = data && data.error;
      throw err;
    }
    return data || {};
  }

  /* ---------------- rendering ---------------- */

  function renderStats() {
    const stats = (state.content && state.content.stats) || { registrations: 0, forum: 0 };
    const reg = Number(stats.registrations) || 0;
    const forum = Number(stats.forum) || 0;
    ['#stat-registrations', '#stat-registrations-2'].forEach((sel) => {
      const el = $(sel);
      if (el) el.textContent = String(reg);
    });
    const forumEl = $('#stat-forum');
    if (forumEl) forumEl.textContent = String(forum);
  }

  function renderAnnouncements() {
    const wrap = $('#announcement-list');
    if (!wrap) return;
    const items = (state.content && state.content.announcements) || [];
    if (!items.length) {
      wrap.innerHTML = '<p class="empty-state reveal">' + esc(t('program.empty')) + '</p>';
      observeReveals(wrap);
      return;
    }
    const sorted = items.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    wrap.innerHTML = sorted.map((item) => {
      const d = parseDate(item.date);
      const day = d ? String(d.getDate()).padStart(2, '0') : '—';
      const mon = d ? new Intl.DateTimeFormat(locale(), { month: 'short' }).format(d).toUpperCase() : '';
      const year = d ? d.getFullYear() : '';
      const rangeNote = item.dateLabel ? pick(item.dateLabel) : '';
      const title = pick(item.title);
      const body = pick(item.body);
      return (
        '<article class="timeline-item reveal">' +
          '<div class="timeline-date">' +
            '<span class="t-day">' + esc(day) + '</span>' +
            '<span class="t-mon">' + esc(mon) + '</span>' +
            '<span class="t-year">' + esc(year) + '</span>' +
            (rangeNote ? '<span class="t-note">' + esc(rangeNote) + '</span>' : '') +
          '</div>' +
          '<div class="timeline-body">' +
            '<span class="tag-pill tag-' + esc(item.tag) + '">' + esc(t('tag.' + item.tag)) + '</span>' +
            '<h3>' + esc(title) + '</h3>' +
            (body ? '<p>' + esc(body) + '</p>' : '') +
          '</div>' +
        '</article>'
      );
    }).join('');
    observeReveals(wrap);
  }

  function renderMaterials() {
    const wrap = $('#material-grid');
    if (!wrap) return;
    const items = (state.content && state.content.materials) || [];
    if (!items.length) {
      wrap.innerHTML = '<p class="empty-state reveal">' + esc(t('materials.empty')) + '</p>';
      observeReveals(wrap);
      return;
    }
    const labels = {
      slides: t('materials.typeSlides'),
      video: t('materials.typeVideo'),
      paper: t('materials.typePaper')
    };
    wrap.innerHTML = items.map((item) => {
      const url = safeUrl(item.url);
      const link = url
        ? '<a class="material-link" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(t('materials.open')) + ' <span aria-hidden="true">→</span></a>'
        : '<span class="material-link muted">' + esc(t('materials.soon')) + '</span>';
      return (
        '<article class="material-card reveal">' +
          '<div class="material-head">' +
            '<span class="type-badge type-' + esc(item.type) + '">' + esc(labels[item.type] || item.type) + '</span>' +
            '<span class="material-date">' + esc(item.date || '') + '</span>' +
          '</div>' +
          '<h3>' + esc(pick(item.title)) + '</h3>' +
          (item.speaker ? '<p class="material-speaker">' + esc(item.speaker) + '</p>' : '') +
          link +
        '</article>'
      );
    }).join('');
    observeReveals(wrap);
  }

  function renderCommittees() {
    const wrap = $('#committee-grid');
    if (!wrap) return;
    const data = (state.content && state.content.committees) || {};
    const groups = [
      { key: 'advisory', title: t('committees.advisory') },
      { key: 'organizing', title: t('committees.organizing') },
      { key: 'hosts', title: t('committees.hosts') }
    ];
    wrap.innerHTML = groups.map((group) => {
      const list = Array.isArray(data[group.key]) ? data[group.key] : [];
      let body;
      if (list.length) {
        body = '<ul class="committee-list">' + list.map((person) =>
          '<li><strong>' + esc(person.name) + '</strong>' +
          (person.affiliation ? '<span>' + esc(person.affiliation) + '</span>' : '') +
          '</li>'
        ).join('') + '</ul>';
      } else {
        body = '<div class="committee-empty">' +
          '<span class="pending-dot"></span>' +
          '<p>' + esc(t('committees.pending')) + '</p>' +
          '<small>' + esc(t('committees.pendingHint')) + '</small>' +
        '</div>';
      }
      return '<div class="committee-card reveal"><h3>' + esc(group.title) + '</h3>' + body + '</div>';
    }).join('');
    observeReveals(wrap);
  }

  function initials(name) {
    const value = String(name || '?').trim();
    if (!value) return '?';
    if (/[\u4e00-\u9fa5]/.test(value)) return value.slice(-1);
    return value.split(/\s+/).map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
  }

  function renderForum() {
    const list = $('#forum-list');
    if (list) {
      if (!state.forum.length) {
        list.innerHTML = '<p class="empty-state">' + esc(t('forum.empty')) + '</p>';
      } else {
        list.innerHTML = state.forum.map((message) =>
          '<article class="forum-message">' +
            '<div class="forum-avatar" aria-hidden="true">' + esc(initials(message.author)) + '</div>' +
            '<div class="forum-body">' +
              '<header>' +
                '<strong>' + esc(message.author) + '</strong>' +
                (message.affiliation ? '<span>' + esc(message.affiliation) + '</span>' : '') +
                '<time>' + esc(formatDateTime(message.createdAt)) + '</time>' +
              '</header>' +
              '<p>' + esc(message.text) + '</p>' +
            '</div>' +
          '</article>'
        ).join('');
      }
    }
    renderComposer();
  }

  function renderComposer() {
    const el = $('#forum-composer');
    if (!el) return;
    if (!state.user) {
      el.innerHTML = '<div class="composer-locked"><p>' + esc(t('forum.loginPrompt')) + '</p>' +
        '<a class="btn btn-gold btn-sm" href="#register">' + esc(t('forum.loginAction')) + '</a></div>';
      return;
    }
    el.innerHTML = '<form id="forum-form" class="forum-form">' +
      '<textarea name="text" rows="2" maxlength="2000" placeholder="' + esc(t('forum.placeholder')) + '"></textarea>' +
      '<button class="btn btn-gold" type="submit">' + esc(t('forum.post')) + '</button>' +
    '</form>';
    $('#forum-form').addEventListener('submit', onForumSubmit);
  }

  function renderAuth() {
    const loggedIn = !!state.user;
    const tabs = $('.auth-tabs');
    if (tabs) tabs.hidden = loggedIn;
    const registerForm = $('#register-form');
    const loginForm = $('#login-form');
    if (registerForm) registerForm.hidden = loggedIn || state.authTab !== 'register';
    if (loginForm) loginForm.hidden = loggedIn || state.authTab !== 'login';
    const panel = $('#account-panel');
    if (panel) panel.hidden = !loggedIn;

    if (loggedIn) {
      $('#account-name').textContent = state.user.name;
      const meta = [state.user.affiliation, state.user.position, state.user.country]
        .filter(Boolean).join(' · ') || state.user.email;
      $('#account-meta').textContent = meta;
      const isAdmin = state.user.role === 'admin';
      $('#account-admin').hidden = !isAdmin;
      $('#nav-admin').hidden = !isAdmin;
      $('#admin').hidden = !isAdmin;
      renderAdminAll();
    } else {
      $('#account-admin').hidden = true;
      $('#nav-admin').hidden = true;
      $('#admin').hidden = true;
    }

    $$('[data-auth-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.authTab === state.authTab);
    });
  }

  function renderAll() {
    renderStats();
    renderAnnouncements();
    renderMaterials();
    renderCommittees();
    renderForum();
    renderAuth();
  }

  /* ---------------- admin ---------------- */

  function renderAdminAll() {
    if (!state.user || state.user.role !== 'admin') return;
    renderAdminAnnouncements();
    renderAdminMaterials();
    renderCommitteeEditor();
    if (state.adminTab === 'registrations') renderRegistrations();
  }

  function adminItemRow(tagLabel, tagClass, title, meta, deleteAttr, id) {
    return '<div class="admin-item">' +
      '<div class="admin-item-main">' +
        '<span class="tag-pill ' + tagClass + '">' + esc(tagLabel) + '</span>' +
        '<strong>' + esc(title) + '</strong>' +
        (meta ? '<small>' + esc(meta) + '</small>' : '') +
      '</div>' +
      '<button type="button" class="mini-btn danger" ' + deleteAttr + '="' + esc(id) + '">' + esc(t('admin.delete')) + '</button>' +
    '</div>';
  }

  function renderAdminAnnouncements() {
    const wrap = $('#admin-announcement-list');
    if (!wrap) return;
    const items = (state.content && state.content.announcements) || [];
    if (!items.length) {
      wrap.innerHTML = '<p class="empty-state">' + esc(t('admin.empty')) + '</p>';
      return;
    }
    wrap.innerHTML = items.slice().reverse().map((item) =>
      adminItemRow(t('tag.' + item.tag), 'tag-' + item.tag, pick(item.title), formatDate(item.date), 'data-delete-announcement', item.id)
    ).join('');
  }

  function renderAdminMaterials() {
    const wrap = $('#admin-material-list');
    if (!wrap) return;
    const items = (state.content && state.content.materials) || [];
    if (!items.length) {
      wrap.innerHTML = '<p class="empty-state">' + esc(t('admin.empty')) + '</p>';
      return;
    }
    const labels = { slides: t('materials.typeSlides'), video: t('materials.typeVideo'), paper: t('materials.typePaper') };
    wrap.innerHTML = items.slice().reverse().map((item) =>
      adminItemRow(labels[item.type] || item.type, 'type-' + item.type, pick(item.title), item.speaker || item.date, 'data-delete-material', item.id)
    ).join('');
  }

  function renderCommitteeEditor() {
    const wrap = $('#admin-committee-editor');
    if (!wrap) return;
    const data = (state.content && state.content.committees) || {};
    const groups = [
      { key: 'advisory', title: t('committees.advisory') },
      { key: 'organizing', title: t('committees.organizing') },
      { key: 'hosts', title: t('committees.hosts') }
    ];
    wrap.innerHTML = groups.map((group) => {
      const list = Array.isArray(data[group.key]) ? data[group.key] : [];
      const rows = list.length
        ? list.map((person, index) =>
            '<div class="editor-row">' +
              '<span><strong>' + esc(person.name) + '</strong>' +
              (person.affiliation ? ' · ' + esc(person.affiliation) : '') + '</span>' +
              '<button type="button" class="mini-btn" data-remove-group="' + group.key + '" data-remove-index="' + index + '">' +
                esc(t('admin.remove')) +
              '</button>' +
            '</div>'
          ).join('')
        : '<p class="editor-empty">' + esc(t('admin.empty')) + '</p>';
      return '<div class="committee-editor-group">' +
        '<h4>' + esc(group.title) + '</h4>' +
        '<div class="editor-rows">' + rows + '</div>' +
        '<form class="editor-add" data-add-group="' + group.key + '">' +
          '<input name="name" type="text" maxlength="120" placeholder="' + esc(t('admin.namePlaceholder')) + '" required />' +
          '<input name="affiliation" type="text" maxlength="200" placeholder="' + esc(t('admin.affiliationPlaceholder')) + '" />' +
          '<button type="submit" class="btn btn-outline-dark btn-sm">' + esc(t('admin.add')) + '</button>' +
        '</form>' +
      '</div>';
    }).join('');
  }

  function renderRegistrations() {
    const body = $('#registrations-body');
    if (!body) return;
    if (!state.registrations.length) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">' + esc(t('admin.registeredEmpty')) + '</td></tr>';
      return;
    }
    body.innerHTML = state.registrations.map((user) =>
      '<tr>' +
        '<td>' + esc(user.name) + '</td>' +
        '<td>' + esc(user.email) + '</td>' +
        '<td>' + esc(user.affiliation || '—') + '</td>' +
        '<td>' + esc(user.position || '—') + '</td>' +
        '<td>' + esc(user.country || '—') + '</td>' +
        '<td>' + esc(formatDate(user.createdAt)) + '</td>' +
      '</tr>'
    ).join('');
  }

  function setAdminTab(tab) {
    state.adminTab = tab;
    $$('.admin-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.adminTab === tab));
    $$('[data-admin-panel]').forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== tab; });
    if (tab === 'registrations') loadRegistrations();
    else if (tab === 'committees') renderCommitteeEditor();
  }

  async function loadRegistrations() {
    try {
      const data = await api('/api/admin/registrations');
      state.registrations = data.registrations || [];
      renderRegistrations();
    } catch (err) {
      if (err.status === 401 || err.status === 403) toast(t('toast.adminRequired'));
    }
  }

  /* ---------------- auth actions ---------------- */

  function showFormError(el, err) {
    if (!el) return;
    el.textContent = err.code && err.code !== 'generic' ? errorMessage(err.code) : errorMessage('generic');
    el.hidden = false;
  }

  async function onRegister(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const errorEl = $('#register-error');
    if (errorEl) errorEl.hidden = true;
    const payload = {
      name: String(data.get('name') || '').trim(),
      email: String(data.get('email') || '').trim(),
      password: String(data.get('password') || ''),
      affiliation: String(data.get('affiliation') || '').trim(),
      position: String(data.get('position') || '').trim(),
      country: String(data.get('country') || '').trim(),
      notes: String(data.get('notes') || '').trim()
    };
    if (!payload.name || !payload.email || payload.password.length < 6) {
      showFormError(errorEl, { code: 'invalid-fields' });
      return;
    }
    try {
      const result = await api('/api/register', { method: 'POST', body: payload });
      state.token = result.token;
      state.user = result.user;
      localStorage.setItem('tdl_token', result.token);
      form.reset();
      toast(t('toast.registered'));
      renderAuth();
      renderComposer();
      await loadContent();
      await loadForum();
    } catch (err) {
      showFormError(errorEl, err);
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const errorEl = $('#login-error');
    if (errorEl) errorEl.hidden = true;
    try {
      const result = await api('/api/login', {
        method: 'POST',
        body: { email: String(data.get('email') || '').trim(), password: String(data.get('password') || '') }
      });
      state.token = result.token;
      state.user = result.user;
      localStorage.setItem('tdl_token', result.token);
      form.reset();
      toast(t('toast.loggedIn'));
      renderAuth();
      renderComposer();
      await loadContent();
      await loadForum();
    } catch (err) {
      showFormError(errorEl, err);
    }
  }

  async function onLogout() {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    state.token = '';
    state.user = null;
    state.registrations = [];
    localStorage.removeItem('tdl_token');
    toast(t('toast.loggedOut'));
    renderAuth();
    renderForum();
  }

  async function onForumSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const textarea = form.querySelector('textarea[name="text"]');
    const value = textarea ? textarea.value.trim() : '';
    if (!value) {
      toast(errorMessage('empty-message'));
      return;
    }
    try {
      const result = await api('/api/forum', { method: 'POST', body: { text: value } });
      state.forum.push(result.message);
      textarea.value = '';
      toast(t('toast.posted'));
      renderForum();
    } catch (err) {
      toast(err.status === 401 ? t('forum.loginPrompt') : errorMessage(err.code));
    }
  }

  /* ---------------- admin actions ---------------- */

  async function onAnnouncementSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      date: String(data.get('date') || ''),
      tag: String(data.get('tag') || 'notice'),
      title: {
        zh: String(data.get('title-zh') || '').trim(),
        en: String(data.get('title-en') || '').trim(),
        fr: String(data.get('title-fr') || '').trim()
      },
      body: {
        zh: String(data.get('body-zh') || '').trim(),
        en: String(data.get('body-en') || '').trim(),
        fr: String(data.get('body-fr') || '').trim()
      }
    };
    if (!payload.title.zh && !payload.title.en && !payload.title.fr) {
      toast(errorMessage('title-required'));
      return;
    }
    try {
      await api('/api/admin/announcements', { method: 'POST', body: payload });
      form.reset();
      toast(t('toast.announcementAdded'));
      await loadContent();
    } catch (err) {
      toast(err.status === 403 ? t('toast.adminRequired') : errorMessage(err.code));
    }
  }

  async function onMaterialSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      type: String(data.get('type') || 'slides'),
      speaker: String(data.get('speaker') || '').trim(),
      date: String(data.get('date') || '').trim(),
      url: String(data.get('url') || '').trim(),
      title: {
        zh: String(data.get('title-zh') || '').trim(),
        en: String(data.get('title-en') || '').trim(),
        fr: String(data.get('title-fr') || '').trim()
      }
    };
    if (!payload.title.zh && !payload.title.en && !payload.title.fr) {
      toast(errorMessage('title-required'));
      return;
    }
    try {
      await api('/api/admin/materials', { method: 'POST', body: payload });
      form.reset();
      toast(t('toast.materialAdded'));
      await loadContent();
    } catch (err) {
      toast(err.status === 403 ? t('toast.adminRequired') : errorMessage(err.code));
    }
  }

  async function deleteItem(path) {
    if (!window.confirm(t('admin.deleteConfirm'))) return;
    try {
      await api(path, { method: 'DELETE' });
      toast(t('toast.deleted'));
      await loadContent();
    } catch (err) {
      toast(errorMessage(err.code));
    }
  }

  async function saveCommittees(next) {
    try {
      const data = await api('/api/admin/committees', { method: 'PUT', body: { committees: next } });
      if (state.content) state.content.committees = data.committees;
      toast(t('toast.saved'));
      renderCommittees();
      renderCommitteeEditor();
    } catch (err) {
      toast(err.status === 403 ? t('toast.adminRequired') : errorMessage(err.code));
    }
  }

  function cloneCommittees() {
    const source = (state.content && state.content.committees) || {};
    return {
      advisory: (source.advisory || []).map((p) => ({ name: p.name, affiliation: p.affiliation })),
      organizing: (source.organizing || []).map((p) => ({ name: p.name, affiliation: p.affiliation })),
      hosts: (source.hosts || []).map((p) => ({ name: p.name, affiliation: p.affiliation }))
    };
  }

  /* ---------------- data loading ---------------- */

  async function loadContent() {
    try {
      const data = await api('/api/content');
      state.content = data;
      renderStats();
      renderAnnouncements();
      renderMaterials();
      renderCommittees();
      if (state.user && state.user.role === 'admin') renderAdminAll();
    } catch (err) {
      /* keep placeholders */
    }
  }

  async function loadForum() {
    try {
      const data = await api('/api/forum');
      state.forum = data.messages || [];
      renderForum();
    } catch (err) {
      /* ignore */
    }
  }

  async function restoreSession() {
    if (!state.token) return;
    try {
      const data = await api('/api/me');
      state.user = data.user || null;
      if (!state.user) {
        state.token = '';
        localStorage.removeItem('tdl_token');
      }
    } catch (err) {
      state.token = '';
      state.user = null;
      localStorage.removeItem('tdl_token');
    }
  }

  /* ---------------- reveal + nav ---------------- */

  let revealObserver = null;

  function observeReveals(root) {
    const container = root || document;
    const elements = $$('.reveal', container);
    if (!('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('visible'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    }
    elements.forEach((el) => {
      if (!el.classList.contains('visible')) revealObserver.observe(el);
    });
  }

  function initHeader() {
    const header = $('#site-header');
    const toggle = $('#menu-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const open = header.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    $$('#primary-nav a').forEach((link) => {
      link.addEventListener('click', () => {
        header.classList.remove('nav-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });
    });
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  /* ---------------- hero flow field ---------------- */

  function initFlow() {
    const canvas = $('#flow-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let particles = [];
    let raf = 0;
    let last = 0;
    let visible = true;

    function spawn() {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        age: 0,
        life: 240 + Math.random() * 520
      };
    }

    function seed() {
      const count = Math.max(50, Math.min(170, Math.round((width * height) / 17000)));
      particles = Array.from({ length: count }, spawn);
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (reduce) drawStill();
    }

    function drawStill() {
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 0.8;
      for (let j = 0; j < 70; j += 1) {
        const y0 = (j / 70) * height;
        ctx.strokeStyle = 'rgba(212, 182, 118, ' + (0.05 + 0.08 * Math.sin(j)).toFixed(3) + ')';
        ctx.beginPath();
        for (let x = 0; x <= width; x += 12) {
          const y = y0 + Math.sin(x * 0.006 + j) * 26 + Math.cos(x * 0.013 + j * 0.7) * 10;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function tick(time) {
      raf = 0;
      if (!visible) return;
      const dt = last ? Math.min(48, time - last) : 16;
      last = time;
      const phase = time * 0.00011;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const angle = Math.sin(p.y * 0.0055 + phase * 4) * 1.25 +
          Math.cos(p.x * 0.0038 - phase * 3) * 0.85 +
          phase * 2.6;
        const nx = p.x + Math.cos(angle) * 0.95 + 0.18;
        const ny = p.y + Math.sin(angle) * 0.95 + 0.06;
        const fade = Math.sin(Math.min(1, p.age / p.life) * Math.PI);
        ctx.strokeStyle = 'rgba(214, 184, 120, ' + (0.05 + 0.24 * fade).toFixed(3) + ')';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        p.age += dt;
        p.x = nx;
        p.y = ny;
        if (p.age > p.life || nx < -30 || nx > width + 30 || ny < -30 || ny > height + 30) {
          particles[i] = spawn();
        }
      }
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (reduce || raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    window.addEventListener('resize', resize);
    if (!reduce) {
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          visible = entries[0].isIntersecting;
          if (visible) start();
          else stop();
        }, { threshold: 0 });
        io.observe(canvas);
      } else {
        start();
      }
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else if (visible) start();
      });
    }
  }

  /* ---------------- bindings ---------------- */

  function bind() {
    const langTrigger = $('#lang-trigger');
    const langMenu = $('#lang-menu');
    if (langTrigger && langMenu) {
      langTrigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = langMenu.hidden;
        langMenu.hidden = !open;
        langTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', (event) => {
        if (!event.target.closest('#lang-picker')) closeLangMenu();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeLangMenu();
      });
    }

    $$('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });

    const footerLang = $('#footer-lang-select');
    if (footerLang) {
      footerLang.addEventListener('change', () => setLang(footerLang.value));
    }

    const langForm = $('#lang-custom-form');
    if (langForm) {
      langForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = $('#lang-custom-input');
        const code = resolveLangInput(input ? input.value : '');
        if (code) {
          setLang(code);
          if (input) input.value = '';
        } else {
          toast(t('lang.unsupported'));
        }
      });
    }

    $$('[data-auth-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.authTab = btn.dataset.authTab;
        renderAuth();
      });
    });

    $$('.admin-tab').forEach((btn) => {
      btn.addEventListener('click', () => setAdminTab(btn.dataset.adminTab));
    });

    const registerForm = $('#register-form');
    if (registerForm) registerForm.addEventListener('submit', onRegister);
    const loginForm = $('#login-form');
    if (loginForm) loginForm.addEventListener('submit', onLogin);
    const logoutBtn = $('#logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', onLogout);

    const announcementForm = $('#announcement-form');
    if (announcementForm) {
      const dateInput = announcementForm.querySelector('input[name="date"]');
      if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
      announcementForm.addEventListener('submit', onAnnouncementSubmit);
    }
    const materialForm = $('#material-form');
    if (materialForm) materialForm.addEventListener('submit', onMaterialSubmit);

    const annList = $('#admin-announcement-list');
    if (annList) {
      annList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-delete-announcement]');
        if (btn) deleteItem('/api/admin/announcements/' + btn.dataset.deleteAnnouncement);
      });
    }
    const matList = $('#admin-material-list');
    if (matList) {
      matList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-delete-material]');
        if (btn) deleteItem('/api/admin/materials/' + btn.dataset.deleteMaterial);
      });
    }

    const editor = $('#admin-committee-editor');
    if (editor) {
      editor.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-remove-group]');
        if (!btn) return;
        const group = btn.dataset.removeGroup;
        const index = Number(btn.dataset.removeIndex);
        const next = cloneCommittees();
        if (next[group]) next[group].splice(index, 1);
        saveCommittees(next);
      });
      editor.addEventListener('submit', (event) => {
        const form = event.target.closest('[data-add-group]');
        if (!form) return;
        event.preventDefault();
        const group = form.dataset.addGroup;
        const data = new FormData(form);
        const name = String(data.get('name') || '').trim();
        if (!name) return;
        const next = cloneCommittees();
        if (!next[group]) next[group] = [];
        next[group].push({ name, affiliation: String(data.get('affiliation') || '').trim() });
        saveCommittees(next);
      });
    }

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (link) {
        const targetId = link.getAttribute('href');
        if (targetId && targetId.length > 1) {
          const target = document.querySelector(targetId);
          if (target) {
            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', targetId);
          }
        }
      }
    });

    setInterval(() => {
      if (document.hidden) return;
      loadForum();
    }, 20000);
  }

  /* ---------------- init ---------------- */

  async function init() {
    applyI18n();
    bind();
    initHeader();
    initFlow();
    renderAll();
    observeReveals();

    await restoreSession();
    renderAuth();
    renderForum();
    await Promise.all([loadContent(), loadForum()]);
    observeReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
