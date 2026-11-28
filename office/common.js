/* Shared helpers */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

/* Inside the Android app, files are saved through the system "Save as" dialog */
const IN_APP = typeof window.AndroidBridge !== 'undefined';
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
function base64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
async function downloadBlob(blob, name) {
  if (IN_APP) {
    window.AndroidBridge.saveBase64(name, blob.type || 'application/octet-stream', await blobToBase64(blob));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function readFileAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(file);
  });
}
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}
function dataURLToBytes(url) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { mime: m[1] || 'application/octet-stream', bytes: out };
}
function imageSize(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth || 100, h: im.naturalHeight || 100 });
    im.onerror = () => res({ w: 100, h: 100 });
    im.src = src;
  });
}

/* colour helpers: "rgb(1, 2, 3)" / "#abc" -> "RRGGBB" */
function toHex(c) {
  if (!c) return null;
  c = c.trim();
  if (c === 'transparent') return null;
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return m[1].split('').map((x) => x + x).join('').toUpperCase();
  m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return m[1].toUpperCase();
  m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(c);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return null;
}
/* "12pt" / "16px" -> points */
function toPt(s) {
  if (!s) return null;
  const m = /^([\d.]+)(px|pt|em|rem)?$/.exec(String(s).trim());
  if (!m) return null;
  const v = parseFloat(m[1]);
  switch (m[2]) {
    case 'pt': return v;
    case 'em': case 'rem': return v * 11;
    default: return v * 0.75;
  }
}
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function baseName(n) { return n.replace(/\.[^.]+$/, ''); }

/* Tiny IndexedDB store for crash/close recovery drafts (one per editor) */
const Drafts = {
  db() {
    if (!this._db) this._db = new Promise((res, rej) => {
      const r = indexedDB.open('office-editor', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('drafts');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async run(mode, fn) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const tx = db.transaction('drafts', mode);
      const req = fn(tx.objectStore('drafts'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  },
  put(kind, value) { return this.run('readwrite', (s) => s.put(value, kind)).catch(() => {}); },
  get(kind) { return this.run('readonly', (s) => s.get(kind)).catch(() => null); },
  del(kind) { return this.run('readwrite', (s) => s.delete(kind)).catch(() => {}); },
};
