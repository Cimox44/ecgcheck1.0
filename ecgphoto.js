/* =====================================================================
   ECGcheck — Lettura automatica di ECG da FOTO
   Pipeline (tutto sul dispositivo, nessun dato inviato):
   1) carta millimetrata: individuata dalla "trama" della griglia rossa
   2) orientamento 0/90/180/270° e raddrizzamento (rotazione + inclinazione)
      con la griglia come riferimento
   3) calibrazione: passo della griglia (1/5 mm) + impulso di taratura 10 mm
   4) righe del tracciato, inseguimento della traccia colonna per colonna
   5) derivazioni secondo il PROFILO DELL'APPARECCHIO (ELI 280 6×2, 3×4+1…)
   6) misure (R, S, ST, ST60, T, QRS, QT, ritmo) con lo stesso motore dei PDF
   7) INDICE DI QUALITÀ: nitidezza, risoluzione, prospettiva, calibrazione,
      continuità della traccia → "rifai la foto" se insufficiente
   I valori sono PROPOSTE da confermare.
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------------- profili degli apparecchi ---------------- */
  const PROFILES = {
    auto: { nome: 'Automatico (in base al numero di righe)' },
    eli280: { nome: 'Welch Allyn / Hillrom ELI 280 – 6×2 (5 s + 5 s)', righe: 6, colonne: 2, mappa: [['I', 'V1'], ['II', 'V2'], ['III', 'V3'], ['aVR', 'V4'], ['aVL', 'V5'], ['aVF', 'V6']], ritmo: [1] },
    std6x2: { nome: 'Standard 6×2 (periferiche | precordiali)', righe: 6, colonne: 2, mappa: [['I', 'V1'], ['II', 'V2'], ['III', 'V3'], ['aVR', 'V4'], ['aVL', 'V5'], ['aVF', 'V6']], ritmo: [1] },
    std3x4r: { nome: 'Standard 3×4 + striscia del ritmo (GE, Philips, Mortara, Schiller…)', righe: 4, colonne: 4, mappa: [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6'], ['II*']], ritmo: [3] },
    std3x4r3: { nome: 'Standard 3×4 + 3 strisce del ritmo (V1, II, V5)', righe: 6, colonne: 4, mappa: [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6'], ['V1*'], ['II*'], ['V5*']], ritmo: [4] },
    std3x4: { nome: 'Standard 3×4 senza striscia del ritmo', righe: 3, colonne: 4, mappa: [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']], ritmo: [1] },
    std12x1: { nome: '12×1 (una derivazione per riga)', righe: 12, colonne: 1, mappa: [['I'], ['II'], ['III'], ['aVR'], ['aVL'], ['aVF'], ['V1'], ['V2'], ['V3'], ['V4'], ['V5'], ['V6']], ritmo: [1] }
  };

  /* ---------------- utilità ---------------- */
  const median = a => { if (!a.length) return null; const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pctl = (a, p) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function boxBlur1D(src, n, r) {
    const out = new Float32Array(n); let acc = 0, c = 0;
    for (let i = -r; i < n + r; i++) {
      if (i + r < n && i + r >= 0) { acc += src[i + r]; c++; }
      if (i - r - 1 >= 0 && i - r - 1 < n) { acc -= src[i - r - 1]; c--; }
      if (i >= 0 && i < n) out[i] = acc / Math.max(1, c);
    }
    return out;
  }
  function autocorr(p, maxLag) {
    const n = p.length; let m = 0; for (let i = 0; i < n; i++) m += p[i]; m /= n;
    const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = p[i] - m;
    let v = 0; for (let i = 0; i < n; i++) v += d[i] * d[i];
    const ac = new Float32Array(maxLag + 1);
    for (let L = 0; L <= maxLag; L++) { let s = 0; for (let i = 0; i + L < n; i++) s += d[i] * d[i + L]; ac[L] = v ? s / v : 0; }
    return ac;
  }
  function localMaxima(ac, lo, hi) {
    const out = [];
    for (let i = Math.max(1, lo); i < Math.min(ac.length - 1, hi); i++) if (ac[i] > ac[i - 1] && ac[i] >= ac[i + 1]) {
      const y0 = ac[i - 1], y1 = ac[i], y2 = ac[i + 1]; const d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 || 1e-9);
      out.push({ lag: i + clamp(d, -0.5, 0.5), v: y1 });
    }
    return out;
  }

  /* =====================================================================
     1. CANALI E CARTA
     ===================================================================== */
  // 1.3.1: canale della griglia secondo il colore: rosa/rossa (carta), blu/azzurra, verde o grigia
  // (screenshot di visualizzatori e app: PMcardio, cartelle cliniche, PDF esportati come immagine)
  let GRID = 'rosa';
  function gridHue(img) {
    const { width: W, height: H, data } = img; const st = Math.max(1, Math.floor(Math.sqrt(W * H / 200000)));
    let rg = 0, br = 0, gr = 0, n = 0;
    for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) {
      const j = (y * W + x) * 4, r = data[j], g = data[j + 1], b = data[j + 2], l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (l < 140 || l > 252) continue;
      rg += r - g; br += b - r; gr += g - (r + b) / 2; n++;
    }
    if (!n) return 'rosa';
    rg /= n; br /= n; gr /= n;
    if (rg >= 4 && rg >= br && rg >= gr) return 'rosa';
    if (br >= 4 && br >= gr) return 'blu';
    if (gr >= 4) return 'verde';
    return rg > 1.5 ? 'rosa' : 'grigio';
  }
  function channels(img) {
    const { width: W, height: H, data } = img;
    const n = W * H, lum = new Float32Array(n), rg = new Float32Array(n), sat = new Uint8Array(n), mn = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = data[j], g = data[j + 1], b = data[j + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[i] = l; mn[i] = Math.min(r, g, b);
      // "rg" = intensità del colore della griglia (storicamente R−G per la carta rosa)
      rg[i] = GRID === 'rosa' ? r - g : GRID === 'blu' ? (b - r) * 1.6 : GRID === 'verde' ? (g - (r + b) / 2) * 1.6 : (l > 150 ? Math.max(0, 250 - l) * 0.8 : 0);
      sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
    }
    return { W, H, lum, rg, sat, mn };
  }
  // ingrandimento bilineare delle immagini piccole (screenshot): la traccia sottile e la griglia a
  // 3–4 px/mm diventano inseguibili; le misure in mm/ms non dipendono dalla scala
  function upscale(img, k) {
    const { width: W, height: H, data } = img; const w2 = Math.round(W * k), h2 = Math.round(H * k);
    const out = new Uint8ClampedArray(w2 * h2 * 4);
    for (let y = 0; y < h2; y++) {
      const sy = Math.min(H - 1.001, Math.max(0, (y + 0.5) / k - 0.5)), y0 = sy | 0, fy = sy - y0;
      for (let x = 0; x < w2; x++) {
        const sx = Math.min(W - 1.001, Math.max(0, (x + 0.5) / k - 0.5)), x0 = sx | 0, fx = sx - x0;
        const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4, o = (y * w2 + x) * 4;
        for (let c = 0; c < 4; c++) out[o + c] = (data[i00 + c] * (1 - fx) + data[i10 + c] * fx) * (1 - fy) + (data[i01 + c] * (1 - fx) + data[i11 + c] * fx) * fy;
      }
    }
    return { width: w2, height: h2, data: out };
  }

  function paperMask(ch) {
    // blocchi 8×8: la carta ECG ha una "trama" rossa (deviazione standard di R−G alta)
    const { W, H, lum, rg } = ch, B = 8, bw = Math.floor(W / B), bh = Math.floor(H / B);
    const sd = new Float32Array(bw * bh), ml = new Float32Array(bw * bh), feat = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let s = 0, s2 = 0, sl = 0;
      for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) { const v = rg[y * W + x]; s += v; s2 += v * v; sl += lum[y * W + x]; }
      const m = s / 64; const k = by * bw + bx;
      sd[k] = Math.sqrt(Math.max(0, s2 / 64 - m * m)); ml[k] = sl / 64;
      // carta ECG: rosata (R−G medio alto) e/o con trama di griglia (deviazione standard)
      feat[k] = Math.max(0, m) + 1.5 * sd[k];
    }
    // soglia di Otsu sulla caratteristica
    const NB = 120, hist = new Float64Array(NB); let tot = 0;
    for (let i = 0; i < feat.length; i++) { hist[Math.min(NB - 1, Math.floor(feat[i] * 2))]++; tot++; }
    let sumAll = 0; for (let i = 0; i < NB; i++) sumAll += i * hist[i];
    let wB = 0, sB = 0, best = 0, thr = 12;
    for (let t = 0; t < NB; t++) { wB += hist[t]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sumAll - sB) / wF; const v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = t; } }
    thr = Math.max(4, (thr + 0.5) / 2);
    let mask = new Uint8Array(bw * bh);
    for (let i = 0; i < mask.length; i++) mask[i] = feat[i] > thr && ml[i] > 90 ? 1 : 0;
    // 1.3.1: screenshot (griglia non rosa): la carta è la zona chiara, con o senza linee di griglia visibili
    // (solo se la griglia è troppo chiara per delimitare il foglio)
    if (GRID !== 'rosa') { let c = 0; for (let i = 0; i < mask.length; i++) c += mask[i]; if (c < mask.length * 0.3) for (let i = 0; i < mask.length; i++) mask[i] = ml[i] > 150 ? 1 : 0; }
    // chiusura morfologica (riempie i buchi lasciati dalla traccia e dal testo)
    const dil = (m, r) => { const o = new Uint8Array(m.length); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { if (!m[y * bw + x]) continue; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) o[yy * bw + xx] = 1; } } return o; };
    const ero = (m, r) => { const inv = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1; const d = dil(inv, r); for (let i = 0; i < m.length; i++) d[i] = d[i] ? 0 : 1; return d; };
    mask = ero(dil(mask, 3), 3);
    // componente connessa più grande
    const lab = new Int32Array(bw * bh); let cur = 0, bestLab = 0, bestN = 0; const st = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || lab[i]) continue;
      cur++; let cnt = 0; st.push(i); lab[i] = cur;
      while (st.length) { const k = st.pop(); cnt++; const x = k % bw, y = (k / bw) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) return; const kk = yy * bw + xx; if (mask[kk] && !lab[kk]) { lab[kk] = cur; st.push(kk); } }); }
      if (cnt > bestN) { bestN = cnt; bestLab = cur; }
    }
    const pm = new Uint8Array(bw * bh); let x0 = bw, x1 = 0, y0 = bh, y1 = 0;
    const lums = [];
    for (let i = 0; i < pm.length; i++) if (lab[i] === bestLab && bestLab) { pm[i] = 1; const x = i % bw, y = (i / bw) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; lums.push(ml[i]); }
    // 1.3.1: griglia chiara non rosa (screenshot): i blocchi chiari senza linee di griglia visibili dentro il
    // rettangolo del foglio fanno parte della carta (altrimenti la traccia resta "a buchi")
    if (GRID !== 'rosa' && bestLab) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = y * bw + x; if (!pm[k] && ml[k] > 120) { pm[k] = 1; bestN++; } }
    }
    return { B, bw, bh, mask: pm, frac: bestN / (bw * bh), bbox: { x0: x0 * B, y0: y0 * B, x1: (x1 + 1) * B, y1: (y1 + 1) * B }, paperLum: median(lums) || 170 };
  }
  const inPaper = (pm, x, y) => { const bx = (x / pm.B) | 0, by = (y / pm.B) | 0; return bx >= 0 && by >= 0 && bx < pm.bw && by < pm.bh && pm.mask[by * pm.bw + bx] === 1; };

  /* =====================================================================
     2. ORIENTAMENTO E RADDRIZZAMENTO
     ===================================================================== */
  function blur2D(src, W, H, r) {
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H), col = new Float32Array(H);
    for (let y = 0; y < H; y++) tmp.set(boxBlur1D(src.subarray(y * W, y * W + W), W, r), y * W);
    for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) col[y] = tmp[y * W + x]; const b = boxBlur1D(col, H, r); for (let y = 0; y < H; y++) out[y * W + x] = b[y]; }
    return out;
  }
  function darkThreshold(ch, pm) {
    // contrasto richiesto: metà della distanza tra il nero della traccia e il fondo carta
    const vals = [];
    const { W, H, lum, sat } = ch;
    const st = Math.max(1, Math.floor(Math.sqrt((W * H) / 400000)));
    for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) if (inPaper(pm, x, y) && sat[y * W + x] < 60) vals.push(lum[y * W + x]);
    const p1 = pctl(vals, 0.004), p50 = pctl(vals, 0.5);
    return { thr: p1 + (p50 - p1) * 0.35, need: Math.max(28, (p50 - p1) * 0.56), p1, p50 };
  }
  // maschera della traccia:
  // 1) contrasto locale c = fondo − luminanza
  // 2) media 3×3 del contrasto (c3): le linee della griglia (≈ 1 px) si "diluiscono", la traccia
  //    stampata (2–3 px) no → soglia al 50% del livello della traccia (99,5° percentile di c3)
  // 3) isteresi limitata: pixel con c alto a ≤ 2 px da pixel forti (tratti sottili del QRS)
  // 4) rimozione dei puntini isolati (incroci della griglia)
  function traceMask(ch, pm, dk, r, pxmm, noGrid) {
    const { W, H } = ch;
    // griglia non rosa: canale minimo RGB (traccia nera e segni colorati come l'impulso blu risaltano,
    // la griglia chiara no)
    const lum = GRID !== 'rosa' ? ch.mn : ch.lum;
    const bl = blur2D(lum, W, H, r);
    const c = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) c[i] = bl[i] - lum[i];
    const c3 = blur2D(c, W, H, 1);
    const s3 = [], s1 = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (inPaper(pm, x, y)) { s3.push(c3[y * W + x]); s1.push(c[y * W + x]); }
    const lv3 = Math.max(20, pctl(s3, 0.995) || 45), lv1 = Math.max(25, pctl(s1, 0.995) || 60);
    dk.levelT = lv3;
    const strong = lv3 * 0.5, weak = lv1 * 0.45;
    const m = new Uint8Array(W * H); const st = [];
    // 1.3.1: griglia non rosa (screenshot, visualizzatori): traccia sottile e antialiasata, griglia chiara →
    // soglia sul contrasto riferita alla distanza fondo–nero, escludendo scritte e segni colorati (blu)
    const digital = GRID !== 'rosa';
    const span = Math.max(40, (dk.p50 || 235) - (dk.p1 || 60));
    const dS = span * 0.4, dW = span * 0.26;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!inPaper(pm, x, y)) continue;
      if (digital) { if (c[i] > dS) { m[i] = 2; st.push(i); } else if (c[i] > dW) m[i] = 1; continue; }
      if (c3[i] > strong && c[i] > weak * 0.8) { m[i] = 2; st.push(i); } else if (c[i] > weak) m[i] = 1;
    }
    const out = new Uint8Array(W * H);
    for (const i of st) out[i] = 1;
    for (const i of st) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const k = yy * W + xx; if (m[k] === 1) out[k] = 1;
      }
    }
    if (digital) {
      // apici sottili e chiari delle onde (antialiasing): crescita limitata (≤ 0,8 mm) su pixel deboli
      const dT = span * 0.15; let front = []; for (let i = 0; i < W * H; i++) if (out[i]) front.push(i);
      const steps = Math.max(3, Math.round((pxmm || 7) * 0.8));
      for (let it = 0; it < steps && front.length; it++) {
        const nf = [];
        for (const i of front) { const x = i % W, y = (i / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue; const k = yy * W + xx; if (!out[k] && c[k] > dT && inPaper(pm, xx, yy)) { out[k] = 1; nf.push(k); } } }
        front = nf;
      }
    }
    // puntini isolati
    const lab = new Int32Array(W * H); const stack = []; let id = 0; const minSpan = Math.max(4, (pxmm || 7) * 0.8);
    for (let i = 0; i < W * H; i++) {
      if (!out[i] || lab[i]) continue;
      id++; const comp = [i]; lab[i] = id; stack.push(i); let x0 = W, x1 = 0, y0 = H, y1 = 0;
      while (stack.length) {
        const k = stack.pop(); const x = k % W, y = (k / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (out[q] && !lab[q]) { lab[q] = id; stack.push(q); comp.push(q); } }
      }
      if (x1 - x0 < minSpan && y1 - y0 < minSpan) for (const k of comp) out[k] = 0;
    }
    return out;
  }

  // impulso di taratura cercato nella maschera: plateau orizzontale (3–9 mm) a 4–22 mm dalla base,
  // interno vuoto; l'altezza è misurata rispetto alla linea di base locale subito dopo l'impulso
  function pulseFromMask(dm, W, H, base, pxmm, xa, xb, dir, baseBefore) {
    const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && dm[y * W + x] === 1;
    const y0 = base - dir * pxmm * 24, y1 = base - dir * pxmm * 3;
    const ya = Math.max(0, Math.round(Math.min(y0, y1))), yb = Math.min(H - 1, Math.round(Math.max(y0, y1)));
    const top = new Float32Array(W).fill(NaN);
    for (let x = Math.max(0, xa | 0); x < Math.min(W, xb | 0); x++) {
      // primo pixel incontrato salendo dalla base (oltre 3 mm): il plateau, non la riga precedente
      if (dir > 0) { for (let y = yb; y >= ya; y--) if (at(x, y)) { top[x] = y; break; } }
      else { for (let y = ya; y <= yb; y++) if (at(x, y)) { top[x] = y; break; } }
    }
    const cands = [];
    for (let x = Math.max(0, xa | 0); x < Math.min(W, xb | 0); x++) {
      const t = top[x]; if (isNaN(t)) continue;
      let j = x, gaps = 0;
      while (j + 1 < W) {
        const n = top[j + 1];
        if (!isNaN(n) && Math.abs(n - t) <= Math.max(2, pxmm * 0.3)) { j++; gaps = 0; continue; }
        if (gaps < 2 && j + 2 < W && !isNaN(top[j + 2]) && Math.abs(top[j + 2] - t) <= Math.max(2, pxmm * 0.3)) { j += 2; gaps++; continue; }
        break;
      }
      const len = j - x + 1;
      if (len >= pxmm * 2.5 && len <= pxmm * 9) cands.push({ x, j, y: median(Array.from(top.slice(x, j + 1)).filter(v => !isNaN(v))) });
      x = j;
    }
    let best = null;
    for (const c of cands) {
      // linea di base locale: traccia nei 10 mm successivi
      const ys = [];
      // 1.3.1: impulso diritto alla FINE della riga (screenshot/visualizzatori): linea di base prima dell'impulso
      const after = baseBefore === 'after' ? true : baseBefore ? false : dir > 0;
      const bx0 = after ? Math.round(c.j + pxmm * 0.8) : Math.max(0, Math.round(c.x - pxmm * 12)), bx1 = after ? Math.min(W, c.j + pxmm * 12) : Math.round(c.x - pxmm * 0.8);
      for (let x = bx0; x < bx1; x++) {
        let bestY = null;
        for (let k = 0; k < pxmm * 6; k++) { const yy = Math.round(base + (k % 2 ? 1 : -1) * Math.ceil(k / 2)); if (at(x, yy)) { bestY = yy; break; } }
        if (bestY !== null) ys.push(bestY);
      }
      if (ys.length < pxmm * 3) continue;
      const bl = median(ys);
      const h = (bl - c.y) * dir;
      if (h < pxmm * 4 || h > pxmm * 22) continue;
      // interno vuoto
      let inside = 0, tot = 0;
      const iy0 = Math.min(c.y, bl) + pxmm * 1.2, iy1 = Math.max(c.y, bl) - pxmm * 1.2;
      for (let x = c.x + 3; x <= c.j - 3; x++) for (let y = Math.round(iy0); y <= iy1; y++) { tot++; if (at(x, y)) inside++; }
      if (tot && inside / tot > 0.04) continue;
      // "piedi" dell'impulso: tratti di traccia alla linea di base subito prima e subito dopo il plateau
      // (i lati verticali dell'impulso sono spesso troppo sottili per essere visti nella foto)
      const foot = (xc) => { for (let x = Math.round(xc - pxmm * 1.5); x <= Math.round(xc + pxmm * 1.5); x++) for (let y = Math.round(bl - pxmm * 0.8); y <= Math.round(bl + pxmm * 0.8); y++) if (at(x, y)) return 1; return 0; };
      const sc = foot(c.x) + foot(c.j);
      if (sc < 1) continue;
      // 1.3.1 (immagini digitali): almeno un lato verticale deve collegare il plateau alla PROPRIA linea di
      // base; l'impulso della riga vicina visto "da lontano" ha i lati rivolti verso l'altra riga
      if (GRID !== 'rosa' || baseBefore === 'after') {
        const leg = xc => { let best = 0; const ya2 = Math.round(Math.min(c.y, bl) + pxmm * 1), yb2 = Math.round(Math.max(c.y, bl) - pxmm * 1); if (yb2 <= ya2) return 1; for (let x = Math.round(xc - pxmm * 0.6); x <= Math.round(xc + pxmm * 0.6); x++) { let n = 0; for (let y = ya2; y <= yb2; y++) if (at(x, y)) n++; best = Math.max(best, n / (yb2 - ya2 + 1)); } return best; };
        if (Math.max(leg(c.x), leg(c.j)) < 0.6) continue;
      }
      const hmm = Math.abs(h) / pxmm;
      const score = sc * 0.6 + (hmm >= 7.5 && hmm <= 12.5 ? 1.2 : hmm >= 4 && hmm <= 6 ? 0.6 : hmm >= 17 && hmm <= 22 ? 0.6 : 0);
      if (!best || score > best.score) best = { h: Math.abs(h), len: c.j - c.x + 1, xStart: c.x, xEnd: c.j + pxmm * 0.6, base: bl, ok: true, score };
    }
    return best;
  }

  function gridPoints(ch, pm, maxPts) {
    // punti delle linee di griglia: R−G sopra la media locale
    const { W, H, rg } = ch;
    const r = 4; const pts = [];
    // sfocatura orizzontale + verticale (box) di rg
    const tmp = new Float32Array(W * H), bl = new Float32Array(W * H);
    for (let y = 0; y < H; y++) { const row = rg.subarray(y * W, y * W + W); tmp.set(boxBlur1D(row, W, r), y * W); }
    const col = new Float32Array(H);
    for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) col[y] = tmp[y * W + x]; const b = boxBlur1D(col, H, r); for (let y = 0; y < H; y++) bl[y * W + x] = b[y]; }
    const cand = [];
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const i = y * W + x; const d = rg[i] - bl[i];
      if (d > 6 && inPaper(pm, x, y)) cand.push(i);
    }
    const step = Math.max(1, Math.ceil(cand.length / maxPts));
    for (let k = 0; k < cand.length; k += step) { const i = cand[k]; pts.push([i % W, (i / W) | 0]); }
    return pts;
  }

  function bestAngle(pts, proj, lo, hi, step, len, off) {
    let best = 0, bv = -1;
    const hist = new Float32Array(len);
    for (let a = lo; a <= hi + 1e-9; a += step) {
      const t = a * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      hist.fill(0);
      for (let k = 0; k < pts.length; k++) { const v = proj(pts[k], c, s) + off; const b = v | 0; if (b >= 0 && b < len) hist[b]++; }
      let e = 0; for (let i = 0; i < len; i++) e += hist[i] * hist[i];
      if (e > bv) { bv = e; best = a; }
    }
    return best;
  }

  function orientation(ch, pm, tm) {
    // traccia orizzontale → la proiezione per righe ha picchi netti (le righe del tracciato)
    const { W, H } = ch; const bb = pm.bbox;
    const rp = new Float32Array(H), cp = new Float32Array(W);
    for (let y = bb.y0; y < bb.y1; y++) for (let x = bb.x0; x < bb.x1; x++) if (tm[y * W + x]) { rp[y]++; cp[x]++; }
    const cv = (p, a, b) => { const q = boxBlur1D(p.slice(a, b), b - a, 3); let m = 0; for (const v of q) m += v; m /= q.length; let s = 0; for (const v of q) s += (v - m) * (v - m); return Math.sqrt(s / q.length) / (m || 1); };
    const cvRow = cv(rp, bb.y0, bb.y1), cvCol = cv(cp, bb.x0, bb.x1);
    return { vertical: cvCol > cvRow, cvRow, cvCol };
  }

  // trasformazione affine: coordinate rettificate (u,v) → coordinate originali (x,y)
  function makeAffine(W, H, quarter, th, ph, sy, u0, v0, flip, outW, outH) {
    // passo A: rotazione di quarter*90° (orario) – coordinate ruotate (a,b)
    // passo B: (p,q) = [[cosφ, sinφ],[−sinθ, cosθ]]·(a,b); passo C: u = p − u0, v = (q − v0)·sy; flip 180°
    const ct = Math.cos(th), st = Math.sin(th), cf = Math.cos(ph), sf = Math.sin(ph);
    const det = cf * ct + sf * st; // det di [[cf, sf],[-st, ct]]
    return function (u, v) {
      if (flip) { u = outW - 1 - u; v = outH - 1 - v; }
      const p = u + u0, q = v / sy + v0;
      const a = (ct * p - sf * q) / det, b = (st * p + cf * q) / det;
      if (quarter === 1) return [b, H - 1 - a];
      return [a, b];
    };
  }
  function toRot(W, H, quarter, x, y) { return quarter === 1 ? [H - 1 - y, x] : [x, y]; }

  function render(img, map, outW, outH) {
    const { width: W, height: H, data } = img;
    const out = new Uint8ClampedArray(outW * outH * 4);
    for (let v = 0; v < outH; v++) for (let u = 0; u < outW; u++) {
      const [x, y] = map(u, v); const o = (v * outW + u) * 4;
      if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; continue; }
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) out[o + c] = (data[i00 + c] * (1 - fx) + data[i10 + c] * fx) * (1 - fy) + (data[i01 + c] * (1 - fx) + data[i11 + c] * fx) * fy;
      out[o + 3] = 255;
    }
    return { width: outW, height: outH, data: out };
  }

  /* =====================================================================
     3. CALIBRAZIONE (griglia)
     ===================================================================== */
  function gridPeriod(ch, axis, x0, x1, y0, y1) {
    // proiezione di R−G (passa-alto) lungo un asse → autocorrelazione → passo 1 mm e 5 mm
    const { W, rg } = ch;
    const n = axis === 'x' ? x1 - x0 : y1 - y0; const p = new Float32Array(n);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = rg[y * W + x]; if (axis === 'x') p[x - x0] += v; else p[y - y0] += v; }
    const bl = boxBlur1D(p, n, 12); for (let i = 0; i < n; i++) p[i] -= bl[i];
    const ac = autocorr(p, Math.min(n - 2, 260));
    const mx = localMaxima(ac, 3, 260).filter(m => m.v > 0.04);
    return { ac, mx };
  }
  function resolveGrid(gx, hintPxMm) {
    // sceglie l'interpretazione (1 mm, 5 mm) più coerente
    const cands = [];
    gx.mx.forEach(m => {
      [1, 5].forEach(k => {
        const mm = m.lag / k; if (mm < 2.2 || mm > 40) return;
        // conferma: picchi a multipli di 5 mm
        const at = L => { const i = Math.round(L); return i < gx.ac.length ? gx.ac[i] : 0; };
        const s5 = at(5 * mm) + at(10 * mm) * 0.7 + at(15 * mm) * 0.4;
        const s1 = (at(mm) + at(2 * mm)) * 0.3;
        let score = s5 + s1;
        if (hintPxMm) score -= Math.abs(Math.log(mm / hintPxMm)) * 3;
        cands.push({ mm, score, from: m.lag, k });
      });
    });
    cands.sort((a, b) => b.score - a.score);
    return cands[0] || null;
  }
  // 1.3.1: affinamento "a pettine" (screenshot/JPEG con griglia poco contrastata): il passo che massimizza
  // l'autocorrelazione su tutti i multipli di 1 mm entro l'intervallo calcolato
  function combPeriod(gx, mm) {
    const ac = gx.ac, n = ac.length - 1;
    const at = L => { const i = Math.floor(L), f = L - i; return i + 1 <= n ? ac[i] * (1 - f) + ac[i + 1] * f : 0; };
    let best = mm, bs = -Infinity;
    for (let f = 0.9; f <= 1.1; f += 0.001) {
      const m = mm * f, K = Math.floor(n / m); if (K < 3) continue;
      let sc = 0; for (let k = 1; k <= K; k++) sc += at(k * m) * (k % 5 === 0 ? 2 : 1);
      sc /= K;
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  }
  function refinePeriod(gx, mm) {
    if (GRID !== 'rosa') return combPeriod(gx, mm);
    // affina usando il picco a 5 mm (o 10 mm) dell'autocorrelazione
    const near = (L) => { let best = null; gx.mx.forEach(m => { if (Math.abs(m.lag - L) < L * 0.08 && (!best || m.v > best.v)) best = m; }); return best; };
    const p10 = near(10 * mm), p5 = near(5 * mm);
    if (p10) return p10.lag / 10;
    if (p5) return p5.lag / 5;
    return mm;
  }

  /* =====================================================================
     4. RIGHE E INSEGUIMENTO DELLA TRACCIA
     ===================================================================== */
  function findRows(dm, W, H, pxmm) {
    const rp = new Float32Array(H);
    for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += dm[y * W + x]; rp[y] = c; }
    const sm = boxBlur1D(rp, H, Math.max(1, Math.round(pxmm * 0.6)));
    // soglia riferita al 3° massimo locale (non al massimo assoluto): i bordi del foglio su fondo scuro
    // producono 1–2 "righe" molto dense che altrimenti farebbero scartare le righe vere (foto a ~6 px/mm)
    const loc = [];
    for (let y = 1; y < H - 1; y++) if (sm[y] >= sm[y - 1] && sm[y] > sm[y + 1]) loc.push(sm[y]);
    loc.sort((a, b) => b - a);
    const mx = loc.length ? loc[Math.min(loc.length - 1, 2)] : 0;
    const pk = [];
    for (let y = 1; y < H - 1; y++) if (sm[y] >= sm[y - 1] && sm[y] > sm[y + 1] && sm[y] > mx * 0.22) pk.push({ y, v: sm[y] });
    // separazione minima 9 mm
    pk.sort((a, b) => b.v - a.v);
    const sel = [];
    pk.forEach(p => { if (sel.every(s => Math.abs(s.y - p.y) > 9 * pxmm)) sel.push(p); });
    sel.sort((a, b) => a.y - b.y);
    // la riga deve essere "lunga" (traccia continua > 35% della larghezza)
    return sel.filter(s => {
      let cols = 0;
      for (let x = 0; x < W; x++) { let hit = 0; for (let y = Math.max(0, s.y - Math.round(pxmm * 2)); y < Math.min(H, s.y + Math.round(pxmm * 2)); y++) if (dm[y * W + x]) { hit = 1; break; } cols += hit; }
      s.cov = cols / W; return s.cov > 0.35;
    }).map(s => s.y);
  }
  function columnRuns(dm, W, x, ya, yb) {
    const runs = []; let st = -1;
    for (let y = ya; y <= yb; y++) {
      const d = dm[y * W + x];
      if (d && st < 0) st = y;
      if ((!d || y === yb) && st >= 0) { const en = d ? y : y - 1; if (runs.length && st - runs[runs.length - 1][1] <= 2) runs[runs.length - 1][1] = en; else runs.push([st, en]); st = -1; }
    }
    return runs;
  }
  // componenti connesse (8-connessione) della maschera della traccia
  function components(dm, W, H) {
    const lab = new Int32Array(W * H); const info = [null]; const st = [];
    for (let i = 0; i < W * H; i++) {
      if (!dm[i] || lab[i]) continue;
      const id = info.length; let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
      lab[i] = id; st.push(i);
      while (st.length) {
        const k = st.pop(); n++; const x = k % W, y = (k / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = yy * W + xx; if (dm[q] && !lab[q]) { lab[q] = id; st.push(q); }
        }
      }
      info.push({ n, x0, x1, y0, y1 });
    }
    return { lab, info };
  }
  // componenti appartenenti alla traccia di una riga
  function rowComponents(cc, W, base, pxmm, xStart) {
    const ok = new Set();
    const band = pxmm * 2.2;
    // 1) componenti che toccano la linea di base (escluse scritte e impulso a sinistra di xStart)
    cc.info.forEach((c, id) => {
      if (!c || c.x1 < xStart) return;
      if (c.y0 <= base + band && c.y1 >= base - band && (c.x1 - c.x0) >= pxmm * 1.2) ok.add(id);
    });
    // 2) frammenti verticali (tratti ripidi del QRS interrotti) vicini a componenti già accettate
    const acc = Array.from(ok).map(id => cc.info[id]);
    cc.info.forEach((c, id) => {
      if (!c || ok.has(id) || c.x1 < xStart) return;
      const h = c.y1 - c.y0, w = c.x1 - c.x0;
      if (h < w * 1.5 || h < pxmm * 1.5) return;
      if (Math.abs((c.y0 + c.y1) / 2 - base) > pxmm * 14) return;
      if (acc.some(a => c.x0 <= a.x1 + pxmm * 1.5 && c.x1 >= a.x0 - pxmm * 1.5)) ok.add(id);
    });
    return ok;
  }

  function trackRow(dm, W, H, base, lim0, lim1, pxmm, xStart, nbU, nbD) {
    const ya = Math.max(0, Math.round(lim0)), yb = Math.min(H - 1, Math.round(lim1));
    const cols = new Array(W).fill(null);
    // spessore tipico della linea
    const thick = [];
    for (let x = 0; x < W; x += 3) { columnRuns(dm, W, x, Math.round(base - pxmm * 1.5), Math.round(base + pxmm * 1.5)).forEach(r => { const L = r[1] - r[0] + 1; if (L <= pxmm * 1.2) thick.push(L); }); }
    const th = Math.max(1, median(thick) || 2);
    // punto di partenza: colonna con traccia vicina alla linea di base
    let prev = null, gap = 0, maxJump = pxmm * 3;
    const merged = new Uint8Array(W); let beyond = 0;
    const mid0 = nbU != null ? (nbU + base) / 2 : null, mid1 = nbD != null ? (nbD + base) / 2 : null;
    // la corsa tocca la linea di base della riga vicina (o il bordo della finestra verso di essa)
    const tol = th * 1.5 + pxmm * 0.4;
    const nearNb = (r, nb) => nb != null && (nb < base ? r[0] <= Math.max(nb + tol, ya + 1) : r[1] >= Math.min(nb - tol, yb - 1));
    const ownB = r => r[0] <= base + pxmm * 2.5 && r[1] >= base - pxmm * 2.5;
    for (let x = Math.max(0, Math.round(xStart || 0)); x < W; x++) {
      // corse della colonna; quelle "ancorate" alla linea di base della riga vicina appartengono a quella riga
      // (R alta della riga sotto / S profonda della riga sopra, registrate in contemporanea nel 6×2):
      // se non toccano la nostra linea di base sono scartate, se la toccano (tracce fuse) vengono tagliate
      // alla metà della distanza tra le righe e la colonna è marcata come "fusa" (misura da verificare)
      const runs = [];
      columnRuns(dm, W, x, ya, yb).forEach(r0 => {
        const r = r0.slice(); const u = nearNb(r, nbU), d = nearNb(r, nbD);
        if (!u && !d) { runs.push(r); return; }
        if (!ownB(r)) return;
        if (u) { r[0] = Math.max(r[0], mid0); merged[x] |= 1; }
        if (d) { r[1] = Math.min(r[1], mid1); merged[x] |= 2; }
        if (r[1] >= r[0]) runs.push(r);
      });
      if (!runs.length) { gap++; if (gap > pxmm * 4) prev = null; continue; }
      let best = null, bd = Infinity;
      const ref = prev || [base, base];
      runs.forEach(r => {
        const d0 = r[1] < ref[0] ? ref[0] - r[1] : r[0] > ref[1] ? r[0] - ref[1] : 0;
        // a parità di contatto con la colonna precedente vince la corsa con la sovrapposizione maggiore:
        // un puntino residuo della griglia vicino alla base non deve "rubare" la traccia sui tratti ripidi (apice di R/S)
        const ov = d0 === 0 ? Math.min(r[1], ref[1]) - Math.max(r[0], ref[0]) + 1 : 0;
        const d = d0 + 0.08 * Math.abs((r[0] + r[1]) / 2 - base) - 0.5 * ov;
        if (d < bd) { bd = d; best = r; }
      });
      const lim = prev ? maxJump + gap * pxmm * 0.6 : pxmm * 2.5;
      if (bd > lim) { gap++; if (gap > pxmm * 4) prev = null; continue; }
      cols[x] = best; prev = best; gap = 0;
      // traccia "dirottata" sulla riga vicina: oltre la metà della distanza tra le righe per > 2 mm (80 ms)
      // nessuna onda del QRS resta così a lungo lontana dalla linea di base → si cancella e si riaggancia
      const cy = (best[0] + best[1]) / 2;
      const far = (mid0 !== null && best[1] < mid0) || (mid1 !== null && best[0] > mid1);
      if (far) { beyond++; if (beyond > pxmm * 2) { for (let k = x - beyond + 1; k <= x; k++) cols[k] = null; prev = null; beyond = 0; } }
      else beyond = 0;
      void cy;
    }
    // linee verticali isolate (griglia residua) incrociate dalla traccia: la colonna ha una corsa
    // lunga ma le colonne a ±2 px hanno corse brevi alla stessa altezza → si ignora la linea
    const L = r => r ? r[1] - r[0] : 0, C = r => (r[0] + r[1]) / 2;
    // (solo carta rosa: negli screenshot la griglia chiara non entra nella maschera e un'onda R stretta
    // 2–3 px sembrerebbe una linea verticale isolata)
    for (let x = 2; x < W - 2 && GRID === 'rosa'; x++) {
      const r = cols[x]; if (!r || L(r) < pxmm * 2) continue;
      const a = cols[x - 2] || cols[x - 3], b = cols[x + 2] || cols[x + 3];
      if (!a || !b) continue;
      if (L(a) < pxmm * 0.8 && L(b) < pxmm * 0.8 && Math.abs(C(a) - C(b)) < pxmm * 0.7) {
        const y = (C(a) + C(b)) / 2; cols[x] = [y - th / 2, y + th / 2];
        if (cols[x - 1] && L(cols[x - 1]) >= pxmm * 2) cols[x - 1] = [y - th / 2, y + th / 2];
        if (cols[x + 1] && L(cols[x + 1]) >= pxmm * 2) cols[x + 1] = [y - th / 2, y + th / 2];
      }
    }
    return { cols, th, merged };
  }
  function colsToPoints(cols, th, x0, x1) {
    const pts = []; let prevY = null;
    const h = th / 2;
    for (let x = x0; x <= x1; x++) {
      const r = cols[x]; if (!r) continue;
      let t = r[0] + h, b = r[1] - h; if (b < t) { t = b = (r[0] + r[1]) / 2; }
      // tratto quasi orizzontale (corsa ≈ spessore della linea): un solo punto al centro.
      // 1.3.0: soglia proporzionale allo spessore – con linee spesse (foto a 8 px/mm) i due punti
      // alternati alto/basso creavano un "dente di sega" che allargava QRS e falsava ST
      if (b - t < 0.75 || r[1] - r[0] + 1 <= th * 1.6 + 1.5) { pts.push([x, (r[0] + r[1]) / 2]); prevY = (r[0] + r[1]) / 2; continue; }
      const nxt = cols[x + 1];
      const nyc = nxt ? (nxt[0] + nxt[1]) / 2 : null;
      // ordine verticale: dal lato più vicino al punto precedente verso quello del successivo
      let first = t, second = b;
      if (prevY !== null) { if (Math.abs(prevY - b) < Math.abs(prevY - t)) { first = b; second = t; } }
      else if (nyc !== null && nyc < (t + b) / 2) { first = b; second = t; }
      pts.push([x, first], [x + 0.5, second]);
      prevY = second;
    }
    return pts;
  }
  function rowExtent(cols, pxmm) {
    let x0 = -1, x1 = -1, cnt = 0;
    for (let x = 0; x < cols.length; x++) if (cols[x]) { if (x0 < 0) x0 = x; x1 = x; cnt++; }
    return { x0, x1, cov: x1 > x0 ? cnt / (x1 - x0 + 1) : 0 };
  }

  // impulso di taratura: plateau a ~10 mm sopra la linea di base all'inizio della riga
  function findPulse(pts, base, pxmm, fromLeft) {
    if (pts.length < 10) return null;
    const P = fromLeft ? pts : pts.map(p => p).reverse();
    const x0 = P[0][0];
    const lim = pxmm * 30;
    // ricerca di un plateau orizzontale lungo 2,5–8 mm a 5–25 mm dalla base
    let i = 0;
    while (i < P.length && Math.abs(P[i][0] - x0) < lim) {
      const dy = fromLeft ? base - P[i][1] : P[i][1] - base;
      if (dy > pxmm * 4) {
        let j = i; const ys = [];
        while (j < P.length && Math.abs((fromLeft ? base - P[j][1] : P[j][1] - base) - dy) < pxmm * 0.6) { ys.push(P[j][1]); j++; }
        const len = Math.abs(P[Math.min(j, P.length - 1)][0] - P[i][0]);
        if (len >= pxmm * 2.2 && len <= pxmm * 9) {
          const h = Math.abs(median(ys) - base);
          // fine dell'impulso: ritorno alla base
          let k = j; while (k < P.length && Math.abs(P[k][1] - base) > pxmm * 0.8) k++;
          return { h, len, xStart: P[i][0], xEnd: P[Math.min(k, P.length - 1)][0], ok: true };
        }
        i = Math.max(j, i + 1);
      } else i++;
    }
    return null;
  }

  // selezione delle righe vere: con impulso di taratura (se presente nella maggior parte) e spaziatura regolare
  function selectRows(rows, pxmm, nWanted) {
    if (rows.length < 2) return rows;
    let cand = rows;
    const withP = rows.filter(r => r.pulseL || r.pulseRU);
    if (withP.length >= 3 && withP.length >= rows.length * 0.4) {
      // spaziatura tipica tra righe con impulso
      const ys = withP.map(r => r.y).sort((a, b) => a - b);
      const d = []; for (let i = 1; i < ys.length; i++) d.push(ys[i] - ys[i - 1]);
      // 1.3.1: passo = distanza minima plausibile (le righe senza impulso rilevato creano "salti" doppi)
      const dd9 = d.filter(v => v > pxmm * 9);
      const step = dd9.length ? Math.min.apply(null, dd9) : median(d);
      cand = rows.filter(r => {
        if (r.pulseL || r.pulseRU) return true;
        // riga piatta senza impulso (bordo del foglio su fondo scuro, linea di stampa): escursione < 1 mm
        const ys = r.pts.map(p => p[1]);
        if (ys.length && pctl(ys, 0.98) - pctl(ys, 0.02) < pxmm * 1.5) return false;
        // riga senza impulso: accettata solo se a un passo (±20%) dalla riga con impulso più vicina
        const w = withP.reduce((b, q) => Math.abs(q.y - r.y) < Math.abs(b.y - r.y) ? q : b);
        // a un numero intero di passi (anche le righe vicine possono non avere l'impulso riconosciuto)
        const d = Math.abs(r.y - w.y), k = Math.max(1, Math.round(d / step));
        return Math.abs(d - k * step) < step * 0.2;
      });
    }
    // righe troppo vicine (< 60% della spaziatura mediana): tiene la più "densa"
    const ys = cand.map(r => r.y);
    const dd = []; for (let i = 1; i < ys.length; i++) dd.push(ys[i] - ys[i - 1]);
    const md = median(dd) || pxmm * 20;
    const out = [];
    cand.forEach(r => {
      const last = out[out.length - 1];
      if (last && r.y - last.y < md * 0.6) { if (score(r) > score(last)) out[out.length - 1] = r; }
      else out.push(r);
    });
    if (nWanted && out.length > nWanted) return out.slice().sort((a, b) => score(b) - score(a)).slice(0, nWanted).sort((a, b) => a.y - b.y);
    return out;
    // escursione della traccia: una riga piatta (bordo del foglio, linea della griglia) perde contro una vera
    function score(r) { const ys = r.pts.map(p => p[1]); const ex = ys.length ? (pctl(ys, 0.98) - pctl(ys, 0.02)) / pxmm : 0; return (r.pulseL || r.pulseRU ? 1 : 0) + r.ext.cov + (r.ext.x1 - r.ext.x0) / (pxmm * 250) + Math.min(1, ex / 5); }
  }

  /* =====================================================================
     5. QUALITÀ
     ===================================================================== */
  function sharpness(ch, thr) {
    // pendenza media del bordo della traccia normalizzata sul contrasto e sui px/mm
    const { W, H, lum } = ch; const g = [], gxs = [], gys = []; let tr = [], bg = [];
    for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) {
      const i = y * W + x; const l = lum[i];
      if (l < thr) tr.push(l); else if (bg.length < 200000) bg.push(l);
      const gx = lum[i + 1] - lum[i - 1], gy = lum[i + W] - lum[i - W];
      const m = Math.hypot(gx, gy) / 2;
      if (l < thr + 25 && l > thr - 25) { g.push(m); gxs.push(Math.abs(gx) / 2); gys.push(Math.abs(gy) / 2); }
    }
    const contrast = (median(bg) || 170) - (median(tr) || 80);
    // 1.3.0: nitidezza direzionale – il mosso (trascinamento in una direzione) abbassa i bordi in quella
    // direzione ma non nell'altra: si usa il rapporto tra le due e il minimo
    const ex = pctl(gxs, 0.95) || 0, ey = pctl(gys, 0.95) || 0;
    return { edge: pctl(g, 0.9) || 0, contrast, ex, ey, dir: Math.max(ex, ey) > 0 ? Math.min(ex, ey) / Math.max(ex, ey) : 1 };
  }

  /* =====================================================================
     6. PIPELINE
     ===================================================================== */
  function analyzePhoto(img, opts) {
    opts = opts || {};
    const S = (root.ECGPdf && root.ECGPdf.signal) || opts.signal;
    const t0 = Date.now();
    const warnings = [];
    const speed = opts.velocita || 25, gainSet = opts.guadagno || 10;
    const profKey = opts.profilo && PROFILES[opts.profilo] ? opts.profilo : 'auto';

    // 1) carta
    // 1.3.1: screenshot / immagini piccole → ingrandimento; colore della griglia rilevato automaticamente
    let upK = opts._upK || 1;
    if (!opts._flipped && Math.max(img.width, img.height) < 1500) { upK = Math.min(3, 2200 / Math.max(img.width, img.height)); img = upscale(img, upK); }
    GRID = gridHue(img);
    const ch0 = channels(img);
    const pm0 = paperMask(ch0);
    if (pm0.frac < 0.08) return fail('Carta millimetrata non riconosciuta: inquadra tutto il foglio ECG con buona luce.');
    const dk0 = darkThreshold(ch0, pm0);

    // 2) orientamento 0/90
    const tm0 = traceMask(ch0, pm0, dk0, 12, 7, true);
    const ori = orientation(ch0, pm0, tm0);
    // la carta ECG è "orizzontale" (asse dei tempi sul lato lungo): l'aspetto del foglio decide,
    // la distribuzione della traccia solo se il foglio è quasi quadrato
    const asp = (pm0.bbox.x1 - pm0.bbox.x0) / Math.max(1, pm0.bbox.y1 - pm0.bbox.y0);
    ori.aspect = asp;
    const vertical = asp < 0.87 ? true : asp > 1.15 ? false : ori.vertical;
    const quarter = vertical ? 1 : 0;
    const Wr = quarter ? img.height : img.width, Hr = quarter ? img.width : img.height;

    // 3) inclinazione dalla griglia (linee orizzontali → θ, verticali → φ)
    const gp = gridPoints(ch0, pm0, 70000).map(p => toRot(img.width, img.height, quarter, p[0], p[1]));
    if (gp.length < 500) {
      const sh0 = sharpness(ch0, dk0.thr);
      const sn = sh0.contrast > 0 ? sh0.edge / sh0.contrast : 0;
      return fail(sn < 0.3 ? 'Foto mossa o sfocata: griglia non leggibile. Rifai la foto tenendo fermo il telefono, con più luce e messa a fuoco sul tracciato.' : 'Griglia non visibile: la foto è troppo scura o la carta non è millimetrata rossa.');
    }
    const off = Math.max(Wr, Hr);
    const len = Math.ceil(off * 2.6);
    const projH = (p, c, s) => p[1] * c - p[0] * s;
    const projV = (p, c, s) => p[0] * c + p[1] * s;
    let th = bestAngle(gp, projH, -8, 8, 0.25, len, off);
    th = bestAngle(gp, projH, th - 0.3, th + 0.3, 0.025, len, off);
    let ph = bestAngle(gp, projV, -8, 8, 0.25, len, off);
    ph = bestAngle(gp, projV, ph - 0.3, ph + 0.3, 0.025, len, off);
    const tr = th * Math.PI / 180, pr = ph * Math.PI / 180;

    // carta nelle coordinate raddrizzate (p,q)
    const ct = Math.cos(tr), stt = Math.sin(tr), cf = Math.cos(pr), sf = Math.sin(pr);
    const fwd = (a, b) => [a * cf + b * sf, -a * stt + b * ct];
    const pp = [], qq = [];
    for (let by = 0; by < pm0.bh; by++) for (let bx = 0; bx < pm0.bw; bx++) if (pm0.mask[by * pm0.bw + bx]) {
      const [a, b] = toRot(img.width, img.height, quarter, bx * pm0.B + 4, by * pm0.B + 4); const [p, q] = fwd(a, b); pp.push(p); qq.push(q);
    }
    let u0 = pctl(pp, 0.005) - 6, u1 = pctl(pp, 0.995) + 6, v0 = pctl(qq, 0.005) - 6, v1 = pctl(qq, 0.995) + 6;
    let outW = Math.round(u1 - u0), outH = Math.round(v1 - v0);

    // 4) prima rettifica (senza correzione di scala) per misurare la griglia
    let map = makeAffine(img.width, img.height, quarter, tr, pr, 1, u0, v0, false, outW, outH);
    let rect = render(img, map, outW, outH);
    let ch = channels(rect);
    const gxx = gridPeriod(ch, 'x', 0, outW, 0, outH), gyy = gridPeriod(ch, 'y', 0, outW, 0, outH);
    // stima grossolana: carta ECG tipica ~ 200–280 mm sul lato lungo
    const hint = outW / 250;
    const rx = resolveGrid(gxx, hint), ry = resolveGrid(gyy, rx ? rx.mm : hint);
    if (!rx || !ry) return fail('Passo della griglia non misurabile: avvicinati o migliora la messa a fuoco.');
    let pxmmX = refinePeriod(gxx, rx.mm), pxmmY = refinePeriod(gyy, ry.mm);
    if (opts.debug) console.log('griglia', JSON.stringify({ rx, ry, pxmmX, pxmmY, mxX: gxx.mx.slice(0, 8).map(m => [+m.lag.toFixed(1), +m.v.toFixed(2)]), mxY: gyy.mx.slice(0, 8).map(m => [+m.lag.toFixed(1), +m.v.toFixed(2)]) }));
    if (Math.abs(Math.log(pxmmX / pxmmY)) > 0.25) { // incoerenza: usa il più affidabile
      if (rx.score >= ry.score) pxmmY = pxmmX; else pxmmX = pxmmY;
      warnings.push('Griglia letta in modo diverso nei due assi: verifica la calibrazione.');
    }
    // prospettiva residua: passo della griglia a sinistra vs destra
    const half = Math.floor(outW / 2);
    const gL = gridPeriod(ch, 'x', 0, half, 0, outH), gR = gridPeriod(ch, 'x', half, outW, 0, outH);
    const rL = resolveGrid(gL, pxmmX), rR = resolveGrid(gR, pxmmX);
    const persp = rL && rR ? Math.abs(refinePeriod(gL, rL.mm) - refinePeriod(gR, rR.mm)) / pxmmX * 100 : null;

    // 5) seconda rettifica: scala verticale = orizzontale (pixel quadrati)
    const sy = pxmmX / pxmmY;
    outH = Math.round((v1 - v0) * sy);
    map = makeAffine(img.width, img.height, quarter, tr, pr, sy, u0, v0, false, outW, outH);
    rect = render(img, map, outW, outH);
    ch = channels(rect);
    const pxmm = pxmmX;
    let pm = paperMask(ch);
    let dk = darkThreshold(ch, pm);
    let dm = traceMask(ch, pm, dk, Math.round(pxmmX * 2.5), pxmmX);

    // 6) righe e capovolgimento (180°)
    const prefRows = profKey !== 'auto' ? PROFILES[profKey].righe : null;
    const analyseRows = (dmask) => {
      const ys = findRows(dmask, outW, outH, pxmm);
      const cc = components(dmask, outW, outH);
      const pls = ys.map(y => ({ L: pulseFromMask(dmask, outW, outH, y, pxmm, 0, Math.min(outW, pxmm * 45), 1), R: pulseFromMask(dmask, outW, outH, y, pxmm, Math.max(0, outW - pxmm * 45), outW, -1), RU: pulseFromMask(dmask, outW, outH, y, pxmm, Math.max(0, outW - pxmm * 45), outW, 1, true), LI: pulseFromMask(dmask, outW, outH, y, pxmm, 0, Math.min(outW, pxmm * 45), -1, 'after') }));
      // 1.3.1: lo stesso impulso fisico può essere visto come impulso ROVESCIATO della riga sopra e come
      // impulso DIRITTO della riga sotto (o viceversa): vale quello con altezza più vicina a 5/10/20 mm
      const offStd = o => { const hm = o.h / pxmm; return Math.min.apply(null, [5, 10, 20].map(g => Math.abs(hm - g) / g)); };
      for (let i = 0; i + 1 < ys.length; i++) {
        const a = pls[i].R, b = pls[i + 1].RU;
        if (a && b && Math.abs(a.xStart - b.xStart) < pxmm * 2.5) { if (offStd(a) <= offStd(b)) pls[i + 1].RU = null; else pls[i].R = null; }
        // idem a sinistra: impulso rovesciato della riga sopra (foto capovolta con taratura a fine riga) ≡ impulso diritto della riga sotto
        const c = pls[i].LI, e = pls[i + 1].L;
        if (c && e && Math.abs(c.xStart - e.xStart) < pxmm * 2.5) { if (offStd(c) < offStd(e)) pls[i + 1].L = null; else pls[i].LI = null; }
      }
      // impulsi coerenti: altezza e posizione simili tra le righe (scarta falsi plateau)
      ['L', 'R', 'RU', 'LI'].forEach(side => {
        const v = pls.filter(o => o[side]);
        if (v.length >= 3) {
          const mh = median(v.map(o => o[side].h)), mx = median(v.map(o => o[side].xStart));
          v.forEach(o => { if (Math.abs(o[side].h - mh) > mh * 0.18 || Math.abs(o[side].xStart - mx) > pxmm * 20) o[side] = null; });
        }
      });
      const ends = pls.filter(o => o.L).map(o => o.L.xEnd);
      const commonStart = ends.length ? median(ends) : null;
      let rows = ys.map((y, i) => {
        // 1.3.0: la traccia può estendersi fino a ~1 mm dalla linea di base della riga vicina (R/S alte):
        // prima il limite era la metà della distanza + 3 mm (R > ~16 mm "tagliate")
        const nbU = i ? ys[i - 1] : null, nbD = i < ys.length - 1 ? ys[i + 1] : null;
        const lim0 = nbU !== null ? Math.min(nbU + pxmm * 1.2, (nbU + y) / 2 - pxmm * 3) : y - pxmm * 25;
        const lim1 = nbD !== null ? Math.max(nbD - pxmm * 1.2, (nbD + y) / 2 + pxmm * 3) : y + pxmm * 25;
        const xStart = pls[i].L ? pls[i].L.xEnd + pxmm * 0.6 : commonStart !== null ? commonStart + pxmm * 0.6 : 0;
        const okc = rowComponents(cc, outW, y, pxmm, xStart);
        const sub = new Uint8Array(outW * outH);
        const ya = Math.max(0, Math.round(lim0)), yb = Math.min(outH - 1, Math.round(lim1));
        // impulso a destra: la traccia termina prima dell'impulso
        const xLim = pls[i].RU && !pls[i].L ? Math.round(pls[i].RU.xStart - pxmm * 0.8) : outW;
        for (let yy = ya; yy <= yb; yy++) for (let x = Math.round(xStart); x < xLim; x++) { const k = yy * outW + x; if (dmask[k] && okc.has(cc.lab[k])) sub[k] = 1; }
        const tk = trackRow(sub, outW, outH, y, lim0, lim1, pxmm, xStart, nbU, nbD);
        return { y, cols: tk.cols, th: tk.th, pulseL: pls[i].L, pulseR: pls[i].R, pulseRU: pls[i].RU, pulseLI: pls[i].LI, xStart, merged: tk.merged };
      });
      // 1.3.0 – tracce sovrapposte tra righe adiacenti (6×2: QRS simultanei; R alta della riga sotto che
      // incontra la S profonda della riga sopra): nelle colonne in cui le due righe rivendicano gli stessi
      // pixel la proprietà non è decidibile → entrambe vengono limitate alla metà della distanza e la colonna
      // è marcata "fusa": la misura diventa un limite inferiore ("≥") da verificare, mai una sovrastima.
      for (let i = 1; i < rows.length; i++) {
        const A = rows[i - 1], B = rows[i]; const mid = (A.y + B.y) / 2;
        if (B.y - A.y > pxmm * 60) continue;
        const w = Math.max(2, Math.round(pxmm * 0.6));
        const hit = (C, x, test) => { for (let k = Math.max(0, x - w); k <= Math.min(outW - 1, x + w); k++) if (C[k] && test(C[k])) return true; return false; };
        const clipA = [], clipB = [];
        for (let x = 0; x < outW; x++) {
          const a = A.cols[x], b = B.cols[x];
          // la parte oltre la metà tocca (±0,6 mm) la traccia dell'altra riga → tracce fuse
          if (a && a[1] > mid && hit(B.cols, x, r => r[0] <= a[1] + 1)) clipA.push(x);
          if (b && b[0] < mid && hit(A.cols, x, r => r[1] >= b[0] - 1)) clipB.push(x);
        }
        clipA.forEach(x => { const a = A.cols[x]; A.cols[x] = [Math.min(a[0], mid), mid]; A.merged[x] |= 2; });
        clipB.forEach(x => { const b = B.cols[x]; B.cols[x] = [mid, Math.max(b[1], mid)]; B.merged[x] |= 1; });
      }
      rows.forEach(r => { r.ext = rowExtent(r.cols, pxmm); r.pts = r.ext.x0 >= 0 ? colsToPoints(r.cols, r.th, r.ext.x0, r.ext.x1) : []; });
      rows = rows.filter(r => r.ext.x1 - r.ext.x0 > pxmm * 40);
      return selectRows(rows, pxmm, prefRows);
    };
    let rows = analyseRows(dm);
    let ps = rows.map(r => ({ L: r.pulseL, R: r.pulseR, RU: r.pulseRU, LI: r.pulseLI }));
    const pulsesL = ps.filter(o => o.L).length, pulsesR = ps.filter(o => o.R).length, pulsesRU = ps.filter(o => o.RU).length, pulsesLI = ps.filter(o => o.LI).length;
    let flip = false;
    // capovolto di 180° se gli impulsi sono ROVESCIATI: a destra (taratura a inizio riga) o a sinistra
    // (taratura a fine riga, es. screenshot di visualizzatori ruotati); impulsi diritti = orientamento corretto
    const upEv = pulsesL + pulsesRU, downEv = pulsesR + pulsesLI;
    const wantFlip = opts.flip === true || (opts.flip !== false && downEv > upEv);
    // 1.3.1: immagini digitali o taratura a fine riga: il capovolgimento si fa ruotando di 180° l'immagine di
    // partenza e ripetendo l'intera lettura (più robusto del ribaltamento della sola finestra raddrizzata)
    if (wantFlip && !opts._flipped && (GRID !== 'rosa' || pulsesLI > pulsesR)) {
      const d = img.data, n = img.width * img.height, o = new Uint8ClampedArray(d.length);
      for (let i = 0; i < n; i++) { const j = (n - 1 - i) * 4, k = i * 4; o[k] = d[j]; o[k + 1] = d[j + 1]; o[k + 2] = d[j + 2]; o[k + 3] = d[j + 3]; }
      const res2 = analyzePhoto({ width: img.width, height: img.height, data: o }, Object.assign({}, opts, { flip: false, _flipped: true, _upK: upK }));
      if (res2.ok) res2.rotation = ((res2.rotation || 0) + 180) % 360;
      return res2;
    }
    if (wantFlip && !opts._flipped) {
      flip = true;
      map = makeAffine(img.width, img.height, quarter, tr, pr, sy, u0, v0, true, outW, outH);
      rect = render(img, map, outW, outH);
      ch = channels(rect); pm = paperMask(ch); dk = darkThreshold(ch, pm); dm = traceMask(ch, pm, dk, Math.round(pxmmX * 2.5), pxmmX);
      rows = analyseRows(dm);
      ps = rows.map(r => ({ L: r.pulseL, R: r.pulseR, RU: r.pulseRU, LI: r.pulseLI }));
    }
    const pulseRight = !flip && ps.filter(o => o.RU).length > ps.filter(o => o.L).length;
    if (!rows.length) return fail('Tracciato non trovato nella foto.');

    // 7) impulsi di taratura → guadagno
    const pulses = rows.map((r, i) => ({ r, p: ps[i] && (pulseRight ? ps[i].RU : ps[i].L) }));
    const hs = pulses.filter(o => o.p).map(o => o.p.h / pxmm);
    let gain = gainSet, pulseMm = null;
    if (hs.length) {
      pulseMm = median(hs);
      const g = [5, 10, 20].reduce((a, b) => Math.abs(b - pulseMm) < Math.abs(a - pulseMm) ? b : a);
      if (Math.abs(pulseMm - g) / g < 0.18) { if (g !== gainSet) warnings.push('Impulso di taratura di ' + pulseMm.toFixed(1) + ' mm: guadagno impostato a ' + g + ' mm/mV.'); gain = g; }
      else warnings.push('Impulso di taratura di ' + pulseMm.toFixed(1) + ' mm (atteso 10 mm): calibrazione o foto non frontale da verificare.');
    } else warnings.push('Impulso di taratura non trovato: calibrazione solo dalla griglia.');

    // 8) profilo e derivazioni
    let prof = PROFILES[profKey];
    if (profKey === 'auto') {
      const n = rows.length;
      prof = n >= 11 ? PROFILES.std12x1 : n >= 6 ? (rows.some(r => (r.ext.x1 - r.ext.x0) / pxmm > 0) && guessColumns(rows, pxmm) === 4 ? PROFILES.std3x4r3 : PROFILES.std6x2) : n === 4 ? PROFILES.std3x4r : n === 3 ? PROFILES.std3x4 : null;
      if (!prof) { warnings.push('Righe trovate: ' + n + '. Formato non riconosciuto: seleziona il profilo dell\'apparecchio.'); prof = PROFILES.std6x2; }
    }
    if (rows.length < prof.righe) warnings.push('Righe trovate ' + rows.length + ' su ' + prof.righe + ' attese per il profilo scelto.');
    const leads = {}, overlay = [], segs = [], limLeads = [];
    let rhythmPts = null, rhythmName = null;
    // inizio comune delle derivazioni: fine degli impulsi (mediana), altrimenti inizio della traccia
    const pEnds = pulseRight ? [] : pulses.filter(o => o.p).map(o => o.p.xEnd);
    const startX = pEnds.length ? median(pEnds) + pxmm * 1.2 : null;
    const rEnds = pulseRight ? pulses.filter(o => o.p).map(o => o.p.xStart) : [];
    const endX = rEnds.length ? median(rEnds) - pxmm * 0.8 : null;
    rows.slice(0, prof.mappa.length).forEach((r, ri) => {
      const pu = pulses[ri] && pulses[ri].p;
      const names = prof.mappa[ri];
      const totMm = 10 * speed; // 10 s per riga
      let xs, xe, w;
      if (pulseRight) {
        // taratura a fine riga: la riga termina all'impulso e dura 10 s
        xe = Math.min(r.ext.x1, (pu ? pu.xStart - pxmm * 0.8 : endX !== null ? endX : r.ext.x1));
        // il "piede" dell'impulso può attaccarsi alla fine della traccia: la riga finisce al primo spazio vuoto
        // (≥ 0,4 mm) entro gli ultimi 4 mm prima dell'impulso
        { const g = Math.max(2, Math.round(pxmm * 0.4)); let run = 0; for (let x = Math.round(xe); x > xe - pxmm * 4 && x > 0; x--) { if (!r.cols[x]) { run++; if (run >= g) { xe = x + run - 1; let k = Math.round(xe); while (k > 0 && !r.cols[k]) k--; xe = k; break; } } else run = 0; } }
        xe -= pxmm * 0.3;
        xs = Math.max(r.ext.x0 + pxmm * 0.2, xe - totMm * pxmm);
        w = (xe - xs) / names.length;
      } else {
        xs = pu ? pu.xEnd + pxmm * 1.2 : startX !== null ? startX : Math.max(r.xStart, r.ext.x0) + pxmm * 0.5;
        xe = Math.min(r.ext.x1, xs + totMm * pxmm) - pxmm * 0.3;
        w = names.length === 1 ? xe - xs : (totMm * pxmm) / names.length;
      }
      names.forEach((nm, ci) => {
        const mg = pulseRight ? 1.4 : 1.0; // con l'impulso a destra l'inizio della riga è stimato: margine maggiore
        const a = xs + ci * w + (ci ? pxmm * mg : 0), b = Math.min(xe, xs + (ci + 1) * w - (ci < names.length - 1 ? pxmm * mg : 0));
        const pts = r.pts.filter(p => p[0] >= a && p[0] <= b);
        segs.push({ name: nm, x0: a, x1: b, y: r.y });
        overlay.push({ t: 'label', x: a + pxmm, y: r.y - pxmm * 9, s: nm.replace('*', '') });
        if (nm.endsWith('*')) { if (!rhythmPts) { rhythmPts = pts; rhythmName = nm.replace('*', '') + ' (striscia)'; } return; }
        if (pts.length < pxmm * 20 || leads[nm]) return;
        const L = S.analyzeLead(pts, pxmm, speed, gain, { smooth: 5 });
        L.cov = coverage(r.cols, a, b);
        leads[nm] = L;
        L.marks.forEach(mk => {
          overlay.push({ t: 'j', x: mk.j * pxmm, y: -mk.jy * pxmm / (10 / gain) });
          overlay.push({ t: 'base', x0: (mk.on - 3) * pxmm, x1: mk.on * pxmm, y: -mk.base * pxmm / (10 / gain) });
        });
        // 1.3.0: tracce fuse con la riga vicina nel QRS → R (lato alto) / S (lato basso) = limite inferiore
        const usedB = L.beats.filter(b => b.complete); const bb = usedB.length ? usedB : L.beats;
        let mR = 0, mS = 0;
        bb.forEach(b => { const xa = Math.floor(L.toX(b.on) * pxmm), xb = Math.ceil(L.toX(b.off) * pxmm); let f = 0; for (let x = Math.max(0, xa); x <= Math.min(outW - 1, xb); x++) f |= (r.merged ? r.merged[x] : 0); if (f & 1) mR++; if (f & 2) mS++; });
        L.rLim = bb.length > 0 && mR >= bb.length / 2; L.sLim = bb.length > 0 && mS >= bb.length / 2;
        // ST misurato solo sui battiti con il punto J lontano (> 1,5 mm) da colonne fuse
        if (r.merged && (mR || mS)) {
          // battiti con colonne fuse nel QRS: punto J (e quindi ST, ST60, QRS) non affidabile
          const okB = bb.filter(b => { const xa = L.toX(b.on) * pxmm - pxmm, xb = L.toX(b.off) * pxmm + pxmm * 1.5; for (let x = Math.max(0, Math.floor(xa)); x <= Math.min(outW - 1, Math.ceil(xb)); x++) if (r.merged[x]) return false; return true; });
          const md = k => { const v = okB.map(b => b[k]).filter(v => v != null && isFinite(v)); return v.length ? median(v) : null; };
          if (okB.length < bb.length) { L.st = md('st'); L.st60 = md('st60'); L.qrs = md('qrs'); L.stLim = L.st === null; }
        }
        // punti usati per R e S (battito più vicino alla mediana): base, apice R, nadir S – trascinabili nell'app
        const kB = bb.length ? bb.slice().sort((p, q) => Math.abs(p.R - L.R) - Math.abs(q.R - L.R))[0] : null;
        if (kB) {
          const yPx = v => -v * pxmm / (10 / gain);
          let sI = kB.rI; for (let k = Math.max(kB.on, kB.rI); k <= kB.off; k++) if (L.sig[k] < L.sig[sI]) sI = k;
          const rawR = kB.rI >= 0 ? (L.raw || L.sig)[kB.rI] : null;
          const bx = L.toX(kB.on) * pxmm;
          if (L.R) overlay.push({ t: 'apex', lead: nm, k: 'r', x: L.toX(kB.rI) * pxmm, y: yPx(rawR != null ? rawR : L.sig[kB.rI]), bx, by: yPx(kB.base), lim: L.rLim });
          if (L.S) overlay.push({ t: 'apex', lead: nm, k: 's', x: L.toX(sI) * pxmm, y: yPx(L.sig[sI]), bx, by: yPx(kB.base), lim: L.sLim });
        }
        if (L.rLim || L.sLim || L.stLim) limLeads.push(nm + (L.rLim ? ' (R)' : '') + (L.sLim ? ' (S)' : '') + (L.stLim ? ' (ST non misurabile)' : ''));
      });
    });
    // ritmo: striscia dedicata, altrimenti la riga indicata dal profilo (es. II + V2 nell'ELI 280)
    let rhythm = null;
    const RR = [];
    let pInfo = null;
    const rhythmSources = [];
    if (rhythmPts) rhythmSources.push({ pts: rhythmPts, name: rhythmName });
    else {
      const ri = (prof.ritmo || [1])[0]; const r = rows[ri];
      if (r) prof.mappa[ri].forEach(nm => { const sg = segs.find(s => s.name === nm); if (sg) rhythmSources.push({ pts: r.pts.filter(p => p[0] >= sg.x0 && p[0] <= sg.x1), name: nm }); });
    }
    rhythmSources.forEach((src, k) => {
      const L = S.analyzeLead(src.pts, pxmm, speed, gain, { smooth: 5 });
      const rr = S.analyzeRhythm(L);
      if (rr) { RR.push.apply(RR, rr.rr); if (k === 0) pInfo = rr; L.marks.forEach(mk => overlay.push({ t: 'r', x: mk.r * pxmm, y: -mk.ry * pxmm / (10 / gain) })); }
    });
    // FC robusta: mediana degli RR di tutte le derivazioni (ogni derivazione = 2,5–10 s)
    const leadRR = [];
    Object.values(leads).forEach(L => { const p = L.beats.map(bt => bt.c); for (let i = 1; i < p.length; i++) leadRR.push((p[i] - p[i - 1]) * 2); });
    RR.forEach(v => leadRR.push(v));
    const rrMed = leadRR.length ? median(leadRR.filter(v => v > 240 && v < 2400)) : null;
    if (RR.length || rrMed) {
      // RR anomali (battito non rilevato o doppio conteggio) esclusi dalla valutazione della regolarità
      const clean = arr => { const md = median(arr); return arr.filter(v => v > md * 0.6 && v < md * 1.6); };
      let useRR = RR.length >= 2 ? clean(RR) : clean(leadRR);
      if (useRR.length < 2) useRR = RR.length >= 2 ? RR : leadRR;
      if ((RR.length >= 2 ? RR : leadRR).length - useRR.length > 0) warnings.push('Alcuni battiti non sono stati riconosciuti con certezza: verifica FC e regolarità sul tracciato.');
      const m = rrMed || useRR.reduce((a, b) => a + b, 0) / useRR.length;
      const pr = pInfo && pInfo.pPresenti ? pInfo.pr : null;
      rhythm = { rr: useRR, rrMean: m, hr: 60000 / m, rrVar: useRR.length >= 3 ? pctl(useRR, 0.9) - pctl(useRR, 0.1) : 0, pPresenti: pInfo ? pInfo.pPresenti : false, pr, pDur: pInfo && pInfo.pPresenti ? pInfo.pDur : null, lead: rhythmSources.map(s => s.name).join(' + ') };
    }
    const qrsAll = Object.values(leads).map(l => l.qrs).filter(v => v);
    const qtT = Object.keys(leads).filter(k => leads[k].qt && leads[k].T !== null && Math.abs(leads[k].T) >= 1.5).map(k => leads[k].qt);
    const qtAll = qtT.length >= 3 ? qtT : Object.values(leads).map(l => l.qt).filter(v => v);
    const glob = { qrs: qrsAll.length ? S.pct(qrsAll, 0.75) : null, qt: qtAll.length ? median(qtAll) : null, pr: rhythm ? rhythm.pr : null, p: rhythm ? rhythm.pDur : null };
    if (limLeads.length) warnings.push('Tracce sovrapposte alla riga vicina in ' + limLeads.join(', ') + ': ampiezza misurata fino al punto di contatto (di norma un valore minimo, «≥», da verificare). Trascina il punto dell\'apice sul tracciato o misura con lo strumento «Onda R».');
    if (rhythm && rhythm.hr > 120 && glob.qt) warnings.push('FC > 120/min: la P successiva può sovrapporsi alla fine della T e far sovrastimare il QT (fino a ~30 ms): verifica il QT manualmente.');
    // asse: minimi quadrati sulle 6 periferiche (sistema esassiale)
    const ANG = { I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90 };
    let sxx = 0, sxy = 0, syy = 0, bx = 0, by = 0, nl = 0;
    Object.keys(ANG).forEach(k => { const L = leads[k]; if (!L || L.R === null) return; const n = (L.R || 0) - (L.S || 0) - (L.Q || 0); const t = ANG[k] * Math.PI / 180, cx = Math.cos(t), cy = Math.sin(t); sxx += cx * cx; sxy += cx * cy; syy += cy * cy; bx += n * cx; by += n * cy; nl++; });
    if (nl >= 3) { const det = sxx * syy - sxy * sxy; if (Math.abs(det) > 1e-6) { const ax = (bx * syy - by * sxy) / det, ay = (by * sxx - bx * sxy) / det; if (Math.hypot(ax, ay) > 0.3) glob.asse = Math.round(Math.atan2(ay, ax) * 180 / Math.PI); } }

    // 9) indice di qualità
    const sh = sharpness(ch, dk.thr);
    const sharpN0 = sh.contrast > 0 ? sh.edge / sh.contrast * (7 / pxmm) : 0; // indipendente da risoluzione e contrasto
    // 1.3.0: nitidezza direzionale (foto mossa: bordi persi in una sola direzione)
    const sharpD = sh.contrast > 0 ? Math.min(sh.ex, sh.ey) / sh.contrast * (7 / pxmm) : 0;
    const sharpN = Math.min(sharpN0, sharpD);
    const mossa = sh.dir < 0.5 || sharpD < 0.22;
    const covs = Object.values(leads).map(l => l.cov).filter(v => v != null);
    const cov = covs.length ? median(covs) : 0;
    const Q = [];
    const add = (nome, val, punti, nota) => Q.push({ nome, val, punti, nota });
    add('Nitidezza', sharpN, mossa ? 0 : sharpN >= 0.30 ? 30 : sharpN >= 0.2 ? 18 : sharpN >= 0.14 ? 6 : 0, mossa ? 'foto mossa o sfocata' : sharpN >= 0.3 ? 'buona' : sharpN >= 0.2 ? 'accettabile' : 'foto mossa o sfocata');
    const pxO = pxmm / upK, digital = GRID !== 'rosa';
    if (digital) add('Risoluzione', pxO, pxO >= 4.5 ? 20 : pxO >= 3 ? 12 : pxO >= 2.5 ? 5 : 0, pxO.toFixed(1) + ' px/mm' + (upK > 1 ? ' (immagine ingrandita ×' + upK.toFixed(1).replace('.', ',') + ')' : '') + (pxO < 3 ? ' – screenshot troppo piccolo: ingrandisci prima di catturare' : ''));
    else add('Risoluzione', pxO, pxO >= 6 ? 20 : pxO >= 4.5 ? 12 : pxO >= 3.5 ? 5 : 0, pxO.toFixed(1) + ' px/mm' + (upK > 1 ? ' (immagine ingrandita ×' + upK.toFixed(1).replace('.', ',') + ')' : '') + (pxO < 4.5 ? ' (avvicinati)' : ''));
    add('Continuità della traccia', cov, cov >= 0.97 ? 20 : cov >= 0.9 ? 12 : cov >= 0.8 ? 5 : 0, Math.round(cov * 100) + '%');
    add('Righe del tracciato', rows.length, rows.length >= prof.righe ? 10 : 0, rows.length + '/' + prof.righe);
    add('Taratura', pulseMm, pulseMm == null ? 4 : Math.abs(pulseMm - gain) / gain < 0.06 ? 10 : Math.abs(pulseMm - gain) / gain < 0.12 ? 6 : 0, pulseMm == null ? 'impulso non trovato' : 'impulso ' + pulseMm.toFixed(1) + ' mm');
    add('Prospettiva', persp, persp == null ? 5 : persp < 3 ? 10 : persp < 6 ? 6 : 0, persp == null ? 'non valutabile' : persp.toFixed(1) + '% di differenza sx/dx' + (persp >= 6 ? ' (foto non frontale)' : ''));
    let score = Math.round(Q.reduce((a, q) => a + q.punti, 0));
    // derivazioni mancanti: la lettura non può essere "buona" anche se la foto è nitida
    if (rows.length < prof.righe) score = Math.min(score, 74);
    if (mossa) { score = Math.min(score, 40); warnings.unshift('Foto mossa o sfocata (bordi della traccia ' + (sh.dir < 0.5 ? 'trascinati in una direzione' : 'poco definiti') + '): le misure non sono affidabili.'); }
    const level = score >= 75 ? 'buona' : score >= 50 ? 'accettabile' : 'insufficiente';
    if (level === 'insufficiente') warnings.unshift('Qualità insufficiente: rifai la foto (foglio piatto, telefono parallelo, buona luce, niente movimento).');

    return {
      ok: Object.keys(leads).length > 0, source: 'foto', profile: prof.nome, quality: { score, level, items: Q },
      rotation: (quarter ? 90 : 0) + (flip ? 180 : 0), skew: th, shear: ph - th, pxPerMm: pxmm, ptPerMm: pxmm, persp,
      calMethod: (digital ? 'griglia ' + GRID + ' (immagine digitale/screenshot' + (pulseRight ? ', taratura a fine riga' : '') + ')' : 'griglia della foto') + ' – ' + pxO.toFixed(2) + ' px/mm' + (pulseMm ? ' + impulso ' + pulseMm.toFixed(1) + ' mm' : ''),
      digital, gridColor: GRID, upscale: upK,
      speed, gain, layout: profKey === 'auto' ? 'auto: ' + prof.nome : prof.nome, rows: rows.length,
      leads, rhythm, glob, overlay, warnings, machine: {}, textLines: [], rect, ms: Date.now() - t0,
      debug: opts.debug ? { dm: opts.debug === 2 ? dm : undefined, W: outW, H: outH, rows: rows.map(r => ({ y: r.y, th: r.th, pts: r.pts.filter((p, i) => i % 2 === 0) })), pulses: pulses.map(o => o.p), segs, dkThr: dk.thr, pulsesL, pulsesR, ori } : undefined
    };

    function fail(msg) { return { ok: false, source: 'foto', quality: { score: 0, level: 'insufficiente', items: [] }, warnings: [msg], leads: {}, overlay: [], machine: {}, textLines: [], glob: {}, rhythm: null, ms: Date.now() - t0 }; }
  }
  function coverage(cols, a, b) { let c = 0, n = 0; for (let x = Math.max(0, Math.round(a)); x <= Math.min(cols.length - 1, Math.round(b)); x++) { n++; if (cols[x]) c++; } return n ? c / n : 0; }
  function guessColumns(rows, pxmm) {
    // 3×4 + strisce: le prime 3 righe contengono 4 derivazioni (2,5 s); difficile da distinguere: preferisci 6×2
    return 2;
  }

  /* ---------------- interfaccia browser ---------------- */
  async function analyzeImageFile(file, opts) {
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Immagine non leggibile')); i.src = url; });
      const MAX = opts && opts.maxSide || 2600;
      const k = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
      const data = g.getImageData(0, 0, c.width, c.height);
      const res = analyzePhoto(data, opts);
      let out = c;
      if (res.rect) {
        out = document.createElement('canvas'); out.width = res.rect.width; out.height = res.rect.height;
        out.getContext('2d').putImageData(new ImageData(res.rect.data, res.rect.width, res.rect.height), 0, 0);
      }
      res.canvas = out; res.original = c; delete res.rect;
      return res;
    } finally { URL.revokeObjectURL(url); }
  }

  root.ECGPhoto = { analyzePhoto, analyzeImageFile, PROFILES, _t: { pulseFromMask, traceMask, channels, paperMask, darkThreshold } };
})(typeof window !== 'undefined' ? window : this);
