// Generated from server/antlr/ClarionAssignment.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { ClarionAssignmentListener } from "./ClarionAssignmentListener.js";
// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class ClarionAssignment extends antlr.Parser {
    public static readonly STATEMENT_END = 1;
    public static readonly APPLICATION = 2;
    public static readonly WINDOW = 3;
    public static readonly PROCEDURE = 4;
    public static readonly CLASS = 5;
    public static readonly ROUTINE = 6;
    public static readonly IF = 7;
    public static readonly THEN = 8;
    public static readonly ELSE = 9;
    public static readonly LOOP = 10;
    public static readonly CASE = 11;
    public static readonly OF = 12;
    public static readonly END = 13;
    public static readonly SYSTEM = 14;
    public static readonly CENTER = 15;
    public static readonly AT = 16;
    public static readonly MAX = 17;
    public static readonly MIN = 18;
    public static readonly RESIZE = 19;
    public static readonly MODAL = 20;
    public static readonly FONT = 21;
    public static readonly ICON = 22;
    public static readonly STATUS = 23;
    public static readonly MDI = 24;
    public static readonly IMM = 25;
    public static readonly MENUBAR = 26;
    public static readonly TOOLBAR = 27;
    public static readonly BUTTON = 28;
    public static readonly MENU = 29;
    public static readonly USE = 30;
    public static readonly MSG = 31;
    public static readonly STD = 32;
    public static readonly ITEM = 33;
    public static readonly SEPARATOR = 34;
    public static readonly NOMERGE = 35;
    public static readonly MAP = 36;
    public static readonly MODULE = 37;
    public static readonly DATA = 38;
    public static readonly CODE = 39;
    public static readonly RETURN = 40;
    public static readonly FILE = 41;
    public static readonly RECORD = 42;
    public static readonly KEY = 43;
    public static readonly PRE = 44;
    public static readonly GROUP = 45;
    public static readonly QUEUE = 46;
    public static readonly EQUATE = 47;
    public static readonly INCLUDE = 48;
    public static readonly ONCE = 49;
    public static readonly PROGRAM = 50;
    public static readonly MEMBER = 51;
    public static readonly THREAD = 52;
    public static readonly SHEET = 53;
    public static readonly TAB = 54;
    public static readonly OPTION = 55;
    public static readonly DO = 56;
    public static readonly ACCEPTED = 57;
    public static readonly ELSIF = 58;
    public static readonly SELF = 59;
    public static readonly PARENT = 60;
    public static readonly FEQ = 61;
    public static readonly ID = 62;
    public static readonly STRING = 63;
    public static readonly NUMERIC = 64;
    public static readonly COMMENT = 65;
    public static readonly CONTINUED_LINE_LF = 66;
    public static readonly CONTINUED_LINE_CRLF = 67;
    public static readonly CONTINUED_LINE_CR = 68;
    public static readonly LINEBREAK = 69;
    public static readonly WHITESPACE = 70;
    public static readonly AMPERSAND_EQUALS = 71;
    public static readonly PLUS = 72;
    public static readonly MINUS = 73;
    public static readonly STAR = 74;
    public static readonly SLASH = 75;
    public static readonly COMMA = 76;
    public static readonly DOT = 77;
    public static readonly COLON = 78;
    public static readonly ARROW = 79;
    public static readonly LPAREN = 80;
    public static readonly RPAREN = 81;
    public static readonly LBRACE = 82;
    public static readonly RBRACE = 83;
    public static readonly EQUALS = 84;
    public static readonly SEMI = 85;
    public static readonly AMPERSAND = 86;
    public static readonly QUESTION = 87;
    public static readonly UNHANDLED = 88;
    public static readonly RULE_assignmentStatement = 0;
    public static readonly RULE_assignable = 1;
    public static readonly RULE_assignmentOperator = 2;
    public static readonly RULE_statementTerminator = 3;
    public static readonly RULE_expression = 4;
    public static readonly RULE_term = 5;
    public static readonly RULE_factor = 6;
    public static readonly RULE_propertyAccess = 7;
    public static readonly RULE_functionCall = 8;
    public static readonly RULE_dottedIdentifier = 9;
    public static readonly RULE_argumentList = 10;
    public static readonly RULE_expressionLike = 11;
    public static readonly RULE_parameterList = 12;
    public static readonly RULE_parameter = 13;
    public static readonly RULE_returnType = 14;

    public static readonly literalNames = [
        null, null, "'APPLICATION'", "'WINDOW'", "'PROCEDURE'", "'CLASS'", 
        "'ROUTINE'", "'IF'", "'THEN'", "'ELSE'", "'LOOP'", "'CASE'", "'OF'", 
        "'END'", "'SYSTEM'", "'CENTER'", "'AT'", "'MAX'", "'MIN'", "'RESIZE'", 
        "'MODAL'", "'FONT'", "'ICON'", "'STATUS'", "'MDI'", "'IMM'", "'MENUBAR'", 
        "'TOOLBAR'", "'BUTTON'", "'MENU'", "'USE'", "'MSG'", "'STD'", "'ITEM'", 
        "'SEPARATOR'", "'NOMERGE'", "'MAP'", "'MODULE'", "'DATA'", "'CODE'", 
        "'RETURN'", "'FILE'", "'RECORD'", "'KEY'", "'PRE'", "'GROUP'", "'QUEUE'", 
        "'EQUATE'", "'INCLUDE'", "'ONCE'", "'PROGRAM'", "'MEMBER'", "'THREAD'", 
        "'SHEET'", "'TAB'", "'OPTION'", "'DO'", "'ACCEPTED'", "'ELSIF'", 
        "'SELF'", "'PARENT'", null, null, null, null, null, null, null, 
        null, null, null, "'&='", "'+'", "'-'", "'*'", "'/'", "','", "'.'", 
        "':'", "'=>'", "'('", "')'", "'{'", "'}'", "'='", "';'", "'&'", 
        "'?'"
    ];

    public static readonly symbolicNames = [
        null, "STATEMENT_END", "APPLICATION", "WINDOW", "PROCEDURE", "CLASS", 
        "ROUTINE", "IF", "THEN", "ELSE", "LOOP", "CASE", "OF", "END", "SYSTEM", 
        "CENTER", "AT", "MAX", "MIN", "RESIZE", "MODAL", "FONT", "ICON", 
        "STATUS", "MDI", "IMM", "MENUBAR", "TOOLBAR", "BUTTON", "MENU", 
        "USE", "MSG", "STD", "ITEM", "SEPARATOR", "NOMERGE", "MAP", "MODULE", 
        "DATA", "CODE", "RETURN", "FILE", "RECORD", "KEY", "PRE", "GROUP", 
        "QUEUE", "EQUATE", "INCLUDE", "ONCE", "PROGRAM", "MEMBER", "THREAD", 
        "SHEET", "TAB", "OPTION", "DO", "ACCEPTED", "ELSIF", "SELF", "PARENT", 
        "FEQ", "ID", "STRING", "NUMERIC", "COMMENT", "CONTINUED_LINE_LF", 
        "CONTINUED_LINE_CRLF", "CONTINUED_LINE_CR", "LINEBREAK", "WHITESPACE", 
        "AMPERSAND_EQUALS", "PLUS", "MINUS", "STAR", "SLASH", "COMMA", "DOT", 
        "COLON", "ARROW", "LPAREN", "RPAREN", "LBRACE", "RBRACE", "EQUALS", 
        "SEMI", "AMPERSAND", "QUESTION", "UNHANDLED"
    ];
    public static readonly ruleNames = [
        "assignmentStatement", "assignable", "assignmentOperator", "statementTerminator", 
        "expression", "term", "factor", "propertyAccess", "functionCall", 
        "dottedIdentifier", "argumentList", "expressionLike", "parameterList", 
        "parameter", "returnType",
    ];

    public get grammarFileName(): string { return "ClarionAssignment.g4"; }
    public get literalNames(): (string | null)[] { return ClarionAssignment.literalNames; }
    public get symbolicNames(): (string | null)[] { return ClarionAssignment.symbolicNames; }
    public get ruleNames(): string[] { return ClarionAssignment.ruleNames; }
    public get serializedATN(): number[] { return ClarionAssignment._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, ClarionAssignment._ATN, ClarionAssignment.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public assignmentStatement(): AssignmentStatementContext {
        let localContext = new AssignmentStatementContext(this.context, this.state);
        this.enterRule(localContext, 0, ClarionAssignment.RULE_assignmentStatement);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 30;
            this.assignable();
            this.state = 31;
            this.assignmentOperator();
            this.state = 32;
            this.expression(0);
            this.state = 33;
            this.statementTerminator();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public assignable(): AssignableContext {
        let localContext = new AssignableContext(this.context, this.state);
        this.enterRule(localContext, 2, ClarionAssignment.RULE_assignable);
        try {
            this.state = 48;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 0, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 35;
                this.dottedIdentifier();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 36;
                this.match(ClarionAssignment.ID);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 37;
                this.match(ClarionAssignment.QUESTION);
                this.state = 38;
                this.match(ClarionAssignment.ID);
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 39;
                this.match(ClarionAssignment.QUESTION);
                this.state = 40;
                this.match(ClarionAssignment.ID);
                this.state = 41;
                this.match(ClarionAssignment.LBRACE);
                this.state = 42;
                this.match(ClarionAssignment.ID);
                this.state = 43;
                this.match(ClarionAssignment.RBRACE);
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 44;
                this.match(ClarionAssignment.ID);
                this.state = 45;
                this.match(ClarionAssignment.LBRACE);
                this.state = 46;
                this.match(ClarionAssignment.ID);
                this.state = 47;
                this.match(ClarionAssignment.RBRACE);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public assignmentOperator(): AssignmentOperatorContext {
        let localContext = new AssignmentOperatorContext(this.context, this.state);
        this.enterRule(localContext, 4, ClarionAssignment.RULE_assignmentOperator);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 50;
            _la = this.tokenStream.LA(1);
            if(!(_la === 71 || _la === 84)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public statementTerminator(): StatementTerminatorContext {
        let localContext = new StatementTerminatorContext(this.context, this.state);
        this.enterRule(localContext, 6, ClarionAssignment.RULE_statementTerminator);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 52;
            _la = this.tokenStream.LA(1);
            if(!(_la === 1 || _la === 13 || _la === 69)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public expression(): ExpressionContext;
    public expression(_p: number): ExpressionContext;
    public expression(_p?: number): ExpressionContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new ExpressionContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 8;
        this.enterRecursionRule(localContext, 8, ClarionAssignment.RULE_expression, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            localContext = new TermExpressionContext(localContext);
            this.context = localContext;
            previousContext = localContext;

            this.state = 55;
            this.term(0);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 65;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 2, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 63;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 1, this.context) ) {
                    case 1:
                        {
                        localContext = new AdditiveExpressionContext(new ExpressionContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionAssignment.RULE_expression);
                        this.state = 57;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 58;
                        this.match(ClarionAssignment.PLUS);
                        this.state = 59;
                        this.term(0);
                        }
                        break;
                    case 2:
                        {
                        localContext = new AdditiveExpressionContext(new ExpressionContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionAssignment.RULE_expression);
                        this.state = 60;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 61;
                        this.match(ClarionAssignment.MINUS);
                        this.state = 62;
                        this.term(0);
                        }
                        break;
                    }
                    }
                }
                this.state = 67;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 2, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }

    public term(): TermContext;
    public term(_p: number): TermContext;
    public term(_p?: number): TermContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new TermContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 10;
        this.enterRecursionRule(localContext, 10, ClarionAssignment.RULE_term, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            localContext = new FactorExpressionContext(localContext);
            this.context = localContext;
            previousContext = localContext;

            this.state = 69;
            this.factor();
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 79;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 4, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 77;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 3, this.context) ) {
                    case 1:
                        {
                        localContext = new MultiplicativeExpressionContext(new TermContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionAssignment.RULE_term);
                        this.state = 71;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 72;
                        this.match(ClarionAssignment.STAR);
                        this.state = 73;
                        this.factor();
                        }
                        break;
                    case 2:
                        {
                        localContext = new MultiplicativeExpressionContext(new TermContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionAssignment.RULE_term);
                        this.state = 74;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 75;
                        this.match(ClarionAssignment.SLASH);
                        this.state = 76;
                        this.factor();
                        }
                        break;
                    }
                    }
                }
                this.state = 81;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 4, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }
    public factor(): FactorContext {
        let localContext = new FactorContext(this.context, this.state);
        this.enterRule(localContext, 12, ClarionAssignment.RULE_factor);
        try {
            this.state = 92;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 5, this.context) ) {
            case 1:
                localContext = new FunctionCallFactorContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 82;
                this.functionCall();
                }
                break;
            case 2:
                localContext = new DottedIdentifierFactorContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 83;
                this.dottedIdentifier();
                }
                break;
            case 3:
                localContext = new PropertyAccessFactorContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 84;
                this.propertyAccess();
                }
                break;
            case 4:
                localContext = new FieldEquateFactorContext(localContext);
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 85;
                this.match(ClarionAssignment.FEQ);
                }
                break;
            case 5:
                localContext = new IntegerFactorContext(localContext);
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 86;
                this.match(ClarionAssignment.NUMERIC);
                }
                break;
            case 6:
                localContext = new StringFactorContext(localContext);
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 87;
                this.match(ClarionAssignment.STRING);
                }
                break;
            case 7:
                localContext = new ParenthesizedFactorContext(localContext);
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 88;
                this.match(ClarionAssignment.LPAREN);
                this.state = 89;
                this.expression(0);
                this.state = 90;
                this.match(ClarionAssignment.RPAREN);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public propertyAccess(): PropertyAccessContext {
        let localContext = new PropertyAccessContext(this.context, this.state);
        this.enterRule(localContext, 14, ClarionAssignment.RULE_propertyAccess);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 94;
            this.match(ClarionAssignment.ID);
            this.state = 95;
            this.match(ClarionAssignment.LBRACE);
            this.state = 96;
            this.match(ClarionAssignment.ID);
            this.state = 101;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 78) {
                {
                {
                this.state = 97;
                this.match(ClarionAssignment.COLON);
                this.state = 98;
                this.match(ClarionAssignment.ID);
                }
                }
                this.state = 103;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 104;
            this.match(ClarionAssignment.RBRACE);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public functionCall(): FunctionCallContext {
        let localContext = new FunctionCallContext(this.context, this.state);
        this.enterRule(localContext, 16, ClarionAssignment.RULE_functionCall);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 106;
            this.dottedIdentifier();
            this.state = 107;
            this.match(ClarionAssignment.LPAREN);
            this.state = 109;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 7, this.context) ) {
            case 1:
                {
                this.state = 108;
                this.argumentList();
                }
                break;
            }
            this.state = 111;
            this.match(ClarionAssignment.RPAREN);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public dottedIdentifier(): DottedIdentifierContext {
        let localContext = new DottedIdentifierContext(this.context, this.state);
        this.enterRule(localContext, 18, ClarionAssignment.RULE_dottedIdentifier);
        let _la: number;
        try {
            let alternative: number;
            this.state = 124;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ClarionAssignment.SELF:
            case ClarionAssignment.PARENT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 113;
                _la = this.tokenStream.LA(1);
                if(!(_la === 59 || _la === 60)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 114;
                this.match(ClarionAssignment.DOT);
                this.state = 115;
                this.match(ClarionAssignment.ID);
                }
                break;
            case ClarionAssignment.ID:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 116;
                this.match(ClarionAssignment.ID);
                this.state = 121;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 8, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 117;
                        this.match(ClarionAssignment.DOT);
                        this.state = 118;
                        this.match(ClarionAssignment.ID);
                        }
                        }
                    }
                    this.state = 123;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 8, this.context);
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public argumentList(): ArgumentListContext {
        let localContext = new ArgumentListContext(this.context, this.state);
        this.enterRule(localContext, 20, ClarionAssignment.RULE_argumentList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 134;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294967294) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33419231) !== 0)) {
                {
                this.state = 126;
                this.expressionLike();
                this.state = 131;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 76) {
                    {
                    {
                    this.state = 127;
                    this.match(ClarionAssignment.COMMA);
                    this.state = 128;
                    this.expressionLike();
                    }
                    }
                    this.state = 133;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public expressionLike(): ExpressionLikeContext {
        let localContext = new ExpressionLikeContext(this.context, this.state);
        this.enterRule(localContext, 22, ClarionAssignment.RULE_expressionLike);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 137;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
                {
                {
                this.state = 136;
                _la = this.tokenStream.LA(1);
                if(_la<=0 || ((((_la - 69)) & ~0x1F) === 0 && ((1 << (_la - 69)) & 4225) !== 0)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
                }
                this.state = 139;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            } while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294967294) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33419231) !== 0));
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public parameterList(): ParameterListContext {
        let localContext = new ParameterListContext(this.context, this.state);
        this.enterRule(localContext, 24, ClarionAssignment.RULE_parameterList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 141;
            this.match(ClarionAssignment.LPAREN);
            this.state = 150;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 62 || _la === 63) {
                {
                this.state = 142;
                this.parameter();
                this.state = 147;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 76) {
                    {
                    {
                    this.state = 143;
                    this.match(ClarionAssignment.COMMA);
                    this.state = 144;
                    this.parameter();
                    }
                    }
                    this.state = 149;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 152;
            this.match(ClarionAssignment.RPAREN);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public parameter(): ParameterContext {
        let localContext = new ParameterContext(this.context, this.state);
        this.enterRule(localContext, 26, ClarionAssignment.RULE_parameter);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 154;
            _la = this.tokenStream.LA(1);
            if(!(_la === 62 || _la === 63)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public returnType(): ReturnTypeContext {
        let localContext = new ReturnTypeContext(this.context, this.state);
        this.enterRule(localContext, 28, ClarionAssignment.RULE_returnType);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 156;
            this.match(ClarionAssignment.ID);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public override sempred(localContext: antlr.ParserRuleContext | null, ruleIndex: number, predIndex: number): boolean {
        switch (ruleIndex) {
        case 4:
            return this.expression_sempred(localContext as ExpressionContext, predIndex);
        case 5:
            return this.term_sempred(localContext as TermContext, predIndex);
        }
        return true;
    }
    private expression_sempred(localContext: ExpressionContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 0:
            return this.precpred(this.context, 3);
        case 1:
            return this.precpred(this.context, 2);
        }
        return true;
    }
    private term_sempred(localContext: TermContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 2:
            return this.precpred(this.context, 3);
        case 3:
            return this.precpred(this.context, 2);
        }
        return true;
    }

    public static readonly _serializedATN: number[] = [
        4,1,88,159,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,
        6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,13,
        2,14,7,14,1,0,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,3,1,49,8,1,1,2,1,2,1,3,1,3,1,4,1,4,1,4,1,4,1,4,
        1,4,1,4,1,4,1,4,5,4,64,8,4,10,4,12,4,67,9,4,1,5,1,5,1,5,1,5,1,5,
        1,5,1,5,1,5,1,5,5,5,78,8,5,10,5,12,5,81,9,5,1,6,1,6,1,6,1,6,1,6,
        1,6,1,6,1,6,1,6,1,6,3,6,93,8,6,1,7,1,7,1,7,1,7,1,7,5,7,100,8,7,10,
        7,12,7,103,9,7,1,7,1,7,1,8,1,8,1,8,3,8,110,8,8,1,8,1,8,1,9,1,9,1,
        9,1,9,1,9,1,9,5,9,120,8,9,10,9,12,9,123,9,9,3,9,125,8,9,1,10,1,10,
        1,10,5,10,130,8,10,10,10,12,10,133,9,10,3,10,135,8,10,1,11,4,11,
        138,8,11,11,11,12,11,139,1,12,1,12,1,12,1,12,5,12,146,8,12,10,12,
        12,12,149,9,12,3,12,151,8,12,1,12,1,12,1,13,1,13,1,14,1,14,1,14,
        0,2,8,10,15,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,0,5,2,0,71,71,
        84,84,3,0,1,1,13,13,69,69,1,0,59,60,3,0,69,69,76,76,81,81,1,0,62,
        63,166,0,30,1,0,0,0,2,48,1,0,0,0,4,50,1,0,0,0,6,52,1,0,0,0,8,54,
        1,0,0,0,10,68,1,0,0,0,12,92,1,0,0,0,14,94,1,0,0,0,16,106,1,0,0,0,
        18,124,1,0,0,0,20,134,1,0,0,0,22,137,1,0,0,0,24,141,1,0,0,0,26,154,
        1,0,0,0,28,156,1,0,0,0,30,31,3,2,1,0,31,32,3,4,2,0,32,33,3,8,4,0,
        33,34,3,6,3,0,34,1,1,0,0,0,35,49,3,18,9,0,36,49,5,62,0,0,37,38,5,
        87,0,0,38,49,5,62,0,0,39,40,5,87,0,0,40,41,5,62,0,0,41,42,5,82,0,
        0,42,43,5,62,0,0,43,49,5,83,0,0,44,45,5,62,0,0,45,46,5,82,0,0,46,
        47,5,62,0,0,47,49,5,83,0,0,48,35,1,0,0,0,48,36,1,0,0,0,48,37,1,0,
        0,0,48,39,1,0,0,0,48,44,1,0,0,0,49,3,1,0,0,0,50,51,7,0,0,0,51,5,
        1,0,0,0,52,53,7,1,0,0,53,7,1,0,0,0,54,55,6,4,-1,0,55,56,3,10,5,0,
        56,65,1,0,0,0,57,58,10,3,0,0,58,59,5,72,0,0,59,64,3,10,5,0,60,61,
        10,2,0,0,61,62,5,73,0,0,62,64,3,10,5,0,63,57,1,0,0,0,63,60,1,0,0,
        0,64,67,1,0,0,0,65,63,1,0,0,0,65,66,1,0,0,0,66,9,1,0,0,0,67,65,1,
        0,0,0,68,69,6,5,-1,0,69,70,3,12,6,0,70,79,1,0,0,0,71,72,10,3,0,0,
        72,73,5,74,0,0,73,78,3,12,6,0,74,75,10,2,0,0,75,76,5,75,0,0,76,78,
        3,12,6,0,77,71,1,0,0,0,77,74,1,0,0,0,78,81,1,0,0,0,79,77,1,0,0,0,
        79,80,1,0,0,0,80,11,1,0,0,0,81,79,1,0,0,0,82,93,3,16,8,0,83,93,3,
        18,9,0,84,93,3,14,7,0,85,93,5,61,0,0,86,93,5,64,0,0,87,93,5,63,0,
        0,88,89,5,80,0,0,89,90,3,8,4,0,90,91,5,81,0,0,91,93,1,0,0,0,92,82,
        1,0,0,0,92,83,1,0,0,0,92,84,1,0,0,0,92,85,1,0,0,0,92,86,1,0,0,0,
        92,87,1,0,0,0,92,88,1,0,0,0,93,13,1,0,0,0,94,95,5,62,0,0,95,96,5,
        82,0,0,96,101,5,62,0,0,97,98,5,78,0,0,98,100,5,62,0,0,99,97,1,0,
        0,0,100,103,1,0,0,0,101,99,1,0,0,0,101,102,1,0,0,0,102,104,1,0,0,
        0,103,101,1,0,0,0,104,105,5,83,0,0,105,15,1,0,0,0,106,107,3,18,9,
        0,107,109,5,80,0,0,108,110,3,20,10,0,109,108,1,0,0,0,109,110,1,0,
        0,0,110,111,1,0,0,0,111,112,5,81,0,0,112,17,1,0,0,0,113,114,7,2,
        0,0,114,115,5,77,0,0,115,125,5,62,0,0,116,121,5,62,0,0,117,118,5,
        77,0,0,118,120,5,62,0,0,119,117,1,0,0,0,120,123,1,0,0,0,121,119,
        1,0,0,0,121,122,1,0,0,0,122,125,1,0,0,0,123,121,1,0,0,0,124,113,
        1,0,0,0,124,116,1,0,0,0,125,19,1,0,0,0,126,131,3,22,11,0,127,128,
        5,76,0,0,128,130,3,22,11,0,129,127,1,0,0,0,130,133,1,0,0,0,131,129,
        1,0,0,0,131,132,1,0,0,0,132,135,1,0,0,0,133,131,1,0,0,0,134,126,
        1,0,0,0,134,135,1,0,0,0,135,21,1,0,0,0,136,138,8,3,0,0,137,136,1,
        0,0,0,138,139,1,0,0,0,139,137,1,0,0,0,139,140,1,0,0,0,140,23,1,0,
        0,0,141,150,5,80,0,0,142,147,3,26,13,0,143,144,5,76,0,0,144,146,
        3,26,13,0,145,143,1,0,0,0,146,149,1,0,0,0,147,145,1,0,0,0,147,148,
        1,0,0,0,148,151,1,0,0,0,149,147,1,0,0,0,150,142,1,0,0,0,150,151,
        1,0,0,0,151,152,1,0,0,0,152,153,5,81,0,0,153,25,1,0,0,0,154,155,
        7,4,0,0,155,27,1,0,0,0,156,157,5,62,0,0,157,29,1,0,0,0,15,48,63,
        65,77,79,92,101,109,121,124,131,134,139,147,150
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!ClarionAssignment.__ATN) {
            ClarionAssignment.__ATN = new antlr.ATNDeserializer().deserialize(ClarionAssignment._serializedATN);
        }

        return ClarionAssignment.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(ClarionAssignment.literalNames, ClarionAssignment.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return ClarionAssignment.vocabulary;
    }

    private static readonly decisionsToDFA = ClarionAssignment._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class AssignmentStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public assignable(): AssignableContext {
        return this.getRuleContext(0, AssignableContext)!;
    }
    public assignmentOperator(): AssignmentOperatorContext {
        return this.getRuleContext(0, AssignmentOperatorContext)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public statementTerminator(): StatementTerminatorContext {
        return this.getRuleContext(0, StatementTerminatorContext)!;
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_assignmentStatement;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterAssignmentStatement) {
             listener.enterAssignmentStatement(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitAssignmentStatement) {
             listener.exitAssignmentStatement(this);
        }
    }
}


export class AssignableContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public dottedIdentifier(): DottedIdentifierContext | null {
        return this.getRuleContext(0, DottedIdentifierContext);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.ID);
    	} else {
    		return this.getToken(ClarionAssignment.ID, i);
    	}
    }
    public QUESTION(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.QUESTION, 0);
    }
    public LBRACE(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.LBRACE, 0);
    }
    public RBRACE(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.RBRACE, 0);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_assignable;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterAssignable) {
             listener.enterAssignable(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitAssignable) {
             listener.exitAssignable(this);
        }
    }
}


export class AssignmentOperatorContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EQUALS(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.EQUALS, 0);
    }
    public AMPERSAND_EQUALS(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.AMPERSAND_EQUALS, 0);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_assignmentOperator;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterAssignmentOperator) {
             listener.enterAssignmentOperator(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitAssignmentOperator) {
             listener.exitAssignmentOperator(this);
        }
    }
}


export class StatementTerminatorContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public STATEMENT_END(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.STATEMENT_END, 0);
    }
    public LINEBREAK(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.LINEBREAK, 0);
    }
    public END(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.END, 0);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_statementTerminator;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterStatementTerminator) {
             listener.enterStatementTerminator(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitStatementTerminator) {
             listener.exitStatementTerminator(this);
        }
    }
}


export class ExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_expression;
    }
    public override copyFrom(ctx: ExpressionContext): void {
        super.copyFrom(ctx);
    }
}
export class AdditiveExpressionContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public PLUS(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.PLUS, 0);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public MINUS(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.MINUS, 0);
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterAdditiveExpression) {
             listener.enterAdditiveExpression(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitAdditiveExpression) {
             listener.exitAdditiveExpression(this);
        }
    }
}
export class TermExpressionContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterTermExpression) {
             listener.enterTermExpression(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitTermExpression) {
             listener.exitTermExpression(this);
        }
    }
}


export class TermContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_term;
    }
    public override copyFrom(ctx: TermContext): void {
        super.copyFrom(ctx);
    }
}
export class FactorExpressionContext extends TermContext {
    public constructor(ctx: TermContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public factor(): FactorContext {
        return this.getRuleContext(0, FactorContext)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterFactorExpression) {
             listener.enterFactorExpression(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitFactorExpression) {
             listener.exitFactorExpression(this);
        }
    }
}
export class MultiplicativeExpressionContext extends TermContext {
    public constructor(ctx: TermContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public STAR(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.STAR, 0);
    }
    public factor(): FactorContext {
        return this.getRuleContext(0, FactorContext)!;
    }
    public SLASH(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.SLASH, 0);
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterMultiplicativeExpression) {
             listener.enterMultiplicativeExpression(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitMultiplicativeExpression) {
             listener.exitMultiplicativeExpression(this);
        }
    }
}


export class FactorContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_factor;
    }
    public override copyFrom(ctx: FactorContext): void {
        super.copyFrom(ctx);
    }
}
export class FunctionCallFactorContext extends FactorContext {
    public constructor(ctx: FactorContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public functionCall(): FunctionCallContext {
        return this.getRuleContext(0, FunctionCallContext)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterFunctionCallFactor) {
             listener.enterFunctionCallFactor(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitFunctionCallFactor) {
             listener.exitFunctionCallFactor(this);
        }
    }
}
export class FieldEquateFactorContext extends FactorContext {
    public constructor(ctx: FactorContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public FEQ(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.FEQ, 0)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterFieldEquateFactor) {
             listener.enterFieldEquateFactor(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitFieldEquateFactor) {
             listener.exitFieldEquateFactor(this);
        }
    }
}
export class IntegerFactorContext extends FactorContext {
    public constructor(ctx: FactorContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public NUMERIC(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.NUMERIC, 0)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterIntegerFactor) {
             listener.enterIntegerFactor(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitIntegerFactor) {
             listener.exitIntegerFactor(this);
        }
    }
}
export class PropertyAccessFactorContext extends FactorContext {
    public constructor(ctx: FactorContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public propertyAccess(): PropertyAccessContext {
        return this.getRuleContext(0, PropertyAccessContext)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterPropertyAccessFactor) {
             listener.enterPropertyAccessFactor(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitPropertyAccessFactor) {
             listener.exitPropertyAccessFactor(this);
        }
    }
}
export class StringFactorContext extends FactorContext {
    public constructor(ctx: FactorContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.STRING, 0)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterStringFactor) {
             listener.enterStringFactor(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitStringFactor) {
             listener.exitStringFactor(this);
        }
    }
}
export class DottedIdentifierFactorContext extends FactorContext {
    public constructor(ctx: FactorContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public dottedIdentifier(): DottedIdentifierContext {
        return this.getRuleContext(0, DottedIdentifierContext)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterDottedIdentifierFactor) {
             listener.enterDottedIdentifierFactor(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitDottedIdentifierFactor) {
             listener.exitDottedIdentifierFactor(this);
        }
    }
}
export class ParenthesizedFactorContext extends FactorContext {
    public constructor(ctx: FactorContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.LPAREN, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.RPAREN, 0)!;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterParenthesizedFactor) {
             listener.enterParenthesizedFactor(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitParenthesizedFactor) {
             listener.exitParenthesizedFactor(this);
        }
    }
}


export class PropertyAccessContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.ID);
    	} else {
    		return this.getToken(ClarionAssignment.ID, i);
    	}
    }
    public LBRACE(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.LBRACE, 0)!;
    }
    public RBRACE(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.RBRACE, 0)!;
    }
    public COLON(): antlr.TerminalNode[];
    public COLON(i: number): antlr.TerminalNode | null;
    public COLON(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.COLON);
    	} else {
    		return this.getToken(ClarionAssignment.COLON, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_propertyAccess;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterPropertyAccess) {
             listener.enterPropertyAccess(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitPropertyAccess) {
             listener.exitPropertyAccess(this);
        }
    }
}


export class FunctionCallContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public dottedIdentifier(): DottedIdentifierContext {
        return this.getRuleContext(0, DottedIdentifierContext)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.RPAREN, 0)!;
    }
    public argumentList(): ArgumentListContext | null {
        return this.getRuleContext(0, ArgumentListContext);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_functionCall;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterFunctionCall) {
             listener.enterFunctionCall(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitFunctionCall) {
             listener.exitFunctionCall(this);
        }
    }
}


export class DottedIdentifierContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public DOT(): antlr.TerminalNode[];
    public DOT(i: number): antlr.TerminalNode | null;
    public DOT(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.DOT);
    	} else {
    		return this.getToken(ClarionAssignment.DOT, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.ID);
    	} else {
    		return this.getToken(ClarionAssignment.ID, i);
    	}
    }
    public SELF(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.SELF, 0);
    }
    public PARENT(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.PARENT, 0);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_dottedIdentifier;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterDottedIdentifier) {
             listener.enterDottedIdentifier(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitDottedIdentifier) {
             listener.exitDottedIdentifier(this);
        }
    }
}


export class ArgumentListContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public expressionLike(): ExpressionLikeContext[];
    public expressionLike(i: number): ExpressionLikeContext | null;
    public expressionLike(i?: number): ExpressionLikeContext[] | ExpressionLikeContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionLikeContext);
        }

        return this.getRuleContext(i, ExpressionLikeContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.COMMA);
    	} else {
    		return this.getToken(ClarionAssignment.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_argumentList;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterArgumentList) {
             listener.enterArgumentList(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitArgumentList) {
             listener.exitArgumentList(this);
        }
    }
}


export class ExpressionLikeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public RPAREN(): antlr.TerminalNode[];
    public RPAREN(i: number): antlr.TerminalNode | null;
    public RPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.RPAREN);
    	} else {
    		return this.getToken(ClarionAssignment.RPAREN, i);
    	}
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.COMMA);
    	} else {
    		return this.getToken(ClarionAssignment.COMMA, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.LINEBREAK);
    	} else {
    		return this.getToken(ClarionAssignment.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_expressionLike;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterExpressionLike) {
             listener.enterExpressionLike(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitExpressionLike) {
             listener.exitExpressionLike(this);
        }
    }
}


export class ParameterListContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.RPAREN, 0)!;
    }
    public parameter(): ParameterContext[];
    public parameter(i: number): ParameterContext | null;
    public parameter(i?: number): ParameterContext[] | ParameterContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ParameterContext);
        }

        return this.getRuleContext(i, ParameterContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionAssignment.COMMA);
    	} else {
    		return this.getToken(ClarionAssignment.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_parameterList;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterParameterList) {
             listener.enterParameterList(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitParameterList) {
             listener.exitParameterList(this);
        }
    }
}


export class ParameterContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.ID, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionAssignment.STRING, 0);
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_parameter;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterParameter) {
             listener.enterParameter(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitParameter) {
             listener.exitParameter(this);
        }
    }
}


export class ReturnTypeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionAssignment.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionAssignment.RULE_returnType;
    }
    public override enterRule(listener: ClarionAssignmentListener): void {
        if(listener.enterReturnType) {
             listener.enterReturnType(this);
        }
    }
    public override exitRule(listener: ClarionAssignmentListener): void {
        if(listener.exitReturnType) {
             listener.exitReturnType(this);
        }
    }
}
