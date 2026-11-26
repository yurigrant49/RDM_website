/* Comment widget wired to the Python comment API.
 *
 *   const api = CommentWidget.restApi('https://comments-api.onrender.com', 'page-identifier');
 *   CommentWidget.mount(document.getElementById('comments'), { api, limit: 500, summarize: summarizeComment });
 *
 * Visitors can attach up to 4 files per comment: pictures (JPG, PNG, GIF, WebP), PDF and Word (.docx).
 * Options: maxFiles (default 4), maxFileMB (default 5; keep it equal to MAX_FILE_MB on the server).
 */

const COMMENTS_API_BASE = window.COMMENTS_API_BASE || '';   // set this before loading the file, or edit it here

function cwClientId() {
  const make = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  try {
    let id = localStorage.getItem('cw-client-id');
    if (!id) { id = make(); localStorage.setItem('cw-client-id', id); }
    return id;
  } catch (e) { return (cwClientId.temp ||= make()); }
}

/* Sends the comment text to your server, which calls the model with your API key.
 * Resolves with a shortened, insult-free version (an empty string if nothing polite was left);
 * rejects if the server or the model is unavailable. Pass clean: true to rewrite a short comment too. */
async function summarizeComment(text, { limit = 500, signal, clean = false } = {}) {
  const res = await fetch(COMMENTS_API_BASE + '/api/summarize', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': cwClientId() },
    body: JSON.stringify({ text, limit, clean })
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail; } catch (e) {}
    throw new Error(typeof detail === 'string' && detail ? detail : 'Summary request failed (' + res.status + ').');
  }
  const data = await res.json();
  return data.summary;
}

const CommentWidget = (() => {
  const THUMB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 21h4V9H2v12zM22 10c0-1.1-.9-2-2-2h-6.3l1-4.6V3.1c0-.4-.2-.8-.5-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>';
  const CLIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6.5v10.1a4.5 4.5 0 0 1-9 0V5.8a3 3 0 0 1 6 0v10.3a1.5 1.5 0 0 1-3 0V6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const FILE_KINDS = {
    'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image',
    'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
  };
  const EXT_KINDS = { jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', pdf: 'pdf', docx: 'docx' };
  const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const kindOf = f => FILE_KINDS[f.type] || EXT_KINDS[(String(f.name).split('.').pop() || '').toLowerCase()] || null;
  const size = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace(/\.0$/, '') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const CHEV = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.4 3.3 6 7.9l4.6-4.6L12 4.7l-6 6-6-6z"/></svg>';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
  function ago(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    const units = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (const [sec, name] of units) { const v = Math.floor(s / sec); if (v >= 1) return v + ' ' + name + (v > 1 ? 's' : '') + ' ago'; }
    return 'just now';
  }
  function avatar(name, small) {
    name = name || '?';
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const a = el('div', 'cw-avatar' + (small ? ' sm' : ''), name.replace(/^@/, '').charAt(0).toUpperCase());
    a.style.background = `hsl(${h} 48% 42%)`; a.setAttribute('aria-hidden', 'true'); return a;
  }

  /* ----- REST client for the Python backend ----- */
  function restApi(base, pageId) {
    async function call(method, path, body) {
      const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': cwClientId() },
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).detail; } catch (e) {}
        const err = new Error(typeof detail === 'string' && detail ? detail : (detail && detail.message) || 'Request failed (' + res.status + ').');
        if (detail && detail.code) err.code = detail.code;   // 'insulting' when the server refuses the wording
        throw err;
      }
      return res.status === 204 ? null : res.json();
    }
    async function upload(file) {
      const form = new FormData(); form.append('file', file, file.name);
      let res;
      try { res = await fetch(base + '/api/attachments', { method: 'POST', headers: { 'X-Client-Id': cwClientId() }, body: form }); }
      catch (e) { throw new Error('Upload failed. Check your connection and try again.'); }
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).detail; } catch (e) {}
        throw new Error(typeof detail === 'string' && detail ? detail : 'Upload failed (' + res.status + ').');
      }
      return res.json();
    }
    return {
      upload,
      discard: id => call('DELETE', '/api/attachments/' + id).catch(() => {}),
      fileUrl: path => base + path,
      list: () => call('GET', '/api/comments?page_id=' + encodeURIComponent(pageId)),
      create: (text, parentId, name, attachmentIds) => call('POST', '/api/comments', { page_id: pageId, parent_id: parentId || null, author_name: name, text, attachment_ids: attachmentIds || [] }),
      update: (id, text) => call('PATCH', '/api/comments/' + id, { text }),
      remove: id => call('DELETE', '/api/comments/' + id),
      react: (id, value) => call('PUT', '/api/comments/' + id + '/reaction', { value })
    };
  }

  function mount(root, opts) {
    const api = opts.api;
    const summarize = opts.summarize || null;    // async (text, {limit, signal}) => shorter text
    const LIMIT = opts.limit || 500;
    const MAX_FILES = opts.maxFiles || 4;
    const MAX_BYTES = (opts.maxFileMB || 5) * 1048576;
    const canAttach = typeof api.upload === 'function';
    const state = { comments: [], loading: true, sort: 'top', open: new Set(), expanded: new Set(), reply: null, editing: null, confirmDel: null, drafts: {}, files: {} };
    root.classList.add('cw');

    let savedName = ''; try { savedName = localStorage.getItem('cw-name') || ''; } catch (e) {}
    const errBox = el('p', 'cw-error'); errBox.hidden = true; errBox.setAttribute('role', 'alert');
    const fail = err => { errBox.textContent = (err && err.message) || 'Something went wrong.'; errBox.hidden = false; };
    const ok = () => { errBox.hidden = true; };
    const requireName = () => {
      const n = nameInput.value.trim();
      if (!n) { nameInput.focus(); throw new Error('Enter a name before posting.'); }
      return n;
    };

    /* ----- composer (new comment, reply, edit) ----- */
    function composer({ key, placeholder, label, small, always, initial, attach, onSubmit, onCancel }) {
      const row = el('div', 'cw-row');
      row.append(avatar(nameInput.value.trim(), small));
      const form = el('form', 'cw-form');
      const ta = el('textarea'); ta.rows = 1; ta.placeholder = placeholder; ta.id = 'cw-ta-' + key; ta.setAttribute('aria-label', placeholder);
      ta.maxLength = 5000;
      ta.value = state.drafts[key] ?? initial ?? '';
      const actions = el('div', 'cw-form-actions');
      const counter = el('span', 'cw-counter');
      const cancel = el('button', 'cw-btn ghost', 'Cancel'); cancel.type = 'button';
      const submit = el('button', 'cw-btn primary', label); submit.type = 'submit';
      actions.append(counter, cancel, submit);

      /* Attachments: files upload as soon as they are chosen; the comment carries their ids */
      const files = state.files[key] ||= [];       // kept in state so a reply box survives re-rendering
      const chips = el('ul', 'cw-chips'); chips.setAttribute('aria-label', 'Attached files');
      const picker = el('input'); picker.type = 'file'; picker.multiple = true; picker.accept = ACCEPT; picker.hidden = true; picker.id = 'cw-file-' + key;
      const attachBtn = el('button', 'cw-attach'); attachBtn.type = 'button'; attachBtn.innerHTML = CLIP; attachBtn.append(el('span', '', 'Attach'));
      attachBtn.title = 'Attach pictures, PDF or Word files'; attachBtn.setAttribute('aria-label', 'Attach files');
      if (attach && canAttach) actions.prepend(attachBtn, picker);
      const uploading = () => files.some(f => f.status === 'uploading');
      const readyIds = () => files.filter(f => f.status === 'ready').map(f => f.id);
      function drawChips() {
        chips.replaceChildren(...files.map(f => {
          const li = el('li', 'cw-chip' + (f.status === 'error' ? ' bad' : ''));
          if (f.preview) { const im = el('img'); im.src = f.preview; im.alt = ''; li.append(im); }
          else li.append(el('span', 'cw-badge ' + f.kind, f.kind === 'pdf' ? 'PDF' : f.kind === 'docx' ? 'DOC' : 'FILE'));
          const info = el('span', 'cw-chip-info');
          info.append(el('span', 'cw-chip-name', f.name),
            el('span', 'cw-chip-state', f.status === 'uploading' ? 'Uploading…' : f.status === 'error' ? f.error : size(f.size)));
          const x = el('button', 'cw-chip-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + f.name);
          x.addEventListener('click', () => { dropFile(f); });
          li.append(info, x); return li;
        }));
        chips.hidden = !files.length;
        attachBtn.disabled = files.length >= MAX_FILES;
        if (files.length) actions.hidden = false;
        sync();
      }
      function dropFile(f, keepOnServer) {
        const i = files.indexOf(f); if (i < 0) return;
        files.splice(i, 1);
        if (f.preview) URL.revokeObjectURL(f.preview);
        if (f.id && !keepOnServer) api.discard(f.id);
        f.gone = true; drawChips();
      }
      function addFiles(list) {
        if (!attach || !canAttach) return;
        for (const file of Array.from(list || [])) {
          if (files.length >= MAX_FILES) { fail(new Error('You can attach up to ' + MAX_FILES + ' files to one comment.')); break; }
          const kind = kindOf(file);
          const f = { name: file.name || 'pasted-image.png', size: file.size, kind, status: 'uploading', id: null, preview: null };
          if (!kind) { f.status = 'error'; f.error = 'Only pictures, PDF and Word (.docx) files'; }
          else if (file.size > MAX_BYTES) { f.status = 'error'; f.error = 'Larger than ' + (MAX_BYTES / 1048576) + ' MB'; }
          if (kind === 'image' && f.status !== 'error') f.preview = URL.createObjectURL(file);
          files.push(f);
          if (f.status === 'uploading') api.upload(file).then(r => {
            if (f.gone) { api.discard(r.id); return; }
            Object.assign(f, { id: r.id, name: r.name, size: r.size, status: 'ready' }); drawChips();
          }, err => { if (!f.gone) { f.status = 'error'; f.error = err.message.replace(/\.$/, ''); drawChips(); } });
        }
        drawChips();
      }
      function clearFiles() { files.slice().forEach(f => dropFile(f, true)); }
      attachBtn.addEventListener('click', () => picker.click());
      picker.addEventListener('change', () => { addFiles(picker.files); picker.value = ''; });
      if (attach && canAttach) {
        form.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); form.classList.add('drop'); } });
        form.addEventListener('dragleave', e => { if (!form.contains(e.relatedTarget)) form.classList.remove('drop'); });
        form.addEventListener('drop', e => { e.preventDefault(); form.classList.remove('drop'); addFiles(e.dataTransfer.files); });
        ta.addEventListener('paste', e => { const fl = e.clipboardData && e.clipboardData.files; if (fl && fl.length) { e.preventDefault(); addFiles(fl); } });
      }

      /* AI agent panel: a shorter version offered when the comment is over LIMIT characters */
      const sug = el('div', 'cw-sug'); sug.hidden = true;
      const sugHead = el('div', 'cw-sug-head'), sugCount = el('span', 'cw-counter');
      sugHead.append(el('strong', '', 'Suggested version, written by AI'), sugCount);
      const sugNote = el('p', 'cw-sug-note');
      const sugTa = el('textarea'); sugTa.id = 'cw-sug-' + key; sugTa.rows = 3; sugTa.setAttribute('aria-label', 'Suggested shorter version');
      const sugActs = el('div', 'cw-form-actions');
      const dismiss = el('button', 'cw-btn ghost', 'Dismiss'); dismiss.type = 'button';
      const copy = el('button', 'cw-btn ghost', 'Copy'); copy.type = 'button';
      const replace = el('button', 'cw-btn primary', 'Replace my comment'); replace.type = 'button';
      sugActs.append(dismiss, copy, replace);
      sug.append(sugHead, sugNote, sugTa, sugActs);
      let offered = false, busy = false, ctrl = null;
      const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
      const sync = () => { grow(ta); const n = ta.value.length; submit.disabled = busy || uploading() || (!ta.value.trim() && !readyIds().length); counter.textContent = n > LIMIT * 0.8 ? n + ' / ' + LIMIT : ''; counter.classList.toggle('over', n > LIMIT); };
      const syncSug = () => { grow(sugTa); const n = sugTa.value.length; sugCount.textContent = n + ' / ' + LIMIT; sugCount.classList.toggle('over', n > LIMIT); copy.disabled = replace.disabled = sugTa.readOnly || !sugTa.value.trim(); };
      const closeSug = () => { if (ctrl) ctrl.abort(); ctrl = null; sug.hidden = true; };
      async function suggest(text, rude) {
        const lead = rude ? 'Your comment was not posted because it contains insulting language. '
                          : 'Your comment is ' + text.length + ' characters, longer than ' + LIMIT + '. ';
        sug.hidden = false; sugTa.hidden = copy.hidden = replace.hidden = sugCount.hidden = false;
        sugTa.value = ''; sugTa.readOnly = true; syncSug();
        sugNote.textContent = lead + (rude ? 'Writing a friendlier version…' : 'Writing a shorter version…');
        const mine = ctrl = new AbortController();
        try {
          const out = await summarize(text, { limit: LIMIT, signal: mine.signal, clean: !!rude });
          if (ctrl !== mine) return;
          const polite = String(out || '').trim();
          if (!polite) {   // the whole comment was an insult
            sugTa.hidden = copy.hidden = replace.hidden = sugCount.hidden = true;
            sugNote.textContent = lead + 'Nothing was left once the insulting wording was removed. Please make your point in friendly words.';
            return;
          }
          sugTa.value = polite; sugTa.readOnly = false; syncSug();
          sugNote.textContent = lead + 'Edit this version, copy it, or use it in place of yours. Click ' + label + ' again to post what is in the box above.';
        } catch (err) {
          if (ctrl !== mine) return;
          sugTa.hidden = copy.hidden = replace.hidden = sugCount.hidden = true;
          const why = (err && err.message) ? ' (' + err.message.replace(/\.$/, '') + ')' : '';
          sugNote.textContent = lead + (rude ? 'The AI rewrite is not available right now' + why + '. Reword it yourself, then click ' + label + ' again.'
                                            : 'The AI summary is not available right now' + why + '. Shorten it yourself, or click ' + label + ' again to post it as written.');
        }
      }
      sugTa.addEventListener('input', syncSug);
      dismiss.addEventListener('click', closeSug);
      copy.addEventListener('click', () => {
        const done = () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); };
        try { navigator.clipboard.writeText(sugTa.value).then(done, () => sugTa.select()); } catch (e) { sugTa.select(); }
      });
      replace.addEventListener('click', () => { ta.value = sugTa.value.trim(); state.drafts[key] = ta.value; closeSug(); sync(); ta.focus(); });

      ta.addEventListener('input', () => { state.drafts[key] = ta.value; sync(); });
      ta.addEventListener('focus', () => { actions.hidden = false; });
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
      cancel.addEventListener('click', () => { offered = false; closeSug(); files.slice().forEach(f => dropFile(f)); delete state.drafts[key]; ta.value = ''; sync(); if (!always) actions.hidden = true; ta.blur(); onCancel && onCancel(); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const v = ta.value.trim(), ids = readyIds();
        if ((!v && !ids.length) || busy || uploading()) return;
        if (files.some(f => f.status === 'error')) { fail(new Error('Remove the files marked in red before posting.')); return; }
        if (summarize && v.length > LIMIT && !offered) { offered = true; suggest(v); return; }   // first click on a long comment: offer a shorter version
        busy = true; sync();
        try {
          await onSubmit(v, ids);                  // saved on the server
          ok(); offered = false; closeSug(); clearFiles(); delete state.drafts[key]; ta.value = ''; if (!always) actions.hidden = true;
        } catch (err) {                            // keep the text so nothing typed is lost
          if (err && err.code === 'insulting' && summarize) { ok(); offered = true; suggest(v, true); }   // refused: offer a friendly rewrite
          else fail(err);
        }
        busy = false; sync();
      });
      actions.hidden = !always && !ta.value && !files.length;
      form.append(ta, chips, actions, sug); row.append(form);
      drawChips();
      requestAnimationFrame(sync);
      row.focusInput = () => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); };
      return row;
    }

    /* ----- files under a posted comment ----- */
    function attachments(list) {
      const box = el('div', 'cw-files');
      const pics = list.filter(f => FILE_KINDS[f.type] === 'image'), docs = list.filter(f => FILE_KINDS[f.type] !== 'image');
      if (pics.length) {
        const row = el('div', 'cw-pics');
        pics.forEach(f => {
          const a = el('a', 'cw-pic'); a.href = api.fileUrl(f.url); a.target = '_blank'; a.rel = 'noopener'; a.title = f.name;
          const im = el('img'); im.src = api.fileUrl(f.url); im.alt = f.name; im.loading = 'lazy';
          a.append(im); row.append(a);
        });
        box.append(row);
      }
      docs.forEach(f => {
        const kind = FILE_KINDS[f.type];
        const a = el('a', 'cw-doc'); a.target = '_blank'; a.rel = 'noopener';
        a.href = api.fileUrl(f.url) + (kind === 'docx' ? '?download=1' : '');
        const info = el('span', 'cw-chip-info');
        info.append(el('span', 'cw-chip-name', f.name), el('span', 'cw-chip-state', (kind === 'pdf' ? 'PDF' : 'Word document') + ' · ' + size(f.size)));
        a.append(el('span', 'cw-badge ' + kind, kind === 'pdf' ? 'PDF' : 'DOC'), info, el('span', 'cw-doc-go', kind === 'docx' ? 'Download' : 'Open'));
        box.append(a);
      });
      return box;
    }

    /* ----- one comment or reply ----- */
    function item(c, parent) {
      const isReply = !!parent, thread = parent || c;
      const row = el('article', 'cw-row');
      row.append(avatar(c.handle, isReply));
      const main = el('div', 'cw-main');

      const meta = el('div', 'cw-meta');
      meta.append(el('span', 'cw-author', c.handle));
      meta.append(el('span', 'cw-time', ago(c.time) + (c.edited ? ' (edited)' : '')));
      main.append(meta);

      if (state.editing === c.id) {
        const ed = composer({ key: 'edit-' + c.id, placeholder: 'Edit your comment', label: 'Save', small: true, always: true, initial: c.text,
          onSubmit: async v => { Object.assign(c, await api.update(c.id, v), { replies: c.replies }); state.editing = null; render(); },
          onCancel: () => { state.editing = null; render(); } });
        ed.firstChild.remove(); main.append(ed); pendingFocus = ed;
      } else {
        const text = el('p', 'cw-text', c.text);
        if (c.text) main.append(text);
        if (c.files && c.files.length) main.append(attachments(c.files));
        if (c.text && !state.expanded.has(c.id)) {
          text.classList.add('clamp');
          const more = el('button', 'cw-more', 'Read more'); more.type = 'button'; more.hidden = true;
          more.addEventListener('click', () => { state.expanded.add(c.id); text.classList.remove('clamp'); more.remove(); });
          main.append(more);
          requestAnimationFrame(() => { if (text.scrollHeight > text.clientHeight + 2) more.hidden = false; });
        }

        const react = () => api.react(c.id, c.liked ? 1 : c.disliked ? -1 : 0).then(ok, err => { fail(err); reload(); });
        const acts = el('div', 'cw-actions');
        const like = el('button', 'cw-icon'); like.type = 'button'; like.innerHTML = THUMB;
        like.append(el('span', '', c.likes ? fmt(c.likes) : '')); like.setAttribute('aria-pressed', !!c.liked); like.setAttribute('aria-label', 'Like, ' + c.likes + ' likes');
        like.addEventListener('click', () => { if (c.liked) { c.liked = false; c.likes--; } else { c.liked = true; c.likes++; c.disliked = false; } render(); react(); });
        const dis = el('button', 'cw-icon down'); dis.type = 'button'; dis.innerHTML = THUMB;
        dis.setAttribute('aria-pressed', !!c.disliked); dis.setAttribute('aria-label', 'Dislike');
        dis.addEventListener('click', () => { if (c.liked) { c.liked = false; c.likes--; } c.disliked = !c.disliked; render(); react(); });
        const reply = el('button', 'cw-text-btn', 'Reply'); reply.type = 'button';
        reply.addEventListener('click', () => { state.reply = { thread: thread.id, target: c.id }; if (isReply) state.drafts['reply-' + c.id] ??= '@' + c.handle + ' '; state.open.add(thread.id); render(); });
        acts.append(like, dis, reply);
        if (c.own) {
          const edit = el('button', 'cw-text-btn', 'Edit'); edit.type = 'button';
          edit.addEventListener('click', () => { state.editing = c.id; render(); });
          const del = el('button', 'cw-text-btn danger', state.confirmDel === c.id ? 'Confirm delete' : 'Delete'); del.type = 'button';
          del.addEventListener('click', async () => {
            if (state.confirmDel !== c.id) { state.confirmDel = c.id; render(); return; }
            state.confirmDel = null;
            try {
              await api.remove(c.id); ok();
              if (parent) parent.replies = parent.replies.filter(r => r.id !== c.id); else state.comments = state.comments.filter(x => x.id !== c.id);
            } catch (err) { fail(err); }
            render();
          });
          acts.append(edit, del);
        }
        main.append(acts);
      }

      if (state.reply && state.reply.target === c.id) {
        const rc = composer({ key: 'reply-' + c.id, placeholder: 'Add a reply…', label: 'Reply', small: true, always: true, attach: true,
          onSubmit: async (v, ids) => { const made = await api.create(v, thread.id, requireName(), ids); (thread.replies ||= []).push(made); state.reply = null; state.open.add(thread.id); render(); },
          onCancel: () => { delete state.files['reply-' + c.id]; state.reply = null; render(); } });
        main.append(rc); pendingFocus = rc;
      }

      if (!isReply && c.replies && c.replies.length) {
        const n = c.replies.length, open = state.open.has(c.id);
        const tog = el('button', 'cw-toggle'); tog.type = 'button'; tog.innerHTML = CHEV; tog.append(el('span', '', n + (n === 1 ? ' reply' : ' replies')));
        tog.setAttribute('aria-expanded', open);
        tog.addEventListener('click', () => { open ? state.open.delete(c.id) : state.open.add(c.id); render(); });
        main.append(tog);
        if (open) { const box = el('div', 'cw-replies'); c.replies.forEach(r => box.append(item(r, c))); main.append(box); }
      }
      row.append(main); return row;
    }

    /* ----- shell ----- */
    let pendingFocus = null;
    const head = el('div', 'cw-head'), count = el('h2', 'cw-count');
    const sortWrap = el('label', 'cw-sort', 'Sort by '); const sel = el('select'); sel.id = 'cw-sort';
    sel.append(new Option('Top comments', 'top'), new Option('Newest first', 'new')); sortWrap.append(sel);
    sel.addEventListener('change', () => { state.sort = sel.value; render(); });
    const nameWrap = el('label', 'cw-name', 'Posting as '); const nameInput = el('input'); nameInput.id = 'cw-name'; nameInput.type = 'text';
    nameInput.maxLength = 40; nameInput.placeholder = 'Your name'; nameInput.value = savedName; nameInput.autocomplete = 'nickname'; nameWrap.append(nameInput);
    head.append(count, sortWrap, nameWrap);
    const top = composer({ key: 'new', placeholder: 'Add a comment…', label: 'Comment', attach: true,
      onSubmit: async (v, ids) => { const made = await api.create(v, null, requireName(), ids); state.comments.push(made); state.sort = sel.value = 'new'; render(); } });
    nameInput.addEventListener('input', () => {
      try { localStorage.setItem('cw-name', nameInput.value.trim()); } catch (e) {}
      top.firstChild.replaceWith(avatar(nameInput.value.trim()));
    });
    const list = el('div', 'cw-list');
    root.append(head, top, errBox, list);

    function render() {
      pendingFocus = null;
      const total = state.comments.reduce((s, c) => s + 1 + (c.replies ? c.replies.length : 0), 0);
      count.textContent = total.toLocaleString() + (total === 1 ? ' Comment' : ' Comments');
      const sorted = [...state.comments].sort((a, b) => state.sort === 'top' ? (b.likes - a.likes) || (b.time - a.time) : b.time - a.time);
      list.replaceChildren(...sorted.map(c => item(c, null)));
      if (!sorted.length) list.append(el('p', 'cw-empty', state.loading ? 'Loading comments…' : 'No comments yet. Yours can be the first.'));
      if (pendingFocus) pendingFocus.focusInput();
    }
    async function reload() {
      try { state.comments = await api.list(); state.loading = false; ok(); }
      catch (err) { state.loading = false; fail(new Error('Comments could not be loaded. ' + ((err && err.message) || ''))); }
      render();
    }
    render();
    reload();
    return { reload, getComments: () => state.comments };
  }
  return { mount, restApi };
})();
