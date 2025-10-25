import * as THREE from 'three';

/**
 * Manages smooth locomotion in VR using thumbsticks
 * Right stick: forward/backward movement and rotation
 * Left stick: strafing left/right and forward/backward
 */
export class VRLocomotionManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.xrSession = null;
        this.scene = null;
        
        // Movement parameters
        this.movementSpeed = 1.0; // units per second
        this.rotationSpeed = Math.PI / 4; // 45 degrees per second
        
        // Controller references
        this.rightController = null;
        this.leftController = null;
        
        // Dolly for user movement
        this.dolly = new THREE.Group();
        this.dolly.position.set(0, 0, 0);
    }
    
    /**
     * Set movement speed
     */
    setMovementSpeed(speed) {
        this.movementSpeed = speed;
    }
    
    /**
     * Set rotation speed
     */
    setRotationSpeed(speed) {
        this.rotationSpeed = speed;
    }
    
    /**
     * Initialize locomotion system with VR session
     */
    init(scene, xrSession) {
        this.xrSession = xrSession;
        this.scene = scene;
        
        // Add dolly to scene
        scene.add(this.dolly);
        
        // Get controllers and add them to dolly
        this.rightController = this.renderer.xr.getController(0);
        this.leftController = this.renderer.xr.getController(1);
        
        // Add camera rig to dolly
        this.dolly.add(this.renderer.xr.getCamera());
        
        console.log('VR locomotion initialized');
    }
    
    /**
     * Update locomotion each frame
     */
    update(deltaTime) {
        if (!this.xrSession) return;
        
        // Get input sources (controllers)
        const inputSources = this.xrSession.inputSources;
        
        let rightGamepad = null;
        let leftGamepad = null;
        
        // Find right and left controllers
        for (const source of inputSources) {
            if (source.handedness === 'right' && source.gamepad) {
                rightGamepad = source.gamepad;
            } else if (source.handedness === 'left' && source.gamepad) {
                leftGamepad = source.gamepad;
            }
        }
        
        // Process right controller (forward/back + rotation)
        if (rightGamepad && rightGamepad.axes.length >= 4) {
            const rightStickX = rightGamepad.axes[2]; // Horizontal axis
            const rightStickY = rightGamepad.axes[3]; // Vertical axis
            
            // Apply deadzone
            const deadzone = 0.15;
            const moveForward = Math.abs(rightStickY) > deadzone ? -rightStickY : 0;
            const rotateAmount = Math.abs(rightStickX) > deadzone ? rightStickX : 0;
            
            if (moveForward !== 0) {
                this.moveForward(moveForward * this.movementSpeed * deltaTime);
            }
            
            if (rotateAmount !== 0) {
                this.rotate(rotateAmount * this.rotationSpeed * deltaTime);
            }
        }
        
        // Process left controller (strafe left/right + forward/back)
        if (leftGamepad && leftGamepad.axes.length >= 4) {
            const leftStickX = leftGamepad.axes[2]; // Horizontal axis
            const leftStickY = leftGamepad.axes[3]; // Vertical axis
            
            // Apply deadzone
            const deadzone = 0.15;
            const strafeRight = Math.abs(leftStickX) > deadzone ? leftStickX : 0;
            const strafeForward = Math.abs(leftStickY) > deadzone ? -leftStickY : 0;
            
            if (strafeRight !== 0) {
                this.strafe(strafeRight * this.movementSpeed * deltaTime);
            }
            
            if (strafeForward !== 0) {
                this.moveForward(strafeForward * this.movementSpeed * deltaTime);
            }
        }
    }
    
    /**
     * Move forward/backward relative to current rotation
     */
    moveForward(distance) {
        // Get forward direction from dolly rotation
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this.dolly.quaternion);
        forward.y = 0; // Keep movement horizontal
        forward.normalize();
        
        // Move dolly
        this.dolly.position.addScaledVector(forward, distance);
    }
    
    /**
     * Strafe left/right relative to current rotation
     */
    strafe(distance) {
        // Get right direction from dolly rotation
        const right = new THREE.Vector3(1, 0, 0);
        right.applyQuaternion(this.dolly.quaternion);
        right.y = 0;
        right.normalize();
        
        // Move dolly
        this.dolly.position.addScaledVector(right, distance);
    }
    
    /**
     * Rotate around Y axis
     */
    rotate(angle) {
        this.dolly.rotation.y -= angle;
    }
    
    /**
     * Teleport to specific position
     */
    teleportTo(position) {
        this.dolly.position.copy(position);
    }
    
    /**
     * Reset to origin
     */
    resetPosition() {
        this.dolly.position.set(0, 0, 0);
        this.dolly.rotation.set(0, 0, 0);
    }
    
    /**
     * Get current position
     */
    getPosition() {
        return this.dolly.position.clone();
    }
    
    /**
     * Clean up
     */
    dispose() {
        if (this.dolly && this.dolly.parent) {
            this.dolly.parent.remove(this.dolly);
        }
        this.xrSession = null;
        this.rightController = null;
        this.leftController = null;
    }
}
