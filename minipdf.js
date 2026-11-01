/* =====================================================================
   MiniPDF — generatore PDF minimale, senza dipendenze, offline.
   A4 in mm, origine in alto a sinistra. Font standard Helvetica
   (WinAnsi), forme vettoriali e immagini JPEG (DCTDecode).
   ===================================================================== */
(function (root) {
  'use strict';
  const K = 72 / 25.4;
  const FONT_ID = { normal: 'F1', bold: 'F2', italic: 'F3', bolditalic: 'F2' };

  // Metriche Helvetica / Helvetica-Bold (unità 1/1000 em, AFM Adobe)
  const W_REG = {}, W_BOLD = {};
  (function () {
    const reg = ' 278!278"355#556$556%889&667\'191(333)333*389+584,278-333.278/278:278;278<584=584>584?556@1015[278\\278]278^469_556`333{334|260}334~584';
    const bold = ' 278!333"474#556$556%889&722\'238(333)333*389+584,278-333.278/278:333;333<584=584>584?611@975[333\\278]333^584_556`333{389|280}389~584';
    const parse = (s, o) => { const re = /(.)(\d+)/g; let m; while ((m = re.exec(s))) o[m[1]] = +m[2]; };
    parse(reg, W_REG); parse(bold, W_BOLD);
    '0123456789'.split('').forEach(c => { W_REG[c] = 556; W_BOLD[c] = 556; });
    const ur = [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611];
    const ub = [722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611];
    const lr = [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500];
    const lb = [556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500];
    for (let i = 0; i < 26; i++) {
      W_REG[String.fromCharCode(65 + i)] = ur[i]; W_BOLD[String.fromCharCode(65 + i)] = ub[i];
      W_REG[String.fromCharCode(97 + i)] = lr[i]; W_BOLD[String.fromCharCode(97 + i)] = lb[i];
    }
    W_REG['°'] = 400; W_BOLD['°'] = 400;
  })();
  function charW(c, bold) {
    const t = bold ? W_BOLD : W_REG;
    if (t[c] != null) return t[c];
    const base = c.normalize ? c.normalize('NFD')[0] : c;
    return t[base] != null ? t[base] : 556;
  }

  function b64ToBytes(b64) {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function jpegSize(u) {
    let i = 2;
    while (i < u.length) {
      if (u[i] !== 0xFF) { i++; continue; }
      const m = u[i + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { h: (u[i + 5] << 8) | u[i + 6], w: (u[i + 7] << 8) | u[i + 8] };
      }
      i += 2 + ((u[i + 2] << 8) | u[i + 3]);
    }
    throw new Error('JPEG non valido');
  }

  function MiniPDF() {
    this.W = 210; this.H = 297;
    this.pages = []; this.images = [];
    this.cur = -1; this.fs = 12; this.font = 'normal';
    this.fillC = '0 0 0'; this.drawC = '0 0 0'; this.textC = '0 0 0'; this.lw = 0.2;
    this.addPage();
  }
  const P = MiniPDF.prototype;
  P.addPage = function () { this.pages.push([]); this.cur = this.pages.length - 1; return this; };
  P.getNumberOfPages = function () { return this.pages.length; };
  P.setPage = function (i) { this.cur = i - 1; };
  P._o = function (s) { this.pages[this.cur].push(s); };
  P._c = function (r, g, b) { return [r, g, b].map(v => (v / 255).toFixed(3)).join(' '); };
  P.setFillColor = function (r, g, b) { this.fillC = this._c(r, g, b); };
  P.setDrawColor = function (r, g, b) { this.drawC = this._c(r, g, b); };
  P.setTextColor = function (r, g, b) { this.textC = this._c(r, g, b); };
  P.setLineWidth = function (w) { this.lw = w; };
  P.setFont = function (fam, style) { this.font = style || 'normal'; };
  P.setFontSize = function (s) { this.fs = s; };
  P._pt = function (x, y) { return (x * K).toFixed(2) + ' ' + ((this.H - y) * K).toFixed(2); };
  P._paint = function (path, style) {
    const op = style === 'F' ? 'f' : (style === 'FD' || style === 'DF') ? 'B' : 'S';
    return this.fillC + ' rg ' + this.drawC + ' RG ' + (this.lw * K).toFixed(2) + ' w ' + path + ' ' + op;
  };
  P.rect = function (x, y, w, h, style) {
    this._o(this._paint(this._pt(x, y + h) + ' ' + (w * K).toFixed(2) + ' ' + (h * K).toFixed(2) + ' re', style));
  };
  P.roundedRect = function (x, y, w, h, r, r2, style) {
    const k = 0.5523 * r, p = (a, b) => this._pt(a, b);
    const path = p(x + r, y) + ' m ' + p(x + w - r, y) + ' l ' + p(x + w - r + k, y) + ' ' + p(x + w, y + r - k) + ' ' + p(x + w, y + r) + ' c ' +
      p(x + w, y + h - r) + ' l ' + p(x + w, y + h - r + k) + ' ' + p(x + w - r + k, y + h) + ' ' + p(x + w - r, y + h) + ' c ' +
      p(x + r, y + h) + ' l ' + p(x + r - k, y + h) + ' ' + p(x, y + h - r + k) + ' ' + p(x, y + h - r) + ' c ' +
      p(x, y + r) + ' l ' + p(x, y + r - k) + ' ' + p(x + r - k, y) + ' ' + p(x + r, y) + ' c h';
    this._o(this._paint(path, style));
  };
  P.circle = function (x, y, r, style) {
    const k = 0.5523 * r, p = (a, b) => this._pt(a, b);
    const path = p(x + r, y) + ' m ' + p(x + r, y + k) + ' ' + p(x + k, y + r) + ' ' + p(x, y + r) + ' c ' +
      p(x - k, y + r) + ' ' + p(x - r, y + k) + ' ' + p(x - r, y) + ' c ' + p(x - r, y - k) + ' ' + p(x - k, y - r) + ' ' + p(x, y - r) + ' c ' +
      p(x + k, y - r) + ' ' + p(x + r, y - k) + ' ' + p(x + r, y) + ' c h';
    this._o(this._paint(path, style));
  };
  P.line = function (x1, y1, x2, y2) { this._o(this._paint(this._pt(x1, y1) + ' m ' + this._pt(x2, y2) + ' l', 'S')); };
  P.polyline = function (pts) {
    this._o('1 J 1 j ' + this._paint(pts.map((q, i) => this._pt(q[0], q[1]) + (i ? ' l' : ' m')).join(' '), 'S') + ' 0 J 0 j');
  };
  P.getTextWidth = function (s) {
    const bold = this.font.indexOf('bold') >= 0; let w = 0;
    for (const c of String(s)) w += charW(c, bold);
    return w / 1000 * this.fs / K;
  };
  P._enc = function (s) {
    let o = '';
    for (const c of String(s)) {
      let code = c.charCodeAt(0);
      if (code > 255) code = 63; // '?'
      const ch = String.fromCharCode(code);
      o += (ch === '(' || ch === ')' || ch === '\\') ? '\\' + ch : (code === 10 || code === 13 ? ' ' : ch);
    }
    return o;
  };
  P.text = function (s, x, y, opt) {
    if (Array.isArray(s)) { const lh = this.fs * 0.3528 * 1.18; s.forEach((l, i) => this.text(l, x, y + i * lh, opt)); return; }
    let xx = x; const w = this.getTextWidth(s);
    if (opt && opt.align === 'right') xx = x - w; else if (opt && opt.align === 'center') xx = x - w / 2;
    this._o('BT /' + (FONT_ID[this.font] || 'F1') + ' ' + this.fs + ' Tf ' + this.textC + ' rg ' + this._pt(xx, y) + ' Td (' + this._enc(s) + ') Tj ET');
  };
  P.splitTextToSize = function (s, maxW) {
    const out = []; const lim = maxW * 0.985;
    String(s).split(/\n/).forEach(par => {
      const words = par.split(/ +/); let line = '';
      words.forEach(wd => {
        const cand = line ? line + ' ' + wd : wd;
        if (this.getTextWidth(cand) <= lim) { line = cand; return; }
        if (line) out.push(line);
        if (this.getTextWidth(wd) <= lim) { line = wd; return; }
        let chunk = '';
        for (const c of wd) { if (this.getTextWidth(chunk + c) > lim) { out.push(chunk); chunk = c; } else chunk += c; }
        line = chunk;
      });
      out.push(line);
    });
    return out;
  };
  P.addImage = function (dataUrl, fmt, x, y, w, h) {
    const bytes = b64ToBytes(dataUrl.split(',')[1]);
    const sz = jpegSize(bytes);
    const idx = this.images.length;
    this.images.push({ bytes, w: sz.w, h: sz.h });
    this._o('q ' + (w * K).toFixed(2) + ' 0 0 ' + (h * K).toFixed(2) + ' ' + this._pt(x, y + h) + ' cm /Im' + idx + ' Do Q');
  };

  P._build = function () {
    const chunks = []; let len = 0; const offs = [];
    const str = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xFF; return u; };
    const push = u => { chunks.push(u); len += u.length; };
    const obj = (n, body, stream) => {
      offs[n] = len;
      if (stream) { push(str(n + ' 0 obj\n' + body + '\nstream\n')); push(stream); push(str('\nendstream\nendobj\n')); }
      else push(str(n + ' 0 obj\n' + body + '\nendobj\n'));
    };
    push(str('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    const nImg = this.images.length, nPg = this.pages.length;
    const imgObj = i => 6 + i;
    const pgObj = i => 6 + nImg + i * 2;
    const ctObj = i => 7 + nImg + i * 2;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const kids = []; for (let i = 0; i < nPg; i++) kids.push(pgObj(i) + ' 0 R');
    obj(2, '<< /Type /Pages /Count ' + nPg + ' /Kids [' + kids.join(' ') + '] >>');
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
    this.images.forEach((im, i) => obj(imgObj(i), '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.bytes.length + ' >>', im.bytes));
    const xo = this.images.map((im, i) => '/Im' + i + ' ' + imgObj(i) + ' 0 R').join(' ');
    this.pages.forEach((ops, i) => {
      const content = str(ops.join('\n'));
      obj(pgObj(i), '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + (this.W * K).toFixed(2) + ' ' + (this.H * K).toFixed(2) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>' + (xo ? ' /XObject << ' + xo + ' >>' : '') + ' >> /Contents ' + ctObj(i) + ' 0 R >>');
      obj(ctObj(i), '<< /Length ' + content.length + ' >>', content);
    });
    const nObj = 6 + nImg + nPg * 2;
    const xref = len;
    let x = 'xref\n0 ' + nObj + '\n0000000000 65535 f \n';
    for (let i = 1; i < nObj; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    x += 'trailer\n<< /Size ' + nObj + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    push(str(x));
    const out = new Uint8Array(len); let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
  };
  P.output = function (type) {
    const bytes = this._build();
    if (type === 'arraybuffer') return bytes.buffer;
    return new Blob([bytes], { type: 'application/pdf' });
  };
  P.save = function (name) {
    const url = URL.createObjectURL(this.output('blob'));
    const a = document.createElement('a'); a.href = url; a.download = name || 'documento.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  root.MiniPDF = MiniPDF;
})(typeof window !== 'undefined' ? window : this);
