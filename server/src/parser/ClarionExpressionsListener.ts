// Generated from server/antlr/ClarionExpressions.g4 by ANTLR 4.13.1

import { ErrorNode, ParseTreeListener, ParserRuleContext, TerminalNode } from "antlr4ng";


import { AdditiveExpressionContext } from "./ClarionExpressions.js";
import { TermExpressionContext } from "./ClarionExpressions.js";
import { FactorExpressionContext } from "./ClarionExpressions.js";
import { MultiplicativeExpressionContext } from "./ClarionExpressions.js";
import { FunctionCallFactorContext } from "./ClarionExpressions.js";
import { DottedIdentifierFactorContext } from "./ClarionExpressions.js";
import { PropertyAccessFactorContext } from "./ClarionExpressions.js";
import { FieldEquateFactorContext } from "./ClarionExpressions.js";
import { IntegerFactorContext } from "./ClarionExpressions.js";
import { StringFactorContext } from "./ClarionExpressions.js";
import { ParenthesizedFactorContext } from "./ClarionExpressions.js";
import { PropertyAccessContext } from "./ClarionExpressions.js";
import { FunctionCallContext } from "./ClarionExpressions.js";
import { DottedIdentifierContext } from "./ClarionExpressions.js";
import { ArgumentListContext } from "./ClarionExpressions.js";
import { ExpressionLikeContext } from "./ClarionExpressions.js";
import { ParameterListContext } from "./ClarionExpressions.js";
import { ParameterContext } from "./ClarionExpressions.js";
import { ReturnTypeContext } from "./ClarionExpressions.js";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `ClarionExpressions`.
 */
export class ClarionExpressionsListener implements ParseTreeListener {
    /**
     * Enter a parse tree produced by the `AdditiveExpression`
     * labeled alternative in `ClarionExpressions.expression`.
     * @param ctx the parse tree
     */
    enterAdditiveExpression?: (ctx: AdditiveExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `AdditiveExpression`
     * labeled alternative in `ClarionExpressions.expression`.
     * @param ctx the parse tree
     */
    exitAdditiveExpression?: (ctx: AdditiveExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `TermExpression`
     * labeled alternative in `ClarionExpressions.expression`.
     * @param ctx the parse tree
     */
    enterTermExpression?: (ctx: TermExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `TermExpression`
     * labeled alternative in `ClarionExpressions.expression`.
     * @param ctx the parse tree
     */
    exitTermExpression?: (ctx: TermExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `FactorExpression`
     * labeled alternative in `ClarionExpressions.term`.
     * @param ctx the parse tree
     */
    enterFactorExpression?: (ctx: FactorExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `FactorExpression`
     * labeled alternative in `ClarionExpressions.term`.
     * @param ctx the parse tree
     */
    exitFactorExpression?: (ctx: FactorExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `MultiplicativeExpression`
     * labeled alternative in `ClarionExpressions.term`.
     * @param ctx the parse tree
     */
    enterMultiplicativeExpression?: (ctx: MultiplicativeExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `MultiplicativeExpression`
     * labeled alternative in `ClarionExpressions.term`.
     * @param ctx the parse tree
     */
    exitMultiplicativeExpression?: (ctx: MultiplicativeExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `FunctionCallFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    enterFunctionCallFactor?: (ctx: FunctionCallFactorContext) => void;
    /**
     * Exit a parse tree produced by the `FunctionCallFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    exitFunctionCallFactor?: (ctx: FunctionCallFactorContext) => void;
    /**
     * Enter a parse tree produced by the `DottedIdentifierFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    enterDottedIdentifierFactor?: (ctx: DottedIdentifierFactorContext) => void;
    /**
     * Exit a parse tree produced by the `DottedIdentifierFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    exitDottedIdentifierFactor?: (ctx: DottedIdentifierFactorContext) => void;
    /**
     * Enter a parse tree produced by the `PropertyAccessFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    enterPropertyAccessFactor?: (ctx: PropertyAccessFactorContext) => void;
    /**
     * Exit a parse tree produced by the `PropertyAccessFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    exitPropertyAccessFactor?: (ctx: PropertyAccessFactorContext) => void;
    /**
     * Enter a parse tree produced by the `FieldEquateFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    enterFieldEquateFactor?: (ctx: FieldEquateFactorContext) => void;
    /**
     * Exit a parse tree produced by the `FieldEquateFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    exitFieldEquateFactor?: (ctx: FieldEquateFactorContext) => void;
    /**
     * Enter a parse tree produced by the `IntegerFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    enterIntegerFactor?: (ctx: IntegerFactorContext) => void;
    /**
     * Exit a parse tree produced by the `IntegerFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    exitIntegerFactor?: (ctx: IntegerFactorContext) => void;
    /**
     * Enter a parse tree produced by the `StringFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    enterStringFactor?: (ctx: StringFactorContext) => void;
    /**
     * Exit a parse tree produced by the `StringFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    exitStringFactor?: (ctx: StringFactorContext) => void;
    /**
     * Enter a parse tree produced by the `ParenthesizedFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    enterParenthesizedFactor?: (ctx: ParenthesizedFactorContext) => void;
    /**
     * Exit a parse tree produced by the `ParenthesizedFactor`
     * labeled alternative in `ClarionExpressions.factor`.
     * @param ctx the parse tree
     */
    exitParenthesizedFactor?: (ctx: ParenthesizedFactorContext) => void;
    /**
     * Enter a parse tree produced by `ClarionExpressions.propertyAccess`.
     * @param ctx the parse tree
     */
    enterPropertyAccess?: (ctx: PropertyAccessContext) => void;
    /**
     * Exit a parse tree produced by `ClarionExpressions.propertyAccess`.
     * @param ctx the parse tree
     */
    exitPropertyAccess?: (ctx: PropertyAccessContext) => void;
    /**
     * Enter a parse tree produced by `ClarionExpressions.functionCall`.
     * @param ctx the parse tree
     */
    enterFunctionCall?: (ctx: FunctionCallContext) => void;
    /**
     * Exit a parse tree produced by `ClarionExpressions.functionCall`.
     * @param ctx the parse tree
     */
    exitFunctionCall?: (ctx: FunctionCallContext) => void;
    /**
     * Enter a parse tree produced by `ClarionExpressions.dottedIdentifier`.
     * @param ctx the parse tree
     */
    enterDottedIdentifier?: (ctx: DottedIdentifierContext) => void;
    /**
     * Exit a parse tree produced by `ClarionExpressions.dottedIdentifier`.
     * @param ctx the parse tree
     */
    exitDottedIdentifier?: (ctx: DottedIdentifierContext) => void;
    /**
     * Enter a parse tree produced by `ClarionExpressions.argumentList`.
     * @param ctx the parse tree
     */
    enterArgumentList?: (ctx: ArgumentListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionExpressions.argumentList`.
     * @param ctx the parse tree
     */
    exitArgumentList?: (ctx: ArgumentListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionExpressions.expressionLike`.
     * @param ctx the parse tree
     */
    enterExpressionLike?: (ctx: ExpressionLikeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionExpressions.expressionLike`.
     * @param ctx the parse tree
     */
    exitExpressionLike?: (ctx: ExpressionLikeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionExpressions.parameterList`.
     * @param ctx the parse tree
     */
    enterParameterList?: (ctx: ParameterListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionExpressions.parameterList`.
     * @param ctx the parse tree
     */
    exitParameterList?: (ctx: ParameterListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionExpressions.parameter`.
     * @param ctx the parse tree
     */
    enterParameter?: (ctx: ParameterContext) => void;
    /**
     * Exit a parse tree produced by `ClarionExpressions.parameter`.
     * @param ctx the parse tree
     */
    exitParameter?: (ctx: ParameterContext) => void;
    /**
     * Enter a parse tree produced by `ClarionExpressions.returnType`.
     * @param ctx the parse tree
     */
    enterReturnType?: (ctx: ReturnTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionExpressions.returnType`.
     * @param ctx the parse tree
     */
    exitReturnType?: (ctx: ReturnTypeContext) => void;

    visitTerminal(node: TerminalNode): void {}
    visitErrorNode(node: ErrorNode): void {}
    enterEveryRule(node: ParserRuleContext): void {}
    exitEveryRule(node: ParserRuleContext): void {}
}

