// Generated from server/antlr/ClarionUI.g4 by ANTLR 4.13.1

import { ErrorNode, ParseTreeListener, ParserRuleContext, TerminalNode } from "antlr4ng";


import { IgnoredAttributeContext } from "./ClarionUI.js";
import { IgnoredAttributeContentContext } from "./ClarionUI.js";
import { AttributeNameContext } from "./ClarionUI.js";
import { WindowDefinitionContext } from "./ClarionUI.js";
import { WindowTypeContext } from "./ClarionUI.js";
import { WindowBodyContext } from "./ClarionUI.js";
import { WindowElementContext } from "./ClarionUI.js";
import { EndMarkerContext } from "./ClarionUI.js";
import { MenubarBlockContext } from "./ClarionUI.js";
import { MenuBlockContext } from "./ClarionUI.js";
import { ItemDefinitionContext } from "./ClarionUI.js";
import { ToolbarBlockContext } from "./ClarionUI.js";
import { ButtonDefinitionContext } from "./ClarionUI.js";
import { SheetBlockContext } from "./ClarionUI.js";
import { TabBlockContext } from "./ClarionUI.js";
import { GroupBlockContext } from "./ClarionUI.js";
import { OptionBlockContext } from "./ClarionUI.js";
import { ControlBlockContext } from "./ClarionUI.js";
import { UnknownContentContext } from "./ClarionUI.js";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `ClarionUI`.
 */
export class ClarionUIListener implements ParseTreeListener {
    /**
     * Enter a parse tree produced by `ClarionUI.ignoredAttribute`.
     * @param ctx the parse tree
     */
    enterIgnoredAttribute?: (ctx: IgnoredAttributeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.ignoredAttribute`.
     * @param ctx the parse tree
     */
    exitIgnoredAttribute?: (ctx: IgnoredAttributeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.ignoredAttributeContent`.
     * @param ctx the parse tree
     */
    enterIgnoredAttributeContent?: (ctx: IgnoredAttributeContentContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.ignoredAttributeContent`.
     * @param ctx the parse tree
     */
    exitIgnoredAttributeContent?: (ctx: IgnoredAttributeContentContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.attributeName`.
     * @param ctx the parse tree
     */
    enterAttributeName?: (ctx: AttributeNameContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.attributeName`.
     * @param ctx the parse tree
     */
    exitAttributeName?: (ctx: AttributeNameContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.windowDefinition`.
     * @param ctx the parse tree
     */
    enterWindowDefinition?: (ctx: WindowDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.windowDefinition`.
     * @param ctx the parse tree
     */
    exitWindowDefinition?: (ctx: WindowDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.windowType`.
     * @param ctx the parse tree
     */
    enterWindowType?: (ctx: WindowTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.windowType`.
     * @param ctx the parse tree
     */
    exitWindowType?: (ctx: WindowTypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.windowBody`.
     * @param ctx the parse tree
     */
    enterWindowBody?: (ctx: WindowBodyContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.windowBody`.
     * @param ctx the parse tree
     */
    exitWindowBody?: (ctx: WindowBodyContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.windowElement`.
     * @param ctx the parse tree
     */
    enterWindowElement?: (ctx: WindowElementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.windowElement`.
     * @param ctx the parse tree
     */
    exitWindowElement?: (ctx: WindowElementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.endMarker`.
     * @param ctx the parse tree
     */
    enterEndMarker?: (ctx: EndMarkerContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.endMarker`.
     * @param ctx the parse tree
     */
    exitEndMarker?: (ctx: EndMarkerContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.menubarBlock`.
     * @param ctx the parse tree
     */
    enterMenubarBlock?: (ctx: MenubarBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.menubarBlock`.
     * @param ctx the parse tree
     */
    exitMenubarBlock?: (ctx: MenubarBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.menuBlock`.
     * @param ctx the parse tree
     */
    enterMenuBlock?: (ctx: MenuBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.menuBlock`.
     * @param ctx the parse tree
     */
    exitMenuBlock?: (ctx: MenuBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.itemDefinition`.
     * @param ctx the parse tree
     */
    enterItemDefinition?: (ctx: ItemDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.itemDefinition`.
     * @param ctx the parse tree
     */
    exitItemDefinition?: (ctx: ItemDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.toolbarBlock`.
     * @param ctx the parse tree
     */
    enterToolbarBlock?: (ctx: ToolbarBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.toolbarBlock`.
     * @param ctx the parse tree
     */
    exitToolbarBlock?: (ctx: ToolbarBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.buttonDefinition`.
     * @param ctx the parse tree
     */
    enterButtonDefinition?: (ctx: ButtonDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.buttonDefinition`.
     * @param ctx the parse tree
     */
    exitButtonDefinition?: (ctx: ButtonDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.sheetBlock`.
     * @param ctx the parse tree
     */
    enterSheetBlock?: (ctx: SheetBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.sheetBlock`.
     * @param ctx the parse tree
     */
    exitSheetBlock?: (ctx: SheetBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.tabBlock`.
     * @param ctx the parse tree
     */
    enterTabBlock?: (ctx: TabBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.tabBlock`.
     * @param ctx the parse tree
     */
    exitTabBlock?: (ctx: TabBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.groupBlock`.
     * @param ctx the parse tree
     */
    enterGroupBlock?: (ctx: GroupBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.groupBlock`.
     * @param ctx the parse tree
     */
    exitGroupBlock?: (ctx: GroupBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.optionBlock`.
     * @param ctx the parse tree
     */
    enterOptionBlock?: (ctx: OptionBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.optionBlock`.
     * @param ctx the parse tree
     */
    exitOptionBlock?: (ctx: OptionBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.controlBlock`.
     * @param ctx the parse tree
     */
    enterControlBlock?: (ctx: ControlBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.controlBlock`.
     * @param ctx the parse tree
     */
    exitControlBlock?: (ctx: ControlBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionUI.unknownContent`.
     * @param ctx the parse tree
     */
    enterUnknownContent?: (ctx: UnknownContentContext) => void;
    /**
     * Exit a parse tree produced by `ClarionUI.unknownContent`.
     * @param ctx the parse tree
     */
    exitUnknownContent?: (ctx: UnknownContentContext) => void;

    visitTerminal(node: TerminalNode): void {}
    visitErrorNode(node: ErrorNode): void {}
    enterEveryRule(node: ParserRuleContext): void {}
    exitEveryRule(node: ParserRuleContext): void {}
}

