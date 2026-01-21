import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range, Position } from 'vscode-languageserver/node';
import { CharStream, CommonTokenStream, RecognitionException } from 'antlr4ng';
import { ClarionLexer } from '../generated/ClarionLexer';
import { ClarionParser } from '../generated/ClarionParser';
import { ClarionPreprocessor } from '../utils/ClarionPreprocessor';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("AntlrDiagnosticProvider");

/**
 * ANTLR-based Diagnostic Provider for Clarion Language
 * Uses ANTLR parser to detect syntax errors and provide diagnostics
 */
export class AntlrDiagnosticProvider {
    
    /**
     * Validate a Clarion document using ANTLR parser and return diagnostics
     * @param document - TextDocument to validate
     * @returns Array of Diagnostic objects
     */
    public static validateDocument(document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        
        try {
            const code = document.getText();
            
            // Preprocess COMPILE/OMIT directives
            const preprocessResult = ClarionPreprocessor.preprocess(code);
            const processedCode = preprocessResult.transformedText;
            
            // Create ANTLR input stream
            const inputStream = CharStream.fromString(processedCode);
            const lexer = new ClarionLexer(inputStream);
            const tokenStream = new CommonTokenStream(lexer);
            const parser = new ClarionParser(tokenStream);
            
            // Remove default error listeners and add our own
            parser.removeErrorListeners();
            lexer.removeErrorListeners();
            
            const errors: Array<{
                line: number;
                column: number;
                message: string;
                offendingSymbol?: any;
            }> = [];
            
            // Custom error listener
            const errorListener = {
                syntaxError: (recognizer: any, offendingSymbol: any, line: number, charPositionInLine: number, msg: string, e: any) => {
                    errors.push({ line, column: charPositionInLine, message: msg, offendingSymbol });
                },
                reportAmbiguity: () => {},
                reportAttemptingFullContext: () => {},
                reportContextSensitivity: () => {}
            };
            
            parser.addErrorListener(errorListener);
            lexer.addErrorListener(errorListener);
            
            // Parse the document
            parser.compilationUnit();
            
            // Convert ANTLR errors to VS Code diagnostics
            for (const error of errors) {
                const line = error.line - 1; // VS Code is 0-based
                const column = error.column;
                
                // Try to get the length of the offending token
                let endColumn = column + 1;
                if (error.offendingSymbol && error.offendingSymbol.text) {
                    endColumn = column + error.offendingSymbol.text.length;
                }
                
                const range: Range = {
                    start: Position.create(line, column),
                    end: Position.create(line, endColumn)
                };
                
                const diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Error,
                    range: range,
                    message: `Syntax error: ${error.message}`,
                    source: 'clarion-antlr'
                };
                
                diagnostics.push(diagnostic);
            }
            
            logger.debug(`ANTLR validation found ${diagnostics.length} errors`);
            
        } catch (error) {
            logger.error(`Error in ANTLR validation: ${error instanceof Error ? error.message : String(error)}`);
            // Don't add diagnostics for internal errors
        }
        
        return diagnostics;
    }
}
