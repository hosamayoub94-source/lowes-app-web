// =============================================================
// Face Verification Service — uses @vladmandic/face-api
// Models loaded from /public/face-models/ (no API key needed)
//
// Usage:
//   await loadModels()
//   const descriptor = await extractDescriptor(imageElement)
//   const match = compareFaces(storedDescriptor, liveDescriptor)
// =============================================================
import * as faceapi from '@vladmandic/face-api';

const MODELS_URL  = '/face-models';
const MATCH_THRESHOLD = 0.5; // lower = stricter (0.4–0.6 is typical)

let _modelsLoaded = false;
let _loading      = false;

// ── Load models (once) ────────────────────────────────────────
export async function loadFaceModels() {
  if (_modelsLoaded) return;
  if (_loading) {
    // Wait for existing load to finish
    while (_loading) await new Promise(r => setTimeout(r, 100));
    return;
  }
  _loading = true;
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]);
    _modelsLoaded = true;
  } finally {
    _loading = false;
  }
}

// ── Extract face descriptor from an image element/url ─────────
// Returns Float32Array(128) or null if no face detected
export async function extractDescriptor(input) {
  await loadFaceModels();

  let imgEl = input;
  if (typeof input === 'string') {
    imgEl = await faceapi.fetchImage(input);
  } else if (input instanceof Blob) {
    const url = URL.createObjectURL(input);
    imgEl = await faceapi.fetchImage(url);
    URL.revokeObjectURL(url);
  }

  const detection = await faceapi
    .detectSingleFace(imgEl, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection?.descriptor ?? null;
}

// ── Compare two descriptors ───────────────────────────────────
// Returns { match: boolean, distance: number, confidence: number (0-100) }
export function compareFaces(stored, live) {
  if (!stored || !live) return { match: false, distance: 1, confidence: 0 };

  const storedArr = stored instanceof Float32Array
    ? stored
    : new Float32Array(Object.values(stored));

  const liveArr = live instanceof Float32Array
    ? live
    : new Float32Array(Object.values(live));

  const distance   = faceapi.euclideanDistance(storedArr, liveArr);
  const match      = distance <= MATCH_THRESHOLD;
  // Map distance 0→100% and 0.5→50% confidence
  const confidence = Math.round(Math.max(0, (1 - distance / 0.8) * 100));

  return { match, distance: +distance.toFixed(3), confidence };
}

// ── Serialize / deserialize descriptor for Supabase storage ───
export function descriptorToArray(descriptor) {
  if (!descriptor) return null;
  return Array.from(descriptor); // plain JS array → JSON-safe
}

export function descriptorFromArray(arr) {
  if (!arr) return null;
  return new Float32Array(arr);
}
