import * as THREE from 'three';

/**
 * Manages VR controller input (buttons, thumbsticks, triggers)
 */
export class VRInputManager {
    constructor(vrManager) {
        this.vrManager = vrManager;
        this.controllers = [];
        this.gamepadStates = new Map();
        
        // Hand mapping (will be determined when controllers connect)
        this.handToIndex = {
            left: -1,
            right: -1
        };
        
        // Input state for easy access
        this.inputState = {
            controller0: {
                thumbstick: { x: 0, y: 0 },
                trigger: 0,
                grip: false,
                buttons: { a: false, b: false },
                hand: 'unknown'
            },
            controller1: {
                thumbstick: { x: 0, y: 0 },
                trigger: 0,
                grip: false,
                buttons: { x: false, y: false },
                hand: 'unknown'
            }
        };
    }

    /**
     * Setup controller input listeners
     */
    setupControllers() {
        const controllers = this.vrManager.getControllers();
        
        controllers.forEach((controller, index) => {
            // Store controller reference
            this.controllers[index] = controller;
            
            // Listen for connected event
            controller.addEventListener('connected', (event) => {
                this.onControllerConnected(event, index);
            });
            
            // Listen for disconnected event
            controller.addEventListener('disconnected', (event) => {
                this.onControllerDisconnected(event, index);
            });
        });
        
        console.log('VR input manager: Controller listeners setup');
    }

    /**
     * Handle controller connected
     */
    onControllerConnected(event, index) {
        const gamepad = event.data.gamepad;
        const hand = gamepad.hand || 'unknown';
        
        console.log(`Controller ${index} connected:`, gamepad);
        console.log(`  - Hand: ${hand}`);
        console.log(`  - Buttons: ${gamepad.buttons?.length || 0}`);
        console.log(`  - Axes: ${gamepad.axes?.length || 0}`);
        
        this.gamepadStates.set(index, gamepad);
        
        // Map controller index to hand
        if (hand === 'left' || hand === 'right') {
            this.handToIndex[hand] = index;
            const state = index === 0 ? this.inputState.controller0 : this.inputState.controller1;
            state.hand = hand;
            console.log(`  - Mapped ${hand} hand to controller ${index}`);
        }
    }

    /**
     * Handle controller disconnected
     */
    onControllerDisconnected(event, index) {
        console.log(`Controller ${index} disconnected`);
        this.gamepadStates.delete(index);
    }

    /**
     * Update input state from controllers (call every frame)
     */
    update() {
        this.controllers.forEach((controller, index) => {
            if (!controller) return;
            
            // Get gamepad from XR input source
            const session = this.vrManager.getCurrentSession();
            if (!session || !session.inputSources) return;
            
            const inputSource = session.inputSources[index];
            if (!inputSource || !inputSource.gamepad) return;
            
            const gamepad = inputSource.gamepad;
            
            // Update state based on controller index
            const state = index === 0 ? this.inputState.controller0 : this.inputState.controller1;
            
            // Read thumbstick axes (usually axes 2 and 3)
            if (gamepad.axes && gamepad.axes.length >= 4) {
                state.thumbstick.x = gamepad.axes[2];
                state.thumbstick.y = gamepad.axes[3];
            }
            
            // Read trigger (usually button 0)
            if (gamepad.buttons && gamepad.buttons.length > 0) {
                state.trigger = gamepad.buttons[0].value;
            }
            
            // Read grip (usually button 1)
            if (gamepad.buttons && gamepad.buttons.length > 1) {
                state.grip = gamepad.buttons[1].pressed;
            }
            
            // Read A/B buttons for right controller (buttons 4 and 5)
            if (index === 0 && gamepad.buttons && gamepad.buttons.length > 5) {
                state.buttons.a = gamepad.buttons[4].pressed;
                state.buttons.b = gamepad.buttons[5].pressed;
            }
            
            // Read X/Y buttons for left controller (buttons 4 and 5)
            if (index === 1 && gamepad.buttons && gamepad.buttons.length > 5) {
                state.buttons.x = gamepad.buttons[4].pressed;
                state.buttons.y = gamepad.buttons[5].pressed;
            }
        });
    }

    /**
     * Get input state for specific controller
     */
    getControllerInput(index) {
        return index === 0 ? this.inputState.controller0 : this.inputState.controller1;
    }

    /**
     * Get right controller input (using hand detection)
     */
    getRightController() {
        // Try to get the actual right hand controller
        const rightIndex = this.handToIndex.right;
        if (rightIndex >= 0) {
            return rightIndex === 0 ? this.inputState.controller0 : this.inputState.controller1;
        }
        // Fallback to controller0 if hand not detected
        return this.inputState.controller0;
    }

    /**
     * Get left controller input (using hand detection)
     */
    getLeftController() {
        // Try to get the actual left hand controller
        const leftIndex = this.handToIndex.left;
        if (leftIndex >= 0) {
            return leftIndex === 0 ? this.inputState.controller0 : this.inputState.controller1;
        }
        // Fallback to controller1 if hand not detected
        return this.inputState.controller1;
    }


}
