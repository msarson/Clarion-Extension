import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateClassInterfaceImplementationAsync } from '../providers/diagnostics/ClassDiagnostics';

/**
 * #807 end to end, in the reported layout: a version file chooses which version-specific interface
 * file is INCLUDEd (each with ,ONCE). The 411 and 520 interfaces declare the same method with
 * different parameters; the class implements the 520 one. Following every INCLUDE, the 411
 * interface (the first reached) was taken, and the class was told it does not implement it.
 */
suite('#807 — the version chosen by a COMPILE block is the one the checks read', () => {
    let dir: string;
    setup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e807-'));
        const w = (name: string, lines: string[]) => fs.writeFileSync(path.join(dir, name), lines.join('\r\n'));
        w('LibXLVer.INC', ['LibXL:Version  EQUATE(520)']);
        w('LibXL.INC', [
            "  INCLUDE('LibXLVer.INC'),ONCE",
            "  COMPILE ('###', LibXL:Version = 411)",
            "     INCLUDE('LibXL.411.INT'),ONCE",
            '! ###',
            "  COMPILE ('###', LibXL:Version = 520)",
            "     INCLUDE('LibXL.520.INT'),ONCE",
            '! ###',
        ]);
        w('LibXL.411.INT', ['XL                  INTERFACE', 'Foo                   PROCEDURE(LONG a)', '                    END']);
        w('LibXL.520.INT', ['XL                  INTERFACE', 'Foo                   PROCEDURE(LONG a, LONG b)', '                    END']);
    });
    teardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('bug-pin: the class implementing the 520 interface is not warned', async () => {
        const main = path.join(dir, 'Main.clw');
        const text = [
            '  PROGRAM',
            "  INCLUDE('LibXL.INC'),ONCE",
            '  MAP',
            '  END',
            'XLClass             CLASS,TYPE,IMPLEMENTS(XL)',
            '                    END',
            '  CODE',
            '  RETURN',
            'XLClass.XL.Foo      PROCEDURE(LONG a, LONG b)',
            '  CODE',
            '  RETURN',
        ].join('\r\n');
        fs.writeFileSync(main, text);
        const doc = TextDocument.create(pathToFileURL(main).toString(), 'clarion', 1, text);
        const d = await validateClassInterfaceImplementationAsync(TokenCache.getInstance().getTokens(doc), doc, new MemberLocatorService());
        assert.deepStrictEqual(d.map(x => String(x.message)), []);
    });
});
