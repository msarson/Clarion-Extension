import { Hover } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../../ClarionTokenizer';
import { BuiltinFunctionService } from '../../utils/BuiltinFunctionService';
import { AttributeService } from '../../utils/AttributeService';
import { KeywordService } from '../../utils/KeywordService';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("ContextualHoverHandler");
logger.setLevel("error");

/**
 * Handles context-aware hover information for Clarion keywords
 * that have different meanings depending on where they appear
 */
export class ContextualHoverHandler {
    private keywordService = KeywordService.getInstance();

    constructor(
        private builtinService: BuiltinFunctionService,
        private attributeService: AttributeService
    ) {}

    /**
     * Handle hover on a PROGRAM or MEMBER keyword (the Clarion document marker).
     * Surfaces the program name on PROGRAM, or the parent program filename on
     * MEMBER. Returns null if `documentStructure` reports no match.
     */
    handleProgramOrMemberKeyword(
        word: string,
        documentStructure: { getProgramName(): string | undefined; getMemberParent(): string | undefined }
    ): Hover | null {
        const upper = word.toUpperCase();
        if (upper === 'PROGRAM') {
            const name = documentStructure.getProgramName();
            const value = name
                ? `**PROGRAM** \`${name}\`\n\nClarion executable entry point. The startup module that contains the global \`MAP\` and the program's first \`CODE\` section.`
                : `**PROGRAM**\n\nClarion executable entry point. The startup module that contains the global \`MAP\` and the program's first \`CODE\` section.`;
            return { contents: { kind: 'markdown', value } };
        }
        if (upper === 'MEMBER') {
            const parent = documentStructure.getMemberParent();
            const value = parent
                ? `**MEMBER** of \`${parent}\`\n\nThis file is a member module of the named PROGRAM. Procedures declared in the PROGRAM's \`MAP\` are visible here, and this file's globally-scoped procedures are added to that MAP.`
                : `**MEMBER**\n\nDeclares this file as a member module of a parent PROGRAM. The parenthesised filename names the parent.`;
            return { contents: { kind: 'markdown', value } };
        }
        return null;
    }

    /**
     * Handle MODULE keyword - can be in MAP (keyword) or on CLASS (attribute)
     */
    handleModuleKeyword(isInMapBlock: boolean): Hover | null {
        if (isInMapBlock) {
            // MODULE in MAP context - it's a language keyword (clarion-keywords.json),
            // NOT a builtin function — BuiltinFunctionService has no MODULE entry at
            // all, so looking it up there always returned null here.
            const entry = this.keywordService.getKeyword('MODULE');
            if (entry) {
                const formattedDoc = `**MODULE** (Keyword)\n\n${entry.description}\n\n**Syntax:** \`${entry.syntax}\``;
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
     * Handle hover over the TO keyword — belongs to a LOOP counter range
     * (`LOOP i = 1 TO 10`) or a CASE range (`OF 'A' TO 'Z'`).
     *
     * Previously scanned backward up to 50 lines checking
     * `token.type === TokenType.Keyword` for LOOP/OF/OROF — but LOOP
     * tokenizes as `TokenType.Structure` and OF/OROF as
     * `TokenType.ConditionalContinuation`, never `TokenType.Keyword`, so
     * those checks could never match (issue #529). Reads the structure the
     * tokenizer/parser already recorded instead: the LOOP's own Structure
     * token for the LOOP case, and the owning CASE's `branches` entry for
     * the CASE case. The card text itself is unchanged from before — LOOP
     * and CASE are already visible right next to TO on the same line, so a
     * label or the range text would only echo what's already on screen;
     * the fix is entirely about correctly reaching this text at all.
     */
    handleToKeyword(tokens: Token[], position: { line: number; character: number }): Hover | null {
        if (this.isInCaseRangeAt(tokens, position.line)) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**TO** (Keyword - in CASE structure)\n\n**Syntax:** \`OF expression TO expression\`\n\nAllows a range of values in an OF or OROF statement. Statements execute if the CASE condition falls within the inclusive range specified. Both expressions are evaluated even if the condition is less than the lower boundary.`
                }
            };
        }

        const inLoop = tokens.some(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === 'LOOP' &&
            t.line === position.line
        );
        if (inLoop) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `**TO** (Keyword - in LOOP structure)\n\n**Syntax:** \`i = initial TO limit [BY step]\`\n\nSpecifies the terminating value in a LOOP iteration. When counter exceeds limit (or is less than, if step is negative), loop terminates. The limit expression is evaluated once at loop start.`
                }
            };
        }

        return null;
    }

    /**
     * True when `line` is a CASE's own OF/OROF clause line (`OF 1 TO 5`) —
     * i.e. `line` matches an OF/OROF branch's `keywordToken.line` exactly,
     * not just somewhere inside that branch's body. A branch's
     * `[startLine, endLine]` covers its entire body (everything up to the
     * next branch or the CASE's END), which can contain its own nested
     * structures — a LOOP with its own unrelated TO, for instance — so
     * matching on that whole span (an earlier version of this check did)
     * misattributes a TO deep inside a branch's body to that branch's
     * OF/OROF range.
     *
     * Restricted to OF/OROF (not ELSE/ELSIF, and not IF — IF has no
     * `value TO value` range syntax) since only those can have a TO range.
     */
    private isInCaseRangeAt(tokens: Token[], line: number): boolean {
        for (const t of tokens) {
            if (t.type !== TokenType.Structure || t.value.toUpperCase() !== 'CASE' || !t.branches) continue;

            const hasRangeOnThisLine = t.branches.some(b =>
                (b.kind === 'OF' || b.kind === 'OROF') && b.keywordToken.line === line
            );
            if (hasRangeOnThisLine) return true;
        }
        return false;
    }

    /**
     * Handle keywords that serve as both a window/structure attribute and a runtime builtin
     * (HIDE, DISABLE, TYPE): in window context → attribute hover; in code context → builtin hover
     */
    handleWindowBuiltin(word: string, isInWindowContext: boolean): Hover | null {
        const upper = word.toUpperCase();
        if (isInWindowContext) {
            const attribute = this.attributeService.getAttribute(upper);
            if (attribute) {
                const appliesto = attribute.applicableTo?.join(', ') ?? '';
                const lines = [`**${upper}** (Attribute)\n\n${attribute.description}`];
                if (appliesto) lines.push(`**Applies to:** ${appliesto}`);
                return { contents: { kind: 'markdown', value: lines.join('\n\n') } };
            }
        } else {
            const signatures = this.builtinService.getSignatures(upper);
            if (signatures.length > 0) {
                const sig = signatures[0];
                const docText = typeof sig.documentation === 'string'
                    ? sig.documentation
                    : (sig.documentation as any)?.value || '';
                const syntaxStr = (sig as any).syntax || sig.label || '';
                return {
                    contents: {
                        kind: 'markdown',
                        value: `**${upper}** (Procedure)\n\n${docText}${syntaxStr ? `\n\n**Syntax:** \`${syntaxStr}\`` : ''}`
                    }
                };
            }
        }
        return null;
    }

    /**
     * Handle PROCEDURE keyword - different contexts: MAP prototype, CLASS method, implementation
     */
    handleProcedureKeyword(line: string, isInMapBlock: boolean, isInClass: boolean): Hover | null {
        // Check if this looks like an implementation (has label before PROCEDURE on same line)
        const isImplementation = line.trim().match(/^\w+(\.\w+)?\s+(?:PROCEDURE|FUNCTION)/i) !== null; // #247
        
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
