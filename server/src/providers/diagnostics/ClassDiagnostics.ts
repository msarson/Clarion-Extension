import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { DocumentStructure } from '../../DocumentStructure';

/**
 * Warns when a CLASS declares `IMPLEMENTS(SomeInterface)` but does not declare
 * one of the interface's methods — a silent interface-contract violation. (#165)
 *
 * v1 scope (same-file, synchronous):
 *   - The INTERFACE must be declared in the SAME document. Cross-file include-chain
 *     resolution is a deferred follow-up: the available substrate
 *     (`MemberLocatorService.findMemberInInterface`) is a single-method lookup, not
 *     an enumerator, so cross-file method enumeration needs new substrate.
 *   - Classes that derive from a base class (`CLASS(Parent),IMPLEMENTS(...)`) are
 *     skipped — a missing method may be inherited from the parent, and a false
 *     positive there is worse than the false negative. Resolving inherited methods
 *     is a follow-up.
 *   - Matching is by method NAME (case-insensitive); parameter-signature /
 *     overload discrimination is a refinement.
 */
export function validateClassInterfaceImplementation(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const structure = new DocumentStructure(tokens);
    structure.process();

    const interfaces = structure.getInterfaces();
    const classes = structure.getClasses();
    if (interfaces.length === 0 || classes.length === 0) return diagnostics;

    // Lines that contain a PROCEDURE/FUNCTION keyword — used to distinguish method
    // declarations (label + PROCEDURE on the same line) from plain data members.
    const procLines = new Set<number>();
    for (const t of tokens) {
        const v = t.value.toUpperCase();
        if (v === 'PROCEDURE' || v === 'FUNCTION') procLines.add(t.line);
    }

    // Collect the directly-declared method names inside a structure block.
    const collectMethodNames = (struct: Token): Set<string> => {
        const names = new Set<string>();
        if (struct.finishesAt === undefined) return names;
        for (const t of tokens) {
            if (t.line <= struct.line || t.line >= struct.finishesAt) continue;
            if (t.start !== 0 || t.type !== TokenType.Label) continue;
            if (procLines.has(t.line)) names.add(t.value.toUpperCase());
        }
        return names;
    };

    // Map interface name (UPPER) → set of its method names (UPPER), for interfaces
    // declared in THIS document.
    const interfaceMethods = new Map<string, Set<string>>();
    for (const iface of interfaces) {
        if (!iface.label) continue;
        interfaceMethods.set(iface.label.toUpperCase(), collectMethodNames(iface));
    }

    for (const cls of classes) {
        const implemented = cls.implementedInterfaces;
        if (!implemented || implemented.length === 0) continue;

        // Skip classes that derive from a base class — `CLASS(Parent)` has `(`
        // immediately after the CLASS keyword (vs `CLASS,IMPLEMENTS` with a comma).
        const idx = tokens.indexOf(cls);
        if (idx >= 0 && tokens[idx + 1]?.value === '(') continue;

        const classMethods = collectMethodNames(cls);

        for (const ifaceNameRaw of implemented) {
            const ifaceName = ifaceNameRaw.toUpperCase();
            const required = interfaceMethods.get(ifaceName);
            if (!required) continue; // interface not in this file — deferred (cross-file) scope

            for (const methodName of required) {
                if (classMethods.has(methodName)) continue;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: cls.line, character: cls.start },
                        end: { line: cls.line, character: cls.start + cls.value.length },
                    },
                    message: `CLASS '${cls.label ?? cls.value}' does not implement method '${methodName}' required by interface '${ifaceNameRaw}'`,
                    source: 'clarion',
                    code: 'unimplemented-interface-method',
                });
            }
        }
    }

    return diagnostics;
}

export function validateClassProperties(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== TokenType.Structure) continue;

        const structureType = token.value.toUpperCase();

        if (structureType === 'CLASS' && token.children) {
            for (const child of token.children) {
                if (child.type === TokenType.Structure && child.value.toUpperCase() === 'QUEUE') {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: { line: child.line, character: child.start },
                            end: { line: child.line, character: child.start + child.value.length }
                        },
                        message: 'QUEUE structures are not allowed as direct CLASS properties. Use a QUEUE reference (&QUEUE) instead.',
                        source: 'clarion'
                    });
                }
            }
        }

        if (structureType === 'QUEUE' && token.children) {
            for (const child of token.children) {
                if (child.type === TokenType.Structure && child.value.toUpperCase() === 'QUEUE') {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: { line: child.line, character: child.start },
                            end: { line: child.line, character: child.start + child.value.length }
                        },
                        message: 'QUEUE structures cannot be nested inside other QUEUE structures. Use a QUEUE reference (&QUEUE) instead.',
                        source: 'clarion'
                    });
                }
            }
        }
    }

    return diagnostics;
}
