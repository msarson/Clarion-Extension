import * as assert from 'assert';
import { WindowDescriptorParser, WindowDescriptor } from '../tokenizer/WindowDescriptorParser';

function parse(line: string): WindowDescriptor {
    return WindowDescriptorParser.parse(line);
}

suite('WindowDescriptorParser', () => {

    test('returns empty descriptor for a non-container line', () => {
        const d = parse('MyProc PROCEDURE()');
        assert.strictEqual(d.title, undefined);
        assert.strictEqual(d.at, undefined);
        assert.strictEqual(d.mdi, false);
        assert.strictEqual(d.mdiChild, false);
        assert.strictEqual(d.icon, undefined);
        assert.strictEqual(d.systemMenu, false);
        assert.strictEqual(d.statusBar, false);
        assert.deepStrictEqual(d.attributes, []);
    });

    test('bare WINDOW with no attributes returns defaults', () => {
        const d = parse("MainWin WINDOW");
        assert.strictEqual(d.title, undefined);
        assert.strictEqual(d.at, undefined);
        assert.strictEqual(d.mdi, false);
        assert.strictEqual(d.mdiChild, false);
        assert.deepStrictEqual(d.attributes, []);
    });

    test('parses TITLE with single-quoted string', () => {
        const d = parse("MainWin WINDOW('Customer Browse')");
        assert.strictEqual(d.title, 'Customer Browse');
    });

    test('parses TITLE keyword form', () => {
        const d = parse("MainWin WINDOW,TITLE('Hello')");
        assert.strictEqual(d.title, 'Hello');
    });

    test("preserves doubled '' inside title strings", () => {
        const d = parse("Win WINDOW,TITLE('Don''t Stop')");
        assert.strictEqual(d.title, "Don't Stop");
    });

    test('parses AT with four numeric args as a structured tuple', () => {
        const d = parse("Win WINDOW,AT(0,0,640,480)");
        assert.deepStrictEqual(d.at, { x: 0, y: 0, w: 640, h: 480 });
    });

    test('falls back to raw expression text when AT args are not all numeric', () => {
        const d = parse("Win WINDOW,AT(0,0,?Wnd:W,?Wnd:H)");
        assert.strictEqual(d.at, '0,0,?Wnd:W,?Wnd:H');
    });

    test('parses MDI as a boolean flag', () => {
        const d = parse("Win WINDOW,MDI");
        assert.strictEqual(d.mdi, true);
        assert.strictEqual(d.mdiChild, false);
    });

    test('parses MDI(parent) as both mdi=true and mdiChild=true', () => {
        const d = parse("Win WINDOW,MDI(Parent)");
        assert.strictEqual(d.mdi, true);
        assert.strictEqual(d.mdiChild, true);
    });

    test('parses ICON', () => {
        const d = parse("Win WINDOW,ICON('app.ico')");
        assert.strictEqual(d.icon, 'app.ico');
    });

    test('parses SYSTEM and STATUS booleans', () => {
        const d = parse("Win WINDOW,SYSTEM,STATUS");
        assert.strictEqual(d.systemMenu, true);
        assert.strictEqual(d.statusBar, true);
    });

    test('STATUS with parens (string segments) still flips statusBar', () => {
        const d = parse("Win WINDOW,STATUS(80,160)");
        assert.strictEqual(d.statusBar, true);
    });

    test('unrecognised attributes flow into attributes[] (uppercased)', () => {
        const d = parse("Win WINDOW,RESIZE,GRAY,CENTERED");
        assert.deepStrictEqual(d.attributes.sort(), ['CENTERED', 'GRAY', 'RESIZE']);
    });

    test('combines TITLE + AT + MDI + ICON + SYSTEM + extras correctly', () => {
        const d = parse(
            "Browse WINDOW('Customer'),AT(50,50,400,300),MDI(MainFrame),ICON('cust.ico'),SYSTEM,RESIZE"
        );
        assert.strictEqual(d.title, 'Customer');
        assert.deepStrictEqual(d.at, { x: 50, y: 50, w: 400, h: 300 });
        assert.strictEqual(d.mdi, true);
        assert.strictEqual(d.mdiChild, true);
        assert.strictEqual(d.icon, 'cust.ico');
        assert.strictEqual(d.systemMenu, true);
        assert.deepStrictEqual(d.attributes, ['RESIZE']);
    });

    test('APPLICATION container parses with the same shape', () => {
        const d = parse("MyApp APPLICATION('Demo'),AT(0,0,800,600),MDI");
        assert.strictEqual(d.title, 'Demo');
        assert.deepStrictEqual(d.at, { x: 0, y: 0, w: 800, h: 600 });
        assert.strictEqual(d.mdi, true);
    });

    test('REPORT container parses with the same shape', () => {
        const d = parse("InvoiceRpt REPORT,AT(1000,1000,7000,10000),THOUS");
        assert.deepStrictEqual(d.at, { x: 1000, y: 1000, w: 7000, h: 10000 });
        assert.deepStrictEqual(d.attributes, ['THOUS']);
    });

    test('case-insensitive on the WINDOW/APPLICATION/REPORT keyword', () => {
        const d1 = parse("w window,title('x')");
        const d2 = parse("a Application,Title('y')");
        const d3 = parse("r REPORT,TITLE('z')");
        assert.strictEqual(d1.title, 'x');
        assert.strictEqual(d2.title, 'y');
        assert.strictEqual(d3.title, 'z');
    });

    test('extra whitespace and tabs around attributes do not break parsing', () => {
        const d = parse("Win WINDOW   ,  TITLE( 'spaced' )  ,  AT(  10 , 20 , 30 , 40 )  ");
        // The unquoter returns the exact in-string text (no surrounding quotes), so
        // 'spaced' stays 'spaced' — the trim is on the args wrapper, not the string body.
        assert.strictEqual(d.title, 'spaced');
        assert.deepStrictEqual(d.at, { x: 10, y: 20, w: 30, h: 40 });
    });
});
