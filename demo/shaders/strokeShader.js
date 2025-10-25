/**
 * Stroke shader for rendering Bezier curves with GPU-based evaluation
 * This shader evaluates cubic Bezier curves on the GPU for smooth, efficient rendering
 * Includes end cap rendering in the same shader for consistent z-ordering
 */

export const strokeVertexShader = `
    // Control points for cubic bezier
    attribute vec3 controlPoint1;
    attribute vec3 controlPoint2;
    attribute vec3 endPoint;
    attribute float segmentT; // 0 to 1 along the curve
    attribute float isEndCap; // 1.0 for end cap vertices, 0.0 for stroke body
    
    varying vec2 vUv;
    varying float vIsEndCap;
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
        vIsEndCap = isEndCap;
        vUv = uv;
        
        if (isEndCap > 0.5) {
            // End cap vertex - position is already the cap center in 'position'
            // UV contains offset from center (ranging -1 to 1)
            vec3 capCenter = position;
            vec3 offset = vec3((uv.x - 0.5) * 2.0 * strokeWidth, (uv.y - 0.5) * 2.0 * strokeWidth, 0.0);
            vec3 finalPos = capCenter + offset;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
        } else {
            // Regular stroke body vertex
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
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
        }
    }
`;

export const strokeFragmentShader = `
    uniform vec3 strokeColor;
    varying vec2 vUv;
    varying float vIsEndCap;
    
    void main() {
        if (vIsEndCap > 0.5) {
            // End cap fragment - draw a circle
            vec2 center = vUv * 2.0 - 1.0; // Convert UV to -1 to 1
            float dist = length(center);
            
            // Discard fragments outside the circle
            if (dist > 1.0) {
                discard;
            }
        }
        
        // Solid color for both stroke body and end caps
        gl_FragColor = vec4(strokeColor, 1.0);
    }
`;
