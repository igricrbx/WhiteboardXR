import * as THREE from 'three';

/**
 * Manages smooth locomotion (movement and rotation) in VR
 */
export class VRLocomotionManager {
    constructor(dolly, scene, camera) {
        this.dolly = dolly;
        this.scene = scene;
        this.camera = camera; // VR camera for rotation center
        
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
        
        // Apply rotation around camera position (user's head)
        if (Math.abs(this.currentRotationVelocity) > 0.001) {
            const rotationAmount = this.currentRotationVelocity * deltaTime;
            
            // Get camera's world position
            const cameraWorldPos = new THREE.Vector3();
            this.camera.getWorldPosition(cameraWorldPos);
            
            // Convert to dolly's local space
            const cameraLocalPos = new THREE.Vector3();
            cameraLocalPos.copy(cameraWorldPos);
            this.dolly.worldToLocal(cameraLocalPos);
            
            // Translate dolly so camera is at origin
            const dollyOffset = new THREE.Vector3();
            dollyOffset.copy(cameraLocalPos);
            dollyOffset.applyQuaternion(this.dolly.quaternion);
            this.dolly.position.sub(dollyOffset);
            
            // Rotate dolly (now camera is at the pivot)
            this.dolly.rotation.y += rotationAmount;
            
            // Translate back
            dollyOffset.set(cameraLocalPos.x, cameraLocalPos.y, cameraLocalPos.z);
            dollyOffset.applyQuaternion(this.dolly.quaternion);
            this.dolly.position.add(dollyOffset);
        }
        
        // Calculate movement in dolly's local space
        if (this.currentVelocity.lengthSq() > 0.0001) {
            const movement = new THREE.Vector3();
            
            // Forward/backward relative to dolly's facing direction
            const forward = new THREE.Vector3(0, 0, 1);
            forward.applyQuaternion(this.dolly.quaternion);
            forward.y = 0; // Keep movement horizontal
            forward.normalize();
            movement.add(forward.multiplyScalar(this.currentVelocity.z * deltaTime));
            
            // Strafe left/right relative to dolly's facing direction
            const right = new THREE.Vector3(1, 0, 0);
            right.applyQuaternion(this.dolly.quaternion);
            right.y = 0; // Keep movement horizontal
            right.normalize();
            movement.add(right.multiplyScalar(this.currentVelocity.x * deltaTime));
            
            // Apply movement
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
