import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ResponseError } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { RenameProvider } from '../providers/RenameProvider';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

/**
 * #547 — F2 on `Obj.Method()` where the class is declared in a library include
 * (Noyantis' TemplateHelperClass under Accessory\libsrc\win on the real solution) was
 * refused with "symbol not found or not renameable". Refusing is right — the
 * declaration is outside the solution, compiled into a DLL — but the reason is wrong:
 * the per-file symbol finder cannot see through the object to a library class, and
 * the references fallback finds nothing, so the generic refusal fired.
 *
 * The pre-flight now resolves a dotted method through the class first and, when the
 * declaring file is under a library path, names it.
 */
suite('Rename of a method declared in a library file names the file (#547)', () => {

    let dir: string;
    let libDir: string;
    let savedLibsrc: string[];
    const indexer = StructureDeclarationIndexer.getInstance();

    const INC = [
        "LibThing CLASS,TYPE,MODULE('libthing.clw'),LINK('libthing.clw')",
        'Method     PROCEDURE()',
        '         END',
    ].join('\r\n');

    const program = (includeName: string) => [
        '  PROGRAM',                       // 0
        `  INCLUDE('${includeName}'),ONCE`, // 1
        '  MAP',                           // 2
        '  END',                           // 3
        'Obj  CLASS(LibThing)',            // 4
        '     END',                        // 5
        '  CODE',                          // 6
        '  Obj.Method()',                  // 7
        '  RETURN',                        // 8
    ].join('\r\n');

    const open = (file: string): TextDocument => {
        const doc = TextDocument.create(`file:///${file.replace(/\\/g, '/')}`, 'clarion', 1, fs.readFileSync(file, 'utf8'));
        TokenCache.getInstance().getTokens(doc);
        return doc;
    };

    setup(() => {
        setServerInitialized(true);
        savedLibsrc = serverSettings.libsrcPaths;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename547-'));
        libDir = path.join(dir, 'libsrc');
        fs.mkdirSync(libDir);
        indexer.clearCache();
    });
    teardown(async () => {
        await (indexer as unknown as { runDeferredValidations(): Promise<void> }).runDeferredValidations();
        serverSettings.libsrcPaths = savedLibsrc;
        indexer.clearCache();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('bug-pin: the refusal names the library include, not "symbol not found"', async () => {
        fs.writeFileSync(path.join(libDir, 'libthing.inc'), INC);
        const main = path.join(dir, 'main.clw');
        fs.writeFileSync(main, program('libthing.inc'));
        serverSettings.libsrcPaths = [libDir];
        await indexer.buildIndex(dir);

        const doc = open(main);
        let error: ResponseError<unknown> | undefined;
        try { await new RenameProvider().prepareRename(doc, { line: 7, character: 8 }); }
        catch (e) { error = e as ResponseError<unknown>; }
        assert.ok(error, 'the rename must be refused');
        assert.ok(/libthing\.inc/i.test(error!.message), `must name the declaring file; got: ${error!.message}`);
        assert.ok(/library/i.test(error!.message), `must say it is a library file; got: ${error!.message}`);
        assert.ok(!/symbol not found/i.test(error!.message), `must not be the generic refusal; got: ${error!.message}`);
    });

    test('control: the same method declared in the solution folder is still renameable', async () => {
        fs.writeFileSync(path.join(dir, 'libthing.inc'), INC);
        const main = path.join(dir, 'main.clw');
        fs.writeFileSync(main, program('libthing.inc'));
        serverSettings.libsrcPaths = [];
        await indexer.buildIndex(dir);

        const range = await new RenameProvider().prepareRename(open(main), { line: 7, character: 8 });
        assert.ok(range, 'a range means the rename box opens');
        assert.deepStrictEqual([range!.start.line, range!.start.character], [7, 6], 'the range is the method segment only');
    });
});
