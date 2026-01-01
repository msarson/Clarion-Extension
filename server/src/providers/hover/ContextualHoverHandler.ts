import { Hover } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../../ClarionTokenizer';
import { BuiltinFunctionService } from '../../utils/BuiltinFunctionService';
import { AttributeService } from '../../utils/AttributeService';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("ContextualHoverHandler");

/**
 * Handles context-aware hover information for Clarion keywords
 * that have different meanings depending on where they appear
 */
export class ContextualHoverHandler {
    constructor(
        private builtinService: BuiltinFunctionService,
        private attributeService: AttributeService
    ) {}

    /**
     * Handle MODULE keyword - can be in MAP (keyword) or on CLASS (attribute)
     */
    handleModuleKeyword(isInMapBlock: boolean): Hover | null {
        if (isInMapBlock) {
            // MODULE in MAP context - it's a builtin keyword
            const signatures = this.builtinService.getSignatures('MODULE');
            if (signatures.length > 0) {
                const sig = signatures[0];
                const docText = typeof sig.documentation === 'string' 
                    ? sig.documentation 
                    : (sig.documentation as any)?.value || '';
                const formattedDoc = `**MODULE** (Keyword)\n\n${docText}\n\n**Syntax:** \`${sig.label}\``;
                return {
                    contents: {
                        kind: 'markdown',
                        value: formattedDoc
                    }
                };
            }
        } else {
            // MODULE outside MAP - it's likely a CLASS attribute
            if (this.attributeService.isAttribute('MODULE')) {
                const attribute = this.attributeService.getAttribute('MODULE');
                if (attribute) {
                    const formattedDoc = `**MODULE** (Attribute)\n\n${attribute.description}\n\n**Applies to:** ${attribute.applicableTo.join(', ')}`;
                    return {
                        contents: {
                            kind: 'markdown',
                            value: formattedDoc
                        }
                    };
                }
            }
        }
        return null;
    }

    /**
     * Handle TO keyword - can be in LOOP or CASE structure
     */
    handleToKeyword(tokens: Token[], position: { line: number; character: number }, line: string): Hover | null {
        // Search backwards and on current line for LOOP, CASE, or OF keywords
        let foundLoop = false;
        let foundCaseOf = false;
        
        // Check current line first for OF (CASE OF...TO pattern)
        const currentLineText = line.toUpperCase();
        if (currentLineText.includes('OF') && currentLineText.includes('TO')) {
            foundCaseOf = true;
        }
        
        // If not found on current line, search backwards
        if (!foundCaseOf) {
            for (let searchLine = position.line; searchLine >= Math.max(0, position.line - 50); searchLine--) {
                const searchLineTokens = tokens.filter(t => t.line === searchLine);
                
                for (const token of searchLineTokens) {
                    const upperValue = token.value.toUpperCase();
                    if (upperValue === 'LOOP' && token.type === TokenType.Keyword) {
                        foundLoop = true;
                        break;
                    } else if ((upperValue === 'OF' || upperValue === 'OROF') && token.type === TokenType.Keyword) {
                        foundCaseOf = true;
                        break;
                    } else if (upperValue === 'END' && token.type === TokenType.EndStatement) {
                        break;
                    }
                }
                
                if (foundLoop || foundCaseOf) break;
            }
        }
        
        // Provide context-specific documentation
        if (foundLoop) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**TO** (Keyword - in LOOP structure)\n\n**Syntax:** \`i = initial TO limit [BY step]\`\n\nSpecifies the terminating value in a LOOP iteration. When counter exceeds limit (or is less than, if step is negative), loop terminates. The limit expression is evaluated once at loop start.`
                }
            };
        } else if (foundCaseOf) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**TO** (Keyword - in CASE structure)\n\n**Syntax:** \`OF expression TO expression\`\n\nAllows a range of values in an OF or OROF statement. Statements execute if the CASE condition falls within the inclusive range specified. Both expressions are evaluated even if the condition is less than the lower boundary.`
                }
            };
        }
        
        return null;
    }

    /**
     * Handle ELSE keyword - can be in IF or CASE structure
     */
    handleElseKeyword(tokens: Token[], position: { line: number; character: number }): Hover | null {
        // Search backwards for CASE or IF keyword to determine context
        let foundCase = false;
        let foundIf = false;
        
        for (let searchLine = position.line - 1; searchLine >= Math.max(0, position.line - 50); searchLine--) {
            const searchLineTokens = tokens.filter(t => t.line === searchLine);
            
            for (const token of searchLineTokens) {
                const upperValue = token.value.toUpperCase();
                if (upperValue === 'CASE' && token.type === TokenType.Keyword) {
                    foundCase = true;
                    break;
                } else if (upperValue === 'IF' && token.type === TokenType.Keyword) {
                    foundIf = true;
                    break;
                } else if (upperValue === 'END' && token.type === TokenType.EndStatement) {
                    break;
                }
            }
            
            if (foundCase || foundIf) break;
        }
        
        // Provide context-specific documentation
        if (foundCase) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**ELSE** (Keyword - in CASE structure)\n\nStatements following ELSE execute when all preceding OF and OROF options have been evaluated as not equivalent. ELSE is optional but must be last option in CASE structure if used.`
                }
            };
        } else if (foundIf) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**ELSE** (Keyword - in IF structure)\n\nStatements following ELSE execute when all preceding IF and ELSIF conditions evaluate as false. ELSE is optional but must be last option in IF structure if used.`
                }
            };
        }
        
        return null;
    }

    /**
     * Handle PROCEDURE keyword - different contexts: MAP prototype, CLASS method, implementation
     */
    handleProcedureKeyword(line: string, isInMapBlock: boolean, isInClass: boolean): Hover | null {
        // Check if this looks like an implementation (has label before PROCEDURE on same line)
        const isImplementation = line.trim().match(/^\w+(\.\w+)?\s+PROCEDURE/i) !== null;
        
        if (isImplementation) {
            // This is a procedure implementation
            const hasClassPrefix = line.includes('.');
            if (hasClassPrefix) {
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**PROCEDURE** (CLASS Method Implementation)\n\n**Syntax:** \`ClassName.MethodName PROCEDURE[(params)]\`\n\nDefines the implementation of a CLASS method. Must match a prototype declared in the CLASS definition.\n\n\`\`\`clarion\nMyClass.MyMethod PROCEDURE(LONG param)\n  CODE\n  ! implementation\n  RETURN\n\`\`\``
                    }
                };
            } else {
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**PROCEDURE** (Implementation)\n\n**Syntax:** \`ProcName PROCEDURE[(params)]\`\n\nDefines a procedure implementation. Must match a prototype declared in MAP.\n\n\`\`\`clarion\nMyProc PROCEDURE(LONG param)\n  CODE\n  ! implementation\n  RETURN\n\`\`\``
                    }
                };
            }
        } else if (isInMapBlock) {
            // This is a MAP prototype
            return {
                contents: {
                    kind: 'markdown',
                    value: `**PROCEDURE** (MAP Prototype)\n\n**Syntax:** \`ProcName PROCEDURE[(params)] [,returnType] [,attributes]\`\n\nDeclares a procedure prototype in MAP block. Specifies the procedure signature, optional return type, and calling conventions.\n\n\`\`\`clarion\nMAP\n  MyProc PROCEDURE(LONG),STRING  ! Returns STRING\n  WinAPI PROCEDURE(*CSTRING),LONG,PASCAL,RAW\nEND\n\`\`\``
                }
            };
        } else if (isInClass) {
            // This is a CLASS method prototype
            return {
                contents: {
                    kind: 'markdown',
                    value: `**PROCEDURE** (CLASS Method Prototype)\n\n**Syntax:** \`MethodName PROCEDURE[(params)] [,returnType] [,attributes]\`\n\nDeclares a CLASS method prototype. Can include VIRTUAL, PRIVATE, PROTECTED attributes.\n\n\`\`\`clarion\nMyClass CLASS\n  MyMethod PROCEDURE(LONG),STRING,VIRTUAL\n  Init     PROCEDURE(),PROTECTED\nEND\n\`\`\``
                }
            };
        }
        
        return null;
    }
}
