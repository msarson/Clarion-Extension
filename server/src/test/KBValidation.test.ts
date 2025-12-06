/**
 * Tests for new KB-based diagnostic validations
 * Tests FILE and CASE structure validation
 */

import * as assert from 'assert';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

suite('FILE Structure Validation', () => {
    
    test('should error when FILE missing DRIVER attribute', () => {
        const code = `
Customer FILE
          RECORD
CUS:ID    LONG
          END
        END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        const driverError = diagnostics.find(d => 
            d.message.includes('missing required DRIVER')
        );
        
        assert.ok(driverError, 'Should have DRIVER error');
        assert.strictEqual(driverError?.severity, DiagnosticSeverity.Error);
    });
    
    test('should error when FILE missing RECORD section', () => {
        const code = `
Customer FILE,DRIVER('TOPSPEED')
        END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        const recordError = diagnostics.find(d => 
            d.message.includes('missing required RECORD')
        );
        
        assert.ok(recordError, 'Should have RECORD error');
        assert.strictEqual(recordError?.severity, DiagnosticSeverity.Error);
    });
    
    test('should not error when FILE has both DRIVER and RECORD', () => {
        const code = `
Customer FILE,DRIVER('TOPSPEED'),CREATE
          KEY(CUS:ID),PRIMARY
          RECORD
CUS:ID    LONG
CUS:Name  STRING(50)
          END
        END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        const fileErrors = diagnostics.filter(d => 
            d.message.includes('FILE') && d.message.includes('missing')
        );
        
        assert.strictEqual(fileErrors.length, 0, 'Should not have FILE errors');
    });
});

suite('CASE Structure Validation', () => {
    
    // NOTE: CASE without OF clauses is valid in Clarion (though uncommon)
    // It will compile - nothing will execute except possibly an ELSE clause
    test('should allow CASE without OF clause', () => {
        const code = `
CODE
  CASE Choice
  ELSE
    Message('No choice')
  END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        // Should NOT have errors - CASE without OF is valid
        const caseErrors = diagnostics.filter(d => 
            d.message.includes('CASE') || d.message.includes('OF')
        );
        
        assert.strictEqual(caseErrors.length, 0, 'CASE without OF should be valid');
    });
    
    test('should error when OROF without preceding OF', () => {
        const code = `
CODE
  CASE Choice
  OROF 1
    Message('One')
  END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        const orofError = diagnostics.find(d => 
            d.message.includes('OROF must be preceded by an OF')
        );
        
        assert.ok(orofError, 'Should have OROF error');
        assert.strictEqual(orofError?.severity, DiagnosticSeverity.Error);
    });
    
    test('should not error when CASE has valid OF and OROF', () => {
        const code = `
CODE
  CASE Choice
  OF 1
    Message('One')
  OF 2
  OROF 3
    Message('Two or Three')
  ELSE
    Message('Other')
  END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        const caseErrors = diagnostics.filter(d => 
            d.message.includes('CASE') || d.message.includes('OROF')
        );
        
        assert.strictEqual(caseErrors.length, 0, 'Should not have CASE errors');
    });
    
    test('should allow CASE with just OF (no OROF)', () => {
        const code = `
CODE
  CASE UserChoice
  OF 1
    ProcessNew()
  OF 2
    ProcessEdit()
  OF 3
    ProcessDelete()
  ELSE
    Message('Invalid')
  END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        const caseErrors = diagnostics.filter(d => 
            d.message.includes('CASE') || d.message.includes('OF')
        );
        
        assert.strictEqual(caseErrors.length, 0, 'Should not have CASE/OF errors');
    });
});

suite('CHOOSE Function Recognition', () => {
    
    test('should recognize CHOOSE as a function', () => {
        const code = `
CODE
  DayName = CHOOSE(DayOfWeek, 'Sun', 'Mon', 'Tue')
  Status = CHOOSE(Score >= 60, 'Pass', 'Fail')
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        // CHOOSE should not generate any errors
        const chooseErrors = diagnostics.filter(d => 
            d.message.includes('CHOOSE')
        );
        
        assert.strictEqual(chooseErrors.length, 0, 'Should not have CHOOSE errors');
    });
});

suite('EXECUTE Structure Validation', () => {
    
    test('should warn when EXECUTE has string literal expression', () => {
        const code = `
CODE
  EXECUTE 'Hello'
    ProcessFirst()
    ProcessSecond()
  END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        const executeWarning = diagnostics.find(d => 
            d.message.includes('EXECUTE expression should evaluate to a numeric')
        );
        
        assert.ok(executeWarning, 'Should have EXECUTE warning');
        assert.strictEqual(executeWarning?.severity, DiagnosticSeverity.Warning);
    });
    
    test('should not warn when EXECUTE has valid numeric expression', () => {
        const code = `
CODE
  EXECUTE Choice
    ProcessFirst()
    ProcessSecond()
  END
        `;
        
        const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
        const diagnostics = DiagnosticProvider.validateDocument(document);
        
        const executeErrors = diagnostics.filter(d => 
            d.message.includes('EXECUTE')
        );
        
        assert.strictEqual(executeErrors.length, 0, 'Should not have EXECUTE errors');
    });
});
