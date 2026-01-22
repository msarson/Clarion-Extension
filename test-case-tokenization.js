const fs = require('fs');
const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');

const code = `
TestProc PROCEDURE()
  CODE
  case pLen
  of 0 to 50
    return 50
  of 51 to 255
    return 255
  end
  return
`;

console.log('Tokenizing CASE statement...\n');

const tokenizer = new ClarionTokenizer(code, 2);
const tokens = tokenizer.tokenize();

console.log('Tokens found:\n');
for (const token of tokens) {
    const tokenTypeName = ['Comment', 'String', 'Keyword', 'Directive', 'Function', 'Variable', 'Number', 'Operator', 'Class', 'Attribute', 'Property', 'Constant', 'Type', 'DataTypeParameter', 'TypeAnnotation', 'ImplicitVariable', 'Structure', 'ReferenceVariable', 'LineContinuation', 'Delimiter', 'FunctionArgumentParameter', 'PointerParameter', 'FieldEquateLabel', 'PropertyFunction', 'Unknown', 'Label', 'EndStatement', 'ClarionDocument', 'Procedure', 'Routine', 'ExecutionMarker', 'Region', 'ConditionalContinuation', 'ColorValue', 'StructureField', 'StructurePrefix', 'GlobalProcedure', 'MethodDeclaration', 'MethodImplementation', 'MapProcedure', 'InterfaceMethod', 'WindowElement', 'PictureFormat'][token.type];
    
    console.log(`Line ${token.line}: ${tokenTypeName.padEnd(20)} "${token.value}"`);
    
    if (token.children && token.children.length > 0) {
        console.log(`  └─ ${token.children.length} children`);
    }
}
