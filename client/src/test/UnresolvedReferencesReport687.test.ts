import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { renderUnresolvedReport, UnresolvedReportData } from '../views/UnresolvedReferencesReport';

/**
 * #687 (experimental) — the unresolved file references report: the server's findings rendered as a
 * page, missing INCLUDEs first, then MEMBERs, with MODULE names (possibly external libraries, per the
 * Language Reference) and conditional ones folded away; each row opens the reference.
 */
const entry = (over: Partial<UnresolvedReportData['references'][number]>) => ({
    kind: 'INCLUDE' as const, target: 'gone.inc', line: 4, conditional: false, classModule: false, dll: false,
    file: 'c:/app/main.clw', category: 'missing' as const, inProject: true, ...over,
});
const data = (over: Partial<UnresolvedReportData> = {}): UnresolvedReportData => ({
    built: true, filesScanned: 120, ms: 850, projectSources: [], references: [], ...over,
});

suite('Unresolved file references report page (#687)', () => {
    test('summary counts each category; MODULE names are not counted as problems', () => {
        const html = renderUnresolvedReport(data({ references: [
            entry({}), entry({ category: 'conditional' }), entry({ category: 'member', kind: 'MEMBER', target: 'prog' }),
            entry({ category: 'module', kind: 'MODULE', target: 'Win32' }), entry({ category: 'module', kind: 'MODULE', target: 'fe.clw' }),
        ] }), 'N', 'csp');
        assert.match(html, /120 files scanned in 0\.9 s/);
        assert.match(html, /1 missing include,/);
        assert.match(html, /1 MEMBER program not found/);
        assert.match(html, /2 MODULE names without a source file \(may be external libraries\)/);
        assert.match(html, /1 conditional/);
    });

    test('bug-pin: a MODULE name with an extension is not reported as missing', () => {
        const html = renderUnresolvedReport(data({ references: [entry({ category: 'module', kind: 'MODULE', classModule: true, target: 'fe.clw' })] }), 'N', 'csp');
        assert.match(html, /0 missing includes/);
        assert.match(html, /<details><summary>MODULE names without a source file \(1\)/);
        assert.match(html, /any unique identifier/, 'says why, from the Language Reference');
    });

    test('a MODULE row shows its LINK and DLL attributes', () => {
        const html = renderUnresolvedReport(data({ references: [
            entry({ category: 'module', kind: 'MODULE', classModule: true, target: 'x.clw', link: 'xlib.lib', dll: true }),
        ] }), 'N', 'csp');
        assert.match(html, /<td>LINK\(&#39;xlib\.lib&#39;\), DLL<\/td>/);
    });

    test('MEMBER names a program file not found get their own section', () => {
        const html = renderUnresolvedReport(data({ references: [entry({ category: 'member', kind: 'MEMBER', target: 'prog' })] }), 'N', 'csp');
        assert.match(html, /<h2>MEMBER: program file not found \(1\)<\/h2>/);
    });

    test('missing includes are split by solution sources and other files, and rows open the line', () => {
        const html = renderUnresolvedReport(data({ references: [
            entry({ file: 'c:/app/main.clw', inProject: true }),
            entry({ file: 'c:/clarion/libsrc/x.inc', inProject: false, target: 'y.inc', line: 9 }),
        ] }), 'N', 'csp');
        const own = html.indexOf('Missing includes: in the solution&#39;s source files');
        const other = html.indexOf('Missing includes: in included and library files');
        assert.ok(own >= 0 && other > own);
        assert.match(html, /<tr data-file="c:\/app\/main\.clw" data-line="4">/);
        assert.match(html, /<td>5<\/td>/, 'lines are shown 1-based');
    });

    test('conditional and MODULE entries are folded away', () => {
        const html = renderUnresolvedReport(data({ references: [
            entry({ category: 'conditional' }), entry({ category: 'module', kind: 'MODULE', target: 'Win32' }),
        ] }), 'N', 'csp');
        assert.match(html, /<details><summary>Inside OMIT or COMPILE blocks \(1\)/);
        assert.match(html, /<details><summary>MODULE names without a source file \(1\)/);
    });

    test('project sources that could not be found come first', () => {
        const html = renderUnresolvedReport(data({ projectSources: ['App/missing.clw'], references: [entry({})] }), 'N', 'csp');
        assert.ok(html.indexOf('App/missing.clw') < html.indexOf('gone.inc'));
    });

    test('names are escaped', () => {
        const html = renderUnresolvedReport(data({ references: [entry({ target: '<b>x</b>' })] }), 'N', 'csp');
        assert.ok(!html.includes('<b>x</b>'));
        assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
    });

    test('an unbuilt graph says so', () => {
        assert.match(renderUnresolvedReport(data({ built: false }), 'N', 'csp'), /has not been built yet/);
    });

    test('the command is contributed and the Graph row opens it', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'client', 'src', 'views', 'SolutionToolbarProvider.ts'))) dir = path.dirname(dir);
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        assert.ok(pkg.contributes.commands.some((c: { command: string }) => c.command === 'clarion.unresolvedReferencesReport'));
        const toolbar = fs.readFileSync(path.join(dir, 'client', 'src', 'views', 'SolutionToolbarProvider.ts'), 'utf8');
        assert.match(toolbar, /label: 'Graph'[^\n]*command: 'unresolvedReport'/);
        assert.match(toolbar, /case 'unresolvedReport':/);
    });
});
