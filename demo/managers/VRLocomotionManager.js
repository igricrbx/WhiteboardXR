import * as THREE from 'three';

/**
 * Manages smooth locomotion (movement and rotation) in VR
 */
export class VRLocomotionManager {
    constructor(dolly, scene, camera) {
        this.dolly = dolly;
        this.scene = scene;
        this.camera = camera;
        
        // Movement parameters
        this.moveSpeed = 2.0; // meters per second
        this.rotationSpeed = Math.PI / 2; // 90 degrees per second
        
        // Smoothing
        this.velocitySmoothing = 0.2; // Lower = smoother but more lag
        this.currentVelocity = new THREE.Vector3();
        this.currentRotationVelocity = 0;
    }

    /**
     * Update locomotion based on controller input
     * @param {number} deltaTime - Time since last frame in seconds
     * @param {Object} rightInput - Right controller input state
     * @param {Object} leftInput - Left controller input state
     */
    update(deltaTime, rightInput, leftInput) {
        if (!deltaTime || deltaTime <= 0) return;
        
        // Get input values
        const rightStick = rightInput.thumbstick;
        const leftStick = leftInput.thumbstick;
        
        // Right stick: movement only (forward/backward on Y, strafe left/right on X)
        const forwardInput = rightStick.y; // Don't invert - positive = forward
        const strafeInput = rightStick.x;
        
        // Left stick: rotation only (left/right on X)
        const rotationInput = leftStick.x; // Positive = turn right, negative = turn left
        
        // Calculate target velocities
        const targetForward = forwardInput * this.moveSpeed;
        const targetStrafe = strafeInput * this.moveSpeed;
        const targetRotation = rotationInput * this.rotationSpeed;
        
        // Apply smoothing to velocities
        const smoothFactor = 1.0 - Math.pow(1.0 - this.velocitySmoothing, deltaTime * 60);
        
        this.currentVelocity.x = THREE.MathUtils.lerp(
            this.currentVelocity.x,
            targetStrafe,
            smoothFactor
        );
        this.currentVelocity.z = THREE.MathUtils.lerp(
            this.currentVelocity.z,
            targetForward,
            smoothFactor
        );
        this.currentRotationVelocity = THREE.MathUtils.lerp(
            this.currentRotationVelocity,
            targetRotation,
            smoothFactor
        );
        
        // Apply rotation around the user's position (origin in VR space)
        if (Math.abs(this.currentRotationVelocity) > 0.001) {
            const rotationAmount = this.currentRotationVelocity * deltaTime;
            
            // Store current dolly position
            const dollyPos = this.dolly.position.clone();
            
            // Rotate the dolly around the Y axis
            this.dolly.rotation.y += rotationAmount;
            
            // Rotate the dolly's position around the origin (user's feet)
            // This prevents the world from rotating around the dolly's position
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeRotationY(rotationAmount);
            dollyPos.applyMatrix4(rotationMatrix);
            
            this.dolly.position.copy(dollyPos);
        }
        
        // Calculate movement based on camera's actual facing direction
        if (this.currentVelocity.lengthSq() > 0.0001) {
            const movement = new THREE.Vector3();
            
            // Get camera's forward direction (where user is looking)
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            cameraDirection.y = 0; // Keep movement horizontal
            cameraDirection.normalize();
            
            // Get camera's right direction
            const cameraRight = new THREE.Vector3();
            cameraRight.crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection);
            cameraRight.normalize();
            
            // Forward/backward relative to where user is looking
            movement.add(cameraDirection.multiplyScalar(this.currentVelocity.z * deltaTime));
            
            // Strafe left/right relative to where user is looking
            movement.add(cameraRight.multiplyScalar(this.currentVelocity.x * deltaTime));
            
            // Apply movement to dolly
            this.dolly.position.add(movement);
        }
    }

    /**
     * Set movement speed (meters per second)
     */
    setMoveSpeed(speed) {
        this.moveSpeed = Math.max(0.1, speed);
    }

    /**
     * Set rotation speed (radians per second)
     */
    setRotationSpeed(speed) {
        this.rotationSpeed = Math.max(0.1, speed);
    }

    /**
     * Get current movement speed
     */
    getMoveSpeed() {
        return this.moveSpeed;
    }

    /**
     * Get current rotation speed (in degrees per second for display)
     */
    getRotationSpeedDegrees() {
        return this.rotationSpeed * (180 / Math.PI);
    }

    /**
     * Teleport dolly to a specific position
     */
    teleportTo(position) {
        this.dolly.position.copy(position);
        this.currentVelocity.set(0, 0, 0);
        this.currentRotationVelocity = 0;
    }

    /**
     * Reset dolly to origin
     */
    reset() {
        this.dolly.position.set(0, 0, 0);
        this.dolly.rotation.set(0, 0, 0);
        this.currentVelocity.set(0, 0, 0);
        this.currentRotationVelocity = 0;
    }
}
