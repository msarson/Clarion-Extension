/**
 * validateDiscardedReturnValues — an overloaded method where the matching overload has no
 * return value must not be reported as a discarded return.
 *
 * Reported by Mark (#621) against VitTransform. `VitTokenize` declares two `JoinToks`:
 *
 *   JoinToks  Procedure(LONG pStart=1, LONG pEnd=0),STRING,virtual        ! accepts 0,1,2 args
 *   JoinToks  Procedure(StringTheory st, LONG pStart=1, LONG pEnd=0),virtual  ! accepts 1,2,3 args
 *
 * and `self.tk.JoinToks(pOut)` passes one StringTheory. Both overloads accept one argument, so
 * argument count cannot separate them; `selectBestMemberOverload` sorted the STRING one first and
 * the call was reported as discarding a return value the compiler knows it does not have.
 *
 * The rule: warn only when EVERY overload that could accept the call returns a value. A warning
 * should prefer a false negative to a false positive. The `instring` case below is the guard that
 * keeps the genuine positives — all StringTheory `Instring` prototypes return LONG.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateDiscardedReturnValues } from '../providers/diagnostics/ReturnValueDiagnostics';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function write(filename: string, code: string): string {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, code);
    return filePath;
}

/** The declarations, mirroring vittokenize.inc. */
const INC = [
    'StringTheory  CLASS,TYPE',
    'Instring        PROCEDURE(STRING pSearch),LONG',
    'Instring        PROCEDURE(STRING pSearch, LONG pStep),LONG',
    'SetValue        PROCEDURE(STRING pValue)',
    '              END',
    '',
    'VitTokenize   CLASS,TYPE',
    'JoinToks        PROCEDURE(LONG pStart=1, LONG pEnd=0),STRING,VIRTUAL',
    'JoinToks        PROCEDURE(StringTheory st, LONG pStart=1, LONG pEnd=0),VIRTUAL',
    'CountToks       PROCEDURE(),LONG',
    'Reset           PROCEDURE()',
    '              END',
].join('\n');

/** A method body whose single statement is the call under test. */
function caller(callLine: string): string {
    return [
        "  MEMBER('prog.clw')",
        "  INCLUDE('vittokenize.inc'),ONCE",
        '  MAP',
        '  END',
        'VitEngine   CLASS,TYPE',
        'tk            VitTokenize',
        'st            StringTheory',
        'Run           PROCEDURE()',
        '            END',
        'VitEngine.Run PROCEDURE()',
        'out             StringTheory',
        '  CODE',
        `  ${callLine}`,
    ].join('\n');
}

suite('ReturnValueDiagnostics — overload with no return value (#621)', () => {
    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvd621_'));
    });
    suiteTeardown(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ } });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    async function warningsFor(callLine: string): Promise<string[]> {
        write('vittokenize.inc', INC);
        const code = caller(callLine);
        const clwPath = write('vitengine.clw', code);
        const doc = TextDocument.create(`file:///${clwPath.replace(/\\/g, '/')}`, 'clarion', 1, code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const diags = await validateDiscardedReturnValues(tokens, doc, new MemberLocatorService());
        return diags.filter(d => /is discarded/.test(String(d.message))).map(d => String(d.message));
    }

    test('the reported call: one argument matches the overload that returns nothing', async () => {
        const warns = await warningsFor('SELF.tk.JoinToks(out)');
        assert.deepStrictEqual(warns, [],
            `JoinToks(StringTheory) has no return value; nothing is discarded. Got: ${warns.join(' | ')}`);
    });

    test('a receiver reached through SELF stays silent too', async () => {
        const warns = await warningsFor('SELF.tk.JoinToks(SELF.st)');
        assert.deepStrictEqual(warns, [], `got: ${warns.join(' | ')}`);
    });

    test('no argument can only be the STRING overload, so it still warns', async () => {
        const warns = await warningsFor('SELF.tk.JoinToks()');
        assert.strictEqual(warns.length, 1,
            `JoinToks() matches only the STRING prototype and discards it. Got: ${warns.join(' | ')}`);
    });

    test('every overload returns a value: still warns (the instring guard)', async () => {
        const warns = await warningsFor("SELF.st.Instring('.getValue')");
        assert.strictEqual(warns.length, 1,
            `both Instring prototypes return LONG, so the value is genuinely discarded. Got: ${warns.join(' | ')}`);
    });

    test('a plain method with a return value still warns', async () => {
        const warns = await warningsFor('SELF.tk.CountToks()');
        assert.strictEqual(warns.length, 1, `got: ${warns.join(' | ')}`);
    });

    test('a plain method without a return value stays silent', async () => {
        const warns = await warningsFor('SELF.tk.Reset()');
        assert.deepStrictEqual(warns, [], `got: ${warns.join(' | ')}`);
    });

    test('a non-overloaded void method taking an argument stays silent', async () => {
        const warns = await warningsFor("SELF.st.SetValue('x')");
        assert.deepStrictEqual(warns, [], `got: ${warns.join(' | ')}`);
    });
});
