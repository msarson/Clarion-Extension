// Generated from server/antlr/ClarionData.g4 by ANTLR 4.13.1

import { ErrorNode, ParseTreeListener, ParserRuleContext, TerminalNode } from "antlr4ng";


import { GlobalDataSectionContext } from "./ClarionData.js";
import { GlobalEntryContext } from "./ClarionData.js";
import { IncludeDirectiveContext } from "./ClarionData.js";
import { EquateDefinitionContext } from "./ClarionData.js";
import { GlobalVariableContext } from "./ClarionData.js";
import { FieldReferenceContext } from "./ClarionData.js";
import { GroupBlockContext } from "./ClarionData.js";
import { QueueBlockContext } from "./ClarionData.js";
import { FieldListContext } from "./ClarionData.js";
import { FieldDefinitionContext } from "./ClarionData.js";
import { FieldTypeContext } from "./ClarionData.js";
import { FieldOptionsContext } from "./ClarionData.js";
import { ArgumentListContext } from "./ClarionData.js";
import { ClassDeclarationContext } from "./ClarionData.js";
import { ReturnTypeContext } from "./ClarionData.js";
import { ProcedureAttributeContext } from "./ClarionData.js";
import { DeclarationParameterListContext } from "./ClarionData.js";
import { DeclarationParameterListNonEmptyContext } from "./ClarionData.js";
import { DeclarationParameterContext } from "./ClarionData.js";
import { IgnoredAttributeContext } from "./ClarionData.js";
import { IgnoredAttributeContentContext } from "./ClarionData.js";
import { AttributeNameContext } from "./ClarionData.js";
import { WindowDefinitionContext } from "./ClarionData.js";
import { WindowTypeContext } from "./ClarionData.js";
import { WindowBodyContext } from "./ClarionData.js";
import { WindowElementContext } from "./ClarionData.js";
import { EndMarkerContext } from "./ClarionData.js";
import { MenubarBlockContext } from "./ClarionData.js";
import { MenuBlockContext } from "./ClarionData.js";
import { ItemDefinitionContext } from "./ClarionData.js";
import { ToolbarBlockContext } from "./ClarionData.js";
import { ButtonDefinitionContext } from "./ClarionData.js";
import { SheetBlockContext } from "./ClarionData.js";
import { TabBlockContext } from "./ClarionData.js";
import { OptionBlockContext } from "./ClarionData.js";
import { ControlBlockContext } from "./ClarionData.js";
import { UnknownContentContext } from "./ClarionData.js";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `ClarionData`.
 */
export class ClarionDataListener implements ParseTreeListener {
    /**
     * Enter a parse tree produced by `ClarionData.globalDataSection`.
     * @param ctx the parse tree
     */
    enterGlobalDataSection?: (ctx: GlobalDataSectionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.globalDataSection`.
     * @param ctx the parse tree
     */
    exitGlobalDataSection?: (ctx: GlobalDataSectionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.globalEntry`.
     * @param ctx the parse tree
     */
    enterGlobalEntry?: (ctx: GlobalEntryContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.globalEntry`.
     * @param ctx the parse tree
     */
    exitGlobalEntry?: (ctx: GlobalEntryContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.includeDirective`.
     * @param ctx the parse tree
     */
    enterIncludeDirective?: (ctx: IncludeDirectiveContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.includeDirective`.
     * @param ctx the parse tree
     */
    exitIncludeDirective?: (ctx: IncludeDirectiveContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.equateDefinition`.
     * @param ctx the parse tree
     */
    enterEquateDefinition?: (ctx: EquateDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.equateDefinition`.
     * @param ctx the parse tree
     */
    exitEquateDefinition?: (ctx: EquateDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.globalVariable`.
     * @param ctx the parse tree
     */
    enterGlobalVariable?: (ctx: GlobalVariableContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.globalVariable`.
     * @param ctx the parse tree
     */
    exitGlobalVariable?: (ctx: GlobalVariableContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.fieldReference`.
     * @param ctx the parse tree
     */
    enterFieldReference?: (ctx: FieldReferenceContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.fieldReference`.
     * @param ctx the parse tree
     */
    exitFieldReference?: (ctx: FieldReferenceContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.groupBlock`.
     * @param ctx the parse tree
     */
    enterGroupBlock?: (ctx: GroupBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.groupBlock`.
     * @param ctx the parse tree
     */
    exitGroupBlock?: (ctx: GroupBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.queueBlock`.
     * @param ctx the parse tree
     */
    enterQueueBlock?: (ctx: QueueBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.queueBlock`.
     * @param ctx the parse tree
     */
    exitQueueBlock?: (ctx: QueueBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.fieldList`.
     * @param ctx the parse tree
     */
    enterFieldList?: (ctx: FieldListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.fieldList`.
     * @param ctx the parse tree
     */
    exitFieldList?: (ctx: FieldListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.fieldDefinition`.
     * @param ctx the parse tree
     */
    enterFieldDefinition?: (ctx: FieldDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.fieldDefinition`.
     * @param ctx the parse tree
     */
    exitFieldDefinition?: (ctx: FieldDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.fieldType`.
     * @param ctx the parse tree
     */
    enterFieldType?: (ctx: FieldTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.fieldType`.
     * @param ctx the parse tree
     */
    exitFieldType?: (ctx: FieldTypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.fieldOptions`.
     * @param ctx the parse tree
     */
    enterFieldOptions?: (ctx: FieldOptionsContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.fieldOptions`.
     * @param ctx the parse tree
     */
    exitFieldOptions?: (ctx: FieldOptionsContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.argumentList`.
     * @param ctx the parse tree
     */
    enterArgumentList?: (ctx: ArgumentListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.argumentList`.
     * @param ctx the parse tree
     */
    exitArgumentList?: (ctx: ArgumentListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.classDeclaration`.
     * @param ctx the parse tree
     */
    enterClassDeclaration?: (ctx: ClassDeclarationContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.classDeclaration`.
     * @param ctx the parse tree
     */
    exitClassDeclaration?: (ctx: ClassDeclarationContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.returnType`.
     * @param ctx the parse tree
     */
    enterReturnType?: (ctx: ReturnTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.returnType`.
     * @param ctx the parse tree
     */
    exitReturnType?: (ctx: ReturnTypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.procedureAttribute`.
     * @param ctx the parse tree
     */
    enterProcedureAttribute?: (ctx: ProcedureAttributeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.procedureAttribute`.
     * @param ctx the parse tree
     */
    exitProcedureAttribute?: (ctx: ProcedureAttributeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.declarationParameterList`.
     * @param ctx the parse tree
     */
    enterDeclarationParameterList?: (ctx: DeclarationParameterListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.declarationParameterList`.
     * @param ctx the parse tree
     */
    exitDeclarationParameterList?: (ctx: DeclarationParameterListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.declarationParameterListNonEmpty`.
     * @param ctx the parse tree
     */
    enterDeclarationParameterListNonEmpty?: (ctx: DeclarationParameterListNonEmptyContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.declarationParameterListNonEmpty`.
     * @param ctx the parse tree
     */
    exitDeclarationParameterListNonEmpty?: (ctx: DeclarationParameterListNonEmptyContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.declarationParameter`.
     * @param ctx the parse tree
     */
    enterDeclarationParameter?: (ctx: DeclarationParameterContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.declarationParameter`.
     * @param ctx the parse tree
     */
    exitDeclarationParameter?: (ctx: DeclarationParameterContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.ignoredAttribute`.
     * @param ctx the parse tree
     */
    enterIgnoredAttribute?: (ctx: IgnoredAttributeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.ignoredAttribute`.
     * @param ctx the parse tree
     */
    exitIgnoredAttribute?: (ctx: IgnoredAttributeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.ignoredAttributeContent`.
     * @param ctx the parse tree
     */
    enterIgnoredAttributeContent?: (ctx: IgnoredAttributeContentContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.ignoredAttributeContent`.
     * @param ctx the parse tree
     */
    exitIgnoredAttributeContent?: (ctx: IgnoredAttributeContentContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.attributeName`.
     * @param ctx the parse tree
     */
    enterAttributeName?: (ctx: AttributeNameContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.attributeName`.
     * @param ctx the parse tree
     */
    exitAttributeName?: (ctx: AttributeNameContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.windowDefinition`.
     * @param ctx the parse tree
     */
    enterWindowDefinition?: (ctx: WindowDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.windowDefinition`.
     * @param ctx the parse tree
     */
    exitWindowDefinition?: (ctx: WindowDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.windowType`.
     * @param ctx the parse tree
     */
    enterWindowType?: (ctx: WindowTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.windowType`.
     * @param ctx the parse tree
     */
    exitWindowType?: (ctx: WindowTypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.windowBody`.
     * @param ctx the parse tree
     */
    enterWindowBody?: (ctx: WindowBodyContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.windowBody`.
     * @param ctx the parse tree
     */
    exitWindowBody?: (ctx: WindowBodyContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.windowElement`.
     * @param ctx the parse tree
     */
    enterWindowElement?: (ctx: WindowElementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.windowElement`.
     * @param ctx the parse tree
     */
    exitWindowElement?: (ctx: WindowElementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.endMarker`.
     * @param ctx the parse tree
     */
    enterEndMarker?: (ctx: EndMarkerContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.endMarker`.
     * @param ctx the parse tree
     */
    exitEndMarker?: (ctx: EndMarkerContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.menubarBlock`.
     * @param ctx the parse tree
     */
    enterMenubarBlock?: (ctx: MenubarBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.menubarBlock`.
     * @param ctx the parse tree
     */
    exitMenubarBlock?: (ctx: MenubarBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.menuBlock`.
     * @param ctx the parse tree
     */
    enterMenuBlock?: (ctx: MenuBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.menuBlock`.
     * @param ctx the parse tree
     */
    exitMenuBlock?: (ctx: MenuBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.itemDefinition`.
     * @param ctx the parse tree
     */
    enterItemDefinition?: (ctx: ItemDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.itemDefinition`.
     * @param ctx the parse tree
     */
    exitItemDefinition?: (ctx: ItemDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.toolbarBlock`.
     * @param ctx the parse tree
     */
    enterToolbarBlock?: (ctx: ToolbarBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.toolbarBlock`.
     * @param ctx the parse tree
     */
    exitToolbarBlock?: (ctx: ToolbarBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.buttonDefinition`.
     * @param ctx the parse tree
     */
    enterButtonDefinition?: (ctx: ButtonDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.buttonDefinition`.
     * @param ctx the parse tree
     */
    exitButtonDefinition?: (ctx: ButtonDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.sheetBlock`.
     * @param ctx the parse tree
     */
    enterSheetBlock?: (ctx: SheetBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.sheetBlock`.
     * @param ctx the parse tree
     */
    exitSheetBlock?: (ctx: SheetBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.tabBlock`.
     * @param ctx the parse tree
     */
    enterTabBlock?: (ctx: TabBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.tabBlock`.
     * @param ctx the parse tree
     */
    exitTabBlock?: (ctx: TabBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.optionBlock`.
     * @param ctx the parse tree
     */
    enterOptionBlock?: (ctx: OptionBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.optionBlock`.
     * @param ctx the parse tree
     */
    exitOptionBlock?: (ctx: OptionBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.controlBlock`.
     * @param ctx the parse tree
     */
    enterControlBlock?: (ctx: ControlBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.controlBlock`.
     * @param ctx the parse tree
     */
    exitControlBlock?: (ctx: ControlBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionData.unknownContent`.
     * @param ctx the parse tree
     */
    enterUnknownContent?: (ctx: UnknownContentContext) => void;
    /**
     * Exit a parse tree produced by `ClarionData.unknownContent`.
     * @param ctx the parse tree
     */
    exitUnknownContent?: (ctx: UnknownContentContext) => void;

    visitTerminal(node: TerminalNode): void {}
    visitErrorNode(node: ErrorNode): void {}
    enterEveryRule(node: ParserRuleContext): void {}
    exitEveryRule(node: ParserRuleContext): void {}
}

