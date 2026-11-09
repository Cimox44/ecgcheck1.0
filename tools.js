/* =====================================================================
   ECGcheck — Calcolatori (asse, ST a 12 derivazioni, QTc) e utilità
   per l'inserimento manuale delle onde (conversione mm/mV, validazione).
   Funzioni pure (testabili in Node) + rendering delle schede.
   ===================================================================== */
(function (root) {
  'use strict';

  const LIMB = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];
  const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  // angoli del sistema esassiale (convenzione di Bailey: +90° = aVF, −90° verso l'alto)
  const ANG = { I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90 };
  // le derivazioni aumentate hanno guadagno √3/2 rispetto alle bipolari (triangolo di Einthoven)
  const GAIN_LEAD = { I: 1, II: 1, III: 1, aVR: Math.sqrt(3) / 2, aVL: Math.sqrt(3) / 2, aVF: Math.sqrt(3) / 2 };
  const CONTIG = [['I', 'aVL'], ['II', 'aVF'], ['III', 'aVF'], ['II', 'III'], ['V1', 'V2'], ['V2', 'V3'], ['V3', 'V4'], ['V4', 'V5'], ['V5', 'V6']];
  const TERR = [
    { id: 'inferiore', nome: 'inferiore', leads: ['II', 'III', 'aVF'], recip: ['I', 'aVL'] },
    { id: 'laterale', nome: 'laterale alta', leads: ['I', 'aVL'], recip: ['III', 'aVF'] },
    { id: 'anteriore', nome: 'anteriore / settale', leads: ['V1', 'V2', 'V3', 'V4'], recip: ['II', 'III', 'aVF'] },
    { id: 'apicale', nome: 'antero-laterale', leads: ['V4', 'V5', 'V6'], recip: ['III', 'aVR'] }
  ];

  function n(v) { if (v === '' || v === null || v === undefined || v === true || v === false) return null; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; }
  function f(x, d) { if (x == null || !Number.isFinite(x)) return '—'; const k = Math.pow(10, d || 0); return (Math.round(x * k) / k).toString().replace('.', ','); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function norm180(a) { let x = a; while (x > 180) x -= 360; while (x <= -180) x += 360; return x; }

  /* ---------------------------------------------------------------
     Conversioni di ampiezza. Il motore lavora in "mm standard" (10 mm/mV).
     mm sulla carta = mm standard × guadagno / 10.
     --------------------------------------------------------------- */
  const UNITS = {
    mm: { nome: 'mm (10 mm/mV)', toStd: (v) => v, fromStd: (v) => v, dec: 1 },
    mV: { nome: 'mV', toStd: (v) => v * 10, fromStd: (v) => v / 10, dec: 2 },
    carta: { nome: 'mm sulla carta', toStd: (v, g) => v * 10 / (g || 10), fromStd: (v, g) => v * (g || 10) / 10, dec: 1 }
  };
  function toStd(v, unit, gain) { const x = n(v); if (x === null) return null; return UNITS[unit || 'mm'].toStd(x, gain); }
  function fromStd(v, unit, gain) { const x = n(v); if (x === null) return null; return UNITS[unit || 'mm'].fromStd(x, gain); }

  /* ---------------------------------------------------------------
     Validazione delle onde (mm standard e ms)
     --------------------------------------------------------------- */
  const WAVES = [
    { k: 'p', nome: 'P', amp: [-3, 5], warn: (v, l) => (l === 'II' && v >= 2.5) ? 'P ≥ 2,5 mm in II (P polmonare)' : (v < 0 && ['I', 'II', 'aVF'].includes(l)) ? 'P negativa in ' + l + ' (ritmo non sinusale o inversione elettrodi?)' : null, dur: [30, 200], wd: v => v >= 120 ? 'P ≥ 120 ms (blocco interatriale / ingrandimento atriale sx)' : null },
    { k: 'q', nome: 'Q', amp: [0, 25], abs: true, warn: () => null, dur: [0, 120], wd: v => v >= 40 ? 'Q ≥ 40 ms (patologica)' : v >= 30 ? 'Q ≥ 30 ms: patologica se ≥ 1 mm in 2 contigue (UDMI)' : null },
    { k: 'r', nome: 'R', amp: [0, 45], abs: true, warn: (v, l) => (l === 'aVL' && v >= 11) ? 'R in aVL ≥ 11 mm (IVS)' : v >= 25 && /^V[56]$/.test(l) ? 'R ≥ 25 mm in ' + l + ' (IVS)' : null, dur: [5, 160], wd: () => null },
    { k: 's', nome: 'S', amp: [0, 45], abs: true, warn: () => null, dur: [5, 160], wd: () => null },
    { k: 't', nome: 'T', amp: [-20, 25], warn: (v, l) => v >= 10 && /^V[2-4]$/.test(l) ? 'T molto ampia: iperacuta / iperkaliemia?' : null, dur: [60, 400], wd: () => null },
    { k: 'st', nome: 'ST (J)', amp: [-12, 15], warn: () => null },
    { k: 'st60', nome: 'ST (J+60)', amp: [-12, 15], warn: () => null }
  ];
  function validate(k, v, lead, isDur) {
    const w = WAVES.find(x => x.k === k); const x = n(v);
    if (!w || x === null) return null;
    if (isDur) {
      if (!w.dur) return null;
      if (x < 0) return { lv: 'err', msg: w.nome + ' ' + lead + ': durata negativa' };
      if (x < w.dur[0] || x > w.dur[1]) return { lv: 'err', msg: w.nome + ' ' + lead + ': ' + x + ' ms fuori dal range plausibile (' + w.dur[0] + '–' + w.dur[1] + ' ms)' };
      const m = w.wd(x, lead); return m ? { lv: 'warn', msg: w.nome + ' ' + lead + ': ' + m } : null;
    }
    if (w.abs && x < 0) return { lv: 'err', msg: w.nome + ' ' + lead + ': inserisci il valore assoluto (senza segno)' };
    if (x < w.amp[0] || x > w.amp[1]) return { lv: 'err', msg: w.nome + ' ' + lead + ': ' + f(x, 1) + ' mm fuori dal range plausibile (' + w.amp[0] + '/' + w.amp[1] + ' mm)' };
    const m = w.warn(x, lead); return m ? { lv: 'warn', msg: w.nome + ' ' + lead + ': ' + m } : null;
  }

  /* ---------------------------------------------------------------
     ASSE: QRS netto = R − Q − S (mm)
     --------------------------------------------------------------- */
  function netQRS(d, l) {
    const L = (d.leads && d.leads[l]) || {};
    const r = n(L.r), s = n(L.s), q = n(L.q);
    if (r === null && s === null) return null;
    return (r || 0) - Math.abs(q || 0) - Math.abs(s || 0);
  }
  function axis(nets) {
    // nets: {I: x, II: y, ...} (null = mancante)
    const res = { ls: null, iavf: null, iso: null, n: 0, resid: null };
    let sxx = 0, sxy = 0, syy = 0, bx = 0, by = 0, cnt = 0;
    LIMB.forEach(l => {
      const v = n(nets[l]); if (v === null) return;
      const t = ANG[l] * Math.PI / 180, k = GAIN_LEAD[l], cx = k * Math.cos(t), cy = k * Math.sin(t);
      sxx += cx * cx; sxy += cx * cy; syy += cy * cy; bx += v * cx; by += v * cy; cnt++;
    });
    res.n = cnt;
    if (cnt >= 2) {
      const det = sxx * syy - sxy * sxy;
      if (Math.abs(det) > 1e-9) {
        const ax = (bx * syy - by * sxy) / det, ay = (by * sxx - bx * sxy) / det;
        if (Math.hypot(ax, ay) > 0.05) {
          res.ls = Math.round(Math.atan2(ay, ax) * 180 / Math.PI); res.mag = Math.hypot(ax, ay);
          // coerenza: scarto medio tra QRS netti misurati e previsti
          let e = 0; LIMB.forEach(l => { const v = n(nets[l]); if (v === null) return; const t = ANG[l] * Math.PI / 180, k = GAIN_LEAD[l]; e += Math.abs(v - k * (ax * Math.cos(t) + ay * Math.sin(t))); });
          res.resid = e / cnt;
        }
      }
    }
    const nI = n(nets.I), nF = n(nets.aVF);
    if (nI !== null && nF !== null && (nI !== 0 || nF !== 0)) res.iavf = Math.round(Math.atan2(2 * nF, Math.sqrt(3) * nI) * 180 / Math.PI);
    // derivazione isodifasica (QRS netto più vicino a 0): asse perpendicolare, verso scelto dalle altre
    const avail = LIMB.filter(l => n(nets[l]) !== null);
    if (avail.length >= 3) {
      const iso = avail.reduce((b, l) => Math.abs(n(nets[l])) / GAIN_LEAD[l] < Math.abs(n(nets[b])) / GAIN_LEAD[b] ? l : b);
      const c1 = norm180(ANG[iso] + 90), c2 = norm180(ANG[iso] - 90);
      const score = c => avail.reduce((s, l) => s + n(nets[l]) * Math.cos((c - ANG[l]) * Math.PI / 180), 0);
      res.iso = { lead: iso, axis: score(c1) >= score(c2) ? c1 : c2 };
    }
    return res;
  }
  function classifyAxis(a) {
    if (a == null || !Number.isFinite(a)) return null;
    a = norm180(a);
    if (a >= -30 && a <= 90) return { id: 'normale', nome: 'Asse normale (−30° / +90°)', lv: 'normale' };
    if (a < -30 && a >= -90) return { id: 'sx', nome: a < -45 ? 'Deviazione assiale sinistra marcata (−45° / −90°): considerare EAS' : 'Deviazione assiale sinistra moderata (−30° / −45°)', lv: 'alto' };
    if (a > 90 && a <= 180) return { id: 'dx', nome: a > 120 ? 'Deviazione assiale destra marcata (+120° / +180°)' : 'Deviazione assiale destra moderata (+90° / +120°)', lv: 'alto' };
    return { id: 'estremo', nome: 'Asse estremo "nord-ovest" (−90° / ±180°): TV? inversione degli elettrodi?', lv: 'critico' };
  }

  /* ---------------------------------------------------------------
     ST: tabella delle 12 derivazioni (UDMI IV/V, Armstrong, Ginzberg)
     --------------------------------------------------------------- */
  function sogliaSTE(l, sesso, eta) {
    if (l === 'V2' || l === 'V3') { if (sesso === 'F') return 1.5; if (eta !== null && eta !== undefined && eta < 40) return 2.5; return 2.0; }
    if (l === 'V4R' || l === 'V3R') return (sesso === 'M' && eta !== null && eta !== undefined && eta < 30) ? 1.0 : 0.5;
    if (l === 'V7-V9') return (sesso === 'M' && eta !== null && eta !== undefined && eta < 40) ? 1.0 : 0.5;
    return 1.0;
  }
  function stTable(d) {
    const sex = (d.paziente || {}).sesso || '', age = n((d.paziente || {}).eta);
    const rows = LEADS.map(l => {
      const L = (d.leads && d.leads[l]) || {};
      const st = n(L.st), st60 = n(L.st60 != null && L.st60 !== '' ? L.st60 : (l === 'V3' ? (d.extra || {}).ste60V3 : null)), t = n(L.t), s = n(L.s), r = n(L.r);
      const thr = sogliaSTE(l, sex, age);
      const ste = st !== null && l !== 'aVR' && st >= thr;
      const steAVR = l === 'aVR' && st !== null && st >= 1;
      const std = st !== null && st <= -0.5;
      const stT = st !== null && t ? st / t : null;
      const stS = (st !== null && st > 0 && s) ? st / s : null;
      return { l, st, st60, t, s, r, thr, ste, steAVR, std, stT, stS, armstrong: /^V[1-3]$/.test(l) && stS !== null && stS >= 0.25 };
    });
    const by = {}; rows.forEach(r => { by[r.l] = r; });
    const steL = rows.filter(r => r.ste).map(r => r.l), stdL = rows.filter(r => r.std).map(r => r.l);
    const contig = CONTIG.filter(p => by[p[0]].ste && by[p[1]].ste);
    const contigLeads = Array.from(new Set([].concat.apply([], contig)));
    const terr = TERR.map(T => {
      const hit = T.leads.filter(l => contigLeads.includes(l));
      if (hit.length < 2) return null;
      return { nome: T.nome, leads: hit, recip: T.recip.filter(l => by[l].std) };
    }).filter(Boolean);
    const extra = [];
    const v4r = n((d.extra || {}).stV4R), post = n((d.extra || {}).stPost);
    if (v4r !== null) extra.push({ l: 'V4R', st: v4r, thr: sogliaSTE('V4R', sex, age), ste: v4r >= sogliaSTE('V4R', sex, age) });
    if (post !== null) extra.push({ l: 'V7–V9', st: post, thr: sogliaSTE('V7-V9', sex, age), ste: post >= sogliaSTE('V7-V9', sex, age) });
    // Meyers: STD massimo in V1–V4 (OMI posteriore)
    const prec = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'].map(l => by[l]).filter(r => r.st !== null);
    let meyers = null;
    if (prec.length >= 4) {
      const mn = prec.reduce((a, b) => b.st < a.st ? b : a);
      if (mn.st <= -1 && ['V1', 'V2', 'V3', 'V4'].includes(mn.l)) meyers = mn.l + ' (' + f(mn.st, 1) + ' mm)';
    }
    const n12 = rows.filter(r => r.st !== null).length;
    return { rows, by, steL, stdL, contig, contigLeads, terr, extra, meyers, n: n12, sex, age, avr: by.aVR.steAVR && stdL.length >= 6 };
  }

  /* ---------------------------------------------------------------
     QTc
     --------------------------------------------------------------- */
  function qtc(o) {
    const qt = n(o.qt); let rr = n(o.rr); const hr0 = n(o.fc); const qrs = n(o.qrs);
    if (!rr && hr0) rr = 60000 / hr0;
    const hr = rr ? 60000 / rr : null;
    const out = { qt, rr, hr, qrs, sesso: o.sesso || '' };
    if (!qt || !rr) return out;
    const s = rr / 1000;
    out.bazett = qt / Math.sqrt(s);
    out.fridericia = qt / Math.cbrt(s);
    out.framingham = qt + 154 * (1 - s);
    out.hodges = qt + 1.75 * (hr - 60);
    if (qrs && qrs >= 120) { out.qtm = qt - 0.5 * qrs; out.qtmc = out.qtm + 154 * (1 - s); out.jt = qt - qrs; }
    out.ref = out.qtmc != null ? out.qtmc : out.framingham;
    const lim = o.sesso === 'F' ? 460 : o.sesso === 'M' ? 450 : 450;
    const av = [];
    const qref = out.ref;
    if (qref >= 500) av.push({ lv: 'critico', t: 'QTc ≥ 500 ms: alto rischio di torsione di punta. Sospendere i farmaci che allungano il QT, correggere K⁺ (≥ 4 mmol/L) e Mg²⁺, monitoraggio.' });
    else if (qref >= 480) av.push({ lv: 'alto', t: 'QTc ≥ 480 ms: compatibile con sindrome del QT lungo (ESC 2022) in assenza di cause secondarie.' });
    else if (qref >= lim) av.push({ lv: 'moderato', t: 'QTc prolungato (≥ ' + lim + ' ms ' + (o.sesso === 'F' ? 'nella donna' : o.sesso === 'M' ? 'nell\'uomo' : '– sesso non indicato, soglia maschile') + ', AHA/ACCF/HRS 2009).' });
    if (qref <= 340) av.push({ lv: 'alto', t: 'QTc ≤ 340 ms: QT corto; ≤ 360 ms con storia di arresto/familiarità = sindrome del QT corto (ESC 2022).' });
    else if (qref <= 360) av.push({ lv: 'moderato', t: 'QTc ≤ 360 ms: QT corto (sindrome solo con anamnesi/familiarità positiva, ESC 2022).' });
    const base = n(o.qtcBase);
    if (base && qref - base >= 60) av.push({ lv: 'alto', t: 'Aumento del QTc ≥ 60 ms rispetto al basale (' + f(base) + ' ms): rischio aritmico da farmaci.' });
    if (hr < 60 || hr > 90) av.push({ lv: 'info', t: 'FC ' + f(hr) + '/min: fuori 60–90/min Bazett ' + (hr > 90 ? 'sovrastima' : 'sottostima') + ' il QTc; usare Fridericia o Framingham.' });
    if (o.fa) av.push({ lv: 'info', t: 'Ritmo irregolare / FA: misurare QT e RR precedente su più battiti (≥ 5–10) e fare la media dei QTc (sezione «più battiti»).' });
    if (qrs && qrs >= 120) av.push({ lv: 'info', t: 'QRS ≥ 120 ms: il QT include la depolarizzazione allungata; usare il QT modificato (Bogossian: QT − 50% QRS) o il JT.' });
    out.avvisi = av; out.lim = lim;
    return out;
  }
  function qtcMulti(text) {
    // righe "QT RR" o "QT;RR" (ms)
    const beats = String(text || '').split(/\n+/).map(r => r.trim()).filter(Boolean).map(r => r.split(/[\s;,/]+/).map(n)).filter(p => p.length >= 2 && p[0] && p[1]);
    if (!beats.length) return null;
    const one = beats.map(([q, r]) => ({ qt: q, rr: r, baz: q / Math.sqrt(r / 1000), fri: q / Math.cbrt(r / 1000), fra: q + 154 * (1 - r / 1000) }));
    const m = k => one.reduce((a, b) => a + b[k], 0) / one.length;
    return { n: one.length, qt: m('qt'), rr: m('rr'), bazett: m('baz'), fridericia: m('fri'), framingham: m('fra') };
  }

  /* ---------------------------------------------------------------
     RENDERING (browser)
     --------------------------------------------------------------- */
  function inp(p, val, ph, cls) { return '<input inputmode="decimal" data-num="1" data-p="' + p + '" value="' + esc(val == null ? '' : val) + '"' + (ph != null ? ' placeholder="' + esc(ph) + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '>'; }
  function get(o, path) { return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }

  function hexSVG(a, lsA, isoLead) {
    const W = 230, c = W / 2, R = 92;
    const pt = (deg, r) => [c + r * Math.cos(deg * Math.PI / 180), c + r * Math.sin(deg * Math.PI / 180)];
    let s = '<svg viewBox="0 0 ' + W + ' ' + W + '" class="hexsvg" role="img" aria-label="Sistema esassiale">';
    // settori
    const arc = (a0, a1, col) => { const p0 = pt(a0, R), p1 = pt(a1, R); const large = (a1 - a0) > 180 ? 1 : 0; return '<path d="M' + c + ',' + c + ' L' + p0[0] + ',' + p0[1] + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + p1[0] + ',' + p1[1] + ' Z" fill="' + col + '"/>'; };
    s += arc(-30, 90, 'rgba(48,164,108,.16)') + arc(90, 180, 'rgba(247,107,21,.12)') + arc(-90, -30, 'rgba(247,107,21,.12)') + arc(-180, -90, 'rgba(229,72,77,.13)');
    s += '<circle cx="' + c + '" cy="' + c + '" r="' + R + '" fill="none" stroke="currentColor" stroke-opacity=".35"/>';
    Object.keys(ANG).forEach(l => {
      const p = pt(ANG[l], R), q = pt(ANG[l] + 180, R), t = pt(ANG[l], R + 13);
      s += '<line x1="' + q[0] + '" y1="' + q[1] + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="currentColor" stroke-opacity="' + (l === isoLead ? '.9' : '.3') + '" stroke-dasharray="' + (l === isoLead ? '0' : '3 3') + '"/>';
      s += '<text x="' + t[0] + '" y="' + (t[1] + 4) + '" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">' + l + '</text>';
    });
    [0, 90, 180, -90].forEach(dg => { const t = pt(dg, R - 12); s += '<text x="' + t[0] + '" y="' + (t[1] + 3) + '" text-anchor="middle" font-size="8.5" fill="currentColor" fill-opacity=".6">' + (dg > 0 ? '+' : '') + dg + '°</text>'; });
    if (lsA != null && lsA !== a) { const p = pt(lsA, R * 0.8); s += '<line x1="' + c + '" y1="' + c + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="#8b93a7" stroke-width="2" stroke-dasharray="4 3"/>'; }
    if (a != null) {
      const p = pt(a, R * 0.86), h1 = pt(a + 160, 10), h2 = pt(a - 160, 10);
      s += '<line x1="' + c + '" y1="' + c + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="#e5484d" stroke-width="3.5" stroke-linecap="round"/>';
      s += '<polygon points="' + p[0] + ',' + p[1] + ' ' + (p[0] + h1[0] - c) + ',' + (p[1] + h1[1] - c) + ' ' + (p[0] + h2[0] - c) + ',' + (p[1] + h2[1] - c) + '" fill="#e5484d"/>';
    }
    return s + '</svg>';
  }

  function renderAxis(el, d, H) {
    const a = d.asseCalc || {};
    let h = '<div class="card" id="axisCard"><h3>🧭 Asse cardiaco (QRS)</h3><p class="hint">QRS netto = R − Q − S (mm) nelle 6 periferiche. I valori grigi vengono dalla scheda Derivazioni: puoi sovrascriverli qui (vale solo per il calcolo dell\'asse).</p>';
    h += '<div class="axis-grid">' + LIMB.map(l => '<label class="field mini"><span>' + l + '</span>' + inp('asseCalc.' + l, a[l], f(netQRS(d, l), 1) === '—' ? '' : f(netQRS(d, l), 1)) + '</label>').join('') + '</div>';
    h += '<div class="axis-out" id="axisOut"></div>';
    h += '<div class="grid2"><label class="field"><span>Asse del referto (sovrascrivi)</span>' + inp('asse.gradi', (d.asse || {}).gradi, 'calcolato') + '<small>Se compilato prevale sul calcolo automatico in tutto il referto.</small></label></div>';
    h += '<div class="actions"><button class="btn sm primary" id="axisUse">Usa l\'asse calcolato nel referto</button><button class="btn sm" id="axisClear">Azzera le sovrascritture</button></div>';
    h += '<p class="ref">Metodo esassiale ai minimi quadrati (6 derivazioni, guadagno √3/2 per le aumentate); metodo I/aVF; derivazione isodifasica. Classi: AHA/ACCF/HRS 2009 (Surawicz).</p></div>';
    el.innerHTML = h;
    const upd = () => {
      const nets = {}; LIMB.forEach(l => { const o = n((d.asseCalc || {})[l]); nets[l] = o !== null ? o : netQRS(d, l); });
      const r = axis(nets); const best = r.ls != null ? r.ls : r.iavf != null ? r.iavf : r.iso ? r.iso.axis : null;
      const ov = n((d.asse || {}).gradi); const shown = ov !== null ? ov : best;
      const cl = classifyAxis(shown);
      let o = '<div class="axis-flex"><div>' + hexSVG(shown, ov !== null ? best : null, r.iso && r.iso.lead) + '</div><div class="axis-res">';
      o += '<div class="big">' + (shown != null ? (shown > 0 ? '+' : '') + f(shown) + '°' : '—') + (ov !== null ? ' <small>(manuale)</small>' : '') + '</div>';
      if (cl) o += '<div class="fnd"><i class="dot ' + cl.lv + '"></i><div>' + esc(cl.nome) + '</div></div>';
      o += '<table class="meas"><tr><td>Minimi quadrati (' + r.n + ' deriv.)</td><td>' + (r.ls != null ? f(r.ls) + '°' : '—') + '</td></tr><tr><td>Metodo I / aVF</td><td>' + (r.iavf != null ? f(r.iavf) + '°' : '—') + '</td></tr><tr><td>Isodifasica</td><td>' + (r.iso ? r.iso.lead + ' → ' + f(r.iso.axis) + '°' : '—') + '</td></tr>' + (r.resid != null ? '<tr><td>Coerenza delle misure</td><td>' + (r.resid <= 1.5 ? 'buona' : r.resid <= 3 ? 'discreta' : 'scarsa (controlla segni e derivazioni)') + ' (scarto ' + f(r.resid, 1) + ' mm)</td></tr>' : '') + '</table>';
      if (r.ls != null && r.iavf != null && Math.abs(norm180(r.ls - r.iavf)) > 30) o += '<p class="hint warn">I metodi differiscono di > 30°: verifica le ampiezze (possibile inversione degli elettrodi o misure errate).</p>';
      o += '</div></div>';
      $q('#axisOut').innerHTML = o;
      H.lastAxis = best;
    };
    function $q(s) { return el.querySelector(s); }
    upd();
    el.oninput = () => setTimeout(upd, 0);
    $q('#axisUse').onclick = () => { if (H.lastAxis == null) return H.toast('Inserisci almeno 3 derivazioni periferiche'); H.setField('asse.gradi', String(H.lastAxis)); upd(); H.toast('Asse ' + H.lastAxis + '° applicato al referto'); };
    $q('#axisClear').onclick = () => { d.asseCalc = {}; H.setField('asse.gradi', ''); renderAxis(el, d, H); };
  }

  function renderST(el, d, H) {
    const T0 = stTable(d);
    let h = '<div class="card" id="stCard"><h3>📐 Tratto ST – 12 derivazioni</h3><p class="hint">ST misurato al punto J e 60 ms dopo (J+60) rispetto alla linea PR/TP, in mm (10 mm/mV; + sopra, − sotto). Soglie di STE secondo sesso ed età (IV/V Definizione Universale): V2–V3 ≥ 2 mm uomo ≥ 40 a, ≥ 2,5 mm uomo < 40 a, ≥ 1,5 mm donna; altre derivazioni ≥ 1 mm. STD significativo ≤ −0,5 mm.</p>';
    h += '<div class="lead-table-wrap"><table class="lead-table st-table"><thead><tr><th></th><th>J</th><th>J+60</th><th>Soglia</th><th>T</th><th>ST/T</th><th>STE/S</th></tr></thead><tbody>';
    T0.rows.forEach((r, i) => {
      h += '<tr' + (i === 6 ? ' class="sep"' : '') + ' data-row="' + r.l + '"><td class="ln">' + r.l + '</td><td>' + inp('leads.' + r.l + '.st', get(d, 'leads.' + r.l + '.st')) + '</td><td>' + inp('leads.' + r.l + '.st60', get(d, 'leads.' + r.l + '.st60'), r.l === 'V3' && n((d.extra || {}).ste60V3) !== null ? f(n(d.extra.ste60V3), 1) : null) + '</td><td class="thr" data-thr="' + r.l + '"></td><td>' + inp('leads.' + r.l + '.t', get(d, 'leads.' + r.l + '.t')) + '</td><td data-stt="' + r.l + '"></td><td data-sts="' + r.l + '"></td></tr>';
    });
    h += '</tbody></table></div><div class="actions"><button class="btn sm" id="stSign">± cambia segno del campo selezionato</button></div>';
    h += '<div class="grid2">' + '<label class="field"><span>ST in V4R</span>' + inp('extra.stV4R', (d.extra || {}).stV4R) + '<small>IMA del VD: ≥ 0,5 mm (≥ 1 mm uomo < 30 a)</small></label><label class="field"><span>ST massimo V7–V9</span>' + inp('extra.stPost', (d.extra || {}).stPost) + '<small>IMA posteriore: ≥ 0,5 mm (≥ 1 mm uomo < 40 a)</small></label></div>';
    h += '<div id="stOut"></div><p class="ref">Thygesen 2018 (IV UDMI) / V UDMI 2026; Armstrong 2012 (IVS); Ginzberg 1983 (ST/T in V6); Meyers 2021 (STDmax V1–V4); Kontos 2022 (STEMI-equivalenti).</p></div>';
    el.innerHTML = h;
    let lastFocus = null;
    el.addEventListener('focusin', e => { if (e.target.matches('input[data-p]')) lastFocus = e.target; });
    el.querySelector('#stSign').onclick = () => { if (!lastFocus) return H.toast('Tocca prima un campo'); const v = n(lastFocus.value); if (v === null) return; lastFocus.value = String(-v); lastFocus.dispatchEvent(new Event('input', { bubbles: true })); lastFocus.focus(); };
    const upd = () => {
      const T = stTable(d);
      T.rows.forEach(r => {
        const tr = el.querySelector('tr[data-row="' + r.l + '"]'); if (!tr) return;
        tr.classList.toggle('ste', r.ste || r.steAVR); tr.classList.toggle('std', r.std); tr.classList.toggle('contig', T.contigLeads.includes(r.l));
        el.querySelector('[data-thr="' + r.l + '"]').textContent = r.l === 'aVR' ? '≥ 1' : '≥ ' + f(r.thr, 1);
        el.querySelector('[data-stt="' + r.l + '"]').textContent = r.stT != null ? f(r.stT, 2) : '';
        const sc = el.querySelector('[data-sts="' + r.l + '"]'); sc.textContent = r.stS != null ? Math.round(r.stS * 100) + '%' : ''; sc.className = r.armstrong ? 'hl' : '';
      });
      let o = '<div class="st-sum">';
      const sexTxt = T.sex === 'F' ? 'donna' : T.sex === 'M' ? 'uomo' + (T.age != null ? ' ' + T.age + ' a' : ' (età non indicata: soglia ≥ 40 a)') : 'sesso non indicato (soglia maschile)';
      o += '<p class="hint">Soglie per: <b>' + esc(sexTxt) + '</b> · derivazioni con ST: ' + T.n + '/12</p>';
      if (T.terr.length) T.terr.forEach(t => { o += '<div class="fnd"><i class="dot critico"></i><div><b>STE ' + esc(t.nome) + ' in derivazioni contigue: ' + t.leads.join(', ') + '</b>' + (t.recip.length ? '<br>Sottoslivellamento reciproco in ' + t.recip.join(', ') + ' (aumenta la specificità per OMI)' : '<br>Nessun reciproco: considerare anche pericardite / ripolarizzazione precoce') + '</div></div>'; });
      else if (T.steL.length) o += '<div class="fnd"><i class="dot moderato"></i><div>STE oltre soglia in ' + T.steL.join(', ') + ' ma non in 2 derivazioni contigue.</div></div>';
      else if (T.n) o += '<div class="fnd"><i class="dot normale"></i><div>Nessun STE oltre soglia in 2 derivazioni contigue.</div></div>';
      if (T.stdL.length) o += '<div class="fnd"><i class="dot alto"></i><div>STD ≥ 0,5 mm in ' + T.stdL.join(', ') + (T.stdL.length >= 2 ? '' : '') + '.</div></div>';
      if (T.meyers) o += '<div class="fnd"><i class="dot critico"></i><div><b>STD massimo in ' + T.meyers + '</b>: specifico per OMI posteriore (Meyers 2021) → registra V7–V9.</div></div>';
      if (T.avr) o += '<div class="fnd"><i class="dot alto"></i><div>STE in aVR con STD diffuso (≥ 6 derivazioni): ischemia subendocardica diffusa (tronco comune / 3 vasi) – NSTEMI ad alto rischio.</div></div>';
      T.extra.forEach(x => { if (x.ste) o += '<div class="fnd"><i class="dot critico"></i><div>STE in ' + x.l + ' ' + f(x.st, 1) + ' mm ≥ ' + f(x.thr, 1) + ' mm (' + (x.l === 'V4R' ? 'IMA del ventricolo destro' : 'IMA posteriore') + ').</div></div>'; });
      if (T.rows.some(r => r.armstrong)) o += '<div class="fnd"><i class="dot alto"></i><div>STE/S ≥ 25% in ' + T.rows.filter(r => r.armstrong).map(r => r.l).join(', ') + ': in presenza di IVS lo STE è sproporzionato (Armstrong 2012).</div></div>';
      const v6 = T.by.V6; if (v6.stT != null && v6.st > 0 && v6.t > 0) o += '<p class="hint">ST/T in V6 = ' + f(v6.stT, 2) + (v6.stT >= 0.25 ? ' (≥ 0,25: favorisce pericardite rispetto a ripolarizzazione precoce)' : ' (< 0,25: favorisce ripolarizzazione precoce)') + '.</p>';
      el.querySelector('#stOut').innerHTML = o + '</div>';
    };
    upd();
    el.addEventListener('input', () => setTimeout(upd, 0));
    void T0;
  }

  function renderQTc(el, d, H) {
    const q = d.qtcCalc || {};
    let h = '<div class="card" id="qtcCard"><h3>⏱ QTc</h3><p class="hint">QT dall\'inizio del QRS alla fine della T (metodo della tangente), nella derivazione con il QT più lungo (di solito II o V2–V3). RR del ciclo precedente. I campi QT, QRS, RR e FC sono gli stessi delle schede Ritmo/ECG.</p>';
    h += '<div class="grid2"><label class="field"><span>QT</span>' + inp('intervalli.qt', (d.intervalli || {}).qt) + '<small>ms</small></label><label class="field"><span>RR</span>' + inp('ritmo.rr', (d.ritmo || {}).rr) + '<small>ms (oppure FC)</small></label><label class="field"><span>FC</span>' + inp('ritmo.fc', (d.ritmo || {}).fc) + '<small>/min</small></label><label class="field"><span>QRS</span>' + inp('intervalli.qrs', (d.intervalli || {}).qrs) + '<small>ms (≥ 120 → QT modificato)</small></label>' +
      '<label class="field"><span>Sesso</span><select data-p="paziente.sesso"><option value="">—</option><option value="M"' + ((d.paziente || {}).sesso === 'M' ? ' selected' : '') + '>Maschio</option><option value="F"' + ((d.paziente || {}).sesso === 'F' ? ' selected' : '') + '>Femmina</option></select></label><label class="field"><span>QTc basale (facoltativo)</span>' + inp('qtcCalc.base', q.base) + '<small>ms, per il Δ da farmaci</small></label></div>';
    h += '<details><summary class="hint">Più battiti (FA, ritmo irregolare): una riga per battito «QT RR»</summary><textarea data-p="qtcCalc.multi" rows="4" placeholder="380 820&#10;360 640&#10;395 900">' + esc(q.multi || '') + '</textarea></details>';
    h += '<div id="qtcOut"></div><p class="ref">Bazett 1920; Fridericia 1920; Sagie (Framingham) 1992; Hodges 1983; Bogossian 2014 (QRS largo); Rautaharju AHA/ACCF/HRS 2009 Part IV; ESC 2022 VA (LQTS ≥ 480 ms, SQTS ≤ 360 ms).</p></div>';
    el.innerHTML = h;
    const upd = () => {
      const fa = /fibrill|irregol/.test(((d.ritmo || {}).ondeP || '') + ((d.ritmo || {}).regolarita || ''));
      const r = qtc({ qt: (d.intervalli || {}).qt, rr: (d.ritmo || {}).rr, fc: (d.ritmo || {}).fc, qrs: (d.intervalli || {}).qrs, sesso: (d.paziente || {}).sesso, qtcBase: (d.qtcCalc || {}).base, fa });
      const mb = qtcMulti((d.qtcCalc || {}).multi);
      let o = '';
      if (!r.qt || !r.rr) o = '<p class="hint">Inserisci QT e RR (o FC).</p>';
      else {
        const cls = v => v >= 500 ? 'crit' : v >= r.lim ? 'alto' : v <= 360 ? 'alto' : 'ok';
        const row = (nm, v, note) => '<tr><td>' + nm + '</td><td class="q-' + cls(v) + '"><b>' + f(v) + ' ms</b></td><td class="hint">' + (note || '') + '</td></tr>';
        o += '<table class="meas qtc">' + row('Framingham (riferimento del motore)', r.framingham, 'QT + 154·(1 − RR)') + row('Fridericia', r.fridericia, 'QT / ∛RR') + row('Bazett', r.bazett, 'QT / √RR' + (r.hr < 60 || r.hr > 90 ? ' ⚠ FC fuori 60–90' : '')) + row('Hodges', r.hodges, 'QT + 1,75·(FC − 60)') +
          (r.qtmc != null ? row('QT modificato (Bogossian) corretto', r.qtmc, 'QTm = QT − 50% QRS = ' + f(r.qtm) + ' ms; JT = ' + f(r.jt) + ' ms') : '') + '</table>';
        o += '<p class="hint">FC ' + f(r.hr) + '/min · RR ' + f(r.rr) + ' ms · soglia di QTc lungo ' + r.lim + ' ms.</p>';
        r.avvisi.forEach(a => { o += '<div class="fnd"><i class="dot ' + a.lv + '"></i><div>' + esc(a.t) + '</div></div>'; });
      }
      if (mb) o += '<h4>Media su ' + mb.n + ' battiti</h4><table class="meas"><tr><td>QT / RR medi</td><td>' + f(mb.qt) + ' / ' + f(mb.rr) + ' ms</td></tr><tr><td>QTc Framingham / Fridericia / Bazett medi</td><td><b>' + f(mb.framingham) + '</b> / ' + f(mb.fridericia) + ' / ' + f(mb.bazett) + ' ms</td></tr></table><div class="actions"><button class="btn sm" id="qtcUseMean">Usa QT e RR medi</button></div>';
      el.querySelector('#qtcOut').innerHTML = o;
      const um = el.querySelector('#qtcUseMean'); if (um) um.onclick = () => { H.setField('intervalli.qt', String(Math.round(mb.qt))); H.setField('ritmo.rr', String(Math.round(mb.rr))); H.setField('ritmo.fc', String(Math.round(60000 / mb.rr))); upd(); };
    };
    upd();
    el.addEventListener('input', () => setTimeout(upd, 0));
    el.addEventListener('change', () => setTimeout(upd, 0));
  }

  const API = { LIMB, LEADS, ANG, UNITS, WAVES, toStd, fromStd, validate, netQRS, axis, classifyAxis, sogliaSTE, stTable, qtc, qtcMulti, renderAxis, renderST, renderQTc, hexSVG };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ECGTools = API;
})(typeof window !== 'undefined' ? window : this);
