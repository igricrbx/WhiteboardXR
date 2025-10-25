/**
 * Simple Matrix class for bezier conversion calculations
 * Supports matrix inversion and multiplication
 */
export class Matrix {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        this.data = [];
        
        // Initialize with zeros
        for (let i = 0; i < rows; i++) {
            this.data[i] = [];
            for (let j = 0; j < cols; j++) {
                this.data[i][j] = 0;
            }
        }
    }

    /**
     * Multiply two matrices: result = A * B
     */
    static multiply(A, B) {
        if (A.cols !== B.rows) {
            throw new Error('Matrix dimensions do not match for multiplication');
        }

        const result = new Matrix(A.rows, B.cols);
        
        for (let i = 0; i < A.rows; i++) {
            for (let j = 0; j < B.cols; j++) {
                let sum = 0;
                for (let k = 0; k < A.cols; k++) {
                    sum += A.data[i][k] * B.data[k][j];
                }
                result.data[i][j] = sum;
            }
        }

        return result;
    }

    /**
     * Invert this matrix in-place using Gaussian elimination
     * Only works for square matrices
     */
    inverse() {
        if (this.rows !== this.cols) {
            throw new Error('Only square matrices can be inverted');
        }

        const n = this.rows;
        
        // Create augmented matrix [A|I]
        const augmented = [];
        for (let i = 0; i < n; i++) {
            augmented[i] = [];
            for (let j = 0; j < n; j++) {
                augmented[i][j] = this.data[i][j];
            }
            for (let j = 0; j < n; j++) {
                augmented[i][n + j] = (i === j) ? 1 : 0;
            }
        }

        // Forward elimination
        for (let i = 0; i < n; i++) {
            // Find pivot
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }

            // Swap rows
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

            // Check for singular matrix
            if (Math.abs(augmented[i][i]) < 1e-10) {
                throw new Error('Matrix is singular and cannot be inverted');
            }

            // Make all rows below this one 0 in current column
            for (let k = i + 1; k < n; k++) {
                const factor = augmented[k][i] / augmented[i][i];
                for (let j = i; j < 2 * n; j++) {
                    augmented[k][j] -= factor * augmented[i][j];
                }
            }
        }

        // Back substitution
        for (let i = n - 1; i >= 0; i--) {
            // Normalize the pivot row
            const pivot = augmented[i][i];
            for (let j = 0; j < 2 * n; j++) {
                augmented[i][j] /= pivot;
            }

            // Eliminate above
            for (let k = 0; k < i; k++) {
                const factor = augmented[k][i];
                for (let j = 0; j < 2 * n; j++) {
                    augmented[k][j] -= factor * augmented[i][j];
                }
            }
        }

        // Extract the inverse from the augmented matrix
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                this.data[i][j] = augmented[i][n + j];
            }
        }
    }

    /**
     * Clone this matrix
     */
    clone() {
        const cloned = new Matrix(this.rows, this.cols);
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                cloned.data[i][j] = this.data[i][j];
            }
        }
        return cloned;
    }
}
