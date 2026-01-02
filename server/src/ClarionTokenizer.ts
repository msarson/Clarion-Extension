import { DocumentStructure } from './DocumentStructure';
import LoggerManager from './logger';
import { TokenType, Token } from './tokenizer/TokenTypes';
import { PatternMatcher } from './tokenizer/PatternMatcher';
import { StructureProcessor } from './tokenizer/StructureProcessor';
import { STRUCTURE_PATTERNS } from './tokenizer/TokenPatterns';

const logger = LoggerManager.getLogger("Tokenizer");
logger.setLevel("error"); // Only show errors and PERF

// Re-export types for backward compatibility
export { TokenType, Token } from './tokenizer/TokenTypes';



export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];
    private lines: string[];
    private tabSize: number;  // ✅ Store tabSize
    maxLabelWidth: number = 0;
    
    // 🚀 PERF: Cache analyzed procedures to avoid re-scanning in incremental updates
    private static analyzedProcedures = new Map<string, Set<number>>();  // uri -> Set of procedure line numbers

    constructor(text: string, tabSize: number = 2) {  // ✅ Default to 2 if not provided
        this.text = text;
        this.tokens = [];
        this.lines = [];
        this.tabSize = tabSize;  // ✅ Store the provided or default value
        
        // 🚀 PERFORMANCE: Initialize compiled patterns once
        PatternMatcher.initializePatterns();
    }


    /** ✅ Public method to tokenize text */
    public tokenize(): Token[] {
        // 📊 METRICS: Start performance measurement
        const perfStart = performance.now();
        const charCount = this.text.length;
        
        try {
            logger.info("🔍 [DEBUG] Starting tokenization...");
            
            // Check if the text is XML
            if (this.text.trim().startsWith('<?xml') || this.text.trim().startsWith('<Project')) {
                logger.warn("⚠️ [DEBUG] Detected XML content, skipping tokenization");
                return [];
            }
            
            const splitStart = performance.now();
            this.lines = this.text.split(/\r?\n/);
            const splitTime = performance.now() - splitStart;
            logger.info(`🔍 [DEBUG] Split into ${this.lines.length} lines (${splitTime.toFixed(2)}ms)`);

            const tokenizeStart = performance.now();
            this.tokenizeLines(this.lines); // ✅ Step 1: Tokenize all lines
            const tokenizeTime = performance.now() - tokenizeStart;
            logger.info(`🔍 [DEBUG] Tokenized ${this.tokens.length} tokens (${tokenizeTime.toFixed(2)}ms)`);
            
            const structureStart = performance.now();
            this.processDocumentStructure(); // ✅ Step 2: Process relationships
            const structureTime = performance.now() - structureStart;
            logger.info("🔍 [DEBUG] Document structure processed");
            
            const prefixStart = performance.now();
            StructureProcessor.processStructureFieldPrefixes(this.tokens, this.lines); // ✅ Step 2.5: Process structure field prefixes
            const prefixTime = performance.now() - prefixStart;
            logger.info(`🔍 [DEBUG] Structure field prefixes processed (${prefixTime.toFixed(2)}ms)`);
            
            const routineVarsStart = performance.now();
            this.tokenizeRoutineVariables(); // ✅ Step 3: Tokenize routine DATA section variables
            const routineVarsTime = performance.now() - routineVarsStart;
            logger.info(`🔍 [DEBUG] Routine variables tokenized (${routineVarsTime.toFixed(2)}ms)`);
            
            const procedureVarsStart = performance.now();
            this.tokenizeProcedureLocalVariables(); // ✅ Step 4: Tokenize procedure local variables
            const procedureVarsTime = performance.now() - procedureVarsStart;
            logger.info(`🔍 [DEBUG] Procedure local variables tokenized (${procedureVarsTime.toFixed(2)}ms)`);
            
            // 📊 METRICS: Calculate and log performance stats
            const totalTime = performance.now() - perfStart;
            const tokensPerMs = this.tokens.length / totalTime;
            const charsPerMs = charCount / totalTime;
            const linesPerMs = this.lines.length / totalTime;
            
            logger.perf('Tokenization complete', {
                'total_ms': totalTime.toFixed(2),
                'lines': this.lines.length,
                'lines_per_ms': linesPerMs.toFixed(1),
                'chars': charCount,
                'chars_per_ms': charsPerMs.toFixed(0),
                'tokens': this.tokens.length,
                'tokens_per_ms': tokensPerMs.toFixed(1),
                'split_ms': splitTime.toFixed(2),
                'split_pct': ((splitTime/totalTime)*100).toFixed(1) + '%',
                'tokenize_ms': tokenizeTime.toFixed(2),
                'tokenize_pct': ((tokenizeTime/totalTime)*100).toFixed(1) + '%',
                'structure_ms': structureTime.toFixed(2),
                'structure_pct': ((structureTime/totalTime)*100).toFixed(1) + '%',
                'prefix_ms': prefixTime.toFixed(2),
                'prefix_pct': ((prefixTime/totalTime)*100).toFixed(1) + '%',
                'routine_vars_ms': routineVarsTime.toFixed(2),
                'routine_vars_pct': ((routineVarsTime/totalTime)*100).toFixed(1) + '%',
                'procedure_vars_ms': procedureVarsTime.toFixed(2),
                'procedure_vars_pct': ((procedureVarsTime/totalTime)*100).toFixed(1) + '%'
            });
            
            return this.tokens;
        } catch (error) {
            const totalTime = performance.now() - perfStart;
            logger.error(`❌ [DEBUG] Error in tokenize after ${totalTime.toFixed(2)}ms: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /** ✅ Step 1: Tokenize all lines */
    private tokenizeLines(lines: string[]): void {
        const patterns = PatternMatcher.getCompiledPatterns();
        const types = PatternMatcher.getOrderedTypes();
        
        // 🔬 PROFILING: Track time spent per pattern type
        const patternTiming = new Map<TokenType, number>();
        const patternMatches = new Map<TokenType, number>();
        const patternTests = new Map<TokenType, number>();
        
        for (const type of types) {
            patternTiming.set(type, 0);
            patternMatches.set(type, 0);
            patternTests.set(type, 0);
        }
        
        // 🚀 PERF: Track CODE context to skip Structure patterns in execution sections
        let inCodeSection = false;
        let tokensOnCurrentLine = 0;
        
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            if (line.trim() === "") continue; // ✅ Skip blank lines

            let position = 0;
            tokensOnCurrentLine = 0; // Reset for new line
            
            // 🚀 PERFORMANCE: Only expand tabs if line contains tabs
            let column = 0;
            if (line.includes('\t')) {
                const expandedLine = StructureProcessor.expandTabs(line, this.tabSize);
                column = expandedLine.match(/^(\s*)/)?.[0].length || 0;
            } else {
                column = line.match(/^(\s*)/)?.[0].length || 0;
            }
            
            // 🚀 PERF: Check if this line enters CODE section (structures are declarations, not execution)
            if (line.match(/^\s*code\s*$/i)) {
                inCodeSection = true;
            } else if (line.match(/^\s*(DATA|ROUTINE)\b/i)) {
                inCodeSection = false; // DATA/ROUTINE sections can have structures
            }

            while (position < line.length) {
                const substring = line.slice(position);
                let matched = false;

                // 🚀 PERFORMANCE: Character-class filtering - classify once, test only relevant patterns
                const firstChar = substring[0];
                const charClass = PatternMatcher.getCharClass(firstChar);
                const relevantTypes = PatternMatcher.getPatternsByCharClass().get(charClass) || types;

                // ✅ Check if current position is inside parentheses (...) or optional parameters <...>
                // Structure keywords inside these contexts are parameter types, not structure declarations
                const isInsideParamsOrTemplate = (pos: number): boolean => {
                    let openParens = 0;
                    let openBrackets = 0;
                    for (let i = 0; i < pos; i++) {
                        if (line[i] === '(') openParens++;
                        else if (line[i] === ')') openParens--;
                        else if (line[i] === '<') openBrackets++;
                        else if (line[i] === '>') openBrackets--;
                    }
                    return openParens > 0 || openBrackets > 0;
                };

                // Test only patterns relevant to this character class
                for (const tokenType of relevantTypes) {
                    // ✅ Special handling for Structure - test each pattern individually to preserve negative lookbehinds
                    if (tokenType === TokenType.Structure) {
                        // 🚀 PERF: Early exit guards for Structure patterns
                        // Distinguish between declaration structures and execution structures
                        const upperSubstring = substring.toUpperCase();
                        
                        // Check what kind of structure this might be
                        const isExecutionStructure = 
                            upperSubstring.startsWith('IF') ||
                            upperSubstring.startsWith('LOOP') ||
                            upperSubstring.startsWith('CASE') ||
                            upperSubstring.startsWith('ACCEPT') ||
                            upperSubstring.startsWith('EXECUTE') ||
                            upperSubstring.startsWith('BEGIN');
                        
                        const isDeclarationStructure =
                            upperSubstring.startsWith('FILE') ||
                            upperSubstring.startsWith('QUEUE') ||
                            upperSubstring.startsWith('GROUP') ||
                            upperSubstring.startsWith('RECORD') ||
                            upperSubstring.startsWith('CLASS') ||
                            upperSubstring.startsWith('WINDOW') ||
                            upperSubstring.startsWith('REPORT') ||
                            upperSubstring.startsWith('MODULE') ||
                            upperSubstring.startsWith('MAP') ||
                            upperSubstring.startsWith('VIEW');
                        
                        // Skip DECLARATION structures in CODE section (they're not valid there)
                        // But ALLOW execution structures (IF/LOOP/CASE) - they're needed for control flow
                        if (inCodeSection && isDeclarationStructure) {
                            continue;
                        }
                        
                        // Skip EXECUTION structures before CODE section (they're not valid there)
                        if (!inCodeSection && isExecutionStructure) {
                            continue;
                        }
                        
                        // Note: Removed tokensOnCurrentLine check - declaration structures CAN be indented
                        // The original check was meant to prevent "Label FILE..." patterns,
                        // but it incorrectly blocked legitimately indented structures in generated code
                        
                        // Allow reasonable indentation (up to 50 columns) for generated code
                        // Most hand-written Clarion code has structures near left margin,
                        // but generated code (like from Clarion IDE templates) can have deep indentation
                        if (column > 50) {
                            // Skip if column > 50 - extreme indentation is likely not a structure declaration
                            continue;
                        }
                        
                        // 🚀 PERF: Check if this looks like a structure keyword
                        const hasStructureKeyword = isExecutionStructure || isDeclarationStructure;
                        
                        if (!hasStructureKeyword) {
                            // No structure keyword found at start, skip all structure pattern tests
                            continue;
                        }
                        
                        // Test each structure pattern individually
                        for (const [structName, structPattern] of Object.entries(STRUCTURE_PATTERNS)) {
                            const testStart = performance.now();
                            const match = structPattern.exec(substring);
                            const testTime = performance.now() - testStart;
                            
                            patternTiming.set(tokenType, (patternTiming.get(tokenType) || 0) + testTime);
                            patternTests.set(tokenType, (patternTests.get(tokenType) || 0) + 1);
                            
                            if (match && match.index === 0) {
                                // ✅ CRITICAL FIX: Check if structure keyword is inside optional parameters or qualified identifiers or parameter lists
                                // This prevents matching keywords that are:
                                // - Part of qualified identifiers like nts:case or obj.case (preceded by : or .)
                                // - Inside optional parameters like <report pReport> (inside unclosed <...>)
                                // - Inside parameter lists like PROCEDURE(...,REPORT,...) (inside unclosed (...))
                                if (position > 0) {
                                    const prevChar = line[position - 1];
                                    // Skip if preceded by qualifier characters or comma (parameter separator)
                                    if (prevChar === ':' || prevChar === '.' || prevChar === ',' || prevChar === '<') {
                                        logger.debug(`⏭️ Skipping structure keyword '${structName}' (${match[0]}) at position ${position} - preceded by '${prevChar}'`);
                                        continue; // Try next structure pattern
                                    }
                                }
                                
                                // Check if inside parentheses or optional parameters
                                if (isInsideParamsOrTemplate(position)) {
                                    logger.debug(`⏭️ Skipping structure keyword '${structName}' (${match[0]}) at position ${position} - inside parameters or optional params`);
                                    continue; // Try next structure pattern
                                }
                                
                                patternMatches.set(tokenType, (patternMatches.get(tokenType) || 0) + 1);
                                
                                // ✅ Trim leading whitespace from token value (some patterns like FILE, QUEUE, VIEW include \s)
                                const tokenValue = match[0].trimStart();
                                
                                // Calculate actual start position accounting for leading whitespace in match
                                const leadingWhitespace = match[0].length - tokenValue.length;
                                
                                // Create token for this structure
                                const newToken: Token = {
                                    type: TokenType.Structure,
                                    value: tokenValue,
                                    line: lineNumber,
                                    start: position + leadingWhitespace,
                                    maxLabelLength: 0
                                };
                                
                                this.tokens.push(newToken);
                                position += match[0].length;
                                column += match[0].length;
                                matched = true;
                                tokensOnCurrentLine++; // 🚀 PERF: Track tokens on line
                                
                                logger.info(`✅ Matched Structure '${structName}': ${tokenValue} at line ${lineNumber}`);
                                break; // Found a match, stop testing other structure patterns
                            }
                        }
                        
                        if (matched) break; // Already found a structure match, skip other token types
                        continue; // No structure match found, but skip the normal pattern.get() logic below and try next token type
                    }
                    
                    const pattern = patterns.get(tokenType);
                    if (!pattern) continue;

                    if (tokenType === TokenType.Label && column !== 0) continue; // ✅ Labels must be in column 0
                    
                    // 🚀 PERF: Context-based guards for low-hit patterns
                    if (tokenType === TokenType.LineContinuation) {
                        // Only test at end of line or after & character
                        if (position < line.length - 2 && firstChar !== '&' && firstChar !== '|') {
                            continue; // Skip expensive regex if not near end or continuation character
                        }
                    }
                    
                    if (tokenType === TokenType.ImplicitVariable) {
                        // Only test if we've seen a potential suffix character recently
                        const hasSuffix = substring.includes('$') || substring.includes('#') || substring.includes('"');
                        if (!hasSuffix) {
                            continue; // No implicit type suffix visible, skip test
                        }
                    }
                    
                    if (tokenType === TokenType.Class) {
                        // Only test if dot follows (Class pattern matches identifier before .)
                        const dotPos = substring.indexOf('.');
                        if (dotPos === -1 || dotPos > 50) {
                            continue; // No dot nearby, skip expensive test
                        }
                    }

                    // 🔬 PROFILING: Time each pattern test
                    const testStart = performance.now();
                    let match = pattern.exec(substring);
                    const testTime = performance.now() - testStart;
                    
                    patternTiming.set(tokenType, patternTiming.get(tokenType)! + testTime);
                    patternTests.set(tokenType, patternTests.get(tokenType)! + 1);
                    
                    if (match && match.index === 0) {
                        // ✅ CRITICAL FIX: For Keyword tokens, check if preceded by : or . in original line
                        // This prevents matching keywords that are part of qualified identifiers like nts:case or obj.case
                        if (tokenType === TokenType.Keyword && position > 0) {
                            const prevChar = line[position - 1];
                            if (prevChar === ':' || prevChar === '.') {
                                // Skip this match - it's part of a qualified identifier
                                logger.debug(`⏭️ Skipping keyword '${match[0]}' at position ${position} - preceded by '${prevChar}'`);
                                continue;
                            }
                        }
                        
                        patternMatches.set(tokenType, patternMatches.get(tokenType)! + 1);
                        
                        // ✅ Structure tokens are handled above in special block
                        let newTokenType = tokenType;
                        
                        // Calculate actual start position accounting for leading whitespace in match
                        const trimmedValue = match[0].trim();
                        const leadingWhitespace = match[0].length - trimmedValue.length;
                        
                        let newToken: Token = {
                            type: newTokenType,
                            value: trimmedValue,
                            line: lineNumber,
                            start: position + leadingWhitespace,
                            maxLabelLength: 0
                        };
                        
                        // ✅ Special handling for structure field references
                        if (tokenType === TokenType.StructureField) {
                            // Extract structure and field parts from dot notation (e.g., Invoice.Customer or Queue:Browse:1.ViewPosition)
                            const dotIndex = match[0].lastIndexOf('.');
                            if (dotIndex > 0) {
                                const structurePart = match[0].substring(0, dotIndex);
                                const fieldPart = match[0].substring(dotIndex + 1);
                                logger.info(`🔍 Detected structure field reference: ${structurePart}.${fieldPart}`);
                            }
                        } else if (tokenType === TokenType.StructurePrefix) {
                            // Extract prefix and field parts from prefix notation (e.g., INV:Customer)
                            // For complex cases like Queue:Browse:1:Field, we need to find the last colon
                            const colonIndex = match[0].lastIndexOf(':');
                            if (colonIndex > 0) {
                                const prefixPart = match[0].substring(0, colonIndex);
                                const fieldPart = match[0].substring(colonIndex + 1);
                                logger.info(`🔍 Detected structure prefix reference: ${prefixPart}:${fieldPart}`);
                            }
                        }
                        
                        this.tokens.push(newToken);
                        // 🌈 Special handling for COLOR(...)
                        if (tokenType === TokenType.Function && match[0].toUpperCase() === "COLOR") {
                            // Look ahead for '(' and extract the contents
                            const parenStart = line.indexOf("(", position);
                            if (parenStart > -1) {
                                let parenDepth = 1;
                                let currentPos = parenStart + 1;
                                let paramString = "";

                                while (currentPos < line.length && parenDepth > 0) {
                                    const char = line[currentPos];
                                    if (char === "(") parenDepth++;
                                    else if (char === ")") parenDepth--;

                                    if (parenDepth > 0) {
                                        paramString += char;
                                    }
                                    currentPos++;
                                }

                                // Split param string into arguments
                                const rawParams = paramString.split(",").map(s => s.trim()).filter(Boolean);
                                // Store parsed COLOR(...) arguments
                                newToken.colorParams = [];

                                for (const param of rawParams) {
                                    const isEquate = /^COLOR:[A-Za-z0-9]+$/i.test(param);
                                    const isRGBHex = /^(-)?([0-9A-F]+)H$/i.test(param);

                                    if (isEquate || isRGBHex) {
                                        this.tokens.push({
                                            type: TokenType.ColorValue,
                                            value: param,
                                            line: lineNumber,
                                            start: column, // You could refine this based on match position
                                            maxLabelLength: 0
                                        });
                                        
                                        logger.info(`🌈 COLOR param tokenized: ${param} ${column}`);
                                        
                                    }

                                    newToken.colorParams.push(param);
                                }

                                // Store as custom metadata
                                newToken.colorParams = rawParams;
                                logger.info(`🎨 Parsed COLOR params at line ${lineNumber}: ${rawParams.join(", ")}`);
                            }
                        }
                        else if (match[0].toUpperCase() === "COLOR") {
                            logger.info(`🌈 COLOR name detected at line ${lineNumber} ${tokenType}`);
                        }
                        
                        logger.info(`Detected: Token Type: ${newToken.type} Token Value: '${newToken.value}' at Line ${newToken.line}, Column ${newToken.start}`);
                        logger.info(`Line: ${line}`);

                        position += match[0].length;
                        column += match[0].length;
                        matched = true;
                        tokensOnCurrentLine++; // 🚀 PERF: Track tokens on line
                        break;


                    }
                }

                if (!matched) {
                    position++;
                    column++;
                }
            }
        }

        // 🔬 PROFILING: Report pattern timing statistics
        logger.info('🔬 [PROFILING] Pattern performance analysis:');
        
        // Sort by time spent (descending)
        const sortedByTime = Array.from(patternTiming.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Top 10 slowest
        
        const totalPatternTime = Array.from(patternTiming.values()).reduce((sum, time) => sum + time, 0);
        
        for (const [type, time] of sortedByTime) {
            const tests = patternTests.get(type) || 0;
            const matches = patternMatches.get(type) || 0;
            const avgTime = tests > 0 ? time / tests : 0;
            const hitRate = tests > 0 ? (matches / tests) * 100 : 0;
            const pct = totalPatternTime > 0 ? (time / totalPatternTime) * 100 : 0;
            
            logger.perf(`Pattern: ${TokenType[type]}`, {
                'total_ms': time.toFixed(2),
                'pct': pct.toFixed(1) + '%',
                'tests': tests,
                'matches': matches,
                'hit_rate': hitRate.toFixed(1) + '%',
                'avg_us': (avgTime * 1000).toFixed(2)
            });
        }
        
        logger.perf('Pattern summary', {
            'total_pattern_ms': totalPatternTime.toFixed(2),
            'total_tests': Array.from(patternTests.values()).reduce((sum, n) => sum + n, 0),
            'total_matches': Array.from(patternMatches.values()).reduce((sum, n) => sum + n, 0)
        });
    }



    private processDocumentStructure(): void {
        // ✅ First Pass: Identify Labels & Compute Max Label Length

        // ✅ Second Pass: Process Token Relationships
        // ✅ Create a DocumentStructure instance and process the tokens
        const documentStructure = new DocumentStructure(this.tokens, this.lines);
        documentStructure.process();

    }

    /** ✅ Tokenize variables in routine DATA sections */
    private tokenizeRoutineVariables(): void {
        // Find all routines with DATA sections
        const routines = this.tokens.filter(t => 
            t.subType === TokenType.Routine && t.hasLocalData
        );

        for (const routine of routines) {
            let inDataSection = false;
            const routineEnd = routine.finishesAt || this.lines.length - 1;
            
            // Search from routine start to routine end
            for (let lineNum = routine.line; lineNum <= routineEnd; lineNum++) {
                const line = this.lines[lineNum];
                if (!line) continue;
                
                // Check for DATA keyword
                if (line.match(/^\s*data\s*$/i)) {
                    inDataSection = true;
                    continue;
                }
                
                // Check for CODE keyword (ends DATA section)
                if (line.match(/^\s*code\s*$/i)) {
                    inDataSection = false;
                    break;
                }
                
                // If in DATA section, tokenize variable declarations
                if (inDataSection) {
                    // Match variable declarations: varName   type or varName type(size)
                    // Variables in routines start at column 0 (after any leading whitespace is removed)
                    // Updated to handle types with parameters like CSTRING(1024), STRING(255), etc.
                    const varMatch = line.match(/^([A-Za-z_][A-Za-z0-9_:]*)\s+(&?[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)/i);
                    if (varMatch) {
                        const varName = varMatch[1];
                        const isReference = varMatch[2].startsWith('&');
                        
                        // Create a Variable or ReferenceVariable token
                        const varToken: Token = {
                            type: TokenType.Label,
                            subType: isReference ? TokenType.ReferenceVariable : TokenType.Variable,
                            value: varName,
                            line: lineNum,
                            start: 0,
                            maxLabelLength: 0
                        };
                        
                        // Insert the token in the correct position
                        // Find insertion point: after the last token on this line or before first token on next line
                        let insertIndex = this.tokens.findIndex(t => t.line > lineNum);
                        if (insertIndex === -1) {
                            insertIndex = this.tokens.length;
                        }
                        
                        this.tokens.splice(insertIndex, 0, varToken);
                    }
                }
            }
        }
    }

    /** ✅ Tokenize local variables in procedures/methods/functions */
    private tokenizeProcedureLocalVariables(): void {
        // Find all procedures/methods/functions
        const procedures = this.tokens.filter(t => 
            t.type === TokenType.Procedure || 
            t.type === TokenType.Function ||
            t.subType === TokenType.MethodImplementation
        );

        // 🚀 PERF: Skip if no procedures found
        if (procedures.length === 0) {
            return;
        }

        // 🚀 PERF: Build line-to-token index ONCE (O(n) instead of O(n²))
        const tokensByLine = new Map<number, Token[]>();
        for (const token of this.tokens) {
            if (!tokensByLine.has(token.line)) {
                tokensByLine.set(token.line, []);
            }
            tokensByLine.get(token.line)!.push(token);
        }

        // Collect new tokens to add (batch insert at end)
        const newTokens: Token[] = [];

        for (const proc of procedures) {
            // 🚀 PERF: Skip if procedure was already analyzed (marked)
            if (proc.localVariablesAnalyzed) {
                continue;
            }
            
            const procEnd = proc.finishesAt || this.lines.length - 1;
            
            // 🚀 PERF: Early exit if procedure has no local data section
            // Procedures without local variables have CODE on the next non-blank line
            const nextLine = this.lines[proc.line + 1]?.trim();
            if (nextLine && nextLine.match(/^code\s*$/i)) {
                proc.localVariablesAnalyzed = true;
                continue; // No local variables, skip this procedure
            }
            
            // Search from procedure declaration to CODE statement
            for (let lineNum = proc.line + 1; lineNum <= procEnd; lineNum++) {
                const line = this.lines[lineNum];
                if (!line) continue;
                
                // Stop at CODE keyword
                if (line.match(/^\s*code\s*$/i)) {
                    break;
                }
                
                // Match variable declarations at column 0: varName   type or varName type(size)
                const varMatch = line.match(/^([A-Za-z_][A-Za-z0-9_:]*)\s+(&?[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)/i);
                if (varMatch) {
                    const varName = varMatch[1];
                    const isReference = varMatch[2].startsWith('&');
                    
                    // 🚀 PERF: O(1) lookup instead of O(n) find
                    const lineTokens = tokensByLine.get(lineNum);
                    const existingToken = lineTokens?.find(t => t.value === varName && t.start === 0);
                    
                    if (existingToken) {
                        continue;
                    }
                    
                    // Create a Variable or ReferenceVariable token
                    const varToken: Token = {
                        type: TokenType.Label,
                        subType: isReference ? TokenType.ReferenceVariable : TokenType.Variable,
                        value: varName,
                        line: lineNum,
                        start: 0,
                        maxLabelLength: 0
                    };
                    
                    newTokens.push(varToken);
                }
            }
            
            // 🚀 PERF: Mark procedure as analyzed
            proc.localVariablesAnalyzed = true;
        }

        // 🚀 PERF: Batch insert and sort ONCE instead of repeated splice operations
        if (newTokens.length > 0) {
            this.tokens.push(...newTokens);
            this.tokens.sort((a, b) => a.line - b.line || a.start - b.start);
        }
    }
}
