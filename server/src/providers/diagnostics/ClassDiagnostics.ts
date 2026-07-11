import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { DocumentStructure } from '../../DocumentStructure';
import { MemberLocatorService } from '../../services/MemberLocatorService';
import { makeTimeSlicer } from '../../utils/cooperativeScan';

/**
 * Warns when a CLASS declares `IMPLEMENTS(SomeInterface)` but does not provide an
 * implementation for one of the interface's methods — a silent interface-contract
 * violation. (#165 / #181.)
 *
 * Clarion interface model (verified against the docs + shipping LibSrc, e.g.
 * `CSocketConnection IMPLEMENTS(IConnection)` in abapi.inc / abapi.clw):
 *   - The interface's method prototypes live in the INTERFACE structure.
 *   - The implementing CLASS body does NOT re-declare them — it holds only the
 *     class's own methods/data.
 *   - The implementations are three-part `Class.Interface.Method PROCEDURE`
 *     definitions in the class's implementation module (`MODULE('x.clw')`).
 *
 * So this validator resolves, per class:
 *   - the required method set — each implemented interface's methods, found
 *     same-file or via the class file's INCLUDE chain
 *     (`MemberLocatorService.enumerateInterfaceMembersWithParamCounts`);
 *   - the provided implementations — three-part `Class.Interface.Method` defs in
 *     the class's MODULE, plus ancestor classes when the class derives from a
 *     base type (`MemberLocatorService.collectImplementedInterfaceMethodsIncludingAncestors`);
 * and warns for any interface method with no matching implementation.
 *
 * Conservative scope (no false positives — skip rather than guess):
 *   - Requires a resolvable implementation target (current file, MODULE target,
 *     or ancestor chain) and resolvable interface; if either can't be found, the
 *     class/interface is skipped.
 *   - Matching is by method NAME + parameter count (case-insensitive).
 */
export async function validateClassInterfaceImplementationAsync(
    tokens: Token[],
    document: TextDocument,
    memberLocator: MemberLocatorService,
    documentStructure?: DocumentStructure
): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    // #258: production callers (DiagnosticProvider) pass the CACHED structure — this
    // previously re-processed the shared token array on every validation cycle. The
    // build-from-passed-tokens fallback remains for direct callers (tests).
    let structure = documentStructure;
    if (!structure) {
        structure = new DocumentStructure(tokens);
        structure.process();
    }

    const classes = structure.getClasses();
    if (classes.length === 0) return diagnostics;

    const inlineAllowed = structure.getDocumentKind() !== undefined;

    // #297: per-class resolution walks include chains / modules cross-file — yield on a time
    // budget so a class-heavy file doesn't hold the LSP loop through the whole pass.
    const timeSlice = makeTimeSlicer();

    for (const cls of classes) {
        await timeSlice();
        const implemented = cls.implementedInterfaces;
        if (!implemented || implemented.length === 0) continue;

        const className = cls.label ?? cls.value;

        const implementedMethods = await memberLocator.collectImplementedInterfaceMethodsIncludingAncestors(
            className,
            document,
            inlineAllowed
        );
        if (implementedMethods === null) continue; // module unresolvable → skip

        for (const ifaceNameRaw of implemented) {
            const required = await memberLocator.enumerateInterfaceMembersWithParamCounts(ifaceNameRaw, document);
            if (required === null) continue; // interface unresolvable → skip

            for (const method of required) {
                const key = `${ifaceNameRaw.toLowerCase()}.${method.name.toLowerCase()}#${method.paramCount}`;
                if (implementedMethods.has(key)) continue;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: cls.line, character: cls.start },
                        end: { line: cls.line, character: cls.start + cls.value.length },
                    },
                    message: `CLASS '${className}' implements '${ifaceNameRaw}' but does not implement method '${ifaceNameRaw}.${method.name}' (expected '${className}.${ifaceNameRaw}.${method.name} PROCEDURE')`,
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
