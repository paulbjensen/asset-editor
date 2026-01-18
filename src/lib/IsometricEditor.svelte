<script lang="ts">
    import { onMount } from "svelte";

    // Canvas dimensions (now reactive)
    let canvasWidth: number = $state(512);
    let canvasHeight: number = $state(512);

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

    // Isometric shapes for drag and drop
    const ISOMETRIC_SHAPES = [
        { name: "Diamond", id: "diamond" },
        { name: "Ellipse", id: "ellipse" },
        { name: "Cube Top", id: "cube-top" },
        { name: "Cube Left", id: "cube-left" },
        { name: "Cube Right", id: "cube-right" },
    ];

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
    let isDrawing: boolean = $state(false);
    let zoom: number = $state(1);
    let tool:
        | "pixel"
        | "line"
        | "pan"
        | "fill"
        | "replace"
        | "shape"
        | "select" = $state("pixel");
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

    // Shape tool state
    let selectedShape: string = $state("diamond");
    let shapeSize: number = $state(32);
    let shapePreviewX: number = $state(0);
    let shapePreviewY: number = $state(0);

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

    // Undo/Redo state
    let undoStack: ImageData[] = $state([]);
    let redoStack: ImageData[] = $state([]);
    const MAX_UNDO_STEPS = 50;

    // Pixel grid state - shows pixel boundaries when zoomed in
    let showPixelGrid: boolean = $state(true);
    const PIXEL_GRID_MIN_ZOOM = 4; // Only show pixel grid when zoom >= 400%

    // Isometric angles
    const ISOMETRIC_ANGLES = [
        0, 26.565, 30, 45, 60, 63.435, 90, 116.565, 120, 135, 150, 153.435, 180,
        206.565, 210, 225, 240, 243.435, 270, 296.565, 300, 315, 330, 333.435,
        360,
    ];

    function saveState() {
        if (!ctx) return;
        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        undoStack = [...undoStack.slice(-(MAX_UNDO_STEPS - 1)), imageData];
        redoStack = [];
    }

    function undo() {
        if (!ctx || undoStack.length === 0) return;
        const currentState = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        redoStack = [...redoStack, currentState];
        const previousState = undoStack[undoStack.length - 1];
        undoStack = undoStack.slice(0, -1);
        ctx.putImageData(previousState, 0, 0);
        updatePreview();
    }

    function redo() {
        if (!ctx || redoStack.length === 0) return;
        const currentState = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        undoStack = [...undoStack, currentState];
        const nextState = redoStack[redoStack.length - 1];
        redoStack = redoStack.slice(0, -1);
        ctx.putImageData(nextState, 0, 0);
        updatePreview();
    }

    function handleKeyDown(e: KeyboardEvent) {
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
        // Selection shortcuts
        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            e.preventDefault();
            copySelection();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "x") {
            e.preventDefault();
            cutSelection();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "v") {
            e.preventDefault();
            pasteSelection();
        }
        if (e.key === "Delete" || e.key === "Backspace") {
            if (hasSelection || floatingSelection) {
                e.preventDefault();
                deleteSelection();
            }
        }
        if (e.key === "Escape") {
            if (hasSelection || floatingSelection) {
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
        if (!ctx) return;
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
        clipboard = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
    }

    function cutSelection() {
        if (!ctx) return;
        if (floatingSelection) {
            clipboard = new ImageData(
                new Uint8ClampedArray(floatingSelection.imageData.data),
                floatingSelection.imageData.width,
                floatingSelection.imageData.height,
            );
            floatingSelection = null;
            clearSelection();
            drawSelectionOverlay();
            updatePreview();
            return;
        }
        if (!hasSelection) return;
        saveState();
        const rect = getSelectionRect();
        clipboard = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
        ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
        clearSelection();
        updatePreview();
    }

    function pasteSelection() {
        if (!ctx || !clipboard) return;
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
        if (!ctx) return;
        if (floatingSelection) {
            floatingSelection = null;
            clearSelection();
            drawSelectionOverlay();
            return;
        }
        if (!hasSelection) return;
        saveState();
        const rect = getSelectionRect();
        ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
        clearSelection();
        updatePreview();
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
        if (!ctx || !floatingSelection) return;
        saveState();
        ctx.putImageData(
            floatingSelection.imageData,
            floatingSelection.x,
            floatingSelection.y,
        );
        floatingSelection = null;
        updatePreview();
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

    function hexToRgba(hex: string): {
        r: number;
        g: number;
        b: number;
        a: number;
    } {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
                  a: 255,
              }
            : { r: 0, g: 0, b: 0, a: 255 };
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
        if (!ctx) return;
        if (
            startX < 0 ||
            startX >= canvasWidth ||
            startY < 0 ||
            startY >= canvasHeight
        )
            return;

        saveState();

        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const targetColor = getPixelColor(imageData, startX, startY);
        const fillColor = hexToRgba(paintColor);

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

        ctx.putImageData(imageData, 0, 0);
        updatePreview();
    }

    function replaceColor(startX: number, startY: number) {
        if (!ctx) return;
        if (
            startX < 0 ||
            startX >= canvasWidth ||
            startY < 0 ||
            startY >= canvasHeight
        )
            return;

        saveState();

        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const targetColor = getPixelColor(imageData, startX, startY);
        const fillColor = hexToRgba(paintColor);

        if (colorsMatch(targetColor, fillColor)) return;

        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const currentColor = getPixelColor(imageData, x, y);
                if (colorsMatch(currentColor, targetColor)) {
                    setPixelColor(imageData, x, y, fillColor);
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        updatePreview();
    }

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

    function drawShape(
        targetCtx: CanvasRenderingContext2D,
        shapeId: string,
        cx: number,
        cy: number,
        size: number,
        color: string,
        filled: boolean = true,
    ) {
        switch (shapeId) {
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
        );
        gridCtx.globalAlpha = 1;
    }

    function paintPixel(x: number, y: number) {
        if (!ctx) return;
        ctx.fillStyle = paintColor;

        const offset = Math.floor(brushSize / 2);

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
                    ctx.fillRect(px, py, 1, 1);
                }
            }
        }
        updatePreview();
    }

    function drawLinePixels(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        targetCtx: CanvasRenderingContext2D,
        color: string,
    ) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;

        let x = x1;
        let y = y1;

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
    }

    function drawLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        targetCtx: CanvasRenderingContext2D,
        color: string,
        updatePreviewAfter: boolean = false,
    ) {
        drawLinePixels(x1, y1, x2, y2, targetCtx, color);
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
                if (ctx) {
                    const selectionData = ctx.getImageData(
                        rect.x,
                        rect.y,
                        rect.width,
                        rect.height,
                    );
                    saveState();
                    ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
                    floatingSelection = {
                        imageData: selectionData,
                        x: rect.x,
                        y: rect.y,
                    };
                    hasSelection = false;
                    isMovingSelection = true;
                    moveStartX = x - floatingSelection.x;
                    moveStartY = y - floatingSelection.y;
                    updatePreview();
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
            if (ctx) {
                drawShape(
                    ctx,
                    selectedShape,
                    x,
                    y,
                    shapeSize,
                    paintColor,
                    true,
                );
                updatePreview();
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
        } else if (tool === "pixel") {
            isDrawing = false;
        } else if (tool === "line" && isDrawingLine) {
            isDrawingLine = false;
            if (ctx) {
                drawLine(
                    lineStartX,
                    lineStartY,
                    linePreviewEndX,
                    linePreviewEndY,
                    ctx,
                    paintColor,
                    true,
                );
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
        if (!ctx) return;
        saveState();
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        updatePreview();
    }

    function updatePreview() {
        if (!previewCtx || !canvas) return;
        previewCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        previewCtx.drawImage(canvas, 0, 0);
    }

    function exportPNG() {
        if (!canvas) return;

        const link = document.createElement("a");
        link.download = "isometric-asset.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
    }

    function applyCanvasSize(width: number, height: number) {
        const imageData = ctx?.getImageData(0, 0, canvasWidth, canvasHeight);

        canvasWidth = width;
        canvasHeight = height;
        customWidth = String(width);
        customHeight = String(height);

        undoStack = [];
        redoStack = [];

        requestAnimationFrame(() => {
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                if (imageData) {
                    ctx.putImageData(imageData, 0, 0);
                }
            }
            if (gridCtx) {
                gridCtx.imageSmoothingEnabled = false;
                clearGridCanvas();
                if (showGrid) drawGrid();
            }
            if (previewCtx) {
                previewCtx.imageSmoothingEnabled = false;
            }
            updatePreview();
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
            <div class="tool-group">
                <span class="group-label">Tool:</span>
                <button
                    class:active={tool === "select"}
                    onclick={() => (tool = "select")}
                    title="Select (M)"
                >
                    Select
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

            <div class="toolbar-divider"></div>

            <div class="tool-group">
                <button
                    onclick={undo}
                    disabled={undoStack.length === 0}
                    title="Undo (Ctrl+Z)">Undo</button
                >
                <button
                    onclick={redo}
                    disabled={redoStack.length === 0}
                    title="Redo (Ctrl+Y)">Redo</button
                >
            </div>

            <div class="toolbar-divider"></div>

            <div class="tool-group">
                <button onclick={clearCanvas}>Clear</button>
                <button onclick={exportPNG} class="export-btn"
                    >Export PNG</button
                >
            </div>
        </div>

        <div class="toolbar secondary">
            {#if tool === "shape"}
                <div class="tool-group">
                    <span class="group-label">Shape:</span>
                    <select bind:value={selectedShape}>
                        {#each ISOMETRIC_SHAPES as shape}
                            <option value={shape.id}>{shape.name}</option>
                        {/each}
                    </select>
                    <label for="shape-size">Size:</label>
                    <input
                        id="shape-size"
                        type="number"
                        min="4"
                        max="256"
                        bind:value={shapeSize}
                        class="number-input"
                    />
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
        <!-- Canvas Area (center) -->
        <main
            class="canvas-area"
            bind:this={canvasWrapper}
            onwheel={handleWheel}
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

<style>
    .editor-layout {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        background: #1a1a1a;
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

    .export-btn {
        background: #2e7d32 !important;
        border-color: #388e3c !important;
    }

    .export-btn:hover {
        background: #388e3c !important;
        border-color: #4caf50 !important;
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

        #color-picker {
            border-color: #ccc;
        }

        .color-hex,
        .zoom-value {
            color: #666;
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
