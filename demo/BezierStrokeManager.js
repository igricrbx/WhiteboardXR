import * as THREE from 'three';
import { BezierConverter } from './BezierConverter.js';

/**
 * Manages GPU-accelerated Bezier stroke rendering
 */
export class BezierStrokeManager {
    constructor(scene) {
        this.scene = scene;
        this.strokes = [];
        
        // Create shader material for bezier rendering
        this.strokeMaterial = this.createStrokeMaterial();
    }

    createStrokeMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                strokeColor: { value: new THREE.Color(0x000000) },
                strokeWidth: { value: 0.01 }
            },
            vertexShader: `
                // Control points for cubic bezier
                attribute vec3 controlPoint1;
                attribute vec3 controlPoint2;
                attribute vec3 endPoint;
                attribute float segmentT; // 0 to 1 along the curve
                attribute float segmentIndex; // Which segment this vertex belongs to
                
                varying vec2 vUv;
                varying float vSegmentIndex;
                uniform float strokeWidth;
                
                // Cubic bezier curve evaluation
                vec3 cubicBezier(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
                    float u = 1.0 - t;
                    float tt = t * t;
                    float uu = u * u;
                    float uuu = uu * u;
                    float ttt = tt * t;
                    
                    return uuu * p0 + 3.0 * uu * t * p1 + 3.0 * u * tt * p2 + ttt * p3;
                }
                
                // Derivative for tangent calculation
                vec3 cubicBezierDerivative(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
                    float u = 1.0 - t;
                    return 3.0 * u * u * (p1 - p0) + 
                           6.0 * u * t * (p2 - p1) + 
                           3.0 * t * t * (p3 - p2);
                }
                
                void main() {
                    // Evaluate bezier curve at this point's t value
                    vec3 curvePos = cubicBezier(position, controlPoint1, controlPoint2, endPoint, segmentT);
                    
                    // Calculate tangent for proper ribbon orientation
                    vec3 tangent = normalize(cubicBezierDerivative(position, controlPoint1, controlPoint2, endPoint, segmentT));
                    
                    // Create normal perpendicular to tangent (for 2D, use z-axis)
                    vec3 up = vec3(0.0, 0.0, 1.0);
                    vec3 strokeNormal = normalize(cross(tangent, up));
                    
                    // Offset position based on UV to create width
                    float widthOffset = (uv.x - 0.5) * 2.0; // -1 to 1
                    vec3 finalPos = curvePos + strokeNormal * strokeWidth * widthOffset;
                    
                    vUv = uv;
                    vSegmentIndex = segmentIndex;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 strokeColor;
                varying vec2 vUv;
                varying float vSegmentIndex;
                
                // Generate a color based on segment index
                vec3 getSegmentColor(float index) {
                    // Use HSV to RGB conversion for distinct colors
                    float hue = mod(index * 0.618033988749895, 1.0); // Golden ratio for good distribution
                    float saturation = 0.8;
                    float value = 0.9;
                    
                    float h = hue * 6.0;
                    float c = value * saturation;
                    float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
                    float m = value - c;
                    
                    vec3 rgb;
                    if (h < 1.0) rgb = vec3(c, x, 0.0);
                    else if (h < 2.0) rgb = vec3(x, c, 0.0);
                    else if (h < 3.0) rgb = vec3(0.0, c, x);
                    else if (h < 4.0) rgb = vec3(0.0, x, c);
                    else if (h < 5.0) rgb = vec3(x, 0.0, c);
                    else rgb = vec3(c, 0.0, x);
                    
                    return rgb + vec3(m);
                }
                
                void main() {
                    // Get color based on segment index
                    vec3 color = getSegmentColor(vSegmentIndex);
                    
                    // Smooth edges with distance from center
                    float dist = abs(vUv.x - 0.5) * 2.0;
                    float alpha = smoothstep(1.0, 0.7, dist);
                    
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            depthTest: true
        });
    }

    /**
     * Create a stroke from raw points
     * @param {Array<THREE.Vector3>} points - Raw stroke points
     * @returns {THREE.Mesh} The created stroke mesh
     */
    createStroke(points) {
        if (points.length < 4) {
            console.warn('Need at least 4 points to create bezier stroke');
            return null;
        }

        // Convert to bezier segments
        const bezierSegments = BezierConverter.createSegment(points);
        
        if (bezierSegments.length === 0) {
            return null;
        }

        // Create geometry from bezier segments
        const geometry = this.createStrokeGeometry(bezierSegments);
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, this.strokeMaterial);
        this.scene.add(mesh);
        
        return mesh;
    }

    /**
     * Generate GPU-optimized geometry for bezier stroke
     */
    createStrokeGeometry(segments) {
        const subdivisionsPerSegment = 20;
        
        const positions = [];
        const cp1Array = [];
        const cp2Array = [];
        const endArray = [];
        const segmentTArray = [];
        const segmentIndexArray = [];
        const uvs = [];
        const indices = [];
        
        let vertexIndex = 0;
        
        segments.forEach((segment, segmentIdx) => {
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
                    
                    // Segment index for coloring
                    segmentIndexArray.push(segmentIdx);
                    
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
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('controlPoint1', new THREE.Float32BufferAttribute(cp1Array, 3));
        geometry.setAttribute('controlPoint2', new THREE.Float32BufferAttribute(cp2Array, 3));
        geometry.setAttribute('endPoint', new THREE.Float32BufferAttribute(endArray, 3));
        geometry.setAttribute('segmentT', new THREE.Float32BufferAttribute(segmentTArray, 1));
        geometry.setAttribute('segmentIndex', new THREE.Float32BufferAttribute(segmentIndexArray, 1));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        
        return geometry;
    }
}
