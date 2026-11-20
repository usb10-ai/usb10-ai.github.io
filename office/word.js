/* ===================== Word (.docx) editor ===================== */
'use strict';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const HILITE = {
  yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000',
  darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000',
  darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0', black: '000000', white: 'FFFFFF',
};
const HILITE_BY_HEX = Object.fromEntries(Object.entries(HILITE).map(([k, v]) => [v, k]));

/* ---------- DOCX -> HTML ---------- */
const DocxReader = {
  wAttr(el, name) {
    if (!el) return null;
    return el.getAttributeNS(W_NS, name) ?? el.getAttribute('w:' + name);
  },
  kid(el, name) {
    if (!el) return null;
    for (const c of el.children) if (c.localName === name) return c;
    return null;
  },
  kids(el, name) { return el ? Array.from(el.children).filter((c) => !name || c.localName === name) : []; },
  onOff(el) {
    if (!el) return undefined;
    const v = this.wAttr(el, 'val');
    return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
  },

  async toHTML(buf) {
    const zip = await JSZip.loadAsync(buf);
    const parse = async (p) => {
      const f = zip.file(p);
      return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null;
    };
    const doc = await parse('word/document.xml');
    if (!doc) throw new Error('Not a Word document (word/document.xml missing)');
    this.zip = zip;
    this.rels = {};
    const rels = await parse('word/_rels/document.xml.rels');
    if (rels) for (const r of rels.getElementsByTagNameNS(PKG_REL_NS, 'Relationship'))
      this.rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), mode: r.getAttribute('TargetMode') };
    this.styles = {};
    this.defaults = {};
    const st = await parse('word/styles.xml');
    if (st) {
      const dd = st.getElementsByTagNameNS(W_NS, 'rPrDefault')[0];
      if (dd) this.defaults = this.runProps(this.kid(dd, 'rPr'), {});
      for (const s of st.getElementsByTagNameNS(W_NS, 'style')) {
        const id = this.wAttr(s, 'styleId');
        this.styles[id] = {
          type: this.wAttr(s, 'type'),
          name: (this.wAttr(this.kid(s, 'name'), 'val') || id || '').toLowerCase(),
          basedOn: this.wAttr(this.kid(s, 'basedOn'), 'val'),
          pPr: this.kid(s, 'pPr'), rPr: this.kid(s, 'rPr'),
        };
      }
    }
    this.numbering = {};
    const nb = await parse('word/numbering.xml');
    if (nb) {
      const abs = {};
      for (const a of nb.getElementsByTagNameNS(W_NS, 'abstractNum')) {
        const lv = {};
        for (const l of this.kids(a, 'lvl')) lv[this.wAttr(l, 'ilvl')] = this.wAttr(this.kid(l, 'numFmt'), 'val') || 'decimal';
        abs[this.wAttr(a, 'abstractNumId')] = lv;
      }
      for (const n of nb.getElementsByTagNameNS(W_NS, 'num'))
        this.numbering[this.wAttr(n, 'numId')] = abs[this.wAttr(this.kid(n, 'abstractNumId'), 'val')] || {};
    }
    this.media = {};
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
    const html = await this.blocks(this.kids(body));
    let baseSize = this.defaults.sz || 11;
    return { html, baseSize };
  },

  styleChain(id, key) {
    const out = [];
    let guard = 0;
    while (id && this.styles[id] && guard++ < 20) {
      if (this.styles[id][key]) out.unshift(this.styles[id][key]);
      id = this.styles[id].basedOn;
    }
    return out;
  },
  runProps(rPr, base) {
    const p = Object.assign({}, base);
    if (!rPr) return p;
    const k = (n) => this.kid(rPr, n);
    if (k('b')) p.b = this.onOff(k('b'));
    if (k('i')) p.i = this.onOff(k('i'));
    if (k('u')) p.u = this.wAttr(k('u'), 'val') !== 'none';
    if (k('strike')) p.s = this.onOff(k('strike'));
    if (k('dstrike')) p.s = this.onOff(k('dstrike'));
    if (k('caps')) p.caps = this.onOff(k('caps'));
    if (k('vanish')) p.hidden = this.onOff(k('vanish'));
    const c = this.wAttr(k('color'), 'val');
    if (c && c !== 'auto') p.color = c;
    const sz = this.wAttr(k('sz'), 'val');
    if (sz) p.sz = +sz / 2;
    const f = k('rFonts');
    if (f) { const fn = this.wAttr(f, 'ascii') || this.wAttr(f, 'hAnsi'); if (fn) p.font = fn; }
    const hl = this.wAttr(k('highlight'), 'val');
    if (hl && HILITE[hl]) p.bg = HILITE[hl];
    const shd = this.wAttr(k('shd'), 'fill');
    if (shd && shd !== 'auto' && !p.bg) p.bg = shd;
    const va = this.wAttr(k('vertAlign'), 'val');
    if (va) p.va = va;
    const rs = this.wAttr(k('rStyle'), 'val');
    if (rs) for (const sr of this.styleChain(rs, 'rPr')) Object.assign(p, this.runProps(sr, {}), this.runProps(rPr, {}));
    return p;
  },

  async blocks(nodes) {
    let html = '';
    let listStack = []; // [{tag, numId}]
    const closeLists = (toDepth) => {
      while (listStack.length > toDepth) html += `</li></${listStack.pop().tag}>`;
    };
    for (const n of nodes) {
      if (n.localName === 'p') {
        const info = await this.paragraph(n);
        if (info.list) {
          const { level, ordered } = info.list;
          const tag = ordered ? 'ol' : 'ul';
          if (listStack.length > level + 1) closeLists(level + 1);
          if (listStack.length === level + 1) {
            if (listStack[level].tag !== tag) { closeLists(level); }
            else html += '</li>';
          }
          while (listStack.length < level + 1) {
            const t = listStack.length === level ? tag : 'ul';
            html += `<${t}>`;
            listStack.push({ tag: t });
            if (listStack.length < level + 1) html += '<li>';
          }
          html += `<li${info.style ? ` style="${info.style}"` : ''}>${info.inner || '<br>'}`;
          html += info.after;
          continue;
        }
        closeLists(0);
        html += info.before + info.html + info.after;
      } else if (n.localName === 'tbl') {
        closeLists(0);
        html += await this.table(n);
      } else if (n.localName === 'sdt') {
        closeLists(0);
        html += await this.blocks(this.kids(this.kid(n, 'sdtContent')));
      }
    }
    closeLists(0);
    return html;
  },

  async paragraph(p) {
    const pPr = this.kid(p, 'pPr');
    const styleId = this.wAttr(this.kid(pPr, 'pStyle'), 'val');
    const sty = styleId && this.styles[styleId];
    const sname = sty ? sty.name : '';
    let tag = 'p';
    let m;
    if ((m = /^heading\s*([1-6])$/.exec(sname))) tag = 'h' + Math.min(+m[1], 4);
    else if (sname === 'title') tag = 'h1';
    else if (sname === 'subtitle') tag = 'h2';
    else if (/quote/.test(sname)) tag = 'blockquote';

    // paragraph base run props from style
    let base = {};
    if (tag === 'p' || tag === 'blockquote') for (const r of this.styleChain(styleId, 'rPr')) base = this.runProps(r, base);
    const pPrs = [...this.styleChain(styleId, 'pPr'), pPr].filter(Boolean);
    let jc = null, indLeft = null, numPr = null, breakBefore = false;
    for (const pp of pPrs) {
      const j = this.wAttr(this.kid(pp, 'jc'), 'val'); if (j) jc = j;
      const ind = this.kid(pp, 'ind');
      if (ind) { const l = this.wAttr(ind, 'left') ?? this.wAttr(ind, 'start'); if (l != null) indLeft = +l; }
      if (this.kid(pp, 'numPr')) numPr = this.kid(pp, 'numPr');
      if (this.kid(pp, 'pageBreakBefore') && this.onOff(this.kid(pp, 'pageBreakBefore'))) breakBefore = true;
    }
    const styles = [];
    const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc];
    if (align) styles.push('text-align:' + align);

    let list = null;
    if (numPr) {
      const numId = this.wAttr(this.kid(numPr, 'numId'), 'val');
      const ilvl = +(this.wAttr(this.kid(numPr, 'ilvl'), 'val') || 0);
      if (numId && numId !== '0') {
        const fmt = (this.numbering[numId] || {})[ilvl] || 'bullet';
        list = { level: Math.min(ilvl, 8), ordered: fmt !== 'bullet' && fmt !== 'none' };
      }
    }
    if (!list && indLeft && tag === 'p') styles.push(`margin-left:${(indLeft / 20).toFixed(1)}pt`);

    const ctx = { pageBreak: false };
    const inner = await this.inlines(this.kids(p), base, ctx);
    const style = styles.join(';');
    const before = breakBefore ? '<hr class="pagebreak">' : '';
    const after = ctx.pageBreak ? '<hr class="pagebreak">' : '';
    const htmlOut = `<${tag}${style ? ` style="${style}"` : ''}>${inner || '<br>'}</${tag}>`;
    return { html: htmlOut, inner, list, style, before, after };
  },

  async inlines(nodes, base, ctx) {
    let out = '';
    for (const n of nodes) {
      switch (n.localName) {
        case 'r': out += await this.run(n, base, ctx); break;
        case 'hyperlink': {
          const id = n.getAttributeNS(R_NS, 'id') || n.getAttribute('r:id');
          const anchor = this.wAttr(n, 'anchor');
          const href = id && this.rels[id] ? this.rels[id].target : anchor ? '#' + anchor : '';
          const inner = await this.inlines(this.kids(n), base, ctx);
          out += href ? `<a href="${escXml(href)}">${inner}</a>` : inner;
          break;
        }
        case 'ins': case 'smartTag': case 'fldSimple': case 'customXml':
          out += await this.inlines(this.kids(n), base, ctx); break;
        case 'sdt':
          out += await this.inlines(this.kids(this.kid(n, 'sdtContent')), base, ctx); break;
        default: break; // del, bookmarks, proofErr, etc.
      }
    }
    return out;
  },

  async run(r, base, ctx) {
    const p = this.runProps(this.kid(r, 'rPr'), base);
    if (p.hidden) return '';
    let txt = '';
    for (const c of r.children) {
      switch (c.localName) {
        case 't': txt += escXml(c.textContent).replace(/ {2}/g, ' &nbsp;'); break;
        case 'tab': txt += '<span class="tab" style="white-space:pre">\t</span>'; break;
        case 'br':
          if (this.wAttr(c, 'type') === 'page') ctx.pageBreak = true; else txt += '<br>';
          break;
        case 'cr': txt += '<br>'; break;
        case 'noBreakHyphen': txt += '‑'; break;
        case 'drawing': case 'pict': case 'object': txt += await this.image(c); break;
        case 'lastRenderedPageBreak': break;
        default: break;
      }
    }
    if (!txt) return '';
    const css = [];
    if (p.b) css.push('font-weight:bold');
    if (p.i) css.push('font-style:italic');
    const deco = [p.u && 'underline', p.s && 'line-through'].filter(Boolean).join(' ');
    if (deco) css.push('text-decoration:' + deco);
    if (p.color) css.push('color:#' + p.color);
    if (p.bg) css.push('background-color:#' + p.bg);
    if (p.sz && p.sz !== (this.defaults.sz || 11)) css.push(`font-size:${p.sz}pt`);
    if (p.font && !/^\+/.test(p.font)) css.push(`font-family:'${p.font.replace(/'/g, '')}'`);
    if (p.caps) css.push('text-transform:uppercase');
    let h = css.length ? `<span style="${css.join(';')}">${txt}</span>` : txt;
    if (p.va === 'superscript') h = `<sup>${h}</sup>`;
    else if (p.va === 'subscript') h = `<sub>${h}</sub>`;
    return h;
  },

  async image(el) {
    const blip = el.getElementsByTagNameNS(A_NS, 'blip')[0];
    let id = blip && (blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed'));
    if (!id) {
      const im = Array.from(el.getElementsByTagName('*')).find((x) => x.localName === 'imagedata');
      if (im) id = im.getAttributeNS(R_NS, 'id') || im.getAttribute('r:id');
    }
    if (!id || !this.rels[id]) return '';
    let path = this.rels[id].target.replace(/^\//, '');
    if (!/^word\//.test(path)) path = 'word/' + path;
    path = path.replace(/\/[^/]+\/\.\.\//g, '/');
    const f = this.zip.file(path);
    if (!f) return '';
    const ext = path.split('.').pop().toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' }[ext];
    if (!mime) return ''; // emf/wmf can't be shown in a browser
    const b64 = await f.async('base64');
    let w = '', hgt = '';
    const ext2 = Array.from(el.getElementsByTagName('*')).find((x) => x.localName === 'extent');
    if (ext2) {
      w = Math.round(+ext2.getAttribute('cx') / 9525);
      hgt = Math.round(+ext2.getAttribute('cy') / 9525);
    }
    return `<img src="data:${mime};base64,${b64}"${w ? ` width="${w}" height="${hgt}"` : ''}>`;
  },

  async table(tbl) {
    const rows = this.kids(tbl, 'tr');
    // compute vertical merges
    const grid = rows.map((tr) => {
      let col = 0;
      return this.kids(tr, 'tc').map((tc) => {
        const tcPr = this.kid(tc, 'tcPr');
        const span = +(this.wAttr(this.kid(tcPr, 'gridSpan'), 'val') || 1);
        const vm = this.kid(tcPr, 'vMerge');
        const cell = { tc, col, span, vm: vm ? (this.wAttr(vm, 'val') === 'restart' ? 'restart' : 'continue') : null, rowspan: 1,
          fill: this.wAttr(this.kid(tcPr, 'shd'), 'fill') };
        col += span;
        return cell;
      });
    });
    for (let r = 0; r < grid.length; r++)
      for (const c of grid[r]) if (c.vm === 'restart') {
        for (let k = r + 1; k < grid.length; k++) {
          const below = grid[k].find((x) => x.col === c.col);
          if (below && below.vm === 'continue') { c.rowspan++; below.skip = true; } else break;
        }
      }
    let h = '<table><tbody>';
    for (const row of grid) {
      h += '<tr>';
      for (const c of row) {
        if (c.skip) continue;
        const attrs = (c.span > 1 ? ` colspan="${c.span}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '') +
          (c.fill && c.fill !== 'auto' ? ` style="background-color:#${c.fill}"` : '');
        h += `<td${attrs}>${await this.blocks(this.kids(c.tc))}</td>`;
      }
      h += '</tr>';
    }
    return h + '</tbody></table>';
  },
};

/* ---------- HTML -> DOCX ---------- */
const DocxWriter = {
  async build(root) {
    const D = window.docx;
    this.D = D;
    this.listInstance = 0;
    const children = await this.blocks(Array.from(root.childNodes), { indent: 0, italic: false, list: null });
    if (!children.length) children.push(new D.Paragraph({}));
    const numLevels = [];
    const fmts = [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN];
    for (let i = 0; i < 9; i++)
      numLevels.push({ level: i, format: fmts[i % 3], text: `%${i + 1}.`, alignment: D.AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } } });
    const bulLevels = [];
    const chars = ['●', '○', '■'];
    for (let i = 0; i < 9; i++)
      bulLevels.push({ level: i, format: D.LevelFormat.BULLET, text: chars[i % 3], alignment: D.AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } } });
    const hd = (sz, color, extra = {}) => ({ run: Object.assign({ size: sz * 2, color, bold: false, font: 'Calibri Light' }, extra),
      paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } });
    const doc = new D.Document({
      creator: 'Office Editor',
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 160, line: 276, lineRule: D.LineRuleType.AUTO } } },
          heading1: hd(20, '2F5496'), heading2: hd(16, '2F5496'), heading3: hd(14, '1F3763'),
          heading4: hd(12, '2F5496', { italics: true }),
        },
      },
      numbering: { config: [{ reference: 'num', levels: numLevels }, { reference: 'bul', levels: bulLevels }] },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children,
      }],
    });
    return D.Packer.toBlob(doc);
  },

  isBlock(n) {
    return n.nodeType === 1 && /^(P|DIV|H[1-6]|UL|OL|LI|TABLE|BLOCKQUOTE|HR|PRE|SECTION|ARTICLE|HEADER|FOOTER)$/.test(n.tagName);
  },
  align(el) {
    const A = this.D.AlignmentType;
    const ta = (el.style && el.style.textAlign) || el.getAttribute('align') || '';
    return { center: A.CENTER, right: A.RIGHT, justify: A.JUSTIFIED, left: A.LEFT, start: A.LEFT, end: A.RIGHT }[ta];
  },
  indentPt(el) {
    const v = toPt(el.style && (el.style.marginLeft || el.style.paddingLeft));
    return v ? Math.round(v * 20) : 0;
  },

  async blocks(nodes, ctx) {
    const D = this.D;
    const out = [];
    let inlineBuf = [];
    const flush = async () => {
      if (!inlineBuf.length) return;
      const runs = [];
      for (const n of inlineBuf) runs.push(...(await this.inlines(n, { italics: ctx.italic || undefined })));
      inlineBuf = [];
      if (runs.length) out.push(new D.Paragraph({ children: runs, indent: ctx.indent ? { left: ctx.indent } : undefined }));
    };
    for (const n of nodes) {
      if (n.nodeType === 3) { if (n.textContent.trim()) inlineBuf.push(n); continue; }
      if (n.nodeType !== 1) continue;
      if (!this.isBlock(n)) { inlineBuf.push(n); continue; }
      await flush();
      const tag = n.tagName;
      if (tag === 'HR') {
        out.push(new D.Paragraph({ children: [new D.PageBreak()] }));
      } else if (tag === 'TABLE') {
        out.push(await this.table(n, ctx));
      } else if (tag === 'UL' || tag === 'OL') {
        const inst = ++this.listInstance;
        await this.list(n, ctx, 0, inst, out);
      } else if (tag === 'BLOCKQUOTE' || (/^(DIV|SECTION|ARTICLE|P|H[1-6])$/.test(tag) &&Array.from(n.children).some((c) => this.isBlock(c)))) {
        const isQuote = tag === 'BLOCKQUOTE' && !n.getAttribute('style');
        const sub = { ...ctx, indent: ctx.indent + (this.indentPt(n) || (tag === 'BLOCKQUOTE' ? 720 : 0)), italic: ctx.italic || isQuote };
        out.push(...(await this.blocks(Array.from(n.childNodes), sub)));
      } else {
        out.push(await this.para(n, ctx));
      }
    }
    await flush();
    return out;
  },

  async para(el, ctx, extra = {}) {
    const D = this.D;
    const tag = el.tagName;
    const heading = { H1: D.HeadingLevel.HEADING_1, H2: D.HeadingLevel.HEADING_2, H3: D.HeadingLevel.HEADING_3,
      H4: D.HeadingLevel.HEADING_4, H5: D.HeadingLevel.HEADING_4, H6: D.HeadingLevel.HEADING_4 }[tag];
    const runs = await this.inlines(el, { italics: ctx.italic || undefined }, true);
    const ind = ctx.indent + this.indentPt(el);
    return new D.Paragraph(Object.assign({
      children: runs,
      heading,
      alignment: this.align(el),
      indent: ind && !extra.numbering && !extra.bullet ? { left: ind } : undefined,
    }, extra));
  },

  async list(listEl, ctx, level, inst, out) {
    const ordered = listEl.tagName === 'OL';
    for (const li of Array.from(listEl.children)) {
      if (li.tagName === 'UL' || li.tagName === 'OL') { await this.list(li, ctx, level + 1, inst, out); continue; }
      if (li.tagName !== 'LI') continue;
      // split li into its own inline content and nested lists / blocks
      const own = document.createElement('div');
      own.style.textAlign = li.style.textAlign;
      const nested = [];
      for (const c of Array.from(li.childNodes)) {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c);
        else if (c.nodeType === 1 && /^(P|DIV)$/.test(c.tagName) && !nested.length) own.append(...Array.from(c.cloneNode(true).childNodes), document.createElement('br'));
        else own.appendChild(c.cloneNode(true));
      }
      while (own.lastChild && own.lastChild.nodeName === 'BR') own.lastChild.remove();
      const extra = ordered ? { numbering: { reference: 'num', level: Math.min(level, 8), instance: inst } }
        : { numbering: { reference: 'bul', level: Math.min(level, 8) } };
      out.push(await this.para(own, ctx, extra));
      for (const n of nested) await this.list(n, ctx, level + 1, n.tagName === 'OL' ? ++this.listInstance : inst, out);
    }
  },

  async table(tbl, ctx) {
    const D = this.D;
    const rows = [];
    let maxCols = 1;
    for (const tr of tbl.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')) {
      const cells = [];
      let cols = 0;
      for (const td of Array.from(tr.children)) {
        if (!/^T[DH]$/.test(td.tagName)) continue;
        let kids = await this.blocks(Array.from(td.childNodes), { indent: 0, italic: false });
        if (!kids.length) kids = [new D.Paragraph({})];
        const bg = toHex(td.style.backgroundColor);
        const cs = +td.getAttribute('colspan') || 1;
        cols += cs;
        cells.push(new D.TableCell({
          children: kids, columnSpan: cs > 1 ? cs : undefined,
          rowSpan: +td.getAttribute('rowspan') > 1 ? +td.getAttribute('rowspan') : undefined,
          shading: bg ? { fill: bg, type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
          margins: { top: 40, bottom: 40, left: 100, right: 100 },
        }));
      }
      maxCols = Math.max(maxCols, cols);
      if (cells.length) rows.push(new D.TableRow({ children: cells }));
    }
    const colW = Math.floor(9360 / maxCols);
    return new D.Table({ rows, width: { size: 9360, type: D.WidthType.DXA }, columnWidths: Array(maxCols).fill(colW) });
  },

  fmtFrom(el, f) {
    f = Object.assign({}, f);
    const t = el.tagName;
    if (t === 'B' || t === 'STRONG') f.bold = true;
    if (t === 'I' || t === 'EM') f.italics = true;
    if (t === 'U' || t === 'INS') f.underline = {};
    if (t === 'S' || t === 'STRIKE' || t === 'DEL') f.strike = true;
    if (t === 'SUB') { f.subScript = true; delete f.superScript; }
    if (t === 'SUP') { f.superScript = true; delete f.subScript; }
    if (t === 'CODE') f.font = 'Courier New';
    if (t === 'FONT') {
      if (el.getAttribute('color')) f.color = toHex(el.getAttribute('color')) || f.color;
      if (el.getAttribute('face')) f.font = el.getAttribute('face').split(',')[0].replace(/['"]/g, '').trim();
      const sz = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 }[el.getAttribute('size')];
      if (sz) f.size = sz * 2;
    }
    const s = el.style;
    if (s) {
      if (s.fontWeight) f.bold = s.fontWeight === 'bold' || s.fontWeight === 'bolder' || +s.fontWeight >= 600;
      if (s.fontStyle) f.italics = s.fontStyle === 'italic' || s.fontStyle === 'oblique';
      const deco = s.textDecorationLine || s.textDecoration || '';
      if (deco) {
        if (/underline/.test(deco)) f.underline = {};
        if (/line-through/.test(deco)) f.strike = true;
        if (/none/.test(deco)) { delete f.underline; f.strike = false; }
      }
      if (s.color) { const c = toHex(s.color); if (c) f.color = c; }
      if (s.backgroundColor) {
        const c = toHex(s.backgroundColor);
        if (c) {
          delete f.highlight; delete f.shading;
          if (HILITE_BY_HEX[c]) f.highlight = HILITE_BY_HEX[c];
          else f.shading = { type: this.D.ShadingType.CLEAR, fill: c, color: 'auto' };
        }
      }
      if (s.fontSize) { const p = toPt(s.fontSize); if (p) f.size = Math.round(p * 2); }
      if (s.fontFamily) f.font = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      if (s.textTransform === 'uppercase') f.allCaps = true;
      if (s.verticalAlign === 'super') f.superScript = true;
      if (s.verticalAlign === 'sub') f.subScript = true;
    }
    return f;
  },

  async inlines(node, fmt, skipSelf = false) {
    const D = this.D;
    const runs = [];
    const walk = async (n, f) => {
      if (n.nodeType === 3) {
        const text = n.textContent.replace(/ /g, ' ').replace(/[\r\n]+/g, ' ');
        if (!text) return;
        const parts = text.split('\t');
        parts.forEach((part, i) => {
          if (i > 0) runs.push(new D.TextRun({ ...f, children: [new D.Tab()] }));
          if (part) runs.push(new D.TextRun({ ...f, text: part }));
        });
        return;
      }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { runs.push(new D.TextRun({ ...f, text: '', break: 1 })); return; }
      if (n.tagName === 'IMG') { const r = await this.image(n); if (r) runs.push(r); return; }
      if (n.tagName === 'A' && n.getAttribute('href')) {
        const sub = [];
        const saved = runs.length;
        for (const c of Array.from(n.childNodes)) await walk(c, { ...f, color: f.color || '0563C1', underline: f.underline || {} });
        sub.push(...runs.splice(saved));
        const href = n.getAttribute('href');
        if (/^#/.test(href)) runs.push(...sub);
        else runs.push(new D.ExternalHyperlink({ link: href, children: sub.filter((r) => !(r instanceof D.ExternalHyperlink)) }));
        return;
      }
      const nf = this.fmtFrom(n, f);
      for (const c of Array.from(n.childNodes)) await walk(c, nf);
    };
    if (skipSelf) {
      const nf = this.fmtFrom(node, fmt);
      for (const c of Array.from(node.childNodes)) await walk(c, nf);
    } else await walk(node, fmt);
    return runs;
  },

  async image(img) {
    const D = this.D;
    let src = img.getAttribute('src') || '';
    let data;
    if (/^data:/.test(src)) {
      const d = dataURLToBytes(src);
      if (!d || !/png|jpe?g|gif|bmp/.test(d.mime)) {
        // convert anything else (svg, webp) to png through a canvas
        src = await this.toPng(img);
        data = dataURLToBytes(src).bytes;
      } else data = d.bytes;
    } else {
      try { src = await this.toPng(img); data = dataURLToBytes(src).bytes; } catch { return null; }
    }
    const w = img.width || img.naturalWidth || 200;
    const h = img.height || img.naturalHeight || 150;
    return new D.ImageRun({ data, transformation: { width: Math.round(w), height: Math.round(h) } });
  },
  toPng(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return Promise.resolve(c.toDataURL('image/png'));
  },
};

/* ---------- Word editor UI ---------- */
const WordEditor = {
  fileName: 'Untitled.docx',
  dirty: false,
  init() {
    const page = $('#page');
    this.page = page;
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
    $$('#wordToolbar [data-cmd]').forEach((b) =>
      b.addEventListener('mousedown', (e) => { e.preventDefault(); this.exec(b.dataset.cmd); }));
    $('#wBlock').addEventListener('change', (e) => { this.focus(); this.exec('formatBlock', '<' + e.target.value + '>'); });
    $('#wFont').addEventListener('change', (e) => { this.focus(); this.exec('fontName', e.target.value); });
    $('#wSize').addEventListener('change', (e) => { this.focus(); this.setSize(e.target.value); });
    const colorInput = (id, fn) => {
      const inp = $(id);
      inp.parentElement.style.setProperty('--swatch', inp.value);
      inp.addEventListener('mousedown', () => this.saveSel());
      inp.addEventListener('input', () => inp.parentElement.style.setProperty('--swatch', inp.value));
      inp.addEventListener('change', () => { this.restoreSel(); fn(inp.value); });
    };
    colorInput('#wColor', (v) => this.exec('foreColor', v));
    colorInput('#wHilite', (v) => this.exec('hiliteColor', v));
    $('#wLink').addEventListener('mousedown', (e) => {
      e.preventDefault();
      const url = prompt('Link address (URL):', 'https://');
      if (url && url !== 'https://') {
        if (window.getSelection().isCollapsed) this.exec('insertHTML', `<a href="${escXml(url)}">${escXml(url)}</a>`);
        else this.exec('createLink', url);
      }
    });
    $('#wImage').addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSel(); $('#wImageInput').click(); });
    $('#wImageInput').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const url = await readFileAsDataURL(f);
      const { w, h } = await imageSize(url);
      const maxW = 624, scale = Math.min(1, maxW / w);
      this.restoreSel();
      this.exec('insertHTML', `<img src="${url}" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}">`);
    });
    $('#wTable').addEventListener('mousedown', (e) => { e.preventDefault(); this.tableMenu(); });
    $('#wHr').addEventListener('mousedown', (e) => { e.preventDefault(); this.exec('insertHTML', '<hr class="pagebreak"><p><br></p>'); });
    $('#wPrint').addEventListener('click', () => window.print());
    $('#wFind').addEventListener('click', () => this.toggleFind(true));
    $('#findClose').addEventListener('click', () => this.toggleFind(false));
    $('#findNext').addEventListener('click', () => this.findNext());
    $('#findText').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.findNext(); });
    $('#replOne').addEventListener('click', () => this.replaceOne());
    $('#replAll').addEventListener('click', () => this.replaceAll());

    page.addEventListener('input', () => this.changed());
    document.addEventListener('selectionchange', () => { if (document.activeElement === page) this.updateToolbar(); });
    page.addEventListener('keydown', (e) => this.keydown(e));
    page.addEventListener('paste', (e) => this.paste(e));
    this.imageResizing();
    this.newDoc();
  },
  focus() { this.page.focus(); this.restoreSel(); },
  saveSel() {
    const s = window.getSelection();
    if (s.rangeCount && this.page.contains(s.anchorNode)) this.savedRange = s.getRangeAt(0).cloneRange();
  },
  restoreSel() {
    if (!this.savedRange) return;
    this.page.focus();
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(this.savedRange);
  },
  exec(cmd, val = null) {
    if (document.activeElement !== this.page) this.focus();
    document.execCommand('styleWithCSS', false, !/^(bold|italic|underline|strikeThrough)$/.test(cmd));
    document.execCommand(cmd, false, val);
    this.changed();
    this.updateToolbar();
  },
  setSize(pt) {
    // execCommand only knows sizes 1..7; mark with size 7 and swap for a real pt size
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    for (const f of $$('font[size="7"]', this.page)) {
      const sp = document.createElement('span');
      sp.style.fontSize = pt + 'pt';
      sp.append(...f.childNodes);
      f.replaceWith(sp);
    }
    for (const el of $$('[style*="xxx-large"]', this.page)) el.style.fontSize = pt + 'pt';
    this.changed();
  },
  updateToolbar() {
    for (const b of $$('#wordToolbar [data-cmd]')) {
      const c = b.dataset.cmd;
      if (/^(bold|italic|underline|strikeThrough|subscript|superscript|insertUnorderedList|insertOrderedList|justifyLeft|justifyCenter|justifyRight|justifyFull)$/.test(c))
        b.classList.toggle('on', document.queryCommandState(c));
    }
    const s = window.getSelection();
    if (!s.rangeCount) return;
    let n = s.anchorNode; if (n && n.nodeType === 3) n = n.parentElement;
    if (!n || !this.page.contains(n)) return;
    const blk = n.closest('h1,h2,h3,h4,blockquote,p,li,td');
    const tag = blk ? blk.tagName : 'P';
    $('#wBlock').value = ['H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE'].includes(tag) ? tag : 'P';
    const cs = getComputedStyle(n);
    const fam = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const fsel = $('#wFont');
    if (![...fsel.options].some((o) => o.value === fam)) fsel.add(new Option(fam));
    fsel.value = fam;
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    const ssel = $('#wSize');
    if (![...ssel.options].some((o) => +o.value === pt)) ssel.add(new Option(String(pt)));
    ssel.value = String(pt);
  },
  keydown(e) {
    if (e.key === 'Tab') {
      const s = window.getSelection();
      const n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode);
      if (n && n.closest('li')) { e.preventDefault(); this.exec(e.shiftKey ? 'outdent' : 'indent'); return; }
      const td = n && n.closest('td,th');
      if (td) {
        e.preventDefault();
        const cells = $$('td,th', td.closest('table'));
        let i = cells.indexOf(td) + (e.shiftKey ? -1 : 1);
        if (i >= cells.length) { this.tableOp('rowBelow', cells[cells.length - 1]); i = cells.length; }
        const target = $$('td,th', td.closest('table'))[Math.max(0, i)];
        const r = document.createRange(); r.selectNodeContents(target); s.removeAllRanges(); s.addRange(r);
        return;
      }
      e.preventDefault();
      this.exec('insertHTML', '<span class="tab" style="white-space:pre">\t</span>');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') { e.preventDefault(); this.toggleFind(true); }
  },
  paste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (items) for (const it of items) if (it.type.startsWith('image/')) {
      e.preventDefault();
      readFileAsDataURL(it.getAsFile()).then(async (url) => {
        const { w, h } = await imageSize(url);
        const sc = Math.min(1, 624 / w);
        this.exec('insertHTML', `<img src="${url}" width="${Math.round(w * sc)}" height="${Math.round(h * sc)}">`);
      });
      return;
    }
  },
  imageResizing() {
    let sel = null, drag = null;
    this.page.addEventListener('click', (e) => {
      if (sel) sel.classList.remove('sel');
      sel = e.target.tagName === 'IMG' ? e.target : null;
      if (sel) sel.classList.add('sel');
    });
    this.page.addEventListener('mousemove', (e) => {
      if (drag) return;
      const t = e.target;
      if (t.tagName === 'IMG') {
        const r = t.getBoundingClientRect();
        t.style.cursor = e.clientX > r.right - 14 && e.clientY > r.bottom - 14 ? 'nwse-resize' : '';
      }
    });
    this.page.addEventListener('mousedown', (e) => {
      const t = e.target;
      if (t.tagName !== 'IMG') return;
      const r = t.getBoundingClientRect();
      if (!(e.clientX > r.right - 14 && e.clientY > r.bottom - 14)) return;
      e.preventDefault();
      drag = { img: t, x: e.clientX, w: r.width, ratio: r.height / r.width };
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const w = Math.max(20, drag.w + (e.clientX - drag.x));
      drag.img.width = Math.round(w); drag.img.height = Math.round(w * drag.ratio);
    });
    window.addEventListener('mouseup', () => { if (drag) { drag = null; this.changed(); } });
  },
  tableMenu() {
    const s = window.getSelection();
    const n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode);
    const td = n && this.page.contains(n) && n.closest('td,th');
    if (!td) {
      const spec = prompt('Insert table — columns x rows:', '3x3');
      const m = spec && /^(\d+)\s*[x×*,]\s*(\d+)$/.exec(spec.trim());
      if (!m) return;
      const cols = Math.min(+m[1], 20), rows = Math.min(+m[2], 100);
      let h = '<table><tbody>';
      for (let r = 0; r < rows; r++) h += '<tr>' + '<td><br></td>'.repeat(cols) + '</tr>';
      this.exec('insertHTML', h + '</tbody></table><p><br></p>');
      return;
    }
    const choice = prompt('Table: type a number\n1 = insert row below\n2 = insert row above\n3 = insert column right\n4 = insert column left\n5 = delete row\n6 = delete column\n7 = delete table', '1');
    const op = { 1: 'rowBelow', 2: 'rowAbove', 3: 'colRight', 4: 'colLeft', 5: 'delRow', 6: 'delCol', 7: 'delTable' }[choice];
    if (op) this.tableOp(op, td);
  },
  tableOp(op, td) {
    const tr = td.parentElement, table = td.closest('table');
    const idx = Array.from(tr.children).indexOf(td);
    const rows = $$('tr', table);
    if (op === 'rowBelow' || op === 'rowAbove') {
      const nr = document.createElement('tr');
      for (let i = 0; i < tr.children.length; i++) nr.appendChild(document.createElement('td')).innerHTML = '<br>';
      op === 'rowBelow' ? tr.after(nr) : tr.before(nr);
    } else if (op === 'colRight' || op === 'colLeft') {
      for (const r of rows) {
        const ref = r.children[Math.min(idx, r.children.length - 1)];
        const c = document.createElement('td'); c.innerHTML = '<br>';
        op === 'colRight' ? ref.after(c) : ref.before(c);
      }
    } else if (op === 'delRow') { rows.length > 1 ? tr.remove() : table.remove(); }
    else if (op === 'delCol') {
      for (const r of rows) if (r.children[idx]) r.children[idx].remove();
      if (!$('td,th', table)) table.remove();
    } else if (op === 'delTable') table.remove();
    this.changed();
  },
  toggleFind(show) {
    $('#findBar').hidden = !show;
    if (show) { const t = window.getSelection().toString(); if (t && t.length < 80) $('#findText').value = t; $('#findText').focus(); $('#findText').select(); }
  },
  textNodes() {
    const tw = document.createTreeWalker(this.page, NodeFilter.SHOW_TEXT);
    const out = []; let n;
    while ((n = tw.nextNode())) out.push(n);
    return out;
  },
  findNext() {
    const q = $('#findText').value;
    if (!q) return false;
    const ql = q.toLowerCase();
    const nodes = this.textNodes();
    const s = window.getSelection();
    let startNode = null, startOff = 0;
    if (s.rangeCount && this.page.contains(s.focusNode)) { const r = s.getRangeAt(0); startNode = r.endContainer; startOff = r.endOffset; }
    let si = startNode ? nodes.indexOf(startNode) : 0;
    if (si < 0) si = 0, startOff = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = pass ? 0 : si; i < nodes.length; i++) {
        const from = !pass && i === si ? startOff : 0;
        const k = nodes[i].textContent.toLowerCase().indexOf(ql, from);
        if (k >= 0) {
          const r = document.createRange(); r.setStart(nodes[i], k); r.setEnd(nodes[i], k + q.length);
          this.page.focus(); s.removeAllRanges(); s.addRange(r);
          (nodes[i].parentElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
          $('#findInfo').textContent = '';
          return true;
        }
      }
    }
    $('#findInfo').textContent = 'Not found';
    return false;
  },
  replaceOne() {
    const q = $('#findText').value, rep = $('#replText').value;
    const s = window.getSelection();
    if (q && s.toString().toLowerCase() === q.toLowerCase()) this.exec('insertText', rep);
    this.findNext();
  },
  replaceAll() {
    const q = $('#findText').value, rep = $('#replText').value;
    if (!q) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let count = 0;
    for (const n of this.textNodes()) {
      const t = n.textContent;
      const nt = t.replace(re, () => { count++; return rep; });
      if (nt !== t) n.textContent = nt;
    }
    $('#findInfo').textContent = `${count} replaced`;
    if (count) this.changed();
  },
  changed() {
    this.dirty = true;
    App.updateTitle();
    clearTimeout(this.statT);
    this.statT = setTimeout(() => this.stats(), 250);
  },
  stats() {
    const t = this.page.innerText || '';
    const words = (t.match(/\S+/g) || []).length;
    const pages = Math.max(1, Math.ceil(this.page.scrollHeight / 1056));
    $('#wStats').textContent = `${words.toLocaleString()} words · ${t.replace(/\s/g, '').length.toLocaleString()} characters · ~${pages} page${pages > 1 ? 's' : ''}`;
  },
  newDoc() {
    this.page.innerHTML = '<h1>Untitled document</h1><p>Start typing here…</p>';
    this.page.style.fontSize = '';
    this.fileName = 'Untitled.docx';
    this.dirty = false;
    this.stats();
    App.updateTitle();
  },
  async open(buf, name) {
    let html, baseSize = 11;
    try {
      ({ html, baseSize } = await DocxReader.toHTML(buf));
    } catch (err) {
      console.warn('Native reader failed, using mammoth', err);
      const res = await mammoth.convertToHtml({ arrayBuffer: buf }, { styleMap: ['u => u', 'strike => s'] });
      html = res.value;
    }
    this.page.innerHTML = html || '<p><br></p>';
    this.page.style.fontSize = baseSize !== 11 ? baseSize + 'pt' : '';
    this.fileName = name;
    this.dirty = false;
    this.stats();
    App.updateTitle();
    this.page.scrollIntoView();
    $('#wordCanvas').scrollTop = 0;
  },
  async save() {
    const clone = this.page.cloneNode(true);
    // drop editor-only decorations
    clone.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel'));
    // keep real image sizes: copy rendered size from the live DOM
    const live = $$('img', this.page), cl = $$('img', clone);
    cl.forEach((im, i) => { if (!im.getAttribute('width')) { im.width = live[i].width; im.height = live[i].height; } });
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:624px;font-size:' + (this.page.style.fontSize || '11pt');
    host.appendChild(clone);
    document.body.appendChild(host);
    try {
      const blob = await DocxWriter.build(clone);
      return blob;
    } finally { host.remove(); }
  },
};
