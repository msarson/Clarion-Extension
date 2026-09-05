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

import { SignatureInformation, ParameterInformation } from 'vscode-languageserver-protocol';
import * as builtinsData from '../data/clarion-builtins.json';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("BuiltinFunctionService");
logger.setLevel("error");

/**
 * Represents a parameter that can be required or optional
 */
export interface ParameterDefinition {
    name: string;
    optional?: boolean;  // If true, parameter can be omitted with comma placeholder
}

/**
 * Represents a single signature variant of a built-in function
 */
export interface BuiltinSignature {
    /** Parameter definitions - supports both string and object format */
    params: (string | ParameterDefinition)[];
    /** Return type, e.g. "BYTE", "STRING", "LONG" */
    returnType: string;
    /** Human-readable description of what this signature does */
    description: string;
    /** Optional explicit syntax like "MESSAGE([text] [,caption])" */
    syntax?: string;
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
 * A signature as authored in the *alternate* JSON shape used by ~60 of the entries
 * (the later doc-import batches): `label` / `documentation` / `parameters[{label}]`,
 * with `returnType` hoisted onto the function instead of onto each signature.
 *
 * Both shapes are legitimate authored data, so normalize on load rather than
 * rewriting the file. A signature missing `params`/`description` otherwise reached
 * the hover formatter with zero parameters and an undefined description, rendering
 * as "Keyword: <name>" followed by the literal text "undefined" (INRANGE, INLIST,
 * CHOICE, RUN, POPUP, … — see BuiltinSignatureShapes.test.ts).
 */
interface AlternateSignatureShape {
    label?: string;
    documentation?: string;
    parameters?: { label: string; documentation?: string }[];
}

/**
 * Coerces a function entry from either authored shape into `BuiltinFunction`.
 * Entries already in the documented `params`/`description` shape pass through
 * untouched.
 */
function normalizeBuiltin(func: BuiltinFunction): BuiltinFunction {
    const fallbackReturnType = (func as { returnType?: string }).returnType;
    const fallbackDescription = (func as { description?: string }).description;

    const signatures = (func.signatures ?? []).map(sig => {
        if (sig.params && sig.description) {
            return sig;
        }

        const alt = sig as unknown as AlternateSignatureShape;
        return {
            ...sig,
            params: sig.params ?? (alt.parameters ?? []).map(p => ({ name: p.label })),
            returnType: sig.returnType ?? fallbackReturnType ?? '',
            description: sig.description ?? alt.documentation ?? fallbackDescription ?? '',
            syntax: sig.syntax ?? alt.label
        } as BuiltinSignature;
    });

    return { ...func, signatures };
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
            const definitions: BuiltinDefinitions = builtinsData as unknown as BuiltinDefinitions;
            
            for (const func of definitions.functions) {
                // Store with uppercase key for case-insensitive lookup
                this.builtins.set(func.name.toUpperCase(), normalizeBuiltin(func));
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
            // Defensive: some builtin JSON entries have a signature with no `params` field
            // (e.g. bare-keyword forms). Treat a missing list as zero parameters rather than
            // crashing any consumer that maps over it.
            const sigParams = sig.params ?? [];
            // Create parameter information for each parameter
            const params = sigParams.map(p => {
                const paramName = typeof p === 'string' ? p : p.name;
                return ParameterInformation.create(paramName);
            });

            // Create the signature label: FUNCTIONNAME(param1, param2, ...) → ReturnType
            const paramLabels = sigParams.map(p => {
                if (typeof p === 'string') {
                    return p;
                }
                return p.optional ? `[${p.name}]` : p.name;
            }).join(', ');
            
            const label = sig.returnType 
                ? `${builtin.name}(${paramLabels}) → ${sig.returnType}`
                : `${builtin.name}(${paramLabels})`;
            
            return {
                label,
                documentation: {
                    kind: 'markdown' as const,
                    value: sig.description
                },
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
