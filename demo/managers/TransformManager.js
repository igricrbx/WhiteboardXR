import * as THREE from 'three';

/**
 * Manages stroke transformations (dragging and scaling)
 * Handles the geometric calculations for transforms while preserving z-coordinates
 */
export class TransformManager {
    constructor(strokeManager, selectionManager) {
        this.strokeManager = strokeManager;
        this.selectionManager = selectionManager;
        
        // Drag state
        this.isDragging = false;
        this.dragStartPoint = null;
        this.strokeOriginalPoints = null;
        
        // Scale state
        this.isScaling = false;
        this.scaleHandle = null;
        this.scaleStartPoint = null;
        this.scaleStartBounds = null;
        this.strokesOriginalPointsForScale = null;
        this.currentFlipX = false;
        this.currentFlipY = false;
        
        // Preview lines for transformations
        this.previewLines = [];
        this.originalStrokesVisibility = [];
    }

    /**
     * Start dragging selected strokes
     */
    startDragging(worldPoint) {
        const selectedStrokes = this.selectionManager.getSelectedStrokes();
        if (selectedStrokes.length === 0) return false;
        
        this.isDragging = true;
        this.dragStartPoint = worldPoint.clone();
        
        // Bring selected items to front while preserving relative order
        this.bringGroupToFront(selectedStrokes);
        
        // Store original points and positions for all selected strokes
        this.strokeOriginalPoints = selectedStrokes.map(stroke => ({
            stroke: stroke,
            points: stroke.points.map(p => p.clone()),
            // For images, also store original mesh position
            originalPosition: stroke.type === 'image' ? stroke.mesh.position.clone() : null
        }));
        
        // Create preview lines and dim original strokes
        this.createPreviewLines(selectedStrokes);
        
        return true;
    }

    /**
     * Update drag position
     */
    updateDrag(currentPoint) {
        if (!this.isDragging || !this.dragStartPoint) return;
        
        const selectedStrokes = this.selectionManager.getSelectedStrokes();
        if (selectedStrokes.length === 0) return;
        
        const offset = new THREE.Vector3(
            currentPoint.x - this.dragStartPoint.x,
            currentPoint.y - this.dragStartPoint.y,
            0 // Only offset x and y, preserve z
        );
        
        // Update preview lines only (lightweight)
        this.updatePreviewLines(offset);
        
        // Update stroke point arrays (for final rebuild)
        this.strokeOriginalPoints.forEach(({stroke, points, originalPosition}) => {
            points.forEach((originalPoint, index) => {
                // Preserve the original z coordinate
                const originalZ = stroke.points[index].z;
                stroke.points[index].copy(originalPoint).add(offset);
                stroke.points[index].z = originalZ;
            });
            
            // For images, update the mesh position using original position
            if (stroke.type === 'image' && originalPosition) {
                stroke.mesh.position.set(
                    originalPosition.x + offset.x,
                    originalPosition.y + offset.y,
                    stroke.mesh.position.z
                );
                // Update image points to match new position
                const imageManager = this.getImageManager();
                if (imageManager) {
                    imageManager.updateImagePoints(stroke);
                }
            }
        });
        
        // Update selection visuals
        this.selectionManager.updateSelectionVisuals();
    }

    /**
     * Stop dragging
     */
    stopDragging() {
        if (!this.isDragging) return;
        
        // Remove preview lines and restore original strokes
        this.removePreviewLines();
        
        // Rebuild geometry once with final positions
        const selectedStrokes = this.selectionManager.getSelectedStrokes();
        selectedStrokes.forEach(stroke => {
            if (stroke.type === 'image') {
                // Images are already positioned correctly during drag
                const imageManager = this.getImageManager();
                if (imageManager) {
                    imageManager.updateImagePoints(stroke);
                }
            } else {
                // Rebuild stroke geometry
                this.strokeManager.updateStrokeGeometry(stroke);
            }
        });
        
        // Update selection visuals
        this.selectionManager.updateSelectionVisuals();
        
        this.isDragging = false;
        this.dragStartPoint = null;
        this.strokeOriginalPoints = null;
    }

    /**
     * Start scaling operation
     */
    startScaling(worldPoint, handle) {
        const selectedStrokes = this.selectionManager.getSelectedStrokes();
        if (selectedStrokes.length === 0) return false;
        
        this.isScaling = true;
        this.scaleHandle = handle;
        this.scaleStartPoint = worldPoint.clone();
        
        // Bring selected items to front while preserving relative order
        this.bringGroupToFront(selectedStrokes);
        
        // Calculate original bounds
        const bounds = this.selectionManager.calculateBounds(selectedStrokes);
        
        // Store actual bounds without padding
        this.scaleStartBounds = bounds;
        
        // Store original points with normalized positions (0-1) and preserve z
        this.strokesOriginalPointsForScale = selectedStrokes.map(stroke => {
            const data = {
                stroke: stroke,
                points: stroke.points.map(p => ({
                    x: p.x,
                    y: p.y,
                    z: p.z, // Store original z coordinate
                    normalizedX: (bounds.maxX - bounds.minX) === 0 ? 0 : (p.x - bounds.minX) / (bounds.maxX - bounds.minX),
                    normalizedY: (bounds.maxY - bounds.minY) === 0 ? 0 : (p.y - bounds.minY) / (bounds.maxY - bounds.minY)
                }))
            };
            
            // For images, also store original dimensions
            if (stroke.type === 'image') {
                data.originalWidth = stroke.width;
                data.originalHeight = stroke.height;
            }
            
            return data;
        });
        
        // Create preview lines and dim original strokes
        this.createPreviewLines(selectedStrokes);
        
        return true;
    }

    /**
     * Update scale
     */
    updateScale(currentPoint) {
        if (!this.isScaling || !this.scaleHandle || !this.scaleStartPoint) return;
        
        // Safety check: ensure scaleHandle has direction data
        if (!this.scaleHandle.userData || !this.scaleHandle.userData.direction) {
            console.error('Scale handle missing direction data');
            return;
        }
        
        const direction = this.scaleHandle.userData.direction;
        const bounds = this.scaleStartBounds;
        
        // Calculate the padding used for visual display
        const padding = 0.05;
        
        // Calculate delta from handle's original position
        let deltaX = 0;
        let deltaY = 0;
        
        if (direction.includes('e')) {
            deltaX = currentPoint.x - (bounds.maxX + padding);
        } else if (direction.includes('w')) {
            deltaX = currentPoint.x - (bounds.minX - padding);
        }
        
        if (direction.includes('n')) {
            deltaY = currentPoint.y - (bounds.maxY + padding);
        } else if (direction.includes('s')) {
            deltaY = currentPoint.y - (bounds.minY - padding);
        }
        
        // Apply delta directly to bounds
        let newMinX = bounds.minX;
        let newMaxX = bounds.maxX;
        let newMinY = bounds.minY;
        let newMaxY = bounds.maxY;
        
        if (direction.includes('e')) newMaxX = bounds.maxX + deltaX;
        if (direction.includes('w')) newMinX = bounds.minX + deltaX;
        if (direction.includes('n')) newMaxY = bounds.maxY + deltaY;
        if (direction.includes('s')) newMinY = bounds.minY + deltaY;
        
        // Check if we need to flip (mirror) the points
        const flipX = newMinX > newMaxX;
        const flipY = newMinY > newMaxY;
        
        // Swap bounds if inverted
        if (flipX) {
            [newMinX, newMaxX] = [newMaxX, newMinX];
        }
        if (flipY) {
            [newMinY, newMaxY] = [newMaxY, newMinY];
        }
        
        const newWidth = newMaxX - newMinX;
        const newHeight = newMaxY - newMinY;
        
        // Prevent zero or near-zero sizes
        if (newWidth < 0.001 || newHeight < 0.001) return;
        
        // Store current flip state
        this.currentFlipX = flipX;
        this.currentFlipY = flipY;
        
        // Update stroke point arrays and preview lines (lightweight)
        this.strokesOriginalPointsForScale.forEach(({stroke, points, originalWidth, originalHeight}, strokeIndex) => {
            points.forEach((original, index) => {
                // Mirror normalized coordinates if flipped
                const normalizedX = flipX ? (1 - original.normalizedX) : original.normalizedX;
                const normalizedY = flipY ? (1 - original.normalizedY) : original.normalizedY;
                
                stroke.points[index].x = newMinX + normalizedX * newWidth;
                stroke.points[index].y = newMinY + normalizedY * newHeight;
                stroke.points[index].z = original.z; // Preserve original z coordinate
            });
            
            // For images, update mesh position and scale geometry proportionally
            if (stroke.type === 'image') {
                // Calculate scale factors based on the original bounds
                const originalBoundsWidth = this.scaleStartBounds.maxX - this.scaleStartBounds.minX;
                const originalBoundsHeight = this.scaleStartBounds.maxY - this.scaleStartBounds.minY;
                const scaleX = newWidth / originalBoundsWidth;
                const scaleY = newHeight / originalBoundsHeight;
                
                // Scale the image proportionally to its original size
                const scaledWidth = originalWidth * scaleX;
                const scaledHeight = originalHeight * scaleY;
                
                // Calculate image bounds from corner points
                const imageBounds = this.calculateBounds(stroke.points);
                const centerX = (imageBounds.minX + imageBounds.maxX) / 2;
                const centerY = (imageBounds.minY + imageBounds.maxY) / 2;
                
                stroke.mesh.position.set(centerX, centerY, stroke.mesh.position.z);
                
                // Update the geometry to match the scaled dimensions and apply flipping
                const imageManager = this.getImageManager();
                if (imageManager) {
                    imageManager.updateImageGeometry(stroke, scaledWidth, scaledHeight, flipX, flipY);
                }
            } else {
                // Update preview line for strokes
                this.updatePreviewLineGeometry(strokeIndex, stroke.points);
            }
        });
        
        // Update visuals
        this.selectionManager.updateSelectionVisuals();
    }

    /**
     * Stop scaling
     */
    stopScaling() {
        if (!this.isScaling) return;
        
        // Remove preview lines and restore original strokes
        this.removePreviewLines();
        
        // Rebuild geometry once with final positions
        const selectedContent = this.selectionManager.getSelectedStrokes();
        selectedContent.forEach(item => {
            if (item.type === 'image') {
                // For images, update the geometry to match scaled dimensions with flip state
                const imageManager = this.getImageManager();
                if (imageManager) {
                    const bounds = this.calculateBounds(item.points);
                    const newWidth = bounds.maxX - bounds.minX;
                    const newHeight = bounds.maxY - bounds.minY;
                    const centerX = (bounds.minX + bounds.maxX) / 2;
                    const centerY = (bounds.minY + bounds.maxY) / 2;
                    
                    // Apply the flip state that was stored during scaling and update flip state permanently
                    imageManager.updateImageGeometry(item, newWidth, newHeight, this.currentFlipX, this.currentFlipY, true);
                    item.mesh.position.set(centerX, centerY, item.mesh.position.z);
                }
            } else {
                // For strokes, rebuild bezier geometry
                this.strokeManager.updateStrokeGeometry(item);
            }
        });
        
        // Update selection visuals
        this.selectionManager.updateSelectionVisuals();
        
        this.isScaling = false;
        this.scaleHandle = null;
        this.scaleStartPoint = null;
        this.scaleStartBounds = null;
        this.strokesOriginalPointsForScale = null;
        this.currentFlipX = false;
        this.currentFlipY = false;
    }
    
    /**
     * Bring a group of objects to front while preserving their relative order
     * Sorts by current z-index and assigns new sequential z-indices
     */
    bringGroupToFront(objects) {
        if (objects.length === 0) return;
        
        // Sort objects by their current z-index (lowest to highest)
        const sortedObjects = objects.slice().sort((a, b) => {
            const aZIndex = a.zIndex || 0;
            const bZIndex = b.zIndex || 0;
            return aZIndex - bZIndex;
        });
        
        const imageManager = this.getImageManager();
        
        // Assign new sequential z-indices starting from next available
        sortedObjects.forEach(obj => {
            if (obj.type === 'image') {
                if (imageManager) {
                    imageManager.bringToFront(obj);
                }
            } else {
                this.strokeManager.bringToFront(obj);
            }
        });
    }
    
    /**
     * Get image manager (set by main.js)
     */
    getImageManager() {
        return this.imageManager;
    }
    
    /**
     * Set image manager
     */
    setImageManager(imageManager) {
        this.imageManager = imageManager;
    }
    
    /**
     * Calculate bounds from points
     */
    calculateBounds(points) {
        if (points.length === 0) return null;
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        points.forEach(point => {
            if (point.x < minX) minX = point.x;
            if (point.x > maxX) maxX = point.x;
            if (point.y < minY) minY = point.y;
            if (point.y > maxY) maxY = point.y;
        });
        
        return { minX, maxX, minY, maxY };
    }

    /**
     * Check if currently dragging
     */
    isDraggingStrokes() {
        return this.isDragging;
    }

    /**
     * Check if currently scaling
     */
    isScalingStrokes() {
        return this.isScaling;
    }

    /**
     * Create preview lines for selected strokes
     */
    createPreviewLines(strokes) {
        const scene = this.strokeManager.scene;
        
        // Store original stroke visibility and hide them
        this.originalStrokesVisibility = [];
        
        strokes.forEach(stroke => {
            // Skip preview line creation for images
            if (stroke.type === 'image') {
                return;
            }
            
            // Hide original stroke completely
            stroke.meshes.forEach(mesh => {
                if (mesh) {
                    this.originalStrokesVisibility.push({
                        mesh: mesh,
                        originalVisible: mesh.visible
                    });
                    mesh.visible = false;
                }
            });
            
            // Create ribbon mesh with actual width (same as StrokeRenderer)
            const points = stroke.points.map(p => p.clone());
            const geometry = new THREE.BufferGeometry();
            const material = new THREE.MeshBasicMaterial({
                color: stroke.color,
                side: THREE.DoubleSide,
                transparent: true,  // Enable transparency for renderOrder
                opacity: 1.0,
                depthTest: false  // Always render on top
            });

            const previewLine = new THREE.Mesh(geometry, material);
            previewLine.renderOrder = 999;
            
            // Create end caps
            const startCap = this.createEndCap(stroke.color, stroke.width);
            const endCap = this.createEndCap(stroke.color, stroke.width);
            
            // Update geometry with ribbon mesh
            this.updateRibbonGeometry(previewLine, points, stroke.width);
            
            // Position end caps
            if (points.length > 0) {
                startCap.position.copy(points[0]);
                endCap.position.copy(points[points.length - 1]);
            }
            
            scene.add(previewLine);
            scene.add(startCap);
            scene.add(endCap);
            
            this.previewLines.push({
                line: previewLine,
                stroke: stroke,
                startCap: startCap,
                endCap: endCap
            });
        });
    }

    /**
     * Update preview lines with offset (for dragging)
     */
    updatePreviewLines(offset) {
        this.previewLines.forEach(({line, stroke, startCap, endCap}) => {
            // Skip if this is an image (no preview line was created)
            if (stroke.type === 'image') return;
            
            const points = stroke.points.map(p => p.clone());
            this.updateRibbonGeometry(line, points, stroke.width);
            
            // Update end caps
            if (points.length > 0) {
                startCap.position.copy(points[0]);
                endCap.position.copy(points[points.length - 1]);
            }
        });
    }

    /**
     * Update specific preview line geometry (for scaling)
     */
    updatePreviewLineGeometry(strokeIndex, points) {
        if (strokeIndex >= this.previewLines.length) return;
        
        const {line, stroke, startCap, endCap} = this.previewLines[strokeIndex];
        
        // Skip if this is an image
        if (stroke.type === 'image') return;
        
        const clonedPoints = points.map(p => p.clone());
        this.updateRibbonGeometry(line, clonedPoints, stroke.width);
        
        // Update end caps
        if (clonedPoints.length > 0) {
            startCap.position.copy(clonedPoints[0]);
            endCap.position.copy(clonedPoints[clonedPoints.length - 1]);
        }
    }

    /**
     * Remove preview lines and restore original stroke visibility
     */
    removePreviewLines() {
        const scene = this.strokeManager.scene;
        
        // Remove preview lines
        this.previewLines.forEach(({line, startCap, endCap}) => {
            scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
            
            scene.remove(startCap);
            startCap.geometry.dispose();
            startCap.material.dispose();
            
            scene.remove(endCap);
            endCap.geometry.dispose();
            endCap.material.dispose();
        });
        this.previewLines = [];
        
        // Restore original stroke visibility
        this.originalStrokesVisibility.forEach(({mesh, originalVisible}) => {
            if (mesh) {
                mesh.visible = originalVisible;
            }
        });
        this.originalStrokesVisibility = [];
    }

    /**
     * Create circular end cap for preview stroke
     */
    createEndCap(color, width) {
        const radius = width;
        const segments = 32;
        
        const geometry = new THREE.CircleGeometry(radius, segments);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,  // Enable transparency for renderOrder
            opacity: 1.0,
            depthTest: false  // Always render on top
        });
        
        const cap = new THREE.Mesh(geometry, material);
        cap.renderOrder = 999;
        
        return cap;
    }

    /**
     * Create a ribbon mesh from line points with actual width
     * (Same technique as StrokeRenderer.updateLineGeometry)
     */
    updateRibbonGeometry(mesh, points, strokeWidth) {
        if (!mesh || points.length < 1) return;

        const positions = [];
        const indices = [];
        // Match the shader's width calculation: strokeWidth * widthOffset where widthOffset is -1 to 1
        // So the full width is strokeWidth * 2, making halfWidth = strokeWidth
        const halfWidth = strokeWidth;

        // For single point, create a small circle/dot
        if (points.length === 1) {
            const point = points[0];
            const segments = 8;
            
            // Create circle vertices
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                positions.push(
                    point.x + Math.cos(angle) * halfWidth,
                    point.y + Math.sin(angle) * halfWidth,
                    point.z
                );
            }
            
            // Create triangle fan indices
            for (let i = 1; i < segments; i++) {
                indices.push(0, i, i + 1);
            }
            
            // Update geometry and return
            mesh.geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
            mesh.geometry.setIndex(indices);
            mesh.geometry.attributes.position.needsUpdate = true;
            return;
        }

        // Create quad strip along the line
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            
            // Calculate tangent direction
            let tangent;
            if (i === 0) {
                // First point: use direction to next point
                const next = points[i + 1];
                tangent = new THREE.Vector2(next.x - point.x, next.y - point.y);
            } else if (i === points.length - 1) {
                // Last point: use direction from previous point
                const prev = points[i - 1];
                tangent = new THREE.Vector2(point.x - prev.x, point.y - prev.y);
            } else {
                // Middle points: average of incoming and outgoing directions
                const prev = points[i - 1];
                const next = points[i + 1];
                tangent = new THREE.Vector2(
                    (point.x - prev.x) + (next.x - point.x),
                    (point.y - prev.y) + (next.y - point.y)
                );
            }

            // Normalize tangent
            const length = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
            if (length > 0) {
                tangent.x /= length;
                tangent.y /= length;
            }

            // Calculate normal (perpendicular to tangent)
            const normal = new THREE.Vector2(-tangent.y, tangent.x);

            // Create two vertices for this point (left and right side of ribbon)
            positions.push(
                point.x + normal.x * halfWidth,
                point.y + normal.y * halfWidth,
                point.z
            );
            positions.push(
                point.x - normal.x * halfWidth,
                point.y - normal.y * halfWidth,
                point.z
            );

            // Create quad indices (two triangles per segment)
            if (i < points.length - 1) {
                const baseIdx = i * 2;
                // Triangle 1
                indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
                // Triangle 2
                indices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
            }
        }

        // Update geometry
        mesh.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        mesh.geometry.setIndex(indices);
        mesh.geometry.attributes.position.needsUpdate = true;
    }
}
