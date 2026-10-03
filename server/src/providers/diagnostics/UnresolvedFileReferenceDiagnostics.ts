import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { scanReferences } from '../../utils/UnresolvedReferences';

/**
 * #695 — an INCLUDE or MEMBER naming a file that cannot be found. Both fail the compile, compiler-
 * verified on C12: `Error(3): cif$fileopen NoSuchProg.CLW` for a MEMBER program (even when the
 * module uses nothing global), `Error(3): cif$fileopen NoSuchFile.inc` for an INCLUDE. Nothing
 * said so before a build. The references come from the
 * scanner the #687 report uses and are resolved by the file graph's resolver, so the check, the
 * report and the graph agree.
 *
 * Never flagged: a MODULE name (the Language Reference: for an external library it "may contain
 * any unique identifier"), a bare MEMBER() (names no program), and anything inside OMIT or
 * COMPILE (compiled only under some condition, if at all).
 */
export function validateUnresolvedFileReferences(
    document: TextDocument,
    filePath: string,
    resolve: (target: string, fromFile: string) => string | null,
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const ref of scanReferences(document.getText())) {
        if (ref.kind === 'MODULE' || ref.conditional) continue;
        if (resolve(ref.target, filePath)) continue;
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: Range.create(ref.line, ref.column, ref.line, ref.column + ref.target.length),
            message: ref.kind === 'MEMBER'
                ? `The program file '${ref.target}' named by MEMBER cannot be found. The compiler opens it, so the build will fail.`
                : `The file '${ref.target}' named by INCLUDE cannot be found. The compiler reads it in place, so the build will fail.`,
            source: 'clarion',
        });
    }
    return diagnostics;
}
