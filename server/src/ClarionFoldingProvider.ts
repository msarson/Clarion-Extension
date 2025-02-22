import { FoldingRange, FoldingRangeKind } from "vscode-languageserver-types";
import { Token, TokenType } from "./ClarionTokenizer";

class ClarionFoldingProvider {
    private tokens: Token[];
    private foldingRanges: FoldingRange[];
    private logMessage: (message: string) => void;

    constructor(tokens: Token[], logMessage: (message: string) => void) {
        this.tokens = tokens;
        this.foldingRanges = [];
        this.logMessage = logMessage;
    }

    public testStartEndProceduresAndRoutines(): void {
        this.logMessage("🔍 [DEBUG] Testing start/end of PROCEDUREs and ROUTINEs");
    
        let openProcedure: { startLine: number } | null = null;
        let openRoutine: { startLine: number } | null = null;
        let insideClassOrInterfaceOrMap = false;  // ✅ Track if inside a CLASS, INTERFACE, or MAP
    
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            const upperValue = token.value.toUpperCase();
    
            // ✅ Detect entering a CLASS, INTERFACE, or MAP
            if (token.type === TokenType.Structure && ["CLASS", "INTERFACE", "MAP"].includes(upperValue)) {
                insideClassOrInterfaceOrMap = true;
                this.logMessage(`🔍 [DEBUG] Entering ${upperValue} at line ${token.line}`);
            }
    
            // ✅ Detect exiting a CLASS, INTERFACE, or MAP (assuming it ends at "END")
            if (token.type === TokenType.Keyword && upperValue === "END" && insideClassOrInterfaceOrMap) {
                insideClassOrInterfaceOrMap = false;
                this.logMessage(`🔍 [DEBUG] Exiting CLASS, INTERFACE, or MAP at line ${token.line}`);
            }
    
            // ✅ Detect PROCEDURE (closes if another PROCEDURE or ROUTINE is found)
            if (token.type === TokenType.Keyword && upperValue === "PROCEDURE") {
                // ❌ Skip procedures inside CLASS, INTERFACE, or MAP
                if (insideClassOrInterfaceOrMap) {
                    this.logMessage(`⚠️ [DEBUG] Skipping PROCEDURE at line ${token.line} (Inside CLASS/INTERFACE/MAP)`);
                    continue;
                }
    
                // ✅ Close previous PROCEDURE if it exists
                if (openProcedure) {
                    this.logMessage(
                        `📌 [DEBUG] Closing PROCEDURE from line ${openProcedure.startLine} to ${token.line - 1} (Next PROCEDURE found at ${token.line})`
                    );
                    this.foldingRanges.push({
                        startLine: openProcedure.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openProcedure = null;
                }
    
                // ✅ Close previous ROUTINE if it exists
                if (openRoutine) {
                    this.logMessage(
                        `📌 [DEBUG] Closing ROUTINE from line ${openRoutine.startLine} to ${token.line - 1} (PROCEDURE found at ${token.line})`
                    );
                    this.foldingRanges.push({
                        startLine: openRoutine.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openRoutine = null;
                }
    
                this.logMessage(
                    `✅ [DEBUG] New PROCEDURE starts at line ${token.line} | Previous token: '${this.tokens[i - 1]?.value}' (Type: ${TokenType[this.tokens[i - 1]?.type]})`
                );
                openProcedure = { startLine: token.line };
            }
    
            // ✅ Detect ROUTINE (closes if another ROUTINE or a PROCEDURE is found)
            if (token.type === TokenType.Keyword && upperValue === "ROUTINE") {
                // ✅ Close the current PROCEDURE if a ROUTINE is found
                if (openProcedure) {
                    this.logMessage(
                        `📌 [DEBUG] Closing PROCEDURE from line ${openProcedure.startLine} to ${token.line - 1} (ROUTINE found at ${token.line})`
                    );
                    this.foldingRanges.push({
                        startLine: openProcedure.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openProcedure = null;
                }
    
                // ✅ Close the previous ROUTINE before starting a new one
                if (openRoutine) {
                    this.logMessage(
                        `📌 [DEBUG] Closing ROUTINE from line ${openRoutine.startLine} to ${token.line - 1} (Next ROUTINE found at ${token.line})`
                    );
                    this.foldingRanges.push({
                        startLine: openRoutine.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                }
    
                this.logMessage(
                    `✅ [DEBUG] New ROUTINE starts at line ${token.line} | Previous token: '${this.tokens[i - 1]?.value}' (Type: ${TokenType[this.tokens[i - 1]?.type]})`
                );
                openRoutine = { startLine: token.line };
            }
        }
    
        // ✅ Ensure last PROCEDURE closes at EOF
        if (openProcedure) {
            this.logMessage(`📌 [DEBUG] Closing last PROCEDURE from line ${openProcedure.startLine} to EOF`);
            this.foldingRanges.push({
                startLine: openProcedure.startLine,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }
    
        // ✅ Ensure last ROUTINE closes at EOF
        if (openRoutine) {
            this.logMessage(`📌 [DEBUG] Closing last ROUTINE from line ${openRoutine.startLine} to EOF`);
            this.foldingRanges.push({
                startLine: openRoutine.startLine,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }
    
        this.logMessage("✅ [DEBUG] Completed testStartEndProceduresAndRoutines");
    }
    
    
    public computeFoldingRanges(): FoldingRange[] {
        this.logMessage("🔍 [DEBUG] Starting computeFoldingRanges");
    
        this.foldingRanges = [];
    
        // ✅ Handle STRUCTURE folding by tracking start and closing on END
        let structureStack: { type: string; startLine: number }[] = [];
    
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            const upperValue = token.value.toUpperCase();
    
            // ✅ Detect STRUCTURE start
            if (token.type === TokenType.Structure) {
                this.logMessage(`✅ [DEBUG] Found STRUCTURE '${upperValue}' starting at line ${token.line}`);
                structureStack.push({ type: upperValue, startLine: token.line });
            }
    
            // ✅ Detect END and close last opened STRUCTURE
            if (token.type === TokenType.Keyword && upperValue === "END" && structureStack.length > 0) {
                const lastStructure = structureStack.pop();
                if (lastStructure) {
                    this.logMessage(`📌 [DEBUG] Closing STRUCTURE '${lastStructure.type}' from line ${lastStructure.startLine} to ${token.line}`);
                    this.foldingRanges.push({
                        startLine: lastStructure.startLine,
                        endLine: token.line,
                        kind: FoldingRangeKind.Region
                    });
                }
            }
        }
    
        // ✅ Close any remaining open STRUCTURE at EOF
        while (structureStack.length > 0) {
            const lastStructure = structureStack.pop();
            this.logMessage(`📌 [DEBUG] Closing unclosed STRUCTURE '${lastStructure?.type}' from line ${lastStructure?.startLine} to EOF`);
            this.foldingRanges.push({
                startLine: lastStructure?.startLine ?? 0,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }
    
        // ✅ Handle PROCEDURE and ROUTINE folding (from test logic)
        let openProcedure: { startLine: number } | null = null;
        let openRoutine: { startLine: number } | null = null;
        let insideClassOrInterfaceOrMap = false;
    
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            const upperValue = token.value.toUpperCase();
    
            // ✅ Track when inside CLASS, INTERFACE, or MAP (so we skip their PROCEDUREs)
            if (token.type === TokenType.Structure && ["CLASS", "INTERFACE", "MAP"].includes(upperValue)) {
                insideClassOrInterfaceOrMap = true;
            }
            if (token.type === TokenType.Keyword && upperValue === "END" && insideClassOrInterfaceOrMap) {
                insideClassOrInterfaceOrMap = false;
            }
    
            // ✅ Detect PROCEDURE (closes on next PROCEDURE or ROUTINE)
            if (token.type === TokenType.Keyword && upperValue === "PROCEDURE") {
                if (insideClassOrInterfaceOrMap) continue;
    
                if (openProcedure) {
                    this.foldingRanges.push({
                        startLine: openProcedure.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openProcedure = null;
                }
    
                if (openRoutine) {
                    this.foldingRanges.push({
                        startLine: openRoutine.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openRoutine = null;
                }
    
                openProcedure = { startLine: token.line };
            }
    
            // ✅ Detect ROUTINE (closes on next ROUTINE or PROCEDURE)
            if (token.type === TokenType.Keyword && upperValue === "ROUTINE") {
                if (openProcedure) {
                    this.foldingRanges.push({
                        startLine: openProcedure.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                    openProcedure = null;
                }
    
                if (openRoutine) {
                    this.foldingRanges.push({
                        startLine: openRoutine.startLine,
                        endLine: token.line - 1,
                        kind: FoldingRangeKind.Region
                    });
                }
    
                openRoutine = { startLine: token.line };
            }
        }
    
        // ✅ Close any remaining open PROCEDURE or ROUTINE at EOF
        if (openProcedure) {
            this.foldingRanges.push({
                startLine: openProcedure.startLine,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }
        if (openRoutine) {
            this.foldingRanges.push({
                startLine: openRoutine.startLine,
                endLine: this.tokens[this.tokens.length - 1]?.line ?? 0,
                kind: FoldingRangeKind.Region
            });
        }
    
        this.logMessage("✅ [DEBUG] Folding computation finished.");
        return this.foldingRanges;
    }
    
    
}

export default ClarionFoldingProvider;
