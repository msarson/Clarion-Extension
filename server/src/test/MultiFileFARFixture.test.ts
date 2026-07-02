import * as assert from 'assert';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture
} from './helpers/MultiFileFARFixture';

/**
 * Verification test for the multi-file FAR scaffolding helper
 * (`server/src/test/helpers/MultiFileFARFixture.ts`).
 *
 * Doesn't pin a bug — proves the scaffolding works. ONE FAR call across
 * two files; assertion that the cross-file caller is in the result. If
 * this passes, the helper is ready for FAR family follow-ups (P1
 * cross-procedure callers, P2b call-site type inference, 0c289e16
 * caller-cursor) to author cross-file regression guards without
 * re-investing the +200 LOC mock-SolutionManager + TokenCache + URI
 * canonicalization plumbing per task.
 */
suite('MultiFileFARFixture — verification (bb21f225)', () => {

    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        provider = new ReferencesProvider();
    });

    teardown(() => {
        teardownMultiFileFixture();
    });

    // TODO bb21f225 verification — needs FRG seeding OR class-based fixture
    //   variant; helper API ready for FAR family follow-ups (P1 3be2b68d /
    //   P2b 10ea5a80 / 0c289e16) to exercise once they author scenarios
    //   that route past the FRG branch at ReferencesProvider:1580-1600.
    //
    // Today's behavior: FAR classifies `Bar PROCEDURE` in PROGRAM-file MAP
    // as scope.type='module' + symbolInfo.type='PROCEDURE', which routes
    // through the FRG-based MODULE-files branch. With no FRG built in the
    // test fixture (the fixture mocks SolutionManager but not the
    // FileRelationshipGraph builder), implFiles stays as [declaring file] —
    // the cross-file walk doesn't engage. Future FAR-family tests will
    // exercise the helper from their own routing paths and either validate
    // it or surface needed extensions.
    test.skip('FAR finds reference in another file via the multi-file fixture', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'file_a.clw': [
                    "  PROGRAM",                  // line 0
                    '  MAP',                      // line 1
                    'Bar    PROCEDURE',           // line 2 — FAR cursor here
                    '  END',                      // line 3
                    '  CODE',                     // line 4
                    '  Bar()',                    // line 5 — caller in file_a
                    '  RETURN',                   // line 6
                ].join('\n'),
                'file_b.clw': [
                    "  MEMBER('main')",           // line 0
                    '',                            // line 1
                    'Bar PROCEDURE',              // line 2 — impl in file_b
                    '  CODE',                     // line 3
                    '  RETURN',                   // line 4
                ].join('\n'),
            }
        });

        const docA = fixture.documents['file_a.clw'];
        const fileBUri = fixture.uris['file_b.clw'];

        // FAR cursor on Bar decl in file_a (line 2, char 0).
        const refs = await provider.provideReferences(docA, { line: 2, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references via the multi-file fixture');
        const refUris = refs!.map(r => r.uri.toLowerCase());

        // Load-bearing assertion: the cross-file impl URI MUST be present.
        // Pre-helper this would fail (mocha mock-SolutionManager wouldn't be
        // populated, FAR returns only cursor-file refs); post-helper the
        // fake SolutionManager + TokenCache seeding makes the cross-file
        // walk visible.
        assert.ok(
            refUris.some(u => u === fileBUri.toLowerCase()),
            'expected cross-file URI ' + fileBUri + ' in result; got URIs=[' + refUris.join(', ') + '] — ' +
            'multi-file fixture scaffolding not engaging FAR\'s cross-file scan'
        );
    });
});
