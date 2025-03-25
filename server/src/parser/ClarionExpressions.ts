// Generated from server/antlr/ClarionExpressions.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { ClarionExpressionsListener } from "./ClarionExpressionsListener.js";
// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class ClarionExpressions extends antlr.Parser {
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
    public static readonly RULE_expression = 0;
    public static readonly RULE_term = 1;
    public static readonly RULE_factor = 2;
    public static readonly RULE_propertyAccess = 3;
    public static readonly RULE_functionCall = 4;
    public static readonly RULE_dottedIdentifier = 5;
    public static readonly RULE_argumentList = 6;
    public static readonly RULE_expressionLike = 7;
    public static readonly RULE_parameterList = 8;
    public static readonly RULE_parameter = 9;
    public static readonly RULE_returnType = 10;

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
        "expression", "term", "factor", "propertyAccess", "functionCall", 
        "dottedIdentifier", "argumentList", "expressionLike", "parameterList", 
        "parameter", "returnType",
    ];

    public get grammarFileName(): string { return "ClarionExpressions.g4"; }
    public get literalNames(): (string | null)[] { return ClarionExpressions.literalNames; }
    public get symbolicNames(): (string | null)[] { return ClarionExpressions.symbolicNames; }
    public get ruleNames(): string[] { return ClarionExpressions.ruleNames; }
    public get serializedATN(): number[] { return ClarionExpressions._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, ClarionExpressions._ATN, ClarionExpressions.decisionsToDFA, new antlr.PredictionContextCache());
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
        let _startState = 0;
        this.enterRecursionRule(localContext, 0, ClarionExpressions.RULE_expression, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            localContext = new TermExpressionContext(localContext);
            this.context = localContext;
            previousContext = localContext;

            this.state = 23;
            this.term(0);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 33;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 1, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 31;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 0, this.context) ) {
                    case 1:
                        {
                        localContext = new AdditiveExpressionContext(new ExpressionContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionExpressions.RULE_expression);
                        this.state = 25;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 26;
                        this.match(ClarionExpressions.PLUS);
                        this.state = 27;
                        this.term(0);
                        }
                        break;
                    case 2:
                        {
                        localContext = new AdditiveExpressionContext(new ExpressionContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionExpressions.RULE_expression);
                        this.state = 28;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 29;
                        this.match(ClarionExpressions.MINUS);
                        this.state = 30;
                        this.term(0);
                        }
                        break;
                    }
                    }
                }
                this.state = 35;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 1, this.context);
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
        let _startState = 2;
        this.enterRecursionRule(localContext, 2, ClarionExpressions.RULE_term, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            localContext = new FactorExpressionContext(localContext);
            this.context = localContext;
            previousContext = localContext;

            this.state = 37;
            this.factor();
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 47;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 3, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 45;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 2, this.context) ) {
                    case 1:
                        {
                        localContext = new MultiplicativeExpressionContext(new TermContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionExpressions.RULE_term);
                        this.state = 39;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 40;
                        this.match(ClarionExpressions.STAR);
                        this.state = 41;
                        this.factor();
                        }
                        break;
                    case 2:
                        {
                        localContext = new MultiplicativeExpressionContext(new TermContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionExpressions.RULE_term);
                        this.state = 42;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 43;
                        this.match(ClarionExpressions.SLASH);
                        this.state = 44;
                        this.factor();
                        }
                        break;
                    }
                    }
                }
                this.state = 49;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 3, this.context);
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
        this.enterRule(localContext, 4, ClarionExpressions.RULE_factor);
        try {
            this.state = 60;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 4, this.context) ) {
            case 1:
                localContext = new FunctionCallFactorContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 50;
                this.functionCall();
                }
                break;
            case 2:
                localContext = new DottedIdentifierFactorContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 51;
                this.dottedIdentifier();
                }
                break;
            case 3:
                localContext = new PropertyAccessFactorContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 52;
                this.propertyAccess();
                }
                break;
            case 4:
                localContext = new FieldEquateFactorContext(localContext);
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 53;
                this.match(ClarionExpressions.FEQ);
                }
                break;
            case 5:
                localContext = new IntegerFactorContext(localContext);
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 54;
                this.match(ClarionExpressions.NUMERIC);
                }
                break;
            case 6:
                localContext = new StringFactorContext(localContext);
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 55;
                this.match(ClarionExpressions.STRING);
                }
                break;
            case 7:
                localContext = new ParenthesizedFactorContext(localContext);
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 56;
                this.match(ClarionExpressions.LPAREN);
                this.state = 57;
                this.expression(0);
                this.state = 58;
                this.match(ClarionExpressions.RPAREN);
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
        this.enterRule(localContext, 6, ClarionExpressions.RULE_propertyAccess);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 62;
            this.match(ClarionExpressions.ID);
            this.state = 63;
            this.match(ClarionExpressions.LBRACE);
            this.state = 64;
            this.match(ClarionExpressions.ID);
            this.state = 69;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 78) {
                {
                {
                this.state = 65;
                this.match(ClarionExpressions.COLON);
                this.state = 66;
                this.match(ClarionExpressions.ID);
                }
                }
                this.state = 71;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 72;
            this.match(ClarionExpressions.RBRACE);
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
        this.enterRule(localContext, 8, ClarionExpressions.RULE_functionCall);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 74;
            this.dottedIdentifier();
            this.state = 75;
            this.match(ClarionExpressions.LPAREN);
            this.state = 77;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 6, this.context) ) {
            case 1:
                {
                this.state = 76;
                this.argumentList();
                }
                break;
            }
            this.state = 79;
            this.match(ClarionExpressions.RPAREN);
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
        this.enterRule(localContext, 10, ClarionExpressions.RULE_dottedIdentifier);
        let _la: number;
        try {
            let alternative: number;
            this.state = 92;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ClarionExpressions.SELF:
            case ClarionExpressions.PARENT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 81;
                _la = this.tokenStream.LA(1);
                if(!(_la === 59 || _la === 60)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 82;
                this.match(ClarionExpressions.DOT);
                this.state = 83;
                this.match(ClarionExpressions.ID);
                }
                break;
            case ClarionExpressions.ID:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 84;
                this.match(ClarionExpressions.ID);
                this.state = 89;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 7, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 85;
                        this.match(ClarionExpressions.DOT);
                        this.state = 86;
                        this.match(ClarionExpressions.ID);
                        }
                        }
                    }
                    this.state = 91;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 7, this.context);
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
        this.enterRule(localContext, 12, ClarionExpressions.RULE_argumentList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 102;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294967294) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33419231) !== 0)) {
                {
                this.state = 94;
                this.expressionLike();
                this.state = 99;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 76) {
                    {
                    {
                    this.state = 95;
                    this.match(ClarionExpressions.COMMA);
                    this.state = 96;
                    this.expressionLike();
                    }
                    }
                    this.state = 101;
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
        this.enterRule(localContext, 14, ClarionExpressions.RULE_expressionLike);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 105;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
                {
                {
                this.state = 104;
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
                this.state = 107;
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
        this.enterRule(localContext, 16, ClarionExpressions.RULE_parameterList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 109;
            this.match(ClarionExpressions.LPAREN);
            this.state = 118;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 62 || _la === 63) {
                {
                this.state = 110;
                this.parameter();
                this.state = 115;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 76) {
                    {
                    {
                    this.state = 111;
                    this.match(ClarionExpressions.COMMA);
                    this.state = 112;
                    this.parameter();
                    }
                    }
                    this.state = 117;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 120;
            this.match(ClarionExpressions.RPAREN);
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
        this.enterRule(localContext, 18, ClarionExpressions.RULE_parameter);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 122;
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
        this.enterRule(localContext, 20, ClarionExpressions.RULE_returnType);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 124;
            this.match(ClarionExpressions.ID);
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
        case 0:
            return this.expression_sempred(localContext as ExpressionContext, predIndex);
        case 1:
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
        4,1,88,127,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,
        6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,1,0,1,0,1,0,1,0,1,0,1,0,1,0,
        1,0,1,0,5,0,32,8,0,10,0,12,0,35,9,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,5,1,46,8,1,10,1,12,1,49,9,1,1,2,1,2,1,2,1,2,1,2,1,2,1,2,
        1,2,1,2,1,2,3,2,61,8,2,1,3,1,3,1,3,1,3,1,3,5,3,68,8,3,10,3,12,3,
        71,9,3,1,3,1,3,1,4,1,4,1,4,3,4,78,8,4,1,4,1,4,1,5,1,5,1,5,1,5,1,
        5,1,5,5,5,88,8,5,10,5,12,5,91,9,5,3,5,93,8,5,1,6,1,6,1,6,5,6,98,
        8,6,10,6,12,6,101,9,6,3,6,103,8,6,1,7,4,7,106,8,7,11,7,12,7,107,
        1,8,1,8,1,8,1,8,5,8,114,8,8,10,8,12,8,117,9,8,3,8,119,8,8,1,8,1,
        8,1,9,1,9,1,10,1,10,1,10,0,2,0,2,11,0,2,4,6,8,10,12,14,16,18,20,
        0,3,1,0,59,60,3,0,69,69,76,76,81,81,1,0,62,63,134,0,22,1,0,0,0,2,
        36,1,0,0,0,4,60,1,0,0,0,6,62,1,0,0,0,8,74,1,0,0,0,10,92,1,0,0,0,
        12,102,1,0,0,0,14,105,1,0,0,0,16,109,1,0,0,0,18,122,1,0,0,0,20,124,
        1,0,0,0,22,23,6,0,-1,0,23,24,3,2,1,0,24,33,1,0,0,0,25,26,10,3,0,
        0,26,27,5,72,0,0,27,32,3,2,1,0,28,29,10,2,0,0,29,30,5,73,0,0,30,
        32,3,2,1,0,31,25,1,0,0,0,31,28,1,0,0,0,32,35,1,0,0,0,33,31,1,0,0,
        0,33,34,1,0,0,0,34,1,1,0,0,0,35,33,1,0,0,0,36,37,6,1,-1,0,37,38,
        3,4,2,0,38,47,1,0,0,0,39,40,10,3,0,0,40,41,5,74,0,0,41,46,3,4,2,
        0,42,43,10,2,0,0,43,44,5,75,0,0,44,46,3,4,2,0,45,39,1,0,0,0,45,42,
        1,0,0,0,46,49,1,0,0,0,47,45,1,0,0,0,47,48,1,0,0,0,48,3,1,0,0,0,49,
        47,1,0,0,0,50,61,3,8,4,0,51,61,3,10,5,0,52,61,3,6,3,0,53,61,5,61,
        0,0,54,61,5,64,0,0,55,61,5,63,0,0,56,57,5,80,0,0,57,58,3,0,0,0,58,
        59,5,81,0,0,59,61,1,0,0,0,60,50,1,0,0,0,60,51,1,0,0,0,60,52,1,0,
        0,0,60,53,1,0,0,0,60,54,1,0,0,0,60,55,1,0,0,0,60,56,1,0,0,0,61,5,
        1,0,0,0,62,63,5,62,0,0,63,64,5,82,0,0,64,69,5,62,0,0,65,66,5,78,
        0,0,66,68,5,62,0,0,67,65,1,0,0,0,68,71,1,0,0,0,69,67,1,0,0,0,69,
        70,1,0,0,0,70,72,1,0,0,0,71,69,1,0,0,0,72,73,5,83,0,0,73,7,1,0,0,
        0,74,75,3,10,5,0,75,77,5,80,0,0,76,78,3,12,6,0,77,76,1,0,0,0,77,
        78,1,0,0,0,78,79,1,0,0,0,79,80,5,81,0,0,80,9,1,0,0,0,81,82,7,0,0,
        0,82,83,5,77,0,0,83,93,5,62,0,0,84,89,5,62,0,0,85,86,5,77,0,0,86,
        88,5,62,0,0,87,85,1,0,0,0,88,91,1,0,0,0,89,87,1,0,0,0,89,90,1,0,
        0,0,90,93,1,0,0,0,91,89,1,0,0,0,92,81,1,0,0,0,92,84,1,0,0,0,93,11,
        1,0,0,0,94,99,3,14,7,0,95,96,5,76,0,0,96,98,3,14,7,0,97,95,1,0,0,
        0,98,101,1,0,0,0,99,97,1,0,0,0,99,100,1,0,0,0,100,103,1,0,0,0,101,
        99,1,0,0,0,102,94,1,0,0,0,102,103,1,0,0,0,103,13,1,0,0,0,104,106,
        8,1,0,0,105,104,1,0,0,0,106,107,1,0,0,0,107,105,1,0,0,0,107,108,
        1,0,0,0,108,15,1,0,0,0,109,118,5,80,0,0,110,115,3,18,9,0,111,112,
        5,76,0,0,112,114,3,18,9,0,113,111,1,0,0,0,114,117,1,0,0,0,115,113,
        1,0,0,0,115,116,1,0,0,0,116,119,1,0,0,0,117,115,1,0,0,0,118,110,
        1,0,0,0,118,119,1,0,0,0,119,120,1,0,0,0,120,121,5,81,0,0,121,17,
        1,0,0,0,122,123,7,2,0,0,123,19,1,0,0,0,124,125,5,62,0,0,125,21,1,
        0,0,0,14,31,33,45,47,60,69,77,89,92,99,102,107,115,118
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!ClarionExpressions.__ATN) {
            ClarionExpressions.__ATN = new antlr.ATNDeserializer().deserialize(ClarionExpressions._serializedATN);
        }

        return ClarionExpressions.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(ClarionExpressions.literalNames, ClarionExpressions.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return ClarionExpressions.vocabulary;
    }

    private static readonly decisionsToDFA = ClarionExpressions._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class ExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_expression;
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
        return this.getToken(ClarionExpressions.PLUS, 0);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public MINUS(): antlr.TerminalNode | null {
        return this.getToken(ClarionExpressions.MINUS, 0);
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterAdditiveExpression) {
             listener.enterAdditiveExpression(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterTermExpression) {
             listener.enterTermExpression(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return ClarionExpressions.RULE_term;
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
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterFactorExpression) {
             listener.enterFactorExpression(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.STAR, 0);
    }
    public factor(): FactorContext {
        return this.getRuleContext(0, FactorContext)!;
    }
    public SLASH(): antlr.TerminalNode | null {
        return this.getToken(ClarionExpressions.SLASH, 0);
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterMultiplicativeExpression) {
             listener.enterMultiplicativeExpression(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return ClarionExpressions.RULE_factor;
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
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterFunctionCallFactor) {
             listener.enterFunctionCallFactor(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.FEQ, 0)!;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterFieldEquateFactor) {
             listener.enterFieldEquateFactor(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.NUMERIC, 0)!;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterIntegerFactor) {
             listener.enterIntegerFactor(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterPropertyAccessFactor) {
             listener.enterPropertyAccessFactor(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.STRING, 0)!;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterStringFactor) {
             listener.enterStringFactor(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterDottedIdentifierFactor) {
             listener.enterDottedIdentifierFactor(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.LPAREN, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionExpressions.RPAREN, 0)!;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterParenthesizedFactor) {
             listener.enterParenthesizedFactor(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
    		return this.getTokens(ClarionExpressions.ID);
    	} else {
    		return this.getToken(ClarionExpressions.ID, i);
    	}
    }
    public LBRACE(): antlr.TerminalNode {
        return this.getToken(ClarionExpressions.LBRACE, 0)!;
    }
    public RBRACE(): antlr.TerminalNode {
        return this.getToken(ClarionExpressions.RBRACE, 0)!;
    }
    public COLON(): antlr.TerminalNode[];
    public COLON(i: number): antlr.TerminalNode | null;
    public COLON(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionExpressions.COLON);
    	} else {
    		return this.getToken(ClarionExpressions.COLON, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_propertyAccess;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterPropertyAccess) {
             listener.enterPropertyAccess(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionExpressions.RPAREN, 0)!;
    }
    public argumentList(): ArgumentListContext | null {
        return this.getRuleContext(0, ArgumentListContext);
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_functionCall;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterFunctionCall) {
             listener.enterFunctionCall(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
    		return this.getTokens(ClarionExpressions.DOT);
    	} else {
    		return this.getToken(ClarionExpressions.DOT, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionExpressions.ID);
    	} else {
    		return this.getToken(ClarionExpressions.ID, i);
    	}
    }
    public SELF(): antlr.TerminalNode | null {
        return this.getToken(ClarionExpressions.SELF, 0);
    }
    public PARENT(): antlr.TerminalNode | null {
        return this.getToken(ClarionExpressions.PARENT, 0);
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_dottedIdentifier;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterDottedIdentifier) {
             listener.enterDottedIdentifier(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
    		return this.getTokens(ClarionExpressions.COMMA);
    	} else {
    		return this.getToken(ClarionExpressions.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_argumentList;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterArgumentList) {
             listener.enterArgumentList(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
    		return this.getTokens(ClarionExpressions.RPAREN);
    	} else {
    		return this.getToken(ClarionExpressions.RPAREN, i);
    	}
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionExpressions.COMMA);
    	} else {
    		return this.getToken(ClarionExpressions.COMMA, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionExpressions.LINEBREAK);
    	} else {
    		return this.getToken(ClarionExpressions.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_expressionLike;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterExpressionLike) {
             listener.enterExpressionLike(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionExpressions.RPAREN, 0)!;
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
    		return this.getTokens(ClarionExpressions.COMMA);
    	} else {
    		return this.getToken(ClarionExpressions.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_parameterList;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterParameterList) {
             listener.enterParameterList(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.ID, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionExpressions.STRING, 0);
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_parameter;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterParameter) {
             listener.enterParameter(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
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
        return this.getToken(ClarionExpressions.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionExpressions.RULE_returnType;
    }
    public override enterRule(listener: ClarionExpressionsListener): void {
        if(listener.enterReturnType) {
             listener.enterReturnType(this);
        }
    }
    public override exitRule(listener: ClarionExpressionsListener): void {
        if(listener.exitReturnType) {
             listener.exitReturnType(this);
        }
    }
}
