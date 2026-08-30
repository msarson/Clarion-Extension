/**
 * CompilerFlagService — Clarion's PREDEFINED COMPILER FLAGS (#420).
 *
 * Source: Clarion help, "Predefined Compiler Flags" (Advanced Topics › Clarion
 * core Project System Reference) and "#pragma define" (define_pragmas.htm).
 * These names are set by the compiler / project system, never declared in any
 * source file — `DLL_MODE` is literally the example on the `DLL` attribute's
 * own help page (`Func50 PROCEDURE(SREAL),REAL,PASCAL,DLL(dll_mode)`), and
 * `#pragma dll_mode` "is set by the project system … the program should not
 * override the project settings".
 *
 * Why a service: a bare-word lookup for one of these can never succeed, yet
 * every cross-file tier (hover's MEMBER-parent + INCLUDE walk, F12's sibling
 * walk, the undeclared-variable diagnostic's augment pass) would cold-load the
 * whole include universe to prove the miss — 10.5s measured on
 * `DLL(dll_mode)` in an 11K-line generated PROGRAM module. Same precedent as
 * #374 (`BuiltinFunctionService.isBuiltin` bails before the cross-file tiers).
 *
 * Singleton pattern - use getInstance().
 */

export interface CompilerFlagInfo {
    /** Canonical (upper-case) flag name as the help documents it. */
    name: string;
    /** Help text, lightly edited from the Clarion documentation. */
    description: string;
}

const NAMED_FLAGS: CompilerFlagInfo[] = [
    {
        name: 'DLL_MODE',
        description:
            'On when compiled to link to the runtime DLLs (the project link mode is not Local). ' +
            'Set by the project system via `#pragma dll_mode` — the program should not override the ' +
            'project settings. Typically seen as the `DLL(dll_mode)` attribute on MODULE prototypes ' +
            'and in `COMPILE`/`OMIT` conditions.'
    },
    {
        name: 'LIB_MODE',
        description: 'On when building a LIB.'
    },
    {
        name: '_DEBUG_',
        description: 'On for application debug mode.'
    },
    {
        name: '_WIDTH32_',
        description: 'On for 32-bit applications (deprecated).'
    }
];

/** `_C55_`, `_C60_`, `_C63_`, `_C70_` … `_C80_`, `_C100_` — "On for Clarion, version x.y and later". */
const VERSION_AND_LATER = /^_C(\d{2,3})_$/i;
/** `_VER_C10`, `_VER_C11`, … — "Where xx is a specific version number". */
const EXACT_VERSION = /^_VER_C(\d+)$/i;

export class CompilerFlagService {
    private static instance: CompilerFlagService | null = null;
    private readonly named = new Map<string, CompilerFlagInfo>();

    private constructor() {
        for (const flag of NAMED_FLAGS) {
            this.named.set(flag.name.toUpperCase(), flag);
        }
    }

    public static getInstance(): CompilerFlagService {
        if (!CompilerFlagService.instance) {
            CompilerFlagService.instance = new CompilerFlagService();
        }
        return CompilerFlagService.instance;
    }

    /** Case-insensitive: Clarion identifiers are case-insensitive, and `DLL(dll_mode)` is the idiomatic spelling. */
    public isCompilerFlag(name: string): boolean {
        return this.getFlag(name) !== null;
    }

    /** Documentation card data for a flag, or null when `name` is not a predefined compiler flag. */
    public getFlag(name: string): CompilerFlagInfo | null {
        const upper = name.toUpperCase();
        const named = this.named.get(upper);
        if (named) return named;

        let m = VERSION_AND_LATER.exec(upper);
        if (m) {
            const digits = m[1];
            const version = `${digits.slice(0, -1)}.${digits.slice(-1)}`;
            return { name: upper, description: `On for Clarion, version ${version} and later.` };
        }
        m = EXACT_VERSION.exec(upper);
        if (m) {
            return { name: upper, description: `On for Clarion version ${m[1]} specifically (the _VER_Cxx family — xx is a specific version number).` };
        }
        return null;
    }
}
