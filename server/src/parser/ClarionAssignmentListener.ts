// Generated from server/antlr/ClarionAssignment.g4 by ANTLR 4.13.1

import { ErrorNode, ParseTreeListener, ParserRuleContext, TerminalNode } from "antlr4ng";


import { AssignmentStatementContext } from "./ClarionAssignment.js";
import { AssignableContext } from "./ClarionAssignment.js";
import { AssignmentOperatorContext } from "./ClarionAssignment.js";
import { StatementTerminatorContext } from "./ClarionAssignment.js";
import { AdditiveExpressionContext } from "./ClarionAssignment.js";
import { TermExpressionContext } from "./ClarionAssignment.js";
import { FactorExpressionContext } from "./ClarionAssignment.js";
import { MultiplicativeExpressionContext } from "./ClarionAssignment.js";
import { FunctionCallFactorContext } from "./ClarionAssignment.js";
import { DottedIdentifierFactorContext } from "./ClarionAssignment.js";
import { PropertyAccessFactorContext } from "./ClarionAssignment.js";
import { FieldEquateFactorContext } from "./ClarionAssignment.js";
import { IntegerFactorContext } from "./ClarionAssignment.js";
import { StringFactorContext } from "./ClarionAssignment.js";
import { ParenthesizedFactorContext } from "./ClarionAssignment.js";
import { PropertyAccessContext } from "./ClarionAssignment.js";
import { FunctionCallContext } from "./ClarionAssignment.js";
import { DottedIdentifierContext } from "./ClarionAssignment.js";
import { ArgumentListContext } from "./ClarionAssignment.js";
import { ExpressionLikeContext } from "./ClarionAssignment.js";
import { ParameterListContext } from "./ClarionAssignment.js";
import { ParameterContext } from "./ClarionAssignment.js";
import { ReturnTypeContext } from "./ClarionAssignment.js";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `ClarionAssignment`.
 */
export class ClarionAssignmentListener implements ParseTreeListener {
    /**
     * Enter a parse tree produced by `ClarionAssignment.assignmentStatement`.
     * @param ctx the parse tree
     */
    enterAssignmentStatement?: (ctx: AssignmentStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.assignmentStatement`.
     * @param ctx the parse tree
     */
    exitAssignmentStatement?: (ctx: AssignmentStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.assignable`.
     * @param ctx the parse tree
     */
    enterAssignable?: (ctx: AssignableContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.assignable`.
     * @param ctx the parse tree
     */
    exitAssignable?: (ctx: AssignableContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.assignmentOperator`.
     * @param ctx the parse tree
     */
    enterAssignmentOperator?: (ctx: AssignmentOperatorContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.assignmentOperator`.
     * @param ctx the parse tree
     */
    exitAssignmentOperator?: (ctx: AssignmentOperatorContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.statementTerminator`.
     * @param ctx the parse tree
     */
    enterStatementTerminator?: (ctx: StatementTerminatorContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.statementTerminator`.
     * @param ctx the parse tree
     */
    exitStatementTerminator?: (ctx: StatementTerminatorContext) => void;
    /**
     * Enter a parse tree produced by the `AdditiveExpression`
     * labeled alternative in `ClarionAssignment.expression`.
     * @param ctx the parse tree
     */
    enterAdditiveExpression?: (ctx: AdditiveExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `AdditiveExpression`
     * labeled alternative in `ClarionAssignment.expression`.
     * @param ctx the parse tree
     */
    exitAdditiveExpression?: (ctx: AdditiveExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `TermExpression`
     * labeled alternative in `ClarionAssignment.expression`.
     * @param ctx the parse tree
     */
    enterTermExpression?: (ctx: TermExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `TermExpression`
     * labeled alternative in `ClarionAssignment.expression`.
     * @param ctx the parse tree
     */
    exitTermExpression?: (ctx: TermExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `FactorExpression`
     * labeled alternative in `ClarionAssignment.term`.
     * @param ctx the parse tree
     */
    enterFactorExpression?: (ctx: FactorExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `FactorExpression`
     * labeled alternative in `ClarionAssignment.term`.
     * @param ctx the parse tree
     */
    exitFactorExpression?: (ctx: FactorExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `MultiplicativeExpression`
     * labeled alternative in `ClarionAssignment.term`.
     * @param ctx the parse tree
     */
    enterMultiplicativeExpression?: (ctx: MultiplicativeExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `MultiplicativeExpression`
     * labeled alternative in `ClarionAssignment.term`.
     * @param ctx the parse tree
     */
    exitMultiplicativeExpression?: (ctx: MultiplicativeExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `FunctionCallFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    enterFunctionCallFactor?: (ctx: FunctionCallFactorContext) => void;
    /**
     * Exit a parse tree produced by the `FunctionCallFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    exitFunctionCallFactor?: (ctx: FunctionCallFactorContext) => void;
    /**
     * Enter a parse tree produced by the `DottedIdentifierFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    enterDottedIdentifierFactor?: (ctx: DottedIdentifierFactorContext) => void;
    /**
     * Exit a parse tree produced by the `DottedIdentifierFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    exitDottedIdentifierFactor?: (ctx: DottedIdentifierFactorContext) => void;
    /**
     * Enter a parse tree produced by the `PropertyAccessFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    enterPropertyAccessFactor?: (ctx: PropertyAccessFactorContext) => void;
    /**
     * Exit a parse tree produced by the `PropertyAccessFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    exitPropertyAccessFactor?: (ctx: PropertyAccessFactorContext) => void;
    /**
     * Enter a parse tree produced by the `FieldEquateFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    enterFieldEquateFactor?: (ctx: FieldEquateFactorContext) => void;
    /**
     * Exit a parse tree produced by the `FieldEquateFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    exitFieldEquateFactor?: (ctx: FieldEquateFactorContext) => void;
    /**
     * Enter a parse tree produced by the `IntegerFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    enterIntegerFactor?: (ctx: IntegerFactorContext) => void;
    /**
     * Exit a parse tree produced by the `IntegerFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    exitIntegerFactor?: (ctx: IntegerFactorContext) => void;
    /**
     * Enter a parse tree produced by the `StringFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    enterStringFactor?: (ctx: StringFactorContext) => void;
    /**
     * Exit a parse tree produced by the `StringFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    exitStringFactor?: (ctx: StringFactorContext) => void;
    /**
     * Enter a parse tree produced by the `ParenthesizedFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    enterParenthesizedFactor?: (ctx: ParenthesizedFactorContext) => void;
    /**
     * Exit a parse tree produced by the `ParenthesizedFactor`
     * labeled alternative in `ClarionAssignment.factor`.
     * @param ctx the parse tree
     */
    exitParenthesizedFactor?: (ctx: ParenthesizedFactorContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.propertyAccess`.
     * @param ctx the parse tree
     */
    enterPropertyAccess?: (ctx: PropertyAccessContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.propertyAccess`.
     * @param ctx the parse tree
     */
    exitPropertyAccess?: (ctx: PropertyAccessContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.functionCall`.
     * @param ctx the parse tree
     */
    enterFunctionCall?: (ctx: FunctionCallContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.functionCall`.
     * @param ctx the parse tree
     */
    exitFunctionCall?: (ctx: FunctionCallContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.dottedIdentifier`.
     * @param ctx the parse tree
     */
    enterDottedIdentifier?: (ctx: DottedIdentifierContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.dottedIdentifier`.
     * @param ctx the parse tree
     */
    exitDottedIdentifier?: (ctx: DottedIdentifierContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.argumentList`.
     * @param ctx the parse tree
     */
    enterArgumentList?: (ctx: ArgumentListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.argumentList`.
     * @param ctx the parse tree
     */
    exitArgumentList?: (ctx: ArgumentListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.expressionLike`.
     * @param ctx the parse tree
     */
    enterExpressionLike?: (ctx: ExpressionLikeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.expressionLike`.
     * @param ctx the parse tree
     */
    exitExpressionLike?: (ctx: ExpressionLikeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.parameterList`.
     * @param ctx the parse tree
     */
    enterParameterList?: (ctx: ParameterListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.parameterList`.
     * @param ctx the parse tree
     */
    exitParameterList?: (ctx: ParameterListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.parameter`.
     * @param ctx the parse tree
     */
    enterParameter?: (ctx: ParameterContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.parameter`.
     * @param ctx the parse tree
     */
    exitParameter?: (ctx: ParameterContext) => void;
    /**
     * Enter a parse tree produced by `ClarionAssignment.returnType`.
     * @param ctx the parse tree
     */
    enterReturnType?: (ctx: ReturnTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionAssignment.returnType`.
     * @param ctx the parse tree
     */
    exitReturnType?: (ctx: ReturnTypeContext) => void;

    visitTerminal(node: TerminalNode): void {}
    visitErrorNode(node: ErrorNode): void {}
    enterEveryRule(node: ParserRuleContext): void {}
    exitEveryRule(node: ParserRuleContext): void {}
}

