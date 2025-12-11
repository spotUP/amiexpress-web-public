"use strict";
/**
 * Smart Features - AI-powered assistance
 *
 * Features:
 * - Duplicate bug detection
 * - Fuzzy search
 * - Tag suggestions
 * - Smart categorization
 * - Similar bug matching
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartFeatures = void 0;
class SmartFeatures {
    /**
     * Detect potential duplicate bugs
     */
    findDuplicates(newBug, existingBugs, threshold = 0.7) {
        if (!newBug.title && !newBug.description)
            return [];
        const similarities = existingBugs.map(bug => {
            const similarity = this.calculateSimilarity(newBug, bug);
            const matchedFields = [];
            // Check which fields matched
            if (newBug.title && this.stringSimilarity(newBug.title, bug.title) > 0.8) {
                matchedFields.push('title');
            }
            if (newBug.description && this.stringSimilarity(newBug.description, bug.description) > 0.7) {
                matchedFields.push('description');
            }
            if (newBug.category === bug.category) {
                matchedFields.push('category');
            }
            if (newBug.subcategory && newBug.subcategory === bug.subcategory) {
                matchedFields.push('subcategory');
            }
            return {
                bug,
                similarity,
                matchedFields
            };
        });
        return similarities
            .filter(s => s.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5);
    }
    /**
     * Calculate overall similarity between two bug reports
     */
    calculateSimilarity(bug1, bug2) {
        let score = 0;
        let weights = 0;
        // Title similarity (weight: 0.4)
        if (bug1.title && bug2.title) {
            score += this.stringSimilarity(bug1.title, bug2.title) * 0.4;
            weights += 0.4;
        }
        // Description similarity (weight: 0.3)
        if (bug1.description && bug2.description) {
            score += this.stringSimilarity(bug1.description, bug2.description) * 0.3;
            weights += 0.3;
        }
        // Category match (weight: 0.15)
        if (bug1.category && bug2.category) {
            score += (bug1.category === bug2.category ? 1 : 0) * 0.15;
            weights += 0.15;
        }
        // Subcategory match (weight: 0.1)
        if (bug1.subcategory && bug2.subcategory) {
            score += (bug1.subcategory === bug2.subcategory ? 1 : 0) * 0.1;
            weights += 0.1;
        }
        // Tag overlap (weight: 0.05)
        if (bug1.tags && bug2.tags) {
            const overlap = this.tagOverlap(bug1.tags, bug2.tags);
            score += overlap * 0.05;
            weights += 0.05;
        }
        return weights > 0 ? score / weights : 0;
    }
    /**
     * Calculate string similarity using Levenshtein distance
     */
    stringSimilarity(str1, str2) {
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();
        if (s1 === s2)
            return 1.0;
        if (s1.length === 0 || s2.length === 0)
            return 0.0;
        const distance = this.levenshteinDistance(s1, s2);
        const maxLength = Math.max(s1.length, s2.length);
        return 1 - (distance / maxLength);
    }
    /**
     * Levenshtein distance calculation
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1, // insertion
                    matrix[i - 1][j] + 1 // deletion
                    );
                }
            }
        }
        return matrix[str2.length][str1.length];
    }
    /**
     * Calculate tag overlap
     */
    tagOverlap(tags1, tags2) {
        if (tags1.length === 0 || tags2.length === 0)
            return 0;
        const set1 = new Set(tags1.map(t => t.toLowerCase()));
        const set2 = new Set(tags2.map(t => t.toLowerCase()));
        const intersection = new Set([...set1].filter(t => set2.has(t)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }
    /**
     * Fuzzy search bugs
     */
    fuzzySearch(query, bugs, limit = 10) {
        if (!query.trim())
            return [];
        const queryLower = query.toLowerCase();
        const results = bugs.map(bug => {
            let score = 0;
            // Title match
            const titleSimilarity = this.stringSimilarity(queryLower, bug.title);
            score += titleSimilarity * 2; // Title is more important
            // Description match
            if (bug.description.toLowerCase().includes(queryLower)) {
                score += 0.5;
            }
            // Exact category match
            if (bug.category.toLowerCase().includes(queryLower)) {
                score += 0.3;
            }
            // Tag match
            if (bug.tags) {
                const tagMatch = bug.tags.some(tag => tag.toLowerCase().includes(queryLower));
                if (tagMatch)
                    score += 0.2;
            }
            return { bug, score };
        });
        return results
            .filter(r => r.score > 0.1)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    /**
     * Suggest tags based on title and description
     */
    suggestTags(title, description, existingTags) {
        const suggestions = [];
        const text = `${title} ${description}`.toLowerCase();
        // Common bug-related keywords
        const tagKeywords = {
            'crash': ['crash', 'crashes', 'crashing', 'freeze', 'hang'],
            'error': ['error', 'fail', 'failed', 'failing', 'broken'],
            'slow': ['slow', 'lag', 'delay', 'performance'],
            'display': ['display', 'render', 'ansi', 'visual', 'ui'],
            'data-loss': ['lost', 'missing', 'deleted', 'corrupt'],
            'network': ['network', 'connection', 'disconnect', 'timeout'],
            'security': ['security', 'password', 'auth', 'access'],
            'files': ['file', 'upload', 'download', 'transfer'],
            'memory': ['memory', 'leak', 'ram', 'oom'],
            'door': ['door', 'game', 'external']
        };
        for (const [tag, keywords] of Object.entries(tagKeywords)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                if (existingTags.has(tag)) {
                    suggestions.push(tag);
                }
            }
        }
        // Priority indicators
        if (text.includes('critical') || text.includes('urgent') || text.includes('important')) {
            suggestions.push('high-priority');
        }
        // Remove duplicates
        return [...new Set(suggestions)];
    }
    /**
     * Smart categorization based on content
     */
    suggestCategory(title, description) {
        const text = `${title} ${description}`.toLowerCase();
        const categoryKeywords = {
            'System Commands': ['command', 'cmd', 'file', 'list', 'delete', 'move', 'copy'],
            'Doors': ['door', 'game', 'external', 'launch', 'run'],
            'General System': ['system', 'login', 'menu', 'display', 'screen', 'ansi']
        };
        let bestCategory = '';
        let bestScore = 0;
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            const matches = keywords.filter(keyword => text.includes(keyword)).length;
            const score = matches / keywords.length;
            if (score > bestScore) {
                bestScore = score;
                bestCategory = category;
            }
        }
        if (bestScore > 0.2) {
            return { category: bestCategory, confidence: bestScore };
        }
        return null;
    }
    /**
     * Extract keywords from text
     */
    extractKeywords(text, maxKeywords = 5) {
        // Remove common words (stop words)
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
            'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
            'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
        ]);
        const words = text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3 && !stopWords.has(word));
        // Count frequency
        const frequency = new Map();
        words.forEach(word => {
            frequency.set(word, (frequency.get(word) || 0) + 1);
        });
        // Sort by frequency and return top keywords
        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxKeywords)
            .map(([word]) => word);
    }
    /**
     * Check if bug report is likely spam
     */
    isLikelySpam(title, description) {
        const text = `${title} ${description}`.toLowerCase();
        // Spam indicators
        const spamPatterns = [
            /viagra/i,
            /cialis/i,
            /pharmacy/i,
            /casino/i,
            /lottery/i,
            /prize/i,
            /winner/i,
            /click here/i,
            /buy now/i,
            /limited time/i,
            /act now/i
        ];
        // Check for spam patterns
        if (spamPatterns.some(pattern => pattern.test(text))) {
            return true;
        }
        // Check for excessive capitalization
        const capitals = text.replace(/[^A-Z]/g, '').length;
        const total = text.replace(/[^a-zA-Z]/g, '').length;
        if (total > 0 && capitals / total > 0.5) {
            return true;
        }
        // Check for excessive punctuation
        const punctuation = text.replace(/[^!?]/g, '').length;
        if (punctuation > 10) {
            return true;
        }
        return false;
    }
}
exports.SmartFeatures = SmartFeatures;
