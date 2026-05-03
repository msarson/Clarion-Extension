import * as assert from 'assert';
import { ClarionTokenizer, TokenType, Token } from '../ClarionTokenizer';

function tokenize(source: string): Token[] {
    return new ClarionTokenizer(source).tokenize();
}

function findProcedure(tokens: Token[], label: string): Token | undefined {
    const upper = label.toUpperCase();
    return tokens.find(t =>
        t.type === TokenType.Procedure &&
        t.label?.toUpperCase() === upper
    );
}

suite('ClarionTokenizer — procedure parameters on tokens', () => {

    test('GlobalProcedure: parameters populated', () => {
        const code = `MyProc PROCEDURE(LONG pId, STRING pName)
CODE
  RETURN
END`;
        const tokens = tokenize(code);
        const proc = findProcedure(tokens, 'MyProc');
        assert.ok(proc, 'GlobalProcedure token must be present');
        assert.strictEqual(proc!.subType, TokenType.GlobalProcedure);
        assert.ok(proc!.parameters, 'parameters[] should be populated');
        assert.strictEqual(proc!.parameters!.length, 2);
        assert.strictEqual(proc!.parameters![0].type, 'LONG');
        assert.strictEqual(proc!.parameters![0].name, 'pId');
        assert.strictEqual(proc!.parameters![1].type, 'STRING');
        assert.strictEqual(proc!.parameters![1].name, 'pName');
    });

    test('MapProcedure (inside MAP): parameters populated', () => {
        const code = `MyMap MAP
  ProcInMap PROCEDURE(LONG pCode)
END

OtherProc PROCEDURE
CODE
  RETURN
END`;
        const tokens = tokenize(code);
        const procInMap = tokens.find(t =>
            t.subType === TokenType.MapProcedure &&
            t.label?.toUpperCase() === 'PROCINMAP'
        );
        assert.ok(procInMap, 'MapProcedure token must be present');
        assert.ok(procInMap!.parameters, 'parameters[] should be populated for MapProcedure');
        assert.strictEqual(procInMap!.parameters!.length, 1);
        assert.strictEqual(procInMap!.parameters![0].type, 'LONG');
        assert.strictEqual(procInMap!.parameters![0].name, 'pCode');
    });

    test('MethodImplementation: parameters populated', () => {
        const code = `MyClass.Init PROCEDURE(*STRING pBuffer)
CODE
  RETURN
END`;
        const tokens = tokenize(code);
        const method = tokens.find(t =>
            t.subType === TokenType.MethodImplementation &&
            t.label?.toUpperCase() === 'MYCLASS.INIT'
        );
        assert.ok(method, 'MethodImplementation token must be present');
        assert.ok(method!.parameters, 'parameters[] should be populated for MethodImplementation');
        assert.strictEqual(method!.parameters!.length, 1);
        assert.strictEqual(method!.parameters![0].byRef, true);
        assert.strictEqual(method!.parameters![0].type, 'STRING');
        assert.strictEqual(method!.parameters![0].name, 'pBuffer');
    });

    test('MethodDeclaration (in CLASS): parameters populated', () => {
        const code = `MyClass CLASS,TYPE
  Run PROCEDURE(<LONG pFlags = 0>)
END`;
        const tokens = tokenize(code);
        const decl = tokens.find(t =>
            t.subType === TokenType.MethodDeclaration &&
            t.label?.toUpperCase() === 'RUN'
        );
        assert.ok(decl, 'MethodDeclaration token must be present');
        assert.ok(decl!.parameters, 'parameters[] should be populated for MethodDeclaration');
        assert.strictEqual(decl!.parameters!.length, 1);
        assert.strictEqual(decl!.parameters![0].optional, true);
        assert.strictEqual(decl!.parameters![0].type, 'LONG');
        assert.strictEqual(decl!.parameters![0].name, 'pFlags');
        assert.strictEqual(decl!.parameters![0].default, '0');
    });

    test('InterfaceMethod: parameters populated', () => {
        const code = `IRunnable INTERFACE,TYPE
  Run PROCEDURE(LONG pToken)
END`;
        const tokens = tokenize(code);
        const m = tokens.find(t =>
            t.subType === TokenType.InterfaceMethod &&
            t.label?.toUpperCase() === 'RUN'
        );
        assert.ok(m, 'InterfaceMethod token must be present');
        assert.ok(m!.parameters, 'parameters[] should be populated for InterfaceMethod');
        assert.strictEqual(m!.parameters!.length, 1);
        assert.strictEqual(m!.parameters![0].type, 'LONG');
        assert.strictEqual(m!.parameters![0].name, 'pToken');
    });

    test('Procedure with NO parameters: parameters = []', () => {
        const code = `Bare PROCEDURE
CODE
  RETURN
END`;
        const tokens = tokenize(code);
        const proc = findProcedure(tokens, 'Bare');
        assert.ok(proc);
        // Either undefined or [] is acceptable for "no parameters", but the parser
        // returns [] when the line has no `(...)` group at all.
        assert.deepStrictEqual(proc!.parameters ?? [], []);
    });

    test('Procedure with empty parens: parameters = []', () => {
        const code = `EmptyParen PROCEDURE()
CODE
  RETURN
END`;
        const tokens = tokenize(code);
        const proc = findProcedure(tokens, 'EmptyParen');
        assert.ok(proc);
        assert.deepStrictEqual(proc!.parameters, []);
    });

    test('ROUTINE tokens are NOT given parameters', () => {
        const code = `Owner PROCEDURE
CODE
DoOne ROUTINE
  RETURN`;
        const tokens = tokenize(code);
        const routine = tokens.find(t => t.subType === TokenType.Routine);
        assert.ok(routine, 'ROUTINE token must be present');
        assert.strictEqual(routine!.parameters, undefined,
            'parameters[] must remain unset on ROUTINE tokens');
    });

    test('Multi-line declaration with | continuation: full parameter list captured', () => {
        const code = `Spanning PROCEDURE(LONG pId, |
                  STRING pName, |
                  REAL pAmount)
CODE
  RETURN
END`;
        const tokens = tokenize(code);
        const proc = findProcedure(tokens, 'Spanning');
        assert.ok(proc, 'Procedure token must be present');
        assert.ok(proc!.parameters, 'parameters[] should be populated');
        assert.strictEqual(proc!.parameters!.length, 3,
            `expected 3 params from joined declaration, got ${proc!.parameters!.length}`);
        assert.strictEqual(proc!.parameters![0].name, 'pId');
        assert.strictEqual(proc!.parameters![1].name, 'pName');
        assert.strictEqual(proc!.parameters![2].name, 'pAmount');
    });

    test('Overloaded procedures: each overload gets its own parameters', () => {
        const code = `MyClass.Run PROCEDURE()
CODE
  RETURN
END

MyClass.Run PROCEDURE(LONG pFlags)
CODE
  RETURN
END`;
        const tokens = tokenize(code);
        const overloads = tokens.filter(t =>
            t.subType === TokenType.MethodImplementation &&
            t.label?.toUpperCase() === 'MYCLASS.RUN'
        );
        assert.strictEqual(overloads.length, 2);
        // Sort by line so we have a stable order for assertions.
        overloads.sort((a, b) => a.line - b.line);
        assert.deepStrictEqual(overloads[0].parameters, []);
        assert.strictEqual(overloads[1].parameters?.length, 1);
        assert.strictEqual(overloads[1].parameters![0].type, 'LONG');
        assert.strictEqual(overloads[1].parameters![0].name, 'pFlags');
    });
});
