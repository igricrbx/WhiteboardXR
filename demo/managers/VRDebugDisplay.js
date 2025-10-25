import * as THREE from 'three';

/**
 * Displays debug information in VR as 3D text panels
 */
export class VRDebugDisplay {
    constructor(scene) {
        this.scene = scene;
        this.textMeshes = [];
        this.panel = null;
        this.debugInfo = {};
        
        this.createDebugPanel();
    }

    createDebugPanel() {
        // Create a panel above the whiteboard (whiteboard is at 0, 1.5, 3.5)
        const panelWidth = 2.5;
        const panelHeight = 3.0;
        
        // Panel geometry
        const panelGeometry = new THREE.PlaneGeometry(panelWidth, panelHeight);
        const panelMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        this.panel = new THREE.Mesh(panelGeometry, panelMaterial);
        this.panel.position.set(0, 3.8, 3.3); // Above whiteboard, slightly forward
        this.panel.rotation.y = Math.PI; // Rotate 180 degrees to face player
        this.scene.add(this.panel);
        
        // Create canvas for text rendering
        this.canvas = document.createElement('canvas');
        this.canvas.width = 2048;
        this.canvas.height = 2560; // Increased to match taller panel (3.0 / 2.5 ratio)
        this.ctx = this.canvas.getContext('2d');
        
        // Create texture from canvas
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.needsUpdate = true;
        
        // Create mesh with canvas texture
        const textMaterial = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const textMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(panelWidth - 0.1, panelHeight - 0.1),
            textMaterial
        );
        textMesh.position.z = 0.01; // Slightly in front of panel
        this.panel.add(textMesh);
        
        this.textMesh = textMesh;
    }

    updateDebugInfo(camera, dolly, rightInput, leftInput) {
        // Get camera world position and rotation
        const cameraWorldPos = new THREE.Vector3();
        camera.getWorldPosition(cameraWorldPos);
        
        const cameraWorldRot = new THREE.Euler();
        cameraWorldRot.setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
        
        // Get dolly position and rotation
        const dollyPos = dolly.position;
        const dollyRot = dolly.rotation;
        
        // Get camera local position (relative to dolly)
        const cameraLocalPos = new THREE.Vector3();
        dollyPos.sub(dollyPos); // Make copy to avoid modifying original
        camera.getWorldPosition(cameraLocalPos);
        dolly.worldToLocal(cameraLocalPos);
        
        // Calculate distance from dolly to camera
        const distance = new THREE.Vector3()
            .subVectors(cameraWorldPos, dollyPos)
            .length();
        
        this.debugInfo = {
            cameraWorldPos,
            cameraWorldRot,
            cameraLocalPos,
            dollyPos,
            dollyRot,
            distance,
            rightInput,
            leftInput
        };
        
        this.render();
    }

    render() {
        const ctx = this.ctx;
        const info = this.debugInfo;
        
        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set text style
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 48px monospace';
        
        let y = 80;
        const lineHeight = 70;
        
        // Helper to format numbers
        const fmt = (n) => n.toFixed(3);
        
        // Camera World Position
        ctx.fillText('CAMERA WORLD POS:', 40, y);
        y += lineHeight;
        ctx.fillText(`  X: ${fmt(info.cameraWorldPos?.x || 0)}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  Y: ${fmt(info.cameraWorldPos?.y || 0)}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  Z: ${fmt(info.cameraWorldPos?.z || 0)}`, 40, y);
        y += lineHeight * 1.3;
        
        // Camera World Rotation
        ctx.fillText('CAMERA WORLD ROT (deg):', 40, y);
        y += lineHeight;
        ctx.fillText(`  X: ${fmt((info.cameraWorldRot?.x || 0) * 180 / Math.PI)}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  Y: ${fmt((info.cameraWorldRot?.y || 0) * 180 / Math.PI)}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  Z: ${fmt((info.cameraWorldRot?.z || 0) * 180 / Math.PI)}`, 40, y);
        y += lineHeight * 1.3;
        
        // Dolly Position
        ctx.fillText('DOLLY POS:', 40, y);
        y += lineHeight;
        ctx.fillText(`  X: ${fmt(info.dollyPos?.x || 0)}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  Y: ${fmt(info.dollyPos?.y || 0)}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  Z: ${fmt(info.dollyPos?.z || 0)}`, 40, y);
        y += lineHeight * 1.3;
        
        // Dolly Rotation
        ctx.fillText('DOLLY ROT (deg):', 40, y);
        y += lineHeight;
        ctx.fillText(`  Y: ${fmt((info.dollyRot?.y || 0) * 180 / Math.PI)}`, 40, y);
        y += lineHeight * 1.3;
        
        // Camera Local Position
        ctx.fillText('CAM LOCAL (from dolly):', 40, y);
        y += lineHeight;
        ctx.fillText(`  X: ${fmt(info.cameraLocalPos?.x || 0)}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  Z: ${fmt(info.cameraLocalPos?.z || 0)}`, 40, y);
        y += lineHeight * 1.3;
        
        // Distance
        ctx.fillText(`CAM-DOLLY DIST: ${fmt(info.distance || 0)}m`, 40, y);
        y += lineHeight * 1.5;
        
        // Controller inputs
        ctx.fillText('RIGHT STICK (Move):', 40, y);
        y += lineHeight;
        ctx.fillText(`  Hand: ${info.rightInput?.hand || 'unknown'}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  X: ${fmt(info.rightInput?.thumbstick?.x || 0)}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  Y: ${fmt(info.rightInput?.thumbstick?.y || 0)}`, 40, y);
        y += lineHeight * 1.3;
        
        ctx.fillText('LEFT STICK (Rotate):', 40, y);
        y += lineHeight;
        ctx.fillText(`  Hand: ${info.leftInput?.hand || 'unknown'}`, 40, y);
        y += lineHeight;
        ctx.fillText(`  X: ${fmt(info.leftInput?.thumbstick?.x || 0)}`, 40, y);
        
        // Update texture
        this.texture.needsUpdate = true;
    }

    setVisible(visible) {
        this.panel.visible = visible;
    }

    dispose() {
        if (this.panel) {
            this.scene.remove(this.panel);
            this.panel.geometry.dispose();
            this.panel.material.dispose();
            if (this.textMesh) {
                this.textMesh.geometry.dispose();
                this.textMesh.material.dispose();
            }
        }
        if (this.texture) {
            this.texture.dispose();
        }
    }
}
