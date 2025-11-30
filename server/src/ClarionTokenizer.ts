import { DocumentStructure } from './DocumentStructure';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("Tokenizer");
logger.setLevel("error"); // Only show errors and PERF (PERF logs directly to console)
export enum TokenType {
    Comment,
    String,
    Keyword,
    Directive,
    Function,
    Variable,
    Number,
    Operator,
    Class,
    Attribute,
    Property,
    Constant,
    Type,
    DataTypeParameter,      // ✅ Parameters in data type declarations: STRING(255), CSTRING(100)
    TypeAnnotation,
    ImplicitVariable,
    Structure,
    ReferenceVariable,
    LineContinuation,
    Delimiter,
    FunctionArgumentParameter,
    PointerParameter,
    FieldEquateLabel,
    PropertyFunction,
    Unknown,
    Label,
    EndStatement,
    ClarionDocument, // ✅ PROGRAM / MEMBER token type
    Procedure,
    Routine,
    ExecutionMarker,
    Region,
    ConditionalContinuation,
    ColorValue,
    StructureField,   // ✅ Field within a structure
    StructurePrefix,   // ✅ Prefix notation for structure fields (e.g., INV:Customer)
    // ✅ New Subtypes for PROCEDURE tokens
    GlobalProcedure,           // PROCEDURE declared at global level (with CODE)
    MethodDeclaration,         // PROCEDURE inside a CLASS/MAP/INTERFACE (definition only, no CODE)
    MethodImplementation,      // e.g., ThisWindow.Init PROCEDURE (with CODE)
    MapProcedure,              // Optional: inside MAP structure
    InterfaceMethod,           // Optional: inside INTERFACE structure
    // ✅ Window structure elements
    WindowElement,             // Elements that appear in window structures (BUTTON, LIST, ITEM)
    PictureFormat              // Picture format specifiers (e.g., @N10.2)
}

export interface Token {
    label?: string; // ✅ Store label for the token
    colorParams?: string[];
    type: TokenType;
    subType?: TokenType;
    value: string;
    line: number;
    start: number;
    finishesAt?: number;
    parent?: Token;
    children?: Token[];
    executionMarker?: Token;  // ✅ First explicit "CODE" statement (if present)
    hasLocalData?: boolean;   // ✅ True if "DATA" exists before "CODE"
    inferredCode?: boolean;   // ✅ True if "CODE" is implied (not explicitly written)
    maxLabelLength: number;   // ✅ Store max label length
    structurePrefix?: string; // ✅ Store structure prefix (e.g., "INV" from PRE(INV))
    isStructureField?: boolean; // ✅ Flag to identify structure fields
    structureParent?: Token;  // ✅ Reference to the parent structure token
    nestedLabel?: string;     // ✅ Store the label of the nesting structure (e.g., "Queue:Browse:1" for fields inside it)
}



export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];
    private lines: string[];
    private tabSize: number;  // ✅ Store tabSize
    maxLabelWidth: number = 0;

    // 🚀 PERFORMANCE: Pre-compiled regex patterns cache
    private static compiledPatterns: Map<TokenType, RegExp> | null = null;
    private static orderedTypes: TokenType[] | null = null;
    // 🚀 PERFORMANCE: Pattern groups by character class for fast filtering
    private static patternsByCharClass: Map<string, TokenType[]> | null = null;

    constructor(text: string, tabSize: number = 2) {  // ✅ Default to 2 if not provided
        this.text = text;
        this.tokens = [];
        this.lines = [];
        this.tabSize = tabSize;  // ✅ Store the provided or default value
        
        // 🚀 PERFORMANCE: Initialize compiled patterns once
        if (!ClarionTokenizer.compiledPatterns) {
            ClarionTokenizer.initializePatterns();
        }
    }

    // 🚀 PERFORMANCE: Classify character for fast pattern filtering
    private getCharClass(char: string): string {
        if (char >= 'A' && char <= 'Z') return 'upper';
        if (char >= 'a' && char <= 'z') return 'lower';
        if (char === '_') return 'underscore';
        if (char >= '0' && char <= '9') return 'digit';
        if (char === '!') return 'comment';
        if (char === "'") return 'string';
        if (char === '&') return 'ampersand';
        if (char === '@') return 'at';
        if (char === '?') return 'question';
        if (char === '|') return 'pipe';
        if (char === '*') return 'star';
        if ('+-*/=<>'.indexOf(char) >= 0) return 'operator';
        if ('(),:.'.indexOf(char) >= 0) return 'delimiter';
        if (char === ' ' || char === '\t') return 'whitespace';
        return 'other';
    }

    // 🚀 PERFORMANCE: Pre-compile all regex patterns once
    private static initializePatterns(): void {
        ClarionTokenizer.compiledPatterns = new Map();
        ClarionTokenizer.patternsByCharClass = new Map();
        
        // 🚀 PERFORMANCE: Optimized order balancing specificity and frequency
        // Critical: More specific patterns MUST come before more general ones
        // Also ordered by frequency within specificity groups
        ClarionTokenizer.orderedTypes = [
            // HIGH PRIORITY: Must match first due to specificity
            TokenType.Comment,              // Very common, must be early to skip comment content
            TokenType.LineContinuation,     // Must be early (can contain other tokens)
            TokenType.String,               // Must be before Variable (strings can contain variable-like text)
            
            // LABELS & SPECIAL: Must be before general identifiers
            TokenType.Label,                // Must be before Variable (labels are identifiers at column 0)
            TokenType.FieldEquateLabel,     // Must be before Variable (?FieldName)
            TokenType.ReferenceVariable,    // Must be before Variable (&Variable)
            
            // SPECIFIC IDENTIFIERS: Before general Variable
            TokenType.ClarionDocument,      // Rare but specific (PROGRAM/MEMBER)
            TokenType.ExecutionMarker,      // Specific (CODE/DATA)
            TokenType.EndStatement,         // Specific (END/.)
            TokenType.ConditionalContinuation, // Specific (ELSE/ELSIF/OF)
            TokenType.Keyword,              // Common, more specific than Variable
            TokenType.Directive,            // Specific keywords with special syntax
            
            // STRUCTURES: Before Variable but after keywords
            TokenType.Structure,            // Must be before Variable
            TokenType.WindowElement,        // Specific window controls
            
            // FUNCTIONS & PROPERTIES: Specific patterns
            TokenType.Function,             // Must be before FunctionArgumentParameter
            TokenType.FunctionArgumentParameter, // Must be before Variable
            TokenType.PropertyFunction,     // Specific properties with parentheses
            TokenType.Property,             // Specific property names
            
            // FIELD REFERENCES: Before Variable
            TokenType.StructurePrefix,      // Must be before Variable (PREFIX:Field)
            TokenType.StructureField,       // Must be before Variable (Structure.Field)
            TokenType.Class,                // Must be before Variable (Class.Method)
            
            // TYPES: Before Variable
            TokenType.Type,                 // Common, specific type keywords
            TokenType.DataTypeParameter,    // Must be after Type (captures (255) in STRING(255))
            TokenType.TypeAnnotation,       // Specific type annotations
            
            // COMPLEX PATTERNS: Before simple ones
            TokenType.PointerParameter,     // *Variable before Variable
            TokenType.PictureFormat,        // @... formats
            
            // SIMPLE TOKENS: Common, can be checked relatively early
            TokenType.Number,               // Very common
            TokenType.Operator,             // Very common
            TokenType.Delimiter,            // Very common
            
            // ATTRIBUTES & CONSTANTS: After types
            TokenType.Attribute,            // Specific attribute keywords
            TokenType.Constant,             // Specific constants (TRUE/FALSE/NULL)
            
            // GENERAL: Last specific check before catchall
            TokenType.ImplicitVariable,     // Variable with suffix ($/#/")
            TokenType.Variable,             // General identifier - must be late
            
            // CATCHALL: Absolute last resort
            TokenType.Unknown
        ];
        
        for (const type of ClarionTokenizer.orderedTypes) {
            const pattern = tokenPatterns[type];
            if (pattern) {
                ClarionTokenizer.compiledPatterns.set(type, pattern);
            }
        }
        
        // 🚀 PERFORMANCE: Build pattern groups by character class
        // This allows us to skip entire groups of patterns based on first character
        const charClassGroups: Record<string, TokenType[]> = {
            'comment': [TokenType.Comment],
            'string': [TokenType.String],
            'question': [TokenType.FieldEquateLabel],
            'at': [TokenType.PictureFormat],
            'pipe': [TokenType.LineContinuation],
            'ampersand': [TokenType.ReferenceVariable, TokenType.LineContinuation],
            'star': [TokenType.PointerParameter],
            'digit': [TokenType.Number],
            'operator': [TokenType.Operator],
            'delimiter': [TokenType.Delimiter, TokenType.DataTypeParameter, TokenType.EndStatement],
            'upper': [ // Uppercase letter - identifiers, keywords, structures
                TokenType.Label, TokenType.Keyword, TokenType.Directive,
                TokenType.ClarionDocument, TokenType.ExecutionMarker, TokenType.EndStatement,
                TokenType.ConditionalContinuation, TokenType.Structure, TokenType.WindowElement,
                TokenType.Function, TokenType.FunctionArgumentParameter, TokenType.PropertyFunction,
                TokenType.Property, TokenType.StructurePrefix, TokenType.StructureField, TokenType.Class,
                TokenType.Type, TokenType.TypeAnnotation, TokenType.Attribute, TokenType.Constant,
                TokenType.ImplicitVariable, TokenType.Variable, TokenType.Unknown
            ],
            'lower': [ // Lowercase letter - identifiers, keywords (case-insensitive)
                TokenType.Keyword, TokenType.Directive, TokenType.ClarionDocument,
                TokenType.ExecutionMarker, TokenType.ConditionalContinuation, TokenType.Structure,
                TokenType.Function, TokenType.FunctionArgumentParameter, TokenType.PropertyFunction,
                TokenType.Property, TokenType.StructurePrefix, TokenType.StructureField, TokenType.Class,
                TokenType.Type, TokenType.TypeAnnotation, TokenType.Attribute, TokenType.Constant,
                TokenType.ImplicitVariable, TokenType.Variable, TokenType.Unknown
            ],
            'underscore': [ // Underscore - identifiers only
                TokenType.Label, TokenType.ReferenceVariable, TokenType.Variable, 
                TokenType.StructurePrefix, TokenType.StructureField, TokenType.Unknown
            ],
            'other': [ // Fallback - test all patterns
                ...ClarionTokenizer.orderedTypes
            ]
        };
        
        for (const [charClass, types] of Object.entries(charClassGroups)) {
            ClarionTokenizer.patternsByCharClass.set(charClass, types);
        }
    }


    /**
     * Process structure fields with prefixes
     * This method is called after document structure processing to enhance tokens with prefix information
     */
    private processStructureFieldPrefixes(): void {
        logger.info("🔍 [DEBUG] Processing structure field prefixes...");
        
        // Find all structure tokens
        const structures = this.tokens.filter(t =>
            t.type === TokenType.Structure
        );
        
        logger.info(`🔍 [DEBUG] Found ${structures.length} structures to check for prefixes`);
        
        // For each structure, check if it has a PRE attribute
        for (const structure of structures) {
            // Get the line number of the structure
            const lineNum = structure.line;
            
            // Get the line text
            if (!this.lines || lineNum >= this.lines.length) continue;
            const line = this.lines[lineNum];
            
            // Check if the line contains PRE(
            const preMatch = line.match(/PRE\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/i);
            if (preMatch) {
                const prefix = preMatch[1];
                structure.structurePrefix = prefix;
                logger.info(`🔍 [DEBUG] Found structure ${structure.value} with prefix ${prefix}`);
                
                // Find the structure's end line
                const structureEnd = structure.finishesAt || this.lines.length - 1;
                
                // Find all variable tokens between the structure start and end
                const fieldsInStructure = this.tokens.filter(t =>
                    (t.type === TokenType.Variable || t.type === TokenType.Label) &&
                    t.line > structure.line &&
                    t.line < structureEnd
                );
                
                logger.info(`🔍 [DEBUG] Found ${fieldsInStructure.length} potential fields in structure ${structure.value}`);
                
                // Mark these as structure fields and add the prefix
                for (const field of fieldsInStructure) {
                    field.isStructureField = true;
                    field.structureParent = structure;
                    field.structurePrefix = prefix;
                    logger.info(`🔍 [DEBUG] Field ${field.value} assigned prefix ${prefix}`);
                    logger.info(`🔍 [DEBUG] Field ${field.value} - isStructureField=${field.isStructureField}, structurePrefix=${field.structurePrefix}`);
                }
                
                // Also look for direct prefix references in the code
                const prefixPattern = new RegExp(`\\b${prefix}:\\w+\\b`, 'gi');
                
                for (let i = 0; i < this.lines.length; i++) {
                    const codeLine = this.lines[i];
                    if (!codeLine) continue;
                    
                    const matches = codeLine.match(prefixPattern);
                    if (matches) {
                        logger.info(`🔍 [DEBUG] Found prefix references in line ${i}: ${matches.join(', ')}`);
                    }
                }
            }
        }
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
            this.processStructureFieldPrefixes(); // ✅ Step 2.5: Process structure field prefixes
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
                'prefix_pct': ((prefixTime/totalTime)*100).toFixed(1) + '%'
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
        const patterns = ClarionTokenizer.compiledPatterns!;
        const types = ClarionTokenizer.orderedTypes!;
        
        // 🔬 PROFILING: Track time spent per pattern type
        const patternTiming = new Map<TokenType, number>();
        const patternMatches = new Map<TokenType, number>();
        const patternTests = new Map<TokenType, number>();
        
        for (const type of types) {
            patternTiming.set(type, 0);
            patternMatches.set(type, 0);
            patternTests.set(type, 0);
        }
        
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            if (line.trim() === "") continue; // ✅ Skip blank lines

            let position = 0;
            // 🚀 PERFORMANCE: Only expand tabs if line contains tabs
            let column = 0;
            if (line.includes('\t')) {
                const expandedLine = this.expandTabs(line);
                column = expandedLine.match(/^(\s*)/)?.[0].length || 0;
            } else {
                column = line.match(/^(\s*)/)?.[0].length || 0;
            }

            while (position < line.length) {
                const substring = line.slice(position);
                let matched = false;

                // 🚀 PERFORMANCE: Character-class filtering - classify once, test only relevant patterns
                const firstChar = substring[0];
                const charClass = this.getCharClass(firstChar);
                const relevantTypes = ClarionTokenizer.patternsByCharClass!.get(charClass) || types;

                // Test only patterns relevant to this character class
                for (const tokenType of relevantTypes) {
                    const pattern = patterns.get(tokenType);
                    if (!pattern) continue;

                    if (tokenType === TokenType.Label && column !== 0) continue; // ✅ Labels must be in column 0
                    if (tokenType === TokenType.EndStatement && column === 0) continue; // ✅ END/. must NOT be at column 0

                    // 🔬 PROFILING: Time each pattern test
                    const testStart = performance.now();
                    let match = pattern.exec(substring);
                    const testTime = performance.now() - testStart;
                    
                    patternTiming.set(tokenType, patternTiming.get(tokenType)! + testTime);
                    patternTests.set(tokenType, patternTests.get(tokenType)! + 1);
                    
                    if (match && match.index === 0) {
                        patternMatches.set(tokenType, patternMatches.get(tokenType)! + 1);
                        
                        // Special handling for Structure tokens to avoid misclassifying variables
                        let newTokenType = tokenType;
                        if (tokenType === TokenType.Structure) {
                            // Check if this is likely a variable reference rather than a structure declaration
                            const upperValue = match[0].trim().toUpperCase();
                            
                            // Check if inside parentheses (function call)
                            let parenDepth = 0;
                            for (let i = 0; i < position; i++) {
                                if (line[i] === '(') parenDepth++;
                                if (line[i] === ')') parenDepth--;
                            }
                            
                            // If inside parentheses or after a dot (e.g., SELF.AddItem(Toolbar)),
                            // treat as a variable instead of a structure
                            if (parenDepth > 0 ||
                                (position > 0 && line.substring(0, position).includes('.')) ||
                                (position > 0 && line.substring(0, position).trim().endsWith('='))) {
                                newTokenType = TokenType.Variable;
                                logger.info(`🔄 Reclassified '${match[0].trim()}' from Structure to Variable at line ${lineNumber}`);
                            }
                        }
                        
                        let newToken: Token = {
                            type: newTokenType,
                            value: match[0].trim(),
                            line: lineNumber,
                            start: column,
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
                    logger.info(`Found DATA section in routine ${routine.value} at line ${lineNum}`);
                    continue;
                }
                
                // Check for CODE keyword (ends DATA section)
                if (line.match(/^\s*code\s*$/i)) {
                    inDataSection = false;
                    logger.info(`DATA section ended at line ${lineNum}`);
                    break;
                }
                
                // If in DATA section, tokenize variable declarations
                if (inDataSection) {
                    logger.info(`🔍 TOKENIZER: Checking line ${lineNum} in DATA section: "${line}"`);
                    
                    // Match variable declarations: varName   type or varName type(size)
                    // Variables in routines start at column 0 (after any leading whitespace is removed)
                    // Updated to handle types with parameters like CSTRING(1024), STRING(255), etc.
                    const varMatch = line.match(/^([A-Za-z_][A-Za-z0-9_:]*)\s+(&?[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)/i);
                    if (varMatch) {
                        const varName = varMatch[1];
                        const isReference = varMatch[2].startsWith('&');
                        
                        logger.info(`✅ TOKENIZER: Found routine variable: ${varName} (reference: ${isReference}) at line ${lineNum}`);
                        
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

        logger.info(`🔍 TOKENIZER: tokenizeProcedureLocalVariables found ${procedures.length} procedures`);

        for (const proc of procedures) {
            const procEnd = proc.finishesAt || this.lines.length - 1;
            logger.info(`🔍 TOKENIZER: Processing procedure "${proc.value}" from line ${proc.line} to ${procEnd}, subType: ${proc.subType}`);
            
            // Search from procedure declaration to CODE statement
            for (let lineNum = proc.line + 1; lineNum <= procEnd; lineNum++) {
                const line = this.lines[lineNum];
                if (!line) continue;
                
                // Stop at CODE keyword
                if (line.match(/^\s*code\s*$/i)) {
                    logger.info(`🔍 TOKENIZER: Found CODE keyword at line ${lineNum}, stopping variable search`);
                    break;
                }
                
                logger.info(`🔍 TOKENIZER: Checking procedure line ${lineNum}: "${line}"`);
                
                // Match variable declarations at column 0: varName   type or varName type(size)
                // Updated to handle types with parameters like CSTRING(1024), STRING(255), etc.
                const varMatch = line.match(/^([A-Za-z_][A-Za-z0-9_:]*)\s+(&?[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)/i);
                if (varMatch) {
                    const varName = varMatch[1];
                    const isReference = varMatch[2].startsWith('&');
                    
                    // 🔍 CHECK: Skip if this variable already exists with structure field metadata
                    const existingToken = this.tokens.find(t => 
                        t.line === lineNum && 
                        t.value === varName && 
                        t.start === 0
                    );
                    
                    if (existingToken) {
                        if ((existingToken as any).isStructureField) {
                            logger.info(`⏭️ TOKENIZER: Skipping ${varName} - already exists as structure field`);
                            continue;
                        }
                        // Token exists but isn't a structure field - skip duplicate
                        logger.info(`⏭️ TOKENIZER: Skipping ${varName} - token already exists`);
                        continue;
                    }
                    
                    logger.info(`✅ TOKENIZER: Found procedure local variable: ${varName} (reference: ${isReference}) at line ${lineNum}`);
                    
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
                    let insertIndex = this.tokens.findIndex(t => t.line > lineNum);
                    if (insertIndex === -1) {
                        insertIndex = this.tokens.length;
                    }
                    
                    this.tokens.splice(insertIndex, 0, varToken);
                }
            }
        }
    }

    /** ✅ Expand tabs into spaces for correct alignment */
    private expandTabs(line: string): string {
        let expanded = "";
        let currentColumn = 0;

        for (let char of line) {
            if (char === "\t") {
                let nextTabStop = Math.ceil((currentColumn + 1) / this.tabSize) * this.tabSize;
                let spacesToAdd = nextTabStop - currentColumn; // ✅ Correct calculation
                expanded += " ".repeat(spacesToAdd);
                currentColumn = nextTabStop;
            } else {
                expanded += char;
                currentColumn++;
            }
        }

        return expanded;
    }




}


/** ✅ Ordered token types */
const orderedTokenTypes: TokenType[] = [
    TokenType.Directive,TokenType.Comment, TokenType.ClarionDocument, TokenType.ExecutionMarker, TokenType.Label, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
    TokenType.Type, TokenType.PointerParameter, TokenType.FieldEquateLabel, TokenType.Property,
    TokenType.PropertyFunction, TokenType.Keyword, TokenType.Structure,
    // ✅ Add StructurePrefix and StructureField before other variable types
    TokenType.StructurePrefix, TokenType.StructureField,
    // ✅ Add WindowElement after Structure elements but before other types
    TokenType.WindowElement,
    TokenType.ConditionalContinuation, TokenType.Function,  // ✅ Placed after Structure, before FunctionArgumentParameter
    TokenType.FunctionArgumentParameter, TokenType.TypeAnnotation, TokenType.PictureFormat, TokenType.Number,
    TokenType.EndStatement,  // ✅ MOVED AFTER Number to avoid matching dots in decimals
    TokenType.Operator, TokenType.Class, TokenType.Attribute, TokenType.Constant, TokenType.Variable,
    TokenType.ImplicitVariable, TokenType.Delimiter, TokenType.Unknown
];

const STRUCTURE_PATTERNS: Record<string, RegExp> = {
    MODULE: /^\s*MODULE\b/i,  // MODULE should be the first word on the line
    APPLICATION: /\bAPPLICATION\b(?=\s*(\(|,))/i,
    CASE: /\bCASE\b/i,
    CLASS: /\bCLASS\b/i,
    GROUP: /\bGROUP\b/i,
    FILE: /\sFILE\b/i,
    INTERFACE: /\bINTERFACE\b/i,
    IF: /\bIF\b/i,  // ✅ Re-added "IF" as a structure
    JOIN: /\bJOIN\b/i,
    LOOP: /\bLOOP\b/i,
    MAP: /\bMAP\b/i,
    MENU: /\bMENU\b(?=\s*(\(|,))/i,
    MENUBAR: /\bMENUBAR\b/i,
    //QUEUE: /\bQUEUE(?![:\(])\b/i,  // Prevents detecting Queue:Browse as a structure
    QUEUE: /\s+\bQUEUE\b(?!:)/i,

    // RECORD: /^\s*(\w+)\s+(RECORD)\b/i,
    RECORD: /\bRECORD\b/i,
    REPORT: /\bREPORT\b/i,
    SECTION: /\bSECTION\b/i,
    SHEET: /\bSHEET\b/i,
    TAB: /\bTAB\b/i,
    TOOLBAR: /^[ \t]*TOOLBAR\b(?=\s*(\(|,))/i,  // Only match TOOLBAR at beginning of line followed by ( or ,
    VIEW: /\sVIEW\b/i,
    WINDOW: /\bWINDOW\b(?=\s*(\(|,))/i,
    OPTION: /\bOPTION\b/i,
    ITEMIZE: /\bITEMIZE\b/i,
    EXECUTE: /\bEXECUTE\b/i,
    BEGIN: /\bBEGIN\b/i,  // ✅ Re-added
    FORM: /\bFORM\b/i,  // ✅ Re-added
    DETAIL: /\bDETAIL\b/i,  // ✅ Re-added
    HEADER: /\bHEADER\b/i,  // ✅ Re-added
    FOOTER: /\bFOOTER\b/i,  // ✅ Re-added
    BREAK: /\bBREAK\b/i,  // ✅ Re-added
    ACCEPT: /\bACCEPT\b/i,  // ✅ Re-added
    OLE: /\bOLE\b/i
};
/** ✅ Token Patterns (Kept Exactly the Same) */
export const tokenPatterns: Partial<Record<TokenType, RegExp>> = {
    [TokenType.Comment]: /!.*/i,
    [TokenType.LineContinuation]: /&?\s*\|.*/i,
    [TokenType.String]: /'([^']|'')*'/i,
    [TokenType.EndStatement]: /^\s*END\s*(?:!.*)?$|^\s*\.\s*(?:!.*)?$|\.\s*(?:!.*)?$/i,  // ✅ END or dot at end of line
    [TokenType.FunctionArgumentParameter]: /\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/i,  // Captures anything inside ()
    [TokenType.PointerParameter]: /\*\s*\b[A-Za-z_][A-Za-z0-9_]*\b/i,
    [TokenType.FieldEquateLabel]: /\?[A-Za-z_][A-Za-z0-9_]*/i,
    [TokenType.ClarionDocument]: /\b(?:PROGRAM|MEMBER)\b/i,
    [TokenType.ConditionalContinuation]: /\b(?:ELSE|ELSIF|OF)\b/i,  // ✅ New type for ELSE and ELSIF
    [TokenType.Keyword]: /\b(?:RETURN|THEN|UNTIL|EXIT|NEW|PROCEDURE|ROUTINE|PROC|BREAK|KEY)\b/i, // Added KEY to keywords
    [TokenType.PictureFormat]: /(@N[^\s,]*|@[Ee][^\s,]*|@S\d+|@D\d{1,2}[.\-_'`<>]?\d{0,2}B?|@T\d{1,2}[.\-_'`]?[B]?|@[Pp][^Pp\n]+[Pp]B?|@[Kk][^Kk\n]+[Kk]B?)/i,

    [TokenType.Structure]: new RegExp(
        Object.values(STRUCTURE_PATTERNS).map(r => r.source).join("|"), "i"
    ),
    [TokenType.ExecutionMarker]: /^\s*(CODE|DATA)\s*$/i,  // ✅ Matches `CODE` or `DATA` only at start of line

    [TokenType.Function]: /\b(?:COLOR|LINK|DLL)\b(?=\s*\()/i,
    [TokenType.Directive]: /\b(?:ASSERT|BEGIN|COMPILE|INCLUDE|ITEMIZE|OMIT|ONCE|SECTION|SIZE)\b(?=\s*(\(|,))/i,
    [TokenType.Property]: /\b(?:HVSCROLL|SEPARATOR|RESIZE|DEFAULT|CENTER|MAX|SYSTEM|IMM|DRIVER|PROP|PROPLIST|EVENT|CREATE|BRUSH|LEVEL|STD|CURSOR|BEEP|REJECT|CHARSET|PEN|LISTZONE|MSGMODE|TEXT|FREEZE|DDE|FF_|OCX|DOCK|MATCH|PAPER|DRIVEROP|DATATYPE|GradientTypes|STD|MDI|GRAY|HLP)\b/i,
    [TokenType.PropertyFunction]: /\b(?:FORMAT|FONT|USE|ICON|STATUS|MSG|TIP|AT|PROJECT|PRE|FROM|NAME|DLL)\b(?=\s*\()/i,
    //[TokenType.Label]: /^\s*([A-Za-z_][A-Za-z0-9_:]*)\b/i,
    [TokenType.Label]: /^\s*([A-Za-z_][A-Za-z0-9_:.]*)\b/i,

    // ✅ Add pattern for structure prefix notation (e.g., INV:Customer)
    // Updated to handle complex prefixes like Queue:Browse:1:Field
    [TokenType.StructurePrefix]: /\b[A-Za-z_][A-Za-z0-9_:]*:[A-Za-z_][A-Za-z0-9_]*\b/i,
    
    // ✅ Add pattern for structure field with dot notation (e.g., Invoice.Customer)
    // Updated to handle complex structure names like Queue:Browse:1.Field
    [TokenType.StructureField]: /\b[A-Za-z_][A-Za-z0-9_:]*\.[A-Za-z_][A-Za-z0-9_]*\b/i,

    [TokenType.Variable]: /&?[A-Za-z_][A-Za-z0-9_]*\s*(?:&[A-Za-z_][A-Za-z0-9_]*)?/i,
    // ✅ Added support for Binary, Octal, Hex constants
    [TokenType.Number]: /[+-]?(?:\d+\.\d+|\d+(?!\.\d)|\d+[bBoOhH]|\h*[A-Fa-f0-9]+[hH])/,
    [TokenType.Operator]: /[+\-*/=<>!&]/i,
    [TokenType.Class]: /^[A-Za-z_][A-Za-z0-9_:]*\.[A-Za-z_][A-Za-z0-9_:.]*\s/i,
    [TokenType.Attribute]: /\b(?:ABOVE|ABSOLUTE|AUTO|BINDABLE|CONST|DERIVED|DIM|EXTEND|EXTERNAL|GLOBALCLASS|IMM|IMPLEMENTS|INCLUDE|INS|LATE|MODULE|NOBAR|NOCASE|NOFRAME|NOMEMO|NOMERGE|NOSHEET|OPT|OVER|OVR|OWNER|PRIVATE|PROTECTED|PUBLIC|STATIC|THREAD|TYPE|VIRTUAL)\b/i,
    [TokenType.Constant]: /\b(?:TRUE|FALSE|NULL|STD:*)\b/i,
    // ✅ NEW: Detects QUEUE, GROUP, RECORD when used as parameters
    [TokenType.TypeAnnotation]: /\b(?:QUEUE|GROUP|RECORD|FILE|VIEW|REPORT|MODULE)\s+\w+\)/i,
    [TokenType.DataTypeParameter]: /\(\d+\)/i,  // ✅ Matches (255), (1024), etc. in STRING(255), CSTRING(1024)
    [TokenType.Type]: /\b(?:ANY|ASTRING|BFLOAT4|BFLOAT8|BLOB|MEMO|BOOL|BSTRING|BYTE|CSTRING|DATE|DECIMAL|DOUBLE|EQUATE|FLOAT4|LONG|LIKE|PDECIMAL|PSTRING|REAL|SHORT|SIGNED|SREAL|STRING|TIME|ULONG|UNSIGNED|USHORT|VARIANT)\b/i,
    [TokenType.ImplicitVariable]: /\b[A-Za-z][A-Za-z0-9_]+(?:\$|#|")\b/i,
    [TokenType.Delimiter]: /[,():]/i,  // ❌ Remove "." from here
    [TokenType.ReferenceVariable]: /&[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*(?::\d+)?)?/i,
    [TokenType.Unknown]: /\S+/i,
    
    // ✅ Add pattern for window structure elements (BUTTON, LIST, ITEM)
    // These elements appear as the first word on a line but not in column one (requiring at least one space beforehand)
    // Window elements pattern - for STRING, only match when it's followed by a picture format (@...)
    [TokenType.WindowElement]: /^[ \t]+(BUTTON|LIST|ITEM|PROMPT|ENTRY|RADIO|CHECK|SLIDER|BOX|IMAGE|PROGRESS|REGION|SPIN|LINE)\b(?!\s*:)|^[ \t]+STRING\s*\(@[^)]*\)/i
    

};
