/* =========================================================
   CV Builder — script.js
   JavaScript puro, sem dependências. Os dados ficam só no navegador.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Constantes ---------- */
  const STORAGE_KEY = 'cvbuilder:v1';
  const PREF_KEY = 'cvbuilder:autosave';
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const LEVELS = ['Nativo', 'Fluente', 'Avançado', 'Intermediário', 'Básico'];
  const SECTIONS = [
    { key: 'summary', label: 'Perfil' },
    { key: 'experience', label: 'Experiência' },
    { key: 'education', label: 'Educação' },
    { key: 'skills', label: 'Skills' },
    { key: 'languages', label: 'Idiomas' },
    { key: 'projects', label: 'Projetos' },
  ];
  const ITEM_LABEL = { experience: 'Experiência', education: 'Formação', languages: 'Idioma', projects: 'Projeto' };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Geometria da página A4 (mm) — deve casar com o CSS (.cv-margin = 14mm)
  const PAGE_MARGIN_MM = 14;
  const PAGE_USABLE_MM = 297 - PAGE_MARGIN_MM * 2;

  /* ---------- Utilitários ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clean = (s) => (typeof s === 'string' ? s.trim() : '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { localStorage.setItem(key, value); }, // pode lançar erro: quem chama trata
    remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
  };

  /* ---------- Estado ---------- */
  const newItem = {
    experience: () => ({ id: uid(), role: '', company: '', location: '', start: '', end: '', current: false, description: '' }),
    education: () => ({ id: uid(), course: '', institution: '', location: '', start: '', end: '', description: '' }),
    languages: () => ({ id: uid(), name: '', level: 'Fluente' }),
    projects: () => ({ id: uid(), name: '', description: '', link: '' }),
  };

  const defaultState = (template = 'minimal') => ({
    template,
    sections: { summary: true, experience: true, education: true, skills: true, languages: true, projects: true },
    personal: { name: '', title: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '', photo: '' },
    summary: '',
    experience: [newItem.experience()],
    education: [newItem.education()],
    skills: [],
    languages: [],
    projects: [],
  });

  // Aceita apenas o formato esperado; ignora o resto (dados antigos ou corrompidos)
  function sanitize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const str = (v) => (typeof v === 'string' ? v : '');

    base.template = raw.template === 'executive' ? 'executive' : 'minimal';
    SECTIONS.forEach(({ key }) => {
      if (raw.sections && typeof raw.sections[key] === 'boolean') base.sections[key] = raw.sections[key];
    });
    Object.keys(base.personal).forEach((k) => { base.personal[k] = str(raw.personal && raw.personal[k]); });
    base.summary = str(raw.summary);

    const list = (arr, factory) => {
      if (!Array.isArray(arr)) return null;
      return arr.map((o) => {
        const it = factory();
        Object.keys(it).forEach((k) => {
          if (k === 'id') return;
          if (typeof it[k] === 'boolean') it[k] = !!(o && o[k]);
          else if (o && typeof o[k] === 'string') it[k] = o[k];
        });
        return it;
      });
    };
    ['experience', 'education', 'languages', 'projects'].forEach((name) => {
      const l = list(raw[name], newItem[name]);
      if (l) base[name] = l;
    });
    if (Array.isArray(raw.skills)) {
      base.skills = raw.skills
        .filter((s) => s && typeof s.name === 'string' && s.name.trim())
        .map((s) => ({ id: uid(), name: s.name.trim() }));
    }
    return base;
  }

  function loadState() {
    const raw = store.get(STORAGE_KEY);
    if (!raw) return { s: defaultState(), restored: false };
    try { return { s: sanitize(JSON.parse(raw)), restored: true }; }
    catch { return { s: defaultState(), restored: false }; }
  }

  let autosave = store.get(PREF_KEY) !== 'off';
  const loaded = loadState();
  let state = loaded.s;

  /* ---------- Referências ---------- */
  const editor = $('#editor');
  const sheet = $('#sheet');
  const scaler = $('#scaler');
  const stage = $('#stage');
  const cvContent = $('#cvContent');
  const guides = $('#pageGuides');
  const pageCount = $('#pageCount');

  /* ---------- Feedback: toast e status ---------- */
  let toastTimer;
  function toast(msg, kind = 'info') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind === 'error' ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 4200 : 2400);
  }

  function setStatus(kind) {
    const el = $('#saveStatus');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const text = {
      idle: 'Salvamento automático ativo',
      saving: 'Salvando…',
      saved: `Salvo às ${time}`,
      off: 'Salvamento desligado',
      error: 'Não foi possível salvar',
    }[kind];
    el.dataset.state = kind;
    el.textContent = text;
  }

  /* ---------- Confirmação (antes de apagar) ---------- */
  function confirmDialog({ title, text, confirmLabel }) {
    return new Promise((resolve) => {
      const dlg = $('#dlg');
      if (typeof dlg.showModal !== 'function') { resolve(window.confirm(`${title}\n\n${text}`)); return; }
      $('#dlgTitle').textContent = title;
      $('#dlgText').textContent = text;
      $('#dlgOk').textContent = confirmLabel;
      dlg.returnValue = '';
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }
  $('#dlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close('cancel'); });

  /* ---------- Armazenamento ---------- */
  let saveTimer;
  let storageErrorShown = false;

  function scheduleSave() {
    if (!autosave) return;
    setStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 450);
  }

  function saveNow() {
    try {
      store.set(STORAGE_KEY, JSON.stringify(state));
      setStatus('saved');
      return true;
    } catch {
      setStatus('error');
      if (!storageErrorShown) {
        storageErrorShown = true;
        toast('Não foi possível salvar. O armazenamento do navegador está cheio ou bloqueado.', 'error');
      }
      return false;
    }
  }

  /* ---------- Erros de campo ---------- */
  function setFieldError(el, msg) {
    const host = el.closest('.field, .err-host');
    if (!host) return;
    let err = host.querySelector(':scope > .field-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-error';
      err.setAttribute('role', 'alert');
      host.appendChild(err);
    }
    err.textContent = msg;
    el.setAttribute('aria-invalid', 'true');
  }
  function clearFieldError(el) {
    const host = el.closest('.field, .err-host');
    const err = host && host.querySelector(':scope > .field-error');
    if (err) err.remove();
    el.removeAttribute('aria-invalid');
  }
  function validateEmail(el) {
    const v = el.value.trim();
    if (v && !EMAIL_RE.test(v)) setFieldError(el, 'Digite um email válido, como nome@exemplo.com.');
    else clearFieldError(el);
  }
  function validateDates(card, item) {
    const endInput = $('[data-field="end"]', card);
    const errEl = $('.card-error', card);
    const invalid = !!(item.start && item.end && !item.current && item.end < item.start);
    errEl.textContent = invalid ? 'A data de término precisa ser posterior à data de início.' : '';
    errEl.hidden = !invalid;
    if (endInput) { if (invalid) endInput.setAttribute('aria-invalid', 'true'); else endInput.removeAttribute('aria-invalid'); }
  }

  /* ---------- Binding (campos estáticos) ---------- */
  const getPath = (path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), state);
  function setPath(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], state)[last] = value;
  }

  /* ---------- Editor: HTML dos itens ---------- */
  function fieldHTML({ id, label, field, value, type = 'text', placeholder = '', full = false, disabled = false, cls = '' }) {
    const fid = `f-${id}-${field}`;
    return `<div class="field${full ? ' full' : ''}">
      <label for="${fid}">${label}</label>
      <input id="${fid}" class="${cls}" type="${type}" data-field="${field}" value="${esc(value)}" placeholder="${esc(placeholder)}"${disabled ? ' disabled' : ''} autocomplete="off">
    </div>`;
  }
  function areaHTML({ id, label, field, value, placeholder = '', hint = '' }) {
    const fid = `f-${id}-${field}`;
    return `<div class="field full">
      <label for="${fid}">${label}</label>
      <textarea id="${fid}" rows="4" data-field="${field}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
      ${hint ? `<p class="hint">${hint}</p>` : ''}
    </div>`;
  }
  const BULLET_HINT = 'Comece linhas com “-” para criar marcadores.';

  function cardShell(list, it, i, inner) {
    const label = `${ITEM_LABEL[list]} ${i + 1}`;
    return `<div class="card" data-list="${list}" data-id="${it.id}">
      <div class="card-head">
        <span class="card-title">${label}</span>
        <button type="button" class="link-btn" data-action="remove-item" aria-label="Remover ${label.toLowerCase()}">Remover</button>
      </div>
      <div class="grid">${inner}</div>
    </div>`;
  }

  const itemHTML = {
    experience: (it, i) => cardShell('experience', it, i, `
      ${fieldHTML({ id: it.id, label: 'Cargo', field: 'role', value: it.role, placeholder: 'Ex.: Desenvolvedor Web' })}
      ${fieldHTML({ id: it.id, label: 'Empresa', field: 'company', value: it.company, placeholder: 'Ex.: Acme Lda.' })}
      ${fieldHTML({ id: it.id, label: 'Localização', field: 'location', value: it.location, placeholder: 'Ex.: Maputo', full: true })}
      ${fieldHTML({ id: it.id, label: 'Data de início', field: 'start', value: it.start, type: 'month', placeholder: 'AAAA-MM' })}
      ${fieldHTML({ id: it.id, label: 'Data de término', field: 'end', value: it.end, type: 'month', placeholder: 'AAAA-MM', disabled: it.current })}
      <label class="check full" style="grid-column:1/-1">
        <input type="checkbox" data-field="current"${it.current ? ' checked' : ''}> Atual — ainda trabalho aqui
      </label>
      <p class="field-error card-error" role="alert" hidden></p>
      ${areaHTML({ id: it.id, label: 'Descrição', field: 'description', value: it.description, placeholder: '- Liderei a migração do sistema de vendas\n- Reduzi o tempo de carregamento em 40%', hint: BULLET_HINT })}
    `),
    education: (it, i) => cardShell('education', it, i, `
      ${fieldHTML({ id: it.id, label: 'Curso', field: 'course', value: it.course, placeholder: 'Ex.: Licenciatura em Informática' })}
      ${fieldHTML({ id: it.id, label: 'Instituição', field: 'institution', value: it.institution, placeholder: 'Ex.: Universidade Eduardo Mondlane' })}
      ${fieldHTML({ id: it.id, label: 'Localização', field: 'location', value: it.location, placeholder: 'Ex.: Maputo', full: true })}
      ${fieldHTML({ id: it.id, label: 'Data de início', field: 'start', value: it.start, type: 'month', placeholder: 'AAAA-MM' })}
      ${fieldHTML({ id: it.id, label: 'Data de término', field: 'end', value: it.end, type: 'month', placeholder: 'AAAA-MM' })}
      <p class="field-error card-error" role="alert" hidden></p>
      ${areaHTML({ id: it.id, label: 'Descrição (opcional)', field: 'description', value: it.description, hint: BULLET_HINT })}
    `),
    languages: (it, i) => cardShell('languages', it, i, `
      ${fieldHTML({ id: it.id, label: 'Idioma', field: 'name', value: it.name, placeholder: 'Ex.: Inglês' })}
      <div class="field">
        <label for="f-${it.id}-level">Nível</label>
        <select id="f-${it.id}-level" data-field="level">
          ${LEVELS.map((l) => `<option${l === it.level ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    `),
    projects: (it, i) => cardShell('projects', it, i, `
      ${fieldHTML({ id: it.id, label: 'Nome do projeto', field: 'name', value: it.name, placeholder: 'Ex.: Loja online' })}
      ${fieldHTML({ id: it.id, label: 'Link', field: 'link', value: it.link, placeholder: 'meuprojeto.com' })}
      ${areaHTML({ id: it.id, label: 'Descrição', field: 'description', value: it.description, hint: BULLET_HINT })}
    `),
  };

  const EMPTY_TEXT = {
    experience: 'Nenhuma experiência adicionada.',
    education: 'Nenhuma formação adicionada.',
    languages: 'Nenhum idioma adicionado.',
    projects: 'Nenhum projeto adicionado.',
  };

  function renderList(name) {
    const box = $(`#list-${name}`);
    if (name === 'skills') {
      box.innerHTML = state.skills.length
        ? state.skills.map((s) => `<li class="skill-item"><span>${esc(s.name)}</span><button type="button" data-action="remove-skill" data-id="${s.id}" aria-label="Remover ${esc(s.name)}">×</button></li>`).join('')
        : '<li class="empty">Nenhuma skill adicionada.</li>';
      return;
    }
    box.innerHTML = state[name].length
      ? state[name].map((it, i) => itemHTML[name](it, i)).join('')
      : `<p class="empty">${EMPTY_TEXT[name]}</p>`;
  }

  /* ---------- Editor: seções, foto, modelo ---------- */
  function buildSectionBar() {
    $('#sectionBar').innerHTML = SECTIONS.map(({ key, label }) =>
      `<button type="button" class="chip" data-action="toggle-section" data-key="${key}" aria-pressed="true">${label}</button>`).join('');
  }
  function syncSections() {
    SECTIONS.forEach(({ key }) => {
      const on = state.sections[key];
      const chip = $(`.chip[data-key="${key}"]`);
      if (chip) chip.setAttribute('aria-pressed', String(on));
      const panel = $(`[data-section="${key}"]`);
      if (panel) panel.hidden = !on;
    });
  }
  function setSection(key, on) {
    state.sections[key] = on;
    syncSections();
    const label = SECTIONS.find((s) => s.key === key).label;
    if (on) {
      const panel = $(`[data-section="${key}"]`);
      panel.classList.remove('enter');
      void panel.offsetWidth; // reinicia a animação
      panel.classList.add('enter');
      toast(`Seção “${label}” adicionada`);
    } else {
      toast(`Seção “${label}” removida`);
    }
    changed();
  }

  function renderPhotoControl() {
    const photo = state.personal.photo;
    $('#photoThumb').style.backgroundImage = photo ? `url("${photo}")` : '';
    $('#photoBtn').textContent = photo ? 'Trocar foto' : 'Enviar foto';
    $('#photoRemove').hidden = !photo;
  }

  function syncTemplate() {
    $$('[data-action="set-template"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.template === state.template)));
  }

  // Redimensiona a foto para poupar espaço no localStorage
  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r);
        c.height = Math.round(img.height * r);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
      img.src = url;
    });
  }

  /* ---------- Preview: formatação ---------- */
  function fmtMonth(v) {
    const m = /^(\d{4})-(\d{2})$/.exec(v || '');
    return m && MONTHS[+m[2] - 1] ? `${MONTHS[+m[2] - 1]} ${m[1]}` : '';
  }
  function dateRange(it) {
    const s = fmtMonth(it.start);
    const e = it.current ? 'Presente' : fmtMonth(it.end);
    return s && e ? `${s} – ${e}` : s || e || '';
  }
  const toHref = (v) => { v = clean(v); return !v ? '' : /^https?:\/\//i.test(v) ? v : `https://${v}`; };
  const displayUrl = (v) => clean(v).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  function socialUrl(v, base) {
    v = clean(v).replace(/^@/, '');
    if (!v) return '';
    return /[./]/.test(v) ? v : base + v; // aceita só o usuário (ex.: "maria")
  }
  const linkHTML = (v) => `<a href="${esc(toHref(v))}">${esc(displayUrl(v))}</a>`;

  // Linhas iniciadas por "-", "•" ou "*" viram marcadores
  function rich(text) {
    let html = '';
    let bullets = [];
    let para = [];
    const flushBullets = () => { if (bullets.length) { html += `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`; bullets = []; } };
    const flushPara = () => { if (para.length) { html += `<p>${para.map(esc).join('<br>')}</p>`; para = []; } };
    (text || '').split(/\r?\n/).forEach((line) => {
      const m = /^\s*[-•*–]\s+(.*)$/.exec(line);
      if (m) { flushPara(); bullets.push(m[1]); }
      else if (!line.trim()) { flushBullets(); flushPara(); }
      else { flushBullets(); para.push(line.trim()); }
    });
    flushBullets(); flushPara();
    return html;
  }

  const sectionHTML = (title, body, key) =>
    `<section class="cv-sec cv-sec-${key}"><h2>${title}</h2><div class="cv-sec-body">${body}</div></section>`;

  function itemBlock({ title, sub, date, desc }) {
    return `<article class="cv-item">
      <div class="cv-item-head">
        <div>${title ? `<h3>${esc(title)}</h3>` : ''}${sub ? `<p class="cv-org">${esc(sub)}</p>` : ''}</div>
        ${date ? `<span class="cv-date">${esc(date)}</span>` : ''}
      </div>
      ${clean(desc) ? `<div class="rich">${rich(desc)}</div>` : ''}
    </article>`;
  }

  function buildCV(s) {
    const p = s.personal;
    const name = clean(p.name);
    const title = clean(p.title);

    /* Cabeçalho */
    const contacts = [];
    if (clean(p.email)) contacts.push(`<a href="mailto:${esc(clean(p.email))}">${esc(clean(p.email))}</a>`);
    if (clean(p.phone)) contacts.push(`<span>${esc(clean(p.phone))}</span>`);
    if (clean(p.location)) contacts.push(`<span>${esc(clean(p.location))}</span>`);
    if (clean(p.website)) contacts.push(linkHTML(p.website));
    const linkedin = socialUrl(p.linkedin, 'linkedin.com/in/');
    const github = socialUrl(p.github, 'github.com/');
    if (linkedin) contacts.push(linkHTML(linkedin));
    if (github) contacts.push(linkHTML(github));

    const head = `<header class="cv-head">
      <div class="cv-id">
        <h1 class="cv-name">${name ? esc(name) : '<span class="ph">Seu nome completo</span>'}</h1>
        <p class="cv-role">${title ? esc(title) : '<span class="ph">Cargo ou profissão</span>'}</p>
      </div>
      ${p.photo ? `<img class="cv-photo" src="${esc(p.photo)}" alt="Foto de ${esc(name)}">` : ''}
      ${contacts.length ? `<ul class="cv-contact">${contacts.map((c) => `<li>${c}</li>`).join('')}</ul>` : ''}
    </header>`;

    /* Seções */
    const blocks = [];
    const on = s.sections;

    if (on.summary && clean(s.summary)) {
      blocks.push(sectionHTML('Perfil profissional', `<div class="rich">${rich(s.summary)}</div>`, 'summary'));
    }

    if (on.experience) {
      const items = s.experience.filter((x) => [x.role, x.company, x.location, x.description, x.start, x.end].some(clean) || x.current);
      if (items.length) {
        blocks.push(sectionHTML('Experiência profissional', items.map((x) => {
          const role = clean(x.role);
          return itemBlock({
            title: role || clean(x.company),
            sub: role ? [clean(x.company), clean(x.location)].filter(Boolean).join(', ') : clean(x.location),
            date: dateRange(x),
            desc: x.description,
          });
        }).join(''), 'experience'));
      }
    }

    if (on.education) {
      const items = s.education.filter((x) => [x.course, x.institution, x.location, x.description, x.start, x.end].some(clean));
      if (items.length) {
        blocks.push(sectionHTML('Educação', items.map((x) => {
          const course = clean(x.course);
          return itemBlock({
            title: course || clean(x.institution),
            sub: course ? [clean(x.institution), clean(x.location)].filter(Boolean).join(', ') : clean(x.location),
            date: dateRange(x),
            desc: x.description,
          });
        }).join(''), 'education'));
      }
    }

    if (on.skills && s.skills.length) {
      blocks.push(sectionHTML('Skills', `<ul class="cv-tags">${s.skills.map((k) => `<li>${esc(k.name)}</li>`).join('')}</ul>`, 'skills'));
    }

    if (on.languages) {
      const items = s.languages.filter((l) => clean(l.name));
      if (items.length) {
        blocks.push(sectionHTML('Idiomas', `<ul class="cv-langs">${items.map((l) =>
          `<li><span>${esc(clean(l.name))}</span>${l.level ? `<em>${esc(l.level)}</em>` : ''}</li>`).join('')}</ul>`, 'languages'));
      }
    }

    if (on.projects) {
      const items = s.projects.filter((x) => [x.name, x.description, x.link].some(clean));
      if (items.length) {
        blocks.push(sectionHTML('Projetos', items.map((x) => {
          const link = clean(x.link);
          return `<article class="cv-item">
            <div class="cv-item-head">
              <h3>${esc(clean(x.name) || displayUrl(link))}</h3>
              ${link ? `<a class="cv-date" href="${esc(toHref(link))}">${esc(displayUrl(link))}</a>` : ''}
            </div>
            ${clean(x.description) ? `<div class="rich">${rich(x.description)}</div>` : ''}
          </article>`;
        }).join(''), 'projects'));
      }
    }

    const hint = !name && !title && !blocks.length
      ? '<p class="ph cv-hint">Preencha o formulário para ver seu currículo aqui.</p>' : '';
    return head + hint + blocks.join('');
  }

  /* ---------- Preview: render, escala A4 e páginas ---------- */
  let renderRaf;
  function queueRender() {
    cancelAnimationFrame(renderRaf);
    renderRaf = requestAnimationFrame(renderPreview);
  }
  function renderPreview() {
    sheet.className = `cv-sheet tpl-${state.template}`;
    cvContent.innerHTML = buildCV(state);
    layoutPreview();
  }

  // Mantém a proporção A4 em qualquer largura reduzindo a folha inteira
  function fitSheet() {
    const w = sheet.offsetWidth;
    if (!w) return;
    const avail = stage.clientWidth;
    const scale = Math.min(1, avail / w);
    sheet.style.transform = `scale(${scale})`;
    scaler.style.width = `${w * scale}px`;
    scaler.style.height = `${sheet.offsetHeight * scale}px`;
  }

  // Estima o número de páginas e marca onde elas provavelmente quebram
  function layoutPreview() {
    fitSheet();
    const mmPx = sheet.offsetWidth / 210;
    if (!mmPx) return;
    const contentMm = cvContent.offsetHeight / mmPx;
    const pages = Math.max(1, Math.ceil(contentMm / PAGE_USABLE_MM - 0.02));
    pageCount.textContent = pages === 1 ? '1 página A4' : `${pages} páginas A4 (estimativa)`;
    guides.innerHTML = Array.from({ length: pages - 1 }, (_, i) =>
      `<div class="page-guide" style="top:calc(${PAGE_MARGIN_MM}mm + ${(i + 1) * PAGE_USABLE_MM}mm)"><span>Página ${i + 2}</span></div>`).join('');
    fitSheet(); // a altura pode ter mudado
  }

  let fitRaf;
  const queueFit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitSheet); };
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(queueFit);
    ro.observe(stage);
    ro.observe(sheet);
  }
  window.addEventListener('resize', queueFit);

  /* ---------- Ciclo de alteração ---------- */
  function changed() {
    queueRender();
    scheduleSave();
  }

  function hydrate() {
    $$('[data-bind]').forEach((el) => { el.value = getPath(el.dataset.bind) ?? ''; clearFieldError(el); });
    ['experience', 'education', 'skills', 'languages', 'projects'].forEach(renderList);
    syncSections();
    syncTemplate();
    renderPhotoControl();
    $('#autosave').checked = autosave;
    renderPreview();
  }

  /* ---------- Eventos do editor ---------- */
  function onFieldInput(e) {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.dataset.bind) {
      setPath(t.dataset.bind, t.value);
      if (t.dataset.bind === 'personal.email' && t.hasAttribute('aria-invalid')) validateEmail(t);
      if (t.dataset.bind === 'personal.name' && t.hasAttribute('aria-invalid') && t.value.trim()) clearFieldError(t);
      changed();
      return;
    }

    if (t.dataset.field) {
      const card = t.closest('[data-list]');
      if (!card) return;
      const item = state[card.dataset.list].find((x) => x.id === card.dataset.id);
      if (!item) return;
      const field = t.dataset.field;
      item[field] = t.type === 'checkbox' ? t.checked : t.value;

      if (field === 'current') {
        const end = $('[data-field="end"]', card);
        end.disabled = t.checked;
        if (t.checked) { item.end = ''; end.value = ''; }
      }
      if (['start', 'end', 'current'].includes(field) && $('.card-error', card)) validateDates(card, item);
      changed();
    }
  }
  editor.addEventListener('input', onFieldInput);
  editor.addEventListener('change', onFieldInput);

  editor.addEventListener('focusout', (e) => {
    if (e.target.dataset && e.target.dataset.bind === 'personal.email') validateEmail(e.target);
  });

  // Skills: Enter ou vírgula adiciona
  const skillInput = $('#skillInput');
  skillInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (e.key === ',' && skillInput.value.trim())) {
      e.preventDefault();
      addSkills();
    }
  });
  skillInput.addEventListener('input', () => { if (skillInput.hasAttribute('aria-invalid')) clearFieldError(skillInput); });

  function addSkills() {
    const parts = skillInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) {
      setFieldError(skillInput, 'Digite uma skill para adicionar.');
      skillInput.focus();
      return;
    }
    let added = 0;
    parts.forEach((n) => {
      if (!state.skills.some((s) => s.name.toLowerCase() === n.toLowerCase())) { state.skills.push({ id: uid(), name: n }); added++; }
    });
    skillInput.value = '';
    clearFieldError(skillInput);
    renderList('skills');
    if (added) changed(); else toast('Essas skills já estão na lista.');
    skillInput.focus();
  }

  // Foto
  $('#photoInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { toast('Formato não suportado. Use JPG, PNG ou WebP.', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('A imagem é grande demais. Use um arquivo de até 8 MB.', 'error'); return; }
    try {
      state.personal.photo = await resizeImage(file, 480);
      renderPhotoControl();
      changed();
      toast('Foto adicionada');
    } catch {
      toast('Não foi possível ler essa imagem. Tente outro arquivo.', 'error');
    }
  });

  /* ---------- Ações (delegação de cliques) ---------- */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    switch (action) {
      case 'add-item': {
        const name = btn.dataset.list;
        state[name].push(newItem[name]());
        renderList(name);
        const card = $(`#list-${name} .card:last-child`);
        card.classList.add('enter');
        const first = $('input, textarea, select', card);
        if (first) first.focus();
        changed();
        break;
      }
      case 'remove-item': {
        const card = btn.closest('[data-list]');
        const name = card.dataset.list;
        state[name] = state[name].filter((x) => x.id !== card.dataset.id);
        renderList(name);
        const add = $(`[data-action="add-item"][data-list="${name}"]`);
        if (add) add.focus({ preventScroll: true });
        toast(`${ITEM_LABEL[name]} removido${name === 'experience' || name === 'education' ? 'a' : ''}`);
        changed();
        break;
      }
      case 'add-skill': addSkills(); break;
      case 'remove-skill':
        state.skills = state.skills.filter((s) => s.id !== btn.dataset.id);
        renderList('skills');
        changed();
        break;
      case 'toggle-section': setSection(btn.dataset.key, btn.getAttribute('aria-pressed') !== 'true'); break;
      case 'remove-section': {
        setSection(btn.dataset.key, false);
        const chip = $(`.chip[data-key="${btn.dataset.key}"]`);
        if (chip) chip.focus({ preventScroll: true });
        break;
      }
      case 'set-template':
        if (state.template !== btn.dataset.template) {
          state.template = btn.dataset.template;
          syncTemplate();
          changed();
          toast(`Modelo ${state.template === 'executive' ? 'Executive' : 'Minimal'} aplicado`);
        }
        break;
      case 'upload-photo': $('#photoInput').click(); break;
      case 'remove-photo':
        state.personal.photo = '';
        renderPhotoControl();
        changed();
        toast('Foto removida');
        break;
      case 'clear-cv': await clearCV(); break;
      case 'clear-saved': await clearSaved(); break;
      case 'export': exportPdf(); break;
      default: break;
    }
  });

  $('#autosave').addEventListener('change', (e) => {
    autosave = e.target.checked;
    try { store.set(PREF_KEY, autosave ? 'on' : 'off'); } catch { /* ignore */ }
    if (autosave) { saveNow(); toast('Salvamento automático ligado'); }
    else { setStatus('off'); toast('Salvamento automático desligado'); }
  });

  async function clearCV() {
    const ok = await confirmDialog({
      title: 'Limpar o CV inteiro?',
      text: 'Todos os campos, itens e a foto serão apagados. Essa ação não pode ser desfeita.',
      confirmLabel: 'Limpar CV',
    });
    if (!ok) return;
    state = defaultState(state.template);
    hydrate();
    if (autosave) saveNow();
    toast('CV limpo');
    window.scrollTo({ top: 0 });
    editor.scrollTo({ top: 0 });
  }

  async function clearSaved() {
    const ok = await confirmDialog({
      title: 'Limpar dados salvos?',
      text: 'A cópia guardada neste navegador será apagada e o salvamento automático será desligado. O que está na tela continua até você fechar a página.',
      confirmLabel: 'Limpar dados salvos',
    });
    if (!ok) return;
    clearTimeout(saveTimer);
    store.remove(STORAGE_KEY);
    autosave = false;
    try { store.set(PREF_KEY, 'off'); } catch { /* ignore */ }
    $('#autosave').checked = false;
    setStatus('off');
    toast('Dados salvos apagados');
  }

  /* ---------- Exportar PDF (impressão do navegador) ---------- */
  function exportPdf() {
    const nameInput = $('[data-bind="personal.name"]');
    const emailInput = $('[data-bind="personal.email"]');

    if (!clean(state.personal.name)) {
      setFieldError(nameInput, 'Informe seu nome completo para exportar.');
      nameInput.focus();
      toast('Preencha seu nome completo antes de exportar.', 'error');
      return;
    }
    if (clean(state.personal.email) && !EMAIL_RE.test(clean(state.personal.email))) {
      validateEmail(emailInput);
      emailInput.focus();
      toast('Corrija o email antes de exportar.', 'error');
      return;
    }

    renderPreview();
    const prevTitle = document.title;
    document.title = `CV - ${clean(state.personal.name)}`; // nome sugerido para o arquivo PDF
    const restore = () => { document.title = prevTitle; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    toast('Na janela de impressão, escolha “Salvar como PDF”.');
    setTimeout(() => window.print(), 60);
  }

  /* ---------- Inicialização ---------- */
  buildSectionBar();
  hydrate();
  setStatus(autosave ? 'idle' : 'off');
  if (loaded.restored) toast('Rascunho restaurado');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutPreview);
})();
