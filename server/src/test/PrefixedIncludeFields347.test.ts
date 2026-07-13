import * as assert from 'assert';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import {
    SymbolFinderService,
    evictIncludeChainIndexes
} from '../services/SymbolFinderService';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture
} from './helpers/MultiFileFARFixture';

/**
 * Issue #347 — undeclaredVar false positives on PRE-prefixed FILE fields
 * (Mark's IBSWorking: JCA:StartedDate / JCA:EndedDate, the persistent
 * diag_count=2 on SelectJobNumber_IBSCommon.clw).
 *
 * The dictionary-generated `JCMaster FILE,...,PRE(JCA)` declaration is
 * carried into the program via INCLUDE. Prefixed-field resolution had a
 * coverage hole for that shape:
 *   - findPrefixedField walks current doc → parent PROGRAM tokens, but
 *     never the parent's INCLUDE chain;
 *   - buildIncludeChainIndex (#344) indexed only parentless col-0 labels,
 *     so FILE record fields never entered it under any name.
 *
 * Fix: the chain index also records `PREFIX:LABEL` for col-0 labels inside
 * structures whose nearest prefixed ancestor carries a non-empty PRE().
 * Resolution stays O(1) per name (#345 discipline).
 */
suite('Issue #347 — PRE-prefixed fields from include-carried declarations', () => {

    teardown(() => {
        teardownMultiFileFixture();
        evictIncludeChainIndexes();
        TokenCache.getInstance().clearAllTokens();
    });

    function buildFixture() {
        return buildMultiFileFixture({
            files: {
                'program.clw': [
                    '   PROGRAM',
                    '   MAP',
                    '   END',
                    "   INCLUDE('filedefs.clw'),ONCE",
                    '   CODE',
                    '   RETURN',
                ].join('\n'),
                'filedefs.clw': [
                    "JCMaster             FILE,DRIVER('TOPSPEED'),PRE(JCA),CREATE,BINDABLE,THREAD",
                    'AlternateKey             KEY(JCA:JobName),DUP,NOCASE',
                    'Record                   RECORD,PRE()',
                    'JobNumber                   LONG',
                    'StartedDate                 LONG',
                    'EndedDate                   LONG',
                    '                         END',
                    '                     END',
                ].join('\n'),
                'member.clw': [
                    "  MEMBER('program.clw')",
                    '  MAP',
                    '  END',
                    'SelectJob PROCEDURE',
                    '  CODE',
                    '  IF JCA:StartedDate > 0',
                    '    JCA:EndedDate = JCA:StartedDate',
                    '  END',
                    '  RETURN',
                ].join('\n'),
            },
            frg: { programFile: 'program.clw', memberFiles: ['member.clw'] }
        });
    }

    test('BUG PIN #347 — JCA:StartedDate resolves through the include-carried FILE declaration', async () => {
        const fixture = buildFixture();
        const tokenCache = TokenCache.getInstance();
        const sf = new SymbolFinderService(tokenCache, new ScopeAnalyzer(tokenCache, undefined as never));
        const memberDoc = fixture.documents['member.clw'];
        const pos = { line: 5, character: 4 };

        evictIncludeChainIndexes();
        const started = await sf.findSymbol('JCA:STARTEDDATE', memberDoc, pos);
        const ended = await sf.findSymbol('JCA:ENDEDDATE', memberDoc, pos);
        assert.ok(started,
            'JCA:StartedDate (field of include-carried JCMaster FILE,PRE(JCA)) must resolve — ' +
            'pre-fix: findPrefixedField never walks the parent\'s includes and the chain index skips structure members (#347)');
        assert.ok(ended, 'JCA:EndedDate must resolve for the same reason');
    });

    test('#347 — KEY labels inside the prefixed FILE resolve as PREFIX:Label too', async () => {
        const fixture = buildFixture();
        const tokenCache = TokenCache.getInstance();
        const sf = new SymbolFinderService(tokenCache, new ScopeAnalyzer(tokenCache, undefined as never));
        const memberDoc = fixture.documents['member.clw'];

        evictIncludeChainIndexes();
        const key = await sf.findSymbol('JCA:ALTERNATEKEY', memberDoc, { line: 5, character: 4 });
        assert.ok(key, 'JCA:AlternateKey (KEY member of the prefixed FILE) must resolve — VIEWs PROJECT keys too');
    });

    test('REGRESSION GUARD #265 — bare field name still does NOT resolve without its prefix qualifier', async () => {
        const fixture = buildFixture();
        const tokenCache = TokenCache.getInstance();
        const sf = new SymbolFinderService(tokenCache, new ScopeAnalyzer(tokenCache, undefined as never));
        const memberDoc = fixture.documents['member.clw'];

        evictIncludeChainIndexes();
        const bare = await sf.findSymbol('STARTEDDATE', memberDoc, { line: 5, character: 4 });
        assert.strictEqual(bare, null,
            'a PRE()\'d structure field must NOT resolve from a bare reference (#265 — prefix qualifier required)');
    });
});
