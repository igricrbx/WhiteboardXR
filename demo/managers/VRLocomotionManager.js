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
        
        // Movement parameters
        this.movementSpeed = 1.0; // units per second
        this.rotationSpeed = Math.PI / 4; // 45 degrees per second
        
        // Controller references
        this.rightController = null;
        this.leftController = null;
        
        // User position and rotation (accumulated offsets)
        this.position = new THREE.Vector3(0, 0, 0);
        this.rotation = 0; // Y-axis rotation in radians
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
        
        // Get controllers
        this.rightController = this.renderer.xr.getController(0);
        this.leftController = this.renderer.xr.getController(1);
        
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
        // Calculate forward direction based on current rotation
        const forward = new THREE.Vector3(
            -Math.sin(this.rotation),  // Negative because we move scene opposite to user
            0,
            -Math.cos(this.rotation)
        );
        
        // Move all scene objects (opposite to user movement)
        this.scene.children.forEach(child => {
            if (child !== this.rightController && child !== this.leftController) {
                child.position.x += forward.x * distance;
                child.position.z += forward.z * distance;
            }
        });
    }
    
    /**
     * Strafe left/right relative to current rotation
     */
    strafe(distance) {
        // Calculate right direction (perpendicular to forward)
        const right = new THREE.Vector3(
            -Math.cos(this.rotation),  // Negative because we move scene opposite to user
            0,
            Math.sin(this.rotation)
        );
        
        // Move all scene objects (opposite to user movement)
        this.scene.children.forEach(child => {
            if (child !== this.rightController && child !== this.leftController) {
                child.position.x += right.x * distance;
                child.position.z += right.z * distance;
            }
        });
    }
    
    /**
     * Rotate around Y axis
     */
    rotate(angle) {
        this.rotation -= angle;
        
        // Rotate all scene objects around the origin
        this.scene.children.forEach(child => {
            if (child !== this.rightController && child !== this.leftController) {
                // Rotate position around origin
                const x = child.position.x;
                const z = child.position.z;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                child.position.x = x * cos + z * sin;
                child.position.z = -x * sin + z * cos;
                
                // Rotate the object itself
                child.rotation.y += angle;
            }
        });
    }
    
    /**
     * Get transform matrix for XR reference space
     */
    getTransform() {
        const matrix = new THREE.Matrix4();
        matrix.makeRotationY(this.rotation);
        matrix.setPosition(this.position);
        return matrix;
    }
    
    /**
     * Teleport to specific position
     */
    teleportTo(position) {
        this.position.copy(position);
    }
    
    /**
     * Reset to origin
     */
    resetPosition() {
        this.position.set(0, 0, 0);
        this.rotation = 0;
    }
    
    /**
     * Get current position
     */
    getPosition() {
        return this.position.clone();
    }
    
    /**
     * Clean up
     */
    dispose() {
        this.xrSession = null;
        this.rightController = null;
        this.leftController = null;
    }
}
