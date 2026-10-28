/**
 * Shared utility for parsing and comparing procedure/method signatures
 * Used for overload resolution in both class methods and MAP procedures
 */

import LoggerManager from '../logger';
import { DeclaredValueParser } from '../tokenizer/DeclaredValueParser';

const logger = LoggerManager.getLogger("ProcedureSignatureUtils");
logger.setLevel("error");

export class ProcedureSignatureUtils {
    /**
     * Extracts parameter types from a procedure/method signature
     * Returns array of normalized parameter types (e.g., ['STRING', '*STRING', 'LONG'])
     * Handles both traditional format (with PROCEDURE/FUNCTION keyword) and shorthand MAP format
     */
    public static extractParameterTypes(signature: string): string[] {
        // Extract just the type from each parameter (remove variable names and defaults)
        return this.splitParameters(signature).map(param => this.extractParameterType(param));
    }

    /** A signature's parameters as written, split at depth-0 commas. */
    private static splitParameters(signature: string): string[] {
        // Try with PROCEDURE/FUNCTION keyword first
        let match = signature.match(/(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i);
        
        // If no match, try shorthand MAP format: ProcName(params) or ProcName(params),ReturnType
        if (!match) {
            match = signature.match(/^\s*\w+\s*\(([^)]*)\)/);
        }
        
        if (!match) return [];
        
        const paramList = match[1].trim();
        if (paramList === '') return [];
        
        // Split by commas at depth 0 (respecting nested parens and angle brackets)
        const params: string[] = [];
        let currentParam = '';
        let depth = 0;
        let angleDepth = 0;
        
        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];
            
            if (char === '(') {
                depth++;
                currentParam += char;
            } else if (char === ')') {
                depth--;
                currentParam += char;
            } else if (char === '<') {
                angleDepth++;
                currentParam += char;
            } else if (char === '>') {
                angleDepth--;
                currentParam += char;
            } else if (char === ',' && depth === 0 && angleDepth === 0) {
                params.push(currentParam.trim());
                currentParam = '';
            } else {
                currentParam += char;
            }
        }
        
        if (currentParam.trim()) {
            params.push(currentParam.trim());
        }

        return params;
    }
    
    /**
     * Extracts the type from a single parameter string
     * Examples:
     *   "STRING s" -> "STRING"
     *   "*STRING pStr" -> "*STRING"
     *   "<LONG lOpt>" -> "LONG"
     *   "LONG lVal=0" -> "LONG"
     *   "&STRING sRef" -> "&STRING"
     */
    private static extractParameterType(param: string): string {
        // Remove angle brackets for omittable parameters
        let normalized = param.replace(/^<\s*/, '').replace(/\s*>$/, '');
        
        // Remove default values (=something)
        normalized = normalized.replace(/\s*=.+$/, '');
        
        // Strip CONST and REF qualifiers (prototype-only modifiers, not part of the type)
        normalized = normalized.replace(/\bCONST\s+/gi, '').replace(/\bREF\s+/gi, '');
        
        // Extract type - everything before the last word (which is the variable name)
        // Handle special cases like *STRING, &STRING, etc.
        const words = normalized.trim().split(/\s+/);
        
        if (words.length === 0) return '';
        if (words.length === 1) return words[0].toUpperCase();
        
        // If last word is a valid type, it's the type (no variable name given)
        // Otherwise, everything except last word is the type
        const lastWord = words[words.length - 1];

        // #130 — if the last word starts with a letter, treat it as the
        // variable name. The previous heuristic also required mixed-case
        // OR length > 1 to "protect single-letter all-uppercase TYPES"
        // (e.g. `LONG X` was read as a 2-word type), but the probe (Alice
        // 2026-05-14) found that defensive case is hypothetical: Clarion
        // has no single-letter scalar types — see the enumerations at
        // `MethodOverloadResolver.ts:1066-1076` (`isStringType` / `isNumericType`)
        // which list every built-in scalar (STRING/CSTRING/PSTRING/ASTRING/
        // LONG/SHORT/BYTE/ULONG/USHORT/SIGNED/UNSIGNED/REAL/SREAL/DECIMAL/
        // PDECIMAL/DATE/TIME), all multi-letter. User-defined single-letter
        // types in no-name param shapes hit the `words.length === 1` branch
        // above. `LONG X` / `STRING N` / `BYTE I` are now correctly read.
        //
        // Substrate-symmetric to the same fix landed at
        // `MethodOverloadResolver.ts:679` in the same #130 commit — Eve's
        // peer-GREEN gate-4 flex into substrate-symmetry caught the parallel
        // implementation; expanded inline per
        // `feedback_substrate_surprise_in_scope`.
        if (lastWord.match(/^[a-z]/i)) {
            // Last word is likely variable name, rest is type
            return words.slice(0, -1).join(' ').toUpperCase();
        }

        // All words are the type
        return words.join(' ').toUpperCase();
    }
    
    /**
     * #793 — the parameter types of an IMPLEMENTATION line (`Name PROCEDURE(...)` that defines
     * the procedure). There a parameter's type is optional and its label required (Language
     * Reference, PROCEDURE: "the data type of each parameter (optional) followed by the label"),
     * so a one-word parameter is a label, returned as '' — it matches any type. A one-word
     * built-in type (`PROCEDURE(LONG)`) is still read as that type. A prototype's one-word
     * parameter is its type: use extractParameterTypes for prototypes.
     */
    public static extractImplementationParameterTypes(signature: string, overloaded = false): string[] {
        // An overloaded procedure's definition must carry its types: with Test (LONG) and
        // Test (*STRING), Clarion reads `Test PROCEDURE (q)` as type Q and finds no prototype
        // (compiler-verified, Clarion 10 and 12). So the label-only reading is for one prototype.
        if (overloaded) return this.extractParameterTypes(signature);
        const params = this.splitParameters(signature);
        return params.map(param => {
            const bare = param.replace(/^<\s*/, '').replace(/\s*>$/, '').replace(/\s*=.+$/, '')
                .replace(/\bCONST\s+/gi, '').replace(/\bREF\s+/gi, '').trim();
            const isLabelOnly = /^[A-Za-z_][\w:]*$/.test(bare) && !this.BUILTIN_TYPES.has(bare.toUpperCase());
            return isLabelOnly ? '' : this.extractParameterType(param);
        });
    }

    /** Built-in type names a one-word implementation parameter can be (#793): anything else is a label. */
    private static readonly BUILTIN_TYPES = new Set([
        'STRING', 'CSTRING', 'PSTRING', 'ASTRING', 'BSTRING', 'USTRING',
        'LONG', 'SHORT', 'BYTE', 'ULONG', 'USHORT', 'SIGNED', 'UNSIGNED',
        'REAL', 'SREAL', 'BFLOAT4', 'BFLOAT8', 'DECIMAL', 'PDECIMAL',
        'DATE', 'TIME', 'BOOL', 'ANY', 'VARIANT',
        'GROUP', 'QUEUE', 'FILE', 'KEY', 'INDEX', 'VIEW', 'WINDOW', 'REPORT', 'BLOB', 'MEMO',
    ]);

    /**
     * Compares two parameter type arrays to see if they match
     * Handles reference indicators like *, &, etc. '' in either list matches any type: an
     * implementation parameter given by its label only (#793).
     */
    public static parametersMatch(implParams: string[], declParams: string[]): boolean {
        if (implParams.length !== declParams.length) {
            return false;
        }

        for (let i = 0; i < implParams.length; i++) {
            const implType = implParams[i];
            const declType = declParams[i];
            if (implType === '' || declType === '') continue;

            // Normalize for comparison (remove extra spaces)
            const normalizedImpl = this.normalizeComplexRef(implType.replace(/\s+/g, ' ').trim());
            const normalizedDecl = this.normalizeComplexRef(declType.replace(/\s+/g, ' ').trim());

            if (normalizedImpl !== normalizedDecl) {
                return false;
            }
        }

        return true;
    }

    /** Built-in scalar types, mirroring MethodOverloadResolver.isStringType/isNumericType.
     *  For scalars `*X` ≠ `X` is a real overload discriminator (by-ref vs by-value). */
    private static readonly SCALAR_TYPES = new Set([
        'STRING', 'CSTRING', 'PSTRING', 'ASTRING',
        'LONG', 'SHORT', 'BYTE', 'ULONG', 'USHORT', 'SIGNED', 'UNSIGNED',
        'REAL', 'SREAL', 'BFLOAT4', 'BFLOAT8', 'DECIMAL', 'PDECIMAL',
        'DATE', 'TIME', 'BOOL',
    ]);

    /**
     * #248 (Rule 6, mirroring MethodOverloadResolver.extractParameterType): `*` is
     * implicit for COMPLEX types — `*GroupType` ≡ `GroupType` (complex params are
     * by-reference even without the `*`), so the two spellings are ONE overload.
     * Scalar `*STRING` ≠ `STRING` is preserved (a genuine by-ref discriminator).
     * Previously only MethodOverloadResolver applied this, so the two signature
     * matchers disagreed about whether such decl/impl pairs were the same overload.
     */
    private static normalizeComplexRef(type: string): string {
        if (!type.startsWith('*')) return type;
        const base = type.slice(1).trim();
        // Strip size args for the scalar check: *CSTRING(20) is still scalar.
        const baseName = (base.split('(')[0] ?? '').trim().toUpperCase();
        if (baseName && !this.SCALAR_TYPES.has(baseName)) {
            return base;
        }
        return type;
    }
    
    /**
     * Finds the span of the parameter list "(…)" in a procedure line.
     * Returns {start, end} where end is exclusive (index after the closing paren).
     * Handles nested parens and single-quoted strings so that
     * e.g. PROCEDURE(*STRING s='(ok)') is parsed correctly.
     */
    public static findParameterListSpan(line: string): { start: number; end: number } | null {
        let parenStart = -1;
        let inQuote = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === "'") { inQuote = !inQuote; }
            else if (!inQuote && ch === '(') { parenStart = i; break; }
        }

        if (parenStart === -1) return null;

        let depth = 1;
        inQuote = false;
        let i = parenStart + 1;

        while (i < line.length && depth > 0) {
            const ch = line[i];
            if (ch === "'") { inQuote = !inQuote; }
            else if (!inQuote) {
                if (ch === '(') depth++;
                else if (ch === ')') depth--;
            }
            i++;
        }

        if (depth !== 0) return null; // unbalanced
        return { start: parenStart, end: i };
    }

    /**
     * True when the MAP prototype starting at `lines[line]` carries PRIVATE (#480, #481).
     * Follows `|` continuations, since a long attribute tail is often wrapped, and
     * ignores comments so a `! PRIVATE` note does not count. Only the attribute tail
     * after the parameter list is read, so a parameter named Private cannot match.
     */
    public static isPrivatePrototype(lines: string[], line: number): boolean {
        let prototype = '';
        for (let i = line; i < lines.length; i++) {
            const code = DeclaredValueParser.stripTrailingComment(lines[i]).trimEnd();
            if (!code.endsWith('|')) { prototype += code; break; }
            prototype += code.slice(0, -1) + ' ';
        }
        const span = this.findParameterListSpan(prototype);
        const attributes = span ? prototype.slice(span.end) : prototype;
        return attributes.split(',').some(part => part.trim().toUpperCase() === 'PRIVATE');
    }

    /**
     * Replaces the "(…)" parameter list in a line with newParamList.
     * Everything before "(" and after ")" (e.g. return type, attributes) is preserved.
     */
    public static replaceParameterList(line: string, newParamList: string): string {
        const span = this.findParameterListSpan(line);
        if (!span) return line;
        return line.slice(0, span.start) + newParamList + line.slice(span.end);
    }

    /**
     * Extracts the raw "(…)" parameter list string from a procedure line.
     * Returns "()" if no parameter list is found.
     * Does NOT strip return types or attributes — only the paren-delimited part.
     */
    public static extractRawParameterList(line: string): string {
        const span = this.findParameterListSpan(line);
        if (!span) return '()';
        return line.slice(span.start, span.end);
    }

    /**
     * Counts parameters in a procedure/method signature
     * Handles omittable parameters like <LONG SomeVar> and default values LONG SomeVar=1
     * Handles both traditional format (with PROCEDURE/FUNCTION keyword) and shorthand MAP format
     */
    public static countParameters(signature: string): number {
        // Try with PROCEDURE/FUNCTION keyword first
        let match = signature.match(/(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i);
        
        // If no match, try shorthand MAP format: ProcName(params) or ProcName(params),ReturnType
        if (!match) {
            match = signature.match(/^\s*\w+\s*\(([^)]*)\)/);
        }
        
        if (!match) return 0;
        
        const paramList = match[1].trim();
        if (paramList === '') return 0;
        
        // Count commas at depth 0 (respecting nested parens and angle brackets)
        let count = 1; // Start at 1 if there's any content
        let depth = 0;
        let angleDepth = 0;
        
        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];
            
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            } else if (char === '<') {
                angleDepth++;
            } else if (char === '>') {
                angleDepth--;
            } else if (char === ',' && depth === 0 && angleDepth === 0) {
                count++;
            }
        }

        return count;
    }

    /**
     * #825 — the parameter `word` names in the PROCEDURE/FUNCTION header starting at
     * `procedureLine`, following `|` continuation lines: a parameter declared on a continued
     * line is a parameter. `getLine(n)` returns line n of the source (undefined past the end).
     * A prefixed parameter (`LOC:test`) also matches its bare name. The returned position is
     * the line and column of the parameter's name; `type` keeps a `*`/`&` and a colon type
     * (`*HTTP:Query`); `declaration` is the parameter's text without `<` `>`.
     */
    public static findHeaderParameter(
        getLine: (line: number) => string | undefined,
        procedureLine: number,
        word: string
    ): { name: string; type: string; declaration: string; line: number; character: number } | null {
        // The header as one string; segments map an offset in it back to a line and column.
        let header = '';
        const segments: { line: number; offset: number }[] = [];
        for (let i = procedureLine; i < procedureLine + 100; i++) {
            const raw = getLine(i);
            if (raw === undefined) break;
            const code = DeclaredValueParser.stripTrailingComment(raw.replace(/\r$/, '')).trimEnd();
            segments.push({ line: i, offset: header.length });
            if (!code.endsWith('|')) { header += code; break; }
            header += code.slice(0, -1) + '  ';
        }

        const match = /(?:PROCEDURE|FUNCTION)\s*\((.*?)\)/i.exec(header); // #247
        if (!match || !match[1]) return null;

        const wordLower = word.toLowerCase();
        let column = match.index + match[0].indexOf('(') + 1;
        for (const param of match[1].split(',')) {
            const stripped = param.trim().replace(/^<(.*)>$/, '$1').trim();
            // [*&]? TYPE NAME [= default]; TYPE may carry a prefix (*HTTP:Query), NAME may be prefixed (LOC:test)
            const m = stripped.match(/([*&]?\s*[\w:]+)\s+([A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?)(?:\s*=.*)?$/i);
            if (m) {
                const name = m[2];
                const nameLower = name.toLowerCase();
                if (nameLower === wordLower || nameLower.endsWith(':' + wordLower)) {
                    // The name as a whole word, so a type ending in the same word (HTTP:Query Query) is skipped.
                    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const at = param.search(new RegExp(`(?<![\\w:])${escaped}(?![\\w:])`, 'i'));
                    const offset = column + Math.max(at, 0);
                    let seg = segments[0];
                    for (const s of segments) { if (s.offset <= offset) seg = s; else break; }
                    return {
                        name,
                        type: m[1].trim(),
                        declaration: stripped,
                        line: seg.line,
                        character: offset - seg.offset,
                    };
                }
            }
            column += param.length + 1; // +1 for the comma
        }
        return null;
    }
}
