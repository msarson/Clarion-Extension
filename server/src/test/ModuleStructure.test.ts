import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('MODULE Structure Tests', () => {
    
    test('MODULE in CLASS attribute list should NOT be a structure', () => {
        const code = `MyClass CLASS,MODULE
Init PROCEDURE()
.
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find the MODULE token
        const moduleToken = tokens.find(t => t.value.toUpperCase() === 'MODULE');
        assert.ok(moduleToken, 'Should find MODULE token');
        
        // MODULE in CLASS attribute should NOT be pushed to structure stack
        // It should not have children
        assert.strictEqual(moduleToken?.children?.length || 0, 0, 
            'MODULE in CLASS attribute should not have children (not a structure)');
    });

    test('MODULE in CLASS attribute should NOT have parent', () => {
        const code = `MyClass CLASS,MODULE
Init PROCEDURE()
.
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find CLASS and MODULE tokens
        const classToken = tokens.find(t => t.value.toUpperCase() === 'CLASS' && t.type === TokenType.Structure);
        const moduleToken = tokens.find(t => t.value.toUpperCase() === 'MODULE');
        
        assert.ok(classToken, 'Should find CLASS token');
        assert.ok(moduleToken, 'Should find MODULE token');
        
        // MODULE in CLASS attribute should NOT have a parent (it's not a structure)
        assert.strictEqual(moduleToken?.parent, undefined,
            'MODULE in CLASS attribute should not have a parent');
        
        // CLASS should NOT have MODULE in its children
        const hasModuleChild = classToken?.children?.some(child => 
            child.value.toUpperCase() === 'MODULE');
        assert.ok(!hasModuleChild, 
            'CLASS should NOT have MODULE in its children array (MODULE is an attribute, not a structure)');
    });

    test('MODULE in MAP should be a structure and child of MAP', () => {
        const code = `MyMap MAP
  MODULE('Win32API')
    GetSystemMetrics(LONG),LONG,PASCAL,PROC,RAW,NAME('GetSystemMetrics')
  END
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find MAP and MODULE tokens
        const mapToken = tokens.find(t => t.value.toUpperCase() === 'MAP' && t.type === TokenType.Structure);
        const moduleToken = tokens.find(t => t.value.toUpperCase() === 'MODULE' && t.type === TokenType.Structure);
        
        assert.ok(mapToken, 'Should find MAP token');
        assert.ok(moduleToken, 'Should find MODULE token as structure');
        
        // MODULE should be a child of MAP
        assert.strictEqual(moduleToken?.parent, mapToken, 
            'MODULE should be a child of MAP structure');
        
        // MAP should have MODULE in its children
        const hasModuleChild = mapToken?.children?.some(child => 
            child.value.toUpperCase() === 'MODULE');
        assert.ok(hasModuleChild, 'MAP should have MODULE in its children array');
    });

    test('MODULE with dot terminator in MAP should be a structure', () => {
        const code = `MyMap MAP
  MODULE('MyLib.DLL').
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find MAP and MODULE tokens
        const mapToken = tokens.find(t => t.value.toUpperCase() === 'MAP' && t.type === TokenType.Structure);
        const moduleToken = tokens.find(t => t.value.toUpperCase() === 'MODULE');
        
        assert.ok(mapToken, 'Should find MAP token');
        assert.ok(moduleToken, 'Should find MODULE token');
        
        // MODULE with dot terminator should still be recognized as structure
        // but finishesAt should be same line
        assert.strictEqual(moduleToken?.finishesAt, moduleToken?.line,
            'MODULE with dot terminator should finish on same line');
    });

    test('MODULE in MAP with END should have proper parent-child relationship', () => {
        const code = `TestMap MAP
  MODULE('KERNEL32')
    Sleep(UNSIGNED),PASCAL
    GetTickCount(),UNSIGNED,PASCAL
  END
  MODULE('USER32')
    MessageBeep(LONG),LONG,PASCAL
  END
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find MAP token
        const mapToken = tokens.find(t => t.value.toUpperCase() === 'MAP' && t.type === TokenType.Structure);
        assert.ok(mapToken, 'Should find MAP token');
        
        // Find all MODULE tokens
        const moduleTokens = tokens.filter(t => 
            t.value.toUpperCase() === 'MODULE' && t.type === TokenType.Structure);
        
        assert.strictEqual(moduleTokens.length, 2, 'Should find 2 MODULE structures');
        
        // Both MODULEs should be children of MAP
        for (const moduleToken of moduleTokens) {
            assert.strictEqual(moduleToken.parent, mapToken,
                `MODULE should be child of MAP, not ${moduleToken.parent?.value || 'null'}`);
        }
        
        // MAP should have 2 MODULE children
        const moduleChildren = mapToken?.children?.filter(child => 
            child.value.toUpperCase() === 'MODULE') || [];
        assert.strictEqual(moduleChildren.length, 2, 
            'MAP should have 2 MODULE children');
    });

    test('MODULE should NOT be child of PROCEDURE', () => {
        const code = `MyProc PROCEDURE()
MyMap MAP
  MODULE('MyDLL')
    MyFunc(),LONG
  END
END
CODE
  RETURN
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find PROCEDURE, MAP, and MODULE tokens
        const procToken = tokens.find(t => 
            (t.type === TokenType.Procedure || t.subType === TokenType.Procedure));
        const mapToken = tokens.find(t => t.value.toUpperCase() === 'MAP' && t.type === TokenType.Structure);
        const moduleToken = tokens.find(t => t.value.toUpperCase() === 'MODULE' && t.type === TokenType.Structure);
        
        assert.ok(procToken, 'Should find PROCEDURE token');
        assert.ok(mapToken, 'Should find MAP token');
        assert.ok(moduleToken, 'Should find MODULE token');
        
        // MAP should be child of PROCEDURE
        assert.strictEqual(mapToken?.parent, procToken,
            'MAP should be child of PROCEDURE');
        
        // MODULE should be child of MAP, NOT PROCEDURE
        assert.strictEqual(moduleToken?.parent, mapToken,
            `MODULE should be child of MAP, not ${moduleToken?.parent?.value || 'null'}`);
        
        assert.notStrictEqual(moduleToken?.parent, procToken,
            'MODULE should NOT be child of PROCEDURE');
    });
});
