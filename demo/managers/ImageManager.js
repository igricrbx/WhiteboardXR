import * as THREE from 'three';

/**
 * Manages images on the whiteboard
 */
export class ImageManager {
    constructor(scene, parent = null) {
        this.scene = scene;
        this.parent = parent || scene; // Use parent if provided, otherwise scene
        this.images = [];
        this.textureLoader = new THREE.TextureLoader();
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
        this.getNextZIndex = null; // Will be set externally for shared z-index
    }

    /**
     * Create an image from a file
     */
    async createImageFromFile(file, position = new THREE.Vector3(0, 0, 0)) {
        // Validate file
        if (!file.type.startsWith('image/')) {
            throw new Error('File must be an image');
        }

        if (file.size > this.maxFileSize) {
            throw new Error(`File size must be less than ${this.maxFileSize / (1024 * 1024)}MB`);
        }

        // Create DataURL from file
        const dataURL = await this.fileToDataURL(file);

        // Load texture
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                dataURL,
                (texture) => {
                    // Set correct color space for proper rendering
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.needsUpdate = true;
                    
                    const image = this.createImageMesh(texture, position);
                    resolve(image);
                },
                undefined,
                (error) => {
                    reject(new Error('Failed to load image'));
                }
            );
        });
    }

    /**
     * Convert file to DataURL
     */
    fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Create Three.js mesh from loaded texture
     */
    createImageMesh(texture, position) {
        // Get natural dimensions
        const width = texture.image.width;
        const height = texture.image.height;

        // Calculate size to fit nicely on whiteboard (normalize to reasonable size)
        // Scale to max 2 units wide/tall, preserving aspect ratio initially
        const maxDimension = 2.0;
        const scale = Math.min(maxDimension / width, maxDimension / height);
        const planeWidth = width * scale;
        const planeHeight = height * scale;

        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        
        // Create material with texture
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,  // Disable depth writing for transparent materials
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);

        // Add to scene
        this.parent.add(mesh);

        // Create image object (compatible with selection/transform system)
        const image = {
            meshes: [mesh],
            mesh: mesh,
            texture: texture,
            geometry: geometry,
            material: material,
            // For bounding box calculation - store corner points
            points: this.getImageCornerPoints(mesh),
            // Initial dimensions
            width: planeWidth,
            height: planeHeight,
            position: position.clone(),
            // Type identifier
            type: 'image',
            // Track cumulative flip state
            isFlippedX: false,
            isFlippedY: false,
            // Z-ordering
            zIndex: this.getNextZIndex ? this.getNextZIndex() : 0
        };
        
        // Set initial render order
        mesh.renderOrder = image.zIndex;

        this.images.push(image);
        
        return image;
    }
    
    /**
     * Bring image to front (highest z-index)
     */
    bringToFront(image) {
        image.zIndex = this.getNextZIndex ? this.getNextZIndex() : 0;
        if (image.mesh) {
            image.mesh.renderOrder = image.zIndex;
        }
    }

    /**
     * Get corner points of image for bounding box calculation
     */
    getImageCornerPoints(mesh) {
        const geometry = mesh.geometry;
        const position = geometry.attributes.position;
        const points = [];

        // Get all 4 corners in world space
        for (let i = 0; i < position.count; i++) {
            const point = new THREE.Vector3(
                position.getX(i),
                position.getY(i),
                position.getZ(i)
            );
            mesh.localToWorld(point);
            points.push(point);
        }

        return points;
    }

    /**
     * Update image corner points after transform
     */
    updateImagePoints(image) {
        image.points = this.getImageCornerPoints(image.mesh);
    }

    /**
     * Delete an image
     */
    deleteImage(image) {
        if (!image || image.type !== 'image') return;

        // Remove from scene
        this.scene.remove(image.mesh);

        // Dispose resources
        if (image.geometry) image.geometry.dispose();
        if (image.material) image.material.dispose();
        if (image.texture) image.texture.dispose();

        // Remove from array
        const index = this.images.indexOf(image);
        if (index > -1) {
            this.images.splice(index, 1);
        }
    }

    /**
     * Delete multiple images
     */
    deleteImages(images) {
        images.forEach(image => this.deleteImage(image));
    }

    /**
     * Get image at world position using raycasting
     */
    getImageAtPosition(worldPoint, threshold = 0.01) {
        // Create a raycaster from the point
        const raycaster = new THREE.Raycaster();
        raycaster.set(
            new THREE.Vector3(worldPoint.x, worldPoint.y, 1),
            new THREE.Vector3(0, 0, -1)
        );

        // Test all image meshes
        const meshes = this.images.map(img => img.mesh);
        const intersects = raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            // Find the image that owns this mesh
            const mesh = intersects[0].object;
            return this.images.find(img => img.mesh === mesh);
        }

        return null;
    }

    /**
     * Get all images
     */
    getImages() {
        return this.images;
    }

    /**
     * Get image count
     */
    getImageCount() {
        return this.images.length;
    }

    /**
     * Update image geometry after scaling
     * This updates the plane geometry to match new dimensions
     */
    updateImageGeometry(image, newWidth, newHeight, flipX = false, flipY = false, updateFlipState = false) {
        // Update cumulative flip state only if requested (after scaling is done)
        if (updateFlipState) {
            if (flipX) {
                image.isFlippedX = !image.isFlippedX;
            }
            if (flipY) {
                image.isFlippedY = !image.isFlippedY;
            }
        }
        
        // Dispose old geometry
        image.geometry.dispose();

        // Create new geometry with new dimensions
        const newGeometry = new THREE.PlaneGeometry(newWidth, newHeight);
        
        // Calculate actual flip state: combine stored state with current preview flip
        const actualFlipX = updateFlipState ? image.isFlippedX : (image.isFlippedX !== flipX);
        const actualFlipY = updateFlipState ? image.isFlippedY : (image.isFlippedY !== flipY);
        
        // Apply flipping by modifying UV coordinates
        if (actualFlipX || actualFlipY) {
            const uvAttribute = newGeometry.attributes.uv;
            for (let i = 0; i < uvAttribute.count; i++) {
                let u = uvAttribute.getX(i);
                let v = uvAttribute.getY(i);
                
                if (actualFlipX) {
                    u = 1 - u;
                }
                if (actualFlipY) {
                    v = 1 - v;
                }
                
                uvAttribute.setXY(i, u, v);
            }
            uvAttribute.needsUpdate = true;
        }
        
        image.mesh.geometry = newGeometry;
        image.geometry = newGeometry;

        // Update stored dimensions
        image.width = newWidth;
        image.height = newHeight;

        // Update corner points
        this.updateImagePoints(image);
    }

    /**
     * Get content (images + strokes) at position
     * Helper for unified selection
     */
    static getContentAtPosition(worldPoint, strokeManager, imageManager, threshold) {
        // Check strokes first
        const stroke = strokeManager.getStrokeAtPosition(worldPoint, threshold);
        if (stroke) return stroke;

        // Then check images
        const image = imageManager.getImageAtPosition(worldPoint, threshold);
        return image;
    }
}
