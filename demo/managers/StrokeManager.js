import * as THREE from 'three';
import { BezierConverter } from '../BezierConverter.js';

/**
 * Manages stroke creation, storage, and operations
 * Abstracts stroke lifecycle management from the main application
 */
export class StrokeManager {
    constructor(scene, chunkedBezierManager) {
        this.scene = scene;
        this.chunkedBezierManager = chunkedBezierManager;
        this.strokes = [];
        this.getNextZIndex = null; // Will be set externally for shared z-index
    }

    /**
     * Create a new stroke from points
     */
    createStroke(points, options = {}) {
        const stroke = this.chunkedBezierManager.createStroke(points, options);
        
        if (stroke) {
            // Assign z-index for rendering order
            stroke.zIndex = this.getNextZIndex ? this.getNextZIndex() : 0;
            this.updateStrokeRenderOrder(stroke);
            this.strokes.push(stroke);
        }
        
        return stroke;
    }
    
    /**
     * Update render order for a stroke based on its z-index
     */
    updateStrokeRenderOrder(stroke) {
        if (stroke.meshes) {
            stroke.meshes.forEach(mesh => {
                mesh.renderOrder = stroke.zIndex;
            });
        }
    }
    
    /**
     * Bring stroke to front (highest z-index)
     */
    bringToFront(stroke) {
        stroke.zIndex = this.getNextZIndex ? this.getNextZIndex() : 0;
        this.updateStrokeRenderOrder(stroke);
    }

    /**
     * Delete a stroke
     */
    deleteStroke(stroke) {
        this.chunkedBezierManager.deleteStroke(stroke);
        
        const index = this.strokes.indexOf(stroke);
        if (index > -1) {
            this.strokes.splice(index, 1);
        }
    }

    /**
     * Delete multiple strokes
     */
    deleteStrokes(strokeArray) {
        strokeArray.forEach(stroke => {
            this.deleteStroke(stroke);
        });
    }

    /**
     * Update stroke geometry after transformation
     */
    updateStrokeGeometry(stroke) {
        // Remove old meshes from their parent (whiteboard or scene)
        stroke.meshes.forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
        });
        stroke.meshes = [];
        
        // Recreate with new positions
        const chunks = this.chunkedBezierManager.createChunks(stroke.points);
        
        // Get the parent from chunkedBezierManager (whiteboard)
        const parent = this.chunkedBezierManager.parent;
        
        chunks.forEach((chunk, index) => {
            const chunkSegments = BezierConverter.createSegment(chunk.points);
            
            if (chunkSegments.length > 0) {
                // Include end caps only for the first and last chunk
                const includeStartCap = index === 0;
                const includeEndCap = index === chunks.length - 1;
                const startCapPosition = includeStartCap ? stroke.points[0] : null;
                const endCapPosition = includeEndCap ? stroke.points[stroke.points.length - 1] : null;
                
                const chunkMesh = this.chunkedBezierManager.createChunkMesh(
                    chunkSegments, 
                    stroke.material,
                    startCapPosition,
                    endCapPosition,
                    stroke.width
                );
                if (chunkMesh) {
                    parent.add(chunkMesh);
                    stroke.meshes.push(chunkMesh);
                }
            }
        });
        
        // Update render order for all new meshes
        this.updateStrokeRenderOrder(stroke);
    }

    /**
     * Get stroke at world position
     */
    getStrokeAtPosition(worldPoint, clickThreshold = 0.01) {
        let closestStroke = null;
        let closestDistance = Infinity;
        
        this.strokes.forEach(stroke => {
            const distanceToStroke = this.getDistanceToStroke(worldPoint, stroke);
            const strokeRadius = stroke.width / 2;
            const effectiveDistance = distanceToStroke - strokeRadius;
            
            if (effectiveDistance < closestDistance) {
                closestDistance = effectiveDistance;
                closestStroke = stroke;
            }
        });
        
        if (closestStroke && closestDistance < clickThreshold) {
            return closestStroke;
        }
        
        return null;
    }

    /**
     * Calculate minimum distance from a point to a stroke
     */
    getDistanceToStroke(point, stroke) {
        let minDistance = Infinity;
        
        // Check distance to each stroke point
        stroke.points.forEach(strokePoint => {
            const distance = point.distanceTo(strokePoint);
            if (distance < minDistance) {
                minDistance = distance;
            }
        });
        
        // Also check distances to line segments between points for better accuracy
        for (let i = 0; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i];
            const p2 = stroke.points[i + 1];
            const segmentDistance = this.pointToLineSegmentDistance(point, p1, p2);
            if (segmentDistance < minDistance) {
                minDistance = segmentDistance;
            }
        }
        
        return minDistance;
    }

    /**
     * Calculate distance from a point to a line segment
     */
    pointToLineSegmentDistance(point, lineStart, lineEnd) {
        const line = new THREE.Vector3().subVectors(lineEnd, lineStart);
        const lineLength = line.length();
        
        if (lineLength === 0) {
            return point.distanceTo(lineStart);
        }
        
        const toPoint = new THREE.Vector3().subVectors(point, lineStart);
        const t = Math.max(0, Math.min(1, toPoint.dot(line) / (lineLength * lineLength)));
        
        const projection = new THREE.Vector3()
            .copy(lineStart)
            .add(line.multiplyScalar(t));
        
        return point.distanceTo(projection);
    }

    /**
     * Get all strokes
     */
    getStrokes() {
        return this.strokes;
    }

    /**
     * Get stroke count
     */
    getStrokeCount() {
        return this.strokes.length;
    }

    /**
     * Set debug mode for a stroke
     */
    setStrokeDebugMode(stroke, enabled) {
        this.chunkedBezierManager.setDebugMode(stroke, enabled);
    }

    /**
     * Set debug mode for all strokes
     */
    setAllStrokesDebugMode(enabled) {
        this.strokes.forEach(stroke => {
            this.chunkedBezierManager.setDebugMode(stroke, enabled);
        });
    }
}
