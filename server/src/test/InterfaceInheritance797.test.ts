import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateClassInterfaceImplementationAsync } from '../providers/diagnostics/ClassDiagnostics';
import { DataTypeService } from '../utils/DataTypeService';

/**
 * #797 — INTERFACE inheritance, in the hover card and in the interfaceImplementation check.
 *
 * Card: the help's syntax is `label INTERFACE ( [ parentinterface ] ) [, TYPE] [, COM]`, and its
 * "Implementing INTERFACEs in Derived Classes" page (Clarion 6.3+) says a child class that
 * re-implements an interface its parent already implements need not override every method.
 *
 * Diagnostic: a derived interface `IChild INTERFACE(IParent)` inherits IParent's methods, so a
 * class implementing IChild owes them too. They are implemented under the DERIVED interface's
 * name (`Cls.IChild.ParentMethod`) - shipping LibSrc settles it: FormVCRWindowComponent derives
 * from WindowComponent, and ABVCRFRM.CLW implements Kill, Reset, ... as
 * `FormVCRClass.FormVCRWindowComponent.Kill`.
 */

let docCounter = 0;
async function diags(lines: string[]) {
    const doc = TextDocument.create(`file:///iface-inherit-797-${++docCounter}.clw`, 'clarion', 1, lines.join('\n'));
    const tokens = TokenCache.getInstance().getTokens(doc);
    return validateClassInterfaceImplementationAsync(tokens, doc, new MemberLocatorService());
}
const messages = (d: { message: unknown }[]) => JSON.stringify(d.map(x => String(x.message)));

const DERIVED_IFACES = [
    '  PROGRAM',
    '  MAP',
    '  END',
    'IParent  INTERFACE',
    'PM         PROCEDURE',
    'Shared     PROCEDURE(LONG x)',
    '         END',
    'IChild   INTERFACE(IParent),COM',
    'CM         PROCEDURE',
    'Shared     PROCEDURE(LONG x)',   // same name + params: overrides the inherited one
    '         END',
];

suite('#797 — INTERFACE inheritance', () => {

    suite('the interfaceImplementation check', () => {

        test('the reported shape: a derived class re-implementing its parent\'s interface with no methods of its own — no warning', async () => {
            const d = await diags([
                '               PROGRAM',
                '               MAP',
                '                 Test()',
                '               END',
                'IFace          INTERFACE,COM',
                'Proc1            PROCEDURE ()',
                'Proc2            PROCEDURE ()',
                '               END',
                'Cls1           CLASS,TYPE,IMPLEMENTS(IFace)',
                '               END',
                'Cls2           CLASS(Cls1),TYPE,IMPLEMENTS(IFace)',
                '               END',
                '  CODE',
                '  Test()',
                '  RETURN',
                'Test  PROCEDURE ()',
                'obj        Cls2,AUTO',
                '  CODE',
                '  obj.IFace.Proc2()',
                '  RETURN',
                'Cls1.IFace.Proc1  PROCEDURE ()',
                '  CODE',
                "  MESSAGE ('Proc1 in Cls1')",
                '  RETURN',
                'Cls1.IFace.Proc2  PROCEDURE ()',
                '  CODE',
                "  MESSAGE ('Proc2 in Cls1')",
                '  RETURN',
            ]);
            assert.strictEqual(d.length, 0, messages(d));
        });

        test('a class implementing a derived interface but omitting an inherited method — warns and names it', async () => {
            const d = await diags([
                ...DERIVED_IFACES,
                'Cls      CLASS,IMPLEMENTS(IChild)',
                '         END',
                '  CODE',
                'Cls.IChild.CM  PROCEDURE',
                '  CODE',
                'Cls.IChild.Shared  PROCEDURE(LONG x)',
                '  CODE',
            ]);
            assert.strictEqual(d.length, 1, messages(d));
            assert.ok(/'IChild\.PM'/.test(String(d[0].message)), String(d[0].message));
            assert.ok(/Cls\.IChild\.PM PROCEDURE/.test(String(d[0].message)), String(d[0].message));
        });

        test('a class implementing the inherited methods as Cls.IChild.ParentMethod — no warning', async () => {
            const d = await diags([
                ...DERIVED_IFACES,
                'Cls      CLASS,IMPLEMENTS(IChild)',
                '         END',
                '  CODE',
                'Cls.IChild.CM  PROCEDURE',
                '  CODE',
                'Cls.IChild.PM  PROCEDURE',
                '  CODE',
                'Cls.IChild.Shared  PROCEDURE(LONG x)',
                '  CODE',
            ]);
            assert.strictEqual(d.length, 0, messages(d));
        });

        test('an interface derived two levels down owes the grandparent\'s methods too', async () => {
            const d = await diags([
                ...DERIVED_IFACES,
                'IGrand   INTERFACE(IChild)',
                'GM         PROCEDURE',
                '         END',
                'Cls      CLASS,IMPLEMENTS(IGrand)',
                '         END',
                '  CODE',
                'Cls.IGrand.GM  PROCEDURE',
                '  CODE',
                'Cls.IGrand.CM  PROCEDURE',
                '  CODE',
                'Cls.IGrand.Shared  PROCEDURE(LONG x)',
                '  CODE',
            ]);
            assert.strictEqual(d.length, 1, messages(d));
            assert.ok(/'IGrand\.PM'/.test(String(d[0].message)), String(d[0].message));
        });

        test('a derived class re-implementing a derived interface its parent fully implements — no warning', async () => {
            const d = await diags([
                ...DERIVED_IFACES,
                'Base     CLASS,TYPE,IMPLEMENTS(IChild)',
                '         END',
                'Child    CLASS(Base),TYPE,IMPLEMENTS(IChild)',
                '         END',
                '  CODE',
                'Base.IChild.CM  PROCEDURE',
                '  CODE',
                'Base.IChild.PM  PROCEDURE',
                '  CODE',
                'Base.IChild.Shared  PROCEDURE(LONG x)',
                '  CODE',
                'Child.IChild.PM  PROCEDURE',
                '  CODE',
            ]);
            assert.strictEqual(d.length, 0, messages(d));
        });

        test('an interface that derives from itself does not hang', async () => {
            const d = await diags([
                '  PROGRAM',
                '  MAP',
                '  END',
                'ILoop    INTERFACE(ILoop)',
                'M1         PROCEDURE',
                '         END',
                'Cls      CLASS,IMPLEMENTS(ILoop)',
                '         END',
                '  CODE',
                'Cls.ILoop.M1  PROCEDURE',
                '  CODE',
            ]);
            assert.strictEqual(d.length, 0, messages(d));
        });
    });

    suite('the INTERFACE hover card', () => {
        const entry = () => DataTypeService.getInstance().getDataType('INTERFACE')!;

        test('the syntax names the parent interface, TYPE and COM', () => {
            const syntax = entry().syntax;
            assert.ok(/INTERFACE\s*\(\s*\[\s*parentinterface\s*\]\s*\)/.test(syntax), syntax);
            assert.ok(/TYPE/.test(syntax) && /COM/.test(syntax), syntax);
        });

        test('TYPE and COM are its attributes, and the parent interface is an optional parameter', () => {
            assert.deepStrictEqual([...entry().attributes].sort(), ['COM', 'TYPE']);
            const parent = entry().parameters.find(p => /parentinterface/i.test(p.name));
            assert.ok(parent, JSON.stringify(entry().parameters));
            assert.strictEqual(parent!.optional, true);
        });

        test('the notes do not claim every implementing class must provide every method', () => {
            const notes = entry().notes ?? '';
            assert.ok(!/must provide all method implementations/i.test(notes), notes);
            assert.ok(/6\.3/.test(notes), `notes should mention the Clarion 6.3 derived-class rule: ${notes}`);
            assert.ok(/PASCAL/.test(notes), `notes should say what COM means: ${notes}`);
        });
    });
});
