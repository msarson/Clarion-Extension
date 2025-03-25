// Generated from server/antlr/ClarionFile.g4 by ANTLR 4.13.1

import { ErrorNode, ParseTreeListener, ParserRuleContext, TerminalNode } from "antlr4ng";


import { FileDeclarationContext } from "./ClarionFile.js";
import { FileAttributesContext } from "./ClarionFile.js";
import { FileStructureContext } from "./ClarionFile.js";
import { RecordBlockContext } from "./ClarionFile.js";
import { RecordAttributeContext } from "./ClarionFile.js";
import { FieldListContext } from "./ClarionFile.js";
import { FieldDefinitionContext } from "./ClarionFile.js";
import { FieldTypeContext } from "./ClarionFile.js";
import { FieldOptionsContext } from "./ClarionFile.js";
import { KeyDefinitionContext } from "./ClarionFile.js";
import { KeyFieldsContext } from "./ClarionFile.js";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `ClarionFile`.
 */
export class ClarionFileListener implements ParseTreeListener {
    /**
     * Enter a parse tree produced by `ClarionFile.fileDeclaration`.
     * @param ctx the parse tree
     */
    enterFileDeclaration?: (ctx: FileDeclarationContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.fileDeclaration`.
     * @param ctx the parse tree
     */
    exitFileDeclaration?: (ctx: FileDeclarationContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.fileAttributes`.
     * @param ctx the parse tree
     */
    enterFileAttributes?: (ctx: FileAttributesContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.fileAttributes`.
     * @param ctx the parse tree
     */
    exitFileAttributes?: (ctx: FileAttributesContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.fileStructure`.
     * @param ctx the parse tree
     */
    enterFileStructure?: (ctx: FileStructureContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.fileStructure`.
     * @param ctx the parse tree
     */
    exitFileStructure?: (ctx: FileStructureContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.recordBlock`.
     * @param ctx the parse tree
     */
    enterRecordBlock?: (ctx: RecordBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.recordBlock`.
     * @param ctx the parse tree
     */
    exitRecordBlock?: (ctx: RecordBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.recordAttribute`.
     * @param ctx the parse tree
     */
    enterRecordAttribute?: (ctx: RecordAttributeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.recordAttribute`.
     * @param ctx the parse tree
     */
    exitRecordAttribute?: (ctx: RecordAttributeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.fieldList`.
     * @param ctx the parse tree
     */
    enterFieldList?: (ctx: FieldListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.fieldList`.
     * @param ctx the parse tree
     */
    exitFieldList?: (ctx: FieldListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.fieldDefinition`.
     * @param ctx the parse tree
     */
    enterFieldDefinition?: (ctx: FieldDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.fieldDefinition`.
     * @param ctx the parse tree
     */
    exitFieldDefinition?: (ctx: FieldDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.fieldType`.
     * @param ctx the parse tree
     */
    enterFieldType?: (ctx: FieldTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.fieldType`.
     * @param ctx the parse tree
     */
    exitFieldType?: (ctx: FieldTypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.fieldOptions`.
     * @param ctx the parse tree
     */
    enterFieldOptions?: (ctx: FieldOptionsContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.fieldOptions`.
     * @param ctx the parse tree
     */
    exitFieldOptions?: (ctx: FieldOptionsContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.keyDefinition`.
     * @param ctx the parse tree
     */
    enterKeyDefinition?: (ctx: KeyDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.keyDefinition`.
     * @param ctx the parse tree
     */
    exitKeyDefinition?: (ctx: KeyDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionFile.keyFields`.
     * @param ctx the parse tree
     */
    enterKeyFields?: (ctx: KeyFieldsContext) => void;
    /**
     * Exit a parse tree produced by `ClarionFile.keyFields`.
     * @param ctx the parse tree
     */
    exitKeyFields?: (ctx: KeyFieldsContext) => void;

    visitTerminal(node: TerminalNode): void {}
    visitErrorNode(node: ErrorNode): void {}
    enterEveryRule(node: ParserRuleContext): void {}
    exitEveryRule(node: ParserRuleContext): void {}
}

