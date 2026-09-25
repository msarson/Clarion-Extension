import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType, ClarionTokenizer } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { TokenHelper } from '../../utils/TokenHelper';
import { HoverFormatter, typeLabel } from './HoverFormatter';
import { MethodHoverResolver } from './MethodHoverResolver';
import { VariableHoverResolver } from './VariableHoverResolver';
import { ChainedPropertyResolver } from '../../utils/ChainedPropertyResolver';
import { MemberLocatorService } from '../../services/MemberLocatorService';
import { DottedAccessResolver } from '../../services/DottedAccessResolver';
import { MethodOverloadResolver } from '../../utils/MethodOverloadResolver';
import { CallSiteArgumentClassifier } from '../../utils/CallSiteArgumentClassifier';
import { SolutionManager } from '../../solution/solutionManager';
import { resolveViaProjectRedirection } from '../../utils/RedirectionResolution';
import { StructureDeclarationIndexer } from '../../utils/StructureDeclarationIndexer';
import { MemberOwnerKind } from '../../utils/ClassMemberScan'; // #668
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../../logger';

/** #668 — a field's declaration: its document and tokens, the label token, and the structure that owns it. */
interface FieldDeclaration {
    doc: TextDocument;
    tokens: Token[];
    token: Token;
    owner: Token;
}

const logger = LoggerManager.getLogger("StructureFieldResolver");
logger.setLevel("error");

/**
 * Resolves hover information for structure field access (e.g., MyGroup.MyVar)
 */
export class StructureFieldResolver {
    private tokenCache = TokenCache.getInstance();
    private memberLocator = new MemberLocatorService();
    private overloadResolver = new MethodOverloadResolver();
    /** #651 — the declaration a single-level `receiver.member` names, shared with Go to Definition. */
    private dottedAccess = new DottedAccessResolver(this.memberLocator, this.overloadResolver);
    
    constructor(
        private formatter: HoverFormatter,
        private methodResolver: MethodHoverResolver,
        private variableResolver: VariableHoverResolver
    ) {}

    /**
     * Resolves hover for structure.field notation (e.g., MyGroup.MyVar)
     */
    async resolveStructureAccess(
        word: string,
        line: string,
        position: Position,
        document: TextDocument
    ): Promise<Hover | null> {
        // Check if this is a structure/group name followed by a dot (e.g., hovering over "MyGroup" in "MyGroup.MyVar")
        // BUT: Skip SELF.member and PARENT.member - those are class method calls handled separately
        const wordStartInLine = line.indexOf(word, Math.max(0, position.character - word.length));
        const dotIndex = line.indexOf('.', wordStartInLine);
        
        const isSelfMember = word.toUpperCase().startsWith('SELF.');
        const isParentMember = word.toUpperCase().startsWith('PARENT.');
        
        if (dotIndex > wordStartInLine && dotIndex < wordStartInLine + word.length + 5 && !isSelfMember && !isParentMember) {
            // There's a dot right after the word - this looks like structure.field notation
            logger.info(`Detected dot notation for word: ${word}, dotIndex: ${dotIndex}`);
            
            const tokens = this.tokenCache.getTokens(document);
            const structure = this.tokenCache.getStructure(document); // 🚀 PERFORMANCE: Get cached structure
            const currentScope = TokenHelper.getInnermostScopeAtLine(structure, position.line); // 🚀 PERFORMANCE: O(log n) vs O(n)
            if (currentScope) {
                // Look for the GROUP/QUEUE/etc definition
                const structureInfo = this.variableResolver.findLocalVariableInfo(word, tokens, currentScope, document, word);
                if (structureInfo) {
                    logger.info(`✅ Found structure info for ${word}`);
                    return this.formatter.formatVariable(word, await this.variableResolver.withLike(structureInfo, document.uri, document), currentScope, document);
                } else {
                    logger.info(`❌ Could not find structure info for ${word}`);
                }
            }
        }
        
        return null;
    }

    /**
     * Resolves hover for field access after dot (e.g., hovering on "MyVar" in "MyGroup.MyVar")
     */
    async resolveFieldAccess(
        word: string,
        line: string,
        position: Position,
        document: TextDocument,
        countParametersInCall: (line: string, methodName: string) => number | null
    ): Promise<Hover | null> {
        // Check if this is a class member access (self.member or variable.member)
        const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
        logger.info(`resolveFieldAccess: word="${word}", position.character=${position.character}, dotBeforeIndex=${dotBeforeIndex}`);
        
        if (dotBeforeIndex <= 0) {
            logger.info(`resolveFieldAccess: No dot found before position, returning null`);
            return null;
        }

        // #603: the dot must be IMMEDIATELY followed by the member name. A dot with whitespace after
        // it is a statement terminator, which is how the compiler reads it (#574, compiler-verified:
        // `Obj.   Method(42)` and `Obj . Method(42)` both fail with "Expected: <statement>") and how
        // our tokenizer reads it — an EndStatement. Without this we answer with a member-access card
        // for a line that will not build, because the `.trim()` below discards the deciding space.
        if (/\s/.test(line.charAt(dotBeforeIndex + 1))) {
            logger.info(`resolveFieldAccess: whitespace after the dot — a statement terminator, not a member access`);
            return null;
        }

        const rawBeforeDot = line.substring(0, dotBeforeIndex).trim();
        const beforeDot = ChainedPropertyResolver.extractChain(rawBeforeDot);
        const afterDot = line.substring(dotBeforeIndex + 1).trim();
        const fieldMatch = afterDot.match(/^([\w:]+)/);
        
        logger.info(`resolveFieldAccess: beforeDot="${beforeDot}", afterDot="${afterDot}"`);
        
        // Extract field name from word (in case TokenHelper returned "prefix.field")
        const fieldName = word.includes('.') ? word.split('.').pop()! : word;
        logger.info(`resolveFieldAccess: fieldName extracted="${fieldName}", fieldMatch[1]="${fieldMatch ? fieldMatch[1] : 'null'}"`);
        
        if (!fieldMatch || fieldMatch[1].toLowerCase() !== fieldName.toLowerCase()) {
            logger.info(`resolveFieldAccess: Field name mismatch, returning null`);
            return null;
        }

        // Verify cursor is actually on the word immediately after the dot, not a later occurrence
        // e.g. "SELF.Q &= Q" — cursor on 2nd Q should NOT match SELF.Q
        // When word includes qualifier ("SELF.LC"), wordStart must include the SELF part
        const qualifier = word.includes('.') ? word.substring(0, word.lastIndexOf('.')) : '';
        const fieldStartInLine = dotBeforeIndex + 1;
        const wordStartInLine = qualifier ? fieldStartInLine - qualifier.length - 1 : fieldStartInLine;
        const wordEndInLine = fieldStartInLine + fieldName.length;
        if (position.character < wordStartInLine || position.character > wordEndInLine) {
            logger.info(`resolveFieldAccess: Cursor not on field immediately after dot, returning null`);
            return null;
        }

        // Check if this is a method call (has parentheses)
        const hasParentheses = afterDot.includes('(') || line.substring(position.character).trimStart().startsWith('(');
        
        // Check if beforeDot ends with 'self' as a complete word (not part of another word)
        // Handles: "self", "address(self", "x = self", etc.
        const isSelfMember = /\bself$/i.test(beforeDot);
        const isParentMember = /\bparent$/i.test(beforeDot);
        const isPureChain = /^[A-Za-z_][A-Za-z0-9_:]*(?:\.[A-Za-z_][A-Za-z0-9_:]*)*$/i.test(beforeDot.trim());
        logger.info(`resolveFieldAccess: Checking if beforeDot ends with 'self': "${beforeDot}" matches \\bself$ = ${isSelfMember}`);
        
        // #651 / #652 — a single-level receiver (SELF, PARENT, or a name that is a CLASS or a
        // variable of a CLASS type) or a chain of them (`SELF.a.b`, `obj.a.b`).
        // DottedAccessResolver names the declaration, the same call Go to Definition makes, so the
        // two cannot disagree about it; the card is built from that declaration. SELF, PARENT and
        // a chain that name nothing answer nothing, as before. Any other single-level receiver
        // the resolver does not cover (a GROUP/QUEUE/FILE, an interface reference) falls through
        // to the structure-field paths below.
        if (!beforeDot.includes('.') || isPureChain) {
            const receiver = beforeDot.includes('.') ? beforeDot.trim()
                : isSelfMember ? 'SELF' : isParentMember ? 'PARENT' : beforeDot.match(/([\w:]+)\s*$/)?.[1];
            if (receiver) {
                const paramCount = hasParentheses ? (countParametersInCall(line, fieldName) ?? undefined) : undefined;
                const access = await this.dottedAccess.resolve(receiver, fieldName, document, position.line, paramCount);
                if (access) {
                    // #652 / #488: a GROUP / QUEUE field shows the one card a field has everywhere -
                    // at its declaration, in PRE form and in dot form - not the member card.
                    // #668: the member's own declaration settles it when the resolver did not say:
                    // a chain into a nested GROUP (`Mine.Inner.Flag`) comes back as a member of the
                    // outer type with no structure kind, and belongs to the nested GROUP.
                    const declaration = this.fieldDeclaration(access.member, fieldName, document);
                    const isField = declaration !== null ||
                        ((access.member.structureType === 'GROUP' || access.member.structureType === 'QUEUE') &&
                         !/\b(PROCEDURE|FUNCTION)\b/i.test(access.member.type));
                    if (isField) {
                        const fieldHover = await this.fieldCard(declaration?.owner.label ?? access.member.className, fieldName,
                            document, position, access.receiverKind === 'chain', declaration ?? undefined);
                        if (fieldHover) return fieldHover;
                    }
                    // A chain into a structure declared elsewhere keeps the member card (#652), but a
                    // GROUP / QUEUE member is never a "Class Property" (StructuredTypeMemberLabel).
                    const ownerKind = declaration?.owner.value.toUpperCase();
                    const labelled = !access.member.structureType && (ownerKind === 'GROUP' || ownerKind === 'QUEUE')
                        ? { ...access, member: { ...access.member, structureType: ownerKind as MemberOwnerKind } }
                        : access;
                    return await this.methodResolver.formatDottedMember(fieldName, labelled, document, paramCount);
                }
                if (isSelfMember || isParentMember || beforeDot.includes('.')) return null;
            }
        }

        if (!beforeDot.includes('.')) {
            // variable.member - structure field access (e.g., MyGroup.MyVar)
            // or typed class variable access (e.g., st.GetValue() where st is StringTheory)
            const structureNameMatch = beforeDot.match(/([\w:]+)\s*$/);
            if (structureNameMatch) {
                const structureName = structureNameMatch[1];
                logger.info(`Detected structure field access: ${structureName}.${word}`);
                
                const tokens = this.tokenCache.getTokens(document);
                const callParamCount = hasParentheses ? (countParametersInCall(line, fieldName) ?? undefined) : undefined;

                // (#611: a CLASS receiver's member - the receiver's own class, then its ancestors,
                // by argument count - is answered above by DottedAccessResolver, #651.)

                const structure = this.tokenCache.getStructure(document); // 🚀 PERFORMANCE: Get cached structure
                const currentScope = TokenHelper.getInnermostScopeAtLine(structure, position.line); // 🚀 PERFORMANCE: O(log n) vs O(n)
                if (currentScope) {
                    // Try to find the structure field using dot notation reference
                    const fullReference = `${structureName}.${fieldName}`;
                    const variableInfo = this.variableResolver.findLocalVariableInfo(fieldName, tokens, currentScope, document, fullReference);
                    if (variableInfo) {
                        logger.info(`✅ Found structure field info for ${fullReference}`);
                        return this.formatter.formatVariable(fullReference, await this.variableResolver.withLike(variableInfo, document.uri, document), currentScope, document);
                    }

                    // A structure declared with a type argument may ALSO add its own inline
                    // fields: `Q QUEUE(SomeType)` holding its own extra fields alongside the
                    // type's has BOTH sets. The inline ones exist only in THIS declaration
                    // block, so the type-based lookup below can never reach them — it
                    // resolves SomeType and correctly reports that an inline field isn't in it.
                    const inlineField = await this.findFieldInTokens(structureName, fieldName, tokens, document.uri, position.line, document);
                    if (inlineField) {
                        logger.info(`✅ Found inline field "${fieldName}" in structure "${structureName}"`);
                        return inlineField;
                    }
                }

                // Try typed class variable: find what class type structureName is,
                // then look up the member in that class (e.g., st.GetValue() where st StringTheory).
                // Pass position.line so resolveVariableType can also check procedure parameters
                // (e.g. `*WindowInfo Info` — parameters are not column-0 tokens). Issue #215.
                const varTypeInfo = await this.memberLocator.resolveVariableType(structureName, tokens, document, position.line);
                if (varTypeInfo) {
                    const { typeName: varType, isClass, isReference } = varTypeInfo;
                    logger.info(`✅ Variable "${structureName}" has type "${varType}" (isClass=${isClass}, isReference=${isReference}), looking up member "${fieldName}"`);
                    if (isClass || isReference) {
                        const classHover = await this.memberHoverInClass(varType, isReference, fieldName,
                            hasParentheses && isClass, callParamCount, tokens, document, position, isClass);
                        if (classHover) return classHover;
                    }
                    // QUEUE/GROUP/FILE structure field (type defined in INCLUDE files)
                    const fieldHover = await this.resolveStructureTypeFieldHover(varType, fieldName, document);
                    if (fieldHover) return fieldHover;
                }
            }
        }
        
        return null;
    }
    /**
     * #652 — the card for field `fieldName` of structure `owner`: the one its dot form `Owner.Field`
     * has always had (#488's variable card, else the type-field card). A single-level access gets it
     * wherever the structure is declared, as before. A chain gets it only for a structure this
     * document declares (`FDB5.Q.Field`, which showed nothing until #652): a chain through a class
     * member to a QUEUE TYPE in an include keeps the member card ("Queue Field · Type", as
     * StructuredTypeMemberLabel pins), and gets null here.
     */
    private async fieldCard(
        owner: string, fieldName: string, document: TextDocument, position: Position, onlyIfDeclaredHere: boolean,
        declaration?: FieldDeclaration // #668: where the field is declared, when the resolver said
    ): Promise<Hover | null> {
        const tokens = this.tokenCache.getTokens(document);
        if (onlyIfDeclaredHere) {
            const ownerLower = owner.toLowerCase();
            if (!tokens.some(t => t.type === TokenType.Structure && t.label?.toLowerCase() === ownerLower)) return null;
        }
        const scope = TokenHelper.getInnermostScopeAtLine(this.tokenCache.getStructure(document), position.line);
        if (scope) {
            const reference = `${owner}.${fieldName}`;
            const info = this.variableResolver.findLocalVariableInfo(fieldName, tokens, scope, document, reference)
                // #657: the dotted name is not in the outline for every structure (a QUEUE's fields,
                // its own or its type's), so read the field from its declaration line in this
                // document, as a hover on that line does - the one card #488 asks for.
                ?? this.fieldInfoAtDeclaration(owner, fieldName, tokens, scope, document);
            if (info) return this.formatter.formatVariable(reference, await this.variableResolver.withLike(info, document.uri, document), scope, document);
        }
        // #668: a structure whose type is declared in another file (`Rows QUEUE(RowType)` with
        // RowType in the program file) - the card that file's declaration line gives.
        if (declaration && declaration.doc.uri !== document.uri) {
            const card = await this.cardAtDeclaration(`${owner}.${fieldName}`, fieldName, declaration);
            if (card) return card;
        }
        return this.resolveStructureTypeFieldHover(owner, fieldName, document);
    }

    /**
     * #668 — the member's declaration, when it is a field: a column-0 label on the member's line
     * whose parent is a GROUP / QUEUE / FILE / RECORD. Read from the token cache only (the
     * resolver has just tokenized that file); a file not in the cache is not loaded here (#662).
     */
    private fieldDeclaration(member: { file?: string; line?: number }, fieldName: string, document: TextDocument): FieldDeclaration | null {
        if (!member.file || member.line === undefined) return null;
        let doc: TextDocument | null = null;
        let tokens: Token[] | null = null;
        if (member.file.toLowerCase() === document.uri.toLowerCase()) {
            doc = document;
            tokens = this.tokenCache.getTokens(document);
        } else {
            tokens = this.tokenCache.getTokensByUriCaseInsensitive(member.file);
            const text = this.tokenCache.getDocumentTextByUriCaseInsensitive(member.file);
            if (tokens && text !== null) doc = TextDocument.create(member.file, 'clarion', 1, text);
        }
        if (!doc || !tokens) return null;
        const fieldLower = fieldName.toLowerCase();
        const token = tokens.find(t =>
            t.line === member.line && t.start === 0 &&
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.value.toLowerCase() === fieldLower);
        const owner = token?.parent;
        if (!token || !owner || owner.type !== TokenType.Structure || !owner.label ||
            !/^(GROUP|QUEUE|FILE|RECORD)$/i.test(owner.value)) return null;
        return { doc, tokens, token, owner };
    }

    /** #668 — the card a hover on the field's declaration line gives, titled `Owner.Field`. */
    private async cardAtDeclaration(reference: string, fieldName: string, d: FieldDeclaration): Promise<Hover | null> {
        const scope = TokenHelper.getInnermostScopeAtLine(this.tokenCache.getStructure(d.doc), d.token.line);
        if (scope) {
            const info = this.variableResolver.findLocalVariableInfo(fieldName, d.tokens, scope, d.doc, undefined, d.token.line);
            if (info) return this.formatter.formatVariable(reference, await this.variableResolver.withLike(info, d.doc.uri, d.doc), scope, d.doc);
        }
        return this.variableResolver.findStructureFieldDeclarationHover(fieldName, d.tokens, d.doc, d.token.line, reference);
    }

    /** #657 — field `fieldName` read at its declaration in structure `owner`, when this document declares it. */
    private fieldInfoAtDeclaration(
        owner: string, fieldName: string, tokens: Token[], scope: Token, document: TextDocument
    ): { type: string; line: number } | null {
        const ownerLower = owner.toLowerCase();
        const fieldLower = fieldName.toLowerCase();
        const declaration = tokens.find(t =>
            t.start === 0 &&
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.value.toLowerCase() === fieldLower &&
            t.parent?.label?.toLowerCase() === ownerLower);
        if (!declaration) return null;
        return this.variableResolver.findLocalVariableInfo(fieldName, tokens, scope, document, undefined, declaration.line);
    }

    /**
     * The member `fieldName` of class (or interface) `className`: an interface method first when
     * the receiver is a reference, then the overload the call's argument types pick (#125), then
     * findMemberInClass - which respects the argument count up the parent chain (#611).
     */
    private async memberHoverInClass(
        className: string,
        isReference: boolean,
        fieldName: string,
        classifyArgs: boolean,
        paramCount: number | undefined,
        tokens: Token[],
        document: TextDocument,
        position: Position,
        searchClass = true
    ): Promise<Hover | null> {
        if (isReference) {
            const ifaceInfo = await this.memberLocator.findMemberInInterface(className, fieldName, document, paramCount);
            if (ifaceInfo) {
                logger.info(`✅ Found interface method "${fieldName}" in "${className}"`);
                return await this.methodResolver.resolveChainedMethodCall(fieldName, ifaceInfo, document, paramCount, position);
            }
        }
        if (!searchClass) return null;
        if (classifyArgs) {
            const picked = await this.tryArgClassifyResolve(tokens, document, className, fieldName, position.line);
            if (picked) {
                logger.info(`✅ Arg-classify resolved hover "${fieldName}" in "${className}" to line ${picked.line}`);
                return await this.methodResolver.resolveChainedMethodCall(fieldName, picked, document, paramCount, position);
            }
        }
        const memberInfo = await this.memberLocator.findMemberInClass(className, fieldName, document, paramCount, position.line); // #650
        if (!memberInfo) return null;
        logger.info(`✅ Found member "${fieldName}" in "${className}"`);
        return await this.methodResolver.resolveChainedMethodCall(fieldName, memberInfo, document, paramCount, position);
    }

    /**
     * #125 — when a typed-variable dot-access hover targets an overloaded method,
     * classify the call's args and pick the matching overload so the hover shows
     * the right signature (not the first-found or paramCount-picked variant).
     * Returns the picked decl as a ClassMemberInfo-shape suitable for passing to
     * `MethodHoverResolver.resolveChainedMethodCall`; returns null to signal
     * "fall through to existing paramCount-only path".
     */
    private async tryArgClassifyResolve(
        tokens: Token[],
        document: TextDocument,
        className: string,
        methodName: string,
        callLine: number
    ): Promise<{ type: string; className: string; line: number; file: string } | null> {
        // #252 — delegates to the single enriched choke point (this method was a
        // verbatim un-enriched copy of MethodOverloadResolver.resolveOverloadDeclByArgs,
        // so typed arguments never disambiguated on this hover path).
        const picked = await this.overloadResolver.resolveOverloadDeclByArgs(
            className, methodName, document, tokens, callLine);
        if (!picked) return null;
        return { type: 'PROCEDURE', className, line: picked.line, file: picked.file };
    }

    /**
     * Find a field inside a QUEUE/GROUP/FILE type definition (potentially in INCLUDE files
     * or the current document itself).
     *
     * Public since #474: `HoverProvider` needs it for a dotted field reference that sits
     * outside any PROCEDURE (`PROJECT(Orders.ID)` in a VIEW), where the scoped hover path
     * that normally reaches field resolution never runs.
     */
    public async resolveStructureTypeFieldHover(typeName: string, fieldName: string, document: TextDocument): Promise<Hover | null> {
        // First: check the current document's own tokens (handles same-file GROUP,TYPE definitions)
        const currentTokens = this.tokenCache.getTokens(document);
        const fromCurrentDoc = await this.findFieldInTokens(typeName, fieldName, currentTokens, document.uri, undefined, document);
        if (fromCurrentDoc) return fromCurrentDoc;

        const filePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');

        // SDI tier — mirrors MemberLocatorService.findMemberInClass's step 0.5. Without this,
        // a type declared anywhere other than the CURRENT file's own textual INCLUDE chain
        // (reachable only via a different module's includes) was unreachable no matter how
        // precisely the SDI names its file — the include-chain walk below only ever starts
        // from THIS document. The requesting file's own directory is passed so a type with
        // several declaring copies resolves to the one the compiler's redirection order
        // would bind (`.\` before the shared paths).
        const sdiHit = await this.memberLocator.resolveSdiDeclaration(typeName, path.dirname(filePath), filePath); // #571
        if (sdiHit) {
            const fromSdi = await this.findFieldInTokens(typeName, fieldName, sdiHit.tokens, sdiHit.doc.uri, undefined, sdiHit.doc);
            if (fromSdi) return fromSdi;
        }

        const result = await this.findFieldInTypeIncludes(typeName, fieldName, filePath, new Set());
        if (result) return result;

        // #613: the MEMBER parent and its INCLUDE chain. A generated program declares its global
        // TYPEs in the PROGRAM file, which the structure index leaves out of its data (#483), so
        // `UvFieldQ.AltIDToolTip` on a `UvFieldQ QUEUE(tqRwField)` found nothing on hover.
        const parent = await this.memberLocator.loadMemberParent(document);
        if (parent) {
            const fromParent = await this.findFieldInTokens(typeName, fieldName, parent.tokens, parent.doc.uri, undefined, parent.doc);
            if (fromParent) return fromParent;
            const fromParentIncludes = await this.findFieldInTypeIncludes(typeName, fieldName, parent.filePath, new Set([filePath.toLowerCase()]));
            if (fromParentIncludes) return fromParentIncludes;
        }

        // Fallback: check equates.clw
        const equatesPath = SolutionManager.getInstance()?.getEquatesPath();
        if (equatesPath) {
            return this.findFieldInTypeIncludes(typeName, fieldName, equatesPath, new Set());
        }
        return null;
    }

    /**
     * Searches an already-tokenized token array for a field inside a named GROUP/QUEUE/FILE type.
     * Used to resolve same-file type definitions without a disk read.
     */
    private async findFieldInTokens(typeName: string, fieldName: string, tokens: Token[], sourceUri: string, atLine?: number, sourceDoc?: TextDocument): Promise<Hover | null> {
        const matchesName = (t: Token) =>
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.start === 0 &&
            t.value.toLowerCase() === typeName.toLowerCase();

        // `atLine` (a cursor line) selects the declaration IN SCOPE rather than the first in the
        // file. A type name is unique per file, so the default is fine for one — but a VARIABLE
        // name can repeat across procedures, and taking the first match in the file can land on
        // an unrelated, empty block of the same name declared elsewhere, reporting "no such field".
        const labelToken = atLine === undefined
            ? tokens.find(matchesName)
            : tokens.reduce<Token | undefined>((best, t) =>
                matchesName(t) && t.line <= atLine && (!best || t.line > best.line) ? t : best, undefined);
        if (!labelToken) return null;

        const labelIdx = tokens.indexOf(labelToken);
        let structureEndLine = Number.MAX_VALUE;
        for (let i = labelIdx + 1; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.line !== labelToken.line) break;
            if (t.type === TokenType.Structure && t.finishesAt !== undefined) {
                structureEndLine = t.finishesAt;
                break;
            }
        }

        const fieldToken = tokens.find(t =>
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.start === 0 &&
            t.value.toLowerCase() === fieldName.toLowerCase() &&
            t.line > labelToken.line &&
            t.line < structureEndLine
        );
        if (!fieldToken) return null;

        return this.fieldTypeCard(typeName, fieldName, tokens, fieldToken, sourceUri, sourceDoc);
    }

    /**
     * The card for a field of a GROUP/QUEUE/FILE type reached as `Owner.Field`: its type (#656: a
     * `LIKE(name)` field as written and as resolved) and its declaration line from the source,
     * as the declaration card shows it, not rebuilt from tokens.
     */
    private async fieldTypeCard(typeName: string, fieldName: string, tokens: Token[], fieldToken: Token, sourceUri: string, sourceDoc?: TextDocument): Promise<Hover> {
        const lineTokens = tokens.filter(t => t.line === fieldToken.line);
        const typeToken = lineTokens.find(t => t.start > fieldToken.start);
        const fieldType = typeToken?.value ?? 'UNKNOWN';
        const like = fieldType.toUpperCase() === 'LIKE' ? await this.variableResolver.likeFor(sourceUri, fieldToken.line, sourceDoc) : null;
        const declaration = this.sourceLine(sourceUri, fieldToken.line)?.trim()
            ?? lineTokens.map(t => t.value).join('  ').trim();
        const markdown = [
            `**${typeName} Field:** \`${fieldName}\` — ${typeLabel(fieldType, like ?? undefined)}`,
            ``,
            `\`\`\`clarion`,
            declaration,
            `\`\`\``,
            this.formatter.locationLink(sourceUri, fieldToken.line)
        ].join('\n');
        return { contents: { kind: 'markdown', value: markdown } };
    }

    /** A line of a document: the editor's buffer when it is open, else the file on disk. */
    private sourceLine(uri: string, line: number): string | undefined {
        let text = this.tokenCache.getDocumentText(uri) ?? undefined;
        if (text === undefined) {
            try {
                text = fs.readFileSync(decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\'), 'utf8');
            } catch {
                return undefined;
            }
        }
        return text.split(/\r?\n/)[line];
    }

    /**
     * Resolves hover for a bare type name (e.g., hovering on "UnzipOptionsType" in LIKE(UnzipOptionsType)).
     * Finds the structure declaration in INCLUDE files and shows the type definition.
     */
    async resolveTypeNameHover(typeName: string, document: TextDocument): Promise<Hover | null> {
        // #361 — GATE the include walk on the SDI. findTypeDeclarationInIncludes
        // does a recursive fs.readFileSync + tokenize of EVERY reachable INCLUDE;
        // on CommonLib.clw a hover over a word that isn't a type (NetDebugTrace,
        // dll_mode, a word inside a string) walked the whole ABC/NetTalk/libsrc
        // universe synchronously — a 38s frozen editor. The SDI already indexes
        // every declared type across the redirection search paths, which is a
        // SUPERSET of this document's reachable includes: if it has no entry, the
        // walk cannot find one either. So skip the walk on an SDI miss. (This runs
        // only after checkClassTypeHover's SDI lookup already missed, so the walk
        // was pure wasted work for non-types.) The cheap direct equates.clw token
        // check below stays — it's a single bounded file, not a chain walk.
        const sdiKnowsType = StructureDeclarationIndexer.getInstance().find(typeName).length > 0;
        const filePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        if (sdiKnowsType) {
            const result = await this.findTypeDeclarationInIncludes(typeName, filePath, new Set());
            if (result) return result;
        }

        // Fallback: check equates.clw directly (FILE:Queue etc. are defined there, not in INCLUDEs)
        const solutionManager = SolutionManager.getInstance();
        const equatesPath = solutionManager?.getEquatesPath();
        if (equatesPath) {
            // First search the equates.clw tokens directly
            const equatesTokens = solutionManager!.getEquatesTokens();
            if (equatesTokens && equatesTokens.length > 0) {
                const labelToken = equatesTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === typeName.toLowerCase()
                );
                if (labelToken) {
                    const lineTokens = equatesTokens.filter(t => t.line === labelToken.line);
                    const structToken = lineTokens.find(t => t.type === TokenType.Structure);
                    const structKind = structToken?.value.toUpperCase() ?? 'TYPE';
                    const declaration = lineTokens.map(t => t.value).join('  ').trim();
                    let structureEndLine = Number.MAX_VALUE;
                    if (structToken?.finishesAt !== undefined) structureEndLine = structToken.finishesAt;
                    const fieldCount = equatesTokens.filter(t =>
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.start === 0 &&
                        t.line > labelToken.line &&
                        t.line < structureEndLine
                    ).length;
                    const markdown = [
                        `**${structKind} Type:** \`${typeName}\``,
                        ``,
                        `**Fields:** ${fieldCount}`,
                        ``,
                        `\`\`\`clarion`,
                        declaration,
                        `\`\`\``,
                        this.formatter.locationLink(equatesPath, labelToken.line)
                    ].join('\n');
                    return { contents: { kind: 'markdown', value: markdown } };
                }
            }
            // Also walk any INCLUDEs in equates.clw — but only when the SDI
            // knows the type (same #361 gate; otherwise this is another full
            // chain walk that finds nothing).
            if (sdiKnowsType) {
                return this.findTypeDeclarationInIncludes(typeName, equatesPath, new Set());
            }
        }
        return null;
    }

    private async findTypeDeclarationInIncludes(
        typeName: string,
        fromPath: string,
        visited: Set<string>
    ): Promise<Hover | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const includePattern = /INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/gi;
        let match: RegExpExecArray | null;

        while ((match = includePattern.exec(content)) !== null) {
            const includeFile = match[1];
            let resolvedPath: string | null = null;

            // #328: owner-project-first redirection
            resolvedPath = resolveViaProjectRedirection(includeFile, fromPath);
            if (!resolvedPath) {
                const candidate = path.join(path.dirname(fromPath), includeFile);
                if (fs.existsSync(candidate)) resolvedPath = candidate;
            }
            if (!resolvedPath) continue;

            const uri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
            let incTokens = this.tokenCache.getTokensByUri(uri);
            if (!incTokens || incTokens.length === 0) {
                try {
                    const incContent = fs.readFileSync(resolvedPath, 'utf8');
                    incTokens = new ClarionTokenizer(incContent).tokenize();
                } catch { incTokens = null; }
            }

            if (incTokens && incTokens.length > 0) {
                const labelToken = incTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === typeName.toLowerCase()
                );
                if (labelToken) {
                    // Find the structure keyword to show the declaration line
                    const labelIdx = incTokens.indexOf(labelToken);
                    const lineTokens = incTokens.filter(t => t.line === labelToken.line);
                    const structToken = lineTokens.find(t => t.type === TokenType.Structure);
                    const structKind = structToken?.value.toUpperCase() ?? 'TYPE';
                    const declaration = lineTokens.map(t => t.value).join('  ').trim();

                    // Count fields in the structure
                    let structureEndLine = Number.MAX_VALUE;
                    if (structToken?.finishesAt !== undefined) structureEndLine = structToken.finishesAt;
                    const fieldCount = incTokens.filter(t =>
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.start === 0 &&
                        t.line > labelToken.line &&
                        t.line < structureEndLine
                    ).length;

                    logger.info(`✅ Found type "${typeName}" (${structKind}) in ${resolvedPath}:${labelToken.line}`);
                    const markdown = [
                        `**${structKind} Type:** \`${typeName}\``,
                        ``,
                        `**Fields:** ${fieldCount}`,
                        ``,
                        `\`\`\`clarion`,
                        declaration,
                        `\`\`\``,
                        this.formatter.locationLink(resolvedPath, labelToken.line)
                    ].join('\n');
                    return { contents: { kind: 'markdown', value: markdown } };
                }
            }

            const nested = await this.findTypeDeclarationInIncludes(typeName, resolvedPath, visited);
            if (nested) return nested;
        }
        return null;
    }

    private async findFieldInTypeIncludes(
        typeName: string,
        fieldName: string,
        fromPath: string,
        visited: Set<string>
    ): Promise<Hover | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const includePattern = /INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/gi;
        let match: RegExpExecArray | null;

        while ((match = includePattern.exec(content)) !== null) {
            const includeFile = match[1];

            let resolvedPath: string | null = null;
            // #328: owner-project-first redirection
            resolvedPath = resolveViaProjectRedirection(includeFile, fromPath);
            if (!resolvedPath) {
                const candidate = path.join(path.dirname(fromPath), includeFile);
                if (fs.existsSync(candidate)) resolvedPath = candidate;
            }
            if (!resolvedPath) continue;

            const uri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
            let incTokens = this.tokenCache.getTokensByUri(uri);

            // On-demand tokenization if the file hasn't been opened in VS Code yet
            if (!incTokens || incTokens.length === 0) {
                try {
                    const incContent = fs.readFileSync(resolvedPath, 'utf8');
                    const tokenizer = new ClarionTokenizer(incContent);
                    incTokens = tokenizer.tokenize();
                    logger.info(`🔍 On-demand tokenized ${path.basename(resolvedPath)}: ${incTokens.length} tokens`);
                } catch {
                    incTokens = null;
                }
            }

            if (incTokens && incTokens.length > 0) {
                const labelToken = incTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === typeName.toLowerCase()
                );
                if (labelToken) {
                    // Find the structure keyword (QUEUE/GROUP/CLASS) after the label to get finishesAt
                    const labelIdx = incTokens.indexOf(labelToken);
                    let structureEndLine = Number.MAX_VALUE;
                    for (let i = labelIdx + 1; i < incTokens.length; i++) {
                        const t = incTokens[i];
                        if (t.line !== labelToken.line) break;
                        if (t.type === TokenType.Structure && t.finishesAt !== undefined) {
                            structureEndLine = t.finishesAt;
                            break;
                        }
                    }
                    logger.info(`🔍 Found type "${typeName}" at line ${labelToken.line}, structureEndLine=${structureEndLine}`);

                    // Clarion fields start at column 0; bounded by line range within the structure
                    const fieldToken = incTokens.find(t =>
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.start === 0 &&
                        t.value.toLowerCase() === fieldName.toLowerCase() &&
                        t.line > labelToken.line &&
                        t.line < structureEndLine
                    );
                    if (fieldToken) {
                        logger.info(`✅ Found field "${fieldName}" in type "${typeName}" at ${resolvedPath}:${fieldToken.line}`);
                        return this.fieldTypeCard(typeName, fieldName, incTokens, fieldToken, uri);
                    }
                }
            }

            const nested = await this.findFieldInTypeIncludes(typeName, fieldName, resolvedPath, visited);
            if (nested) return nested;
        }
        return null;
    }
}
