// Generated from server/antlr/ClarionParser.g4 by ANTLR 4.13.1

import { ErrorNode, ParseTreeListener, ParserRuleContext, TerminalNode } from "antlr4ng";


import { ClarionFileContext } from "./ClarionParser.js";
import { ProgramContext } from "./ClarionParser.js";
import { MemberModuleContext } from "./ClarionParser.js";
import { ModuleBodyContext } from "./ClarionParser.js";
import { ModuleElementContext } from "./ClarionParser.js";
import { MapSectionContext } from "./ClarionParser.js";
import { ModuleBlockContext } from "./ClarionParser.js";
import { PrototypeListContext } from "./ClarionParser.js";
import { PrototypeContext } from "./ClarionParser.js";
import { ProcedureDefinitionContext } from "./ClarionParser.js";
import { LocalDataSectionContext } from "./ClarionParser.js";
import { LocalDataEntryContext } from "./ClarionParser.js";
import { ExecutableStatementContext } from "./ClarionParser.js";
import { FunctionCallStatementContext } from "./ClarionParser.js";
import { ExpressionStatementContext } from "./ClarionParser.js";
import { DoStatementContext } from "./ClarionParser.js";
import { ReturnStatementContext } from "./ClarionParser.js";
import { ClassDefinitionContext } from "./ClarionParser.js";
import { ClassBodyContext } from "./ClarionParser.js";
import { MethodDefinitionContext } from "./ClarionParser.js";
import { VariableDeclarationContext } from "./ClarionParser.js";
import { RoutineDefinitionContext } from "./ClarionParser.js";
import { ControlStructureContext } from "./ClarionParser.js";
import { IfStatementContext } from "./ClarionParser.js";
import { ElsifClauseContext } from "./ClarionParser.js";
import { LoopStatementContext } from "./ClarionParser.js";
import { CaseStatementContext } from "./ClarionParser.js";
import { CaseBranchContext } from "./ClarionParser.js";
import { CaseBlockContext } from "./ClarionParser.js";
import { LabelContext } from "./ClarionParser.js";
import { AdditiveExpressionContext } from "./ClarionParser.js";
import { TermExpressionContext } from "./ClarionParser.js";
import { FactorExpressionContext } from "./ClarionParser.js";
import { MultiplicativeExpressionContext } from "./ClarionParser.js";
import { FunctionCallFactorContext } from "./ClarionParser.js";
import { DottedIdentifierFactorContext } from "./ClarionParser.js";
import { PropertyAccessFactorContext } from "./ClarionParser.js";
import { FieldEquateFactorContext } from "./ClarionParser.js";
import { IntegerFactorContext } from "./ClarionParser.js";
import { StringFactorContext } from "./ClarionParser.js";
import { ParenthesizedFactorContext } from "./ClarionParser.js";
import { PropertyAccessContext } from "./ClarionParser.js";
import { FunctionCallContext } from "./ClarionParser.js";
import { DottedIdentifierContext } from "./ClarionParser.js";
import { ArgumentListContext } from "./ClarionParser.js";
import { ExpressionLikeContext } from "./ClarionParser.js";
import { ParameterListContext } from "./ClarionParser.js";
import { ParameterContext } from "./ClarionParser.js";
import { ReturnTypeContext } from "./ClarionParser.js";
import { AssignmentStatementContext } from "./ClarionParser.js";
import { AssignableContext } from "./ClarionParser.js";
import { AssignmentOperatorContext } from "./ClarionParser.js";
import { StatementTerminatorContext } from "./ClarionParser.js";
import { IgnoredAttributeContext } from "./ClarionParser.js";
import { IgnoredAttributeContentContext } from "./ClarionParser.js";
import { AttributeNameContext } from "./ClarionParser.js";
import { WindowDefinitionContext } from "./ClarionParser.js";
import { WindowTypeContext } from "./ClarionParser.js";
import { WindowBodyContext } from "./ClarionParser.js";
import { WindowElementContext } from "./ClarionParser.js";
import { EndMarkerContext } from "./ClarionParser.js";
import { MenubarBlockContext } from "./ClarionParser.js";
import { MenuBlockContext } from "./ClarionParser.js";
import { ItemDefinitionContext } from "./ClarionParser.js";
import { ToolbarBlockContext } from "./ClarionParser.js";
import { ButtonDefinitionContext } from "./ClarionParser.js";
import { SheetBlockContext } from "./ClarionParser.js";
import { TabBlockContext } from "./ClarionParser.js";
import { GroupBlockContext } from "./ClarionParser.js";
import { OptionBlockContext } from "./ClarionParser.js";
import { ControlBlockContext } from "./ClarionParser.js";
import { UnknownContentContext } from "./ClarionParser.js";
import { GlobalDataSectionContext } from "./ClarionParser.js";
import { GlobalEntryContext } from "./ClarionParser.js";
import { IncludeDirectiveContext } from "./ClarionParser.js";
import { EquateDefinitionContext } from "./ClarionParser.js";
import { GlobalVariableContext } from "./ClarionParser.js";
import { FieldReferenceContext } from "./ClarionParser.js";
import { QueueBlockContext } from "./ClarionParser.js";
import { FieldListContext } from "./ClarionParser.js";
import { FieldDefinitionContext } from "./ClarionParser.js";
import { FieldTypeContext } from "./ClarionParser.js";
import { FieldOptionsContext } from "./ClarionParser.js";
import { ClassDeclarationContext } from "./ClarionParser.js";
import { ProcedureAttributeContext } from "./ClarionParser.js";
import { DeclarationParameterListContext } from "./ClarionParser.js";
import { DeclarationParameterListNonEmptyContext } from "./ClarionParser.js";
import { DeclarationParameterContext } from "./ClarionParser.js";
import { FileDeclarationContext } from "./ClarionParser.js";
import { FileAttributesContext } from "./ClarionParser.js";
import { FileStructureContext } from "./ClarionParser.js";
import { RecordBlockContext } from "./ClarionParser.js";
import { RecordAttributeContext } from "./ClarionParser.js";
import { KeyDefinitionContext } from "./ClarionParser.js";
import { KeyFieldsContext } from "./ClarionParser.js";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `ClarionParser`.
 */
export class ClarionParserListener implements ParseTreeListener {
    /**
     * Enter a parse tree produced by `ClarionParser.clarionFile`.
     * @param ctx the parse tree
     */
    enterClarionFile?: (ctx: ClarionFileContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.clarionFile`.
     * @param ctx the parse tree
     */
    exitClarionFile?: (ctx: ClarionFileContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.program`.
     * @param ctx the parse tree
     */
    enterProgram?: (ctx: ProgramContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.program`.
     * @param ctx the parse tree
     */
    exitProgram?: (ctx: ProgramContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.memberModule`.
     * @param ctx the parse tree
     */
    enterMemberModule?: (ctx: MemberModuleContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.memberModule`.
     * @param ctx the parse tree
     */
    exitMemberModule?: (ctx: MemberModuleContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.moduleBody`.
     * @param ctx the parse tree
     */
    enterModuleBody?: (ctx: ModuleBodyContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.moduleBody`.
     * @param ctx the parse tree
     */
    exitModuleBody?: (ctx: ModuleBodyContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.moduleElement`.
     * @param ctx the parse tree
     */
    enterModuleElement?: (ctx: ModuleElementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.moduleElement`.
     * @param ctx the parse tree
     */
    exitModuleElement?: (ctx: ModuleElementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.mapSection`.
     * @param ctx the parse tree
     */
    enterMapSection?: (ctx: MapSectionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.mapSection`.
     * @param ctx the parse tree
     */
    exitMapSection?: (ctx: MapSectionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.moduleBlock`.
     * @param ctx the parse tree
     */
    enterModuleBlock?: (ctx: ModuleBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.moduleBlock`.
     * @param ctx the parse tree
     */
    exitModuleBlock?: (ctx: ModuleBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.prototypeList`.
     * @param ctx the parse tree
     */
    enterPrototypeList?: (ctx: PrototypeListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.prototypeList`.
     * @param ctx the parse tree
     */
    exitPrototypeList?: (ctx: PrototypeListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.prototype`.
     * @param ctx the parse tree
     */
    enterPrototype?: (ctx: PrototypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.prototype`.
     * @param ctx the parse tree
     */
    exitPrototype?: (ctx: PrototypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.procedureDefinition`.
     * @param ctx the parse tree
     */
    enterProcedureDefinition?: (ctx: ProcedureDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.procedureDefinition`.
     * @param ctx the parse tree
     */
    exitProcedureDefinition?: (ctx: ProcedureDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.localDataSection`.
     * @param ctx the parse tree
     */
    enterLocalDataSection?: (ctx: LocalDataSectionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.localDataSection`.
     * @param ctx the parse tree
     */
    exitLocalDataSection?: (ctx: LocalDataSectionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.localDataEntry`.
     * @param ctx the parse tree
     */
    enterLocalDataEntry?: (ctx: LocalDataEntryContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.localDataEntry`.
     * @param ctx the parse tree
     */
    exitLocalDataEntry?: (ctx: LocalDataEntryContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.executableStatement`.
     * @param ctx the parse tree
     */
    enterExecutableStatement?: (ctx: ExecutableStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.executableStatement`.
     * @param ctx the parse tree
     */
    exitExecutableStatement?: (ctx: ExecutableStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.functionCallStatement`.
     * @param ctx the parse tree
     */
    enterFunctionCallStatement?: (ctx: FunctionCallStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.functionCallStatement`.
     * @param ctx the parse tree
     */
    exitFunctionCallStatement?: (ctx: FunctionCallStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.expressionStatement`.
     * @param ctx the parse tree
     */
    enterExpressionStatement?: (ctx: ExpressionStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.expressionStatement`.
     * @param ctx the parse tree
     */
    exitExpressionStatement?: (ctx: ExpressionStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.doStatement`.
     * @param ctx the parse tree
     */
    enterDoStatement?: (ctx: DoStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.doStatement`.
     * @param ctx the parse tree
     */
    exitDoStatement?: (ctx: DoStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.returnStatement`.
     * @param ctx the parse tree
     */
    enterReturnStatement?: (ctx: ReturnStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.returnStatement`.
     * @param ctx the parse tree
     */
    exitReturnStatement?: (ctx: ReturnStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.classDefinition`.
     * @param ctx the parse tree
     */
    enterClassDefinition?: (ctx: ClassDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.classDefinition`.
     * @param ctx the parse tree
     */
    exitClassDefinition?: (ctx: ClassDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.classBody`.
     * @param ctx the parse tree
     */
    enterClassBody?: (ctx: ClassBodyContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.classBody`.
     * @param ctx the parse tree
     */
    exitClassBody?: (ctx: ClassBodyContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.methodDefinition`.
     * @param ctx the parse tree
     */
    enterMethodDefinition?: (ctx: MethodDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.methodDefinition`.
     * @param ctx the parse tree
     */
    exitMethodDefinition?: (ctx: MethodDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.variableDeclaration`.
     * @param ctx the parse tree
     */
    enterVariableDeclaration?: (ctx: VariableDeclarationContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.variableDeclaration`.
     * @param ctx the parse tree
     */
    exitVariableDeclaration?: (ctx: VariableDeclarationContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.routineDefinition`.
     * @param ctx the parse tree
     */
    enterRoutineDefinition?: (ctx: RoutineDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.routineDefinition`.
     * @param ctx the parse tree
     */
    exitRoutineDefinition?: (ctx: RoutineDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.controlStructure`.
     * @param ctx the parse tree
     */
    enterControlStructure?: (ctx: ControlStructureContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.controlStructure`.
     * @param ctx the parse tree
     */
    exitControlStructure?: (ctx: ControlStructureContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.ifStatement`.
     * @param ctx the parse tree
     */
    enterIfStatement?: (ctx: IfStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.ifStatement`.
     * @param ctx the parse tree
     */
    exitIfStatement?: (ctx: IfStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.elsifClause`.
     * @param ctx the parse tree
     */
    enterElsifClause?: (ctx: ElsifClauseContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.elsifClause`.
     * @param ctx the parse tree
     */
    exitElsifClause?: (ctx: ElsifClauseContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.loopStatement`.
     * @param ctx the parse tree
     */
    enterLoopStatement?: (ctx: LoopStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.loopStatement`.
     * @param ctx the parse tree
     */
    exitLoopStatement?: (ctx: LoopStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.caseStatement`.
     * @param ctx the parse tree
     */
    enterCaseStatement?: (ctx: CaseStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.caseStatement`.
     * @param ctx the parse tree
     */
    exitCaseStatement?: (ctx: CaseStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.caseBranch`.
     * @param ctx the parse tree
     */
    enterCaseBranch?: (ctx: CaseBranchContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.caseBranch`.
     * @param ctx the parse tree
     */
    exitCaseBranch?: (ctx: CaseBranchContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.caseBlock`.
     * @param ctx the parse tree
     */
    enterCaseBlock?: (ctx: CaseBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.caseBlock`.
     * @param ctx the parse tree
     */
    exitCaseBlock?: (ctx: CaseBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.label`.
     * @param ctx the parse tree
     */
    enterLabel?: (ctx: LabelContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.label`.
     * @param ctx the parse tree
     */
    exitLabel?: (ctx: LabelContext) => void;
    /**
     * Enter a parse tree produced by the `AdditiveExpression`
     * labeled alternative in `ClarionParser.expression`.
     * @param ctx the parse tree
     */
    enterAdditiveExpression?: (ctx: AdditiveExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `AdditiveExpression`
     * labeled alternative in `ClarionParser.expression`.
     * @param ctx the parse tree
     */
    exitAdditiveExpression?: (ctx: AdditiveExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `TermExpression`
     * labeled alternative in `ClarionParser.expression`.
     * @param ctx the parse tree
     */
    enterTermExpression?: (ctx: TermExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `TermExpression`
     * labeled alternative in `ClarionParser.expression`.
     * @param ctx the parse tree
     */
    exitTermExpression?: (ctx: TermExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `FactorExpression`
     * labeled alternative in `ClarionParser.term`.
     * @param ctx the parse tree
     */
    enterFactorExpression?: (ctx: FactorExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `FactorExpression`
     * labeled alternative in `ClarionParser.term`.
     * @param ctx the parse tree
     */
    exitFactorExpression?: (ctx: FactorExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `MultiplicativeExpression`
     * labeled alternative in `ClarionParser.term`.
     * @param ctx the parse tree
     */
    enterMultiplicativeExpression?: (ctx: MultiplicativeExpressionContext) => void;
    /**
     * Exit a parse tree produced by the `MultiplicativeExpression`
     * labeled alternative in `ClarionParser.term`.
     * @param ctx the parse tree
     */
    exitMultiplicativeExpression?: (ctx: MultiplicativeExpressionContext) => void;
    /**
     * Enter a parse tree produced by the `FunctionCallFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    enterFunctionCallFactor?: (ctx: FunctionCallFactorContext) => void;
    /**
     * Exit a parse tree produced by the `FunctionCallFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    exitFunctionCallFactor?: (ctx: FunctionCallFactorContext) => void;
    /**
     * Enter a parse tree produced by the `DottedIdentifierFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    enterDottedIdentifierFactor?: (ctx: DottedIdentifierFactorContext) => void;
    /**
     * Exit a parse tree produced by the `DottedIdentifierFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    exitDottedIdentifierFactor?: (ctx: DottedIdentifierFactorContext) => void;
    /**
     * Enter a parse tree produced by the `PropertyAccessFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    enterPropertyAccessFactor?: (ctx: PropertyAccessFactorContext) => void;
    /**
     * Exit a parse tree produced by the `PropertyAccessFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    exitPropertyAccessFactor?: (ctx: PropertyAccessFactorContext) => void;
    /**
     * Enter a parse tree produced by the `FieldEquateFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    enterFieldEquateFactor?: (ctx: FieldEquateFactorContext) => void;
    /**
     * Exit a parse tree produced by the `FieldEquateFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    exitFieldEquateFactor?: (ctx: FieldEquateFactorContext) => void;
    /**
     * Enter a parse tree produced by the `IntegerFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    enterIntegerFactor?: (ctx: IntegerFactorContext) => void;
    /**
     * Exit a parse tree produced by the `IntegerFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    exitIntegerFactor?: (ctx: IntegerFactorContext) => void;
    /**
     * Enter a parse tree produced by the `StringFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    enterStringFactor?: (ctx: StringFactorContext) => void;
    /**
     * Exit a parse tree produced by the `StringFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    exitStringFactor?: (ctx: StringFactorContext) => void;
    /**
     * Enter a parse tree produced by the `ParenthesizedFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    enterParenthesizedFactor?: (ctx: ParenthesizedFactorContext) => void;
    /**
     * Exit a parse tree produced by the `ParenthesizedFactor`
     * labeled alternative in `ClarionParser.factor`.
     * @param ctx the parse tree
     */
    exitParenthesizedFactor?: (ctx: ParenthesizedFactorContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.propertyAccess`.
     * @param ctx the parse tree
     */
    enterPropertyAccess?: (ctx: PropertyAccessContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.propertyAccess`.
     * @param ctx the parse tree
     */
    exitPropertyAccess?: (ctx: PropertyAccessContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.functionCall`.
     * @param ctx the parse tree
     */
    enterFunctionCall?: (ctx: FunctionCallContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.functionCall`.
     * @param ctx the parse tree
     */
    exitFunctionCall?: (ctx: FunctionCallContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.dottedIdentifier`.
     * @param ctx the parse tree
     */
    enterDottedIdentifier?: (ctx: DottedIdentifierContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.dottedIdentifier`.
     * @param ctx the parse tree
     */
    exitDottedIdentifier?: (ctx: DottedIdentifierContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.argumentList`.
     * @param ctx the parse tree
     */
    enterArgumentList?: (ctx: ArgumentListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.argumentList`.
     * @param ctx the parse tree
     */
    exitArgumentList?: (ctx: ArgumentListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.expressionLike`.
     * @param ctx the parse tree
     */
    enterExpressionLike?: (ctx: ExpressionLikeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.expressionLike`.
     * @param ctx the parse tree
     */
    exitExpressionLike?: (ctx: ExpressionLikeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.parameterList`.
     * @param ctx the parse tree
     */
    enterParameterList?: (ctx: ParameterListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.parameterList`.
     * @param ctx the parse tree
     */
    exitParameterList?: (ctx: ParameterListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.parameter`.
     * @param ctx the parse tree
     */
    enterParameter?: (ctx: ParameterContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.parameter`.
     * @param ctx the parse tree
     */
    exitParameter?: (ctx: ParameterContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.returnType`.
     * @param ctx the parse tree
     */
    enterReturnType?: (ctx: ReturnTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.returnType`.
     * @param ctx the parse tree
     */
    exitReturnType?: (ctx: ReturnTypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.assignmentStatement`.
     * @param ctx the parse tree
     */
    enterAssignmentStatement?: (ctx: AssignmentStatementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.assignmentStatement`.
     * @param ctx the parse tree
     */
    exitAssignmentStatement?: (ctx: AssignmentStatementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.assignable`.
     * @param ctx the parse tree
     */
    enterAssignable?: (ctx: AssignableContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.assignable`.
     * @param ctx the parse tree
     */
    exitAssignable?: (ctx: AssignableContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.assignmentOperator`.
     * @param ctx the parse tree
     */
    enterAssignmentOperator?: (ctx: AssignmentOperatorContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.assignmentOperator`.
     * @param ctx the parse tree
     */
    exitAssignmentOperator?: (ctx: AssignmentOperatorContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.statementTerminator`.
     * @param ctx the parse tree
     */
    enterStatementTerminator?: (ctx: StatementTerminatorContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.statementTerminator`.
     * @param ctx the parse tree
     */
    exitStatementTerminator?: (ctx: StatementTerminatorContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.ignoredAttribute`.
     * @param ctx the parse tree
     */
    enterIgnoredAttribute?: (ctx: IgnoredAttributeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.ignoredAttribute`.
     * @param ctx the parse tree
     */
    exitIgnoredAttribute?: (ctx: IgnoredAttributeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.ignoredAttributeContent`.
     * @param ctx the parse tree
     */
    enterIgnoredAttributeContent?: (ctx: IgnoredAttributeContentContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.ignoredAttributeContent`.
     * @param ctx the parse tree
     */
    exitIgnoredAttributeContent?: (ctx: IgnoredAttributeContentContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.attributeName`.
     * @param ctx the parse tree
     */
    enterAttributeName?: (ctx: AttributeNameContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.attributeName`.
     * @param ctx the parse tree
     */
    exitAttributeName?: (ctx: AttributeNameContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.windowDefinition`.
     * @param ctx the parse tree
     */
    enterWindowDefinition?: (ctx: WindowDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.windowDefinition`.
     * @param ctx the parse tree
     */
    exitWindowDefinition?: (ctx: WindowDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.windowType`.
     * @param ctx the parse tree
     */
    enterWindowType?: (ctx: WindowTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.windowType`.
     * @param ctx the parse tree
     */
    exitWindowType?: (ctx: WindowTypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.windowBody`.
     * @param ctx the parse tree
     */
    enterWindowBody?: (ctx: WindowBodyContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.windowBody`.
     * @param ctx the parse tree
     */
    exitWindowBody?: (ctx: WindowBodyContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.windowElement`.
     * @param ctx the parse tree
     */
    enterWindowElement?: (ctx: WindowElementContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.windowElement`.
     * @param ctx the parse tree
     */
    exitWindowElement?: (ctx: WindowElementContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.endMarker`.
     * @param ctx the parse tree
     */
    enterEndMarker?: (ctx: EndMarkerContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.endMarker`.
     * @param ctx the parse tree
     */
    exitEndMarker?: (ctx: EndMarkerContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.menubarBlock`.
     * @param ctx the parse tree
     */
    enterMenubarBlock?: (ctx: MenubarBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.menubarBlock`.
     * @param ctx the parse tree
     */
    exitMenubarBlock?: (ctx: MenubarBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.menuBlock`.
     * @param ctx the parse tree
     */
    enterMenuBlock?: (ctx: MenuBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.menuBlock`.
     * @param ctx the parse tree
     */
    exitMenuBlock?: (ctx: MenuBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.itemDefinition`.
     * @param ctx the parse tree
     */
    enterItemDefinition?: (ctx: ItemDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.itemDefinition`.
     * @param ctx the parse tree
     */
    exitItemDefinition?: (ctx: ItemDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.toolbarBlock`.
     * @param ctx the parse tree
     */
    enterToolbarBlock?: (ctx: ToolbarBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.toolbarBlock`.
     * @param ctx the parse tree
     */
    exitToolbarBlock?: (ctx: ToolbarBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.buttonDefinition`.
     * @param ctx the parse tree
     */
    enterButtonDefinition?: (ctx: ButtonDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.buttonDefinition`.
     * @param ctx the parse tree
     */
    exitButtonDefinition?: (ctx: ButtonDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.sheetBlock`.
     * @param ctx the parse tree
     */
    enterSheetBlock?: (ctx: SheetBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.sheetBlock`.
     * @param ctx the parse tree
     */
    exitSheetBlock?: (ctx: SheetBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.tabBlock`.
     * @param ctx the parse tree
     */
    enterTabBlock?: (ctx: TabBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.tabBlock`.
     * @param ctx the parse tree
     */
    exitTabBlock?: (ctx: TabBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.groupBlock`.
     * @param ctx the parse tree
     */
    enterGroupBlock?: (ctx: GroupBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.groupBlock`.
     * @param ctx the parse tree
     */
    exitGroupBlock?: (ctx: GroupBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.optionBlock`.
     * @param ctx the parse tree
     */
    enterOptionBlock?: (ctx: OptionBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.optionBlock`.
     * @param ctx the parse tree
     */
    exitOptionBlock?: (ctx: OptionBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.controlBlock`.
     * @param ctx the parse tree
     */
    enterControlBlock?: (ctx: ControlBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.controlBlock`.
     * @param ctx the parse tree
     */
    exitControlBlock?: (ctx: ControlBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.unknownContent`.
     * @param ctx the parse tree
     */
    enterUnknownContent?: (ctx: UnknownContentContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.unknownContent`.
     * @param ctx the parse tree
     */
    exitUnknownContent?: (ctx: UnknownContentContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.globalDataSection`.
     * @param ctx the parse tree
     */
    enterGlobalDataSection?: (ctx: GlobalDataSectionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.globalDataSection`.
     * @param ctx the parse tree
     */
    exitGlobalDataSection?: (ctx: GlobalDataSectionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.globalEntry`.
     * @param ctx the parse tree
     */
    enterGlobalEntry?: (ctx: GlobalEntryContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.globalEntry`.
     * @param ctx the parse tree
     */
    exitGlobalEntry?: (ctx: GlobalEntryContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.includeDirective`.
     * @param ctx the parse tree
     */
    enterIncludeDirective?: (ctx: IncludeDirectiveContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.includeDirective`.
     * @param ctx the parse tree
     */
    exitIncludeDirective?: (ctx: IncludeDirectiveContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.equateDefinition`.
     * @param ctx the parse tree
     */
    enterEquateDefinition?: (ctx: EquateDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.equateDefinition`.
     * @param ctx the parse tree
     */
    exitEquateDefinition?: (ctx: EquateDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.globalVariable`.
     * @param ctx the parse tree
     */
    enterGlobalVariable?: (ctx: GlobalVariableContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.globalVariable`.
     * @param ctx the parse tree
     */
    exitGlobalVariable?: (ctx: GlobalVariableContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.fieldReference`.
     * @param ctx the parse tree
     */
    enterFieldReference?: (ctx: FieldReferenceContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.fieldReference`.
     * @param ctx the parse tree
     */
    exitFieldReference?: (ctx: FieldReferenceContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.queueBlock`.
     * @param ctx the parse tree
     */
    enterQueueBlock?: (ctx: QueueBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.queueBlock`.
     * @param ctx the parse tree
     */
    exitQueueBlock?: (ctx: QueueBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.fieldList`.
     * @param ctx the parse tree
     */
    enterFieldList?: (ctx: FieldListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.fieldList`.
     * @param ctx the parse tree
     */
    exitFieldList?: (ctx: FieldListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.fieldDefinition`.
     * @param ctx the parse tree
     */
    enterFieldDefinition?: (ctx: FieldDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.fieldDefinition`.
     * @param ctx the parse tree
     */
    exitFieldDefinition?: (ctx: FieldDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.fieldType`.
     * @param ctx the parse tree
     */
    enterFieldType?: (ctx: FieldTypeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.fieldType`.
     * @param ctx the parse tree
     */
    exitFieldType?: (ctx: FieldTypeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.fieldOptions`.
     * @param ctx the parse tree
     */
    enterFieldOptions?: (ctx: FieldOptionsContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.fieldOptions`.
     * @param ctx the parse tree
     */
    exitFieldOptions?: (ctx: FieldOptionsContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.classDeclaration`.
     * @param ctx the parse tree
     */
    enterClassDeclaration?: (ctx: ClassDeclarationContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.classDeclaration`.
     * @param ctx the parse tree
     */
    exitClassDeclaration?: (ctx: ClassDeclarationContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.procedureAttribute`.
     * @param ctx the parse tree
     */
    enterProcedureAttribute?: (ctx: ProcedureAttributeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.procedureAttribute`.
     * @param ctx the parse tree
     */
    exitProcedureAttribute?: (ctx: ProcedureAttributeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.declarationParameterList`.
     * @param ctx the parse tree
     */
    enterDeclarationParameterList?: (ctx: DeclarationParameterListContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.declarationParameterList`.
     * @param ctx the parse tree
     */
    exitDeclarationParameterList?: (ctx: DeclarationParameterListContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.declarationParameterListNonEmpty`.
     * @param ctx the parse tree
     */
    enterDeclarationParameterListNonEmpty?: (ctx: DeclarationParameterListNonEmptyContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.declarationParameterListNonEmpty`.
     * @param ctx the parse tree
     */
    exitDeclarationParameterListNonEmpty?: (ctx: DeclarationParameterListNonEmptyContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.declarationParameter`.
     * @param ctx the parse tree
     */
    enterDeclarationParameter?: (ctx: DeclarationParameterContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.declarationParameter`.
     * @param ctx the parse tree
     */
    exitDeclarationParameter?: (ctx: DeclarationParameterContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.fileDeclaration`.
     * @param ctx the parse tree
     */
    enterFileDeclaration?: (ctx: FileDeclarationContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.fileDeclaration`.
     * @param ctx the parse tree
     */
    exitFileDeclaration?: (ctx: FileDeclarationContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.fileAttributes`.
     * @param ctx the parse tree
     */
    enterFileAttributes?: (ctx: FileAttributesContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.fileAttributes`.
     * @param ctx the parse tree
     */
    exitFileAttributes?: (ctx: FileAttributesContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.fileStructure`.
     * @param ctx the parse tree
     */
    enterFileStructure?: (ctx: FileStructureContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.fileStructure`.
     * @param ctx the parse tree
     */
    exitFileStructure?: (ctx: FileStructureContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.recordBlock`.
     * @param ctx the parse tree
     */
    enterRecordBlock?: (ctx: RecordBlockContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.recordBlock`.
     * @param ctx the parse tree
     */
    exitRecordBlock?: (ctx: RecordBlockContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.recordAttribute`.
     * @param ctx the parse tree
     */
    enterRecordAttribute?: (ctx: RecordAttributeContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.recordAttribute`.
     * @param ctx the parse tree
     */
    exitRecordAttribute?: (ctx: RecordAttributeContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.keyDefinition`.
     * @param ctx the parse tree
     */
    enterKeyDefinition?: (ctx: KeyDefinitionContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.keyDefinition`.
     * @param ctx the parse tree
     */
    exitKeyDefinition?: (ctx: KeyDefinitionContext) => void;
    /**
     * Enter a parse tree produced by `ClarionParser.keyFields`.
     * @param ctx the parse tree
     */
    enterKeyFields?: (ctx: KeyFieldsContext) => void;
    /**
     * Exit a parse tree produced by `ClarionParser.keyFields`.
     * @param ctx the parse tree
     */
    exitKeyFields?: (ctx: KeyFieldsContext) => void;

    visitTerminal(node: TerminalNode): void {}
    visitErrorNode(node: ErrorNode): void {}
    enterEveryRule(node: ParserRuleContext): void {}
    exitEveryRule(node: ParserRuleContext): void {}
}

