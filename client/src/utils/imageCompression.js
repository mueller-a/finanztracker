/**
 * Frontend-seitige Bildkompression via Canvas.
 *
 * Keine externe Dependency — alle Browser liefern `<canvas>` und
 * `toBlob` mit JPEG-Encoding. Das Ergebnis ist ein neuer `File` mit
 * `.jpg`-Extension, den der Aufrufer direkt an Supabase Storage hochladen kann.
 *
 * Performance-Details:
 *   - EXIF-Orientation wird NICHT manuell angewendet; moderne Browser
 *     respektieren `image-orientation: from-image` beim Rendering (siehe
 *     `decoding="async"`). Für Kamera-Uploads aus mobilen Browsern reicht
 *     das in der Praxis — die meisten Handys speichern Fotos bereits
 *     korrekt ausgerichtet (Landscape ist weniger verbreitet).
 *   - OffscreenCanvas wird bevorzugt wenn verfügbar (keine UI-Blockierung).
 *   - Der ObjectURL wird garantiert freigegeben (`URL.revokeObjectURL`),
 *     auch bei Fehlerfällen.
 */

const DEFAULT_MAX_SIDE = 1280;
const DEFAULT_QUALITY  = 0.75;

/**
 * Liest einen `File` als `HTMLImageElement`.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden.')); };
    img.src = url;
  });
}

/**
 * Liefert die Zieldimensionen, die die längste Seite auf `maxSide` begrenzen.
 * Kleinere Bilder bleiben unverändert.
 */
function fitWithinMaxSide(width, height, maxSide) {
  if (width <= maxSide && height <= maxSide) return { width, height };
  const scale = width >= height ? maxSide / width : maxSide / height;
  return {
    width:  Math.round(width  * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Zeichnet das Bild auf ein Canvas und exportiert als JPEG-Blob.
 * Nutzt OffscreenCanvas wenn verfügbar.
 */
async function imageToJpegBlob(img, targetWidth, targetHeight, quality) {
  // Moderne Browser: OffscreenCanvas (rendert im Worker-Thread-fähigen Context,
  // blockiert die UI nicht so stark wie ein in-DOM Canvas).
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx    = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar.');
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }

  // Fallback: klassisches Canvas
  const canvas = document.createElement('canvas');
  canvas.width  = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar.');
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('JPEG-Kompression fehlgeschlagen.'));
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Hauptfunktion: komprimiert einen `File` zu einem JPEG mit maximal
 * `maxSide` Pixel auf der längsten Seite und der gegebenen Qualität.
 *
 * @param {File} file
 * @param {object} [opts]
 * @param {number} [opts.maxSide=1280]    – längste Seite in px
 * @param {number} [opts.quality=0.75]    – JPEG-Qualität (0–1)
 * @param {string} [opts.filename]         – Ausgabename (default: Originalname mit .jpg)
 * @returns {Promise<{ file: File, originalSize: number, compressedSize: number, width: number, height: number }>}
 */
export async function compressImage(file, opts = {}) {
  if (!(file instanceof File) && !(file instanceof Blob)) {
    throw new Error('Ungültige Eingabe — File oder Blob erwartet.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Datei ist kein Bild (erwartet image/*).');
  }

  const maxSide = Number(opts.maxSide) || DEFAULT_MAX_SIDE;
  const quality = Number(opts.quality) || DEFAULT_QUALITY;

  const img = await readImage(file);
  const { width, height } = fitWithinMaxSide(img.naturalWidth, img.naturalHeight, maxSide);
  const blob = await imageToJpegBlob(img, width, height, quality);

  // Deterministischer Name mit .jpg-Extension
  const baseName = (opts.filename || file.name || 'photo')
    .replace(/\.[^./\\]+$/, '');
  const outFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });

  return {
    file:           outFile,
    originalSize:   file.size,
    compressedSize: outFile.size,
    width,
    height,
  };
}
