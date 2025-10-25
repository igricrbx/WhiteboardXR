import { Matrix } from './Matrix.js';

/**
 * Converts raw stroke points to smooth Bezier curves
 * Based on B-spline to Bezier conversion algorithm
 * Port of Unity C# implementation
 */

export class BezierQuadruple {
    constructor(p0, p1, p2, p3) {
        this.p0 = p0; // Start point
        this.p1 = p1; // First control point
        this.p2 = p2; // Second control point
        this.p3 = p3; // End point
    }
}

export class BezierConverter {
    /**
     * Linear interpolation
     */
    static lerp(p0, p1, t) {
        return p0 + (p1 - p0) * t;
    }

    /**
     * Cubic Bezier curve evaluation
     */
    static cubicInterpolation(p0, p1, p2, p3, t) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        return uuu * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * p3;
    }

    /**
     * Cubic Bezier curve derivative (for tangent calculation)
     */
    static cubicDerivative(p0, p1, p2, p3, t) {
        const u = 1 - t;
        return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
    }

    /**
     * Convert array of points to Bezier curve segments
     * Requires at least 4 points
     * 
     * @param {Array} points - Array of THREE.Vector3 or objects with x, y, z properties
     * @returns {Array<BezierQuadruple>} Array of bezier segments
     */
    static createSegment(points) {
        const n = points.length;

        if (n < 4) {
            console.warn('BezierConverter requires at least 4 points. Got:', n);
            return [];
        }

        try {
            // Create the tridiagonal matrix C (n-2 × n-2)
            const C = new Matrix(n - 2, n - 2);
            
            // Fill in the constant matrix: 4's on diagonal, 1's adjacent
            for (let i = 0; i < n - 2; i++) {
                for (let j = 0; j < n - 2; j++) {
                    if (i === j) {
                        C.data[i][j] = 4;
                        if (i + 1 < n - 2) {
                            C.data[i + 1][j] = 1;
                            C.data[i][j + 1] = 1;
                        }
                    }
                }
            }

            // Invert the matrix
            C.inverse();

            // Create coefficient matrix S (n-2 × 2) for x and y coordinates
            const S = new Matrix(n - 2, 2);
            
            // First row: 6*P[1] - P[0]
            S.data[0][0] = 6 * points[1].x - points[0].x;
            S.data[0][1] = 6 * points[1].y - points[0].y;
            
            // Middle rows: 6*P[i+1]
            for (let i = 0; i < n - 4; i++) {
                S.data[i + 1][0] = 6 * points[i + 2].x;
                S.data[i + 1][1] = 6 * points[i + 2].y;
            }
            
            // Last row: 6*P[n-2] - P[n-1]
            S.data[n - 3][0] = 6 * points[n - 2].x - points[n - 1].x;
            S.data[n - 3][1] = 6 * points[n - 2].y - points[n - 1].y;

            // Calculate B-spline nodes: B = C^-1 * S
            const B = Matrix.multiply(C, S);

            // Generate control points D by splitting B-spline segments
            const D = [];
            const onethird = 1 / 3;
            const twothirds = 2 / 3;

            // First control points (from P[0] to B[0])
            D.push({
                x: this.lerp(points[0].x, B.data[0][0], onethird),
                y: this.lerp(points[0].y, B.data[0][1], onethird),
                z: points[0].z
            });
            D.push({
                x: this.lerp(points[0].x, B.data[0][0], twothirds),
                y: this.lerp(points[0].y, B.data[0][1], twothirds),
                z: points[0].z
            });

            // Middle control points (between B-spline nodes)
            for (let i = 2; i < (n - 2) * 2; i += 2) {
                const idx = Math.floor(i / 2);
                D.push({
                    x: this.lerp(B.data[idx - 1][0], B.data[idx][0], onethird),
                    y: this.lerp(B.data[idx - 1][1], B.data[idx][1], onethird),
                    z: points[idx].z
                });
                D.push({
                    x: this.lerp(B.data[idx - 1][0], B.data[idx][0], twothirds),
                    y: this.lerp(B.data[idx - 1][1], B.data[idx][1], twothirds),
                    z: points[idx].z
                });
            }

            // Last control points (from B[n-3] to P[n-1])
            D.push({
                x: this.lerp(B.data[n - 3][0], points[n - 1].x, onethird),
                y: this.lerp(B.data[n - 3][1], points[n - 1].y, onethird),
                z: points[n - 1].z
            });
            D.push({
                x: this.lerp(B.data[n - 3][0], points[n - 1].x, twothirds),
                y: this.lerp(B.data[n - 3][1], points[n - 1].y, twothirds),
                z: points[n - 1].z
            });

            // Create bezier segments
            const bezierSegments = [];
            for (let i = 0; i < n - 1; i++) {
                bezierSegments.push(new BezierQuadruple(
                    points[i],
                    D[i * 2],
                    D[i * 2 + 1],
                    points[i + 1]
                ));
            }

            return bezierSegments;

        } catch (error) {
            console.error('Error in BezierConverter:', error);
            return [];
        }
    }
}
