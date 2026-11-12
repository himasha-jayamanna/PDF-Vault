import { compress } from './node_modules/@quicktoolsone/pdf-compress/dist/index.js';
const { decryptPDF, isEncrypted } = window.PDFDecrypt;

// State variables
const state = {
  merge: {
    files: []
  },
  split: {
    file: null,
    mode: 'range', // 'range' or 'all'
    pages: [], // list of: { pageNum, selected }
    pdfJsDoc: null,
    observer: null,
    previewPageNum: null
  },
  imgToPdf: {
    files: []
  },
  compress: {
    file: null,
    level: 'recommended' // 'recommended', 'maximum', 'lossless'
  },
  pdfToImg: {
    file: null,
    pages: [] // list of: { pageNum, selected }
  }
};

// Set PDF.js worker source locally
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'node_modules/pdfjs-dist/build/pdf.worker.min.js';
}

// UI Elements
const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.tool-panel');
const toolTitle = document.getElementById('current-tool-title');
const toolDesc = document.getElementById('current-tool-desc');

// Modal Elements
const statusModal = document.getElementById('status-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalProgress = document.getElementById('modal-progress');

// Sidebar Toggle
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');
const sidebar = document.querySelector('.sidebar');
if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    
    // Toggle chevron rotation and button position
    if (sidebar.classList.contains('collapsed')) {
      sidebarToggleIcon.style.transform = 'rotate(180deg)';
      sidebarToggleBtn.style.left = '16px';
    } else {
      sidebarToggleIcon.style.transform = 'rotate(0deg)';
      sidebarToggleBtn.style.left = '240px';
    }
  });
}

// Switch Tab Navigation
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabName = item.getAttribute('data-tab');
    
    // Toggle active menu class
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');
    
    // Toggle active panels
    panels.forEach(panel => {
      panel.classList.remove('active');
      if (panel.id === `panel-${tabName}`) {
        panel.classList.add('active');
      }
    });

    // Update Headers
    if (tabName === 'merge') {
      toolTitle.textContent = 'Merge PDF Documents';
      toolDesc.textContent = 'Combine multiple PDF files in any order you choose.';
    } else if (tabName === 'split') {
      toolTitle.textContent = 'Split PDF Document';
      toolDesc.textContent = 'Extract specific pages or separate every page of your PDF file.';
    } else if (tabName === 'img-to-pdf') {
      toolTitle.textContent = 'Images to PDF Converter';
      toolDesc.textContent = 'Convert JPG and PNG images into a clean, high-quality PDF document.';
    } else if (tabName === 'compress') {
      toolTitle.textContent = 'Compress PDF Document';
      toolDesc.textContent = 'Reduce the file size of your PDF document offline.';
    } else if (tabName === 'pdf-to-img') {
      toolTitle.textContent = 'PDF to Image Converter';
      toolDesc.textContent = 'Convert PDF pages into PNG or JPEG images and save them locally.';
    }
  });
});

// Toast Helper (uses textContent to prevent HTML/XSS injection from filenames or error messages)
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const span = document.createElement('span');
  span.className = 'toast-message';
  span.textContent = String(message);
  toast.appendChild(span);
  container.appendChild(toast);

  // Automatically remove after 3.5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Progress Modal Helpers
function showProgress(title, message, progress = 0) {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalProgress.style.width = `${progress}%`;
  statusModal.classList.remove('hidden');
}

function updateProgress(progress, message) {
  modalProgress.style.width = `${progress}%`;
  if (message) modalMessage.textContent = message;
}

function hideProgress() {
  statusModal.classList.add('hidden');
}

// File helper: format bytes to human readable sizes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Security: Sanitize user-controlled strings before inserting into innerHTML.
// Converts any HTML special characters (e.g. <script>) into safe escaped entities.
function sanitizeText(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// Security: Strip path separators, traversal sequences, and illegal Windows filename chars.
function sanitizeFilename(name, fallback = 'output') {
  const cleaned = String(name || '')
    .replace(/\.\.+/g, '.')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return cleaned || fallback;
}

// Security: Load PDF via PDF.js with JS eval disabled (mitigates GHSA-wgrm-67xf-hhpq).
function loadPdfJsDocument(arrayBuffer) {
  return pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
    isEvalSupported: false
  }).promise;
}

// Shared helper: compiles an in-memory PDF via buildPdfBytesFn and opens it in the system preview viewer.
async function openGeneratedPdfPreview(buildPdfBytesFn) {
  showProgress('Creating Preview', 'Compiling document in memory...', 20);
  try {
    const pdfBytes = await buildPdfBytesFn();
    updateProgress(90, 'Opening preview viewer...');
    const previewResult = await window.api.previewPdf(pdfBytes);
    hideProgress();
    if (!previewResult.success) {
      showToast(`Preview error: ${previewResult.error}`, 'error');
    }
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast(`Preview failed: ${err.message}`, 'error');
  }
}

// Read file helper
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Security & Decoding: Decrypts PDF streams if the file has an owner password restriction
// Fixes "blank pages" bug in pdf-lib when manipulating partially encrypted streams.
async function loadSafePdfBuffer(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  let uint8 = new Uint8Array(arrayBuffer);
  try {
    const encInfo = await isEncrypted(uint8);
    if (encInfo.encrypted) {
      uint8 = await decryptPDF(uint8, '');
    }
  } catch (err) {
    console.warn("Decryption skipped or failed:", err.message);
  }
  return uint8.buffer;
}

// Fetch and display dynamic App Version
const versionSpan = document.getElementById('app-version');
if (versionSpan && window.api && window.api.getAppVersion) {
  window.api.getAppVersion()
    .then(version => { versionSpan.textContent = version; })
    .catch(err => console.warn("Failed to retrieve app version", err));
}

// ==========================================
// 1. PDF MERGE FEATURE
// ==========================================
const dropZoneMerge = document.getElementById('drop-zone-merge');
const fileInputMerge = document.getElementById('file-input-merge');
const workspaceMerge = document.getElementById('workspace-merge');
const listMerge = document.getElementById('list-merge');
const countMerge = document.getElementById('count-merge');
const btnClearMerge = document.getElementById('btn-clear-merge');
const btnRunMerge = document.getElementById('btn-run-merge');
const btnAddMoreMerge = document.getElementById('btn-add-more-merge');
const fileInputAddMoreMerge = document.getElementById('file-input-add-more-merge');

// Drag & drop handlers
setupDragAndDrop(dropZoneMerge, fileInputMerge, handleMergeFiles);
setupDragAndDrop(workspaceMerge, fileInputAddMoreMerge, handleMergeFiles);

// Add more files listener (change listener is already bound safely inside setupDragAndDrop)
btnAddMoreMerge.addEventListener('click', () => fileInputAddMoreMerge.click());

function setupDragAndDrop(zone, input, handler) {
  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    }, false);
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (dt && dt.types) {
      // Ignore if this is an internal drag from the UI (reordering items)
      if (Array.from(dt.types).includes('application/pdf-vault-internal')) return;
    }
    
    if (dt && dt.files && dt.files.length > 0) {
      const actualFiles = Array.from(dt.files).filter(f => f.name);
      if (actualFiles.length > 0) {
        handler(dt.files);
      }
    }
  });

  // Guard against binding multiple change listeners when the same input is shared across dropZone & workspace
  if (input && !input.dataset.dndChangeBound) {
    input.dataset.dndChangeBound = 'true';
    input.addEventListener('change', (e) => {
      const selectedFiles = Array.from(e.target.files || []);
      e.target.value = '';
      if (selectedFiles.length > 0) {
        handler(selectedFiles);
      }
    });
  }
}

async function handleMergeFiles(files) {
  const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (pdfFiles.length === 0) {
    showToast('Please select valid PDF files.', 'error');
    return;
  }

  showProgress('Loading PDFs', 'Reading selected documents into memory...', 10);
  let loadedCount = 0;

  for (const file of pdfFiles) {
    try {
      const arrayBuffer = await loadSafePdfBuffer(file);
      const { PDFDocument } = PDFLib;
      const tempPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const pageCount = tempPdf.getPageCount();

      state.merge.files.push({
        name: file.name,
        size: file.size,
        data: arrayBuffer,
        pageCount: pageCount
      });
      loadedCount++;
      updateProgress(10 + Math.round((loadedCount / pdfFiles.length) * 80), `Loaded ${file.name}`);
    } catch (err) {
      console.error(err);
      showToast(`Failed to load ${file.name}`, 'error');
    }
  }

  hideProgress();
  renderMergeList();
  showToast(`Successfully added ${loadedCount} PDF file(s).`);
}

function renderMergeList() {
  listMerge.innerHTML = '';
  countMerge.textContent = state.merge.files.length;

  if (state.merge.files.length === 0) {
    workspaceMerge.classList.add('hidden');
    dropZoneMerge.classList.remove('hidden');
    return;
  }

  dropZoneMerge.classList.add('hidden');
  workspaceMerge.classList.remove('hidden');

  state.merge.files.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.style.cursor = 'grab';
    li.draggable = true;
    li.dataset.index = index;
    
    li.innerHTML = `
      <div class="file-order-badge">${index + 1}</div>
      <div class="file-info-main">
        <div class="file-icon-wrapper">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="file-details">
          <div class="file-name" title="${sanitizeText(file.name)}">${sanitizeText(file.name)}</div>
          <div class="file-size">${formatBytes(file.size)} • ${file.pageCount} pages</div>
        </div>
      </div>
      <div class="file-actions">
        <button class="btn-action btn-delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;

    // Hook button events
    li.querySelector('.btn-delete').addEventListener('click', () => deleteMergeItem(index));

    // HTML5 Drag and Drop Handlers
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
      e.dataTransfer.setData('application/pdf-vault-internal', 'true');
      li.classList.add('dragging');
      setTimeout(() => li.style.opacity = '0.5', 0);
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      li.style.opacity = '1';
      
      // Save new order on drag end (fires reliably compared to drop)
      const newOrder = Array.from(listMerge.children).map(child => parseInt(child.dataset.index));
      const newFiles = newOrder.map(i => state.merge.files[i]);
      state.merge.files = newFiles;
      renderMergeList();
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const draggingItem = listMerge.querySelector('.dragging');
      if (draggingItem && draggingItem !== li) {
        const bounding = li.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);
        if (e.clientY - offset > 0) {
          listMerge.insertBefore(draggingItem, li.nextSibling);
        } else {
          listMerge.insertBefore(draggingItem, li);
        }
      }
    });

    listMerge.appendChild(li);
  });
}

function swapMergeItems(i, j) {
  const temp = state.merge.files[i];
  state.merge.files[i] = state.merge.files[j];
  state.merge.files[j] = temp;
  renderMergeList();
}

function deleteMergeItem(index) {
  state.merge.files.splice(index, 1);
  renderMergeList();
}

btnClearMerge.addEventListener('click', () => {
  state.merge.files = [];
  renderMergeList();
});

const btnPreviewMerge = document.getElementById('btn-preview-merge');
if (btnPreviewMerge) {
  btnPreviewMerge.addEventListener('click', () => {
    if (state.merge.files.length < 1) return;

    openGeneratedPdfPreview(async () => {
      const { PDFDocument } = PDFLib;
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < state.merge.files.length; i++) {
        const file = state.merge.files[i];
        updateProgress(20 + Math.round((i / state.merge.files.length) * 60), `Processing document: ${file.name}`);
        const srcPdf = await PDFDocument.load(file.data, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      return mergedPdf.save();
    });
  });
}

btnRunMerge.addEventListener('click', async () => {
  if (state.merge.files.length < 2) {
    showToast('You must select at least 2 PDFs to merge.', 'error');
    return;
  }

  let outName = document.getElementById('merge-filename').value.trim();
  if (!outName.toLowerCase().endsWith('.pdf')) {
    outName += '.pdf';
  }

  // Ask where to save
  const dialogResult = await window.api.showSaveDialog({
    title: 'Save Merged PDF',
    defaultPath: outName
  });

  if (dialogResult.canceled || !dialogResult.filePath) {
    return;
  }

  showProgress('Merging PDFs', 'Processing files locally...', 20);

  try {
    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < state.merge.files.length; i++) {
      const file = state.merge.files[i];
      updateProgress(20 + Math.round((i / state.merge.files.length) * 60), `Processing document: ${file.name}`);

      const srcPdf = await PDFDocument.load(file.data, { ignoreEncryption: true });
      const indices = srcPdf.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(srcPdf, indices);
      
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    updateProgress(85, 'Finalizing & Compiling PDF...');
    const mergedPdfBytes = await mergedPdf.save();

    updateProgress(95, 'Saving to disk...');
    const saveResult = await window.api.saveFile({
      filePath: dialogResult.filePath,
      arrayBuffer: mergedPdfBytes
    });

    hideProgress();

    if (saveResult.success) {
      showToast('PDFs merged successfully!');
    } else {
      showToast(`Error saving file: ${saveResult.error}`, 'error');
    }
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast(`Merge failed: ${err.message}`, 'error');
  }
});


// ==========================================
// SHARED PAGE RANGE & THUMBNAIL HELPERS
// ==========================================

/** Formats sorted 1-based page numbers into compact range notation (e.g. "1-3, 5"). */
function formatPageRanges(selectedPageNums, totalPages, useAllKeyword = false) {
  if (!selectedPageNums || selectedPageNums.length === 0) return '';
  if (useAllKeyword && selectedPageNums.length === totalPages) return 'All';

  const sorted = [...selectedPageNums].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

/** Lazily renders PDF thumbnails as cards enter the scrollable grid viewport. */
function setupLazyThumbnailObserver(gridEl, pdfJsDoc, scale = 0.5) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      if (card.dataset.rendered === 'true') {
        observer.unobserve(card);
        return;
      }
      card.dataset.rendered = 'true';
      observer.unobserve(card);
      const pageNum = parseInt(card.getAttribute('data-page'), 10);
      const canvas = card.querySelector('canvas');
      if (canvas && !isNaN(pageNum)) {
        renderThumbnail(pdfJsDoc, pageNum, canvas, scale);
      }
    });
  }, {
    root: gridEl,
    rootMargin: '250px 0px',
    threshold: 0.01
  });

  gridEl.querySelectorAll('.page-item-card').forEach((card) => observer.observe(card));
  return observer;
}


// ==========================================
// 2. PDF SPLIT FEATURE
// ==========================================
const dropZoneSplit = document.getElementById('drop-zone-split');
const fileInputSplit = document.getElementById('file-input-split');
const workspaceSplit = document.getElementById('workspace-split');
const splitFilename = document.getElementById('split-filename');
const splitFilesize = document.getElementById('split-filesize');
const splitPagecount = document.getElementById('split-pagecount');
const countSplit = document.getElementById('count-split');
const gridSplit = document.getElementById('grid-split');
const splitRangesInput = document.getElementById('split-ranges');
const modeCards = document.querySelectorAll('.split-mode-selection .mode-card');
const splitSettingsRange = document.getElementById('split-settings-range');
const splitSettingsAll = document.getElementById('split-settings-all');
const btnSelectAllSplit = document.getElementById('btn-select-all-split');
const btnDeselectAllSplit = document.getElementById('btn-deselect-all-split');
const btnClearSplit = document.getElementById('btn-clear-split');
const btnPreviewSplit = document.getElementById('btn-preview-split');
const btnRunSplit = document.getElementById('btn-run-split');

// In-App Page Zoom Preview Modal Elements
const pagePreviewModal = document.getElementById('page-preview-modal');
const pagePreviewCanvas = document.getElementById('page-preview-canvas');
const pagePreviewIndicator = document.getElementById('page-preview-indicator');
const btnPreviewPrev = document.getElementById('btn-preview-prev');
const btnPreviewNext = document.getElementById('btn-preview-next');
const btnPreviewToggleSelect = document.getElementById('btn-preview-toggle-select');
const btnClosePreview = document.getElementById('btn-close-preview');
let activePreviewRenderTask = null;
let previewRenderSeq = 0;

setupDragAndDrop(dropZoneSplit, fileInputSplit, handleSplitFile);
setupDragAndDrop(workspaceSplit, fileInputSplit, handleSplitFile);

function cleanupSplitResources() {
  if (state.split.observer) {
    state.split.observer.disconnect();
    state.split.observer = null;
  }
  if (state.split.pdfJsDoc) {
    state.split.pdfJsDoc.destroy().catch(() => {});
    state.split.pdfJsDoc = null;
  }
  state.split.previewPageNum = null;
  closePagePreview();
}

function updateSplitSelectionUI(skipInputUpdate = false) {
  const pages = state.split.pages;
  const selectedNums = pages.filter(p => p.selected).map(p => p.pageNum);
  countSplit.textContent = selectedNums.length;

  gridSplit.querySelectorAll('.page-item-card').forEach((card, idx) => {
    if (pages[idx] && pages[idx].selected) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  if (!skipInputUpdate && splitRangesInput) {
    splitRangesInput.value = formatPageRanges(selectedNums, pages.length, false);
  }
}

function createSplitPageCard(pageNum) {
  const card = document.createElement('div');
  card.className = 'page-item-card selected';
  card.setAttribute('data-page', pageNum);
  card.innerHTML = `
    <canvas class="page-item-canvas"></canvas>
    <button type="button" class="page-zoom-btn" title="Zoom & inspect page ${pageNum}">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
    </button>
    <div class="page-selection-overlay">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="page-number-badge">Page ${pageNum}</div>
  `;

  card.addEventListener('click', () => {
    if (state.split.mode !== 'range') return;
    const pageEntry = state.split.pages[pageNum - 1];
    if (!pageEntry) return;
    pageEntry.selected = !pageEntry.selected;
    updateSplitSelectionUI();
  });

  card.addEventListener('dblclick', () => openPagePreview(pageNum));

  const zoomBtn = card.querySelector('.page-zoom-btn');
  zoomBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openPagePreview(pageNum);
  });

  return card;
}

function updatePreviewModalToggleBtn(pageNum) {
  if (!btnPreviewToggleSelect) return;
  if (state.split.mode !== 'range') {
    btnPreviewToggleSelect.classList.add('hidden');
    return;
  }
  btnPreviewToggleSelect.classList.remove('hidden');
  const isSelected = Boolean(state.split.pages[pageNum - 1]?.selected);
  btnPreviewToggleSelect.textContent = isSelected ? 'Selected ✓' : 'Select Page';
  btnPreviewToggleSelect.classList.toggle('btn-primary', isSelected);
  btnPreviewToggleSelect.classList.toggle('btn-secondary', !isSelected);
}

async function openPagePreview(pageNum) {
  if (!state.split.pdfJsDoc || !state.split.file) return;
  const seq = ++previewRenderSeq;
  const totalPages = state.split.file.pageCount;
  const clampedPage = Math.max(1, Math.min(pageNum, totalPages));
  state.split.previewPageNum = clampedPage;

  pagePreviewIndicator.textContent = `Page ${clampedPage} of ${totalPages}`;
  btnPreviewPrev.disabled = clampedPage <= 1;
  btnPreviewNext.disabled = clampedPage >= totalPages;
  updatePreviewModalToggleBtn(clampedPage);
  pagePreviewCanvas.dataset.renderedPage = '';
  pagePreviewModal.classList.remove('hidden');

  try {
    if (activePreviewRenderTask) {
      const prevTask = activePreviewRenderTask;
      activePreviewRenderTask = null;
      prevTask.cancel();
      try {
        await prevTask.promise;
      } catch (_) {
        // Expected RenderingCancelledException
      }
    }
    if (seq !== previewRenderSeq || !state.split.pdfJsDoc) return;

    const page = await state.split.pdfJsDoc.getPage(clampedPage);
    if (seq !== previewRenderSeq || !state.split.pdfJsDoc) return;

    const viewport = page.getViewport({ scale: 1.75 });
    const ctx = pagePreviewCanvas.getContext('2d');
    pagePreviewCanvas.width = viewport.width;
    pagePreviewCanvas.height = viewport.height;

    const renderTask = page.render({ canvasContext: ctx, viewport });
    activePreviewRenderTask = renderTask;
    await renderTask.promise;
    if (activePreviewRenderTask === renderTask) {
      activePreviewRenderTask = null;
    }
    if (seq === previewRenderSeq) {
      pagePreviewCanvas.dataset.renderedPage = String(clampedPage);
    }
  } catch (err) {
    if (err && err.name !== 'RenderingCancelledException') {
      console.error('Failed to render preview page:', err);
      showToast('Failed to render page preview.', 'error');
    }
  }
}

function closePagePreview() {
  previewRenderSeq++;
  if (activePreviewRenderTask) {
    activePreviewRenderTask.cancel();
    activePreviewRenderTask = null;
  }
  state.split.previewPageNum = null;
  if (pagePreviewModal) {
    pagePreviewModal.classList.add('hidden');
  }
}

if (btnPreviewPrev) {
  btnPreviewPrev.addEventListener('click', () => {
    if (state.split.previewPageNum > 1) openPagePreview(state.split.previewPageNum - 1);
  });
}

if (btnPreviewNext) {
  btnPreviewNext.addEventListener('click', () => {
    if (state.split.file && state.split.previewPageNum < state.split.file.pageCount) {
      openPagePreview(state.split.previewPageNum + 1);
    }
  });
}

if (btnPreviewToggleSelect) {
  btnPreviewToggleSelect.addEventListener('click', () => {
    const pageNum = state.split.previewPageNum;
    if (!pageNum || state.split.mode !== 'range') return;
    const entry = state.split.pages[pageNum - 1];
    if (!entry) return;
    entry.selected = !entry.selected;
    updateSplitSelectionUI();
    updatePreviewModalToggleBtn(pageNum);
  });
}

if (btnClosePreview) {
  btnClosePreview.addEventListener('click', closePagePreview);
}

if (pagePreviewModal) {
  pagePreviewModal.addEventListener('click', (e) => {
    if (e.target === pagePreviewModal) closePagePreview();
  });
}

document.addEventListener('keydown', (e) => {
  if (!pagePreviewModal || pagePreviewModal.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    closePagePreview();
  } else if (e.key === 'ArrowLeft' && state.split.previewPageNum > 1) {
    openPagePreview(state.split.previewPageNum - 1);
  } else if (e.key === 'ArrowRight' && state.split.file && state.split.previewPageNum < state.split.file.pageCount) {
    openPagePreview(state.split.previewPageNum + 1);
  }
});

async function handleSplitFile(files) {
  const pdfFile = Array.from(files)[0];
  if (!pdfFile || !pdfFile.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please select a valid PDF file.', 'error');
    return;
  }

  showProgress('Loading PDF', 'Reading document properties and preparing page previews...', 20);
  cleanupSplitResources();

  try {
    const arrayBuffer = await loadSafePdfBuffer(pdfFile);
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    updateProgress(55, 'Initializing page viewer...');
    const pdfJsDoc = await loadPdfJsDocument(arrayBuffer);

    state.split.file = {
      name: pdfFile.name,
      size: pdfFile.size,
      data: arrayBuffer,
      pageCount: pageCount
    };
    state.split.pdfJsDoc = pdfJsDoc;
    state.split.pages = [];
    gridSplit.innerHTML = '';

    const fragment = document.createDocumentFragment();
    for (let i = 1; i <= pageCount; i++) {
      state.split.pages.push({ pageNum: i, selected: true });
      fragment.appendChild(createSplitPageCard(i));
    }
    gridSplit.appendChild(fragment);

    splitFilename.textContent = pdfFile.name;
    splitFilesize.textContent = formatBytes(pdfFile.size);
    splitPagecount.textContent = pageCount;
    document.getElementById('split-out-filename').value = pdfFile.name.replace(/\.[^/.]+$/, "") + "_split";

    dropZoneSplit.classList.add('hidden');
    workspaceSplit.classList.remove('hidden');

    updateSplitSelectionUI();
    state.split.observer = setupLazyThumbnailObserver(gridSplit, pdfJsDoc, 0.5);

    hideProgress();
    showToast('PDF loaded successfully.');
  } catch (err) {
    console.error(err);
    cleanupSplitResources();
    hideProgress();
    showToast('Failed to load PDF. Might be password protected.', 'error');
  }
}

if (splitRangesInput) {
  splitRangesInput.addEventListener('input', (e) => {
    if (!state.split.pages || state.split.pages.length === 0) return;
    const val = e.target.value.trim().toLowerCase();
    const maxPages = state.split.pages.length;

    if (val === '') {
      state.split.pages.forEach(p => { p.selected = false; });
    } else {
      try {
        const parsedIndices = parsePageRanges(e.target.value, maxPages);
        const indexSet = new Set(parsedIndices);
        state.split.pages.forEach((p, idx) => {
          p.selected = indexSet.has(idx);
        });
      } catch (err) {
        // Ignore partial input (e.g. trailing comma or hyphen) while typing
        return;
      }
    }

    updateSplitSelectionUI(true);
  });
}

if (btnSelectAllSplit) {
  btnSelectAllSplit.addEventListener('click', () => {
    state.split.pages.forEach(p => { p.selected = true; });
    updateSplitSelectionUI();
  });
}

if (btnDeselectAllSplit) {
  btnDeselectAllSplit.addEventListener('click', () => {
    state.split.pages.forEach(p => { p.selected = false; });
    updateSplitSelectionUI();
  });
}

// Mode selection toggle
modeCards.forEach(card => {
  card.addEventListener('click', () => {
    modeCards.forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    const mode = card.getAttribute('data-mode');
    state.split.mode = mode;

    if (mode === 'range') {
      splitSettingsRange.classList.remove('hidden');
      splitSettingsAll.classList.add('hidden');
      gridSplit.classList.remove('split-all-mode');
      btnSelectAllSplit.classList.remove('hidden');
      btnDeselectAllSplit.classList.remove('hidden');
      if (btnPreviewSplit) btnPreviewSplit.classList.remove('hidden');
      updateSplitSelectionUI();
    } else {
      splitSettingsRange.classList.add('hidden');
      splitSettingsAll.classList.remove('hidden');
      gridSplit.classList.add('split-all-mode');
      btnSelectAllSplit.classList.add('hidden');
      btnDeselectAllSplit.classList.add('hidden');
      if (btnPreviewSplit) btnPreviewSplit.classList.add('hidden');
    }
  });
});

btnClearSplit.addEventListener('click', () => {
  cleanupSplitResources();
  state.split.file = null;
  state.split.pages = [];
  gridSplit.innerHTML = '';
  countSplit.textContent = '0';
  if (splitRangesInput) splitRangesInput.value = '';
  workspaceSplit.classList.add('hidden');
  dropZoneSplit.classList.remove('hidden');
});

/** Parses comma-separated range sections into { label, indices } groups (0-based indices). */
function parsePageRangeGroups(rangeStr, maxPages) {
  const trimmed = rangeStr.trim();
  if (!trimmed) {
    throw new Error('Please enter a page range.');
  }
  if (trimmed.toLowerCase() === 'all') {
    return [{
      label: maxPages === 1 ? '1' : `1-${maxPages}`,
      indices: Array.from({ length: maxPages }, (_, i) => i)
    }];
  }

  const parts = trimmed.replace(/\s+/g, '').split(',');
  const groups = [];

  for (const part of parts) {
    if (!part) {
      throw new Error('Invalid empty range segment.');
    }
    if (part.includes('-')) {
      const bounds = part.split('-');
      if (bounds.length !== 2) {
        throw new Error(`Invalid range: ${part}`);
      }
      const start = parseInt(bounds[0], 10);
      const end = parseInt(bounds[1], 10);

      if (isNaN(start) || isNaN(end) || start < 1 || end < 1 || start > maxPages || end > maxPages) {
        throw new Error(`Invalid range: ${part}`);
      }

      const min = Math.min(start, end);
      const max = Math.max(start, end);
      const indices = [];
      for (let i = min; i <= max; i++) {
        indices.push(i - 1);
      }
      groups.push({ label: min === max ? `${min}` : `${min}-${max}`, indices });
    } else {
      const page = parseInt(part, 10);
      if (isNaN(page) || page < 1 || page > maxPages) {
        throw new Error(`Invalid page number: ${part}`);
      }
      groups.push({ label: `${page}`, indices: [page - 1] });
    }
  }

  return groups;
}

// Parse user range input (e.g. 1-3, 5, 8-10, or 'all') to flat deduplicated 0-based index array
function parsePageRanges(rangeStr, maxPages) {
  const groups = parsePageRangeGroups(rangeStr, maxPages);
  const indices = groups.flatMap(g => g.indices);
  return Array.from(new Set(indices)).sort((a, b) => a - b);
}

/** Exports an array of { filename, indices } PDF groups into a destination folder. */
async function exportSplitGroupsToFolder(srcPdf, groups, folderPath) {
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const progress = 10 + Math.round((i / groups.length) * 80);
    updateProgress(progress, `Saving file ${i + 1} of ${groups.length} (${group.filename})...`);

    const outPdf = await PDFDocumentHelperCopy(srcPdf, group.indices);
    const bytes = await outPdf.save();
    const saveResult = await window.api.saveFile({
      filePath: `${folderPath}\\${group.filename}`,
      arrayBuffer: bytes
    });

    if (!saveResult.success) {
      throw new Error(saveResult.error || `Failed to save ${group.filename}`);
    }
  }
}

async function PDFDocumentHelperCopy(srcPdf, indices) {
  const { PDFDocument } = PDFLib;
  const destPdf = await PDFDocument.create();
  const copiedPages = await destPdf.copyPages(srcPdf, indices);
  copiedPages.forEach(page => destPdf.addPage(page));
  return destPdf;
}

if (btnPreviewSplit) {
  btnPreviewSplit.addEventListener('click', () => {
    if (!state.split.file || state.split.mode !== 'range') return;

    const rangeInput = document.getElementById('split-ranges').value.trim();
    if (!rangeInput) {
      showToast('Please select at least one page or enter a page range.', 'error');
      return;
    }

    let targetIndices;
    try {
      targetIndices = parsePageRanges(rangeInput, state.split.file.pageCount);
    } catch (e) {
      showToast(e.message, 'error');
      return;
    }

    openGeneratedPdfPreview(async () => {
      const { PDFDocument } = PDFLib;
      const srcPdf = await PDFDocument.load(state.split.file.data, { ignoreEncryption: true });
      const destPdf = await PDFDocumentHelperCopy(srcPdf, targetIndices);
      return destPdf.save();
    });
  });
}

btnRunSplit.addEventListener('click', async () => {
  if (!state.split.file) return;

  const baseName = sanitizeFilename(document.getElementById('split-out-filename').value, 'split_document');
  const { PDFDocument } = PDFLib;

  if (state.split.mode === 'range') {
    const rangeInput = document.getElementById('split-ranges').value.trim();
    if (!rangeInput) {
      showToast('Please enter a page range.', 'error');
      return;
    }

    const separateFiles = Boolean(document.getElementById('split-separate-files')?.checked);

    if (separateFiles) {
      let groups;
      try {
        groups = parsePageRangeGroups(rangeInput, state.split.file.pageCount);
      } catch (e) {
        showToast(e.message, 'error');
        return;
      }

      const folderDialogResult = await window.api.showDirectoryDialog({
        title: 'Select Destination Folder for Split PDFs'
      });
      if (folderDialogResult.canceled || !folderDialogResult.filePaths || folderDialogResult.filePaths.length === 0) {
        return;
      }

      const folderPath = folderDialogResult.filePaths[0];
      showProgress('Splitting Sections', 'Processing locally in memory...', 10);

      try {
        const srcPdf = await PDFDocument.load(state.split.file.data, { ignoreEncryption: true });
        const exportJobs = groups.map((g, idx) => ({
          filename: `${baseName}_part_${idx + 1}_p${g.label}.pdf`,
          indices: g.indices
        }));
        await exportSplitGroupsToFolder(srcPdf, exportJobs, folderPath);

        hideProgress();
        showToast(`Successfully split into ${exportJobs.length} PDF file(s)!`);
      } catch (err) {
        console.error(err);
        hideProgress();
        showToast(`Split failed: ${err.message}`, 'error');
      }
      return;
    }

    // Default behavior: merge selected pages into a single PDF
    let targetIndices;
    try {
      targetIndices = parsePageRanges(rangeInput, state.split.file.pageCount);
    } catch (e) {
      showToast(e.message, 'error');
      return;
    }

    const dialogResult = await window.api.showSaveDialog({
      title: 'Save Extracted Pages',
      defaultPath: `${baseName}.pdf`
    });
    if (dialogResult.canceled || !dialogResult.filePath) return;

    showProgress('Extracting Pages', 'Processing locally in memory...', 30);

    try {
      const srcPdf = await PDFDocument.load(state.split.file.data, { ignoreEncryption: true });
      const destPdf = await PDFDocumentHelperCopy(srcPdf, targetIndices);

      updateProgress(70, 'Compiling and saving...');
      const pdfBytes = await destPdf.save();

      const saveResult = await window.api.saveFile({
        filePath: dialogResult.filePath,
        arrayBuffer: pdfBytes
      });

      hideProgress();
      if (saveResult.success) {
        showToast('PDF pages extracted successfully!');
      } else {
        showToast(`Save error: ${saveResult.error}`, 'error');
      }
    } catch (err) {
      console.error(err);
      hideProgress();
      showToast(`Extraction failed: ${err.message}`, 'error');
    }

  } else {
    // Mode: Split All Pages / Fixed Page Interval
    const chunkSize = parseInt(document.getElementById('split-fixed-count')?.value || '1', 10);
    if (isNaN(chunkSize) || chunkSize < 1) {
      showToast('Pages per PDF file must be at least 1.', 'error');
      return;
    }

    const folderDialogResult = await window.api.showDirectoryDialog({
      title: 'Select Destination Folder'
    });
    if (folderDialogResult.canceled || !folderDialogResult.filePaths || folderDialogResult.filePaths.length === 0) {
      return;
    }

    const folderPath = folderDialogResult.filePaths[0];
    showProgress('Splitting PDF', 'Loading source file...', 10);

    try {
      const srcPdf = await PDFDocument.load(state.split.file.data, { ignoreEncryption: true });
      const totalPages = state.split.file.pageCount;
      const exportJobs = [];

      if (chunkSize === 1) {
        for (let i = 0; i < totalPages; i++) {
          exportJobs.push({
            filename: `${baseName}_page_${i + 1}.pdf`,
            indices: [i]
          });
        }
      } else {
        let partNum = 1;
        for (let start = 0; start < totalPages; start += chunkSize) {
          const end = Math.min(start + chunkSize, totalPages);
          const indices = [];
          for (let p = start; p < end; p++) indices.push(p);
          const label = (start + 1 === end) ? `${end}` : `${start + 1}-${end}`;
          exportJobs.push({
            filename: `${baseName}_part_${partNum}_p${label}.pdf`,
            indices
          });
          partNum++;
        }
      }

      await exportSplitGroupsToFolder(srcPdf, exportJobs, folderPath);

      hideProgress();
      showToast(`Successfully split into ${exportJobs.length} PDF file(s) in folder!`);
    } catch (err) {
      console.error(err);
      hideProgress();
      showToast(`Failed to split pages: ${err.message}`, 'error');
    }
  }
});


// ==========================================
// 3. IMAGES TO PDF FEATURE
// ==========================================
const dropZoneImg = document.getElementById('drop-zone-img');
const fileInputImg = document.getElementById('file-input-img');
const workspaceImg = document.getElementById('workspace-img');
const gridImg = document.getElementById('grid-img');
const countImg = document.getElementById('count-img');
const btnClearImg = document.getElementById('btn-clear-img');
const btnRunImg = document.getElementById('btn-run-img');
const btnAddMoreImg = document.getElementById('btn-add-more-img');
const fileInputAddMoreImg = document.getElementById('file-input-add-more-img');

setupDragAndDrop(dropZoneImg, fileInputImg, handleImageFiles);
setupDragAndDrop(workspaceImg, fileInputAddMoreImg, handleImageFiles);

// Add more images listener (change listener is already bound safely inside setupDragAndDrop)
btnAddMoreImg.addEventListener('click', () => fileInputAddMoreImg.click());

async function handleImageFiles(files) {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  const imageFiles = Array.from(files).filter(f => allowedTypes.includes(f.type));

  if (imageFiles.length === 0) {
    showToast('Please select PNG or JPG images.', 'error');
    return;
  }

  showProgress('Loading Images', 'Reading selected images...', 20);
  let loaded = 0;

  for (const file of imageFiles) {
    try {
      const arrayBuffer = await readFileAsArrayBuffer(file);
      // Generate standard base64/objectURL for previewing
      const blob = new Blob([arrayBuffer], { type: file.type });
      const objectURL = URL.createObjectURL(blob);

      state.imgToPdf.files.push({
        name: file.name,
        size: file.size,
        type: file.type,
        data: arrayBuffer,
        url: objectURL
      });

      loaded++;
      updateProgress(20 + Math.round((loaded / imageFiles.length) * 70), `Loaded ${file.name}`);
    } catch (err) {
      console.error(err);
      showToast(`Failed to load image: ${file.name}`, 'error');
    }
  }

  hideProgress();
  renderImageGrid();
  showToast(`Successfully added ${loaded} image(s).`);
}

function renderImageGrid() {
  gridImg.innerHTML = '';
  countImg.textContent = state.imgToPdf.files.length;

  if (state.imgToPdf.files.length === 0) {
    workspaceImg.classList.add('hidden');
    dropZoneImg.classList.remove('hidden');
    return;
  }

  dropZoneImg.classList.add('hidden');
  workspaceImg.classList.remove('hidden');

  state.imgToPdf.files.forEach((file, index) => {
    const card = document.createElement('div');
    card.className = 'img-item-card';
    card.innerHTML = `
      <img src="${file.url}" class="img-preview" alt="Preview">
      <div class="img-order-badge">Page ${index + 1}</div>
      <div class="img-card-actions">
        <button class="btn-card-action btn-move-left" ${index === 0 ? 'disabled style="opacity: 0.3; cursor: default;"' : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button class="btn-card-action btn-move-right" ${index === state.imgToPdf.files.length - 1 ? 'disabled style="opacity: 0.3; cursor: default;"' : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="btn-card-action btn-delete-card">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;

    // Hook buttons events
    card.querySelector('.btn-move-left').addEventListener('click', () => swapImgItems(index, index - 1));
    card.querySelector('.btn-move-right').addEventListener('click', () => swapImgItems(index, index + 1));
    card.querySelector('.btn-delete-card').addEventListener('click', () => deleteImgItem(index));

    // HTML5 Drag and Drop Handlers
    card.draggable = true;
    card.style.cursor = 'grab';
    card.dataset.index = index;

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
      e.dataTransfer.setData('application/pdf-vault-internal', 'true');
      card.classList.add('dragging');
      setTimeout(() => card.style.opacity = '0.5', 0);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      card.style.opacity = '1';
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const draggingItem = gridImg.querySelector('.dragging');
      if (draggingItem && draggingItem !== card) {
        card.style.border = '2px dashed var(--color-primary)';
      }
    });

    card.addEventListener('dragleave', () => {
      card.style.border = '';
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.style.border = '';
      const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const targetIndex = index;

      if (!isNaN(draggedIndex) && draggedIndex !== targetIndex) {
        const draggedFile = state.imgToPdf.files[draggedIndex];
        state.imgToPdf.files.splice(draggedIndex, 1);
        state.imgToPdf.files.splice(targetIndex, 0, draggedFile);
        renderImageGrid();
      }
    });

    gridImg.appendChild(card);
  });
}

function swapImgItems(i, j) {
  const temp = state.imgToPdf.files[i];
  state.imgToPdf.files[i] = state.imgToPdf.files[j];
  state.imgToPdf.files[j] = temp;
  renderImageGrid();
}

function deleteImgItem(index) {
  // Revoke object URL to prevent memory leaks
  URL.revokeObjectURL(state.imgToPdf.files[index].url);
  state.imgToPdf.files.splice(index, 1);
  renderImageGrid();
}

btnClearImg.addEventListener('click', () => {
  state.imgToPdf.files.forEach(f => URL.revokeObjectURL(f.url));
  state.imgToPdf.files = [];
  renderImageGrid();
});

// Helper for standard A4 and US Letter sizes (in points: 1 pt = 1/72 inch)
const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  US_Letter: { width: 612, height: 792 }
};

/** Compiles state.imgToPdf.files into PDF bytes using current page/orientation/margin settings. */
async function buildImagesToPdfBytes() {
  const pageSizeSetting = document.getElementById('img-page-size').value;
  const orientationSetting = document.getElementById('img-orientation').value;
  const marginSetting = document.getElementById('img-margin').value;

  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  let margin = 0;
  if (marginSetting === 'small') margin = 20;
  if (marginSetting === 'large') margin = 40;

  for (let i = 0; i < state.imgToPdf.files.length; i++) {
    const imgFile = state.imgToPdf.files[i];
    updateProgress(20 + Math.round((i / state.imgToPdf.files.length) * 65), `Processing image ${i + 1}...`);

    let embeddedImage;
    if (imgFile.type === 'image/png') {
      embeddedImage = await pdfDoc.embedPng(imgFile.data);
    } else {
      embeddedImage = await pdfDoc.embedJpg(imgFile.data);
    }

    const imgWidth = embeddedImage.width;
    const imgHeight = embeddedImage.height;

    let pageWidth, pageHeight;
    if (pageSizeSetting === 'Fit') {
      pageWidth = imgWidth + margin * 2;
      pageHeight = imgHeight + margin * 2;
    } else {
      const standardSize = PAGE_SIZES[pageSizeSetting];
      if (orientationSetting === 'portrait') {
        pageWidth = standardSize.width;
        pageHeight = standardSize.height;
      } else {
        pageWidth = standardSize.height;
        pageHeight = standardSize.width;
      }
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const maxDrawWidth = pageWidth - margin * 2;
    const maxDrawHeight = pageHeight - margin * 2;
    const scale = Math.min(maxDrawWidth / imgWidth, maxDrawHeight / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;
    const x = margin + (maxDrawWidth - drawWidth) / 2;
    const y = margin + (maxDrawHeight - drawHeight) / 2;

    page.drawImage(embeddedImage, { x, y, width: drawWidth, height: drawHeight });
  }

  return pdfDoc.save();
}

const btnPreviewImg = document.getElementById('btn-preview-img');
if (btnPreviewImg) {
  btnPreviewImg.addEventListener('click', () => {
    if (state.imgToPdf.files.length === 0) return;
    openGeneratedPdfPreview(buildImagesToPdfBytes);
  });
}

btnRunImg.addEventListener('click', async () => {
  if (state.imgToPdf.files.length === 0) return;

  let outName = document.getElementById('img-out-filename').value.trim();
  if (!outName.toLowerCase().endsWith('.pdf')) {
    outName += '.pdf';
  }

  const dialogResult = await window.api.showSaveDialog({
    title: 'Save Generated PDF',
    defaultPath: outName
  });

  if (dialogResult.canceled || !dialogResult.filePath) return;

  showProgress('Creating PDF', 'Embedding images...', 10);

  try {
    const pdfBytes = await buildImagesToPdfBytes();
    updateProgress(85, 'Compiling and saving...');

    const saveResult = await window.api.saveFile({
      filePath: dialogResult.filePath,
      arrayBuffer: pdfBytes
    });

    hideProgress();
    if (saveResult.success) {
      showToast('PDF generated successfully!');
    } else {
      showToast(`Error saving PDF: ${saveResult.error}`, 'error');
    }
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast(`PDF generation failed: ${err.message}`, 'error');
  }
});

// ==========================================
// 4. PDF COMPRESS FEATURE
// ==========================================
const dropZoneCompress = document.getElementById('drop-zone-compress');
const fileInputCompress = document.getElementById('file-input-compress');
const workspaceCompress = document.getElementById('workspace-compress');
const compressFilename = document.getElementById('compress-filename');
const compressFilesize = document.getElementById('compress-filesize');
const compressPagecount = document.getElementById('compress-pagecount');
const btnClearCompress = document.getElementById('btn-clear-compress');
const btnRunCompress = document.getElementById('btn-run-compress');
const compressModeCards = document.querySelectorAll('.compress-mode-selection .mode-card');

setupDragAndDrop(dropZoneCompress, fileInputCompress, handleCompressFile);
setupDragAndDrop(workspaceCompress, fileInputCompress, handleCompressFile);

async function handleCompressFile(files) {
  const file = Array.from(files)[0];
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please select a valid PDF file.', 'error');
    return;
  }

  showProgress('Loading PDF', 'Analyzing document size...', 20);

  try {
    const arrayBuffer = await loadSafePdfBuffer(file);
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    state.compress.file = {
      name: file.name,
      size: file.size,
      data: arrayBuffer,
      pageCount: pageCount
    };

    compressFilename.textContent = file.name;
    compressFilesize.textContent = formatBytes(file.size);
    compressPagecount.textContent = pageCount;
    document.getElementById('compress-out-filename').value = file.name.replace(/\.[^/.]+$/, "") + "_compressed.pdf";

    dropZoneCompress.classList.add('hidden');
    workspaceCompress.classList.remove('hidden');
    hideProgress();
    showToast('PDF loaded successfully.');
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast('Failed to load PDF.', 'error');
  }
}

// Mode selection toggle for compress
compressModeCards.forEach(card => {
  card.addEventListener('click', () => {
    compressModeCards.forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    state.compress.level = card.getAttribute('data-level');
  });
});

btnClearCompress.addEventListener('click', () => {
  state.compress.file = null;
  workspaceCompress.classList.add('hidden');
  dropZoneCompress.classList.remove('hidden');
});

btnRunCompress.addEventListener('click', async () => {
  if (!state.compress.file) return;

  let outName = document.getElementById('compress-out-filename').value.trim();
  if (!outName.toLowerCase().endsWith('.pdf')) {
    outName += '.pdf';
  }

  const dialogResult = await window.api.showSaveDialog({
    title: 'Save Compressed PDF',
    defaultPath: outName
  });

  if (dialogResult.canceled || !dialogResult.filePath) return;

  showProgress('Compressing PDF', 'Initializing local compressor...', 10);

  try {
    // Map local levels to @quicktoolsone/pdf-compress presets
    let preset = 'balanced';
    if (state.compress.level === 'lossless') preset = 'lossless';
    if (state.compress.level === 'maximum') preset = 'max';

    const result = await compress(state.compress.file.data.slice(0), {
      preset,
      onProgress: (event) => {
        const progress = 10 + Math.round(event.progress * 0.8);
        updateProgress(progress, event.message || 'Optimizing document...');
      }
    });

    updateProgress(92, 'Writing compressed file...');
    const saveResult = await window.api.saveFile({
      filePath: dialogResult.filePath,
      arrayBuffer: result.pdf
    });

    hideProgress();

    if (saveResult.success) {
      const originalSize = state.compress.file.size;
      const compressedSize = result.stats.compressedSize;
      const savedPercent = result.stats.percentageSaved.toFixed(1);
      
      showToast(`PDF compressed successfully! Reduced from ${formatBytes(originalSize)} to ${formatBytes(compressedSize)} (Saved ${savedPercent}%).`);
    } else {
      showToast(`Error saving file: ${saveResult.error}`, 'error');
    }
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast(`Compression failed: ${err.message}`, 'error');
  }
});


// ==========================================
// 5. PDF TO IMAGE FEATURE
// ==========================================
const dropZonePdfToImg = document.getElementById('drop-zone-pdf-to-img');
const fileInputPdfToImg = document.getElementById('file-input-pdf-to-img');
const workspacePdfToImg = document.getElementById('workspace-pdf-to-img');
const gridPdfToImg = document.getElementById('grid-pdf-to-img');
const countPdfToImg = document.getElementById('count-pdf-to-img');
const btnSelectAllPdfToImg = document.getElementById('btn-select-all-pdf-to-img');
const btnDeselectAllPdfToImg = document.getElementById('btn-deselect-all-pdf-to-img');
const btnClearPdfToImg = document.getElementById('btn-clear-pdf-to-img');
const btnRunPdfToImg = document.getElementById('btn-run-pdf-to-img');

setupDragAndDrop(dropZonePdfToImg, fileInputPdfToImg, handlePdfToImgFile);
setupDragAndDrop(workspacePdfToImg, fileInputPdfToImg, handlePdfToImgFile);

async function handlePdfToImgFile(files) {
  const file = Array.from(files)[0];
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please select a valid PDF file.', 'error');
    return;
  }

  showProgress('Loading PDF', 'Reading document pages for preview...', 10);

  try {
    const arrayBuffer = await loadSafePdfBuffer(file);
    state.pdfToImg.file = {
      name: file.name,
      size: file.size,
      data: arrayBuffer
    };

    const pdf = await loadPdfJsDocument(arrayBuffer);
    const pageCount = pdf.numPages;

    state.pdfToImg.pages = [];
    gridPdfToImg.innerHTML = '';

    for (let i = 1; i <= pageCount; i++) {
      state.pdfToImg.pages.push({ pageNum: i, selected: true });

      // Create card
      const card = document.createElement('div');
      card.className = 'page-item-card selected';
      card.setAttribute('data-page', i);
      card.innerHTML = `
        <canvas class="page-item-canvas"></canvas>
        <div class="page-selection-overlay">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="page-number-badge">Page ${i}</div>
      `;

      card.addEventListener('click', () => {
        const isSelected = card.classList.toggle('selected');
        state.pdfToImg.pages[i - 1].selected = isSelected;
        updateSelectedPagesCount();
      });

      gridPdfToImg.appendChild(card);

      // Render thumbnail asynchronously
      renderThumbnail(pdf, i, card.querySelector('canvas'));
      
      updateProgress(10 + Math.round((i / pageCount) * 80), `Loading previews... Page ${i}/${pageCount}`);
    }

    document.getElementById('pdf-to-img-out-prefix').value = file.name.replace(/\.[^/.]+$/, "") + "_page";

    updateSelectedPagesCount();
    dropZonePdfToImg.classList.add('hidden');
    workspacePdfToImg.classList.remove('hidden');
    hideProgress();
    showToast('PDF loaded successfully.');
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast('Failed to load PDF.', 'error');
  }
}

async function renderThumbnail(pdf, pageNum, canvas, scale = 0.8) {
  try {
    if (pdf.destroyed) return;
    const page = await pdf.getPage(pageNum);
    if (pdf.destroyed) return;
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
  } catch (err) {
    if (pdf.destroyed || err?.name === 'RenderingCancelledException' || String(err?.message || '').includes('Worker was destroyed')) {
      return;
    }
    console.error(`Failed to render thumbnail for page ${pageNum}:`, err);
  }
}

function updateSelectedPagesCount(skipInputUpdate = false) {
  const selectedCount = state.pdfToImg.pages.filter(p => p.selected).length;
  countPdfToImg.textContent = selectedCount;

  if (!skipInputUpdate) {
    const pages = state.pdfToImg.pages;
    const selected = pages.filter(p => p.selected).map(p => p.pageNum);
    const inputField = document.getElementById('pdf-to-img-ranges');
    if (inputField) inputField.value = formatPageRanges(selected, pages.length, true);
  }
}

const rangesInputPdfToImg = document.getElementById('pdf-to-img-ranges');
if (rangesInputPdfToImg) {
  rangesInputPdfToImg.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    if (!state.pdfToImg.pages || state.pdfToImg.pages.length === 0) return;
    const maxPages = state.pdfToImg.pages.length;
    
    if (val === 'all') {
      state.pdfToImg.pages.forEach(p => p.selected = true);
    } else if (val === '') {
      state.pdfToImg.pages.forEach(p => p.selected = false);
    } else {
      try {
        const parsedIndices = parsePageRanges(e.target.value, maxPages);
        state.pdfToImg.pages.forEach((p, idx) => {
          p.selected = parsedIndices.includes(idx);
        });
      } catch (err) {
         // Silently ignore while typing invalid characters (like trailing hyphen)
         return;
      }
    }

    // Visually update the cards without breaking typing
    document.querySelectorAll('#grid-pdf-to-img .page-item-card').forEach((card, idx) => {
      if (state.pdfToImg.pages[idx].selected) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    updateSelectedPagesCount(true);
  });
}


btnSelectAllPdfToImg.addEventListener('click', () => {
  state.pdfToImg.pages.forEach(p => p.selected = true);
  document.querySelectorAll('#grid-pdf-to-img .page-item-card').forEach(card => card.classList.add('selected'));
  updateSelectedPagesCount();
});

btnDeselectAllPdfToImg.addEventListener('click', () => {
  state.pdfToImg.pages.forEach(p => p.selected = false);
  document.querySelectorAll('#grid-pdf-to-img .page-item-card').forEach(card => card.classList.remove('selected'));
  updateSelectedPagesCount();
});

btnClearPdfToImg.addEventListener('click', () => {
  state.pdfToImg.file = null;
  state.pdfToImg.pages = [];
  gridPdfToImg.innerHTML = '';
  countPdfToImg.textContent = '0';
  workspacePdfToImg.classList.add('hidden');
  dropZonePdfToImg.classList.remove('hidden');
});

btnRunPdfToImg.addEventListener('click', async () => {
  if (!state.pdfToImg.file) return;

  const selectedPages = state.pdfToImg.pages.filter(p => p.selected);
  if (selectedPages.length === 0) {
    showToast('Please select at least one page to convert.', 'error');
    return;
  }

  const folderDialogResult = await window.api.showDirectoryDialog({
    title: 'Select Destination Folder'
  });

  if (folderDialogResult.canceled || !folderDialogResult.filePaths || folderDialogResult.filePaths.length === 0) {
    return;
  }

  const folderPath = folderDialogResult.filePaths[0];
  const format = document.getElementById('pdf-to-img-format').value;
  const scale = parseFloat(document.getElementById('pdf-to-img-resolution').value);
  const prefix = sanitizeFilename(document.getElementById('pdf-to-img-out-prefix').value, 'page');

  showProgress('Converting PDF', 'Initializing converter...', 10);

  try {
    const pdf = await loadPdfJsDocument(state.pdfToImg.file.data);
    const totalSelected = selectedPages.length;

    for (let i = 0; i < totalSelected; i++) {
      const pageInfo = selectedPages[i];
      const pageNum = pageInfo.pageNum;

      updateProgress(10 + Math.round((i / totalSelected) * 80), `Rendering page ${pageNum} (${i+1}/${totalSelected})...`);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (format === 'jpeg') {
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: context, viewport: viewport }).promise;

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const imgDataUrl = canvas.toDataURL(mimeType, format === 'jpeg' ? 0.92 : undefined);
      const imgBase64 = imgDataUrl.split(',')[1];
      const imgBuffer = Uint8Array.from(atob(imgBase64), c => c.charCodeAt(0)).buffer;

      const ext = format;
      const fileName = `${prefix}_${pageNum}.${ext}`;
      const fullPath = `${folderPath}\\${fileName}`;

      await window.api.saveFile({
        filePath: fullPath,
        arrayBuffer: imgBuffer
      });
    }

    hideProgress();
    showToast(`Successfully converted ${totalSelected} page(s) to images!`);
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast(`Conversion failed: ${err.message}`, 'error');
  }
});


// Theme Toggle Logic
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeText = themeToggleBtn.querySelector('.theme-text');

if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light-theme');
  themeText.textContent = 'Dark Mode';
}

themeToggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  themeText.textContent = isLight ? 'Dark Mode' : 'Light Mode';
});
