/**
 * Creates a button for entering/exiting VR mode
 * Follows WebXR standard patterns
 */
export class VRButton {
    /**
     * Create and return a VR button element
     * @param {VRManager} vrManager - The VR manager instance
     * @returns {HTMLButtonElement} The VR button element
     */
    static createButton(vrManager) {
        const button = document.createElement('button');
        button.id = 'vr-button';
        
        // Initial styling
        this.styleButton(button);
        
        // Initial state
        button.textContent = 'CHECKING VR...';
        button.disabled = true;

        // Check VR support and update button
        this.checkVRSupport(vrManager, button);

        // Click handler
        button.addEventListener('click', async () => {
            if (vrManager.isInVR()) {
                await vrManager.exitVRSession();
            } else {
                try {
                    await vrManager.requestVRSession();
                } catch (error) {
                    button.textContent = 'VR ERROR';
                    console.error('Failed to enter VR:', error);
                    alert('Failed to enter VR mode: ' + error.message);
                    
                    // Reset button after error
                    setTimeout(() => {
                        button.textContent = 'ENTER VR';
                    }, 2000);
                }
            }
        });

        // Update button on session start
        vrManager.onSessionStart(() => {
            button.textContent = 'EXIT VR';
            button.style.backgroundColor = '#ff5555';
        });

        // Update button on session end
        vrManager.onSessionEnd(() => {
            button.textContent = 'ENTER VR';
            button.style.backgroundColor = '#1a73e8';
            button.disabled = false;
        });

        return button;
    }

    /**
     * Check VR support and update button state
     */
    static async checkVRSupport(vrManager, button) {
        const supported = await vrManager.isVRSupported();
        
        if (supported) {
            button.textContent = 'ENTER VR';
            button.disabled = false;
            button.style.backgroundColor = '#1a73e8';
            button.style.cursor = 'pointer';
        } else {
            button.textContent = 'VR NOT SUPPORTED';
            button.disabled = true;
            button.style.backgroundColor = '#666666';
            button.style.cursor = 'not-allowed';
        }
    }

    /**
     * Apply default styling to the button
     */
    static styleButton(button) {
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.right = '20px';
        button.style.padding = '12px 24px';
        button.style.fontSize = '14px';
        button.style.fontWeight = 'bold';
        button.style.color = '#ffffff';
        button.style.backgroundColor = '#888888';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.zIndex = '10000';
        button.style.fontFamily = 'Arial, sans-serif';
        button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        button.style.transition = 'background-color 0.3s';
        button.style.userSelect = 'none';

        // Hover effects
        button.addEventListener('mouseenter', () => {
            if (!button.disabled) {
                button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
            }
        });

        button.addEventListener('mouseleave', () => {
            button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        });
    }

    /**
     * Show an icon in the button (optional enhancement)
     */
    static addIcon(button) {
        // Simple VR headset icon using Unicode
        button.innerHTML = `
            <span style="margin-right: 8px;">🥽</span>
            ${button.textContent}
        `;
    }
}
