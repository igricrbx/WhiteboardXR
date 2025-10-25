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
        this.floor = null;
        this.skybox = null;
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

        // Create floor plane for VR spatial reference
        this.createFloor();
        
        // Create skybox for VR
        this.createSkybox();

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
     * Create floor plane with grid texture
     */
    createFloor() {
        const floorGeometry = new THREE.PlaneGeometry(10, 10);
        
        // Create grid texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Draw grid
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 1;
        
        // Draw grid lines
        const gridSize = 64;
        for (let i = 0; i <= 512; i += gridSize) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 512);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(512, i);
            ctx.stroke();
        }
        
        const gridTexture = new THREE.CanvasTexture(canvas);
        gridTexture.wrapS = THREE.RepeatWrapping;
        gridTexture.wrapT = THREE.RepeatWrapping;
        gridTexture.repeat.set(5, 5);
        
        const floorMaterial = new THREE.MeshBasicMaterial({
            map: gridTexture,
            side: THREE.FrontSide
        });
        
        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2; // Make horizontal
        this.floor.position.y = 0;
        this.floor.visible = false; // Hidden in desktop mode
        this.scene.add(this.floor);
    }
    
    /**
     * Create skybox for VR environment
     */
    createSkybox() {
        // Simple gradient sky dome
        const skyGeometry = new THREE.SphereGeometry(50, 32, 32);
        
        // Create gradient material
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 10 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        
        this.skybox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skybox.visible = false; // Hidden in desktop mode
        this.scene.add(this.skybox);
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
            this.vrCamera.position.set(0, 1.7, -3.5); // User spawn point (3.5m back from whiteboard)
            this.vrCamera.lookAt(0, 1.5, 0); // Look at whiteboard center
        }
        
        // Switch to VR camera
        this.camera = this.vrCamera;
        
        // Position whiteboard vertically for VR
        this.whiteboard.position.set(0, 1.5, 0);
        this.whiteboard.rotation.set(0, 0, 0); // Face forward (+Z direction)
        
        // Change background for VR
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        
        // Show floor and skybox in VR
        if (this.floor) this.floor.visible = true;
        if (this.skybox) this.skybox.visible = true;
        
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
        
        // Hide floor and skybox in desktop mode
        if (this.floor) this.floor.visible = false;
        if (this.skybox) this.skybox.visible = false;
        
        console.log('Desktop mode active');
    }
    
    /**
     * Check if currently in VR mode
     */
    isInVRMode() {
        return this.isVRMode;
    }
}
