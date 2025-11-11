import * as THREE from 'three';

/**
 * Manages WebXR session lifecycle and VR mode switching
 */
export class VRManager {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        
        this.xrSession = null;
        this.isVRActive = false;
        
        // Callbacks (support multiple)
        this.onSessionStartCallbacks = [];
        this.onSessionEndCallbacks = [];
        
        // Controller references
        this.controllers = [];
        this.controllerGrips = [];
        
        // Hand markers for visualization
        this.handMarkers = new Map(); // Maps 'left'/'right' to marker mesh
    }

    /**
     * Check if WebXR is supported in this browser
     */
    static async isWebXRSupported() {
        if (!navigator.xr) {
            console.warn('WebXR not supported in this browser');
            return false;
        }
        return true;
    }

    /**
     * Check if VR mode is supported (immersive-vr)
     */
    async isVRSupported() {
        if (!await VRManager.isWebXRSupported()) {
            return false;
        }

        try {
            const supported = await navigator.xr.isSessionSupported('immersive-vr');
            if (supported) {
                console.log('VR (immersive-vr) is supported');
            } else {
                console.log('VR (immersive-vr) is not supported');
            }
            return supported;
        } catch (error) {
            console.error('Error checking VR support:', error);
            return false;
        }
    }

    /**
     * Request and initialize a VR session
     */
    async requestVRSession() {
        if (this.isVRActive) {
            console.warn('VR session already active');
            return this.xrSession;
        }

        if (!await this.isVRSupported()) {
            throw new Error('VR not supported');
        }

        try {
            // Request XR session
            const session = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            });

            console.log('VR session created successfully');
            
            // Enable XR on renderer
            await this.renderer.xr.setSession(session);
            this.xrSession = session;
            this.isVRActive = true;

            // Setup session event handlers
            session.addEventListener('end', () => {
                this.handleSessionEnd();
            });

            // Initialize controllers
            this.setupControllers();

            // Trigger start callbacks
            this.onSessionStartCallbacks.forEach(callback => callback(session));

            return session;
        } catch (error) {
            console.error('Failed to start VR session:', error);
            throw error;
        }
    }

    /**
     * Exit the current VR session
     */
    async exitVRSession() {
        if (!this.xrSession) {
            console.warn('No active VR session to exit');
            return;
        }

        try {
            await this.xrSession.end();
            console.log('VR session ended');
        } catch (error) {
            console.error('Error ending VR session:', error);
        }
    }

    /**
     * Handle session end (called automatically by XR system)
     */
    handleSessionEnd() {
        console.log('VR session ended event');
        
        this.isVRActive = false;
        this.xrSession = null;
        
        // Clean up controllers
        this.cleanupControllers();

        // Trigger end callbacks
        this.onSessionEndCallbacks.forEach(callback => callback());
    }

    /**
     * Setup XR controllers
     */
    setupControllers() {
        // Controller 0
        const controller0 = this.renderer.xr.getController(0);
        this.scene.add(controller0);
        this.controllers.push(controller0);

        const grip0 = this.renderer.xr.getControllerGrip(0);
        this.scene.add(grip0);
        this.controllerGrips.push(grip0);

        // Controller 1
        const controller1 = this.renderer.xr.getController(1);
        this.scene.add(controller1);
        this.controllers.push(controller1);

        const grip1 = this.renderer.xr.getControllerGrip(1);
        this.scene.add(grip1);
        this.controllerGrips.push(grip1);
        
        // Add connection listeners to determine handedness
        controller0.addEventListener('connected', (event) => {
            this.onControllerConnected(event, 0, grip0);
        });
        
        controller1.addEventListener('connected', (event) => {
            this.onControllerConnected(event, 1, grip1);
        });

        console.log('VR controllers initialized');
    }
    
    /**
     * Handle controller connection and add hand markers
     */
    onControllerConnected(event, index, grip) {
        const inputSource = event.data;
        const hand = inputSource.handedness; // 'left', 'right', or 'none'
        
        console.log(`Controller ${index} connected with hand: ${hand}`);
        
        if (hand === 'left' || hand === 'right') {
            // Remove existing marker if any
            if (this.handMarkers.has(hand)) {
                const oldMarker = this.handMarkers.get(hand);
                oldMarker.parent.remove(oldMarker);
                oldMarker.geometry.dispose();
                oldMarker.material.dispose();
            }
            
            // Create hand marker sphere
            const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
            const markerMaterial = new THREE.MeshBasicMaterial({
                color: hand === 'left' ? 0xff0000 : 0x0000ff, // Red for left, blue for right
                transparent: true,
                opacity: 0.7
            });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.name = `${hand}HandMarker`;
            
            // Add to grip space
            grip.add(marker);
            this.handMarkers.set(hand, marker);
            
            console.log(`Added ${hand} hand marker (${hand === 'left' ? 'RED' : 'BLUE'})`);
        }
    }

    /**
     * Clean up controllers when exiting VR
     */
    cleanupControllers() {
        // Clean up hand markers
        for (const [hand, marker] of this.handMarkers.entries()) {
            if (marker.parent) {
                marker.parent.remove(marker);
            }
            marker.geometry.dispose();
            marker.material.dispose();
        }
        this.handMarkers.clear();
        
        this.controllers.forEach(controller => {
            this.scene.remove(controller);
        });
        this.controllerGrips.forEach(grip => {
            this.scene.remove(grip);
        });
        
        this.controllers = [];
        this.controllerGrips = [];
    }

    /**
     * Get controller objects
     */
    getControllers() {
        return this.controllers;
    }

    /**
     * Get controller grip spaces
     */
    getControllerGrips() {
        return this.controllerGrips;
    }

    /**
     * Get specific controller by index
     */
    getController(index) {
        return this.controllers[index] || null;
    }

    /**
     * Get specific controller grip by index
     */
    getControllerGrip(index) {
        return this.controllerGrips[index] || null;
    }

    /**
     * Check if currently in VR mode
     */
    isInVR() {
        return this.isVRActive;
    }

    /**
     * Get current XR session
     */
    getCurrentSession() {
        return this.xrSession;
    }

    /**
     * Get the dolly (camera rig) object
     */
    getDolly() {
        return this.renderer.xr.getCamera().parent || this.scene;
    }

    /**
     * Register callback for session start
     */
    onSessionStart(callback) {
        this.onSessionStartCallbacks.push(callback);
    }

    /**
     * Register callback for session end  
     */
    onSessionEnd(callback) {
        this.onSessionEndCallbacks.push(callback);
    }
}