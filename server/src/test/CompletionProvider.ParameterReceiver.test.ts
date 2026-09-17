import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionProvider } from '../providers/CompletionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * Dot completion on a PROCEDURE PARAMETER offered none of its type's members, while
 * the same type held in a LOCAL variable completed normally. Hover on the very same
 * parameter was correct, which is what made it look like a member-lookup problem
 * rather than a resolution one.
 *
 * Root cause: `resolveChainToClassName`'s plain-word branch called
 * `resolveVariableType(chain, tokens, document)` without the optional `scopeLine`.
 * That argument is what lets `resolveVariableType` fall back to
 * `resolveParameterType`, which parses the enclosing PROCEDURE(...) header — and it
 * is the ONLY way a parameter resolves, because a parameter is declared inside the
 * signature line rather than at column 0 and so is invisible to the declaration
 * lookup that answers for locals and globals.
 *
 * With resolution failing, the branch fell through past the prefixed-field case to
 * the final `return { className: chain }` fallback, handing the VARIABLE'S OWN NAME
 * downstream as a class name. Member enumeration then searched for a structure named
 * after the parameter, found none, and returned an empty list — after walking the
 * whole include chain looking for it.
 *
 * Every other caller that supports parameters already passed the argument
 * (definition, the hover structure-field resolver, implementation), which is why
 * hover was unaffected.
 *
 * The chained-root branch (`pSomething.Member.`) took the same call without the
 * argument and is fixed alongside it.
 */

const SOURCE_LINES = [
    '  MEMBER(\'prog.clw\')',
    '',
    'DeviceType   CLASS,TYPE',
    'Connect        PROCEDURE(),BYTE',
    'Disconnect     PROCEDURE()',
    'PortName       STRING(32)',
    '             END',
    '',
    'HolderType   CLASS,TYPE',
    'Inner          &DeviceType',
    '             END',
    '',
    'Caller       PROCEDURE( DeviceType pDevice, LONG pFlags, HolderType pHolder )',
    'LocalDevice    DeviceType',
    '  CODE',
];

let n = 0;
async function complete(typed: string) {
    const lines = [...SOURCE_LINES, typed];
    const doc = TextDocument.create(`file:///C:/temp/paramreceiver-${++n}.clw`, 'clarion', 1, lines.join('\n'));
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    cache.getTokens(doc);
    const isDot = typed.endsWith('.');
    const params = {
        textDocument: { uri: doc.uri },
        position: { line: SOURCE_LINES.length, character: typed.length },
        context: isDot ? { triggerKind: 2, triggerCharacter: '.' } : { triggerKind: 1 }
    } as any;
    return new CompletionProvider().onCompletion(params, doc);
}

function labelsOf(items: { label: unknown }[]): string[] {
    return items.map(i => String(i.label));
}

/** A member list is present when a known member name appears as some item's label prefix. */
function hasMember(items: { label: unknown }[], member: string): boolean {
    return labelsOf(items).some(l => l.toUpperCase().startsWith(member.toUpperCase()));
}

suite('Dot completion on a procedure parameter receiver', () => {

    setup(() => setServerInitialized(true));

    test('a CLASS-typed parameter offers its members', async () => {
        const items = await complete('  pDevice.');
        assert.ok(hasMember(items, 'Connect'),
            'expected the parameter type\'s methods (got: ' + labelsOf(items).join(', ') + ')');
        assert.ok(hasMember(items, 'PortName'),
            'expected the parameter type\'s properties (got: ' + labelsOf(items).join(', ') + ')');
    });

    // Passes in both states today — the bad fallback yields an empty list rather than a
    // self-named one. Kept as a guard against "fixing" this by resolving the name to itself.
    test('regression guard: the parameter\'s own name is not used as the class name', async () => {
        const items = await complete('  pDevice.');
        assert.ok(!hasMember(items, 'pDevice'),
            'the receiver name must not be resolved as its own type');
    });

    test('a chain rooted on a parameter resolves through to the inner type', async () => {
        const items = await complete('  pHolder.Inner.');
        assert.ok(hasMember(items, 'Connect'),
            'expected the inner reference\'s members (got: ' + labelsOf(items).join(', ') + ')');
    });

    test('regression guard: a LOCAL of the same type still completes', async () => {
        const items = await complete('  LocalDevice.');
        assert.ok(hasMember(items, 'Connect'), 'local declarations must be unaffected');
        assert.ok(hasMember(items, 'PortName'), 'local declarations must be unaffected');
    });

    test('regression guard: a bare class name still resolves as a class name', async () => {
        const items = await complete('  DeviceType.');
        assert.ok(hasMember(items, 'Connect'),
            'a direct class name must still fall through to the class-name path');
    });

    test('regression guard: a non-class parameter offers no member list', async () => {
        const items = await complete('  pFlags.');
        assert.ok(!hasMember(items, 'Connect'),
            'a LONG parameter must not pick up an unrelated type\'s members');
    });
});
