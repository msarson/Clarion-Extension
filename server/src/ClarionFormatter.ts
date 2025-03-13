import { Token, TokenType } from "./ClarionTokenizer";
import LoggerManager from "./logger";
import { FormattingOptions } from 'vscode-languageserver';

const logger = LoggerManager.getLogger("Formatter");
logger.setLevel("info");

class ClarionFormatter {
    private tokens: Token[];
    private text: string;
    private lines: string[];
    private indentSize: number = 4; // Default indent size
    private labelLines: Set<number> = new Set();
    private structureStartColumns: Map<number, number> = new Map();
    private structureEndLines: Map<number, number> = new Map();
    private statementIndentation: Map<number, number> = new Map();
    private structureMaxLabelLength: Map<number, number> = new Map();
    // private insideCodeBlock: boolean = false;
    // private codeIndentColumn: number = 2;
    private structureStack: { startLine: number; column: number; maxLabelLength: number, nestingLevel: number, type: string }[] = [];
    private executionCodeSections: Set<number> = new Set(); // Track lines that are in execution code sections
    // Constants for base indentation
    private readonly BASE_STRUCTURE_INDENT = 2;
    // private readonly STATEMENT_INDENT_OFFSET = 2;

    constructor(tokens: Token[], text: string, options?: { indentSize?: number, formattingOptions?: FormattingOptions }) {
        this.tokens = tokens;
        this.text = text;
        this.lines = text.split(/\r?\n/);

        // First check for explicit indentSize
        if (options?.indentSize !== undefined) {
            this.indentSize = options.indentSize;
        }
        // Then check for VS Code formatting options
        else if (options?.formattingOptions?.tabSize !== undefined) {
            this.indentSize = options.formattingOptions.tabSize;
            logger.info(`Using editor tab size: ${this.indentSize}`);
        }

        this.identifyLabelLines();
        this.identifyExecutionCodeSections();
        this.calculateStructureIndentation();
    }

    private identifyLabelLines(): void {
        for (const token of this.tokens) {
            if (token.type === TokenType.Label) {
                this.labelLines.add(token.line);
                logger.info(`📌 Identified label at line ${token.line}: ${token.value}`);
            }
        }
    }

    private identifyExecutionCodeSections(): void {
        // Track procedure and routine boundaries and their CODE marker positions
        const procedureBoundaries: { start: number, end: number, codeMarkerIndent?: number }[] = [];
        const routineBoundaries: { start: number, end: number, hasDataMarker: boolean, codeMarkerIndent?: number }[] = [];
        
        // First pass: identify all procedures and routines
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            
            if (token.subType === TokenType.Procedure && token.finishesAt !== undefined) {
                procedureBoundaries.push({ 
                    start: token.line, 
                    end: token.finishesAt 
                });
                logger.info(`📊 Found PROCEDURE from line ${token.line} to ${token.finishesAt}`);
            } else if (token.subType === TokenType.Routine && token.finishesAt !== undefined) {
                // We'll determine if it has a DATA marker in the next pass
                routineBoundaries.push({ 
                    start: token.line, 
                    end: token.finishesAt,
                    hasDataMarker: false 
                });
                logger.info(`📊 Found ROUTINE from line ${token.line} to ${token.finishesAt}`);
            }
        }
        
        // Second pass: identify DATA markers in routines
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            
            if (token.type === TokenType.ExecutionMarker && token.value.toUpperCase() === "DATA") {
                // Check which routine this DATA marker belongs to
                for (let j = 0; j < routineBoundaries.length; j++) {
                    const routine = routineBoundaries[j];
                    if (token.line > routine.start && token.line < routine.end) {
                        routine.hasDataMarker = true;
                        logger.info(`📊 ROUTINE at line ${routine.start} has a DATA marker at line ${token.line}`);
                        break;
                    }
                }
            }
        }
        
        // Third pass: mark execution code sections
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            
            if (token.type === TokenType.ExecutionMarker && token.value.toUpperCase() === "CODE") {
                // Use BASE_STRUCTURE_INDENT for execution code statements that aren't in structures
                // This ensures they align with the procedure level
                const codeMarkerIndent = this.BASE_STRUCTURE_INDENT;
                
                // Find which procedure/routine this CODE marker belongs to
                let belongsToProcedure = false;
                let belongsToRoutine = false;
                let endLine = -1;
                
                // Check procedures
                for (const proc of procedureBoundaries) {
                    if (token.line > proc.start && token.line < proc.end) {
                        belongsToProcedure = true;
                        endLine = proc.end;
                        proc.codeMarkerIndent = codeMarkerIndent; // Store CODE indentation
                        logger.info(`📊 Found CODE marker at line ${token.line} with indent ${codeMarkerIndent} in PROCEDURE (ends at ${endLine})`);
                        break;
                    }
                }
                
                // Check routines
                if (!belongsToProcedure) {
                    for (const routine of routineBoundaries) {
                        if (token.line > routine.start && token.line < routine.end) {
                            belongsToRoutine = true;
                            endLine = routine.end;
                            routine.codeMarkerIndent = codeMarkerIndent; // Store CODE indentation
                            logger.info(`📊 Found CODE marker at line ${token.line} with indent ${codeMarkerIndent} in ROUTINE (ends at ${endLine})`);
                            break;
                        }
                    }
                }
                
                // Mark all lines after CODE until the end of procedure/routine as execution code
                if ((belongsToProcedure || belongsToRoutine) && endLine > 0) {
                    const startLine = token.line + 1;
                    for (let line = startLine; line < endLine; line++) {
                        this.executionCodeSections.add(line);
                        // Always set default indentation for execution code to the base indent
                        // Specific structures inside the code section will override this as needed
                        this.statementIndentation.set(line, codeMarkerIndent);
                        logger.info(`📊 Marked line ${line} as execution code after CODE marker, default indent: ${codeMarkerIndent}`);
                    }
                }
            }
        }
        
        // Fourth pass: mark execution code in routines without DATA/CODE markers
        for (const routine of routineBoundaries) {
            if (!routine.hasDataMarker) {
                // For routines without DATA markers, all content is execution code
                // The first line after the ROUTINE declaration is execution code
                const startLine = routine.start + 1;
                
                // Use base structure indent for routine execution code
                const routineIndent = this.BASE_STRUCTURE_INDENT;
                
                // Mark all lines in the routine as execution code
                for (let line = startLine; line < routine.end; line++) {
                    this.executionCodeSections.add(line);
                    // Set default indentation for execution code to base indent
                    this.statementIndentation.set(line, routineIndent);
                    logger.info(`📊 Marked line ${line} as execution code in ROUTINE without DATA/CODE marker, default indent: ${routineIndent}`);
                }
            }
        }
    }

    private calculateStructureIndentation(): void {
        // Reset all indentation maps to ensure consistency between runs
        this.structureStartColumns.clear();
        this.structureEndLines.clear();
        this.statementIndentation.clear();
        this.structureStack = [];
        
        // Track structure boundaries to understand nesting
        const structuresMap = new Map<number, { 
            startLine: number,
            endLine: number | null, 
            hasLabel: boolean, 
            nestingLevel: number,
            parent: number | null,
            type: string, // Store structure type for debugging
            maxLabelLength: number, // Track longest label within structure
            labels: number[], // Track all lines with labels in this structure
            labelOnSameLine: Token | null // Reference to the label token on the same line (if any)
        }>();
        
        // First identify all structures and their boundaries
        const structureStack: number[] = [];
        let structureId = 0;
        
        // First pass: Build structure hierarchy and identify boundaries
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            
            if (token.subType === TokenType.Structure) {
                const startLine = token.line;
                
                // Find label on the same line, if any
                const labelOnLine = this.tokens.find(t => 
                    t.line === startLine && 
                    t.type === TokenType.Label &&
                    t.start < token.start
                ) || null;
                
                const hasLabel = labelOnLine !== null;
                
                // Create structure entry with parent reference
                structureId++;
                structuresMap.set(structureId, {
                    startLine,
                    endLine: null,
                    hasLabel,
                    nestingLevel: structureStack.length,
                    parent: structureStack.length > 0 ? structureStack[structureStack.length - 1] : null,
                    type: token.value.toUpperCase(),
                    maxLabelLength: 0, // To be calculated in second pass
                    labels: [], // To be populated in second pass
                    labelOnSameLine: labelOnLine
                });
                
                // Push current structure onto stack to track nesting
                structureStack.push(structureId);
                
                logger.info(`🔍 Found structure '${token.value}' at line ${startLine}`);
            }
            // Handle conditional continuations (ELSE, ELSIF, OF)
            else if (token.type === TokenType.ConditionalContinuation) {
                // These get handled in the next pass
                logger.info(`🔍 Found conditional continuation '${token.value}' at line ${token.line}`);
            }
            // Handle END statements
            else if (token.type === TokenType.EndStatement && structureStack.length > 0) {
                const currentStructureId = structureStack.pop()!;
                const structure = structuresMap.get(currentStructureId);
                
                if (structure) {
                    // Mark the END line for this structure
                    structure.endLine = token.line;
                    logger.info(`✅ Structure '${structure.type}' from line ${structure.startLine} ends at line ${token.line}`);
                }
            }
        }
        
        // Second pass: Analyze label lengths within each structure
        // We'll first gather all labels for each structure
        for (const token of this.tokens) {
            if (token.type === TokenType.Label) {
                const labelLine = token.line;
                const labelLength = token.value.length;
                
                // Find which structure this label belongs to
                for (const [id, structure] of structuresMap) {
                    if (structure.endLine === null) continue;
                    
                    // Check if this label is within the structure
                    if (labelLine >= structure.startLine && labelLine <= structure.endLine) {
                        // Add to structure's label list
                        structure.labels.push(labelLine);
                        // Update max label length for this structure
                        structure.maxLabelLength = Math.max(structure.maxLabelLength, labelLength);
                        logger.info(`📏 Label '${token.value}' (length ${labelLength}) at line ${labelLine} belongs to structure #${id}`);
                        break;
                    }
                }
            }
        }
        
        // Third pass: Calculate indentation for each structure
        // Use structure-specific label lengths
        for (const [structureId, structure] of structuresMap) {
            if (structure.endLine === null) continue; // Skip incomplete structures
            
            const { startLine, endLine, hasLabel, nestingLevel, parent, type, maxLabelLength, labelOnSameLine } = structure;
            
            // Base alignment for this structure
            let structureIndent: number;
            
            // Handle structures in execution code sections differently
            const isInExecutionCode = this.executionCodeSections.has(startLine);
            
            // If this structure has a label on the same line
            if (hasLabel) {
                // Get the longest label in the structure, not just the label on the same line
                const longestLabelLength = maxLabelLength;
                
                // Calculate proper indentation based on the longest label in the structure
                // We want the structure keyword (like CLASS) to be aligned one indent after the longest label
                // Round to the nearest multiple of indentSize
                structureIndent = Math.round((longestLabelLength + 2) / this.indentSize) * this.indentSize;
                
                logger.info(`📏 Structure '${type}' at line ${startLine} aligns after longest label (${longestLabelLength} chars), rounded indent: ${structureIndent}`);
            } 
            // No label - use parent structure's indent or longest label within structure
            else if (parent) {
                const parentStructure = structuresMap.get(parent);
                
                if (parentStructure) {
                    // Base on parent structure's alignment plus an indent
                    const parentIndent = this.structureStartColumns.get(parentStructure.startLine) || 0;
                    structureIndent = parentIndent + this.indentSize;
                    
                    // If this structure has labels inside it, consider max label length
                    if (maxLabelLength > 0) {
                        // Ensure it's a multiple of indentSize
                        const labelBasedIndent = Math.ceil((maxLabelLength + 2) / this.indentSize) * this.indentSize;
                        structureIndent = Math.max(structureIndent, labelBasedIndent);
                    }
                    
                    logger.info(`📏 Structure '${type}' at line ${startLine} aligns with parent plus indent: ${structureIndent}`);
                } else {
                    // Fallback if parent structure not found - ensure multiple of indentSize
                    structureIndent = this.indentSize * nestingLevel;
                }
            } 
            // Top-level structure - use longest label within structure if available
            else {
                // Different handling for execution code vs. data section structures
                if (isInExecutionCode) {
                    // Structures in execution code sections need at least the base indent
                    // Round to nearest multiple of indentSize
                    structureIndent = Math.max(
                        this.BASE_STRUCTURE_INDENT, 
                        Math.round(this.indentSize * nestingLevel / this.indentSize) * this.indentSize
                    );
                    logger.info(`📏 Execution code structure '${type}' at line ${startLine} uses indent: ${structureIndent}`);
                } else {
                    // Keep the original logic for data sections but ensure multiple of indentSize
                    structureIndent = this.indentSize * nestingLevel;
                    
                    // If this structure has labels inside it, use max label length if needed
                    if (maxLabelLength > 0) {
                        // Round up to nearest multiple of indentSize
                        const labelBasedIndent = Math.ceil((maxLabelLength + 2) / this.indentSize) * this.indentSize;
                        structureIndent = Math.max(structureIndent, labelBasedIndent);
                        logger.info(`📏 Structure '${type}' at line ${startLine} aligns with longest label: ${structureIndent} (rounded)`);
                    } else {
                        logger.info(`📏 Structure '${type}' at line ${startLine} uses base indent: ${structureIndent}`);
                    }
                }
            }
            
            // Ensure structure indent is a multiple of indentSize (use exact multiples, no rounding up)
            structureIndent = Math.floor(structureIndent / this.indentSize) * this.indentSize;
            
            // Store structure indent
            this.structureStartColumns.set(startLine, structureIndent);
            
            // Track structure for format phase
            this.structureStack.push({
                startLine,
                column: structureIndent,
                maxLabelLength, // Store the actual max label length for this structure
                nestingLevel,
                type
            });
            
            // Calculate statement indentation inside this structure
            const statementIndent = structureIndent + this.indentSize;
            
            // Apply indentation to all statements inside this structure
            if (endLine !== null) {
                // Handle END statement indentation
                this.structureEndLines.set(endLine, structureIndent);
                
                // Handle statements between START and END
                for (let line = startLine + 1; line < endLine; line++) {
                    // For lines with labels, we need special handling
                    if (this.labelLines.has(line)) {
                        // Find the label token
                        const labelToken = this.tokens.find(t => 
                            t.line === line && t.type === TokenType.Label);
                        
                        if (labelToken) {
                            // Store the fact that this label belongs to this structure
                            this.structureMaxLabelLength.set(line, maxLabelLength);
                            
                            // For statements with labels, we need to store the structure's indentation
                            // so the format() method can properly indent the statement part
                            this.statementIndentation.set(line, statementIndent);
                            logger.info(`📏 Label at line ${line} inside structure '${type}' gets indent: ${statementIndent}`);
                        }
                        
                        // Skip further processing of label lines
                        continue;
                    }
                    
                    // Skip lines with their own labels (which start at column 0)
                    if (!this.labelLines.has(line) && 
                        // Skip nested structure starts (handled separately)
                        !Array.from(structuresMap.values()).some(s => s.startLine === line) &&
                        // Skip nested structure ends (handled separately)
                        !Array.from(structuresMap.values()).some(s => s.endLine === line)) {
                        
                        this.statementIndentation.set(line, statementIndent);
                    }
                }
                
                // Handle special case for conditional continuations
                for (let line = startLine + 1; line < endLine; line++) {
                    const isConditionalCont = this.tokens.some(t => 
                        t.line === line && t.type === TokenType.ConditionalContinuation);
                    
                    if (isConditionalCont) {
                        // ELSE/ELSIF align with the parent structure
                        this.structureStartColumns.set(line, structureIndent);
                    }
                }
            }
        }
        
        // Special handling for execution code
        for (let line = 0; line < this.lines.length; line++) {
            if (this.executionCodeSections.has(line)) {
                // Check if this line contains a structure start or end
                const isStructureStart = this.structureStartColumns.has(line);
                const isStructureEnd = this.structureEndLines.has(line);
                const hasLabel = this.labelLines.has(line);
                
                // Don't override existing structure indentation, but handle other execution code
                if (!isStructureStart && !isStructureEnd && !hasLabel) {
                    // Find the containing structure for proper indentation
                    const containingStructure = this.findContainingStructure(line);
                    
                    // Check if this is inside an IF, CASE or other execution control structure
                    const isInControlStructure = containingStructure && 
                        ["IF", "CASE", "LOOP", "EXECUTE"].includes(containingStructure.type?.toUpperCase() || "");
                    
                    if (containingStructure && containingStructure.column !== undefined && isInControlStructure) {
                        // Only adjust indent if we're in a control structure like IF, CASE, etc.
                        const executionIndent = containingStructure.column + this.indentSize;
                        this.statementIndentation.set(line, executionIndent);
                        logger.info(`📊 Execution code line ${line} in control structure ${containingStructure.type} - indent: ${executionIndent}`);
                    } else {
                        // Not in a control structure - use base indent for procedure level statements
                        this.statementIndentation.set(line, this.BASE_STRUCTURE_INDENT);
                        logger.info(`📊 Execution code line ${line} at procedure level - using base indent: ${this.BASE_STRUCTURE_INDENT}`);
                    }
                }
            }
        }
        
        // Final pass: Check procedure-level statements in execution code sections
        for (let line = 0; line < this.lines.length; line++) {
            // Find statements that came after the END of the main structure in a procedure/routine
            if (this.executionCodeSections.has(line)) {
                // Only for lines that have indentation set too deeply
                if (this.statementIndentation.has(line) && this.statementIndentation.get(line)! > this.BASE_STRUCTURE_INDENT * 2) {
                    // Check if we're after an END statement (not just the immediate next line)
                    // Find the nearest preceding END statement
                    let foundEnd = false;
                    for (let prevLine = line - 1; prevLine >= 0 && prevLine >= line - 5; prevLine--) {
                        if (this.structureEndLines.has(prevLine)) {
                            foundEnd = true;
                            break;
                        }
                        
                        // If we hit a structure start before finding an END, then break
                        if (this.structureStartColumns.has(prevLine) && 
                            !this.tokens.some(t => t.line === prevLine && t.type === TokenType.ConditionalContinuation)) {
                            break;
                        }
                    }
                    
                    // If we found an END statement in the preceding few lines
                    if (foundEnd) {
                        // Check if this looks like a procedure-level statement (RETURN, etc.)
                        const lineText = this.lines[line].trim().toUpperCase();
                        
                        // Reset indentation for procedure-level statements
                        if (lineText.startsWith('RETURN') || 
                            lineText === 'END' ||
                            lineText.startsWith('SELF.') ||
                            lineText.startsWith('PARENT.') ||
                            (lineText.length > 0 && !lineText.startsWith('!'))) {
                            
                            // Reset to procedure level indentation
                            this.statementIndentation.set(line, this.BASE_STRUCTURE_INDENT);
                            logger.info(`📊 Fixed over-indented line ${line} after END structure to base indent: ${this.BASE_STRUCTURE_INDENT}`);
                        }
                    }
                }
            }
        }
    }

    public format(): string {
        logger.info("📐 Starting structure-based formatting...");

        const formattedLines: string[] = this.lines.map((line, index) => {
            const originalLine = line;
            const trimmedLine = line.trimLeft();
            if (trimmedLine.length === 0) return ""; // Preserve blank lines

            logger.info(`🔍 Processing line ${index}: '${trimmedLine}'`);

            // Default indent - will be overridden if special cases apply
            let finalIndent = 0;

            // ✅ Labels stay at column 0 but statements after labels get proper indentation
            if (this.labelLines.has(index)) {
                const firstSpaceIndex = trimmedLine.indexOf(" ");
                if (firstSpaceIndex > 0 && firstSpaceIndex < trimmedLine.length - 1) {
                    const labelPart = trimmedLine.substring(0, firstSpaceIndex);
                    const statementPart = trimmedLine.substring(firstSpaceIndex).trimLeft();

                    // Check if there's a structure on this line
                    const hasStructure = this.tokens.some(t => 
                        t.line === index && t.subType === TokenType.Structure);
                    
                    let statementIndent: number;
                    
                    if (hasStructure) {
                        // This is a label with a structure declaration
                        // Look up the calculated indent for this structure 
                        statementIndent = this.structureStartColumns.get(index) || 
                            (labelPart.length + this.indentSize);
                        
                        logger.info(`🔹 Label with structure line ${index}, indent: ${statementIndent}`);
                    } else {
                        // Regular labeled statement - find containing structure
                        const containingStructure = this.findContainingStructure(index);
                        
                        if (containingStructure) {
                            // If this line has a predefined indentation level (from structure processing),
                            // use that instead of calculating a new one
                            if (this.statementIndentation.has(index)) {
                                statementIndent = this.statementIndentation.get(index)!;
                                logger.info(`🔹 Using pre-calculated indent for labeled line ${index}: ${statementIndent}`);
                            } else {
                                // If we're in a structure and the line is a label, we want to indent from
                                // the structure's column, not align to other labels
                                statementIndent = containingStructure.column + this.indentSize;
                                
                                // Make sure statements within structures have consistent alignment
                                const maxLabelInStructure = this.structureMaxLabelLength.get(index) || containingStructure.maxLabelLength;
                                if (maxLabelInStructure > 0) {
                                    // Use the longest label for alignment, but ensure a minimum spacing
                                    const minIndent = labelPart.length + 2;
                                    statementIndent = Math.max(minIndent, maxLabelInStructure + this.indentSize);
                                }
                                
                                logger.info(`🔹 Label inside structure line ${index}, indent: ${statementIndent} (structure at column ${containingStructure.column})`);
                            }
                        } else {
                            // No containing structure, use base rules
                            statementIndent = Math.max(10, labelPart.length + this.indentSize);
                            logger.info(`🔹 Independent label line ${index}, indent: ${statementIndent}`);
                        }
                    }

                    // Calculate spaces needed after the label
                    // Ensure statementIndent is an exact multiple of indentSize
                    statementIndent = Math.floor(statementIndent / this.indentSize) * this.indentSize;
                    const spaceCount = Math.max(2, statementIndent - labelPart.length);
                    return labelPart + " ".repeat(spaceCount) + statementPart;
                }
                return trimmedLine; // Just the label with no statement
            }

            // Check for conditional continuations (ELSE/ELSIF)
            const isConditionalContinuation = this.tokens.some(t => 
                t.line === index && t.type === TokenType.ConditionalContinuation);

            // ✅ Apply indentation from structure calculations
            if (isConditionalContinuation && this.structureStartColumns.has(index)) {
                finalIndent = this.structureStartColumns.get(index) || 0;
                // Ensure it's an exact multiple of indentSize
                finalIndent = Math.floor(finalIndent / this.indentSize) * this.indentSize;
                logger.info(`🔹 ELSE/ELSIF line ${index}, indent: ${finalIndent}`);
            }
            else if (this.structureStartColumns.has(index)) {
                finalIndent = this.structureStartColumns.get(index) || 0;
                // Ensure it's an exact multiple of indentSize
                finalIndent = Math.floor(finalIndent / this.indentSize) * this.indentSize;
                logger.info(`🔹 Structure line ${index}, indent: ${finalIndent}`);
            } 
            else if (this.structureEndLines.has(index)) {
                finalIndent = this.structureEndLines.get(index) || 0;
                // Ensure it's an exact multiple of indentSize
                finalIndent = Math.floor(finalIndent / this.indentSize) * this.indentSize;
                logger.info(`🔹 END line ${index}, indent: ${finalIndent}`);
            } 
            else if (this.statementIndentation.has(index)) {
                finalIndent = this.statementIndentation.get(index) || 0;
                
                // Enhanced check for procedure-level statements that should have base indentation
                if (this.executionCodeSections.has(index)) {
                    const trimmedUpperLine = line.trim().toUpperCase();
                    
                    // If this is a return statement or other procedure-level statement
                    // and is indented too deeply, fix it
                    if ((trimmedUpperLine.startsWith('RETURN') || 
                         trimmedUpperLine === 'END' ||
                         trimmedUpperLine.startsWith('SELF.') ||
                         trimmedUpperLine.startsWith('PARENT.')) && 
                        finalIndent > this.BASE_STRUCTURE_INDENT * 2) {
                        
                        finalIndent = this.BASE_STRUCTURE_INDENT;
                        logger.info(`🔹 Fixing procedure-level statement at line ${index} to base indent`);
                    }
                }
                
                // Ensure it's an exact multiple of indentSize
                finalIndent = Math.floor(finalIndent / this.indentSize) * this.indentSize;
                logger.info(`🔹 Statement line ${index}, indent: ${finalIndent}`);
            } 
            else if (this.executionCodeSections.has(index)) {
                finalIndent = this.statementIndentation.has(index) ? 
                    this.statementIndentation.get(index)! : this.BASE_STRUCTURE_INDENT;
                    
                // Ensure it's an exact multiple of indentSize
                finalIndent = Math.floor(finalIndent / this.indentSize) * this.indentSize;
                logger.info(`🔹 Execution code line ${index} with indent: ${finalIndent}`);
            }
            else {
                logger.warn(`⚠️ Using default indentation for line ${index}`);
                finalIndent = this.BASE_STRUCTURE_INDENT;
                // Ensure it's an exact multiple of indentSize
                finalIndent = Math.floor(finalIndent / this.indentSize) * this.indentSize;
            }

            let formattedLine = " ".repeat(finalIndent) + trimmedLine;
            
            if (formattedLine !== originalLine) {
                logger.info(`✅ Formatting changed for Line ${index}`);
            }

            return formattedLine;
        });

        logger.info("📐 Structure-based formatting complete.");
        return formattedLines.join("\r\n");
    }
    
    // Helper to find which structure contains a given line
    private findContainingStructure(lineIndex: number): { maxLabelLength: number, column: number, type?: string } | undefined {
        // Update return type to include the structure type
        
        // Sort structures by most specific (innermost) first
        const sortedStructures = [...this.structureStack].sort((a, b) => {
            // Prefer structures that start closest to but before our line
            if (a.startLine <= lineIndex && b.startLine <= lineIndex) {
                return b.startLine - a.startLine; // Later start = more specific
            }
            // If only one contains the line, choose that one
            if (a.startLine <= lineIndex) return -1;
            if (b.startLine <= lineIndex) return 1;
            // Neither contains the line, prioritize by distance
            return a.startLine - b.startLine;
        });
        
        // Find the first (most specific) structure that contains this line
        for (const structure of sortedStructures) {
            if (structure.startLine <= lineIndex) {
                return {
                    maxLabelLength: structure.maxLabelLength,
                    column: structure.column,
                    type: structure.type // Return the structure type
                };
            }
        }
        
        return undefined;
    }

    public formatDocument(): string {
        return this.format();
    }
}

export default ClarionFormatter;
