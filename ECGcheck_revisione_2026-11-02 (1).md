# ECGcheck — Revisione settimanale 02/11/2026 → versione 1.2.3

**Esito:** aggiornamento consigliato. Ho corretto tre errori sistematici nella lettura delle FOTO e uno nella lettura dei PDF senza etichette. Ho aggiornato i riferimenti alla V Definizione Universale di IMA (2026) e all'ERC 2025. Le soglie diagnostiche non sono cambiate.
Ho preso il codice dal repository pubblico Cimox44/ecgcheck1.0 (commit bb8a534, 1.2.2). Questa esecuzione non aveva registri di precisione né segnalazioni di letture errate, quindi gli errori sono stati cercati con tracciati sintetici di cui si conoscono i valori veri.

## 1. File da caricare su GitHub (6 modificati)

| File | Modifica |
|---|---|
| `ecgphoto.js` | Traccia: sui tratti ripidi vince la corsa con la sovrapposizione maggiore, così l'apice delle R/S alte non viene più troncato. Righe: la soglia è riferita al 3° massimo, quindi il bordo del foglio su fondo scuro non fa più perdere righe a ~6 px/mm. Le righe piatte senza impulso (bordo del foglio) vengono scartate. Con righe mancanti la qualità resta al massimo "accettabile". Con FC > 120/min compare un avviso sul QT. |
| `ecgpdf.js` | Durata del QRS e QT corrette per l'allargamento dovuto alla media mobile (solo foto; ST e ampiezze invariati). La tangente della T si ferma alla fine della branca discendente. PDF 6×2 senza etichette letto correttamente se il profilo è ELI 280 o 6×2. Nuovi avvisi per FC > 120/min e per i PDF senza etichette. |
| `criteria.js` | META 1.2.3 / 2026.11.2, lastReview 2026-11-02, nextReview 2026-11-09. Aggiunti i riferimenti V UDMI 2026 ed ERC 2025. Aggiunte note nei reperti STEMI e post-cardiochirurgia. Nessuna soglia modificata. |
| `app.js` | Registro modifiche 1.2.3. Il profilo dell'apparecchio viene passato anche alla lettura dei PDF. Il testo della notifica dice "revisione programmata" invece di "mensile". |
| `sw.js` | `VERSION = 'ecgcheck-v1.2.3'` |
| `README.md` | Tabella dell'ultima revisione e descrizione aggiornata dei test |

## 2. Errori sistematici trovati e corretti

| # | Errore (1.2.2) | Causa | Effetto clinico | Dopo la correzione |
|---|---|---|---|---|
| 1 | R di V6 alta 13 mm letta 9,8 mm; V4/V5 sottostimate di 0,8–1,2 mm | Un puntino residuo della griglia vicino alla base veniva preferito alla traccia sul tratto ripido, e l'apice veniva perso | Sottostima dei voltaggi: IVS non riconosciuta, Sokolow/Cornell falsati. È coerente con le 2 foto reali segnalate in 1.2.2 (ampiezze delle precordiali con voltaggi alti) | Errore medio R da 0,46 a 0,10 mm |
| 2 | QRS di 90 ms letto 108–114 ms dalle foto | Media mobile di 5 campioni + margine di 6 ms per lato | Falsi "ritardo di conduzione aspecifico" (> 110 ms) e QRS falsamente larghi | 100–106 ms, come nei PDF (100 ms) |
| 3 | Foto a ~6 px/mm su fondo scuro: trovate solo 4 righe su 6, derivazioni scambiate, qualità comunque "buona" | Il bordo del foglio produceva righe molto dense e la soglia era relativa al massimo | Derivazioni sbagliate con indice di qualità rassicurante | 6/6 righe a 5, 6 e 7 px/mm; se mancano righe, la qualità è al massimo "accettabile" |
| 4 | PDF 6×2 senza etichette letto come 3×4 | Il layout presunto considera 3×4 qualsiasi riga lunga | Derivazioni scambiate | Corretto con il profilo ELI 280/6×2; in "Automatico" compare l'avviso di scegliere il profilo |
| — | FC 130/min: QT sovrastimato di circa 30 ms (P sovrapposta alla fine della T) | Limite del metodo della tangente | QT/QTc sovrastimati | **Non risolto.** Ora compare un avviso con FC > 120/min per misurare il QT a mano |

## 3. Risultati dei test

| Test | 1.2.2 | 1.2.3 | Obiettivo |
|---|---|---|---|
| Motore dei criteri | 47/47 | **47/47** | Tutti i casi con l'esito atteso |
| Foto sintetiche (19: ELI 280 6×2 a 5–8 px/mm, ±3°, prospettiva, 90/180/270°, sfocatura, rumore, JPEG 50–70, FC 50–130; 3×4+1; 2 foto mosse o molto sfocate) | **9/19** | **18/19** | FC ±2/min, ST ≤ 0,3 mm, R/S ≤ 0,5 mm, QT ±20 ms, foto mosse rifiutate |
| FC dalle foto | ±0,6/min | ±0,2/min | ±2/min |
| ST, errore medio (intervallo per caso) | 0,03–0,67 mm | **0,02–0,17 mm** | ≤ 0,3 mm |
| R / S, errore medio | fino a 3,6 / 4,0 mm | **≤ 0,24 / ≤ 0,27 mm** | ≤ 0,5 mm |
| QT dalle foto (FC 50–110) | −5/+9 ms | **−2/+5 ms** | ±20 ms |
| Foto mosse o molto sfocate | rifiutate (2/2) | rifiutate (2/2) | rifiutate |
| PDF vettoriali sintetici (ELI 6×2 a 75 e 110/min, 3×4+1, 6×2 senza etichette) | 3/4 | **4/4** con profilo ELI 280 | Come sopra |
| PDF: ST, R/S, QT | — | 0,03 mm; 0,03–0,04 mm; +6/+7 ms | — |
| `node --check` su tutti i .js e JSON del manifest | OK | OK | — |
| Interfaccia (Playwright, 390 px) | — | Nessun errore JS; nessuno scroll orizzontale in 8 schede; foto caricata con qualità 100/100; referto «PROVVISORIO»; PDF del referto generato (611 kB); offline: app e pdf.js caricati dal service worker | — |

L'unico caso foto che non rientra negli obiettivi è il QT a 130/min, descritto nel § 2.

## 4. Linee guida (ricerca 01/09–02/11/2026)

| Documento | Data | Impatto su ECGcheck |
|---|---|---|
| **Fifth Universal Definition of Myocardial Infarction (2026)**, ESC/ACC/AHA/WHF, Mills NL et al., Eur Heart J 2026;47:5911-5958, doi:10.1093/eurheartj/ehag101 | online 28/08/2026 | **Verificato:** classificazione dell'IM in primario, secondario o correlato a procedura; soglie di troponina specifiche per sesso. **Non verificato:** il capitolo ECG (sez. 13, Tab. 5) non era accessibile. Secondo fonti secondarie le soglie di STE sono invariate e sono elencati esplicitamente de Winter, Wellens, Aslanger, "South African flag" e T iperacute, che sono già nel motore. Ho aggiornato solo i riferimenti e le note; il controllo sul testo integrale va fatto alla prossima revisione. |
| ESC Congress 2026: linee guida Scompenso, CVD-CKD, Riabilitazione | 08/2026 | Nessun nuovo criterio ECG |
| ERC Guidelines 2025 (Executive Summary; Special Circumstances) | 10/2025 | Riferimento aggiornato per iperkaliemia e FV (prima era ERC 2021) |
| AHA/ACC 2026 (dislipidemia, EP acuta, ecc.), HRS 2026 (estrazione elettrocateteri) | 2026 | Nessun criterio ECG |
| APHRS J-wave syndromes consensus (J Arrhythm, 02/2026) | 02/2026 | Shanghai score modificato: da valutare per una futura sezione Brugada/ERS, non inserito perché i dati non sono stati verificati |
| Nuove linee guida ESC/AHA su SCA, FA, aritmie ventricolari, pacing o QT | — | Nessuna nel periodo |

## 5. Cose da fare

1. Su GitHub, sostituisci i 6 file modificati (oppure carica il contenuto dello zip completo). Alla riapertura l'app mostrerà «Nuova versione disponibile».
2. Nella scheda ECG → Tecnica, imposta il profilo **ELI 280** come predefinito: migliora sia la lettura delle foto sia quella dei PDF senza etichette.
3. Per la prossima revisione allega, se puoi, il JSON di *Info → Precisione della lettura automatica* e le eventuali segnalazioni (foto **anonimizzate**). I test di questa settimana sono tutti sintetici.

## Fonti
- [ESC – Fifth Universal Definition of MI (2026)](https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/fifth-universal-definition-myocardial-infarction/)
- [Eur Heart J – doi:10.1093/eurheartj/ehag101](https://academic.oup.com/eurheartj/advance-article/doi/10.1093/eurheartj/ehag101/8766309)
- [AHA Professional – Fifth UDMI (2026)](https://professional.heart.org/en/science-news/fifth-universal-definition-of-myocardial-infarction-2026)
- [ERC Guidelines 2025 Executive Summary – PubMed 41117573](https://pubmed.ncbi.nlm.nih.gov/41117573/)
- [APHRS J-wave syndromes consensus 2026 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12928126/)
- [ESC – Heart Failure guidelines 2026](https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/heart-failure/)
