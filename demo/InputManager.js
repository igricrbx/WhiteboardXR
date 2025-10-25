import * as THREE from 'three';

export class InputManager {
    constructor(domElement, camera, whiteboard) {
        this.domElement = domElement;
        this.camera = camera;
        this.whiteboard = whiteboard;
        
        this.isDrawing = false;
        this.isPanning = false;
        this.drawingEnabled = true; // Can be disabled for select tool
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Camera control state
        this.lastPanPosition = new THREE.Vector2();
        this.zoomLevel = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 5000.0; // Increased zoom limit for deeper inspection

        // Callbacks (to be set by main app)
        this.onDrawStart = null;
        this.onDrawMove = null;
        this.onDrawEnd = null;
        this.onCameraUpdate = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.domElement.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.domElement.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        this.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        
        // Prevent context menu on right click
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch support for mobile/tablet testing
        this.domElement.addEventListener('touchstart', (e) => this.onTouchStart(e));
        this.domElement.addEventListener('touchmove', (e) => this.onTouchMove(e));
        this.domElement.addEventListener('touchend', (e) => this.onTouchEnd(e));
    }

    updateMousePosition(clientX, clientY) {
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    getWhiteboardIntersection() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.whiteboard);
        
        if (intersects.length > 0) {
            return intersects[0].point;
        }
        return null;
    }

    onMouseDown(event) {
        event.preventDefault();
        
        // Left mouse button (0) - drawing (if enabled)
        if (event.button === 0 && this.drawingEnabled) {
            this.updateMousePosition(event.clientX, event.clientY);
            
            const point = this.getWhiteboardIntersection();
            if (point) {
                this.isDrawing = true;
                if (this.onDrawStart) {
                    this.onDrawStart(point);
                }
            }
        }
        // Right mouse button (2) - panning
        else if (event.button === 2) {
            this.isPanning = true;
            this.lastPanPosition.set(event.clientX, event.clientY);
        }
    }

    onMouseMove(event) {
        event.preventDefault();
        
        // Always update mouse position for zoom-to-cursor
        this.updateMousePosition(event.clientX, event.clientY);
        
        // Handle drawing
        if (this.isDrawing) {
            const point = this.getWhiteboardIntersection();
            
            // If cursor left the whiteboard, end the stroke
            if (!point) {
                // Check if we're still over the canvas element (not over UI)
                const rect = this.domElement.getBoundingClientRect();
                const isOverCanvas = event.clientX >= rect.left && 
                                    event.clientX <= rect.right && 
                                    event.clientY >= rect.top && 
                                    event.clientY <= rect.bottom;
                
                // Only end stroke if we truly left the canvas (not just hovering over UI)
                if (isOverCanvas) {
                    this.isDrawing = false;
                    if (this.onDrawEnd) {
                        this.onDrawEnd(true); // Pass flag indicating cursor left canvas
                    }
                }
                return;
            }
            
            if (this.onDrawMove) {
                this.onDrawMove(point);
            }
        }
        // Handle panning
        else if (this.isPanning) {
            const deltaX = event.clientX - this.lastPanPosition.x;
            const deltaY = event.clientY - this.lastPanPosition.y;
            
            this.lastPanPosition.set(event.clientX, event.clientY);
            
            // Pan the camera (inversely proportional to zoom level for consistent feel)
            const aspect = window.innerWidth / window.innerHeight;
            const baseViewSize = 3;
            const viewSize = baseViewSize / this.zoomLevel;
            const panSpeed = (viewSize * aspect) / window.innerWidth;
            
            this.camera.position.x -= deltaX * panSpeed;
            this.camera.position.y += deltaY * panSpeed;
            
            if (this.onCameraUpdate) {
                this.onCameraUpdate();
            }
        }
    }

    onMouseUp(event) {
        event.preventDefault();
        
        if (this.isDrawing) {
            this.isDrawing = false;
            if (this.onDrawEnd) {
                this.onDrawEnd();
            }
        }
        
        if (this.isPanning) {
            this.isPanning = false;
        }
    }

    // Touch events (for future mobile/VR compatibility)
    onTouchStart(event) {
        event.preventDefault();
        if (event.touches.length > 0) {
            const touch = event.touches[0];
            this.updateMousePosition(touch.clientX, touch.clientY);
            
            const point = this.getWhiteboardIntersection();
            if (point) {
                this.isDrawing = true;
                if (this.onDrawStart) {
                    this.onDrawStart(point);
                }
            }
        }
    }

    onTouchMove(event) {
        event.preventDefault();
        
        if (!this.isDrawing) return;
        
        if (event.touches.length > 0) {
            const touch = event.touches[0];
            this.updateMousePosition(touch.clientX, touch.clientY);
            const point = this.getWhiteboardIntersection();
            
            if (point && this.onDrawMove) {
                this.onDrawMove(point);
            }
        }
    }

    onTouchEnd(event) {
        event.preventDefault();
        
        if (this.isDrawing) {
            this.isDrawing = false;
            if (this.onDrawEnd) {
                this.onDrawEnd();
            }
        }
    }

    onWheel(event) {
        event.preventDefault();
        
        // Get world position at cursor before zoom
        this.updateMousePosition(event.clientX, event.clientY);
        const worldPosBefore = this.getWorldPositionAtCursor();
        
        // Calculate new zoom level with exponential scaling for consistent feel
        const zoomSpeed = 0.0015;
        const delta = -event.deltaY * zoomSpeed;
        const oldZoomLevel = this.zoomLevel;
        
        // Apply exponential zoom (multiply instead of add for consistent relative speed)
        const zoomFactor = 1 + delta;
        this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel * zoomFactor));
        
        // Update camera frustum based on orthographic projection
        const aspect = window.innerWidth / window.innerHeight;
        const baseViewSize = 3;
        const viewSize = baseViewSize / this.zoomLevel;
        
        this.camera.left = -viewSize * aspect / 2;
        this.camera.right = viewSize * aspect / 2;
        this.camera.top = viewSize / 2;
        this.camera.bottom = -viewSize / 2;
        this.camera.updateProjectionMatrix();
        
        // Get world position at cursor after zoom
        const worldPosAfter = this.getWorldPositionAtCursor();
        
        // Adjust camera position to keep cursor at same world position
        if (worldPosBefore && worldPosAfter) {
            this.camera.position.x += worldPosBefore.x - worldPosAfter.x;
            this.camera.position.y += worldPosBefore.y - worldPosAfter.y;
        }
        
        if (this.onCameraUpdate) {
            this.onCameraUpdate();
        }
    }
    
    getWorldPositionAtCursor() {
        // Cast ray from camera through mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Intersect with the z=0 plane (whiteboard plane)
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersection = new THREE.Vector3();
        
        if (this.raycaster.ray.intersectPlane(plane, intersection)) {
            return intersection;
        }
        
        return null;
    }
    
    /**
     * Enable or disable drawing mode
     * @param {boolean} enabled - Whether drawing should be enabled
     */
    setDrawingEnabled(enabled) {
        this.drawingEnabled = enabled;
        
        // If currently drawing and disabling, end the stroke
        if (!enabled && this.isDrawing) {
            this.isDrawing = false;
            if (this.onDrawEnd) {
                this.onDrawEnd();
            }
        }
    }
}
