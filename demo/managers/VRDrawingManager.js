import * as THREE from 'three';

/**
 * Manages VR drawing state machine and stroke creation
 * Coordinates between pen collision detection and stroke rendering
 */
export class VRDrawingManager {
    constructor(vrPenController, strokeRenderer, whiteboard) {
        this.vrPenController = vrPenController;
        this.strokeRenderer = strokeRenderer;
        this.whiteboard = whiteboard;
        
        // Drawing state machine
        this.state = 'IDLE'; // IDLE, GRABBED_NOT_DRAWING, DRAWING
        this.isDrawing = false;
        
        // Callbacks
        this.onDrawStartCallback = null;
        this.onDrawMoveCallback = null;
        this.onDrawEndCallback = null;
        
        // Performance tracking
        this.lastPointTime = 0;
        this.minTimeBetweenPoints = 1000 / 500; // Max 500 points per second (for 120 FPS VR)
        
        // Setup pen collision callback
        this.setupPenCallbacks();
    }

    /**
     * Setup callbacks from pen controller
     */
    setupPenCallbacks() {
        // Listen for pen collision events
        this.vrPenController.onCollision((collision) => {
            if (this.vrPenController.isPenGrabbed()) {
                this.handlePenCollision(collision);
            }
        });
        
        // Listen for pen release - end stroke if drawing
        this.vrPenController.onRelease(() => {
            if (this.isDrawing) {
                this.endStroke();
            }
        });
    }

    /**
     * Update drawing state each frame
     */
    update(deltaTime) {
        const isPenGrabbed = this.vrPenController.isPenGrabbed();
        const collision = this.vrPenController.checkWhiteboardCollision();
        const isPenTouching = collision.touching;
        
        // State machine logic
        switch(this.state) {
            case 'IDLE':
                if (isPenGrabbed && isPenTouching) {
                    this.startStroke(collision.point);
                    this.state = 'DRAWING';
                } else if (isPenGrabbed) {
                    this.state = 'GRABBED_NOT_DRAWING';
                }
                break;
                
            case 'GRABBED_NOT_DRAWING':
                if (isPenTouching) {
                    this.startStroke(collision.point);
                    this.state = 'DRAWING';
                } else if (!isPenGrabbed) {
                    this.state = 'IDLE';
                }
                break;
                
            case 'DRAWING':
                if (!isPenGrabbed || !isPenTouching) {
                    this.endStroke();
                    this.state = isPenGrabbed ? 'GRABBED_NOT_DRAWING' : 'IDLE';
                } else {
                    // Continue drawing - add points
                    this.addStrokePoint(collision.point);
                }
                break;
        }
    }

    /**
     * Handle pen collision with whiteboard (called from collision callback)
     */
    handlePenCollision(collision) {
        // This is called whenever pen touches whiteboard
        // The update() method handles the actual drawing logic
    }

    /**
     * Start a new stroke
     */
    startStroke(worldPoint) {
        // Convert world point to whiteboard local space
        const localPoint = this.convertToWhiteboardSpace(worldPoint);
        
        // Start stroke in renderer
        this.strokeRenderer.startStroke(localPoint);
        this.isDrawing = true;
        this.lastPointTime = performance.now();
        
        console.log('VR stroke started at', localPoint);
        
        // Trigger callback
        if (this.onDrawStartCallback) {
            this.onDrawStartCallback(localPoint);
        }
    }

    /**
     * Add point to current stroke
     */
    addStrokePoint(worldPoint) {
        if (!this.isDrawing) return;
        
        // Throttle point addition for performance (max points per second)
        const now = performance.now();
        const timeSinceLastPoint = now - this.lastPointTime;
        
        if (timeSinceLastPoint < this.minTimeBetweenPoints) {
            return; // Skip this point - too soon
        }
        
        // Convert world point to whiteboard local space
        const localPoint = this.convertToWhiteboardSpace(worldPoint);
        
        // Add point to stroke renderer
        this.strokeRenderer.addPoint(localPoint);
        this.lastPointTime = now;
        
        // Trigger callback
        if (this.onDrawMoveCallback) {
            this.onDrawMoveCallback(localPoint);
        }
    }

    /**
     * End current stroke
     */
    endStroke() {
        if (!this.isDrawing) return;
        
        // End stroke in renderer - returns smoothed points
        const points = this.strokeRenderer.endStroke();
        this.isDrawing = false;
        
        console.log('VR stroke ended with', points?.length || 0, 'points');
        
        // Trigger callback with points
        if (this.onDrawEndCallback) {
            this.onDrawEndCallback(points);
        }
    }

    /**
     * Convert world space point to whiteboard local space
     */
    convertToWhiteboardSpace(worldPoint) {
        const localPoint = new THREE.Vector3();
        this.whiteboard.worldToLocal(worldPoint.clone(), localPoint);
        return localPoint;
    }

    /**
     * Check if currently drawing
     */
    isCurrentlyDrawing() {
        return this.isDrawing;
    }

    /**
     * Get current drawing state
     */
    getState() {
        return this.state;
    }

    /**
     * Register callback for draw start
     */
    onDrawStart(callback) {
        this.onDrawStartCallback = callback;
    }

    /**
     * Register callback for draw move
     */
    onDrawMove(callback) {
        this.onDrawMoveCallback = callback;
    }

    /**
     * Register callback for draw end
     */
    onDrawEnd(callback) {
        this.onDrawEndCallback = callback;
    }

    /**
     * Clean up resources
     */
    dispose() {
        // End any active stroke
        if (this.isDrawing) {
            this.endStroke();
        }
        
        // Clear callbacks
        this.onDrawStartCallback = null;
        this.onDrawMoveCallback = null;
        this.onDrawEndCallback = null;
    }
}
