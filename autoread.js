/* =====================================================================
   ECGcheck 1.5.0 — APPLICAZIONE AUTOMATICA della lettura (foto / PDF)
   Funzioni pure (testabili in Node), usate dall'interfaccia:
   - confidence(A): affidabilità complessiva, del ritmo e dell'asse
   - apply(A, data, set, opts): scrive i valori letti nel caso (rispettando le
     correzioni manuali) e restituisce i valori a bassa affidabilità da evidenziare
   Principio di sicurezza: meglio NON proporre un valore che proporne uno sbagliato;
   con lettura insufficiente non si produce alcuna diagnosi automatica.
   ===================================================================== */
(function (root) {
  'use strict';
  const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
  function isIrregular(R) { return !!(R && R.rr && R.rr.length >= 3 && R.rrVar > Math.max(120, 0.15 * R.rrMean)); }

  // affidabilità: 'alta' | 'media' | 'bassa' | 'insufficiente'
  function confidence(A) {
    if (!A || !A.ok) return { livello: 'insufficiente', motivo: 'lettura automatica non riuscita', ritmo: 'insufficiente', asse: 'insufficiente' };
    const photo = A.source === 'foto';
    const q = A.quality ? A.quality.score : (photo ? 0 : 100);
    const L = A.leads || {}; const nL = Object.keys(L).length;
    const motivi = [];
    let liv = photo ? 'media' : 'alta';
    if (A.leadsUnreliable) { liv = 'insufficiente'; motivi.push('derivazioni non assegnabili con sicurezza (' + A.leadsUnreliable + ')'); }
    if (photo && q < 50) { liv = 'insufficiente'; motivi.push('qualità della foto ' + q + '/100'); }
    if (nL < 6) { liv = 'insufficiente'; motivi.push('solo ' + nL + '/12 derivazioni lette'); }
    const incerte = LEADS.filter(k => L[k] && (L[k].rVar || L[k].sVar || L[k].stLim || L[k].rLim || L[k].sLim));
    const vuote = LEADS.filter(k => !L[k] || (L[k].R == null && L[k].S == null));
    if (liv !== 'insufficiente') {
      if (photo && q < 70) { liv = 'bassa'; motivi.push('qualità della foto ' + q + '/100'); }
      const nInc = new Set(incerte.concat(vuote)).size;
      if (nInc >= 4) { liv = 'bassa'; motivi.push(nInc + '/12 derivazioni incerte o non misurate'); }
    }
    const R = A.rhythm;
    let ritmo = !R ? 'insufficiente' : (R.pPresenti && !isIrregular(R) ? (liv === 'alta' ? 'alta' : 'media') : 'bassa');
    if (liv === 'insufficiente' && ritmo !== 'insufficiente') ritmo = 'bassa';
    const limb = ['I', 'II', 'III', 'aVF', 'aVL'];
    const limbOk = limb.filter(k => L[k] && L[k].R != null && !L[k].rVar && !L[k].sVar && !L[k].rLim && !L[k].sLim).length;
    let asse = liv === 'insufficiente' ? 'insufficiente' : limbOk >= 3 ? (liv === 'alta' ? 'alta' : 'media') : 'bassa';
    if (A.machine && A.machine.assi && A.machine.assi.qrs != null) asse = 'alta';
    return { livello: liv, motivo: motivi.join('; '), ritmo, asse, incerte, vuote };
  }

  /* 1.5.3 – MORFOLOGIA DEL QRS dalla lettura automatica (richiesta di Cimox 27/11: «BBS evidente, l'app deve
     confermarlo subito»). Criteri AHA/ACCF/HRS 2009 tradotti in misure: BBS = QRS ≥ 120 ms + QS/rS in V1 (o V2)
     + R larga/a lento picco senza q in ≥ 3 tra I, aVL, V5, V6; BBDx = QRS ≥ 120 ms + R′ in V1/V2 + S larga
     (≥ 40 ms) in I o V6. Prudenza: proposto solo se la morfologia è coerente in più derivazioni; mai con lettura
     insufficiente; sempre evidenziato «da verificare». Ritorna null se nessuna morfologia è riconosciuta. */
  function morphology(A, qrs) {
    if (!A || !A.ok || A.leadsUnreliable || qrs == null || qrs < 120) return null;
    const L = A.leads || {};
    const ok = k => L[k] && !L[k].unrel;
    const neg = k => ok(k) && L[k].S != null && L[k].S >= 3 && (L[k].R == null || L[k].R <= Math.max(2, 0.25 * L[k].S)) && !(L[k].Rp >= 1);
    const latR = k => ok(k) && L[k].R != null && L[k].R >= 3 && (L[k].S == null || L[k].S <= 0.3 * L[k].R) && !(L[k].Q >= 0.5) &&
      ((L[k].rpt != null && L[k].rpt >= 50) || (L[k].rW != null && L[k].rW >= 40));
    const rsr = k => ok(k) && L[k].Rp != null && L[k].Rp >= 1 && L[k].S != null && L[k].S >= 0.5;
    const sWide = k => ok(k) && L[k].sW != null && L[k].sW >= 40 && L[k].S >= 1;
    const lat = ['I', 'aVL', 'V5', 'V6'].filter(latR);
    const v1neg = ['V1', 'V2'].filter(neg);
    const out = { prove: [] };
    if (v1neg.length && lat.length >= 3) {
      out.lbbb = true; out.prove.push('QS/rS in ' + v1neg.join(', '), 'R larghe senza q in ' + lat.join(', '));
    }
    const v1r = ['V1', 'V2'].filter(rsr), sw = ['I', 'V6'].filter(sWide);
    if (!out.lbbb && v1r.length && sw.length) { out.rbbb = true; out.prove.push('rsR′ in ' + v1r.join(', '), 'S larga in ' + sw.join(', ')); }
    return out.lbbb || out.rbbb ? out : null;
  }

  /* apply: A = lettura (summarizeAuto), data = caso, set(path, value) = scrittura (rispetta i valori manuali)
     ritorna { lowConf: {path: motivo}, stEsclusi: [], conf } */
  function apply(A, data, set, opts) {
    opts = opts || {};
    const conf = confidence(A);
    const lowConf = {}; const stEsclusi = [];
    data.autoConf = { livello: conf.livello, motivo: conf.motivo, ritmo: conf.ritmo, asse: conf.asse };
    if (!A || !A.ok) return { lowConf, stEsclusi, conf };
    const photo = A.source === 'foto';
    const unrel = conf.livello === 'insufficiente';
    // con lettura insufficiente NESSUN valore di derivazione (niente diagnosi da valori probabilmente sbagliati)
    if (!unrel) LEADS.forEach(k => {
      const l = A.leads[k]; if (!l) return;
      const P = 'leads.' + k + '.';
      // 1.5.0 (sicurezza): dalla FOTO R/S molto variabili tra i battiti NON vengono proposte (falsa IVS, falso
      // asse); restano da misurare con il calibro. R/S «≥» (tracce sovrapposte) sono minimi: proposti ed evidenziati
      if (l.R != null && !(photo && l.rVar)) { set(P + 'r', String(r1(Math.abs(l.R)))); if (l.rLim) lowConf[P + 'r'] = 'traccia sovrapposta: valore minimo'; }
      if (l.S != null && !(photo && l.sVar)) { set(P + 's', String(r1(Math.abs(l.S)))); if (l.sLim) lowConf[P + 's'] = 'traccia sovrapposta: valore minimo'; }
      if (photo && (l.rVar || l.sVar)) lowConf[P + 'r'] = lowConf[P + 'r'] || 'R/S variabili tra i battiti: non proposte, misurale';
      if (l.Q != null && l.Q >= 0.5) set(P + 'q', String(r1(Math.abs(l.Q))));
      // dalla FOTO lo ST non viene applicato nelle derivazioni con QRS molto diversi da battito a battito
      // 1.5.1 (sicurezza, falso NEGATIVO): lo ST è escluso solo se incoerente tra i battiti (stLim, controllo di
      // dispersione J/J+60 ≤ 0,5 mm in ecgphoto); R/S variabili da sole NON bastano più a escluderlo: in uno STEMI
      // inferiore evidente II e aVF venivano scartate e restava solo III → STEMI non riconosciuto (segnalazione 23/11)
      // compromesso: con R/S variabili si accetta lo ST solo se è un SOPRASLIVELLAMENTO ≥ 1,5 mm coerente tra i battiti
      // (segnale da STEMI che non deve andare perso); i sottoslivellamenti restano esclusi (falsi OMI posteriori
      // da BBDx/IVS sulle foto 4 e 6)
      const stOk = !(photo && (l.stLim || ((l.rVar || l.sVar) && !(l.st != null && l.st >= 1.5))));
      if (stOk && photo && (l.rVar || l.sVar) && l.st != null) lowConf[P + 'st'] = 'R/S variabili tra i battiti, sopraslivellamento coerente: verifica';
      if (!stOk) stEsclusi.push(k);
      if (l.st != null && stOk) { set(P + 'st', String(r1(l.st))); if (photo && conf.livello === 'bassa') lowConf[P + 'st'] = 'ST dalla foto con qualità bassa'; }
      if (l.st60 != null && stOk) set(P + 'st60', String(r1(l.st60)));
      if (l.T != null && stOk) set(P + 't', String(r1(l.T)));
    });
    if (!unrel && A.leads.V3 && A.leads.V3.st60 != null && stEsclusi.indexOf('V3') < 0) set('extra.ste60V3', String(r1(A.leads.V3.st60)));
    const prd = unrel ? {} : (A.prDep || {});
    const dep = ['I', 'II', 'aVF', 'V2', 'V3', 'V4', 'V5', 'V6'].filter(k => prd[k] != null && prd[k] <= -0.4);
    if (dep.length >= 3) { set('pattern.prDep', true); lowConf['pattern.prDep'] = 'proposto dalla lettura automatica'; }
    if (prd.aVR != null && prd.aVR >= 0.3 && dep.length >= 2) set('pattern.prAVR', true);
    if (opts.all !== false) {
      const M = A.machine || {}, G = A.glob || {}, R = A.rhythm;
      const pick = (m, g) => m != null ? m : (g != null ? Math.round(g) : null);
      // 1.5.3 (caso 14: PR 244 letto vs 184 stampato → falso BAV I): PR dalla foto solo se coerente tra i battiti
      // (dispersione ≤ 45 ms; sui casi reali con PR corretto 6–36 ms, nel caso 14 60 ms)
      const prCoerente = !R || R.prSpread == null || R.prSpread <= 45;
      const prFoto = photo && R && R.pPresenti && !unrel && A.quality && A.quality.score >= 70 && G.pr && prCoerente ? G.pr : null;
      if (photo && R && R.pPresenti && G.pr && !prCoerente) lowConf['intervalli.pr'] = 'PR dalla foto incoerente tra i battiti (' + Math.round(G.pr) + ' ms, dispersione ' + Math.round(R.prSpread) + ' ms): non proposto, misuralo con lo strumento «PR»';
      const iv = {
        'intervalli.pr': photo ? prFoto : pick(M.pr, G.pr),
        'intervalli.qrs': unrel ? null : pick(M.qrs, G.qrs),
        'intervalli.qt': unrel ? null : pick(M.qt, G.qt),
        'intervalli.p': photo ? null : pick(M.p, G.p)
      };
      Object.keys(iv).forEach(p => { if (iv[p] != null) set(p, String(iv[p])); });
      if (photo) {
        if (iv['intervalli.pr'] != null) lowConf['intervalli.pr'] = 'PR dalla foto: verificare';
        if (iv['intervalli.qrs'] != null) lowConf['intervalli.qrs'] = 'QRS dalla foto (tende a sottostimare con QRS larghi e sovrastimare con voltaggi alti)';
        if (iv['intervalli.qt'] != null) lowConf['intervalli.qt'] = 'QT dalla foto (fine della T difficile da riconoscere)';
      }
      if (R) {
        data.ritmo = data.ritmo || {};
        if (!unrel) data.ritmo.rrList = (R.rr || []).map(Math.round);
        set('ritmo.rr', String(Math.round(R.rrMean)));
        set('ritmo.fc', String(M.fc != null ? M.fc : Math.round(R.hr)));
        if (!unrel) {
          set('ritmo.regolarita', isIrregular(R) ? 'irregolare' : 'regolare');
          if (isIrregular(R)) lowConf['ritmo.regolarita'] = 'irregolarità letta dalla foto: possibile battito mancato o in più';
          if (R.pPresenti && /^II/.test(R.lead || '')) {
            set('ritmo.ondeP', 'sinusali'); set('ritmo.rapportoPQRS', '1:1');
            if (R.rrMean) { set('ritmo.pp', String(Math.round(R.rrMean))); set('ritmo.fcAtriale', String(Math.round(60000 / R.rrMean))); }
            if (photo) lowConf['ritmo.ondeP'] = 'P riconosciute automaticamente';
          }
        }
        if (R.rr && R.rr.length >= 3) { const mx = Math.max.apply(null, R.rr), md = R.rr.slice().sort((a, b) => a - b)[R.rr.length >> 1]; if (mx >= 2000 && mx >= 1.5 * md) set('ritmo.pausaMax', String(Math.round(mx))); }
      } else if (M.fc != null) set('ritmo.fc', String(M.fc));
      // 1.5.3: blocco di branca riconosciuto automaticamente (morfologia + QRS ≥ 120 ms)
      const qrsUse = iv['intervalli.qrs'];
      const mo = unrel ? null : morphology(A, qrsUse);
      if (mo) {
        const why = 'morfologia riconosciuta dalla lettura automatica (' + mo.prove.join('; ') + '): verifica';
        if (mo.lbbb) { set('morfologia.qsV1', true); set('morfologia.rLargaLat', true); lowConf['morfologia.qsV1'] = why; lowConf['morfologia.rLargaLat'] = why; }
        if (mo.rbbb) { set('morfologia.rsrV1', true); set('morfologia.sLarga', true); lowConf['morfologia.rsrV1'] = why; lowConf['morfologia.sLarga'] = why; }
        data.autoMorph = mo;
      }
      if (M.assi && M.assi.qrs != null) set('asse.gradi', String(M.assi.qrs));
      // 1.5.0: asse calcolato dalla foto sull'intero tracciato (6 periferiche, battito mediano): sulle 9 foto reali
      // scarto ≤ 4° dall'asse stampato; proposto solo con affidabilità almeno media
      else if (photo && G.asse != null && isFinite(G.asse) && !A.leadsUnreliable && conf.asse !== 'insufficiente') { set('asse.gradi', String(Math.round(G.asse))); lowConf['asse.gradi'] = 'asse calcolato dalla foto'; }
    }
    return { lowConf, stEsclusi, conf };
  }

  const API = { confidence, apply, isIrregular, morphology, LEADS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ECGAuto = API;
})(typeof window !== 'undefined' ? window : this);
