/**
 * `resolveSdiDeclaration` backs StructureFieldResolver's field-hover SDI tier.
 *
 * It originally bailed whenever the SDI named more than one declaring file. That looked safe
 * until the indexer started scanning the project's OWN directory (as the compiler does), which
 * makes duplicates the NORM rather than the exception: a shared library and the project commonly
 * both carry a copy of the same .inc. Confirmed via the `SdiDeclarationAmbiguous` fixture below:
 * a type with several declaring files started resolving to 0 in field hover the moment the SDI
 * could see more than one copy of it, while completion (which has its own ambiguous last-resort
 * tier) kept working.
 *
 * So: ambiguity must still resolve, and the copy chosen must be the one the compiler's
 * redirection order would bind — the requesting document's own directory first (`.\` precedes the
 * shared paths in the .red `*.inc` line).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MemberLocatorService } from '../services/MemberLocatorService';

suite('MemberLocatorService.resolveSdiDeclaration — ambiguous declarations still resolve', () => {

    let localDir: string;
    let sharedDir: string;
    let localFile: string;
    let sharedFile: string;

    suiteSetup(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdi-ambiguous-'));
        localDir = path.join(root, 'MyProject');
        sharedDir = path.join(root, 'SharedLib');
        fs.mkdirSync(localDir, { recursive: true });
        fs.mkdirSync(sharedDir, { recursive: true });

        // Same type name in both copies, with DIFFERENT fields so the pick is observable.
        localFile = path.join(localDir, 'types.inc');
        sharedFile = path.join(sharedDir, 'types.inc');
        fs.writeFileSync(localFile, 'DupType QUEUE,TYPE\nLocalField  LONG\n        END\n');
        fs.writeFileSync(sharedFile, 'DupType QUEUE,TYPE\nSharedField LONG\n        END\n');
    });

    /** A service whose SDI reports `files` as the declaring files, without touching the shared singleton. */
    function serviceReporting(files: string[]): MemberLocatorService {
        const svc = new MemberLocatorService() as any;
        svc.ensureIndexBuilt = async () => { /* index state is supplied directly below */ };
        const declarations = () => files.map(filePath => ({
            name: 'DupType',
            filePath,
            line: 0,
            structureType: 'QUEUE',
            isType: true,
            parentName: undefined,
            lineContent: 'DupType QUEUE,TYPE'
        }));
        // #571: lookups on behalf of a file go through findFor; no solution here, so both answer alike.
        svc.sdi = { find: declarations, findFor: declarations };
        return svc as MemberLocatorService;
    }

    test('an UNAMBIGUOUS declaration resolves (unchanged behaviour)', async () => {
        const hit = await serviceReporting([sharedFile]).resolveSdiDeclaration('DupType');
        assert.ok(hit, 'a single declaring file must resolve');
        assert.strictEqual(path.normalize(hit!.filePath), path.normalize(sharedFile));
    });

    test('an AMBIGUOUS declaration still resolves instead of returning null', async () => {
        const hit = await serviceReporting([sharedFile, localFile]).resolveSdiDeclaration('DupType');
        assert.ok(hit, 'several declaring files must NOT mean "no answer" — that killed field hover');
    });

    test('the requesting document\'s own directory wins the tiebreak', async () => {
        // Shared copy listed FIRST, so a naive "take infos[0]" would pick the wrong one.
        const hit = await serviceReporting([sharedFile, localFile]).resolveSdiDeclaration('DupType', localDir);
        assert.ok(hit);
        assert.strictEqual(path.normalize(hit!.filePath), path.normalize(localFile),
            'the copy in the requesting file\'s own directory is the one the compiler binds');
    });

    test('preferDir that matches nothing falls back to a declaration rather than failing', async () => {
        const hit = await serviceReporting([sharedFile, localFile]).resolveSdiDeclaration('DupType', path.join(os.tmpdir(), 'nowhere-at-all'));
        assert.ok(hit, 'an unmatched preferDir must degrade to a pick, not to null');
    });

    test('a name the SDI does not know still returns null', async () => {
        const hit = await serviceReporting([]).resolveSdiDeclaration('DupType');
        assert.strictEqual(hit, null);
    });
});
