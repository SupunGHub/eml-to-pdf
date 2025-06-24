document.addEventListener('DOMContentLoaded', () => {
    const steps = document.querySelectorAll('.step');
    let currentStep = 0;

    const ui = {
        // Theme
        themeSelect: document.getElementById('theme-select'),
        // Step 1
        selectEmlBtn: document.getElementById('select-eml-btn'),
        fileCount: document.getElementById('file-count'),
        nextStep1Btn: document.getElementById('next-step-1'),
        // Step 2
        selectOutputBtn: document.getElementById('select-output-btn'),
        outputDirDisplay: document.getElementById('output-dir-display'),
        categorizeSwitch: document.getElementById('categorize-switch'),
        prevStep2Btn: document.getElementById('prev-step-2'),
        convertBtn: document.getElementById('convert-btn'),
        // Step 3
        progressBar: document.getElementById('progress-bar'),
        status: document.getElementById('status'),
        summaryLog: document.getElementById('summary-log'),
        startOverBtn: document.getElementById('start-over-btn'),
    };

    let selectedEmlFiles = [];
    let outputDir = '';

    function showStep(index) {
        steps.forEach((step, i) => {
            step.classList.toggle('active', i === index);
        });
        currentStep = index;
    }

    function updateStep2ButtonState() {
        ui.convertBtn.disabled = !outputDir;
    }

    // Step 1 Logic
    ui.selectEmlBtn.addEventListener('click', async () => {
        selectedEmlFiles = await window.electronAPI.openEml();
        if (selectedEmlFiles.length > 0) {
            ui.fileCount.textContent = `${selectedEmlFiles.length} file(s) selected.`;
            ui.nextStep1Btn.disabled = false;
        } else {
            ui.fileCount.textContent = '0 files selected.';
            ui.nextStep1Btn.disabled = true;
        }
    });

    ui.nextStep1Btn.addEventListener('click', () => showStep(1));

    // Step 2 Logic
    ui.prevStep2Btn.addEventListener('click', () => showStep(0));

    ui.selectOutputBtn.addEventListener('click', async () => {
        outputDir = await window.electronAPI.selectOutputDir();
        if (outputDir) {
            ui.outputDirDisplay.textContent = `Output: ${outputDir}`;
        } else {
            ui.outputDirDisplay.textContent = 'No folder selected';
        }
        updateStep2ButtonState();
    });

    ui.convertBtn.addEventListener('click', async () => {
        showStep(2);
        ui.status.textContent = 'Starting conversion...';

        const categorize = ui.categorizeSwitch.checked;
        await window.electronAPI.convertBatch({ emlFiles: selectedEmlFiles, outputDir, categorize });
    });

    // Step 3 Logic
    ui.startOverBtn.addEventListener('click', () => {
        // Reset state
        selectedEmlFiles = [];
        outputDir = '';
        ui.fileCount.textContent = '0 files selected.';
        ui.nextStep1Btn.disabled = true;
        ui.outputDirDisplay.textContent = 'No folder selected';
        ui.convertBtn.disabled = true;
        ui.categorizeSwitch.checked = false;
        ui.summaryLog.innerHTML = '';
        ui.status.textContent = '';
        ui.progressBar.value = 0;
        ui.startOverBtn.style.display = 'none';
        showStep(0);
    });

    // IPC Listeners
    window.electronAPI.onThemeUpdated((shouldUseDarkColors) => {
        document.body.classList.toggle('dark', shouldUseDarkColors);
    });

    window.electronAPI.onConversionProgress(({ processed, total, filename }) => {
        const percentage = Math.round((processed / total) * 100);
        ui.progressBar.value = percentage;
        ui.status.textContent = `Converting... ${processed} of ${total}`;
        
        const logEntry = document.createElement('p');
        logEntry.textContent = `✅ Converted: ${filename}`;
        logEntry.classList.add('log-success');
        ui.summaryLog.appendChild(logEntry);
        ui.summaryLog.scrollTop = ui.summaryLog.scrollHeight; // Auto-scroll

        if (processed === total) {
            ui.status.textContent = `Conversion complete! Processed ${total} files.`;
            ui.startOverBtn.style.display = 'block';
        }
    });

    window.electronAPI.onConversionError(({ file, error }) => {
        console.error(`Error on file ${file.path}: ${error}`);
        const logEntry = document.createElement('p');
        logEntry.textContent = `❌ Failed: ${file.subject} - ${error}`;
        logEntry.classList.add('log-error');
        ui.summaryLog.appendChild(logEntry);
        ui.summaryLog.scrollTop = ui.summaryLog.scrollHeight; // Auto-scroll
    });

    window.electronAPI.onConversionComplete(({ converted, total }) => {
        ui.status.textContent = `Conversion complete! Processed ${total} files.`;
        ui.startOverBtn.style.display = 'block';
    });

    // Theme Switcher Logic
    ui.themeSelect.addEventListener('change', (e) => {
        window.electronAPI.setTheme(e.target.value);
    });

    // Initialize
    showStep(0);
}); 