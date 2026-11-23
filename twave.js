/* =====================================================================
   ECGcheck 1.5.0 — Calcolatore «ONDA T: iperacuta, ischemica o altra eziologia»
   Funzione pura evaluate() (testabile in Node) + rendering della scheda.
   Solo criteri pubblicati; dove un cut-off validato NON esiste lo si dichiara.
   Strumento didattico/di supporto: la conclusione è sempre prudente.
   ===================================================================== */
(function (root) {
  'use strict';
  const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const PREC = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const CONTIG = [['I', 'aVL'], ['II', 'aVF'], ['III', 'aVF'], ['II', 'III'], ['V1', 'V2'], ['V2', 'V3'], ['V3', 'V4'], ['V4', 'V5'], ['V5', 'V6'], ['I', 'V6'], ['aVL', 'I']];
  const TERR = { inferiore: ['II', 'III', 'aVF'], anteriore: ['V1', 'V2', 'V3', 'V4'], laterale: ['I', 'aVL', 'V5', 'V6'] };
  const RECIP = { inferiore: ['aVL', 'I'], anteriore: ['III', 'aVF'], laterale: ['III', 'aVF'] };
  // soglie OPERATIVE (non validate) del rapporto di ampiezza T/QRS per segnalare una T «voluminosa»
  const OPER = { limb: { rat: 0.75, min: 2.5 }, prec: { rat: 1.0, min: 6 } };

  const FONTI = {
    hatw: 'Meyers HP, Smith SW et al. Hyperacute T waves are specific for occlusion MI even without diagnostic ST elevation. JACC Adv 2025 (doi:10.1016/j.jacadv.2025.102120): area T/ampiezza QRS + simmetria, ≥ 2 derivazioni contigue, QRS < 110 ms; validazione senza STEMI (n = 1300) specificità 98,4%, sensibilità 20,7%, VPP 47,4%. Soglie per derivazione non pubblicate.',
    hatw0: 'Meyers HP et al. First objective definition of hyperacute T-waves as a STEMI-equivalent. J Am Coll Cardiol 2025 (abstract ACC.25, doi:10.1016/S0735-1097(25)02430-1): simmetria = picco della T ≤ 67% dell\'intervallo J–T; sensibilità 37%, specificità 98%.',
    amp: 'Hyperacute T wave in the early diagnosis of AMI. Ann Emerg Med 2023;82:194-202 (doi:10.1016/j.annemergmed.2022.12.003): la sola AMPIEZZA della T (> 95° percentile) NON è utile per la diagnosi.',
    dewinter: 'de Winter RJ et al. N Engl J Med 2008;359:2071-2073; ACC 2022 ECDP (STEMI-equivalente).',
    wellens: 'de Zwaan C, Bär FW, Wellens HJ. Am Heart J 1982;103:730-736; ESC 2023 ACS (NSTEMI ad alto rischio).',
    ecdp: 'Kontos MC et al. 2022 ACC Expert Consensus Decision Pathway on Chest Pain in the ED. JACC 2022;80:1925-1960.',
    aha2009: 'Rautaharju PM et al. AHA/ACCF/HRS Recommendations for the standardization and interpretation of the ECG, Part IV: ST segment, T and U waves, QT interval. Circulation 2009;119:e241-e250.',
    iperk: 'Montague BT et al. Retrospective review of the frequency of ECG changes in hyperkalemia. Clin J Am Soc Nephrol 2008;3:324-330 (le alterazioni ECG mancano in molti casi: l\'ECG non esclude l\'iperK).',
    rp: 'Macfarlane PW et al. The early repolarization pattern: a consensus paper. J Am Coll Cardiol 2015;66:470-477.',
    tako: 'Kosuge M et al. Simple and accurate ECG criteria to differentiate takotsubo cardiomyopathy from anterior AMI. J Am Coll Cardiol 2010;55:2514-2516.',
    arvc: 'Marcus FI et al. Task Force criteria ARVC/D. Circulation 2010;121:1533-1541; Corrado D et al. Padua criteria. Int J Cardiol 2020;319:106-114.',
    peric: 'Schulz-Menger J, Imazio M et al. 2025 ESC Guidelines for myocarditis and pericarditis. Eur Heart J 2025;46:3952-4041 (incl. sindrome post-pericardiotomica).',
    ep: 'Konstantinides SV et al. 2019 ESC Guidelines for acute pulmonary embolism. Eur Heart J 2020;41:543-603.',
    cmi: 'Ommen SR et al. 2024 AHA/ACC/AMSSM/HRS/PACES/SCMR Guideline for HCM. Circulation 2024;149:e1239-e1311 (T negative giganti nella forma apicale).',
    memoria: 'Rosenbaum MB et al. Electrotonic modulation of the T wave and cardiac memory. Am J Cardiol 1982;50:213-222.',
    acs: 'Byrne RA et al. 2023 ESC Guidelines for ACS. Eur Heart J 2023;44:3720-3826.'
  };

  function n(v) { if (v === '' || v == null || v === true || v === false) return null; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; }
  function f1(x) { return x == null ? '—' : (Math.round(x * 100) / 100).toString().replace('.', ','); }

  /* input: { leads: {L: {t, qrs, morfo:'auto'|'positiva'|'negativa'|'bifasica+-'|'bifasica-+'|'piatta', simm:bool, larga:bool, st, stdAscJ:bool}},
              ctx: {dolore, qrsMs, bbs, pacing, wpw, ivs, bassiVolt, eta, potassio, rpNota, postCCH, ecgPrec:'uguale'|'diverso'|'',
                    seriatiDinamici, doloreRisolto, rConservate, qPatol, qtc, tachicardia, emorragiaCerebrale, farmaci, pacingRecente, anniInf16 } } */
  function evaluate(input) {
    const L = (input && input.leads) || {}, c = (input && input.ctx) || {};
    const passi = [], favore = [], contro = [], azioni = [], fonti = new Set();
    const lead = k => L[k] || {};
    const T = k => n(lead(k).t), Q = k => n(lead(k).qrs);
    const morfo = k => { const m = lead(k).morfo; if (m && m !== 'auto') return m; const t = T(k); return t == null ? null : t >= 0.5 ? 'positiva' : t <= -0.5 ? 'negativa' : 'piatta'; };
    const qrsMs = n(c.qrsMs);
    const secondario = !!(c.bbs || c.pacing || c.wpw || (qrsMs !== null && qrsMs >= 120));
    const letti = LEADS.filter(k => T(k) !== null);

    // PASSO 1 – applicabilità
    if (!letti.length) return { categoria: 'dati insufficienti', titolo: 'Inserisci l\'ampiezza della T (e del QRS) nelle derivazioni', passi: [], favore: [], contro: [], azioni: ['Leggi il tracciato (foto/PDF) o inserisci T e QRS nella scheda Derivazioni.'], fonti: [], letti: [] };
    if (secondario) { passi.push(['1. Applicabilità', 'QRS largo / BBS / pacing / WPW: le alterazioni ST-T sono in parte SECONDARIE; i criteri delle T iperacute sono stati derivati con QRS < 110 ms e NON si applicano. Usa Sgarbossa modificato (Smith) / Barcellona nel referto.']); fonti.add(FONTI.hatw); }
    else if (qrsMs !== null && qrsMs >= 110) passi.push(['1. Applicabilità', 'QRS ' + qrsMs + ' ms (110–119): fuori dalla popolazione di validazione delle T iperacute (QRS < 110 ms) – risultato meno affidabile.']);
    else passi.push(['1. Applicabilità', 'QRS stretto (o non indicato): criteri applicabili con cautela.']);
    if (c.bassiVolt) passi.push(['   Avviso', 'Bassi voltaggi del QRS: il rapporto T/QRS risulta falsamente alto.']);
    if (c.ivs) passi.push(['   Avviso', 'IVS: T alte proporzionate a QRS ampi e ST-T secondario (strain) frequenti.']);

    // PASSO 2 – T voluminose rispetto al QRS
    const big = {};
    LEADS.forEach(k => {
      if (k === 'aVR') return;
      const t = T(k), q = Q(k); if (t == null || q == null || q < 1 || t <= 0) return;
      const lim = PREC.includes(k) ? OPER.prec : OPER.limb;
      const r = t / q;
      if ((t >= lim.min && r >= lim.rat) || (lead(k).simm && lead(k).larga && t >= lim.min * 0.8)) big[k] = r;
    });
    const coppie = CONTIG.filter(p => big[p[0]] && big[p[1]]);
    const bigL = Array.from(new Set([].concat.apply([], coppie)));
    const terr = Object.keys(TERR).filter(t => TERR[t].filter(k => bigL.includes(k)).length >= 2);
    passi.push(['2. T voluminose (T/QRS)', bigL.length ? 'in ' + bigL.map(k => k + ' ' + f1(big[k])).join(', ') + ' – territorio ' + (terr.join(', ') || 'non definito') : 'nessuna coppia di derivazioni contigue sopra la soglia operativa']);
    passi.push(['   Nota sulle soglie', 'Rapporto T/QRS ≥ 0,75 (periferiche, T ≥ 2,5 mm) e ≥ 1,0 (precordiali, T ≥ 6 mm) = soglie OPERATIVE di ECGcheck, NON validate. Gli studi pubblicati usano l\'AREA della T rispetto all\'ampiezza del QRS e la simmetria con soglie per derivazione non pubblicate; la sola ampiezza della T non è diagnostica.']);
    fonti.add(FONTI.hatw); fonti.add(FONTI.hatw0); fonti.add(FONTI.amp);

    // PASSO 3 – elementi a favore / contro un'origine ischemica delle T alte
    let hatw = false;
    if (bigL.length && !secondario) {
      const simm = bigL.filter(k => lead(k).simm), larghe = bigL.filter(k => lead(k).larga);
      if (simm.length) favore.push('T simmetriche (picco ≤ 67% di J–T) in ' + simm.join(', '));
      if (larghe.length) favore.push('T larghe alla base («voluminose») in ' + larghe.join(', '));
      const rec = [];
      terr.forEach(t => { (RECIP[t] || []).forEach(k => { const st = n(lead(k).st), m = morfo(k); if ((st !== null && st <= -0.5) || m === 'negativa') rec.push(k); }); });
      if (rec.length) favore.push('Reciprocità (STD o T negativa) in ' + Array.from(new Set(rec)).join(', '));
      if (c.dolore) favore.push('Dolore toracico / sintomi in atto');
      if (c.ecgPrec === 'diverso') favore.push('T nuove rispetto a un ECG precedente');
      if (c.seriatiDinamici) favore.push('Evoluzione dinamica agli ECG seriati');
      const stE = bigL.filter(k => n(lead(k).st) !== null && n(lead(k).st) >= 1); if (stE.length) favore.push('ST sopraslivellato in ' + stE.join(', '));
      if (c.ecgPrec === 'uguale') contro.push('T invariate rispetto a un ECG precedente');
      if (c.potassio !== undefined && n(c.potassio) !== null && n(c.potassio) >= 5.5) contro.push('Potassio ' + n(c.potassio) + ' mmol/L: iperkaliemia (T strette, appuntite «a tenda», base stretta)');
      if (c.rpNota) contro.push('Ripolarizzazione precoce nota (notch/slur del punto J, ST concavo, R alte)');
      if (c.ivs) contro.push('IVS (T proporzionate a QRS ampi)');
      if (c.anniInf16 || (n(c.eta) !== null && n(c.eta) < 35 && !c.dolore)) contro.push('Soggetto giovane senza sintomi (vagotonia / variante normale)');
      if (bigL.some(k => !lead(k).simm) && simm.length === 0) contro.push('T asimmetriche (picco tardivo)');
      hatw = favore.length >= 2 && favore.length > contro.length;
      fonti.add(FONTI.ecdp);
    }
    // de Winter
    const dw = PREC.filter(k => lead(k).stdAscJ && (T(k) || 0) >= 4);
    if (dw.length >= 2 && !secondario) { favore.push('Pattern di de Winter (STD ascendente al J con T alte simmetriche) in ' + dw.join(', ')); hatw = true; fonti.add(FONTI.dewinter); }

    // PASSO 4 – T negative / bifasiche
    const neg = LEADS.filter(k => { const m = morfo(k); return m === 'negativa' || m === 'bifasica+-' || m === 'bifasica-+'; });
    const negPat = neg.filter(k => !(k === 'aVR' || k === 'V1' || (k === 'III' && !neg.includes('aVF'))));
    let wellens = null, nonIsch = [];
    if (negPat.length) {
      passi.push(['4. T negative/bifasiche', negPat.join(', ') + ' (normali isolate in aVR, V1 e III)']);
      const v23 = ['V2', 'V3'];
      const bif = v23.filter(k => morfo(k) === 'bifasica+-'), deep = v23.filter(k => morfo(k) === 'negativa' && (T(k) || 0) <= -1);
      if ((bif.length || deep.length) && !secondario) {
        wellens = bif.length ? 'A' : 'B';
        const crit = [];
        if (c.doloreRisolto) crit.push('dolore risolto'); if (c.rConservate) crit.push('R conservate'); if (!c.qPatol) crit.push('senza Q patologiche');
        passi.push(['   Wellens', 'tipo ' + wellens + ' (' + (wellens === 'A' ? 'T bifasiche +/− in V2–V3' : 'T negative profonde simmetriche in V2–V3') + ')' + (crit.length ? '; ' + crit.join(', ') : '') + ' → riperfusione di IVA critica: NSTEMI ad alto rischio']);
        fonti.add(FONTI.wellens);
      }
      if (c.ecgPrec === 'diverso' && c.dolore) passi.push(['   Pseudonormalizzazione', 'T prima negative e ora positive durante il dolore = possibile riocclusione (trattare come OMI)']);
      // non ischemiche
      if (c.ivs && neg.some(k => ['I', 'aVL', 'V5', 'V6'].includes(k))) nonIsch.push(['Strain da IVS', 'T negative asimmetriche laterali con STD e QRS ampi', FONTI.aha2009]);
      if (neg.some(k => ['V4', 'V5', 'V6'].includes(k) && (T(k) || 0) <= -10)) nonIsch.push(['Cardiomiopatia ipertrofica apicale', 'T negative giganti (≥ 10 mm) V4–V6', FONTI.cmi]);
      if (neg.includes('aVR') === false && morfo('aVR') === 'positiva' && !neg.includes('V1') && negPat.length >= 4) nonIsch.push(['Takotsubo (vs IMA anteriore)', 'T negative diffuse con T positiva in aVR e assenza di T negativa in V1 (Kosuge 2010)', FONTI.tako]);
      if (c.tachicardia && negPat.some(k => ['V1', 'V2', 'V3', 'V4', 'III'].includes(k))) nonIsch.push(['Embolia polmonare / sovraccarico VD', 'T negative V1–V4 e III con tachicardia (± S1Q3T3)', FONTI.ep]);
      if (c.emorragiaCerebrale) nonIsch.push(['T «cerebrali»', 'T negative giganti e larghe, QT lungo (emorragia subaracnoidea, ictus)', FONTI.aha2009]);
      if (c.pacingRecente) nonIsch.push(['Memoria cardiaca', 'T negative dopo pacing ventricolare, BBS intermittente, ablazione di via accessoria o tachicardia', FONTI.memoria]);
      if (negPat.every(k => ['V1', 'V2', 'V3'].includes(k)) && c.anniInf16) nonIsch.push(['Pattern giovanile', 'T negative V1–V3 sotto i 16 anni', FONTI.aha2009]);
      if (negPat.every(k => ['V1', 'V2', 'V3'].includes(k)) && !c.anniInf16 && !c.bbdx) nonIsch.push(['Cardiomiopatia aritmogena (DD)', 'T negative V1–V3 dopo i 14 anni senza BBDx = criterio maggiore Task Force 2010', FONTI.arvc]);
      if (c.potassio !== undefined && n(c.potassio) !== null && n(c.potassio) < 3.5) nonIsch.push(['Ipokaliemia', 'T appiattite/negative con onde U e QT(U) lungo', FONTI.aha2009]);
      if (c.farmaci) nonIsch.push(['Farmaci', 'digitale (ST «a scodella»), antiaritmici, psicofarmaci', FONTI.aha2009]);
      if (c.postCCH) nonIsch.push(['Post-cardiochirurgia', 'T negative diffuse frequenti nei primi giorni (pericardite/sindrome post-pericardiotomica, edema, ipotermia): confronta con l\'ECG pre-operatorio; nuove Q, STE localizzato o T iperacute in un territorio coronarico (graft) richiedono valutazione urgente', FONTI.peric]);
      if (secondario) nonIsch.push(['Secondarie', 'T discordanti al QRS in BBS/BBDx/pacing/WPW/IVS sono attese', FONTI.aha2009]);
      fonti.add(FONTI.aha2009);
    } else passi.push(['4. T negative/bifasiche', 'nessuna patologica (escluse aVR, V1 e III isolata)']);

    // PASSO 5 – conclusione prudente
    let categoria, titolo;
    if (hatw && !secondario) {
      categoria = 'iperacuta-sospetta';
      titolo = 'T compatibili con T IPERACUTE (OMI-equivalente) – ' + (terr.join(', ') || 'territorio da definire');
      azioni.push('Trattare come possibile OMI: ECG seriati ogni 15–30 min, troponina, valutazione medica/cardiologica IMMEDIATA; discutere coronarografia urgente se sintomi persistenti.');
      azioni.push('Confronta con un ECG precedente e cerca reciprocità (aVL per le inferiori) e STD in V1–V4 (posteriore).');
      fonti.add(FONTI.acs);
    } else if (wellens) {
      categoria = 'ischemica-wellens';
      titolo = 'T negative compatibili con sindrome di Wellens tipo ' + wellens + ' (NSTEMI ad alto rischio)';
      azioni.push('Coronarografia precoce; EVITARE il test da sforzo; troponina ed ECG seriati.');
      fonti.add(FONTI.acs);
    } else if (bigL.length && !secondario) {
      categoria = 'indeterminata';
      titolo = 'T voluminose senza elementi sufficienti per definirle iperacute – NON escluso OMI';
      azioni.push('ECG seriati (15–30 min) e confronto con ECG precedenti; se dolore in atto: valutazione medica immediata.');
    } else if (nonIsch.length) {
      categoria = 'altra-eziologia';
      titolo = 'Alterazioni dell\'onda T con possibili cause NON ischemiche (diagnosi di esclusione)';
      azioni.push('Escludere comunque un\'origine ischemica (troponina, ECG seriati) se il quadro clinico è compatibile.');
    } else if (negPat.length) {
      categoria = 'aspecifica';
      titolo = 'T negative aspecifiche: origine da definire';
      azioni.push('Correlare con clinica, troponina, ecocardiogramma; ECG seriati.');
    } else {
      categoria = 'nessun reperto';
      titolo = 'Nessuna alterazione significativa dell\'onda T nelle derivazioni inserite (' + letti.length + '/12)';
      if (letti.length < 12) azioni.push('Derivazioni non valutate: ' + LEADS.filter(k => T(k) === null).join(', ') + '.');
    }
    if (c.postCCH && categoria !== 'nessun reperto') azioni.push('Paziente cardiochirurgico: confronta con l\'ECG post-operatorio precedente; T iperacute/STE in un territorio di bypass = possibile occlusione del graft.');
    return { categoria, titolo, passi, favore, contro, nonIsch, azioni, fonti: Array.from(fonti), letti, bigL, terr, wellens, hatw };
  }

  // derivazioni → input del calcolatore (dai valori della scheda Derivazioni)
  function fromData(d) {
    const leads = {}; const tw = (d && d.twCalc) || {};
    LEADS.forEach(k => {
      const l = (d.leads || {})[k] || {}; const o = (tw.leads || {})[k] || {};
      const r = n(l.r), s = n(l.s), t = n(l.t);
      leads[k] = { t: o.t != null && o.t !== '' ? o.t : t, qrs: o.qrs != null && o.qrs !== '' ? o.qrs : (r != null || s != null ? Math.abs(r || 0) + Math.abs(s || 0) : null), morfo: o.morfo || 'auto', simm: !!o.simm, larga: !!o.larga, st: l.st, stdAscJ: !!o.stdAscJ };
    });
    const ctx = Object.assign({ qrsMs: n((d.intervalli || {}).qrs), eta: n((d.paziente || {}).eta) }, tw.ctx || {});
    return { leads, ctx };
  }

  /* ---------------- rendering ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  const CTXF = [['dolore', 'Dolore/sintomi in atto'], ['doloreRisolto', 'Dolore risolto (Wellens)'], ['rConservate', 'R conservate in V2–V3'], ['qPatol', 'Q patologiche'], ['bbs', 'BBS'], ['bbdx', 'BBDx'], ['pacing', 'Ritmo stimolato'], ['wpw', 'Pre-eccitazione'], ['ivs', 'IVS'], ['bassiVolt', 'Bassi voltaggi'], ['rpNota', 'Ripolarizzazione precoce nota'], ['tachicardia', 'Tachicardia / sospetta EP'], ['emorragiaCerebrale', 'Evento cerebrale acuto'], ['pacingRecente', 'Pacing/BBS intermittente recente (memoria)'], ['farmaci', 'Digitale / antiaritmici'], ['anniInf16', 'Età < 16 anni'], ['postCCH', 'Post-cardiochirurgia'], ['seriatiDinamici', 'Evoluzione agli ECG seriati']];
  function render(el, d, H) {
    if (!el) return;
    d.twCalc = d.twCalc || { leads: {}, ctx: {} };
    const inp = fromData(d); const res = evaluate(inp);
    const cls = res.categoria === 'iperacuta-sospetta' ? 'critico' : res.categoria === 'ischemica-wellens' || res.categoria === 'indeterminata' ? 'alto' : res.categoria === 'nessun reperto' ? 'normale' : 'moderato';
    let h = '<div class="card"><h3>🌊 Onda T – iperacuta, ischemica o altra eziologia</h3><p class="hint">Valori presi dalla scheda Derivazioni (modificabili qui: T e ampiezza del QRS = R + |S| in mm). Spunta simmetria (picco ≤ 67% di J–T) e base larga guardando il tracciato. Le soglie T/QRS sono <b>operative, non validate</b>.</p>';
    h += '<div class="lead-table-wrap"><table class="tw-table"><tr><th></th><th>T mm</th><th>QRS mm</th><th>Morfologia</th><th>Simm.</th><th>Larga</th><th>STD asc. J</th></tr>' + LEADS.map(k => {
      const L = inp.leads[k];
      return '<tr><td class="ln">' + k + '</td><td><input data-tw="' + k + '.t" inputmode="decimal" value="' + esc(L.t == null ? '' : L.t) + '" aria-label="T ' + k + '"></td><td><input data-tw="' + k + '.qrs" inputmode="decimal" value="' + esc(L.qrs == null ? '' : L.qrs) + '" aria-label="QRS ' + k + '"></td><td><select data-tw="' + k + '.morfo" aria-label="Morfologia T ' + k + '">' + [['auto', 'dal segno'], ['positiva', 'positiva'], ['negativa', 'negativa'], ['bifasica+-', 'bifasica +/−'], ['bifasica-+', 'bifasica −/+'], ['piatta', 'piatta']].map(o => '<option value="' + o[0] + '"' + (L.morfo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></td><td><input type="checkbox" data-tw="' + k + '.simm"' + (L.simm ? ' checked' : '') + ' aria-label="T simmetrica ' + k + '"></td><td><input type="checkbox" data-tw="' + k + '.larga"' + (L.larga ? ' checked' : '') + ' aria-label="T larga ' + k + '"></td><td>' + (/^V/.test(k) ? '<input type="checkbox" data-tw="' + k + '.stdAscJ"' + (L.stdAscJ ? ' checked' : '') + ' aria-label="STD ascendente ' + k + '">' : '') + '</td></tr>';
    }).join('') + '</table></div>';
    h += '<div class="chk-grid">' + CTXF.map(f => '<label class="chk"><input type="checkbox" data-twc="' + f[0] + '"' + ((d.twCalc.ctx || {})[f[0]] ? ' checked' : '') + '> ' + f[1] + '</label>').join('') + '</div>';
    h += '<label class="chk">Potassio (mmol/L) <input data-twc="potassio" inputmode="decimal" style="width:70px" value="' + esc((d.twCalc.ctx || {}).potassio || '') + '"></label> <label class="chk">ECG precedente <select data-twc="ecgPrec"><option value="">non disponibile</option><option value="uguale"' + ((d.twCalc.ctx || {}).ecgPrec === 'uguale' ? ' selected' : '') + '>T invariate</option><option value="diverso"' + ((d.twCalc.ctx || {}).ecgPrec === 'diverso' ? ' selected' : '') + '>T nuove/diverse</option></select></label>';
    h += '<div class="tw-res"><i class="dot ' + cls + '"></i> <b>' + esc(res.titolo) + '</b>';
    h += '<table class="tw-table"><tr><th>Passo</th><th>Esito</th></tr>' + res.passi.map(p => '<tr><td>' + esc(p[0]) + '</td><td>' + esc(p[1]) + '</td></tr>').join('') + '</table>';
    if (res.favore.length || res.contro.length) h += '<table class="tw-table"><tr><th>A favore di ischemia/OMI</th><th>Contro / alternative</th></tr><tr><td>' + (res.favore.map(esc).join('<br>') || '—') + '</td><td>' + (res.contro.map(esc).join('<br>') || '—') + '</td></tr></table>';
    if (res.nonIsch && res.nonIsch.length) h += '<p><b>Possibili cause non ischemiche</b></p><ul>' + res.nonIsch.map(x => '<li><b>' + esc(x[0]) + '</b>: ' + esc(x[1]) + '</li>').join('') + '</ul>';
    if (res.azioni.length) h += '<p><b>Azioni consigliate</b></p><ul>' + res.azioni.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>';
    if (res.categoria === 'iperacuta-sospetta' || res.wellens) h += '<div class="actions"><button class="btn sm primary" id="twToReport">➜ Riporta nel referto (scheda Pattern)</button></div>';
    h += '<details><summary class="hint">Fonti</summary><ul>' + res.fonti.map(x => '<li class="hint">' + esc(x) + '</li>').join('') + '</ul></details></div></div>';
    el.innerHTML = h;
    const save = () => { if (H && H.persist) H.persist(); render(el, d, H); if (H && H.schedule) H.schedule(); };
    el.querySelectorAll('[data-tw]').forEach(x => x.addEventListener('change', () => {
      const [k, q] = x.dataset.tw.split('.'); d.twCalc.leads[k] = d.twCalc.leads[k] || {};
      d.twCalc.leads[k][q] = x.type === 'checkbox' ? x.checked : x.value.replace(',', '.'); save();
    }));
    el.querySelectorAll('[data-twc]').forEach(x => x.addEventListener('change', () => { d.twCalc.ctx[x.dataset.twc] = x.type === 'checkbox' ? x.checked : x.value.replace(',', '.'); save(); }));
    const b = el.querySelector('#twToReport'); if (b) b.onclick = () => {
      d.pattern = d.pattern || {};
      if (res.hatw) { if (res.terr.includes('inferiore')) d.pattern.tIperInf = true; if (res.terr.includes('anteriore')) d.pattern.tIperAnt = true; if (res.terr.includes('laterale')) d.pattern.tIperLat = true; if (!res.terr.length) d.pattern.tIperAnt = true; }
      if (res.wellens === 'A') d.pattern.wellensA = true; if (res.wellens === 'B') d.pattern.wellensB = true;
      if (H && H.applied) H.applied(); save();
    };
  }

  const API = { evaluate, fromData, render, OPER, FONTI, LEADS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ECGTwave = API;
})(typeof window !== 'undefined' ? window : this);
