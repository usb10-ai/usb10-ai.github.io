/* ===================== PowerPoint (.pptx) editor ===================== */
'use strict';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PFX = { a: A_NS, p: P_NS, r: R_NS };
const EMU_PT = 12700;
const REL = {
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  master: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  notes: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
};
const CT = {
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  notes: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
};
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_DECL = `xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"`;

/* ---------- small XML helpers ---------- */
const X = {
  kid(el, name) { if (!el) return null; for (const c of el.children) if (c.localName === name) return c; return null; },
  kids(el, name) { return el ? Array.from(el.children).filter((c) => !name || c.localName === name) : []; },
  path(el, ...names) { for (const n of names) { el = X.kid(el, n); if (!el) return null; } return el; },
  make(doc, qname, attrs = {}) {
    const [pfx] = qname.split(':');
    const e = doc.createElementNS(PFX[pfx], qname);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
    return e;
  },
  frag(doc, xml) {
    const d = new DOMParser().parseFromString(`<root ${NS_DECL}>${xml}</root>`, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('bad xml fragment');
    return Array.from(d.documentElement.children).map((c) => doc.importNode(c, true));
  },
  rid(el, name = 'embed') { return el && (el.getAttributeNS(R_NS, name) || el.getAttribute('r:' + name)); },
  num(el, a, d = 0) { const v = el && el.getAttribute(a); return v == null || v === '' ? d : +v; },
};
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
function relsPathFor(p) { const i = p.lastIndexOf('/'); return p.slice(0, i) + '/_rels/' + p.slice(i + 1) + '.rels'; }
function relTarget(fromPath, toPath) {
  const a = fromPath.split('/'); a.pop();
  const b = toPath.split('/');
  while (a.length && b.length > 1 && a[0] === b[0]) { a.shift(); b.shift(); }
  return '../'.repeat(a.length) + b.join('/');
}

/* ---------- colour maths ---------- */
function hexToRgb(h) { return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); }
function rgbToHex(r) { return r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase(); }
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return [h, s, l];
}
function hslToRgb([h, s, l]) {
  if (!s) return [l * 255, l * 255, l * 255];
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}
const PRST_CLR = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080' };

/* ---------- preset geometry polygons (unit square 0..100) ---------- */
const PRESET_POLY = {
  triangle: '50,0 100,100 0,100', rtTriangle: '0,0 100,100 0,100', diamond: '50,0 100,50 50,100 0,50',
  parallelogram: '25,0 100,0 75,100 0,100', trapezoid: '25,0 75,0 100,100 0,100',
  pentagon: '50,0 100,38 81,100 19,100 0,38', hexagon: '25,0 75,0 100,50 75,100 25,100 0,50',
  octagon: '30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30',
  homePlate: '0,0 80,0 100,50 80,100 0,100', chevron: '0,0 80,0 100,50 80,100 0,100 20,50',
  rightArrow: '0,25 65,25 65,0 100,50 65,100 65,75 0,75', leftArrow: '100,25 35,25 35,0 0,50 35,100 35,75 100,75',
  upArrow: '25,100 25,35 0,35 50,0 100,35 75,35 75,100', downArrow: '25,0 25,65 0,65 50,100 100,65 75,65 75,0',
  star5: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35',
  plus: '33,0 67,0 67,33 100,33 100,67 67,67 67,100 33,100 33,67 0,67 0,33 33,33',
  flowChartDecision: '50,0 100,50 50,100 0,50',
};

/* ===================================================================== */
class PptxDoc {
  async load(buf) {
    this.zip = await JSZip.loadAsync(buf);
    this.docs = {};
    this.dirty = new Set();
    this.blobUrls = {};
    this.ct = await this.xml('[Content_Types].xml');
    this.pres = await this.xml('ppt/presentation.xml');
    if (!this.pres) throw new Error('Not a PowerPoint file (ppt/presentation.xml missing)');
    this.presRels = await this.rels('ppt/presentation.xml');
    const sz = this.pres.getElementsByTagNameNS(P_NS, 'sldSz')[0];
    this.cx = X.num(sz, 'cx', 9144000); this.cy = X.num(sz, 'cy', 6858000);
    this.defaultTextStyle = this.pres.getElementsByTagNameNS(P_NS, 'defaultTextStyle')[0] || null;
    this.slides = [];
    const lst = this.pres.getElementsByTagNameNS(P_NS, 'sldIdLst')[0];
    for (const s of X.kids(lst, 'sldId')) {
      const rid = X.rid(s, 'id');
      const rel = this.presRels.byId[rid];
      if (!rel) continue;
      this.slides.push(await this.loadSlide(rel.path));
    }
    this.layouts = [];
    this.masters = {};
    for (const rel of Object.values(this.presRels.byId).filter((r) => r.type === REL.master)) {
      const m = await this.loadMaster(rel.path);
      const mr = await this.rels(rel.path);
      for (const lr of Object.values(mr.byId).filter((r) => r.type === REL.layout)) {
        const lay = await this.loadLayout(lr.path);
        this.layouts.push({ path: lr.path, name: lay.doc.getElementsByTagNameNS(P_NS, 'cSld')[0].getAttribute('name') || baseName(lr.path.split('/').pop()) });
      }
      void m;
    }
    const nm = Object.values(this.presRels.byId).find((r) => r.type === REL.notesMaster);
    this.notesMasterPath = nm ? nm.path : null;
  }
  async xml(path) {
    if (this.docs[path] !== undefined) return this.docs[path];
    const f = this.zip.file(path);
    const d = f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null;
    this.docs[path] = d;
    return d;
  }
  touch(path) { this.dirty.add(path); }
  async rels(partPath) {
    const rp = relsPathFor(partPath);
    let doc = await this.xml(rp);
    if (!doc) {
      doc = new DOMParser().parseFromString(`<Relationships xmlns="${PKG_REL_NS}"/>`, 'application/xml');
      this.docs[rp] = doc;
    }
    const byId = {};
    for (const r of doc.getElementsByTagNameNS(PKG_REL_NS, 'Relationship')) {
      const external = r.getAttribute('TargetMode') === 'External';
      byId[r.getAttribute('Id')] = { el: r, type: r.getAttribute('Type'), target: r.getAttribute('Target'),
        path: external ? null : resolvePath(partPath, r.getAttribute('Target')) };
    }
    return { doc, byId, path: rp, part: partPath };
  }
  addRel(rels, type, targetPath) {
    let n = 1; while (rels.byId['rId' + n]) n++;
    const id = 'rId' + n;
    const el = rels.doc.createElementNS(PKG_REL_NS, 'Relationship');
    el.setAttribute('Id', id); el.setAttribute('Type', type); el.setAttribute('Target', relTarget(rels.part, targetPath));
    rels.doc.documentElement.appendChild(el);
    rels.byId[id] = { el, type, target: el.getAttribute('Target'), path: targetPath };
    this.touch(rels.path);
    return id;
  }
  async loadSlide(path) {
    const doc = await this.xml(path);
    const rels = await this.rels(path);
    const lr = Object.values(rels.byId).find((r) => r.type === REL.layout);
    const layout = lr ? await this.loadLayout(lr.path) : null;
    const nr = Object.values(rels.byId).find((r) => r.type === REL.notes);
    return { path, doc, rels, layout, notesPath: nr ? nr.path : null };
  }
  async loadLayout(path) {
    this.layoutCache = this.layoutCache || {};
    if (this.layoutCache[path]) return this.layoutCache[path];
    const doc = await this.xml(path);
    const rels = await this.rels(path);
    const mr = Object.values(rels.byId).find((r) => r.type === REL.master);
    const master = mr ? await this.loadMaster(mr.path) : null;
    return (this.layoutCache[path] = { path, doc, rels, master });
  }
  async loadMaster(path) {
    this.masterCache = this.masterCache || {};
    if (this.masterCache[path]) return this.masterCache[path];
    const doc = await this.xml(path);
    const rels = await this.rels(path);
    const tr = Object.values(rels.byId).find((r) => r.type === REL.theme);
    const theme = tr ? await this.xml(tr.path) : null;
    const colors = {};
    let fonts = { major: 'Calibri Light', minor: 'Calibri' };
    if (theme) {
      const cs = theme.getElementsByTagNameNS(A_NS, 'clrScheme')[0];
      for (const c of X.kids(cs)) {
        const v = c.firstElementChild;
        if (v) colors[c.localName] = v.getAttribute('lastClr') || v.getAttribute('val');
      }
      const fs = theme.getElementsByTagNameNS(A_NS, 'fontScheme')[0];
      const mj = X.path(fs, 'majorFont', 'latin'), mn = X.path(fs, 'minorFont', 'latin');
      if (mj) fonts.major = mj.getAttribute('typeface');
      if (mn) fonts.minor = mn.getAttribute('typeface');
    }
    const map = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
    const cm = doc.getElementsByTagNameNS(P_NS, 'clrMap')[0];
    if (cm) for (const k of Object.keys(map)) if (cm.getAttribute(k)) map[k] = cm.getAttribute(k);
    const txStyles = doc.getElementsByTagNameNS(P_NS, 'txStyles')[0];
    return (this.masterCache[path] = { path, doc, rels, colors, clrMap: map, fonts, txStyles });
  }
  async imageUrl(partPath, rid) {
    const rels = await this.rels(partPath);
    const rel = rels.byId[rid];
    if (!rel || !rel.path) return null;
    if (this.blobUrls[rel.path]) return this.blobUrls[rel.path];
    const f = this.zip.file(rel.path);
    if (!f) return null;
    const ext = rel.path.split('.').pop().toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
    if (!mime) return null;
    const blob = new Blob([await f.async('uint8array')], { type: mime });
    return (this.blobUrls[rel.path] = URL.createObjectURL(blob));
  }
  ensureDefaultCT(ext, mime) {
    const root = this.ct.documentElement;
    if (X.kids(root, 'Default').some((d) => d.getAttribute('Extension').toLowerCase() === ext)) return;
    const d = this.ct.createElementNS(CT_NS, 'Default');
    d.setAttribute('Extension', ext); d.setAttribute('ContentType', mime);
    root.insertBefore(d, root.firstChild);
    this.touch('[Content_Types].xml');
  }
  addOverride(path, type) {
    const o = this.ct.createElementNS(CT_NS, 'Override');
    o.setAttribute('PartName', '/' + path); o.setAttribute('ContentType', type);
    this.ct.documentElement.appendChild(o);
    this.touch('[Content_Types].xml');
  }
  removeOverride(path) {
    for (const o of X.kids(this.ct.documentElement, 'Override')) if (o.getAttribute('PartName') === '/' + path) o.remove();
    this.touch('[Content_Types].xml');
  }
  freeName(dir, stem, ext) {
    let n = 1; while (this.zip.file(`${dir}/${stem}${n}.${ext}`) || this.docs[`${dir}/${stem}${n}.${ext}`]) n++;
    return `${dir}/${stem}${n}.${ext}`;
  }
  async save() {
    for (const p of this.dirty) {
      const d = this.docs[p];
      if (d) this.zip.file(p, XML_HEAD + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, ''));
    }
    this.dirty.clear();
    return this.zip.generateAsync({ type: 'blob', compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  /* ---- slide structure ops ---- */
  sldIdLst() { return this.pres.getElementsByTagNameNS(P_NS, 'sldIdLst')[0]; }
  async insertSlideXml(xmlStr, relsStr, index) {
    const path = this.freeName('ppt/slides', 'slide', 'xml');
    const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    this.docs[path] = doc; this.touch(path);
    const rp = relsPathFor(path);
    this.docs[rp] = new DOMParser().parseFromString(relsStr, 'application/xml'); this.touch(rp);
    this.addOverride(path, CT.slide);
    const rid = this.addRel(this.presRels, REL.slide, path);
    const lst = this.sldIdLst();
    let maxId = 255;
    for (const s of X.kids(lst, 'sldId')) maxId = Math.max(maxId, +s.getAttribute('id'));
    const el = X.make(this.pres, 'p:sldId', { id: maxId + 1 });
    el.setAttributeNS(R_NS, 'r:id', rid);
    const ref = X.kids(lst, 'sldId')[index];
    lst.insertBefore(el, ref || null);
    this.touch('ppt/presentation.xml');
    const slide = await this.loadSlide(path);
    this.slides.splice(index, 0, slide);
    return slide;
  }
  async addSlideFromLayout(layoutPath, index) {
    const lay = await this.loadLayout(layoutPath);
    let id = 2;
    let shapes = '';
    for (const sp of lay.doc.getElementsByTagNameNS(P_NS, 'sp')) {
      const ph = sp.getElementsByTagNameNS(P_NS, 'ph')[0];
      if (!ph || ['dt', 'ftr', 'sldNum', 'hdr'].includes(ph.getAttribute('type'))) continue;
      const name = X.path(sp, 'nvSpPr', 'cNvPr').getAttribute('name') || 'Placeholder';
      const phXml = new XMLSerializer().serializeToString(ph).replace(/ xmlns(:\w+)?="[^"]*"/g, '');
      shapes += `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="${escXml(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${phXml.replace(/^<ph/, '<p:ph').replace(/<\/ph>$/, '</p:ph>')}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
    }
    const xml = `${XML_HEAD}<p:sld ${NS_DECL}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const tmp = 'ppt/slides/__new.xml';
    const rels = `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL.layout}" Target="${relTarget(tmp, layoutPath)}"/></Relationships>`;
    return this.insertSlideXml(xml, rels, index);
  }
  async duplicateSlide(i) {
    const s = this.slides[i];
    const xml = new XMLSerializer().serializeToString(s.doc);
    const relsDoc = s.rels.doc.cloneNode(true);
    for (const r of Array.from(relsDoc.getElementsByTagNameNS(PKG_REL_NS, 'Relationship')))
      if (r.getAttribute('Type') === REL.notes) r.remove();
    return this.insertSlideXml(xml, new XMLSerializer().serializeToString(relsDoc), i + 1);
  }
  deleteSlide(i) {
    const s = this.slides[i];
    const lst = this.sldIdLst();
    const rid = Object.entries(this.presRels.byId).find(([, r]) => r.path === s.path)[0];
    for (const e of X.kids(lst, 'sldId')) if (X.rid(e, 'id') === rid) e.remove();
    this.presRels.byId[rid].el.remove(); delete this.presRels.byId[rid];
    this.touch(this.presRels.path); this.touch('ppt/presentation.xml');
    const drop = (p) => {
      this.zip.remove(p); this.zip.remove(relsPathFor(p));
      delete this.docs[p]; delete this.docs[relsPathFor(p)];
      this.dirty.delete(p); this.dirty.delete(relsPathFor(p));
      this.removeOverride(p);
    };
    drop(s.path);
    if (s.notesPath) drop(s.notesPath);
    this.slides.splice(i, 1);
  }
  moveSlide(i, j) {
    const lst = this.sldIdLst();
    const ids = X.kids(lst, 'sldId');
    const el = ids[i];
    el.remove();
    const rest = X.kids(lst, 'sldId');
    lst.insertBefore(el, rest[j] || null);
    this.touch('ppt/presentation.xml');
    const [s] = this.slides.splice(i, 1);
    this.slides.splice(j, 0, s);
  }

  /* ---- notes ---- */
  async notesText(slide) {
    if (!slide.notesPath) return null;
    const d = await this.xml(slide.notesPath);
    if (!d) return null;
    const body = this.notesBody(d);
    if (!body) return '';
    return X.kids(X.kid(body, 'txBody'), 'p').map((p) => Array.from(p.getElementsByTagNameNS(A_NS, 't')).map((t) => t.textContent).join('')).join('\n');
  }
  notesBody(d) {
    for (const sp of d.getElementsByTagNameNS(P_NS, 'sp')) {
      const ph = sp.getElementsByTagNameNS(P_NS, 'ph')[0];
      if (ph && ph.getAttribute('type') === 'body') return sp;
    }
    return null;
  }
  async setNotes(slide, text) {
    if (!slide.notesPath) {
      if (!this.notesMasterPath) return false;
      const path = this.freeName('ppt/notesSlides', 'notesSlide', 'xml');
      const xml = `${XML_HEAD}<p:notes ${NS_DECL}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
      this.docs[path] = new DOMParser().parseFromString(xml, 'application/xml'); this.touch(path);
      const rels = await this.rels(path);
      this.addRel(rels, REL.notesMaster, this.notesMasterPath);
      this.addRel(rels, REL.slide, slide.path);
      this.addRel(slide.rels, REL.notes, path);
      this.addOverride(path, CT.notes);
      slide.notesPath = path;
    }
    const d = await this.xml(slide.notesPath);
    const body = this.notesBody(d);
    if (!body) return false;
    let tx = X.kid(body, 'txBody');
    if (!tx) { tx = X.make(d, 'p:txBody'); tx.append(X.make(d, 'a:bodyPr'), X.make(d, 'a:lstStyle')); body.appendChild(tx); }
    for (const p of X.kids(tx, 'p')) p.remove();
    for (const line of text.split('\n')) {
      const p = X.make(d, 'a:p');
      if (line) { const r = X.make(d, 'a:r'); r.append(X.make(d, 'a:rPr', { lang: 'en-US', dirty: '0' })); const t = X.make(d, 'a:t'); t.textContent = line; r.append(t); p.append(r); }
      tx.appendChild(p);
    }
    this.touch(slide.notesPath);
    return true;
  }
}

/* ===================================================================== */
/* Renderer: turns slide XML into positioned HTML                          */
class SlideRenderer {
  constructor(pptx, slide, opts) {
    this.px = pptx; this.slide = slide; this.opts = opts;
    this.layout = slide.layout; this.master = slide.layout && slide.layout.master;
  }
  color(el, fallback = null) {
    // el: element that contains a colour child (solidFill, rPr, ...)
    if (!el) return fallback;
    const c = X.kids(el).find((k) => /^(srgbClr|schemeClr|sysClr|prstClr|scrgbClr|hslClr)$/.test(k.localName));
    if (!c) return fallback;
    let hex;
    const m = this.master;
    if (c.localName === 'srgbClr') hex = c.getAttribute('val');
    else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (c.getAttribute('val') === 'window' ? 'FFFFFF' : '000000');
    else if (c.localName === 'prstClr') hex = PRST_CLR[c.getAttribute('val')] || '000000';
    else if (c.localName === 'schemeClr') {
      let v = c.getAttribute('val');
      if (v === 'phClr') v = this.phClr || 'accent1';
      if (m && m.clrMap[v]) v = m.clrMap[v];
      hex = (m && m.colors[v]) || { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4' }[v] || '000000';
    } else hex = '000000';
    let rgb = hexToRgb(hex || '000000');
    let alpha = 1;
    for (const mod of X.kids(c)) {
      const v = X.num(mod, 'val') / 100000;
      switch (mod.localName) {
        case 'lumMod': { const h = rgbToHsl(rgb); h[2] *= v; rgb = hslToRgb(h); break; }
        case 'lumOff': { const h = rgbToHsl(rgb); h[2] = Math.min(1, h[2] + v); rgb = hslToRgb(h); break; }
        case 'tint': rgb = rgb.map((x) => x + (255 - x) * (1 - v)); break;
        case 'shade': rgb = rgb.map((x) => x * v); break;
        case 'alpha': alpha = v; break;
        default: break;
      }
    }
    const hx = rgbToHex(rgb);
    return alpha < 1 ? `rgba(${rgb.map(Math.round).join(',')},${alpha.toFixed(2)})` : '#' + hx;
  }
  fill(spPr, styleRef) {
    if (spPr) {
      if (X.kid(spPr, 'noFill')) return 'none';
      const sf = X.kid(spPr, 'solidFill'); if (sf) return this.color(sf);
      const gf = X.kid(spPr, 'gradFill');
      if (gf) {
        const stops = X.kids(X.kid(gf, 'gsLst'), 'gs').map((g) => `${this.color(g)} ${X.num(g, 'pos') / 1000}%`);
        const lin = X.kid(gf, 'lin');
        const ang = lin ? X.num(lin, 'ang') / 60000 + 90 : 180;
        if (stops.length) return `linear-gradient(${ang}deg, ${stops.join(',')})`;
      }
      if (X.kid(spPr, 'blipFill')) return null;
    }
    if (styleRef && X.num(styleRef, 'idx') > 0) return this.color(styleRef);
    return 'none';
  }
  line(spPr, styleRef) {
    const ln = spPr && X.kid(spPr, 'ln');
    let w = ln && ln.getAttribute('w') ? X.num(ln, 'w') / EMU_PT : 0.75;
    if (ln && X.kid(ln, 'noFill')) return null;
    if (ln && X.kid(ln, 'solidFill')) return { w, c: this.color(X.kid(ln, 'solidFill')), dash: !!X.kid(ln, 'prstDash') && X.kid(ln, 'prstDash').getAttribute('val') !== 'solid' };
    if (styleRef && X.num(styleRef, 'idx') > 0) return { w, c: this.color(styleRef) };
    return null;
  }
  /* placeholder helpers */
  phOf(sp) {
    const nv = X.kid(sp, 'nvSpPr') || X.kid(sp, 'nvPicPr') || X.kid(sp, 'nvGraphicFramePr') || X.kid(sp, 'nvGrpSpPr');
    return nv ? X.path(nv, 'nvPr', 'ph') : null;
  }
  findPh(doc, ph, byTypeOnly) {
    if (!doc || !ph) return null;
    const type = ph.getAttribute('type') || 'obj';
    const idx = ph.getAttribute('idx');
    const norm = (t) => ({ ctrTitle: 'title', subTitle: 'body', obj: 'body' }[t] || t);
    let byType = null;
    for (const sp of doc.getElementsByTagNameNS(P_NS, 'sp')) {
      const p2 = this.phOf(sp);
      if (!p2) continue;
      const t2 = p2.getAttribute('type') || 'obj';
      if (!byTypeOnly && idx != null && p2.getAttribute('idx') === idx) return sp;
      if (!byType && (t2 === type || norm(t2) === norm(type))) byType = sp;
    }
    return byType;
  }
  phChain(sp) {
    const ph = this.phOf(sp);
    if (!ph) return { ph: null, layoutSp: null, masterSp: null, kind: 'other' };
    const layoutSp = this.findPh(this.layout && this.layout.doc, ph, false);
    const masterSp = this.findPh(this.master && this.master.doc, layoutSp ? this.phOf(layoutSp) : ph, true);
    const type = ph.getAttribute('type') || 'obj';
    const kind = type === 'title' || type === 'ctrTitle' ? 'title' : ['body', 'subTitle', 'obj'].includes(type) ? 'body' : 'other';
    return { ph, layoutSp, masterSp, kind, type };
  }
  xfrmOf(sp, chain) {
    const pr = X.kid(sp, 'spPr') || X.kid(sp, 'grpSpPr');
    let xf = pr ? X.kid(pr, 'xfrm') : X.kid(sp, 'xfrm');
    if (!xf && chain) {
      for (const s of [chain.layoutSp, chain.masterSp]) if (s && (xf = X.path(s, 'spPr', 'xfrm'))) break;
    }
    if (!xf) return null;
    const off = X.kid(xf, 'off'), ext = X.kid(xf, 'ext');
    if (!off || !ext) return null;
    return { x: X.num(off, 'x'), y: X.num(off, 'y'), w: X.num(ext, 'cx'), h: X.num(ext, 'cy'),
      rot: X.num(xf, 'rot') / 60000, flipH: xf.getAttribute('flipH') === '1', flipV: xf.getAttribute('flipV') === '1', el: xf };
  }

  /* ---- slide ---- */
  async render() {
    const W = this.px.cx / EMU_PT, H = this.px.cy / EMU_PT;
    const root = document.createElement('div');
    root.className = 'slide';
    root.style.width = W + 'pt'; root.style.height = H + 'pt';
    if (this.master) root.style.fontFamily = `'${this.master.fonts.minor}', Calibri, Carlito, Arial, sans-serif`;
    await this.background(root);
    const showMasterSp = (d) => { const r = d && d.documentElement; return !r || r.getAttribute('showMasterSp') !== '0'; };
    if (this.master && showMasterSp(this.slide.doc) && showMasterSp(this.layout.doc))
      await this.tree(this.master, root, true);
    if (this.layout && showMasterSp(this.slide.doc)) await this.tree(this.layout, root, true);
    await this.tree(this.slide, root, false);
    return root;
  }
  async background(root) {
    for (const part of [this.slide, this.layout, this.master]) {
      if (!part) continue;
      const bg = X.path(part.doc.documentElement, 'cSld', 'bg');
      if (!bg) continue;
      const bgPr = X.kid(bg, 'bgPr');
      if (bgPr) {
        const blip = X.path(bgPr, 'blipFill', 'blip');
        if (blip) {
          const url = await this.px.imageUrl(part.path, X.rid(blip));
          if (url) { root.style.background = `url("${url}") center/cover no-repeat`; return; }
        }
        const f = this.fill(bgPr, null);
        if (f && f !== 'none') { root.style.background = f; return; }
      }
      const ref = X.kid(bg, 'bgRef');
      if (ref) { root.style.background = this.color(ref) || '#fff'; return; }
    }
    root.style.background = '#fff';
  }
  async tree(part, root, isTemplate) {
    const tree = X.path(part.doc.documentElement, 'cSld', 'spTree');
    if (!tree) return;
    const saved = this.curPart;
    this.curPart = part;
    for (const el of X.kids(tree)) {
      if (isTemplate && this.phOf(el)) continue; // placeholders on layouts/masters are prompts only
      const node = await this.shape(el, isTemplate, null);
      if (node) root.appendChild(node);
    }
    this.curPart = saved;
  }
  place(div, xf, map) {
    let { x, y, w, h } = xf;
    if (map) ({ x, y, w, h } = map(xf));
    div.style.left = x / EMU_PT + 'pt'; div.style.top = y / EMU_PT + 'pt';
    div.style.width = w / EMU_PT + 'pt'; div.style.height = h / EMU_PT + 'pt';
    const tf = [];
    if (xf.rot) tf.push(`rotate(${xf.rot}deg)`);
    if (tf.length) div.style.transform = tf.join(' ');
  }
  async shape(el, isTemplate, map) {
    const ln = el.localName;
    if (ln === 'AlternateContent') {
      const choice = X.kid(el, 'Choice'), fb = X.kid(el, 'Fallback');
      const pick = (choice && X.kids(choice).find((k) => /^(sp|pic|grpSp|graphicFrame|cxnSp)$/.test(k.localName))) || (fb && X.kids(fb)[0]);
      return pick ? this.shape(pick, true, map) : null;
    }
    if (!/^(sp|pic|grpSp|graphicFrame|cxnSp)$/.test(ln)) return null;
    const chain = this.phChain(el);
    const xf = ln === 'graphicFrame' ? this.xfrmOf({ children: [X.kid(el, 'xfrm')].filter(Boolean) }, null) : this.xfrmOf(el, chain);
    if (!xf) return null;
    const div = document.createElement('div');
    div.className = 'shp';
    this.place(div, xf, map);
    div._xml = el; div._part = this.curPart; div._template = isTemplate;
    if (isTemplate) div.style.pointerEvents = 'none';

    if (ln === 'grpSp') {
      const gx = X.path(el, 'grpSpPr', 'xfrm');
      const chOff = X.kid(gx, 'chOff'), chExt = X.kid(gx, 'chExt');
      const cx0 = X.num(chOff, 'x'), cy0 = X.num(chOff, 'y');
      const sx = X.num(chExt, 'cx') ? xf.w / X.num(chExt, 'cx') : 1, sy = X.num(chExt, 'cy') ? xf.h / X.num(chExt, 'cy') : 1;
      const inner = (c) => ({ x: (c.x - cx0) * sx, y: (c.y - cy0) * sy, w: c.w * sx, h: c.h * sy });
      for (const c of X.kids(el)) {
        const n = await this.shape(c, isTemplate, inner);
        if (n) { n.classList.add('child'); n.style.pointerEvents = 'none'; div.appendChild(n); }
      }
      div.dataset.kind = 'group';
      return div;
    }
    if (ln === 'pic') {
      const blip = el.getElementsByTagNameNS(A_NS, 'blip')[0];
      const url = blip && (await this.px.imageUrl(this.curPart.path, X.rid(blip)));
      if (url) {
        const img = document.createElement('img');
        img.className = 'pic'; img.src = url; img.alt = ''; img.draggable = false;
        const src = X.path(el, 'blipFill', 'srcRect');
        if (src) {
          const l = X.num(src, 'l') / 1000, t = X.num(src, 't') / 1000, r = X.num(src, 'r') / 1000, b = X.num(src, 'b') / 1000;
          const ww = 100 / (100 - l - r) * 100, hh = 100 / (100 - t - b) * 100;
          img.style.cssText = `position:absolute;width:${ww}%;height:${hh}%;left:${-l * ww / 100}%;top:${-t * hh / 100}%;max-width:none`;
          div.style.overflow = 'hidden';
        }
        if (xf.flipH || xf.flipV) img.style.transform = `scale(${xf.flipH ? -1 : 1},${xf.flipV ? -1 : 1})`;
        const geom = X.path(el, 'spPr', 'prstGeom');
        if (geom && geom.getAttribute('prst') === 'ellipse') { div.style.borderRadius = '50%'; div.style.overflow = 'hidden'; }
        div.appendChild(img);
      }
      div.dataset.kind = 'pic';
      return div;
    }
    if (ln === 'graphicFrame') {
      const tbl = el.getElementsByTagNameNS(A_NS, 'tbl')[0];
      if (tbl) div.appendChild(this.table(tbl));
      else {
        div.classList.add('other');
        const uri = (el.getElementsByTagNameNS(A_NS, 'graphicData')[0] || { getAttribute: () => '' }).getAttribute('uri') || '';
        div.textContent = /chart/.test(uri) ? '📈 Chart (kept unchanged)' : /diagram/.test(uri) ? 'SmartArt (kept unchanged)' : 'Object (kept unchanged)';
      }
      div.dataset.kind = 'frame';
      return div;
    }
    // sp or cxnSp
    const spPr = X.kid(el, 'spPr');
    const style = X.kid(el, 'style');
    let fill = this.fill(spPr, style && X.kid(style, 'fillRef'));
    let line = this.line(spPr, style && X.kid(style, 'lnRef'));
    if (chain.ph && (!spPr || !spPr.children.length)) {
      // inherit look from layout/master placeholder
      for (const s of [chain.layoutSp, chain.masterSp]) {
        const pr = s && X.kid(s, 'spPr');
        if (pr && (X.kid(pr, 'solidFill') || X.kid(pr, 'gradFill'))) { fill = this.fill(pr, null); break; }
      }
    }
    const geomEl = spPr && X.kid(spPr, 'prstGeom');
    const prst = geomEl ? geomEl.getAttribute('prst') : ln === 'cxnSp' ? 'line' : 'rect';
    const cust = spPr && X.kid(spPr, 'custGeom');
    if (/^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(prst) || ln === 'cxnSp') {
      const svg = this.svg(`<line x1="${xf.flipH ? 100 : 0}" y1="${xf.flipV ? 100 : 0}" x2="${xf.flipH ? 0 : 100}" y2="${xf.flipV ? 0 : 100}"/>`, 'none', line || { w: 1, c: '#000' });
      div.appendChild(svg);
      div.dataset.kind = 'line';
      return div;
    }
    if (cust) {
      const p = this.custPath(cust);
      if (p) div.appendChild(this.svg(`<path d="${p}"/>`, fill, line));
    } else if (PRESET_POLY[prst]) {
      div.appendChild(this.svg(`<polygon points="${PRESET_POLY[prst]}"/>`, fill, line));
      if (xf.flipH || xf.flipV) div.lastChild.style.transform = `scale(${xf.flipH ? -1 : 1},${xf.flipV ? -1 : 1})`;
    } else {
      if (fill && fill !== 'none') div.style.background = fill;
      if (line) div.style.border = `${Math.max(line.w, 0.5)}pt ${line.dash ? 'dashed' : 'solid'} ${line.c}`;
      if (prst === 'ellipse' || prst === 'flowChartConnector') div.style.borderRadius = '50%';
      else if (prst === 'roundRect') div.style.borderRadius = Math.min(xf.w, xf.h) / EMU_PT * 0.1667 + 'pt';
    }
    const blip = spPr && X.path(spPr, 'blipFill', 'blip');
    if (blip) {
      const url = await this.px.imageUrl(this.curPart.path, X.rid(blip));
      if (url) div.style.background = `url("${url}") center/cover`;
    }
    const txBody = X.kid(el, 'txBody');
    if (txBody || (!isTemplate && ln === 'sp')) {
      const fontColor = style && X.kid(style, 'fontRef') ? this.color(X.kid(style, 'fontRef')) : null;
      div.appendChild(this.text(el, txBody, chain, fontColor, isTemplate));
    }
    div.dataset.kind = 'sp';
    return div;
  }
  svg(inner, fill, line) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('preserveAspectRatio', 'none');
    s.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
    s.innerHTML = inner;
    const shape = s.firstElementChild;
    const gradient = fill && /gradient/.test(fill);
    shape.setAttribute('fill', !fill || fill === 'none' ? 'none' : gradient ? (/#[0-9A-F]{6}/i.exec(fill) || ['#888'])[0] : fill);
    if (line) { shape.setAttribute('stroke', line.c); shape.setAttribute('stroke-width', Math.max(line.w, 0.5) * 4 / 3); shape.setAttribute('vector-effect', 'non-scaling-stroke'); }
    return s;
  }
  custPath(cust) {
    const path = cust.getElementsByTagNameNS(A_NS, 'path')[0];
    if (!path) return null;
    const pw = X.num(path, 'w', 1) || 1, ph = X.num(path, 'h', 1) || 1;
    const pt = (p) => `${(X.num(p, 'x') / pw * 100).toFixed(2)},${(X.num(p, 'y') / ph * 100).toFixed(2)}`;
    let d = '';
    for (const c of X.kids(path)) {
      const pts = X.kids(c, 'pt');
      if (c.localName === 'moveTo') d += 'M' + pt(pts[0]) + ' ';
      else if (c.localName === 'lnTo') d += 'L' + pt(pts[0]) + ' ';
      else if (c.localName === 'cubicBezTo') d += 'C' + pts.map(pt).join(' ') + ' ';
      else if (c.localName === 'quadBezTo') d += 'Q' + pts.map(pt).join(' ') + ' ';
      else if (c.localName === 'close') d += 'Z ';
    }
    return d;
  }
  table(tbl) {
    const t = document.createElement('table');
    t.style.cssText = 'width:100%;height:100%;border-collapse:collapse;table-layout:fixed;font-size:14pt';
    const grid = X.kids(X.kid(tbl, 'tblGrid'), 'gridCol').map((g) => X.num(g, 'w'));
    const total = grid.reduce((a, b) => a + b, 0) || 1;
    const cg = document.createElement('colgroup');
    for (const g of grid) { const c = document.createElement('col'); c.style.width = (g / total * 100) + '%'; cg.appendChild(c); }
    t.appendChild(cg);
    const firstRow = X.kid(tbl, 'tblPr') && X.kid(tbl, 'tblPr').getAttribute('firstRow') === '1';
    X.kids(tbl, 'tr').forEach((tr, ri) => {
      const r = document.createElement('tr');
      for (const tc of X.kids(tr, 'tc')) {
        if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') continue;
        const td = document.createElement('td');
        if (tc.getAttribute('gridSpan')) td.colSpan = +tc.getAttribute('gridSpan');
        if (tc.getAttribute('rowSpan')) td.rowSpan = +tc.getAttribute('rowSpan');
        const pr = X.kid(tc, 'tcPr');
        const f = pr && this.fill(pr, null);
        const accent = '#' + ((this.master && this.master.colors.accent1) || '4472C4');
        const head = ri === 0 && firstRow;
        const bgc = f && f !== 'none' ? f : head ? accent : ri % 2 ? '#E9EBF5' : '#CFD5EA';
        td.style.cssText = `border:1px solid #fff;padding:3pt 6pt;vertical-align:top;background:${bgc}`;
        if (head) { td.style.color = '#fff'; td.style.fontWeight = 'bold'; }
        const txb = X.kid(tc, 'txBody');
        td.innerHTML = txb ? X.kids(txb, 'p').map((p) => escXml(Array.from(p.getElementsByTagNameNS(A_NS, 't')).map((x) => x.textContent).join(''))).join('<br>') : '';
        for (const rp of tc.getElementsByTagNameNS(A_NS, 'rPr')) {
          if (rp.getAttribute('sz')) { td.style.fontSize = X.num(rp, 'sz') / 100 + 'pt'; break; }
        }
        r.appendChild(td);
      }
      t.appendChild(r);
    });
    return t;
  }

  /* ---- text with style inheritance ---- */
  lvlPr(container, lvl) {
    if (!container) return null;
    return X.kid(container, `lvl${lvl + 1}pPr`) || null;
  }
  levelSources(chain, lstStyle, lvl) {
    const srcs = [];
    if (lstStyle) srcs.push(this.lvlPr(lstStyle, lvl));
    if (chain.ph) {
      for (const s of [chain.layoutSp, chain.masterSp]) if (s) srcs.push(this.lvlPr(X.path(s, 'txBody', 'lstStyle'), lvl));
      const ts = this.master && this.master.txStyles;
      if (ts) srcs.push(this.lvlPr(X.kid(ts, chain.kind === 'title' ? 'titleStyle' : chain.kind === 'body' ? 'bodyStyle' : 'otherStyle'), lvl));
    } else {
      if (this.px.defaultTextStyle) srcs.push(this.lvlPr(this.px.defaultTextStyle, lvl));
      const ts = this.master && this.master.txStyles;
      if (ts) srcs.push(this.lvlPr(X.kid(ts, 'otherStyle'), lvl));
    }
    return srcs.filter(Boolean);
  }
  bodyPrChain(txBody, chain) {
    const list = [txBody && X.kid(txBody, 'bodyPr')];
    for (const s of [chain.layoutSp, chain.masterSp]) if (s) list.push(X.path(s, 'txBody', 'bodyPr'));
    return list.filter(Boolean);
  }
  firstAttr(list, a) { for (const e of list) if (e && e.hasAttribute(a)) return e.getAttribute(a); return null; }
  font(face) {
    if (!face) return null;
    if (face === '+mj-lt' || face === '+mj-ea') return this.master ? this.master.fonts.major : null;
    if (face === '+mn-lt' || face === '+mn-ea') return this.master ? this.master.fonts.minor : null;
    return face;
  }
  runStyle(rPrList, fontColor, nSpecific = rPrList.length) {
    // rPrList ordered most-specific first; the shape's fontRef colour sits between the
    // first nSpecific entries (run / paragraph / shape list style) and inherited styles
    const pick = (a) => this.firstAttr(rPrList, a);
    const st = {};
    const sz = pick('sz'); st.sz = sz ? +sz / 100 : 18;
    st.b = pick('b') === '1' || pick('b') === 'true';
    st.i = pick('i') === '1' || pick('i') === 'true';
    const u = pick('u'); st.u = !!u && u !== 'none';
    const strike = pick('strike'); st.s = !!strike && strike !== 'noStrike';
    let col = null;
    for (let k = 0; k < rPrList.length; k++) {
      if (k === nSpecific && fontColor) { col = fontColor; break; }
      const sf = X.kid(rPrList[k], 'solidFill');
      if (sf) { col = this.color(sf); break; }
    }
    st.color = col || fontColor || '#000000';
    for (const r of rPrList) { const l = X.kid(r, 'latin'); if (l) { st.font = this.font(l.getAttribute('typeface')); break; } }
    const base = pick('baseline'); st.baseline = base ? +base / 1000 : 0;
    const cap = pick('cap'); st.caps = cap === 'all';
    return st;
  }
  applyRun(span, st, scale) {
    span.style.fontSize = +(st.sz * scale).toFixed(2) + 'pt';
    if (st.b) span.style.fontWeight = 'bold';
    if (st.i) span.style.fontStyle = 'italic';
    const deco = [st.u && 'underline', st.s && 'line-through'].filter(Boolean).join(' ');
    if (deco) span.style.textDecoration = deco;
    span.style.color = st.color;
    if (st.font) span.style.fontFamily = `'${st.font}'`;
    if (st.baseline) { span.style.verticalAlign = st.baseline > 0 ? 'super' : 'sub'; span.style.fontSize = +(st.sz * scale * 0.7).toFixed(2) + 'pt'; }
    if (st.caps) span.style.textTransform = 'uppercase';
    span._base = { b: st.b, i: st.i, u: st.u, s: st.s, sz: parseFloat(span.style.fontSize), color: toHex(st.color) || '000000' };
  }
  text(sp, txBody, chain, fontColor, isTemplate) {
    const tx = document.createElement('div');
    tx.className = 'tx';
    const bp = this.bodyPrChain(txBody, chain);
    const ins = (a, d) => { const v = this.firstAttr(bp, a); return (v == null ? d : +v) / EMU_PT + 'pt'; };
    tx.style.padding = `${ins('tIns', 45720)} ${ins('rIns', 91440)} ${ins('bIns', 45720)} ${ins('lIns', 91440)}`;
    const anchor = this.firstAttr(bp, 'anchor') || 't';
    tx.style.justifyContent = { t: 'flex-start', ctr: 'center', b: 'flex-end' }[anchor] || 'flex-start';
    if (this.firstAttr(bp, 'wrap') === 'none') tx.style.whiteSpace = 'pre';
    const vert = this.firstAttr(bp, 'vert');
    if (vert && vert !== 'horz') tx.style.writingMode = 'vertical-rl';
    let scale = 1;
    const na = bp[0] && X.kid(bp[0], 'normAutofit');
    if (na && na.getAttribute('fontScale')) scale = X.num(na, 'fontScale') / 100000;
    tx._scale = scale;
    const lstStyle = txBody && X.kid(txBody, 'lstStyle');
    const paras = txBody ? X.kids(txBody, 'p') : [];
    const autoNums = {};
    let hasText = false;
    paras.forEach((p) => {
      const pPr = X.kid(p, 'pPr');
      const lvl = pPr ? X.num(pPr, 'lvl') : 0;
      const lvlSrcs = this.levelSources(chain, lstStyle, lvl);
      const srcs = [pPr, ...lvlSrcs].filter(Boolean);
      const lstLvl = this.lvlPr(lstStyle, lvl);
      const nSpecDef = [pPr, lstLvl].filter((s) => s && X.kid(s, 'defRPr')).length;
      const div = document.createElement('div');
      div._pPr = pPr; div._endRPr = X.kid(p, 'endParaRPr');
      const algn = this.firstAttr(srcs, 'algn');
      div.style.textAlign = { ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || 'left';
      div._algn = algn;
      const marL = this.firstAttr(srcs, 'marL'), indent = this.firstAttr(srcs, 'indent');
      if (marL) div.style.paddingLeft = (+marL / EMU_PT) + 'pt';
      if (indent) div.style.textIndent = (+indent / EMU_PT) + 'pt';
      // line spacing
      for (const s of srcs) { const ls = X.path(s, 'lnSpc', 'spcPct'); if (ls) { div.style.lineHeight = (X.num(ls, 'val') / 100000 * 1.2 * (scale < 1 ? 0.95 : 1)).toFixed(2); break; } }
      for (const s of srcs) { const sb = X.path(s, 'spcBef', 'spcPts'); if (sb) { div.style.marginTop = X.num(sb, 'val') / 100 * scale + 'pt'; break; } }
      for (const s of srcs) { const sa = X.path(s, 'spcAft', 'spcPts'); if (sa) { div.style.marginBottom = X.num(sa, 'val') / 100 * scale + 'pt'; break; } }
      const defRPrs = srcs.map((s) => X.kid(s, 'defRPr')).filter(Boolean);
      const runs = X.kids(p).filter((k) => /^(r|br|fld)$/.test(k.localName));
      // bullets
      let bu = null;
      for (const s of srcs) {
        if (X.kid(s, 'buNone')) break;
        const bc = X.kid(s, 'buChar'); if (bc) { bu = bc.getAttribute('char'); break; }
        const ba = X.kid(s, 'buAutoNum');
        if (ba) {
          const key = lvl + (ba.getAttribute('type') || '');
          autoNums[key] = (autoNums[key] || X.num(ba, 'startAt', 1) - 1) + 1;
          const n = autoNums[key];
          const t = ba.getAttribute('type') || 'arabicPeriod';
          const nm = /alphaLc/.test(t) ? String.fromCharCode(96 + n) : /alphaUc/.test(t) ? String.fromCharCode(64 + n) : /romanLc/.test(t) ? ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n - 1] || n : n;
          bu = nm + (/Paren(R|Both)$/.test(t) ? ')' : '.');
          break;
        }
      }
      if (bu && runs.some((r) => r.localName !== 'br')) {
        div.classList.add('bul'); div.dataset.bu = bu;
        if (indent && +indent < 0) div.style.setProperty('--buw', (-indent / EMU_PT) + 'pt');
      }
      else for (const k of Object.keys(autoNums)) if (+k[0] >= lvl) delete autoNums[k];
      const endList = [div._endRPr, ...defRPrs].filter(Boolean);
      const endSt = this.runStyle(endList, fontColor, nSpecDef + (div._endRPr ? 1 : 0));
      div._defBase = null;
      const probe = document.createElement('span'); this.applyRun(probe, endSt, scale);
      div._defBase = probe._base; div._defStyle = probe.style.cssText;
      div.style.fontSize = probe.style.fontSize; div.style.color = probe.style.color;
      if (endSt.font) div.style.fontFamily = probe.style.fontFamily;
      for (const r of runs) {
        if (r.localName === 'br') { const br = document.createElement('br'); br._rPr = X.kid(r, 'rPr'); div.appendChild(br); continue; }
        const rPr = X.kid(r, 'rPr');
        const st = this.runStyle([rPr, ...defRPrs].filter(Boolean), fontColor, nSpecDef + (rPr ? 1 : 0));
        const span = document.createElement('span');
        span.textContent = (X.kid(r, 't') || { textContent: '' }).textContent;
        span._rPr = rPr;
        if (r.localName === 'fld') span._fld = r;
        this.applyRun(span, st, scale);
        if (span.textContent) hasText = true;
        div.appendChild(span);
      }
      tx.appendChild(div);
    });
    if (!tx.children.length) {
      const div = document.createElement('div');
      const lv0 = this.levelSources(chain, lstStyle, 0);
      const st = this.runStyle(lv0.map((s) => X.kid(s, 'defRPr')).filter(Boolean), fontColor, this.lvlPr(lstStyle, 0) && X.kid(this.lvlPr(lstStyle, 0), 'defRPr') ? 1 : 0);
      const probe = document.createElement('span'); this.applyRun(probe, st, scale);
      div._defBase = probe._base; div.style.fontSize = probe.style.fontSize; div.style.color = probe.style.color;
      tx.appendChild(div);
    }
    tx._chainDef = tx.firstChild._defBase;
    if (chain.ph && !hasText && this.opts.editable && !isTemplate) {
      tx.classList.add('empty-ph');
      tx.dataset.prompt = chain.kind === 'title' ? 'Click to add title' : chain.type === 'subTitle' ? 'Click to add subtitle' : 'Click to add text';
      for (const d of tx.children) d.dataset.prompt = tx.dataset.prompt;
    }
    if (this.opts.editable && !isTemplate) tx.contentEditable = 'true';
    return tx;
  }
}

/* ===================================================================== */
/* Text serialisation: HTML (edited) -> a:p elements                       */
const TextWriter = {
  effective(node, para) {
    // compute visible formatting of a text node
    const el = node.nodeType === 3 ? node.parentElement : node;
    const cs = getComputedStyle(el);
    let u = false, s = false;
    for (let e = el; e && e !== para.parentElement; e = e.parentElement) {
      const d = getComputedStyle(e).textDecorationLine || '';
      if (/underline/.test(d)) u = true;
      if (/line-through/.test(d)) s = true;
    }
    return {
      b: +cs.fontWeight >= 600 || cs.fontWeight === 'bold',
      i: cs.fontStyle === 'italic',
      u, s,
      sz: Math.round(parseFloat(cs.fontSize) * 0.75 * 100) / 100,
      color: toHex(cs.color) || '000000',
    };
  },
  origRun(node, para) {
    for (let e = node.nodeType === 3 ? node.parentElement : node; e && e !== para; e = e.parentElement)
      if (e._rPr !== undefined || e._base) return e;
    return null;
  },
  paragraphs(tx) {
    // flatten editor DOM into a list of paragraph elements (or groups of loose inline nodes)
    const out = [];
    let loose = null;
    const visit = (parent) => {
      for (const n of Array.from(parent.childNodes)) {
        if (n.nodeType === 1 && /^(DIV|P|LI|H\d)$/.test(n.tagName)) {
          loose = null;
          const blockKids = Array.from(n.children).some((c) => /^(DIV|P|LI|H\d)$/.test(c.tagName));
          if (blockKids) visit(n); else out.push({ el: n, nodes: Array.from(n.childNodes) });
        } else {
          if (!loose) { loose = { el: parent, nodes: [], loose: true }; out.push(loose); }
          loose.nodes.push(n);
        }
      }
    };
    visit(tx);
    return out;
  },
  write(doc, txBody, tx, scale = 1) {
    const D = doc;
    for (const p of X.kids(txBody, 'p')) p.remove();
    const paras = this.paragraphs(tx);
    let lastPPr = null, lastEnd = null;
    for (const para of paras) {
      const pel = para.el;
      const p = X.make(D, 'a:p');
      const pPrSrc = pel._pPr !== undefined ? pel._pPr : lastPPr;
      let pPr = pPrSrc ? pPrSrc.cloneNode(true) : null;
      lastPPr = pPrSrc;
      // alignment override
      const want = { center: 'ctr', right: 'r', justify: 'just', left: 'l' }[pel.style && pel.style.textAlign] || null;
      if (want && pel !== tx && want !== (pel._algn || 'l')) { pPr = pPr || X.make(D, 'a:pPr'); pPr.setAttribute('algn', want); }
      if (pPr) p.appendChild(pPr);
      const base = pel._defBase || tx._chainDef || { b: false, i: false, u: false, s: false, sz: 18, color: '000000' };
      // walk text
      const runs = [];
      const walk = (n) => {
        if (n.nodeType === 3) {
          if (!n.textContent) return;
          const orig = this.origRun(n, pel);
          const eff = this.effective(n, pel);
          runs.push({ text: n.textContent.replace(/ /g, ' ').replace(/\n/g, ''), orig, eff });
        } else if (n.nodeType === 1) {
          if (n.tagName === 'BR') { if (n.nextSibling || n.parentElement !== pel) runs.push({ br: true, orig: n }); return; }
          for (const c of Array.from(n.childNodes)) walk(c);
        }
      };
      for (const n of para.nodes) walk(n);
      // merge
      const merged = [];
      for (const r of runs) {
        const prev = merged[merged.length - 1];
        if (prev && !prev.br && !r.br && prev.orig === r.orig && JSON.stringify(prev.eff) === JSON.stringify(r.eff)) prev.text += r.text;
        else merged.push({ ...r });
      }
      // trailing <br> Chrome adds to empty lines
      while (merged.length && merged[merged.length - 1].br && merged.length === 1) merged.pop();
      for (const r of merged) {
        if (r.br) { const br = X.make(D, 'a:br'); if (r.orig && r.orig._rPr) br.appendChild(r.orig._rPr.cloneNode(true)); p.appendChild(br); continue; }
        const ref = r.orig && r.orig._base ? r.orig._base : base;
        const rPrSrc = r.orig ? r.orig._rPr : (pel._endRPr || null);
        let rp;
        if (rPrSrc && rPrSrc.localName === 'rPr') rp = rPrSrc.cloneNode(true);
        else {
          rp = X.make(D, 'a:rPr', { lang: 'en-US', dirty: '0' });
          if (rPrSrc) { // copy from endParaRPr
            for (const at of Array.from(rPrSrc.attributes)) rp.setAttribute(at.name, at.value);
            for (const c of Array.from(rPrSrc.childNodes)) rp.appendChild(c.cloneNode(true));
          }
        }
        const e = r.eff;
        if (e.b !== ref.b) rp.setAttribute('b', e.b ? '1' : '0');
        if (e.i !== ref.i) rp.setAttribute('i', e.i ? '1' : '0');
        if (e.u !== ref.u) rp.setAttribute('u', e.u ? 'sng' : 'none');
        if (e.s !== ref.s) rp.setAttribute('strike', e.s ? 'sngStrike' : 'noStrike');
        if (Math.abs(e.sz - ref.sz) > 0.3) rp.setAttribute('sz', Math.round(e.sz / scale * 100));
        if (e.color !== ref.color) {
          for (const k of X.kids(rp)) if (/Fill$/.test(k.localName)) k.remove();
          const sf = X.make(D, 'a:solidFill'); sf.appendChild(X.make(D, 'a:srgbClr', { val: e.color }));
          // solidFill must come after ln and before effects/latin etc.
          const ln = X.kid(rp, 'ln');
          rp.insertBefore(sf, ln ? ln.nextSibling : rp.firstChild);
        }
        const run = X.make(D, r.orig && r.orig._fld && r.orig.textContent === r.text ? 'a:fld' : 'a:r');
        if (run.localName === 'fld') for (const at of Array.from(r.orig._fld.attributes)) run.setAttribute(at.name, at.value);
        run.appendChild(rp);
        const t = X.make(D, 'a:t'); t.textContent = r.text; run.appendChild(t);
        p.appendChild(run);
      }
      const end = pel._endRPr !== undefined ? pel._endRPr : lastEnd;
      lastEnd = end;
      if (end) p.appendChild(end.cloneNode(true));
      txBody.appendChild(p);
    }
    if (!X.kids(txBody, 'p').length) txBody.appendChild(X.make(D, 'a:p'));
  },
};

/* ===================================================================== */
/* Editor UI                                                               */
const PptEditor = {
  px: null, cur: 0, sel: null, undo: [], redo: [], fileName: 'Untitled.pptx', dirty: false,
  init() {
    this.wrap = $('#slideWrap');
    this.stage = $('#stage');
    $('#pAddSlide').onclick = () => this.addSlide();
    $('#pDupSlide').onclick = () => this.dupSlide();
    $('#pDelSlide').onclick = () => this.delSlide();
    $('#pUp').onclick = () => this.moveSlide(-1);
    $('#pDown').onclick = () => this.moveSlide(1);
    $('#pTextBox').onclick = () => this.insertShape('text');
    $('#pRect').onclick = () => this.insertShape('rect');
    $('#pEllipse').onclick = () => this.insertShape('ellipse');
    $('#pImage').onclick = () => $('#pImageInput').click();
    $('#pImageInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) this.insertImage(f); };
    $('#pDelShape').onclick = () => this.deleteShape();
    $('#pFront').onclick = () => this.zorder(true);
    $('#pBack').onclick = () => this.zorder(false);
    $('#pUndo').onclick = () => this.doUndo();
    $('#pRedo').onclick = () => this.doRedo();
    $('#pPresent').onclick = () => this.present();
    $$('#pptToolbar [data-pcmd]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); this.textCmd(b.dataset.pcmd); }));
    $$('#pptToolbar [data-palign]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); this.align(b.dataset.palign); }));
    $('#pSize').addEventListener('mousedown', () => this.keepSel());
    $('#pSize').addEventListener('change', (e) => { if (e.target.value) this.textCmd('size', e.target.value); e.target.value = ''; });
    const color = (id, fn) => {
      const inp = $(id);
      inp.parentElement.style.setProperty('--swatch', inp.value);
      inp.addEventListener('mousedown', () => this.keepSel());
      inp.addEventListener('input', () => inp.parentElement.style.setProperty('--swatch', inp.value));
      inp.addEventListener('change', () => fn(inp.value));
    };
    color('#pColor', (v) => this.textCmd('foreColor', v));
    color('#pFill', (v) => this.setFill(v));
    color('#pBg', (v) => this.setBg(v));
    $('#pNoFill').onclick = () => this.setFill(null);
    $('#pNotes').addEventListener('change', () => this.saveNotes());
    window.addEventListener('resize', () => this.fit());
    document.addEventListener('keydown', (e) => this.keys(e));
    this.stage.addEventListener('mousedown', (e) => {
      if (e.target === this.stage || e.target === this.wrap || e.target === this.slideEl) { e.preventDefault(); this.select(null); }
    });
  },
  async newDoc() {
    const buf = await (await fetch('blank.pptx')).arrayBuffer();
    await this.open(buf, 'Untitled.pptx');
  },
  async open(buf, name) {
    const px = new PptxDoc();
    await px.load(buf);
    this.px = px; this.cur = 0; this.undo = []; this.redo = []; this.sel = null;
    this.fileName = name; this.dirty = false;
    const ls = $('#pLayout'); ls.innerHTML = '';
    px.layouts.forEach((l, i) => ls.add(new Option(l.name, l.path, false, /title and content/i.test(l.name) || (i === 1 && !px.layouts.some((x) => /title and content/i.test(x.name))))));
    await this.renderAll();
    App.updateTitle();
  },
  markDirty() { this.dirty = true; App.updateTitle(); },
  slideScale(container) {
    const W = this.px.cx / EMU_PT * 4 / 3, H = this.px.cy / EMU_PT * 4 / 3;
    const r = container.getBoundingClientRect();
    return Math.max(0.1, Math.min((r.width - 48) / W, (r.height - 48) / H));
  },
  fit() {
    if (!this.px || !this.slideEl) return;
    const s = this.slideScale(this.stage);
    const W = this.px.cx / EMU_PT * 4 / 3, H = this.px.cy / EMU_PT * 4 / 3;
    this.scale = s;
    this.wrap.style.width = W * s + 'px'; this.wrap.style.height = H * s + 'px';
    this.slideEl.style.transform = `scale(${s})`;
  },
  async renderAll() {
    await this.renderThumbs();
    await this.show(Math.min(this.cur, this.px.slides.length - 1));
  },
  async renderThumbs() {
    const box = $('#thumbs');
    box.innerHTML = '';
    for (let i = 0; i < this.px.slides.length; i++) {
      const t = document.createElement('div');
      t.className = 'thumb' + (i === this.cur ? ' active' : '');
      t.innerHTML = `<span class="num">${i + 1}</span><div class="box"></div>`;
      t.onclick = () => this.show(i);
      t.draggable = true;
      t.ondragstart = (e) => { e.dataTransfer.setData('text/slide', String(i)); };
      t.ondragover = (e) => { if (e.dataTransfer.types.includes('text/slide')) { e.preventDefault(); t.classList.add('drag-over'); } };
      t.ondragleave = () => t.classList.remove('drag-over');
      t.ondrop = (e) => { e.preventDefault(); t.classList.remove('drag-over'); const from = +e.dataTransfer.getData('text/slide'); if (from !== i) this.reorder(from, i); };
      box.appendChild(t);
      await this.renderThumb(i, t);
    }
  },
  async renderThumb(i, t) {
    t = t || $$('#thumbs .thumb')[i];
    if (!t || !this.px.slides[i]) return;
    const b = $('.box', t);
    const W = this.px.cx / EMU_PT * 4 / 3, H = this.px.cy / EMU_PT * 4 / 3;
    const w = b.clientWidth || 160;
    const s = w / W;
    const el = await new SlideRenderer(this.px, this.px.slides[i], { editable: false }).render();
    el.style.transform = `scale(${s})`;
    b.style.height = H * s + 'px';
    b.innerHTML = ''; b.appendChild(el);
  },
  refreshThumb() {
    clearTimeout(this.thT);
    const i = this.cur;
    this.thT = setTimeout(() => this.renderThumb(i), 300);
  },
  async show(i) {
    if (!this.px.slides.length) return;
    this.commitText();
    this.cur = Math.max(0, Math.min(i, this.px.slides.length - 1));
    $$('#thumbs .thumb').forEach((t, k) => t.classList.toggle('active', k === this.cur));
    const at = $$('#thumbs .thumb')[this.cur]; if (at) at.scrollIntoView({ block: 'nearest' });
    const slide = this.px.slides[this.cur];
    const el = await new SlideRenderer(this.px, slide, { editable: true }).render();
    el.classList.add('editable');
    this.wrap.innerHTML = ''; this.wrap.appendChild(el);
    this.slideEl = el; this.sel = null;
    this.fit();
    this.bindShapes();
    $('#pStats').textContent = `Slide ${this.cur + 1} of ${this.px.slides.length}`;
    const notes = await this.px.notesText(slide);
    const ta = $('#pNotes');
    ta.value = notes || '';
    ta.disabled = notes === null && !this.px.notesMasterPath;
    ta.placeholder = ta.disabled ? 'This file has no notes master, so notes cannot be added' : 'Click to add notes';
    const bgInp = $('#pBg'); const bg = toHex(getComputedStyle(el).backgroundColor);
    if (bg) { bgInp.value = '#' + bg; bgInp.parentElement.style.setProperty('--swatch', bgInp.value); }
  },
  bindShapes() {
    for (const d of $$(':scope > .shp', this.slideEl)) {
      if (d._template) continue;
      d.addEventListener('mousedown', (e) => this.shapeDown(e, d));
      const tx = $(':scope > .tx', d);
      if (tx) {
        tx.addEventListener('focus', () => {
          this.select(d, true);
          this.editing = { d, tx, before: this.snapshot(), html: tx.innerHTML };
          if (tx.classList.contains('empty-ph')) { tx.classList.remove('empty-ph'); }
        });
        tx.addEventListener('blur', () => setTimeout(() => { if (this.editing && this.editing.tx === tx && document.activeElement !== tx) this.commitText(); }, 0));
        tx.addEventListener('input', () => { this.markDirty(); clearTimeout(this.txT); this.txT = setTimeout(() => this.commitText(true), 700); });
        tx.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
      }
    }
  },
  snapshot() {
    const s = this.px.slides[this.cur];
    return { path: s.path, xml: new XMLSerializer().serializeToString(s.doc), cur: this.cur };
  },
  pushUndo(snap) { this.undo.push(snap || this.snapshot()); if (this.undo.length > 100) this.undo.shift(); this.redo = []; },
  async restore(snap, toStack) {
    const s = this.px.slides.find((x) => x.path === snap.path);
    if (!s) return;
    toStack.push({ path: s.path, xml: new XMLSerializer().serializeToString(s.doc), cur: this.px.slides.indexOf(s) });
    s.doc = new DOMParser().parseFromString(snap.xml, 'application/xml');
    this.px.docs[s.path] = s.doc; this.px.touch(s.path);
    this.editing = null;
    const idx = this.px.slides.indexOf(s);
    this.cur = idx;
    await this.show(idx); this.renderThumb(idx); this.markDirty();
  },
  async doUndo() { this.commitText(); const s = this.undo.pop(); if (s) await this.restore(s, this.redo); else toast('Nothing to undo'); },
  async doRedo() { const s = this.redo.pop(); if (s) await this.restore(s, this.undo); },
  commitText(keepEditing = false) {
    const ed = this.editing;
    if (!ed) return;
    if (ed.tx.innerHTML !== ed.html) {
      if (!ed.pushed) { this.pushUndo(ed.before); ed.pushed = true; }
      const sp = ed.d._xml;
      const doc = sp.ownerDocument;
      let txBody = X.kid(sp, 'txBody');
      if (!txBody) {
        txBody = X.make(doc, 'p:txBody');
        txBody.append(X.make(doc, 'a:bodyPr'), X.make(doc, 'a:lstStyle'));
        const ext = X.kid(sp, 'extLst');
        sp.insertBefore(txBody, ext);
      }
      TextWriter.write(doc, txBody, ed.tx, ed.tx._scale || 1);
      this.px.touch(this.px.slides[this.cur].path);
      ed.html = ed.tx.innerHTML;
      this.markDirty();
      this.refreshThumb();
    }
    if (!keepEditing) this.editing = null;
  },
  select(d, fromText = false) {
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains('tx') && (!d || !d.contains(a))) {
      a.blur(); window.getSelection().removeAllRanges(); this.commitText();
    }
    if (this.sel === d) return;
    if (this.sel) { this.sel.classList.remove('sel'); $$(':scope > .h, :scope > .mv', this.sel).forEach((h) => h.remove()); }
    this.sel = d;
    if (!d) return;
    d.classList.add('sel');
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const k = document.createElement('div'); k.className = 'h ' + h; k.dataset.h = h;
      k.style.transform = `scale(${1 / this.scale})`;
      d.appendChild(k);
    }
    if ($(':scope > .tx', d)) { const mv = document.createElement('div'); mv.className = 'mv'; mv.title = 'Drag to move'; mv.style.height = 14 / this.scale + 'px'; mv.style.top = -18 / this.scale + 'px'; d.appendChild(mv); }
    const sp = d._xml;
    const sf = X.path(sp, 'spPr', 'solidFill', 'srgbClr');
    if (sf) { $('#pFill').value = '#' + sf.getAttribute('val'); $('#pFill').parentElement.style.setProperty('--swatch', $('#pFill').value); }
    void fromText;
  },
  shapeDown(e, d) {
    const handle = e.target.dataset && e.target.dataset.h;
    const isMoveBar = e.target.classList.contains('mv');
    const tx = $(':scope > .tx', d);
    if (!handle && !isMoveBar && tx && document.activeElement === tx && !e.altKey) return; // already typing: normal text selection
    e.preventDefault();
    if (this.editing && this.editing.d !== d) this.commitText();
    this.select(d);
    const xf = this.getXfrm(d);
    if (!xf) return;
    const start = { ...xf, mx: e.clientX, my: e.clientY };
    const pxToEmu = EMU_PT * 0.75 / this.scale;
    let moved = false;
    const snap = this.snapshot();
    const mm = (ev) => {
      const dx = (ev.clientX - start.mx) * pxToEmu, dy = (ev.clientY - start.my) * pxToEmu;
      if (!moved && Math.abs(ev.clientX - start.mx) + Math.abs(ev.clientY - start.my) < 3) return;
      moved = true;
      let { x, y, w, h } = start;
      if (!handle) { x += dx; y += dy; }
      else {
        if (/e/.test(handle)) w = Math.max(EMU_PT * 4, w + dx);
        if (/s/.test(handle)) h = Math.max(EMU_PT * 4, h + dy);
        if (/w/.test(handle)) { const nw = Math.max(EMU_PT * 4, w - dx); x += w - nw; w = nw; }
        if (/n/.test(handle)) { const nh = Math.max(EMU_PT * 4, h - dy); y += h - nh; h = nh; }
        if (ev.shiftKey && d.dataset.kind === 'pic') h = w * start.h / start.w;
      }
      this.cur_xf = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      d.style.left = x / EMU_PT + 'pt'; d.style.top = y / EMU_PT + 'pt';
      d.style.width = w / EMU_PT + 'pt'; d.style.height = h / EMU_PT + 'pt';
      if (d.dataset.kind === 'group') { this.groupNeedsRerender = true; }
    };
    const mu = () => {
      window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu);
      if (!moved) {
        if (tx && !handle) {
          tx.focus();
          const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(start.mx, start.my) : null;
          const s = window.getSelection();
          if (r && tx.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); }
          else { const rr = document.createRange(); rr.selectNodeContents(tx); rr.collapse(false); s.removeAllRanges(); s.addRange(rr); }
        }
        return;
      }
      this.pushUndo(snap);
      this.setXfrm(d, this.cur_xf);
      if (this.groupNeedsRerender) { this.groupNeedsRerender = false; this.show(this.cur); }
      this.refreshThumb();
    };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  },
  getXfrm(d) {
    const r = new SlideRenderer(this.px, this.px.slides[this.cur], {});
    const sp = d._xml;
    if (sp.localName === 'graphicFrame') {
      const xf = X.kid(sp, 'xfrm');
      return { x: X.num(X.kid(xf, 'off'), 'x'), y: X.num(X.kid(xf, 'off'), 'y'), w: X.num(X.kid(xf, 'ext'), 'cx'), h: X.num(X.kid(xf, 'ext'), 'cy') };
    }
    const v = r.xfrmOf(sp, r.phChain(sp));
    return v && { x: v.x, y: v.y, w: v.w, h: v.h };
  },
  setXfrm(d, v) {
    const sp = d._xml, doc = sp.ownerDocument;
    let xf;
    if (sp.localName === 'graphicFrame') xf = X.kid(sp, 'xfrm');
    else {
      let pr = X.kid(sp, 'spPr') || X.kid(sp, 'grpSpPr');
      if (!pr) { pr = X.make(doc, 'p:spPr'); const nv = sp.firstElementChild; nv.after(pr); }
      xf = X.kid(pr, 'xfrm');
      if (!xf) { xf = X.make(doc, 'a:xfrm'); pr.insertBefore(xf, pr.firstChild); }
    }
    let off = X.kid(xf, 'off'), ext = X.kid(xf, 'ext');
    if (!off) { off = X.make(doc, 'a:off'); xf.insertBefore(off, xf.firstChild); }
    if (!ext) { ext = X.make(doc, 'a:ext'); off.after(ext); }
    off.setAttribute('x', v.x); off.setAttribute('y', v.y); ext.setAttribute('cx', v.w); ext.setAttribute('cy', v.h);
    this.px.touch(this.px.slides[this.cur].path);
    this.markDirty();
  },
  keepSel() {
    const s = window.getSelection();
    this.savedRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  },
  textCmd(cmd, val) {
    const d = this.sel;
    if (!d) return toast('Select a text box first');
    const tx = $(':scope > .tx', d);
    if (!tx) return toast('This shape has no text');
    const s = window.getSelection();
    if (this.savedRange && tx.contains(this.savedRange.startContainer)) { tx.focus(); s.removeAllRanges(); s.addRange(this.savedRange); this.savedRange = null; }
    if (document.activeElement !== tx || s.isCollapsed) {
      tx.focus();
      const r = document.createRange(); r.selectNodeContents(tx); s.removeAllRanges(); s.addRange(r);
    }
    if (cmd === 'size') {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontSize', false, '7');
      for (const f of $$('font[size="7"]', tx)) {
        const sp = document.createElement('span'); sp.style.fontSize = val * (tx._scale || 1) + 'pt';
        sp.append(...f.childNodes); f.replaceWith(sp);
        for (const inner of $$('span', sp)) inner.style.fontSize = '';
      }
    } else {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(cmd, false, val || null);
    }
    this.markDirty();
    this.commitText(true);
  },
  align(a) {
    const d = this.sel;
    if (!d) return toast('Select a text box first');
    const tx = $(':scope > .tx', d);
    if (!tx) return;
    if (!this.editing) { tx.focus(); }
    const s = window.getSelection();
    const css = { l: 'left', ctr: 'center', r: 'right' }[a];
    const paras = Array.from(tx.children);
    let targets = paras.filter((p) => s.rangeCount && !s.isCollapsed ? s.containsNode(p, true) : s.anchorNode && p.contains(s.anchorNode));
    if (!targets.length) targets = paras;
    for (const p of targets) p.style.textAlign = css;
    this.commitText(true);
  },
  newId(doc) {
    let max = 1;
    for (const c of doc.getElementsByTagNameNS(P_NS, 'cNvPr')) max = Math.max(max, +c.getAttribute('id') || 0);
    return max + 1;
  },
  spTree() { return X.path(this.px.slides[this.cur].doc.documentElement, 'cSld', 'spTree'); },
  appendShape(el) {
    const tree = this.spTree();
    const ext = X.kid(tree, 'extLst');
    tree.insertBefore(el, ext);
    this.px.touch(this.px.slides[this.cur].path);
    this.markDirty();
  },
  async insertShape(kind) {
    if (!this.px) return;
    this.commitText();
    this.pushUndo();
    const doc = this.px.slides[this.cur].doc;
    const id = this.newId(doc);
    const W = this.px.cx, H = this.px.cy;
    let xml;
    if (kind === 'text') {
      const w = Math.round(W * 0.4), h = 914400 * 0.6;
      xml = `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round((W - w) / 2)}" y="${Math.round((H - h) / 2)}"/><a:ext cx="${w}" cy="${Math.round(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2400" dirty="0"/><a:t>New text</a:t></a:r></a:p></p:txBody></p:sp>`;
    } else {
      const w = Math.round(W * 0.25), h = Math.round(H * 0.25);
      const fill = $('#pFill').value.slice(1).toUpperCase();
      xml = `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${kind === 'rect' ? 'Rectangle' : 'Oval'} ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round((W - w) / 2)}" y="${Math.round((H - h) / 2)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="${kind === 'rect' ? 'rect' : 'ellipse'}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="${fill}"><a:lumMod val="75000"/></a:srgbClr></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:endParaRPr lang="en-US" sz="1800" dirty="0"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:endParaRPr></a:p></p:txBody></p:sp>`;
    }
    const [el] = X.frag(doc, xml);
    this.appendShape(el);
    await this.show(this.cur);
    const d = $$(':scope > .shp', this.slideEl).find((x) => x._xml === el);
    if (d) {
      this.select(d);
      const tx = $(':scope > .tx', d);
      if (tx && kind === 'text') { tx.focus(); const r = document.createRange(); r.selectNodeContents(tx); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
    this.refreshThumb();
  },
  async insertImage(file) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace('jpeg', 'jpg');
    if (!/^(png|jpg|gif|bmp)$/.test(ext)) return toast('Please choose a PNG, JPEG or GIF picture');
    this.commitText();
    this.pushUndo();
    const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
    const media = this.px.freeName('ppt/media', 'image', ext);
    this.px.zip.file(media, bytes);
    this.px.ensureDefaultCT(ext, { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' }[ext]);
    const slide = this.px.slides[this.cur];
    const rid = this.px.addRel(slide.rels, REL.image, media);
    const url = URL.createObjectURL(file);
    const { w: iw, h: ih } = await imageSize(url);
    const W = this.px.cx, H = this.px.cy;
    const sc = Math.min(W * 0.6 / (iw * 9525), H * 0.6 / (ih * 9525), 1);
    const w = Math.round(iw * 9525 * sc), h = Math.round(ih * 9525 * sc);
    const id = this.newId(slide.doc);
    const xml = `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((W - w) / 2)}" y="${Math.round((H - h) / 2)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    const [el] = X.frag(slide.doc, xml);
    this.appendShape(el);
    await this.show(this.cur);
    this.refreshThumb();
  },
  async deleteShape() {
    if (!this.sel) return toast('Click a shape to select it first');
    this.commitText();
    this.pushUndo();
    this.sel._xml.remove();
    this.px.touch(this.px.slides[this.cur].path);
    this.markDirty();
    await this.show(this.cur);
    this.refreshThumb();
  },
  async zorder(front) {
    if (!this.sel) return toast('Select a shape first');
    this.commitText();
    this.pushUndo();
    const el = this.sel._xml, tree = el.parentElement;
    if (front) tree.insertBefore(el, X.kid(tree, 'extLst'));
    else { const g = X.kid(tree, 'grpSpPr'); g.after(el); }
    this.px.touch(this.px.slides[this.cur].path);
    this.markDirty();
    await this.show(this.cur);
    this.refreshThumb();
  },
  async setFill(hex) {
    if (!this.sel || !/^(sp)$/.test(this.sel._xml.localName)) return toast('Select a shape or text box first');
    this.commitText();
    this.pushUndo();
    const sp = this.sel._xml, doc = sp.ownerDocument;
    let pr = X.kid(sp, 'spPr');
    if (!pr) { pr = X.make(doc, 'p:spPr'); sp.firstElementChild.after(pr); }
    for (const k of X.kids(pr)) if (/^(noFill|solidFill|gradFill|blipFill|pattFill|grpFill)$/.test(k.localName)) k.remove();
    const f = hex ? X.make(doc, 'a:solidFill') : X.make(doc, 'a:noFill');
    if (hex) f.appendChild(X.make(doc, 'a:srgbClr', { val: hex.slice(1).toUpperCase() }));
    const after = X.kid(pr, 'prstGeom') || X.kid(pr, 'custGeom') || X.kid(pr, 'xfrm');
    if (after) after.after(f); else pr.insertBefore(f, pr.firstChild);
    this.px.touch(this.px.slides[this.cur].path);
    this.markDirty();
    await this.show(this.cur);
    this.refreshThumb();
  },
  async setBg(hex) {
    this.commitText();
    this.pushUndo();
    const doc = this.px.slides[this.cur].doc;
    const cSld = X.kid(doc.documentElement, 'cSld');
    let bg = X.kid(cSld, 'bg');
    if (bg) bg.remove();
    [bg] = X.frag(doc, `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex.slice(1).toUpperCase()}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`);
    cSld.insertBefore(bg, cSld.firstChild);
    this.px.touch(this.px.slides[this.cur].path);
    this.markDirty();
    await this.show(this.cur);
    this.refreshThumb();
  },
  async saveNotes() {
    const ok = await this.px.setNotes(this.px.slides[this.cur], $('#pNotes').value);
    if (ok) this.markDirty(); else toast('Could not save notes for this slide');
  },
  async addSlide() {
    if (!this.px) return;
    this.commitText();
    const lp = $('#pLayout').value || this.px.slides[this.cur].layout.path;
    await this.px.addSlideFromLayout(lp, this.cur + 1);
    this.cur++;
    this.undo = []; this.redo = [];
    this.markDirty();
    await this.renderAll();
  },
  async dupSlide() {
    this.commitText();
    await this.px.duplicateSlide(this.cur);
    this.cur++;
    this.undo = []; this.redo = [];
    this.markDirty();
    await this.renderAll();
  },
  async delSlide() {
    if (this.px.slides.length <= 1) return toast('A presentation needs at least one slide');
    if (!confirm(`Delete slide ${this.cur + 1}? This cannot be undone.`)) return;
    this.editing = null;
    this.px.deleteSlide(this.cur);
    this.undo = this.undo.filter((u) => this.px.slides.some((s) => s.path === u.path));
    this.markDirty();
    await this.renderAll();
  },
  async moveSlide(dir) {
    const j = this.cur + dir;
    if (j < 0 || j >= this.px.slides.length) return;
    await this.reorder(this.cur, j);
  },
  async reorder(i, j) {
    this.commitText();
    this.px.moveSlide(i, j);
    this.cur = j;
    this.markDirty();
    await this.renderAll();
  },
  keys(e) {
    if (App.mode !== 'ppt' || !this.px) return;
    if (!$('#presenter').hidden) return this.presKeys(e);
    const inText = document.activeElement && (document.activeElement.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
    if (e.key === 'F5') { e.preventDefault(); this.present(); return; }
    if (inText) {
      if (e.key === 'Escape' && document.activeElement.classList.contains('tx')) { document.activeElement.blur(); }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (mod && e.key.toLowerCase() === 'd' && this.sel) { e.preventDefault(); this.duplicateShape(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.deleteShape(); return; }
    if (this.sel && /^Arrow/.test(e.key)) {
      e.preventDefault();
      const xf = this.getXfrm(this.sel); if (!xf) return;
      const step = (e.shiftKey ? 10 : 1) * EMU_PT * 4;
      if (!this.arrowSnap) { this.pushUndo(); this.arrowSnap = true; clearTimeout(this.arT); }
      this.arT = setTimeout(() => (this.arrowSnap = false), 800);
      xf.x += e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      xf.y += e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      this.setXfrm(this.sel, xf);
      this.sel.style.left = xf.x / EMU_PT + 'pt'; this.sel.style.top = xf.y / EMU_PT + 'pt';
      this.refreshThumb();
      return;
    }
    if (!this.sel && (e.key === 'ArrowDown' || e.key === 'PageDown')) { e.preventDefault(); this.show(this.cur + 1); }
    if (!this.sel && (e.key === 'ArrowUp' || e.key === 'PageUp')) { e.preventDefault(); this.show(this.cur - 1); }
    if (e.key === 'Escape') this.select(null);
  },
  async duplicateShape() {
    this.pushUndo();
    const el = this.sel._xml.cloneNode(true);
    const doc = el.ownerDocument;
    const c = el.getElementsByTagNameNS(P_NS, 'cNvPr')[0];
    if (c) c.setAttribute('id', this.newId(doc));
    const off = el.getElementsByTagNameNS(A_NS, 'off')[0];
    if (off) { off.setAttribute('x', X.num(off, 'x') + 182880); off.setAttribute('y', X.num(off, 'y') + 182880); }
    this.sel._xml.after(el);
    this.px.touch(this.px.slides[this.cur].path); this.markDirty();
    await this.show(this.cur); this.refreshThumb();
  },
  /* ---- presenter ---- */
  async present(from) {
    this.commitText();
    this.presIdx = from ?? this.cur;
    const p = $('#presenter');
    p.hidden = false;
    try { await p.requestFullscreen(); } catch {}
    await this.presShow();
    this.presResize = () => this.presShow();
    window.addEventListener('resize', this.presResize);
    p.onclick = () => this.presGo(1);
    document.onfullscreenchange = () => { if (!document.fullscreenElement) this.presExit(); };
  },
  async presShow() {
    const box = $('#presSlide');
    const el = await new SlideRenderer(this.px, this.px.slides[this.presIdx], { editable: false }).render();
    const W = this.px.cx / EMU_PT * 4 / 3, H = this.px.cy / EMU_PT * 4 / 3;
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    el.style.transform = `scale(${s})`;
    box.style.width = W * s + 'px'; box.style.height = H * s + 'px';
    box.innerHTML = ''; box.appendChild(el);
    $('#presInfo').textContent = `${this.presIdx + 1} / ${this.px.slides.length}`;
  },
  presGo(d) {
    const n = this.presIdx + d;
    if (n >= this.px.slides.length) return this.presExit();
    if (n < 0) return;
    this.presIdx = n; this.presShow();
  },
  presKeys(e) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(e.key)) { e.preventDefault(); this.presGo(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)) { e.preventDefault(); this.presGo(-1); }
    else if (e.key === 'Home') { this.presIdx = 0; this.presShow(); }
    else if (e.key === 'End') { this.presIdx = this.px.slides.length - 1; this.presShow(); }
    else if (e.key === 'Escape') this.presExit();
  },
  presExit() {
    const p = $('#presenter');
    if (p.hidden) return;
    p.hidden = true;
    window.removeEventListener('resize', this.presResize);
    document.onfullscreenchange = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.show(this.presIdx);
  },
  async save() {
    this.commitText();
    return this.px.save();
  },
};
