import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildConfigDirArg, formatBuildHeader } from '../utils/ClarionBuildArgs';

/**
 * #708 — a solution in a folder with a space (`...\hand code`) failed to build with
 * `MSB1008: Only one project can be specified. Switch: code`, and Problems stayed empty. The
 * arguments carried their own quotes (`ProjectPath="...hand code"`) and one build path joined
 * them into a single command string for ShellExecution; VS Code wrapped it again for
 * `pwsh -Command`, the inner quotes were lost and the path split at the space. MSBuild stopped
 * before compiling, wrote no log, and the extension had nothing to report.
 *
 * MSBuild now runs with ProcessExecution (no shell) and every argument is passed bare: the
 * process launcher quotes an argument with a space itself. The build header still shows a
 * copy-pasteable command line.
 */
describe('#708 — MSBuild arguments reach MSBuild intact, with no shell in between', () => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'client', 'src', 'buildTasks.ts'))) dir = path.dirname(dir);
    const src = fs.readFileSync(path.join(dir, 'client', 'src', 'buildTasks.ts'), 'utf8');

    it('bug-pin: the ConfigDir argument carries no quotes of its own, a space included', () => {
        const props = path.join('C:', 'Program Files', 'My Clarion', 'ClarionProperties.xml');
        assert.strictEqual(buildConfigDirArg(props), `/property:ConfigDir=${path.dirname(props)}`);
    });

    it('bug-pin: MSBuild runs through ProcessExecution, never a shell', () => {
        assert.ok(!/new ShellExecution\(/.test(src), 'no ShellExecution in buildTasks.ts');
        assert.ok(/new ProcessExecution\(/.test(src), 'MSBuild is started with ProcessExecution');
    });

    it('bug-pin: no build argument wraps its own value in quotes', () => {
        // `="${...}"` inside an argument template is exactly what broke at the shell layer.
        const quoted = src.match(/`[^`\n]*="\$\{[^`\n]*`/g) ?? [];
        const bareQuoted = src.match(/buildArgs\.push\(`"\$\{/g) ?? [];
        assert.deepStrictEqual([...quoted, ...bareQuoted], []);
    });

    it('the header quotes an argument containing a space, so the line can be pasted into a shell', () => {
        const [, cmd] = formatBuildHeader({
            buildTarget: 'Project', targetName: 'InvoicingHC', configuration: 'Debug|Win32',
            msBuildPath: 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\msbuild.exe',
            buildArgs: ['/t:build', '/property:ProjectPath=f:\\Play\\hand code', 'f:\\Play\\hand code\\InvoicingHC.cwproj'],
        });
        assert.strictEqual(cmd, 'MSBuild: C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\msbuild.exe /t:build ' +
            '"/property:ProjectPath=f:\\Play\\hand code" "f:\\Play\\hand code\\InvoicingHC.cwproj"');
    });

    it('a failed build with no log says so, in both build paths, instead of a bare exit code', () => {
        assert.strictEqual((src.match(/MSBuild wrote no build log/g) ?? []).length, 2, src.match(/MSBuild wrote no build log/g)?.join());
    });
});
