/* =====================================================================
   ECGcheck — Pagina «Criteri»: testo di consultazione (offline)
   Tabelle sinottiche con fonte e data di ogni sezione.
   Revisione: 09/11/2026 (criteri 2026.11.3)
   ===================================================================== */
(function (root) {
  'use strict';
  const T = (head, rows) => '<div class="lead-table-wrap"><table class="crit-t"><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';

  const SEZIONI = [
    {
      id: 'ivs', titolo: 'Ipertrofia ventricolare sinistra e destra', data: '11/2026',
      fonte: 'Hancock EW et al. AHA/ACCF/HRS 2009 Part V (Circulation 2009;119:e251); Peguero JG et al. JACC 2017;69:1694; Armstrong EJ et al. Am J Cardiol 2012;110:977',
      html: '<p>I criteri di voltaggio hanno <b>bassa sensibilità</b> (20–60%) e buona specificità (85–95%); l\'ecocardiogramma resta il riferimento. Valori in mm a 10 mm/mV.</p>' +
        T(['Criterio IVS', 'Definizione', 'Soglia'], [
          ['Sokolow-Lyon', 'S V1 + R V5 o V6 (la maggiore)', '≥ 35 mm'],
          ['Sokolow (aVL)', 'R aVL', '≥ 11 mm'],
          ['Cornell (voltaggio)', 'R aVL + S V3', '> 28 mm uomo; > 20 mm donna'],
          ['Prodotto di Cornell', '(R aVL + S V3 [+ 6 mm nella donna]) × durata QRS', '> 2440 mm·ms'],
          ['Peguero-Lo Presti', 'S più profonda in qualunque derivazione + S V4', '≥ 28 mm uomo; ≥ 23 mm donna'],
          ['Romhilt-Estes (punteggio)', 'Voltaggio 3, strain 3 (1 se digitale), PTFV1 3, asse ≤ −30° 2, QRS ≥ 90 ms 1, intrinsecoide V5–V6 ≥ 50 ms 1', '5 = IVS; 4 = probabile'],
          ['Strain', 'ST sottoslivellato discendente e T asimmetrica negativa in V5–V6, I, aVL, discordante al QRS', 'aumenta la specificità']
        ]) +
        '<p><b>IVS e ischemia</b>: in V1–V3 lo STE discordante alla S profonda è atteso; è sproporzionato (sospetto OMI) se STE/S ≥ 25% (Armstrong 2012). Lo STD con R dominante in V5–V6 è secondario (strain).</p>' +
        T(['Criterio IVD (adulto)', 'Soglia'], [
          ['R V1', '≥ 7 mm'], ['R/S in V1', '> 1 (R ≥ S)'], ['R V1 + S V5/V6', '> 10,5 mm'], ['qR in V1', 'presente'], ['R/S in V5–V6', '< 1'], ['Asse', '≥ +90° (+110° più specifico)'], ['Strain destro', 'STD/T negative V1–V3'], ['P polmonare', 'P in II ≥ 2,5 mm']
        ]) + '<p class="hint">DD della R alta in V1: IMA posteriore, BBDx, WPW, cardiomiopatia ipertrofica, distrofia muscolare, destrocardia, posizionamento errato.</p>'
    },
    {
      id: 'omi', titolo: 'STEMI, OMI e STEMI-equivalenti', data: '11/2026',
      fonte: 'IV UDMI (Thygesen 2018, Eur Heart J 2019;40:237) – soglie confermate nella V UDMI (Mills et al., Eur Heart J 2026;47:5911, capitolo ECG da verificare sul testo integrale); ESC 2023 SCA; ACC 2022 ECDP (Kontos); ACC/AHA 2025 SCA; Meyers JAHA 2021; Smith Ann Emerg Med 2012; Di Marco JAHA 2020; Driver J Electrocardiol 2017',
      html: '<p>Il paradigma <b>OMI/NOMI</b> (occlusione coronarica acuta vs non occlusione) supera la dicotomia STEMI/NSTEMI: circa il 25–30% delle occlusioni non soddisfa i criteri di STE. In presenza di sintomi i pattern seguenti vanno trattati come STEMI.</p>' +
        T(['Derivazioni', 'Soglia STE al punto J (2 contigue)'], [
          ['V2–V3 uomo ≥ 40 anni', '≥ 2 mm'], ['V2–V3 uomo < 40 anni', '≥ 2,5 mm'], ['V2–V3 donna (ogni età)', '≥ 1,5 mm'], ['Altre derivazioni', '≥ 1 mm'],
          ['V7–V9 (posteriori)', '≥ 0,5 mm (≥ 1 mm uomo < 40 a)'], ['V3R–V4R (VD)', '≥ 0,5 mm (≥ 1 mm uomo < 30 a)'], ['STD (nuovo)', '≥ 0,5 mm orizzontale/discendente in 2 contigue'], ['T negativa (nuova)', '≥ 1 mm in 2 contigue con R prominente o R/S > 1']
        ]) +
        T(['STEMI-equivalente / OMI', 'Criteri ECG', 'Significato'], [
          ['STDmax V1–V4 (Meyers 2021)', 'STD massimo in V1–V4 (non in V5–V6), spesso R alte e T positive in V2–V3', 'OMI posteriore (spec. ~97%): registrare V7–V9'],
          ['Posteriore', 'STE V7–V9 ≥ 0,5 mm', 'circonflessa / CDx postero-laterale'],
          ['VD', 'STE V4R ≥ 0,5–1 mm; STE V1 con STE inferiore', 'evitare nitrati e diuretici'],
          ['de Winter', 'STD ascendente 1–3 mm al J in V1–V6 che prosegue in T alte e simmetriche; ± STE aVR', 'IVA prossimale (~2%)'],
          ['T iperacute', 'T larghe alla base, simmetriche, voluminose rispetto al QRS', 'fase precoce di occlusione'],
          ['Wellens A / B', 'T bifasiche (+/−) / negative profonde simmetriche in V2–V3, senza Q, R conservate, paziente spesso asintomatico', 'IVA critica riperfusa: coronarografia, NO test da sforzo'],
          ['Aslanger', 'STE isolato in III, STD V4–V6 con T positiva, V1 > V2, nessun STD V2', 'IMA inferiore + malattia multivasale'],
          ['South African flag', 'STE I, aVL, V2 con STD in III (± aVF)', 'D1 / marginale'],
          ['Inferiore + aVL', 'STE inferiore anche < 1 mm con STD reciproco in aVL', 'raro in pericardite / ripolarizzazione precoce'],
          ['aVR + STD diffuso', 'STE aVR ≥ 1 mm con STD ≥ 1 mm in ≥ 6–8 derivazioni', 'ischemia subendocardica diffusa (TC/3 vasi): NSTEMI alto rischio, non occlusione'],
          ['Distorsione terminale QRS', 'assenza di S e di onda J in V2 o V3', 'IVA (esclude variante normale)'],
          ['Formula a 4 variabili', '0,052·QTcB − 0,151·QRSV2 − 0,268·RV4 + 1,062·STE60V3', '≥ 18,2 → occlusione IVA (sens. 83%, spec. 88%)'],
          ['Formula semplificata di Aslanger', '(RV4 + QRSV2) − (QT in mm + STE60V3)', '< 12 → occlusione IVA']
        ]) +
        T(['BBSx / ritmo stimolato', 'Criterio', 'Note'], [
          ['Sgarbossa originale', 'STE concordante ≥ 1 mm (5 p); STD concordante ≥ 1 mm V1–V3 (3 p); STE discordante ≥ 5 mm (2 p)', '≥ 3 punti: specifico, poco sensibile'],
          ['Smith-modified Sgarbossa', 'sostituisce il 3° criterio con STE discordante / S ≥ 0,25', 'sens. 80–91%, spec. 90–99%; validato anche nel ritmo da PM (VD)'],
          ['Barcellona (2020)', 'deviazione ST concordante ≥ 1 mm in qualunque derivazione, oppure discordante ≥ 1 mm con max(R|S) ≤ 6 mm', 'solo BBSx; validazione esterna limitata']
        ])
    },
    {
      id: 'peric', titolo: 'Pericardite acuta e pericardite vs OMI', data: '11/2026',
      fonte: 'Schulz-Menger J, Imazio M et al. 2025 ESC Guidelines myocarditis and pericarditis (Eur Heart J 2025;46:3952); Bischof JE, Smith SW Am J Emerg Med 2016; Ginzberg 1983',
      html: '<p>Diagnosi ESC 2025: ≥ 2 tra dolore pericarditico, sfregamento, <b>STE diffuso di nuova insorgenza o sottoslivellamento del PR</b>, versamento pericardico (nuovo o in aumento); supportivi: PCR/VES, imaging (RM). Stadi ECG di Spodick: I STE diffuso concavo + PR sottoslivellato; II normalizzazione; III T negative; IV normalizzazione.</p>' +
        T(['Elemento', 'Pericardite', 'OMI'], [
          ['Distribuzione STE', 'diffusa, non territoriale (anche I, II, aVL, aVF, V2–V6)', 'territoriale'],
          ['Reciprocità', 'solo aVR (± V1)', 'STD reciproco (aVL nell\'inferiore, III nel laterale)'],
          ['STD in aVL', 'raro', 'molto frequente nell\'IMA inferiore (sensibile)'],
          ['STE III > II', 'raro', 'tipico dell\'occlusione CDx'],
          ['PR', 'sottoslivellato (II, aVF, V4–V6), sopraslivellato in aVR', 'di solito normale (l\'infarto atriale è raro)'],
          ['Morfologia ST', 'concava', 'convessa / rettilinea, T iperacute'],
          ['Onde Q, QT', 'assenti; QT normale', 'Q possibili; QT spesso più lungo'],
          ['Segno di Spodick', 'pendenza discendente del TP', '—'],
          ['ST/T in V6', '≥ 0,25 (vs ripolarizzazione precoce)', '—']
        ]) + '<p class="hint">Post-cardiochirurgia: lo STE diffuso è frequente (pericardite post-pericardiotomica); un STE regionale nuovo con reciprocità richiede sempre di escludere l\'IMA tipo 5/procedurale (V UDMI: "procedure-related MI").</p>'
    },
    {
      id: 'rp', titolo: 'Ripolarizzazione precoce e sindromi dell\'onda J', data: '11/2026',
      fonte: 'Macfarlane PW et al. JACC 2015;66:470; Nademanee K, Wilde AAM et al. J Arrhythm 2026;42:e70284 (consenso APHRS/JHRS, Shanghai score modificato); ESC 2022 VA',
      html: '<p><b>Pattern</b>: elevazione del punto J (Jp) ≥ 1 mm (0,1 mV) con notch o slurring terminale del QRS sulla branca discendente di una R prominente, in ≥ 2 derivazioni inferiori e/o laterali contigue (V1–V3 escluse). <b>Sindrome</b>: pattern + FV/TV polimorfa o arresto inspiegato.</p>' +
        T(['Caratteristica ad alto rischio', 'Commento'], [
          ['Localizzazione inferiore o infero-laterale', 'associata a morte improvvisa'], ['Jp ≥ 2 mm (0,2 mV)', 'rischio maggiore'], ['ST orizzontale / discendente dopo J', 'HR ~11 nel consenso 2026 (vs ascendente benigno)'], ['Variazioni dinamiche del J', 'pause, bradicardia, febbre'], ['Anamnesi di sincope aritmica / familiarità', '']
        ]) +
        T(['Shanghai score ERS modificato (2026)', 'Punti'], [
          ['Arresto inspiegato, FV o TV polimorfa documentata', '3'], ['Sincope sospetta aritmica', '2'], ['Sincope di meccanismo incerto', '1'],
          ['ER ≥ 0,2 mV in > 2 derivazioni inferiori/laterali con ST orizzontale/discendente', '2'], ['Variazioni dinamiche del J (≥ 0,1 mV)', '1,5'], ['J ≥ 0,1 mV in ≥ 2 inferiori/laterali', '1'],
          ['Holter: BEV a breve accoppiamento (R su T)', '2'], ['Familiare con ERS definita / ≥ 2 di 1° grado con pattern II.A', '2'], ['Familiare di 1° grado con pattern II.A', '1'], ['Morte improvvisa < 45 a in familiare', '0,5'],
          ['<b>Totale</b>', '≥ 5 probabile/definita; 3–4,5 possibile; < 3 non diagnostica (richiede ≥ 1 criterio ECG)']
        ]) +
        T(['Shanghai score Brugada modificato (2026)', 'Punti'], [
          ['Tipo 1 spontaneo (derivazioni standard o alte)', '3,5'], ['Tipo 1 indotto dalla febbre', '3'], ['Tipo 1 indotto da bloccante dei canali Na⁺', '2'],
          ['Arresto / FV / TV polimorfa', '3'], ['Respiro agonico notturno; sincope aritmica', '2'], ['Sincope di causa incerta', '1'],
          ['Familiare con BrS definita', '2'], ['Morte improvvisa sospetta in familiare', '1'], ['Morte improvvisa < 45 a con autopsia negativa', '0,5'], ['Variante SCN5A patogena/probabilmente patogena', '0,5'],
          ['<b>Totale</b>', '> 3,5 probabile/definita; 2–3 possibile; < 2 non diagnostica (≥ 1 criterio ECG obbligatorio)']
        ]) + '<p class="hint">Il pattern di Brugada tipo 1 (coved ≥ 2 mm seguito da T negativa in V1–V2, anche nel II–III spazio intercostale) spontaneo è diagnostico; il tipo 2 (saddle-back) non lo è. Le fenocopie (febbre, iperkaliemia, farmaci) vanno escluse.</p>'
    },
    {
      id: 'bav', titolo: 'Blocchi atrioventricolari', data: '11/2026',
      fonte: 'Kusumoto FM et al. 2018 ACC/AHA/HRS bradicardia (Circulation 2019;140:e382); Glikson M et al. 2021 ESC Pacing e CRT (Eur Heart J 2021;42:3427)',
      html: T(['Tipo', 'Criteri ECG', 'Sede / gestione'], [
        ['BAV I grado', 'PR > 200 ms, ogni P condotta', 'di solito nodale; PR > 300 ms sintomatico può richiedere PM'],
        ['BAV II Mobitz I (Wenckebach)', 'PR che si allunga progressivamente fino a una P bloccata; RR che si accorciano; pausa < 2 RR', 'nodale, spesso benigno (vagale, farmaci, IMA inferiore)'],
        ['BAV II Mobitz II', 'PR costante, P bloccata improvvisa', 'infranodale (spesso QRS largo): indicazione a PM'],
        ['BAV 2:1', 'una P condotta e una bloccata; non distinguibile tra I e II', 'QRS largo, PR condotto normale e assenza di risposta all\'atropina suggeriscono sede infranodale'],
        ['BAV avanzato / alto grado', '≥ 2 P consecutive bloccate con alcune condotte', 'indicazione a PM'],
        ['BAV III grado', 'P e QRS indipendenti (dissociazione AV completa), frequenza atriale > ventricolare; scappamento giunzionale (QRS stretto, 40–60/min) o ventricolare (largo, 20–40/min)', 'PM (temporaneo se instabile)'],
        ['Dissociazione AV isoritmica', 'frequenza ventricolare ≥ atriale', 'non è un blocco']
      ]) + '<p class="hint">Post-cardiochirurgia (valvole aortica/mitralica, tricuspide): BAV avanzato/completo che persiste 5–7 giorni (ESC 2021) → PM definitivo.</p>'
    },
    {
      id: 'bb', titolo: 'Blocchi di branca, emiblocchi e blocco bifascicolare', data: '11/2026',
      fonte: 'Surawicz B et al. AHA/ACCF/HRS 2009 Part III (JACC 2009;53:976); Strauss DG et al. Am J Cardiol 2011;107:927; ESC 2021 Pacing/CRT',
      html: T(['Disturbo', 'Criteri (adulto)'], [
        ['BBDx completo', 'QRS ≥ 120 ms; rsr′, rsR′ o rSR′ in V1–V2 (R′ > r); S larga (≥ 40 ms o > R) in I e V6; tempo al picco R in V1 > 50 ms con V5–V6 normale'],
        ['BBDx incompleto', 'stessa morfologia con QRS 110–119 ms'],
        ['BBSx completo (AHA 2009)', 'QRS ≥ 120 ms; R larga e intaccata/impastata in I, aVL, V5–V6; assenza di q in I, V5–V6; tempo al picco R > 60 ms in V5–V6; ST-T discordante'],
        ['BBSx "vero" (Strauss)', 'QRS ≥ 140 ms uomo / ≥ 130 ms donna, QS o rS in V1–V2, notch/slur medio-QRS in ≥ 2 tra V1, V2, V5, V6, I, aVL (rilevante per la CRT)'],
        ['BBSx incompleto', 'QRS 110–119 ms, morfologia sinistra, tempo al picco R > 60 ms in V4–V6, assenza di q in I, V5–V6'],
        ['Ritardo IV aspecifico', 'QRS > 110 ms senza criteri di BBDx/BBSx'],
        ['Emiblocco anteriore sinistro', 'asse −45° / −90°; qR in aVL (tempo al picco R ≥ 45 ms), rS in II, III, aVF; QRS < 120 ms'],
        ['Emiblocco posteriore sinistro', 'asse +90° / +180°; rS in I e aVL, qR in III e aVF; QRS < 120 ms; diagnosi di esclusione (IVD, cuore verticale, IMA laterale)'],
        ['Blocco bifascicolare', 'BBDx + EAS oppure BBDx + EPS; con BAV I spesso detto "trifascicolare" (definizione impropria)'],
        ['Blocco di branca alternante', 'BBDx e BBSx su tracciati successivi o sullo stesso ECG: indicazione a PM (classe I)']
      ])
    },
    {
      id: 'tsv', titolo: 'Tachicardie da rientro: TRNAV e TRAV (WPW)', data: '11/2026',
      fonte: 'Brugada J et al. 2019 ESC SVT (Eur Heart J 2020;41:655); Page RL et al. 2015 ACC/AHA/HRS SVT; Kalbfleisch 1997 (RP)',
      html: '<p>Nelle tachicardie regolari a QRS stretto l\'intervallo <b>RP</b> (dall\'inizio del QRS alla P retrograda) orienta la diagnosi: RP corto < 70 ms → TRNAV tipica; RP ≥ 70 ms ma < PR → TRAV ortodromica; RP lungo (RP > PR) → tachicardia atriale, TRNAV atipica, PJRT.</p>' +
        T(['Elemento', 'TRNAV tipica (slow-fast)', 'TRAV ortodromica (via accessoria)'], [
          ['P retrograda', 'nascosta nel QRS o subito dopo: pseudo-r′ in V1, pseudo-S in II, III, aVF', 'separata dal QRS, nel tratto ST'],
          ['RP', '< 70 ms', '≥ 70 ms (RP < PR)'],
          ['Alternanza elettrica del QRS', 'rara', 'più frequente'],
          ['STD durante la tachicardia', 'possibile', 'frequente (non indica ischemia)'],
          ['ECG di base', 'normale', 'pre-eccitazione (PR < 120 ms, onda delta, QRS largo) se via manifesta; normale se occulta'],
          ['Frequenza', '140–250/min', '150–250/min'],
          ['Terapia acuta', 'Valsalva modificata, adenosina; CVE se instabile', 'idem; se FA pre-eccitata: NO bloccanti nodali, CVE o procainamide/ibutilide']
        ]) + '<p class="hint">FA pre-eccitata: tachicardia irregolare a QRS largo e variabile, frequenza anche > 250/min: rischio di FV.</p>'
    },
    {
      id: 'fa', titolo: 'Fibrillazione e flutter atriale', data: '11/2026',
      fonte: 'Van Gelder IC et al. 2024 ESC AF (Eur Heart J 2024;45:3314); Brugada J et al. 2019 ESC SVT',
      html: T(['Aritmia', 'Criteri ECG', 'Note (ESC 2024)'], [
        ['Fibrillazione atriale', 'RR irregolarmente irregolari, assenza di P distinte (onde f 350–600/min); diagnosi con ECG a 12 derivazioni o striscia ≥ 30 s', 'AF-CARE; anticoagulazione secondo CHA₂DS₂-VA'],
        ['FA a risposta rapida', 'FC > 110/min a riposo', 'controllo della frequenza; CVE se instabile'],
        ['FA con FC < 50 o pause > 3 s', 'bradi-tachi', 'considerare malattia del nodo del seno'],
        ['Flutter tipico (antiorario)', 'onde F "a dente di sega" negative in II, III, aVF, positive in V1, 240–340/min; conduzione 2:1 (FC ~150), 3:1, 4:1', 'ablazione dell\'istmo cavo-tricuspidale'],
        ['Flutter con conduzione 1:1', 'FC = frequenza atriale (~250–300/min)', 'emergenza: CVE sincronizzata'],
        ['Tachicardia atriale multifocale', '≥ 3 morfologie di P, FC > 100/min, PR variabile', 'BPCO, ipossia, ipomagnesiemia']
      ]) + '<p class="hint">QT in FA: misurare QT e RR precedente su più battiti (≥ 5–10) e fare la media dei QTc (calcolatore QTc, sezione "più battiti"). POAF dopo cardiochirurgia: frequente nei giorni 2–4.</p>'
    },
    {
      id: 'pm', titolo: 'Pacemaker: modalità, cattura, sensing, ischemia', data: '11/2026',
      fonte: 'Glikson M et al. 2021 ESC Pacing e CRT; codice NBG (NASPE/BPEG); Smith 2012 e Dodd 2021 (Sgarbossa nel ritmo stimolato)',
      html: T(['Elemento', 'Descrizione'], [
        ['Codice NBG', '1ª lettera camera stimolata (A, V, D), 2ª camera sentita, 3ª risposta (I inibita, T triggerata, D duale), 4ª R = rate-response'],
        ['Modalità comuni', 'AAI, VVI(R), DDD(R); in cardiochirurgia: stimolazione epicardica temporanea (AAI/VVI/DDD, VOO/DOO asincrone in emergenza)'],
        ['Ritmo stimolato dal VD', 'spike seguito da QRS largo con morfologia tipo BBSx e asse superiore (apice) o inferiore (setto/RVOT)'],
        ['Stimolazione biventricolare / del sistema di conduzione', 'QRS più stretto; R in V1 nella BiV; Sgarbossa non validato'],
        ['Perdita di cattura', 'spike non seguito da depolarizzazione (P o QRS) – causa: soglia aumentata, dislocazione, output basso'],
        ['Undersensing', 'spike che cadono dopo P/QRS spontanei (rischio R su T)'],
        ['Oversensing', 'pause inappropriate (miopotenziali, interferenze, cross-talk)'],
        ['Ischemia nel ritmo stimolato', 'Smith-modified Sgarbossa: STE concordante ≥ 1 mm, STD concordante ≥ 1 mm V1–V3, STE discordante/S ≥ 0,25 (sens. ~80%, spec. ~99%)']
      ])
    },
    {
      id: 'qt', titolo: 'QT, QTc ed elettroliti', data: '11/2026',
      fonte: 'Rautaharju PM et al. AHA/ACCF/HRS 2009 Part IV; Zeppenfeld K et al. 2022 ESC VA; Sagie 1992; Bogossian 2014; ERC 2025',
      html: T(['Parametro', 'Valori'], [
        ['QTc prolungato', '≥ 450 ms uomo, ≥ 460 ms donna'], ['LQTS (ESC 2022)', 'QTc ≥ 480 ms, o score di Schwartz > 3, o ≥ 460 ms con sincope inspiegata'], ['Rischio di torsione', 'QTc ≥ 500 ms o aumento ≥ 60 ms'],
        ['QT corto', '≤ 360 ms con anamnesi/familiarità; ≤ 340 ms'], ['Formule', 'Framingham QT + 154·(1 − RR); Fridericia QT/∛RR; Bazett QT/√RR (inaffidabile fuori 60–90/min); Hodges QT + 1,75·(FC − 60)'],
        ['QRS largo', 'QT modificato (Bogossian): QT − 50% QRS; oppure JT'],
        ['Iperkaliemia', 'T appuntite → P piatte/PR lungo → QRS largo → onda sinusoidale → FV/asistolia'], ['Ipokaliemia', 'onde U, STD, T piatte, QU lungo'], ['Ipercalcemia / ipocalcemia', 'QT corto / QT lungo (ST allungato)'], ['Ipotermia', 'onde J di Osborn, bradicardia, QT lungo']
      ])
    }
  ];

  function render(el) {
    let h = '<div class="card"><h3>📚 Criteri ECG</h3><p class="hint">Testo di consultazione con tabelle sinottiche, disponibile anche offline. Ogni sezione riporta fonte e data di aggiornamento. Strumento didattico, non sostituisce le linee guida originali.</p><input type="search" id="critSearch" class="search" placeholder="Cerca (es. Wellens, Mobitz, Cornell)…" aria-label="Cerca nei criteri"><div class="chips">' + SEZIONI.map(s => '<a href="#crit-' + s.id + '" class="chip-link">' + s.titolo.split(/[,:]/)[0] + '</a>').join('') + '</div></div>';
    h += SEZIONI.map(s => '<details class="card crit-sec" id="crit-' + s.id + '"><summary><b>' + s.titolo + '</b> <small class="hint">agg. ' + s.data + '</small></summary><div class="crit-body">' + s.html + '<p class="ref">Fonti: ' + s.fonte + '</p></div></details>').join('');
    el.innerHTML = h;
    const q = el.querySelector('#critSearch');
    q.oninput = () => {
      const t = q.value.trim().toLowerCase();
      el.querySelectorAll('.crit-sec').forEach(d => { const hit = !t || d.textContent.toLowerCase().includes(t); d.style.display = hit ? '' : 'none'; if (t && hit) d.open = true; });
    };
    el.querySelectorAll('.chip-link').forEach(a => a.onclick = e => { e.preventDefault(); const d = el.querySelector(a.getAttribute('href')); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  }
  const API = { SEZIONI, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ECGCriteri = API;
})(typeof window !== 'undefined' ? window : this);
