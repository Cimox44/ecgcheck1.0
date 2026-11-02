/* =====================================================================
   ECGcheck — interfaccia, visualizzatore/calibro, archivio, PDF
   ===================================================================== */
(function () {
  'use strict';
  const C = window.ECGCriteria;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const LS_CASE = 'ecgcheck.case.v1';
  const LS_NOTIF = 'ecgcheck.notif.last';

  function blank() {
    return {
      id: null, creato: null,
      paziente: {}, contesto: {}, tecnica: { velocita: '25', guadagno: '10', profilo: 'auto' },
      ritmo: {}, intervalli: {}, asse: {}, atri: {}, morfologia: {}, leads: {}, extra: {}, pattern: {}, tcl: {},
      fevs: '', note: '', operatore: '', cal: null
    };
  }

  const state = {
    data: blank(),
    img: null,            // canvas con l'immagine (già ruotata)
    imgUrl: null,         // dataURL JPEG per archivio/PDF
    v: { s: 1, tx: 0, ty: 0 },
    enh: false,
    mode: 'pan',
    calPts: [], misPts: [], rMarks: [], pMarks: [],
    overlay: [], auto: null, pdfBuf: null,
    result: null
  };

  /* ---------------- util ---------------- */
  function get(o, path) { return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
  function set(o, path, val) {
    const ks = path.split('.'); let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = val;
  }
  function num(v) { if (v === '' || v == null) return null; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; }
  function fmt(x, d) { if (x == null || !Number.isFinite(x)) return '—'; const k = Math.pow(10, d || 0); return (Math.round(x * k) / k).toString().replace('.', ','); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(msg, ms) {
    const t = $('#msgToast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms || 2600);
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Impossibile caricare ' + src)); document.head.appendChild(s);
    });
  }
  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function itDate(iso) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function nowStr() { return new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); }

  /* ---------------- IndexedDB ---------------- */
  const DB = {
    db: null,
    open() {
      return new Promise((res) => {
        try {
          const r = indexedDB.open('ecgcheck', 1);
          r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('cases', { keyPath: 'id' }); db.createObjectStore('kv'); };
          r.onsuccess = () => { DB.db = r.result; res(true); };
          r.onerror = () => res(false);
        } catch (e) { res(false); }
      });
    },
    tx(store, mode, fn) {
      return new Promise((res, rej) => {
        if (!DB.db) return rej(new Error('DB non disponibile'));
        const t = DB.db.transaction(store, mode); const st = t.objectStore(store); const rq = fn(st);
        t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error);
      });
    },
    put(store, val, key) { return DB.tx(store, 'readwrite', s => key !== undefined ? s.put(val, key) : s.put(val)); },
    get(store, key) { return DB.tx(store, 'readonly', s => s.get(key)); },
    all(store) { return DB.tx(store, 'readonly', s => s.getAll()); },
    del(store, key) { return DB.tx(store, 'readwrite', s => s.delete(key)); }
  };

  /* =====================================================================
     DEFINIZIONE DEI FORM
     ===================================================================== */
  const SPEED = [['25', '25 mm/s'], ['50', '50 mm/s']];
  const GAIN = [['10', '10 mm/mV (standard)'], ['5', '5 mm/mV'], ['20', '20 mm/mV']];

  const PROFILE_OPTS = Object.keys((window.ECGPhoto && window.ECGPhoto.PROFILES) || { auto: { nome: 'Automatico' } }).map(k => [k, window.ECGPhoto.PROFILES[k].nome]);
  const FORM_TECNICA = [
    { p: 'tecnica.profilo', t: 'sel', l: 'Apparecchio / formato del tracciato', o: PROFILE_OPTS, h: 'Usato dalla lettura automatica delle foto e dei PDF senza etichette per assegnare le derivazioni. ELI 280: 6×2.' },
    { p: 'tecnica.velocita', t: 'sel', l: 'Velocità carta', o: SPEED },
    { p: 'tecnica.guadagno', t: 'sel', l: 'Guadagno', o: GAIN, h: 'Le ampiezze vengono normalizzate a 10 mm/mV.' }
  ];
  const FORM_PAZIENTE = [
    { p: 'paziente.codice', t: 'txt', l: 'Codice / iniziali' },
    { p: 'paziente.eta', t: 'num', l: 'Età', u: 'anni' },
    { p: 'paziente.sesso', t: 'sel', l: 'Sesso', o: [['', '—'], ['M', 'Maschio'], ['F', 'Femmina']], h: 'Determina le soglie di STE in V2–V3, Cornell, Peguero, QTc.' },
    { p: 'fevs', t: 'num', l: 'FEVS da eco (facoltativa)', u: '%' },
    { p: 'contesto.dolore', t: 'chk', l: 'Dolore toracico / sintomi da SCA in atto' },
    { p: 'contesto.instabile', t: 'chk', l: 'Instabilità emodinamica / shock' },
    { p: 'contesto.postCCH', t: 'chk', l: 'Post-cardiochirurgia', s: 'Attiva note su pericardite post-pericardiotomica, IM tipo 5, POAF, tamponamento.' },
    { p: 'contesto.imaPregresso', t: 'chk', l: 'IMA pregresso', s: 'Criterio clinico dell\'algoritmo di Basilea.' },
    { p: 'contesto.scompenso', t: 'chk', l: 'Scompenso / FE < 35%', s: 'Criterio clinico dell\'algoritmo di Basilea.' },
    { p: 'contesto.device', t: 'chk', l: 'Portatore di ICD / CRT', s: 'Criterio clinico dell\'algoritmo di Basilea.' },
    { p: 'contesto.sincope', t: 'chk', l: 'Sincope inspiegata', s: 'Usata nella soglia QTc ≥ 460 ms per LQTS.' }
  ];

  const FORM_RITMO = [
    { card: 'Frequenza, regolarità e onde P', f: [
      { p: 'ritmo.fc', t: 'num', l: 'FC ventricolare', u: '/min', h: 'Se vuota: da RR o marker R.' },
      { p: 'ritmo.rr', t: 'num', l: 'RR medio', u: 'ms' },
      { p: 'ritmo.regolarita', t: 'sel', l: 'Regolarità RR', o: [['', 'Automatica (marker R)'], ['regolare', 'Regolare'], ['irregolare', 'Irregolarmente irregolare'], ['regolarmente_irregolare', 'Regolarmente irregolare']] },
      { p: 'ritmo.ondeP', t: 'sel', l: 'Onde P', o: [['', '— seleziona —'], ['sinusali', 'Sinusali (+ I, II, aVF; − aVR)'], ['ectopiche', 'Ectopiche (non sinusali, 1 per QRS)'], ['multiformi', 'Multiformi (≥ 3 morfologie)'], ['retrograde', 'Retrograde (dopo il QRS)'], ['assenti', 'Assenti / non visibili'], ['fibrillazione', 'Onde f fibrillatorie'], ['flutter', 'Onde F di flutter']] },
      { p: 'ritmo.fcAtriale', t: 'num', l: 'Frequenza atriale', u: '/min', h: 'Se vuota: da PP o marker P.' },
      { p: 'ritmo.pp', t: 'num', l: 'PP medio', u: 'ms' },
      { p: 'ritmo.rapportoPQRS', t: 'sel', l: 'Relazione P–QRS', o: [['', '1:1 / non specificata'], ['1:1', '1:1 (ogni P condotta)'], ['piu_p', 'Più P che QRS (P bloccate)'], ['dissociazione', 'P e QRS indipendenti']] },
      { p: 'ritmo.prPattern', t: 'sel', l: 'Comportamento del PR', o: [['', 'Costante / non applicabile'], ['progressivo', 'Si allunga → P bloccata'], ['costante_con_blocco', 'Costante → P bloccata improvvisa'], ['2:1', 'Conduzione 2:1'], ['alto_grado', '≥ 2 P consecutive bloccate']] },
      { p: 'ritmo.rp', t: 'num', l: 'Intervallo RP (in TSV)', u: 'ms' }
    ] },
    { card: 'Intervalli e asse', f: [
      { p: 'intervalli.p', t: 'num', l: 'Durata onda P', u: 'ms' },
      { p: 'intervalli.pr', t: 'num', l: 'PR', u: 'ms' },
      { p: 'intervalli.qrs', t: 'num', l: 'QRS', u: 'ms' },
      { p: 'intervalli.qt', t: 'num', l: 'QT', u: 'ms', h: 'Metodo della tangente, in II o V5.' },
      { p: 'asse.gradi', t: 'num', l: 'Asse QRS (facoltativo)', u: '°', h: 'Se vuoto: calcolato da R/S in I e aVF.' }
    ] },
    { card: 'Aritmie maligne', f: [
      { p: 'ritmo.fv', t: 'chk', l: 'Fibrillazione ventricolare', s: 'Attività caotica senza QRS riconoscibili.' },
      { p: 'ritmo.torsione', t: 'chk', l: 'TV polimorfa / torsione di punta', s: 'QRS polimorfi che ruotano attorno alla linea di base.' }
    ] },
    { card: 'Nodo del seno e pause', f: [
      { p: 'ritmo.pausaMax', t: 'num', l: 'Pausa massima', u: 'ms' },
      { p: 'ritmo.pausaTipo', t: 'sel', l: 'Tipo di pausa', o: [['', '—'], ['multiplo_pp', 'Multiplo esatto del PP (BSA tipo II)'], ['accorciamento_pp', 'PP che si accorciano poi pausa (BSA tipo I)'], ['non_multiplo', 'Non multipla del PP (arresto sinusale)']] },
      { p: 'ritmo.aritmiaSinusale', t: 'chk', l: 'Aritmia sinusale (variazione PP > 120 ms)' },
      { p: 'ritmo.bradiTachi', t: 'chk', l: 'Alternanza bradi–tachiaritmie (sindrome bradi-tachi)' }
    ] },
    { card: 'Pacemaker', f: [
      { p: 'ritmo.pacing', t: 'sel', l: 'Stimolazione', o: [['', 'Nessuna'], ['atriale', 'Atriale'], ['ventricolare', 'Ventricolare (VD)'], ['bicamerale', 'Bicamerale (DDD, stimolo V)'], ['biventricolare', 'Biventricolare (CRT)']] },
      { p: 'ritmo.pmNoCattura', t: 'chk', l: 'Perdita di cattura', s: 'Spike non seguiti da QRS/P.' },
      { p: 'ritmo.pmNoSensing', t: 'chk', l: 'Undersensing', s: 'Spike indipendenti dall\'attività spontanea.' }
    ] },
    { card: 'Battiti prematuri', f: [
      { p: 'ritmo.esv', t: 'chk', l: 'Extrasistoli sopraventricolari' },
      { p: 'ritmo.ev', t: 'chk', l: 'Extrasistoli ventricolari' },
      { p: 'ritmo.bigeminismo', t: 'chk', l: 'Bigeminismo' },
      { p: 'ritmo.coppie', t: 'chk', l: 'Coppie' },
      { p: 'ritmo.evPolimorfi', t: 'chk', l: 'EV polimorfe' },
      { p: 'ritmo.rsuT', t: 'chk', l: 'Fenomeno R su T' },
      { p: 'ritmo.tvns', t: 'chk', l: 'TV non sostenuta (≥ 3 battiti, < 30 s)' }
    ] },
    { card: 'Morfologia del QRS (blocchi, pre-eccitazione)', f: [
      { p: 'morfologia.rsrV1', t: 'chk', l: 'rsR′ / rSR′ in V1–V2', s: 'R′ più larga della r iniziale.' },
      { p: 'morfologia.sLarga', t: 'chk', l: 'S larga e impastata in I e V6', s: 'S > R in durata o > 40 ms.' },
      { p: 'morfologia.qsV1', t: 'chk', l: 'QS o rS in V1 (BBS-simile)' },
      { p: 'morfologia.notchLat', t: 'chk', l: 'Notch/slurring medio-QRS in ≥ 2 tra I, aVL, V1, V2, V5, V6', s: 'Criterio di Strauss.' },
      { p: 'morfologia.rLargaLat', t: 'chk', l: 'R larga, senza q, in I, aVL, V5–V6', s: 'Criterio AHA 2009 (R-peak time > 60 ms in V5–V6).' },
      { p: 'morfologia.qrAVL', t: 'chk', l: 'qR in aVL (rS in II, III, aVF)', s: 'Emiblocco anteriore.' },
      { p: 'morfologia.rsIaVL', t: 'chk', l: 'rS in I e aVL', s: 'Emiblocco posteriore.' },
      { p: 'morfologia.qrIIIaVF', t: 'chk', l: 'qR in III e aVF', s: 'Emiblocco posteriore.' },
      { p: 'morfologia.bbAlternante', t: 'chk', l: 'Blocco di branca alternante' },
      { p: 'ritmo.ondaDelta', t: 'chk', l: 'Onda delta', s: 'Impastamento iniziale del QRS (pre-eccitazione).' },
      { p: 'ritmo.qrsVariabili', t: 'chk', l: 'QRS di morfologia variabile battito-battito' }
    ] },
    { card: 'Atri', f: [
      { p: 'atri.pAmpII', t: 'num', l: 'Ampiezza P in II', u: 'mm' },
      { p: 'atri.pAmpV1', t: 'num', l: 'Componente positiva P in V1', u: 'mm' },
      { p: 'atri.ptfDepth', t: 'num', l: 'PTFV1: profondità parte negativa', u: 'mm' },
      { p: 'atri.ptfDur', t: 'num', l: 'PTFV1: durata parte negativa', u: 'ms' },
      { p: 'atri.pNotch', t: 'chk', l: 'P bifida in II ("P mitrale")' },
      { p: 'atri.pBifInf', t: 'chk', l: 'P bifasica (+/−) in II, III, aVF', s: 'Blocco interatriale avanzato.' }
    ] },
    { card: 'Tachicardia a QRS largo (TV vs TSV)', det: true, f: [
      { p: 'tcl.dissociazione', t: 'chk', l: 'Dissociazione AV', s: 'Brugada / Vereckei.' },
      { p: 'tcl.catture', t: 'chk', l: 'Battiti di cattura o di fusione' },
      { p: 'tcl.assenzaRS', t: 'chk', l: 'Assenza di complessi RS in tutte le precordiali', s: 'Brugada step 1.' },
      { p: 'tcl.rs100', t: 'chk', l: 'Inizio R – nadir S > 100 ms in una precordiale', s: 'Brugada step 2.' },
      { p: 'tcl.morfTV', t: 'chk', l: 'Criteri morfologici di TV in V1–V2 e V6', s: 'Brugada step 4.' },
      { p: 'tcl.inizR_aVR', t: 'chk', l: 'aVR: R iniziale', s: 'Vereckei step 1.' },
      { p: 'tcl.rq40_aVR', t: 'chk', l: 'aVR: r o q iniziale > 40 ms', s: 'Vereckei step 2.' },
      { p: 'tcl.notch_aVR', t: 'chk', l: 'aVR: notch sulla discesa di un QRS negativo', s: 'Vereckei step 3.' },
      { p: 'tcl.vivt', t: 'chk', l: 'vi/vt ≤ 1', s: 'Vereckei step 4 (ampiezza nei primi vs ultimi 40 ms).' },
      { p: 'tcl.ttfpII', t: 'chk', l: 'Lead II: time-to-first-peak > 40 ms', s: 'Basilea.' },
      { p: 'tcl.ttfpAVR', t: 'chk', l: 'aVR: time-to-first-peak > 40 ms', s: 'Basilea.' },
      { p: 'tcl.rwptII', t: 'chk', l: 'R-wave peak time in DII ≥ 50 ms', s: 'Pava 2010.' },
      { p: 'tcl.concordanza', t: 'chk', l: 'Concordanza precordiale (tutte + o tutte −)' },
      { p: 'tcl.asseNW', t: 'chk', l: 'Asse nord-ovest (−90° / ±180°)' }
    ] }
  ];

  const FORM_EXTRA = [
    { p: 'extra.ste60V3', t: 'num', l: 'STE 60 ms dopo J in V3', u: 'mm', h: 'Per la formula a 4 variabili (IVA).' },
    { p: 'extra.stV4R', t: 'num', l: 'ST in V4R', u: 'mm', h: 'Infarto del ventricolo destro.' },
    { p: 'extra.stPost', t: 'num', l: 'ST massimo in V7–V9', u: 'mm', h: 'IMA posteriore.' }
  ];

  const FORM_PATTERN = [
    { card: 'OMI / STEMI-equivalenti', f: [
      { p: 'pattern.deWinter', t: 'chk', l: 'Pattern di de Winter', s: 'STD ascendente 1–3 mm al punto J in V1–V6 che prosegue in T alte e simmetriche; ± STE aVR.' },
      { p: 'pattern.tIperAnt', t: 'chk', l: 'T iperacute anteriori (V1–V4)', s: 'Larghe alla base, simmetriche, voluminose rispetto al QRS.' },
      { p: 'pattern.tIperInf', t: 'chk', l: 'T iperacute inferiori' },
      { p: 'pattern.tIperLat', t: 'chk', l: 'T iperacute laterali' },
      { p: 'pattern.distorsioneTerminale', t: 'chk', l: 'Distorsione terminale del QRS in V2–V3', s: 'Assenza sia di S sia di onda J in V2 o V3.' },
      { p: 'pattern.wellensA', t: 'chk', l: 'Wellens tipo A', s: 'T bifasiche (+/−) in V2–V3, paziente spesso senza dolore.' },
      { p: 'pattern.wellensB', t: 'chk', l: 'Wellens tipo B', s: 'T negative profonde e simmetriche in V2–V3.' },
      { p: 'pattern.qPatologiche', t: 'chk', l: 'Onde Q patologiche', s: 'Q ≥ 30 ms e ≥ 1 mm in 2 contigue; ogni Q ≥ 20 ms o QS in V2–V3.' },
      { p: 'pattern.aneurisma', t: 'chk', l: 'QS in V1–V4 con STE persistente', s: 'Attiva il rapporto T/QRS (aneurisma vs IMA acuto). Servono R, S e T in V1–V4.' },
      { p: 'pattern.stConvesso', t: 'chk', l: 'ST a convessità superiore ("a schiena di delfino")' }
    ] },
    { card: 'Pericardite e ripolarizzazione precoce', f: [
      { p: 'pattern.prDep', t: 'chk', l: 'Sottoslivellamento del PR (II, aVF, V4–V6)' },
      { p: 'pattern.prAVR', t: 'chk', l: 'Sopraslivellamento del PR in aVR' },
      { p: 'pattern.spodick', t: 'chk', l: 'Segno di Spodick (TP discendente)' },
      { p: 'pattern.ripolPrecoce', t: 'chk', l: 'Ripolarizzazione precoce', s: 'J ≥ 1 mm con notch/slurring terminale in ≥ 2 contigue inferiori/laterali.' },
      { p: 'pattern.stOrizzontale', t: 'chk', l: 'ST orizzontale/discendente dopo J', s: 'Variante a maggior rischio aritmico.' }
    ] },
    { card: 'Canalopatie e cardiomiopatie', f: [
      { p: 'pattern.brugada1', t: 'chk', l: 'Brugada tipo 1 (coved)', s: 'STE ≥ 2 mm a tenda in V1–V2 con T negativa.' },
      { p: 'pattern.brugada2', t: 'chk', l: 'Brugada tipo 2 (saddle-back)' },
      { p: 'pattern.epsilon', t: 'chk', l: 'Onda epsilon (V1–V3)' },
      { p: 'pattern.strain', t: 'chk', l: 'Pattern strain VS', s: 'ST discendente + T negativa asimmetrica in V5–V6, I, aVL.' }
    ] },
    { card: 'Elettroliti, farmaci, altro', f: [
      { p: 'pattern.tPiccate', t: 'chk', l: 'T appuntite e strette (iperkaliemia)' },
      { p: 'pattern.sineWave', t: 'chk', l: 'Onda sinusoidale' },
      { p: 'pattern.ondeU', t: 'chk', l: 'Onde U prominenti (ipokaliemia)' },
      { p: 'pattern.digitale', t: 'chk', l: 'ST "a cucchiaio" (digitale)' },
      { p: 'pattern.osborn', t: 'chk', l: 'Onde J di Osborn (ipotermia)' },
      { p: 'pattern.s1q3t3', t: 'chk', l: 'S1Q3T3' },
      { p: 'pattern.straindx', t: 'chk', l: 'T negative V1–V4 + III/aVF (sovraccarico destro)' },
      { p: 'pattern.alternanza', t: 'chk', l: 'Alternanza elettrica del QRS' }
    ] }
  ];

  /* ---------------- render form ---------------- */
  function fieldHTML(f) {
    const v = get(state.data, f.p);
    if (f.t === 'chk') {
      return '<label class="chk"><input type="checkbox" data-p="' + f.p + '"' + (v ? ' checked' : '') + '><div><b>' + esc(f.l) + '</b>' + (f.s ? '<small>' + esc(f.s) + '</small>' : '') + '</div></label>';
    }
    let inner;
    if (f.t === 'sel') {
      inner = '<select data-p="' + f.p + '">' + f.o.map(o => '<option value="' + esc(o[0]) + '"' + (String(v == null ? '' : v) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    } else if (f.t === 'area') {
      inner = '<textarea data-p="' + f.p + '">' + esc(v || '') + '</textarea>';
    } else {
      const isNum = f.t === 'num';
      inner = '<div class="unit"><input data-p="' + f.p + '" ' + (isNum ? 'inputmode="decimal" data-num="1"' : 'type="text"') + ' value="' + esc(v == null ? '' : v) + '">' + (f.u ? '<em>' + esc(f.u) + '</em>' : '') + '</div>';
    }
    return '<label class="field"><span>' + esc(f.l) + '</span>' + inner + (f.h ? '<small>' + esc(f.h) + '</small>' : '') + '</label>';
  }
  function renderFields(el, fields) {
    const chks = fields.filter(f => f.t === 'chk'), oth = fields.filter(f => f.t !== 'chk');
    el.innerHTML = oth.map(fieldHTML).join('') + (chks.length ? '<div style="grid-column:1/-1">' + chks.map(fieldHTML).join('') + '</div>' : '');
  }
  function renderCards(el, cards) {
    el.innerHTML = cards.map((c, i) => {
      const id = el.id + '_' + i;
      const body = '<div class="grid2" id="' + id + '"></div>';
      return c.det ? '<details class="card"><summary>' + esc(c.card) + '</summary>' + body + '</details>'
        : '<div class="card"><h3>' + esc(c.card) + '</h3>' + body + '</div>';
    }).join('');
    cards.forEach((c, i) => renderFields(document.getElementById(el.id + '_' + i), c.f));
  }
  function renderLeadTable() {
    const L = C.LEADS;
    let h = '<thead><tr><th></th><th>R</th><th>S</th><th>ST (J)</th><th></th><th>T</th><th></th></tr></thead><tbody>';
    L.forEach((l, i) => {
      const lv = (state.data.leads || {})[l] || {};
      const inp = (k) => { const v = lv[k] == null ? '' : lv[k]; const n = num(v); const cls = (k === 'st' && n !== null) ? (n > 0 ? 'pos' : n < 0 ? 'neg' : '') : ''; return '<td><input inputmode="decimal" data-num="1" data-p="leads.' + l + '.' + k + '" class="' + cls + '" value="' + esc(v) + '"></td>'; };
      h += '<tr' + (i === 6 ? ' class="sep"' : '') + '><td class="ln">' + l + '</td>' + inp('r') + inp('s') + inp('st') + '<td><button class="pm" data-pm="leads.' + l + '.st">±</button></td>' + inp('t') + '<td><button class="pm" data-pm="leads.' + l + '.t">±</button></td></tr>';
    });
    $('#leadTable').innerHTML = h + '</tbody>';
  }
  function renderAllForms() {
    renderFields($('#formTecnica'), FORM_TECNICA);
    renderFields($('#formPaziente'), FORM_PAZIENTE);
    renderCards($('#formRitmo'), FORM_RITMO);
    renderLeadTable();
    renderFields($('#formExtra'), FORM_EXTRA);
    renderCards($('#formPattern'), FORM_PATTERN);
    renderFields($('#formNote'), [
      { p: 'operatore', t: 'txt', l: 'Operatore' },
      { p: 'note', t: 'area', l: 'Note cliniche / conclusioni' }
    ]);
  }

  // binding generico
  document.addEventListener('input', onField);
  document.addEventListener('change', onField);
  function onField(e) {
    const el = e.target; const p = el.dataset && el.dataset.p; if (!p) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.num) v = el.value.replace(',', '.').replace(/[^0-9.\-]/g, '');
    else v = el.value;
    if (el.dataset.num && el.value !== v && e.type === 'change') el.value = v;
    set(state.data, p, v);
    if (p.startsWith('leads.') && p.endsWith('.st')) { const n = num(v); el.classList.toggle('pos', n > 0); el.classList.toggle('neg', n < 0); }
    if (p.startsWith('tecnica.')) updateCalStatus();
    schedule();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pm]'); if (!b) return;
    e.preventDefault();
    const p = b.dataset.pm; const n = num(get(state.data, p)); if (n === null) return;
    set(state.data, p, String(-n));
    const inp = document.querySelector('[data-p="' + p + '"]'); if (inp) { inp.value = String(-n); inp.classList.toggle('pos', -n > 0); inp.classList.toggle('neg', -n < 0); }
    schedule();
  });
  function setField(p, v) {
    set(state.data, p, v);
    const el = document.querySelector('[data-p="' + p + '"]');
    if (el) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; if (p.endsWith('.st')) { const n = num(v); el.classList.toggle('pos', n > 0); el.classList.toggle('neg', n < 0); } }
    schedule();
  }

  /* =====================================================================
     ANALISI + AUTOSALVATAGGIO
     ===================================================================== */
  let tmr = null;
  function schedule() { clearTimeout(tmr); tmr = setTimeout(() => { analyze(); persist(); }, 250); }
  function analyze() {
    try { state.result = C.analizza(state.data); } catch (err) { console.error(err); toast('Errore di analisi: ' + err.message); return; }
    renderReport();
    const s = state.result.sintesi;
    const chip = $('#statusChip');
    chip.className = 'chip ' + (s.omi === 'positivo' ? 'crit' : s.omi === 'NSTEMI ad alto rischio' ? 'alto' : s.omi === 'negativo' ? 'norm' : '');
    chip.textContent = 'OMI: ' + (s.omi === 'NSTEMI ad alto rischio' ? 'NSTEMI AR' : s.omi) + (state.data.fotoDaVerificare ? ' (da verificare)' : '');
    const b = $('#critBadge'); b.textContent = s.critici; b.classList.toggle('hidden', !s.critici);
  }
  function persist() {
    try { localStorage.setItem(LS_CASE, JSON.stringify({ data: state.data, rMarks: state.rMarks, pMarks: state.pMarks, enh: state.enh, overlay: state.overlay, auto: state.auto })); } catch (e) { /* quota */ }
  }

  /* =====================================================================
     REFERTO
     ===================================================================== */
  const OMI_STYLE = {
    'positivo': ['omi-pos', 'OMI / STEMI(-equivalente) RILEVATO', 'Pattern di occlusione coronarica acuta: valutare attivazione immediata del percorso STEMI.'],
    'NSTEMI ad alto rischio': ['omi-nst', 'NSTEMI AD ALTO RISCHIO', 'Ischemia subendocardica o riperfusione (Wellens): strategia invasiva precoce.'],
    'negativo': ['omi-neg', 'NESSUN SEGNO DI OMI', 'Nessun criterio di occlusione nelle derivazioni inserite. Non esclude SCA: troponina ed ECG seriati.'],
    'non valutabile': ['omi-nv', 'OMI NON VALUTABILE', 'Inserisci il tratto ST di almeno 10 derivazioni (scheda Derivazioni).']
  };
  function measureRows(m, d) {
    const rows = [
      ['Frequenza cardiaca', fmt(m.fc) + (m.fc ? ' /min' : '')],
      ['Intervallo RR', m.rr ? fmt(m.rr) + ' ms' + (m.rrStats && m.rrStats.n > 2 ? ' (min ' + fmt(m.rrStats.min) + ' – max ' + fmt(m.rrStats.max) + ')' : '') : '—'],
      ['Intervallo PP / FC atriale', (m.pp ? fmt(m.pp) + ' ms' : '—') + (m.fcAtriale ? ' / ' + fmt(m.fcAtriale) + ' /min' : '')],
      ['Onda P', m.p ? fmt(m.p) + ' ms' : '—'],
      ['PR', m.pr ? fmt(m.pr) + ' ms' : '—'],
      ['QRS', m.qrs ? fmt(m.qrs) + ' ms' : '—'],
      ['QT', m.qt ? fmt(m.qt) + ' ms' : '—'],
      ['QTc Framingham', m.qtcFramingham ? fmt(m.qtcFramingham) + ' ms' : '—'],
      ['QTc Bazett / Fridericia', m.qtcBazett ? fmt(m.qtcBazett) + ' / ' + fmt(m.qtcFridericia) + ' ms' : '—'],
      ['Asse QRS', m.asse != null ? fmt(m.asse) + '°' : '—'],
      ['PTFV1', m.ptfv1 != null ? fmt(m.ptfv1, 3) + ' mm·s' : '—']
    ];
    if (m.qtcModificato) rows.splice(9, 0, ['QTc (QT modificato, QRS largo)', fmt(m.qtcModificato) + ' ms']);
    return rows;
  }
  function renderReport() {
    const res = state.result; if (!res) return;
    const d = state.data, m = res.misure, s = res.sintesi;
    const os = OMI_STYLE[s.omi];
    let h = '';
    if (d.fotoDaVerificare) h += '<div class="qbox q-critico"><b>⚠️ REFERTO PROVVISORIO – misure lette automaticamente dalla foto, non ancora verificate.</b><br>La lettura delle foto può sbagliare onde P, durata del QRS, asse e ampiezze (soprattutto con voltaggi alti o foto non frontali). Confronta sul tracciato e con i valori stampati dall\'elettrocardiografo, correggi nelle schede Ritmo e Derivazioni, poi conferma.<div class="actions"><button class="btn sm primary" id="verifyFoto">✔ Ho verificato e corretto le misure</button></div></div>';
    h += '<div class="omi-card ' + os[0] + '"><div class="lbl">Modulo OMI (criteri validati)' + (d.fotoDaVerificare ? ' – PROVVISORIO' : '') + '</div><div class="val">' + os[1] + '</div><div class="sub">' + os[2] + '</div></div>';
    h += '<div class="card"><div class="kv"><b>Ritmo</b><span>' + esc(s.ritmo) + '</span><b>Paziente</b><span>' + esc([d.paziente.codice, d.paziente.eta ? d.paziente.eta + ' anni' : '', d.paziente.sesso].filter(Boolean).join(' · ') || '—') + '</span><b>Data</b><span>' + nowStr() + '</span></div></div>';
    if (state.imgUrl) h += '<div class="card"><h3>Tracciato</h3><img class="report-img" src="' + state.imgUrl + '" alt="ECG"></div>';
    h += '<div class="card"><h3>Misure</h3><table class="meas">' + measureRows(m, d).map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table></div>';
    const cats = {};
    res.reperti.forEach(f => { (cats[f.cat] = cats[f.cat] || []).push(f); });
    const order = Object.values(C.CAT);
    h += '<div class="card"><h3>Reperti</h3><div class="legend"><span><i class="dot critico"></i>critico</span><span><i class="dot alto"></i>rilevante</span><span><i class="dot moderato"></i>anomalia</span><span><i class="dot normale"></i>normale</span><span><i class="dot info"></i>informativo</span></div>';
    if (!res.reperti.length) h += '<p class="hint">Nessun reperto: inserisci dati nelle schede Ritmo, Derivazioni e Pattern.</p>';
    order.forEach(cat => {
      if (!cats[cat]) return;
      h += '<h4>' + esc(cat) + '</h4>';
      cats[cat].forEach(f => {
        h += '<div class="fnd"><i class="dot ' + f.livello + '"></i><div><b>' + esc(f.titolo) + '</b>' +
          (f.dettagli.length ? '<ul>' + f.dettagli.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
          (f.azione ? '<div class="act">➜ ' + esc(f.azione) + '</div>' : '') +
          (f.rif ? '<div class="ref">' + esc(f.rif) + '</div>' : '') + '</div></div>';
      });
    });
    h += '<div class="disclaimer">Interpretazione assistita da regole su misure inserite dall\'operatore. Strumento didattico, NON dispositivo medico (MDR 2017/745): non sostituisce la refertazione medica né il giudizio clinico. Criteri v' + C.META.criteriaVersion + '.</div></div>';
    $('#reportView').innerHTML = h;
    const vb = $('#verifyFoto'); if (vb) vb.onclick = () => { delete state.data.fotoDaVerificare; persist(); analyze(); toast('Misure confermate dall\'operatore.'); };
  }

  /* =====================================================================
     VISUALIZZATORE / CALIBRO
     ===================================================================== */
  const cv = $('#cv'); const g = cv.getContext('2d');
  function dpr() { return window.devicePixelRatio || 1; }
  function resize() {
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr())); cv.height = Math.max(1, Math.round(r.height * dpr()));
    draw();
  }
  window.addEventListener('resize', resize);
  function fit() {
    if (!state.img) return;
    const r = cv.getBoundingClientRect();
    const s = Math.min(r.width / state.img.width, r.height / state.img.height);
    state.v = { s, tx: (r.width - state.img.width * s) / 2, ty: (r.height - state.img.height * s) / 2 };
    draw();
  }
  function pxPerMm() { return state.data.cal && state.data.cal.pxPerMm; }
  function msPerMm() { return 1000 / (num(state.data.tecnica.velocita) || 25); }
  function mmScale() { return 10 / (num(state.data.tecnica.guadagno) || 10); } // normalizza a 10 mm/mV
  function toMs(dxPx) { return Math.abs(dxPx) / pxPerMm() * msPerMm(); }
  function toMm(dyPx) { return -dyPx / pxPerMm() * mmScale(); }

  function draw() {
    const D = dpr();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    $('#cvEmpty').classList.toggle('hidden', !!state.img);
    if (!state.img) return;
    const v = state.v;
    g.setTransform(D * v.s, 0, 0, D * v.s, D * v.tx, D * v.ty);
    g.imageSmoothingQuality = 'high';
    if (state.enh) { try { g.filter = 'grayscale(1) contrast(1.9) brightness(1.08)'; } catch (e) { } }
    g.drawImage(state.img, 0, 0);
    g.filter = 'none';
    const lw = 2 / v.s, fs = 14 / v.s;
    g.font = '700 ' + fs + 'px system-ui, sans-serif';
    const H = state.img.height;
    // marker R e P
    [['rMarks', '#e5484d', 'R'], ['pMarks', '#16a34a', 'P']].forEach(([k, col, lab]) => {
      const pts = state[k].slice().sort((a, b) => a.x - b.x);
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw;
      pts.forEach((p, i) => {
        g.beginPath(); g.moveTo(p.x, p.y - 40 / v.s); g.lineTo(p.x, p.y + 40 / v.s); g.stroke();
        g.fillText(lab, p.x + 3 / v.s, p.y - 44 / v.s);
        if (i > 0 && pxPerMm()) {
          const ms = toMs(p.x - pts[i - 1].x);
          g.fillText(Math.round(ms) + '', (p.x + pts[i - 1].x) / 2 - fs, p.y + (lab === 'R' ? 58 : 74) / v.s);
        }
      });
    });
    // sovrapposizione della lettura automatica
    (state.overlay || []).forEach(o => {
      if (o.t === 'label') { g.fillStyle = '#2563eb'; g.fillText(o.s, o.x, o.y); }
      else if (o.t === 'j') { g.fillStyle = '#f76b15'; g.beginPath(); g.arc(o.x, o.y, 1.4 * lw, 0, Math.PI * 2); g.fill(); }
      else if (o.t === 'base') { g.strokeStyle = '#16a34a'; g.lineWidth = lw * 1.4; g.beginPath(); g.moveTo(o.x0, o.y); g.lineTo(o.x1, o.y); g.stroke(); }
      else if (o.t === 'r') { g.strokeStyle = '#e5484d'; g.lineWidth = lw; g.beginPath(); g.moveTo(o.x, o.y - 14 * lw); g.lineTo(o.x, o.y - 4 * lw); g.stroke(); }
    });
    // calibrazione
    drawPair(state.calPts, '#3b82f6', lw, fs, false);
    drawPair(state.misPts, '#d946ef', lw, fs, true);
    void H;
  }
  function drawPair(pts, col, lw, fs, label) {
    if (!pts.length) return;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw;
    pts.forEach(p => { g.beginPath(); g.arc(p.x, p.y, 6 * lw, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(p.x - 12 * lw, p.y); g.lineTo(p.x + 12 * lw, p.y); g.moveTo(p.x, p.y - 12 * lw); g.lineTo(p.x, p.y + 12 * lw); g.stroke(); });
    if (pts.length === 2) {
      const [a, b] = pts;
      g.setLineDash([8 * lw, 5 * lw]);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.setLineDash([]);
      if (label && pxPerMm()) {
        g.fillText(Math.round(toMs(b.x - a.x)) + ' ms', (a.x + b.x) / 2, a.y - 10 * lw);
        g.fillText(fmt(toMm(b.y - a.y), 1) + ' mm', b.x + 8 * lw, (a.y + b.y) / 2);
      }
    }
  }

  // gestione puntatori: pan, pinch, tap
  const ptrs = new Map(); let gest = null;
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', e => {
    if (!state.img) return;
    cv.setPointerCapture(e.pointerId);
    const p = pos(e); ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values());
      gest = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: state.v.s, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, tx0: state.v.tx, ty0: state.v.ty };
    } else gest = { type: 'tap', p0: p, tx0: state.v.tx, ty0: state.v.ty };
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !gest) return;
    const p = pos(e); ptrs.set(e.pointerId, p);
    if (gest.type === 'pinch' && ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const s = Math.min(40, Math.max(0.05, gest.s0 * d / gest.d0));
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ix = (gest.m0.x - gest.tx0) / gest.s0, iy = (gest.m0.y - gest.ty0) / gest.s0;
      state.v = { s, tx: m.x - ix * s, ty: m.y - iy * s };
      draw();
    } else if (gest.type === 'tap' || gest.type === 'pan') {
      const dx = p.x - gest.p0.x, dy = p.y - gest.p0.y;
      if (gest.type === 'tap' && Math.hypot(dx, dy) > 8) gest.type = 'pan';
      if (gest.type === 'pan') { state.v.tx = gest.tx0 + dx; state.v.ty = gest.ty0 + dy; draw(); }
    }
  });
  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    const p = pos(e);
    ptrs.delete(e.pointerId);
    if (gest && gest.type === 'tap' && ptrs.size === 0 && e.type === 'pointerup') onTap(p);
    if (ptrs.size === 0) gest = null;
    else if (gest && gest.type === 'pinch') gest = { type: 'none' };
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', e => {
    if (!state.img) return; e.preventDefault();
    zoomAt(pos(e), e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });
  function zoomAt(p, k) {
    const v = state.v; const s = Math.min(40, Math.max(0.05, v.s * k));
    const ix = (p.x - v.tx) / v.s, iy = (p.y - v.ty) / v.s;
    state.v = { s, tx: p.x - ix * s, ty: p.y - iy * s }; draw();
  }

  function onTap(p) {
    const v = state.v;
    const ip = { x: (p.x - v.tx) / v.s, y: (p.y - v.ty) / v.s };
    if (ip.x < 0 || ip.y < 0 || ip.x > state.img.width || ip.y > state.img.height) return;
    const m = state.mode;
    if (m === 'pan') return;
    if (m !== 'cal' && !pxPerMm()) { toast('Prima calibra sulla griglia'); setMode('cal'); return; }
    if (m === 'cal') { if (state.calPts.length >= 2) state.calPts = []; state.calPts.push(ip); }
    else if (m === 'mis') { if (state.misPts.length >= 2) state.misPts = []; state.misPts.push(ip); }
    else if (m === 'r') state.rMarks.push(ip);
    else if (m === 'p') state.pMarks.push(ip);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { }
    draw(); renderPanel(); persist();
  }

  function setMode(m) {
    state.mode = m;
    $$('#toolbar .tool').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    renderPanel();
  }
  $('#toolbar').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  $('#zoomIn').onclick = () => { const r = cv.getBoundingClientRect(); zoomAt({ x: r.width / 2, y: r.height / 2 }, 1.3); };
  $('#zoomOut').onclick = () => { const r = cv.getBoundingClientRect(); zoomAt({ x: r.width / 2, y: r.height / 2 }, 1 / 1.3); };
  $('#fitBtn').onclick = fit;
  $('#enhBtn').onclick = () => { state.enh = !state.enh; $('#enhBtn').classList.toggle('active', state.enh); draw(); persist(); };
  $('#rotBtn').onclick = () => {
    if (!state.img) return;
    const src = state.img; const c = document.createElement('canvas'); c.width = src.height; c.height = src.width;
    const x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0);
    state.img = c; state.calPts = []; state.misPts = []; state.rMarks = []; state.pMarks = []; state.overlay = [];
    state.imgUrl = c.toDataURL('image/jpeg', 0.88); storeImage();
    toast('Immagine ruotata: segni azzerati, la calibrazione resta valida');
    fit(); renderPanel(); renderReport();
  };
  $('#undoBtn').onclick = () => {
    const k = { cal: 'calPts', mis: 'misPts', r: 'rMarks', p: 'pMarks' }[state.mode]; if (k) { state[k].pop(); draw(); renderPanel(); persist(); }
  };
  $('#clearBtn').onclick = () => {
    const k = { cal: 'calPts', mis: 'misPts', r: 'rMarks', p: 'pMarks' }[state.mode];
    if (k) state[k] = []; else { state.misPts = []; state.rMarks = []; state.pMarks = []; }
    draw(); renderPanel(); persist();
  };

  // pannello strumenti
  const TIME_TARGETS = [['intervalli.pr', 'PR'], ['intervalli.qrs', 'QRS'], ['intervalli.qt', 'QT'], ['intervalli.p', 'Durata P'], ['ritmo.rr', 'RR'], ['ritmo.pp', 'PP'], ['ritmo.rp', 'RP'], ['ritmo.pausaMax', 'Pausa massima'], ['atri.ptfDur', 'PTFV1 durata']];
  function ampTargets() {
    const o = [];
    C.LEADS.forEach(l => { o.push(['leads.' + l + '.st', 'ST ' + l]); });
    C.LEADS.forEach(l => { o.push(['leads.' + l + '.r', 'R ' + l], ['leads.' + l + '.s', 'S ' + l], ['leads.' + l + '.t', 'T ' + l]); });
    o.push(['extra.ste60V3', 'STE60 V3'], ['extra.stV4R', 'ST V4R'], ['extra.stPost', 'ST V7–V9'], ['atri.pAmpII', 'P in II'], ['atri.pAmpV1', 'P+ in V1'], ['atri.ptfDepth', 'PTFV1 profondità']);
    return o;
  }
  function renderPanel() {
    const P = $('#toolPanel'); const m = state.mode;
    if (!state.img) { P.innerHTML = ''; return; }
    if (m === 'pan') { P.innerHTML = '<div class="hint">Trascina per spostare, pizzica per ingrandire. Seleziona uno strumento per misurare.</div>'; return; }
    if (m === 'cal') {
      let h = '<div class="hint"><b>Calibrazione:</b> tocca due punti della griglia a distanza nota (es. 5 quadrati grandi = 25 mm in orizzontale, oppure il segnale di taratura da 10 mm). Ingrandisci per precisione.</div>';
      if (state.calPts.length === 2) {
        const [a, b] = state.calPts; const dist = Math.hypot(b.x - a.x, b.y - a.y);
        h += '<div class="assign"><input id="calMm" inputmode="decimal" value="25" aria-label="mm"><button class="btn sm primary" id="calOk">Conferma mm</button></div><div class="hint">Distanza: ' + fmt(dist) + ' px</div>';
        P.innerHTML = h;
        $('#calOk').onclick = () => {
          const mm = num($('#calMm').value); if (!mm || mm <= 0) return toast('mm non validi');
          state.data.cal = { pxPerMm: dist / mm, fonte: 'manuale', data: new Date().toISOString() };
          state.calPts = []; updateCalStatus(); draw(); persist(); toast('Calibrato: ' + fmt(dist / mm, 1) + ' px/mm'); setMode('mis');
        };
        return;
      }
      P.innerHTML = h + '<div class="hint">Punti: ' + state.calPts.length + '/2</div>';
      return;
    }
    if (m === 'mis') {
      let h = '<div class="hint"><b>Calibro:</b> 1° tocco = inizio (per le ampiezze: linea di base PR/TP), 2° tocco = fine (punto J, apice R, nadir S…).</div>';
      if (state.misPts.length === 2) {
        const [a, b] = state.misPts;
        const ms = toMs(b.x - a.x), mm = toMm(b.y - a.y);
        h += '<div class="res">Δt ' + fmt(ms) + ' ms · Δ ' + fmt(mm, 1) + ' mm (' + fmt(mm / 10, 2) + ' mV)</div>';
        h += '<div class="assign"><select id="tTarget">' + TIME_TARGETS.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select><button class="btn sm" id="tAssign">Assegna ' + fmt(ms) + ' ms</button></div>';
        h += '<div class="assign"><select id="aTarget">' + ampTargets().map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select><button class="btn sm" id="aAssign">Assegna ' + fmt(mm, 1) + ' mm</button></div>';
        P.innerHTML = h;
        const sel = $('#aTarget'); if (renderPanel.lastA) sel.value = renderPanel.lastA;
        const tsel = $('#tTarget'); if (renderPanel.lastT) tsel.value = renderPanel.lastT;
        $('#tAssign').onclick = () => { renderPanel.lastT = tsel.value; setField(tsel.value, String(Math.round(ms))); toast(tsel.options[tsel.selectedIndex].text + ' = ' + Math.round(ms) + ' ms'); };
        $('#aAssign').onclick = () => {
          const p = sel.value; renderPanel.lastA = p;
          let val = Math.round(mm * 2) / 2; // risoluzione 0,5 mm
          if (/\.(r|s)$/.test(p) || /pAmp|ptfDepth/.test(p)) val = Math.abs(val);
          setField(p, String(val)); toast(sel.options[sel.selectedIndex].text + ' = ' + val + ' mm');
          if (sel.selectedIndex < sel.options.length - 1 && /^leads\.\w+\.st$/.test(p)) { sel.selectedIndex++; renderPanel.lastA = sel.value; }
        };
        return;
      }
      P.innerHTML = h + '<div class="hint">Punti: ' + state.misPts.length + '/2</div>';
      return;
    }
    if (m === 'r' || m === 'p') {
      const k = m === 'r' ? 'rMarks' : 'pMarks';
      const xs = state[k].map(p => p.x).sort((a, b) => a - b);
      const iv = []; for (let i = 1; i < xs.length; i++) iv.push(toMs(xs[i] - xs[i - 1]));
      let h = '<div class="hint"><b>' + (m === 'r' ? 'Marca il picco di ogni onda R' : 'Marca l\'inizio di ogni onda P') + '</b> su una striscia di ritmo (idealmente DII lungo). Marker: ' + xs.length + '.</div>';
      if (iv.length) {
        const mean = iv.reduce((a, b) => a + b, 0) / iv.length, mn = Math.min.apply(null, iv), mx = Math.max.apply(null, iv);
        h += '<div class="res">' + (m === 'r' ? 'FC ' : 'F. atriale ') + fmt(60000 / mean) + '/min · ' + (m === 'r' ? 'RR' : 'PP') + ' ' + fmt(mean) + ' ms</div><div class="hint">min ' + fmt(mn) + ' – max ' + fmt(mx) + ' ms · variabilità ' + fmt(mx - mn) + ' ms' + (iv.length >= 3 ? (mx - mn > Math.max(120, 0.15 * mean) ? ' → irregolare' : ' → regolare') : '') + '</div>';
        h += '<div class="actions"><button class="btn sm primary" id="applyMarks">Applica ' + (m === 'r' ? 'FC/RR' : 'PP/f. atriale') + '</button>' + (m === 'r' ? '<button class="btn sm" id="applyPause">Pausa max = ' + fmt(mx) + ' ms</button>' : '') + '</div>';
        P.innerHTML = h;
        $('#applyMarks').onclick = () => {
          if (m === 'r') { state.data.ritmo.rrList = iv.map(Math.round); setField('ritmo.rr', String(Math.round(mean))); setField('ritmo.fc', String(Math.round(60000 / mean))); }
          else { state.data.ritmo.ppList = iv.map(Math.round); setField('ritmo.pp', String(Math.round(mean))); setField('ritmo.fcAtriale', String(Math.round(60000 / mean))); }
          toast('Valori applicati');
        };
        if (m === 'r') $('#applyPause').onclick = () => { setField('ritmo.pausaMax', String(Math.round(mx))); toast('Pausa massima impostata'); };
        return;
      }
      P.innerHTML = h;
    }
  }
  function updateCalStatus() {
    const c = state.data.cal;
    $('#calStatus').innerHTML = c && c.pxPerMm ? 'Calibrato: <b>' + fmt(c.pxPerMm, 2) + ' px/mm</b> (' + c.fonte + ') · 1 mm = ' + fmt(msPerMm()) + ' ms · ampiezze normalizzate a 10 mm/mV.' : 'Non calibrato: usa lo strumento Calibra sulla griglia.';
  }

  /* ---------------- lettura automatica del PDF ---------------- */
  async function readPdf(pageNo) {
    toast('Lettura del PDF in corso…', 8000);
    let res;
    try { res = await window.ECGPdf.analyzePdf(state.pdfBuf.slice(0), { page: pageNo, profilo: state.data.tecnica.profilo || 'auto', velocita: num(state.data.tecnica.velocita), guadagno: num(state.data.tecnica.guadagno) }); }
    catch (e) { console.error(e); toast('PDF non leggibile: ' + e.message, 5000); return null; }
    const RS = res.renderScale;
    state.data.cal = { pxPerMm: res.pxPerMm, fonte: 'PDF – ' + res.calMethod, data: new Date().toISOString() };
    state.data.tecnica.velocita = String(res.speed); state.data.tecnica.guadagno = String(res.gain);
    ['tecnica.velocita', 'tecnica.guadagno'].forEach(p => { const el = document.querySelector('[data-p="' + p + '"]'); if (el) el.value = get(state.data, p); });
    state.overlay = (res.overlay || []).map(o => Object.assign({}, o, { x: o.x != null ? o.x * RS : null, y: o.y * RS, x0: o.x0 != null ? o.x0 * RS : null, x1: o.x1 != null ? o.x1 * RS : null }));
    state.auto = summarizeAuto(res);
    renderAuto();
    toast(res.ok ? 'PDF letto: controlla i valori proposti e premi «Applica»' : 'PDF caricato: ' + (res.warnings[0] || 'lettura automatica non disponibile'), 5000);
    return res.canvas;
  }
  async function readPhoto(file) {
    toast('Lettura della foto in corso…', 10000);
    let res;
    try {
      res = await window.ECGPhoto.analyzeImageFile(file, { profilo: state.data.tecnica.profilo || 'auto', velocita: num(state.data.tecnica.velocita), guadagno: num(state.data.tecnica.guadagno) });
    } catch (e) { console.error(e); toast('Foto non leggibile: ' + e.message, 5000); return null; }
    if (res.ok && res.pxPerMm) {
      state.data.cal = { pxPerMm: res.pxPerMm, fonte: 'foto raddrizzata – ' + res.calMethod, data: new Date().toISOString() };
      state.data.tecnica.guadagno = String(res.gain);
      const el = document.querySelector('[data-p="tecnica.guadagno"]'); if (el) el.value = state.data.tecnica.guadagno;
      state.overlay = res.overlay || [];
    } else { state.data.cal = null; state.overlay = []; }
    state.auto = summarizeAuto(res);
    renderAuto();
    const q = res.quality || {};
    toast(res.ok ? 'Foto letta (qualità ' + q.level + ', ' + q.score + '/100): controlla i punti sul tracciato e premi «Applica»' : (res.warnings[0] || 'Lettura automatica non riuscita') + ' — puoi misurare con calibro e marker.', 6000);
    return res.ok ? res.canvas : (res.original || res.canvas);
  }
  function summarizeAuto(res) {
    const L = {};
    Object.keys(res.leads || {}).forEach(k => { const l = res.leads[k]; L[k] = { R: l.R, S: l.S, Q: l.Q, st: l.st, st60: l.st60, T: l.T, qrs: l.qrs, qt: l.qt, n: l.n }; });
    const r = res.rhythm;
    return {
      ok: res.ok, source: res.source || 'pdf', quality: res.quality || null, profile: res.profile || null, rotation: res.rotation, pxPerMm: res.pxPerMm,
      calMethod: res.calMethod, speed: res.speed, gain: res.gain, layout: res.layout, page: res.page, numPages: res.numPages,
      warnings: res.warnings || [], machine: res.machine || {}, textLines: res.textLines || [], leads: L, glob: res.glob || {},
      rhythm: r ? { hr: r.hr, rr: r.rr, rrMean: r.rrMean, rrVar: r.rrVar, pPresenti: r.pPresenti, pr: r.pr, pDur: r.pDur, lead: r.lead } : null
    };
  }
  const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
  function renderAuto() {
    const el = $('#autoCard'); const A = state.auto;
    if (!A) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const M = A.machine, G = A.glob, R = A.rhythm;
    const photo = A.source === 'foto';
    let h = '<h3>🤖 Lettura automatica ' + (photo ? 'della foto' : 'del PDF') + '</h3>';
    if (photo && A.quality) {
      const Q = A.quality, cls = Q.level === 'buona' ? 'normale' : Q.level === 'accettabile' ? 'moderato' : 'critico';
      h += '<div class="qbox q-' + cls + '"><b>Qualità della foto: ' + Q.score + '/100 – ' + esc(Q.level) + '</b>' +
        (Q.items && Q.items.length ? '<ul>' + Q.items.map(it => '<li><i class="dot ' + (it.punti >= 10 || (it.nome === 'Nitidezza' && it.punti >= 18) ? 'normale' : it.punti > 0 ? 'moderato' : 'critico') + '"></i>' + esc(it.nome) + ': ' + esc(it.nota) + '</li>').join('') + '</ul>' : '') + '</div>';
    }
    h += '<div class="kv"><b>Esito</b><span>' + (A.ok ? (photo ? 'tracciato letto (' : 'traccia vettoriale letta (') + Object.keys(A.leads).length + '/12 derivazioni)' : 'lettura automatica non disponibile') + '</span>' +
      (A.calMethod ? '<b>Calibrazione</b><span>' + esc(A.calMethod) + '</span>' : '') + (A.speed ? '<b>Velocità / guadagno</b><span>' + A.speed + ' mm/s · ' + A.gain + ' mm/mV</span>' : '') +
      (photo && A.rotation != null ? '<b>Raddrizzamento</b><span>rotazione ' + A.rotation + '°</span>' : '') +
      (A.layout ? '<b>Derivazioni</b><span>' + esc(A.layout === 'etichette' ? 'riconosciute dalle etichette' : A.layout === 'presunto' ? 'disposizione standard presunta' : A.layout) + '</span>' : '') + '</div>';
    if (photo) h += '<div class="actions"><select id="reProfile" class="btn sm">' + PROFILE_OPTS.map(o => '<option value="' + o[0] + '"' + ((state.data.tecnica.profilo || 'auto') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select><button class="btn sm" id="reRead">🔄 Rileggi con questo formato</button></div>';
    if (A.numPages > 1) h += '<div class="actions">' + Array.from({ length: Math.min(A.numPages, 6) }, (_, i) => '<button class="btn sm' + (i + 1 === A.page ? ' primary' : '') + '" data-pdfpage="' + (i + 1) + '">Pagina ' + (i + 1) + '</button>').join('') + '</div>';
    if (A.warnings.length) h += '<div class="disclaimer">' + A.warnings.map(esc).join('<br>') + '</div>';
    if (A.ok) {
      const row = (lab, tr, mc, u) => '<tr><td>' + lab + '</td><td>' + (tr == null ? '—' : fmt(tr) + (u || '')) + '</td>' + (photo ? '' : '<td>' + (mc == null ? '—' : fmt(mc) + (u || '')) + '</td>') + '</tr>';
      h += '<h4>Misure</h4><table class="meas auto"><tr><td></td><td><b>' + (photo ? 'Dalla foto' : 'Traccia') + '</b></td>' + (photo ? '' : '<td><b>Elettrocardiografo</b></td>') + '</tr>' +
        row('FC', R && R.hr, M.fc, ' /min') + row(photo ? 'PR (indicativo, non applicato)' : 'PR', G.pr, M.pr, ' ms') + row('QRS', G.qrs, M.qrs, ' ms') + row('QT', G.qt, M.qt, ' ms') +
        row('QTc', null, M.qtc, ' ms') + row('Asse QRS', G.asse, M.assi && M.assi.qrs, '°') + row(photo ? 'Durata P (indicativa, non applicata)' : 'Durata P', G.p, M.p, ' ms') + '</table>';
      if (photo && G.qrs != null && G.qrs >= 120) h += '<div class="disclaimer">QRS ' + fmt(G.qrs) + ' ms letto dalla foto: nei tracciati con voltaggi alti o tracce sovrapposte la foto tende a sovrastimarlo. Confrontalo con il valore stampato prima di applicarlo.</div>';
      if (R) h += '<p class="hint">Ritmo (' + esc(R.lead) + '): RR medio ' + fmt(R.rrMean) + ' ms, variabilità ' + fmt(R.rrVar) + ' ms → ' + (isIrregular(R) ? '<b>irregolare</b>' : 'regolare') + '; onde P ' + (R.pPresenti ? 'riconosciute prima di ogni QRS (PR ' + fmt(R.pr) + ' ms)' : '<b>non riconosciute</b> con certezza') + '.</p>';
      h += '<h4>Derivazioni (mm)</h4><div class="lead-table-wrap"><table class="lead-table auto"><tr><th></th><th>R</th><th>S</th><th>ST J</th><th>ST60</th><th>T</th><th>batt.</th></tr>' +
        C.LEADS.map(k => { const l = A.leads[k]; if (!l) return '<tr><td class="ln">' + k + '</td><td colspan="6" class="hint">non letta</td></tr>'; const stc = l.st > 0.05 ? 'pos' : l.st < -0.05 ? 'neg' : ''; return '<tr><td class="ln">' + k + '</td><td>' + fmt(l.R, 1) + '</td><td>' + fmt(l.S, 1) + '</td><td class="' + stc + '">' + fmt(l.st, 1) + '</td><td>' + fmt(l.st60, 1) + '</td><td>' + fmt(l.T, 1) + '</td><td>' + l.n + '</td></tr>'; }).join('') + '</table></div>';
      h += '<p class="hint">Sul tracciato: <span style="color:#16a34a">▬</span> linea di base, <span style="color:#f76b15">●</span> punto J, <span style="color:#e5484d">|</span> onde R della striscia del ritmo. Verifica che siano nei punti giusti.</p>';
      if (photo) h += '<p class="hint">Le misure stampate dall\'elettrocardiografo (FC, PR, QRS, QT/QTc, assi) restano le più affidabili: se le leggi sul foglio, inseriscile nella scheda Ritmo. Con voltaggi molto alti (QRS che invadono la riga vicina, tipico dell\'IVS) R e S non sono misurabili dalla foto: misurale con il calibro.</p>';
      h += '<div class="actions"><button class="btn primary" id="autoApply">✅ Applica tutti i valori</button><button class="btn" id="autoApplyLeads">Applica solo le derivazioni</button></div>';
    }
    h += '<div class="actions"><button class="btn sm" id="reportBad">📨 Segnala una lettura errata</button></div>';
    if (A.textLines.length) h += '<details style="margin-top:10px"><summary class="hint">Testo stampato nel PDF (' + A.textLines.length + ' righe – non viene inserito nel referto)</summary><pre class="pdftext">' + esc(A.textLines.join('\n')) + '</pre></details>';
    el.innerHTML = h;
    const ap = $('#autoApply'); if (ap) ap.onclick = () => applyAuto(true);
    const rr = $('#reRead'); if (rr) rr.onclick = async () => {
      if (!state.photoFile) return toast('Ricarica la foto per rileggerla con un altro formato');
      setField('tecnica.profilo', $('#reProfile').value);
      const c = await readPhoto(state.photoFile); if (!c) return;
      state.img = c; state.imgUrl = c.toDataURL('image/jpeg', 0.88); storeImage(); updateCalStatus(); fit(); persist();
    };
    const rb = $('#reportBad'); if (rb) rb.onclick = exportCaseReport;
    const al = $('#autoApplyLeads'); if (al) al.onclick = () => applyAuto(false);
  }
  function isIrregular(R) { return R && R.rr && R.rr.length >= 3 && R.rrVar > Math.max(120, 0.15 * R.rrMean); }
  function applyAuto(all) {
    const A = state.auto; if (!A || !A.ok) return;
    if (A.quality && A.quality.level === 'insufficiente' && !confirm('La qualità della foto è insufficiente: i valori potrebbero essere errati. Applicarli comunque?')) return;
    Object.keys(A.leads).forEach(k => {
      const l = A.leads[k];
      if (l.R != null) setField('leads.' + k + '.r', String(r1(Math.abs(l.R))));
      if (l.S != null) setField('leads.' + k + '.s', String(r1(Math.abs(l.S))));
      if (l.st != null) setField('leads.' + k + '.st', String(r1(l.st)));
      if (l.T != null) setField('leads.' + k + '.t', String(r1(l.T)));
    });
    if (A.leads.V3 && A.leads.V3.st60 != null) setField('extra.ste60V3', String(r1(A.leads.V3.st60)));
    if (all) {
      const M = A.machine, G = A.glob, R = A.rhythm;
      const pick = (m, g) => m != null ? m : (g != null ? Math.round(g) : null);
      const photo = A.source === 'foto';
      // dalla foto PR e durata della P non sono abbastanza affidabili: si misurano con il calibro o si copiano dalla stampa
      const iv = { 'intervalli.pr': photo ? null : pick(M.pr, G.pr), 'intervalli.qrs': pick(M.qrs, G.qrs), 'intervalli.qt': pick(M.qt, G.qt), 'intervalli.p': photo ? null : pick(M.p, G.p) };
      Object.keys(iv).forEach(p => { if (iv[p] != null) setField(p, String(iv[p])); });
      if (R) {
        state.data.ritmo.rrList = (R.rr || []).map(Math.round);
        setField('ritmo.rr', String(Math.round(R.rrMean)));
        setField('ritmo.fc', String(M.fc != null ? M.fc : Math.round(R.hr)));
        setField('ritmo.regolarita', isIrregular(R) ? 'irregolare' : 'regolare');
        if (R.pPresenti && /^II/.test(R.lead || '')) { setField('ritmo.ondeP', 'sinusali'); setField('ritmo.rapportoPQRS', '1:1'); }
        if (R.rr && R.rr.length) { const mx = Math.max.apply(null, R.rr); if (mx >= 1500) setField('ritmo.pausaMax', String(Math.round(mx))); }
      } else if (M.fc != null) setField('ritmo.fc', String(M.fc));
      if (M.assi && M.assi.qrs != null) setField('asse.gradi', String(M.assi.qrs));
      else if (G.asse != null) setField('asse.gradi', String(G.asse));
    }
    // istantanea dei valori proposti: al salvataggio si confrontano con quelli confermati (registro di precisione)
    if (A.source === 'foto') state.data.fotoDaVerificare = true;
    state.data.autoApplied = { src: A.source, profilo: state.data.tecnica.profilo || 'auto', qualita: A.quality ? A.quality.score : null, quando: new Date().toISOString(), valori: snapshotValues() };
    const noP = all && A.rhythm && !A.rhythm.pPresenti;
    const ph = A.source === 'foto';
    toast('Valori applicati.' + (noP ? ' Onde P non riconosciute: specificale nella scheda Ritmo.' : '') + (ph ? ' PR e durata P non applicati dalla foto: inseriscili dalla stampa dell\'elettrocardiografo o misurali con il calibro.' : ' Completa i pattern morfologici e controlla il referto.'), 6500);
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-pdfpage]'); if (!b || !state.pdfBuf) return;
    const c = await readPdf(+b.dataset.pdfpage); if (!c) return;
    state.img = c; state.imgUrl = c.toDataURL('image/jpeg', 0.88); storeImage(); updateCalStatus(); fit(); renderAuto(); persist();
  });

  /* ---------------- registro di precisione ---------------- */
  function snapshotValues() {
    const d = state.data, v = { leads: {} };
    C.LEADS.forEach(k => { const l = d.leads[k] || {}; v.leads[k] = { r: num(l.r), s: num(l.s), st: num(l.st), t: num(l.t) }; });
    v.pr = num(d.intervalli.pr); v.qrs = num(d.intervalli.qrs); v.qt = num(d.intervalli.qt); v.fc = num(d.ritmo.fc); v.asse = num(d.asse.gradi);
    return v;
  }
  function precisionDiff() {
    const a = state.data.autoApplied; if (!a) return null;
    const cur = snapshotValues(), out = { src: a.src, profilo: a.profilo, qualita: a.qualita, diff: { st: [], r: [], s: [], t: [] }, glob: {}, corretti: 0, totale: 0 };
    C.LEADS.forEach(k => ['st', 'r', 's', 't'].forEach(q => {
      const x = a.valori.leads[k] && a.valori.leads[k][q], y = cur.leads[k][q];
      if (x == null || y == null) return; out.totale++; const dlt = Math.abs(y - x); out.diff[q].push(Math.round(dlt * 10) / 10); if (dlt >= 0.1) out.corretti++;
    }));
    ['pr', 'qrs', 'qt', 'fc', 'asse'].forEach(q => { const x = a.valori[q], y = cur[q]; if (x != null && y != null) { out.glob[q] = Math.abs(y - x); out.totale++; if (Math.abs(y - x) >= 1) out.corretti++; } });
    return out;
  }
  function downloadJSON(obj, name) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function shareOrDownloadJSON(obj, name, title) {
    try {
      const file = new File([JSON.stringify(obj, null, 2)], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    downloadJSON(obj, name);
  }
  function exportCaseReport() {
    const A = state.auto || {};
    const rep = {
      tipo: 'segnalazione-lettura', app: C.META.version, criteri: C.META.criteriaVersion, data: new Date().toISOString(),
      sorgente: A.source, profilo: state.data.tecnica.profilo, qualita: A.quality, rotazione: A.rotation, pxPerMm: A.pxPerMm, avvisi: A.warnings,
      proposti: { derivazioni: A.leads, misure: A.glob, ritmo: A.rhythm && { hr: A.rhythm.hr, rrVar: A.rhythm.rrVar, pPresenti: A.rhythm.pPresenti } },
      confermati: snapshotValues(), confronto: precisionDiff(),
      nota: 'Nessun dato del paziente e nessuna immagine inclusi. Allega la foto (anonimizzata) nella chat della revisione.'
    };
    shareOrDownloadJSON(rep, 'ecgcheck-segnalazione-' + today() + '.json', 'Segnalazione lettura ECGcheck');
  }
  async function exportPrecision() {
    let all = [];
    try { all = await DB.all('cases'); } catch (e) { }
    const recs = all.filter(r => r.precisione).map(r => ({ data: (r.salvato || '').slice(0, 10), ...r.precisione }));
    shareOrDownloadJSON({ tipo: 'registro-precisione', app: C.META.version, criteri: C.META.criteriaVersion, esportato: new Date().toISOString(), casi: recs }, 'ecgcheck-precisione-' + today() + '.json', 'Registro precisione ECGcheck');
  }
  async function renderPrecision() {
    const el = $('#precView'); if (!el) return;
    let all = [];
    try { all = await DB.all('cases'); } catch (e) { el.innerHTML = '<p class="hint">Archivio non disponibile.</p>'; return; }
    const recs = all.filter(r => r.precisione);
    if (!recs.length) { el.innerHTML = '<p class="hint">Nessun dato ancora: dopo «Applica» e «Salva in archivio» l\'app confronta i valori letti automaticamente con quelli che hai confermato o corretto.</p>'; return; }
    const agg = { st: [], r: [], s: [], t: [] }, g = { qrs: [], qt: [], fc: [], pr: [] }; let corr = 0, tot = 0;
    recs.forEach(r => { const p = r.precisione; Object.keys(agg).forEach(k => agg[k].push.apply(agg[k], p.diff[k] || [])); Object.keys(g).forEach(k => { if (p.glob && p.glob[k] != null) g[k].push(p.glob[k]); }); corr += p.corretti || 0; tot += p.totale || 0; });
    const m = a => a.length ? fmt(a.reduce((x, y) => x + y, 0) / a.length, 2) : '—';
    el.innerHTML = '<table class="meas"><tr><td>Referti con lettura automatica</td><td>' + recs.length + ' (foto ' + recs.filter(r => r.precisione.src === 'foto').length + ', PDF ' + recs.filter(r => r.precisione.src !== 'foto').length + ')</td></tr>' +
      '<tr><td>Valori corretti a mano</td><td>' + corr + ' / ' + tot + ' (' + (tot ? Math.round(corr / tot * 100) : 0) + '%)</td></tr>' +
      '<tr><td>Correzione media ST</td><td>' + m(agg.st) + ' mm</td></tr><tr><td>Correzione media R / S</td><td>' + m(agg.r) + ' / ' + m(agg.s) + ' mm</td></tr><tr><td>Correzione media T</td><td>' + m(agg.t) + ' mm</td></tr>' +
      '<tr><td>Correzione media QRS / QT</td><td>' + m(g.qrs) + ' / ' + m(g.qt) + ' ms</td></tr><tr><td>Correzione media FC</td><td>' + m(g.fc) + ' /min</td></tr></table>';
  }

  /* ---------------- caricamento immagine / PDF ---------------- */
  // nuovo tracciato: le misure del tracciato precedente non devono "contaminare" il nuovo referto
  function resetMeasurements() {
    const d = state.data;
    const had = ['ritmo', 'intervalli', 'asse', 'atri', 'morfologia', 'leads', 'extra', 'pattern', 'tcl'].some(k => d[k] && Object.keys(d[k]).length);
    const b = blank();
    ['ritmo', 'intervalli', 'asse', 'atri', 'morfologia', 'leads', 'extra', 'pattern', 'tcl'].forEach(k => { d[k] = b[k]; });
    d.cal = null; delete d.autoApplied; delete d.fotoDaVerificare;
    d.tecnica = { velocita: d.tecnica.velocita || '25', guadagno: '10', profilo: d.tecnica.profilo || 'auto' };
    d.id = null; d.creato = null;
    state.overlay = []; state.auto = null;
    return had;
  }
  async function handleFile(file) {
    if (!file) return;
    try {
      const had = resetMeasurements();
      renderAllForms();
      if (had) toast('Nuovo tracciato: misure del tracciato precedente azzerate (dati paziente mantenuti).', 3500);
      let canvas;
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        state.pdfBuf = await file.arrayBuffer();
        canvas = await readPdf(1);
        if (!canvas) return;
            } else {
        state.pdfBuf = null; state.photoFile = file;
        canvas = await readPhoto(file);
        if (!canvas) return;
      }
      state.img = canvas; state.imgUrl = canvas.toDataURL('image/jpeg', 0.88);
      state.calPts = []; state.misPts = []; state.rMarks = []; state.pMarks = [];
      storeImage(); updateCalStatus();
      requestAnimationFrame(() => { resize(); fit(); setMode(state.auto && state.auto.ok ? 'pan' : state.data.cal ? 'mis' : 'cal'); });
      persist(); renderReport();
    } catch (err) { console.error(err); toast('Errore: ' + err.message, 4000); }
  }
  $('#fileCam').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
  $('#fileUp').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
  function storeImage() { DB.put('kv', state.imgUrl, 'currentImage').catch(() => { }); }
  async function imgFromUrl(url) {
    const i = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c;
  }

  /* =====================================================================
     PDF, CONDIVISIONE, STAMPA
     ===================================================================== */
  function pdfTxt(s) {
    const map = { '≥': '>=', '≤': '<=', '→': '->', '➜': '->', '—': '-', '–': '-', '′': "'", '″': '"', '✓': 'si', '·': '-', '×': 'x', 'Σ': 'Somma ', '±': '+/-', '≈': '~', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '−': '-', '²': '2', '⁺': '+', ' ': ' ' };
    return String(s == null ? '' : s).replace(/[^\x00-\xff]/g, c => map[c] != null ? map[c] : '');
  }
  const LV_RGB = { critico: [229, 72, 77], alto: [247, 107, 21], moderato: [230, 167, 0], normale: [48, 164, 108], info: [139, 147, 167] };
  async function buildPDF() {
    if (!state.result) analyze();
    const doc = new window.MiniPDF();
    const W = 210, H = 297, M = 12, CW = W - 2 * M;
    const res = state.result, d = state.data, s = res.sintesi;
    let y = 0;
    const need = h => { if (y + h > H - 16) { doc.addPage(); y = M; } };
    const text = (t, x, size, style, color, maxW) => {
      doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || [20, 24, 35]);
      const lines = doc.splitTextToSize(pdfTxt(t), maxW || CW);
      lines.forEach(l => { need(size * 0.42); doc.text(l, x, y); y += size * 0.42; });
    };
    // intestazione
    doc.setFillColor(14, 23, 38); doc.rect(0, 0, W, 24, 'F');
    doc.setFillColor(229, 72, 77); doc.roundedRect(M, 5, 14, 14, 3, 3, 'F');
    doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.9);
    doc.polyline([[M + 1, 13], [M + 4, 13], [M + 5.2, 10], [M + 7, 16], [M + 8.5, 8.5], [M + 10, 13], [M + 13, 13]]);
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('ECGcheck - Referto ECG assistito', M + 18, 11.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(pdfTxt('Analisi a regole su criteri validati in letteratura - criteri v' + C.META.criteriaVersion + ' (rev. ' + itDate(C.META.lastReview) + ')'), M + 18, 17);
    doc.text(pdfTxt(nowStr()), W - M, 11.5, { align: 'right' });
    y = 31;
    const pz = [d.paziente.codice ? 'Paziente: ' + d.paziente.codice : 'Paziente: -', d.paziente.eta ? d.paziente.eta + ' anni' : '', d.paziente.sesso === 'M' ? 'maschio' : d.paziente.sesso === 'F' ? 'femmina' : '',
      d.contesto.postCCH ? 'post-cardiochirurgia' : '', d.contesto.dolore ? 'dolore toracico' : ''].filter(Boolean).join('  |  ');
    text(pz, M, 10, 'bold');
    text('Registrazione: ' + d.tecnica.velocita + ' mm/s, ' + d.tecnica.guadagno + ' mm/mV' + (d.operatore ? '   |   Operatore: ' + d.operatore : ''), M, 9, 'normal', [90, 100, 117]);
    y += 2;
    // banner OMI
    const os = OMI_STYLE[s.omi];
    const col = s.omi === 'positivo' ? [229, 72, 77] : s.omi === 'negativo' ? [48, 164, 108] : s.omi === 'NSTEMI ad alto rischio' ? [247, 107, 21] : [91, 100, 117];
    doc.setFillColor.apply(doc, col); doc.roundedRect(M, y, CW, 17, 3, 3, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(pdfTxt(os[1] + (d.fotoDaVerificare ? ' - PROVVISORIO' : '')), M + 4, y + 7.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(doc.splitTextToSize(pdfTxt(os[2]), CW - 8)[0], M + 4, y + 13);
    y += 23;
    if (d.fotoDaVerificare) { text('REFERTO PROVVISORIO: misure lette automaticamente dalla foto e non verificate dall\'operatore.', M, 9.5, 'bold', [229, 72, 77]); y += 1; }
    text('Ritmo: ' + s.ritmo, M, 11, 'bold');
    y += 1;
    // misure (2 colonne)
    const rows = measureRows(res.misure, d);
    const half = Math.ceil(rows.length / 2);
    const y0 = y;
    doc.setFontSize(9);
    rows.forEach((r, i) => {
      const cx = i < half ? M : M + CW / 2 + 2, cy = y0 + (i % half) * 5.2;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 100, 117); doc.text(pdfTxt(r[0]), cx, cy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 24, 35); doc.text(pdfTxt(r[1]), cx + CW / 2 - 4, cy, { align: 'right' });
      doc.setDrawColor(226, 230, 238); doc.setLineWidth(0.2); doc.line(cx, cy + 1.6, cx + CW / 2 - 4, cy + 1.6);
    });
    y = y0 + half * 5.2 + 4;
    // immagine
    if (state.img) {
      const c = state.img; const k = Math.min(1, 2200 / c.width);
      const tmp = document.createElement('canvas'); tmp.width = Math.round(c.width * k); tmp.height = Math.round(c.height * k);
      const tx = tmp.getContext('2d'); tx.drawImage(c, 0, 0, tmp.width, tmp.height);
      const url = tmp.toDataURL('image/jpeg', 0.82);
      let iw = CW, ih = CW * tmp.height / tmp.width;
      if (ih > 120) { ih = 120; iw = ih * tmp.width / tmp.height; }
      need(ih + 4);
      doc.addImage(url, 'JPEG', M + (CW - iw) / 2, y, iw, ih); y += ih + 5;
    }
    // reperti
    const cats = {}; res.reperti.forEach(f => (cats[f.cat] = cats[f.cat] || []).push(f));
    need(10); text('Reperti', M, 12, 'bold'); y += 1;
    Object.values(C.CAT).forEach(cat => {
      if (!cats[cat]) return;
      need(9); y += 1.5; text(cat.toUpperCase(), M, 8.5, 'bold', [90, 100, 117]); y += 0.5;
      cats[cat].forEach(f => {
        need(8);
        doc.setFillColor.apply(doc, LV_RGB[f.livello]); doc.circle(M + 1.6, y - 1.2, 1.4, 'F');
        const sx = M + 5, sw = CW - 5;
        text(f.titolo, sx, 10, 'bold', [20, 24, 35], sw);
        f.dettagli.forEach(dt => text('- ' + dt, sx, 8.6, 'normal', [40, 46, 60], sw));
        if (f.azione) text('-> ' + f.azione, sx, 8.6, 'bold', [150, 40, 45], sw);
        if (f.rif) text(f.rif, sx, 7.6, 'italic', [110, 118, 135], sw);
        y += 2;
      });
    });
    if (d.note) { need(12); y += 2; text('Note cliniche', M, 11, 'bold'); text(d.note, M, 9.5); }
    need(16); y += 6;
    doc.setDrawColor(150, 155, 165); doc.line(W - M - 70, y, W - M, y); y += 4;
    text('Firma / timbro del medico refertante', W - M - 70, 8, 'normal', [90, 100, 117], 70);
    // piè di pagina
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 128, 145);
      doc.text(doc.splitTextToSize(pdfTxt('Strumento didattico/di supporto, NON dispositivo medico (MDR 2017/745). Interpretazione basata su misure inserite dall\'operatore; non sostituisce la refertazione medica. ECGcheck v' + C.META.version), CW - 20), M, H - 8);
      doc.text(i + '/' + n, W - M, H - 8, { align: 'right' });
    }
    return doc;
  }
  function pdfName() { return 'ECG_' + (state.data.paziente.codice || 'referto').replace(/[^\w-]+/g, '_') + '_' + today() + '.pdf'; }
  $('#pdfBtn').onclick = async () => {
    try { toast('Creazione PDF…'); const doc = await buildPDF(); doc.save(pdfName()); }
    catch (e) { console.error(e); toast('PDF non creato: ' + e.message, 5000); }
  };
  $('#shareBtn').onclick = async () => {
    try {
      const doc = await buildPDF();
      const file = new File([doc.output('blob')], pdfName(), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Referto ECG', text: 'Referto ECGcheck - ' + state.result.sintesi.ritmo });
      } else { doc.save(pdfName()); toast('Condivisione non supportata: PDF scaricato'); }
    } catch (e) { if (e.name !== 'AbortError') toast('Errore: ' + e.message, 4000); }
  };
  $('#printBtn').onclick = () => { analyze(); setTimeout(() => window.print(), 100); };

  /* =====================================================================
     ARCHIVIO
     ===================================================================== */
  function thumb() {
    if (!state.img) return null;
    const c = state.img; const k = Math.min(1, 320 / c.width);
    const t = document.createElement('canvas'); t.width = Math.round(c.width * k); t.height = Math.round(c.height * k);
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.75);
  }
  $('#saveBtn').onclick = async () => {
    analyze();
    if (!state.data.id) { state.data.id = 'ecg_' + Date.now(); state.data.creato = new Date().toISOString(); }
    const rec = { id: state.data.id, creato: state.data.creato, salvato: new Date().toISOString(), data: JSON.parse(JSON.stringify(state.data)), img: thumb(), full: state.imgUrl, sintesi: state.result.sintesi, marks: { r: state.rMarks, p: state.pMarks }, precisione: precisionDiff() };
    try { await DB.put('cases', rec); toast('Salvato in archivio'); persist(); }
    catch (e) { toast('Salvataggio non riuscito: ' + e.message); }
  };
  async function renderArchive() {
    const el = $('#archList');
    let all = [];
    try { all = await DB.all('cases'); } catch (e) { el.innerHTML = '<p class="hint">Archivio non disponibile su questo browser.</p>'; return; }
    all.sort((a, b) => (b.salvato || '').localeCompare(a.salvato || ''));
    if (!all.length) { el.innerHTML = '<p class="hint">Nessun referto salvato.</p>'; return; }
    el.innerHTML = all.map(r => '<div class="arch-item">' + (r.img ? '<img src="' + r.img + '" alt="">' : '<img alt="">') +
      '<div class="t"><b>' + esc(r.data.paziente.codice || 'Senza codice') + ' · ' + esc(r.sintesi.ritmo) + '</b><span class="hint">' + new Date(r.salvato).toLocaleString('it-IT') + ' · OMI ' + esc(r.sintesi.omi) + '</span></div>' +
      '<button class="btn sm" data-open="' + r.id + '">Apri</button><button class="btn sm danger" data-del="' + r.id + '">✕</button></div>').join('');
  }
  $('#archList').addEventListener('click', async e => {
    const o = e.target.closest('[data-open]'), dl = e.target.closest('[data-del]');
    if (o) {
      const r = await DB.get('cases', o.dataset.open); if (!r) return;
      state.data = Object.assign(blank(), r.data);
      state.rMarks = (r.marks && r.marks.r) || []; state.pMarks = (r.marks && r.marks.p) || [];
      state.calPts = []; state.misPts = []; state.overlay = []; state.auto = null; state.pdfBuf = null; renderAuto();
      const src = r.full || r.img;
      if (src) { state.img = await imgFromUrl(src); state.imgUrl = src; if (!r.full) { state.data.cal = null; state.rMarks = []; state.pMarks = []; } }
      else { state.img = null; state.imgUrl = null; }
      toast('Referto aperto');
      renderAllForms(); updateCalStatus(); analyze(); storeImage(); persist(); go('ref'); requestAnimationFrame(() => { resize(); fit(); });
    }
    if (dl && confirm('Eliminare questo referto dall\'archivio?')) { await DB.del('cases', dl.dataset.del); renderArchive(); }
  });

  function newCase() {
    if (!confirm('Iniziare un nuovo ECG? I dati non salvati in archivio andranno persi.')) return;
    const keep = { velocita: state.data.tecnica.velocita, guadagno: '10', profilo: state.data.tecnica.profilo || 'auto' };
    state.data = blank(); state.data.tecnica = keep; state.data.operatore = '';
    state.img = null; state.imgUrl = null; state.calPts = []; state.misPts = []; state.rMarks = []; state.pMarks = [];
    state.overlay = []; state.auto = null; state.pdfBuf = null; state.photoFile = null; renderAuto();
    DB.del('kv', 'currentImage').catch(() => { });
    renderAllForms(); updateCalStatus(); analyze(); persist(); draw(); renderPanel(); go('ecg');
  }
  $('#newBtn').onclick = newCase;
  $('#menuNew').onclick = () => { closeMenu(); newCase(); };

  /* =====================================================================
     NAVIGAZIONE, CATALOGO, INFO
     ===================================================================== */
  function go(tab) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
    $$('#bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    window.scrollTo(0, 0);
    if (tab === 'ecg') requestAnimationFrame(resize);
    if (tab === 'arch') renderArchive();
    if (tab === 'info') renderPrecision();
    if (tab === 'ref') analyze();
  }
  $('#bottomnav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if (b) { closeMenu(); go(b.dataset.goto); } });
  $('#menuBtn').onclick = () => $('#menu').classList.remove('hidden');
  function closeMenu() { $('#menu').classList.add('hidden'); }
  $('#menuClose').onclick = closeMenu;
  $('#menu').addEventListener('click', e => { if (e.target.id === 'menu') closeMenu(); });

  function renderCatalog() {
    let tot = 0; C.CATALOGO.forEach(c => tot += c[1].length);
    let h = '<div class="card"><h3>' + tot + ' condizioni / misure supportate</h3><p class="hint">Include tutte le 55 voci dell\'elenco PMcardio (ritmo, Queen of Hearts, conduzione, asse, misure, altro) più criteri aggiuntivi. La stima AI della FE (LVsense) non è riproducibile con regole: è sostituita dall\'inserimento della FE ecocardiografica.</p><div class="legend" style="margin-top:8px"><span><i class="dot critico"></i>critico</span><span><i class="dot alto"></i>rilevante</span><span><i class="dot moderato"></i>anomalia</span><span><i class="dot normale"></i>normale</span><span><i class="dot info"></i>misura/info</span></div></div>';
    C.CATALOGO.forEach(c => {
      h += '<div class="card"><h3>' + esc(c[0]) + ' <small class="hint">(' + c[1].length + ')</small></h3>' + c[1].map(x => '<div class="fnd" style="padding:6px 2px"><i class="dot ' + x[1] + '"></i><div>' + esc(x[0]) + '</div></div>').join('') + '</div>';
    });
    $('#catView').innerHTML = h;
  }
  function renderInfo() {
    const M = C.META; const due = today() >= M.nextReview;
    const perm = ('Notification' in window) ? Notification.permission : 'non supportate';
    let h = '<div class="card"><h3>Versione e revisione dei criteri</h3><div class="kv"><b>App</b><span>' + M.version + '</span><b>Criteri</b><span>' + M.criteriaVersion + '</span><b>Ultima revisione</b><span>' + itDate(M.lastReview) + '</span><b>Prossima revisione</b><span>' + itDate(M.nextReview) + (due ? ' ⚠️ scaduta' : '') + '</span><b>Notifiche</b><span>' + perm + '</span></div>' +
      '<div class="actions"><button class="btn sm primary" id="notifBtn">🔔 Attiva notifiche</button><button class="btn sm" id="updCheck">🔄 Verifica aggiornamenti</button></div>' +
      '<p class="hint">Revisione settimanale nella fase iniziale (poi mensile): i criteri vengono confrontati con le nuove linee guida (ESC, ACC/AHA, HRS) e la letteratura OMI. Quando la data è superata l\'app mostra un avviso e, se consentito, una notifica.</p></div>';
    h += '<div class="card"><h3>Avvertenze</h3><p>ECGcheck legge automaticamente foto e PDF dell\'ECG (visione artificiale sul dispositivo, senza intelligenza artificiale "a scatola nera") e applica criteri ECG pubblicati alle misure. I valori letti sono <b>proposte da verificare</b>: lo ST da foto ha un errore tipico di ±0,2–0,5 mm. <b>Non</b> riproduce l\'algoritmo proprietario Queen of Hearts™ (rete neurale non pubblicata). È uno strumento didattico e di supporto, non un dispositivo medico (MDR 2017/745, AI Act): la diagnosi resta medica.</p><p class="hint">I dati restano sul dispositivo (localStorage/IndexedDB). Non inserire dati identificativi.</p></div>';
    h += '<div class="card"><h3>Precisione della lettura automatica</h3><div id="precView"><p class="hint">Calcolo…</p></div><div class="actions"><button class="btn sm" id="precExport">📤 Esporta registro di precisione</button></div><p class="hint">Il registro (senza dati del paziente né immagini) serve alle revisioni periodiche per correggere e migliorare la lettura automatica.</p></div>';
    h += '<div class="card"><h3>Fonti</h3><ol class="refs">' + M.riferimenti.map(r => '<li>' + esc(r) + '</li>').join('') + '</ol></div>';
    h += '<div class="card"><h3>Registro modifiche</h3><ul class="refs"><li><b>1.2.3 (02/11/2026)</b> – Lettura FOTO: corretto il troncamento dell\'apice delle onde R/S alte (un residuo della griglia vicino alla linea di base "rubava" la traccia sui tratti ripidi: es. R di V6 13 mm letta 9,8 mm; errore medio R da 0,46 a 0,10 mm sulle foto di prova); durata del QRS non più sovrastimata dalla media mobile (+8–10 ms: QRS 90 ms letto 108–114 ms, ora 100–106 ms come nei PDF; evita falsi "ritardi di conduzione aspecifici"); righe del tracciato riconosciute anche a bassa risoluzione (~6 px/mm) con il bordo del foglio su fondo scuro e righe piatte senza impulso scartate nel profilo Automatico; con righe mancanti la qualità non può risultare "buona"; QT: la tangente della T si ferma alla fine della branca discendente e, con FC > 120/min, avviso di possibile sovrapposizione P/T (QT sovrastimato fino a ~30 ms). PDF senza etichette delle derivazioni: con il profilo ELI 280/6×2 ogni riga continua viene divisa in periferica + precordiale (prima veniva interpretata come 3×4). Criteri: recepita la V Definizione Universale di IMA (ESC/ACC/AHA/WHF, Eur Heart J 28/08/2026: IM primario/secondario/correlato a procedura) nei riferimenti e nelle note STEMI/post-cardiochirurgia, soglie ECG di STE invariate in attesa della verifica del capitolo ECG sul testo integrale; iperkaliemia/FV con riferimento ERC 2025. Test: 47 casi del motore dei criteri, 19 foto sintetiche ELI 280/3×4 (18/19 entro gli obiettivi; 1.2.2: 9/19), PDF sintetici.</li><li><b>1.2.2 (01/11/2026)</b> – Sicurezza: i valori letti automaticamente da una FOTO rendono il referto «PROVVISORIO» (scheda Referto, indicatore OMI e PDF) finché l\'operatore non conferma di averli verificati e corretti. Motivo: su 2 foto reali segnalate la lettura ha sbagliato onde P, durata del QRS, asse e ampiezze delle precordiali (voltaggi alti, foto non frontali).</li><li><b>1.2.1 (01/11/2026)</b> – Correzioni dopo segnalazione (ECG con IVS): riconoscimento automatico dello "strain" (ST discendente + T negativa asimmetrica in I, aVL, V4–V6 a R dominante); con IVS lo STE in V1–V3 è valutato con il rapporto STE/S (≥ 25%, Armstrong 2012) e lo STD in V3–V4 a R dominante in continuità con lo strain non attiva più lo STDmax V1–V4 (Meyers 2021: solo STD non spiegato da cause secondarie), con confronto relativo al QRS a parità di STD; QT corto valutato con Bazett e non con il QT modificato per QRS largo; avviso se la frequenza atriale (PP) è incoerente con la FC in conduzione 1:1; avviso per durata P > 160 ms; il caricamento di un nuovo tracciato azzera le misure del precedente (guadagno riportato a 10 mm/mV); dalla foto PR e durata P non vengono più applicati automaticamente.</li><li><b>1.2.0 (01/11/2026)</b> – Lettura automatica delle FOTO: riconoscimento del foglio, orientamento (0/90/180/270°) e raddrizzamento, calibrazione da griglia e impulso di 10 mm, separazione traccia/griglia, inseguimento della traccia, profili apparecchio (ELI 280 6×2, 6×2, 3×4+1, 3×4+3, 3×4, 12×1), indice di qualità con rifiuto delle foto mosse, misure R/S/ST/ST60/T, FC, QRS, QT, asse ai minimi quadrati. Registro di precisione (valori letti vs confermati), segnalazione delle letture errate, revisioni settimanali. Con QRS ≥ 120 ms senza morfologia indicata: avviso che lo ST può essere secondario; "Ritmo a QRS largo" con P non definite declassato ad alto con richiesta di definire le P. Validazione: 4 foto reali ELI 280 (FC ±3/min, QT ±30 ms) e foto simulate (ST errore medio 0,12–0,23 mm).</li><li><b>1.1.0 (31/10/2026)</b> – Lettura automatica degli ECG in PDF (pdf.js integrato, offline): calibrazione da griglia o impulso di taratura, riconoscimento delle derivazioni, R/S/ST/ST60/T per derivazione, ritmo, PR/QRS/QT, lettura delle misure stampate dall\'elettrocardiografo; nuovo reperto "ritmo irregolare senza P definite".</li><li><b>1.0.0 (31/10/2026)</b> – Prima versione: calibro digitale su foto/PDF, motore a regole (ritmo, OMI/STEMI-equivalenti, conduzione SA/AV/IV, asse, camere, pericardite ESC 2025, ripolarizzazione precoce, QT, canalopatie, elettroliti), referto PDF, archivio, revisione programmata.</li></ul></div>';
    h += '<div class="card"><h3>Tema</h3><div class="actions"><button class="btn sm" data-theme-set="">Automatico</button><button class="btn sm" data-theme-set="light">Chiaro</button><button class="btn sm" data-theme-set="dark">Scuro</button></div></div>';
    $('#infoView').innerHTML = h;
    $('#precExport').onclick = exportPrecision;
    renderPrecision();
    $('#notifBtn').onclick = async () => {
      if (!('Notification' in window)) return toast('Notifiche non supportate');
      const p = await Notification.requestPermission(); toast('Notifiche: ' + p); renderInfo(); checkReview(true);
    };
    $('#updCheck').onclick = async () => {
      if (!('serviceWorker' in navigator)) return toast('Service worker non disponibile');
      const r = await navigator.serviceWorker.getRegistration(); if (r) { await r.update(); toast(r.waiting ? 'Aggiornamento disponibile' : 'Nessun aggiornamento'); }
    };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-theme-set]'); if (!b) return;
    const t = b.dataset.themeSet;
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('ecgcheck.theme', t); } catch (er) { }
  });

  /* ---------------- revisione programmata e notifiche ---------------- */
  function checkReview(force) {
    const M = C.META; const due = today() >= M.nextReview;
    const b = $('#reviewBanner');
    if (due) {
      b.innerHTML = '⚠️ <b>Revisione dei criteri scaduta</b> (prevista il ' + itDate(M.nextReview) + '). Verifica la presenza di una nuova versione dell\'app.<br><button class="btn sm" id="bannerUpd">Verifica aggiornamenti</button>';
      b.classList.remove('hidden');
      $('#bannerUpd').onclick = async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); toast('Controllo eseguito'); };
      let last = null; try { last = localStorage.getItem(LS_NOTIF); } catch (e) { }
      if (('Notification' in window) && Notification.permission === 'granted' && (force || last !== today()) && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(r => r.showNotification('ECGcheck – revisione criteri', { body: 'La revisione programmata dei criteri ECG è scaduta: verifica gli aggiornamenti.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'ecgcheck-review' })).catch(() => { });
        try { localStorage.setItem(LS_NOTIF, today()); } catch (e) { }
      }
    } else b.classList.add('hidden');
  }

  /* ---------------- service worker ---------------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      const showUpd = () => { $('#updateToast').classList.remove('hidden'); };
      if (reg.waiting) showUpd();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpd(); });
      });
      $('#updateBtn').onclick = () => { if (reg.waiting) reg.waiting.postMessage('skipWaiting'); };
      setInterval(() => reg.update().catch(() => { }), 6 * 3600 * 1000);
    }).catch(() => { });
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller; // al primo avvio non ricaricare
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }

  /* =====================================================================
     AVVIO
     ===================================================================== */
  async function init() {
    try { const t = localStorage.getItem('ecgcheck.theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) { }
    $('#verLbl').textContent = 'v' + C.META.version + ' · criteri ' + C.META.criteriaVersion;
    try {
      const saved = JSON.parse(localStorage.getItem(LS_CASE) || 'null');
      if (saved && saved.data) { state.data = Object.assign(blank(), saved.data); state.rMarks = saved.rMarks || []; state.pMarks = saved.pMarks || []; state.enh = !!saved.enh; state.overlay = saved.overlay || []; state.auto = saved.auto || null; }
    } catch (e) { }
    $('#enhBtn').classList.toggle('active', state.enh);
    renderAllForms(); renderCatalog(); renderInfo(); updateCalStatus(); renderAuto();
    await DB.open();
    try { const url = await DB.get('kv', 'currentImage'); if (url) { state.img = await imgFromUrl(url); state.imgUrl = url; } } catch (e) { }
    resize(); fit(); renderPanel(); analyze(); checkReview(false); registerSW();
  }
  init();
})();
