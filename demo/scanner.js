const commonFormats = [
  'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93',
  'itf', 'data_matrix', 'aztec', 'pdf417', 'codabar',
];

async function nativeBarcodeDetector() {
  try {
    const Detector = globalThis.BarcodeDetector;
    if (!Detector) return null;
    const available = await Detector.getSupportedFormats();
    const formats = commonFormats.filter(format => available.includes(format));
    return formats.length ? new Detector({ formats }) : null;
  } catch {
    return null;
  }
}

function drawFrame(context, video, zoom, center, rotate) {
  const canvas = context.canvas;
  const sourceWidth = video.videoWidth / zoom * (center ? .92 : 1);
  const sourceHeight = video.videoHeight / zoom * (center ? .54 : 1);
  const scale = Math.min(1, 1440 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const outputWidth = rotate ? height : width;
  const outputHeight = rotate ? width : height;
  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;
  if (rotate) context.setTransform(0, 1, -1, 0, height, 0);
  else context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(video, (video.videoWidth - sourceWidth) / 2, (video.videoHeight - sourceHeight) / 2,
    sourceWidth, sourceHeight, 0, 0, width, height);
}

function distanceFromCenter(result, canvas) {
  const box = result.boundingBox;
  if (!box) return Infinity;
  return (box.x + box.width / 2 - canvas.width / 2) ** 2
    + (box.y + box.height / 2 - canvas.height / 2) ** 2;
}

async function detectNative(detector, canvas) {
  let timer;
  try {
    return await Promise.race([
      detector.detect(canvas),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Détection trop longue.')), 450); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function scanCameraFrames(video, reader, getZoom, onCode) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently:true });
  if (!context) throw new Error('Lecteur de caméra indisponible.');
  let detector, timer;
  let pass = 0;
  let stopped = false;
  nativeBarcodeDetector().then(value => { detector = value; });

  async function read() {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      // Alternate a central strip, the full image and a rotated software pass.
      const index = pass++ % 4;
      const useNative = detector && index < 2;
      let code;
      try {
        drawFrame(context, video, getZoom(), index === 0 || index === 2, index === 3);
        if (useNative) {
          const results = await detectNative(detector, canvas);
          results.sort((a, b) => distanceFromCenter(a, canvas) - distanceFromCenter(b, canvas));
          code = results.find(result => result.rawValue?.trim().length <= 80 && result.rawValue.trim())?.rawValue;
        } else {
          code = reader.decodeFromCanvas(canvas).getText();
        }
      } catch {
        // A frame can be empty or blurred. If native detection fails, keep the software reader.
        if (useNative) detector = null;
      }
      if (stopped) return;
      const value = code?.trim();
      if (value && value.length <= 80) {
        onCode(value);
        return;
      }
    }
    timer = setTimeout(read, 145);
  }

  timer = setTimeout(read, 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
