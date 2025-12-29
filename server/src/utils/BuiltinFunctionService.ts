/**
 * BuiltinFunctionService - Provides signature help for Clarion built-in functions
 * 
 * Loads function definitions from clarion-builtins.json and provides:
 * - Signature information for signature help
 * - Parameter information
 * - Documentation/descriptions
 * 
 * Functions are loaded once at startup and cached in memory for fast lookup.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SignatureInformation, ParameterInformation } from 'vscode-languageserver-protocol';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("BuiltinFunctionService");

/**
 * Represents a single signature variant of a built-in function
 */
export interface BuiltinSignature {
    /** Parameter definitions, e.g. ["STRING text", "LONG icon"] */
    params: string[];
    /** Return type, e.g. "BYTE", "STRING", "LONG" */
    returnType: string;
    /** Human-readable description of what this signature does */
    description: string;
}

/**
 * Represents a built-in function with all its overloads
 */
export interface BuiltinFunction {
    /** Function name (case-insensitive), e.g. "MESSAGE", "CLIP" */
    name: string;
    /** Array of signature variants (overloads) */
    signatures: BuiltinSignature[];
}

/**
 * Root structure of clarion-builtins.json
 */
interface BuiltinDefinitions {
    functions: BuiltinFunction[];
}

/**
 * Service for managing and querying Clarion built-in functions
 * Singleton pattern - use getInstance()
 */
export class BuiltinFunctionService {
    private static instance: BuiltinFunctionService | null = null;
    private builtins: Map<string, BuiltinFunction>;
    private loaded: boolean = false;

    private constructor() {
        this.builtins = new Map();
    }

    /**
     * Gets the singleton instance
     */
    public static getInstance(): BuiltinFunctionService {
        if (!BuiltinFunctionService.instance) {
            BuiltinFunctionService.instance = new BuiltinFunctionService();
            BuiltinFunctionService.instance.loadBuiltins();
        }
        return BuiltinFunctionService.instance;
    }

    /**
     * Loads built-in function definitions from clarion-builtins.json
     * Called automatically on first getInstance()
     */
    private loadBuiltins(): void {
        if (this.loaded) {
            return;
        }

        try {
            const dataPath = path.join(__dirname, '../data/clarion-builtins.json');
            logger.info(`Loading built-in functions from: ${dataPath}`);
            
            const data = fs.readFileSync(dataPath, 'utf8');
            const definitions: BuiltinDefinitions = JSON.parse(data);
            
            for (const func of definitions.functions) {
                // Store with uppercase key for case-insensitive lookup
                this.builtins.set(func.name.toUpperCase(), func);
            }
            
            this.loaded = true;
            logger.info(`✅ Loaded ${this.builtins.size} built-in function(s)`);
        } catch (error) {
            logger.error(`❌ Failed to load built-in functions: ${error instanceof Error ? error.message : String(error)}`);
            this.loaded = true; // Mark as loaded even on failure to prevent repeated attempts
        }
    }

    /**
     * Checks if a function name is a Clarion built-in
     * @param functionName Function name to check (case-insensitive)
     * @returns true if this is a built-in function
     */
    public isBuiltin(functionName: string): boolean {
        return this.builtins.has(functionName.toUpperCase());
    }

    /**
     * Gets signature information for a built-in function
     * Used by SignatureHelpProvider to show parameter hints
     * @param functionName Function name (case-insensitive)
     * @returns Array of signature information, or empty array if not found
     */
    public getSignatures(functionName: string): SignatureInformation[] {
        const builtin = this.builtins.get(functionName.toUpperCase());
        if (!builtin) {
            return [];
        }

        return builtin.signatures.map(sig => {
            // Create parameter information for each parameter
            const params = sig.params.map(p => ParameterInformation.create(p));
            
            // Create the signature label: FUNCTIONNAME(param1, param2, ...) → ReturnType
            const paramLabels = sig.params.join(', ');
            const label = sig.returnType 
                ? `${builtin.name}(${paramLabels}) → ${sig.returnType}`
                : `${builtin.name}(${paramLabels})`;
            
            return {
                label,
                documentation: sig.description,
                parameters: params
            };
        });
    }

    /**
     * Gets all built-in function names
     * Useful for autocomplete/IntelliSense features
     * @returns Array of function names (uppercase)
     */
    public getAllBuiltinNames(): string[] {
        return Array.from(this.builtins.keys());
    }

    /**
     * Gets the count of loaded built-in functions
     * Useful for diagnostics/debugging
     */
    public getBuiltinCount(): number {
        return this.builtins.size;
    }

    /**
     * Reloads built-in definitions from disk
     * Useful for development/testing
     */
    public reload(): void {
        this.builtins.clear();
        this.loaded = false;
        this.loadBuiltins();
    }
}
