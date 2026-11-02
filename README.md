# ECGcheck 1.2.3 — Analisi ECG assistita (PWA)

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
| `index.html` | Struttura dell'app (schede ECG, Ritmo, Derivazioni, Pattern, Referto, Archivio, Catalogo, Info) |
| `style.css` | Grafica (tema chiaro/scuro, stampa) |
| `criteria.js` | **Motore dei criteri** con fonti, versione e date di revisione (`META`) |
| `app.js` | Interfaccia, visualizzatore con calibro, lettura automatica, archivio, PDF, notifiche, registro di precisione |
| `ecgphoto.js` | **Lettore automatico di FOTO ECG** (visione artificiale in JavaScript, offline) |
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

1. **ECG** → 📷 foto o 📂 PDF → l'app legge il tracciato e mostra la scheda *Lettura automatica*
   (qualità, misure, punti colorati sul tracciato) → controlla → **Applica**.
2. Se la lettura non riesce: **Calibra** (due punti della griglia a distanza nota) → **Calibro** → *Assegna*;
   **Marca R / Marca P** per FC, RR, regolarità.
3. **Ritmo**, **Derivazioni**, **Pattern**: completa la morfologia (onde P, BBDx/BBSx, ecc.). Con QRS ≥ 120 ms
   indica sempre la morfologia: l'app avvisa che lo ST può essere secondario.
4. **Referto**: esito OMI, ritmo, misure, reperti con fonti → 📄 PDF, 📤 Invia, 🖨 Stampa, 💾 Archivio.
5. Se una lettura è sbagliata: **📨 Segnala una lettura errata** (file JSON anonimo) e
   **Info → Precisione della lettura automatica → Esporta** (registro delle correzioni manuali).
   Questi file servono a correggere l'app nelle revisioni.

## Revisioni a breve termine

- Revisione **settimanale** programmata (lunedì): criteri, linee guida nuove, test automatici
  (47 casi del motore dei criteri, PDF sintetici, 19 foto sintetiche ELI 280 6×2 e 3×4+1 ruotate/prospettiche/
  sfocate/rumorose/JPEG a 5–8 px/mm e FC 50–130/min), correzioni.
- `criteria.js → META.version / criteriaVersion / lastReview / nextReview`: alla scadenza l'app mostra un
  avviso e, se autorizzata, una notifica.
- Ogni revisione: aggiorna i file, incrementa `VERSION` in `sw.js`, nota nel registro modifiche (Info).

## Ultima revisione — 1.2.3 (02/11/2026)

| Area | Modifica |
|---|---|
| Foto – ampiezze | Apice delle R/S alte non più troncato (errore medio R 0,46 → 0,10 mm) |
| Foto – QRS | Durata non più allargata dalla media mobile (QRS 90 ms: 108–114 → 100–106 ms) |
| Foto – righe | Righe trovate anche a ~6 px/mm con bordo del foglio su fondo scuro; righe piatte scartate |
| Foto – qualità | Con derivazioni mancanti la qualità non può essere "buona" |
| QT | Tangente limitata alla branca discendente della T; avviso con FC > 120/min (P sulla T) |
| PDF | Senza etichette e con profilo ELI 280/6×2: righe continue divise in periferica + precordiale |
| Criteri | V Definizione Universale di IMA 2026 nei riferimenti; ERC 2025 per iperkaliemia/FV |

## Privacy

Tutti i dati restano sul dispositivo (localStorage / IndexedDB); la lettura della foto avviene sul telefono,
nessun invio a server. Non inserire nome e cognome. I file di segnalazione non contengono l'immagine.
