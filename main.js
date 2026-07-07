const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'default',
    autoHideMenuBar: true, // Hides the menu bar for a cleaner UI
    backgroundColor: '#0A0F1D' // Sleek background color to prevent flash
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for safe communication with the renderer
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options.title || 'Save PDF File',
    defaultPath: options.defaultPath || 'output.pdf',
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });
  return result;
});

ipcMain.handle('show-directory-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Select Destination Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  return result;
});

ipcMain.handle('save-file', async (event, { filePath, arrayBuffer }) => {
  try {
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);
    return { success: true };
  } catch (error) {
    console.error('Failed to save file:', error);
    return { success: false, error: error.message };
  }
});
