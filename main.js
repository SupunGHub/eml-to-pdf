const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { simpleParser } = require('mailparser');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('fontkit');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  // Send initial theme state
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('theme-updated', nativeTheme.shouldUseDarkColors);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

nativeTheme.on('updated', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
        window.webContents.send('theme-updated', nativeTheme.shouldUseDarkColors);
    }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('set-theme', (event, theme) => {
    nativeTheme.themeSource = theme;
});

ipcMain.handle('open-eml', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'EML Files', extensions: ['eml'] }],
  });

  if (!filePaths || filePaths.length === 0) {
    return [];
  }

  const filesWithSubjects = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const mail = await simpleParser(content);
        return {
          path: filePath,
          subject: mail.subject || 'Untitled',
        };
      } catch (e) {
        console.error(`Could not parse ${filePath}:`, e);
        return {
          path: filePath,
          subject: 'Error reading subject',
        };
      }
    })
  );

  return filesWithSubjects;
});

ipcMain.handle('select-output-dir', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (filePaths && filePaths.length > 0) {
    return filePaths[0];
  }
  return null;
});

const findUniquePath = async (proposedPath) => {
  let finalPath = proposedPath;
  let counter = 1;
  const extension = path.extname(proposedPath);
  const baseName = path.basename(proposedPath, extension);

  while (true) {
    try {
      await fs.access(finalPath);
      finalPath = path.join(path.dirname(proposedPath), `${baseName} (${counter})${extension}`);
      counter++;
    } catch (e) {
      return finalPath;
    }
  }
};

ipcMain.handle('convert-batch', async (event, { emlFiles, outputDir, categorize }) => {
    if (!emlFiles || emlFiles.length === 0 || !outputDir) {
        return { success: false, error: 'Invalid input for batch conversion.' };
    }

    let convertedCount = 0;
    const totalFiles = emlFiles.length;

    for (const emlFile of emlFiles) {
        try {
            const emlPath = emlFile.path;
            const emlContent = await fs.readFile(emlPath, 'utf-8');
            const mail = await simpleParser(emlContent);

            const pdfDoc = await PDFDocument.create();
            pdfDoc.registerFontkit(fontkit);

            const fontBytes = await fs.readFile(path.join(__dirname, 'DejaVuSans.ttf'));
            const customFont = await pdfDoc.embedFont(fontBytes);

            let page = pdfDoc.addPage();
            const { width, height } = page.getSize();
            const font = customFont;
            const fontSize = 12;
            let y = height - 40;
            const margin = 50;

            const drawText = (text, options) => {
                if (y < 40) {
                    page = pdfDoc.addPage();
                    y = height - 40;
                }
                try {
                    page.drawText(text, options);
                } catch (e) {
                    console.error(`Could not draw text: ${text}`, e);
                    page.drawText('[unsupported character]', options);
                }
                y -= (options.size || fontSize) + 5;
            };

            drawText(`Subject: ${mail.subject || ''}`, { x: margin, y, size: fontSize, font });
            drawText(`From: ${mail.from?.text || ''}`, { x: margin, y, size: fontSize, font });
            drawText(`To: ${mail.to?.text || ''}`, { x: margin, y, size: fontSize, font });
            drawText(`Date: ${mail.date ? mail.date.toISOString() : ''}`, { x: margin, y, size: fontSize, font });
            y -= 20;

            if (mail.text) {
                const textLines = mail.text.split('\n');
                const maxWidth = width - 2 * margin;

                for (const originalLine of textLines) {
                    if (originalLine.trim() === '') {
                        y -= fontSize + 5;
                        continue;
                    }
                    const words = originalLine.split(' ');
                    let currentLine = '';

                    for (const word of words) {
                        const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
                        if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth) {
                            drawText(currentLine, { x: margin, y, size: fontSize, font });
                            currentLine = word;
                        } else {
                            currentLine = testLine;
                        }
                    }
                    drawText(currentLine, { x: margin, y, size: fontSize, font });
                }
            }

            const sanitizedSubject = emlFile.subject.replace(/[\\/:*?"<>|]/g, '-').substring(0, 150);
            
            let finalOutputDir = outputDir;
            if (categorize && mail.date) {
                const month = (mail.date.getMonth() + 1).toString().padStart(2, '0');
                const year = mail.date.getFullYear();
                const monthFolder = `${year}-${month}`;
                finalOutputDir = path.join(outputDir, monthFolder);
                await fs.mkdir(finalOutputDir, { recursive: true });
            }

            const proposedPath = path.join(finalOutputDir, `${sanitizedSubject}.pdf`);
            const finalPath = await findUniquePath(proposedPath);

            const pdfBytes = await pdfDoc.save();
            await fs.writeFile(finalPath, pdfBytes);

            convertedCount++;
            event.sender.send('conversion-progress', { processed: convertedCount, total: totalFiles, filename: path.basename(finalPath) });
        } catch (error) {
            console.error(`Failed to convert ${emlFile.path}:`, error);
            event.sender.send('conversion-error', { file: emlFile, error: error.message });
        }
    }

    // This ensures the final "complete" message is sent even if some files fail
    if (event.sender) {
        event.sender.send('conversion-complete', { converted: convertedCount, total: totalFiles });
    }

    return { success: true, converted: convertedCount, total: totalFiles };
}); 