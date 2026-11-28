/* App shell: tabs, open / new / save, drag & drop, shortcuts */
'use strict';
const App = {
  mode: 'word',
  editors() { return { word: WordEditor, xls: XlsxEditor, ppt: PptEditor }; },
  editor() { return this.editors()[this.mode]; },
  kindOf(ed) { return Object.entries(this.editors()).find(([, e]) => e === ed)[0]; },
  async setMode(m) {
    this.mode = m;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    $('#wordApp').hidden = m !== 'word';
    $('#pptApp').hidden = m !== 'ppt';
    $('#xlsApp').hidden = m !== 'xls';
    if (m === 'ppt' && !PptEditor.px) await this.guard(() => PptEditor.newDoc());
    if (m === 'xls' && !XlsxEditor.book) await this.guard(() => XlsxEditor.newDoc());
    if (m === 'xls') setTimeout(() => $('#xGrid').focus({ preventScroll: true }), 0);
    if (m === 'ppt') PptEditor.fit();
    this.updateTitle();
  },
  updateTitle() {
    const ed = this.editor();
    const fn = $('#fileName');
    fn.textContent = ed.fileName;
    fn.classList.toggle('dirty', !!ed.dirty);
    document.title = (ed.dirty ? '• ' : '') + ed.fileName + ' — Office Editor';
  },
  async guard(fn) {
    try { return await fn(); } catch (err) {
      console.error(err);
      toast('Sorry — ' + (err && err.message ? err.message : 'something went wrong'), 5000);
    }
  },
  async openFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'doc' || ext === 'ppt' || ext === 'xls') return toast(`Old .${ext} files are not supported. Save them as .${ext}x first.`, 5000);
    const kind = { docx: 'word', pptx: 'ppt', xlsx: 'xls', xlsm: 'xls', csv: 'xls' }[ext];
    if (!kind) return toast('Please choose a .docx, .xlsx or .pptx file');
    const target = this.editors()[kind];
    if (target.dirty && !confirm(`You have unsaved changes in ${target.fileName}. Discard them?`)) return;
    toast('Opening ' + file.name + '…', 1500);
    await this.guard(async () => {
      const buf = await readFileAsArrayBuffer(file);
      await this.setMode(kind);
      if (ext === 'csv') await XlsxEditor.openCsv(new TextDecoder().decode(buf), file.name);
      else await target.open(buf, file.name);
      Drafts.del(kind);
      this.fileHandle = null;
      toast('Opened ' + file.name);
    });
  },
  async newFile() {
    const ed = this.editor();
    if (ed.dirty && !confirm('Discard unsaved changes and start a new file?')) return;
    await this.guard(() => ed.newDoc());
    Drafts.del(this.mode);
    this.updateTitle();
  },
  async save() {
    const ed = this.editor();
    await this.guard(async () => {
      const blob = await ed.save();
      let name = ed.fileName;
      const want = { word: '.docx', ppt: '.pptx', xls: /\.xlsm$/i.test(name) ? '.xlsm' : '.xlsx' }[this.mode];
      if (!name.toLowerCase().endsWith(want)) name = baseName(name) + want;
      if (IN_APP) { // the system "Save as" screen lets the user pick the name and folder
        this.pendingSave = { ed, name };
        await downloadBlob(blob, name);
        return;
      }
      if (/^Untitled\./.test(name)) {
        const n = prompt('Save as:', name);
        if (!n) return;
        name = n.toLowerCase().endsWith(want) ? n : n + want;
      }
      downloadBlob(blob, name);
      ed.fileName = name;
      ed.dirty = false;
      Drafts.del(this.mode);
      this.updateTitle();
      toast('Saved ' + name + ' to your downloads');
    });
  },
  /* ---- called by the Android app ---- */
  onAndroidSaved(ok, name) {
    const p = this.pendingSave;
    this.pendingSave = null;
    if (!p || !ok) return;
    p.ed.fileName = name || p.name;
    p.ed.dirty = false;
    Drafts.del(this.kindOf(p.ed));
    this.updateTitle();
    toast('Saved ' + p.ed.fileName);
  },
  /* ---- drafts: keep unsaved work safe if the tab/app is closed ---- */
  async saveDrafts() {
    if (this.savingDrafts) return;
    this.savingDrafts = true;
    try {
      if (WordEditor.dirty && WordEditor.draftVersion !== WordEditor.version) {
        WordEditor.draftVersion = WordEditor.version;
        await Drafts.put('word', { name: WordEditor.fileName, html: WordEditor.page.innerHTML, at: Date.now() });
      }
      if (PptEditor.px && PptEditor.dirty && PptEditor.draftVersion !== PptEditor.version) {
        PptEditor.draftVersion = PptEditor.version;
        await Drafts.put('ppt', { name: PptEditor.fileName, blob: await PptEditor.draftBlob(), at: Date.now() });
      }
      if (XlsxEditor.book && XlsxEditor.dirty && XlsxEditor.draftVersion !== XlsxEditor.version && !XlsxEditor.editor) {
        XlsxEditor.draftVersion = XlsxEditor.version;
        await Drafts.put('xls', { name: XlsxEditor.fileName, blob: await XlsxEditor.draftBlob(), at: Date.now() });
      }
    } catch (e) { console.warn('draft save failed', e); }
    this.savingDrafts = false;
  },
  async offerRecovery() {
    for (const kind of ['word', 'xls', 'ppt']) {
      const d = await Drafts.get(kind);
      if (!d) continue;
      const when = new Date(d.at).toLocaleString();
      if (!confirm(`Recover unsaved changes to "${d.name}" from ${when}?`)) { Drafts.del(kind); continue; }
      await this.guard(async () => {
        await this.setMode(kind);
        if (kind === 'word') {
          WordEditor.page.innerHTML = d.html;
          WordEditor.fileName = d.name;
          WordEditor.changed();
        } else {
          const ed = this.editors()[kind];
          await ed.open(await d.blob.arrayBuffer(), d.name);
          ed.markDirty();
        }
        toast('Recovered ' + d.name);
      });
    }
  },
  isDirty() { return !!(WordEditor.dirty || PptEditor.dirty || XlsxEditor.dirty); },
  async openFromAndroid() {
    const name = window.AndroidBridge.pendingName();
    if (!name) return;
    const b64 = window.AndroidBridge.pendingData();
    const file = new File([base64ToBuffer(b64)], name);
    await this.openFile(file);
  },
  init() {
    WordEditor.init();
    PptEditor.init();
    XlsxEditor.init();
    $$('.tab').forEach((t) => (t.onclick = () => this.setMode(t.dataset.mode)));
    $('#btnOpen').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) this.openFile(f); };
    $('#btnNew').onclick = () => this.newFile();
    $('#btnSave').onclick = () => this.save();
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); }
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#fileInput').click(); }
    });
    let depth = 0;
    window.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { depth++; $('#drop').hidden = false; } });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('#drop').hidden = true; } });
    window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', (e) => {
      depth = 0; $('#drop').hidden = true;
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      if (/\.(docx|pptx|xlsx|xlsm|csv|doc|ppt|xls)$/i.test(f.name)) this.openFile(f);
      else if (/^image\//.test(f.type)) {
        e.preventDefault();
        if (this.mode === 'ppt') PptEditor.insertImage(f);
        else if (this.mode === 'xls') toast('Pictures can be added in Word and PowerPoint');
        else readFileAsDataURL(f).then(async (url) => {
          const { w, h } = await imageSize(url);
          const sc = Math.min(1, 624 / w);
          WordEditor.exec('insertHTML', `<img src="${url}" width="${Math.round(w * sc)}" height="${Math.round(h * sc)}">`);
        });
      } else toast('Please drop a .docx, .xlsx or .pptx file');
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    });
    setTimeout(() => { const s = $('#splash'); s.classList.add('gone'); setTimeout(() => s.remove(), 500); }, IN_APP ? 0 : 1300);
    this.offerRecovery().then(() => { if (IN_APP) this.openFromAndroid(); });
    setInterval(() => this.saveDrafts(), 15000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveDrafts(); });
    const hash = location.hash.replace('#', '');
    if (hash === 'ppt' || hash === 'powerpoint') this.setMode('ppt');
    if (hash === 'xls' || hash === 'excel') this.setMode('xls');
    this.updateTitle();
  },
};
window.addEventListener('DOMContentLoaded', () => App.init());
