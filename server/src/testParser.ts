import fs from 'fs';
import path from 'path';
import { ClarionLexer } from './parser/ClarionLexer';
import { ClarionParser } from './parser/ClarionParser';
import { CharStream, CommonTokenStream, BaseErrorListener, Token } from 'antlr4ng';

// Track problematic tokens for focused reporting
const problemTokens = new Set<number>();

// Create a file output stream instead of using console
let outputContent: string[] = [];

// Function to write to our output array instead of console
function writeOutput(message: string, isError = false) {
  outputContent.push(message);
}

class VerboseListener extends BaseErrorListener {
  syntaxError(
    recognizer: any,
    offendingSymbol: any,
    line: number,
    column: number,
    msg: string,
    e: any
  ): void {
    const stack = recognizer.getRuleInvocationStack();
    stack.reverse();
  
    writeOutput(`\n🔴 SYNTAX ERROR @ ${line}:${column}`, true);
    writeOutput(`   ➤ Rule stack: ${stack.join(' > ')}`, true);
    writeOutput(`   ➤ Offending token: ${offendingSymbol?.text}`, true);
    writeOutput(`   ➤ Message: ${msg}`, true);
  
    if (e?.offendingToken?.text) {
      writeOutput(`   ➤ Context: '${e.offendingToken.text}'`, true);
    }
    
    // Track the problematic token index
    if (offendingSymbol && offendingSymbol.tokenIndex !== undefined) {
      problemTokens.add(offendingSymbol.tokenIndex);
      
      // Also add surrounding tokens for context (5 before and after)
      for (let i = Math.max(0, offendingSymbol.tokenIndex - 5); i <= offendingSymbol.tokenIndex + 5; i++) {
        problemTokens.add(i);
      }
    }
  
    writeOutput('', true);
  }
  
    reportAmbiguity(
      recognizer: any,
      dfa: any,
      startIndex: number,
      stopIndex: number,
      exact: boolean,
      ambigAlts: any,
      configs: any
    ): void {
      // Track token indices in the ambiguous region
      for (let i = startIndex; i <= stopIndex; i++) {
        problemTokens.add(i);
      }
      
      writeOutput(`\n⚠️ AMBIGUITY detected between indices ${startIndex}-${stopIndex}`, true);
    }

    reportAttemptingFullContext(
      recognizer: any,
      dfa: any,
      startIndex: number,
      stopIndex: number,
      conflictingAlts: any,
      configs: any
    ): void {
      // Track token indices in the full context attempt region
      for (let i = startIndex; i <= stopIndex; i++) {
        problemTokens.add(i);
      }
      
      writeOutput(`\n⚠️ ATTEMPTING FULL CONTEXT between indices ${startIndex}-${stopIndex}`, true);
    }

    reportContextSensitivity(
      recognizer: any,
      dfa: any,
      startIndex: number,
      stopIndex: number,
      prediction: number,
      configs: any
    ): void {
      // Track token indices in the context-sensitive region
      for (let i = startIndex; i <= stopIndex; i++) {
        problemTokens.add(i);
      }
      
      writeOutput(`\n⚠️ CONTEXT SENSITIVITY between indices ${startIndex}-${stopIndex}`, true);
    }
  }
  
// 🔧 Step 0: Read file from disk
const clwPath = path.join(__dirname, 'test-files', 'example.clw');
const clarionCode = fs.readFileSync(clwPath, 'utf8');

// Get the directory where example.clw is located to place our output file there
const clwDir = path.dirname(clwPath);
const outputPath = path.join(clwDir, 'testResult.txt');

// Step 1: Convert the source code into a stream of characters
const inputStream = CharStream.fromString(clarionCode);

// Step 2: Pass the stream through the lexer
const lexer = new ClarionLexer(inputStream);
const tokenStream = new CommonTokenStream(lexer);

// Step 3: Parse the token stream
const parser = new ClarionParser(tokenStream);
parser.removeErrorListeners(); // Remove default ConsoleErrorListener
parser.addErrorListener(new VerboseListener());

// Step 4: Call the entry rule (use `clarionFile` now, not `program`)
const tree = parser.clarionFile(); // ← update to match your grammar

// Step 5: Only print information about issues found
writeOutput('Parse completed. Showing only problematic tokens:');

// Fill the token stream if not already filled
tokenStream.fill();

// Check if any problems were found
if (problemTokens.size === 0) {
  writeOutput('✅ No syntax issues detected');
} else {
  writeOutput(`🔍 Found ${problemTokens.size} tokens associated with issues:`);
  
  // Only print tokens that are associated with problems
  const allTokens = tokenStream.getTokens();
  for (const tokenIndex of Array.from(problemTokens).sort((a, b) => a - b)) {
    if (tokenIndex >= 0 && tokenIndex < allTokens.length) {
      const token = allTokens[tokenIndex];
      writeOutput(
        `${parser.symbolicNames[token.type]} @ ${token.line}:${token.column} → '${token.text}'`
      );
    }
  }
}

// Write all collected output to the file
fs.writeFileSync(outputPath, outputContent.join('\n'), 'utf8');
console.log(`Results written to: ${outputPath}`);

