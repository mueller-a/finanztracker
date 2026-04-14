/**
 * Shared interface between PkvCalculatorPage and Ruhestandsplanung.
 *
 * PkvCalculatorPage calls savePkvProjection() in its debounce whenever
 * the user changes inputs. ETFRechnerPage (DRV type) reads the result
 * via readPkvProjection() to prefill the PKV net cost field.
 *
 * Important: the nettoMonatlich value is ALREADY net of the Rentenzuschuss
 * (§ 257 SGB V). No further subsidy deduction is needed in Ruhestandsplanung.
 */

const KEY = 'insuretrack_pkv_proj';

/**
 * @param {object} data
 * @param {number} data.nettoMonatlich   Monthly PKV cost at retirement (after RV Zuschuss)
 * @param {number} data.rzZuschuss       The RV subsidy applied (for transparency display)
 * @param {number} data.rzRente          The pension amount used for subsidy calculation
 * @param {number} data.atAge            Age at which this projection is computed
 * @param {string} data.savedAt          ISO timestamp
 */
export function savePkvProjection(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

/**
 * @returns {{ nettoMonatlich, rzZuschuss, rzRente, atAge, savedAt } | null}
 */
export function readPkvProjection() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
