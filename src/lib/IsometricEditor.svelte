<script lang="ts">
    import { onMount } from "svelte";

    // Layer interface
    interface Layer {
        id: string;
        name: string;
        canvas: HTMLCanvasElement;
        ctx: CanvasRenderingContext2D;
        visible: boolean;
    }

    // Saved image interface
    interface SavedImage {
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        width: number;
        height: number;
        layers: {
            id: string;
            name: string;
            visible: boolean;
            imageData: string; // base64
        }[];
        activeLayerIndex: number;
        thumbnail: string; // base64 thumbnail for preview
    }

    // Storage key
    const STORAGE_KEY = "isometric-editor-saved-images";

    // Canvas dimensions (now reactive)
    let canvasWidth: number = $state(512);
    let canvasHeight: number = $state(512);

    // Layers state
    let layers: Layer[] = $state([]);
    let activeLayerIndex: number = $state(0);
    let draggedLayerIndex: number | null = $state(null);
    let dragOverLayerIndex: number | null = $state(null);
    let editingLayerId: string | null = $state(null);

    // Derived active layer context
    let activeCtx = $derived(layers[activeLayerIndex]?.ctx ?? null);

    // Save/Load state
    let savedImages: SavedImage[] = $state([]);
    let currentImageId: string | null = $state(null);
    let currentImageName: string | null = $state(null);
    let showSaveModal: boolean = $state(false);
    let showLoadModal: boolean = $state(false);
    let saveAsMode: boolean = $state(false);
    let saveNameInput: string = $state("");
    let deleteConfirmId: string | null = $state(null);
    let showFileMenu: boolean = $state(false);
    let showEditMenu: boolean = $state(false);

    // Custom dimension inputs
    let customWidth: string = $state("512");
    let customHeight: string = $state("512");

    // Preset dimensions
    const PRESETS = [
        { name: "512x512", width: 512, height: 512 },
        { name: "256x256", width: 256, height: 256 },
        { name: "128x128", width: 128, height: 128 },
        { name: "64x64", width: 64, height: 64 },
        { name: "64x32 (Tile)", width: 64, height: 32 },
        { name: "32x32", width: 32, height: 32 },
        { name: "32x16 (Tile)", width: 32, height: 16 },
        { name: "16x16", width: 16, height: 16 },
    ];

    // Shape groups
    const SHAPE_GROUPS = {
        basic: {
            name: "Basic",
            shapes: [
                { name: "Square", id: "square" },
                { name: "Rectangle", id: "rectangle" },
                { name: "Circle", id: "circle" },
                { name: "Triangle", id: "triangle" },
                { name: "Star", id: "star" },
                { name: "Hexagon", id: "hexagon" },
            ],
        },
        isometric: {
            name: "Isometric",
            shapes: [
                { name: "Diamond", id: "diamond" },
                { name: "Ellipse", id: "ellipse" },
                { name: "Cube Top", id: "cube-top" },
                { name: "Cube Left", id: "cube-left" },
                { name: "Cube Right", id: "cube-right" },
            ],
        },
    };

    // Legacy constant for backwards compatibility
    const ISOMETRIC_SHAPES = SHAPE_GROUPS.isometric.shapes;

    // State
    let canvas: HTMLCanvasElement;
    let gridCanvas: HTMLCanvasElement;
    let previewCanvas: HTMLCanvasElement;
    let canvasWrapper: HTMLElement;
    let ctx: CanvasRenderingContext2D | null = $state(null);
    let gridCtx: CanvasRenderingContext2D | null = $state(null);
    let previewCtx: CanvasRenderingContext2D | null = $state(null);

    // Drawing state
    let paintColor: string = $state("#000000");
    let paintOpacity: number = $state(100); // Opacity percentage (0-100)
    let isDrawing: boolean = $state(false);
    let zoom: number = $state(1);
    let tool:
        | "pixel"
        | "line"
        | "pan"
        | "fill"
        | "replace"
        | "shape"
        | "select"
        | "lasso" = $state("pixel");
    let brushSize: number = $state(1);

    // Selection tool state
    let isSelecting: boolean = $state(false);
    let selectionStartX: number = $state(0);
    let selectionStartY: number = $state(0);
    let selectionEndX: number = $state(0);
    let selectionEndY: number = $state(0);
    let hasSelection: boolean = $state(false);
    let clipboard: ImageData | null = $state(null);
    let isMovingSelection: boolean = $state(false);
    let floatingSelection: {
        imageData: ImageData;
        x: number;
        y: number;
    } | null = $state(null);
    let moveStartX: number = $state(0);
    let moveStartY: number = $state(0);

    // Lasso tool state
    let isLassoing: boolean = $state(false);
    let lassoPoints: { x: number; y: number }[] = $state([]);
    let lassoMask: boolean[][] | null = $state(null);
    let lassoImageData: ImageData | null = $state(null);
    let lassoBounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    } | null = $state(null);

    // Shape tool state
    let selectedShapeGroup: "basic" | "isometric" = $state("basic");
    let selectedShape: string = $state("square");
    let shapeSize: number = $state(32);
    let shapeWidth: number = $state(32);
    let shapeHeight: number = $state(32);
    let shapePreviewX: number = $state(0);
    let shapePreviewY: number = $state(0);

    // Shapes that need separate width/height controls
    const RECT_SHAPES = ["rectangle"];
    let needsSeparateDimensions = $derived(RECT_SHAPES.includes(selectedShape));

    // Pan state
    let isPanning: boolean = $state(false);
    let panStartX: number = $state(0);
    let panStartY: number = $state(0);
    let scrollStartX: number = $state(0);
    let scrollStartY: number = $state(0);

    // Grid state
    let showGrid: boolean = $state(false);
    let gridSize: number = $state(16);

    // Line drawing state
    let isDrawingLine: boolean = $state(false);
    let lineStartX: number = $state(0);
    let lineStartY: number = $state(0);
    let linePreviewEndX: number = $state(0);
    let linePreviewEndY: number = $state(0);

    // Undo/Redo state - now stores per-layer state
    interface HistoryState {
        layerStates: { id: string; imageData: ImageData }[];
        activeLayerIndex: number;
    }
    let undoStack: HistoryState[] = $state([]);
    let redoStack: HistoryState[] = $state([]);
    const MAX_UNDO_STEPS = 50;

    // Pixel grid state - shows pixel boundaries when zoomed in
    let showPixelGrid: boolean = $state(true);
    const PIXEL_GRID_MIN_ZOOM = 4; // Only show pixel grid when zoom >= 400%

    // Drag and drop state for importing images
    let isDraggingFile: boolean = $state(false);

    // Isometric angles
    const ISOMETRIC_ANGLES = [
        0, 26.565, 30, 45, 60, 63.435, 90, 116.565, 120, 135, 150, 153.435, 180,
        206.565, 210, 225, 240, 243.435, 270, 296.565, 300, 315, 330, 333.435,
        360,
    ];

    function saveState() {
        if (layers.length === 0) return;
        const layerStates = layers.map((layer) => ({
            id: layer.id,
            imageData: layer.ctx.getImageData(0, 0, canvasWidth, canvasHeight),
        }));
        const state: HistoryState = {
            layerStates,
            activeLayerIndex,
        };
        undoStack = [...undoStack.slice(-(MAX_UNDO_STEPS - 1)), state];
        redoStack = [];
    }

    function undo() {
        if (undoStack.length === 0 || layers.length === 0) return;

        // Save current state to redo stack
        const currentLayerStates = layers.map((layer) => ({
            id: layer.id,
            imageData: layer.ctx.getImageData(0, 0, canvasWidth, canvasHeight),
        }));
        const currentState: HistoryState = {
            layerStates: currentLayerStates,
            activeLayerIndex,
        };
        redoStack = [...redoStack, currentState];

        // Restore previous state
        const previousState = undoStack[undoStack.length - 1];
        undoStack = undoStack.slice(0, -1);

        for (const layerState of previousState.layerStates) {
            const layer = layers.find((l) => l.id === layerState.id);
            if (layer) {
                layer.ctx.putImageData(layerState.imageData, 0, 0);
            }
        }
        activeLayerIndex = previousState.activeLayerIndex;
        compositeAndRender();
    }

    function redo() {
        if (redoStack.length === 0 || layers.length === 0) return;

        // Save current state to undo stack
        const currentLayerStates = layers.map((layer) => ({
            id: layer.id,
            imageData: layer.ctx.getImageData(0, 0, canvasWidth, canvasHeight),
        }));
        const currentState: HistoryState = {
            layerStates: currentLayerStates,
            activeLayerIndex,
        };
        undoStack = [...undoStack, currentState];

        // Restore next state
        const nextState = redoStack[redoStack.length - 1];
        redoStack = redoStack.slice(0, -1);

        for (const layerState of nextState.layerStates) {
            const layer = layers.find((l) => l.id === layerState.id);
            if (layer) {
                layer.ctx.putImageData(layerState.imageData, 0, 0);
            }
        }
        activeLayerIndex = nextState.activeLayerIndex;
        compositeAndRender();
    }

    // Layer management functions
    function generateLayerId(): string {
        return `layer-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    function createLayer(name?: string): Layer {
        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = canvasWidth;
        layerCanvas.height = canvasHeight;
        const layerCtx = layerCanvas.getContext("2d")!;
        layerCtx.imageSmoothingEnabled = false;

        return {
            id: generateLayerId(),
            name: name || `Layer ${layers.length + 1}`,
            canvas: layerCanvas,
            ctx: layerCtx,
            visible: true,
        };
    }

    function addLayer() {
        const newLayer = createLayer();
        // Insert new layer above active layer
        const newLayers = [...layers];
        newLayers.splice(activeLayerIndex + 1, 0, newLayer);
        layers = newLayers;
        activeLayerIndex = activeLayerIndex + 1;
        compositeAndRender();
    }

    function removeLayer(index: number) {
        if (layers.length <= 1) return; // Don't allow removing last layer
        const newLayers = layers.filter((_, i) => i !== index);
        layers = newLayers;
        // Adjust active layer index if needed
        if (activeLayerIndex >= layers.length) {
            activeLayerIndex = layers.length - 1;
        } else if (activeLayerIndex > index) {
            activeLayerIndex = activeLayerIndex - 1;
        }
        compositeAndRender();
    }

    function moveLayer(fromIndex: number, toIndex: number) {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= layers.length) return;
        if (toIndex < 0 || toIndex >= layers.length) return;

        const newLayers = [...layers];
        const [movedLayer] = newLayers.splice(fromIndex, 1);
        newLayers.splice(toIndex, 0, movedLayer);
        layers = newLayers;

        // Update active layer index to follow the previously active layer
        if (activeLayerIndex === fromIndex) {
            activeLayerIndex = toIndex;
        } else if (
            fromIndex < activeLayerIndex &&
            toIndex >= activeLayerIndex
        ) {
            activeLayerIndex = activeLayerIndex - 1;
        } else if (
            fromIndex > activeLayerIndex &&
            toIndex <= activeLayerIndex
        ) {
            activeLayerIndex = activeLayerIndex + 1;
        }

        compositeAndRender();
    }

    function toggleLayerVisibility(index: number) {
        layers[index].visible = !layers[index].visible;
        layers = [...layers]; // Trigger reactivity
        compositeAndRender();
    }

    function renameLayer(index: number, newName: string) {
        if (newName.trim()) {
            layers[index].name = newName.trim();
            layers = [...layers]; // Trigger reactivity
        }
        editingLayerId = null;
    }

    function setActiveLayer(index: number) {
        if (index >= 0 && index < layers.length) {
            activeLayerIndex = index;
        }
    }

    // Drag and drop handlers for importing images
    function handleFileDragOver(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types.includes("Files")) {
            isDraggingFile = true;
            e.dataTransfer.dropEffect = "copy";
        }
    }

    function handleFileDragLeave(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        isDraggingFile = false;
    }

    function handleFileDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        isDraggingFile = false;

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        // Process only image files
        for (const file of Array.from(files)) {
            if (file.type.startsWith("image/")) {
                loadImageAsNewLayer(file);
            }
        }
    }

    function loadImageAsNewLayer(file: File) {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                // Extract filename without extension for layer name
                const fileName = file.name.replace(/\.[^/.]+$/, "");

                // Create a new layer
                const newLayer = createLayer(fileName);

                // Draw the image onto the layer canvas
                // Scale or position the image to fit within the canvas bounds
                const scale = Math.min(
                    canvasWidth / img.width,
                    canvasHeight / img.height,
                    1, // Don't upscale if image is smaller
                );

                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;

                // Center the image on the canvas
                const offsetX = Math.floor((canvasWidth - scaledWidth) / 2);
                const offsetY = Math.floor((canvasHeight - scaledHeight) / 2);

                // For pixel art, we want crisp rendering
                newLayer.ctx.imageSmoothingEnabled = false;

                // If the image fits exactly or is smaller, draw at 1:1
                if (img.width <= canvasWidth && img.height <= canvasHeight) {
                    newLayer.ctx.drawImage(img, offsetX, offsetY);
                } else {
                    // Scale down to fit
                    newLayer.ctx.drawImage(
                        img,
                        offsetX,
                        offsetY,
                        scaledWidth,
                        scaledHeight,
                    );
                }

                // Insert new layer above active layer
                const newLayers = [...layers];
                newLayers.splice(activeLayerIndex + 1, 0, newLayer);
                layers = newLayers;
                activeLayerIndex = activeLayerIndex + 1;

                compositeAndRender();
            };

            img.onerror = () => {
                console.error("Failed to load image:", file.name);
            };

            img.src = e.target?.result as string;
        };

        reader.onerror = () => {
            console.error("Failed to read file:", file.name);
        };

        reader.readAsDataURL(file);
    }

    function compositeAndRender() {
        if (!ctx) return;

        // Clear the main display canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Draw each visible layer in order (bottom to top)
        for (const layer of layers) {
            if (layer.visible) {
                ctx.drawImage(layer.canvas, 0, 0);
            }
        }

        updatePreview();
    }

    // Layer drag and drop handlers
    function handleLayerDragStart(index: number) {
        draggedLayerIndex = index;
    }

    function handleLayerDragOver(e: DragEvent, index: number) {
        e.preventDefault();
        dragOverLayerIndex = index;
    }

    function handleLayerDragLeave() {
        dragOverLayerIndex = null;
    }

    function handleLayerDrop(index: number) {
        if (draggedLayerIndex !== null && draggedLayerIndex !== index) {
            moveLayer(draggedLayerIndex, index);
        }
        draggedLayerIndex = null;
        dragOverLayerIndex = null;
    }

    function handleLayerDragEnd() {
        draggedLayerIndex = null;
        dragOverLayerIndex = null;
    }

    // Save/Load functions
    function loadSavedImagesFromStorage(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                savedImages = JSON.parse(stored);
            }
        } catch (e) {
            console.error("Failed to load saved images:", e);
            savedImages = [];
        }
    }

    function saveSavedImagesToStorage(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(savedImages));
        } catch (e) {
            console.error("Failed to save images to storage:", e);
            alert("Failed to save. Storage may be full.");
        }
    }

    function generateThumbnail(): string {
        // Create a small thumbnail (64x64 max) of the current canvas
        const thumbSize = 64;
        const thumbCanvas = document.createElement("canvas");
        const scale = Math.min(
            thumbSize / canvasWidth,
            thumbSize / canvasHeight,
        );
        thumbCanvas.width = Math.round(canvasWidth * scale);
        thumbCanvas.height = Math.round(canvasHeight * scale);
        const thumbCtx = thumbCanvas.getContext("2d")!;
        thumbCtx.imageSmoothingEnabled = false;

        // Draw composite of all visible layers
        for (const layer of layers) {
            if (layer.visible) {
                thumbCtx.drawImage(
                    layer.canvas,
                    0,
                    0,
                    thumbCanvas.width,
                    thumbCanvas.height,
                );
            }
        }

        return thumbCanvas.toDataURL("image/png");
    }

    function serializeCurrentImage(): Omit<
        SavedImage,
        "id" | "createdAt" | "updatedAt" | "name"
    > {
        const layerData = layers.map((layer) => ({
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            imageData: layer.canvas.toDataURL("image/png"),
        }));

        return {
            width: canvasWidth,
            height: canvasHeight,
            layers: layerData,
            activeLayerIndex,
            thumbnail: generateThumbnail(),
        };
    }

    function openSaveModal(asSaveAs: boolean = false): void {
        saveAsMode = asSaveAs;
        if (currentImageName && !asSaveAs) {
            // Quick save - update existing
            saveCurrentImage();
        } else {
            // Show modal to enter name
            saveNameInput = currentImageName || "";
            showSaveModal = true;
        }
    }

    function closeSaveModal(): void {
        showSaveModal = false;
        saveNameInput = "";
        saveAsMode = false;
    }

    function saveCurrentImage(): void {
        const serialized = serializeCurrentImage();
        const now = Date.now();

        if (currentImageId && !saveAsMode) {
            // Update existing image
            const index = savedImages.findIndex(
                (img) => img.id === currentImageId,
            );
            if (index !== -1) {
                savedImages[index] = {
                    ...savedImages[index],
                    ...serialized,
                    updatedAt: now,
                };
                savedImages = [...savedImages];
                saveSavedImagesToStorage();
                closeSaveModal();
                return;
            }
        }

        // Create new image
        const newImage: SavedImage = {
            id: `img-${now}-${Math.random().toString(36).substring(2, 9)}`,
            name: saveNameInput.trim() || `Untitled ${savedImages.length + 1}`,
            createdAt: now,
            updatedAt: now,
            ...serialized,
        };

        savedImages = [...savedImages, newImage];
        currentImageId = newImage.id;
        currentImageName = newImage.name;
        saveSavedImagesToStorage();
        closeSaveModal();
    }

    function openLoadModal(): void {
        loadSavedImagesFromStorage();
        showLoadModal = true;
        deleteConfirmId = null;
    }

    function closeLoadModal(): void {
        showLoadModal = false;
        deleteConfirmId = null;
    }

    function loadImage(image: SavedImage): void {
        // Clear current layers
        layers = [];

        // Resize canvas if needed
        if (canvasWidth !== image.width || canvasHeight !== image.height) {
            canvasWidth = image.width;
            canvasHeight = image.height;
            customWidth = String(image.width);
            customHeight = String(image.height);
        }

        // Recreate layers from saved data
        const loadedLayers: Layer[] = [];

        for (const savedLayer of image.layers) {
            const layerCanvas = document.createElement("canvas");
            layerCanvas.width = image.width;
            layerCanvas.height = image.height;
            const layerCtx = layerCanvas.getContext("2d")!;
            layerCtx.imageSmoothingEnabled = false;

            // Load image data
            const img = new Image();
            img.onload = () => {
                layerCtx.drawImage(img, 0, 0);
                compositeAndRender();
            };
            img.src = savedLayer.imageData;

            loadedLayers.push({
                id: savedLayer.id,
                name: savedLayer.name,
                canvas: layerCanvas,
                ctx: layerCtx,
                visible: savedLayer.visible,
            });
        }

        layers = loadedLayers;
        activeLayerIndex = Math.min(
            image.activeLayerIndex,
            loadedLayers.length - 1,
        );
        currentImageId = image.id;
        currentImageName = image.name;

        // Clear undo/redo stacks
        undoStack = [];
        redoStack = [];

        closeLoadModal();

        // Trigger composite after images load
        setTimeout(() => {
            compositeAndRender();
        }, 100);
    }

    function confirmDeleteImage(id: string): void {
        deleteConfirmId = id;
    }

    function cancelDeleteImage(): void {
        deleteConfirmId = null;
    }

    function deleteImage(id: string): void {
        savedImages = savedImages.filter((img) => img.id !== id);
        saveSavedImagesToStorage();

        // If we deleted the currently loaded image, clear the reference
        if (currentImageId === id) {
            currentImageId = null;
            currentImageName = null;
        }

        deleteConfirmId = null;
    }

    function formatDate(timestamp: number): string {
        return new Date(timestamp).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function toggleFileMenu(): void {
        showFileMenu = !showFileMenu;
        showEditMenu = false;
    }

    function closeFileMenu(): void {
        showFileMenu = false;
    }

    function handleFileMenuAction(action: () => void): void {
        action();
        closeFileMenu();
    }

    function toggleEditMenu(): void {
        showEditMenu = !showEditMenu;
        showFileMenu = false;
    }

    function closeEditMenu(): void {
        showEditMenu = false;
    }

    function handleEditMenuAction(action: () => void): void {
        action();
        closeEditMenu();
    }

    function newImage(): void {
        // Clear current image
        currentImageId = null;
        currentImageName = null;

        // Reset to default state
        canvasWidth = 512;
        canvasHeight = 512;
        customWidth = "512";
        customHeight = "512";

        // Create fresh background layer
        const initialLayer = createLayer("Background");
        layers = [initialLayer];
        activeLayerIndex = 0;

        // Clear history
        undoStack = [];
        redoStack = [];

        compositeAndRender();
    }

    function handleKeyDown(e: KeyboardEvent) {
        // Don't handle shortcuts when editing layer name or in modals
        if (editingLayerId || showSaveModal || showLoadModal) return;

        // Save shortcuts
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            if (e.shiftKey) {
                openSaveModal(true); // Save As
            } else {
                openSaveModal(false); // Save
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "o") {
            e.preventDefault();
            openLoadModal();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "y") {
            e.preventDefault();
            redo();
        }
        // Layer shortcuts
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "N") {
            e.preventDefault();
            addLayer();
        }
        // Layer navigation with bracket keys
        if (e.key === "[" && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (activeLayerIndex > 0) {
                setActiveLayer(activeLayerIndex - 1);
            }
        }
        if (e.key === "]" && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (activeLayerIndex < layers.length - 1) {
                setActiveLayer(activeLayerIndex + 1);
            }
        }
        // Selection shortcuts (works for both select and lasso tools)
        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            e.preventDefault();
            if (tool === "lasso" && (lassoMask || floatingSelection)) {
                if (floatingSelection) {
                    clipboard = new ImageData(
                        new Uint8ClampedArray(floatingSelection.imageData.data),
                        floatingSelection.imageData.width,
                        floatingSelection.imageData.height,
                    );
                } else {
                    extractLassoSelection();
                    copyLassoSelection();
                }
            } else {
                copySelection();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "x") {
            e.preventDefault();
            if (tool === "lasso" && (lassoMask || floatingSelection)) {
                if (floatingSelection) {
                    clipboard = new ImageData(
                        new Uint8ClampedArray(floatingSelection.imageData.data),
                        floatingSelection.imageData.width,
                        floatingSelection.imageData.height,
                    );
                    floatingSelection = null;
                    clearLassoSelection();
                    updatePreview();
                } else {
                    cutLassoSelection();
                }
            } else {
                cutSelection();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "v") {
            e.preventDefault();
            if (tool === "lasso") {
                commitFloatingSelection();
                clearLassoSelection();
            }
            pasteSelection();
        }
        if (e.key === "Delete" || e.key === "Backspace") {
            if (tool === "lasso" && (lassoMask || floatingSelection)) {
                e.preventDefault();
                if (floatingSelection) {
                    floatingSelection = null;
                    clearLassoSelection();
                } else {
                    deleteLassoSelection();
                }
            } else if (hasSelection || floatingSelection) {
                e.preventDefault();
                deleteSelection();
            }
        }
        if (e.key === "Escape") {
            if (tool === "lasso" && (lassoMask || floatingSelection)) {
                e.preventDefault();
                commitFloatingSelection();
                clearLassoSelection();
            } else if (hasSelection || floatingSelection) {
                e.preventDefault();
                commitFloatingSelection();
                clearSelection();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            if (tool === "select") {
                e.preventDefault();
                selectAll();
            }
        }
    }

    // Selection functions
    function getSelectionRect(): {
        x: number;
        y: number;
        width: number;
        height: number;
    } {
        const x = Math.min(selectionStartX, selectionEndX);
        const y = Math.min(selectionStartY, selectionEndY);
        const width = Math.abs(selectionEndX - selectionStartX) + 1;
        const height = Math.abs(selectionEndY - selectionStartY) + 1;
        return { x, y, width, height };
    }

    function isInsideSelection(px: number, py: number): boolean {
        if (!hasSelection && !floatingSelection) return false;
        if (floatingSelection) {
            return (
                px >= floatingSelection.x &&
                px < floatingSelection.x + floatingSelection.imageData.width &&
                py >= floatingSelection.y &&
                py < floatingSelection.y + floatingSelection.imageData.height
            );
        }
        const rect = getSelectionRect();
        return (
            px >= rect.x &&
            px < rect.x + rect.width &&
            py >= rect.y &&
            py < rect.y + rect.height
        );
    }

    function copySelection() {
        if (!activeCtx) return;
        if (floatingSelection) {
            clipboard = new ImageData(
                new Uint8ClampedArray(floatingSelection.imageData.data),
                floatingSelection.imageData.width,
                floatingSelection.imageData.height,
            );
            return;
        }
        if (!hasSelection) return;
        const rect = getSelectionRect();
        clipboard = activeCtx.getImageData(
            rect.x,
            rect.y,
            rect.width,
            rect.height,
        );
    }

    function cutSelection() {
        if (!activeCtx) return;
        if (floatingSelection) {
            clipboard = new ImageData(
                new Uint8ClampedArray(floatingSelection.imageData.data),
                floatingSelection.imageData.width,
                floatingSelection.imageData.height,
            );
            floatingSelection = null;
            clearSelection();
            drawSelectionOverlay();
            compositeAndRender();
            return;
        }
        if (!hasSelection) return;
        saveState();
        const rect = getSelectionRect();
        clipboard = activeCtx.getImageData(
            rect.x,
            rect.y,
            rect.width,
            rect.height,
        );
        activeCtx.clearRect(rect.x, rect.y, rect.width, rect.height);
        clearSelection();
        compositeAndRender();
    }

    function pasteSelection() {
        if (!clipboard) return;
        commitFloatingSelection();
        // Create floating selection at center of viewport or at origin
        floatingSelection = {
            imageData: new ImageData(
                new Uint8ClampedArray(clipboard.data),
                clipboard.width,
                clipboard.height,
            ),
            x: 0,
            y: 0,
        };
        hasSelection = false;
        drawSelectionOverlay();
    }

    function deleteSelection() {
        if (!activeCtx) return;
        if (floatingSelection) {
            floatingSelection = null;
            clearSelection();
            drawSelectionOverlay();
            return;
        }
        if (!hasSelection) return;
        saveState();
        const rect = getSelectionRect();
        activeCtx.clearRect(rect.x, rect.y, rect.width, rect.height);
        clearSelection();
        compositeAndRender();
    }

    function selectAll() {
        selectionStartX = 0;
        selectionStartY = 0;
        selectionEndX = canvasWidth - 1;
        selectionEndY = canvasHeight - 1;
        hasSelection = true;
        drawSelectionOverlay();
    }

    function clearSelection() {
        hasSelection = false;
        selectionStartX = 0;
        selectionStartY = 0;
        selectionEndX = 0;
        selectionEndY = 0;
        drawSelectionOverlay();
    }

    function commitFloatingSelection() {
        if (!activeCtx || !floatingSelection) return;
        saveState();
        activeCtx.putImageData(
            floatingSelection.imageData,
            floatingSelection.x,
            floatingSelection.y,
        );
        floatingSelection = null;
        compositeAndRender();
    }

    function drawSelectionOverlay() {
        if (!gridCtx) return;
        clearGridCanvas();
        if (showGrid) drawGrid();

        // Draw floating selection if exists
        if (floatingSelection) {
            gridCtx.putImageData(
                floatingSelection.imageData,
                floatingSelection.x,
                floatingSelection.y,
            );
            // Draw marching ants around floating selection
            gridCtx.strokeStyle = "#000";
            gridCtx.lineWidth = 1;
            gridCtx.setLineDash([4, 4]);
            gridCtx.strokeRect(
                floatingSelection.x + 0.5,
                floatingSelection.y + 0.5,
                floatingSelection.imageData.width - 1,
                floatingSelection.imageData.height - 1,
            );
            gridCtx.strokeStyle = "#fff";
            gridCtx.lineDashOffset = 4;
            gridCtx.strokeRect(
                floatingSelection.x + 0.5,
                floatingSelection.y + 0.5,
                floatingSelection.imageData.width - 1,
                floatingSelection.imageData.height - 1,
            );
            gridCtx.setLineDash([]);
            gridCtx.lineDashOffset = 0;
            return;
        }

        if (!hasSelection && !isSelecting) return;

        const rect = getSelectionRect();

        // Draw marching ants selection border
        gridCtx.strokeStyle = "#000";
        gridCtx.lineWidth = 1;
        gridCtx.setLineDash([4, 4]);
        gridCtx.strokeRect(
            rect.x + 0.5,
            rect.y + 0.5,
            rect.width - 1,
            rect.height - 1,
        );
        gridCtx.strokeStyle = "#fff";
        gridCtx.lineDashOffset = 4;
        gridCtx.strokeRect(
            rect.x + 0.5,
            rect.y + 0.5,
            rect.width - 1,
            rect.height - 1,
        );
        gridCtx.setLineDash([]);
        gridCtx.lineDashOffset = 0;

        // Draw semi-transparent fill
        gridCtx.fillStyle = "rgba(100, 108, 255, 0.1)";
        gridCtx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    // Lasso functions
    function drawLassoOverlay() {
        if (!gridCtx) return;
        clearGridCanvas();
        if (showGrid) drawGrid();

        // Draw floating selection if exists (from lasso)
        if (floatingSelection) {
            gridCtx.putImageData(
                floatingSelection.imageData,
                floatingSelection.x,
                floatingSelection.y,
            );
            // Draw marching ants around floating selection
            gridCtx.strokeStyle = "#000";
            gridCtx.lineWidth = 1;
            gridCtx.setLineDash([4, 4]);
            gridCtx.strokeRect(
                floatingSelection.x + 0.5,
                floatingSelection.y + 0.5,
                floatingSelection.imageData.width - 1,
                floatingSelection.imageData.height - 1,
            );
            gridCtx.strokeStyle = "#fff";
            gridCtx.lineDashOffset = 4;
            gridCtx.strokeRect(
                floatingSelection.x + 0.5,
                floatingSelection.y + 0.5,
                floatingSelection.imageData.width - 1,
                floatingSelection.imageData.height - 1,
            );
            gridCtx.setLineDash([]);
            gridCtx.lineDashOffset = 0;
            return;
        }

        // Draw lasso path while drawing
        if (isLassoing && lassoPoints.length > 1) {
            gridCtx.strokeStyle = "#000";
            gridCtx.lineWidth = 1;
            gridCtx.setLineDash([4, 4]);
            gridCtx.beginPath();
            gridCtx.moveTo(lassoPoints[0].x + 0.5, lassoPoints[0].y + 0.5);
            for (let i = 1; i < lassoPoints.length; i++) {
                gridCtx.lineTo(lassoPoints[i].x + 0.5, lassoPoints[i].y + 0.5);
            }
            gridCtx.stroke();

            gridCtx.strokeStyle = "#fff";
            gridCtx.lineDashOffset = 4;
            gridCtx.beginPath();
            gridCtx.moveTo(lassoPoints[0].x + 0.5, lassoPoints[0].y + 0.5);
            for (let i = 1; i < lassoPoints.length; i++) {
                gridCtx.lineTo(lassoPoints[i].x + 0.5, lassoPoints[i].y + 0.5);
            }
            gridCtx.stroke();
            gridCtx.setLineDash([]);
            gridCtx.lineDashOffset = 0;
        }

        // Draw completed lasso selection with mask
        if (lassoMask && lassoBounds) {
            // Draw marching ants outline
            gridCtx.strokeStyle = "#000";
            gridCtx.lineWidth = 1;
            gridCtx.setLineDash([4, 4]);

            // Draw the polygon outline
            if (lassoPoints.length > 2) {
                gridCtx.beginPath();
                gridCtx.moveTo(lassoPoints[0].x + 0.5, lassoPoints[0].y + 0.5);
                for (let i = 1; i < lassoPoints.length; i++) {
                    gridCtx.lineTo(
                        lassoPoints[i].x + 0.5,
                        lassoPoints[i].y + 0.5,
                    );
                }
                gridCtx.closePath();
                gridCtx.stroke();

                gridCtx.strokeStyle = "#fff";
                gridCtx.lineDashOffset = 4;
                gridCtx.beginPath();
                gridCtx.moveTo(lassoPoints[0].x + 0.5, lassoPoints[0].y + 0.5);
                for (let i = 1; i < lassoPoints.length; i++) {
                    gridCtx.lineTo(
                        lassoPoints[i].x + 0.5,
                        lassoPoints[i].y + 0.5,
                    );
                }
                gridCtx.closePath();
                gridCtx.stroke();
            }

            gridCtx.setLineDash([]);
            gridCtx.lineDashOffset = 0;

            // Draw semi-transparent fill for selected area
            gridCtx.fillStyle = "rgba(100, 108, 255, 0.15)";
            for (let y = lassoBounds.minY; y <= lassoBounds.maxY; y++) {
                for (let x = lassoBounds.minX; x <= lassoBounds.maxX; x++) {
                    if (lassoMask[y] && lassoMask[y][x]) {
                        gridCtx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
    }

    function pointInPolygon(
        x: number,
        y: number,
        polygon: { x: number; y: number }[],
    ): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x,
                yi = polygon[i].y;
            const xj = polygon[j].x,
                yj = polygon[j].y;
            if (
                yi > y !== yj > y &&
                x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
            ) {
                inside = !inside;
            }
        }
        return inside;
    }

    function createLassoMask(): void {
        if (lassoPoints.length < 3) return;

        // Calculate bounds
        let minX = canvasWidth,
            minY = canvasHeight,
            maxX = 0,
            maxY = 0;
        for (const point of lassoPoints) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        // Clamp to canvas bounds
        minX = Math.max(0, minX);
        minY = Math.max(0, minY);
        maxX = Math.min(canvasWidth - 1, maxX);
        maxY = Math.min(canvasHeight - 1, maxY);

        lassoBounds = { minX, minY, maxX, maxY };

        // Create mask using point-in-polygon test
        lassoMask = [];
        for (let y = 0; y < canvasHeight; y++) {
            lassoMask[y] = [];
            for (let x = 0; x < canvasWidth; x++) {
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    lassoMask[y][x] = pointInPolygon(x, y, lassoPoints);
                } else {
                    lassoMask[y][x] = false;
                }
            }
        }
    }

    function extractLassoSelection(): void {
        if (!activeCtx || !lassoMask || !lassoBounds) return;

        const { minX, minY, maxX, maxY } = lassoBounds;
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        // Get the image data for the bounding box
        const sourceData = activeCtx.getImageData(minX, minY, width, height);

        // Create new image data with only the masked pixels
        const newData = new ImageData(width, height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const canvasX = minX + x;
                const canvasY = minY + y;
                if (lassoMask[canvasY] && lassoMask[canvasY][canvasX]) {
                    const srcIdx = (y * width + x) * 4;
                    newData.data[srcIdx] = sourceData.data[srcIdx];
                    newData.data[srcIdx + 1] = sourceData.data[srcIdx + 1];
                    newData.data[srcIdx + 2] = sourceData.data[srcIdx + 2];
                    newData.data[srcIdx + 3] = sourceData.data[srcIdx + 3];
                }
            }
        }

        lassoImageData = newData;
    }

    function copyLassoSelection(): void {
        if (!lassoImageData) return;
        clipboard = new ImageData(
            new Uint8ClampedArray(lassoImageData.data),
            lassoImageData.width,
            lassoImageData.height,
        );
    }

    function cutLassoSelection(): void {
        if (!activeCtx || !lassoMask || !lassoBounds) return;

        extractLassoSelection();
        copyLassoSelection();

        saveState();

        // Clear the masked area on canvas
        const { minX, minY, maxX, maxY } = lassoBounds;
        const imageData = activeCtx.getImageData(
            0,
            0,
            canvasWidth,
            canvasHeight,
        );

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (lassoMask[y] && lassoMask[y][x]) {
                    const idx = (y * canvasWidth + x) * 4;
                    imageData.data[idx] = 0;
                    imageData.data[idx + 1] = 0;
                    imageData.data[idx + 2] = 0;
                    imageData.data[idx + 3] = 0;
                }
            }
        }

        activeCtx.putImageData(imageData, 0, 0);
        clearLassoSelection();
        compositeAndRender();
    }

    function deleteLassoSelection(): void {
        if (!activeCtx || !lassoMask || !lassoBounds) return;

        saveState();

        const { minX, minY, maxX, maxY } = lassoBounds;
        const imageData = activeCtx.getImageData(
            0,
            0,
            canvasWidth,
            canvasHeight,
        );

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (lassoMask[y] && lassoMask[y][x]) {
                    const idx = (y * canvasWidth + x) * 4;
                    imageData.data[idx] = 0;
                    imageData.data[idx + 1] = 0;
                    imageData.data[idx + 2] = 0;
                    imageData.data[idx + 3] = 0;
                }
            }
        }

        activeCtx.putImageData(imageData, 0, 0);
        clearLassoSelection();
        compositeAndRender();
    }

    function moveLassoToFloating(): void {
        if (!activeCtx || !lassoMask || !lassoBounds || !lassoImageData) return;

        saveState();

        // Clear the original area
        const imageData = activeCtx.getImageData(
            0,
            0,
            canvasWidth,
            canvasHeight,
        );
        const { minX, minY, maxX, maxY } = lassoBounds;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (lassoMask[y] && lassoMask[y][x]) {
                    const idx = (y * canvasWidth + x) * 4;
                    imageData.data[idx] = 0;
                    imageData.data[idx + 1] = 0;
                    imageData.data[idx + 2] = 0;
                    imageData.data[idx + 3] = 0;
                }
            }
        }
        activeCtx.putImageData(imageData, 0, 0);

        // Create floating selection
        floatingSelection = {
            imageData: new ImageData(
                new Uint8ClampedArray(lassoImageData.data),
                lassoImageData.width,
                lassoImageData.height,
            ),
            x: minX,
            y: minY,
        };

        // Clear lasso state but keep points for reference
        lassoMask = null;
        lassoImageData = null;
        lassoBounds = null;

        compositeAndRender();
    }

    function clearLassoSelection(): void {
        lassoPoints = [];
        lassoMask = null;
        lassoImageData = null;
        lassoBounds = null;
        drawLassoOverlay();
    }

    function isInsideLassoSelection(px: number, py: number): boolean {
        if (floatingSelection) {
            return (
                px >= floatingSelection.x &&
                px < floatingSelection.x + floatingSelection.imageData.width &&
                py >= floatingSelection.y &&
                py < floatingSelection.y + floatingSelection.imageData.height
            );
        }
        if (!lassoMask) return false;
        return lassoMask[py] && lassoMask[py][px];
    }

    function snapToIsometricAngle(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
    ): { x: number; y: number } {
        const dx = endX - startX;
        const dy = endY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return { x: endX, y: endY };

        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        let closestAngle = ISOMETRIC_ANGLES[0];
        let minDiff = Math.abs(angle - closestAngle);

        for (const isoAngle of ISOMETRIC_ANGLES) {
            const diff = Math.abs(angle - isoAngle);
            if (diff < minDiff) {
                minDiff = diff;
                closestAngle = isoAngle;
            }
        }

        const snappedRadians = closestAngle * (Math.PI / 180);
        return {
            x: startX + Math.cos(snappedRadians) * distance,
            y: startY + Math.sin(snappedRadians) * distance,
        };
    }

    function getCanvasCoordinates(e: MouseEvent): { x: number; y: number } {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvasWidth / rect.width;
        const scaleY = canvasHeight / rect.height;
        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY),
        };
    }

    function hexToRgba(
        hex: string,
        opacity: number = 100,
    ): {
        r: number;
        g: number;
        b: number;
        a: number;
    } {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        const alpha = Math.round((opacity / 100) * 255);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
                  a: alpha,
              }
            : { r: 0, g: 0, b: 0, a: alpha };
    }

    function rgbaToString(color: {
        r: number;
        g: number;
        b: number;
        a: number;
    }): string {
        return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
    }

    function colorsMatch(
        c1: { r: number; g: number; b: number; a: number },
        c2: { r: number; g: number; b: number; a: number },
        tolerance: number = 0,
    ): boolean {
        return (
            Math.abs(c1.r - c2.r) <= tolerance &&
            Math.abs(c1.g - c2.g) <= tolerance &&
            Math.abs(c1.b - c2.b) <= tolerance &&
            Math.abs(c1.a - c2.a) <= tolerance
        );
    }

    function getPixelColor(
        imageData: ImageData,
        x: number,
        y: number,
    ): { r: number; g: number; b: number; a: number } {
        const index = (y * imageData.width + x) * 4;
        return {
            r: imageData.data[index],
            g: imageData.data[index + 1],
            b: imageData.data[index + 2],
            a: imageData.data[index + 3],
        };
    }

    function setPixelColor(
        imageData: ImageData,
        x: number,
        y: number,
        color: { r: number; g: number; b: number; a: number },
    ) {
        const index = (y * imageData.width + x) * 4;
        imageData.data[index] = color.r;
        imageData.data[index + 1] = color.g;
        imageData.data[index + 2] = color.b;
        imageData.data[index + 3] = color.a;
    }

    function floodFill(startX: number, startY: number) {
        if (!activeCtx) return;
        if (
            startX < 0 ||
            startX >= canvasWidth ||
            startY < 0 ||
            startY >= canvasHeight
        )
            return;

        saveState();

        const imageData = activeCtx.getImageData(
            0,
            0,
            canvasWidth,
            canvasHeight,
        );
        const targetColor = getPixelColor(imageData, startX, startY);
        const fillColor = hexToRgba(paintColor, paintOpacity);

        // Only skip if colors match exactly (including alpha)
        if (colorsMatch(targetColor, fillColor)) return;

        const stack: [number, number][] = [[startX, startY]];
        const visited = new Set<string>();

        while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight)
                continue;

            const currentColor = getPixelColor(imageData, x, y);
            if (!colorsMatch(currentColor, targetColor)) continue;

            visited.add(key);
            setPixelColor(imageData, x, y, fillColor);

            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        activeCtx.putImageData(imageData, 0, 0);
        compositeAndRender();
    }

    function replaceColor(startX: number, startY: number) {
        if (!activeCtx) return;
        if (
            startX < 0 ||
            startX >= canvasWidth ||
            startY < 0 ||
            startY >= canvasHeight
        )
            return;

        saveState();

        const imageData = activeCtx.getImageData(
            0,
            0,
            canvasWidth,
            canvasHeight,
        );
        const targetColor = getPixelColor(imageData, startX, startY);
        const fillColor = hexToRgba(paintColor, paintOpacity);

        // Only skip if colors match exactly (including alpha)
        if (colorsMatch(targetColor, fillColor)) return;

        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const currentColor = getPixelColor(imageData, x, y);
                if (colorsMatch(currentColor, targetColor)) {
                    setPixelColor(imageData, x, y, fillColor);
                }
            }
        }

        activeCtx.putImageData(imageData, 0, 0);
        compositeAndRender();
    }

    // Basic shape drawing functions
    function drawSquare(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
    ) {
        const halfSize = size / 2;
        const x = Math.round(cx - halfSize);
        const y = Math.round(cy - halfSize);

        targetCtx.fillStyle = color;
        targetCtx.strokeStyle = color;

        if (filled) {
            targetCtx.fillRect(x, y, size, size);
        } else {
            targetCtx.lineWidth = 1;
            targetCtx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
        }
    }

    function drawRectangle(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        width: number,
        height: number,
        color: string,
        filled: boolean = true,
    ) {
        const x = Math.round(cx - width / 2);
        const y = Math.round(cy - height / 2);

        targetCtx.fillStyle = color;
        targetCtx.strokeStyle = color;

        if (filled) {
            targetCtx.fillRect(x, y, width, height);
        } else {
            targetCtx.lineWidth = 1;
            targetCtx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        }
    }

    function drawCircle(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
    ) {
        const radius = size / 2;

        targetCtx.fillStyle = color;
        targetCtx.strokeStyle = color;
        targetCtx.beginPath();
        targetCtx.arc(cx, cy, radius, 0, Math.PI * 2);

        if (filled) {
            targetCtx.fill();
        } else {
            targetCtx.lineWidth = 1;
            targetCtx.stroke();
        }
    }

    function drawTriangle(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
    ) {
        const halfSize = size / 2;
        const height = size * (Math.sqrt(3) / 2);
        const topY = cy - height / 2;
        const bottomY = cy + height / 2;

        targetCtx.fillStyle = color;
        targetCtx.strokeStyle = color;
        targetCtx.beginPath();
        targetCtx.moveTo(cx, topY);
        targetCtx.lineTo(cx + halfSize, bottomY);
        targetCtx.lineTo(cx - halfSize, bottomY);
        targetCtx.closePath();

        if (filled) {
            targetCtx.fill();
        } else {
            targetCtx.lineWidth = 1;
            targetCtx.stroke();
        }
    }

    function drawStar(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
        points: number = 5,
    ) {
        const outerRadius = size / 2;
        const innerRadius = outerRadius * 0.4;
        const step = Math.PI / points;

        targetCtx.fillStyle = color;
        targetCtx.strokeStyle = color;
        targetCtx.beginPath();

        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = i * step - Math.PI / 2;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;

            if (i === 0) {
                targetCtx.moveTo(x, y);
            } else {
                targetCtx.lineTo(x, y);
            }
        }

        targetCtx.closePath();

        if (filled) {
            targetCtx.fill();
        } else {
            targetCtx.lineWidth = 1;
            targetCtx.stroke();
        }
    }

    function drawHexagon(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
    ) {
        const radius = size / 2;

        targetCtx.fillStyle = color;
        targetCtx.strokeStyle = color;
        targetCtx.beginPath();

        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3 - Math.PI / 6;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;

            if (i === 0) {
                targetCtx.moveTo(x, y);
            } else {
                targetCtx.lineTo(x, y);
            }
        }

        targetCtx.closePath();

        if (filled) {
            targetCtx.fill();
        } else {
            targetCtx.lineWidth = 1;
            targetCtx.stroke();
        }
    }

    // Isometric shape drawing functions
    function drawIsometricDiamond(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
    ) {
        const halfWidth = size / 2;
        const halfHeight = size / 4;

        if (filled) {
            targetCtx.fillStyle = color;
            targetCtx.beginPath();
            targetCtx.moveTo(cx, cy - halfHeight);
            targetCtx.lineTo(cx + halfWidth, cy);
            targetCtx.lineTo(cx, cy + halfHeight);
            targetCtx.lineTo(cx - halfWidth, cy);
            targetCtx.closePath();
            targetCtx.fill();
        } else {
            const top = { x: Math.round(cx), y: Math.round(cy - halfHeight) };
            const right = { x: Math.round(cx + halfWidth), y: Math.round(cy) };
            const bottom = {
                x: Math.round(cx),
                y: Math.round(cy + halfHeight),
            };
            const left = { x: Math.round(cx - halfWidth), y: Math.round(cy) };

            drawLinePixels(top.x, top.y, right.x, right.y, targetCtx, color);
            drawLinePixels(
                right.x,
                right.y,
                bottom.x,
                bottom.y,
                targetCtx,
                color,
            );
            drawLinePixels(
                bottom.x,
                bottom.y,
                left.x,
                left.y,
                targetCtx,
                color,
            );
            drawLinePixels(left.x, left.y, top.x, top.y, targetCtx, color);
        }
    }

    function drawIsometricEllipse(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
    ) {
        const radiusX = size / 2;
        const radiusY = size / 4;

        if (filled) {
            targetCtx.fillStyle = color;
            targetCtx.beginPath();
            targetCtx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
            targetCtx.fill();
        } else {
            targetCtx.fillStyle = color;
            for (let angle = 0; angle < 360; angle += 1) {
                const rad = (angle * Math.PI) / 180;
                const x = Math.round(cx + Math.cos(rad) * radiusX);
                const y = Math.round(cy + Math.sin(rad) * radiusY);
                if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
                    targetCtx.fillRect(x, y, 1, 1);
                }
            }
        }
    }

    function drawCubeTop(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
    ) {
        drawIsometricDiamond(targetCtx, cx, cy, size, color, true);
    }

    function drawCubeLeft(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
    ) {
        const halfWidth = size / 2;
        const halfHeight = size / 4;
        const depth = size / 2;

        targetCtx.fillStyle = color;
        targetCtx.beginPath();
        targetCtx.moveTo(cx - halfWidth, cy);
        targetCtx.lineTo(cx, cy + halfHeight);
        targetCtx.lineTo(cx, cy + halfHeight + depth);
        targetCtx.lineTo(cx - halfWidth, cy + depth);
        targetCtx.closePath();
        targetCtx.fill();
    }

    function drawCubeRight(
        targetCtx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        size: number,
        color: string,
    ) {
        const halfWidth = size / 2;
        const halfHeight = size / 4;
        const depth = size / 2;

        targetCtx.fillStyle = color;
        targetCtx.beginPath();
        targetCtx.moveTo(cx + halfWidth, cy);
        targetCtx.lineTo(cx, cy + halfHeight);
        targetCtx.lineTo(cx, cy + halfHeight + depth);
        targetCtx.lineTo(cx + halfWidth, cy + depth);
        targetCtx.closePath();
        targetCtx.fill();
    }

    // Helper function to draw a shape by ID (used by drawShape for both temp canvas and direct drawing)
    function drawShapeById(
        targetCtx: CanvasRenderingContext2D,
        shapeId: string,
        cx: number,
        cy: number,
        size: number,
        width: number,
        height: number,
        color: string,
        filled: boolean,
    ) {
        switch (shapeId) {
            // Basic shapes
            case "square":
                drawSquare(targetCtx, cx, cy, size, color, filled);
                break;
            case "rectangle":
                drawRectangle(targetCtx, cx, cy, width, height, color, filled);
                break;
            case "circle":
                drawCircle(targetCtx, cx, cy, size, color, filled);
                break;
            case "triangle":
                drawTriangle(targetCtx, cx, cy, size, color, filled);
                break;
            case "star":
                drawStar(targetCtx, cx, cy, size, color, filled);
                break;
            case "hexagon":
                drawHexagon(targetCtx, cx, cy, size, color, filled);
                break;
            // Isometric shapes
            case "diamond":
                drawIsometricDiamond(targetCtx, cx, cy, size, color, filled);
                break;
            case "ellipse":
                drawIsometricEllipse(targetCtx, cx, cy, size, color, filled);
                break;
            case "cube-top":
                drawCubeTop(targetCtx, cx, cy, size, color);
                break;
            case "cube-left":
                drawCubeLeft(targetCtx, cx, cy, size, color);
                break;
            case "cube-right":
                drawCubeRight(targetCtx, cx, cy, size, color);
                break;
        }
    }

    function drawShape(
        targetCtx: CanvasRenderingContext2D,
        shapeId: string,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
        opacity: number = 100,
        width: number = size,
        height: number = size,
    ) {
        // For shapes with transparency, we draw to a temp canvas then blend
        if (opacity < 100 && targetCtx === activeCtx) {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = canvasWidth;
            tempCanvas.height = canvasHeight;
            const tempCtx = tempCanvas.getContext("2d")!;
            tempCtx.imageSmoothingEnabled = false;

            // Draw shape at full opacity on temp canvas
            drawShapeById(
                tempCtx,
                shapeId,
                cx,
                cy,
                size,
                width,
                height,
                color,
                filled,
            );

            // Blend the shape onto the target canvas with opacity
            const shapeData = tempCtx.getImageData(
                0,
                0,
                canvasWidth,
                canvasHeight,
            );
            const targetData = targetCtx.getImageData(
                0,
                0,
                canvasWidth,
                canvasHeight,
            );
            const alpha = opacity / 100;

            for (let i = 0; i < shapeData.data.length; i += 4) {
                if (shapeData.data[i + 3] > 0) {
                    const srcAlpha = (shapeData.data[i + 3] / 255) * alpha;
                    const dstAlpha = targetData.data[i + 3] / 255;
                    const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

                    if (outAlpha > 0) {
                        targetData.data[i] = Math.round(
                            (shapeData.data[i] * srcAlpha +
                                targetData.data[i] *
                                    dstAlpha *
                                    (1 - srcAlpha)) /
                                outAlpha,
                        );
                        targetData.data[i + 1] = Math.round(
                            (shapeData.data[i + 1] * srcAlpha +
                                targetData.data[i + 1] *
                                    dstAlpha *
                                    (1 - srcAlpha)) /
                                outAlpha,
                        );
                        targetData.data[i + 2] = Math.round(
                            (shapeData.data[i + 2] * srcAlpha +
                                targetData.data[i + 2] *
                                    dstAlpha *
                                    (1 - srcAlpha)) /
                                outAlpha,
                        );
                        targetData.data[i + 3] = Math.round(outAlpha * 255);
                    }
                }
            }

            targetCtx.putImageData(targetData, 0, 0);
        } else {
            drawShapeById(
                targetCtx,
                shapeId,
                cx,
                cy,
                size,
                width,
                height,
                color,
                filled,
            );
        }
    }

    function drawShapePreview() {
        if (!gridCtx) return;
        clearGridCanvas();
        if (showGrid) drawGrid();

        gridCtx.globalAlpha = 0.6;
        drawShape(
            gridCtx,
            selectedShape,
            shapePreviewX,
            shapePreviewY,
            shapeSize,
            paintColor,
            true,
            100,
            shapeWidth,
            shapeHeight,
        );
        gridCtx.globalAlpha = 1;
    }

    function paintPixel(x: number, y: number) {
        if (!activeCtx) return;

        const color = hexToRgba(paintColor, paintOpacity);
        const offset = Math.floor(brushSize / 2);

        // For full opacity, use simple fillRect
        if (paintOpacity === 100) {
            activeCtx.fillStyle = paintColor;
            for (let dx = 0; dx < brushSize; dx++) {
                for (let dy = 0; dy < brushSize; dy++) {
                    const px = x - offset + dx;
                    const py = y - offset + dy;
                    if (
                        px >= 0 &&
                        px < canvasWidth &&
                        py >= 0 &&
                        py < canvasHeight
                    ) {
                        activeCtx.fillRect(px, py, 1, 1);
                    }
                }
            }
        } else {
            // For partial opacity, use ImageData for proper alpha handling
            const imageData = activeCtx.getImageData(
                0,
                0,
                canvasWidth,
                canvasHeight,
            );

            for (let dx = 0; dx < brushSize; dx++) {
                for (let dy = 0; dy < brushSize; dy++) {
                    const px = x - offset + dx;
                    const py = y - offset + dy;
                    if (
                        px >= 0 &&
                        px < canvasWidth &&
                        py >= 0 &&
                        py < canvasHeight
                    ) {
                        blendPixel(imageData, px, py, color);
                    }
                }
            }

            activeCtx.putImageData(imageData, 0, 0);
        }
        compositeAndRender();
    }

    // Alpha blending function for semi-transparent painting
    function blendPixel(
        imageData: ImageData,
        x: number,
        y: number,
        color: { r: number; g: number; b: number; a: number },
    ) {
        const index = (y * imageData.width + x) * 4;
        const srcAlpha = color.a / 255;
        const dstAlpha = imageData.data[index + 3] / 255;

        // Standard alpha compositing (Porter-Duff "over" operation)
        const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

        if (outAlpha > 0) {
            imageData.data[index] = Math.round(
                (color.r * srcAlpha +
                    imageData.data[index] * dstAlpha * (1 - srcAlpha)) /
                    outAlpha,
            );
            imageData.data[index + 1] = Math.round(
                (color.g * srcAlpha +
                    imageData.data[index + 1] * dstAlpha * (1 - srcAlpha)) /
                    outAlpha,
            );
            imageData.data[index + 2] = Math.round(
                (color.b * srcAlpha +
                    imageData.data[index + 2] * dstAlpha * (1 - srcAlpha)) /
                    outAlpha,
            );
            imageData.data[index + 3] = Math.round(outAlpha * 255);
        }
    }

    function drawLinePixels(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        targetCtx: CanvasRenderingContext2D,
        color: string,
        opacity: number = 100,
    ) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;

        let x = x1;
        let y = y1;

        // For full opacity or preview (gridCtx), use simple fillRect
        if (opacity === 100 || targetCtx !== activeCtx) {
            targetCtx.fillStyle = color;

            while (true) {
                if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
                    targetCtx.fillRect(x, y, 1, 1);
                }

                if (x === x2 && y === y2) break;

                const e2 = 2 * err;
                if (e2 > -dy) {
                    err -= dy;
                    x += sx;
                }
                if (e2 < dx) {
                    err += dx;
                    y += sy;
                }
            }
        } else {
            // For partial opacity, collect points first then blend
            const points: { x: number; y: number }[] = [];

            while (true) {
                if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
                    points.push({ x, y });
                }

                if (x === x2 && y === y2) break;

                const e2 = 2 * err;
                if (e2 > -dy) {
                    err -= dy;
                    x += sx;
                }
                if (e2 < dx) {
                    err += dx;
                    y += sy;
                }
            }

            // Blend all points with opacity
            const imageData = targetCtx.getImageData(
                0,
                0,
                canvasWidth,
                canvasHeight,
            );
            const rgba = hexToRgba(color, opacity);

            for (const point of points) {
                blendPixel(imageData, point.x, point.y, rgba);
            }

            targetCtx.putImageData(imageData, 0, 0);
        }
    }

    function drawLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        targetCtx: CanvasRenderingContext2D,
        color: string,
        updatePreviewAfter: boolean = false,
        opacity: number = 100,
    ) {
        drawLinePixels(x1, y1, x2, y2, targetCtx, color, opacity);
        if (updatePreviewAfter) {
            updatePreview();
        }
    }

    function handleMouseDown(e: MouseEvent) {
        if (tool === "pan") {
            isPanning = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            scrollStartX = canvasWrapper.scrollLeft;
            scrollStartY = canvasWrapper.scrollTop;
            return;
        }

        const { x, y } = getCanvasCoordinates(e);

        if (tool === "select") {
            // Check if clicking inside floating selection to move it
            if (floatingSelection && isInsideSelection(x, y)) {
                isMovingSelection = true;
                moveStartX = x - floatingSelection.x;
                moveStartY = y - floatingSelection.y;
                return;
            }
            // Check if clicking inside existing selection to convert to floating and move
            if (hasSelection && isInsideSelection(x, y)) {
                // Convert selection to floating selection
                const rect = getSelectionRect();
                if (activeCtx) {
                    const selectionData = activeCtx.getImageData(
                        rect.x,
                        rect.y,
                        rect.width,
                        rect.height,
                    );
                    saveState();
                    activeCtx.clearRect(
                        rect.x,
                        rect.y,
                        rect.width,
                        rect.height,
                    );
                    floatingSelection = {
                        imageData: selectionData,
                        x: rect.x,
                        y: rect.y,
                    };
                    hasSelection = false;
                    isMovingSelection = true;
                    moveStartX = x - floatingSelection.x;
                    moveStartY = y - floatingSelection.y;
                    compositeAndRender();
                    drawSelectionOverlay();
                }
                return;
            }
            // Commit any floating selection before starting new selection
            commitFloatingSelection();
            // Start new selection
            isSelecting = true;
            selectionStartX = x;
            selectionStartY = y;
            selectionEndX = x;
            selectionEndY = y;
            hasSelection = false;
            drawSelectionOverlay();
            return;
        } else if (tool === "lasso") {
            // Check if clicking inside floating selection to move it
            if (floatingSelection && isInsideLassoSelection(x, y)) {
                isMovingSelection = true;
                moveStartX = x - floatingSelection.x;
                moveStartY = y - floatingSelection.y;
                return;
            }
            // Check if clicking inside existing lasso selection to move it
            if (lassoMask && isInsideLassoSelection(x, y)) {
                extractLassoSelection();
                moveLassoToFloating();
                isMovingSelection = true;
                if (floatingSelection) {
                    moveStartX = x - floatingSelection.x;
                    moveStartY = y - floatingSelection.y;
                }
                drawLassoOverlay();
                return;
            }
            // Commit any floating selection before starting new lasso
            commitFloatingSelection();
            clearLassoSelection();
            // Start new lasso
            isLassoing = true;
            lassoPoints = [{ x, y }];
            drawLassoOverlay();
            return;
        } else if (tool === "pixel") {
            saveState();
            isDrawing = true;
            paintPixel(x, y);
        } else if (tool === "line") {
            saveState();
            isDrawingLine = true;
            lineStartX = x;
            lineStartY = y;
            linePreviewEndX = x;
            linePreviewEndY = y;
        } else if (tool === "fill") {
            floodFill(x, y);
        } else if (tool === "replace") {
            replaceColor(x, y);
        } else if (tool === "shape") {
            saveState();
            if (activeCtx) {
                drawShape(
                    activeCtx,
                    selectedShape,
                    x,
                    y,
                    shapeSize,
                    paintColor,
                    true,
                    paintOpacity,
                    shapeWidth,
                    shapeHeight,
                );
                compositeAndRender();
            }
        }
    }

    function handleMouseMove(e: MouseEvent) {
        if (tool === "pan" && isPanning) {
            const dx = e.clientX - panStartX;
            const dy = e.clientY - panStartY;
            canvasWrapper.scrollLeft = scrollStartX - dx;
            canvasWrapper.scrollTop = scrollStartY - dy;
            return;
        }

        const { x, y } = getCanvasCoordinates(e);

        if (tool === "select") {
            if (isMovingSelection && floatingSelection) {
                floatingSelection.x = x - moveStartX;
                floatingSelection.y = y - moveStartY;
                drawSelectionOverlay();
                return;
            }
            if (isSelecting) {
                selectionEndX = Math.max(0, Math.min(canvasWidth - 1, x));
                selectionEndY = Math.max(0, Math.min(canvasHeight - 1, y));
                drawSelectionOverlay();
                return;
            }
        } else if (tool === "lasso") {
            if (isMovingSelection && floatingSelection) {
                floatingSelection.x = x - moveStartX;
                floatingSelection.y = y - moveStartY;
                drawLassoOverlay();
                return;
            }
            if (isLassoing) {
                // Add point if it's different from last point (avoid duplicates)
                const lastPoint = lassoPoints[lassoPoints.length - 1];
                if (lastPoint.x !== x || lastPoint.y !== y) {
                    lassoPoints = [...lassoPoints, { x, y }];
                    drawLassoOverlay();
                }
                return;
            }
        } else if (tool === "pixel" && isDrawing) {
            paintPixel(x, y);
        } else if (tool === "line" && isDrawingLine) {
            const snapped = snapToIsometricAngle(lineStartX, lineStartY, x, y);
            linePreviewEndX = Math.round(snapped.x);
            linePreviewEndY = Math.round(snapped.y);
            drawLinePreview();
        } else if (tool === "shape") {
            shapePreviewX = x;
            shapePreviewY = y;
            drawShapePreview();
        }
    }

    function handleMouseUp(e: MouseEvent) {
        if (tool === "pan") {
            isPanning = false;
            return;
        }

        if (tool === "select") {
            if (isMovingSelection) {
                isMovingSelection = false;
                return;
            }
            if (isSelecting) {
                isSelecting = false;
                const rect = getSelectionRect();
                if (rect.width > 1 || rect.height > 1) {
                    hasSelection = true;
                }
                drawSelectionOverlay();
                return;
            }
        } else if (tool === "lasso") {
            if (isMovingSelection) {
                isMovingSelection = false;
                return;
            }
            if (isLassoing) {
                isLassoing = false;
                if (lassoPoints.length >= 3) {
                    createLassoMask();
                    extractLassoSelection();
                }
                drawLassoOverlay();
                return;
            }
        } else if (tool === "pixel") {
            isDrawing = false;
        } else if (tool === "line" && isDrawingLine) {
            isDrawingLine = false;
            if (activeCtx) {
                drawLine(
                    lineStartX,
                    lineStartY,
                    linePreviewEndX,
                    linePreviewEndY,
                    activeCtx,
                    paintColor,
                    true,
                    paintOpacity,
                );
                compositeAndRender();
            }
            clearGridCanvas();
            if (showGrid) drawGrid();
        }
    }

    function handleMouseLeave() {
        isDrawing = false;
        isPanning = false;
        isSelecting = false;
        isMovingSelection = false;
        isLassoing = false;
        if (isDrawingLine) {
            isDrawingLine = false;
            clearGridCanvas();
            if (showGrid) drawGrid();
        }
        if (tool === "shape") {
            clearGridCanvas();
            if (showGrid) drawGrid();
        }
    }

    function handleWheel(e: WheelEvent) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        }
    }

    function drawLinePreview() {
        if (!gridCtx) return;
        clearGridCanvas();
        if (showGrid) drawGrid();

        gridCtx.globalAlpha = 0.7;
        drawLine(
            lineStartX,
            lineStartY,
            linePreviewEndX,
            linePreviewEndY,
            gridCtx,
            paintColor,
        );
        gridCtx.globalAlpha = 1;
    }

    function clearGridCanvas() {
        if (!gridCtx) return;
        gridCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }

    function drawGrid() {
        if (!gridCtx || !showGrid) return;

        gridCtx.strokeStyle = "rgba(128, 128, 128, 0.5)";
        gridCtx.lineWidth = 1;

        for (let x = 0; x <= canvasWidth; x += gridSize) {
            gridCtx.beginPath();
            gridCtx.moveTo(x + 0.5, 0);
            gridCtx.lineTo(x + 0.5, canvasHeight);
            gridCtx.stroke();
        }

        for (let y = 0; y <= canvasHeight; y += gridSize) {
            gridCtx.beginPath();
            gridCtx.moveTo(0, y + 0.5);
            gridCtx.lineTo(canvasWidth, y + 0.5);
            gridCtx.stroke();
        }
    }

    function toggleGrid() {
        showGrid = !showGrid;
        clearGridCanvas();
        if (showGrid) drawGrid();
    }

    function setGridSize(size: number) {
        gridSize = size;
        clearGridCanvas();
        if (showGrid) drawGrid();
    }

    function zoomIn() {
        if (zoom < 32) {
            zoom = Math.min(32, zoom * 2);
        }
    }

    function zoomOut() {
        if (zoom > 0.125) {
            zoom = Math.max(0.125, zoom / 2);
        }
    }

    function clearCanvas() {
        if (!activeCtx) return;
        saveState();
        activeCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        compositeAndRender();
    }

    function updatePreview() {
        if (!previewCtx || !canvas) return;
        previewCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        previewCtx.drawImage(canvas, 0, 0);
    }

    function exportPNG() {
        if (!canvas) return;

        // Ensure the main canvas has all visible layers composited
        compositeAndRender();

        const link = document.createElement("a");
        link.download = "isometric-asset.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
    }

    function applyCanvasSize(width: number, height: number) {
        // Save image data from all layers before resizing
        const layerImageData = layers.map((layer) => ({
            id: layer.id,
            imageData: layer.ctx.getImageData(0, 0, canvasWidth, canvasHeight),
        }));

        canvasWidth = width;
        canvasHeight = height;
        customWidth = String(width);
        customHeight = String(height);

        undoStack = [];
        redoStack = [];

        requestAnimationFrame(() => {
            // Resize all layer canvases and restore their content
            for (const layer of layers) {
                layer.canvas.width = width;
                layer.canvas.height = height;
                layer.ctx.imageSmoothingEnabled = false;

                // Restore layer content
                const savedData = layerImageData.find((d) => d.id === layer.id);
                if (savedData) {
                    layer.ctx.putImageData(savedData.imageData, 0, 0);
                }
            }

            if (ctx) {
                ctx.imageSmoothingEnabled = false;
            }
            if (gridCtx) {
                gridCtx.imageSmoothingEnabled = false;
                clearGridCanvas();
                if (showGrid) drawGrid();
            }
            if (previewCtx) {
                previewCtx.imageSmoothingEnabled = false;
            }
            compositeAndRender();
        });
    }

    function applyCustomSize() {
        const w = parseInt(customWidth);
        const h = parseInt(customHeight);
        if (w > 0 && w <= 2048 && h > 0 && h <= 2048) {
            applyCanvasSize(w, h);
        }
    }

    onMount(() => {
        ctx = canvas.getContext("2d");
        gridCtx = gridCanvas.getContext("2d");
        previewCtx = previewCanvas.getContext("2d");

        if (ctx) {
            ctx.imageSmoothingEnabled = false;
        }

        if (gridCtx) {
            gridCtx.imageSmoothingEnabled = false;
        }

        if (previewCtx) {
            previewCtx.imageSmoothingEnabled = false;
        }

        // Initialize with a single background layer
        const initialLayer = createLayer("Background");
        layers = [initialLayer];
        activeLayerIndex = 0;

        // Load saved images list from localStorage
        loadSavedImagesFromStorage();

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    });

    $effect(() => {
        if (gridCtx) {
            clearGridCanvas();
            if (showGrid) drawGrid();
        }
    });
</script>

<div class="editor-layout">
    <!-- Top Toolbar Area -->
    <header class="toolbar-area">
        <div class="toolbar">
            <div class="tool-group file-menu-container">
                <button
                    class="file-menu-button"
                    class:active={showFileMenu}
                    onclick={toggleFileMenu}
                >
                    File
                </button>
                {#if showFileMenu}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="file-menu-backdrop"
                        onclick={closeFileMenu}
                        onkeydown={(e) => e.key === "Escape" && closeFileMenu()}
                    ></div>
                    <div class="file-menu-dropdown">
                        <button onclick={() => handleFileMenuAction(newImage)}>
                            <span class="menu-item-label">New</span>
                        </button>
                        <button
                            onclick={() => handleFileMenuAction(openLoadModal)}
                        >
                            <span class="menu-item-label">Open...</span>
                            <span class="menu-item-shortcut">Ctrl+O</span>
                        </button>
                        <div class="menu-divider"></div>
                        <button
                            onclick={() =>
                                handleFileMenuAction(() =>
                                    openSaveModal(false),
                                )}
                        >
                            <span class="menu-item-label">Save</span>
                            <span class="menu-item-shortcut">Ctrl+S</span>
                        </button>
                        <button
                            onclick={() =>
                                handleFileMenuAction(() => openSaveModal(true))}
                        >
                            <span class="menu-item-label">Save As...</span>
                            <span class="menu-item-shortcut">Ctrl+Shift+S</span>
                        </button>
                        <div class="menu-divider"></div>
                        <button onclick={() => handleFileMenuAction(exportPNG)}>
                            <span class="menu-item-label">Export PNG</span>
                        </button>
                    </div>
                {/if}
            </div>

            <div class="tool-group file-menu-container">
                <button
                    class="file-menu-button"
                    class:active={showEditMenu}
                    onclick={toggleEditMenu}
                >
                    Edit
                </button>
                {#if showEditMenu}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="file-menu-backdrop"
                        onclick={closeEditMenu}
                        onkeydown={(e) => e.key === "Escape" && closeEditMenu()}
                    ></div>
                    <div class="file-menu-dropdown">
                        <button
                            onclick={() => handleEditMenuAction(undo)}
                            disabled={undoStack.length === 0}
                        >
                            <span class="menu-item-label">Undo</span>
                            <span class="menu-item-shortcut">Ctrl+Z</span>
                        </button>
                        <button
                            onclick={() => handleEditMenuAction(redo)}
                            disabled={redoStack.length === 0}
                        >
                            <span class="menu-item-label">Redo</span>
                            <span class="menu-item-shortcut">Ctrl+Y</span>
                        </button>
                        <div class="menu-divider"></div>
                        <button
                            onclick={() => handleEditMenuAction(clearCanvas)}
                        >
                            <span class="menu-item-label">Clear Canvas</span>
                        </button>
                    </div>
                {/if}
            </div>

            <div class="toolbar-divider"></div>

            <div class="tool-group">
                <span class="group-label">Tool:</span>
                <button
                    class:active={tool === "select"}
                    onclick={() => (tool = "select")}
                    title="Rectangle Select (M)"
                >
                    Select
                </button>
                <button
                    class:active={tool === "lasso"}
                    onclick={() => (tool = "lasso")}
                    title="Lasso Select (L)"
                >
                    Lasso
                </button>
                <button
                    class:active={tool === "pixel"}
                    onclick={() => (tool = "pixel")}
                    title="Pixel brush (B)"
                >
                    Pixel
                </button>
                <button
                    class:active={tool === "line"}
                    onclick={() => (tool = "line")}
                    title="Isometric line (L)"
                >
                    Line
                </button>
                <button
                    class:active={tool === "fill"}
                    onclick={() => (tool = "fill")}
                    title="Flood fill (G)"
                >
                    Fill
                </button>
                <button
                    class:active={tool === "replace"}
                    onclick={() => (tool = "replace")}
                    title="Replace color (R)"
                >
                    Replace
                </button>
                <button
                    class:active={tool === "shape"}
                    onclick={() => (tool = "shape")}
                    title="Isometric shapes (S)"
                >
                    Shape
                </button>
                <button
                    class:active={tool === "pan"}
                    onclick={() => (tool = "pan")}
                    title="Pan (H)"
                >
                    Pan
                </button>
            </div>

            <div class="toolbar-divider"></div>

            <div class="tool-group">
                <label for="color-picker">Color:</label>
                <input id="color-picker" type="color" bind:value={paintColor} />
                <span class="color-hex">{paintColor}</span>
            </div>

            <div class="tool-group">
                <label for="opacity-slider">Opacity:</label>
                <input
                    id="opacity-slider"
                    type="range"
                    min="0"
                    max="100"
                    bind:value={paintOpacity}
                    class="opacity-slider"
                />
                <span class="opacity-value">{paintOpacity}%</span>
            </div>

            <div class="tool-group">
                <label for="brush-size">Brush:</label>
                <input
                    id="brush-size"
                    type="number"
                    min="1"
                    max="64"
                    bind:value={brushSize}
                    class="number-input"
                />
                <span class="unit">px</span>
            </div>
        </div>

        {#if currentImageName}
            <div class="current-file-indicator">
                {currentImageName}
            </div>
        {/if}

        <div class="toolbar secondary">
            {#if tool === "shape"}
                <div class="tool-group">
                    <span class="group-label">Group:</span>
                    <select
                        bind:value={selectedShapeGroup}
                        onchange={() => {
                            // Reset to first shape in new group
                            selectedShape =
                                SHAPE_GROUPS[selectedShapeGroup].shapes[0].id;
                        }}
                    >
                        <option value="basic">Basic</option>
                        <option value="isometric">Isometric</option>
                    </select>
                </div>
                <div class="tool-group">
                    <span class="group-label">Shape:</span>
                    <select bind:value={selectedShape}>
                        {#each SHAPE_GROUPS[selectedShapeGroup].shapes as shape}
                            <option value={shape.id}>{shape.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="tool-group">
                    {#if needsSeparateDimensions}
                        <label for="shape-width">W:</label>
                        <input
                            id="shape-width"
                            type="number"
                            min="4"
                            max="256"
                            bind:value={shapeWidth}
                            class="number-input"
                        />
                        <label for="shape-height">H:</label>
                        <input
                            id="shape-height"
                            type="number"
                            min="4"
                            max="256"
                            bind:value={shapeHeight}
                            class="number-input"
                        />
                    {:else}
                        <label for="shape-size">Size:</label>
                        <input
                            id="shape-size"
                            type="number"
                            min="4"
                            max="256"
                            bind:value={shapeSize}
                            class="number-input"
                        />
                    {/if}
                    <span class="unit">px</span>
                </div>
                <div class="toolbar-divider"></div>
            {/if}

            <div class="tool-group">
                <span class="group-label">Zoom:</span>
                <button onclick={zoomOut} disabled={zoom <= 0.125}>-</button>
                <span class="zoom-value">{Math.round(zoom * 100)}%</span>
                <button onclick={zoomIn} disabled={zoom >= 32}>+</button>
            </div>

            <div class="toolbar-divider"></div>

            <div class="tool-group">
                <span class="group-label">Grid:</span>
                <button
                    class:active={showGrid}
                    onclick={toggleGrid}
                    title="Toggle alignment grid"
                >
                    {showGrid ? "On" : "Off"}
                </button>
                {#if showGrid}
                    <select
                        onchange={(e) =>
                            setGridSize(
                                parseInt((e.target as HTMLSelectElement).value),
                            )}
                    >
                        <option value="4" selected={gridSize === 4}>4px</option>
                        <option value="8" selected={gridSize === 8}>8px</option>
                        <option value="16" selected={gridSize === 16}
                            >16px</option
                        >
                        <option value="32" selected={gridSize === 32}
                            >32px</option
                        >
                    </select>
                {/if}
            </div>

            <div class="tool-group">
                <span class="group-label">Pixels:</span>
                <button
                    class:active={showPixelGrid}
                    onclick={() => (showPixelGrid = !showPixelGrid)}
                    title="Show pixel boundaries when zoomed in (400%+)"
                >
                    {showPixelGrid ? "On" : "Off"}
                </button>
                {#if zoom < PIXEL_GRID_MIN_ZOOM && showPixelGrid}
                    <span class="hint">({PIXEL_GRID_MIN_ZOOM * 100}%+)</span>
                {/if}
            </div>

            <div class="toolbar-divider"></div>

            <div class="tool-group">
                <span class="group-label">Canvas:</span>
                <select
                    onchange={(e) => {
                        const val = (e.target as HTMLSelectElement).value;
                        if (val !== "custom") {
                            const [w, h] = val.split("x").map(Number);
                            applyCanvasSize(w, h);
                        }
                    }}
                >
                    {#each PRESETS as preset}
                        <option
                            value="{preset.width}x{preset.height}"
                            selected={canvasWidth === preset.width &&
                                canvasHeight === preset.height}
                        >
                            {preset.name}
                        </option>
                    {/each}
                    <option value="custom">Custom...</option>
                </select>
                <input
                    type="number"
                    min="1"
                    max="2048"
                    bind:value={customWidth}
                    class="number-input small"
                    title="Width"
                />
                <span class="unit">x</span>
                <input
                    type="number"
                    min="1"
                    max="2048"
                    bind:value={customHeight}
                    class="number-input small"
                    title="Height"
                />
                <button onclick={applyCustomSize} class="small-btn"
                    >Apply</button
                >
            </div>
        </div>
    </header>

    <!-- Main Content Area -->
    <div class="main-content">
        <!-- Layers Panel (left sidebar) -->
        <aside class="layers-sidebar">
            <div class="layers-header">
                <span>Layers</span>
                <button
                    onclick={addLayer}
                    class="add-layer-btn"
                    title="Add new layer">+</button
                >
            </div>
            <div class="layers-list">
                {#each [...layers].reverse() as layer, reversedIndex}
                    {@const index = layers.length - 1 - reversedIndex}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div
                        class="layer-item"
                        class:active={index === activeLayerIndex}
                        class:dragging={index === draggedLayerIndex}
                        class:drag-over={index === dragOverLayerIndex}
                        draggable="true"
                        ondragstart={() => handleLayerDragStart(index)}
                        ondragover={(e) => handleLayerDragOver(e, index)}
                        ondragleave={handleLayerDragLeave}
                        ondrop={() => handleLayerDrop(index)}
                        ondragend={handleLayerDragEnd}
                        onclick={() => setActiveLayer(index)}
                        onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ")
                                setActiveLayer(index);
                        }}
                        role="button"
                        tabindex="0"
                    >
                        <button
                            class="layer-visibility"
                            class:hidden={!layer.visible}
                            onclick={(e) => {
                                e.stopPropagation();
                                toggleLayerVisibility(index);
                            }}
                            title={layer.visible ? "Hide layer" : "Show layer"}
                        >
                            {layer.visible ? "👁" : "○"}
                        </button>
                        {#if editingLayerId === layer.id}
                            <!-- svelte-ignore a11y_autofocus -->
                            <input
                                type="text"
                                class="layer-name-input"
                                value={layer.name}
                                onblur={(e) =>
                                    renameLayer(
                                        index,
                                        (e.target as HTMLInputElement).value,
                                    )}
                                onkeydown={(e) => {
                                    if (e.key === "Enter") {
                                        renameLayer(
                                            index,
                                            (e.target as HTMLInputElement)
                                                .value,
                                        );
                                    } else if (e.key === "Escape") {
                                        editingLayerId = null;
                                    }
                                }}
                                onclick={(e) => e.stopPropagation()}
                                autofocus
                            />
                        {:else}
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <span
                                class="layer-name"
                                ondblclick={(e) => {
                                    e.stopPropagation();
                                    editingLayerId = layer.id;
                                }}
                            >
                                {layer.name}
                            </span>
                        {/if}
                        {#if layers.length > 1}
                            <button
                                class="layer-delete"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    removeLayer(index);
                                }}
                                title="Delete layer"
                            >
                                ×
                            </button>
                        {/if}
                    </div>
                {/each}
            </div>
        </aside>

        <!-- Canvas Area (center) -->
        <main
            class="canvas-area"
            class:drag-over={isDraggingFile}
            bind:this={canvasWrapper}
            onwheel={handleWheel}
            ondragover={handleFileDragOver}
            ondragleave={handleFileDragLeave}
            ondrop={handleFileDrop}
        >
            <div
                class="canvas-container"
                style="width: {canvasWidth * zoom}px; height: {canvasHeight *
                    zoom}px;"
            >
                <canvas
                    bind:this={canvas}
                    width={canvasWidth}
                    height={canvasHeight}
                    class="main-canvas"
                ></canvas>
                {#if showPixelGrid && zoom >= PIXEL_GRID_MIN_ZOOM}
                    <div
                        class="pixel-grid-overlay"
                        style="
                            background-size: {zoom}px {zoom}px;
                            background-image: linear-gradient(to right, rgba(128,128,128,0.3) 1px, transparent 1px),
                                              linear-gradient(to bottom, rgba(128,128,128,0.3) 1px, transparent 1px);
                        "
                    ></div>
                {/if}
                <canvas
                    bind:this={gridCanvas}
                    width={canvasWidth}
                    height={canvasHeight}
                    class="grid-canvas"
                    class:pan-cursor={tool === "pan"}
                    class:fill-cursor={tool === "fill" || tool === "replace"}
                    class:shape-cursor={tool === "shape"}
                    class:select-cursor={tool === "select"}
                    onmousedown={handleMouseDown}
                    onmousemove={handleMouseMove}
                    onmouseup={handleMouseUp}
                    onmouseleave={handleMouseLeave}
                ></canvas>
            </div>
        </main>

        <!-- Right Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-section">
                <div class="sidebar-header">Preview (1x)</div>
                <div class="preview-wrapper">
                    <canvas
                        bind:this={previewCanvas}
                        width={canvasWidth}
                        height={canvasHeight}
                        class="preview-canvas"
                    ></canvas>
                </div>
                <div class="preview-info">
                    {canvasWidth} x {canvasHeight} px
                </div>
            </div>

            <div class="sidebar-section">
                <div class="sidebar-header">Info</div>
                <div class="info-content">
                    <div class="info-row">
                        <span class="info-label">Tool:</span>
                        <span class="info-value">{tool}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Brush:</span>
                        <span class="info-value">{brushSize}px</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Opacity:</span>
                        <span class="info-value">{paintOpacity}%</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Zoom:</span>
                        <span class="info-value">{Math.round(zoom * 100)}%</span
                        >
                    </div>
                    <div class="info-row">
                        <span class="info-label">Undo:</span>
                        <span class="info-value">{undoStack.length}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Redo:</span>
                        <span class="info-value">{redoStack.length}</span>
                    </div>
                </div>
            </div>

            <div class="sidebar-section">
                <div class="sidebar-header">Help</div>
                <div class="help-content">
                    {#if tool === "select"}
                        <p>
                            Drag to select an area. Click inside selection to
                            move it.
                        </p>
                        <p class="shortcuts">
                            <strong>Ctrl+C</strong> Copy<br />
                            <strong>Ctrl+X</strong> Cut<br />
                            <strong>Ctrl+V</strong> Paste<br />
                            <strong>Delete</strong> Delete<br />
                            <strong>Ctrl+A</strong> Select all<br />
                            <strong>Esc</strong> Deselect
                        </p>
                    {:else if tool === "pixel"}
                        <p>Click and drag to paint pixels.</p>
                    {:else if tool === "line"}
                        <p>
                            Click and drag to draw isometric lines. Lines snap
                            to 0°, 26.57°, 30°, 45°, 60°, 63.43°, 90° and
                            reflections.
                        </p>
                    {:else if tool === "fill"}
                        <p>Click to flood fill a closed area.</p>
                    {:else if tool === "replace"}
                        <p>Click to replace all pixels of that color.</p>
                    {:else if tool === "shape"}
                        <p>Click to place an isometric shape.</p>
                    {:else if tool === "pan"}
                        <p>Click and drag to pan. Ctrl+Scroll to zoom.</p>
                    {/if}
                </div>
            </div>
        </aside>
    </div>

    <!-- Status Bar -->
    <footer class="status-bar">
        <span>Canvas: {canvasWidth} x {canvasHeight}px</span>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>History: {undoStack.length} / {redoStack.length}</span>
    </footer>
</div>

<!-- Save Modal -->
{#if showSaveModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="modal-overlay"
        onclick={closeSaveModal}
        onkeydown={(e) => e.key === "Escape" && closeSaveModal()}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
            class="modal"
            onclick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-modal-title"
            tabindex="-1"
        >
            <div class="modal-header">
                <h2 id="save-modal-title">
                    {saveAsMode ? "Save As" : "Save Image"}
                </h2>
                <button class="modal-close" onclick={closeSaveModal}
                    >&times;</button
                >
            </div>
            <div class="modal-body">
                <label for="save-name-input">Image Name:</label>
                <!-- svelte-ignore a11y_autofocus -->
                <input
                    id="save-name-input"
                    type="text"
                    bind:value={saveNameInput}
                    placeholder="Enter a name for your image"
                    onkeydown={(e) => {
                        if (e.key === "Enter" && saveNameInput.trim()) {
                            saveCurrentImage();
                        }
                    }}
                    autofocus
                />
            </div>
            <div class="modal-footer">
                <button class="modal-btn secondary" onclick={closeSaveModal}
                    >Cancel</button
                >
                <button
                    class="modal-btn primary"
                    onclick={saveCurrentImage}
                    disabled={!saveNameInput.trim()}
                >
                    Save
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Load Modal -->
{#if showLoadModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="modal-overlay"
        onclick={closeLoadModal}
        onkeydown={(e) => e.key === "Escape" && closeLoadModal()}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
            class="modal modal-large"
            onclick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="load-modal-title"
            tabindex="-1"
        >
            <div class="modal-header">
                <h2 id="load-modal-title">Load Image</h2>
                <button class="modal-close" onclick={closeLoadModal}
                    >&times;</button
                >
            </div>
            <div class="modal-body">
                {#if savedImages.length === 0}
                    <div class="empty-state">
                        <p>No saved images yet.</p>
                        <p class="hint">
                            Save your first image using the Save button or
                            Ctrl+S.
                        </p>
                    </div>
                {:else}
                    <div class="saved-images-grid">
                        {#each savedImages.sort((a, b) => b.updatedAt - a.updatedAt) as image}
                            <div
                                class="saved-image-card"
                                class:current={image.id === currentImageId}
                            >
                                <div class="saved-image-preview">
                                    <img
                                        src={image.thumbnail}
                                        alt={image.name}
                                    />
                                </div>
                                <div class="saved-image-info">
                                    <div
                                        class="saved-image-name"
                                        title={image.name}
                                    >
                                        {image.name}
                                    </div>
                                    <div class="saved-image-meta">
                                        {image.width}x{image.height} &middot; {image
                                            .layers.length} layer{image.layers
                                            .length !== 1
                                            ? "s"
                                            : ""}
                                    </div>
                                    <div class="saved-image-date">
                                        {formatDate(image.updatedAt)}
                                    </div>
                                </div>
                                <div class="saved-image-actions">
                                    {#if deleteConfirmId === image.id}
                                        <div class="delete-confirm">
                                            <span>Delete?</span>
                                            <button
                                                class="btn-confirm-delete"
                                                onclick={() =>
                                                    deleteImage(image.id)}
                                                >Yes</button
                                            >
                                            <button
                                                class="btn-cancel-delete"
                                                onclick={cancelDeleteImage}
                                                >No</button
                                            >
                                        </div>
                                    {:else}
                                        <button
                                            class="btn-load"
                                            onclick={() => loadImage(image)}
                                            >Load</button
                                        >
                                        <button
                                            class="btn-delete"
                                            onclick={() =>
                                                confirmDeleteImage(image.id)}
                                            title="Delete"
                                        >
                                            &times;
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
            <div class="modal-footer">
                <button class="modal-btn secondary" onclick={closeLoadModal}
                    >Cancel</button
                >
            </div>
        </div>
    </div>
{/if}

<style>
    .editor-layout {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        background: #1a1a1a;
    }

    /* Current File Indicator */
    .current-file-indicator {
        padding: 4px 12px;
        background: #333;
        color: #aaa;
        font-size: 0.75rem;
        border-bottom: 1px solid #3a3a3a;
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: #2a2a2a;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        min-width: 350px;
        max-width: 90vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
    }

    .modal-large {
        min-width: 500px;
        width: 700px;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #3a3a3a;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: #eee;
    }

    .modal-close {
        background: none;
        border: none;
        color: #888;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }

    .modal-close:hover {
        color: #fff;
    }

    .modal-body {
        padding: 20px;
        flex: 1;
        overflow-y: auto;
    }

    .modal-body label {
        display: block;
        margin-bottom: 8px;
        font-size: 0.85rem;
        color: #aaa;
    }

    .modal-body input[type="text"] {
        width: 100%;
        padding: 10px 12px;
        font-size: 0.95rem;
        border: 1px solid #4a4a4a;
        border-radius: 4px;
        background: #1a1a1a;
        color: #eee;
        outline: none;
    }

    .modal-body input[type="text"]:focus {
        border-color: #646cff;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 16px 20px;
        border-top: 1px solid #3a3a3a;
    }

    .modal-btn {
        padding: 8px 16px;
        font-size: 0.85rem;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
    }

    .modal-btn.secondary {
        background: #3a3a3a;
        border: 1px solid #4a4a4a;
        color: #ccc;
    }

    .modal-btn.secondary:hover {
        background: #4a4a4a;
    }

    .modal-btn.primary {
        background: #646cff;
        border: 1px solid #747bff;
        color: #fff;
    }

    .modal-btn.primary:hover {
        background: #747bff;
    }

    .modal-btn.primary:disabled {
        background: #4a4a4a;
        border-color: #4a4a4a;
        color: #888;
        cursor: not-allowed;
    }

    /* Load Modal - Saved Images Grid */
    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #888;
    }

    .empty-state p {
        margin: 0 0 8px 0;
    }

    .empty-state .hint {
        font-size: 0.8rem;
        color: #666;
    }

    .saved-images-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 400px;
        overflow-y: auto;
    }

    .saved-image-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px;
        background: #333;
        border-radius: 6px;
        border: 1px solid #3a3a3a;
        transition: all 0.15s;
    }

    .saved-image-card:hover {
        background: #3a3a3a;
        border-color: #4a4a4a;
    }

    .saved-image-card.current {
        border-color: #646cff;
        background: #35356a;
    }

    .saved-image-preview {
        width: 64px;
        height: 64px;
        flex-shrink: 0;
        background: repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)
            50% / 8px 8px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .saved-image-preview img {
        max-width: 100%;
        max-height: 100%;
        image-rendering: pixelated;
    }

    .saved-image-info {
        flex: 1;
        min-width: 0;
    }

    .saved-image-name {
        font-size: 0.9rem;
        font-weight: 500;
        color: #eee;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .saved-image-meta {
        font-size: 0.75rem;
        color: #888;
        margin-top: 2px;
    }

    .saved-image-date {
        font-size: 0.7rem;
        color: #666;
        margin-top: 2px;
    }

    .saved-image-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .btn-load {
        padding: 6px 12px;
        font-size: 0.8rem;
        background: #646cff;
        border: none;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        transition: all 0.15s;
    }

    .btn-load:hover {
        background: #747bff;
    }

    .btn-delete {
        width: 28px;
        height: 28px;
        padding: 0;
        font-size: 1.2rem;
        line-height: 1;
        background: none;
        border: 1px solid transparent;
        border-radius: 4px;
        color: #888;
        cursor: pointer;
        transition: all 0.15s;
    }

    .btn-delete:hover {
        background: #ff4444;
        color: #fff;
        border-color: #ff4444;
    }

    .delete-confirm {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
        color: #ff6b6b;
    }

    .btn-confirm-delete,
    .btn-cancel-delete {
        padding: 4px 8px;
        font-size: 0.75rem;
        border-radius: 3px;
        cursor: pointer;
    }

    .btn-confirm-delete {
        background: #ff4444;
        border: none;
        color: #fff;
    }

    .btn-confirm-delete:hover {
        background: #ff6666;
    }

    .btn-cancel-delete {
        background: #3a3a3a;
        border: 1px solid #4a4a4a;
        color: #ccc;
    }

    .btn-cancel-delete:hover {
        background: #4a4a4a;
    }

    /* Layers Sidebar */
    .layers-sidebar {
        width: 180px;
        flex-shrink: 0;
        background: #252525;
        border-right: 1px solid #3a3a3a;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .layers-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        border-bottom: 1px solid #3a3a3a;
        font-size: 0.75rem;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .add-layer-btn {
        width: 22px;
        height: 22px;
        padding: 0;
        font-size: 1rem;
        line-height: 1;
        background: #3a3a3a;
        border: 1px solid #4a4a4a;
        color: #ccc;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
    }

    .add-layer-btn:hover {
        background: #4a4a4a;
        border-color: #5a5a5a;
    }

    .layers-list {
        flex: 1;
        overflow-y: auto;
        padding: 4px 0;
    }

    .layer-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        margin: 2px 4px;
        border-radius: 4px;
        cursor: pointer;
        background: transparent;
        border: 1px solid transparent;
        transition: all 0.15s;
    }

    .layer-item:hover {
        background: #333;
    }

    .layer-item.active {
        background: #3a3a3a;
        border-color: #646cff;
    }

    .layer-item.dragging {
        opacity: 0.5;
    }

    .layer-item.drag-over {
        border-top: 2px solid #646cff;
    }

    .layer-visibility {
        width: 20px;
        height: 20px;
        padding: 0;
        font-size: 0.75rem;
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .layer-visibility:hover {
        color: #ccc;
    }

    .layer-visibility.hidden {
        color: #555;
    }

    .layer-name {
        flex: 1;
        font-size: 0.8rem;
        color: #ccc;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .layer-name-input {
        flex: 1;
        font-size: 0.8rem;
        color: #ccc;
        background: #2a2a2a;
        border: 1px solid #4a4a4a;
        border-radius: 3px;
        padding: 2px 4px;
        outline: none;
    }

    .layer-name-input:focus {
        border-color: #646cff;
    }

    .layer-delete {
        width: 18px;
        height: 18px;
        padding: 0;
        font-size: 1rem;
        line-height: 1;
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        opacity: 0;
        transition: all 0.15s;
        flex-shrink: 0;
    }

    .layer-item:hover .layer-delete {
        opacity: 1;
    }

    .layer-delete:hover {
        color: #ff6b6b;
    }

    /* Toolbar Area */
    .toolbar-area {
        flex-shrink: 0;
        background: #2a2a2a;
        border-bottom: 1px solid #3a3a3a;
    }

    .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        padding: 0.5rem 1rem;
        align-items: center;
    }

    .toolbar.secondary {
        border-top: 1px solid #3a3a3a;
        background: #252525;
    }

    .toolbar-divider {
        width: 1px;
        height: 24px;
        background: #444;
    }

    .tool-group {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .tool-group label,
    .group-label {
        font-size: 0.8rem;
        color: #888;
        white-space: nowrap;
    }

    .tool-group button {
        padding: 0.35em 0.7em;
        font-size: 0.8rem;
        background: #3a3a3a;
        border: 1px solid #4a4a4a;
        color: #ccc;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
    }

    .tool-group button:hover {
        background: #4a4a4a;
        border-color: #5a5a5a;
    }

    .tool-group button.active {
        background: #646cff;
        border-color: #747bff;
        color: white;
    }

    /* File Menu Dropdown */
    .file-menu-container {
        position: relative;
    }

    .file-menu-button {
        min-width: 50px;
    }

    .file-menu-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99;
    }

    .file-menu-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        background: #2a2a2a;
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        min-width: 180px;
        z-index: 100;
        overflow: hidden;
    }

    .file-menu-dropdown button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 8px 12px;
        font-size: 0.85rem;
        background: transparent;
        border: none;
        border-radius: 0;
        color: #ccc;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s;
    }

    .file-menu-dropdown button:hover {
        background: #3a3a3a;
    }

    .file-menu-dropdown button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .file-menu-dropdown button:disabled:hover {
        background: transparent;
    }

    .menu-item-label {
        flex: 1;
    }

    .menu-item-shortcut {
        font-size: 0.75rem;
        color: #888;
        margin-left: 16px;
    }

    .menu-divider {
        height: 1px;
        background: #4a4a4a;
        margin: 4px 0;
    }

    .tool-group button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .small-btn {
        padding: 0.25em 0.5em !important;
        font-size: 0.75rem !important;
    }

    #color-picker {
        width: 32px;
        height: 24px;
        border: 1px solid #4a4a4a;
        border-radius: 4px;
        cursor: pointer;
        padding: 0;
        background: none;
    }

    .color-hex {
        font-family: monospace;
        font-size: 0.75rem;
        color: #888;
    }

    .opacity-slider {
        width: 80px;
        height: 6px;
        cursor: pointer;
        accent-color: #646cff;
    }

    .opacity-value {
        font-family: monospace;
        font-size: 0.75rem;
        color: #888;
        min-width: 36px;
        text-align: right;
    }

    .hint {
        font-size: 0.7rem;
        color: #666;
        font-style: italic;
    }

    .zoom-value {
        font-family: monospace;
        font-size: 0.8rem;
        min-width: 50px;
        text-align: center;
        color: #ccc;
    }

    .number-input {
        width: 48px;
        padding: 0.25em 0.4em;
        border-radius: 4px;
        border: 1px solid #4a4a4a;
        background: #2a2a2a;
        color: #ccc;
        font-size: 0.8rem;
        text-align: center;
    }

    .number-input.small {
        width: 40px;
    }

    .unit {
        font-size: 0.75rem;
        color: #666;
    }

    .tool-group select {
        padding: 0.3em 0.5em;
        border-radius: 4px;
        border: 1px solid #4a4a4a;
        background: #2a2a2a;
        color: #ccc;
        font-size: 0.8rem;
    }

    /* Main Content Area */
    .main-content {
        flex: 1;
        display: flex;
        overflow: hidden;
    }

    /* Canvas Area */
    .canvas-area {
        flex: 1;
        overflow: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        background: repeating-conic-gradient(#2a2a2a 0% 25%, #222 0% 50%) 50% /
            16px 16px;
        padding: 40px;
        position: relative;
        transition: background-color 0.2s;
    }

    .canvas-area.drag-over {
        background-color: rgba(100, 108, 255, 0.15);
    }

    .canvas-area.drag-over::after {
        content: "Drop image to add as new layer";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px 40px;
        background: rgba(100, 108, 255, 0.9);
        color: white;
        font-size: 1.1rem;
        font-weight: 500;
        border-radius: 8px;
        pointer-events: none;
        z-index: 100;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .canvas-container {
        position: relative;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }

    .main-canvas,
    .grid-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
    }

    .main-canvas {
        z-index: 1;
    }

    .pixel-grid-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2;
        pointer-events: none;
    }

    .grid-canvas {
        z-index: 3;
        cursor: crosshair;
    }

    .grid-canvas.pan-cursor {
        cursor: grab;
    }

    .grid-canvas.pan-cursor:active {
        cursor: grabbing;
    }

    .grid-canvas.fill-cursor {
        cursor: cell;
    }

    .grid-canvas.shape-cursor {
        cursor: copy;
    }

    .grid-canvas.select-cursor {
        cursor: crosshair;
    }

    /* Sidebar */
    .sidebar {
        width: 200px;
        flex-shrink: 0;
        background: #252525;
        border-left: 1px solid #3a3a3a;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    }

    .sidebar-section {
        border-bottom: 1px solid #3a3a3a;
        padding: 12px;
    }

    .sidebar-header {
        font-size: 0.75rem;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 10px;
    }

    .preview-wrapper {
        background: repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)
            50% / 8px 8px;
        border-radius: 4px;
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .preview-canvas {
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        max-width: 100%;
        max-height: 150px;
        border: 1px solid #4a4a4a;
    }

    .preview-info {
        font-size: 0.7rem;
        color: #666;
        text-align: center;
        margin-top: 6px;
        font-family: monospace;
    }

    .info-content {
        font-size: 0.8rem;
    }

    .info-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        border-bottom: 1px solid #333;
    }

    .info-row:last-child {
        border-bottom: none;
    }

    .info-label {
        color: #666;
    }

    .info-value {
        color: #aaa;
        font-family: monospace;
    }

    .help-content {
        font-size: 0.75rem;
        color: #888;
        line-height: 1.4;
    }

    .help-content p {
        margin: 0 0 8px 0;
    }

    .help-content p:last-child {
        margin-bottom: 0;
    }

    .help-content .shortcuts {
        font-size: 0.7rem;
        line-height: 1.6;
    }

    .help-content .shortcuts strong {
        color: #aaa;
        font-weight: 500;
    }

    /* Status Bar */
    .status-bar {
        flex-shrink: 0;
        display: flex;
        gap: 2rem;
        padding: 0.4rem 1rem;
        background: #2a2a2a;
        border-top: 1px solid #3a3a3a;
        font-size: 0.75rem;
        color: #666;
    }

    /* Light mode */
    @media (prefers-color-scheme: light) {
        .editor-layout {
            background: #e5e5e5;
        }

        .current-file-indicator {
            background: #ddd;
            color: #666;
            border-bottom-color: #ccc;
        }

        .modal-overlay {
            background: rgba(0, 0, 0, 0.5);
        }

        .modal {
            background: #fff;
        }

        .modal-header {
            border-bottom-color: #ddd;
        }

        .modal-header h2 {
            color: #333;
        }

        .modal-close {
            color: #666;
        }

        .modal-close:hover {
            color: #333;
        }

        .modal-body label {
            color: #666;
        }

        .modal-body input[type="text"] {
            background: #fff;
            border-color: #ccc;
            color: #333;
        }

        .modal-footer {
            border-top-color: #ddd;
        }

        .modal-btn.secondary {
            background: #e0e0e0;
            border-color: #ccc;
            color: #333;
        }

        .modal-btn.secondary:hover {
            background: #d0d0d0;
        }

        .empty-state {
            color: #666;
        }

        .empty-state .hint {
            color: #888;
        }

        .saved-image-card {
            background: #f5f5f5;
            border-color: #ddd;
        }

        .saved-image-card:hover {
            background: #eee;
            border-color: #ccc;
        }

        .saved-image-card.current {
            background: #e8e8ff;
            border-color: #646cff;
        }

        .saved-image-preview {
            background: repeating-conic-gradient(#ddd 0% 25%, #eee 0% 50%) 50% /
                8px 8px;
        }

        .saved-image-name {
            color: #333;
        }

        .saved-image-meta {
            color: #666;
        }

        .saved-image-date {
            color: #888;
        }

        .btn-delete {
            color: #999;
        }

        .btn-cancel-delete {
            background: #e0e0e0;
            border-color: #ccc;
            color: #333;
        }

        .layers-sidebar {
            background: #f0f0f0;
            border-right-color: #ddd;
        }

        .layers-header {
            border-bottom-color: #ddd;
            color: #666;
        }

        .add-layer-btn {
            background: #e0e0e0;
            border-color: #ccc;
            color: #333;
        }

        .add-layer-btn:hover {
            background: #d0d0d0;
            border-color: #bbb;
        }

        .layer-item:hover {
            background: #e0e0e0;
        }

        .layer-item.active {
            background: #d8d8ff;
            border-color: #646cff;
        }

        .layer-visibility {
            color: #666;
        }

        .layer-visibility:hover {
            color: #333;
        }

        .layer-visibility.hidden {
            color: #aaa;
        }

        .layer-name {
            color: #333;
        }

        .layer-name-input {
            background: #fff;
            border-color: #ccc;
            color: #333;
        }

        .layer-delete {
            color: #999;
        }

        .layer-delete:hover {
            color: #ff4444;
        }

        .toolbar-area {
            background: #f5f5f5;
            border-bottom-color: #ddd;
        }

        .toolbar.secondary {
            background: #eee;
            border-top-color: #ddd;
        }

        .toolbar-divider {
            background: #ccc;
        }

        .tool-group label,
        .group-label {
            color: #666;
        }

        .tool-group button {
            background: #e0e0e0;
            border-color: #ccc;
            color: #333;
        }

        .tool-group button:hover {
            background: #d0d0d0;
            border-color: #bbb;
        }

        .file-menu-dropdown {
            background: #fff;
            border-color: #ccc;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .file-menu-dropdown button {
            color: #333;
        }

        .file-menu-dropdown button:hover {
            background: #f0f0f0;
        }

        .menu-item-shortcut {
            color: #999;
        }

        .menu-divider {
            background: #ddd;
        }

        #color-picker {
            border-color: #ccc;
        }

        .color-hex,
        .zoom-value,
        .opacity-value {
            color: #666;
        }

        .opacity-slider {
            accent-color: #646cff;
        }

        .number-input,
        .tool-group select {
            background: #fff;
            border-color: #ccc;
            color: #333;
        }

        .canvas-area {
            background: repeating-conic-gradient(#ddd 0% 25%, #eee 0% 50%) 50% /
                16px 16px;
        }

        .canvas-area.drag-over {
            background-color: rgba(100, 108, 255, 0.1);
        }

        .sidebar {
            background: #f0f0f0;
            border-left-color: #ddd;
        }

        .sidebar-section {
            border-bottom-color: #ddd;
        }

        .sidebar-header {
            color: #666;
        }

        .preview-wrapper {
            background: repeating-conic-gradient(#ddd 0% 25%, #eee 0% 50%) 50% /
                8px 8px;
        }

        .preview-canvas {
            border-color: #ccc;
        }

        .info-row {
            border-bottom-color: #ddd;
        }

        .info-label {
            color: #888;
        }

        .info-value {
            color: #555;
        }

        .help-content {
            color: #666;
        }

        .status-bar {
            background: #f5f5f5;
            border-top-color: #ddd;
            color: #888;
        }
    }
</style>
