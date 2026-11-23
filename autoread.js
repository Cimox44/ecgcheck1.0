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
      const stOk = !(photo && (l.rVar || l.sVar || l.stLim));
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
      const prFoto = photo && R && R.pPresenti && !unrel && A.quality && A.quality.score >= 70 && G.pr ? G.pr : null;
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
      if (M.assi && M.assi.qrs != null) set('asse.gradi', String(M.assi.qrs));
      // 1.5.0: asse calcolato dalla foto sull'intero tracciato (6 periferiche, battito mediano): sulle 9 foto reali
      // scarto ≤ 4° dall'asse stampato; proposto solo con affidabilità almeno media
      else if (photo && G.asse != null && isFinite(G.asse) && !A.leadsUnreliable && conf.asse !== 'insufficiente') { set('asse.gradi', String(Math.round(G.asse))); lowConf['asse.gradi'] = 'asse calcolato dalla foto'; }
    }
    return { lowConf, stEsclusi, conf };
  }

  const API = { confidence, apply, isIrregular, LEADS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ECGAuto = API;
})(typeof window !== 'undefined' ? window : this);
