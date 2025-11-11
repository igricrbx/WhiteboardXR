import * as THREE from 'three';

/**
 * Manages the 3D pen object in VR mode
 * Handles pen grabbing, collision with whiteboard, and visual feedback
 */
export class VRPenController {
    constructor(scene, whiteboard, vrInputManager) {
        this.scene = scene;
        this.whiteboard = whiteboard;
        this.vrInputManager = vrInputManager;
        
        // Pen state
        this.pen = null;
        this.penTipMarker = null;
        this.isGrabbed = false;
        this.wasGripPressed = false;
        this.grabThreshold = 0.5; // Grip button threshold
        this.grabbedControllerIndex = null;
        
        // Collision state
        this.lastValidPosition = new THREE.Vector3();
        this.collisionDistance = 0.015; // Distance from whiteboard surface where pen stops
        
        // Visual feedback
        this.tipGlowIntensity = 0;
        this.targetGlowIntensity = 0;
        this.glowNearDistance = 0.05; // Distance at which glow starts
        
        // Callbacks
        this.onGrabCallback = null;
        this.onReleaseCallback = null;
        this.onCollisionCallback = null;
        
        this.createPen();
    }

    /**
     * Create the 3D pen model
     */
    createPen() {
        // Create pen group
        this.pen = new THREE.Group();
        this.pen.name = 'VRPen';
        
        // Pen body (cylinder)
        const bodyGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.15, 16);
        const bodyMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x333333,
            side: THREE.DoubleSide
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.name = 'PenBody';
        this.pen.add(body);
        
        // Pen tip (cone)
        const tipGeometry = new THREE.ConeGeometry(0.01, 0.03, 16);
        const tipMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x666666,
            side: THREE.DoubleSide
        });
        const tip = new THREE.Mesh(tipGeometry, tipMaterial);
        tip.name = 'PenTip';
        tip.position.y = -0.075 - 0.015; // Half body length + half tip length
        this.pen.add(tip);
        
        // Tip marker (tiny sphere for precise collision detection)
        const markerGeometry = new THREE.SphereGeometry(0.0005, 8, 8);
        const markerMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            transparent: true,
            opacity: 0.0 // Invisible by default
        });
        this.penTipMarker = new THREE.Mesh(markerGeometry, markerMaterial);
        this.penTipMarker.name = 'PenTipMarker';
        this.penTipMarker.position.y = -0.075 - 0.03; // At the very tip
        this.pen.add(this.penTipMarker);
        
        // Position pen at spawn point (slightly to right and in front of user)
        this.pen.position.set(0.3, 1.5, 2.7); // Adjusted to be in front of whiteboard
        this.pen.rotation.x = Math.PI / 2; // Tip pointing forward
        
        // Store initial position as last valid position
        this.lastValidPosition.copy(this.pen.position);
        
        // Add to scene
        this.scene.add(this.pen);
        
        console.log('VR pen created and positioned');
    }

    /**
     * Update pen state each frame
     */
    update(controllerGrips, deltaTime) {
        if (!this.pen) return;
        
        // Get right controller input (index 0)
        const rightInput = this.vrInputManager.getRightController();
        const isGripPressed = rightInput.grip;
        
        // Detect grip press/release events
        if (isGripPressed && !this.wasGripPressed && !this.isGrabbed) {
            this.grabPen(controllerGrips[0], 0);
        } else if (!isGripPressed && this.wasGripPressed && this.isGrabbed) {
            this.releasePen();
        }
        
        this.wasGripPressed = isGripPressed;
        
        // If grabbed, update pen position with collision
        if (this.isGrabbed && this.grabbedControllerIndex !== null) {
            this.updateGrabbedPenPosition(controllerGrips[this.grabbedControllerIndex]);
        }
        
        // Update visual feedback
        this.updateVisualFeedback(deltaTime);
        
        // Check collision state for callbacks
        const collision = this.checkWhiteboardCollision();
        if (collision.touching && this.onCollisionCallback) {
            this.onCollisionCallback(collision);
        }
    }

    /**
     * Grab the pen with a controller
     */
    grabPen(controllerGrip, controllerIndex) {
        if (!controllerGrip) return;
        
        this.isGrabbed = true;
        this.grabbedControllerIndex = controllerIndex;
        
        // Get world position before parenting
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        this.pen.getWorldPosition(worldPos);
        this.pen.getWorldQuaternion(worldQuat);
        
        // Store as last valid position
        this.lastValidPosition.copy(worldPos);
        
        // Parent to controller grip
        this.pen.parent = controllerGrip;
        
        // Set local transform for natural pen holding
        this.pen.position.set(0, 0, 0);
        this.pen.rotation.set(Math.PI / 2, 0, 0); // Tip pointing forward along controller
        
        console.log(`Pen grabbed by controller ${controllerIndex}`);
        
        if (this.onGrabCallback) {
            this.onGrabCallback();
        }
    }

    /**
     * Release the pen
     */
    releasePen() {
        if (!this.pen.parent || this.pen.parent === this.scene) {
            this.isGrabbed = false;
            return;
        }
        
        // Get world transform before unparenting
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        this.pen.getWorldPosition(worldPos);
        this.pen.getWorldQuaternion(worldQuat);
        
        // Unparent from controller
        this.pen.parent = this.scene;
        
        // Apply world transform
        this.pen.position.copy(worldPos);
        this.pen.quaternion.copy(worldQuat);
        
        // Store as last valid position
        this.lastValidPosition.copy(worldPos);
        
        this.isGrabbed = false;
        this.grabbedControllerIndex = null;
        
        console.log('Pen released');
        
        if (this.onReleaseCallback) {
            this.onReleaseCallback();
        }
    }

    /**
     * Update pen position while grabbed, with collision constraint
     */
    updateGrabbedPenPosition(controllerGrip) {
        if (!this.isGrabbed || !controllerGrip) return;
        
        // Get the desired pen tip position in world space
        const desiredTipPos = new THREE.Vector3();
        this.penTipMarker.getWorldPosition(desiredTipPos);
        
        // Check collision with whiteboard
        const collision = this.checkWhiteboardProximity(desiredTipPos);
        
        if (collision.tooClose) {
            // Pen is trying to go through whiteboard - constrain it
            
            // Get pen world position
            const penWorldPos = new THREE.Vector3();
            this.pen.getWorldPosition(penWorldPos);
            
            // Calculate offset from pen to tip
            const tipOffset = new THREE.Vector3();
            tipOffset.copy(desiredTipPos).sub(penWorldPos);
            
            // Project correction back to pen position
            const correction = new THREE.Vector3(0, 0, collision.penetrationDepth);
            const correctedPenPos = new THREE.Vector3();
            correctedPenPos.copy(penWorldPos).add(correction);
            
            // Convert to controller local space
            const controllerWorldPos = new THREE.Vector3();
            const controllerWorldQuat = new THREE.Quaternion();
            controllerGrip.getWorldPosition(controllerWorldPos);
            controllerGrip.getWorldQuaternion(controllerWorldQuat);
            
            // Calculate where pen should be in controller local space
            const localOffset = new THREE.Vector3();
            localOffset.copy(correctedPenPos).sub(controllerWorldPos);
            
            // Apply inverse rotation to get local offset
            const invQuat = controllerWorldQuat.clone().invert();
            localOffset.applyQuaternion(invQuat);
            
            // Update pen local position (constrained)
            this.pen.position.copy(localOffset);
            
            // Store last valid world position
            this.lastValidPosition.copy(correctedPenPos);
        } else {
            // No collision - store current position as valid
            const penWorldPos = new THREE.Vector3();
            this.pen.getWorldPosition(penWorldPos);
            this.lastValidPosition.copy(penWorldPos);
        }
    }

    /**
     * Check if pen tip is too close to whiteboard (for collision constraint)
     */
    checkWhiteboardProximity(tipWorldPos) {
        // Get whiteboard position and normal
        const whiteboardPos = new THREE.Vector3();
        this.whiteboard.getWorldPosition(whiteboardPos);
        
        // Whiteboard faces -Z direction (normal is (0, 0, -1))
        const whiteboardNormal = new THREE.Vector3(0, 0, -1);
        
        // Calculate signed distance from tip to whiteboard plane
        const toTip = new THREE.Vector3().subVectors(tipWorldPos, whiteboardPos);
        const signedDistance = toTip.dot(whiteboardNormal);
        
        // Negative distance means pen is behind whiteboard (penetrating)
        // Positive distance means pen is in front
        const isTooClose = signedDistance < this.collisionDistance;
        const penetrationDepth = isTooClose ? (this.collisionDistance - signedDistance) : 0;
        
        return {
            tooClose: isTooClose,
            penetrationDepth: penetrationDepth,
            signedDistance: signedDistance
        };
    }

    /**
     * Check if pen tip is touching whiteboard (for drawing detection)
     */
    checkWhiteboardCollision() {
        // Get pen tip world position
        const tipWorldPos = new THREE.Vector3();
        this.penTipMarker.getWorldPosition(tipWorldPos);
        
        // Get whiteboard position
        const whiteboardPos = new THREE.Vector3();
        this.whiteboard.getWorldPosition(whiteboardPos);
        
        // Create raycaster from tip toward whiteboard
        const whiteboardNormal = new THREE.Vector3(0, 0, -1);
        const rayDirection = whiteboardNormal.clone().negate();
        const raycaster = new THREE.Raycaster(tipWorldPos, rayDirection, 0, 0.02);
        
        const intersects = raycaster.intersectObject(this.whiteboard);
        
        if (intersects.length > 0) {
            const intersection = intersects[0];
            const distance = intersection.distance;
            
            // Check if tip is close enough to be considered "touching"
            // and approaching from front side
            if (distance < 0.002 && tipWorldPos.z < whiteboardPos.z) {
                return {
                    touching: true,
                    point: intersection.point,
                    distance: distance
                };
            }
        }
        
        return {
            touching: false,
            point: null,
            distance: Infinity
        };
    }

    /**
     * Update visual feedback based on proximity to whiteboard
     */
    updateVisualFeedback(deltaTime) {
        if (!this.pen || !this.penTipMarker) return;
        
        // Get tip world position
        const tipWorldPos = new THREE.Vector3();
        this.penTipMarker.getWorldPosition(tipWorldPos);
        
        // Get whiteboard position
        const whiteboardPos = new THREE.Vector3();
        this.whiteboard.getWorldPosition(whiteboardPos);
        
        // Calculate distance to whiteboard
        const distance = Math.abs(tipWorldPos.z - whiteboardPos.z);
        
        // Update target glow based on distance
        if (distance < this.glowNearDistance) {
            // Closer = more glow (inverse relationship)
            this.targetGlowIntensity = 1.0 - (distance / this.glowNearDistance);
        } else {
            this.targetGlowIntensity = 0;
        }
        
        // Smooth glow transition
        const glowSpeed = 5.0; // Glow change speed
        this.tipGlowIntensity += (this.targetGlowIntensity - this.tipGlowIntensity) * glowSpeed * deltaTime;
        
        // Apply glow to pen tip material
        const tip = this.pen.getObjectByName('PenTip');
        if (tip && tip.material) {
            // Interpolate between base color and bright color
            const baseColor = new THREE.Color(0x666666);
            const glowColor = new THREE.Color(0x00ff00); // Green glow
            tip.material.color.copy(baseColor).lerp(glowColor, this.tipGlowIntensity);
        }
    }

    /**
     * Get pen tip world position
     */
    getPenTipWorldPosition() {
        if (!this.penTipMarker) return new THREE.Vector3();
        
        const tipPos = new THREE.Vector3();
        this.penTipMarker.getWorldPosition(tipPos);
        return tipPos;
    }

    /**
     * Check if pen is currently grabbed
     */
    isPenGrabbed() {
        return this.isGrabbed;
    }

    /**
     * Get the pen object
     */
    getPen() {
        return this.pen;
    }

    /**
     * Show the pen
     */
    show() {
        if (this.pen) {
            this.pen.visible = true;
        }
    }

    /**
     * Hide the pen
     */
    hide() {
        if (this.pen) {
            this.pen.visible = false;
        }
    }

    /**
     * Set pen color (tip color)
     */
    setPenColor(color) {
        const tip = this.pen?.getObjectByName('PenTip');
        if (tip && tip.material) {
            tip.material.color.set(color);
        }
    }

    /**
     * Clean up pen resources
     */
    dispose() {
        if (this.pen) {
            this.scene.remove(this.pen);
            
            // Dispose geometries and materials
            this.pen.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            
            this.pen = null;
            this.penTipMarker = null;
        }
    }

    /**
     * Register callback for pen grab event
     */
    onGrab(callback) {
        this.onGrabCallback = callback;
    }

    /**
     * Register callback for pen release event
     */
    onRelease(callback) {
        this.onReleaseCallback = callback;
    }

    /**
     * Register callback for pen collision with whiteboard
     */
    onCollision(callback) {
        this.onCollisionCallback = callback;
    }
}
