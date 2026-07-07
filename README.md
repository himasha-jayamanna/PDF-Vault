# PDF Vault 🛠️

PDF Vault is a secure, 100% offline desktop application designed to perform essential PDF manipulations entirely in memory on your local machine. Developed with privacy in mind, your sensitive documents never leave your computer.

## Features

- **Merge PDFs**: Select multiple PDF documents, view their individual page counts, drag-and-drop or use navigation buttons to adjust their sequence, and compile them into a single merged PDF.
- **Split PDF**: Extract specific page ranges (e.g., `1-3, 5`) or separate every single page into separate files.
- **Compress PDF**: Optimize your PDF files using local smart image re-compression presets (Recommended, Extreme, or Less Compression) without losing vector text clarity or searchability.
- **PDF to Image**: Convert selected pages of a PDF document into high-fidelity image formats (PNG/JPEG) with three resolution presets: High Quality (150 DPI), Ultra Quality (300 DPI), and Standard Quality (72 DPI).
- **Images to PDF**: Convert JPG and PNG images into a clean PDF document, with custom page size options (A4, Letter, Fit to image), orientation settings (Portrait/Landscape), and page margins.
- **Light & Dark Themes**: Modern glassmorphic user interface with instant Light/Dark mode toggling and local persistent memory.
- **100% Private & Free**: Runs purely client-side. Zero hosting cost, zero usage limits, zero API keys, no internet required.

---

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <your-repository-url>
   cd pdf-vault
   ```

2. **Install Node dependencies**:
   Make sure you have Node.js installed, then run:
   ```bash
   npm install
   ```

3. **Run locally**:
   Launch the desktop window:
   ```bash
   npm start
   ```

---

## Compilation / Building the Executable

### 1. Simple Directory Build (Unpacked App)
Generates the standalone application folders:
```bash
npm run build
```
You can access the unpacked folder at `dist/win-unpacked/` and run `PDF Vault.exe` directly.

### 2. Packaging Setup Installer (`.exe` Installer Setup Wizard)
Before compiling the installer package on Windows, ensure **Developer Mode** is turned on in your Windows Settings (or run your command line shell as **Administrator**):
```bash
npm run package
```
This generates the installation wizard `PDF Vault Setup 1.0.0.exe` in the `dist/` directory.

---

## Technical Architecture

- **Shell**: Electron Framework
- **PDF Manipulation Engine**: `pdf-lib` & `pdfjs-dist` (pure JavaScript PDF parser and writer)
- **Compressor**: `@quicktoolsone/pdf-compress` (client-side image XObject re-compression)
- **UI Framework**: Vanilla HTML5, CSS3 Variables, ES6 JavaScript
- **Security**: Context Isolation enabled, sandboxed renderer process (no remote Node integration in client UI).

---

## License

This project is licensed under the [MIT License](LICENSE). Feel free to use and distribute it across your organization.
