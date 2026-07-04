import * as assert from 'assert';
import * as path from 'path';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture
} from './helpers/MultiFileFARFixture';

suite('ReferencesProvider — sibling MEMBER module-scope', () => {
    setup(() => {
        setServerInitialized(true);
    });

    teardown(() => {
        teardownMultiFileFixture();
    });

    test('finds declaration and sibling MEMBER usage for module-scope variable', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'main.clw': [
                    '  PROGRAM',
                    '  MAP',
                    '  END',
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'MemberA.clw': [
                    "  MEMBER('main.clw')",
                    'SharedValue LONG',
                    'ProcA PROCEDURE',
                    '  CODE',
                    '  SharedValue = 10',
                    '  RETURN',
                ].join('\n'),
                'MemberB.clw': [
                    "  MEMBER('main.clw')",
                    'ProcB PROCEDURE',
                    '  CODE',
                    '  SharedValue = 20',
                    '  RETURN',
                ].join('\n'),
            },
            frg: { programFile: 'main.clw', memberFiles: ['MemberA.clw', 'MemberB.clw'] }
        });

        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(
            fixture.documents['MemberB.clw'],
            { line: 3, character: 4 },
            { includeDeclaration: true }
        );

        assert.ok(refs, 'FAR should return references for sibling MEMBER module-scope variable');
        const basenames = refs!.map(r => path.basename(decodeURIComponent(r.uri)).toLowerCase());
        assert.ok(basenames.includes('membera.clw'), `expected declaration/member-A refs, got ${basenames.join(', ')}`);
        assert.ok(basenames.includes('memberb.clw'), `expected current MEMBER usage, got ${basenames.join(', ')}`);
    });
});
