/* =====================================================================
   ECGcheck — Lettore automatico di ECG in PDF
   Usa pdf.js (Mozilla, Apache-2.0, in lib/) per:
   1) leggere la traccia VETTORIALE (coordinate esatte del segnale),
   2) ricavare griglia/calibrazione, etichette delle derivazioni,
   3) misurare per ogni derivazione R, S, Q, ST(J), ST60, T, QRS, QT,
   4) analizzare la striscia del ritmo (R, P, RR, PR),
   5) leggere le misure stampate dall'elettrocardiografo.
   Tutto avviene sul dispositivo. I valori sono PROPOSTE da confermare.
   ===================================================================== */
(function (root) {
  'use strict';

  const PT_PER_MM = 72 / 25.4;
  const DT = 2; // ms per campione (500 Hz)
  const STD_3x4 = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
  const ORDER12 = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

  let pdfjs = null;
  async function lib() {
    if (pdfjs) return pdfjs;
    const base = (typeof document !== 'undefined' && document.baseURI) || location.href;
    pdfjs = await import(new URL('lib/pdf.min.mjs', base).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', base).href;
    return pdfjs;
  }

  /* ---------------- utilità numeriche ---------------- */
  function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function pct(a, p) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; }
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  function mul(m, n) { // matrici PDF [a b c d e f], applica m poi n
    return [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  }
  function tp(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function normLabel(s) {
    const u = String(s).trim().replace(/\s+/g, '').replace(/[.:]$/, '').toUpperCase();
    const map = { I: 'I', II: 'II', III: 'III', DI: 'I', DII: 'II', DIII: 'III', D1: 'I', D2: 'II', D3: 'III', AVR: 'aVR', AVL: 'aVL', AVF: 'aVF' };
    if (map[u]) return map[u];
    const m = /^V([1-6])$/.exec(u);
    return m ? 'V' + m[1] : null;
  }
  function parseColor(c) {
    if (typeof c === 'string') {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c);
      if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    }
    if (Array.isArray(c) || (c && c.length >= 3)) { const a = Array.from(c); return a.slice(0, 3).map(v => v <= 1 ? Math.round(v * 255) : v); }
    return [0, 0, 0];
  }
  function isDarkish(rgb) { const [r, g, b] = rgb; const lum = 0.299 * r + 0.587 * g + 0.114 * b; const sat = Math.max(r, g, b) - Math.min(r, g, b); return lum < 140 || (sat > 60 && b > r && lum < 180); }

  /* =====================================================================
     1. ESTRAZIONE GEOMETRICA DA pdf.js
     ===================================================================== */
  async function extractPage(page, OPS) {
    const vp = page.getViewport({ scale: 1 });
    const ol = await page.getOperatorList();
    const fn = ol.fnArray, args = ol.argsArray;
    let ctm = [1, 0, 0, 1, 0, 0], stroke = [0, 0, 0], fill = [0, 0, 0], lw = 1;
    const stack = [];
    const paths = [];
    let nImages = 0;
    const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter(x => x !== undefined));
    const fillOps = new Set([OPS.fill, OPS.eoFill].filter(x => x !== undefined));
    for (let i = 0; i < fn.length; i++) {
      const op = fn[i], a = args[i];
      if (op === OPS.save) stack.push({ ctm, stroke, fill, lw });
      else if (op === OPS.restore) { const s = stack.pop(); if (s) ({ ctm, stroke, fill, lw } = s); }
      else if (op === OPS.transform) ctm = mul(a, ctm);
      else if (op === OPS.paintFormXObjectBegin) { stack.push({ ctm, stroke, fill, lw }); if (a && a[0]) ctm = mul(a[0], ctm); }
      else if (op === OPS.paintFormXObjectEnd) { const s = stack.pop(); if (s) ({ ctm, stroke, fill, lw } = s); }
      else if (op === OPS.setLineWidth) lw = a[0];
      else if (op === OPS.setStrokeRGBColor || op === OPS.setStrokeColor || op === OPS.setStrokeGray || op === OPS.setStrokeColorN) stroke = parseColor(a[0] !== undefined && typeof a[0] !== 'number' ? a[0] : a);
      else if (op === OPS.setFillRGBColor || op === OPS.setFillColor || op === OPS.setFillGray || op === OPS.setFillColorN) fill = parseColor(a[0] !== undefined && typeof a[0] !== 'number' ? a[0] : a);
      else if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject || op === OPS.paintImageMaskXObject) nImages++;
      else if (op === OPS.constructPath) {
        const paintOp = a[0]; const data = a[1] && a[1][0];
        if (!data || typeof data.length !== 'number') continue;
        const isStroke = strokeOps.has(paintOp), isFill = fillOps.has(paintOp);
        if (!isStroke && !isFill) continue;
        const M = mul(ctm, vp.transform);
        const scaleLW = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
        let cur = null;
        const flush = () => { if (cur && cur.length > 1) paths.push({ pts: cur, color: isStroke ? stroke : fill, lw: lw * scaleLW, fill: !isStroke }); cur = null; };
        for (let k = 0; k < data.length;) {
          const c = data[k++];
          if (c === 0) { flush(); cur = [tp(M, data[k++], data[k++])]; }
          else if (c === 1) { const p = tp(M, data[k++], data[k++]); (cur || (cur = [])).push(p); }
          else if (c === 2) { k += 4; const p = tp(M, data[k++], data[k++]); (cur || (cur = [])).push(p); }
          else if (c === 3) { k += 2; const p = tp(M, data[k++], data[k++]); (cur || (cur = [])).push(p); }
          else if (c === 4) { if (cur && cur.length) cur.push(cur[0].slice()); }
          else break;
        }
        flush();
      }
    }
    // testo
    const tc = await page.getTextContent();
    const texts = tc.items.filter(it => it.str && it.str.trim()).map(it => {
      const p = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      return { str: it.str, x: p[0], y: p[1], h: Math.hypot(it.transform[2], it.transform[3]) };
    });
    return { vp, paths, texts, nImages, width: vp.width, height: vp.height };
  }

  /* =====================================================================
     2. CLASSIFICAZIONE: griglia, tracce, impulso di taratura
     ===================================================================== */
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  function classify(ex) {
    const vLines = [], hLines = [], traces = [], small = [];
    for (const p of ex.paths) {
      const b = bbox(p.pts);
      if (p.pts.length <= 5) {
        if (b.w < 0.6 && b.h > 15) { vLines.push((b.x0 + b.x1) / 2); continue; }
        if (b.h < 0.6 && b.w > 15) { hLines.push((b.y0 + b.y1) / 2); continue; }
      }
      if (p.fill) continue;
      if (p.pts.length >= 12 && b.w > 15 && isDarkish(p.color)) {
        let back = 0; for (let i = 1; i < p.pts.length; i++) if (p.pts[i][0] < p.pts[i - 1][0] - 0.05) back++;
        if (back / p.pts.length < 0.05) { traces.push({ pts: p.pts, b, color: p.color }); continue; }
      }
      if (p.pts.length >= 3 && p.pts.length <= 12 && isDarkish(p.color)) small.push({ pts: p.pts, b });
    }
    // unisci tracce contigue
    traces.sort((a, b) => a.b.x0 - b.b.x0);
    const merged = [];
    for (const t of traces) {
      const s = t.pts[0];
      const tgt = merged.find(m => { const e = m.pts[m.pts.length - 1]; return Math.abs(e[0] - s[0]) < 1.2 && Math.abs(e[1] - s[1]) < 1.2; });
      if (tgt) { tgt.pts = tgt.pts.concat(t.pts.slice(1)); tgt.b = bbox(tgt.pts); }
      else merged.push({ pts: t.pts.slice(), b: t.b });
    }
    return { vLines, hLines, traces: merged.filter(t => t.b.w > 20), small };
  }

  function gridSpacing(lines) {
    if (lines.length < 12) return null;
    const u = Array.from(new Set(lines.map(v => Math.round(v * 20) / 20))).sort((a, b) => a - b);
    const d = []; for (let i = 1; i < u.length; i++) { const x = u[i] - u[i - 1]; if (x > 0.8) d.push(x); }
    if (d.length < 10) return null;
    const m = median(d);
    const near = d.filter(x => Math.abs(x - m) / m < 0.12);
    if (near.length < d.length * 0.5) return null;
    return mean(near);
  }

  function findCalPulses(cls) {
    // impulso rettangolare: tratto verticale su, piatto, verticale giù (da tracce o polilinee brevi)
    const out = [];
    const cand = cls.small.concat(cls.traces.map(t => ({ pts: t.pts.slice(0, 40), b: bbox(t.pts.slice(0, 40)) })));
    for (const c of cand) {
      const p = c.pts;
      for (let i = 1; i < p.length - 2; i++) {
        const up = p[i - 1][1] - p[i][1], top = p[i + 1][0] - p[i][0], down = p[i + 2][1] - p[i + 1][1];
        if (Math.abs(p[i][0] - p[i - 1][0]) < 0.3 && up > 8 && Math.abs(p[i + 1][1] - p[i][1]) < 0.3 && top > 4 && Math.abs(p[i + 2][0] - p[i + 1][0]) < 0.3 && Math.abs(down - up) < 0.5) {
          out.push({ h: up, w: top, x: p[i - 1][0], y: p[i - 1][1] });
          break;
        }
      }
    }
    return out;
  }

  /* =====================================================================
     3. TESTO: etichette e misure dell'elettrocardiografo
     ===================================================================== */
  function machineText(texts) {
    // ricompone le righe
    const rows = [];
    texts.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach(t => {
      const r = rows.find(r => Math.abs(r.y - t.y) < Math.max(2, t.h * 0.5));
      if (r) r.items.push(t); else rows.push({ y: t.y, items: [t] });
    });
    const lines = rows.map(r => r.items.sort((a, b) => a.x - b.x).map(t => t.str).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const all = lines.join('\n');
    const g = (re) => { const m = re.exec(all); return m ? m : null; };
    const M = {};
    let m;
    if ((m = g(/(?:vent(?:ricular)?\.?\s*rate|freq(?:uenza)?\.?\s*(?:vent(?:ricolare)?\.?|cardiaca)?|\bHR\b|\bFC\b)\s*[:=]?\s*(\d{2,3})\s*(?:bpm|\/min|b\/min|bpm)?/i))) M.fc = +m[1];
    if ((m = g(/\bPR(?:\s*int(?:erval(?:lo)?)?)?\.?\s*[:=]?\s*(\d{2,3})\s*ms/i))) M.pr = +m[1];
    if ((m = g(/\bQRS(?:\s*dur(?:ation|ata)?)?\.?\s*[:=]?\s*(\d{2,3})\s*ms/i))) M.qrs = +m[1];
    if ((m = g(/\bQT\s*\/\s*QTc[^\d]{0,20}(\d{3})\s*\/\s*(\d{3})/i))) { M.qt = +m[1]; M.qtc = +m[2]; }
    else {
      if ((m = g(/\bQT(?!c)\s*[:=]?\s*(\d{3})\s*ms/i))) M.qt = +m[1];
      if ((m = g(/\bQTc[BFH]?\s*[:=]?\s*(\d{3})\s*ms/i))) M.qtc = +m[1];
    }
    if ((m = g(/P\s*-?\s*(?:QRS|R)\s*-?\s*T\s*(?:axes|assi)\s*[:=]?\s*(-?\d{1,3})\s+(-?\d{1,3})\s+(-?\d{1,3})/i))) M.assi = { p: +m[1], qrs: +m[2], t: +m[3] };
    else if ((m = g(/(?:asse|axis)\s*QRS\s*[:=]?\s*(-?\d{1,3})/i))) M.assi = { qrs: +m[1] };
    if ((m = g(/\bP\s*(?:dur(?:ation|ata)?)\.?\s*[:=]?\s*(\d{2,3})\s*ms/i))) M.p = +m[1];
    if ((m = g(/(\d{2}(?:[.,]\d)?)\s*mm\s*\/\s*s/i))) M.velocita = +m[1].replace(',', '.');
    if ((m = g(/(\d{1,2}(?:[.,]\d)?)\s*mm\s*\/\s*mV/i))) M.guadagno = +m[1].replace(',', '.');
    return { M, lines };
  }

  /* =====================================================================
     4. ELABORAZIONE DEL SEGNALE
     ===================================================================== */
  function resample(pts, x0, x1) {
    // pts in mm (x crescente), y in mm verso l'alto; restituisce array a passo dxmm
    return function (dxmm) {
      const out = []; let j = 0;
      for (let x = x0; x <= x1; x += dxmm) {
        while (j < pts.length - 2 && pts[j + 1][0] < x) j++;
        const a = pts[j], b = pts[j + 1] || a;
        const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
        out.push(a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, t)));
      }
      return out;
    };
  }
  function detectBeats(s) {
    // energia della pendenza (quadrato della derivata su 20 ms): privilegia il QRS rispetto alla T
    const n = s.length, d2 = new Array(n).fill(0);
    for (let i = 1; i < n - 1; i++) { const d = (s[i + 1] - s[i - 1]) / 2; d2[i] = d * d; }
    const e = new Array(n).fill(0); let acc = 0;
    for (let i = 0; i < n; i++) { acc += d2[i]; if (i >= 10) acc -= d2[i - 10]; e[i] = acc; }
    const ec = e.map((v, i) => e[Math.min(n - 1, i + 5)]);
    const mx = Math.max.apply(null, ec);
    if (!(mx > 0)) return [];
    const thr = 0.3 * mx;
    const cand = [];
    let i = 0;
    while (i < n) {
      if (ec[i] > thr) {
        let j = i, best = i;
        while (j < n && ec[j] > thr * 0.5) { if (ec[j] > ec[best]) best = j; j++; }
        cand.push({ i: best, e: ec[best] });
        i = j + 1;
      } else i++;
    }
    // regole di Pan-Tompkins: refrattario 200 ms; entro 360 ms un picco con energia < 50% del precedente è un'onda T
    const peaks = [];
    cand.forEach(c => {
      const last = peaks[peaks.length - 1];
      if (!last) { peaks.push(c); return; }
      const dt = (c.i - last.i) * DT;
      if (dt < 200) { if (c.e > last.e) peaks[peaks.length - 1] = c; return; }
      if (dt < 360 && c.e < 0.5 * last.e) return;
      peaks.push(c);
    });
    return peaks.map(pk => {
      const p = pk.i;
      const lo = Math.max(0, p - 30), hi = Math.min(n - 1, p + 30);
      const loc = median(s.slice(Math.max(0, p - 150), Math.min(n, p + 150)));
      let best = p, bv = -1;
      for (let k = lo; k <= hi; k++) { const v = Math.abs(s[k] - loc); if (v > bv) { bv = v; best = k; } }
      return best;
    });
  }
  function slope(s, i) { return (s[Math.min(s.length - 1, i + 1)] - s[Math.max(0, i - 1)]) / 2; }

  function measureBeat(s, c, prevC, nextC, raw) {
    const n = s.length;
    raw = raw || s;
    let maxSl = 0;
    for (let k = Math.max(1, c - 40); k < Math.min(n - 1, c + 40); k++) maxSl = Math.max(maxSl, Math.abs(slope(s, k)));
    // inizio/fine del QRS: prima/ultima deflessione significativa (> 7% della pendenza massima)
    const thr = maxSl * 0.07;
    let on = null, off = null;
    for (let k = Math.max(2, c - 60); k <= c; k++) if (Math.abs(slope(s, k)) > thr) { on = k - 3; break; }
    for (let k = Math.min(n - 2, c + 60); k >= c; k--) if (Math.abs(slope(s, k)) > thr) { off = k + 3; break; }
    if (on === null || off === null || on < 25) return null;
    const blS = s.slice(Math.max(0, on - 20), Math.max(1, on - 4));
    const base = median(blS);
    // onda R = massimo locale seguito da una discesa >= 0,3 mm (esclude il punto J sopraslivellato)
    // nadir del QRS: un'onda R dopo il nadir è accettata solo se sporge di ≥ 0,5 mm sul punto J (R′ del BBDx)
    let nI = on; for (let k = on; k <= off; k++) if (raw[k] < raw[nI]) nI = k;
    let rI = -1, rV = -Infinity;
    for (let k = Math.max(1, on - 2); k < Math.min(n - 1, off + 2); k++) {
      if (raw[k] >= raw[k - 1] && raw[k] >= raw[k + 1]) {
        let mnA = Infinity; for (let q = k; q <= Math.min(n - 1, k + 20); q++) mnA = Math.min(mnA, raw[q]);
        if (raw[k] - mnA < 0.3) continue;
        if (k > nI && raw[k] < raw[off] + 0.5) continue;
        if (raw[k] > rV) { rV = raw[k]; rI = k; }
      }
    }
    let mn = Infinity; for (let k = Math.max(0, on - 2); k <= Math.min(n - 1, off + 2); k++) mn = Math.min(mn, raw[k]);
    const baseR = median(raw.slice(Math.max(0, on - 20), Math.max(1, on - 4)));
    let R = rI >= 0 ? rV - baseR : 0, Q = 0, S = 0;
    if (R < 0.25) { R = 0; S = Math.max(0, baseR - mn); if (rI < 0) rI = on; }
    else {
      let mq = Infinity; for (let k = on; k <= rI; k++) mq = Math.min(mq, raw[k]); Q = Math.max(0, baseR - mq);
      let ms = Infinity; for (let k = rI; k <= off; k++) ms = Math.min(ms, raw[k]); S = Math.max(0, baseR - ms);
    }
    const st = s[off] - base;
    const st60 = off + 30 < n ? s[off + 30] - base : null;
    const tEndLim = Math.min(n - 2, off + 230, nextC ? nextC - 60 : n - 2);
    // picco della T cercato entro un limite fisiologico legato all'RR (evita di scambiare la P successiva
    // per la T a frequenze elevate): onset + 560·√RR − 40 ms
    const rrMs = nextC ? (nextC - c) * DT : prevC ? (c - prevC) * DT : 1000;
    const tPeakLim = Math.min(tEndLim, on + Math.round((560 * Math.sqrt(Math.max(0.3, rrMs / 1000)) - 40) / DT));
    let tI = null, tV = 0;
    for (let k = off + 20; k <= tPeakLim; k++) { const v = s[k] - base; if (Math.abs(v) > Math.abs(tV)) { tV = v; tI = k; } }
    let tEnd = null;
    if (tI !== null && Math.abs(tV) > 0.3) {
      let kk = tI, best = 0;
      const tTanLim = Math.min(tEndLim, tI + 100);
      for (let k = tI + 1; k <= tTanLim; k++) { const sl = slope(s, k); if ((tV > 0 && sl < best) || (tV < 0 && sl > best)) { best = sl; kk = k; } }
      if (best !== 0) { tEnd = kk + (base - s[kk]) / best; if (tEnd < tI || tEnd > tEndLim + 40) tEnd = null; }
    }
    return { on, off, c, rI, base, R, Q, S, st, st60, T: tI !== null ? tV : null, tEnd, qrs: (off - on) * DT, qt: tEnd !== null ? (tEnd - on) * DT : null, complete: tI !== null && tI < tPeakLim };
  }

  function analyzeLead(seg, ptPerMm, speed, gain, opts) {
    opts = opts || {};
    // seg: punti in pt (pagina, y verso il basso)
    const pts = seg.map(p => [p[0] / ptPerMm, -p[1] / ptPerMm * (10 / gain)]); // mm orizzontali, mm standard verso l'alto
    const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
    const dxmm = DT / (1000 / speed);
    const s = resample(pts, x0, x1)(dxmm);
    // scarta l'impulso di taratura iniziale (gradino ~10 mm piatto)
    let start = 0;
    const b0 = s[0];
    for (let k = 1; k < Math.min(s.length, 150); k++) {
      if (Math.abs(s[k] - b0) > 8 && Math.abs(s[Math.min(s.length - 1, k + 40)] - s[k]) < 0.3) { let e = k + 40; while (e < s.length && Math.abs(s[e] - s[k]) < 0.3) e++; start = e + 10; break; }
    }
    let sig = s.slice(start);
    const raw = sig;
    if (opts.smooth > 1) { // media mobile (foto: riduce il rumore di quantizzazione dei pixel)
      const w = opts.smooth | 0, h = w >> 1, out = new Array(sig.length);
      for (let i = 0; i < sig.length; i++) { let a = 0, c = 0; for (let k = i - h; k <= i + h; k++) if (k >= 0 && k < sig.length) { a += sig[k]; c++; } out[i] = a / c; }
      sig = out;
    }
    const peaks = detectBeats(sig);
    const beats = [];
    peaks.forEach((c, i) => { const b = measureBeat(sig, c, peaks[i - 1], peaks[i + 1], raw); if (b) beats.push(b); });
    const good = beats.filter(b => b.complete);
    const use = good.length ? good : beats;
    const pick = k => { const v = use.map(b => b[k]).filter(v => v !== null && v !== undefined && isFinite(v)); return v.length ? median(v) : null; };
    const toX = idx => x0 + (idx + start) * dxmm; // mm
    return {
      sig, start, x0, dxmm, peaks, beats,
      R: pick('R'), S: pick('S'), Q: pick('Q'), st: pick('st'), st60: pick('st60'), T: pick('T'), qrs: pick('qrs'), qt: pick('qt'),
      n: use.length,
      marks: use.map(b => ({ j: toX(b.off), on: toX(b.on), r: toX(b.rI), base: b.base, jy: sig[b.off], ry: sig[b.rI] })),
      toX
    };
  }

  function analyzeRhythm(L) {
    const sig = L.sig, beats = L.beats;
    if (beats.length < 2) return null;
    const rr = []; for (let i = 1; i < beats.length; i++) rr.push((beats[i].c - beats[i - 1].c) * DT);
    const ps = [];
    beats.forEach(b => {
      const lo = Math.max(0, b.on - 140), hi = b.on - 30;
      if (lo >= hi) return;
      let pi = lo, pv = -Infinity;
      for (let k = lo; k <= hi; k++) { const v = sig[k] - b.base; if (v > pv) { pv = v; pi = k; } }
      if (pv < 0.4) { ps.push(null); return; }
      let st = pi; while (st > lo && sig[st] - b.base > pv * 0.15) st--;
      let en = pi; while (en < b.on && sig[en] - b.base > pv * 0.15) en++;
      ps.push({ amp: pv, pr: (b.on - st) * DT, dur: (en - st) * DT });
    });
    const valid = ps.filter(Boolean);
    const prs = valid.map(p => p.pr);
    const consistent = valid.length >= Math.max(2, ps.length * 0.7) && prs.length && (Math.max.apply(null, prs) - Math.min.apply(null, prs)) <= 60;
    return {
      rr, rrMean: mean(rr), hr: 60000 / mean(rr), rrVar: Math.max.apply(null, rr) - Math.min.apply(null, rr),
      pPresenti: consistent, pAmp: valid.length ? median(valid.map(p => p.amp)) : null,
      pr: consistent ? median(prs) : null, pDur: consistent ? median(valid.map(p => p.dur)) : null
    };
  }

  /* =====================================================================
     5. ASSEGNAZIONE DELLE DERIVAZIONI
     ===================================================================== */
  function assignLeads(cls, texts, ptPerMm) {
    const labels = [];
    texts.forEach(t => { const n = normLabel(t.str); if (n) labels.push({ name: n, x: t.x, y: t.y }); });
    const traces = cls.traces.map(t => ({ ...t, yMed: median(t.pts.map(p => p[1])) }));
    const segs = [];
    let mode = 'etichette';
    const used = new Set();
    if (labels.length >= 6) {
      traces.forEach(tr => {
        const mine = labels.filter(l => l.x >= tr.b.x0 - 15 * ptPerMm && l.x <= tr.b.x1 && Math.abs(l.y - tr.yMed) < 16 * ptPerMm)
          .filter(l => !traces.some(o => o !== tr && Math.abs(l.y - o.yMed) < Math.abs(l.y - tr.yMed) && l.x >= o.b.x0 - 15 * ptPerMm && l.x <= o.b.x1))
          .sort((a, b) => a.x - b.x);
        if (!mine.length) return;
        mine.forEach((l, i) => {
          const xs = Math.max(tr.b.x0, l.x - 4 * ptPerMm);
          const xe = i < mine.length - 1 ? mine[i + 1].x - 4 * ptPerMm : tr.b.x1;
          const pts = tr.pts.filter(p => p[0] >= xs && p[0] <= xe);
          if (pts.length < 20) return;
          const rhythm = mine.length === 1 && (xe - xs) > 150 * ptPerMm;
          segs.push({ name: l.name, pts, rhythm, x0: xs, x1: xe, y: tr.yMed });
        });
      });
    }
    if (segs.filter(s => !s.rhythm).length < 6) {
      // layout presunto
      mode = 'presunto';
      segs.length = 0;
      const rows = traces.slice().sort((a, b) => a.yMed - b.yMed);
      const wide = rows.filter(r => r.b.w > 180 * ptPerMm);
      if (rows.length >= 12 && wide.length < 3) {
        rows.slice(0, 12).forEach((r, i) => segs.push({ name: ORDER12[i], pts: r.pts, rhythm: false, x0: r.b.x0, x1: r.b.x1, y: r.yMed }));
      } else if (wide.length >= 3) {
        wide.slice(0, 3).forEach((r, ri) => {
          const w = r.b.w / 4;
          for (let c = 0; c < 4; c++) {
            const xs = r.b.x0 + c * w + (c ? 1 : 0), xe = r.b.x0 + (c + 1) * w - 1;
            segs.push({ name: STD_3x4[ri][c], pts: r.pts.filter(p => p[0] >= xs && p[0] <= xe), rhythm: false, x0: xs, x1: xe, y: r.yMed });
          }
        });
        wide.slice(3).forEach(r => segs.push({ name: 'II', pts: r.pts, rhythm: true, x0: r.b.x0, x1: r.b.x1, y: r.yMed }));
      } else if (rows.length >= 6) {
        // 6×2: colonna sinistra periferiche, destra precordiali
        const left = rows.filter(r => r.b.x0 < 100 * ptPerMm).slice(0, 6), right = rows.filter(r => r.b.x0 >= 100 * ptPerMm).slice(0, 6);
        left.forEach((r, i) => segs.push({ name: ORDER12[i], pts: r.pts, rhythm: false, x0: r.b.x0, x1: r.b.x1, y: r.yMed }));
        right.forEach((r, i) => segs.push({ name: ORDER12[6 + i], pts: r.pts, rhythm: false, x0: r.b.x0, x1: r.b.x1, y: r.yMed }));
      }
    }
    segs.forEach(s => used.add(s.name));
    return { segs, mode, labels };
  }

  /* =====================================================================
     6. PIPELINE COMPLETA
     ===================================================================== */
  async function analyzePdf(arrayBuffer, opts) {
    opts = opts || {};
    const lib0 = await lib();
    const doc = await lib0.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false }).promise;
    const pageNo = Math.min(opts.page || 1, doc.numPages);
    const page = await doc.getPage(pageNo);
    const RS = opts.renderScale || 3;
    const vp = page.getViewport({ scale: RS });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const cx = canvas.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: cx, viewport: vp }).promise;

    const ex = await extractPage(page, lib0.OPS);
    const res = analyzeExtracted(ex, opts);
    res.canvas = canvas; res.renderScale = RS; res.numPages = doc.numPages; res.page = pageNo;
    res.pxPerMm = res.ptPerMm * RS;
    return res;
  }

  function analyzeExtracted(ex, opts) {
    const warnings = [];
    const cls = classify(ex);
    const { M, lines } = machineText(ex.texts);
    // calibrazione
    let ptPerMm = null, calMethod = '';
    const gv = gridSpacing(cls.vLines), gh = gridSpacing(cls.hLines);
    const g = gv || gh;
    if (g) {
      const mm = g / PT_PER_MM;
      const unit = mm > 2.5 ? 5 : 1;
      ptPerMm = g / unit; calMethod = 'griglia vettoriale (' + unit + ' mm = ' + g.toFixed(2) + ' pt)';
    }
    const pulses = findCalPulses(cls);
    let gainPulse = null, speedPulse = null;
    if (pulses.length) {
      const h = median(pulses.map(p => p.h)), w = median(pulses.map(p => p.w));
      if (!ptPerMm) { ptPerMm = h / 10; calMethod = 'impulso di taratura (assunto 10 mm)'; }
      gainPulse = h / ptPerMm; speedPulse = w / ptPerMm;
    }
    if (!ptPerMm) { ptPerMm = PT_PER_MM; calMethod = 'scala reale del PDF (1:1, presunta)'; if (cls.traces.length) warnings.push('Griglia e impulso di taratura non trovati: assunta scala 1:1. Verifica su un quadrato grande (5 mm).'); }
    const speed = M.velocita || opts.velocita || 25;
    let gain = M.guadagno || null;
    if (!gain && gainPulse) { const cands = [5, 10, 20]; gain = cands.reduce((a, b) => Math.abs(b - gainPulse) < Math.abs(a - gainPulse) ? b : a); }
    if (!gain) gain = opts.guadagno || 10;
    if (gainPulse && Math.abs(gainPulse - gain) > 1.5) warnings.push('Impulso di taratura alto ' + gainPulse.toFixed(1) + ' mm: verificare il guadagno (' + gain + ' mm/mV).');

    if (!cls.traces.length) {
      warnings.push(ex.nImages ? 'Il PDF contiene un\'immagine (ECG scansionato), non una traccia vettoriale: usa calibro e marker.' : 'Nessuna traccia ECG riconosciuta nel PDF.');
      return { ok: false, ptPerMm, calMethod, speed, gain, machine: M, textLines: lines, warnings, leads: {}, overlay: [] };
    }

    const A = assignLeads(cls, ex.texts, ptPerMm);
    if (A.mode === 'presunto') warnings.push('Etichette delle derivazioni non leggibili: assunta disposizione standard (' + (A.segs.length >= 12 ? 'verificare l\'ordine' : 'incompleta') + ').');
    const leads = {}, overlay = [];
    let rhythmSeg = null;
    A.segs.forEach(sg => {
      if (sg.rhythm) { if (!rhythmSeg || sg.name === 'II') rhythmSeg = sg; return; }
      if (leads[sg.name]) return;
      const r = analyzeLead(sg.pts, ptPerMm, speed, gain);
      leads[sg.name] = r;
      overlay.push({ t: 'label', x: sg.x0, y: sg.y - 9 * ptPerMm, s: sg.name });
      r.marks.forEach(mk => {
        overlay.push({ t: 'j', x: mk.j * ptPerMm, y: -mk.jy * ptPerMm / (10 / gain) });
        overlay.push({ t: 'base', x0: mk.on * ptPerMm - 3 * ptPerMm, x1: mk.on * ptPerMm, y: -mk.base * ptPerMm / (10 / gain) });
      });
    });
    // ritmo
    let rhythm = null;
    const rl = rhythmSeg ? analyzeLead(rhythmSeg.pts, ptPerMm, speed, gain) : (leads.II || leads.V1 || leads.I);
    if (rl) {
      rhythm = analyzeRhythm(rl);
      if (rhythm) {
        rhythm.lead = rhythmSeg ? rhythmSeg.name + ' (striscia)' : (leads.II ? 'II' : 'derivazione breve');
        rl.marks.forEach(mk => overlay.push({ t: 'r', x: mk.r * ptPerMm, y: -mk.ry * ptPerMm / (10 / gain) }));
      }
    }
    // misure globali
    const qrsAll = Object.values(leads).map(l => l.qrs).filter(v => v);
    const qtAll = ['II', 'V2', 'V3', 'V4', 'V5'].map(k => leads[k] && leads[k].qt).filter(v => v);
    const glob = {
      qrs: qrsAll.length ? pct(qrsAll, 0.75) : null,
      qt: qtAll.length ? pct(qtAll, 0.75) : null,
      pr: rhythm ? rhythm.pr : null,
      p: rhythm ? rhythm.pDur : null
    };
    const net = k => leads[k] ? (leads[k].R || 0) - (leads[k].S || 0) - (leads[k].Q || 0) : null;
    if (net('I') !== null && net('aVF') !== null && (net('I') || net('aVF'))) glob.asse = Math.round(Math.atan2(2 * net('aVF'), Math.sqrt(3) * net('I')) * 180 / Math.PI);

    const nLeads = Object.keys(leads).length;
    if (nLeads < 12) warnings.push('Derivazioni lette: ' + nLeads + '/12.');
    Object.keys(leads).forEach(k => { if (leads[k].n === 0) warnings.push('Nessun battito misurabile in ' + k + '.'); });

    return { ok: true, ptPerMm, calMethod, speed, gain, layout: A.mode, machine: M, textLines: lines, leads, rhythm, glob, overlay, warnings };
  }

  root.ECGPdf = { analyzePdf, analyzeExtracted, lib, signal: { analyzeLead, analyzeRhythm, median, pct, mean }, _test: { classify, gridSpacing, machineText, analyzeLead, normLabel } };
})(typeof window !== 'undefined' ? window : this);
