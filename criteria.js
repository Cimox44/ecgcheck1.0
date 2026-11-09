/* =====================================================================
   ECGcheck — Motore dei criteri ECG (rule-based, letteratura validata)
   Strumento DIDATTICO / di supporto. NON è un dispositivo medico.
   Ogni regola riporta la fonte. Revisione programmata settimanale.
   ===================================================================== */
(function (root) {
  'use strict';

  const META = {
    app: 'ECGcheck',
    version: '1.3.0',
    criteriaVersion: '2026.11.3',
    lastReview: '2026-11-09',
    nextReview: '2026-11-16',
    riferimenti: [
      'Mills NL, Newby LK, Zaman S et al. Fifth Universal Definition of Myocardial Infarction (2026). ESC/ACC/AHA/WHF. Eur Heart J 2026;47:5911-5958 (online 28/08/2026), doi:10.1093/eurheartj/ehag101',
      'Thygesen K et al. Fourth Universal Definition of Myocardial Infarction (2018). Eur Heart J 2019;40:237-269 (soglie ECG di STE utilizzate dal motore)',
      'Byrne RA et al. 2023 ESC Guidelines for the management of acute coronary syndromes. Eur Heart J 2023;44:3720-3826',
      '2025 ACC/AHA/ACEP/NAEMSP/SCAI Guideline for the Management of Acute Coronary Syndromes',
      'Kontos MC et al. 2022 ACC Expert Consensus Decision Pathway on Acute Chest Pain in the ED (STEMI-equivalenti). JACC 2022',
      'Meyers HP et al. ST-depression maximal in V1–V4 is specific for OMI. J Am Heart Assoc 2021;10:e022866',
      'Smith SW et al. Smith-modified Sgarbossa rule. Ann Emerg Med 2012;60:766-776; Meyers HP et al. Am Heart J 2015;170:1255-1264',
      'Di Marco A et al. BARCELONA algorithm in LBBB. J Am Heart Assoc 2020;9:e015573',
      'Driver BE et al. 4-variable formula LAD occlusion vs normal variant STE. J Electrocardiol 2017;50:561-569',
      'Aslanger E et al. Simplified formula subtle anterior MI. Am J Cardiol 2018;122:1303-1309',
      'Aslanger E et al. A new ECG pattern indicating inferior MI (Aslanger pattern). J Electrocardiol 2020;61:41-46',
      'de Winter RJ et al. A new ECG sign of proximal LAD occlusion. N Engl J Med 2008;359:2071-2073',
      'Bischof JE, Smith SW et al. ST depression in aVL differentiates inferior STEMI from pericarditis. Am J Emerg Med 2016',
      'Kosuge M et al. Simple and accurate ECG criteria to differentiate takotsubo from anterior AMI. JACC 2010;55:2514-2516',
      'Schulz-Menger J, Imazio M et al. 2025 ESC Guidelines for the management of myocarditis and pericarditis. Eur Heart J 2025;46:3952-4041',
      'Macfarlane PW et al. The Early Repolarization Pattern: consensus paper. JACC 2015;66:470-477',
      'Zeppenfeld K et al. 2022 ESC Guidelines ventricular arrhythmias and prevention of SCD. Eur Heart J 2022;43:3997-4126',
      'Glikson M et al. 2021 ESC Guidelines on cardiac pacing and CRT. Eur Heart J 2021;42:3427-3520',
      'Kusumoto FM et al. 2018 ACC/AHA/HRS Guideline on bradycardia and cardiac conduction delay. Circulation 2019;140:e382-e482',
      'Brugada J et al. 2019 ESC Guidelines for the management of supraventricular tachycardia. Eur Heart J 2020;41:655-720',
      'Van Gelder IC et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024;45:3314-3414',
      'Surawicz B et al. AHA/ACCF/HRS Recommendations for the standardization and interpretation of the ECG, parts III–VI. JACC 2009',
      'Strauss DG et al. Defining left bundle branch block in the era of CRT. Am J Cardiol 2011;107:927-934',
      'Peguero JG, Lo Presti S et al. ECG criteria for the diagnosis of LVH. JACC 2017;69:1694-1703',
      'Hancock EW et al. AHA/ACCF/HRS Recommendations for the standardization and interpretation of the ECG. Part V: chamber hypertrophy. Circulation 2009;119:e251-e261',
      'Armstrong EJ et al. Electrocardiographic criteria for STEMI in patients with left ventricular hypertrophy. Am J Cardiol 2012;110:977-983',
      'Brugada P et al. A new approach to the differential diagnosis of a regular tachycardia with a wide QRS. Circulation 1991;83:1649-1659',
      'Vereckei A et al. New algorithm using only lead aVR for WCT. Heart Rhythm 2008;5:89-98',
      'Moccetti F et al. The Basel algorithm for WCT. JACC Clin Electrophysiol 2022;8:831-839',
      'Pava LF et al. R-wave peak time at DII for VT. Heart Rhythm 2010;7:922-926',
      'Bayés de Luna A et al. Interatrial blocks: consensus report. J Electrocardiol 2012;45:445-451',
      'Corrado D et al. Padua criteria for arrhythmogenic cardiomyopathy. Int J Cardiol 2020;319:106-114',
      'Sagie A et al. Framingham QT correction formula. Am J Cardiol 1992;70:797-801',
      'Køber L, Adamo M et al. 2026 ESC Guidelines for the management of heart failure. Eur Heart J 2026, doi:10.1093/eurheartj/ehag100',
      'Nademanee K, Wilde AAM et al. Contemporary perspectives on J-wave syndromes: an expert consensus statement (APHRS/JHRS). J Arrhythm 2026;42:e70284, doi:10.1002/joa3.70284',
      'European Resuscitation Council Guidelines 2025 (Executive Summary; Special Circumstances – iperkaliemia). Resuscitation 2025'
    ]
  };

  const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const LIMB = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];
  const PREC = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const CONTIG = [['I', 'aVL'], ['II', 'aVF'], ['III', 'aVF'], ['II', 'III'],
    ['V1', 'V2'], ['V2', 'V3'], ['V3', 'V4'], ['V4', 'V5'], ['V5', 'V6']];
  const TERR = {
    inferiore: ['II', 'III', 'aVF'],
    laterale: ['I', 'aVL', 'V5', 'V6'],
    anteriore: ['V1', 'V2', 'V3', 'V4']
  };
  const LIV = { CRIT: 'critico', ALTO: 'alto', MOD: 'moderato', NORM: 'normale', INFO: 'info' };
  const ORDINE_LIV = { critico: 0, alto: 1, moderato: 2, normale: 3, info: 4 };
  const CAT = {
    RITMO: 'Ritmo',
    OMI: 'Infarto miocardico / OMI',
    COND: 'Disturbi di conduzione',
    ASSE: 'Asse',
    CAMERE: 'Atri e ventricoli (ingrandimento / ipertrofia)',
    RIPOL: 'Ripolarizzazione e pattern speciali',
    QT: 'QT',
    FVS: 'Funzione ventricolare sinistra',
    CONTESTO: 'Contesto clinico',
    QUALITA: 'Qualità dei dati'
  };

  /* ---------- utility ---------- */
  function n(v) {
    if (v === '' || v === null || v === undefined || v === false) return null;
    if (v === true) return null;
    const x = Number(String(v).replace(',', '.'));
    return Number.isFinite(x) ? x : null;
  }
  function L(d, l) { return (d.leads && d.leads[l]) || {}; }
  function st(d, l) { return n(L(d, l).st); }
  function amp(d, l, k) { return n(L(d, l)[k]); }
  function qrsAmp(d, l) {
    const r = amp(d, l, 'r'), s = amp(d, l, 's');
    if (r === null && s === null) return null;
    return (r || 0) + (s || 0);
  }
  function stats(a) {
    if (!a || !a.length) return null;
    const media = a.reduce((x, y) => x + y, 0) / a.length;
    const sd = Math.sqrt(a.reduce((x, y) => x + (y - media) * (y - media), 0) / a.length);
    return { media, sd, min: Math.min.apply(null, a), max: Math.max.apply(null, a), n: a.length };
  }
  function r0(x) { return x === null || x === undefined ? null : Math.round(x); }
  function f1(x) { return x === null || x === undefined ? '—' : (Math.round(x * 10) / 10).toString().replace('.', ','); }
  function f2(x) { return x === null || x === undefined ? '—' : (Math.round(x * 100) / 100).toString().replace('.', ','); }

  function Findings() { this.list = []; }
  Findings.prototype.add = function (cat, id, titolo, livello, dettagli, rif, azione, tag) {
    if (this.has(id)) return;
    this.list.push({ cat, id, titolo, livello, dettagli: dettagli || [], rif: rif || '', azione: azione || '', tag: tag || '' });
  };
  Findings.prototype.has = function (id) { return this.list.some(f => f.id === id); };

  /* =====================================================================
     1. MISURE
     ===================================================================== */
  function misure(d) {
    const r = d.ritmo || {}, iv = d.intervalli || {}, a = d.atri || {};
    const m = {};
    const rrList = (r.rrList || []).map(n).filter(x => x && x > 0);
    const ppList = (r.ppList || []).map(n).filter(x => x && x > 0);
    m.rrStats = stats(rrList);
    m.ppStats = stats(ppList);

    let rr = n(r.rr);
    if (!rr && m.rrStats) rr = m.rrStats.media;
    let fc = n(r.fc);
    if (!fc && rr) fc = 60000 / rr;
    if (!rr && fc) rr = 60000 / fc;
    m.rr = rr; m.fc = fc;

    let pp = n(r.pp);
    if (!pp && m.ppStats) pp = m.ppStats.media;
    m.pp = pp;
    m.fcAtriale = n(r.fcAtriale) || (pp ? 60000 / pp : null);

    m.p = n(iv.p); m.pr = n(iv.pr); m.qrs = n(iv.qrs); m.qt = n(iv.qt);

    if (m.qt && rr) {
      const s = rr / 1000;
      m.qtcBazett = m.qt / Math.sqrt(s);
      m.qtcFridericia = m.qt / Math.cbrt(s);
      m.qtcFramingham = m.qt + 154 * (1 - s);
      m.qtcHodges = m.qt + 1.75 * (fc - 60);
      m.qtc = m.qtcFramingham;
      if (m.qrs && m.qrs >= 120) {
        m.qtModificato = m.qt - 0.5 * m.qrs; // Bogossian 2014
        m.qtcModificato = m.qtModificato + 154 * (1 - s);
      }
    }

    const ag = n((d.asse || {}).gradi);
    if (ag !== null) { m.asse = ag; m.asseFonte = 'inserito'; }
    else {
      // 1.3.0: asse esassiale ai minimi quadrati sulle periferiche disponibili (QRS netto R − Q − S;
      // guadagno √3/2 delle aumentate), con eventuali QRS netti sovrascritti nel calcolatore dell'asse
      const ANGd = { I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90 }, ov = d.asseCalc || {};
      let sxx = 0, sxy = 0, syy = 0, bx = 0, by = 0, nl = 0;
      Object.keys(ANGd).forEach(l => {
        let v = n(ov[l]);
        if (v === null) { const r = amp(d, l, 'r'), s = amp(d, l, 's'), q = amp(d, l, 'q'); if (r === null && s === null) return; v = (r || 0) - Math.abs(q || 0) - Math.abs(s || 0); }
        const t = ANGd[l] * Math.PI / 180, k = /^aV/.test(l) ? Math.sqrt(3) / 2 : 1, cx = k * Math.cos(t), cy = k * Math.sin(t);
        sxx += cx * cx; sxy += cx * cy; syy += cy * cy; bx += v * cx; by += v * cy; nl++;
      });
      const det = sxx * syy - sxy * sxy;
      if (nl >= 3 && Math.abs(det) > 1e-9) {
        const ax = (bx * syy - by * sxy) / det, ay = (by * sxx - bx * sxy) / det;
        if (Math.hypot(ax, ay) > 0.05) { m.asse = Math.round(Math.atan2(ay, ax) * 180 / Math.PI); m.asseFonte = 'calcolato (minimi quadrati, ' + nl + ' derivazioni periferiche)'; }
      }
      const rI = amp(d, 'I', 'r'), sI = amp(d, 'I', 's'), rF = amp(d, 'aVF', 'r'), sF = amp(d, 'aVF', 's');
      if (m.asse === undefined && [rI, sI, rF, sF].some(x => x !== null)) {
        const nI = (rI || 0) - (sI || 0), nF = (rF || 0) - (sF || 0);
        if (nI !== 0 || nF !== 0) {
          m.asse = Math.round(Math.atan2(2 * nF, Math.sqrt(3) * nI) * 180 / Math.PI);
          m.asseFonte = 'calcolato da QRS netto in I e aVF';
        }
      }
    }

    if (m.rrStats && rrList.length >= 3) {
      const s = m.rrStats;
      m.rrVar = s.max - s.min;
      m.regolaritaAuto = (s.max - s.min) > Math.max(120, 0.15 * s.media) ? 'irregolare' : 'regolare';
    }
    if (m.ppStats && ppList.length >= 3) m.ppVar = m.ppStats.max - m.ppStats.min;

    // coerenza: con conduzione 1:1 la frequenza atriale deve coincidere con quella ventricolare
    if (m.fcAtriale && m.fc && r.rapportoPQRS === '1:1' && Math.abs(m.fcAtriale - m.fc) > 0.25 * m.fc) m.ppIncoerente = true;

    const dep = n(a.ptfDepth), dur = n(a.ptfDur);
    if (dep !== null && dur !== null) m.ptfv1 = Math.abs(dep) * dur / 1000; // mm·s
    m.qtMm = m.qt ? m.qt / (1000 / (n((d.tecnica || {}).velocita) || 25)) : null;
    return m;
  }

  /* =====================================================================
     2. RITMO
     ===================================================================== */
  function analizzaRitmo(d, m, F, ctx) {
    const r = d.ritmo || {};
    const hr = m.fc;
    const qrs = m.qrs;
    const wide = qrs !== null && qrs >= 120;
    const P = r.ondeP || '';
    const reg = r.regolarita || m.regolaritaAuto || '';
    const rap = r.rapportoPQRS || '';
    ctx.wide = wide;

    if (r.fv) {
      ctx.ritmo = 'fv';
      F.add(CAT.RITMO, 'fv', 'Fibrillazione ventricolare', LIV.CRIT,
        ['Attività elettrica caotica senza QRS identificabili.'],
        'ERC 2025; ESC 2022 VA', 'Arresto cardiaco: defibrillazione immediata secondo algoritmo ALS.', 'arresto');
      return;
    }
    if (r.torsione) {
      ctx.ritmo = 'tdp';
      F.add(CAT.RITMO, 'tdp', 'Tachicardia ventricolare polimorfa / torsione di punta', LIV.CRIT,
        ['QRS polimorfi con rotazione dell\'asse attorno alla linea isoelettrica.',
          m.qtc ? 'QTc (Framingham) ' + r0(m.qtc) + ' ms.' : 'Valuta il QT dei battiti sinusali.'],
        'ESC 2022 VA', 'Magnesio solfato EV, correzione K+ e Mg2+, sospendere farmaci che allungano il QT; defibrillazione se instabile.');
      return;
    }
    if (hr === null) {
      F.add(CAT.QUALITA, 'no-fc', 'Frequenza cardiaca non disponibile', LIV.INFO,
        ['Misura almeno un intervallo RR (calibro) o inserisci la FC.']);
    }

    // Pacemaker
    if (['ventricolare', 'bicamerale', 'biventricolare'].includes(r.pacing)) {
      ctx.ritmo = 'paced'; ctx.paced = true;
      F.add(CAT.RITMO, 'paced', 'Ritmo da pacemaker (stimolazione ' + r.pacing + ')', LIV.MOD,
        ['Spike di stimolazione seguiti da QRS stimolato' + (hr ? ', FC ' + r0(hr) + '/min' : '') + '.',
          r.pacing === 'biventricolare' ? 'Stimolazione BiV: Sgarbossa non validato.' : 'Ischemia: applicare Sgarbossa / Smith-modified Sgarbossa (STEMI-equivalente per ACC 2022).'],
        'ESC 2021 Pacing; ACC 2022 ECDP');
      if (r.pmNoCattura) F.add(CAT.RITMO, 'pm-cattura', 'Pacemaker: perdita di cattura', LIV.CRIT,
        ['Spike non seguiti da depolarizzazione.'], 'ESC 2021 Pacing', 'Verificare soglia, elettrolita, dislocazione elettrocatetere; pacing temporaneo/epicardico se dipendente.');
      if (r.pmNoSensing) F.add(CAT.RITMO, 'pm-sensing', 'Pacemaker: undersensing', LIV.ALTO,
        ['Spike che cadono indipendentemente dall\'attività intrinseca (rischio R-su-T).'], 'ESC 2021 Pacing', 'Controllo del dispositivo / riprogrammazione sensibilità.');
      return;
    }
    if (r.pacing === 'atriale') {
      F.add(CAT.RITMO, 'paced-a', 'Stimolazione atriale (AAI/DDD con conduzione spontanea)', LIV.MOD,
        ['Spike atriali seguiti da onda P e QRS condotto.'], 'ESC 2021 Pacing');
      ctx.pacingAtriale = true;
    }

    // Fibrillazione atriale
    if (P === 'fibrillazione' || (P === 'assenti' && reg === 'irregolare' && !wide) || (P === 'assenti' && reg === 'irregolare' && wide && hr && hr <= 200)) {
      ctx.ritmo = 'fa';
      if (wide && hr && hr > 200 && (r.ondaDelta || r.qrsVariabili)) {
        F.add(CAT.RITMO, 'fa-wpw', 'Fibrillazione atriale pre-eccitata (WPW)', LIV.CRIT,
          ['Ritmo irregolarmente irregolare, QRS larghi e variabili, FC > 200/min.'],
          'ESC 2019 SVT; ESC 2024 FA',
          'EVITARE bloccanti del nodo AV (adenosina, beta-bloccanti, Ca-antagonisti, digossina, amiodarone EV). Cardioversione elettrica se instabile; procainamide/ibutilide se stabile.');
        return;
      }
      if (reg === 'regolare' && hr && hr < 60) {
        F.add(CAT.RITMO, 'fa-bav', 'FA con risposta ventricolare REGOLARE e lenta', LIV.CRIT,
          ['In FA la risposta regolare lenta suggerisce BAV completo con ritmo di scappamento.',
            'Considerare tossicità digitalica.'], 'ESC 2024 FA; ACC/AHA/HRS 2018',
          'Dosare digossinemia, K+; valutare pacing.');
        return;
      }
      let t = 'Fibrillazione atriale', id = 'fa';
      if (hr && hr > 100) { t = 'Fibrillazione atriale a risposta ventricolare rapida'; id = 'fa-rvr'; }
      else if (hr && hr < 60) { t = 'Fibrillazione atriale a bassa risposta ventricolare'; id = 'fa-slow'; }
      F.add(CAT.RITMO, id, t, LIV.ALTO,
        ['Assenza di onde P organizzate, linea di base fibrillatoria, RR irregolarmente irregolari' + (hr ? ', FC media ' + r0(hr) + '/min' : '') + '.',
          'Obiettivo controllo frequenza iniziale (lenient): FC a riposo < 110/min (ESC 2024).'],
        'ESC 2024 FA', 'Valutare stabilità emodinamica, CHA2DS2-VA, anticoagulazione; nel post-cardiochirurgia FA post-operatoria (POAF) frequente.');
      if (hr && hr >= 150) F.add(CAT.RITMO, 'fa-150', 'Risposta ventricolare ≥ 150/min', LIV.CRIT, ['Rischio di instabilità emodinamica.'], 'ESC 2024 FA', 'Cardioversione elettrica sincronizzata se instabile.');
      return;
    }

    // Flutter atriale
    if (P === 'flutter') {
      ctx.ritmo = 'flutter';
      const cond = (m.fcAtriale && hr) ? Math.round(m.fcAtriale / hr) : null;
      let t = 'Flutter atriale', id = 'flutter';
      if (hr && hr > 100) { t = 'Flutter atriale a risposta ventricolare rapida'; id = 'flutter-rvr'; }
      else if (hr && hr < 60) { t = 'Flutter atriale a bassa risposta ventricolare'; id = 'flutter-slow'; }
      F.add(CAT.RITMO, id, t, LIV.ALTO,
        ['Onde F a "dente di sega" (tipico: negative in II, III, aVF; positive in V1)' + (m.fcAtriale ? ', frequenza atriale ' + r0(m.fcAtriale) + '/min' : '') + '.',
          cond ? 'Conduzione AV stimata ' + cond + ':1' + (reg === 'irregolare' ? ' (variabile)' : '') + '.' : 'Una FC regolare ~150/min deve far sospettare flutter 2:1.'],
        'ESC 2019 SVT; ESC 2024 FA', 'Stessa gestione antitrombotica della FA.');
      if (cond === 1) F.add(CAT.RITMO, 'flutter-11', 'Flutter con conduzione 1:1', LIV.CRIT, ['Frequenza ventricolare = atriale: rischio di collasso emodinamico.'], 'ESC 2019 SVT', 'Cardioversione elettrica sincronizzata.');
      return;
    }

    // Tachicardia atriale multifocale / pacemaker migrante
    if (P === 'multiformi') {
      ctx.ritmo = 'mat';
      if (hr && hr > 100) F.add(CAT.RITMO, 'mat', 'Tachicardia atriale multifocale', LIV.ALTO,
        ['≥ 3 morfologie di onda P, PR variabile, ritmo irregolare, FC > 100/min.'],
        'ESC 2019 SVT', 'Trattare la causa (BPCO, ipossiemia, ipoMg, teofillina).');
      else F.add(CAT.RITMO, 'wap', 'Pacemaker atriale migrante', LIV.MOD,
        ['≥ 3 morfologie di onda P con FC ≤ 100/min.'], 'AHA/ACCF/HRS 2009');
      return;
    }

    // Tachicardia a QRS largo
    const sinus1to1 = P === 'sinusali' && (rap === '1:1' || rap === '');
    if (wide && hr && hr > 100 && !sinus1to1 && P !== 'ectopiche') {
      ctx.ritmo = 'tcl';
      tachicardiaQRSlargo(d, m, F, ctx);
      return;
    }

    // Ritmi sinusali
    if (P === 'sinusali') {
      ctx.ritmo = 'sinusale';
      if (hr !== null) {
        if (hr < 60) {
          F.add(CAT.RITMO, 'bradi-sin', 'Bradicardia sinusale', hr < 40 ? LIV.ALTO : LIV.MOD,
            ['Onde P sinusali (positive in I, II, aVF; negative in aVR), FC ' + r0(hr) + '/min.',
              'Per le linee guida ACC/AHA/HRS 2018 la bradicardia clinicamente rilevante è < 50/min.'],
            'AHA/ACCF/HRS 2009; ACC/AHA/HRS 2018');
        } else if (hr <= 100) {
          F.add(CAT.RITMO, 'sinusale', 'Ritmo sinusale', LIV.NORM, ['FC ' + r0(hr) + '/min, onde P sinusali.'], 'AHA/ACCF/HRS 2009');
        } else {
          F.add(CAT.RITMO, 'tachi-sin', 'Tachicardia sinusale', hr > 150 ? LIV.ALTO : LIV.MOD,
            ['FC ' + r0(hr) + '/min con onde P sinusali.', hr > 150 ? 'FC > 150/min con P "sinusali": escludere tachicardia atriale o flutter 2:1.' : 'Ricercare la causa (dolore, ipovolemia, febbre, anemia, sepsi, EP, tamponamento).'],
            'AHA/ACCF/HRS 2009');
        }
      }
      if (m.ppIncoerente) {
        F.add(CAT.QUALITA, 'pp-incoerente', 'Intervallo PP incoerente con la frequenza cardiaca', LIV.MOD,
          ['FC atriale ' + r0(m.fcAtriale) + '/min con FC ventricolare ' + r0(m.fc) + '/min e conduzione 1:1: i marker P o il valore PP sono errati (o residui di un tracciato precedente).',
            'Aritmia sinusale e frequenza atriale non valutate. Ricontrolla i marker P nella scheda ECG.'], '');
      } else if ((m.ppVar && m.ppVar > 120) || r.aritmiaSinusale) {
        F.add(CAT.RITMO, 'aritmia-sin', 'Aritmia sinusale', LIV.NORM,
          ['Variazione dei cicli PP' + (m.ppVar ? ' di ' + r0(m.ppVar) + ' ms' : '') + ' (> 120 ms o > 10%).'], 'AHA/ACCF/HRS 2009');
      }
      return;
    }

    // Ritmo atriale ectopico / tachicardia atriale
    if (P === 'ectopiche') {
      ctx.ritmo = 'atriale';
      if (hr && hr > 100) F.add(CAT.RITMO, 'ta', 'Tachicardia atriale focale', LIV.ALTO,
        ['Onde P a morfologia non sinusale prima di ogni QRS, FC ' + r0(hr) + '/min (tachicardia a RP lungo).'],
        'ESC 2019 SVT', 'DD: TRNAV atipica, PJRT. Manovre vagali/adenosina a scopo diagnostico.');
      else F.add(CAT.RITMO, 'ectopico', 'Ritmo atriale ectopico', LIV.MOD,
        ['Onde P non sinusali (es. negative in II, III, aVF) condotte 1:1' + (hr ? ', FC ' + r0(hr) + '/min' : '') + '.'], 'AHA/ACCF/HRS 2009');
      return;
    }

    // P assenti o retrograde
    if (P === 'assenti' || P === 'retrograde') {
      if (!wide) {
        ctx.ritmo = 'giunzionale';
        if (hr === null) return;
        if (hr > 100) {
          ctx.ritmo = 'tsv';
          const rp = n(r.rp);
          let tipo = 'Meccanismo non determinabile senza analisi di P.';
          if (P === 'assenti') tipo = 'P non visibili (nascoste nel QRS) o pseudo-r′ in V1 / pseudo-S in inferiori: tipico della TRNAV (rientro nodale tipico).';
          if (rp !== null && P === 'retrograde') {
            if (rp < 70) tipo = 'RP < 70 ms: favorisce TRNAV tipica (slow-fast).';
            else if (m.pr !== null && rp < m.pr) tipo = 'RP ≥ 70 ms e RP < PR (RP corto): favorisce TRAV ortodromica (via accessoria).';
            else tipo = 'RP > PR (RP lungo): DD tachicardia atriale, TRNAV atipica, PJRT.';
          }
          if (reg === 'regolare' && hr >= 140 && hr <= 160) tipo += ' FC ~150/min: escludere flutter 2:1.';
          F.add(CAT.RITMO, 'tsv', 'Tachicardia sopraventricolare (parossistica)', LIV.ALTO,
            ['Tachicardia regolare a QRS stretto, FC ' + r0(hr) + '/min.', tipo],
            'ESC 2019 SVT', 'Manovre vagali (Valsalva modificata), poi adenosina EV; cardioversione se instabile.');
        } else if (hr < 40) {
          F.add(CAT.RITMO, 'giunz-bradi', 'Bradicardia giunzionale (sospetta)', LIV.CRIT,
            ['QRS stretti senza onde P precedenti, FC ' + r0(hr) + '/min (< 40).'],
            'ACC/AHA/HRS 2018', 'Valutare farmaci (beta-bloccanti, digossina, amiodarone), K+, ischemia; pacing se sintomatico.');
        } else if (hr <= 60) {
          F.add(CAT.RITMO, 'giunz', 'Ritmo giunzionale di scappamento (sospetto)', LIV.ALTO,
            ['QRS stretti, P assenti o retrograde, FC ' + r0(hr) + '/min (40–60).'], 'AHA/ACCF/HRS 2009');
        } else {
          F.add(CAT.RITMO, 'giunz-acc', 'Ritmo giunzionale accelerato (sospetto)', LIV.ALTO,
            ['QRS stretti, P assenti o retrograde, FC ' + r0(hr) + '/min (61–100).',
              'Cause: tossicità digitalica, post-cardiochirurgia, miocardite, ischemia inferiore.'], 'AHA/ACCF/HRS 2009');
        }
        return;
      }
      // QRS largo senza P, FC ≤ 100
      ctx.ritmo = 'ventricolare';
      if (hr === null) {
        F.add(CAT.RITMO, 'qrs-largo', 'Ritmo a QRS largo', LIV.CRIT, ['QRS ≥ 120 ms senza onde P identificabili.'], 'AHA/ACCF/HRS 2009');
      } else if (hr < 40) {
        F.add(CAT.RITMO, 'idiov', 'Ritmo idioventricolare', LIV.CRIT,
          ['QRS larghi, P assenti/dissociate, FC ' + r0(hr) + '/min (< 40): scappamento ventricolare.'],
          'ACC/AHA/HRS 2018', 'Non sopprimere il ritmo di scappamento; pacing temporaneo.');
      } else {
        F.add(CAT.RITMO, 'riva', 'Ritmo idioventricolare accelerato (RIVA)', LIV.ALTO,
          ['QRS larghi, FC ' + r0(hr) + '/min (40–100/120).', 'Frequente dopo riperfusione coronarica; in genere benigno e autolimitato.'],
          'AHA/ACCF/HRS 2009');
      }
      return;
    }

    if (wide && hr !== null) {
      F.add(CAT.RITMO, 'qrs-largo', 'Ritmo a QRS largo — onde P da definire', LIV.ALTO,
        ['QRS ≥ 120 ms' + (hr ? ', FC ' + r0(hr) + '/min' : '') + '. Indica le onde P (sinusali, assenti, dissociate…) per classificare il ritmo.',
          'Con P sinusali condotte 1:1 si tratta di ritmo sinusale con disturbo di conduzione intraventricolare.'], 'AHA/ACCF/HRS 2009');
    } else if (!P && reg === 'irregolare' && hr !== null) {
      ctx.ritmo = 'irregolare';
      F.add(CAT.RITMO, 'irr-nop', 'Ritmo irregolarmente irregolare — onde P da definire', LIV.ALTO,
        ['RR irregolari' + (m.rrVar ? ' (variabilità ' + r0(m.rrVar) + ' ms)' : '') + ', FC ' + r0(hr) + '/min, onde P non identificate.',
          'Senza onde P organizzate è compatibile con fibrillazione atriale; DD: flutter a conduzione variabile, tachicardia atriale multifocale, extrasistolia frequente.'],
        'ESC 2024 FA', 'Specifica la morfologia delle onde P nella scheda Ritmo per la classificazione definitiva.');
    } else if (!P) {
      F.add(CAT.QUALITA, 'no-p', 'Morfologia delle onde P non specificata', LIV.INFO, ['Indica le onde P per classificare il ritmo.']);
    }
  }

  /* ---------- Tachicardia a QRS largo: Brugada, Vereckei, Basel, Pava ---------- */
  function tachicardiaQRSlargo(d, m, F, ctx) {
    const w = d.tcl || {};
    const c = d.contesto || {};
    const det = [];
    const pos = [];

    const brug = [];
    if (w.assenzaRS) brug.push('assenza di complessi RS in tutte le precordiali');
    if (w.rs100) brug.push('intervallo R–nadir S > 100 ms in una precordiale');
    if (w.dissociazione) brug.push('dissociazione AV');
    if (w.morfTV) brug.push('criteri morfologici di TV in V1–V2 e V6');
    if (brug.length) pos.push('Brugada 1991: ' + brug.join('; '));

    const ver = [];
    if (w.inizR_aVR) ver.push('R iniziale in aVR');
    if (w.rq40_aVR) ver.push('r o q iniziale > 40 ms in aVR');
    if (w.notch_aVR) ver.push('notch sulla branca discendente di un QRS negativo in aVR');
    if (w.vivt) ver.push('vi/vt ≤ 1');
    if (ver.length) pos.push('Vereckei aVR 2008: ' + ver.join('; '));

    const clin = !!(c.imaPregresso || c.scompenso || c.device);
    let basel = 0;
    if (clin) basel++;
    if (w.ttfpII) basel++;
    if (w.ttfpAVR) basel++;
    det.push('Algoritmo di Basilea (2022): ' + basel + '/3 criteri (clinica ad alto rischio' + (clin ? ' ✓' : '') +
      ', time-to-first-peak II > 40 ms' + (w.ttfpII ? ' ✓' : '') + ', time-to-first-peak aVR > 40 ms' + (w.ttfpAVR ? ' ✓' : '') + '). ≥ 2 = TV.');
    if (basel >= 2) pos.push('Basilea ≥ 2/3');

    if (w.rwptII) pos.push('Pava 2010: R-wave peak time in DII ≥ 50 ms');
    if (w.catture) pos.push('Battiti di cattura / fusione');
    if (w.concordanza) pos.push('Concordanza precordiale');
    const asse = m.asse;
    if ((asse !== undefined && asse !== null && (asse < -90 || asse > 180)) || w.asseNW) pos.push('Asse estremo ("terra di nessuno", −90° / ±180°)');

    if (pos.length) {
      F.add(CAT.RITMO, 'tv', 'Tachicardia ventricolare (monomorfa) probabile', LIV.CRIT,
        ['Tachicardia a QRS largo' + (m.fc ? ', FC ' + r0(m.fc) + '/min' : '') + (m.qrs ? ', QRS ' + r0(m.qrs) + ' ms' : '') + '.']
          .concat(pos.map(x => 'Positivo — ' + x)).concat(det),
        'Brugada 1991; Vereckei 2008; Moccetti 2022; Pava 2010; ESC 2022 VA',
        'Instabile: cardioversione elettrica sincronizzata. Stabile: cardioversione o procainamide/amiodarone. Mai verapamil.');
    } else {
      F.add(CAT.RITMO, 'tcl', 'Tachicardia a QRS largo — meccanismo da definire', LIV.CRIT,
        ['Nessun criterio di TV inserito. Se i criteri sono stati valutati e sono negativi, è possibile TSV con aberranza o pre-eccitazione.'].concat(det),
        'ESC 2022 VA; ESC 2019 SVT',
        'In caso di dubbio trattare come TV (ESC 2022). Nei portatori di cardiopatia strutturale la TV è la causa più probabile (≈ 80%).');
    }
  }

  /* =====================================================================
     3. CONDUZIONE SENO-ATRIALE E ATRIO-VENTRICOLARE
     ===================================================================== */
  function analizzaSAeAV(d, m, F, ctx) {
    const r = d.ritmo || {};
    const pausa = n(r.pausaMax);
    const tipoPausa = r.pausaTipo || '';

    if (tipoPausa === 'accorciamento_pp') {
      F.add(CAT.COND, 'bsa1', 'Blocco seno-atriale di II grado tipo I (Wenckebach SA)', LIV.MOD,
        ['Progressivo accorciamento dei PP seguito da pausa < 2 × PP.'], 'AHA/ACCF/HRS 2009; ACC/AHA/HRS 2018');
    } else if (tipoPausa === 'multiplo_pp') {
      F.add(CAT.COND, 'bsa2', 'Blocco seno-atriale di II grado tipo II', LIV.ALTO,
        ['Pausa' + (pausa ? ' di ' + r0(pausa) + ' ms' : '') + ' pari a un multiplo esatto del ciclo PP di base.'], 'ACC/AHA/HRS 2018');
    } else if (tipoPausa === 'non_multiplo' || (pausa && pausa >= 2000 && ctx.ritmo === 'sinusale')) {
      F.add(CAT.COND, 'arresto-sin', 'Pausa / arresto sinusale', pausa && pausa >= 3000 ? LIV.CRIT : LIV.ALTO,
        ['Pausa' + (pausa ? ' di ' + r0(pausa) + ' ms' : '') + ' non multipla del PP di base.',
          'Pause ≥ 3 s in veglia sono considerate patologiche.'], 'ACC/AHA/HRS 2018; ESC 2021 Pacing',
        'Correlare con sintomi; escludere farmaci; valutare pacing.');
    }
    if (pausa && pausa >= 5000 && ctx.ritmo === 'fa') {
      F.add(CAT.COND, 'fa-pausa', 'Pausa ≥ 5 s in fibrillazione atriale', LIV.CRIT, ['Pausa di ' + r0(pausa) + ' ms.'], 'ESC 2021 Pacing', 'Valutare indicazione a pacing.');
    }
    if (r.bradiTachi) {
      F.add(CAT.COND, 'mns', 'Malattia del nodo del seno (sindrome bradi-tachi)', LIV.ALTO,
        ['Alternanza di bradiaritmie sinusali e tachiaritmie atriali.'], 'ESC 2021 Pacing');
    }

    // AV
    if (['fa', 'flutter', 'paced', 'tcl', 'tv', 'fv', 'tdp', 'tsv', 'mat'].includes(ctx.ritmo)) return;
    const rap = r.rapportoPQRS || '';
    const prPat = r.prPattern || '';

    if (rap === 'dissociazione') {
      const fa = m.fcAtriale, fv = m.fc;
      if (fa && fv && fa > fv) {
        const sc = ctx.wide ? 'scappamento ventricolare (QRS larghi: sede infranodale)' : 'scappamento giunzionale (QRS stretti: sede spesso nodale)';
        F.add(CAT.COND, 'bav3', 'Blocco AV di III grado (completo)', LIV.CRIT,
          ['Onde P e QRS indipendenti, frequenza atriale ' + r0(fa) + '/min > ventricolare ' + r0(fv) + '/min.', 'Ritmo di ' + sc + '.'],
          'ACC/AHA/HRS 2018; ESC 2021 Pacing',
          'Pacing transcutaneo/temporaneo (epicardico se disponibile nel post-cardiochirurgia); atropina spesso inefficace nei blocchi infranodali.');
        ctx.bav = 3;
      } else {
        F.add(CAT.COND, 'dissociazione', 'Dissociazione AV (senza blocco)', LIV.ALTO,
          ['Frequenza ventricolare ≥ atriale: dissociazione per competizione (RIVA, ritmo giunzionale accelerato, TV), non blocco AV.'],
          'AHA/ACCF/HRS 2009');
      }
      return;
    }

    if (prPat === 'progressivo') {
      F.add(CAT.COND, 'bav2-1', 'Blocco AV di II grado tipo Mobitz I (Wenckebach)', LIV.MOD,
        ['Progressivo allungamento del PR fino a un\'onda P non condotta; il PR dopo la pausa è il più breve.'],
        'ACC/AHA/HRS 2018', 'Generalmente nodale; frequente in IMA inferiore e con farmaci cronotropi negativi.');
      ctx.bav = 2;
    } else if (prPat === 'costante_con_blocco') {
      F.add(CAT.COND, 'bav2-2', 'Blocco AV di II grado tipo Mobitz II', LIV.CRIT,
        ['PR costante con improvvisa onda P non condotta.', 'Sede infranodale (His-Purkinje): rischio di progressione a BAV completo.'],
        'ACC/AHA/HRS 2018; ESC 2021 Pacing', 'Indicazione a pacing (classe I) indipendentemente dai sintomi se non reversibile.');
      ctx.bav = 2;
    } else if (prPat === '2:1') {
      F.add(CAT.COND, 'bav21', 'Blocco AV 2:1 (II grado, tipo non classificabile)', LIV.CRIT,
        ['Una P condotta e una bloccata.', ctx.wide ? 'QRS largo: più probabile sede infranodale.' : 'QRS stretto con PR lungo: più probabile sede nodale.'],
        'ACC/AHA/HRS 2018', 'Atropina/sforzo migliorano la conduzione nel blocco nodale e la peggiorano nell\'infranodale.');
      ctx.bav = 2;
    } else if (prPat === 'alto_grado') {
      F.add(CAT.COND, 'bav-avanzato', 'Blocco AV avanzato / di alto grado', LIV.CRIT,
        ['≥ 2 onde P consecutive non condotte con conduzione AV parzialmente preservata.'],
        'ACC/AHA/HRS 2018; ESC 2021 Pacing', 'Pacing temporaneo se instabile; indicazione a pacing definitivo.');
      ctx.bav = 2;
    }

    if (m.pr !== null && ['sinusale', 'atriale', undefined].includes(ctx.ritmo) && !ctx.pacingAtriale) {
      if (m.pr > 200) {
        F.add(CAT.COND, 'bav1', 'Blocco AV di I grado', m.pr > 300 ? LIV.ALTO : LIV.MOD,
          ['PR ' + r0(m.pr) + ' ms (> 200 ms).', m.pr > 300 ? 'PR > 300 ms: possibile "pseudo-pacemaker syndrome".' : 'Ogni P è condotta.'],
          'AHA/ACCF/HRS 2009; ACC/AHA/HRS 2018');
        ctx.bav1 = true;
      } else if (m.pr < 120) {
        if (r.ondaDelta) {
          F.add(CAT.COND, 'wpw', 'Pre-eccitazione ventricolare (pattern Wolff-Parkinson-White)', LIV.ALTO,
            ['PR ' + r0(m.pr) + ' ms (< 120), onda delta, QRS allargato con alterazioni secondarie di ST-T.',
              'Pattern WPW se asintomatico; sindrome WPW se associata a tachiaritmie.'],
            'ESC 2019 SVT', 'In caso di FA pre-eccitata evitare bloccanti del nodo AV. Valutare stratificazione del rischio (EPS).');
          ctx.wpw = true;
        } else {
          F.add(CAT.COND, 'pr-corto', 'PR corto senza onda delta', LIV.INFO,
            ['PR ' + r0(m.pr) + ' ms: conduzione nodale accelerata, ritmo atriale basso o variante normale.'], 'AHA/ACCF/HRS 2009');
        }
      }
    }
  }

  /* =====================================================================
     4. CONDUZIONE INTRAVENTRICOLARE e ASSE
     ===================================================================== */
  function analizzaIV(d, m, F, ctx) {
    const mo = d.morfologia || {};
    const qrs = m.qrs;
    const sesso = (d.paziente || {}).sesso;
    if (ctx.paced || ctx.wpw) return;
    if (qrs === null) {
      F.add(CAT.QUALITA, 'no-qrs', 'Durata del QRS non disponibile', LIV.INFO, ['Necessaria per blocchi di branca e TV.']);
      return;
    }
    let rbbb = false, lbbb = false;

    if (mo.rsrV1 && qrs >= 120 && mo.sLarga) {
      rbbb = true;
      F.add(CAT.COND, 'bbdx', 'Blocco di branca destra completo', LIV.MOD,
        ['QRS ' + r0(qrs) + ' ms (≥ 120), rsR′ in V1–V2, S larga in I e V6.', 'ST-T discordante in V1–V3 atteso; sottoslivellamento ST in V1–V3 sproporzionato o concordante = sospetta ischemia posteriore.'],
        'AHA/ACCF/HRS 2009');
    } else if (mo.rsrV1 && qrs >= 110 && qrs < 120) {
      F.add(CAT.COND, 'bbdx-inc', 'Blocco di branca destra incompleto', LIV.MOD,
        ['QRS ' + r0(qrs) + ' ms (110–119) con morfologia rsR′ in V1.'], 'AHA/ACCF/HRS 2009');
    }

    const strauss = mo.qsV1 && mo.notchLat && qrs >= (sesso === 'F' ? 130 : 140);
    const aha = mo.qsV1 && (mo.notchLat || mo.rLargaLat) && qrs >= 120;
    if (strauss || aha) {
      lbbb = true;
      F.add(CAT.COND, 'bbsx', 'Blocco di branca sinistra completo', LIV.ALTO,
        ['QRS ' + r0(qrs) + ' ms, QS/rS in V1, R larghe con notch/slurring in I, aVL, V5–V6.',
          strauss ? 'Soddisfa anche i criteri di Strauss (QRS ≥ ' + (sesso === 'F' ? 130 : 140) + ' ms + notch medio-QRS in ≥ 2 derivazioni): "BBS vero", predittore di risposta alla CRT.' : 'Criteri AHA/ACCF/HRS 2009 (Strauss non soddisfatti).',
          'Il BBS nuovo da solo NON è più uno STEMI-equivalente (ACC 2022): applicare Sgarbossa / Smith / Barcellona.'],
        'AHA/ACCF/HRS 2009; Strauss 2011; ACC 2022 ECDP; ESC 2023 ACS');
    } else if (mo.qsV1 && qrs >= 110 && qrs < 120) {
      F.add(CAT.COND, 'bbsx-inc', 'Blocco di branca sinistra incompleto', LIV.ALTO,
        ['QRS ' + r0(qrs) + ' ms (110–119) con morfologia BBS-simile, assenza di q settale in I, V5–V6.'], 'AHA/ACCF/HRS 2009');
    }

    if (!rbbb && !lbbb && qrs > 110 && !F.has('bbdx-inc') && !F.has('bbsx-inc') && !['tcl', 'tv', 'ventricolare'].includes(ctx.ritmo)) {
      F.add(CAT.COND, 'ivcd', 'Ritardo di conduzione intraventricolare aspecifico', LIV.MOD,
        ['QRS ' + r0(qrs) + ' ms (> 110) senza morfologia tipica di blocco di branca.', 'Considerare iperkaliemia, farmaci bloccanti i canali del Na+, cardiomiopatia.'],
        'AHA/ACCF/HRS 2009');
    }
    ctx.rbbb = rbbb; ctx.lbbb = lbbb;

    // Emiblocchi
    const asse = m.asse;
    let lafb = false, lpfb = false;
    if (asse !== undefined && asse !== null) {
      if (asse <= -45 && asse >= -90 && mo.qrAVL && !lbbb) {
        lafb = true;
        F.add(CAT.COND, 'eas', 'Emiblocco anteriore sinistro', LIV.NORM,
          ['Asse ' + asse + '° (tra −45° e −90°), qR in aVL, rS in II, III, aVF.'], 'AHA/ACCF/HRS 2009');
      }
      if (asse >= 90 && asse <= 180 && mo.rsIaVL && mo.qrIIIaVF && !lbbb && !ctx.rvhProbabile) {
        lpfb = true;
        F.add(CAT.COND, 'eps', 'Emiblocco posteriore sinistro', LIV.ALTO,
          ['Asse ' + asse + '° (+90°/+180°), rS in I e aVL, qR in III e aVF.', 'Diagnosi di esclusione: escludere IVD, cuore verticale, IM laterale estesa.'],
          'AHA/ACCF/HRS 2009');
      }
    }
    if (rbbb && (lafb || lpfb)) {
      const nome = 'Blocco bifascicolare (BBDx + ' + (lafb ? 'EAS' : 'EPS') + ')';
      if (ctx.bav1) {
        F.add(CAT.COND, 'bifasc-bav1', nome + ' con BAV di I grado', LIV.CRIT,
          ['Corrisponde al "blocco trifascicolare (BBDx + ' + (lafb ? 'LAFB' : 'LPFB') + ' + BAV1)" dell\'elenco PMcardio.',
            'Le linee guida ESC 2021 sconsigliano il termine "trifascicolare" (il BAV I può essere nodale).'],
          'ESC 2021 Pacing; ACC/AHA/HRS 2018', 'In presenza di sincope: studio elettrofisiologico (HV ≥ 70 ms) o pacing.');
      } else {
        F.add(CAT.COND, 'bifasc', nome, LIV.ALTO, ['Conduzione affidata a un solo fascicolo.'], 'ESC 2021 Pacing; ACC/AHA/HRS 2018');
      }
    }
    if (mo.bbAlternante) {
      F.add(CAT.COND, 'bb-alternante', 'Blocco di branca alternante (vero blocco trifascicolare)', LIV.CRIT,
        ['Alternanza BBDx / BBSx su tracciati successivi.'], 'ESC 2021 Pacing', 'Indicazione a pacing (classe I).');
    }
  }

  function analizzaAsse(d, m, F) {
    const a = m.asse;
    if (a === undefined || a === null) return;
    const det = ['Asse QRS ' + a + '° (' + m.asseFonte + ').'];
    if (a >= -30 && a <= 90) F.add(CAT.ASSE, 'asse-n', 'Asse normale', LIV.NORM, det, 'AHA/ACCF/HRS 2009');
    else if (a < -30 && a >= -90) F.add(CAT.ASSE, 'asse-sx', 'Deviazione assiale sinistra', LIV.ALTO, det.concat(['Cause: EAS, IVS, IM inferiore, pre-eccitazione.']), 'AHA/ACCF/HRS 2009');
    else if (a > 90 && a <= 180) F.add(CAT.ASSE, 'asse-dx', 'Deviazione assiale destra', LIV.ALTO, det.concat(['Cause: IVD, EPS, EP acuta, IM laterale, BPCO, destrocardia/inversione elettrodi.']), 'AHA/ACCF/HRS 2009');
    else F.add(CAT.ASSE, 'asse-estremo', 'Deviazione assiale estrema (asse "nord-ovest")', LIV.CRIT, det.concat(['Fortemente suggestiva di TV se QRS largo; escludere inversione degli elettrodi.']), 'AHA/ACCF/HRS 2009');
  }

  /* =====================================================================
     5. ATRI E VENTRICOLI
     ===================================================================== */
  function analizzaCamere(d, m, F, ctx) {
    const a = d.atri || {};
    const sesso = (d.paziente || {}).sesso;
    const eta = n((d.paziente || {}).eta);
    // Atri
    if (!['fa', 'flutter'].includes(ctx.ritmo)) {
      const pII = n(a.pAmpII), pV1 = n(a.pAmpV1);
      if ((pII !== null && pII > 2.5) || (pV1 !== null && pV1 > 1.5)) {
        F.add(CAT.CAMERE, 'iad', 'Ingrandimento atriale destro (P "polmonare")', LIV.MOD,
          [(pII !== null ? 'P in II ' + f1(pII) + ' mm (> 2,5). ' : '') + (pV1 !== null ? 'Componente positiva di P in V1 ' + f1(pV1) + ' mm (> 1,5).' : '')],
          'AHA/ACCF/HRS 2009');
      }
      const lae = [];
      if (m.p !== null && m.p > 160) F.add(CAT.QUALITA, 'p-insolita', 'Durata dell\'onda P insolita (' + r0(m.p) + ' ms)', LIV.INFO,
        ['Valori > 160 ms sono rari: verificare la misura (inizio/fine della P) prima di diagnosticare anomalia atriale o blocco interatriale.'], '');
      if (m.p !== null && m.p >= 120) lae.push('durata P ' + r0(m.p) + ' ms (≥ 120)');
      if (m.ptfv1 !== undefined && m.ptfv1 >= 0.04) lae.push('PTFV1 ' + f2(m.ptfv1) + ' mm·s (≥ 0,04)');
      if (a.pNotch) lae.push('P bifida in II ("P mitrale")');
      if (lae.length) {
        F.add(CAT.CAMERE, 'ias', 'Ingrandimento atriale sinistro / anomalia atriale sinistra', LIV.MOD, ['Criteri: ' + lae.join('; ') + '.'], 'AHA/ACCF/HRS 2009');
      }
      if (m.p !== null && m.p >= 120) {
        if (a.pBifInf) F.add(CAT.CAMERE, 'bia-avanzato', 'Blocco interatriale avanzato (sindrome di Bayés)', LIV.ALTO,
          ['P ≥ 120 ms con morfologia bifasica (+/−) in II, III, aVF.', 'Associato a FA e ictus cardioembolico.'], 'Bayés de Luna 2012 (consenso ISHNE)');
        else F.add(CAT.CAMERE, 'bia-parziale', 'Blocco interatriale parziale', LIV.MOD, ['P ≥ 120 ms senza componente negativa terminale in inferiori.'], 'Bayés de Luna 2012');
      }
    }

    // IVS
    if (ctx.lbbb || ctx.paced || ctx.wpw) {
      if (Object.keys(d.leads || {}).length) F.add(CAT.CAMERE, 'ivs-nv', 'Criteri di voltaggio per IVS non applicabili', LIV.INFO, ['Non validati in presenza di BBS, ritmo stimolato o pre-eccitazione.'], 'AHA/ACCF/HRS 2009');
    } else {
      const SV1 = amp(d, 'V1', 's'), RV5 = amp(d, 'V5', 'r'), RV6 = amp(d, 'V6', 'r');
      const RaVL = amp(d, 'aVL', 'r'), SV3 = amp(d, 'V3', 's'), SV4 = amp(d, 'V4', 's');
      const crit = [];
      if (SV1 !== null && (RV5 !== null || RV6 !== null)) {
        const v = SV1 + Math.max(RV5 || 0, RV6 || 0);
        if (v >= 35) crit.push('Sokolow-Lyon SV1 + RV5/V6 = ' + f1(v) + ' mm (≥ 35)');
      }
      if (RaVL !== null && SV3 !== null) {
        const cv = RaVL + SV3;
        const sog = sesso === 'F' ? 20 : 28;
        if (cv > sog) crit.push('Cornell RaVL + SV3 = ' + f1(cv) + ' mm (> ' + sog + ')');
        if (m.qrs) {
          const cp = (cv + (sesso === 'F' ? 6 : 0)) * m.qrs;
          if (cp >= 2440) crit.push('Prodotto di Cornell = ' + r0(cp) + ' mm·ms (≥ 2440)');
        }
      }
      if (RaVL !== null && RaVL > 11) crit.push('R in aVL = ' + f1(RaVL) + ' mm (> 11)');
      // Peguero-Lo Presti
      let deep = null, deepLead = null;
      LEADS.forEach(l => { const s = amp(d, l, 's'); if (s !== null && (deep === null || s > deep)) { deep = s; deepLead = l; } });
      if (deep !== null && SV4 !== null) {
        const plp = deepLead === 'V4' ? 2 * SV4 : deep + SV4;
        const sog = sesso === 'F' ? 23 : 28;
        if (plp >= sog) crit.push('Peguero-Lo Presti S più profonda (' + deepLead + ') + SV4 = ' + f1(plp) + ' mm (≥ ' + sog + ')');
      }
      // pattern "strain": ST sottoslivellato discendente con T negativa asimmetrica nelle derivazioni a R dominante (I, aVL, V4–V6)
      const strainLeads = ['I', 'aVL', 'V4', 'V5', 'V6'].filter(l => st(d, l) !== null && st(d, l) <= -0.5 && amp(d, l, 't') !== null && amp(d, l, 't') <= -1 && (amp(d, l, 'r') || 0) > (amp(d, l, 's') || 0));
      const strain = !!(d.pattern && d.pattern.strain) || (strainLeads.length >= 2 && strainLeads.some(l => ['V5', 'V6'].includes(l)));
      ctx.strain = strain; ctx.strainLeads = strainLeads;
      if (crit.length) {
        ctx.lvh = true;
        const det = ['Criteri positivi: ' + crit.join('; ') + '.'];
        if (eta !== null && eta < 35) det.push('Età < 35 anni: i criteri di voltaggio hanno bassa specificità.');
        if (strain) det.push('Pattern "strain"' + (strainLeads.length ? ' in ' + strainLeads.join(', ') : '') + ': ST discendente con T negativa asimmetrica nelle derivazioni a R dominante (alterazioni secondarie della ripolarizzazione).');
        F.add(CAT.CAMERE, 'ivs', strain ? 'Ipertrofia ventricolare sinistra con alterazioni della ripolarizzazione ("strain")' : 'Ipertrofia ventricolare sinistra (criteri ECG)', LIV.MOD, det.concat(strain ? ['Lo strain si associa a maggiore massa ventricolare e a prognosi peggiore; ST e T sono discordanti al QRS (secondari).'] : []),
          'Hancock EW et al. AHA/ACCF/HRS 2009 (parte V); Peguero-Lo Presti JACC 2017', 'Confermare con ecocardiogramma; l\'IVS può simulare/mascherare ischemia (ST secondario): confrontare con ECG precedenti.');
      } else if (strain && strainLeads.length) {
        ctx.strainNoVolt = true;
        F.add(CAT.RIPOL, 'strain-novolt', 'Sottoslivellamento ST con T negativa asimmetrica laterale (pattern tipo "strain")', LIV.MOD,
          ['ST discendente con T negativa in ' + strainLeads.join(', ') + ' (derivazioni a R dominante).',
            'DD: IVS (i criteri di voltaggio hanno sensibilità < 50%: verificare R e S, anche se le tracce si sovrappongono), ischemia subendocardica, digitale, cardiomiopatia ipertrofica.'],
          'Hancock EW et al. AHA/ACCF/HRS 2009 (parte V)', 'Confrontare con ECG precedenti, troponina se clinica compatibile, ecocardiogramma.');
      }
    }

    // IVD
    if (!ctx.rbbb && !ctx.paced) {
      const RV1 = amp(d, 'V1', 'r'), SV1 = amp(d, 'V1', 's'), SV5 = amp(d, 'V5', 's'), SV6 = amp(d, 'V6', 's');
      const c = [];
      if (RV1 !== null && RV1 >= 7) c.push('R in V1 ≥ 7 mm');
      if (RV1 !== null && SV1 !== null && SV1 > 0 && RV1 / SV1 > 1 && (m.qrs === null || m.qrs < 120)) c.push('R/S in V1 > 1');
      if ((SV5 !== null && SV5 >= 7) || (SV6 !== null && SV6 >= 7)) c.push('S in V5 o V6 ≥ 7 mm');
      if (RV1 !== null && (SV5 !== null || SV6 !== null) && RV1 + Math.max(SV5 || 0, SV6 || 0) > 10.5) c.push('RV1 + SV5/V6 > 10,5 mm');
      if (m.asse !== undefined && m.asse !== null && m.asse >= 110 && m.asse <= 180) c.push('asse ≥ +110°');
      if (c.length >= 2 && ctx.lvh) {
        F.add(CAT.CAMERE, 'ivd-poss', 'Possibile ipertrofia biventricolare (criteri di IVD in presenza di IVS)', LIV.INFO,
          ['Criteri di IVD: ' + c.join('; ') + '.', 'Con IVS i criteri di IVD hanno bassa sensibilità e specificità: confermare con ecocardiogramma; verificare che le S in V5–V6 non siano misure errate (tracce sovrapposte).'],
          'Hancock EW et al. AHA/ACCF/HRS 2009 (parte V)');
      } else if (c.length >= 2) {
        ctx.rvhProbabile = true;
        F.add(CAT.CAMERE, 'ivd', 'Ipertrofia ventricolare destra probabile', LIV.MOD, ['Criteri: ' + c.join('; ') + '.', 'DD della R dominante in V1: IM posteriore, BBDx, WPW, cardiomiopatia ipertrofica, destrocardia.'], 'AHA/ACCF/HRS 2009');
      } else if (c.length === 1) {
        F.add(CAT.CAMERE, 'ivd-poss', 'Ipertrofia ventricolare destra possibile (1 criterio)', LIV.INFO, ['Criterio: ' + c[0] + '.'], 'AHA/ACCF/HRS 2009');
      }
    }

    // Bassi voltaggi
    const limb = LIMB.map(l => qrsAmp(d, l));
    const prec = PREC.map(l => qrsAmp(d, l));
    const lowLimb = limb.every(x => x !== null) && limb.every(x => x < 5);
    const lowPrec = prec.every(x => x !== null) && prec.every(x => x < 10);
    if (lowLimb || lowPrec) {
      const p = d.pattern || {};
      F.add(CAT.CAMERE, 'bassi-volt', 'Bassi voltaggi del QRS' + (lowLimb && lowPrec ? ' (periferici e precordiali)' : lowLimb ? ' (periferici)' : ' (precordiali)'), LIV.MOD,
        ['QRS < 5 mm in tutte le periferiche' + (lowPrec ? ' e/o < 10 mm in tutte le precordiali' : '') + '.',
          'Cause: versamento pericardico, obesità, BPCO/enfisema, amiloidosi, mixedema, edema anasarcatico.'], 'AHA/ACCF/HRS 2009');
      if (p.alternanza && m.fc && m.fc > 100) {
        F.add(CAT.CAMERE, 'tamponamento', 'Sospetto tamponamento cardiaco', LIV.CRIT,
          ['Triade: bassi voltaggi + alternanza elettrica + tachicardia sinusale.'],
          'ESC 2025 Miocarditi e Pericarditi', 'Ecocardiogramma urgente. Nel post-cardiochirurgia considerare tamponamento (anche localizzato) e revisione chirurgica.');
      }
    }
    if (amp(d, 'V3', 'r') !== null && amp(d, 'V3', 'r') <= 3 && !ctx.lbbb) {
      F.add(CAT.CAMERE, 'scarsa-r', 'Scarsa progressione dell\'onda R', LIV.INFO, ['R in V3 ≤ 3 mm.', 'Cause: IM anteriore pregresso, IVS, BBS, errato posizionamento elettrodi, BPCO.'], 'AHA/ACCF/HRS 2009');
    }
  }

  /* =====================================================================
     6. ISCHEMIA / OMI
     ===================================================================== */
  function sogliaSTE(l, sesso, eta) {
    if (l === 'V2' || l === 'V3') {
      if (sesso === 'F') return 1.5;
      if (eta !== null && eta < 40) return 2.5;
      return 2.0;
    }
    return 1.0;
  }
  function territorioDi(leads) {
    const t = [];
    Object.keys(TERR).forEach(k => { if (TERR[k].some(l => leads.includes(l))) t.push(k); });
    return t;
  }

  function sgarbossa(d, F, ctx) {
    const hits = [], barc = [];
    let sgScore = 0;
    let c5 = false, c3 = false, c2 = false;
    LEADS.forEach(l => {
      const r = amp(d, l, 'r'), s = amp(d, l, 's'), stv = st(d, l);
      if (stv === null || (r === null && s === null)) return;
      const rr = r || 0, ss = s || 0;
      const pos = rr >= ss;
      const maxRS = Math.max(rr, ss);
      if (pos && stv >= 1) { hits.push(l + ': STE concordante ' + f1(stv) + ' mm'); c5 = true; }
      if (!pos && stv <= -1 && ['V1', 'V2', 'V3'].includes(l)) { hits.push(l + ': STD concordante ' + f1(stv) + ' mm in V1–V3'); c3 = true; }
      if (!pos && stv >= 1 && ss > 0 && stv / ss >= 0.25) hits.push(l + ': STE discordante con rapporto ST/S = ' + f2(stv / ss) + ' (≥ 0,25)');
      if (!pos && stv >= 5) c2 = true;
      // Barcellona (solo BBS)
      if ((pos && stv >= 1) || (!pos && stv <= -1)) barc.push(l + ': deviazione ST concordante ≥ 1 mm');
      else if (Math.abs(stv) >= 1 && maxRS <= 6) barc.push(l + ': deviazione ST discordante ≥ 1 mm con max(R|S) ≤ 6 mm');
    });
    sgScore = (c5 ? 5 : 0) + (c3 ? 3 : 0) + (c2 ? 2 : 0);
    const label = ctx.paced ? 'ritmo stimolato (VD)' : 'BBS';
    if (hits.length) {
      F.add(CAT.OMI, 'smith-sgarbossa', 'STEMI-equivalente: Smith-modified Sgarbossa positivo (' + label + ')', LIV.CRIT,
        hits.concat(['Sgarbossa originale: punteggio ' + sgScore + (sgScore >= 3 ? ' (≥ 3, positivo)' : ' (< 3)') + '.',
          'Smith-modified: sensibilità ~80–91%, specificità ~90–99% per occlusione coronarica acuta.']),
        'Smith 2012; Meyers 2015; ACC 2022 ECDP; ESC 2023 ACS', 'Attivare il percorso STEMI / emodinamica.', 'omi');
    }
    if (!ctx.paced && barc.length && !hits.length) {
      F.add(CAT.OMI, 'barcelona', 'Algoritmo di Barcellona positivo (BBS)', LIV.CRIT,
        barc.concat(['Algoritmo derivato e validato internamente (sens. 93–95%, spec. 89–94%); validazione esterna limitata.']),
        'Di Marco A et al. JAHA 2020', 'Discutere con emodinamista; considerare angiografia urgente.', 'omi');
    } else if (!ctx.paced && barc.length && hits.length) {
      F.list.find(f => f.id === 'smith-sgarbossa').dettagli.push('Anche l\'algoritmo di Barcellona è positivo: ' + barc.join('; ') + '.');
    }
    if (!hits.length && !barc.length) {
      const anyST = LEADS.some(l => st(d, l) !== null);
      if (anyST) F.add(CAT.OMI, 'sgarbossa-neg', 'Sgarbossa / Smith-modified / Barcellona negativi (' + label + ')', LIV.INFO,
        ['Un risultato negativo non esclude l\'IMA: ripetere ECG, troponina, ecocardiogramma.'], 'Smith 2012; Di Marco 2020');
    }
  }

  function analizzaIschemia(d, m, F, ctx) {
    const p = d.pattern || {};
    const ex = d.extra || {};
    const sesso = (d.paziente || {}).sesso;
    const eta = n((d.paziente || {}).eta);
    const stv = {};
    LEADS.forEach(l => { stv[l] = st(d, l); });
    const nST = LEADS.filter(l => stv[l] !== null).length;
    ctx.nST = nST;

    if (ctx.lbbb || ctx.paced) {
      sgarbossa(d, F, ctx);
      // pattern-based items still valid
    }

    // QRS largo senza morfologia definita: lo ST può essere secondario (BBDx/BBSx non indicati)
    const wideUndef = m.qrs !== null && m.qrs >= 120 && !ctx.lbbb && !ctx.rbbb && !ctx.paced && !ctx.wpw;
    if (wideUndef && nST) F.add(CAT.OMI, 'st-qrs-largo', 'QRS largo: valutazione dello ST da confermare', LIV.ALTO,
      ['QRS ' + r0(m.qrs) + ' ms senza morfologia indicata: le alterazioni dello ST potrebbero essere secondarie al disturbo di conduzione.',
        'Indica nella scheda Ritmo la morfologia (BBDx: rsR′ in V1; BBSx: QS/rS in V1 con R larghe laterali). Con BBSx si applicano Sgarbossa/Smith/Barcellona.'],
      'AHA/ACCF/HRS 2009; ACC 2022 ECDP');
    if (!ctx.lbbb && !ctx.paced && !ctx.wpw && nST) {
      // STEMI (IV Definizione Universale)
      const steOK = LEADS.filter(l => l !== 'aVR' && stv[l] !== null && stv[l] >= sogliaSTE(l, sesso, eta));
      const coppie = CONTIG.filter(c => steOK.includes(c[0]) && steOK.includes(c[1]));
      const leadsStemi = Array.from(new Set([].concat.apply([], coppie)));
      const stdLeads = LEADS.filter(l => l !== 'aVR' && stv[l] !== null && stv[l] <= -0.5);
      // IVS: STE in V1–V3 discordante a S profonde è atteso; ischemico se STE/S ≥ 25% (Armstrong 2012)
      let lvhSte = null;
      if (leadsStemi.length && ctx.lvh && leadsStemi.every(l => ['V1', 'V2', 'V3'].includes(l))) {
        const rat = leadsStemi.map(l => { const S = amp(d, l, 's'); return S ? { l, r: stv[l] / S, S } : null; });
        if (rat.every(x => x)) {
          const mx = rat.reduce((a, b) => b.r > a.r ? b : a);
          lvhSte = { ok: mx.r >= 0.25, txt: rat.map(x => x.l + ' ' + f1(stv[x.l]) + '/' + f1(x.S) + ' mm = ' + r0(x.r * 100) + '%').join(', ') };
        }
      }
      if (lvhSte && !lvhSte.ok) {
        F.add(CAT.OMI, 'ste-ivs', 'Sopraslivellamento ST in V1–V3 proporzionato alla IVS (non criteri di STEMI)', LIV.MOD,
          ['STE discordante alle onde S profonde: rapporto STE/S ' + lvhSte.txt + ' (tutti < 25%).',
            'Nell\'IVS lo STE in V1–V3 è atteso; il rapporto STE/S ≥ 25% identifica meglio l\'occlusione (Armstrong 2012).'],
          'Armstrong EJ et al. Am J Cardiol 2012;110:977-83; ESC 2023 ACS', 'Se clinica compatibile: ECG seriati, confronto con ECG precedenti, troponina, ecocardiogramma.');
      }
      if (leadsStemi.length && !(lvhSte && !lvhSte.ok)) {
        const terr = territorioDi(leadsStemi);
        const det = ['Sopraslivellamento ST al punto J in derivazioni contigue: ' + leadsStemi.map(l => l + ' ' + f1(stv[l]) + ' mm').join(', ') + '.',
          'Soglie: ≥ 1 mm in tutte le derivazioni; in V2–V3 ≥ 2 mm (uomini ≥ 40 a), ≥ 2,5 mm (uomini < 40 a), ≥ 1,5 mm (donne).' + (!sesso ? ' Sesso non indicato: applicata soglia maschile ≥ 40 a.' : ''),
          'Territorio: ' + terr.join(', ') + '.',
          'V Definizione Universale (2026): l\'IM è ora classificato come primario, secondario o correlato a procedura; le soglie di STE applicate sono quelle della IV UDMI (verifica del capitolo ECG della V UDMI sul testo integrale in corso).'];
        if (stdLeads.length) det.push('Sottoslivellamento reciproco in ' + stdLeads.join(', ') + ' (aumenta la specificità per IMA vs mimics).');
        if (lvhSte && lvhSte.ok) det.push('IVS presente: rapporto STE/S ' + lvhSte.txt + ' (≥ 25% → sproporzionato, Armstrong 2012).');
        else if (ctx.lvh) det.push('IVS presente: parte dello STE può essere secondario; valutare il rapporto STE/S (≥ 25% in V1–V3) e il confronto con ECG precedenti.');
        if (terr.includes('inferiore')) {
          if (stv.III !== null && stv.II !== null && stv.III > stv.II) det.push('STE III > II: probabile occlusione della coronaria destra.');
          const v4r = n(ex.stV4R);
          const sogR = (sesso !== 'F' && eta !== null && eta < 30) ? 1 : 0.5;
          if ((v4r !== null && v4r >= sogR) || (stv.V1 !== null && stv.V1 >= 1)) {
            det.push('Coinvolgimento del ventricolo destro (' + (v4r !== null && v4r >= sogR ? 'STE V4R ' + f1(v4r) + ' mm' : 'STE in V1') + '): evitare nitrati e diuretici, sostenere il precarico.');
          } else det.push('Registrare V3R–V4R per escludere infarto del VD.');
        }
        if (terr.includes('anteriore') && stv.aVL !== null && stv.aVL >= 1 && ['II', 'III', 'aVF'].some(l => stv[l] !== null && stv[l] <= -0.5)) {
          det.push('STE in aVL con sottoslivellamento inferiore: occlusione prossimale della IVA (prima di D1).');
        }
        F.add(CAT.OMI, 'stemi', 'STEMI (criteri della IV Definizione Universale di IMA)', LIV.CRIT, det,
          'IV UDMI 2018; V UDMI 2026; ESC 2023 ACS; ACC/AHA 2025 ACS', 'Attivare la rete STEMI: angioplastica primaria (obiettivo diagnosi→filo ≤ 90 min ESC 2023).', 'omi');
      }

      // Posteriore (V7–V9)
      const post = n(ex.stPost);
      if (post !== null) {
        const sogP = (sesso !== 'F' && eta !== null && eta < 40) ? 1 : 0.5;
        if (post >= sogP) F.add(CAT.OMI, 'post-v7', 'STEMI posteriore (V7–V9)', LIV.CRIT,
          ['STE ' + f1(post) + ' mm in V7–V9 (soglia ' + f1(sogP) + ' mm).'], 'IV UDMI 2018; ESC 2023 ACS', 'Attivare la rete STEMI.', 'omi');
      }

      // STDmax V1–V4 = OMI posteriore
      const stdAnt = ['V1', 'V2', 'V3', 'V4'].filter(l => stv[l] !== null && stv[l] < 0);
      if (stdAnt.length) {
        const maxAnt = Math.min.apply(null, stdAnt.map(l => stv[l]));
        const lat = ['V5', 'V6'].filter(l => stv[l] !== null).map(l => stv[l]);
        const maxLat = lat.length ? Math.min.apply(null, lat.concat([0])) : 0;
        const leadMax = stdAnt.find(l => stv[l] === maxAnt);
        // a parità (< 0,5 mm) si confronta lo STD relativo al QRS (Meyers 2021)
        const rel = l => { const q = Math.max(amp(d, l, 'r') || 0, amp(d, l, 's') || 0); return q > 0 ? -stv[l] / q : null; };
        let antWins = maxAnt < maxLat;
        const latLead = ['V5', 'V6'].filter(l => stv[l] !== null).sort((a, b) => stv[a] - stv[b])[0];
        if (antWins && latLead && maxLat < 0 && maxLat - maxAnt < 0.5 && rel(leadMax) !== null && rel(latLead) !== null && rel(latLead) >= rel(leadMax)) antWins = false;
        // IVS / strain: STD in una derivazione a R dominante è discordante e atteso (secondario)
        const rDom = (amp(d, leadMax, 'r') || 0) > (amp(d, leadMax, 's') || 0);
        const secondario = (ctx.lvh || ctx.strain || ctx.strainNoVolt) && rDom && (leadMax === 'V4' || leadMax === 'V3') &&
          (ctx.strainLeads || []).some(l => ['V5', 'V6'].includes(l));
        if (maxAnt <= -0.5 && antWins && secondario && !F.has('stemi')) {
          F.add(CAT.OMI, 'std-ivs', 'Sottoslivellamento ST in ' + leadMax + ' compatibile con strain da IVS (STDmax V1–V4 non applicabile)', LIV.MOD,
            ['STD ' + f1(maxAnt) + ' mm in ' + leadMax + ' (R dominante) in continuità con lo strain di ' + ctx.strainLeads.join(', ') + ': ST discordante al QRS, secondario.',
              'Meyers 2021 considera ischemico lo STDmax V1–V4 solo se non spiegato da cause secondarie (IVS, BBDx, ritmo stimolato…).',
              'Sospetto ischemico se lo STD compare in V1–V3 a QRS negativo (concordante) o se è nuovo rispetto agli ECG precedenti.'],
            'Meyers HP et al. JAHA 2021; Hancock EW et al. AHA/ACCF/HRS 2009', 'Confronto con ECG precedenti e troponina se clinica compatibile.');
        } else if (maxAnt <= -0.5 && antWins && !F.has('stemi') ) {
          F.add(CAT.OMI, 'stdmax-v14', 'STEMI-equivalente: OMI posteriore (sottoslivellamento ST massimo in V1–V4)', LIV.CRIT,
            ['Sottoslivellamento ST massimo in ' + leadMax + ' (' + f1(maxAnt) + ' mm), maggiore che in V5–V6.',
              'STDmax V1–V4 ischemico: specificità 97% per OMI (Meyers 2021); spesso R prominente e T positive in V2–V3.',
              ctx.rbbb || wideUndef ? 'ATTENZIONE: con BBDx/QRS largo un ST negativo in V1–V3 può essere secondario; considerare ischemico solo se sproporzionato.' : ctx.lvh ? 'IVS presente: in V1–V3 (QRS negativo) lo ST atteso è sopraslivellato; uno STD concordante è sospetto per ischemia.' : 'Registrare V7–V9 (≥ 0,5 mm) — un risultato negativo non esclude.'],
            'Meyers HP et al. JAHA 2021; ACC 2022 ECDP; ESC 2023 ACS', 'Trattare come OMI fino a prova contraria in presenza di sintomi compatibili.', 'omi');
        } else if (maxAnt <= -0.5 && antWins && F.has('stemi')) {
          F.list.find(f => f.id === 'stemi').dettagli.push('STD massimo in V1–V4: estensione posteriore.');
        }
      }

      // Inferiore con reciprocità in aVL (sotto soglia)
      if (!F.has('stemi')) {
        const infUp = ['II', 'III', 'aVF'].filter(l => stv[l] !== null && stv[l] >= 0.5);
        if (infUp.length && stv.aVL !== null && stv.aVL <= -0.5 && !ctx.lvh) {
          F.add(CAT.OMI, 'inf-avl', 'OMI inferiore sospetta (STE inferiore sotto soglia con reciprocità in aVL)', LIV.CRIT,
            ['STE in ' + infUp.map(l => l + ' ' + f1(stv[l]) + ' mm').join(', ') + ' con sottoslivellamento in aVL ' + f1(stv.aVL) + ' mm.',
              'Il sottoslivellamento in aVL è raro nella pericardite e nella ripolarizzazione precoce (alta sensibilità per IMA inferiore).'],
            'Bischof, Smith Am J Emerg Med 2016; IV UDMI 2018', 'ECG seriati ogni 15–30 min, troponina, ecocardiogramma; discutere con emodinamista.', 'omi');
        }
      }

      // South African flag / laterale alto
      if (stv.aVL !== null && stv.aVL >= 1 && stv.III !== null && stv.III <= -0.5 && !leadsStemi.includes('aVL')) {
        F.add(CAT.OMI, 'laterale-alto', 'OMI laterale alta sospetta (pattern "South African flag")', LIV.CRIT,
          ['STE in aVL ' + f1(stv.aVL) + ' mm' + (stv.I !== null ? ', I ' + f1(stv.I) + ' mm' : '') + (stv.V2 !== null ? ', V2 ' + f1(stv.V2) + ' mm' : '') + ' con STD reciproco in III ' + f1(stv.III) + ' mm.',
            'Tipico dell\'occlusione della prima diagonale o di un ramo marginale/circonflessa.'],
          'Durant & Singh, Am J Emerg Med 2015; Smith SW', 'Coronarografia urgente.', 'omi');
      }

      // Aslanger
      if (stv.III !== null && stv.III > 0 && (stv.II === null || stv.II <= 0) && (stv.aVF === null || stv.aVF <= 0) &&
        ['V4', 'V5', 'V6'].some(l => stv[l] !== null && stv[l] <= -0.5 && (amp(d, l, 't') === null || amp(d, l, 't') > 0)) &&
        (stv.V2 === null || stv.V2 > -0.5) && stv.V1 !== null && stv.V2 !== null && stv.V1 > stv.V2) {
        F.add(CAT.OMI, 'aslanger', 'STEMI-equivalente: pattern di Aslanger (OMI inferiore + malattia multivasale)', LIV.CRIT,
          ['STE isolato in III (' + f1(stv.III) + ' mm), STD in V4–V6 con T positiva, nessun STD in V2, ST V1 > ST V2.'],
          'Aslanger E et al. J Electrocardiol 2020', 'Coronarografia urgente.', 'omi');
      }

      // Ischemia subendocardica diffusa
      const std1 = LEADS.filter(l => l !== 'aVR' && stv[l] !== null && stv[l] <= -1);
      if (std1.length >= 6 && ((stv.aVR !== null && stv.aVR >= 1) || (stv.V1 !== null && stv.V1 >= 1))) {
        F.add(CAT.OMI, 'sei', 'NSTEMI ad alto rischio: ischemia subendocardica diffusa (sospetto TC/trivasale)', LIV.ALTO,
          ['STD ≥ 1 mm in ' + std1.length + ' derivazioni (' + std1.join(', ') + ') con STE in aVR' + (stv.aVR !== null ? ' ' + f1(stv.aVR) + ' mm' : '') + ' e/o V1.',
            'Suggerisce ischemia multivasale o stenosi del tronco comune, soprattutto con instabilità emodinamica. Non è di per sé un\'occlusione.'],
          'ESC 2023 ACS; IV UDMI 2018', 'Strategia invasiva immediata (< 2 h) se instabile o dolore refrattario (ESC 2023). Ricercare cause di mismatch (anemia, ipotensione, tachiaritmia).', 'nstemi');
      } else if (std1.length >= 2) {
        const cont = CONTIG.some(c => std1.includes(c[0]) && std1.includes(c[1]));
        const soloStrain = (ctx.strain || ctx.strainNoVolt) && std1.every(l => (ctx.strainLeads || []).includes(l) || l === 'V4' || l === 'V3');
        if (cont && !F.has('stdmax-v14') && !F.has('stemi') && !soloStrain) {
          F.add(CAT.OMI, 'std', 'Sottoslivellamento ST di tipo ischemico', LIV.ALTO,
            ['STD ≥ 1 mm in ' + std1.join(', ') + '.' + (ctx.lvh ? ' Possibile componente secondaria a IVS.' : ''),
              'Se massimo in V1–V4 valutare OMI posteriore; se diffuso e massimo in V4–V6/II considerare ischemia subendocardica.'],
            'IV UDMI 2018; ESC 2023 ACS', 'Troponina hs seriata, ECG seriati.', 'nstemi');
        }
      }

      // Inversione T
      const tInv = LEADS.filter(l => l !== 'aVR' && l !== 'III' && l !== 'V1' && amp(d, l, 't') !== null && amp(d, l, 't') <= -1 && (amp(d, l, 'r') || 0) >= (amp(d, l, 's') || 0));
      const tStrain = (ctx.strain || ctx.strainNoVolt) && tInv.every(l => (ctx.strainLeads || []).includes(l) || l === 'V4');
      if (tInv.length >= 2 && CONTIG.some(c => tInv.includes(c[0]) && tInv.includes(c[1])) && !ctx.rbbb && !tStrain) {
        F.add(CAT.RIPOL, 't-inv', 'Inversione dell\'onda T', LIV.MOD,
          ['T negativa ≥ 1 mm in ' + tInv.join(', ') + ' con R prominente.', 'DD: ischemia/riperfusione (Wellens), IVS/strain, cardiomiopatia, EP, pattern giovanile, memoria cardiaca, emorragia cerebrale.'],
          'IV UDMI 2018');
      }

      // Formula 4 variabili / Aslanger semplificata
      const ste60 = n(ex.ste60V3) !== null ? n(ex.ste60V3) : n(L(d, 'V3').st60); // 1.3.0: anche da ST60 di V3 nella tabella
      const rv4 = amp(d, 'V4', 'r');
      const qrsv2 = qrsAmp(d, 'V2');
      const anteriorSTE = ['V2', 'V3', 'V4'].some(l => stv[l] !== null && stv[l] >= 1);
      if (anteriorSTE && ste60 !== null && rv4 !== null && qrsv2 !== null && !ctx.lvh && !ctx.rbbb) {
        const det = [];
        let pos = false;
        if (m.qtcBazett) {
          const v4 = 0.052 * m.qtcBazett - 0.151 * qrsv2 - 0.268 * rv4 + 1.062 * ste60;
          det.push('Formula a 4 variabili = ' + f2(v4) + ' (QTcB ' + r0(m.qtcBazett) + ' ms, QRS V2 ' + f1(qrsv2) + ' mm, R V4 ' + f1(rv4) + ' mm, STE60 V3 ' + f1(ste60) + ' mm). Cut-off ≥ 18,2 → occlusione IVA.');
          if (v4 >= 18.2) pos = true;
          if (Math.abs(v4 - 18.2) < 0.5) det.push('Valore vicino al cut-off: accuratezza ridotta.');
        }
        if (m.qtMm) {
          const sim = (rv4 + qrsv2) - (m.qtMm + ste60);
          det.push('Formula semplificata di Aslanger = ' + f1(sim) + ' (< 12 → occlusione IVA).');
          if (sim < 12) pos = true;
        }
        if (det.length) {
          if (pos) F.add(CAT.OMI, 'formula-iva', 'OMI della IVA sospetta (formula: occlusione vs sopraslivellamento variante normale)', LIV.CRIT,
            det.concat(['Validazione esterna: sensibilità 83%, specificità 88% al cut-off 18,2.']),
            'Driver 2017; Aslanger 2018; Smith SW', 'ECG seriati, ecocardiogramma; discutere con emodinamista.', 'omi');
          else F.add(CAT.OMI, 'formula-iva-neg', 'Formula IVA: favorisce sopraslivellamento variante normale', LIV.INFO,
            det.concat(['Un valore negativo NON deve rassicurare se il sospetto clinico è alto (Smith).']), 'Driver 2017; Aslanger 2018');
        }
      } else if (anteriorSTE && (ctx.lvh || ctx.rbbb)) {
        F.add(CAT.QUALITA, 'formula-na', 'Formula IVA a 4 variabili non applicabile', LIV.INFO,
          ['Non validata in presenza di ' + (ctx.lvh ? 'IVS' : 'BBDx') + ' (STE secondario).'], 'Driver 2017; Smith SW');
      } else if (anteriorSTE && !F.has('stemi')) {
        F.add(CAT.QUALITA, 'formula-dati', 'Formula IVA a 4 variabili non calcolabile', LIV.INFO,
          ['Inserisci STE a 60 ms dopo J in V3, R e S in V2 e V4, QT e RR per discriminare occlusione IVA da ripolarizzazione precoce.']);
      }

      // Takotsubo vs STEMI anteriore
      if (anteriorSTE && !p.prDep && !p.prAVR && stv.aVR !== null && stv.aVR <= -0.5 && stv.V1 !== null && stv.V1 < 0.5) {
        F.add(CAT.OMI, 'takotsubo', 'Considerare sindrome Takotsubo nella diagnosi differenziale', LIV.INFO,
          ['STD in aVR con assenza di STE in V1 (sens. 91%, spec. 96% vs STEMI anteriore, Kosuge 2010).', 'La diagnosi di Takotsubo richiede la coronarografia: NON ritardare la riperfusione.'],
          'Kosuge M et al. JACC 2010');
      }

      // T/QRS: aneurisma vs IMA acuto
      if (p.aneurisma) {
        const sumT = ['V1', 'V2', 'V3', 'V4'].map(l => amp(d, l, 't')).filter(x => x !== null);
        const sumQ = ['V1', 'V2', 'V3', 'V4'].map(l => { const r = amp(d, l, 'r'), s = amp(d, l, 's'); return (r === null && s === null) ? null : Math.max(r || 0, s || 0); }).filter(x => x !== null);
        if (sumT.length === 4 && sumQ.length === 4) {
          const ratio = sumT.reduce((a, b) => a + b, 0) / sumQ.reduce((a, b) => a + b, 0);
          const anyLead = ['V1', 'V2', 'V3', 'V4'].some(l => { const t = amp(d, l, 't'); const q = Math.max(amp(d, l, 'r') || 0, amp(d, l, 's') || 0); return q > 0 && t / q >= 0.36; });
          if (ratio > 0.22 || anyLead) F.add(CAT.OMI, 'aneur-acuto', 'Pattern QS + STE: rapporto T/QRS favorisce IMA ACUTO', LIV.CRIT,
            ['Σ T / Σ QRS V1–V4 = ' + f2(ratio) + (ratio > 0.22 ? ' (> 0,22)' : '') + (anyLead ? '; T/QRS ≥ 0,36 in almeno una derivazione' : '') + '.'],
            'Klein LR, Smith SW et al. Am J Emerg Med 2015', 'Considerare occlusione acuta.', 'omi');
          else F.add(CAT.OMI, 'aneurisma', 'STE persistente da aneurisma ventricolare sinistro (pattern cronico)', LIV.MOD,
            ['Σ T / Σ QRS V1–V4 = ' + f2(ratio) + ' (≤ 0,22) e nessuna derivazione ≥ 0,36.'], 'Klein LR, Smith SW et al. 2015');
        }
      }
    }

    // Pattern-based OMI (validi anche con BBS dove indicato)
    if (p.deWinter) F.add(CAT.OMI, 'dewinter', 'STEMI-equivalente: pattern di de Winter', LIV.CRIT,
      ['STD ascendente 1–3 mm al punto J in V1–V6 che si continua in T alte, simmetriche; spesso STE 0,5–1 mm in aVR.', 'Occlusione prossimale della IVA (~2% delle occlusioni IVA).'],
      'de Winter NEJM 2008; ACC 2022 ECDP', 'Attivare la rete STEMI.', 'omi');
    const hyp = [];
    if (p.tIperAnt) hyp.push('anteriori (V1–V4)');
    if (p.tIperInf) hyp.push('inferiori');
    if (p.tIperLat) hyp.push('laterali');
    if (hyp.length) F.add(CAT.OMI, 'iperacute', 'STEMI-equivalente: onde T iperacute ' + hyp.join(', '), LIV.CRIT,
      ['T ampie alla base, simmetriche, voluminose rispetto al QRS: fase precoce di occlusione.', 'DD: iperkaliemia (T strette e appuntite), ripolarizzazione precoce (QRS di alto voltaggio).'],
      'ACC 2022 ECDP; Smith SW', 'ECG seriati ogni 15–30 min; considerare coronarografia urgente.', 'omi');
    if (p.distorsioneTerminale) F.add(CAT.OMI, 'distorsione', 'Distorsione terminale del QRS in V2–V3', LIV.CRIT,
      ['Assenza sia di onda S sia di onda J in V2 o V3: non compatibile con ripolarizzazione precoce, depone per occlusione IVA.'],
      'Lewis M, Smith SW et al.; Armstrong EJ 2012', 'Trattare come OMI della IVA.', 'omi');
    if (p.wellensA || p.wellensB) F.add(CAT.OMI, 'wellens', 'NSTEMI ad alto rischio: sindrome di Wellens (riperfusione) — tipo ' + (p.wellensA ? 'A' : 'B'), LIV.ALTO,
      [p.wellensA ? 'Tipo A: T bifasiche (+/−) in V2–V3.' : 'Tipo B: T negative profonde e simmetriche in V2–V3 (± V1–V6).',
        'Paziente spesso senza dolore, R conservate, assenza di Q, STE < 1 mm: IVA critica transitoriamente riaperta.'],
      'de Zwaan 1982; ESC 2023 ACS', 'Coronarografia precoce; EVITARE test da sforzo (rischio di riocclusione).', 'nstemi');

    if (p.qPatologiche) F.add(CAT.OMI, 'q-pat', 'Onde Q patologiche (necrosi pregressa o in evoluzione)', LIV.MOD,
      ['Q ≥ 30 ms e ≥ 1 mm in ≥ 2 derivazioni contigue, o qualunque Q ≥ 20 ms / QS in V2–V3, o R ≥ 40 ms con R/S ≥ 1 in V1–V2 (equivalente posteriore).'],
      'IV UDMI 2018');
  }

  /* =====================================================================
     7. RIPOLARIZZAZIONE, PERICARDITE, PATTERN SPECIALI
     ===================================================================== */
  function analizzaRipol(d, m, F, ctx) {
    const p = d.pattern || {};
    const stv = {};
    LEADS.forEach(l => { stv[l] = st(d, l); });

    // Pericardite
    if (!ctx.lbbb && !ctx.paced) {
      const diffuse = ['I', 'II', 'III', 'aVL', 'aVF', 'V2', 'V3', 'V4', 'V5', 'V6'].filter(l => stv[l] !== null && stv[l] >= 0.5);
      const terr = territorioDi(diffuse);
      const reciproci = LEADS.filter(l => !['aVR', 'V1'].includes(l) && stv[l] !== null && stv[l] <= -0.5);
      const pericSegni = [];
      if (diffuse.length >= 5 && terr.length >= 2) pericSegni.push('STE diffuso in ' + diffuse.length + ' derivazioni (' + diffuse.join(', ') + ')');
      if (p.prDep) pericSegni.push('sottoslivellamento del PR');
      if (p.prAVR) pericSegni.push('sopraslivellamento del PR in aVR');
      if (p.spodick) pericSegni.push('segno di Spodick (TP discendente)');
      if (pericSegni.length && (diffuse.length >= 5 || p.prDep || p.prAVR)) {
        const contro = [];
        if (reciproci.length) contro.push('sottoslivellamenti reciproci in ' + reciproci.join(', '));
        if (stv.III !== null && stv.II !== null && stv.III > stv.II && stv.III >= 0.5) contro.push('STE III > II');
        if (stv.aVL !== null && stv.aVL < 0) contro.push('STD in aVL');
        if (p.stConvesso) contro.push('ST convesso');
        if (p.qPatologiche) contro.push('onde Q');
        if (p.tIperAnt || p.tIperInf || p.tIperLat) contro.push('T iperacute');
        let ginz = '';
        const tV6 = amp(d, 'V6', 't');
        if (stv.V6 !== null && tV6 && tV6 > 0) {
          const ratio = stv.V6 / tV6;
          ginz = 'Rapporto ST/T in V6 = ' + f2(ratio) + (ratio >= 0.25 ? ' (≥ 0,25: favorisce pericardite su ripolarizzazione precoce).' : ' (< 0,25: favorisce ripolarizzazione precoce).');
        }
        if (contro.length) {
          F.add(CAT.RIPOL, 'peric-vs-omi', 'STE diffuso: elementi CONTRO la pericardite — favorire OMI', LIV.CRIT,
            ['Segni pericarditici: ' + pericSegni.join('; ') + '.', 'Elementi a favore di ischemia: ' + contro.join('; ') + '.', ginz].filter(Boolean),
            'ESC 2025 Miocarditi/Pericarditi; Bischof & Smith 2016', 'La SCA è la principale diagnosi differenziale (ESC 2025): ECG seriati, troponina, ecocardiogramma, coronarografia se dubbio.', 'omi');
        } else {
          F.add(CAT.RIPOL, 'pericardite', 'Pattern ECG di pericardite acuta', LIV.ALTO,
            ['Criteri: ' + pericSegni.join('; ') + '; assenza di reciprocità (eccetto aVR/V1).', ginz,
              'ESC 2025: l\'ECG (STE diffuso concavo + PR depresso) è uno dei criteri diagnostici; le alterazioni indicano coinvolgimento del miocardio subepicardico → escludere miocardite (troponina, RMN).',
              ctx.postCCH ? 'Nel post-cardiochirurgia: sindrome post-pericardiotomica frequente; escludere tamponamento e IM tipo 5.' : ''].filter(Boolean),
            'ESC 2025 Miocarditi e Pericarditi (Schulz-Menger, Imazio)', 'Diagnosi clinica: ≥ 2 criteri tra dolore pleuritico, sfregamento, versamento, ECG tipico (+ PCR / imaging).');
          const sf = F.list.find(f => f.id === 'stemi');
          if (sf) sf.dettagli.push('ATTENZIONE DD: STE diffuso multi-territorio, senza reciprocità e con alterazioni del PR → possibile pericardite (mimic). I criteri STEMI restano soddisfatti: confrontare con clinica, ECG precedenti, ecocardiogramma e troponina prima di escludere l\'occlusione.');
        }
      }
    }

    // Ripolarizzazione precoce (consenso 2015)
    if (p.ripolPrecoce) {
      const alto = [];
      if (p.stOrizzontale) alto.push('ST orizzontale/discendente dopo J');
      if (['II', 'III', 'aVF'].some(l => stv[l] !== null && stv[l] >= 1)) alto.push('localizzazione inferiore');
      if (LEADS.some(l => stv[l] !== null && stv[l] >= 2)) alto.push('J ≥ 2 mm');
      F.add(CAT.RIPOL, 'rp', 'Pattern di ripolarizzazione precoce' + (alto.length ? ' con caratteristiche ad alto rischio' : ''), alto.length ? LIV.MOD : LIV.NORM,
        ['Elevazione del punto J ≥ 1 mm con notch o slurring terminale del QRS in ≥ 2 derivazioni inferiori e/o laterali contigue (esclude V1–V3).',
          alto.length ? 'Caratteristiche associate a maggior rischio aritmico: ' + alto.join(', ') + '.' : 'ST ascendente: variante comune, generalmente benigna.',
          'Una "ripolarizzazione precoce" in V2–V4 va discriminata dall\'occlusione IVA con la formula a 4 variabili.',
          'Sindrome (ERS) solo con aritmie/arresto: Shanghai score ERS modificato 2026 (J ≥ 0,2 mV in > 2 inferolaterali con ST orizzontale/discendente = 2 punti; ≥ 5 punti probabile/definita, 3–4,5 possibile).'],
        'Macfarlane PW et al. JACC 2015; ESC 2022 VA; consenso J-wave 2026');
    }

    // Brugada
    if (p.brugada1) F.add(CAT.RIPOL, 'brugada1', 'Pattern di Brugada tipo 1 (coved)', LIV.CRIT,
      ['STE a tenda ≥ 2 mm in ≥ 1 derivazione precordiale destra (V1–V2, anche in II–III spazio intercostale) seguito da T negativa.',
        'Spontaneo: diagnostico di sindrome di Brugada (ESC 2022). Escludere fenocopie (febbre, iperK+, farmaci bloccanti Na+).',
        'Shanghai score modificato (consenso J-wave 2026): tipo 1 spontaneo 3,5 punti; indotto da febbre 3; indotto da bloccante Na+ 2; + anamnesi, familiarità, SCN5A. > 3,5 = probabile/definita, 2–3 = possibile, < 2 = non diagnostica.'],
      'ESC 2022 VA; Nademanee, Wilde et al. J Arrhythm 2026;42:e70284', 'Consulenza aritmologica; trattare la febbre; evitare farmaci elencati su brugadadrugs.org.');
    else if (p.brugada2) F.add(CAT.RIPOL, 'brugada2', 'Pattern di Brugada tipo 2 (saddle-back)', LIV.MOD,
      ['STE a sella ≥ 0,5 mm in V1–V2; non diagnostico da solo.'], 'ESC 2022 VA', 'Ripetere ECG con V1–V2 nel II–III spazio; consulenza aritmologica se sincope/familiarità.');

    // Elettroliti e farmaci
    if (p.tPiccate || p.sineWave) {
      const sev = p.sineWave || (m.qrs && m.qrs >= 120) ? LIV.CRIT : LIV.ALTO;
      F.add(CAT.RIPOL, 'iperk', 'Pattern di iperkaliemia', sev,
        ['T appuntite, strette e simmetriche' + (m.qrs && m.qrs >= 120 ? '; QRS allargato' : '') + (p.sineWave ? '; onda sinusoidale (pre-arresto)' : '') + '.', 'Sequenza: T appuntite → P appiattite/PR lungo → QRS largo → onda sinusoidale → FV/asistolia.'],
        'ERC 2025 (circostanze speciali); KDIGO', 'Dosare K+; calcio gluconato/cloruro EV se alterazioni ECG, insulina-glucosio, salbutamolo.');
    }
    if (p.ondeU) F.add(CAT.RIPOL, 'ipok', 'Onde U prominenti (ipokaliemia possibile)', LIV.MOD,
      ['Onde U ≥ 1 mm, T appiattite, STD; QT apparentemente lungo (in realtà QU).'], 'AHA/ACCF/HRS 2009', 'Dosare K+ e Mg2+; nel cardiochirurgico mantenere K+ 4–5 mmol/L.');
    if (p.digitale) F.add(CAT.RIPOL, 'digitale', 'Effetto digitalico ("ST a cucchiaio")', LIV.INFO,
      ['STD a scodella, QT breve, T appiattite. Effetto, non necessariamente tossicità.'], 'AHA/ACCF/HRS 2009', 'Sospettare tossicità se aritmie (TA con blocco, ritmo giunzionale accelerato, TV bidirezionale).');
    if (p.osborn) F.add(CAT.RIPOL, 'osborn', 'Onde J di Osborn (ipotermia)', LIV.ALTO,
      ['Deflessione positiva al punto J, più evidente in V2–V5; ampiezza correlata al grado di ipotermia.'], 'AHA/ACCF/HRS 2009', 'Verificare temperatura centrale; rischio di FV.');
    if (p.epsilon) F.add(CAT.RIPOL, 'epsilon', 'Onda epsilon', LIV.ALTO,
      ['Piccola deflessione post-QRS in V1–V3: depolarizzazione ritardata del VD.', 'Criterio (minore nei criteri di Padova 2020) per cardiomiopatia aritmogena.'],
      'Corrado D et al. Padua criteria 2020', 'RMN cardiaca, Holter, consulenza aritmologica.');
    if (p.s1q3t3 || p.straindx) F.add(CAT.RIPOL, 'ep', 'Pattern di sovraccarico ventricolare destro (considerare embolia polmonare)', LIV.ALTO,
      [p.s1q3t3 ? 'Pattern S1Q3T3.' : '', p.straindx ? 'T negative in V1–V4 associate a T negative in III/aVF.' : '', 'Segni aspecifici; associati tachicardia sinusale e BBDx (nuovo).'].filter(Boolean),
      'ESC 2019 Embolia polmonare', 'Ecocardiogramma, angio-TC; score di probabilità clinica.');
    if (p.alternanza && !F.has('tamponamento')) F.add(CAT.RIPOL, 'alternanza', 'Alternanza elettrica', LIV.ALTO,
      ['Variazione battito-battito dell\'ampiezza del QRS.', 'Con bassi voltaggi e tachicardia → tamponamento.'], 'ESC 2025 Pericarditi', 'Ecocardiogramma urgente.');
  }

  /* =====================================================================
     8. QT
     ===================================================================== */
  function analizzaQT(d, m, F, ctx) {
    if (!m.qt) return;
    if (['fa'].includes(ctx.ritmo) && m.rrStats && m.rrStats.n < 5) {
      F.add(CAT.QUALITA, 'qt-fa', 'QTc in FA', LIV.INFO, ['In FA calcolare il QTc come media su ≥ 5–10 battiti consecutivi.']);
    }
    const sesso = (d.paziente || {}).sesso;
    const c = d.contesto || {};
    const qtc = m.qtcModificato || m.qtc;
    const lbl = m.qtcModificato ? 'QTc (Framingham, QT modificato per QRS largo)' : 'QTc (Framingham)';
    const det = [lbl + ' ' + r0(qtc) + ' ms; Bazett ' + r0(m.qtcBazett) + ', Fridericia ' + r0(m.qtcFridericia) + ', Hodges ' + r0(m.qtcHodges) + ' ms.'];
    if (m.fc && (m.fc > 90 || m.fc < 60)) det.push('FC fuori 60–90/min: Bazett è inaccurata (preferire Framingham/Fridericia).');
    const lim = sesso === 'F' ? 460 : 450;
    if (qtc >= 500) {
      F.add(CAT.QT, 'qt-500', 'QT lungo marcato (QTc ≥ 500 ms)', LIV.CRIT, det.concat(['Rischio elevato di torsione di punta.']),
        'AHA/ACCF/HRS 2009; ESC 2022 VA', 'Sospendere farmaci che allungano il QT (crediblemeds.org), correggere K+ ≥ 4, Mg2+ ≥ 2; monitoraggio.');
    } else if (qtc >= 480 || (qtc >= 460 && c.sincope)) {
      F.add(CAT.QT, 'lqts', 'Sospetta sindrome del QT lungo', LIV.ALTO,
        det.concat(['ESC 2022: diagnosi con QTc ≥ 480 ms su ECG ripetuti, oppure score di Schwartz > 3; QTc ≥ 460 ms con sincope inspiegata.', 'Escludere forme acquisite (farmaci, ipoK+, ipoMg2+, ipoCa2+, bradicardia).']),
        'ESC 2022 VA', 'ECG seriati, test genetico se sospetto congenito.');
    } else if (qtc >= lim) {
      F.add(CAT.QT, 'qt-lungo', 'QTc prolungato', LIV.MOD, det.concat(['Soglia ≥ ' + lim + ' ms (' + (sesso === 'F' ? 'donne' : 'uomini') + ').']), 'AHA/ACCF/HRS 2009');
    } else if ((m.qtcBazett || qtc) <= 320 && !m.qtcModificato) {
      F.add(CAT.QT, 'sqts-forte', 'Sospetta sindrome del QT corto (QTc ≤ 320 ms)', LIV.ALTO, det, 'ESC 2022 VA', 'Escludere ipercalcemia, digitale, acidosi, ipertermia; consulenza aritmologica.');
    } else if ((m.qtcBazett || qtc) <= 360 && !m.qtcModificato) {
      F.add(CAT.QT, 'sqts', 'QT corto: sospetta sindrome del QT corto', LIV.ALTO,
        det.concat(['ESC 2022: SQTS con QTc ≤ 360 ms + ≥ 1 tra variante patogena, familiarità per SQTS, sopravvivenza a TV/FV senza cardiopatia.']), 'ESC 2022 VA');
    } else {
      F.add(CAT.QT, 'qt-norm', 'QTc nei limiti', LIV.NORM, det, 'AHA/ACCF/HRS 2009');
    }
  }

  /* =====================================================================
     9. EXTRASISTOLI, CONTESTO, FUNZIONE VS
     ===================================================================== */
  function analizzaAltro(d, m, F, ctx) {
    const r = d.ritmo || {};
    const c = d.contesto || {};
    const es = [];
    if (r.esv) es.push('sopraventricolari');
    if (r.ev) es.push('ventricolari');
    if (es.length) F.add(CAT.RITMO, 'extrasistoli', 'Complessi prematuri ' + es.join(' e '), LIV.MOD,
      [r.bigeminismo ? 'Bigeminismo.' : '', r.coppie ? 'Coppie.' : '', r.evPolimorfi ? 'Extrasistoli ventricolari polimorfe.' : '', r.rsuT ? 'Fenomeno R su T.' : ''].filter(Boolean).concat(['Correggere K+/Mg2+.']),
      'AHA/ACCF/HRS 2009; ESC 2022 VA');
    if (r.tvns) F.add(CAT.RITMO, 'tvns', 'Tachicardia ventricolare non sostenuta', LIV.ALTO,
      ['≥ 3 battiti ventricolari consecutivi a > 100/min, durata < 30 s.'], 'ESC 2022 VA', 'Ricercare cardiopatia strutturale, ischemia, disionie.');
    if (r.rsuT || r.evPolimorfi) F.list.find(f => f.id === 'extrasistoli') && (F.list.find(f => f.id === 'extrasistoli').livello = LIV.ALTO);

    if (c.postCCH) {
      F.add(CAT.CONTESTO, 'post-cch', 'Contesto post-cardiochirurgico', LIV.INFO, [
        'STE diffuso: frequente pericardite post-pericardiotomica, ma l\'IM tipo 5 (IV UDMI 2018) richiede troponina > 10 × URL più nuove onde Q/nuovo BBS, occlusione di graft/nativa o nuova perdita di miocardio vitale. La V UDMI (2026) lo riclassifica come «IM correlato a procedura»: verificare i criteri biochimici aggiornati sul testo integrale prima di applicarli.',
        'STE localizzato in un territorio coronarico, reciprocità o nuova acinesia → sospetta occlusione/spasmo di graft: discutere subito con il cardiochirurgo.',
        'Dopo chirurgia valvolare (soprattutto aortica/mitralica) attenzione a nuovi BAV e BBS.',
        'FA post-operatoria: picco 2°–4° giorno.',
        'Bassi voltaggi + alternanza + ipotensione → tamponamento.'
      ], 'IV UDMI 2018; V UDMI 2026; ESC 2024 FA');
      ctx.postCCH = true;
    }
    const fe = n(d.fevs);
    if (fe !== null) {
      let t, lv;
      if (fe < 50) { t = 'FEVS ridotta (< 50%) — HFrEF (ESC 2026)'; lv = fe <= 40 ? LIV.ALTO : LIV.MOD; }
      else { t = 'FEVS conservata (≥ 50%) — HFpEF se scompenso (ESC 2026)'; lv = LIV.NORM; }
      F.add(CAT.FVS, 'fevs', t, lv, ['FEVS ' + fe + '% da ecocardiogramma (dato inserito, NON stimato dall\'ECG).',
        'Linee guida ESC 2026: abolita la categoria HFmrEF (41–49%); due fenotipi con un solo cut-off al 50% (HFrEF < 50%, HFpEF ≥ 50%); stadi A–D; "scompenso acuto" → "scompenso decompensato".',
        fe <= 40 ? 'FEVS ≤ 40%: valutare indicazione a CRT/ICD se QRS largo (soprattutto BBSx ≥ 150 ms) secondo le linee guida su pacing e aritmie.' : '',
        'La stima AI della FE dall\'ECG non è riproducibile con regole.'].filter(Boolean), 'ESC 2026 Scompenso (Køber, Adamo et al., doi:10.1093/eurheartj/ehag100)');
    }
  }

  /* =====================================================================
     ANALISI COMPLETA
     ===================================================================== */
  function analizza(d) {
    d = d || {};
    const F = new Findings();
    const ctx = { postCCH: !!(d.contesto || {}).postCCH };
    const m = misure(d);

    analizzaRitmo(d, m, F, ctx);
    analizzaSAeAV(d, m, F, ctx);
    // RVH prima dell'EPS (diagnosi di esclusione)
    analizzaIV(d, m, F, ctx);
    analizzaAsse(d, m, F);
    analizzaCamere(d, m, F, ctx);
    if (ctx.rvhProbabile && F.has('eps')) {
      F.list.find(f => f.id === 'eps').dettagli.push('ATTENZIONE: criteri di IVD presenti, l\'EPS potrebbe non essere diagnosticabile.');
    }
    analizzaAltro(d, m, F, ctx);
    analizzaIschemia(d, m, F, ctx);
    analizzaRipol(d, m, F, ctx);
    analizzaQT(d, m, F, ctx);

    if (ctx.wpw) F.add(CAT.OMI, 'wpw-st', 'Valutazione ischemica limitata dalla pre-eccitazione', LIV.INFO, ['ST-T secondario alla pre-eccitazione; onde delta negative possono simulare Q.']);
    if (ctx.nST !== undefined && ctx.nST > 0 && ctx.nST < 12) F.add(CAT.QUALITA, 'st-incompleto', 'Analisi ST su ' + ctx.nST + '/12 derivazioni', LIV.INFO, ['Completa la tabella delle derivazioni per un\'analisi OMI completa.']);

    F.list.sort((a, b) => ORDINE_LIV[a.livello] - ORDINE_LIV[b.livello]);

    // Sintesi tipo "Queen of Hearts"
    let omi = 'non valutabile';
    if (F.list.some(f => f.tag === 'omi')) omi = 'positivo';
    else if (F.list.some(f => f.tag === 'nstemi')) omi = 'NSTEMI ad alto rischio';
    else if (ctx.nST >= 10 || ((ctx.lbbb || ctx.paced) && ctx.nST >= 6)) omi = 'negativo';

    const ritmoF = F.list.find(f => f.cat === CAT.RITMO && f.id !== 'extrasistoli' && f.id !== 'tvns' && f.id !== 'fa-150' && f.id !== 'flutter-11');
    return {
      meta: META,
      misure: m,
      reperti: F.list,
      sintesi: {
        omi,
        ritmo: ritmoF ? ritmoF.titolo : 'Ritmo non classificato',
        critici: F.list.filter(f => f.livello === LIV.CRIT).length
      },
      ctx
    };
  }

  /* =====================================================================
     CATALOGO DIAGNOSI SUPPORTATE (incluso elenco PMcardio 55 + extra)
     ===================================================================== */
  const CATALOGO = [
    ['Ritmo', [
      ['Bradicardia sinusale', 'moderato'], ['Ritmo sinusale', 'normale'], ['Tachicardia sinusale', 'moderato'], ['Aritmia sinusale', 'normale'],
      ['Ritmo da pacemaker (+ perdita di cattura / undersensing)', 'moderato'], ['Fibrillazione atriale', 'alto'],
      ['FA a risposta ventricolare rapida', 'alto'], ['FA a bassa risposta ventricolare', 'alto'], ['FA pre-eccitata (WPW)', 'critico'], ['FA con risposta regolare lenta (BAV completo)', 'critico'],
      ['Flutter atriale', 'alto'], ['Flutter a risposta rapida', 'alto'], ['Flutter a bassa risposta', 'alto'], ['Flutter 1:1', 'critico'],
      ['Tachicardia sopraventricolare (TRNAV / TRAV / RP lungo)', 'alto'], ['Tachicardia atriale focale', 'alto'], ['Ritmo atriale ectopico', 'moderato'],
      ['Tachicardia atriale multifocale', 'alto'], ['Pacemaker atriale migrante', 'moderato'],
      ['Ritmo giunzionale (sospetto)', 'alto'], ['Bradicardia giunzionale (sospetta)', 'critico'], ['Ritmo giunzionale accelerato (sospetto)', 'alto'],
      ['Ritmo a QRS largo', 'critico'], ['Ritmo idioventricolare', 'critico'], ['RIVA', 'alto'],
      ['Tachicardia ventricolare (Brugada, Vereckei, Basilea, Pava)', 'critico'], ['TV polimorfa / torsione di punta', 'critico'], ['Fibrillazione ventricolare', 'critico'],
      ['Complessi prematuri sopraventricolari / ventricolari', 'moderato'], ['TV non sostenuta', 'alto']
    ]],
    ['Infarto miocardico / OMI (modello "Queen of Hearts"-like, a regole)', [
      ['STEMI (IV Definizione Universale, soglie per sesso/età; V UDMI 2026 in verifica)', 'critico'], ['STEMI posteriore V7–V9', 'critico'],
      ['STEMI-equivalente: OMI posteriore (STDmax V1–V4)', 'critico'], ['STEMI-equivalente: de Winter', 'critico'],
      ['STEMI-equivalente: T iperacute', 'critico'], ['STEMI-equivalente: Smith-modified Sgarbossa (BBS / stimolato)', 'critico'],
      ['Algoritmo di Barcellona (BBS)', 'critico'], ['Pattern di Aslanger', 'critico'], ['OMI inferiore con reciprocità aVL', 'critico'],
      ['OMI laterale alta ("South African flag")', 'critico'], ['OMI IVA: formula a 4 variabili + formula di Aslanger', 'critico'],
      ['Distorsione terminale QRS V2–V3', 'critico'], ['Coinvolgimento VD (V4R)', 'critico'],
      ['NSTEMI alto rischio (riperfusione): Wellens A/B', 'alto'], ['NSTEMI alto rischio: ischemia subendocardica diffusa (STE aVR)', 'alto'],
      ['Sottoslivellamento ST ischemico', 'alto'], ['Aneurisma VS vs IMA acuto (T/QRS)', 'moderato'], ['Onde Q patologiche', 'moderato'], ['DD Takotsubo', 'info']
    ]],
    ['Disturbi di conduzione', [
      ['Blocco SA II grado tipo I e II', 'alto'], ['Pausa / arresto sinusale', 'alto'], ['Malattia del nodo del seno', 'alto'],
      ['BAV I grado', 'moderato'], ['BAV II grado Mobitz I (Wenckebach)', 'moderato'], ['BAV II grado Mobitz II', 'critico'], ['BAV 2:1', 'critico'],
      ['BAV avanzato / alto grado', 'critico'], ['BAV III grado', 'critico'], ['Dissociazione AV', 'alto'],
      ['BBDx completo', 'moderato'], ['BBDx incompleto', 'moderato'], ['BBSx completo (AHA 2009 / Strauss)', 'alto'], ['BBSx incompleto', 'alto'],
      ['Ritardo di conduzione intraventricolare aspecifico', 'moderato'], ['Emiblocco anteriore sinistro', 'normale'], ['Emiblocco posteriore sinistro', 'alto'],
      ['Blocco bifascicolare (BBDx + EAS)', 'alto'], ['Blocco bifascicolare (BBDx + EPS)', 'alto'],
      ['Bifascicolare + BAV I ("trifascicolare" BBDx + EAS + BAV1)', 'critico'], ['Bifascicolare + BAV I ("trifascicolare" BBDx + EPS + BAV1)', 'critico'],
      ['Blocco di branca alternante', 'critico'], ['Pre-eccitazione (WPW)', 'alto'], ['PR corto', 'info']
    ]],
    ['Asse', [['Asse normale', 'normale'], ['Deviazione assiale sinistra', 'alto'], ['Deviazione assiale destra', 'alto'], ['Deviazione assiale estrema', 'critico']]],
    ['Misure', [['Frequenza cardiaca', 'info'], ['Onda P', 'info'], ['Intervallo PR', 'info'], ['Durata QRS', 'info'], ['Intervallo QT', 'info'],
      ['QTc Framingham (+ Bazett, Fridericia, Hodges, QT modificato per QRS largo)', 'info'], ['Intervallo RR (media, variabilità)', 'info'], ['Intervallo PP', 'info'], ['PTFV1', 'info']]],
    ['Altro', [['Ritmo irregolare senza P definite (sospetta FA)', 'alto'], ['Sospetta sindrome del QT lungo / QT ≥ 500', 'alto'], ['Sospetta sindrome del QT corto', 'alto'],
      ['Ingrandimento atriale destro / sinistro', 'moderato'], ['Blocco interatriale parziale / avanzato (Bayés)', 'alto'],
      ['Ipertrofia ventricolare sinistra (Sokolow, Cornell, prodotto di Cornell, aVL, Peguero-Lo Presti)', 'moderato'], ['Ipertrofia ventricolare destra', 'moderato'],
      ['Bassi voltaggi / sospetto tamponamento', 'critico'], ['Scarsa progressione R', 'info'],
      ['Pericardite acuta (ESC 2025) e DD con OMI', 'alto'], ['Ripolarizzazione precoce (consenso 2015)', 'normale'], ['Brugada tipo 1 / tipo 2', 'critico'],
      ['Iperkaliemia', 'critico'], ['Ipokaliemia (onde U)', 'moderato'], ['Effetto digitalico', 'info'], ['Ipotermia (Osborn)', 'alto'],
      ['Onda epsilon (ACM)', 'alto'], ['Sovraccarico VD / embolia polmonare', 'alto'], ['Alternanza elettrica', 'alto'], ['Inversione onde T', 'moderato'],
      ['FEVS da eco (HFrEF < 50% / HFpEF ≥ 50%, ESC 2026)', 'info'], ['Contesto post-cardiochirurgico', 'info']]]
  ];

  const API = { META, LEADS, CAT, LIV, analizza, misure, CATALOGO, sogliaSTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ECGCriteria = API;
})(typeof window !== 'undefined' ? window : this);
