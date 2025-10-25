import * as THREE from 'three';

/**
 * Creates a floating debug display panel in VR for monitoring values
 */
export class VRDebugDisplay {
    constructor(scene) {
        this.scene = scene;
        this.panel = null;
        this.textCanvas = null;
        this.textTexture = null;
        this.debugData = {};
        
        this.createPanel();
    }

    /**
     * Create the debug panel mesh
     */
    createPanel() {
        // Create canvas for text rendering
        this.textCanvas = document.createElement('canvas');
        this.textCanvas.width = 512;
        this.textCanvas.height = 512;
        
        // Create texture from canvas
        this.textTexture = new THREE.CanvasTexture(this.textCanvas);
        this.textTexture.minFilter = THREE.LinearFilter;
        this.textTexture.magFilter = THREE.LinearFilter;
        
        // Create panel geometry (0.5m x 0.5m)
        const geometry = new THREE.PlaneGeometry(0.5, 0.5);
        const material = new THREE.MeshBasicMaterial({
            map: this.textTexture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
        });
        
        this.panel = new THREE.Mesh(geometry, material);
        
        // Position panel to the left and slightly in front of user
        // This assumes user spawns at origin facing +Z
        this.panel.position.set(-1.5, 1.8, 2.5);
        this.panel.rotation.y = Math.PI / 6; // Angle toward user
        
        this.scene.add(this.panel);
        
        // Initial render
        this.updateDisplay();
    }

    /**
     * Update debug data
     */
    setDebugData(data) {
        this.debugData = { ...this.debugData, ...data };
        this.updateDisplay();
    }

    /**
     * Render text to canvas
     */
    updateDisplay() {
        const ctx = this.textCanvas.getContext('2d');
        
        // Clear canvas with semi-transparent black background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, this.textCanvas.width, this.textCanvas.height);
        
        // Draw border
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, this.textCanvas.width - 4, this.textCanvas.height - 4);
        
        // Setup text rendering
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 24px monospace';
        
        // Title
        ctx.fillText('VR DEBUG', 20, 40);
        
        // Draw separator
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, 50);
        ctx.lineTo(this.textCanvas.width - 20, 50);
        ctx.stroke();
        
        // Render debug data
        ctx.font = '20px monospace';
        let y = 80;
        const lineHeight = 28;
        
        for (const [key, value] of Object.entries(this.debugData)) {
            let displayValue = value;
            
            // Format vectors and objects nicely
            if (value && typeof value === 'object') {
                if (value.x !== undefined && value.y !== undefined && value.z !== undefined) {
                    displayValue = `(${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)})`;
                } else if (value.x !== undefined && value.y !== undefined) {
                    displayValue = `(${value.x.toFixed(2)}, ${value.y.toFixed(2)})`;
                } else {
                    displayValue = JSON.stringify(value);
                }
            } else if (typeof value === 'number') {
                displayValue = value.toFixed(2);
            }
            
            ctx.fillText(`${key}: ${displayValue}`, 20, y);
            y += lineHeight;
            
            // Stop if we run out of space
            if (y > this.textCanvas.height - 20) break;
        }
        
        // Update texture
        this.textTexture.needsUpdate = true;
    }

    /**
     * Show the debug panel
     */
    show() {
        if (this.panel) {
            this.panel.visible = true;
        }
    }

    /**
     * Hide the debug panel
     */
    hide() {
        if (this.panel) {
            this.panel.visible = false;
        }
    }

    /**
     * Remove the debug panel from scene
     */
    dispose() {
        if (this.panel) {
            this.scene.remove(this.panel);
            if (this.panel.geometry) this.panel.geometry.dispose();
            if (this.panel.material) this.panel.material.dispose();
            if (this.textTexture) this.textTexture.dispose();
        }
    }

    /**
     * Position the panel relative to a target (e.g., camera or dolly)
     */
    positionRelativeTo(target, offset = new THREE.Vector3(-1.5, 0.1, 1.0)) {
        if (!this.panel || !target) return;
        
        // Position relative to target
        const worldOffset = offset.clone();
        worldOffset.applyQuaternion(target.quaternion);
        
        this.panel.position.copy(target.position).add(worldOffset);
        
        // Face the target
        this.panel.lookAt(target.position);
        this.panel.rotation.y += Math.PI; // Flip to face user
    }
}
