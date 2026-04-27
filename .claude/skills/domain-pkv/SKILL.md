---
name: domain-pkv
description: Private Krankenversicherung — Tarif-Konfiguration mit Optionen (GZ-pflichtig, Basisabsicherung, Alters-Regel), AG-Höchstzuschuss-Cap, Beitragsrückerstattung, Prognose mit Steigerungssatz. Lies diese Skill für PKV-Rechner-Tasks und PKV-spezifische Lohnsteuer-Integrationen.
---

# Privatkrankenversicherung (PKV)

## Domain Knowledge (Essential)

- **Gesetzlicher Zuschlag (GZ):** Immer **10 %** des Beitrags (pflichtig bis Alter 60).
- **Basisabsicherung:** Nur der Basisanteil ist steuerlich absetzbar. Dieser wird pro Tarif prozentual hinterlegt.
- **Beitragsrückerstattung (BRK):** Muss **jährlich (kumuliert)** gegen die Kosten gerechnet werden.
- **Prognose-Logik:** Jahre erben Werte vom Vorjahr (+ Steigerungssatz), außer es existiert ein `yearlyOverride` in der Datenbank.

## PKV-Modul: Tarif-Konfiguration

### UI & Layout-Regeln (MUI)

- **Kopfzeile:** Tarifname und Tarifbeitrag (€) stehen nebeneinander in einer Zeile.
- **Optionen (Einzelspalten-Layout):** Jede Option steht in einer eigenen Zeile. Links das Label, rechts ein `MUI Switch` (Toggle).

### Optionen-Liste

| Option | Default | Wirkung |
|---|---|---|
| **GZ-pflichtig** | Nein | Steuert, ob der gesetzliche Zuschlag (10 %) berechnet wird. |
| **Basisabsicherung** | Nein | Steuert die steuerliche Absetzbarkeit. |

### Bedingte Felder
- Wenn `Basisabsicherung` aktiv → Eingabefeld `steuerl. absetzbar` mit `%`-Adornment einblenden.

### Alters-Regel
- Feld `Tarif entfällt ab`: Eingabe eines Alters (Jahre).
- Eigene Zeile mit Label "Tarif entfällt ab".

### Refactoring-Hinweis (historisch)
> Die Option "Fixbetrag" wurde vollständig entfernt. Nicht wieder einführen.

### Logik-Parameter
- Alle Switches initial auf `false` (deaktiviert).
- Berechneter absetzbarer Betrag = `Tarifbeitrag × (steuerl_absetzbar / 100)`.

## PKV-Integration im Lohnsteuer-Kontext

Diese Werte werden in der Lohnsteuer-Berechnung gebraucht (siehe [`domain-gehalt`](../domain-gehalt/SKILL.md)):

### AG-Höchstzuschuss PKV (Monat, Stand 2026)

| Komponente | Wert | Basis |
|---|---|---|
| KV | **508,59 €** | 14,6 % + 2,9 % Ø-Zusatzbeitrag |
| PV | **104,63 €** | 3,6 % PV-Satz |
| **Gesamt-Cap** | **613,22 €** | KV + PV |

### Logik
- Der Arbeitgeber zahlt 50 % des PKV-Beitrags, **maximal jedoch** den GKV-Höchstzuschuss.
- Dieser Zuschuss ist **steuerfrei** (§ 3 Nr. 62 EStG).

### Netto-Berechnung
```
Auszahlung = Brutto − Lohnsteuer − Soli − RV(AN) − AV(AN) − (PKV_Gesamt − AG_Zuschuss)
```

## Existierende Utilities

- [client/src/lib/pkvProjection.js](../../../client/src/lib/pkvProjection.js) — Prognose-Engine mit Steigerungssatz und yearlyOverride-Support.
- [client/src/pages/PkvCalculatorPage.js](../../../client/src/pages/PkvCalculatorPage.js) — Tarif-Rechner-UI.

## Cross-Referenzen

- **Lohnsteuer-Berechnung im Gehaltsrechner:** → [`domain-gehalt`](../domain-gehalt/SKILL.md)
- **Vorsorgepauschale GKV vs. PKV:** → [`steuern-de`](../steuern-de/SKILL.md)
- **PKV-Rentner-Vorteil (keine Sozialabgaben auf Renten):** → [`domain-renten`](../domain-renten/SKILL.md), [`domain-versicherungen`](../domain-versicherungen/SKILL.md)
