/* ===================== Excel (.xlsx) editor ===================== */
'use strict';
const S_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XREL = {
  sheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  sst: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  calcChain: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain',
};
const XCT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const MAX_ROWS = 1048576, MAX_COLS = 16384;

/* ---------- references ---------- */
function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
function colNum(s) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function parseA1(ref) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim());
  return m ? { r: +m[2], c: colNum(m[1]) } : null;
}
function a1(r, c) { return colName(c) + r; }
function parseRange(ref) {
  const [a, b] = ref.split(':');
  const p = parseA1(a), q = b ? parseA1(b) : p;
  if (!p || !q) return null;
  return { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) };
}
function rangeA1(g) { return g.r1 === g.r2 && g.c1 === g.c2 ? a1(g.r1, g.c1) : a1(g.r1, g.c1) + ':' + a1(g.r2, g.c2); }
function quoteSheet(n) { return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'"; }
function unquoteSheet(s) { return s && s[0] === "'" ? s.slice(1, -1).replace(/''/g, "'") : s; }

/**
 * Rewrites every cell / range reference in a formula (outside string literals).
 * fn({sheet, r1,c1,r2,c2, ar1,ac1,ar2,ac2, kind}) returns a replacement ref object,
 * null to keep it, or the string '#REF!'.  kind: 'cell' | 'cols' | 'rows'.
 */
function mapFormulaRefs(formula, fn) {
  const parts = formula.split(/("(?:[^"]|"")*")/);
  const SHEET = `(?:('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?`;
  const reCell = new RegExp(`(?<![A-Za-z0-9_.$!'])${SHEET}(\\$?)([A-Za-z]{1,3})(\\$?)(\\d{1,7})(?::(\\$?)([A-Za-z]{1,3})(\\$?)(\\d{1,7}))?(?![A-Za-z0-9_(!])`, 'g');
  const reCols = new RegExp(`(?<![A-Za-z0-9_.$!'])${SHEET}(\\$?)([A-Za-z]{1,3}):(\\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(!])`, 'g');
  const reRows = new RegExp(`(?<![A-Za-z0-9_.$!':])${SHEET}(\\$?)(\\d{1,7}):(\\$?)(\\d{1,7})(?![A-Za-z0-9_(!:.])`, 'g');
  const emit = (sheet, ref) => {
    if (ref === '#REF!') return (sheet ? quoteSheet(sheet) + '!' : '') + '#REF!';
    const sp = ref.sheet !== undefined ? ref.sheet : sheet;
    const pre = sp ? quoteSheet(sp) + '!' : '';
    const d = (b) => (b ? '$' : '');
    if (ref.kind === 'cols') return pre + d(ref.ac1) + colName(ref.c1) + ':' + d(ref.ac2) + colName(ref.c2);
    if (ref.kind === 'rows') return pre + d(ref.ar1) + ref.r1 + ':' + d(ref.ar2) + ref.r2;
    const one = d(ref.ac1) + colName(ref.c1) + d(ref.ar1) + ref.r1;
    if (ref.single) return pre + one;
    return pre + one + ':' + d(ref.ac2) + colName(ref.c2) + d(ref.ar2) + ref.r2;
  };
  return parts.map((seg, i) => {
    if (i % 2) return seg; // string literal
    seg = seg.replace(reCell, (m, sh, ac1, c1, ar1, r1, ac2, c2, ar2, r2) => {
      const sheet = sh ? unquoteSheet(sh) : null;
      const ref = { sheet, kind: 'cell', single: !c2, ac1: !!ac1, c1: colNum(c1), ar1: !!ar1, r1: +r1,
        ac2: c2 ? !!ac2 : !!ac1, c2: c2 ? colNum(c2) : colNum(c1), ar2: c2 ? !!ar2 : !!ar1, r2: c2 ? +r2 : +r1 };
      if (ref.c1 > MAX_COLS || ref.c2 > MAX_COLS) return m; // e.g. a defined name like LOG10
      const out = fn(ref);
      return out == null ? m : emit(sheet, out);
    });
    seg = seg.replace(reCols, (m, sh, ac1, c1, ac2, c2) => {
      const sheet = sh ? unquoteSheet(sh) : null;
      const out = fn({ sheet, kind: 'cols', ac1: !!ac1, c1: colNum(c1), ac2: !!ac2, c2: colNum(c2), r1: 1, r2: MAX_ROWS });
      return out == null ? m : emit(sheet, out);
    });
    seg = seg.replace(reRows, (m, sh, ar1, r1, ar2, r2) => {
      const sheet = sh ? unquoteSheet(sh) : null;
      const out = fn({ sheet, kind: 'rows', ar1: !!ar1, r1: +r1, ar2: !!ar2, r2: +r2, c1: 1, c2: MAX_COLS });
      return out == null ? m : emit(sheet, out);
    });
    return seg;
  }).join('');
}
/* shift relative parts of every reference (copy / fill / shared formulas) */
function shiftFormula(f, dr, dc) {
  if (!dr && !dc) return f;
  return mapFormulaRefs(f, (ref) => {
    const o = { ...ref };
    if (ref.kind !== 'rows') { if (!ref.ac1) o.c1 += dc; if (!ref.ac2) o.c2 += dc; }
    if (ref.kind !== 'cols') { if (!ref.ar1) o.r1 += dr; if (!ref.ar2) o.r2 += dr; }
    if (o.r1 < 1 || o.c1 < 1 || o.r2 < 1 || o.c2 < 1) return '#REF!';
    return o;
  });
}

/* ---------- dates ---------- */
const XL_EPOCH = Date.UTC(1899, 11, 30);
function serialToDate(v) { return new Date(XL_EPOCH + Math.round(v * 86400000)); }
function dateToSerial(d) { return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - XL_EPOCH) / 86400000; }

/* ---------- number formats ---------- */
const BUILTIN_FMT = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'dd-mm-yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss',
  22: 'dd-mm-yyyy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  44: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function fmtGeneral(v) {
  if (Number.isInteger(v) && Math.abs(v) < 1e11) return String(v);
  if (Math.abs(v) >= 1e11 || (Math.abs(v) < 1e-9 && v !== 0)) return v.toExponential(5).replace(/\.?0+e/, 'E').replace('E+', 'E+').replace(/e/, 'E');
  return String(+v.toPrecision(10));
}
function formatNumber(v, code) {
  if (!code || code === 'General') return fmtGeneral(v);
  if (code === '@') return String(v);
  if (/\?\/\?|#\/#/.test(code)) return fmtGeneral(v); // fraction formats: show as decimal
  const secs = code.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  let sec = secs[0], neg = false;
  if (v < 0 && secs.length > 1) { sec = secs[1]; neg = true; }
  else if (v === 0 && secs.length > 2) sec = secs[2];
  let color = null;
  sec = sec.replace(/\[(Red|Blue|Green|Black|White|Yellow|Magenta|Cyan|Color\s?\d+)\]/i, (m, c) => { color = c.toLowerCase(); return ''; });
  sec = sec.replace(/\[\$([^\]-]*)(?:-[^\]]*)?\]/g, (m, sym) => (sym ? `"${sym}"` : '')); // currency/locale tags
  sec = sec.replace(/\[[<>=][^\]]*\]/g, '');
  const bare = sec.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/_./g, '').replace(/\*./g, '');
  let out;
  if (/[yd]|[hs]|AM\/PM|(^|[^0#?])m/i.test(bare) && !/[0#?]/.test(bare.replace(/\.0+/, ''))) out = formatDate(v, sec);
  else out = formatPlain(neg ? Math.abs(v) : v, sec);
  return { text: out, color };
}
function formatPlain(v, sec) {
  let pattern = '', prefix = '', suffix = '', seen = false, pct = 0;
  const tokens = sec.match(/"[^"]*"|\\.|_.|\*.|[0#?][0#?,.]*(?:[Ee][+-][0#?]+)?|%|./g) || [];
  for (const t of tokens) {
    let text;
    if (t[0] === '"') text = t.slice(1, -1);
    else if (t[0] === '\\') text = t[1];
    else if (t[0] === '_') text = ' ';
    else if (t[0] === '*') text = '';
    else if (/^[0#?]/.test(t)) { pattern += t; seen = true; continue; }
    else if (t === '%') { pct++; text = '%'; }
    else if (t === '.' && !seen) { pattern += '0.'; seen = true; continue; }
    else text = t;
    if (seen) suffix += text; else prefix += text;
  }
  let x = v * Math.pow(100, pct);
  const sci = /E[+-]/i.exec(pattern);
  if (sci) {
    const dec = ((pattern.split(/E/i)[0].split('.')[1]) || '').length;
    return prefix + x.toExponential(dec).toUpperCase().replace(/E([+-])(\d)$/, 'E$10$2') + suffix;
  }
  const trail = /,+$/.exec(pattern.split('.')[0]);
  if (trail && !pattern.includes('.')) { x /= Math.pow(1000, trail[0].length); pattern = pattern.replace(/,+$/, ''); }
  const [ip, dp = ''] = pattern.split('.');
  const decMin = (dp.match(/0/g) || []).length, decMax = (dp.match(/[0#?]/g) || []).length;
  let str = Math.abs(x).toFixed(decMax);
  if (decMax > decMin) str = str.replace(new RegExp(`0{1,${decMax - decMin}}$`), '').replace(/\.$/, '');
  let [is, ds] = str.split('.');
  const minInt = (ip.match(/0/g) || []).length;
  if (is === '0' && minInt === 0) is = '';
  while (is.length < minInt) is = '0' + is;
  if (ip.includes(',')) is = is.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = x < 0 && Number(str) !== 0 ? '-' : '';
  return sign + prefix + is + (ds ? '.' + ds : '') + suffix;
}
function formatDate(v, sec) {
  const d = serialToDate(v);
  const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), wd = d.getUTCDay();
  let h = d.getUTCHours(); const mi = d.getUTCMinutes(), se = d.getUTCSeconds();
  const ampm = /AM\/PM|A\/P/i.test(sec);
  const tokens = sec.match(/"[^"]*"|\\.|_.|\*.|\[h+\]|\[m+\]|\[s+\]|y+|m+|d+|h+|s+|AM\/PM|A\/P|0+|./gi) || [];
  // decide which "m" tokens are minutes (after h or before s)
  const kinds = tokens.map((t) => t.toLowerCase());
  let out = '';
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], k = kinds[i];
    if (t[0] === '"') { out += t.slice(1, -1); continue; }
    if (t[0] === '\\') { out += t[1]; continue; }
    if (t[0] === '_') { out += ' '; continue; }
    if (t[0] === '*') continue;
    if (/^y+$/.test(k)) out += k.length <= 2 ? pad(Y % 100) : Y;
    else if (/^m+$/.test(k)) {
      const prev = kinds.slice(0, i).reverse().find((x) => /^[hdsy]/.test(x) || /^\[/.test(x));
      const next = kinds.slice(i + 1).find((x) => /^[hdsy]/.test(x));
      const isMin = (prev && /^h|^\[h/.test(prev)) || (next && /^s/.test(next));
      if (isMin && k.length <= 2) out += k.length === 2 ? pad(mi) : mi;
      else out += k.length === 1 ? M + 1 : k.length === 2 ? pad(M + 1) : k.length === 3 ? MONTHS[M].slice(0, 3) : k.length === 5 ? MONTHS[M][0] : MONTHS[M];
    } else if (/^d+$/.test(k)) out += k.length === 1 ? D : k.length === 2 ? pad(D) : k.length === 3 ? DAYS[wd].slice(0, 3) : DAYS[wd];
    else if (/^h+$/.test(k)) { let hh = ampm ? (h % 12 || 12) : h; out += k.length >= 2 ? pad(hh) : hh; }
    else if (/^\[h+\]$/.test(k)) out += Math.floor(v * 24);
    else if (/^\[m+\]$/.test(k)) out += Math.floor(v * 1440);
    else if (/^s+$/.test(k)) out += k.length >= 2 ? pad(se) : se;
    else if (k === 'am/pm') out += h < 12 ? 'AM' : 'PM';
    else if (k === 'a/p') out += h < 12 ? 'A' : 'P';
    else if (/^0+$/.test(k)) out += String((v * 86400) % 1).slice(2, 2 + k.length).padEnd(k.length, '0');
    else out += t;
  }
  return out;
}
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];

/* ===================================================================== */
class XlsxDoc {
  async load(buf) {
    this.zip = await JSZip.loadAsync(buf);
    this.docs = {}; this.dirty = new Set();
    this.ct = await this.xml('[Content_Types].xml');
    this.wb = await this.xml('xl/workbook.xml');
    if (!this.wb) throw new Error('Not an Excel workbook (xl/workbook.xml missing)');
    this.wbRels = await this.rels('xl/workbook.xml');
    const rel = (type) => Object.values(this.wbRels.byId).find((r) => r.type === type);
    // strings
    this.sst = [];
    const sr = rel(XREL.sst);
    const sd = sr && (await this.xml(sr.path));
    if (sd) for (const si of sd.getElementsByTagNameNS(S_NS, 'si')) this.sst.push(this.richText(si));
    // styles + theme
    const st = rel(XREL.styles);
    this.stylesPath = st ? st.path : null;
    this.styles = st ? await this.xml(st.path) : null;
    const th = rel(XREL.theme);
    this.themeColors = [];
    const td = th && (await this.xml(th.path));
    if (td) {
      const cs = td.getElementsByTagNameNS(A_NS, 'clrScheme')[0];
      const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
      const map = {};
      for (const c of X.kids(cs)) { const v = c.firstElementChild; if (v) map[c.localName] = v.getAttribute('lastClr') || v.getAttribute('val'); }
      this.themeColors = order.map((k) => map[k] || '000000');
    }
    this.parseStyles();
    // drop calcChain: it goes stale as soon as formulas change, and Excel rebuilds it
    const cc = Object.entries(this.wbRels.byId).find(([, r]) => r.type === XREL.calcChain);
    if (cc) {
      cc[1].el.remove(); delete this.wbRels.byId[cc[0]];
      this.zip.remove(cc[1].path);
      for (const o of X.kids(this.ct.documentElement, 'Override')) if (o.getAttribute('PartName') === '/' + cc[1].path) o.remove();
      this.touch(this.wbRels.path); this.touch('[Content_Types].xml');
    }
    let calcPr = this.wb.getElementsByTagNameNS(S_NS, 'calcPr')[0];
    if (!calcPr) {
      calcPr = this.wb.createElementNS(S_NS, 'calcPr');
      const after = ['definedNames', 'externalReferences', 'functionGroups', 'sheets'].map((n) => this.wb.getElementsByTagNameNS(S_NS, n)[0]).find(Boolean);
      after.after(calcPr);
    }
    calcPr.setAttribute('fullCalcOnLoad', '1');
    this.touch('xl/workbook.xml');
    // sheets
    this.sheets = [];
    for (const s of this.wb.getElementsByTagNameNS(S_NS, 'sheet')) {
      const r = this.wbRels.byId[X.rid(s, 'id')];
      if (!r || r.type !== XREL.sheet) continue; // chartsheets etc. are kept but not shown
      const sh = new XSheet(this, s, r.path, await this.xml(r.path));
      this.sheets.push(sh);
    }
    if (!this.sheets.length) throw new Error('This workbook has no worksheets');
    this.names = {};
    for (const dn of this.wb.getElementsByTagNameNS(S_NS, 'definedName')) {
      if (dn.getAttribute('localSheetId') != null) continue;
      this.names[dn.getAttribute('name').toUpperCase()] = dn.textContent;
    }
    const wv = this.wb.getElementsByTagNameNS(S_NS, 'workbookView')[0];
    this.activeTab = Math.min(wv ? +(wv.getAttribute('activeTab') || 0) : 0, this.sheets.length - 1);
  }
  richText(si) { return Array.from(si.getElementsByTagNameNS(S_NS, 't')).filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''); }
  async xml(path) {
    if (this.docs[path] !== undefined) return this.docs[path];
    const f = this.zip.file(path);
    return (this.docs[path] = f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null);
  }
  touch(p) { this.dirty.add(p); }
  async rels(part) { return PptxDoc.prototype.rels.call(this, part); }
  addRel(rels, type, target) { return PptxDoc.prototype.addRel.call(this, rels, type, target); }
  async save() {
    for (const p of this.dirty) {
      const d = this.docs[p];
      if (d) this.zip.file(p, XML_HEAD + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, ''));
    }
    this.dirty.clear();
    return this.zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  sheetByName(n) { const u = String(n).toUpperCase(); return this.sheets.find((s) => s.name.toUpperCase() === u); }

  /* ---- styles ---- */
  parseStyles() {
    const st = this.styles;
    const sk = (name) => st && st.getElementsByTagNameNS(S_NS, name)[0];
    this.numFmts = {};
    for (const n of X.kids(sk('numFmts'), 'numFmt')) this.numFmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode');
    this.fontsEl = sk('fonts'); this.fillsEl = sk('fills'); this.bordersEl = sk('borders'); this.xfsEl = sk('cellXfs');
    this.cssCache = {};
  }
  color(el) {
    if (!el) return null;
    if (el.getAttribute('auto') === '1') return null;
    let hex = null;
    if (el.hasAttribute('rgb')) hex = el.getAttribute('rgb').slice(-6);
    else if (el.hasAttribute('theme')) hex = this.themeColors[+el.getAttribute('theme')] || null;
    else if (el.hasAttribute('indexed')) { const i = +el.getAttribute('indexed'); hex = i === 64 || i === 65 ? null : INDEXED[i] || null; }
    if (!hex) return null;
    const tint = parseFloat(el.getAttribute('tint') || '0');
    if (tint) {
      const h = rgbToHsl(hexToRgb(hex));
      h[2] = tint < 0 ? h[2] * (1 + tint) : h[2] * (1 - tint) + tint;
      hex = rgbToHex(hslToRgb(h));
    }
    return '#' + hex;
  }
  xf(s) { return this.xfsEl ? X.kids(this.xfsEl, 'xf')[s || 0] || null : null; }
  fmtCode(s) {
    const xf = this.xf(s);
    const id = xf ? xf.getAttribute('numFmtId') || '0' : '0';
    return this.numFmts[id] || BUILTIN_FMT[id] || 'General';
  }
  cellCss(s) {
    s = s || 0;
    if (this.cssCache[s] !== undefined) return this.cssCache[s];
    const xf = this.xf(s);
    const css = [];
    if (xf) {
      const font = X.kids(this.fontsEl, 'font')[+xf.getAttribute('fontId') || 0];
      if (font) {
        if (X.kid(font, 'b') && X.kid(font, 'b').getAttribute('val') !== '0') css.push('font-weight:bold');
        if (X.kid(font, 'i') && X.kid(font, 'i').getAttribute('val') !== '0') css.push('font-style:italic');
        const deco = [X.kid(font, 'u') && X.kid(font, 'u').getAttribute('val') !== 'none' && 'underline', X.kid(font, 'strike') && 'line-through'].filter(Boolean);
        if (deco.length) css.push('text-decoration:' + deco.join(' '));
        const c = this.color(X.kid(font, 'color')); if (c) css.push('color:' + c);
        const sz = X.kid(font, 'sz'); if (sz) css.push(`font-size:${sz.getAttribute('val')}pt`);
        const nm = X.kid(font, 'name'); if (nm) css.push(`font-family:'${nm.getAttribute('val')}',Calibri,Carlito,Arial,sans-serif`);
      }
      const fill = X.kids(this.fillsEl, 'fill')[+xf.getAttribute('fillId') || 0];
      const pf = fill && X.kid(fill, 'patternFill');
      if (pf && pf.getAttribute('patternType') && pf.getAttribute('patternType') !== 'none') {
        const c = this.color(X.kid(pf, 'fgColor')) || this.color(X.kid(pf, 'bgColor'));
        if (c) css.push('background:' + c);
      }
      const gf = fill && X.kid(fill, 'gradientFill');
      if (gf) { const stop = gf.getElementsByTagNameNS(S_NS, 'color')[0]; const c = this.color(stop); if (c) css.push('background:' + c); }
      const border = X.kids(this.bordersEl, 'border')[+xf.getAttribute('borderId') || 0];
      if (border) for (const side of ['left', 'right', 'top', 'bottom']) {
        const b = X.kid(border, side);
        const style = b && b.getAttribute('style');
        if (!style) continue;
        const w = /medium|thick/.test(style) ? (style === 'thick' ? 3 : 2) : 1;
        const kind = /dash|dot/i.test(style) ? (/dot/i.test(style) ? 'dotted' : 'dashed') : style === 'double' ? 'double' : 'solid';
        css.push(`border-${side}:${style === 'double' ? 3 : w}px ${kind} ${this.color(X.kid(b, 'color')) || '#000'}`);
      }
      const al = X.kid(xf, 'alignment');
      if (al) {
        const h = al.getAttribute('horizontal');
        if (h) css.push('text-align:' + ({ centerContinuous: 'center', distributed: 'justify', fill: 'left', general: '' }[h] ?? h));
        const v = al.getAttribute('vertical');
        css.push('vertical-align:' + ({ center: 'middle', top: 'top', bottom: 'bottom', justify: 'middle', distributed: 'middle' }[v] || 'bottom'));
        if (al.getAttribute('wrapText') === '1') css.push('white-space:pre-wrap');
        if (al.getAttribute('indent')) css.push(`padding-left:${+al.getAttribute('indent') * 9 + 3}px`);
      }
    }
    return (this.cssCache[s] = css.join(';'));
  }
  hAlign(s) { const xf = this.xf(s); const al = xf && X.kid(xf, 'alignment'); const h = al && al.getAttribute('horizontal'); return h && h !== 'general' ? h : null; }

  /** returns a style index equal to `s` with changes applied (re-using an identical xf when possible) */
  deriveStyle(s, ch) {
    const st = this.styles;
    if (!st || !this.xfsEl) return s;
    const mk = (n, attrs) => { const e = st.createElementNS(S_NS, n); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
    const base = (this.xf(s) || this.xf(0)).cloneNode(true);
    if (ch.font) {
      const fonts = X.kids(this.fontsEl, 'font');
      const f = (fonts[+base.getAttribute('fontId') || 0] || fonts[0]).cloneNode(true);
      const order = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme'];
      const kids = {}; for (const k of X.kids(f)) kids[k.localName] = k;
      const flag = (n, on) => { if (on === undefined) return; if (on) kids[n] = mk(n); else delete kids[n]; };
      flag('b', ch.font.b); flag('i', ch.font.i); flag('strike', ch.font.strike);
      if (ch.font.u !== undefined) { if (ch.font.u) kids.u = mk('u'); else delete kids.u; }
      if (ch.font.color) kids.color = mk('color', { rgb: 'FF' + ch.font.color });
      if (ch.font.sz) kids.sz = mk('sz', { val: ch.font.sz });
      while (f.firstChild) f.firstChild.remove();
      for (const k of order) if (kids[k]) f.appendChild(kids[k]);
      base.setAttribute('fontId', this.findOrAdd(this.fontsEl, f));
      base.setAttribute('applyFont', '1');
    }
    if (ch.fill !== undefined) {
      if (ch.fill === null) base.setAttribute('fillId', '0');
      else {
        const f = mk('fill'); const pf = mk('patternFill', { patternType: 'solid' });
        pf.append(mk('fgColor', { rgb: 'FF' + ch.fill }), mk('bgColor', { indexed: '64' })); f.appendChild(pf);
        base.setAttribute('fillId', this.findOrAdd(this.fillsEl, f));
      }
      base.setAttribute('applyFill', '1');
    }
    if (ch.align !== undefined || ch.wrap !== undefined) {
      let al = X.kid(base, 'alignment');
      if (!al) { al = mk('alignment'); base.insertBefore(al, base.firstChild); }
      if (ch.align !== undefined) { if (ch.align) al.setAttribute('horizontal', ch.align); else al.removeAttribute('horizontal'); }
      if (ch.wrap !== undefined) { if (ch.wrap) al.setAttribute('wrapText', '1'); else al.removeAttribute('wrapText'); }
      base.setAttribute('applyAlignment', '1');
    }
    if (ch.numFmt !== undefined) {
      base.setAttribute('numFmtId', this.numFmtId(ch.numFmt));
      base.setAttribute('applyNumberFormat', '1');
    }
    if (ch.border !== undefined) {
      const b = mk('border');
      for (const side of ['left', 'right', 'top', 'bottom']) {
        const e = mk(side);
        if (ch.border) { e.setAttribute('style', 'thin'); e.appendChild(mk('color', { indexed: '64' })); }
        b.appendChild(e);
      }
      b.appendChild(mk('diagonal'));
      base.setAttribute('borderId', this.findOrAdd(this.bordersEl, b));
      base.setAttribute('applyBorder', '1');
    }
    return +this.findOrAdd(this.xfsEl, base);
  }
  findOrAdd(listEl, el) {
    const ser = new XMLSerializer();
    const want = ser.serializeToString(el).replace(/ xmlns="[^"]*"/g, '');
    const items = X.kids(listEl, el.localName);
    for (let i = 0; i < items.length; i++) if (ser.serializeToString(items[i]).replace(/ xmlns="[^"]*"/g, '') === want) return String(i);
    listEl.appendChild(el);
    listEl.setAttribute('count', items.length + 1);
    this.touch(this.stylesPath);
    this.cssCache = {};
    return String(items.length);
  }
  numFmtId(code) {
    for (const [id, c] of Object.entries(BUILTIN_FMT)) if (c === code && +id < 50 && ![14, 22].includes(+id)) return id;
    for (const [id, c] of Object.entries(this.numFmts)) if (c === code) return id;
    let nf = this.styles.getElementsByTagNameNS(S_NS, 'numFmts')[0];
    if (!nf) { nf = this.styles.createElementNS(S_NS, 'numFmts'); this.styles.documentElement.insertBefore(nf, this.styles.documentElement.firstElementChild); }
    const id = String(Math.max(163, ...Object.keys(this.numFmts).map(Number)) + 1);
    const e = this.styles.createElementNS(S_NS, 'numFmt'); e.setAttribute('numFmtId', id); e.setAttribute('formatCode', code);
    nf.appendChild(e); nf.setAttribute('count', X.kids(nf, 'numFmt').length);
    this.numFmts[id] = code;
    this.touch(this.stylesPath);
    return id;
  }

  /* ---- sheets ---- */
  async addSheet(name) {
    const path = PptxDoc.prototype.freeName.call(this, 'xl/worksheets', 'sheet', 'xml');
    const xml = `${XML_HEAD}<worksheet xmlns="${S_NS}" xmlns:r="${R_NS}"><dimension ref="A1"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
    this.docs[path] = new DOMParser().parseFromString(xml, 'application/xml'); this.touch(path);
    PptxDoc.prototype.addOverride.call(this, path, XCT_SHEET);
    const rid = this.addRel(this.wbRels, XREL.sheet, path);
    const sheetsEl = this.wb.getElementsByTagNameNS(S_NS, 'sheets')[0];
    let maxId = 0; for (const s of X.kids(sheetsEl, 'sheet')) maxId = Math.max(maxId, +s.getAttribute('sheetId'));
    const el = this.wb.createElementNS(S_NS, 'sheet');
    el.setAttribute('name', name); el.setAttribute('sheetId', maxId + 1); el.setAttributeNS(R_NS, 'r:id', rid);
    sheetsEl.appendChild(el);
    this.touch('xl/workbook.xml');
    const sh = new XSheet(this, el, path, this.docs[path]);
    this.sheets.push(sh);
    return sh;
  }
  deleteSheet(i) {
    const sh = this.sheets[i];
    const sheetsEl = this.wb.getElementsByTagNameNS(S_NS, 'sheets')[0];
    const pos = X.kids(sheetsEl, 'sheet').indexOf(sh.el);
    // fix sheet-scoped names
    for (const dn of Array.from(this.wb.getElementsByTagNameNS(S_NS, 'definedName'))) {
      const l = dn.getAttribute('localSheetId');
      if (l == null) continue;
      if (+l === pos) dn.remove(); else if (+l > pos) dn.setAttribute('localSheetId', +l - 1);
    }
    const dns = this.wb.getElementsByTagNameNS(S_NS, 'definedNames')[0];
    if (dns && !dns.children.length) dns.remove();
    sh.el.remove();
    const rid = Object.entries(this.wbRels.byId).find(([, r]) => r.path === sh.path)[0];
    this.wbRels.byId[rid].el.remove(); delete this.wbRels.byId[rid];
    this.zip.remove(sh.path); this.zip.remove(relsPathFor(sh.path));
    delete this.docs[sh.path]; this.dirty.delete(sh.path);
    PptxDoc.prototype.removeOverride.call(this, sh.path);
    this.touch(this.wbRels.path); this.touch('xl/workbook.xml');
    this.sheets.splice(i, 1);
    const wv = this.wb.getElementsByTagNameNS(S_NS, 'workbookView')[0];
    if (wv) { wv.setAttribute('activeTab', '0'); wv.removeAttribute('firstSheet'); }
  }
  renameSheet(sh, name) {
    const old = sh.name;
    sh.el.setAttribute('name', name); sh.name = name;
    for (const s of this.sheets) s.mapAllFormulas((ref) => (ref.sheet && ref.sheet.toUpperCase() === old.toUpperCase() ? { ...ref, sheet: name } : null));
    for (const dn of this.wb.getElementsByTagNameNS(S_NS, 'definedName'))
      dn.textContent = mapFormulaRefs(dn.textContent, (ref) => (ref.sheet && ref.sheet.toUpperCase() === old.toUpperCase() ? { ...ref, sheet: name } : null));
    this.touch('xl/workbook.xml');
  }
}

/* ---------- one worksheet ---------- */
class XSheet {
  constructor(book, el, path, doc) {
    this.book = book; this.el = el; this.name = el.getAttribute('name'); this.path = path; this.doc = doc;
    this.index();
  }
  index() {
    const doc = this.doc;
    this.data = doc.getElementsByTagNameNS(S_NS, 'sheetData')[0];
    if (!this.data) { this.data = doc.createElementNS(S_NS, 'sheetData'); doc.documentElement.appendChild(this.data); }
    this.rows = new Map(); this.cells = new Map();
    this.maxRow = 0; this.maxCol = 0;
    let rIdx = 0;
    const shared = {};
    let changed = false;
    for (const row of X.kids(this.data, 'row')) {
      rIdx = row.getAttribute('r') ? +row.getAttribute('r') : rIdx + 1;
      if (!row.getAttribute('r')) { row.setAttribute('r', rIdx); changed = true; }
      this.rows.set(rIdx, row);
      let cIdx = 0;
      for (const c of X.kids(row, 'c')) {
        let p = c.getAttribute('r') && parseA1(c.getAttribute('r'));
        cIdx = p ? p.c : cIdx + 1;
        if (!p) { c.setAttribute('r', a1(rIdx, cIdx)); changed = true; }
        this.cells.set(rIdx * 20000 + cIdx, c);
        const hasContent = X.kid(c, 'v') || X.kid(c, 'f') || X.kid(c, 'is');
        if (hasContent) { this.maxRow = Math.max(this.maxRow, rIdx); this.maxCol = Math.max(this.maxCol, cIdx); }
        else if (c.getAttribute('s') && c.getAttribute('s') !== '0') { this.maxRow = Math.max(this.maxRow, rIdx); this.maxCol = Math.max(this.maxCol, cIdx); }
        const f = X.kid(c, 'f');
        if (f && f.getAttribute('t') === 'shared') {
          const si = f.getAttribute('si');
          if (f.textContent) shared[si] = { f: f.textContent, r: rIdx, c: cIdx };
          else if (shared[si]) f.textContent = shiftFormula(shared[si].f, rIdx - shared[si].r, cIdx - shared[si].c);
          f.removeAttribute('t'); f.removeAttribute('si'); f.removeAttribute('ref');
          changed = true;
        }
      }
    }
    if (changed) this.book.touch(this.path);
    this.merges = Array.from(doc.getElementsByTagNameNS(S_NS, 'mergeCell')).map((m) => parseRange(m.getAttribute('ref'))).filter(Boolean);
    // column widths
    const fmt = doc.getElementsByTagNameNS(S_NS, 'sheetFormatPr')[0];
    this.defColW = fmt && fmt.getAttribute('defaultColWidth') ? +fmt.getAttribute('defaultColWidth') : fmt && fmt.getAttribute('baseColWidth') ? +fmt.getAttribute('baseColWidth') + 0.71 : 8.43;
    this.defRowH = fmt && fmt.getAttribute('defaultRowHeight') ? +fmt.getAttribute('defaultRowHeight') : 15;
    this.colInfo = new Map();
    for (const col of doc.getElementsByTagNameNS(S_NS, 'col'))
      for (let c = +col.getAttribute('min'); c <= Math.min(+col.getAttribute('max'), 1024); c++)
        this.colInfo.set(c, { width: col.getAttribute('width') ? +col.getAttribute('width') : null, hidden: col.getAttribute('hidden') === '1', style: col.getAttribute('style'), attrs: Array.from(col.attributes).map((a) => [a.name, a.value]) });
    const pane = doc.getElementsByTagNameNS(S_NS, 'pane')[0];
    this.freeze = pane && /frozen/.test(pane.getAttribute('state') || '') ? { rows: +(pane.getAttribute('ySplit') || 0), cols: +(pane.getAttribute('xSplit') || 0) } : { rows: 0, cols: 0 };
  }
  key(r, c) { return r * 20000 + c; }
  cell(r, c) { return this.cells.get(r * 20000 + c) || null; }
  colPx(c) { const i = this.colInfo.get(c); if (i && i.hidden) return 0; const w = i && i.width != null ? i.width : this.defColW; return Math.max(0, Math.round(w * 7 + 5)); }
  rowPx(r) {
    const row = this.rows.get(r);
    if (row && row.getAttribute('hidden') === '1') return 0;
    const ht = row && row.getAttribute('ht') ? +row.getAttribute('ht') : this.defRowH;
    return Math.round(ht * 4 / 3);
  }
  /* raw value for display & calculation */
  value(r, c) {
    const el = this.cell(r, c);
    if (!el) return null;
    const t = el.getAttribute('t'), v = X.kid(el, 'v');
    if (t === 'inlineStr') { const is = X.kid(el, 'is'); return is ? this.book.richText(is) : ''; }
    if (!v) return null;
    const txt = v.textContent;
    if (t === 's') return this.book.sst[+txt] ?? '';
    if (t === 'str') return txt;
    if (t === 'b') return txt === '1' || txt === 'true';
    if (t === 'e') return { error: txt };
    if (t === 'd') return dateToSerial(new Date(txt));
    return txt === '' ? null : +txt;
  }
  formula(r, c) { const el = this.cell(r, c); const f = el && X.kid(el, 'f'); return f && f.textContent ? f.textContent : null; }
  styleOf(r, c) {
    const el = this.cell(r, c);
    if (el && el.getAttribute('s')) return +el.getAttribute('s');
    const row = this.rows.get(r);
    if (row && row.getAttribute('customFormat') === '1' && row.getAttribute('s')) return +row.getAttribute('s');
    const ci = this.colInfo.get(c);
    if (ci && ci.style) return +ci.style;
    return 0;
  }
  /** what the user sees in the formula bar */
  raw(r, c) {
    const f = this.formula(r, c);
    if (f) return '=' + f;
    const v = this.value(r, c);
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'object') return v.error;
    if (typeof v === 'number') {
      const code = this.book.fmtCode(this.styleOf(r, c));
      if (isDateFormat(code)) return formatNumber(v, v % 1 ? 'dd-mm-yyyy hh:mm:ss' : 'dd-mm-yyyy').text;
      if (/%/.test(code)) return +(v * 100).toPrecision(12) + '%';
      return String(+v.toPrecision(15));
    }
    return String(v);
  }
  display(r, c) {
    const v = this.value(r, c);
    if (v == null) return { text: '' };
    if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE', align: 'center' };
    if (typeof v === 'object') return { text: v.error, align: 'center' };
    if (typeof v === 'number') {
      const code = this.book.fmtCode(this.styleOf(r, c));
      try {
        const out = formatNumber(v, code);
        return typeof out === 'string' ? { text: out, align: 'right', num: true } : { text: out.text, color: out.color, align: 'right', num: true };
      } catch { return { text: fmtGeneral(v), align: 'right', num: true }; }
    }
    return { text: String(v), str: true };
  }

  /* ---- writing ---- */
  ensureRow(r) {
    let row = this.rows.get(r);
    if (row) return row;
    row = this.doc.createElementNS(S_NS, 'row');
    row.setAttribute('r', r);
    let next = null;
    for (const [k, el] of this.rows) if (k > r && (!next || k < +next.getAttribute('r'))) next = el;
    this.data.insertBefore(row, next);
    this.rows.set(r, row);
    return row;
  }
  ensureCell(r, c) {
    let el = this.cell(r, c);
    if (el) return el;
    const row = this.ensureRow(r);
    el = this.doc.createElementNS(S_NS, 'c');
    el.setAttribute('r', a1(r, c));
    const st = this.styleOf(r, c);
    if (st) el.setAttribute('s', st);
    let next = null;
    for (const k of X.kids(row, 'c')) { const p = parseA1(k.getAttribute('r')); if (p && p.c > c) { next = k; break; } }
    row.insertBefore(el, next);
    this.cells.set(this.key(r, c), el);
    return el;
  }
  clearContent(el) {
    for (const k of X.kids(el)) if (/^(f|v|is)$/.test(k.localName)) k.remove();
    el.removeAttribute('t');
  }
  /** set from what the user typed */
  setRaw(r, c, text) {
    const book = this.book;
    let el = this.cell(r, c);
    text = text == null ? '' : String(text);
    if (text === '') {
      if (!el) return;
      this.clearContent(el);
      if (!el.getAttribute('s') || el.getAttribute('s') === '0') { el.remove(); this.cells.delete(this.key(r, c)); }
      book.touch(this.path);
      return;
    }
    el = this.ensureCell(r, c);
    this.clearContent(el);
    const mk = (n, txt) => { const e = this.doc.createElementNS(S_NS, n); if (txt != null) e.textContent = txt; el.appendChild(e); return e; };
    const s = this.styleOf(r, c);
    const code = book.fmtCode(s);
    let m;
    if (text[0] === '=' && text.length > 1) {
      mk('f', text.slice(1).replace(/^\+/, ''));
    } else if (code === '@' || text[0] === "'") {
      this.setText(el, text[0] === "'" ? text.slice(1) : text);
    } else if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) {
      mk('v', String(+text));
    } else if ((m = /^([-+]?)[₹$€£]?\s?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.exec(text.replace(/\s/g, ''))) && /[,₹$€£]/.test(text)) {
      const n = +(m[1] + m[2].replace(/,/g, '') + (m[4] || ''));
      mk('v', String(n));
      if (code === 'General') {
        const cur = (/[₹$€£]/.exec(text) || [''])[0];
        el.setAttribute('s', book.deriveStyle(s, { numFmt: cur ? `"${cur}"#,##0${m[4] ? '.00' : ''}` : `#,##0${m[4] ? '.00' : ''}` }));
      }
    } else if ((m = /^([-+]?\d+\.?\d*)\s?%$/.exec(text))) {
      mk('v', String(+m[1] / 100));
      if (code === 'General') el.setAttribute('s', book.deriveStyle(s, { numFmt: m[1].includes('.') ? '0.00%' : '0%' }));
    } else if (/^(true|false)$/i.test(text)) {
      el.setAttribute('t', 'b'); mk('v', /^true$/i.test(text) ? '1' : '0');
    } else {
      const d = parseUserDate(text);
      if (d != null) {
        mk('v', String(d.serial));
        if (!isDateFormat(code)) el.setAttribute('s', book.deriveStyle(s, { numFmt: d.time ? 'dd-mm-yyyy h:mm' : 'dd-mm-yyyy' }));
      } else this.setText(el, text);
    }
    this.maxRow = Math.max(this.maxRow, r); this.maxCol = Math.max(this.maxCol, c);
    book.touch(this.path);
  }
  setText(el, text) {
    el.setAttribute('t', 'inlineStr');
    const is = this.doc.createElementNS(S_NS, 'is');
    const t = this.doc.createElementNS(S_NS, 't');
    if (/^\s|\s$|\n/.test(text)) t.setAttribute('xml:space', 'preserve');
    t.textContent = text; is.appendChild(t); el.appendChild(is);
  }
  setFormulaResult(el, val) {
    for (const k of X.kids(el)) if (k.localName === 'v' || k.localName === 'is') k.remove();
    el.removeAttribute('t');
    if (val == null || val === '') { if (val === '') { el.setAttribute('t', 'str'); const v = this.doc.createElementNS(S_NS, 'v'); el.appendChild(v); } return; }
    const v = this.doc.createElementNS(S_NS, 'v');
    if (typeof val === 'object' && val.error) { el.setAttribute('t', 'e'); v.textContent = val.error; }
    else if (typeof val === 'boolean') { el.setAttribute('t', 'b'); v.textContent = val ? '1' : '0'; }
    else if (typeof val === 'number') v.textContent = Number.isFinite(val) ? String(val) : '#NUM!';
    else { el.setAttribute('t', 'str'); v.textContent = String(val); }
    el.appendChild(v);
  }
  setStyle(r, c, s) { const el = this.ensureCell(r, c); if (s) el.setAttribute('s', s); else el.removeAttribute('s'); this.book.touch(this.path); }
  mapAllFormulas(fn) {
    let any = false;
    for (const el of this.cells.values()) {
      const f = X.kid(el, 'f');
      if (f && f.textContent) {
        const n = mapFormulaRefs(f.textContent, (ref) => fn(ref, this));
        if (n !== f.textContent) { f.textContent = n; any = true; }
      }
    }
    if (any) this.book.touch(this.path);
  }
  setColWidth(c, px) {
    const info = this.colInfo.get(c) || { attrs: [] };
    info.width = Math.max(0.5, (px - 5) / 7);
    info.hidden = false;
    info.custom = true;
    this.colInfo.set(c, info);
    this.writeCols();
  }
  writeCols() {
    const doc = this.doc;
    let cols = doc.getElementsByTagNameNS(S_NS, 'cols')[0];
    if (!cols) { cols = doc.createElementNS(S_NS, 'cols'); this.data.before(cols); }
    while (cols.firstChild) cols.firstChild.remove();
    const keys = [...this.colInfo.keys()].sort((a, b) => a - b);
    const sig = (i) => JSON.stringify([i.width, i.hidden, i.style]);
    for (let k = 0; k < keys.length;) {
      const c0 = keys[k], info = this.colInfo.get(c0);
      let c1 = c0;
      while (k + 1 < keys.length && keys[k + 1] === c1 + 1 && sig(this.colInfo.get(keys[k + 1])) === sig(info)) { k++; c1++; }
      k++;
      const e = doc.createElementNS(S_NS, 'col');
      e.setAttribute('min', c0); e.setAttribute('max', c1);
      e.setAttribute('width', +(info.width ?? this.defColW).toFixed(4));
      if (info.style) e.setAttribute('style', info.style);
      if (info.hidden) e.setAttribute('hidden', '1');
      e.setAttribute('customWidth', '1');
      cols.appendChild(e);
    }
    if (!cols.children.length) cols.remove();
    this.book.touch(this.path);
  }

  /* ---- insert / delete rows & columns ---- */
  shiftStructure(axis, at, n) {
    // n > 0 insert n before `at`; n < 0 delete -n starting at `at`
    const del = n < 0, cnt = Math.abs(n), end = at + cnt - 1;
    const move = (v) => (del ? (v > end ? v - cnt : v) : v >= at ? v + n : v);
    const inDel = (v) => del && v >= at && v <= end;
    if (axis === 'row') {
      for (const [r, row] of [...this.rows.entries()]) {
        if (inDel(r)) { row.remove(); continue; }
        const nr = move(r);
        if (nr !== r) { row.setAttribute('r', nr); for (const c of X.kids(row, 'c')) { const p = parseA1(c.getAttribute('r')); c.setAttribute('r', a1(nr, p.c)); } }
      }
    } else {
      for (const row of this.rows.values()) for (const c of X.kids(row, 'c')) {
        const p = parseA1(c.getAttribute('r'));
        if (inDel(p.c)) { c.remove(); continue; }
        const nc = move(p.c);
        if (nc !== p.c) c.setAttribute('r', a1(p.r, nc));
      }
      const info = new Map();
      for (const [c, i] of this.colInfo) if (!inDel(c)) info.set(move(c), i);
      this.colInfo = info;
      if (this.doc.getElementsByTagNameNS(S_NS, 'cols')[0]) this.writeCols();
    }
    // merged cells
    const mc = this.doc.getElementsByTagNameNS(S_NS, 'mergeCells')[0];
    if (mc) {
      for (const m of X.kids(mc, 'mergeCell')) {
        const g = parseRange(m.getAttribute('ref'));
        const res = adjustSpan(axis === 'row' ? [g.r1, g.r2] : [g.c1, g.c2], at, n);
        if (!res) { m.remove(); continue; }
        if (axis === 'row') { g.r1 = res[0]; g.r2 = res[1]; } else { g.c1 = res[0]; g.c2 = res[1]; }
        if (g.r1 === g.r2 && g.c1 === g.c2) m.remove(); else m.setAttribute('ref', rangeA1(g));
      }
      if (!mc.children.length) mc.remove(); else mc.setAttribute('count', mc.children.length);
    }
    // formulas everywhere that point at this sheet
    const me = this.name.toUpperCase();
    for (const sh of this.book.sheets) {
      sh.mapAllFormulas((ref, owner) => {
        const target = ref.sheet ? ref.sheet.toUpperCase() : owner.name.toUpperCase();
        if (target !== me) return null;
        if (axis === 'row' && ref.kind === 'cols') return null;
        if (axis === 'col' && ref.kind === 'rows') return null;
        const span = axis === 'row' ? [ref.r1, ref.r2] : [ref.c1, ref.c2];
        const res = adjustSpan(span, at, n);
        if (!res) return '#REF!';
        if (res[0] === span[0] && res[1] === span[1]) return null;
        const o = { ...ref };
        if (axis === 'row') { o.r1 = res[0]; o.r2 = res[1]; } else { o.c1 = res[0]; o.c2 = res[1]; }
        return o;
      });
    }
    for (const dn of this.book.wb.getElementsByTagNameNS(S_NS, 'definedName')) {
      const t = mapFormulaRefs(dn.textContent, (ref) => {
        if (!ref.sheet || ref.sheet.toUpperCase() !== me) return null;
        const span = axis === 'row' ? [ref.r1, ref.r2] : [ref.c1, ref.c2];
        const res = adjustSpan(span, at, n);
        if (!res) return '#REF!';
        const o = { ...ref }; if (axis === 'row') { o.r1 = res[0]; o.r2 = res[1]; } else { o.c1 = res[0]; o.c2 = res[1]; }
        return o;
      });
      if (t !== dn.textContent) { dn.textContent = t; this.book.touch('xl/workbook.xml'); }
    }
    const dim = this.doc.getElementsByTagNameNS(S_NS, 'dimension')[0];
    if (dim) dim.remove();
    this.book.touch(this.path);
    this.index();
  }
  finalize() {
    // keep <dimension> roughly right
    let dim = this.doc.getElementsByTagNameNS(S_NS, 'dimension')[0];
    const ref = this.maxRow && this.maxCol ? 'A1:' + a1(this.maxRow, this.maxCol) : 'A1';
    if (!dim) {
      dim = this.doc.createElementNS(S_NS, 'dimension');
      const root = this.doc.documentElement;
      const sp = X.kid(root, 'sheetPr');
      root.insertBefore(dim, sp ? sp.nextSibling : root.firstChild);
    }
    dim.setAttribute('ref', ref);
  }
}
function adjustSpan([a, b], at, n) {
  if (n > 0) return [a >= at ? a + n : a, b >= at ? b + n : b];
  const cnt = -n, end = at + cnt - 1;
  const na = a > end ? a - cnt : a >= at ? at : a;
  const nb = b > end ? b - cnt : b >= at ? at - 1 : b;
  return nb < na ? null : [na, nb];
}
function isDateFormat(code) {
  if (!code || code === 'General' || code === '@') return false;
  const bare = code.split(';')[0].replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[ydhs]|(^|[^0#?])m/i.test(bare) && !/[0#?]/.test(bare.replace(/\.0+/, ''));
}
function parseUserDate(text) {
  let m, y, mo, d, h = 0, mi = 0, s = 0, time = false;
  const t = text.trim();
  const tm = /\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t);
  let datePart = t;
  if (tm) { h = +tm[1]; mi = +tm[2]; s = +(tm[3] || 0); if (tm[4]) { if (/pm/i.test(tm[4]) && h < 12) h += 12; if (/am/i.test(tm[4]) && h === 12) h = 0; } time = true; datePart = t.slice(0, tm.index); }
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(datePart))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; } // day first (India / UK)
  else if ((m = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]*(\d{2,4})$/.exec(datePart))) {
    const k = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3)));
    if (k < 0) return null; d = +m[1]; mo = k + 1; y = +m[3]; if (y < 100) y += 2000;
  } else if (!datePart && tm) { return { serial: (h * 3600 + mi * 60 + s) / 86400, time: true }; }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { serial: (Date.UTC(y, mo - 1, d, h, mi, s) - XL_EPOCH) / 86400000, time };
}

/* ===================================================================== */
/* Formula evaluation: fast-formula-parser for parsing + references,       */
/* formula.js for functions the parser doesn't implement                   */
const FJS_NAMES = ('SUMIFS AVERAGEIFS COUNTA COUNTBLANK COUNTIFS MAX MIN MAXA MINA MAXIFS MINIFS MEDIAN MODE MODE.SNGL STDEV STDEV.S STDEV.P STDEVA ' +
  'VAR VAR.S VAR.P RANK RANK.EQ RANK.AVG LARGE SMALL PERCENTILE PERCENTILE.INC QUARTILE QUARTILE.INC SWITCH CHOOSE LOOKUP MATCH TEXTJOIN UPPER SUBSTITUTE ' +
  'VALUE PMT FV PV NPV IRR RATE NPER IPMT PPMT UNIQUE SORT SEQUENCE CORREL FORECAST SLOPE INTERCEPT GEOMEAN DAYS360 YEARFRAC NUMBERVALUE').split(' ');
function lookupMatch(needle, list, mode) {
  const eq = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b);
  for (let i = 0; i < list.length; i++) if (eq(list[i], needle)) return i;
  if (mode === -1 || mode === 1) { // next smaller / next larger
    let best = -1;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (typeof v !== typeof needle || v == null) continue;
      if (mode === -1 ? v < needle && (best < 0 || v > list[best]) : v > needle && (best < 0 || v < list[best])) best = i;
    }
    return best;
  }
  return -1;
}
function buildFunctions() {
  const FE = FormulaParser.FormulaError;
  const unwrap = (a) => (!a || a.omitted ? undefined : a.value);
  const fromResult = (r) => {
    if (r instanceof Error) return new FE(/^#/.test(r.message) ? r.message : '#VALUE!');
    if (r instanceof Date) return dateToSerial(r);
    return r;
  };
  const fx = {};
  if (window.formulajs) for (const name of FJS_NAMES) {
    const fn = name.split('.').reduce((o, k) => (o ? o[k] : undefined), window.formulajs);
    if (typeof fn !== 'function') continue;
    fx[name] = (...args) => {
      const vals = args.map(unwrap);
      for (const v of vals) if (v instanceof FE) return v;
      try { return fromResult(fn(...vals)); } catch { return new FE('#VALUE!'); }
    };
  }
  const flat = (v) => (Array.isArray(v) ? v.flat() : [v]);
  fx.XLOOKUP = (needle, look, ret, notFound, mode) => {
    const list = flat(unwrap(look)), out = unwrap(ret);
    const i = lookupMatch(unwrap(needle), list, unwrap(mode) || 0);
    if (i < 0) return notFound && !notFound.omitted ? notFound.value : new FE('#N/A');
    if (!Array.isArray(out)) return out;
    return out.length === list.length ? out[i][0] : out[0][i];
  };
  fx.XMATCH = (needle, look, mode) => {
    const i = lookupMatch(unwrap(needle), flat(unwrap(look)), unwrap(mode) || 0);
    return i < 0 ? new FE('#N/A') : i + 1;
  };
  return fx;
}

class Calc {
  constructor(book) {
    this.book = book;
    const fx = buildFunctions();
    fx.INDIRECT = (ref) => {
      const t = String(ref && ref.value || '');
      const m = /^(?:('(?:[^']|'')+'|[^!]+)!)?\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(t.trim());
      if (!m) return new FormulaParser.FormulaError('#REF!');
      const v = this.get(m[1] ? unquoteSheet(m[1]) : this.cur.name, +m[3], colNum(m[2]));
      return v == null ? 0 : v;
    };
    this.parser = new FormulaParser({
      functions: fx,
      onCell: ({ sheet, row, col }) => this.get(sheet, row, col),
      onRange: ({ sheet, from, to }) => {
        const sh = this.book.sheetByName(sheet) || this.cur;
        const r2 = Math.min(to.row, Math.max(sh.maxRow, from.row)), c2 = Math.min(to.col, Math.max(sh.maxCol, from.col));
        const out = [];
        for (let r = from.row; r <= r2; r++) { const line = []; for (let c = from.col; c <= c2; c++) line.push(this.get(sheet, r, c)); out.push(line); }
        return out;
      },
      onVariable: (name, sheetName) => {
        const def = this.book.names[name.toUpperCase()];
        if (!def) return null;
        const m = /^(?:('(?:[^']|'')+'|[^!]+)!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(def.trim());
        if (!m) return null;
        const sheet = m[1] ? unquoteSheet(m[1]) : sheetName;
        if (!m[4]) return { sheet, row: +m[3], col: colNum(m[2]) };
        return { sheet, from: { row: +m[3], col: colNum(m[2]) }, to: { row: +m[5], col: colNum(m[4]) } };
      },
    });
  }
  get(sheetName, r, c) {
    const sh = (sheetName && this.book.sheetByName(sheetName)) || this.cur;
    if (!sh) return null;
    const el = sh.cell(r, c);
    if (!el) return null;
    if (X.kid(el, 'f') && X.kid(el, 'f').textContent) return this.evalCell(sh, r, c);
    const v = sh.value(r, c);
    if (v && typeof v === 'object') return this.errorObj(v.error);
    return v;
  }
  errorObj(code) { try { return new FormulaParser.FormulaError(code); } catch { return code; } }
  evalCell(sh, r, c) {
    const key = sh.path + '|' + r + '|' + c;
    if (this.memo.has(key)) return this.memo.get(key);
    if (this.stack.has(key)) { this.circular = true; return 0; }
    this.stack.add(key);
    const f = sh.formula(r, c);
    const saved = this.cur;
    this.cur = sh;
    let res;
    try {
      res = this.parser.parse(f, { sheet: sh.name, row: r, col: c });
    } catch (e) {
      res = e && (e._error || e.error) ? e : this.errorObj('#NAME?');
    }
    this.cur = saved;
    this.stack.delete(key);
    if (Array.isArray(res)) res = Array.isArray(res[0]) ? res[0][0] : res[0];
    if (res && typeof res === 'object' && res.ref) res = this.get(res.ref.sheet, res.ref.row, res.ref.col);
    this.memo.set(key, res);
    return res;
  }
  toStored(res) {
    if (res == null) return 0;
    if (typeof res === 'object') return { error: res._error || res.error || String(res) };
    return res;
  }
  recalc(onlyMissing = false) {
    this.memo = new Map(); this.stack = new Set(); this.circular = false;
    let n = 0;
    for (const sh of this.book.sheets) {
      this.cur = sh;
      for (const [k, el] of sh.cells) {
        const f = X.kid(el, 'f');
        if (!f || !f.textContent) continue;
        if (onlyMissing && X.kid(el, 'v') && (X.kid(el, 'v').textContent !== '' || el.getAttribute('t') === 'str')) continue;
        const r = Math.floor(k / 20000), c = k % 20000;
        const res = this.toStored(this.evalCell(sh, r, c));
        // keep Excel's own cached value when we can't evaluate a function
        if (res && res.error === '#NAME?' && X.kid(el, 'v') && el.getAttribute('t') !== 'e') continue;
        sh.setFormulaResult(el, res);
        n++;
      }
      if (n) this.book.touch(sh.path);
    }
    return n;
  }
}

/* ===================================================================== */
/* Editor UI                                                               */
const XlsxEditor = {
  book: null, sh: null, fileName: 'Untitled.xlsx', dirty: false, version: 0,
  act: { r: 1, c: 1 }, sel: { r1: 1, c1: 1, r2: 1, c2: 1 }, undo: [], redo: [],
  init() {
    this.grid = $('#xGrid');
    this.fx = $('#xFx');
    this.nameBox = $('#xName');
    $('#xUndo').onclick = () => this.doUndo();
    $('#xRedo').onclick = () => this.doRedo();
    $$('#xlsToolbar [data-xfont]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); this.toggleFont(b.dataset.xfont); }));
    $$('#xlsToolbar [data-xalign]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); this.applyStyle({ align: b.dataset.xalign || null }); }));
    $('#xWrap').addEventListener('mousedown', (e) => { e.preventDefault(); this.applyStyle({ wrap: !this.curWrap() }); });
    $('#xBorder').addEventListener('mousedown', (e) => { e.preventDefault(); this.applyStyle({ border: !this.curBorder() }); });
    const color = (id, fn) => {
      const inp = $(id);
      inp.parentElement.style.setProperty('--swatch', inp.value);
      inp.addEventListener('input', () => inp.parentElement.style.setProperty('--swatch', inp.value));
      inp.addEventListener('change', () => fn(inp.value.slice(1).toUpperCase()));
    };
    color('#xColor', (v) => this.applyStyle({ font: { color: v } }));
    color('#xFill', (v) => this.applyStyle({ fill: v }));
    $('#xNoFill').onclick = () => this.applyStyle({ fill: null });
    $('#xFmt').addEventListener('change', (e) => { if (e.target.value) this.applyStyle({ numFmt: e.target.value }); e.target.value = ''; this.grid.focus(); });
    $('#xSize').addEventListener('change', (e) => { if (e.target.value) this.applyStyle({ font: { sz: e.target.value } }); e.target.value = ''; this.grid.focus(); });
    $('#xSum').onclick = () => this.autoSum();
    $('#xInsRow').onclick = () => this.structure('row', 1);
    $('#xDelRow').onclick = () => this.structure('row', -1);
    $('#xInsCol').onclick = () => this.structure('col', 1);
    $('#xDelCol').onclick = () => this.structure('col', -1);
    $('#xSort').onclick = () => this.sort();
    this.fx.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.commitFx(); this.move(1, 0); this.grid.focus(); }
      else if (e.key === 'Escape') { this.fx.value = this.sh.raw(this.act.r, this.act.c); this.grid.focus(); }
      else if (e.key === 'Tab') { e.preventDefault(); this.commitFx(); this.move(0, 1); this.grid.focus(); }
    });
    this.fx.addEventListener('input', () => { if (this.editor) this.editor.value = this.fx.value; });
    this.nameBox.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const g = parseRange(this.nameBox.value.replace(/\$/g, ''));
      if (g) { this.select(g.r1, g.c1); this.sel = g; this.paintSel(); }
      this.grid.focus();
    });
    this.grid.addEventListener('keydown', (e) => this.keys(e));
    this.grid.addEventListener('copy', (e) => this.copy(e));
    this.grid.addEventListener('cut', (e) => { this.copy(e); this.clearSel(); });
    this.grid.addEventListener('paste', (e) => this.paste(e));
    this.grid.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.grid.addEventListener('dblclick', (e) => { const td = e.target.closest('td'); if (td) this.startEdit(); });
    this.grid.addEventListener('scroll', () => this.maybeGrow());
    window.addEventListener('resize', () => {});
  },
  async newDoc() {
    const buf = await (await fetch('blank.xlsx')).arrayBuffer();
    await this.open(buf, 'Untitled.xlsx');
  },
  async open(buf, name) {
    const book = new XlsxDoc();
    await book.load(buf);
    this.book = book;
    this.calc = new Calc(book);
    // fill in results for formulas saved without cached values (e.g. by scripts)
    const noValue = (el) => !X.kid(el, 'v') || (X.kid(el, 'v').textContent === '' && el.getAttribute('t') !== 'str');
    const missing = book.sheets.some((s) => [...s.cells.values()].some((el) => X.kid(el, 'f') && X.kid(el, 'f').textContent && noValue(el)));
    if (missing) this.calc.recalc(true);
    this.fileName = name; this.dirty = false; this.undo = []; this.redo = [];
    this.showSheet(book.activeTab);
    App.updateTitle();
  },
  async openCsv(text, name) {
    await this.newDoc();
    const rows = parseDelimited(text, text.includes('\t') && !text.includes(',') ? '\t' : ',');
    rows.forEach((line, i) => line.forEach((v, j) => { if (v !== '') this.sh.setRaw(i + 1, j + 1, v); }));
    this.calc.recalc();
    this.fileName = baseName(name) + '.xlsx';
    this.showSheet(0);
    this.markDirty();
    toast('CSV imported — it will be saved as an Excel workbook');
  },
  markDirty() { this.dirty = true; this.version++; App.updateTitle(); },
  async draftBlob() { return this.save(); },
  async save() {
    this.commitEdit();
    for (const s of this.book.sheets) s.finalize();
    return this.book.save();
  },

  /* ---- rendering ---- */
  showSheet(i) {
    this.commitEdit();
    this.sh = this.book.sheets[i];
    const wv = this.book.wb.getElementsByTagNameNS(S_NS, 'workbookView')[0];
    if (wv && +(wv.getAttribute('activeTab') || 0) !== i) { wv.setAttribute('activeTab', i); this.book.touch('xl/workbook.xml'); }
    this.renderTabs();
    this.rowsShown = Math.min(Math.max(this.sh.maxRow + 30, 100), 400);
    this.colsShown = Math.min(Math.max(this.sh.maxCol + 5, 26), 702);
    this.render();
    this.select(1, 1);
    this.grid.scrollTop = 0; this.grid.scrollLeft = 0;
  },
  renderTabs() {
    const box = $('#xTabs');
    box.innerHTML = '';
    this.book.sheets.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'stab' + (s === this.sh ? ' active' : '');
      b.textContent = s.name;
      b.title = 'Tap again for rename / delete';
      b.onclick = () => (s === this.sh ? this.sheetMenu(i) : this.showSheet(i));
      box.appendChild(b);
    });
    const add = document.createElement('button');
    add.className = 'stab add'; add.textContent = '+'; add.title = 'Add sheet';
    add.onclick = () => this.addSheet();
    box.appendChild(add);
  },
  render() {
    const sh = this.sh;
    const tbl = document.createElement('table');
    tbl.className = 'xgrid';
    const cg = document.createElement('colgroup');
    const c0 = document.createElement('col'); c0.style.width = '46px'; cg.appendChild(c0);
    let totalW = 46;
    for (let c = 1; c <= this.colsShown; c++) { const col = document.createElement('col'); const w = sh.colPx(c); col.style.width = w + 'px'; totalW += w; cg.appendChild(col); }
    tbl.appendChild(cg);
    tbl.style.width = totalW + 'px';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const corner = document.createElement('th'); corner.className = 'corner'; corner.title = 'Select all';
    hr.appendChild(corner);
    for (let c = 1; c <= this.colsShown; c++) {
      const th = document.createElement('th'); th.className = 'ch'; th.dataset.c = c; th.textContent = colName(c);
      const rz = document.createElement('span'); rz.className = 'rz'; th.appendChild(rz);
      hr.appendChild(th);
    }
    thead.appendChild(hr); tbl.appendChild(thead);
    this.tbody = document.createElement('tbody');
    tbl.appendChild(this.tbody);
    this.tds = new Map(); this.rhs = new Map();
    this.mergeMap = new Map(); this.covered = new Set();
    for (const g of sh.merges) {
      this.mergeMap.set(sh.key(g.r1, g.c1), g);
      for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if (r !== g.r1 || c !== g.c1) this.covered.add(sh.key(r, c));
    }
    this.renderRows(1, this.rowsShown);
    this.grid.innerHTML = '';
    this.grid.appendChild(tbl);
    this.table = tbl;
  },
  renderRows(from, to) {
    const sh = this.sh;
    const frag = document.createDocumentFragment();
    for (let r = from; r <= to; r++) {
      const tr = document.createElement('tr');
      const h = sh.rowPx(r);
      tr.style.height = h + 'px';
      if (!h) tr.style.display = 'none';
      const th = document.createElement('th'); th.className = 'rh'; th.textContent = r; th.dataset.r = r;
      tr.appendChild(th);
      this.rhs.set(r, th);
      for (let c = 1; c <= this.colsShown; c++) {
        const k = sh.key(r, c);
        if (this.covered.has(k)) continue;
        const td = document.createElement('td');
        td.dataset.r = r; td.dataset.c = c;
        const g = this.mergeMap.get(k);
        if (g) { td.rowSpan = g.r2 - g.r1 + 1; td.colSpan = Math.min(g.c2, this.colsShown) - g.c1 + 1; }
        this.paintCell(td, r, c);
        this.tds.set(k, td);
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    this.tbody.appendChild(frag);
  },
  paintCell(td, r, c) {
    const sh = this.sh;
    const s = sh.styleOf(r, c);
    const d = sh.display(r, c);
    let css = this.book.cellCss(s);
    const h = this.book.hAlign(s);
    if (!h && d.align) css += ';text-align:' + d.align;
    if (d.color) css += ';color:' + ({ red: '#d00', blue: '#00c', green: '#080' }[d.color] || d.color);
    td.style.cssText = css;
    td.textContent = d.text;
    if (d.num) { td.dataset.num = '1'; this.queueFit(); } else delete td.dataset.num;
    // long text spills into empty neighbours, as in Excel
    const spill = d.str && !/pre-wrap/.test(css) && (!h || h === 'left' || h === 'general') && sh.value(r, c + 1) == null;
    td.classList.toggle('spill', !!spill);
    if (r >= this.sel.r1 && r <= this.sel.r2 && c >= this.sel.c1 && c <= this.sel.c2) td.classList.add('sel');
    if (r === this.act.r && c === this.act.c) td.classList.add('act');
  },
  /* numbers that don't fit show as ####, like Excel */
  queueFit() {
    if (this.fitQueued) return;
    this.fitQueued = true;
    requestAnimationFrame(() => {
      this.fitQueued = false;
      for (const td of this.grid.querySelectorAll('td[data-num]')) {
        if (td.scrollWidth > td.clientWidth + 1 && td.clientWidth > 0) {
          td.title = td.textContent;
          td.textContent = '#'.repeat(Math.max(1, Math.floor((td.clientWidth - 6) / 7)));
        } else td.removeAttribute('title');
      }
    });
  },
  repaintAll() {
    for (const [k, td] of this.tds) this.paintCell(td, Math.floor(k / 20000), k % 20000);
    this.updateStatus();
  },
  maybeGrow() {
    const g = this.grid;
    if (g.scrollTop + g.clientHeight > g.scrollHeight - 300 && this.rowsShown < MAX_ROWS) {
      const from = this.rowsShown + 1;
      this.rowsShown = Math.min(this.rowsShown + 200, MAX_ROWS);
      this.renderRows(from, this.rowsShown);
    }
    if (g.scrollLeft + g.clientWidth > g.scrollWidth - 200 && this.colsShown < 702) {
      this.colsShown = Math.min(this.colsShown + 10, 702);
      const top = g.scrollTop, left = g.scrollLeft;
      this.render(); this.paintSel();
      g.scrollTop = top; g.scrollLeft = left;
    }
  },

  /* ---- selection ---- */
  td(r, c) {
    const k = this.sh.key(r, c);
    if (this.tds.has(k)) return this.tds.get(k);
    for (const g of this.sh.merges) if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return this.tds.get(this.sh.key(g.r1, g.c1));
    return null;
  },
  select(r, c, extend = false) {
    this.commitEdit();
    r = Math.max(1, Math.min(r, MAX_ROWS)); c = Math.max(1, Math.min(c, 702));
    while (r > this.rowsShown) { const f = this.rowsShown + 1; this.rowsShown += 200; this.renderRows(f, this.rowsShown); }
    if (c > this.colsShown) { this.colsShown = Math.min(c + 10, 702); this.render(); }
    if (extend) {
      this.sel = { r1: Math.min(this.anchor.r, r), c1: Math.min(this.anchor.c, c), r2: Math.max(this.anchor.r, r), c2: Math.max(this.anchor.c, c) };
      this.cursor = { r, c };
    } else {
      // a merged cell selects as a whole
      const g = this.sh.merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
      if (g) { r = g.r1; c = g.c1; }
      this.act = { r, c }; this.anchor = { r, c }; this.cursor = { r, c };
      this.sel = g ? { ...g } : { r1: r, c1: c, r2: r, c2: c };
    }
    this.paintSel();
    const td = this.td(extend ? this.cursor.r : this.act.r, extend ? this.cursor.c : this.act.c);
    if (td) this.scrollInto(td);
  },
  scrollInto(td) {
    const g = this.grid, tr = td.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const top = gr.top + 22, left = gr.left + 46;
    if (tr.top < top) g.scrollTop -= top - tr.top;
    else if (tr.bottom > gr.bottom - 12) g.scrollTop += tr.bottom - gr.bottom + 12;
    if (tr.left < left) g.scrollLeft -= left - tr.left;
    else if (tr.right > gr.right - 12) g.scrollLeft += tr.right - gr.right + 12;
  },
  paintSel() {
    for (const el of this.grid.querySelectorAll('td.sel, td.act, th.hl')) el.classList.remove('sel', 'act', 'hl');
    const { r1, c1, r2, c2 } = this.sel;
    const multi = r1 !== r2 || c1 !== c2;
    const rr2 = Math.min(r2, this.rowsShown), cc2 = Math.min(c2, this.colsShown);
    if (multi && (rr2 - r1 + 1) * (cc2 - c1 + 1) <= 200000)
      for (let r = r1; r <= rr2; r++) for (let c = c1; c <= cc2; c++) { const td = this.tds.get(this.sh.key(r, c)); if (td) td.classList.add('sel'); }
    const a = this.td(this.act.r, this.act.c); if (a) a.classList.add('act');
    for (const th of this.table.querySelectorAll('th.ch')) if (+th.dataset.c >= c1 && +th.dataset.c <= c2) th.classList.add('hl');
    for (let r = r1; r <= Math.min(r2, this.rowsShown); r++) { const th = this.rhs.get(r); if (th) th.classList.add('hl'); }
    this.nameBox.value = rangeA1(this.sel).replace(/^A1:([A-Z]+)1048576$/, '1:1048576');
    this.fx.value = this.sh.raw(this.act.r, this.act.c);
    this.syncToolbar();
    this.updateStatus();
  },
  syncToolbar() {
    const s = this.sh.styleOf(this.act.r, this.act.c);
    const xf = this.book.xf(s);
    const font = xf && X.kids(this.book.fontsEl, 'font')[+xf.getAttribute('fontId') || 0];
    const on = (n) => !!(font && X.kid(font, n) && X.kid(font, n).getAttribute('val') !== '0' && X.kid(font, n).getAttribute('val') !== 'none');
    for (const b of $$('#xlsToolbar [data-xfont]')) b.classList.toggle('on', on(b.dataset.xfont));
    const h = this.book.hAlign(s);
    for (const b of $$('#xlsToolbar [data-xalign]')) b.classList.toggle('on', (b.dataset.xalign || null) === h);
    $('#xWrap').classList.toggle('on', this.curWrap());
  },
  curWrap() { const xf = this.book.xf(this.sh.styleOf(this.act.r, this.act.c)); const al = xf && X.kid(xf, 'alignment'); return !!(al && al.getAttribute('wrapText') === '1'); },
  curBorder() { const xf = this.book.xf(this.sh.styleOf(this.act.r, this.act.c)); return !!(xf && +xf.getAttribute('borderId') > 0); },
  updateStatus() {
    const { r1, c1, r2, c2 } = this.sel;
    let sum = 0, n = 0, cnt = 0;
    if (r1 !== r2 || c1 !== c2) {
      const R2 = Math.min(r2, this.sh.maxRow), C2 = Math.min(c2, this.sh.maxCol);
      for (let r = r1; r <= R2; r++) for (let c = c1; c <= C2; c++) {
        const v = this.sh.value(r, c);
        if (v == null || v === '') continue;
        cnt++;
        if (typeof v === 'number') { sum += v; n++; }
      }
    }
    const f = (x) => (+x.toFixed(6)).toLocaleString();
    $('#xStats').textContent = cnt ? (n ? `Sum ${f(sum)} · Average ${f(sum / n)} · Count ${cnt}` : `Count ${cnt}`) : `${this.sh.name} · ${rangeA1(this.sel)}`;
  },
  pointerDown(e) {
    const t = e.target;
    if (t.classList.contains('rz')) return this.resizeCol(e, +t.parentElement.dataset.c);
    if (this.editor && this.editor.contains(t)) return;
    const td = t.closest('td'), th = t.closest('th');
    if (th && th.classList.contains('corner')) { this.select(1, 1); this.sel = { r1: 1, c1: 1, r2: MAX_ROWS, c2: MAX_COLS }; this.paintSel(); return; }
    if (th && th.dataset.c) { const c = +th.dataset.c; this.select(1, c); this.anchor = { r: 1, c }; this.sel = { r1: 1, c1: c, r2: MAX_ROWS, c2: c }; this.paintSel(); this.dragHeader(e, 'c'); return; }
    if (th && th.dataset.r) { const r = +th.dataset.r; this.select(r, 1); this.anchor = { r, c: 1 }; this.sel = { r1: r, c1: 1, r2: r, c2: MAX_COLS }; this.paintSel(); this.dragHeader(e, 'r'); return; }
    if (!td) return;
    const r = +td.dataset.r, c = +td.dataset.c;
    if (e.pointerType !== 'mouse' && r === this.act.r && c === this.act.c && this.sel.r1 === this.sel.r2 && this.sel.c1 === this.sel.c2) {
      // second tap on the same cell on a touch screen: edit it
      e.preventDefault(); this.startEdit(); return;
    }
    if (e.shiftKey) this.select(r, c, true); else this.select(r, c);
    if (e.pointerType === 'mouse') {
      e.preventDefault();
      this.grid.focus({ preventScroll: true });
      const mm = (ev) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const t2 = el && el.closest && el.closest('#xGrid td');
        if (t2 && (+t2.dataset.r !== this.cursor.r || +t2.dataset.c !== this.cursor.c)) this.select(+t2.dataset.r, +t2.dataset.c, true);
      };
      const mu = () => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); };
      window.addEventListener('pointermove', mm); window.addEventListener('pointerup', mu);
    }
  },
  dragHeader(e, axis) {
    if (e.pointerType !== 'mouse') return;
    e.preventDefault(); this.grid.focus({ preventScroll: true });
    const mm = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const th = el && el.closest && el.closest('#xGrid th');
      if (!th) return;
      if (axis === 'c' && th.dataset.c) { const c = +th.dataset.c; this.sel = { r1: 1, r2: MAX_ROWS, c1: Math.min(this.anchor.c, c), c2: Math.max(this.anchor.c, c) }; this.paintSel(); }
      if (axis === 'r' && th.dataset.r) { const r = +th.dataset.r; this.sel = { c1: 1, c2: MAX_COLS, r1: Math.min(this.anchor.r, r), r2: Math.max(this.anchor.r, r) }; this.paintSel(); }
    };
    const mu = () => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); };
    window.addEventListener('pointermove', mm); window.addEventListener('pointerup', mu);
  },
  resizeCol(e, c) {
    e.preventDefault(); e.stopPropagation();
    const col = this.table.querySelectorAll('col')[c];
    const x0 = e.clientX, w0 = this.sh.colPx(c);
    const mm = (ev) => { col.style.width = Math.max(8, w0 + ev.clientX - x0) + 'px'; this.table.style.width = ''; };
    const mu = (ev) => {
      window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu);
      const w = Math.max(8, w0 + ev.clientX - x0);
      if (Math.abs(w - w0) < 2) return;
      this.pushUndo();
      this.sh.setColWidth(c, w);
      this.repaintAll();
      this.markDirty();
    };
    window.addEventListener('pointermove', mm); window.addEventListener('pointerup', mu);
  },
  move(dr, dc, extend = false) {
    const from = extend ? this.cursor : this.act;
    let r = from.r + dr, c = from.c + dc;
    // skip over the rest of a merged cell
    const g = !extend && this.sh.merges.find((m) => m.r1 === this.act.r && m.c1 === this.act.c);
    if (g && dr > 0) r = g.r2 + 1;
    if (g && dc > 0) c = g.c2 + 1;
    this.select(Math.max(1, r), Math.max(1, c), extend);
  },
  jump(dr, dc) {
    // Ctrl+arrow: to the edge of the data block
    const sh = this.sh;
    let { r, c } = this.act;
    const filled = (r2, c2) => sh.value(r2, c2) != null;
    const start = filled(r, c), nxt = filled(r + dr, c + dc);
    const lim = (r2, c2) => r2 >= 1 && c2 >= 1 && r2 <= Math.max(sh.maxRow, 1) + 1 && c2 <= Math.max(sh.maxCol, 1) + 1;
    if (start && nxt) { while (lim(r + dr, c + dc) && filled(r + dr, c + dc)) { r += dr; c += dc; } }
    else { r += dr; c += dc; while (lim(r, c) && !filled(r, c)) { r += dr; c += dc; } if (!lim(r, c)) { r = dr ? (dr > 0 ? sh.maxRow + 1 : 1) : r; c = dc ? (dc > 0 ? sh.maxCol + 1 : 1) : c; } }
    this.select(Math.max(1, r), Math.max(1, c));
  },
  keys(e) {
    if (this.editor) return; // the cell editor handles its own keys
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (mod && /^[biu]$/i.test(k)) { e.preventDefault(); this.toggleFont(k.toLowerCase()); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); this.sel = { r1: 1, c1: 1, r2: Math.max(this.sh.maxRow, 1), c2: Math.max(this.sh.maxCol, 1) }; this.paintSel(); return; }
    if (mod && /^Arrow/.test(k)) { e.preventDefault(); this.jump(k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0, k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0); return; }
    if (mod) return; // let copy / paste through
    const dir = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[k];
    if (dir) { e.preventDefault(); this.move(dir[0], dir[1], e.shiftKey); return; }
    if (k === 'Enter') { e.preventDefault(); this.move(e.shiftKey ? -1 : 1, 0); return; }
    if (k === 'Tab') { e.preventDefault(); this.move(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); this.move((k === 'PageDown' ? 1 : -1) * 20, 0); return; }
    if (k === 'Home') { e.preventDefault(); this.select(this.act.r, 1); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.clearSel(); return; }
    if (k === 'F2') { e.preventDefault(); this.startEdit(); return; }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); this.startEdit(k); }
  },

  /* ---- editing ---- */
  startEdit(initial) {
    if (this.editor) return;
    const td = this.td(this.act.r, this.act.c);
    if (!td) return;
    const inp = document.createElement('textarea');
    inp.className = 'xedit';
    inp.rows = 1;
    inp.spellcheck = false;
    inp.value = initial !== undefined ? initial : this.sh.raw(this.act.r, this.act.c);
    inp.style.cssText = td.style.cssText + ';min-width:' + Math.max(td.offsetWidth, 60) + 'px;height:' + Math.max(td.offsetHeight, 22) + 'px';
    td.classList.remove('spill');
    td.textContent = '';
    td.appendChild(inp);
    this.editor = inp;
    this.editing = { r: this.act.r, c: this.act.c, td };
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
    this.fx.value = inp.value;
    inp.addEventListener('input', () => { this.fx.value = inp.value; inp.style.width = Math.max(td.offsetWidth, inp.scrollWidth) + 'px'; });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); this.commitEdit(); this.move(e.shiftKey ? -1 : 1, 0); this.grid.focus({ preventScroll: true }); }
      else if (e.key === 'Enter' && e.altKey) { e.preventDefault(); const p = inp.selectionStart; inp.value = inp.value.slice(0, p) + '\n' + inp.value.slice(inp.selectionEnd); inp.setSelectionRange(p + 1, p + 1); }
      else if (e.key === 'Tab') { e.preventDefault(); this.commitEdit(); this.move(0, e.shiftKey ? -1 : 1); this.grid.focus({ preventScroll: true }); }
      else if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); this.grid.focus({ preventScroll: true }); }
      else if (/^Arrow(Up|Down)$/.test(e.key) && initial !== undefined) { e.preventDefault(); this.commitEdit(); this.move(e.key === 'ArrowDown' ? 1 : -1, 0); this.grid.focus({ preventScroll: true }); }
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (this.editor === inp && document.activeElement !== this.fx) this.commitEdit(); }, 0));
  },
  cancelEdit() {
    if (!this.editor) return;
    const { r, c, td } = this.editing;
    this.editor = null; this.editing = null;
    this.paintCell(td, r, c);
    this.fx.value = this.sh.raw(r, c);
  },
  commitEdit() {
    if (!this.editor) return;
    const val = this.editor.value;
    const { r, c } = this.editing;
    this.cancelEdit();
    this.setCells([[r, c, val]]);
  },
  commitFx() {
    if (this.editor) { this.editor.value = this.fx.value; this.commitEdit(); return; }
    this.setCells([[this.act.r, this.act.c, this.fx.value]]);
  },
  /** writes values, recalculates and repaints */
  setCells(list, { undo = true } = {}) {
    const changed = list.filter(([r, c, v]) => this.sh.raw(r, c) !== String(v ?? ''));
    if (!changed.length) return;
    if (undo) this.pushUndo();
    for (const [r, c, v] of changed) this.sh.setRaw(r, c, v);
    this.afterChange();
  },
  afterChange() {
    this.calc.recalc();
    if (this.calc.circular) toast('Circular reference: a formula refers to its own cell');
    if (this.sh.maxRow + 30 > this.rowsShown) { const f = this.rowsShown + 1; this.rowsShown = this.sh.maxRow + 50; this.renderRows(f, this.rowsShown); }
    if (this.sh.maxCol + 3 > this.colsShown) { this.colsShown = Math.min(this.sh.maxCol + 10, 702); this.render(); }
    this.repaintAll();
    this.paintSel();
    this.markDirty();
  },
  clearSel() {
    const { r1, c1 } = this.sel;
    const r2 = Math.min(this.sel.r2, this.sh.maxRow), c2 = Math.min(this.sel.c2, this.sh.maxCol);
    const list = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (this.sh.cell(r, c)) list.push([r, c, '']);
    this.setCells(list);
  },
  applyStyle(ch) {
    if (!this.book) return;
    this.commitEdit();
    this.pushUndo();
    const { r1, c1 } = this.sel;
    const r2 = Math.min(this.sel.r2, Math.max(this.sh.maxRow, this.act.r)), c2 = Math.min(this.sel.c2, Math.max(this.sh.maxCol, this.act.c));
    const cache = new Map();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const s = this.sh.styleOf(r, c);
      if (!cache.has(s)) cache.set(s, this.book.deriveStyle(s, ch));
      this.sh.setStyle(r, c, cache.get(s));
    }
    this.repaintAll(); this.paintSel(); this.markDirty();
    this.grid.focus({ preventScroll: true });
  },
  toggleFont(k) {
    const xf = this.book.xf(this.sh.styleOf(this.act.r, this.act.c));
    const font = xf && X.kids(this.book.fontsEl, 'font')[+xf.getAttribute('fontId') || 0];
    const on = !!(font && X.kid(font, k) && !/^(0|none)$/.test(X.kid(font, k).getAttribute('val') || ''));
    this.applyStyle({ font: { [k]: !on } });
  },
  autoSum() {
    this.commitEdit();
    const { r, c } = this.act;
    let top = r - 1;
    while (top >= 1 && typeof this.sh.value(top, c) === 'number' && !this.sh.formula(top, c)?.startsWith('SUM(')) top--;
    if (top < r - 1) { this.setCells([[r, c, `=SUM(${a1(top + 1, c)}:${a1(r - 1, c)})`]]); return; }
    let left = c - 1;
    while (left >= 1 && typeof this.sh.value(r, left) === 'number') left--;
    if (left < c - 1) { this.setCells([[r, c, `=SUM(${a1(r, left + 1)}:${a1(r, c - 1)})`]]); return; }
    this.startEdit('=SUM(');
  },
  structure(axis, dir) {
    this.commitEdit();
    const at = axis === 'row' ? this.sel.r1 : this.sel.c1;
    const span = axis === 'row' ? Math.min(this.sel.r2, MAX_ROWS) - this.sel.r1 + 1 : Math.min(this.sel.c2, MAX_COLS) - this.sel.c1 + 1;
    const n = Math.min(span, 1000);
    this.pushUndo();
    this.sh.shiftStructure(axis, at, dir > 0 ? n : -n);
    this.calc.recalc();
    this.render();
    this.select(this.act.r, this.act.c);
    this.markDirty();
    toast(`${dir > 0 ? 'Inserted' : 'Deleted'} ${n} ${axis === 'row' ? 'row' : 'column'}${n > 1 ? 's' : ''}`);
  },
  sort() {
    this.commitEdit();
    let { r1, c1, r2, c2 } = this.sel;
    if (r1 === r2 && c1 === c2) { // whole data block around the cursor
      r1 = 1; c1 = 1; r2 = this.sh.maxRow; c2 = this.sh.maxCol;
    }
    r2 = Math.min(r2, this.sh.maxRow); c2 = Math.min(c2, this.sh.maxCol);
    if (r2 <= r1) return toast('Select the rows to sort');
    const key = this.act.c;
    const hasHeader = typeof this.sh.value(r1, key) === 'string' && typeof this.sh.value(r1 + 1, key) !== 'string';
    const desc = !!this.sortDesc; this.sortDesc = !desc;
    const start = hasHeader ? r1 + 1 : r1;
    const rows = [];
    for (let r = start; r <= r2; r++) {
      const line = [];
      for (let c = c1; c <= c2; c++) line.push({ f: this.sh.formula(r, c), raw: this.sh.raw(r, c), s: this.sh.styleOf(r, c), src: r });
      rows.push({ k: this.sh.value(r, key), line });
    }
    const rank = (v) => (v == null ? 3 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
    rows.sort((a, b) => {
      const ra = rank(a.k), rb = rank(b.k);
      if (ra !== rb) return ra - rb;
      if (ra === 3) return 0;
      const cmp = ra === 0 ? a.k - b.k : String(a.k).localeCompare(String(b.k), undefined, { numeric: true, sensitivity: 'base' });
      return desc ? -cmp : cmp;
    });
    this.pushUndo();
    rows.forEach((row, i) => row.line.forEach((cell, j) => {
      const r = start + i, c = c1 + j;
      this.sh.setStyle(r, c, cell.s);
      this.sh.setRaw(r, c, cell.f ? '=' + shiftFormula(cell.f, r - cell.src, 0) : cell.raw);
    }));
    this.afterChange();
    toast(`Sorted by column ${colName(key)} (${desc ? 'Z→A' : 'A→Z'}) — press again to reverse`);
  },

  /* ---- clipboard ---- */
  copy(e) {
    if (this.editor) return;
    e.preventDefault();
    const { r1, c1 } = this.sel;
    const r2 = Math.min(this.sel.r2, Math.max(this.sh.maxRow, r1)), c2 = Math.min(this.sel.c2, Math.max(this.sh.maxCol, c1));
    const lines = [];
    for (let r = r1; r <= r2; r++) {
      const cells = [];
      for (let c = c1; c <= c2; c++) { const t = this.sh.display(r, c).text; cells.push(/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t); }
      lines.push(cells.join('\t'));
    }
    const text = lines.join('\n');
    e.clipboardData.setData('text/plain', text);
    // remember formulas & styles so pasting inside the editor keeps them
    const raw = [];
    for (let r = r1; r <= r2; r++) { const line = []; for (let c = c1; c <= c2; c++) line.push({ f: this.sh.formula(r, c), raw: this.sh.raw(r, c), s: this.sh.styleOf(r, c) }); raw.push(line); }
    this.clip = { text, r1, c1, raw, book: this.book };
    toast(`Copied ${rangeA1({ r1, c1, r2, c2 })}`, 1200);
  },
  paste(e) {
    if (this.editor) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const { r, c } = this.act;
    const list = [], styles = [];
    if (this.clip && this.clip.book === this.book && this.clip.text === text) {
      this.clip.raw.forEach((line, i) => line.forEach((cell, j) => {
        const rr = r + i, cc = c + j;
        list.push([rr, cc, cell.f ? '=' + shiftFormula(cell.f, r - this.clip.r1, c - this.clip.c1) : cell.raw]);
        styles.push([rr, cc, cell.s]);
      }));
    } else {
      parseDelimited(text.replace(/\r?\n$/, ''), '\t').forEach((line, i) => line.forEach((v, j) => list.push([r + i, c + j, v])));
    }
    this.pushUndo();
    for (const [rr, cc, s] of styles) this.sh.setStyle(rr, cc, s);
    for (const [rr, cc, v] of list) this.sh.setRaw(rr, cc, v);
    const last = list[list.length - 1];
    this.sel = { r1: r, c1: c, r2: last[0], c2: Math.max(...list.map((x) => x[1])) };
    this.afterChange();
  },

  /* ---- sheets ---- */
  addSheet() {
    let n = this.book.sheets.length + 1;
    while (this.book.sheetByName('Sheet' + n)) n++;
    this.book.addSheet('Sheet' + n).then(() => { this.undo = []; this.redo = []; this.markDirty(); this.showSheet(this.book.sheets.length - 1); });
  },
  sheetMenu(i) {
    const sh = this.book.sheets[i];
    const choice = prompt(`Sheet "${sh.name}" — type a new name to rename it, or type DELETE to remove the sheet:`, sh.name);
    if (choice == null || choice === sh.name) return;
    if (choice.trim().toUpperCase() === 'DELETE') {
      if (this.book.sheets.length === 1) return toast('A workbook needs at least one sheet');
      if (!confirm(`Delete sheet "${sh.name}"? This cannot be undone.`)) return;
      this.book.deleteSheet(i);
      this.undo = []; this.redo = [];
      this.calc.recalc();
      this.markDirty();
      this.showSheet(Math.max(0, i - 1));
      return;
    }
    const name = choice.trim().replace(/[\\/?*[\]:]/g, '').slice(0, 31);
    if (!name) return;
    if (this.book.sheetByName(name)) return toast('There is already a sheet with that name');
    this.pushUndo();
    this.book.renameSheet(sh, name);
    this.markDirty();
    this.renderTabs();
  },

  /* ---- undo ---- */
  snapshot() {
    const ser = new XMLSerializer();
    const snap = { sheets: this.book.sheets.map((s) => [s.path, ser.serializeToString(s.doc)]), cur: this.book.sheets.indexOf(this.sh), act: { ...this.act } };
    if (this.book.styles) snap.styles = ser.serializeToString(this.book.styles);
    snap.wb = ser.serializeToString(this.book.wb);
    return snap;
  },
  pushUndo() { this.undo.push(this.snapshot()); if (this.undo.length > 40) this.undo.shift(); this.redo = []; },
  restore(snap) {
    const p = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const b = this.book;
    b.wb = b.docs['xl/workbook.xml'] = p(snap.wb); b.touch('xl/workbook.xml');
    const sheetEls = Array.from(b.wb.getElementsByTagNameNS(S_NS, 'sheet'));
    b.sheets = snap.sheets.map(([path, xml], i) => {
      b.docs[path] = p(xml); b.touch(path);
      const el = sheetEls.find((e) => b.wbRels.byId[X.rid(e, 'id')] && b.wbRels.byId[X.rid(e, 'id')].path === path) || sheetEls[i];
      return new XSheet(b, el, path, b.docs[path]);
    });
    if (snap.styles) { b.styles = b.docs[b.stylesPath] = p(snap.styles); b.touch(b.stylesPath); b.parseStyles(); }
    this.calc = new Calc(b);
    const act = snap.act;
    this.showSheet(Math.min(snap.cur, b.sheets.length - 1));
    this.select(act.r, act.c);
    this.markDirty();
  },
  doUndo() { this.commitEdit(); const s = this.undo.pop(); if (!s) return toast('Nothing to undo'); this.redo.push(this.snapshot()); this.restore(s); },
  doRedo() { const s = this.redo.pop(); if (!s) return; this.undo.push(this.snapshot()); this.restore(s); },
};

/* CSV / TSV parser (quotes, embedded newlines) */
function parseDelimited(text, sep) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"' && cur === '') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
