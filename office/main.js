/* App shell: tabs, open / new / save, drag & drop, shortcuts */
'use strict';
const App = {
  mode: 'word',
  editor() { return this.mode === 'word' ? WordEditor : PptEditor; },
  async setMode(m) {
    this.mode = m;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    $('#wordApp').hidden = m !== 'word';
    $('#pptApp').hidden = m !== 'ppt';
    if (m === 'ppt' && !PptEditor.px) await this.guard(() => PptEditor.newDoc());
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
    if (ext === 'doc' || ext === 'ppt') return toast('Old binary .doc/.ppt files are not supported. Save them as .docx/.pptx first.', 5000);
    if (ext !== 'docx' && ext !== 'pptx') return toast('Please choose a .docx or .pptx file');
    const target = ext === 'docx' ? WordEditor : PptEditor;
    if (target.dirty && !confirm(`You have unsaved changes in ${target.fileName}. Discard them?`)) return;
    toast('Opening ' + file.name + '…', 1500);
    await this.guard(async () => {
      const buf = await readFileAsArrayBuffer(file);
      await this.setMode(ext === 'docx' ? 'word' : 'ppt');
      await target.open(buf, file.name);
      this.fileHandle = null;
      toast('Opened ' + file.name);
    });
  },
  async newFile() {
    const ed = this.editor();
    if (ed.dirty && !confirm('Discard unsaved changes and start a new file?')) return;
    await this.guard(() => ed.newDoc());
    this.updateTitle();
  },
  async save() {
    const ed = this.editor();
    await this.guard(async () => {
      const blob = await ed.save();
      let name = ed.fileName;
      const want = this.mode === 'word' ? '.docx' : '.pptx';
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
    this.updateTitle();
    toast('Saved ' + p.ed.fileName);
  },
  isDirty() { return !!(WordEditor.dirty || PptEditor.dirty); },
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
      if (/\.(docx|pptx|doc|ppt)$/i.test(f.name)) this.openFile(f);
      else if (/^image\//.test(f.type)) {
        e.preventDefault();
        if (this.mode === 'ppt') PptEditor.insertImage(f);
        else readFileAsDataURL(f).then(async (url) => {
          const { w, h } = await imageSize(url);
          const sc = Math.min(1, 624 / w);
          WordEditor.exec('insertHTML', `<img src="${url}" width="${Math.round(w * sc)}" height="${Math.round(h * sc)}">`);
        });
      } else toast('Please drop a .docx or .pptx file');
    });
    window.addEventListener('beforeunload', (e) => {
      if (WordEditor.dirty || PptEditor.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    if (IN_APP) {
      document.documentElement.classList.add('in-app');
      this.openFromAndroid();
    }
    const hash = location.hash.replace('#', '');
    if (hash === 'ppt' || hash === 'powerpoint') this.setMode('ppt');
    this.updateTitle();
  },
};
window.addEventListener('DOMContentLoaded', () => App.init());
