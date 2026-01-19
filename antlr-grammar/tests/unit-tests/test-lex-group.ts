import { CharStream, CommonTokenStream } from 'antlr4ng';
import { ClarionLexer } from '../../generated/ClarionLexer';
import { ClarionParser } from '../../generated/ClarionParser';

const content = `    loop x = 1 to self._dataEnd by 5
  
    END
`;

console.log('Input:');
console.log(content);
console.log('\n--- PARSING ---\n');

const inputStream = CharStream.fromString(content);
const lexer = new ClarionLexer(inputStream);
const tokenStream = new CommonTokenStream(lexer);
const parser = new ClarionParser(tokenStream);

// Don't suppress errors - we want to see them!
// parser.removeErrorListeners();

const tree = parser.loopStatement();

console.log('\nParse tree:', tree.toStringTree(parser).substring(0, 500));
console.log('\nStart:', tree.start?.line, ':', tree.start?.column);
console.log('Stop:', tree.stop?.line, ':', tree.stop?.column);
console.log('Stop token type:', tree.stop?.type);
console.log('Stop token text:', tree.stop?.text);

