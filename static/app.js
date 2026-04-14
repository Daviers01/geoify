'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  file: null,
  imageDataUrl: null,
  lat: null,
  lng: null,
  marker: null,
};

let map = null;

// ── DOM refs (populated after DOMContentLoaded) ────────────────────────────
let dropZone, fileInput, previewContainer, previewImg, fileInfo;
let latInput, lngInput, geotagBtn, statusArea;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  dropZone        = document.getElementById('drop-zone');
  fileInput       = document.getElementById('file-input');
  previewContainer = document.getElementById('preview-container');
  previewImg      = document.getElementById('preview-img');
  fileInfo        = document.getElementById('file-info');
  latInput        = document.getElementById('lat-input');
  lngInput        = document.getElementById('lng-input');
  geotagBtn       = document.getElementById('geotag-btn');
  statusArea      = document.getElementById('status-area');

  initMap();
  wireUpload();
  wireCoordInputs();
  wireButtons();
  updateButtonState();
});

// ── Map ────────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map').setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  map.on('click', (e) => {
    setCoordinates(e.latlng.lat, e.latlng.lng);
  });
}

function setCoordinates(lat, lng) {
  state.lat = lat;
  state.lng = lng;

  latInput.value = lat.toFixed(6);
  lngInput.value = lng.toFixed(6);

  if (state.marker) {
    state.marker.setLatLng([lat, lng]);
  } else {
    state.marker = L.marker([lat, lng]).addTo(map);
  }

  // Zoom in (but not past current zoom if already zoomed in)
  map.setView([lat, lng], Math.max(map.getZoom(), 10));
  updateButtonState();
}

// ── Upload wiring ──────────────────────────────────────────────────────────
function wireUpload() {
  // Click on drop zone opens file picker
  dropZone.addEventListener('click', () => fileInput.click());

  // Prevent click from bubbling if user clicks the browse link inside
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  // Drag & drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    // Reset so same file can be re-selected
    fileInput.value = '';
  });
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showError('Please upload a valid image file (JPEG, PNG, WebP, etc.).');
    return;
  }

  state.file = file;
  clearStatus();

  const reader = new FileReader();
  reader.onload = (e) => {
    state.imageDataUrl = e.target.result;
    showPreview(e.target.result, file);

    // Warn for large images
    const img = new Image();
    img.onload = () => {
      const pixels = img.naturalWidth * img.naturalHeight;
      if (pixels > 16_000_000) {
        showWarning(
          `Large image detected (${(pixels / 1e6).toFixed(1)} MP). ` +
          `Processing may be slow on some devices.`
        );
      }
    };
    img.src = e.target.result;

    updateButtonState();
  };
  reader.readAsDataURL(file);
}

function showPreview(dataUrl, file) {
  previewImg.src = dataUrl;
  previewContainer.classList.remove('d-none');

  const sizeKb = (file.size / 1024).toFixed(1);
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  const displaySize = file.size > 1024 * 1024
    ? `${sizeMb} MB`
    : `${sizeKb} KB`;

  const typeLabel = file.type === 'image/jpeg'
    ? 'JPEG (no conversion needed)'
    : `${file.type} → will be converted to JPEG`;

  fileInfo.textContent = `${file.name}  ·  ${displaySize}  ·  ${typeLabel}`;
}

// ── Coordinate inputs ──────────────────────────────────────────────────────
function wireCoordInputs() {
  latInput.addEventListener('input', syncCoordsFromInputs);
  lngInput.addEventListener('input', syncCoordsFromInputs);
}

function syncCoordsFromInputs() {
  const lat = parseFloat(latInput.value);
  const lng = parseFloat(lngInput.value);
  if (!isValidCoords(lat, lng)) {
    state.lat = null;
    state.lng = null;
    updateButtonState();
    return;
  }
  // Update state and move marker without triggering the full setCoordinates
  // zoom behavior (let the user control zoom when typing manually)
  state.lat = lat;
  state.lng = lng;

  if (state.marker) {
    state.marker.setLatLng([lat, lng]);
    map.panTo([lat, lng]);
  } else {
    state.marker = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], 10);
  }

  updateButtonState();
}

// ── Buttons ────────────────────────────────────────────────────────────────
function wireButtons() {
  geotagBtn.addEventListener('click', handleGeotag);

  document.getElementById('use-my-location').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by your browser.');
      return;
    }
    const btn = document.getElementById('use-my-location');
    btn.disabled = true;
    btn.textContent = 'Locating…';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoordinates(pos.coords.latitude, pos.coords.longitude);
        btn.disabled = false;
        btn.textContent = 'Use My Location';
      },
      (err) => {
        showError(`Could not get location: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Use My Location';
      }
    );
  });
}

function updateButtonState() {
  const ready = state.imageDataUrl !== null && isValidCoords(state.lat, state.lng);
  geotagBtn.disabled = !ready;
}

// ── Geotag & Download ──────────────────────────────────────────────────────
async function handleGeotag() {
  if (!state.imageDataUrl) { showError('No image loaded.'); return; }
  if (!isValidCoords(state.lat, state.lng)) { showError('Invalid or missing coordinates.'); return; }

  setProcessing(true);
  clearStatus();

  try {
    // Step 1: ensure JPEG (converts PNG/WebP/etc. via canvas if needed)
    const jpegDataUrl = await ensureJpeg(state.imageDataUrl);

    // Step 2: embed GPS EXIF data
    const geotaggedDataUrl = embedGpsExif(jpegDataUrl, state.lat, state.lng);

    // Step 3: build output filename and trigger download
    const baseName = state.file.name.replace(/\.[^/.]+$/, '');
    const outputName = `${baseName}_geotagged.jpg`;
    triggerDownload(geotaggedDataUrl, outputName);

    showSuccess(
      `Done! "${outputName}" downloaded with GPS coordinates ` +
      `${formatCoord(state.lat, 'lat')}, ${formatCoord(state.lng, 'lng')}.`
    );
  } catch (err) {
    showError(`Processing failed: ${err.message}`);
    console.error(err);
  } finally {
    setProcessing(false);
  }
}

// ── JPEG conversion (Canvas) ───────────────────────────────────────────────
function ensureJpeg(dataUrl, quality = 0.92) {
  // Already JPEG — return immediately (no conversion, no quality loss)
  if (dataUrl.startsWith('data:image/jpeg')) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      // Fill white background first — essential for transparent PNGs
      // (JPEG has no alpha channel; transparent areas become black without this)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to decode image for conversion.'));
    img.src = dataUrl;
  });
}

// ── EXIF GPS embedding (piexifjs) ──────────────────────────────────────────
function decimalToDmsRational(decimal) {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  // Multiply seconds by 100 and round to get integer numerator (denominator=100)
  // This gives ~1cm precision — standard camera EXIF format
  const secondsRational = Math.round((minutesFloat - minutes) * 60 * 100);
  return [[degrees, 1], [minutes, 1], [secondsRational, 100]];
}

function embedGpsExif(jpegDataUrl, lat, lng) {
  let exifObj;

  try {
    // Load existing EXIF — preserves camera make/model, orientation, etc.
    exifObj = piexif.load(jpegDataUrl);
  } catch (_) {
    // No EXIF present (or corrupt) — start with a fresh skeleton
    exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, 'Interop': {}, '1st': {} };
  }

  // Overwrite only the GPS IFD — all other IFDs remain untouched
  exifObj['GPS'] = {
    [piexif.TagValues.GPSIFD.GPSVersionID]:    [2, 3, 0, 0],
    [piexif.TagValues.GPSIFD.GPSLatitudeRef]:  lat >= 0 ? 'N' : 'S',
    [piexif.TagValues.GPSIFD.GPSLatitude]:     decimalToDmsRational(lat),
    [piexif.TagValues.GPSIFD.GPSLongitudeRef]: lng >= 0 ? 'E' : 'W',
    [piexif.TagValues.GPSIFD.GPSLongitude]:    decimalToDmsRational(lng),
  };

  const exifBinary = piexif.dump(exifObj);
  return piexif.insert(exifBinary, jpegDataUrl);
}

// ── Download trigger ───────────────────────────────────────────────────────
function triggerDownload(dataUrl, filename) {
  const link = document.createElement('a');
  link.href     = dataUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function isValidCoords(lat, lng) {
  return (
    typeof lat === 'number' && isFinite(lat) && lat >= -90  && lat <= 90 &&
    typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180
  );
}

function formatCoord(value, type) {
  const abs = Math.abs(value).toFixed(4);
  if (type === 'lat') return `${abs}° ${value >= 0 ? 'N' : 'S'}`;
  return `${abs}° ${value >= 0 ? 'E' : 'W'}`;
}

function setProcessing(active) {
  if (active) {
    geotagBtn.disabled = true;
    geotagBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing…';
  } else {
    geotagBtn.innerHTML = 'Geotag &amp; Download';
    updateButtonState();
  }
}

// ── Status messages ────────────────────────────────────────────────────────
function clearStatus() {
  statusArea.innerHTML = '';
}

function showSuccess(msg) {
  statusArea.innerHTML =
    `<div class="alert alert-success alert-dismissible fade show" role="alert">
      <strong>Success!</strong> ${escapeHtml(msg)}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>`;
}

function showError(msg) {
  statusArea.innerHTML =
    `<div class="alert alert-danger alert-dismissible fade show" role="alert">
      <strong>Error:</strong> ${escapeHtml(msg)}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>`;
}

function showWarning(msg) {
  statusArea.innerHTML =
    `<div class="alert alert-warning alert-dismissible fade show" role="alert">
      <strong>Note:</strong> ${escapeHtml(msg)}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
