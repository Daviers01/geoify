'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  files: [],    // [{file, dataUrl}]
  results: [],  // [{outputName, geotaggedDataUrl, originalType, outputBytes, lat, lng}]
  lat: null,
  lng: null,
  marker: null,
};

let map = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
let dropZone, fileInput, imageQueue, queueCount, step3Rows;
let latInput, lngInput, geotagBtn, downloadAllBtn;
let statusArea, resultsSection, resultsGrid, actionHint;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  dropZone      = document.getElementById('drop-zone');
  fileInput     = document.getElementById('file-input');
  imageQueue    = document.getElementById('image-queue');
  queueCount    = document.getElementById('queue-count');
  latInput      = document.getElementById('lat-input');
  lngInput      = document.getElementById('lng-input');
  geotagBtn     = document.getElementById('geotag-btn');
  downloadAllBtn = document.getElementById('download-all-btn');
  statusArea    = document.getElementById('status-area');
  resultsSection = document.getElementById('results-section');
  resultsGrid    = document.getElementById('results-grid');
  actionHint     = document.getElementById('action-hint');
  step3Rows      = document.getElementById('step3-rows');

  initMap();
  wireUpload();
  wireCoordInputs();
  wireButtons();
  updateButtonState();
});

// ── Map ────────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map').setView([20, 0], 2);

  // CARTO Voyager — free, no API key, works from file:// (no Referer required)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  map.on('click', (e) => setCoordinates(e.latlng.lat, e.latlng.lng));
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
  map.setView([lat, lng], Math.max(map.getZoom(), 10));
  updateButtonState();
}

// ── Upload wiring ──────────────────────────────────────────────────────────
function wireUpload() {
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFiles(fileInput.files);
    fileInput.value = '';
  });
}

function handleFiles(fileList) {
  const valid = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  const skipped = fileList.length - valid.length;

  if (valid.length === 0) {
    showError('No valid image files found. Please upload JPEG, PNG, WebP, GIF, or BMP.');
    return;
  }
  if (skipped > 0) {
    showWarning(`${skipped} non-image file${skipped !== 1 ? 's' : ''} skipped.`);
  } else {
    clearStatus();
  }

  hideResults();

  let loaded = 0;
  valid.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      state.files.push({ file, dataUrl: e.target.result, customName: '' });
      loaded++;
      if (loaded === valid.length) {
        renderQueue();
        renderStep3();
        updateButtonState();
      }
    };
    reader.readAsDataURL(file);
  });
}

// Called from inline onclick in queue cards
function removeFromQueue(index) {
  state.files.splice(index, 1);
  renderQueue();
  renderStep3();
  updateButtonState();
  if (state.files.length === 0) hideResults();
}

function renderQueue() {
  if (state.files.length === 0) {
    imageQueue.innerHTML = '<p class="text-muted small text-center py-2 mb-0">No images uploaded yet.</p>';
    queueCount.textContent = '';
    return;
  }

  queueCount.textContent = `${state.files.length} image${state.files.length !== 1 ? 's' : ''} ready`;

  imageQueue.innerHTML = state.files.map(({ file, dataUrl }, i) => {
    const size = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${(file.size / 1024).toFixed(0)} KB`;
    const ext = file.type === 'image/jpeg'
      ? 'JPEG'
      : file.type.split('/')[1].toUpperCase();

    return `
      <div class="queue-card">
        <img class="queue-thumb" src="${dataUrl}" alt="${escapeHtml(file.name)}" />
        <div class="queue-info">
          <span class="queue-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <span class="queue-size">${ext} &middot; ${size}</span>
        </div>
        <button class="queue-remove" onclick="removeFromQueue(${i})" aria-label="Remove ${escapeHtml(file.name)}">&times;</button>
      </div>`;
  }).join('');
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
  downloadAllBtn.addEventListener('click', handleDownloadAll);

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
        btn.innerHTML = '&#127759; Use My Location';
      },
      (err) => {
        showError(`Could not get location: ${err.message}`);
        btn.disabled = false;
        btn.innerHTML = '&#127759; Use My Location';
      }
    );
  });
}

function updateButtonState() {
  const ready = state.files.length > 0 && isValidCoords(state.lat, state.lng);
  geotagBtn.disabled = !ready;
  geotagBtn.setAttribute('aria-disabled', String(!ready));
}

// ── Per-image SEO settings ─────────────────────────────────────────────────
function slugify(str) {
  return str.trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildOutputNameForFile(index) {
  const item = state.files[index];
  const custom = slugify(item.customName || '');
  if (custom) return `${custom}.jpg`;
  const base = item.file.name.replace(/\.[^/.]+$/, '');
  return `${base}_geotagged.jpg`;
}

// Called from inline oninput in Step 3 rows
function updateFileName(index, value) {
  if (state.files[index]) state.files[index].customName = value;
  updateRowPreview(index);
}


function updateRowPreview(index) {
  const el = document.getElementById(`opt-preview-${index}`);
  if (el) el.textContent = buildOutputNameForFile(index);
}

function renderStep3() {
  if (state.files.length === 0) {
    step3Rows.innerHTML = '<p class="text-muted small text-center py-3 mb-0">Upload images in Step 1 to set filenames.</p>';
    return;
  }

  step3Rows.innerHTML = state.files.map(({ file, dataUrl, customName }, i) => `
    <div class="opt-row${i > 0 ? ' opt-row-border' : ''}">
      <img class="opt-thumb" src="${dataUrl}" alt="" />
      <div class="opt-fields">
        <p class="opt-original" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</p>
        <div class="opt-inputs">
          <div class="opt-input-group">
            <label class="opt-label">Custom Filename (optional)</label>
            <input
              type="text"
              class="form-control form-control-sm"
              placeholder="e.g. my-photo-name"
              value="${escapeHtml(customName)}"
              oninput="updateFileName(${i}, this.value)"
            />
          </div>
        </div>
        <div class="opt-preview">
          Output filename: <code id="opt-preview-${i}">${escapeHtml(buildOutputNameForFile(i))}</code>
        </div>
      </div>
    </div>`
  ).join('');
}

// ── Geotag ─────────────────────────────────────────────────────────────────
async function handleGeotag() {
  if (state.files.length === 0) { showError('No images loaded.'); return; }
  if (!isValidCoords(state.lat, state.lng)) { showError('Invalid or missing coordinates.'); return; }

  setProcessing(true);
  clearStatus();
  hideResults();

  try {
    const results = [];

    for (let i = 0; i < state.files.length; i++) {
      const { file, dataUrl } = state.files[i];
      const jpegDataUrl      = await ensureJpeg(dataUrl, 0.92);
      const geotaggedDataUrl = embedGpsExif(jpegDataUrl, state.lat, state.lng);
      const base64           = geotaggedDataUrl.split(',')[1];

      results.push({
        outputName: buildOutputNameForFile(i),
        geotaggedDataUrl,
        originalType: file.type,
        outputBytes: Math.round((base64.length * 3) / 4),
        lat: state.lat,
        lng: state.lng,
      });
    }

    state.results = results;
    renderResults();
    showSuccess(
      `${results.length} image${results.length !== 1 ? 's' : ''} geotagged successfully. Download below.`
    );
  } catch (err) {
    showError(`Processing failed: ${err.message}`);
    console.error(err);
  } finally {
    setProcessing(false);
  }
}

// ── Results ────────────────────────────────────────────────────────────────
function renderResults() {
  resultsGrid.innerHTML = state.results.map((r, i) => {
    const size = r.outputBytes > 1024 * 1024
      ? `${(r.outputBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(r.outputBytes / 1024).toFixed(1)} KB`;
    const formatLabel = r.originalType === 'image/jpeg'
      ? 'JPEG'
      : `${r.originalType.split('/')[1].toUpperCase()} → JPEG`;

    return `
      <div class="result-card">
        <img class="result-thumb" src="${r.geotaggedDataUrl}" alt="${escapeHtml(r.outputName)}" />
        <p class="result-name" title="${escapeHtml(r.outputName)}">${escapeHtml(r.outputName)}</p>
        <dl class="result-dl">
          <dt>Latitude</dt>  <dd>${escapeHtml(formatCoord(r.lat, 'lat'))}</dd>
          <dt>Longitude</dt> <dd>${escapeHtml(formatCoord(r.lng, 'lng'))}</dd>
          <dt>Output</dt>    <dd>${size}</dd>
          <dt>Format</dt>    <dd>${formatLabel}</dd>
        </dl>
        <button class="btn btn-success btn-sm w-100 mt-auto" onclick="downloadResult(${i})">
          <i data-lucide="download"></i> Download
        </button>
      </div>`;
  }).join('');

  resultsSection.classList.remove('d-none');
  downloadAllBtn.classList.remove('d-none');
  actionHint.classList.add('d-none');
  if (window.lucide) lucide.createIcons();
}

function hideResults() {
  resultsSection.classList.add('d-none');
  downloadAllBtn.classList.add('d-none');
  actionHint.classList.remove('d-none');
  state.results = [];
}


// Called from inline onclick in result cards
function downloadResult(index) {
  const r = state.results[index];
  if (r) triggerDownload(r.geotaggedDataUrl, r.outputName);
}

async function handleDownloadAll() {
  for (let i = 0; i < state.results.length; i++) {
    downloadResult(i);
    // Small delay so the browser doesn't block simultaneous downloads
    if (i < state.results.length - 1) await new Promise(res => setTimeout(res, 300));
  }
}

// ── JPEG conversion ────────────────────────────────────────────────────────
function ensureJpeg(dataUrl, quality = 0.92) {
  if (dataUrl.startsWith('data:image/jpeg')) return Promise.resolve(dataUrl);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // white bg for transparent PNGs
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to decode image for conversion.'));
    img.src = dataUrl;
  });
}

// ── EXIF GPS embedding ─────────────────────────────────────────────────────
function decimalToDmsRational(decimal) {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const secondsRational = Math.round((minutesFloat - minutes) * 60 * 100);
  return [[degrees, 1], [minutes, 1], [secondsRational, 100]];
}

function embedGpsExif(jpegDataUrl, lat, lng) {
  let exifObj;
  try {
    exifObj = piexif.load(jpegDataUrl);
  } catch (_) {
    exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, 'Interop': {}, '1st': {} };
  }

  exifObj['GPS'] = {
    [piexif.GPSIFD.GPSVersionID]:    [2, 3, 0, 0],
    [piexif.GPSIFD.GPSLatitudeRef]:  lat >= 0 ? 'N' : 'S',
    [piexif.GPSIFD.GPSLatitude]:     decimalToDmsRational(lat),
    [piexif.GPSIFD.GPSLongitudeRef]: lng >= 0 ? 'E' : 'W',
    [piexif.GPSIFD.GPSLongitude]:    decimalToDmsRational(lng),
  };

  return piexif.insert(piexif.dump(exifObj), jpegDataUrl);
}

// ── Download trigger ───────────────────────────────────────────────────────
function triggerDownload(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
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
  return type === 'lat'
    ? `${abs}° ${value >= 0 ? 'N' : 'S'}`
    : `${abs}° ${value >= 0 ? 'E' : 'W'}`;
}

function setProcessing(active) {
  if (active) {
    geotagBtn.disabled = true;
    geotagBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing…';
  } else {
    geotagBtn.innerHTML = 'Geotag Images';
    updateButtonState();
  }
}

// ── Status messages ────────────────────────────────────────────────────────
function clearStatus() { statusArea.innerHTML = ''; }

function showSuccess(msg) {
  statusArea.innerHTML =
    `<div class="alert alert-success alert-dismissible fade show" role="alert">
      <strong>Done!</strong> ${escapeHtml(msg)}
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
