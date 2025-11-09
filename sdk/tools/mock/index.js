"use strict";
/**
 * Mock Data Tools for Door Development
 *
 * This module provides utilities for testing and developing BBS doors
 * without requiring a full BBS environment.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMockDevelopment = exports.MockDataProvider = void 0;
var mock_data_provider_1 = require("./mock-data-provider");
Object.defineProperty(exports, "MockDataProvider", { enumerable: true, get: function () { return mock_data_provider_1.MockDataProvider; } });
Object.defineProperty(exports, "setupMockDevelopment", { enumerable: true, get: function () { return mock_data_provider_1.setupMockDevelopment; } });
