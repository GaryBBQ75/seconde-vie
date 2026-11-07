import { imageObjectType } from './object-types.js';

const vendor = '/vendor/mobilenet/';
let model;

function loadScript(file, globalName) {
  if (window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = vendor + file;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error('Analyse photo indisponible.')); };
    document.head.append(script);
  });
}

function loadModel() {
  if (!model) model = loadScript('tf.min.js', 'tf').then(async () => {
    await loadScript('mobilenet.min.js', 'mobilenet');
    await window.tf.ready();
    return window.mobilenet.load({ version:2, alpha:.5, modelUrl:vendor + 'model.json', inputRange:[0, 1] });
  }).catch(error => { model = null; throw error; });
  return model;
}

export async function inspectObjectPhoto(src) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 224;
  const ratio = 224 / Math.max(image.naturalWidth, image.naturalHeight);
  const width = image.naturalWidth * ratio;
  const height = image.naturalHeight * ratio;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 224, 224);
  ctx.drawImage(image, (224 - width) / 2, (224 - height) / 2, width, height);
  const classifier = await loadModel();
  const [guess] = await classifier.classify(canvas, 1);
  return guess?.probability >= .2 ? imageObjectType(guess.className) : undefined;
}
