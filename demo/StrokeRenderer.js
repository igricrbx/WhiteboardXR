import * as THREE from 'three';

/**
 * Handles real-time stroke rendering while drawing (simple line preview)
 */
export class StrokeRenderer {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.currentStroke = null;
        this.currentLine = null;
        this.startCap = null;
        this.endCap = null;
        this.points = [];
        this.allPoints = []; // Store all points for preview line
        this.lastScreenPosition = null;
        
        // Minimum distance threshold in screen pixels before adding a point for bezier conversion
        this.minPixelDistance = 2; // Only affects bezier points, not preview line
        
        // Preview line width
        this.previewLineWidth = 0.01; // Width in world units
        
        // Preview line color
        this.previewLineColor = new THREE.Color(0x000000); // Default black
        
        // Smoothing settings for reducing mouse jitter/jaggedness
        this.smoothingWindowSize = 3; // Number of points to average (odd number recommended)
        this.enableSmoothing = true; // Set to false to disable smoothing
    }

    worldToScreen(point) {
        const vector = point.clone();
        vector.project(this.camera);
        
        const canvas = this.renderer.domElement;
        return {
            x: (vector.x + 1) * canvas.width / 2,
            y: (-vector.y + 1) * canvas.height / 2
        };
    }

    startStroke(startPoint) {
        this.points = [startPoint.clone()]; // For bezier conversion
        this.allPoints = [startPoint.clone()]; // For preview line
        this.lastScreenPosition = this.worldToScreen(startPoint);
        
        // Create mesh-based line with actual width (works on all WebGL systems)
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.MeshBasicMaterial({
            color: this.previewLineColor,
            side: THREE.DoubleSide,
            transparent: true,  // Enable transparency for renderOrder
            opacity: 1.0,
            depthTest: false  // Always render on top
        });

        this.currentLine = new THREE.Mesh(geometry, material);
        this.currentLine.renderOrder = 999; // Ensure it renders last (on top)
        this.scene.add(this.currentLine);
        
        // Create circular end caps
        this.createEndCaps();
        
        // Initial geometry will be updated in addPoint
        this.updateLineGeometry();
    }

    /**
     * Apply moving average smoothing to reduce mouse jitter and jaggedness
     * This treats small-scale noise as unwanted artifacts while preserving overall shape
     */
    smoothPoints(points) {
        if (!this.enableSmoothing || points.length < 3) {
            return points;
        }

        const smoothed = [];
        const halfWindow = Math.floor(this.smoothingWindowSize / 2);

        for (let i = 0; i < points.length; i++) {
            // Always preserve first and last points exactly
            if (i === 0 || i === points.length - 1) {
                smoothed.push(points[i].clone());
                continue;
            }

            // Calculate window bounds
            const start = Math.max(0, i - halfWindow);
            const end = Math.min(points.length - 1, i + halfWindow);
            
            // Calculate average position within window
            let sumX = 0, sumY = 0, sumZ = 0;
            let count = 0;
            
            for (let j = start; j <= end; j++) {
                sumX += points[j].x;
                sumY += points[j].y;
                sumZ += points[j].z;
                count++;
            }

            smoothed.push(new THREE.Vector3(
                sumX / count,
                sumY / count,
                sumZ / count
            ));
        }

        return smoothed;
    }

    addPoint(point) {
        if (!this.currentLine) return;

        // Always add to allPoints for preview line rendering
        this.allPoints.push(point.clone());

        // Convert point to screen space and check pixel distance for bezier points
        const screenPos = this.worldToScreen(point);
        
        if (this.lastScreenPosition) {
            const dx = screenPos.x - this.lastScreenPosition.x;
            const dy = screenPos.y - this.lastScreenPosition.y;
            const pixelDistance = Math.sqrt(dx * dx + dy * dy);
            
            // Only add to bezier points if it's far enough from last point
            if (pixelDistance >= this.minPixelDistance) {
                this.points.push(point.clone());
                this.lastScreenPosition = screenPos;
            }
        } else {
            this.points.push(point.clone());
            this.lastScreenPosition = screenPos;
        }

        // Update mesh geometry for preview line
        this.updateLineGeometry();
        
        // Update end cap position
        this.updateEndCaps();
    }

    /**
     * Create circular end caps for the preview stroke
     */
    createEndCaps() {
        const radius = this.previewLineWidth;
        const segments = 32;
        
        const geometry = new THREE.CircleGeometry(radius, segments);
        const material = new THREE.MeshBasicMaterial({
            color: this.previewLineColor,
            side: THREE.DoubleSide,
            transparent: true,  // Enable transparency for renderOrder
            opacity: 1.0,
            depthTest: false  // Always render on top
        });
        
        // Start cap
        this.startCap = new THREE.Mesh(geometry, material.clone());
        this.startCap.renderOrder = 999;
        if (this.allPoints.length > 0) {
            this.startCap.position.copy(this.allPoints[0]);
        }
        this.scene.add(this.startCap);
        
        // End cap (shares geometry, clones material)
        this.endCap = new THREE.Mesh(geometry, material.clone());
        this.endCap.renderOrder = 999;
        if (this.allPoints.length > 0) {
            this.endCap.position.copy(this.allPoints[this.allPoints.length - 1]);
        }
        this.scene.add(this.endCap);
    }
    
    /**
     * Update end cap positions and appearance
     */
    updateEndCaps() {
        if (!this.startCap || !this.endCap || this.allPoints.length === 0) return;
        
        // Update start cap
        this.startCap.position.copy(this.allPoints[0]);
        this.startCap.material.color = this.previewLineColor;
        
        // Update end cap
        this.endCap.position.copy(this.allPoints[this.allPoints.length - 1]);
        this.endCap.material.color = this.previewLineColor;
        
        // Update cap size if width changed
        const radius = this.previewLineWidth;
        if (this.startCap.geometry.parameters.radius !== radius) {
            this.startCap.geometry.dispose();
            this.endCap.geometry.dispose();
            
            const newGeometry = new THREE.CircleGeometry(radius, 32);
            this.startCap.geometry = newGeometry;
            this.endCap.geometry = newGeometry;
        }
    }

    /**
     * Create a ribbon mesh from line points with actual width
     */
    updateLineGeometry() {
        if (!this.currentLine || this.allPoints.length < 1) return;

        const positions = [];
        const indices = [];
        // Match the shader's width calculation: strokeWidth * widthOffset where widthOffset is -1 to 1
        // So the full width is strokeWidth * 2, making halfWidth = strokeWidth
        const halfWidth = this.previewLineWidth;

        // For single point, create a small circle/dot
        if (this.allPoints.length === 1) {
            const point = this.allPoints[0];
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
            this.currentLine.geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
            this.currentLine.geometry.setIndex(indices);
            this.currentLine.geometry.attributes.position.needsUpdate = true;
            return;
        }

        // Create quad strip along the line
        for (let i = 0; i < this.allPoints.length; i++) {
            const point = this.allPoints[i];
            
            // Calculate tangent direction
            let tangent;
            if (i === 0) {
                // First point: use direction to next point
                const next = this.allPoints[i + 1];
                tangent = new THREE.Vector2(next.x - point.x, next.y - point.y);
            } else if (i === this.allPoints.length - 1) {
                // Last point: use direction from previous point
                const prev = this.allPoints[i - 1];
                tangent = new THREE.Vector2(point.x - prev.x, point.y - prev.y);
            } else {
                // Middle points: average of incoming and outgoing directions
                const prev = this.allPoints[i - 1];
                const next = this.allPoints[i + 1];
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
            if (i < this.allPoints.length - 1) {
                const baseIdx = i * 2;
                // Triangle 1
                indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
                // Triangle 2
                indices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
            }
        }

        // Update geometry
        this.currentLine.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        this.currentLine.geometry.setIndex(indices);
        this.currentLine.geometry.attributes.position.needsUpdate = true;
    }

    endStroke(addLastPoint = false) {
        // Always add the very last point to bezier points, regardless of minPixelDistance
        // This ensures the stroke ends exactly where the pen was lifted
        if (this.allPoints.length > 0) {
            const lastPoint = this.allPoints[this.allPoints.length - 1];
            // Only add if it's not already the last bezier point
            if (this.points.length === 0 || 
                !lastPoint.equals(this.points[this.points.length - 1])) {
                this.points.push(lastPoint.clone());
            }
        }
        
        // Apply smoothing to reduce mouse jitter/jaggedness
        const smoothedPoints = this.smoothPoints(this.points);
        
        // Remove the temporary line
        if (this.currentLine) {
            this.scene.remove(this.currentLine);
            this.currentLine.geometry.dispose();
            this.currentLine.material.dispose();
            this.currentLine = null;
        }
        
        // Remove end caps
        if (this.startCap) {
            this.scene.remove(this.startCap);
            this.startCap.geometry.dispose();
            this.startCap.material.dispose();
            this.startCap = null;
        }
        if (this.endCap) {
            this.scene.remove(this.endCap);
            this.endCap.geometry.dispose();
            this.endCap.material.dispose();
            this.endCap = null;
        }

        this.points = [];
        this.allPoints = [];
        this.lastScreenPosition = null;
        
        return smoothedPoints; // Return smoothed points for bezier conversion
    }
}
