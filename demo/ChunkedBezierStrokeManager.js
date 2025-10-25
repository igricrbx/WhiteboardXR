import * as THREE from 'three';
import { BezierConverter } from './BezierConverter.js';
import { strokeVertexShader, strokeFragmentShader } from './shaders/strokeShader.js';

/**
 * Manages chunked Bezier stroke processing for progressive rendering
 * Processes strokes in smaller chunks to avoid blocking and provide real-time feedback
 */
export class ChunkedBezierStrokeManager {
    constructor(scene, strokeMaterial, camera, parent = null) {
        this.scene = scene;
        this.strokeMaterial = strokeMaterial;
        this.camera = camera;
        this.parent = parent || scene; // Use parent if provided, otherwise scene
        this.activeStrokes = []; // Strokes being built progressively
        
        // Chunking parameters
        this.chunkSize = 12; // Points per chunk
        this.chunkOverlap = 3; // Overlap between chunks for continuity
        
        // Subdivision parameters
        this.baseSubdivisions = 20; // Minimum subdivisions at default zoom
        this.maxSubdivisions = 200; // Maximum subdivisions when fully zoomed in
    }

    /**
     * Create a stroke from points, processing in chunks
     * @param {Array<THREE.Vector3>} points - All stroke points
     * @param {Object} options - Stroke options (width, color)
     * @returns {Object} Stroke object with mesh and metadata
     */
    createStroke(points, options = {}) {
        if (points.length < 4) {
            console.warn('Need at least 4 points to create stroke');
            return null;
        }

        const {
            width = 0.01,
            color = new THREE.Color(Math.random(), Math.random(), Math.random())
        } = options;

        const stroke = {
            points: points,
            chunks: [],
            meshes: [],
            segmentCount: 0,
            isComplete: false,
            width: width,
            color: color,
            debugPoints: [] // Store debug point meshes
        };

        // Create material for this stroke with its specific color and width
        const material = this.createStrokeMaterial(color, width);

        // Process all chunks immediately (can be made progressive later)
        const chunks = this.createChunks(points);
        
        chunks.forEach((chunk, index) => {
            const chunkSegments = BezierConverter.createSegment(chunk.points);
            
            if (chunkSegments.length > 0) {
                // Include end caps only for the first and last chunk
                const includeStartCap = index === 0;
                const includeEndCap = index === chunks.length - 1;
                const startCapPosition = includeStartCap ? points[0] : null;
                const endCapPosition = includeEndCap ? points[points.length - 1] : null;
                
                const chunkMesh = this.createChunkMesh(
                    chunkSegments, 
                    material, 
                    startCapPosition, 
                    endCapPosition,
                    width
                );
                if (chunkMesh) {
                    this.parent.add(chunkMesh);
                    stroke.meshes.push(chunkMesh);
                    stroke.segmentCount += chunkSegments.length;
                }
            }
        });

        stroke.isComplete = true;
        stroke.material = material;
        
        // Add debug points if requested
        if (options.debugMode) {
            this.addDebugPoints(stroke);
        }
        
        return stroke;
    }
    


    /**
     * Add debug visualization points for the stroke
     * @param {Object} stroke - Stroke object
     */
    addDebugPoints(stroke) {
        const pointSize = stroke.width * 0.3; // 30% of stroke width
        const geometry = new THREE.SphereGeometry(pointSize, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, // Red for visibility
            depthTest: true,
            depthWrite: true
        });
        
        stroke.points.forEach(point => {
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.copy(point);
            sphere.renderOrder = zIndex + 0.1;
            this.parent.add(sphere);
            stroke.debugPoints.push(sphere);
        });
    }

    /**
     * Remove debug visualization points
     * @param {Object} stroke - Stroke object
     */
    removeDebugPoints(stroke) {
        if (!stroke.debugPoints) return;
        
        stroke.debugPoints.forEach(sphere => {
            this.scene.remove(sphere);
            sphere.geometry.dispose();
            sphere.material.dispose();
        });
        
        stroke.debugPoints = [];
    }

    /**
     * Toggle debug mode for a stroke
     * @param {Object} stroke - Stroke object
     * @param {boolean} enabled - Whether to show debug points
     */
    setDebugMode(stroke, enabled) {
        if (!stroke) return;
        
        if (enabled && stroke.debugPoints.length === 0) {
            this.addDebugPoints(stroke);
        } else if (!enabled && stroke.debugPoints.length > 0) {
            this.removeDebugPoints(stroke);
        }
    }

    /**
     * Split points into overlapping chunks
     * @param {Array<THREE.Vector3>} points - All points
     * @returns {Array} Array of chunk objects
     */
    createChunks(points) {
        const chunks = [];
        let startIdx = 0;

        while (startIdx < points.length) {
            const endIdx = Math.min(startIdx + this.chunkSize, points.length);
            const chunkPoints = points.slice(startIdx, endIdx);

            // Only create chunk if it has enough points
            if (chunkPoints.length >= 4) {
                chunks.push({
                    startIndex: startIdx,
                    endIndex: endIdx,
                    points: chunkPoints
                });
            }

            // Move to next chunk, accounting for overlap
            // Last chunk doesn't need overlap
            if (endIdx >= points.length) {
                break;
            }
            
            startIdx = endIdx - this.chunkOverlap;
        }

        return chunks;
    }

    /**
     * Create a mesh for a single chunk of bezier segments
     * @param {Array<BezierQuadruple>} segments - Bezier segments for this chunk
     * @param {THREE.ShaderMaterial} material - Material for this stroke
     * @param {THREE.Vector3|null} startCapPosition - Position for start cap (or null)
     * @param {THREE.Vector3|null} endCapPosition - Position for end cap (or null)
     * @param {number} width - Stroke width for caps
     * @returns {THREE.Mesh} Mesh for the chunk
     */
    createChunkMesh(segments, material, startCapPosition = null, endCapPosition = null, width = 0.01) {
        const geometry = this.createChunkGeometry(segments, startCapPosition, endCapPosition, width);
        if (!geometry) return null;

        const mesh = new THREE.Mesh(geometry, material);
        
        // Disable frustum culling because the bezier curve is computed in the shader
        // The bounding box is based on control points, not the actual curve
        mesh.frustumCulled = false;
        
        return mesh;
    }

    /**
     * Create shader material for a stroke with specific color and width
     * @param {THREE.Color} color - Stroke color
     * @param {number} width - Stroke width
     * @returns {THREE.ShaderMaterial} Shader material
     */
    createStrokeMaterial(color, width) {
        return new THREE.ShaderMaterial({
            uniforms: {
                strokeColor: { value: color },
                strokeWidth: { value: width }
            },
            vertexShader: strokeVertexShader,
            fragmentShader: strokeFragmentShader,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,  // Disable depth writing for transparent objects
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
    }

    /**
     * Calculate subdivision count based on camera zoom level
     * @returns {number} Number of subdivisions per segment
     */
    calculateSubdivisions() {
        if (!this.camera) return this.baseSubdivisions;
        
        // For orthographic camera, use the view height as zoom indicator
        // Smaller view height = more zoomed in
        const viewHeight = this.camera.top - this.camera.bottom;
        const defaultViewHeight = 3; // The initial view size from main.js
        
        // Calculate zoom factor (1 = default, >1 = zoomed in, <1 = zoomed out)
        const zoomFactor = defaultViewHeight / viewHeight;
        
        // Scale subdivisions based on zoom
        // At default zoom (1x): baseSubdivisions
        // At 10x zoom: maxSubdivisions
        const subdivisions = Math.round(
            this.baseSubdivisions * Math.min(zoomFactor, this.maxSubdivisions / this.baseSubdivisions)
        );
        
        return Math.max(this.baseSubdivisions, Math.min(subdivisions, this.maxSubdivisions));
    }

    /**
     * Generate GPU-optimized geometry for a chunk of bezier segments with end caps
     * @param {Array<BezierQuadruple>} segments - Bezier segments
     * @param {THREE.Vector3|null} startCapPosition - Position for start cap
     * @param {THREE.Vector3|null} endCapPosition - Position for end cap
     * @param {number} width - Stroke width for caps
     * @returns {THREE.BufferGeometry} Geometry for the chunk
     */
    createChunkGeometry(segments, startCapPosition = null, endCapPosition = null, width = 0.01) {
        // Dynamic subdivisions based on zoom level
        const subdivisionsPerSegment = this.calculateSubdivisions();
        
        const positions = [];
        const cp1Array = [];
        const cp2Array = [];
        const endArray = [];
        const segmentTArray = [];
        const isEndCapArray = [];
        const uvs = [];
        const indices = [];
        
        let vertexIndex = 0;
        
        segments.forEach((segment) => {
            for (let i = 0; i < subdivisionsPerSegment; i++) {
                const t = i / (subdivisionsPerSegment - 1);
                
                // Create two vertices per subdivision (for width)
                for (let side = 0; side < 2; side++) {
                    // Start point
                    positions.push(segment.p0.x, segment.p0.y, segment.p0.z);
                    
                    // Control points
                    cp1Array.push(segment.p1.x, segment.p1.y, segment.p1.z);
                    cp2Array.push(segment.p2.x, segment.p2.y, segment.p2.z);
                    
                    // End point
                    endArray.push(segment.p3.x, segment.p3.y, segment.p3.z);
                    
                    // T value along curve
                    segmentTArray.push(t);
                    
                    // Mark as stroke body (not end cap)
                    isEndCapArray.push(0.0);
                    
                    // UV coordinates (x: 0 or 1 for width, y: t for length)
                    uvs.push(side, t);
                }
                
                // Create quad indices (two triangles)
                if (i < subdivisionsPerSegment - 1) {
                    const base = vertexIndex + i * 2;
                    // Triangle 1
                    indices.push(base, base + 1, base + 2);
                    // Triangle 2
                    indices.push(base + 1, base + 3, base + 2);
                }
            }
            
            vertexIndex += subdivisionsPerSegment * 2;
        });
        
        // Add end cap geometry if needed
        const addEndCap = (capPosition) => {
            if (!capPosition) return;
            
            // Create a quad (2 triangles) for the cap
            // The shader will use UV to determine offset from center
            const baseIndex = vertexIndex;
            
            // Four corners of the cap quad
            for (let i = 0; i < 4; i++) {
                // Position is the cap center
                positions.push(capPosition.x, capPosition.y, capPosition.z);
                
                // Control points (not used for caps, but required by shader)
                cp1Array.push(0, 0, 0);
                cp2Array.push(0, 0, 0);
                endArray.push(0, 0, 0);
                segmentTArray.push(0);
                
                // Mark as end cap
                isEndCapArray.push(1.0);
                
                // UV coordinates for the four corners
                // These will be used to offset from center in the shader
                const u = (i === 1 || i === 2) ? 1 : 0;
                const v = (i >= 2) ? 1 : 0;
                uvs.push(u, v);
            }
            
            // Two triangles for the quad
            indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
            indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
            
            vertexIndex += 4;
        };
        
        addEndCap(startCapPosition);
        addEndCap(endCapPosition);
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('controlPoint1', new THREE.Float32BufferAttribute(cp1Array, 3));
        geometry.setAttribute('controlPoint2', new THREE.Float32BufferAttribute(cp2Array, 3));
        geometry.setAttribute('endPoint', new THREE.Float32BufferAttribute(endArray, 3));
        geometry.setAttribute('segmentT', new THREE.Float32BufferAttribute(segmentTArray, 1));
        geometry.setAttribute('isEndCap', new THREE.Float32BufferAttribute(isEndCapArray, 1));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        
        return geometry;
    }

    /**
     * Delete a stroke and clean up resources
     * @param {Object} stroke - Stroke object to delete
     */
    deleteStroke(stroke) {
        if (!stroke) return;

        // Remove debug points if any
        this.removeDebugPoints(stroke);

        // Remove and dispose all chunk meshes from their parent
        stroke.meshes.forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
        });

        // Dispose material
        if (stroke.material) {
            stroke.material.dispose();
        }

        stroke.meshes = [];
        stroke.isComplete = false;
    }

    /**
     * Get statistics about chunking efficiency
     * @param {Object} stroke - Stroke object
     * @returns {Object} Statistics
     */
    getStats(stroke) {
        if (!stroke) return null;

        return {
            totalPoints: stroke.points.length,
            chunkCount: stroke.meshes.length,
            totalSegments: stroke.segmentCount,
            avgPointsPerChunk: (stroke.points.length / stroke.meshes.length).toFixed(1),
            avgSegmentsPerChunk: (stroke.segmentCount / stroke.meshes.length).toFixed(1)
        };
    }
}
