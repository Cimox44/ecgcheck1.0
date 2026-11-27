# ECGcheck 1.5.5 — Analisi ECG assistita (PWA)

Applicazione web installabile (Android/iOS/desktop) per l'analisi **assistita a regole** dell'ECG a 12 derivazioni:
**fotografa** o carica il **PDF** del tracciato → l'app raddrizza la foto, trova griglia e impulso di taratura,
separa le 12 derivazioni, misura R/S/ST/T, FC, PR, QRS, QT, asse → applica i criteri validati
(OMI/STEMI-equivalenti, aritmie, conduzione, ipertrofie, pericardite…) e genera un referto PDF da stampare o inviare.

> ⚠️ Strumento **didattico e di supporto**, NON dispositivo medico (MDR 2017/745). Non riproduce l'algoritmo
> proprietario Queen of Hearts™ di PMcardio. I valori letti dalla foto vanno **sempre controllati** sul tracciato
> (punti colorati) e confrontati con quelli stampati dall'elettrocardiografo. La diagnosi resta medica.

## File del repository

| File | Contenuto |
|---|---|
| `index.html` | Struttura dell'app (schede ECG, Ritmo, Derivazioni, Calcoli, Pattern, Referto, Criteri, Archivio, Catalogo, Info) |
| `style.css` | Grafica (tema chiaro/scuro, stampa) |
| `criteria.js` | **Motore dei criteri** con fonti, versione e date di revisione (`META`) |
| `tools.js` | **Calcolatori** (asse esassiale, tabella ST a 12 derivazioni, QTc) e validazione/conversione mm–mV delle onde |
| `criteri.js` | **Pagina «Criteri»**: testo con tabelle sinottiche e fonti (consultabile offline) |
| `app.js` | Interfaccia, visualizzatore con calibro, lettura automatica, archivio, PDF, notifiche, registro di precisione |
| `ecgphoto.js` | **Lettore automatico di FOTO ECG** (visione artificiale in JavaScript, offline) |
| `autoread.js` | **Applicazione automatica** della lettura (affidabilità, valori a bassa affidabilità, nessuna diagnosi con lettura insufficiente) |
| `twave.js` | **Calcolatore «Onda T»** (iperacuta, ischemica o altra eziologia) |
| `ddx.js` | **Possibili cause e diagnosi alternative** per ogni reperto anomalo |
| `ecgpdf.js` | **Lettore automatico di ECG in PDF** + motore di misura del segnale (battiti, R/S/ST/T, intervalli) |
| `minipdf.js` | Generatore PDF del referto (offline, nessuna libreria esterna) |
| `lib/pdf.min.mjs`, `lib/pdf.worker.min.mjs` | pdf.js 6.2 di Mozilla (licenza Apache-2.0, `lib/pdfjs-LICENSE.txt`) |
| `sw.js` | Service worker: funzionamento offline e aggiornamenti |
| `manifest.json` | Installazione come app |
| `icons/` | `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` |

## Pubblicazione su GitHub Pages

1. Repository `ecgcheck1.0` nell'account `Cimox44` (o nuovo repository).
2. **Add file → Upload files**: carica tutti i file e trascina le cartelle intere `icons/` e `lib/`
   (la struttura delle cartelle deve restare identica). Per aggiornare: carica i file nuovi sopra i vecchi.
3. **Settings → Pages → Branch: main / root → Save**.
4. Apri `https://cimox44.github.io/ecgcheck1.0/` in Chrome Android → ⋮ → **Installa app**.
   Alla pubblicazione di una revisione l'app mostra "Nuova versione disponibile → Aggiorna".
5. **Non caricare nel repository foto o PDF di pazienti** (il repository è pubblico).

## Lettura automatica della foto (v1.2)

| Fase | Cosa fa |
|---|---|
| Carta | individua il foglio rosa/bianco e lo separa dallo sfondo |
| Orientamento | riconosce foto ruotate di 90°/180°/270° e inclinate (fino a ~10°) |
| Prospettiva | corregge inclinazione e taglio (shear) misurando l'angolo delle righe della griglia |
| Griglia | misura il passo dei quadretti da 1 e 5 mm (px/mm) |
| Taratura | cerca l'impulso rettangolare da 10 mm (= 1 mV) all'inizio di ogni riga |
| Traccia | separa la traccia dalla griglia e dalle scritte, segue la linea colonna per colonna |
| Derivazioni | assegna le derivazioni secondo il **profilo dell'apparecchio** |
| Misure | battiti, mediana, R, S, Q, ST (J e J+60), T, QRS, QT, PR, FC, asse (esagonale) |
| Qualità | punteggio 0–100 (nitidezza, risoluzione, continuità, righe, taratura, prospettiva) |

**Profili apparecchio** (scheda ECG → Tecnica → *Profilo*): Automatico · Welch Allyn/Hillrom **ELI 280**
6×2 · Standard 6×2 · 3×4 + 1 ritmo · 3×4 + 3 ritmi · 3×4 · 12×1. Se un domani cambiate elettrocardiografo,
scegliete il profilo con la stessa disposizione (o "Automatico") e segnalate le letture errate:
il profilo verrà aggiunto nella revisione successiva.

### Come fotografare

| ✅ Fare | ❌ Evitare |
|---|---|
| Foglio piatto, intero nell'inquadratura, telefono parallelo al foglio | Foglio piegato, angoli tagliati |
| Buona luce uniforme, senza flash diretto | Riflessi, ombre del telefono |
| Messa a fuoco sul tracciato (tocca lo schermo), mano ferma | Foto mossa/sfocata (viene rifiutata) |
| Risoluzione piena della fotocamera | Screenshot di chat compresse |
| Coprire o ritagliare i dati del paziente | Nome/cognome visibili |

Il **PDF esportato dall'elettrocardiografo** resta la fonte più precisa (traccia vettoriale).

## Flusso d'uso

1. **ECG** → 📷 foto o 📂 PDF → l'app legge il tracciato, **applica automaticamente** i valori e genera il referto
   (banner «Referto automatico – da verificare», valori incerti in giallo) → controlla; «Annulla lettura automatica» se serve.
2. Se la lettura non riesce o un valore è sbagliato: **Calibra** → strumenti guidati **PR, QRS, Onda, ST, QT, PP, RR, RP**
   (tocchi indicati passo per passo, poi *Applica*); **Marca R / Marca P** per FC, RR, regolarità; trascina i rombi
   di apice R/S letti dalla foto.
3. **Ritmo**, **Derivazioni**, **Pattern**: completa la morfologia (onde P, BBDx/BBSx, ecc.). Con QRS ≥ 120 ms
   indica sempre la morfologia: l'app avvisa che lo ST può essere secondario.
4. **Referto**: esito OMI, ritmo, misure, reperti con fonti → 📄 PDF, 📤 Invia, 🖨 Stampa, 💾 Archivio.
5. Se una lettura è sbagliata: **📨 Segnala una lettura errata** (file JSON anonimo) e
   **Info → Precisione della lettura automatica → Esporta** (registro delle correzioni manuali).
   Questi file servono a correggere l'app nelle revisioni.

## Revisioni a breve termine

- Revisione **settimanale** programmata (lunedì): criteri, linee guida nuove, test automatici
  (53 casi del motore dei criteri + 25 dei calcolatori, PDF sintetici, 33 foto sintetiche ELI 280 6×2 e 3×4+1
  ruotate/prospettiche/sfocate/mosse/JPEG a 5–8 px/mm, FC 50–130/min, R fino a 25 mm con righe vicine), correzioni.
- `criteria.js → META.version / criteriaVersion / lastReview / nextReview`: alla scadenza l'app mostra un
  avviso e, se autorizzata, una notifica.
- Ogni revisione: aggiorna i file, incrementa `VERSION` in `sw.js`, nota nel registro modifiche (Info).

## Aggiornamento 1.5.5 (27/11/2026) — onde Q patologiche automatiche e foto ad alta risoluzione

| Area | 1.5.4 | 1.5.5 |
|---|---|---|
| Foto del telefono (alta risoluzione) | righe spurie a metà tra le righe → 12×1, «ritmo non classificato», asse sbagliato | righe fuori passo scartate: caso 16 sinusale, FC 89, PR 110, asse −10° a ogni risoluzione |
| Onde Q / QS | solo casella manuale | automatiche (IV UDMI): Q > 20 ms o QS in V2–V3; Q ≥ 30 ms e ≥ 1 mm o QS in ≥ 2 derivazioni contigue; durata della Q misurata |
| PR corto | non in conclusione, spesso non proposto | in conclusione con la misura |

Fonte: Thygesen K et al., Fourth Universal Definition of Myocardial Infarction (2018), Eur Heart J 2019;40:237–269.

## Aggiornamento 1.5.4 (27/11/2026) — conclusione con misure e pannello ipertrofia

| Area | 1.5.3 | 1.5.4 |
|---|---|---|
| BBS con V1–V2 illeggibili (S sovrapposte) | non riconosciuto → «ritardo di conduzione aspecifico» | riconosciuto da R laterali larghe a picco tardivo senza q né S (≥ 3 derivazioni), QRS ≥ 130 ms, nessun segno di BBDx |
| Conclusione | solo titoli | titoli con misure (QRS, PR, prove della morfologia) |
| Ipertrofia | solo se positiva | pannello in tabella con TUTTI i criteri IVS e IVD: misura, soglia, esito, fonte |
| IVS con BBS e S sovrapposte | «non esclusa» | «IVS possibile – S profonde da misurare» |
| BAV I dalla foto con PR 201–225 ms | BAV I | «possibile, PR al limite: verifica» |

Fonti: Hancock EW et al., AHA/ACCF/HRS 2009 parte V; Peguero JG et al., JACC 2017;69:1694; Casale PN et al., 1985 (Cornell); Molloy TJ et al., 1992 (prodotto di Cornell); Klein RC et al., Am Heart J 1984; Mehta A et al., Am J Cardiol 2000; Burgos PFM et al., Arq Bras Cardiol 2017.

## Aggiornamento 1.5.3 (27/11/2026) — blocchi di branca automatici e conclusione immediata

| Area | Prima (1.5.2) | Ora (1.5.3) |
|---|---|---|
| Blocco di branca dalla foto/PDF | mai riconosciuto (morfologia da spuntare a mano) → «ritardo di conduzione aspecifico» | BBS/BBDx riconosciuti in automatico (AHA/ACCF/HRS 2009), caselle evidenziate «da verificare» |
| Referto | lista di reperti | **Conclusione** in testa (e nel PDF): diagnosi principali in ordine di gravità |
| Ripolarizzazione nel BBS | solo Sgarbossa | reperto «Alterazioni secondarie della ripolarizzazione (da BBS)» + segni di ischemia |
| IVS con BBS | «criteri non applicabili» | criteri specifici (SV2+RV6 > 45 mm, Sokolow ≥ 30, RaVL ≥ 11, AAS ± QRS > 155 ms); negativi = non esclusa → eco |
| PR dalla foto | proposto anche se incoerente tra i battiti (falso BAV I) | proposto solo con dispersione ≤ 45 ms |

Fonti: Hancock EW et al., AHA/ACCF/HRS 2009 parte V; Surawicz B et al., AHA/ACCF/HRS 2009 parte III; Klein RC et al., Am Heart J 1984; Mehta A et al., Am J Cardiol 2000;85:354; Burgos PFM et al., Arq Bras Cardiol 2017;108:47; Sgarbossa NEJM 1996; Smith Ann Emerg Med 2012.

## Aggiornamento 1.5.2 (27/11/2026) — foto ad alta risoluzione e PR corto

- Nitidezza: nessuna penalità sopra 7 px/mm (le foto nitide dei telefoni moderni non sono più «mosse»).
- Onde P con PR corto (~100 ms) riconosciute; P accettate anche se mancano in 1–2 battiti, solo con posizione costante (±15 ms) e ampiezza ≥ 0,5 mm.

## Aggiornamento 1.5.1 (23/11/2026) — STEMI non perso

- Dalla foto, nelle derivazioni con R/S variabili tra i battiti, lo ST viene proposto se è un sopraslivellamento ≥ 1,5 mm coerente (prima veniva scartato: STEMI inferiore non riconosciuto). I sottoslivellamenti in quelle derivazioni restano esclusi.

## Aggiornamento 1.5.0 (23/11/2026) — referto tutto automatico

| Novità | Dettaglio |
|---|---|
| Flusso automatico | Foto/screenshot/PDF → lettura **applicata subito** → referto con banner «Referto automatico – da verificare»; «Annulla lettura automatica» |
| Affidabilità | Lettura, ritmo, asse e OMI con livello alta/media/bassa/insufficiente; valori incerti evidenziati in giallo; registro delle correzioni |
| Modulo OMI | «Nessun criterio OMI nelle N/12 derivazioni lette (non lette: …)», «OMI sospetto – verifica», «Lettura non affidabile»; negativo pieno solo con 12/12 verificate |
| Foto | Foglio intero con testata stampata, righe spurie, dominante fredda, battiti di consenso per la misura, screenshot grigi 3×4 |
| Onda T | Nuovo calcolatore (scheda Calcoli) + regola automatica prudente + sezione nella pagina Criteri |
| Diagnosi alternative | Blocco «Possibili cause e diagnosi alternative» per ogni reperto anomalo (anche nel PDF, forma breve) |

**Come si usa**: 1) 📷/📂 carica l'ECG → 2) leggi il banner (affidabilità) e i valori in giallo → 3) correggi nelle schede o con calibro/strumenti (il referto si aggiorna) → 4) «Ho verificato» → 5) 📄 PDF.

## Aggiornamento 1.4.1 (17/11/2026) — guadagno sicuro

- Il guadagno cambia rispetto ai 10 mm/mV impostati solo con impulso di taratura riconosciuto in ≥ 2 righe (±10% di 5/20 mm); altrimenti avviso e guadagno invariato (evita ampiezze raddoppiate e false IVS sugli screenshot senza taratura).
- Limite noto: screenshot con griglia grigia scura a bassa risoluzione non ancora affidabili.

## Aggiornamento 1.4.0 (16/11/2026) — affidabilità delle foto, misure stampate, calibro mobile

- **Foglio incurvato**: linea di base di ogni riga inseguita in bande verticali di 25 mm e raddrizzata riga per
  riga (parabola robusta); scala dei tempi resa uniforme dal passo locale della griglia (strisce di 40 mm).
- **Traccia sottile**: tratti ripidi del QRS recuperati nel canale rosso e ricuciti.
- **FC**: battiti di consenso tra derivazioni simultanee (FC ±1/min sulle 7 foto reali di prova).
- **Sicurezza**: ST dalla foto solo se coerente tra i battiti; criteri OMI da valori non verificati della foto →
  «OMI sospetto – da verificare»; STDmax V1–V4 con BBDx/QRS ≥ 120 ms → «da confermare».
- **Misure stampate** (scheda ECG): FC, PR, QRS, QT, QTc, assi P-R-T, criteri di voltaggio IVS; prevalgono sulla foto.
- **Calibro mobile** (barra strumenti «⇹»): due linee trascinabili singolarmente o come coppia, linee orizzontali
  per le ampiezze, marcia (march-out), «Usa come RR/PP/PR/QRS/QT», serie di battiti con media/min/max/variabilità.
- Limiti noti: QRS sottostimato con BBDx; ST dalla foto con possibile sovrastima nelle derivazioni con R alta;
  voltaggi precordiali molto alti = valori minimi.

## Aggiornamento 1.3.7 (11/11/2026) — sicurezza delle derivazioni

- Controllo di coerenza (righe mancanti, identità di Einthoven/Goldberger): se fallisce, «DERIVAZIONI NON AFFIDABILI» e dalla foto solo FC, RR e QT.
- Pausa/arresto proposto solo con RR ≥ 2 s e ≥ 1,5 × RR mediano.

## Aggiornamento 1.3.6 (11/11/2026) — falso OMI e BAV I

- OMI inferiore «sotto soglia» con reciprocità in aVL: STE ≥ 0,5 mm in ≥ 2 derivazioni inferiori; con QRS ≥ 120 ms declassato a «da confermare».
- «STE diffuso: favorire OMI» solo con STE reale in ≥ 2 derivazioni; PR alterato isolato → reperto informativo.
- PR dalla foto applicato se le P sono coerenti e la qualità ≥ 70/100 (BAV I riconosciuto).
- Dalla foto lo ST non viene applicato nelle derivazioni con QRS molto variabili da battito a battito.
- Pattern di pericardite e «favorire OMI» solo con STE diffuso (≥ 4 derivazioni, ≥ 2 territori); PR alterato isolato → informativo.
- T negative in III + aVF riconosciute; PP e frequenza atriale proposti con P prima di ogni QRS.
- Limite noto: QRS dalla foto sottostimato nei blocchi di branca; righe slittate con foglio incurvato (in correzione nella 1.4.0).

## Aggiornamento 1.3.5 (10/11/2026) — PP e RR

- PP < 170 ms (FC atriale > 350/min) scartato e segnalato; «Marca P» avvisa se si marcano inizio e fine della stessa P.
- Foto: RR medio dalla riga del ritmo (coerente con min–max).
- IVS da criteri di voltaggio con ampiezze lette dalla foto non verificate: reperto «da verificare» (informativo) finché l'operatore non conferma le misure.

## Aggiornamento 1.3.4 (10/11/2026) — onde P e referto

- Onde P riconosciute anche se un singolo battito ha un picco anomalo (tolleranza ± 40 ms dalla mediana): ritmo sinusale e PR proposti sulle foto ELI 280 6×2.
- Scheda Referto: avviso e pulsante «Applica» quando la lettura automatica è pronta ma non applicata.
- Criteri: bassi voltaggi nel post-cardiochirurgia con confronto con l'ECG preoperatorio e diagnosi differenziale.

## Aggiornamento 1.3.3 (10/11/2026) — righe e derivazioni

| Problema segnalato | Correzione |
|---|---|
| Foto ELI 280 con foglio coperto in alto: derivazioni sulle righe sbagliate (falsa FA, falsa IVD, falso STD reciproco, falso OMI) | Righe scelte con la disposizione dell'impulso della maggioranza e passo robusto; riga di testo a piè di pagina scartata |
| Precordiali alte e intrecciate: ST/R fittizi | Derivazioni con pochi battiti riconosciuti → valori non proposti; R/S variabili segnalate |
| DD pericardite / OMI poco chiara | PR sottoslivellato misurato rispetto al TP e proposto nei Pattern; ST anche rispetto al TP; STD in aVL «contro» la pericardite solo se ≥ 0,5 mm (criteri 2026.11.5) |

## Aggiornamento 1.3.2 (10/11/2026) — orientamento, ritmo, punto J

| Problema segnalato | Correzione |
|---|---|
| Screenshot letto capovolto (derivazioni scambiate, onde invertite, asse errato) | Riconosciuti screenshot ruotati di 180°/270° con taratura a fine riga; pulsante «🔃 Rileggi ruotato di 180°» |
| Ritmo non riconosciuto | Onde P piccole riconosciute (base TP, PR dal picco) |
| Falso OMI posteriore | Punto J non più sul nadir della S; STD ascendente del punto J (J+60 > −0,5 mm) non considerato ischemico (criteri 2026.11.4) |

## Aggiornamento 1.3.1 (10/11/2026) — screenshot

| Area | Modifica |
|---|---|
| Screenshot / immagini digitali | Griglia blu, grigia, verde o rosa riconosciuta automaticamente; traccia sottile; immagini piccole ingrandite (×2–3); impulso di taratura a fine riga (non più scambiato per foto capovolta); bordi e righe senza impulso gestiti |
| Test | 16 screenshot sintetici entro gli obiettivi; screenshot reale PMcardio 3×4+1 letto 12/12; foto ELI 280 invariate |

**Consiglio:** per lo screenshot ingrandisci il tracciato a tutto schermo prima di catturarlo (almeno ~3 px per mm). Il PDF originale resta più preciso.

## Revisione 1.3.0 (09/11/2026)

| Area | Modifica |
|---|---|
| Strumenti guidati | Barra ECG: PR, QRS, Onda (R/S/Q/P/T: ampiezza mm/mV + durata), ST (base → J → J+60 con soglia STEMI della derivazione), QT/QTc, PP, RR, RP; ogni strumento con istruzioni dei tocchi, risultato immediato e «Applica» |
| Onde manuali | Tabella Derivazioni con P, Q, R, S, J, J+60, T in mm, mV o mm sulla carta (guadagno 5/10/20) e durate in ms; validazione immediata; i valori corretti a mano (✎) prevalgono sulla lettura automatica e vanno nel registro di precisione |
| Foto – onda R | Corretta la sovrastima: con tracce di righe vicine fuse (R alte/S profonde nel 6×2) la traccia non viene più "dirottata" sulla riga vicina; le R alte non sono più tagliate a ~16 mm; valore minimo «≥» e ST «n.m.» dove le tracce si toccano; punti base/apice trascinabili sul tracciato |
| Foto – misure | QRS e punto J più robusti (FC alte, T precoci, linee spesse a 8 px/mm); foto mosse riconosciute (nitidezza direzionale) |
| Calcolatori | Asse (minimi quadrati, I/aVF, isodifasica, sistema esassiale disegnato, sovrascrivibile); ST a 12 derivazioni (soglie per sesso/età, contiguità, reciprocità, Armstrong, ST/T, Meyers); QTc (Bazett, Fridericia, Framingham, Hodges, Bogossian, media su più battiti) |
| Criteri (testo) | Nuova pagina con IVS/IVD, OMI/STEMI-equivalenti, pericardite, ripolarizzazione precoce e Shanghai score 2026, BAV, blocchi di branca, TRNAV/TRAV, FA/flutter, pacemaker, QT |
| Linee guida | ESC 2026 scompenso (HFmrEF abolito: HFrEF < 50%, HFpEF ≥ 50%); consenso APHRS/JHRS 2026 sulle sindromi dell'onda J (Shanghai score modificato) |

## Privacy

Tutti i dati restano sul dispositivo (localStorage / IndexedDB); la lettura della foto avviene sul telefono,
nessun invio a server. Non inserire nome e cognome. I file di segnalazione non contengono l'immagine.
