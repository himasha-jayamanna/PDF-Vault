# PDF Vault 🛠️

PDF Vault is a secure, 100% offline desktop application designed to perform essential PDF manipulations entirely in memory on your local machine. Developed with privacy as the core priority, your sensitive documents never leave your computer.

## Features

- **Merge PDFs**: Select multiple PDF documents, view their individual page counts, and seamlessly drag-and-drop elements around to adjust their sequence before compiling them into a single merged PDF.
- **Images to PDF**: Convert JPG and PNG images into a clean PDF document. Features a smart visual grid layout where images can be intuitively re-ordered via HTML5 drag-and-drop.
- **Split PDF**: Extract specific page ranges (e.g., `1-3, 5`) or separate every single page into separate files.
- **Compress PDF**: Optimize your PDF files using local smart image re-compression presets without losing vector text clarity or searchability.
- **PDF to Image**: Convert selected pages of a PDF document into high-fidelity image formats (PNG/JPEG). Enjoy a visual grid selection UI combined with smart textual range inputs.
- **Smart Decryption Engine 🔓**: Easily merge or convert "locked" / permission-restricted files. PDF Vault automatically unbinds read/modify restrictions silently in the background.
- **Light & Dark Themes**: Modern glassmorphic user interface paired with premium typography (Poppins & Nunito) with instant Light/Dark mode toggling.

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

### 2. Packaging Setup Installers (`.exe` & `.msi`)
This command packages the final application for end-users. It generates both an `.exe` for standard installations and an `.msi` file suitable for silent deployments via IT infrastructure.
```bash
npm run package
```
This generates the installers `PDF Vault Setup <version>.exe` and `PDF Vault Setup <version>.msi` in the `dist/` directory.

---

## Technical Architecture

- **Shell**: Electron Framework (v31.x)
- **PDF Manipulation Engine**: `pdf-lib` & `pdfjs-dist` (pure JavaScript PDF parser and writer)
- **Decryption**: Built-in `@pdfsmaller/pdf-decrypt` capability
- **Compressor**: `@quicktoolsone/pdf-compress` (client-side image XObject re-compression)
- **UI Framework**: Vanilla HTML5, CSS3 Variables, ES6 JavaScript
- **Security**: Context Isolation enabled, sandboxed renderer process (no remote Node integration in client UI).

---

## License

This project is licensed under the [MIT License](LICENSE). Feel free to use and distribute it across your organization.
