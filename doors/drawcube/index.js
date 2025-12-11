"use strict";
/**
 * Drawille Cube Demo - Rotating 3D cube using braille graphics
 *
 * This door demonstrates the node-drawille module for creating smooth
 * braille-based graphics in the terminal. A rotating 3D cube is rendered
 * using Unicode braille characters within a neo-blessed UI.
 *
 * Features:
 * - Real-time 3D cube rotation
 * - Braille character graphics (2x4 pixels per character)
 * - Neo-blessed UI integration
 * - Smooth animation
 * - Interactive controls
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoor = runDoor;
var _a = require('@amiexpress/bbs-door-sdk'), Door = _a.Door, UIEngine = _a.UIEngine;
var runDoorWithSession = require('@amiexpress/bbs-door-sdk/tools/runDoorSession').runDoorWithSession;
// @ts-ignore - drawille doesn't have type definitions
var drawille = require('drawille');
var door = new Door({
    name: 'Drawille Cube Demo',
    version: '1.0.0',
    author: 'AmiExpress SDK',
    description: 'Rotating 3D cube using node-drawille braille graphics',
});
// Cube vertices (unit cube centered at origin)
var CUBE_VERTICES = [
    { x: -1, y: -1, z: -1 }, // 0: front bottom left
    { x: 1, y: -1, z: -1 }, // 1: front bottom right
    { x: 1, y: 1, z: -1 }, // 2: front top right
    { x: -1, y: 1, z: -1 }, // 3: front top left
    { x: -1, y: -1, z: 1 }, // 4: back bottom left
    { x: 1, y: -1, z: 1 }, // 5: back bottom right
    { x: 1, y: 1, z: 1 }, // 6: back top right
    { x: -1, y: 1, z: 1 }, // 7: back top left
];
// Cube edges (pairs of vertex indices)
var CUBE_EDGES = [
    // Front face
    [0, 1], [1, 2], [2, 3], [3, 0],
    // Back face
    [4, 5], [5, 6], [6, 7], [7, 4],
    // Connecting edges
    [0, 4], [1, 5], [2, 6], [3, 7],
];
/**
 * Rotate a point around X axis
 */
function rotateX(p, angle) {
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    return {
        x: p.x,
        y: p.y * cos - p.z * sin,
        z: p.y * sin + p.z * cos,
    };
}
/**
 * Rotate a point around Y axis
 */
function rotateY(p, angle) {
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    return {
        x: p.x * cos + p.z * sin,
        y: p.y,
        z: -p.x * sin + p.z * cos,
    };
}
/**
 * Rotate a point around Z axis
 */
function rotateZ(p, angle) {
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    return {
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos,
        z: p.z,
    };
}
/**
 * Project 3D point to 2D screen coordinates
 */
function project(p, distance, centerX, centerY, scale) {
    var factor = distance / (distance + p.z);
    return {
        x: Math.floor(centerX + p.x * scale * factor),
        y: Math.floor(centerY - p.y * scale * factor),
    };
}
/**
 * Draw a line between two points using Bresenham's algorithm
 */
function drawLine(canvas, x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1;
    var sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    while (true) {
        canvas.set(x0, y0);
        if (x0 === x1 && y0 === y1)
            break;
        var e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
}
door.onConnect(function (user) { return __awaiter(void 0, void 0, void 0, function () {
    var ui, titleBar, canvasBox, infoBox, controlsBox, statusBar, angleX, angleY, angleZ, speed, paused, frameCount, animate, interval;
    return __generator(this, function (_a) {
        console.log("User ".concat(user.name, " connected to Drawille Cube Demo"));
        ui = new UIEngine({
            width: 80,
            height: 24,
            smartCSR: true,
            enableMouse: false,
            enableKeys: true,
        });
        titleBar = ui.createBox({
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            content: '{center}{bold}Drawille Cube Demo{/bold}\n{center}Rotating 3D Cube using Braille Graphics{/center}',
            tags: true,
            style: {
                fg: 'white',
                bg: 'blue',
            },
        });
        canvasBox = ui.createBox({
            top: 3,
            left: 2,
            width: 60,
            height: 18,
            border: { type: 'line' },
            label: ' Animation ',
            style: {
                border: { fg: 'cyan' },
            },
        });
        infoBox = ui.createBox({
            top: 3,
            left: 64,
            width: 14,
            height: 10,
            border: { type: 'line' },
            label: ' Info ',
            content: '',
            tags: true,
            style: {
                border: { fg: 'yellow' },
            },
        });
        controlsBox = ui.createBox({
            top: 14,
            left: 64,
            width: 14,
            height: 7,
            border: { type: 'line' },
            label: ' Controls ',
            content: '{cyan-fg}[+] Speed up\n[-] Slow down\n[R] Reset\n[Space] Pause\n[Q] Quit{/cyan-fg}',
            tags: true,
            style: {
                border: { fg: 'yellow' },
            },
        });
        statusBar = ui.createBox({
            bottom: 0,
            left: 0,
            width: '100%',
            height: 1,
            content: ' Press Q or ESC to quit',
            style: {
                fg: 'white',
                bg: 'blue',
            },
        });
        ui.render();
        angleX = 0;
        angleY = 0;
        angleZ = 0;
        speed = 0.03;
        paused = false;
        frameCount = 0;
        animate = function () {
            if (!paused) {
                // Update rotation angles
                angleX += speed;
                angleY += speed * 0.7;
                angleZ += speed * 0.5;
                // Create drawille canvas
                var canvas = new drawille.Canvas();
                // Canvas dimensions (in braille pixels, which are 2x4 per character)
                var width = 56 * 2; // Account for braille pixel density
                var height = 16 * 4;
                var centerX_1 = width / 2;
                var centerY_1 = height / 2;
                var scale_1 = 20;
                var distance_1 = 4;
                // Rotate and project vertices
                var projectedVertices = CUBE_VERTICES.map(function (v) {
                    var rotated = v;
                    rotated = rotateX(rotated, angleX);
                    rotated = rotateY(rotated, angleY);
                    rotated = rotateZ(rotated, angleZ);
                    return project(rotated, distance_1, centerX_1, centerY_1, scale_1);
                });
                // Draw edges
                for (var _i = 0, CUBE_EDGES_1 = CUBE_EDGES; _i < CUBE_EDGES_1.length; _i++) {
                    var _a = CUBE_EDGES_1[_i], start = _a[0], end = _a[1];
                    var p1 = projectedVertices[start];
                    var p2 = projectedVertices[end];
                    drawLine(canvas, p1.x, p1.y, p2.x, p2.y);
                }
                // Render canvas to string
                var frame = canvas.frame();
                // Update canvas box
                canvasBox.setContent(frame);
                // Update info
                frameCount++;
                infoBox.setContent("{yellow-fg}Frame: {/yellow-fg}{white-fg}".concat(frameCount, "{/white-fg}\n") +
                    "{yellow-fg}Speed: {/yellow-fg}{white-fg}".concat(speed.toFixed(3), "{/white-fg}\n") +
                    "{yellow-fg}Angle X: {/yellow-fg}{white-fg}".concat((angleX % (2 * Math.PI)).toFixed(2), "{/white-fg}\n") +
                    "{yellow-fg}Angle Y: {/yellow-fg}{white-fg}".concat((angleY % (2 * Math.PI)).toFixed(2), "{/white-fg}\n") +
                    "{yellow-fg}Angle Z: {/yellow-fg}{white-fg}".concat((angleZ % (2 * Math.PI)).toFixed(2), "{/white-fg}\n") +
                    "{yellow-fg}Status: {/yellow-fg}{".concat(paused ? 'red-fg}Paused' : 'green-fg}Running', "{/}"));
                ui.render();
            }
        };
        interval = setInterval(animate, 50);
        // Keyboard controls
        ui.onKey(['+', '='], function () {
            speed = Math.min(speed + 0.01, 0.2);
        });
        ui.onKey(['-', '_'], function () {
            speed = Math.max(speed - 0.01, 0.01);
        });
        ui.onKey(['r', 'R'], function () {
            angleX = 0;
            angleY = 0;
            angleZ = 0;
            frameCount = 0;
        });
        ui.onKey(['space'], function () {
            paused = !paused;
        });
        ui.onKey(['q', 'Q', 'escape'], function () {
            clearInterval(interval);
            ui.destroy();
            door.disconnect(user.id);
        });
        return [2 /*return*/];
    });
}); });
door.onDisconnect(function (user) {
    console.log("User ".concat(user.name, " disconnected from Drawille Cube Demo"));
});
function runDoor(doorSession) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, runDoorWithSession(door, doorSession)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
