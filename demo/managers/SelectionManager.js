import * as THREE from 'three';

/**
 * Manages stroke selection, selection box, bounding box, and transform handles
 * Handles all visual feedback for selection state
 */
export class SelectionManager {
    constructor(scene) {
        this.scene = scene;
        this.selectedStrokes = [];
        this.selectionBox = null;
        this.transformHandles = [];
        
        // Selection box drawing state
        this.isDrawingSelectionBox = false;
        this.selectionBoxStart = null;
        this.selectionBoxMesh = null;
    }

    /**
     * Select a stroke
     */
    selectStroke(stroke) {
        if (this.selectedStrokes.includes(stroke)) return;
        
        this.selectedStrokes.push(stroke);
        
        // Add outline only for strokes (not images)
        if (stroke.type !== 'image') {
            this.createSelectionOutline(stroke);
        }
        
        // Create/update bounding box for all selected strokes
        this.updateMultiSelectionBox();
        
        console.log('Selected ' + (stroke.type === 'image' ? 'image' : 'stroke'));
    }

    /**
     * Deselect all strokes
     */
    deselectAllStrokes() {
        this.selectedStrokes.forEach(stroke => {
            // Remove outline
            if (stroke.outline) {
                this.scene.remove(stroke.outline);
                stroke.outline.geometry.dispose();
                stroke.outline.material.dispose();
                delete stroke.outline;
            }
        });
        
        // Remove bounding box
        if (this.selectionBox) {
            this.scene.remove(this.selectionBox);
            this.selectionBox.geometry.dispose();
            this.selectionBox.material.dispose();
            this.selectionBox = null;
        }
        
        // Remove transform handles
        this.removeTransformHandles();
        
        this.selectedStrokes = [];
    }

    /**
     * Update selection visuals (outlines and bounding box)
     */
    updateSelectionVisuals() {
        if (this.selectedStrokes.length === 0) return;
        
        // Remove old visuals
        this.selectedStrokes.forEach(stroke => {
            if (stroke.outline) {
                this.scene.remove(stroke.outline);
                stroke.outline.geometry.dispose();
                stroke.outline.material.dispose();
                delete stroke.outline;
            }
        });
        
        if (this.selectionBox) {
            this.scene.remove(this.selectionBox);
            this.selectionBox.geometry.dispose();
            this.selectionBox.material.dispose();
            this.selectionBox = null;
        }
        
        // Recreate visuals
        this.selectedStrokes.forEach(stroke => {
            // Only create outline for strokes, not images
            if (stroke.type !== 'image') {
                this.createSelectionOutline(stroke);
            }
        });
        this.updateMultiSelectionBox();
    }

    /**
     * Create outline for selected stroke
     */
    createSelectionOutline(stroke) {
        const outlineMaterial = new THREE.LineBasicMaterial({
            color: 0x2196F3,
            linewidth: 2,
            transparent: true,  // Enable transparency for renderOrder
            opacity: 1.0,
            depthTest: false  // Always render on top
        });
        
        const points = [];
        stroke.points.forEach(point => {
            points.push(point.clone());
        });
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const outline = new THREE.Line(geometry, outlineMaterial);
        outline.renderOrder = 1000;
        
        this.scene.add(outline);
        stroke.outline = outline;
    }

    /**
     * Update bounding box for multiple selected strokes
     */
    updateMultiSelectionBox() {
        if (this.selectedStrokes.length === 0) return;
        
        // Remove old bounding box
        if (this.selectionBox) {
            this.scene.remove(this.selectionBox);
            this.selectionBox.geometry.dispose();
            this.selectionBox.material.dispose();
            this.selectionBox = null;
        }
        
        // Calculate combined bounding box
        const bounds = this.calculateBounds(this.selectedStrokes);
        
        // Add padding
        const padding = 0.05; // We add padding to accommodate the width of strokes, TODO: make this dynamic based on stroke widths
        bounds.minX -= padding;
        bounds.minY -= padding;
        bounds.maxX += padding;
        bounds.maxY += padding;
        
        // Create box outline
        const boxPoints = [
            new THREE.Vector3(bounds.minX, bounds.minY, 0),
            new THREE.Vector3(bounds.maxX, bounds.minY, 0),
            new THREE.Vector3(bounds.maxX, bounds.maxY, 0),
            new THREE.Vector3(bounds.minX, bounds.maxY, 0),
            new THREE.Vector3(bounds.minX, bounds.minY, 0)
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(boxPoints);
        const material = new THREE.LineBasicMaterial({
            color: 0x2196F3,
            linewidth: 2,
            transparent: true,  // Enable transparency for renderOrder
            opacity: 1.0,
            depthTest: false
        });
        
        this.selectionBox = new THREE.Line(geometry, material);
        this.selectionBox.renderOrder = 1000;
        this.scene.add(this.selectionBox);
        
        // Create transform handles
        this.createTransformHandles(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
    }

    /**
     * Calculate bounding box for strokes
     */
    calculateBounds(strokes) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        strokes.forEach(stroke => {
            stroke.points.forEach(point => {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            });
        });
        
        return { minX, maxX, minY, maxY };
    }

    /**
     * Create transform handles around the bounding box
     */
    createTransformHandles(minX, maxX, minY, maxY) {
        this.removeTransformHandles();
        
        const handleSize = 0.02;
        const handlePositions = [
            { x: minX, y: minY, type: 'corner', dir: 'sw' },
            { x: maxX, y: minY, type: 'corner', dir: 'se' },
            { x: maxX, y: maxY, type: 'corner', dir: 'ne' },
            { x: minX, y: maxY, type: 'corner', dir: 'nw' },
            { x: (minX + maxX) / 2, y: minY, type: 'side', dir: 's' },
            { x: maxX, y: (minY + maxY) / 2, type: 'side', dir: 'e' },
            { x: (minX + maxX) / 2, y: maxY, type: 'side', dir: 'n' },
            { x: minX, y: (minY + maxY) / 2, type: 'side', dir: 'w' }
        ];
        
        handlePositions.forEach(pos => {
            const geometry = new THREE.CircleGeometry(handleSize, 16);
            const material = new THREE.MeshBasicMaterial({
                color: 0xFFFFFF,
                transparent: true,  // Enable transparency for renderOrder
                opacity: 1.0,
                depthTest: false,
                side: THREE.DoubleSide
            });
            
            const handle = new THREE.Mesh(geometry, material);
            handle.position.set(pos.x, pos.y, 0.001);
            handle.renderOrder = 1001;
            handle.userData = { type: pos.type, direction: pos.dir };
            
            // Add border
            const borderGeometry = new THREE.RingGeometry(handleSize * 0.9, handleSize, 16);
            const borderMaterial = new THREE.MeshBasicMaterial({
                color: 0x2196F3,
                transparent: true,  // Enable transparency for renderOrder
                opacity: 1.0,
                depthTest: false,
                side: THREE.DoubleSide
            });
            const border = new THREE.Mesh(borderGeometry, borderMaterial);
            border.position.z = 0.001;
            border.renderOrder = 1002;
            handle.add(border);
            
            this.scene.add(handle);
            this.transformHandles.push(handle);
        });
    }

    /**
     * Remove transform handles
     */
    removeTransformHandles() {
        this.transformHandles.forEach(handle => {
            this.scene.remove(handle);
            handle.geometry.dispose();
            handle.material.dispose();
            if (handle.children.length > 0) {
                handle.children.forEach(child => {
                    child.geometry.dispose();
                    child.material.dispose();
                });
            }
        });
        this.transformHandles = [];
    }

    /**
     * Get handle at world position (for raycasting)
     */
    getHandleAtPosition(raycaster) {
        if (this.transformHandles.length === 0) return null;
        
        const intersects = raycaster.intersectObjects(this.transformHandles, true); // true = check children
        if (intersects.length === 0) return null;
        
        // If we hit a child (border), return the parent handle
        let clickedObject = intersects[0].object;
        if (clickedObject.parent && this.transformHandles.includes(clickedObject.parent)) {
            return clickedObject.parent;
        }
        
        return clickedObject;
    }

    /**
     * Update handle hover effect
     */
    updateHandleHover(hoveredHandle, domElement) {
        this.transformHandles.forEach(handle => {
            if (handle === hoveredHandle) {
                handle.material.color.setHex(0x2196F3);
                domElement.style.cursor = 'pointer';
            } else {
                handle.material.color.setHex(0xFFFFFF);
            }
        });
        
        if (!hoveredHandle) {
            domElement.style.cursor = 'default';
        }
    }

    /**
     * Start drawing selection box
     */
    startSelectionBox(worldPoint) {
        this.isDrawingSelectionBox = true;
        this.selectionBoxStart = worldPoint.clone();
        
        // Create visual selection box with initial points (just a single point, will be updated on mouse move)
        const initialPoints = [
            new THREE.Vector3(worldPoint.x, worldPoint.y, 0),
            new THREE.Vector3(worldPoint.x, worldPoint.y, 0),
            new THREE.Vector3(worldPoint.x, worldPoint.y, 0),
            new THREE.Vector3(worldPoint.x, worldPoint.y, 0),
            new THREE.Vector3(worldPoint.x, worldPoint.y, 0)
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(initialPoints);
        const material = new THREE.LineBasicMaterial({
            color: 0x2196F3,
            linewidth: 1,
            transparent: true,  // Enable transparency for renderOrder
            opacity: 1.0,
            depthTest: false
        });
        
        this.selectionBoxMesh = new THREE.Line(geometry, material);
        this.selectionBoxMesh.renderOrder = 1000;
        this.scene.add(this.selectionBoxMesh);
    }

    /**
     * Update selection box as drawing
     */
    updateSelectionBox(currentPoint) {
        if (!this.isDrawingSelectionBox || !this.selectionBoxStart) return;
        
        // Update selection box geometry
        const boxPoints = [
            new THREE.Vector3(this.selectionBoxStart.x, this.selectionBoxStart.y, 0),
            new THREE.Vector3(currentPoint.x, this.selectionBoxStart.y, 0),
            new THREE.Vector3(currentPoint.x, currentPoint.y, 0),
            new THREE.Vector3(this.selectionBoxStart.x, currentPoint.y, 0),
            new THREE.Vector3(this.selectionBoxStart.x, this.selectionBoxStart.y, 0)
        ];
        
        this.selectionBoxMesh.geometry.setFromPoints(boxPoints);
    }

    /**
     * Finish selection box and return bounds
     */
    finishSelectionBox() {
        if (!this.isDrawingSelectionBox || !this.selectionBoxStart) return null;
        
        // Get final box bounds
        const geometry = this.selectionBoxMesh.geometry;
        const positions = geometry.attributes.position;
        
        let bounds = null;
        if (positions && positions.count > 0) {
            const minX = Math.min(this.selectionBoxStart.x, positions.getX(2));
            const maxX = Math.max(this.selectionBoxStart.x, positions.getX(2));
            const minY = Math.min(this.selectionBoxStart.y, positions.getY(2));
            const maxY = Math.max(this.selectionBoxStart.y, positions.getY(2));
            
            bounds = { minX, maxX, minY, maxY };
        }
        
        // Remove selection box mesh
        if (this.selectionBoxMesh) {
            this.scene.remove(this.selectionBoxMesh);
            this.selectionBoxMesh.geometry.dispose();
            this.selectionBoxMesh.material.dispose();
            this.selectionBoxMesh = null;
        }
        
        this.isDrawingSelectionBox = false;
        this.selectionBoxStart = null;
        
        return bounds;
    }

    /**
     * Check if a stroke is within bounds
     */
    isStrokeInBox(stroke, minX, maxX, minY, maxY) {
        return stroke.points.some(point => {
            return point.x >= minX && point.x <= maxX &&
                   point.y >= minY && point.y <= maxY;
        });
    }

    /**
     * Check if a point is within the bounding box of selected strokes
     */
    isPointInBoundingBox(worldPoint) {
        if (this.selectedStrokes.length === 0 || !this.selectionBox) return false;
        
        const bounds = this.calculateBounds(this.selectedStrokes);
        
        // Add padding (same as used in updateMultiSelectionBox)
        const padding = 0.05;
        bounds.minX -= padding;
        bounds.minY -= padding;
        bounds.maxX += padding;
        bounds.maxY += padding;
        
        return worldPoint.x >= bounds.minX && worldPoint.x <= bounds.maxX &&
               worldPoint.y >= bounds.minY && worldPoint.y <= bounds.maxY;
    }

    /**
     * Get selected strokes
     */
    getSelectedStrokes() {
        return this.selectedStrokes;
    }

    /**
     * Check if currently drawing selection box
     */
    isDrawingBox() {
        return this.isDrawingSelectionBox;
    }

    /**
     * Get transform handles
     */
    getTransformHandles() {
        return this.transformHandles;
    }
}
