import * as THREE from 'three';

/**
 * Manages VR controller input (buttons, thumbsticks, triggers)
 */
export class VRInputManager {
    constructor(vrManager) {
        this.vrManager = vrManager;
        this.controllers = [];
        this.gamepadStates = new Map();
        
        // Hand mapping (maps 'left'/'right' to input source index)
        this.handToIndex = new Map();
        
        // Input state for easy access (by hand)
        this.inputState = {
            right: {
                thumbstick: { x: 0, y: 0 },
                trigger: 0,
                grip: false,
                buttons: { a: false, b: false }
            },
            left: {
                thumbstick: { x: 0, y: 0 },
                trigger: 0,
                grip: false,
                buttons: { x: false, y: false }
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
        const inputSource = event.data;
        const gamepad = inputSource.gamepad;
        const hand = inputSource.handedness; // 'left', 'right', or 'none'
        
        console.log(`Controller ${index} connected:`, gamepad);
        console.log(`  - Hand: ${hand}`);
        console.log(`  - Buttons: ${gamepad.buttons?.length || 0}`);
        console.log(`  - Axes: ${gamepad.axes?.length || 0}`);
        
        // Map this index to the hand
        if (hand === 'left' || hand === 'right') {
            this.handToIndex.set(hand, index);
            console.log(`  - Mapped ${hand} hand to controller index ${index}`);
        }
        
        this.gamepadStates.set(index, gamepad);
    }

    /**
     * Handle controller disconnected
     */
    onControllerDisconnected(event, index) {
        console.log(`Controller ${index} disconnected`);
        
        // Remove hand mapping
        for (const [hand, idx] of this.handToIndex.entries()) {
            if (idx === index) {
                this.handToIndex.delete(hand);
                console.log(`  - Unmapped ${hand} hand from controller index ${index}`);
                break;
            }
        }
        
        this.gamepadStates.delete(index);
    }

    /**
     * Update input state from controllers (call every frame)
     */
    update() {
        const session = this.vrManager.getCurrentSession();
        if (!session || !session.inputSources) return;
        
        // Reset thumbstick states first
        this.inputState.left.thumbstick.x = 0;
        this.inputState.left.thumbstick.y = 0;
        this.inputState.right.thumbstick.x = 0;
        this.inputState.right.thumbstick.y = 0;
        
        // Iterate through all input sources and update based on handedness
        for (const inputSource of session.inputSources) {
            if (!inputSource || !inputSource.gamepad) continue;
            
            const gamepad = inputSource.gamepad;
            const hand = inputSource.handedness; // 'left', 'right', or 'none'
            
            // Skip if no valid hand
            if (hand !== 'left' && hand !== 'right') continue;
            
            // Get the state object for this hand
            const state = this.inputState[hand];
            if (!state) continue;
            
            // Quest 2 thumbstick axes layout:
            // axes[0,1] = unused on Quest 2
            // axes[2,3] = thumbstick X and Y
            if (gamepad.axes && gamepad.axes.length >= 4) {
                state.thumbstick.x = gamepad.axes[2];
                state.thumbstick.y = gamepad.axes[3];
            } else if (gamepad.axes && gamepad.axes.length >= 2) {
                // Fallback for other controllers
                state.thumbstick.x = gamepad.axes[0];
                state.thumbstick.y = gamepad.axes[1];
            }
            
            // Read trigger (button 0)
            if (gamepad.buttons && gamepad.buttons.length > 0) {
                state.trigger = gamepad.buttons[0].value;
            }
            
            // Read grip (button 1)
            if (gamepad.buttons && gamepad.buttons.length > 1) {
                state.grip = gamepad.buttons[1].pressed;
            }
            
            // Read A/B buttons for right controller (buttons 4 and 5)
            if (hand === 'right' && gamepad.buttons && gamepad.buttons.length > 5) {
                state.buttons.a = gamepad.buttons[4].pressed;
                state.buttons.b = gamepad.buttons[5].pressed;
            }
            
            // Read X/Y buttons for left controller (buttons 4 and 5)
            if (hand === 'left' && gamepad.buttons && gamepad.buttons.length > 5) {
                state.buttons.x = gamepad.buttons[4].pressed;
                state.buttons.y = gamepad.buttons[5].pressed;
            }
        }
    }

    /**
     * Get input state for specific hand
     */
    getControllerInput(hand) {
        return this.inputState[hand] || {
            thumbstick: { x: 0, y: 0 },
            trigger: 0,
            grip: false,
            buttons: {}
        };
    }

    /**
     * Get right controller input (usually primary hand)
     */
    getRightController() {
        return this.inputState.right;
    }

    /**
     * Get left controller input
     */
    getLeftController() {
        return this.inputState.left;
    }
    
    /**
     * Get the index of a controller by hand
     */
    getControllerIndexByHand(hand) {
        return this.handToIndex.get(hand);
    }
    
    /**
     * Check if controllers are ready
     */
    areControllersReady() {
        return this.handToIndex.has('left') && this.handToIndex.has('right');
    }
}
