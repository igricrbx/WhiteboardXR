import * as THREE from 'three';

/**
 * Manages UI controls (desktop-specific interface)
 * This can be disabled/replaced when running in XR mode
 */
export class UIController {
    constructor() {
        this.penWidth = 0.01;
        this.penColor = new THREE.Color(0x000000);
        this.debugMode = false;
        this.currentTool = 'pen'; // 'pen' or 'select'
        
        this.callbacks = {
            onPenWidthChange: null,
            onPenColorChange: null,
            onDebugModeChange: null,
            onToolChange: null,
            onImageImport: null
        };
    }

    /**
     * Setup all UI control event listeners
     */
    setupControls() {
        this.setupPenWidthControl();
        this.setupColorPalette();
        this.setupDebugButton();
        this.setupToolButtons();
        this.setupImageImport();
    }

    /**
     * Setup pen width slider
     */
    setupPenWidthControl() {
        const penWidthSlider = document.getElementById('pen-width-slider');
        const penWidthValue = document.getElementById('pen-width-value');

        if (!penWidthSlider || !penWidthValue) return;

        penWidthSlider.addEventListener('input', (e) => {
            this.penWidth = parseFloat(e.target.value);
            penWidthValue.textContent = this.penWidth.toFixed(3);
            
            if (this.callbacks.onPenWidthChange) {
                this.callbacks.onPenWidthChange(this.penWidth);
            }
        });
    }

    /**
     * Setup color palette
     */
    setupColorPalette() {
        const colorSwatches = document.querySelectorAll('.color-swatch');
        
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                // Remove selected class from all swatches
                colorSwatches.forEach(s => s.classList.remove('selected'));
                
                // Add selected class to clicked swatch
                swatch.classList.add('selected');
                
                // Update pen color
                const colorHex = swatch.getAttribute('data-color');
                this.penColor = new THREE.Color(colorHex);
                
                // Automatically switch to pen mode
                this.setTool('pen');
                
                if (this.callbacks.onPenColorChange) {
                    this.callbacks.onPenColorChange(this.penColor);
                }
            });
        });
    }

    /**
     * Setup debug mode button
     */
    setupDebugButton() {
        const debugButton = document.getElementById('debug-button');
        
        if (!debugButton) return;

        debugButton.addEventListener('click', () => {
            this.debugMode = !this.debugMode;
            debugButton.textContent = `Debug Mode: ${this.debugMode ? 'ON' : 'OFF'}`;
            debugButton.classList.toggle('active', this.debugMode);
            
            if (this.callbacks.onDebugModeChange) {
                this.callbacks.onDebugModeChange(this.debugMode);
            }
        });
    }

    /**
     * Setup tool buttons (pen/select)
     */
    setupToolButtons() {
        const penToolButton = document.getElementById('pen-tool');
        const selectToolButton = document.getElementById('select-tool');
        
        if (!penToolButton || !selectToolButton) return;

        penToolButton.addEventListener('click', () => {
            this.currentTool = 'pen';
            penToolButton.classList.add('active');
            selectToolButton.classList.remove('active');
            
            if (this.callbacks.onToolChange) {
                this.callbacks.onToolChange('pen');
            }
        });
        
        selectToolButton.addEventListener('click', () => {
            this.currentTool = 'select';
            selectToolButton.classList.add('active');
            penToolButton.classList.remove('active');
            
            if (this.callbacks.onToolChange) {
                this.callbacks.onToolChange('select');
            }
        });
    }

    /**
     * Update stroke count display
     */
    updateStrokeCount(count) {
        const strokeCountEl = document.getElementById('stroke-count');
        if (strokeCountEl) {
            strokeCountEl.textContent = count;
        }
    }

    /**
     * Update FPS display
     */
    updateFPS(fps) {
        const fpsEl = document.getElementById('fps');
        if (fpsEl) {
            fpsEl.textContent = fps;
        }
    }

    /**
     * Set callback for pen width changes
     */
    onPenWidthChange(callback) {
        this.callbacks.onPenWidthChange = callback;
    }

    /**
     * Set callback for pen color changes
     */
    onPenColorChange(callback) {
        this.callbacks.onPenColorChange = callback;
    }

    /**
     * Set callback for debug mode changes
     */
    onDebugModeChange(callback) {
        this.callbacks.onDebugModeChange = callback;
    }
    /**
     * Set callback for tool changes
     */
    onToolChange(callback) {
        this.callbacks.onToolChange = callback;
    }
    
    /**
     * Programmatically set the current tool
     */
    setTool(tool) {
        if (tool !== 'pen' && tool !== 'select') return;
        
        this.currentTool = tool;
        
        const penToolButton = document.getElementById('pen-tool');
        const selectToolButton = document.getElementById('select-tool');
        
        if (penToolButton && selectToolButton) {
            if (tool === 'pen') {
                penToolButton.classList.add('active');
                selectToolButton.classList.remove('active');
            } else {
                selectToolButton.classList.add('active');
                penToolButton.classList.remove('active');
            }
        }
        
        if (this.callbacks.onToolChange) {
            this.callbacks.onToolChange(tool);
        }
    }

    /**
     * Setup image import button
     */
    setupImageImport() {
        const importButton = document.getElementById('import-image-button');
        const fileInput = document.getElementById('image-file-input');
        
        if (!importButton || !fileInput) return;

        // Click button to trigger file input
        importButton.addEventListener('click', () => {
            fileInput.click();
        });

        // Handle file selection
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && this.callbacks.onImageImport) {
                this.callbacks.onImageImport(file);
            }
            // Reset input so same file can be selected again
            fileInput.value = '';
        });
    }

    /**
     * Set callback for image import
     */
    onImageImport(callback) {
        this.callbacks.onImageImport = callback;
    }

    /**
     * Get current pen settings
     */
    getPenSettings() {
        return {
            width: this.penWidth,
            color: this.penColor.clone(),
            debugMode: this.debugMode
        };
    }

    /**
     * Get current tool
     */
    getCurrentTool() {
        return this.currentTool;
    }
}
