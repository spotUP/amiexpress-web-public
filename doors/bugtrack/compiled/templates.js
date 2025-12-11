"use strict";
/**
 * Templates System - Pre-filled Bug Report Templates
 *
 * Features:
 * - Built-in templates for common bug types
 * - Custom user templates
 * - Template categories
 * - Quick bug report (minimal fields)
 * - Template management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateManager = void 0;
class TemplateManager {
    constructor() {
        this.templates = [];
        this.loadBuiltInTemplates();
    }
    loadBuiltInTemplates() {
        // Crash template
        this.templates.push({
            id: 'crash',
            name: 'Application Crash',
            description: 'Use when the system or command crashes',
            category: 'System Commands',
            priority: 'High',
            descriptionTemplate: 'The system crashes when performing [ACTION].\n\nError details:\n[ERROR MESSAGE OR CODE]',
            stepsTemplate: '1. Open/run [COMMAND/DOOR]\n2. Perform [ACTION]\n3. System crashes',
            expectedTemplate: 'The [COMMAND/DOOR] should complete without crashing',
            actualTemplate: 'The system crashes with [ERROR]',
            tags: ['crash', 'critical'],
            isBuiltIn: true,
            usageCount: 0
        });
        // Door not working
        this.templates.push({
            id: 'door-broken',
            name: 'Door Not Working',
            description: 'A BBS door is not functioning correctly',
            category: 'Doors',
            priority: 'Medium',
            descriptionTemplate: 'The [DOOR NAME] door is not working properly.\n\nIssue:\n[DESCRIBE ISSUE]',
            stepsTemplate: '1. Launch the door from main menu\n2. [SPECIFIC ACTIONS]\n3. Issue occurs',
            expectedTemplate: 'The door should [EXPECTED BEHAVIOR]',
            actualTemplate: 'The door [ACTUAL BEHAVIOR]',
            tags: ['door'],
            isBuiltIn: true,
            usageCount: 0
        });
        // Display/rendering issue
        this.templates.push({
            id: 'display-issue',
            name: 'Display/Rendering Issue',
            description: 'ANSI art or text not displaying correctly',
            category: 'General System',
            priority: 'Low',
            descriptionTemplate: 'Display issue in [LOCATION].\n\nProblem:\n[DESCRIBE VISUAL ISSUE]',
            stepsTemplate: '1. Navigate to [LOCATION]\n2. Observe display\n3. Notice [ISSUE]',
            expectedTemplate: 'Display should show [CORRECT DISPLAY]',
            actualTemplate: 'Display shows [INCORRECT DISPLAY]',
            tags: ['display', 'ui', 'ansi'],
            isBuiltIn: true,
            usageCount: 0
        });
        // Command error
        this.templates.push({
            id: 'command-error',
            name: 'Command Error',
            description: 'A command returns an error or unexpected result',
            category: 'System Commands',
            priority: 'Medium',
            descriptionTemplate: 'The [COMMAND NAME] command produces an error.\n\nError message:\n[ERROR TEXT]',
            stepsTemplate: '1. Type command: [COMMAND]\n2. Add parameters: [PARAMETERS]\n3. Press Enter\n4. Error appears',
            expectedTemplate: 'Command should [EXPECTED RESULT]',
            actualTemplate: 'Command returns error: [ERROR]',
            tags: ['command', 'error'],
            isBuiltIn: true,
            usageCount: 0
        });
        // Performance issue
        this.templates.push({
            id: 'performance',
            name: 'Performance Issue',
            description: 'Slow response or lag',
            category: 'General System',
            priority: 'Medium',
            descriptionTemplate: 'Performance issue when [ACTION].\n\nDelay/slowness:\n[DESCRIBE PERFORMANCE PROBLEM]',
            stepsTemplate: '1. Perform [ACTION]\n2. Observe delay\n3. Wait [TIME AMOUNT]',
            expectedTemplate: 'Should complete in [EXPECTED TIME]',
            actualTemplate: 'Takes [ACTUAL TIME] to complete',
            tags: ['performance', 'slow', 'lag'],
            isBuiltIn: true,
            usageCount: 0
        });
        // Data loss
        this.templates.push({
            id: 'data-loss',
            name: 'Data Loss/Corruption',
            description: 'Lost or corrupted data',
            category: 'General System',
            priority: 'Critical',
            descriptionTemplate: 'Data loss occurred when [ACTION].\n\nData affected:\n[WHAT WAS LOST]',
            stepsTemplate: '1. [ACTION PERFORMED]\n2. System [EVENT]\n3. Data lost/corrupted',
            expectedTemplate: 'Data should be preserved/saved correctly',
            actualTemplate: 'Data was lost or became corrupted',
            tags: ['data-loss', 'critical', 'data-corruption'],
            isBuiltIn: true,
            usageCount: 0
        });
        // Feature request (not a bug, but useful)
        this.templates.push({
            id: 'feature-request',
            name: 'Feature Request',
            description: 'Suggest a new feature or improvement',
            category: 'General System',
            priority: 'Low',
            descriptionTemplate: 'Feature request for [FEATURE NAME].\n\nDescription:\n[DESCRIBE REQUESTED FEATURE]\n\nBenefit:\n[WHY THIS WOULD BE USEFUL]',
            stepsTemplate: 'N/A - This is a feature request',
            expectedTemplate: '[DESCRIBE DESIRED FUNCTIONALITY]',
            actualTemplate: 'This feature does not currently exist',
            tags: ['feature-request', 'enhancement'],
            isBuiltIn: true,
            usageCount: 0
        });
        // Quick bug (minimal template)
        this.templates.push({
            id: 'quick',
            name: 'Quick Bug Report',
            description: 'Simplified template for quick reports',
            category: 'General System',
            priority: 'Medium',
            descriptionTemplate: '[BRIEF DESCRIPTION OF BUG]',
            stepsTemplate: '[HOW TO REPRODUCE]',
            expectedTemplate: '[WHAT SHOULD HAPPEN]',
            actualTemplate: '[WHAT ACTUALLY HAPPENS]',
            tags: ['quick'],
            isBuiltIn: true,
            usageCount: 0
        });
    }
    /**
     * Get all templates
     */
    getTemplates() {
        return this.templates;
    }
    /**
     * Get templates by category
     */
    getTemplatesByCategory(category) {
        return this.templates.filter(t => t.category === category);
    }
    /**
     * Get template by ID
     */
    getTemplate(id) {
        return this.templates.find(t => t.id === id);
    }
    /**
     * Get most used templates
     */
    getMostUsedTemplates(limit = 5) {
        return [...this.templates]
            .sort((a, b) => b.usageCount - a.usageCount)
            .slice(0, limit);
    }
    /**
     * Increment template usage
     */
    incrementUsage(id) {
        const template = this.templates.find(t => t.id === id);
        if (template) {
            template.usageCount++;
        }
    }
    /**
     * Add custom template
     */
    addCustomTemplate(template) {
        const customTemplate = {
            ...template,
            id: `custom_${Date.now()}`,
            isBuiltIn: false,
            usageCount: 0
        };
        this.templates.push(customTemplate);
        return customTemplate;
    }
    /**
     * Delete custom template
     */
    deleteTemplate(id) {
        const template = this.templates.find(t => t.id === id);
        if (template && !template.isBuiltIn) {
            const index = this.templates.indexOf(template);
            this.templates.splice(index, 1);
            return true;
        }
        return false;
    }
    /**
     * Save templates to file
     */
    save(filepath) {
        const fs = require('fs');
        const customTemplates = this.templates.filter(t => !t.isBuiltIn);
        fs.writeFileSync(filepath, JSON.stringify(customTemplates, null, 2));
    }
    /**
     * Load templates from file
     */
    load(filepath) {
        const fs = require('fs');
        if (fs.existsSync(filepath)) {
            const data = fs.readFileSync(filepath, 'utf-8');
            const customTemplates = JSON.parse(data);
            this.templates.push(...customTemplates);
        }
    }
    /**
     * Apply template to bug report
     */
    applyTemplate(templateId) {
        const template = this.getTemplate(templateId);
        if (!template)
            return null;
        this.incrementUsage(templateId);
        return {
            category: template.category,
            subcategory: template.subcategory,
            priority: template.priority,
            description: template.descriptionTemplate,
            stepsToReproduce: template.stepsTemplate,
            expectedBehavior: template.expectedTemplate,
            actualBehavior: template.actualTemplate,
            tags: template.tags
        };
    }
}
exports.TemplateManager = TemplateManager;
