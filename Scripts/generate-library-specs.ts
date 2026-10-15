#!/usr/bin/env npx tsx
/**
 * Generate Type-Safe Library Specifications
 *
 * Purpose: Parse NDK autodocs and generate TypeScript interfaces that
 * enforce correct return types, parameters, and edge cases.
 *
 * This prevents sloppy implementations by making the compiler enforce
 * the AmigaDOS/Exec specifications.
 *
 * Usage:
 *   npx tsx Scripts/generate-library-specs.ts dos
 *   npx tsx Scripts/generate-library-specs.ts exec
 *   npx tsx Scripts/generate-library-specs.ts all
 */

import * as fs from 'fs';
import * as path from 'path';

const NDK_AUTODOCS_PATH = '~/Code/amiexpress-web/NDK3.2R4/Autodocs/AG';
const OUTPUT_DIR = '~/Code/amiexpress-web/web/backend/src/amiga-emulation/api/specs';

// ============================================================================
// Autodoc Parser
// ============================================================================

interface FunctionSpec {
  name: string;
  synopsis: string;
  description: string;
  inputs: string[];
  result: string;
  notes: string[];
  library: string;
}

class AutodocParser {
  parseLibrary(libraryName: string): FunctionSpec[] {
    const autodocPath = path.join(NDK_AUTODOCS_PATH, libraryName);

    if (!fs.existsSync(autodocPath)) {
      throw new Error(`Autodoc not found: ${autodocPath}`);
    }

    console.log(`[AutodocParser] Parsing ${libraryName}.library autodocs...`);

    const content = fs.readFileSync(autodocPath, 'utf-8');
    const lines = content.split('\n');

    const functions: FunctionSpec[] = [];
    let currentFunction: Partial<FunctionSpec> | null = null;
    let currentSection: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // New function node
      if (line.startsWith('@Node')) {
        // Save previous function
        if (currentFunction && currentFunction.name) {
          functions.push(currentFunction as FunctionSpec);
        }

        // Extract function name
        const match = line.match(/@Node "([^"]+)"/);
        if (match) {
          currentFunction = {
            name: match[1],
            synopsis: '',
            description: '',
            inputs: [],
            result: '',
            notes: [],
            library: libraryName
          };
          currentSection = null;
        }
      }
      // Section headers
      else if (line.trim() === 'NAME') {
        currentSection = 'NAME';
      } else if (line.trim() === 'SYNOPSIS') {
        currentSection = 'SYNOPSIS';
      } else if (line.trim() === 'FUNCTION') {
        currentSection = 'FUNCTION';
      } else if (line.trim() === 'INPUTS') {
        currentSection = 'INPUTS';
      } else if (line.trim() === 'RESULT') {
        currentSection = 'RESULT';
      } else if (line.trim() === 'NOTES') {
        currentSection = 'NOTES';
      }
      // Content
      else if (currentFunction && currentSection && line.trim()) {
        switch (currentSection) {
          case 'SYNOPSIS':
            currentFunction.synopsis += line.trim() + ' ';
            break;
          case 'FUNCTION':
            currentFunction.description += line.trim() + ' ';
            break;
          case 'INPUTS':
            currentFunction.inputs!.push(line.trim());
            break;
          case 'RESULT':
            currentFunction.result += line.trim() + ' ';
            break;
          case 'NOTES':
            currentFunction.notes!.push(line.trim());
            break;
        }
      }
    }

    // Save last function
    if (currentFunction && currentFunction.name) {
      functions.push(currentFunction as FunctionSpec);
    }

    console.log(`[AutodocParser] Parsed ${functions.length} functions from ${libraryName}.library`);

    return functions;
  }
}

// ============================================================================
// TypeScript Generator
// ============================================================================

class TypeScriptGenerator {
  generateLibrarySpec(libraryName: string, functions: FunctionSpec[]): string {
    const className = this.capitalize(libraryName) + 'LibrarySpec';

    let output = `/**
 * ${className}
 *
 * Type-safe specifications for ${libraryName}.library functions.
 * Auto-generated from NDK 3.2R4 Autodocs.
 *
 * DO NOT EDIT MANUALLY - Regenerate with:
 *   npx tsx Scripts/generate-library-specs.ts ${libraryName}
 */

export interface ${className} {
`;

    for (const func of functions) {
      output += this.generateFunctionSpec(func);
    }

    output += '}\n\n';
    output += this.generateValidationHelpers(libraryName, functions);

    return output;
  }

  private generateFunctionSpec(func: FunctionSpec): string {
    let spec = `  /**
   * ${func.name}
   *
   * ${func.description.trim()}
   *
`;

    if (func.inputs.length > 0) {
      spec += `   * Inputs:\n`;
      for (const input of func.inputs) {
        spec += `   *   - ${input}\n`;
      }
      spec += `   * \n`;
    }

    spec += `   * Result:\n`;
    spec += `   *   ${func.result.trim()}\n`;
    spec += `   * \n`;

    if (func.notes.length > 0) {
      spec += `   * Notes:\n`;
      for (const note of func.notes) {
        spec += `   *   - ${note}\n`;
      }
      spec += `   * \n`;
    }

    spec += `   * Reference: NDK3.2R4/Autodocs/AG/${func.library}\n`;
    spec += `   */\n`;

    // Determine return type from result description
    const returnType = this.inferReturnType(func.result);

    spec += `  ${func.name}: {\n`;
    spec += `    returnType: '${returnType}';\n`;
    spec += `    description: string;\n`;
    spec += `    edgeCases: string[];\n`;
    spec += `    sideEffects: string[];\n`;
    spec += `  };\n\n`;

    return spec;
  }

  private inferReturnType(resultDescription: string): string {
    const desc = resultDescription.toLowerCase();

    if (desc.includes('dostrue') || desc.includes('dosfalse')) {
      return 'number'; // -1 for TRUE, 0 for FALSE
    } else if (desc.includes('pointer') || desc.includes('address')) {
      return 'number'; // Memory address
    } else if (desc.includes('handle') || desc.includes('file')) {
      return 'number'; // File handle
    } else if (desc.includes('bool') || desc.includes('success')) {
      return 'boolean';
    } else if (desc.includes('void') || desc.includes('none')) {
      return 'void';
    } else {
      return 'number'; // Default to number (most common)
    }
  }

  private generateValidationHelpers(libraryName: string, functions: FunctionSpec[]): string {
    const className = this.capitalize(libraryName) + 'LibrarySpec';

    let output = `/**
 * Validation helpers for ${libraryName}.library
 *
 * Use these to ensure implementations match specifications.
 */\n\n`;

    output += `export const ${libraryName}Spec: ${className} = {\n`;

    for (const func of functions) {
      const returnType = this.inferReturnType(func.result);

      output += `  ${func.name}: {\n`;
      output += `    returnType: '${returnType}',\n`;
      output += `    description: \`${func.description.trim()}\`,\n`;
      output += `    edgeCases: [\n`;

      // Extract edge cases from notes
      for (const note of func.notes) {
        output += `      '${note.replace(/'/g, "\\'")}',\n`;
      }

      output += `    ],\n`;
      output += `    sideEffects: [\n`;

      // Common side effects based on function name
      if (func.name.toLowerCase().includes('open')) {
        output += `      'Allocates file handle',\n`;
        output += `      'May set lastError',\n`;
      } else if (func.name.toLowerCase().includes('close')) {
        output += `      'Deallocates file handle',\n`;
        output += `      'Flushes buffers',\n`;
      } else if (func.name.toLowerCase().includes('write')) {
        output += `      'Modifies file contents',\n`;
        output += `      'Advances file position',\n`;
      } else if (func.name.toLowerCase().includes('read')) {
        output += `      'Advances file position',\n`;
      }

      output += `    ]\n`;
      output += `  },\n`;
    }

    output += `};\n\n`;

    // Generate type guard
    output += `/**
 * Type guard to validate return values match specification
 */
export function validate${this.capitalize(libraryName)}Return(\n`;
    output += `  functionName: keyof ${className},\n`;
    output += `  returnValue: any\n`;
    output += `): boolean {\n`;
    output += `  const spec = ${libraryName}Spec[functionName];\n`;
    output += `  const expectedType = spec.returnType;\n`;
    output += `  const actualType = typeof returnValue;\n\n`;
    output += `  if (expectedType === 'void') {\n`;
    output += `    return returnValue === undefined;\n`;
    output += `  }\n\n`;
    output += `  if (expectedType !== actualType) {\n`;
    output += `    console.error(\n`;
    output += `      \`[${libraryName}.library] \${functionName}() returned \${actualType}, expected \${expectedType}\`\n`;
    output += `    );\n`;
    output += `    return false;\n`;
    output += `  }\n\n`;
    output += `  return true;\n`;
    output += `}\n`;

    return output;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// ============================================================================
// Implementation Validator Generator
// ============================================================================

class ValidatorGenerator {
  generateValidator(libraryName: string): string {
    const className = this.capitalize(libraryName) + 'Library';
    const specName = this.capitalize(libraryName) + 'LibrarySpec';

    return `/**
 * ${className} Implementation Validator
 *
 * Ensures ${libraryName}.library implementation matches NDK specifications.
 *
 * Usage in ${className}.ts:
 *
 * import { ${libraryName}Spec, validate${this.capitalize(libraryName)}Return } from './specs/${libraryName}-library.spec';
 *
 * // In each function:
 * MyFunction(): number {
 *   const spec = ${libraryName}Spec.MyFunction;
 *   console.log(\`[${libraryName}.library] \${spec.description}\`);
 *
 *   // Implementation...
 *   const result = -1;
 *
 *   // Validate return type
 *   if (!validate${this.capitalize(libraryName)}Return('MyFunction', result)) {
 *     throw new Error('Invalid return type');
 *   }
 *
 *   return result;
 * }
 */

import { ${libraryName}Spec, ${specName} } from './specs/${libraryName}-library.spec';

export function validate${this.capitalize(libraryName)}Implementation(
  implementation: any
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [functionName, spec] of Object.entries(${libraryName}Spec)) {
    // Check if function exists in implementation
    if (typeof implementation[functionName] !== 'function') {
      errors.push(\`Missing implementation: \${functionName}()\`);
      continue;
    }

    // TODO: Runtime validation of function behavior
    // This would require test cases for each function
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Generate Type-Safe Library Specifications

Parses NDK autodocs and generates TypeScript interfaces that enforce
correct return types, parameters, and edge cases.

Usage:
  npx tsx Scripts/generate-library-specs.ts <library>
  npx tsx Scripts/generate-library-specs.ts all

Examples:
  npx tsx Scripts/generate-library-specs.ts dos
  npx tsx Scripts/generate-library-specs.ts exec
  npx tsx Scripts/generate-library-specs.ts all

Available libraries:
  dos, exec, graphics, intuition, diskfont, gadtools, utility, etc.

Output:
  web/backend/src/amiga-emulation/api/specs/<library>-library.spec.ts
`);
    process.exit(0);
  }

  const libraryName = args[0];

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    if (libraryName === 'all') {
      // Generate specs for all libraries
      const libraries = ['dos', 'exec', 'graphics', 'intuition'];

      for (const lib of libraries) {
        await generateLibrarySpec(lib);
      }
    } else {
      await generateLibrarySpec(libraryName);
    }

    console.log('\n✅ Generation complete!');
    console.log(`\nTo use in your code:`);
    console.log(`  import { ${libraryName}Spec, validate${capitalize(libraryName)}Return } from './specs/${libraryName}-library.spec';\n`);
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

async function generateLibrarySpec(libraryName: string): Promise<void> {
  console.log(`\n=== Generating specs for ${libraryName}.library ===\n`);

  const parser = new AutodocParser();
  const functions = parser.parseLibrary(libraryName);

  const generator = new TypeScriptGenerator();
  const specCode = generator.generateLibrarySpec(libraryName, functions);

  const validatorGen = new ValidatorGenerator();
  const validatorCode = validatorGen.generateValidator(libraryName);

  // Write spec file
  const specPath = path.join(OUTPUT_DIR, `${libraryName}-library.spec.ts`);
  fs.writeFileSync(specPath, specCode);
  console.log(`✅ Generated: ${specPath}`);

  // Write validator file
  const validatorPath = path.join(OUTPUT_DIR, `${libraryName}-library.validator.ts`);
  fs.writeFileSync(validatorPath, validatorCode);
  console.log(`✅ Generated: ${validatorPath}`);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
}
