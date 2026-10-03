import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { RenameProvider } from '../providers/RenameProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

/**
 * #551 — the Clarion IDE writes <Generated>true</Generated> on EVERY <Compile> entry a
 * template adds to a project, including third-party class sources it merely links
 * (NYSTemplateHelper.CLW under Accessory\libsrc\win on the real solution). The flag means
 * "a template put this file in the project", not "a template wrote it". Rename read the
 * flag alone and refused F2 in the accessory's implementation as generated code, while
 * the same method was renameable from its declaration in the .inc (no Compile entry, no
 * flag).
 *
 * Generated means template OUTPUT. A file under a library path is library source however
 * the .cwproj flags it.
 */
suite('A library file flagged Generated in the .cwproj is not generated code (#551)', () => {

    let dir: string;
    let libDir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[];
    const docs = new Map<string, TextDocument>();

    const PROC = (name: string) => [`${name} PROCEDURE()`, 'x LONG', '  CODE', '  x = 1', '  RETURN'].join('\r\n');

    setup(() => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename551-'));
        libDir = path.join(dir, 'libsrc');
        fs.mkdirSync(libDir);
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();

        const project = new ClarionProjectServer('app1', 'app', dir, '{APP1-551}');
        const add = (file: string, relativePath: string, content: string) => {
            fs.writeFileSync(file, content);
            const sf = new ClarionSourcerFileServer(path.basename(file), relativePath, project);
            sf.generated = true; // both flagged, as the IDE does
            project.sourceFiles.push(sf);
            const doc = TextDocument.create(`file:///${file.replace(/\\/g, '/')}`, 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(path.basename(file), doc);
        };
        add(path.join(dir, 'gen.clw'), 'gen.clw', PROC('GenProc'));
        // The accessory file: listed by the project, resolved (via redirection) to the library folder.
        add(path.join(libDir, 'lib.clw'), path.join(libDir, 'lib.clw'), PROC('LibProc'));

        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => dir,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        serverSettings.libsrcPaths = [libDir];
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        serverSettings.libsrcPaths = savedLibsrc;
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('bug-pin: a flagged file under a library path is renameable', async () => {
        const range = await new RenameProvider().prepareRename(docs.get('lib.clw')!, { line: 0, character: 2 });
        assert.ok(range, 'the rename box opens: library source is not template output');
    });

    test('control: a flagged file in the project folder is still refused as generated', async () => {
        await assert.rejects(
            () => new RenameProvider().prepareRename(docs.get('gen.clw')!, { line: 0, character: 2 }),
            (err: Error) => /generated/i.test(err.message) && /gen\.clw/i.test(err.message)
        );
    });
});
