import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { StrokeRenderer } from './StrokeRenderer.js';
import { BezierStrokeManager } from './BezierStrokeManager.js';
import { ChunkedBezierStrokeManager } from './ChunkedBezierStrokeManager.js';
import { WhiteboardScene } from './managers/WhiteboardScene.js';
import { StrokeManager } from './managers/StrokeManager.js';
import { SelectionManager } from './managers/SelectionManager.js';
import { TransformManager } from './managers/TransformManager.js';
import { UIController } from './managers/UIController.js';
import { ImageManager } from './managers/ImageManager.js';
import { VRManager } from './managers/VRManager.js';
import { VRButton } from './managers/VRButton.js';
import { VRInputManager } from './managers/VRInputManager.js';
import { VRLocomotionManager } from './managers/VRLocomotionManager.js';
import { VRDebugDisplay } from './managers/VRDebugDisplay.js';
import { VRPenController } from './managers/VRPenController.js';
import { VRDrawingManager } from './managers/VRDrawingManager.js';

class WhiteboardDemo {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.strokeCountEl = document.getElementById('stroke-count');
        this.fpsEl = document.getElementById('fps');
        
        this.frameCount = 0;
        this.fpsUpdateTime = 0;
        
        this.vrManager = null;
        this.vrInputManager = null;
        this.vrLocomotionManager = null;
        this.vrDebugDisplay = null;
        this.vrPenController = null;
        this.vrDrawingManager = null;
        this.isVRMode = false;
        this.lastFrameTime = 0;
        
        this.init();
        this.setupEventListeners();
        this.animate();
    }

    init() {
        // Initialize scene
        this.whiteboardScene = new WhiteboardScene(this.container);
        const scene = this.whiteboardScene.getScene();
        const camera = this.whiteboardScene.getCamera();
        const renderer = this.whiteboardScene.getRenderer();
        const whiteboard = this.whiteboardScene.getWhiteboard();

        // Initialize legacy managers
        this.inputManager = new InputManager(renderer.domElement, camera, whiteboard);
        this.strokeRenderer = new StrokeRenderer(scene, camera, renderer, whiteboard);
        this.bezierStrokeManager = new BezierStrokeManager(scene);
        
        // Create shared stroke material for chunked rendering
        const strokeMaterial = this.bezierStrokeManager.strokeMaterial;
        this.chunkedBezierManager = new ChunkedBezierStrokeManager(scene, strokeMaterial, camera, whiteboard);

        // Initialize new managers
        this.strokeManager = new StrokeManager(scene, this.chunkedBezierManager);
        this.imageManager = new ImageManager(scene, whiteboard);
        
        // Share z-index counter between stroke and image managers
        this.globalZIndex = 0;
        this.strokeManager.getNextZIndex = () => this.globalZIndex++;
        this.imageManager.getNextZIndex = () => this.globalZIndex++;
        
        this.selectionManager = new SelectionManager(scene);
        this.transformManager = new TransformManager(this.strokeManager, this.selectionManager);
        this.transformManager.setImageManager(this.imageManager);
        this.uiController = new UIController();

        // Setup UI
        this.uiController.setupControls();
        this.setupUICallbacks();
        this.setupInputCallbacks();
        
        // Initialize VR
        this.initVR();
    }
    
    async initVR() {
        const scene = this.whiteboardScene.getScene();
        const renderer = this.whiteboardScene.getRenderer();
        const camera = this.whiteboardScene.getCamera();
        
        // Create VR manager
        this.vrManager = new VRManager(scene, renderer, camera);
        
        // Check if VR is supported
        const vrSupported = await this.vrManager.isVRSupported();
        
        if (vrSupported) {
            console.log('WebXR VR supported, creating VR button');
            
            // Create and add VR button
            const vrButton = VRButton.createButton(this.vrManager);
            document.body.appendChild(vrButton);
            
            // Setup VR session callbacks
            this.vrManager.onSessionStart((session) => {
                this.enterVRMode(session);
            });
            
            this.vrManager.onSessionEnd(() => {
                this.exitVRMode();
            });
        } else {
            console.log('WebXR VR not supported on this device');
        }
    }
    
    enterVRMode(session) {
        console.log('Entering VR mode');
        this.isVRMode = true;
        
        // Switch scene to VR mode
        this.whiteboardScene.switchToVR();
        
        // Disable desktop input
        this.inputManager.setDrawingEnabled(false);
        
        // Deselect all strokes (hide selection UI)
        this.selectionManager.deselectAllStrokes();
        
        // Setup VR input manager
        this.vrInputManager = new VRInputManager(this.vrManager);
        this.vrInputManager.setupControllers();
        
        // Get scene and camera for locomotion manager
        const scene = this.whiteboardScene.getScene();
        const camera = this.whiteboardScene.getCamera();
        
        // Setup VR locomotion manager
        const dolly = this.vrManager.getDolly();
        this.vrLocomotionManager = new VRLocomotionManager(dolly, scene, camera);
        this.lastFrameTime = performance.now();
        
        // Create VR debug display
        this.vrDebugDisplay = new VRDebugDisplay(scene);
        this.vrDebugDisplay.show();
        
        // Create VR pen controller
        const whiteboard = this.whiteboardScene.getWhiteboard();
        this.vrPenController = new VRPenController(scene, whiteboard, this.vrInputManager);
        this.vrPenController.show();
        
        // Create VR drawing manager
        this.vrDrawingManager = new VRDrawingManager(this.vrPenController, this.strokeRenderer, whiteboard);
        this.setupVRDrawingCallbacks();
        
        // Switch to XR animation loop
        const renderer = this.whiteboardScene.getRenderer();
        
        renderer.setAnimationLoop((time, frame) => {
            if (frame) {
                // VR mode - update controller input
                this.updateVRFrame(frame);
            }
            this.updateFPS();
            // Render the scene
            renderer.render(scene, camera);
        });
    }
    
    updateVRFrame(frame) {
        // Calculate delta time
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
        this.lastFrameTime = currentTime;
        
        // Update controller input state
        if (this.vrInputManager) {
            this.vrInputManager.update();
            
            // Apply locomotion based on controller input
            if (this.vrLocomotionManager) {
                const rightInput = this.vrInputManager.getRightController();
                const leftInput = this.vrInputManager.getLeftController();
                this.vrLocomotionManager.update(deltaTime, rightInput, leftInput);
            }
            
            // Update pen controller
            if (this.vrPenController) {
                const controllerGrips = this.vrManager.getControllerGrips();
                this.vrPenController.update(controllerGrips, deltaTime);
            }
            
            // Update drawing manager
            if (this.vrDrawingManager) {
                this.vrDrawingManager.update(deltaTime);
            }
        }
        
        // Update debug display
        if (this.vrDebugDisplay) {
            const camera = this.whiteboardScene.getCamera();
            const dolly = this.vrManager.getDolly();
            
            this.vrDebugDisplay.setDebugData({
                'Camera Pos': camera.position,
                'Camera Rot': {
                    x: camera.rotation.x * (180 / Math.PI),
                    y: camera.rotation.y * (180 / Math.PI),
                    z: camera.rotation.z * (180 / Math.PI)
                },
                'Dolly Pos': dolly.position,
                'Dolly Rot': {
                    x: dolly.rotation.x * (180 / Math.PI),
                    y: dolly.rotation.y * (180 / Math.PI),
                    z: dolly.rotation.z * (180 / Math.PI)
                },
                'FPS': Math.round(1 / deltaTime)
            });
        }
    }
    
    exitVRMode() {
        console.log('Exiting VR mode');
        this.isVRMode = false;
        
        // Clean up VR drawing manager
        if (this.vrDrawingManager) {
            this.vrDrawingManager.dispose();
            this.vrDrawingManager = null;
        }
        
        // Clean up VR pen controller
        if (this.vrPenController) {
            this.vrPenController.dispose();
            this.vrPenController = null;
        }
        
        // Switch scene back to desktop mode
        this.whiteboardScene.switchToDesktop();
        
        // Re-enable desktop input if pen tool is selected
        if (this.uiController.getCurrentTool() === 'pen') {
            this.inputManager.setDrawingEnabled(true);
        }
        
        // Clean up VR managers
        if (this.vrDebugDisplay) {
            this.vrDebugDisplay.dispose();
            this.vrDebugDisplay = null;
        }
        this.vrInputManager = null;
        this.vrLocomotionManager = null;
        this.lastFrameTime = 0;
        
        // Switch back to requestAnimationFrame
        const renderer = this.whiteboardScene.getRenderer();
        renderer.setAnimationLoop(null);
        this.animate(); // Resume desktop animation loop
    }

    setupUICallbacks() {
        // Pen width changes
        this.uiController.onPenWidthChange((width) => {
            this.strokeRenderer.previewLineWidth = width;
        });

        // Pen color changes
        this.uiController.onPenColorChange((color) => {
            this.strokeRenderer.previewLineColor = color.clone();
        });

        // Debug mode changes
        this.uiController.onDebugModeChange((enabled) => {
            this.strokeManager.setAllStrokesDebugMode(enabled);
        });
        // Tool changes
        this.uiController.onToolChange((tool) => {
            if (tool === 'pen') {
                this.inputManager.setDrawingEnabled(true);
                this.selectionManager.deselectAllStrokes();
            } else {
                this.inputManager.setDrawingEnabled(false);
            }
        });

        // Image import
        this.uiController.onImageImport(async (file) => {
            try {
                const camera = this.whiteboardScene.getCamera();
                // Place image at center of current view
                const position = new THREE.Vector3(0, 0, 0);
                
                const image = await this.imageManager.createImageFromFile(file, position);
                console.log('Image imported successfully:', file.name);
                
                // Update total content count
                this.updateContentCount();
            } catch (error) {
                console.error('Failed to import image:', error.message);
                alert(`Failed to import image: ${error.message}`);
            }
        });
    }

    setupInputCallbacks() {
        // Drawing callbacks
        this.inputManager.onDrawStart = (point) => {
            this.strokeRenderer.startStroke(point);
        };

        this.inputManager.onDrawMove = (point) => {
            this.strokeRenderer.addPoint(point);
        };

        this.inputManager.onDrawEnd = (leftCanvas = false) => {
            const points = this.strokeRenderer.endStroke(leftCanvas);
            if (points && points.length >= 4) {
                const simplifiedPoints = this.filterDensePoints(points, 0.005);
                
                console.log(`Point filtering: ${points.length} → ${simplifiedPoints.length} points`);

                const penSettings = this.uiController.getPenSettings();
                const bezierStroke = this.strokeManager.createStroke(simplifiedPoints, {
                    width: penSettings.width,
                    color: penSettings.color,
                    debugMode: penSettings.debugMode
                });
                
                if (bezierStroke) {
                    this.updateContentCount();
                    
                    const chunkStats = this.chunkedBezierManager.getStats(bezierStroke);
                    console.log(`Chunking: ${chunkStats.totalPoints} points → ${chunkStats.chunkCount} chunks, ${chunkStats.totalSegments} segments`);
                }
            }
        };

        this.inputManager.onCameraUpdate = () => {
            // Called when camera is updated via zoom/pan
        };
    }

    setupVRDrawingCallbacks() {
        // VR drawing callbacks - reuse the same stroke creation logic as desktop
        this.vrDrawingManager.onDrawStart((point) => {
            // Draw start is handled by VRDrawingManager -> StrokeRenderer
            console.log('VR draw start');
        });

        this.vrDrawingManager.onDrawMove((point) => {
            // Draw move is handled by VRDrawingManager -> StrokeRenderer
        });

        this.vrDrawingManager.onDrawEnd((points) => {
            // Same stroke finalization logic as desktop
            if (points && points.length >= 4) {
                const simplifiedPoints = this.filterDensePoints(points, 0.005);
                
                console.log(`VR stroke: ${points.length} → ${simplifiedPoints.length} points`);

                const penSettings = this.uiController.getPenSettings();
                const bezierStroke = this.strokeManager.createStroke(simplifiedPoints, {
                    width: penSettings.width,
                    color: penSettings.color,
                    debugMode: penSettings.debugMode
                });
                
                if (bezierStroke) {
                    this.updateContentCount();
                    
                    const chunkStats = this.chunkedBezierManager.getStats(bezierStroke);
                    console.log(`VR chunking: ${chunkStats.totalPoints} points → ${chunkStats.chunkCount} chunks, ${chunkStats.totalSegments} segments`);
                }
            }
        });
    }

    setupEventListeners() {
        const renderer = this.whiteboardScene.getRenderer();
        const camera = this.whiteboardScene.getCamera();
        const whiteboard = this.whiteboardScene.getWhiteboard();
        
        // Prevent context menu
        renderer.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Warn about unsaved work on page refresh/close
        window.addEventListener('beforeunload', (e) => {
            if (this.strokeManager.getStrokeCount() > 0) {
                e.preventDefault();
                e.returnValue = 'You have unsaved work. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
        
        // Mouse handlers for select tool
        renderer.domElement.addEventListener('mousedown', (e) => {
            if (this.uiController.getCurrentTool() === 'select' && e.button === 0) {
                this.handleSelectMouseDown(e);
            }
        });
        
        renderer.domElement.addEventListener('mousemove', (e) => {
            if (this.uiController.getCurrentTool() === 'select') {
                if (this.transformManager.isScalingStrokes()) {
                    this.handleScaleMove(e);
                } else if (this.transformManager.isDraggingStrokes()) {
                    this.handleDragMove(e);
                } else if (this.selectionManager.isDrawingBox()) {
                    this.handleSelectionBoxMove(e);
                } else {
                    this.handleHandleHover(e);
                }
            }
        });
        
        renderer.domElement.addEventListener('mouseup', (e) => {
            if (this.uiController.getCurrentTool() === 'select' && e.button === 0) {
                this.handleSelectMouseUp(e);
            }
        });
        
        // Keyboard handler for deletion
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && 
                this.selectionManager.getSelectedStrokes().length > 0) {
                e.preventDefault();
                this.deleteSelectedStrokes();
            }
        });
    }
    
    /**
     * Handle mouse down in select mode
     */
    handleSelectMouseDown(event) {
        const worldPoint = this.getWorldPoint(event);
        if (!worldPoint) return;
        
        // First check if clicking on a transform handle
        const raycaster = this.createRaycaster(event);
        const clickedHandle = this.selectionManager.getHandleAtPosition(raycaster);
        
        if (clickedHandle) {
            this.transformManager.startScaling(worldPoint, clickedHandle);
            return;
        }
        
        // Then check if clicking within the bounding box of selected strokes
        if (this.selectionManager.getSelectedStrokes().length > 0 && 
            this.selectionManager.isPointInBoundingBox(worldPoint)) {
            this.transformManager.startDragging(worldPoint);
            return;
        }
        
        const camera = this.whiteboardScene.getCamera();
        const viewHeight = camera.top - camera.bottom;
        const clickThreshold = viewHeight * 0.01;
        
        // Check for both strokes and images
        const clickedStroke = this.strokeManager.getStrokeAtPosition(worldPoint, clickThreshold);
        const clickedImage = this.imageManager.getImageAtPosition(worldPoint, clickThreshold);
        const clickedContent = clickedStroke || clickedImage;
        
        if (clickedContent) {
            // If clicking on selected content, start dragging
            if (this.selectionManager.getSelectedStrokes().includes(clickedContent)) {
                this.transformManager.startDragging(worldPoint);
            } else {
                // Select the new content (single selection)
                this.selectionManager.deselectAllStrokes();
                this.selectionManager.selectStroke(clickedContent);
            }
        } else {
            // No content clicked - start selection box
            this.selectionManager.deselectAllStrokes();
            this.selectionManager.startSelectionBox(worldPoint);
        }
    }
    
    /**
     * Handle mouse up in select mode
     */
    handleSelectMouseUp(event) {
        const renderer = this.whiteboardScene.getRenderer();
        
        if (this.transformManager.isScalingStrokes()) {
            this.transformManager.stopScaling();
            renderer.domElement.style.cursor = 'default';
        } else if (this.transformManager.isDraggingStrokes()) {
            this.transformManager.stopDragging();
        } else if (this.selectionManager.isDrawingBox()) {
            const bounds = this.selectionManager.finishSelectionBox();
            
            if (bounds) {
                // Find all strokes and images within the selection box
                const allStrokes = this.strokeManager.getStrokes();
                allStrokes.forEach(stroke => {
                    const isInside = this.selectionManager.isStrokeInBox(
                        stroke, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY
                    );
                    if (isInside) {
                        this.selectionManager.selectStroke(stroke);
                    }
                });
                
                const allImages = this.imageManager.getImages();
                allImages.forEach(image => {
                    const isInside = this.selectionManager.isStrokeInBox(
                        image, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY
                    );
                    if (isInside) {
                        this.selectionManager.selectStroke(image);
                    }
                });
            }
        }
    }
    
    /**
     * Handle drag move
     */
    handleDragMove(event) {
        const worldPoint = this.getWorldPoint(event);
        if (!worldPoint) return;
        
        this.transformManager.updateDrag(worldPoint);
    }
    
    /**
     * Handle scale move
     */
    handleScaleMove(event) {
        const worldPoint = this.getWorldPoint(event);
        if (!worldPoint) return;
        
        this.transformManager.updateScale(worldPoint);
    }
    
    /**
     * Handle selection box move
     */
    handleSelectionBoxMove(event) {
        const worldPoint = this.getWorldPoint(event);
        if (!worldPoint) return;
        
        this.selectionManager.updateSelectionBox(worldPoint);
    }
    
    /**
     * Handle handle hover
     */
    handleHandleHover(event) {
        const raycaster = this.createRaycaster(event);
        const hoveredHandle = this.selectionManager.getHandleAtPosition(raycaster);
        const renderer = this.whiteboardScene.getRenderer();
        
        this.selectionManager.updateHandleHover(hoveredHandle, renderer.domElement);
    }
    
    /**
     * Get world point from mouse event
     */
    getWorldPoint(event) {
        const renderer = this.whiteboardScene.getRenderer();
        const camera = this.whiteboardScene.getCamera();
        const whiteboard = this.whiteboardScene.getWhiteboard();
        
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        
        const intersects = raycaster.intersectObject(whiteboard);
        return intersects.length > 0 ? intersects[0].point : null;
    }
    
    /**
     * Create raycaster from mouse event
     */
    createRaycaster(event) {
        const renderer = this.whiteboardScene.getRenderer();
        const camera = this.whiteboardScene.getCamera();
        
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        
        return raycaster;
    }
    
    /**
     * Delete selected strokes and images
     */
    deleteSelectedStrokes() {
        const selectedContent = this.selectionManager.getSelectedStrokes();
        if (selectedContent.length === 0) return;
        
        const contentToDelete = [...selectedContent];
        
        // Deselect first (removes outlines and box)
        this.selectionManager.deselectAllStrokes();
        
        // Separate strokes and images
        const strokes = contentToDelete.filter(item => item.type !== 'image');
        const images = contentToDelete.filter(item => item.type === 'image');
        
        // Delete strokes
        if (strokes.length > 0) {
            this.strokeManager.deleteStrokes(strokes);
        }
        
        // Delete images
        if (images.length > 0) {
            this.imageManager.deleteImages(images);
        }
        
        this.updateContentCount();
        console.log(`Deleted ${strokes.length} stroke(s) and ${images.length} image(s)`);
    }
    
    /**
     * Update content count display
     */
    updateContentCount() {
        const totalCount = this.strokeManager.getStrokeCount() + this.imageManager.getImageCount();
        this.uiController.updateStrokeCount(totalCount);
    }
    
    /**
     * Filter out points that are too close together (removes dense clusters)
     */
    filterDensePoints(points, minDistance = 0.003) {
        if (points.length < 2) return points;
        
        const filtered = [points[0]]; // Always keep first point
        
        for (let i = 1; i < points.length - 1; i++) {
            const lastKept = filtered[filtered.length - 1];
            const dist = lastKept.distanceTo(points[i]);
            
            // Only keep point if it's far enough from the last kept point
            if (dist >= minDistance) {
                filtered.push(points[i]);
            }
        }
        
        // Always keep last point
        filtered.push(points[points.length - 1]);
        
        return filtered;
    }

    updateFPS() {
        this.frameCount++;
        const currentTime = performance.now();
        const deltaTime = currentTime - this.fpsUpdateTime;

        if (deltaTime >= 1000) {
            const fps = Math.round((this.frameCount * 1000) / deltaTime);
            this.uiController.updateFPS(fps);
            this.frameCount = 0;
            this.fpsUpdateTime = currentTime;
        }
    }

    animate() {
        // Desktop mode: Standard requestAnimationFrame
        // VR mode uses setAnimationLoop set in setupVRCallbacks
        if (!this.isVRMode) {
            requestAnimationFrame(() => this.animate());
            this.updateFPS();
            this.whiteboardScene.render();
        }
    }
}

// Start the application
new WhiteboardDemo();
