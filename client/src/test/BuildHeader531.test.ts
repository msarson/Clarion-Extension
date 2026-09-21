import { describe, it } from 'mocha';
import * as assert from 'assert';
import { formatBuildHeader, describeConfiguration } from '../utils/ClarionBuildArgs';

/**
 * #531 — the build output states the solution, the configuration and the MSBuild
 * command line before MSBuild starts.
 *
 * From Mark: "I would prefer to SEE the arguments sent to MsBuild -- at least show
 * the configuration. Nothing in the terminal shows the config." The task terminal is
 * hidden by default and the command line went only to the extension's own log.
 */
describe('formatBuildHeader (#531)', () => {
    const ARGS = [
        '/property:GenerateFullPaths=true',
        '/t:build',
        '/property:Configuration=Debug',
        '/property:Platform=Win32',
        '/property:ClarionBinPath="C:\\Clarion11\\bin"',
        '"E:\\Dev\\b47.sln"',
    ];

    it('names the target, the configuration and every MSBuild argument', () => {
        const lines = formatBuildHeader({
            buildTarget: 'Solution', targetName: 'b47', configuration: 'Debug|Win32',
            msBuildPath: 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\msbuild.exe', buildArgs: ARGS,
        });
        const text = lines.join('\n');
        assert.ok(/Building solution b47/.test(text), text);
        assert.ok(/Debug \(Win32\)/.test(text), 'configuration and platform on the first line: ' + text);
        assert.ok(text.includes('msbuild.exe'), 'the MSBuild path');
        for (const a of ARGS) assert.ok(text.includes(a), `argument present: ${a}`);
    });

    it('says project when a single project is built', () => {
        const [first] = formatBuildHeader({
            buildTarget: 'Project', targetName: 'CommonLib', configuration: 'Release',
            msBuildPath: 'msbuild.exe', buildArgs: [],
        });
        assert.ok(/Building project CommonLib/.test(first), first);
        assert.ok(/Release$/.test(first) || /Release\b/.test(first), first);
    });

    it('describeConfiguration renders name and platform for messages', () => {
        assert.strictEqual(describeConfiguration('Debug|Win32'), 'Debug (Win32)');
        assert.strictEqual(describeConfiguration('Release'), 'Release');
        assert.strictEqual(describeConfiguration(''), '(no configuration)');
    });
});
