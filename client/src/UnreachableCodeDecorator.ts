import * as vscode from 'vscode';
import LoggerManager from './utils/LoggerManager';

const logger = LoggerManager.getLogger("UnreachableCodeDecorator");
logger.setLevel("error");

/**
 * Detects and visually dims unreachable code in Clarion procedures and methods.
 * 
 * PHASE 1 - STRICT CLARION SEMANTICS:
 * - Detects code after unconditional RETURN/EXIT/HALT at top execution level
 * - Does NOT analyze conditionals, loops, or control flow
 * - Does NOT mark code inside ROUTINE blocks as unreachable
 * - STOP is NOT treated as a terminator (user may continue execution)
 */
export class UnreachableCodeDecorator {
    private decorationType: vscode.TextEditorDecorationType;
    private enabled: boolean = true;
    private activeEditor: vscode.TextEditor | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Create decoration type for dimming unreachable code
        this.decorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0.4',
            textDecoration: 'none; opacity: 0.4'
        });

        // Initial load of settings
        this.updateFromSettings();
        
        // Watch for settings changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('clarion.unreachableCode')) {
                    this.updateFromSettings();
                    this.updateDecorations();
                }
            })
        );
        
        // Watch for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.activeEditor = editor;
                this.updateDecorations();
            })
        );
        
        // Watch for document changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (this.activeEditor && event.document === this.activeEditor.document) {
                    this.updateDecorations();
                }
            })
        );
        
        // Set initial active editor
        this.activeEditor = vscode.window.activeTextEditor;
        this.updateDecorations();
    }
    
    private updateFromSettings(): void {
        this.enabled = vscode.workspace.getConfiguration().get<boolean>('clarion.unreachableCode.enabled', true);
        
        if (!this.enabled) {
            logger.info('Unreachable code detection is disabled');
            this.clearDecorations();
        }
    }
    
    private updateDecorations(): void {
        if (!this.activeEditor || !this.enabled) {
            return;
        }
        
        const document = this.activeEditor.document;
        
        // Skip non-Clarion files
        if (document.languageId !== 'clarion' && 
            !document.fileName.toLowerCase().endsWith('.clw') &&
            !document.fileName.toLowerCase().endsWith('.inc') &&
            !document.fileName.toLowerCase().endsWith('.equ') &&
            !document.fileName.toLowerCase().endsWith('.eq') &&
            !document.fileName.toLowerCase().endsWith('.int')) {
            return;
        }
        
        const ranges = this.detectUnreachableCode(document);
        this.activeEditor.setDecorations(this.decorationType, ranges);
        
        if (ranges.length > 0) {
            logger.info(`Applied ${ranges.length} unreachable code decorations`);
        }
    }
    
    /**
     * Detects unreachable code in a Clarion document using linear scan.
     * 
     * CLARION SEMANTICS:
     * - PROCEDURE/METHOD execution begins at CODE, ends at RETURN/EXIT/HALT
     * - ROUTINE blocks are ALWAYS reachable (not part of linear flow)
     * - Only top-level terminators create unreachable code (not inside IF/CASE/LOOP)
     * - Another PROCEDURE/METHOD declaration ends the current procedure
     */
    private detectUnreachableCode(document: vscode.TextDocument): vscode.Range[] {
        const ranges: vscode.Range[] = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        
        let inProcedure = false;
        let inCode = false;
        let terminated = false;
        let structureDepth = 0;
        let inRoutine = false;
        
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const trimmedLine = line.trim();
            const upperLine = trimmedLine.toUpperCase();
            
            // Skip empty lines and full-line comments
            if (!trimmedLine || upperLine.startsWith('!')) {
                continue;
            }
            
            // Remove inline comments for analysis
            const codeOnly = this.removeInlineComment(trimmedLine);
            const upperCode = codeOnly.toUpperCase();
            
            // Check for PROCEDURE or METHOD declaration
            if (this.isProcedureOrMethodDeclaration(upperCode)) {
                // Reset state for new procedure/method
                inProcedure = true;
                inCode = false;
                terminated = false;
                structureDepth = 0;
                inRoutine = false;
                continue;
            }
            
            // Check for ROUTINE declaration
            if (this.isRoutineDeclaration(upperCode)) {
                // ROUTINE is always reachable, reset termination state
                inRoutine = true;
                terminated = false;
                structureDepth = 0;
                continue;
            }
            
            // Check for CODE marker
            if (this.isCodeMarker(upperCode) && inProcedure) {
                inCode = true;
                if (inRoutine) {
                    // CODE inside ROUTINE - it's reachable
                    terminated = false;
                }
                continue;
            }
            
            // Check for DATA marker (inside ROUTINE)
            if (this.isDataMarker(upperCode)) {
                // DATA sections are never executable
                continue;
            }
            
            // Track structure depth to ensure we only detect top-level terminators
            // Update depth BEFORE checking for terminators
            if (inCode && !inRoutine) {
                const depthChange = this.getStructureDepthChange(upperCode);
                structureDepth += depthChange;
                
                // Ensure depth never goes negative
                if (structureDepth < 0) {
                    structureDepth = 0;
                }
            }
            
            // Check for terminator at top level (AFTER updating depth)
            if (inCode && !terminated && structureDepth === 0 && !inRoutine) {
                if (this.isUnconditionalTerminator(upperCode)) {
                    terminated = true;
                    continue;
                }
            }
            
            // Mark unreachable code
            if (terminated && inCode && !inRoutine) {
                // This line is unreachable
                const startPos = new vscode.Position(lineNum, 0);
                const endPos = new vscode.Position(lineNum, line.length);
                ranges.push(new vscode.Range(startPos, endPos));
            }
        }
        
        return ranges;
    }
    
    private removeInlineComment(line: string): string {
        const commentIndex = line.indexOf('!');
        if (commentIndex >= 0) {
            return line.substring(0, commentIndex).trim();
        }
        return line;
    }
    
    private isProcedureOrMethodDeclaration(upperCode: string): boolean {
        // Match PROCEDURE, METHOD, or FUNCTION declarations
        // Examples: "MyProc PROCEDURE()", "ThisWindow.Init PROCEDURE", "MyFunc FUNCTION"
        return /\bPROCEDURE\b/.test(upperCode) || /\bMETHOD\b/.test(upperCode) || /\bFUNCTION\b/.test(upperCode);
    }
    
    private isRoutineDeclaration(upperCode: string): boolean {
        // Match ROUTINE declarations
        // Example: "MyRoutine ROUTINE"
        return /\bROUTINE\b/.test(upperCode);
    }
    
    private isCodeMarker(upperCode: string): boolean {
        // CODE marker at start of execution section
        return upperCode === 'CODE' || upperCode.startsWith('CODE ');
    }
    
    private isDataMarker(upperCode: string): boolean {
        // DATA marker for local data section
        return upperCode === 'DATA' || upperCode.startsWith('DATA ');
    }
    
    private isUnconditionalTerminator(upperCode: string): boolean {
        // Check for RETURN, EXIT, or HALT (not STOP)
        // Must be a standalone statement, not inside another statement
        const trimmed = upperCode.trim();
        
        // Match standalone RETURN, EXIT, or HALT
        return /^(RETURN|EXIT|HALT)(\s|$|\(|;|!)/.test(trimmed);
    }
    
    /**
     * Tracks structure depth to identify top-level vs nested statements.
     * Returns: +1 for structure start, -1 for structure end, 0 for no change
     */
    private getStructureDepthChange(upperCode: string): number {
        let change = 0;
        
        // Structure starters (keywords that require END or dot termination)
        if (/\b(IF|LOOP|CASE|ACCEPT|EXECUTE|BEGIN)\b/.test(upperCode)) {
            change++;
        }
        
        // Structure enders
        // END keyword always ends a structure
        if (/\bEND\b/.test(upperCode)) {
            change--;
        }
        
        // Dot (.) ends a structure ONLY if it's alone or starts the line
        // A dot at the end of a statement (like "RETURN.") is NOT a structure ender
        if (/^\s*\.\s*$/.test(upperCode)) {
            change--;
        }
        
        // Handle single-line IF (IF condition THEN action)
        // This doesn't increase depth because it doesn't require END
        // CRITICAL: Only compensate if there's an action AFTER THEN on the same line
        // Multi-line IF like "IF x THEN" (with action on next line) should NOT be compensated
        if (/\bIF\b.*\bTHEN\b/.test(upperCode) && !/\bEND\b/.test(upperCode)) {
            // Check if there's actual code after THEN (not just whitespace/comment)
            const thenMatch = /\bTHEN\b\s*(.*)/.exec(upperCode);
            if (thenMatch && thenMatch[1]) {
                const afterThen = thenMatch[1].replace(/!.*$/, '').trim(); // Remove comments
                if (afterThen.length > 0) {
                    // Single-line IF with action after THEN
                    change--; // Compensate for the IF increment
                }
            }
        }
        
        return change;
    }
    
    private clearDecorations(): void {
        if (this.activeEditor) {
            this.activeEditor.setDecorations(this.decorationType, []);
        }
    }
    
    public dispose(): void {
        this.decorationType.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
