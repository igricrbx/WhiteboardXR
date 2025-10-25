import * as THREE from 'three';

/**
 * Manages the 3D scene, camera, renderer, and whiteboard
 * This abstraction makes it easier to switch between desktop and XR rendering
 */
export class WhiteboardScene {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.desktopCamera = null; // Store desktop camera for mode switching
        this.vrCamera = null; // Store VR camera
        this.renderer = null;
        this.whiteboard = null;
        this.isVRMode = false;
        
        this.init();
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf5f5f5);

        // Setup orthographic camera (desktop mode)
        const aspect = window.innerWidth / window.innerHeight;
        const viewSize = 3; // Height in world units
        this.desktopCamera = new THREE.OrthographicCamera(
            -viewSize * aspect / 2,  // left
            viewSize * aspect / 2,   // right
            viewSize / 2,            // top
            -viewSize / 2,           // bottom
            0.1,                     // near
            100                      // far
        );
        this.desktopCamera.position.set(0, 0, 5);
        this.desktopCamera.lookAt(0, 0, 0);
        
        // Start in desktop mode
        this.camera = this.desktopCamera;

        // Create renderer (WebGL with XR support)
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.sortObjects = true; // Enable sorting by renderOrder
        this.renderer.xr.enabled = true; // Enable WebXR
        this.container.appendChild(this.renderer.domElement);

        // Create whiteboard (single unit for demo)
        const whiteboardGeometry = new THREE.PlaneGeometry(4, 3);
        const whiteboardMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff,
            side: THREE.FrontSide // Single-sided for VR
        });
        this.whiteboard = new THREE.Mesh(whiteboardGeometry, whiteboardMaterial);
        this.scene.add(this.whiteboard);

        // Setup resize handler
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    onWindowResize() {
        const aspect = window.innerWidth / window.innerHeight;
        const viewSize = 3;
        
        this.camera.left = -viewSize * aspect / 2;
        this.camera.right = viewSize * aspect / 2;
        this.camera.top = viewSize / 2;
        this.camera.bottom = -viewSize / 2;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    getRenderer() {
        return this.renderer;
    }

    getWhiteboard() {
        return this.whiteboard;
    }
    
    /**
     * Switch to VR mode
     */
    switchToVR() {
        console.log('Switching to VR mode');
        this.isVRMode = true;
        
        // Create perspective camera for VR (XR system will manage position)
        if (!this.vrCamera) {
            const aspect = window.innerWidth / window.innerHeight;
            this.vrCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
            this.vrCamera.position.set(0, 1.7, -2.0); // User spawn point
            this.vrCamera.lookAt(0, 1.5, 0); // Look at whiteboard center
        }
        
        // Switch to VR camera
        this.camera = this.vrCamera;
        
        // Position whiteboard vertically for VR
        this.whiteboard.position.set(0, 1.5, 0);
        this.whiteboard.rotation.set(0, 0, 0);
        
        // Change background for VR
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        
        console.log('VR mode active');
    }
    
    /**
     * Switch back to desktop mode
     */
    switchToDesktop() {
        console.log('Switching to desktop mode');
        this.isVRMode = false;
        
        // Switch back to desktop camera
        this.camera = this.desktopCamera;
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);
        
        // Reset whiteboard position for desktop
        this.whiteboard.position.set(0, 0, 0);
        this.whiteboard.rotation.set(0, 0, 0);
        
        // Restore desktop background
        this.scene.background = new THREE.Color(0xf5f5f5);
        
        console.log('Desktop mode active');
    }
    
    /**
     * Check if currently in VR mode
     */
    isInVRMode() {
        return this.isVRMode;
    }
}
