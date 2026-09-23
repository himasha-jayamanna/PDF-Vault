import { compress } from './node_modules/@quicktoolsone/pdf-compress/dist/index.js';
const { decryptPDF, isEncrypted } = window.PDFDecrypt;

// State variables
const state = {
  merge: {
    files: []
  },
  split: {
    file: null,
    mode: 'range' // 'range' or 'all'
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

// Toast Helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
  `;
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

// Add more files listeners
btnAddMoreMerge.addEventListener('click', () => fileInputAddMoreMerge.click());
fileInputAddMoreMerge.addEventListener('change', (e) => handleMergeFiles(e.target.files));

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
    if (dt && dt.files && dt.files.length > 0) {
      const actualFiles = Array.from(dt.files).filter(f => f.name);
      if (actualFiles.length > 0) {
        handler(dt.files);
      }
    }
  });

  input.addEventListener('change', (e) => {
    handler(e.target.files);
  });
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
  btnPreviewMerge.addEventListener('click', async () => {
    if (state.merge.files.length < 1) return;
    
    showProgress('Creating Preview', 'Compiling document in memory...', 20);
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

      updateProgress(90, 'Opening preview viewer...');
      const mergedPdfBytes = await mergedPdf.save();
      const previewResult = await window.api.previewPdf(mergedPdfBytes);

      hideProgress();
      if (!previewResult.success) {
        showToast(`Preview error: ${previewResult.error}`, 'error');
      }
    } catch (err) {
      console.error(err);
      hideProgress();
      showToast(`Preview failed: ${err.message}`, 'error');
    }
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
// 2. PDF SPLIT FEATURE
// ==========================================
const dropZoneSplit = document.getElementById('drop-zone-split');
const fileInputSplit = document.getElementById('file-input-split');
const workspaceSplit = document.getElementById('workspace-split');
const splitFilename = document.getElementById('split-filename');
const splitFilesize = document.getElementById('split-filesize');
const splitPagecount = document.getElementById('split-pagecount');
const modeCards = document.querySelectorAll('.split-mode-selection .mode-card');
const splitSettingsRange = document.getElementById('split-settings-range');
const splitSettingsAll = document.getElementById('split-settings-all');
const btnClearSplit = document.getElementById('btn-clear-split');
const btnRunSplit = document.getElementById('btn-run-split');

setupDragAndDrop(dropZoneSplit, fileInputSplit, handleSplitFile);

async function handleSplitFile(files) {
  const pdfFile = Array.from(files)[0];
  if (!pdfFile || !pdfFile.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please select a valid PDF file.', 'error');
    return;
  }

  showProgress('Loading PDF', 'Reading document properties...', 20);

  try {
    const arrayBuffer = await loadSafePdfBuffer(pdfFile);
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    state.split.file = {
      name: pdfFile.name,
      size: pdfFile.size,
      data: arrayBuffer,
      pageCount: pageCount
    };

    splitFilename.textContent = pdfFile.name;
    splitFilesize.textContent = formatBytes(pdfFile.size);
    splitPagecount.textContent = pageCount;
    document.getElementById('split-out-filename').value = pdfFile.name.replace(/\.[^/.]+$/, "") + "_split";

    dropZoneSplit.classList.add('hidden');
    workspaceSplit.classList.remove('hidden');
    hideProgress();
    showToast('PDF loaded successfully.');
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast('Failed to load PDF. Might be password protected.', 'error');
  }
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
    } else {
      splitSettingsRange.classList.add('hidden');
      splitSettingsAll.classList.remove('hidden');
    }
  });
});

btnClearSplit.addEventListener('click', () => {
  state.split.file = null;
  workspaceSplit.classList.add('hidden');
  dropZoneSplit.classList.remove('hidden');
});

// Parse user range input (e.g. 1-3, 5, 8-10) to page index array (0-based)
function parsePageRanges(rangeStr, maxPages) {
  const indices = [];
  const parts = rangeStr.replace(/\s+/g, '').split(',');

  for (const part of parts) {
    if (part.includes('-')) {
      const bounds = part.split('-');
      const start = parseInt(bounds[0], 10);
      const end = parseInt(bounds[1], 10);

      if (isNaN(start) || isNaN(end) || start < 1 || end < 1 || start > maxPages || end > maxPages) {
        throw new Error(`Invalid range: ${part}`);
      }

      const min = Math.min(start, end);
      const max = Math.max(start, end);

      for (let i = min; i <= max; i++) {
        indices.push(i - 1); // convert to 0-based
      }
    } else {
      const page = parseInt(part, 10);
      if (isNaN(page) || page < 1 || page > maxPages) {
        throw new Error(`Invalid page number: ${part}`);
      }
      indices.push(page - 1);
    }
  }

  // Deduplicate and sort indices
  return Array.from(new Set(indices)).sort((a, b) => a - b);
}

btnRunSplit.addEventListener('click', async () => {
  if (!state.split.file) return;

  const baseName = document.getElementById('split-out-filename').value.trim();
  const { PDFDocument } = PDFLib;

  if (state.split.mode === 'range') {
    const rangeInput = document.getElementById('split-ranges').value.trim();
    if (!rangeInput) {
      showToast('Please enter a page range.', 'error');
      return;
    }

    let targetIndices;
    try {
      targetIndices = parsePageRanges(rangeInput, state.split.file.pageCount);
    } catch (e) {
      showToast(e.message, 'error');
      return;
    }

    const defaultFilename = `${baseName || 'extracted_pages'}.pdf`;
    const dialogResult = await window.api.showSaveDialog({
      title: 'Save Extracted Pages',
      defaultPath: defaultFilename
    });

    if (dialogResult.canceled || !dialogResult.filePath) return;

    showProgress('Extracting Pages', 'Processing locally in memory...', 30);

    try {
      const srcPdf = await PDFDocument.load(state.split.file.data, { ignoreEncryption: true });
      const destPdf = await PDFDocument.create();

      const copiedPages = await destPdf.copyPages(srcPdf, targetIndices);
      copiedPages.forEach(page => destPdf.addPage(page));

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
    // Mode: Split All Pages
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

      for (let i = 0; i < totalPages; i++) {
        const progress = 10 + Math.round((i / totalPages) * 80);
        updateProgress(progress, `Saving page ${i + 1} of ${totalPages}...`);

        const singlePagePdf = await PDFDocument.create();
        const [copiedPage] = await singlePagePdf.copyPages(srcPdf, [i]);
        singlePagePdf.addPage(copiedPage);

        const bytes = await singlePagePdf.save();
        const singleFileName = `${baseName}_page_${i + 1}.pdf`;
        const fullPath = `${folderPath}\\${singleFileName}`;

        await window.api.saveFile({
          filePath: fullPath,
          arrayBuffer: bytes
        });
      }

      hideProgress();
      showToast(`Successfully split into ${totalPages} PDF files in folder!`);
    } catch (err) {
      console.error(err);
      hideProgress();
      showToast(`Failed to split all pages: ${err.message}`, 'error');
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

// Add more images listeners
btnAddMoreImg.addEventListener('click', () => fileInputAddMoreImg.click());
fileInputAddMoreImg.addEventListener('change', (e) => handleImageFiles(e.target.files));

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

  const pageSizeSetting = document.getElementById('img-page-size').value;
  const orientationSetting = document.getElementById('img-orientation').value;
  const marginSetting = document.getElementById('img-margin').value;

  showProgress('Creating PDF', 'Embedding images...', 10);

  try {
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    // Map margin
    let margin = 0;
    if (marginSetting === 'small') margin = 20;
    if (marginSetting === 'large') margin = 40;

    for (let i = 0; i < state.imgToPdf.files.length; i++) {
      const imgFile = state.imgToPdf.files[i];
      updateProgress(10 + Math.round((i / state.imgToPdf.files.length) * 70), `Processing image ${i + 1}...`);

      // Embed image based on mime-type
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
        // Fit to image sizes directly
        pageWidth = imgWidth + margin * 2;
        pageHeight = imgHeight + margin * 2;
      } else {
        // Standard A4 or US Letter sizes
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

      // Calculate placement dimensions (preserving aspect ratio)
      const maxDrawWidth = pageWidth - margin * 2;
      const maxDrawHeight = pageHeight - margin * 2;

      let drawWidth = imgWidth;
      let drawHeight = imgHeight;

      // Scale to fit available width and height
      const scale = Math.min(maxDrawWidth / imgWidth, maxDrawHeight / imgHeight);
      drawWidth = imgWidth * scale;
      drawHeight = imgHeight * scale;

      // Center the image on the page
      const x = margin + (maxDrawWidth - drawWidth) / 2;
      const y = margin + (maxDrawHeight - drawHeight) / 2;

      page.drawImage(embeddedImage, {
        x,
        y,
        width: drawWidth,
        height: drawHeight
      });
    }

    updateProgress(85, 'Compiling and saving...');
    const pdfBytes = await pdfDoc.save();

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

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
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

async function renderThumbnail(pdf, pageNum, canvas) {
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.8 });
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
  } catch (err) {
    console.error(`Failed to render thumbnail for page ${pageNum}:`, err);
  }
}

function updateSelectedPagesCount(skipInputUpdate = false) {
  const selectedCount = state.pdfToImg.pages.filter(p => p.selected).length;
  countPdfToImg.textContent = selectedCount;

  if (!skipInputUpdate) {
    const pages = state.pdfToImg.pages;
    const selected = pages.filter(p => p.selected).map(p => p.pageNum).sort((a, b) => a - b);
    let str = '';
    if (selected.length === 0) str = '';
    else if (selected.length === pages.length) str = 'All';
    else {
      let ranges = [];
      let start = selected[0];
      let end = selected[0];
      for (let i = 1; i < selected.length; i++) {
        if (selected[i] === end + 1) {
          end = selected[i];
        } else {
          ranges.push(start === end ? `${start}` : `${start}-${end}`);
          start = selected[i];
          end = selected[i];
        }
      }
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      str = ranges.join(', ');
    }
    const inputField = document.getElementById('pdf-to-img-ranges');
    if (inputField) inputField.value = str;
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
  const prefix = document.getElementById('pdf-to-img-out-prefix').value.trim() || 'page';

  showProgress('Converting PDF', 'Initializing converter...', 10);

  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(state.pdfToImg.file.data.slice(0)) }).promise;
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
