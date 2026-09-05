import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

// Companion to AttributeDiagnostics' dot-base / paren-nesting guards: hovering
// an identifier that happens to match a Clarion attribute keyword (FILTER,
// ORDER, NAME, TYPE, ...) must not show that attribute's doc card when the
// identifier is really a variable/field reference dotted or nested inside
// another attribute's argument list, e.g. the `Filter` in `USE(Filter.Type)`
// or a bare `USE(Filter)`.
suite('HoverProvider — attribute keyword vs. dotted/nested variable reference', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        if (!hover) return '';
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    test('does not show the FILTER attribute card for USE(Filter.Type) on an ENTRY', async () => {
        const code = `MyWin WINDOW
  ENTRY(@s10),AT(10,10,50,10),USE(Filter.Type)
END`;
        const doc = TextDocument.create('test://filter-dotted.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 36)); // inside "Filter"
        const content = hoverText(hover);
        assert.ok(!content.includes('Attribute: FILTER'),
            `Should not show the builtin FILTER attribute card; got: ${content}`);
    });

    test('does not show the FILTER attribute card for a bare USE(Filter) on an ENTRY', async () => {
        const code = `MyWin WINDOW
  ENTRY(@s10),AT(10,10,50,10),USE(Filter)
END`;
        const doc = TextDocument.create('test://filter-bare-nested.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 36)); // inside "Filter"
        const content = hoverText(hover);
        assert.ok(!content.includes('Attribute: FILTER'),
            `Should not show the builtin FILTER attribute card; got: ${content}`);
    });

    test('negative sentinel — a genuine bare FILTER attribute (not dotted, not nested) still shows its doc card', async () => {
        // handleAttribute only checks "is this a known attribute inside SOME
        // declaration context", not applicability to the specific control (that's
        // AttributeDiagnostics' job) — so any control declaration works here, as
        // long as FILTER is a bare, top-level, comma-separated attribute.
        const code = `MyWin WINDOW
  ENTRY(@s10),AT(10,10,50,10),FILTER
END`;
        const doc = TextDocument.create('test://filter-genuine.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 32)); // inside "FILTER"
        const content = hoverText(hover);
        assert.ok(content.includes('Attribute: FILTER'),
            `A genuine bare FILTER attribute must still show its doc card; got: ${content}`);
    });

    // NAME is a third occurrence of the same collision, but through a DIFFERENT
    // resolver: it's both the NAME attribute (DATA_TYPE/FILE_FIELD) AND the
    // NAME(file) builtin function. handleAttribute correctly steps aside for
    // USE(Name), but handleBuiltin — next in the router chain — picked it up
    // right after with none of the same guards.
    test('does not show the builtin NAME() card for a bare USE(Name) on an ENTRY', async () => {
        const code = `MyWin WINDOW
  ENTRY(@s10),AT(10,10,50,10),USE(Name)
END`;
        const doc = TextDocument.create('test://name-bare-nested.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 36)); // inside "Name"
        const content = hoverText(hover);
        assert.ok(!content.includes('Attribute: NAME'),
            `Should not show the NAME attribute card; got: ${content}`);
        assert.ok(!content.toUpperCase().includes('RETURNS THE FILENAME'),
            `Should not show the builtin NAME() function card; got: ${content}`);
    });

    test('does not show the builtin NAME() card for USE(Name.First) on an ENTRY', async () => {
        const code = `MyWin WINDOW
  ENTRY(@s10),AT(10,10,50,10),USE(Name.First)
END`;
        const doc = TextDocument.create('test://name-dotted.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 36)); // inside "Name"
        const content = hoverText(hover);
        assert.ok(!content.toUpperCase().includes('RETURNS THE FILENAME'),
            `Should not show the builtin NAME() function card; got: ${content}`);
    });

    test('negative sentinel — a genuine NAME(file) call still shows the builtin doc card', async () => {
        const code = `MyProc PROCEDURE()
CODE
  MESSAGE(NAME(SomeFile))`;
        const doc = TextDocument.create('test://name-genuine-builtin.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(2, 12)); // inside "NAME("
        const content = hoverText(hover);
        assert.ok(content.toUpperCase().includes('RETURNS THE FILENAME'),
            `A genuine NAME(file) call must still show the builtin doc card; got: ${content}`);
    });
});

// HIDE, DISABLE, TYPE, and MODULE are a FOURTH occurrence, through a THIRD
// resolver: HoverRouter.handleSpecialKeywords runs at step 1 — before routine,
// procedure, and variable resolution even start — and originally decided
// attribute-vs-builtin (or keyword-vs-attribute for MODULE) using only a single
// coarse boolean (isInWindowContext / isInMapBlock), with no dot-base,
// paren-nesting, or declaration-context awareness at all. That made these four
// words misfire far more broadly than FILTER/NAME: even a PLAIN, undotted,
// unnested local variable named Type/Hide/Disable, anywhere outside (or, for
// TYPE, inside) a WINDOW/REPORT, always showed the wrong card.
suite('HoverProvider — HIDE/DISABLE/TYPE/MODULE special-keyword collisions', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        if (!hover) return '';
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    test('a plain local variable named Type shows its own hover, not the TYPE attribute', async () => {
        const code = `MyProc PROCEDURE()
Type LONG
CODE
  x = Type`;
        const doc = TextDocument.create('test://type-plain-var.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(3, 6)); // inside "Type"
        const content = hoverText(hover);
        assert.ok(!content.includes('(Attribute)') && !content.includes('(Procedure)'),
            `Should show the local variable, not an attribute/builtin card; got: ${content}`);
        assert.ok(content.includes('Local procedure variable'),
            `Should resolve as the local variable; got: ${content}`);
    });

    test('a plain local variable named Hide shows its own hover, not the HIDE builtin', async () => {
        const code = `MyProc PROCEDURE()
Hide LONG
CODE
  x = Hide`;
        const doc = TextDocument.create('test://hide-plain-var.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(3, 6)); // inside "Hide"
        const content = hoverText(hover);
        assert.ok(content.includes('Local procedure variable'),
            `Should resolve as the local variable; got: ${content}`);
    });

    test('a plain local variable named Disable shows its own hover, not the DISABLE builtin', async () => {
        const code = `MyProc PROCEDURE()
Disable LONG
CODE
  x = Disable`;
        const doc = TextDocument.create('test://disable-plain-var.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(3, 6)); // inside "Disable"
        const content = hoverText(hover);
        assert.ok(content.includes('Local procedure variable'),
            `Should resolve as the local variable; got: ${content}`);
    });

    test('does not show the HIDE attribute card for USE(Hide.Something) on an ENTRY', async () => {
        const code = `MyWin WINDOW
  ENTRY(@s10),AT(10,10,50,10),USE(Hide.Something)
END`;
        const doc = TextDocument.create('test://hide-dotted.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 36)); // inside "Hide"
        const content = hoverText(hover);
        assert.ok(!content.includes('(Attribute)'),
            `Should not show the HIDE attribute card; got: ${content}`);
    });

    test('does not show the DISABLE attribute card for USE(Disable.Something) on an ENTRY', async () => {
        const code = `MyWin WINDOW
  ENTRY(@s10),AT(10,10,50,10),USE(Disable.Something)
END`;
        const doc = TextDocument.create('test://disable-dotted.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 36)); // inside "Disable"
        const content = hoverText(hover);
        assert.ok(!content.includes('(Attribute)'),
            `Should not show the DISABLE attribute card; got: ${content}`);
    });

    test('does not show the TYPE builtin card for a bare USE(Type) on an ENTRY', async () => {
        const code = `MyWin WINDOW
  ENTRY(@s10),AT(10,10,50,10),USE(Type)
END`;
        const doc = TextDocument.create('test://type-bare-nested.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 36)); // inside "Type"
        const content = hoverText(hover);
        assert.ok(!content.includes('(Procedure)') && !content.includes('(Attribute)'),
            `Should not show either the TYPE attribute or builtin card; got: ${content}`);
    });

    test('does not show the MODULE attribute card for a dotted Module.Something reference outside a MAP block', async () => {
        const code = `MyProc PROCEDURE()
CODE
  x = Module.Something`;
        const doc = TextDocument.create('test://module-dotted.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(2, 6)); // inside "Module"
        const content = hoverText(hover);
        assert.ok(!content.includes('(Attribute)'),
            `Should not show the MODULE attribute card; got: ${content}`);
    });

    test('does not show the MODULE attribute card for Module used as a plain call argument outside a MAP block', async () => {
        const code = `MyProc PROCEDURE()
CODE
  SomeCall(Module)`;
        const doc = TextDocument.create('test://module-bare-nested.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(2, 12)); // inside "Module"
        const content = hoverText(hover);
        assert.ok(!content.includes('(Attribute)'),
            `Should not show the MODULE attribute card; got: ${content}`);
    });

    test('negative sentinel — a genuine bare HIDE attribute on a control still shows its doc card', async () => {
        const code = `MyWin WINDOW
  BUTTON('X'),AT(10,10,50,10),HIDE
END`;
        const doc = TextDocument.create('test://hide-genuine-attr.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 32)); // inside "HIDE"
        const content = hoverText(hover);
        assert.ok(content.includes('HIDE') && content.includes('(Attribute)'),
            `A genuine bare HIDE attribute must still show its doc card; got: ${content}`);
    });

    test('negative sentinel — a genuine HIDE(?Control) builtin call still shows its doc card', async () => {
        const code = `MyProc PROCEDURE()
CODE
  HIDE(?List)`;
        const doc = TextDocument.create('test://hide-genuine-call.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(2, 4)); // inside "HIDE"
        const content = hoverText(hover);
        assert.ok(content.includes('HIDE') && content.includes('(Procedure)'),
            `A genuine HIDE(...) builtin call must still show its doc card; got: ${content}`);
    });

    test('negative sentinel — a genuine bare TYPE attribute on GROUP,TYPE still shows its doc card', async () => {
        const code = `MyGroup GROUP,TYPE
Field1 LONG
       END`;
        const doc = TextDocument.create('test://type-genuine-attr.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(0, 15)); // inside "TYPE"
        const content = hoverText(hover);
        assert.ok(content.includes('TYPE') && content.includes('(Attribute)'),
            `A genuine bare TYPE attribute on GROUP,TYPE must still show its doc card; got: ${content}`);
    });

    test('negative sentinel — a genuine TYPE(string) builtin call inside a REPORT still shows its doc card', async () => {
        const code = `MyRep REPORT
  DETAIL
    STRING(TYPE('x'))
  END
END`;
        const doc = TextDocument.create('test://type-genuine-call.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(2, 12)); // inside "TYPE("
        const content = hoverText(hover);
        assert.ok(content.includes('TYPE') && content.includes('(Procedure)'),
            `A genuine TYPE(string) builtin call must still show its doc card; got: ${content}`);
    });

    test('negative sentinel — a genuine MODULE attribute on a CLASS declaration line still shows its doc card', async () => {
        const code = `MyClass CLASS,MODULE('MyClass.clw')
END`;
        const doc = TextDocument.create('test://module-genuine-attr.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(0, 16)); // inside "MODULE"
        const content = hoverText(hover);
        assert.ok(content.includes('MODULE') && content.includes('(Attribute)'),
            `A genuine MODULE attribute on a CLASS line must still show its doc card; got: ${content}`);
    });

    test('negative sentinel — an attribute closed by a period END-terminator keeps its doc card', async () => {
        // `.` is Clarion's END shorthand as well as the member-access separator, so
        // `...,HIDE.` is a bare attribute closing the WINDOW, NOT `Hide.member`.
        const code = `MyWin WINDOW
  BUTTON('X'),AT(10,10,50,10),HIDE.`;
        const doc = TextDocument.create('test://hide-period-terminator.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 32)); // inside "HIDE"
        const content = hoverText(hover);
        assert.ok(content.includes('HIDE') && content.includes('(Attribute)'),
            `A bare HIDE attribute closed by a period terminator must still show its doc card; got: ${content}`);
    });

    test('negative sentinel — a genuine MODULE keyword inside a MAP block still shows its doc card', async () => {
        const code = `MyMap MAP
  MODULE('somefile.clw')
    ExternalProc PROCEDURE()
  END
END`;
        const doc = TextDocument.create('test://module-genuine-keyword.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 4)); // inside "MODULE"
        const content = hoverText(hover);
        assert.ok(content.includes('MODULE') && content.includes('(Keyword)'),
            `A genuine MODULE keyword inside a MAP block must still show its doc card; got: ${content}`);
    });
});

// A field/variable's own DECLARATION label is a fifth, more fundamental
// occurrence of this bug class: `handleAttribute`'s declaration-context check
// asks "is this line inside a GROUP/QUEUE/CLASS/control declaration", never
// "is this word the thing being declared" — so a genuine field named e.g.
// `Create` inside a CLASS body showed the CREATE attribute's card instead of
// its own declaration. `handleBuiltin`'s bare-constant fallback had no
// declaration check at all, so ANY declaration anywhere (`Name LONG` in a
// procedure's DATA section) showed the builtin's card. Reported live via
// `USE(Name)` now hovering correctly, but the separate `Name LONG` DECLARATION
// two lines above still showing the wrong card.
suite('HoverProvider — declaration label vs. attribute/builtin collision', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        if (!hover) return '';
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    test('a local variable declared "Name LONG" hovers as the variable, not the NAME builtin', async () => {
        const code = `MyProc PROCEDURE()
Name LONG
CODE
  x = 1`;
        const doc = TextDocument.create('test://name-declaration.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 2)); // inside "Name"
        const content = hoverText(hover);
        assert.ok(content.includes('Local procedure variable'),
            `Should resolve the declaration as the local variable; got: ${content}`);
        assert.ok(!content.toUpperCase().includes('RETURNS THE FILENAME'),
            `Should not show the NAME builtin's card; got: ${content}`);
    });

    test('a local variable declared "Clip LONG" hovers as the variable, not the CLIP builtin', async () => {
        const code = `MyProc PROCEDURE()
Clip LONG
CODE
  x = 1`;
        const doc = TextDocument.create('test://clip-declaration.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 2)); // inside "Clip"
        const content = hoverText(hover);
        assert.ok(content.includes('Local procedure variable'),
            `Should resolve the declaration as the local variable; got: ${content}`);
    });

    test('a CLASS property declared "Create LONG" hovers as the property, not the CREATE attribute', async () => {
        // This is the deeper case: the declaration line genuinely IS inside a
        // declaration context (a CLASS body), so handleAttribute's
        // inDeclarationContext check alone can't tell this apart from a real
        // CREATE attribute application — only checking whether Create is the
        // token BEING DECLARED (not applied) can.
        const code = `MyClass CLASS
Create LONG
       END`;
        const doc = TextDocument.create('test://create-class-property.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 2)); // inside "Create"
        const content = hoverText(hover);
        assert.ok(content.includes('Class property'),
            `Should resolve as the class property, not the attribute; got: ${content}`);
        assert.ok(!content.includes('Attribute: CREATE'),
            `Should not show the CREATE attribute card; got: ${content}`);
    });

    test('negative sentinel — a genuine bare CREATE attribute (not a declaration) still shows its doc card', async () => {
        const code = `MyWin WINDOW
  OLECtrl OLE,AT(0,0,100,100),CREATE
END`;
        const doc = TextDocument.create('test://create-genuine-attr.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 32)); // inside "CREATE"
        const content = hoverText(hover);
        assert.ok(content.includes('Attribute: CREATE'),
            `A genuine bare CREATE attribute must still show its doc card; got: ${content}`);
    });

    test('negative sentinel — a genuine CREATE(file) builtin call (not a declaration) still shows its doc card', async () => {
        const code = `MyProc PROCEDURE()
CODE
  CREATE(MyFile)`;
        const doc = TextDocument.create('test://create-genuine-call.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(2, 4)); // inside "CREATE"
        const content = hoverText(hover);
        assert.ok(content.includes('Built-in Function: CREATE'),
            `A genuine CREATE(...) builtin call must still show its doc card; got: ${content}`);
    });
});
