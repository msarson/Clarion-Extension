import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { DocumentStructure } from '../../DocumentStructure';
import { MemberLocatorService } from '../../services/MemberLocatorService';

/** Extracts the filename from a `MODULE('x.clw')` attribute on a declaration line. */
function extractModuleAttribute(lineText: string): string | undefined {
    const m = lineText.match(/MODULE\s*\(\s*'([^']+)'\s*\)/i);
    return m ? m[1] : undefined;
}

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
 *     (`MemberLocatorService.enumerateInterfaceMembers`);
 *   - the provided implementations — three-part `Class.Interface.Method` defs in
 *     the class's MODULE (`MemberLocatorService.collectImplementedInterfaceMethods`);
 * and warns for any interface method with no matching implementation.
 *
 * Conservative scope (no false positives — skip rather than guess):
 *   - Only non-derived `CLASS,IMPLEMENTS`. Derived `CLASS(Parent),IMPLEMENTS`
 *     classes may inherit implementations from an ancestor (the compiler stubs
 *     unimplemented methods to the parent), so they are skipped — un-skipping
 *     with ancestor resolution is a follow-up (#181 item 2).
 *   - Requires a resolvable `MODULE('x.clw')` and resolvable interface; if either
 *     can't be found, the class/interface is skipped.
 *   - Matching is by method NAME (case-insensitive); parameter/overload
 *     discrimination is a follow-up (#181 item 3).
 */
export async function validateClassInterfaceImplementationAsync(
    tokens: Token[],
    document: TextDocument,
    memberLocator: MemberLocatorService
): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    const structure = new DocumentStructure(tokens);
    structure.process();

    const classes = structure.getClasses();
    if (classes.length === 0) return diagnostics;

    const docLines = document.getText().split(/\r?\n/);

    for (const cls of classes) {
        const implemented = cls.implementedInterfaces;
        if (!implemented || implemented.length === 0) continue;

        // Skip classes that derive from a base class — `CLASS(Parent)` has `(`
        // immediately after the CLASS keyword (vs `CLASS,IMPLEMENTS` with a comma).
        // A missing method may be inherited from the parent (#181 item 2).
        const idx = tokens.indexOf(cls);
        if (idx >= 0 && tokens[idx + 1]?.value === '(') continue;

        const className = cls.label ?? cls.value;

        // Locate the implementations. Interface methods are implemented as
        // three-part `Class.Interface.Method PROCEDURE` defs, either:
        //   - in the class's MODULE('x.clw') (the separately-compiled pattern), or
        //   - in THIS file, when the class is declared + implemented inline in a
        //     PROGRAM/MEMBER source with no MODULE attribute.
        // A declaration-only `.inc` with no MODULE (getDocumentKind undefined)
        // has its impls in an unknown module → skip rather than false-positive.
        const moduleFile = extractModuleAttribute(docLines[cls.line] ?? '');
        let implementedMethods: Set<string> | null;
        if (moduleFile) {
            implementedMethods = await memberLocator.collectImplementedInterfaceMethods(
                className, moduleFile, document
            );
        } else if (structure.getDocumentKind() !== undefined) {
            implementedMethods = memberLocator.collectImplementedInterfaceMethodsFromTokens(
                tokens, className
            );
        } else {
            continue;
        }
        if (implementedMethods === null) continue; // module unresolvable → skip

        for (const ifaceNameRaw of implemented) {
            const required = await memberLocator.enumerateInterfaceMembers(ifaceNameRaw, document);
            if (required === null) continue; // interface unresolvable → skip

            const ifaceLower = ifaceNameRaw.toLowerCase();
            for (const methodName of required) {
                if (implementedMethods.has(`${ifaceLower}.${methodName.toLowerCase()}`)) continue;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: cls.line, character: cls.start },
                        end: { line: cls.line, character: cls.start + cls.value.length },
                    },
                    message: `CLASS '${className}' implements '${ifaceNameRaw}' but does not implement method '${ifaceNameRaw}.${methodName}' (expected '${className}.${ifaceNameRaw}.${methodName} PROCEDURE')`,
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
