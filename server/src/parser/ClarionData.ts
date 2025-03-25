// Generated from server/antlr/ClarionData.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { ClarionDataListener } from "./ClarionDataListener.js";
// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class ClarionData extends antlr.Parser {
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
    public static readonly RULE_globalDataSection = 0;
    public static readonly RULE_globalEntry = 1;
    public static readonly RULE_includeDirective = 2;
    public static readonly RULE_equateDefinition = 3;
    public static readonly RULE_globalVariable = 4;
    public static readonly RULE_fieldReference = 5;
    public static readonly RULE_groupBlock = 6;
    public static readonly RULE_queueBlock = 7;
    public static readonly RULE_fieldList = 8;
    public static readonly RULE_fieldDefinition = 9;
    public static readonly RULE_fieldType = 10;
    public static readonly RULE_fieldOptions = 11;
    public static readonly RULE_argumentList = 12;
    public static readonly RULE_classDeclaration = 13;
    public static readonly RULE_returnType = 14;
    public static readonly RULE_procedureAttribute = 15;
    public static readonly RULE_declarationParameterList = 16;
    public static readonly RULE_declarationParameterListNonEmpty = 17;
    public static readonly RULE_declarationParameter = 18;
    public static readonly RULE_ignoredAttribute = 19;
    public static readonly RULE_ignoredAttributeContent = 20;
    public static readonly RULE_attributeName = 21;
    public static readonly RULE_windowDefinition = 22;
    public static readonly RULE_windowType = 23;
    public static readonly RULE_windowBody = 24;
    public static readonly RULE_windowElement = 25;
    public static readonly RULE_endMarker = 26;
    public static readonly RULE_menubarBlock = 27;
    public static readonly RULE_menuBlock = 28;
    public static readonly RULE_itemDefinition = 29;
    public static readonly RULE_toolbarBlock = 30;
    public static readonly RULE_buttonDefinition = 31;
    public static readonly RULE_sheetBlock = 32;
    public static readonly RULE_tabBlock = 33;
    public static readonly RULE_optionBlock = 34;
    public static readonly RULE_controlBlock = 35;
    public static readonly RULE_unknownContent = 36;

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
        "globalDataSection", "globalEntry", "includeDirective", "equateDefinition", 
        "globalVariable", "fieldReference", "groupBlock", "queueBlock", 
        "fieldList", "fieldDefinition", "fieldType", "fieldOptions", "argumentList", 
        "classDeclaration", "returnType", "procedureAttribute", "declarationParameterList", 
        "declarationParameterListNonEmpty", "declarationParameter", "ignoredAttribute", 
        "ignoredAttributeContent", "attributeName", "windowDefinition", 
        "windowType", "windowBody", "windowElement", "endMarker", "menubarBlock", 
        "menuBlock", "itemDefinition", "toolbarBlock", "buttonDefinition", 
        "sheetBlock", "tabBlock", "optionBlock", "controlBlock", "unknownContent",
    ];

    public get grammarFileName(): string { return "ClarionData.g4"; }
    public get literalNames(): (string | null)[] { return ClarionData.literalNames; }
    public get symbolicNames(): (string | null)[] { return ClarionData.symbolicNames; }
    public get ruleNames(): string[] { return ClarionData.ruleNames; }
    public get serializedATN(): number[] { return ClarionData._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, ClarionData._ATN, ClarionData.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public globalDataSection(): GlobalDataSectionContext {
        let localContext = new GlobalDataSectionContext(this.context, this.state);
        this.enterRule(localContext, 0, ClarionData.RULE_globalDataSection);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 77;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 48 || _la === 62) {
                {
                {
                this.state = 74;
                this.globalEntry();
                }
                }
                this.state = 79;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
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
    public globalEntry(): GlobalEntryContext {
        let localContext = new GlobalEntryContext(this.context, this.state);
        this.enterRule(localContext, 2, ClarionData.RULE_globalEntry);
        try {
            this.state = 87;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 1, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 80;
                this.includeDirective();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 81;
                this.equateDefinition();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 82;
                this.windowDefinition();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 83;
                this.globalVariable();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 84;
                this.groupBlock();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 85;
                this.queueBlock();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 86;
                this.classDeclaration();
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
    public includeDirective(): IncludeDirectiveContext {
        let localContext = new IncludeDirectiveContext(this.context, this.state);
        this.enterRule(localContext, 4, ClarionData.RULE_includeDirective);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 89;
            this.match(ClarionData.INCLUDE);
            this.state = 90;
            this.match(ClarionData.LPAREN);
            this.state = 91;
            this.match(ClarionData.STRING);
            this.state = 92;
            this.match(ClarionData.RPAREN);
            this.state = 95;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76) {
                {
                this.state = 93;
                this.match(ClarionData.COMMA);
                this.state = 94;
                this.match(ClarionData.ONCE);
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
    public equateDefinition(): EquateDefinitionContext {
        let localContext = new EquateDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 6, ClarionData.RULE_equateDefinition);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 97;
            this.match(ClarionData.ID);
            this.state = 98;
            this.match(ClarionData.EQUATE);
            this.state = 99;
            this.match(ClarionData.LPAREN);
            this.state = 100;
            this.match(ClarionData.STRING);
            this.state = 101;
            this.match(ClarionData.RPAREN);
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
    public globalVariable(): GlobalVariableContext {
        let localContext = new GlobalVariableContext(this.context, this.state);
        this.enterRule(localContext, 8, ClarionData.RULE_globalVariable);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 103;
            this.match(ClarionData.ID);
            this.state = 104;
            this.fieldReference();
            this.state = 109;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 105;
                this.match(ClarionData.LPAREN);
                this.state = 106;
                this.argumentList();
                this.state = 107;
                this.match(ClarionData.RPAREN);
                }
            }

            this.state = 115;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 111;
                this.match(ClarionData.COMMA);
                this.state = 112;
                this.match(ClarionData.ID);
                }
                }
                this.state = 117;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
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
    public fieldReference(): FieldReferenceContext {
        let localContext = new FieldReferenceContext(this.context, this.state);
        this.enterRule(localContext, 10, ClarionData.RULE_fieldReference);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 119;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 86) {
                {
                this.state = 118;
                this.match(ClarionData.AMPERSAND);
                }
            }

            this.state = 121;
            this.fieldType();
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
    public groupBlock(): GroupBlockContext {
        let localContext = new GroupBlockContext(this.context, this.state);
        this.enterRule(localContext, 12, ClarionData.RULE_groupBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 123;
            this.match(ClarionData.ID);
            this.state = 124;
            this.match(ClarionData.GROUP);
            this.state = 128;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 125;
                this.match(ClarionData.LPAREN);
                this.state = 126;
                this.match(ClarionData.ID);
                this.state = 127;
                this.match(ClarionData.RPAREN);
                }
            }

            this.state = 132;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 7, this.context) ) {
            case 1:
                {
                this.state = 130;
                this.fieldList();
                }
                break;
            case 2:
                // tslint:disable-next-line:no-empty
                {
                }
                break;
            }
            this.state = 134;
            this.match(ClarionData.END);
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
    public queueBlock(): QueueBlockContext {
        let localContext = new QueueBlockContext(this.context, this.state);
        this.enterRule(localContext, 14, ClarionData.RULE_queueBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 136;
            this.match(ClarionData.ID);
            this.state = 137;
            this.match(ClarionData.QUEUE);
            this.state = 141;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 138;
                this.match(ClarionData.LPAREN);
                this.state = 139;
                this.match(ClarionData.ID);
                this.state = 140;
                this.match(ClarionData.RPAREN);
                }
            }

            this.state = 143;
            this.fieldList();
            this.state = 144;
            this.match(ClarionData.END);
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
    public fieldList(): FieldListContext {
        let localContext = new FieldListContext(this.context, this.state);
        this.enterRule(localContext, 16, ClarionData.RULE_fieldList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 149;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 62) {
                {
                {
                this.state = 146;
                this.fieldDefinition();
                }
                }
                this.state = 151;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
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
    public fieldDefinition(): FieldDefinitionContext {
        let localContext = new FieldDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 18, ClarionData.RULE_fieldDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 152;
            this.match(ClarionData.ID);
            this.state = 153;
            this.fieldType();
            this.state = 158;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 154;
                this.match(ClarionData.COMMA);
                this.state = 155;
                this.fieldOptions();
                }
                }
                this.state = 160;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
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
    public fieldType(): FieldTypeContext {
        let localContext = new FieldTypeContext(this.context, this.state);
        this.enterRule(localContext, 20, ClarionData.RULE_fieldType);
        let _la: number;
        try {
            this.state = 170;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 12, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 161;
                this.match(ClarionData.ID);
                this.state = 162;
                this.match(ClarionData.LPAREN);
                this.state = 163;
                this.match(ClarionData.NUMERIC);
                this.state = 166;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 76) {
                    {
                    this.state = 164;
                    this.match(ClarionData.COMMA);
                    this.state = 165;
                    this.match(ClarionData.NUMERIC);
                    }
                }

                this.state = 168;
                this.match(ClarionData.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 169;
                this.match(ClarionData.ID);
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
    public fieldOptions(): FieldOptionsContext {
        let localContext = new FieldOptionsContext(this.context, this.state);
        this.enterRule(localContext, 22, ClarionData.RULE_fieldOptions);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 172;
            this.match(ClarionData.ID);
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
        this.enterRule(localContext, 24, ClarionData.RULE_argumentList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 174;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 62)) & ~0x1F) === 0 && ((1 << (_la - 62)) & 7) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 179;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 175;
                this.match(ClarionData.COMMA);
                this.state = 176;
                _la = this.tokenStream.LA(1);
                if(!(((((_la - 62)) & ~0x1F) === 0 && ((1 << (_la - 62)) & 7) !== 0))) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
                }
                this.state = 181;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
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
    public classDeclaration(): ClassDeclarationContext {
        let localContext = new ClassDeclarationContext(this.context, this.state);
        this.enterRule(localContext, 26, ClarionData.RULE_classDeclaration);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 182;
            this.match(ClarionData.ID);
            this.state = 183;
            this.match(ClarionData.CLASS);
            this.state = 187;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 184;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 189;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
            }
            this.state = 190;
            this.match(ClarionData.END);
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
        this.enterRule(localContext, 28, ClarionData.RULE_returnType);
        try {
            this.state = 203;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 15, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 192;
                this.match(ClarionData.ID);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 193;
                this.match(ClarionData.ID);
                this.state = 194;
                this.match(ClarionData.LPAREN);
                this.state = 195;
                this.match(ClarionData.NUMERIC);
                this.state = 196;
                this.match(ClarionData.RPAREN);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 197;
                this.match(ClarionData.ID);
                this.state = 198;
                this.match(ClarionData.LPAREN);
                this.state = 199;
                this.match(ClarionData.NUMERIC);
                this.state = 200;
                this.match(ClarionData.COMMA);
                this.state = 201;
                this.match(ClarionData.NUMERIC);
                this.state = 202;
                this.match(ClarionData.RPAREN);
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
    public procedureAttribute(): ProcedureAttributeContext {
        let localContext = new ProcedureAttributeContext(this.context, this.state);
        this.enterRule(localContext, 30, ClarionData.RULE_procedureAttribute);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 205;
            this.match(ClarionData.ID);
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
    public declarationParameterList(): DeclarationParameterListContext {
        let localContext = new DeclarationParameterListContext(this.context, this.state);
        this.enterRule(localContext, 32, ClarionData.RULE_declarationParameterList);
        try {
            this.state = 213;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 16, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 207;
                this.match(ClarionData.LPAREN);
                this.state = 208;
                this.match(ClarionData.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 209;
                this.match(ClarionData.LPAREN);
                this.state = 210;
                this.declarationParameterListNonEmpty();
                this.state = 211;
                this.match(ClarionData.RPAREN);
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
    public declarationParameterListNonEmpty(): DeclarationParameterListNonEmptyContext {
        let localContext = new DeclarationParameterListNonEmptyContext(this.context, this.state);
        this.enterRule(localContext, 34, ClarionData.RULE_declarationParameterListNonEmpty);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 215;
            this.declarationParameter();
            this.state = 220;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 216;
                this.match(ClarionData.COMMA);
                this.state = 217;
                this.declarationParameter();
                }
                }
                this.state = 222;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
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
    public declarationParameter(): DeclarationParameterContext {
        let localContext = new DeclarationParameterContext(this.context, this.state);
        this.enterRule(localContext, 36, ClarionData.RULE_declarationParameter);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 223;
            this.match(ClarionData.ID);
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
    public ignoredAttribute(): IgnoredAttributeContext {
        let localContext = new IgnoredAttributeContext(this.context, this.state);
        this.enterRule(localContext, 38, ClarionData.RULE_ignoredAttribute);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 225;
            this.attributeName();
            this.state = 230;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 18, this.context) ) {
            case 1:
                {
                this.state = 226;
                this.match(ClarionData.LPAREN);
                this.state = 227;
                this.ignoredAttributeContent();
                this.state = 228;
                this.match(ClarionData.RPAREN);
                }
                break;
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
    public ignoredAttributeContent(): IgnoredAttributeContentContext {
        let localContext = new IgnoredAttributeContentContext(this.context, this.state);
        this.enterRule(localContext, 40, ClarionData.RULE_ignoredAttributeContent);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 235;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 19, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 232;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 237;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 19, this.context);
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
    public attributeName(): AttributeNameContext {
        let localContext = new AttributeNameContext(this.context, this.state);
        this.enterRule(localContext, 42, ClarionData.RULE_attributeName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 238;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 14)) & ~0x1F) === 0 && ((1 << (_la - 14)) & 462847) !== 0) || _la === 62 || _la === 78)) {
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
    public windowDefinition(): WindowDefinitionContext {
        let localContext = new WindowDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 44, ClarionData.RULE_windowDefinition);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 240;
            this.match(ClarionData.ID);
            this.state = 241;
            this.windowType();
            this.state = 242;
            this.match(ClarionData.LPAREN);
            this.state = 243;
            this.match(ClarionData.STRING);
            this.state = 244;
            this.match(ClarionData.RPAREN);
            this.state = 249;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 20, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 245;
                    this.match(ClarionData.COMMA);
                    this.state = 246;
                    this.ignoredAttribute();
                    }
                    }
                }
                this.state = 251;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 20, this.context);
            }
            this.state = 255;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 21, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 252;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 69 || _la === 76)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                    }
                }
                this.state = 257;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 21, this.context);
            }
            this.state = 258;
            this.windowBody();
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
    public windowType(): WindowTypeContext {
        let localContext = new WindowTypeContext(this.context, this.state);
        this.enterRule(localContext, 46, ClarionData.RULE_windowType);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 260;
            _la = this.tokenStream.LA(1);
            if(!(_la === 2 || _la === 3)) {
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
    public windowBody(): WindowBodyContext {
        let localContext = new WindowBodyContext(this.context, this.state);
        this.enterRule(localContext, 48, ClarionData.RULE_windowBody);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 265;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 22, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 262;
                    this.match(ClarionData.LINEBREAK);
                    }
                    }
                }
                this.state = 267;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 22, this.context);
            }
            this.state = 277;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 26 || _la === 27 || ((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 66053) !== 0)) {
                {
                {
                this.state = 268;
                this.windowElement();
                this.state = 272;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 23, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 269;
                        this.match(ClarionData.LINEBREAK);
                        }
                        }
                    }
                    this.state = 274;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 23, this.context);
                }
                }
                }
                this.state = 279;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 280;
            this.endMarker();
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
    public windowElement(): WindowElementContext {
        let localContext = new WindowElementContext(this.context, this.state);
        this.enterRule(localContext, 50, ClarionData.RULE_windowElement);
        try {
            this.state = 288;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ClarionData.MENUBAR:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 282;
                this.menubarBlock();
                }
                break;
            case ClarionData.TOOLBAR:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 283;
                this.toolbarBlock();
                }
                break;
            case ClarionData.SHEET:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 284;
                this.sheetBlock();
                }
                break;
            case ClarionData.ID:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 285;
                this.groupBlock();
                }
                break;
            case ClarionData.OPTION:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 286;
                this.optionBlock();
                }
                break;
            case ClarionData.LINEBREAK:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 287;
                this.match(ClarionData.LINEBREAK);
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
    public endMarker(): EndMarkerContext {
        let localContext = new EndMarkerContext(this.context, this.state);
        this.enterRule(localContext, 52, ClarionData.RULE_endMarker);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 290;
            _la = this.tokenStream.LA(1);
            if(!(_la === 1 || _la === 13)) {
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
    public menubarBlock(): MenubarBlockContext {
        let localContext = new MenubarBlockContext(this.context, this.state);
        this.enterRule(localContext, 54, ClarionData.RULE_menubarBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 292;
            this.match(ClarionData.MENUBAR);
            this.state = 297;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 293;
                this.match(ClarionData.COMMA);
                this.state = 294;
                this.match(ClarionData.ID);
                }
                }
                this.state = 299;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 308;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 301;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                do {
                    {
                    {
                    this.state = 300;
                    this.match(ClarionData.LINEBREAK);
                    }
                    }
                    this.state = 303;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                } while (_la === 69);
                this.state = 305;
                this.menuBlock();
                }
                }
                this.state = 310;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 311;
            this.endMarker();
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
    public menuBlock(): MenuBlockContext {
        let localContext = new MenuBlockContext(this.context, this.state);
        this.enterRule(localContext, 56, ClarionData.RULE_menuBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 313;
            this.match(ClarionData.MENU);
            this.state = 318;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 314;
                this.match(ClarionData.COMMA);
                this.state = 315;
                this.match(ClarionData.ID);
                }
                }
                this.state = 320;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 324;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 321;
                this.match(ClarionData.LINEBREAK);
                }
                }
                this.state = 326;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 330;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 33) {
                {
                {
                this.state = 327;
                this.itemDefinition();
                }
                }
                this.state = 332;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 333;
            this.endMarker();
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
    public itemDefinition(): ItemDefinitionContext {
        let localContext = new ItemDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 58, ClarionData.RULE_itemDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 335;
            this.match(ClarionData.ITEM);
            this.state = 339;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 336;
                this.match(ClarionData.LPAREN);
                this.state = 337;
                this.match(ClarionData.STRING);
                this.state = 338;
                this.match(ClarionData.RPAREN);
                }
            }

            this.state = 345;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 341;
                this.match(ClarionData.COMMA);
                this.state = 342;
                this.match(ClarionData.ID);
                }
                }
                this.state = 347;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 351;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 348;
                this.match(ClarionData.LINEBREAK);
                }
                }
                this.state = 353;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
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
    public toolbarBlock(): ToolbarBlockContext {
        let localContext = new ToolbarBlockContext(this.context, this.state);
        this.enterRule(localContext, 60, ClarionData.RULE_toolbarBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 354;
            this.match(ClarionData.TOOLBAR);
            this.state = 359;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 35, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 355;
                    this.match(ClarionData.COMMA);
                    this.state = 356;
                    this.ignoredAttribute();
                    }
                    }
                }
                this.state = 361;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 35, this.context);
            }
            this.state = 365;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 36, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 362;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 69 || _la === 76)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                    }
                }
                this.state = 367;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 36, this.context);
            }
            this.state = 371;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 37, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 368;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 373;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 37, this.context);
            }
            this.state = 374;
            this.endMarker();
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
    public buttonDefinition(): ButtonDefinitionContext {
        let localContext = new ButtonDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 62, ClarionData.RULE_buttonDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 376;
            this.match(ClarionData.BUTTON);
            this.state = 380;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 377;
                this.match(ClarionData.LPAREN);
                this.state = 378;
                this.match(ClarionData.STRING);
                this.state = 379;
                this.match(ClarionData.RPAREN);
                }
            }

            this.state = 386;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 382;
                this.match(ClarionData.COMMA);
                this.state = 383;
                this.match(ClarionData.ID);
                }
                }
                this.state = 388;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 392;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 389;
                this.match(ClarionData.LINEBREAK);
                }
                }
                this.state = 394;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
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
    public sheetBlock(): SheetBlockContext {
        let localContext = new SheetBlockContext(this.context, this.state);
        this.enterRule(localContext, 64, ClarionData.RULE_sheetBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 395;
            this.match(ClarionData.SHEET);
            this.state = 400;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 396;
                this.match(ClarionData.COMMA);
                this.state = 397;
                this.match(ClarionData.ID);
                }
                }
                this.state = 402;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 406;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 403;
                this.match(ClarionData.LINEBREAK);
                }
                }
                this.state = 408;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 412;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 54) {
                {
                {
                this.state = 409;
                this.tabBlock();
                }
                }
                this.state = 414;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 415;
            this.endMarker();
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
    public tabBlock(): TabBlockContext {
        let localContext = new TabBlockContext(this.context, this.state);
        this.enterRule(localContext, 66, ClarionData.RULE_tabBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 417;
            this.match(ClarionData.TAB);
            this.state = 421;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 44, this.context) ) {
            case 1:
                {
                this.state = 418;
                this.match(ClarionData.LPAREN);
                this.state = 419;
                this.match(ClarionData.STRING);
                this.state = 420;
                this.match(ClarionData.RPAREN);
                }
                break;
            }
            this.state = 426;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 45, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 423;
                    this.match(ClarionData.LINEBREAK);
                    }
                    }
                }
                this.state = 428;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 45, this.context);
            }
            this.state = 432;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294959100) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33554431) !== 0)) {
                {
                {
                this.state = 429;
                this.controlBlock();
                }
                }
                this.state = 434;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 435;
            this.endMarker();
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
    public optionBlock(): OptionBlockContext {
        let localContext = new OptionBlockContext(this.context, this.state);
        this.enterRule(localContext, 68, ClarionData.RULE_optionBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 437;
            this.match(ClarionData.OPTION);
            this.state = 441;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 47, this.context) ) {
            case 1:
                {
                this.state = 438;
                this.match(ClarionData.LPAREN);
                this.state = 439;
                this.match(ClarionData.STRING);
                this.state = 440;
                this.match(ClarionData.RPAREN);
                }
                break;
            }
            this.state = 446;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 48, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 443;
                    this.match(ClarionData.LINEBREAK);
                    }
                    }
                }
                this.state = 448;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 48, this.context);
            }
            this.state = 452;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294959100) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33554431) !== 0)) {
                {
                {
                this.state = 449;
                this.controlBlock();
                }
                }
                this.state = 454;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 455;
            this.endMarker();
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
    public controlBlock(): ControlBlockContext {
        let localContext = new ControlBlockContext(this.context, this.state);
        this.enterRule(localContext, 70, ClarionData.RULE_controlBlock);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 459;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 50, this.context) ) {
            case 1:
                {
                this.state = 457;
                this.match(ClarionData.ID);
                }
                break;
            case 2:
                {
                this.state = 458;
                this.unknownContent();
                }
                break;
            }
            this.state = 464;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 51, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 461;
                    this.match(ClarionData.LINEBREAK);
                    }
                    }
                }
                this.state = 466;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 51, this.context);
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
    public unknownContent(): UnknownContentContext {
        let localContext = new UnknownContentContext(this.context, this.state);
        this.enterRule(localContext, 72, ClarionData.RULE_unknownContent);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 467;
            _la = this.tokenStream.LA(1);
            if(_la<=0 || _la === 1 || _la === 13) {
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

    public static readonly _serializedATN: number[] = [
        4,1,88,470,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,
        6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,13,
        2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,20,
        7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,26,
        2,27,7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,32,2,33,
        7,33,2,34,7,34,2,35,7,35,2,36,7,36,1,0,5,0,76,8,0,10,0,12,0,79,9,
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,88,8,1,1,2,1,2,1,2,1,2,1,2,1,2,
        3,2,96,8,2,1,3,1,3,1,3,1,3,1,3,1,3,1,4,1,4,1,4,1,4,1,4,1,4,3,4,110,
        8,4,1,4,1,4,5,4,114,8,4,10,4,12,4,117,9,4,1,5,3,5,120,8,5,1,5,1,
        5,1,6,1,6,1,6,1,6,1,6,3,6,129,8,6,1,6,1,6,3,6,133,8,6,1,6,1,6,1,
        7,1,7,1,7,1,7,1,7,3,7,142,8,7,1,7,1,7,1,7,1,8,5,8,148,8,8,10,8,12,
        8,151,9,8,1,9,1,9,1,9,1,9,5,9,157,8,9,10,9,12,9,160,9,9,1,10,1,10,
        1,10,1,10,1,10,3,10,167,8,10,1,10,1,10,3,10,171,8,10,1,11,1,11,1,
        12,1,12,1,12,5,12,178,8,12,10,12,12,12,181,9,12,1,13,1,13,1,13,5,
        13,186,8,13,10,13,12,13,189,9,13,1,13,1,13,1,14,1,14,1,14,1,14,1,
        14,1,14,1,14,1,14,1,14,1,14,1,14,3,14,204,8,14,1,15,1,15,1,16,1,
        16,1,16,1,16,1,16,1,16,3,16,214,8,16,1,17,1,17,1,17,5,17,219,8,17,
        10,17,12,17,222,9,17,1,18,1,18,1,19,1,19,1,19,1,19,1,19,3,19,231,
        8,19,1,20,5,20,234,8,20,10,20,12,20,237,9,20,1,21,1,21,1,22,1,22,
        1,22,1,22,1,22,1,22,1,22,5,22,248,8,22,10,22,12,22,251,9,22,1,22,
        5,22,254,8,22,10,22,12,22,257,9,22,1,22,1,22,1,23,1,23,1,24,5,24,
        264,8,24,10,24,12,24,267,9,24,1,24,1,24,5,24,271,8,24,10,24,12,24,
        274,9,24,5,24,276,8,24,10,24,12,24,279,9,24,1,24,1,24,1,25,1,25,
        1,25,1,25,1,25,1,25,3,25,289,8,25,1,26,1,26,1,27,1,27,1,27,5,27,
        296,8,27,10,27,12,27,299,9,27,1,27,4,27,302,8,27,11,27,12,27,303,
        1,27,5,27,307,8,27,10,27,12,27,310,9,27,1,27,1,27,1,28,1,28,1,28,
        5,28,317,8,28,10,28,12,28,320,9,28,1,28,5,28,323,8,28,10,28,12,28,
        326,9,28,1,28,5,28,329,8,28,10,28,12,28,332,9,28,1,28,1,28,1,29,
        1,29,1,29,1,29,3,29,340,8,29,1,29,1,29,5,29,344,8,29,10,29,12,29,
        347,9,29,1,29,5,29,350,8,29,10,29,12,29,353,9,29,1,30,1,30,1,30,
        5,30,358,8,30,10,30,12,30,361,9,30,1,30,5,30,364,8,30,10,30,12,30,
        367,9,30,1,30,5,30,370,8,30,10,30,12,30,373,9,30,1,30,1,30,1,31,
        1,31,1,31,1,31,3,31,381,8,31,1,31,1,31,5,31,385,8,31,10,31,12,31,
        388,9,31,1,31,5,31,391,8,31,10,31,12,31,394,9,31,1,32,1,32,1,32,
        5,32,399,8,32,10,32,12,32,402,9,32,1,32,5,32,405,8,32,10,32,12,32,
        408,9,32,1,32,5,32,411,8,32,10,32,12,32,414,9,32,1,32,1,32,1,33,
        1,33,1,33,1,33,3,33,422,8,33,1,33,5,33,425,8,33,10,33,12,33,428,
        9,33,1,33,5,33,431,8,33,10,33,12,33,434,9,33,1,33,1,33,1,34,1,34,
        1,34,1,34,3,34,442,8,34,1,34,5,34,445,8,34,10,34,12,34,448,9,34,
        1,34,5,34,451,8,34,10,34,12,34,454,9,34,1,34,1,34,1,35,1,35,3,35,
        460,8,35,1,35,5,35,463,8,35,10,35,12,35,466,9,35,1,36,1,36,1,36,
        3,187,235,371,0,37,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,
        34,36,38,40,42,44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,0,5,
        1,0,62,64,4,0,14,25,30,32,62,62,78,78,2,0,69,69,76,76,1,0,2,3,2,
        0,1,1,13,13,494,0,77,1,0,0,0,2,87,1,0,0,0,4,89,1,0,0,0,6,97,1,0,
        0,0,8,103,1,0,0,0,10,119,1,0,0,0,12,123,1,0,0,0,14,136,1,0,0,0,16,
        149,1,0,0,0,18,152,1,0,0,0,20,170,1,0,0,0,22,172,1,0,0,0,24,174,
        1,0,0,0,26,182,1,0,0,0,28,203,1,0,0,0,30,205,1,0,0,0,32,213,1,0,
        0,0,34,215,1,0,0,0,36,223,1,0,0,0,38,225,1,0,0,0,40,235,1,0,0,0,
        42,238,1,0,0,0,44,240,1,0,0,0,46,260,1,0,0,0,48,265,1,0,0,0,50,288,
        1,0,0,0,52,290,1,0,0,0,54,292,1,0,0,0,56,313,1,0,0,0,58,335,1,0,
        0,0,60,354,1,0,0,0,62,376,1,0,0,0,64,395,1,0,0,0,66,417,1,0,0,0,
        68,437,1,0,0,0,70,459,1,0,0,0,72,467,1,0,0,0,74,76,3,2,1,0,75,74,
        1,0,0,0,76,79,1,0,0,0,77,75,1,0,0,0,77,78,1,0,0,0,78,1,1,0,0,0,79,
        77,1,0,0,0,80,88,3,4,2,0,81,88,3,6,3,0,82,88,3,44,22,0,83,88,3,8,
        4,0,84,88,3,12,6,0,85,88,3,14,7,0,86,88,3,26,13,0,87,80,1,0,0,0,
        87,81,1,0,0,0,87,82,1,0,0,0,87,83,1,0,0,0,87,84,1,0,0,0,87,85,1,
        0,0,0,87,86,1,0,0,0,88,3,1,0,0,0,89,90,5,48,0,0,90,91,5,80,0,0,91,
        92,5,63,0,0,92,95,5,81,0,0,93,94,5,76,0,0,94,96,5,49,0,0,95,93,1,
        0,0,0,95,96,1,0,0,0,96,5,1,0,0,0,97,98,5,62,0,0,98,99,5,47,0,0,99,
        100,5,80,0,0,100,101,5,63,0,0,101,102,5,81,0,0,102,7,1,0,0,0,103,
        104,5,62,0,0,104,109,3,10,5,0,105,106,5,80,0,0,106,107,3,24,12,0,
        107,108,5,81,0,0,108,110,1,0,0,0,109,105,1,0,0,0,109,110,1,0,0,0,
        110,115,1,0,0,0,111,112,5,76,0,0,112,114,5,62,0,0,113,111,1,0,0,
        0,114,117,1,0,0,0,115,113,1,0,0,0,115,116,1,0,0,0,116,9,1,0,0,0,
        117,115,1,0,0,0,118,120,5,86,0,0,119,118,1,0,0,0,119,120,1,0,0,0,
        120,121,1,0,0,0,121,122,3,20,10,0,122,11,1,0,0,0,123,124,5,62,0,
        0,124,128,5,45,0,0,125,126,5,80,0,0,126,127,5,62,0,0,127,129,5,81,
        0,0,128,125,1,0,0,0,128,129,1,0,0,0,129,132,1,0,0,0,130,133,3,16,
        8,0,131,133,1,0,0,0,132,130,1,0,0,0,132,131,1,0,0,0,133,134,1,0,
        0,0,134,135,5,13,0,0,135,13,1,0,0,0,136,137,5,62,0,0,137,141,5,46,
        0,0,138,139,5,80,0,0,139,140,5,62,0,0,140,142,5,81,0,0,141,138,1,
        0,0,0,141,142,1,0,0,0,142,143,1,0,0,0,143,144,3,16,8,0,144,145,5,
        13,0,0,145,15,1,0,0,0,146,148,3,18,9,0,147,146,1,0,0,0,148,151,1,
        0,0,0,149,147,1,0,0,0,149,150,1,0,0,0,150,17,1,0,0,0,151,149,1,0,
        0,0,152,153,5,62,0,0,153,158,3,20,10,0,154,155,5,76,0,0,155,157,
        3,22,11,0,156,154,1,0,0,0,157,160,1,0,0,0,158,156,1,0,0,0,158,159,
        1,0,0,0,159,19,1,0,0,0,160,158,1,0,0,0,161,162,5,62,0,0,162,163,
        5,80,0,0,163,166,5,64,0,0,164,165,5,76,0,0,165,167,5,64,0,0,166,
        164,1,0,0,0,166,167,1,0,0,0,167,168,1,0,0,0,168,171,5,81,0,0,169,
        171,5,62,0,0,170,161,1,0,0,0,170,169,1,0,0,0,171,21,1,0,0,0,172,
        173,5,62,0,0,173,23,1,0,0,0,174,179,7,0,0,0,175,176,5,76,0,0,176,
        178,7,0,0,0,177,175,1,0,0,0,178,181,1,0,0,0,179,177,1,0,0,0,179,
        180,1,0,0,0,180,25,1,0,0,0,181,179,1,0,0,0,182,183,5,62,0,0,183,
        187,5,5,0,0,184,186,9,0,0,0,185,184,1,0,0,0,186,189,1,0,0,0,187,
        188,1,0,0,0,187,185,1,0,0,0,188,190,1,0,0,0,189,187,1,0,0,0,190,
        191,5,13,0,0,191,27,1,0,0,0,192,204,5,62,0,0,193,194,5,62,0,0,194,
        195,5,80,0,0,195,196,5,64,0,0,196,204,5,81,0,0,197,198,5,62,0,0,
        198,199,5,80,0,0,199,200,5,64,0,0,200,201,5,76,0,0,201,202,5,64,
        0,0,202,204,5,81,0,0,203,192,1,0,0,0,203,193,1,0,0,0,203,197,1,0,
        0,0,204,29,1,0,0,0,205,206,5,62,0,0,206,31,1,0,0,0,207,208,5,80,
        0,0,208,214,5,81,0,0,209,210,5,80,0,0,210,211,3,34,17,0,211,212,
        5,81,0,0,212,214,1,0,0,0,213,207,1,0,0,0,213,209,1,0,0,0,214,33,
        1,0,0,0,215,220,3,36,18,0,216,217,5,76,0,0,217,219,3,36,18,0,218,
        216,1,0,0,0,219,222,1,0,0,0,220,218,1,0,0,0,220,221,1,0,0,0,221,
        35,1,0,0,0,222,220,1,0,0,0,223,224,5,62,0,0,224,37,1,0,0,0,225,230,
        3,42,21,0,226,227,5,80,0,0,227,228,3,40,20,0,228,229,5,81,0,0,229,
        231,1,0,0,0,230,226,1,0,0,0,230,231,1,0,0,0,231,39,1,0,0,0,232,234,
        9,0,0,0,233,232,1,0,0,0,234,237,1,0,0,0,235,236,1,0,0,0,235,233,
        1,0,0,0,236,41,1,0,0,0,237,235,1,0,0,0,238,239,7,1,0,0,239,43,1,
        0,0,0,240,241,5,62,0,0,241,242,3,46,23,0,242,243,5,80,0,0,243,244,
        5,63,0,0,244,249,5,81,0,0,245,246,5,76,0,0,246,248,3,38,19,0,247,
        245,1,0,0,0,248,251,1,0,0,0,249,247,1,0,0,0,249,250,1,0,0,0,250,
        255,1,0,0,0,251,249,1,0,0,0,252,254,7,2,0,0,253,252,1,0,0,0,254,
        257,1,0,0,0,255,253,1,0,0,0,255,256,1,0,0,0,256,258,1,0,0,0,257,
        255,1,0,0,0,258,259,3,48,24,0,259,45,1,0,0,0,260,261,7,3,0,0,261,
        47,1,0,0,0,262,264,5,69,0,0,263,262,1,0,0,0,264,267,1,0,0,0,265,
        263,1,0,0,0,265,266,1,0,0,0,266,277,1,0,0,0,267,265,1,0,0,0,268,
        272,3,50,25,0,269,271,5,69,0,0,270,269,1,0,0,0,271,274,1,0,0,0,272,
        270,1,0,0,0,272,273,1,0,0,0,273,276,1,0,0,0,274,272,1,0,0,0,275,
        268,1,0,0,0,276,279,1,0,0,0,277,275,1,0,0,0,277,278,1,0,0,0,278,
        280,1,0,0,0,279,277,1,0,0,0,280,281,3,52,26,0,281,49,1,0,0,0,282,
        289,3,54,27,0,283,289,3,60,30,0,284,289,3,64,32,0,285,289,3,12,6,
        0,286,289,3,68,34,0,287,289,5,69,0,0,288,282,1,0,0,0,288,283,1,0,
        0,0,288,284,1,0,0,0,288,285,1,0,0,0,288,286,1,0,0,0,288,287,1,0,
        0,0,289,51,1,0,0,0,290,291,7,4,0,0,291,53,1,0,0,0,292,297,5,26,0,
        0,293,294,5,76,0,0,294,296,5,62,0,0,295,293,1,0,0,0,296,299,1,0,
        0,0,297,295,1,0,0,0,297,298,1,0,0,0,298,308,1,0,0,0,299,297,1,0,
        0,0,300,302,5,69,0,0,301,300,1,0,0,0,302,303,1,0,0,0,303,301,1,0,
        0,0,303,304,1,0,0,0,304,305,1,0,0,0,305,307,3,56,28,0,306,301,1,
        0,0,0,307,310,1,0,0,0,308,306,1,0,0,0,308,309,1,0,0,0,309,311,1,
        0,0,0,310,308,1,0,0,0,311,312,3,52,26,0,312,55,1,0,0,0,313,318,5,
        29,0,0,314,315,5,76,0,0,315,317,5,62,0,0,316,314,1,0,0,0,317,320,
        1,0,0,0,318,316,1,0,0,0,318,319,1,0,0,0,319,324,1,0,0,0,320,318,
        1,0,0,0,321,323,5,69,0,0,322,321,1,0,0,0,323,326,1,0,0,0,324,322,
        1,0,0,0,324,325,1,0,0,0,325,330,1,0,0,0,326,324,1,0,0,0,327,329,
        3,58,29,0,328,327,1,0,0,0,329,332,1,0,0,0,330,328,1,0,0,0,330,331,
        1,0,0,0,331,333,1,0,0,0,332,330,1,0,0,0,333,334,3,52,26,0,334,57,
        1,0,0,0,335,339,5,33,0,0,336,337,5,80,0,0,337,338,5,63,0,0,338,340,
        5,81,0,0,339,336,1,0,0,0,339,340,1,0,0,0,340,345,1,0,0,0,341,342,
        5,76,0,0,342,344,5,62,0,0,343,341,1,0,0,0,344,347,1,0,0,0,345,343,
        1,0,0,0,345,346,1,0,0,0,346,351,1,0,0,0,347,345,1,0,0,0,348,350,
        5,69,0,0,349,348,1,0,0,0,350,353,1,0,0,0,351,349,1,0,0,0,351,352,
        1,0,0,0,352,59,1,0,0,0,353,351,1,0,0,0,354,359,5,27,0,0,355,356,
        5,76,0,0,356,358,3,38,19,0,357,355,1,0,0,0,358,361,1,0,0,0,359,357,
        1,0,0,0,359,360,1,0,0,0,360,365,1,0,0,0,361,359,1,0,0,0,362,364,
        7,2,0,0,363,362,1,0,0,0,364,367,1,0,0,0,365,363,1,0,0,0,365,366,
        1,0,0,0,366,371,1,0,0,0,367,365,1,0,0,0,368,370,9,0,0,0,369,368,
        1,0,0,0,370,373,1,0,0,0,371,372,1,0,0,0,371,369,1,0,0,0,372,374,
        1,0,0,0,373,371,1,0,0,0,374,375,3,52,26,0,375,61,1,0,0,0,376,380,
        5,28,0,0,377,378,5,80,0,0,378,379,5,63,0,0,379,381,5,81,0,0,380,
        377,1,0,0,0,380,381,1,0,0,0,381,386,1,0,0,0,382,383,5,76,0,0,383,
        385,5,62,0,0,384,382,1,0,0,0,385,388,1,0,0,0,386,384,1,0,0,0,386,
        387,1,0,0,0,387,392,1,0,0,0,388,386,1,0,0,0,389,391,5,69,0,0,390,
        389,1,0,0,0,391,394,1,0,0,0,392,390,1,0,0,0,392,393,1,0,0,0,393,
        63,1,0,0,0,394,392,1,0,0,0,395,400,5,53,0,0,396,397,5,76,0,0,397,
        399,5,62,0,0,398,396,1,0,0,0,399,402,1,0,0,0,400,398,1,0,0,0,400,
        401,1,0,0,0,401,406,1,0,0,0,402,400,1,0,0,0,403,405,5,69,0,0,404,
        403,1,0,0,0,405,408,1,0,0,0,406,404,1,0,0,0,406,407,1,0,0,0,407,
        412,1,0,0,0,408,406,1,0,0,0,409,411,3,66,33,0,410,409,1,0,0,0,411,
        414,1,0,0,0,412,410,1,0,0,0,412,413,1,0,0,0,413,415,1,0,0,0,414,
        412,1,0,0,0,415,416,3,52,26,0,416,65,1,0,0,0,417,421,5,54,0,0,418,
        419,5,80,0,0,419,420,5,63,0,0,420,422,5,81,0,0,421,418,1,0,0,0,421,
        422,1,0,0,0,422,426,1,0,0,0,423,425,5,69,0,0,424,423,1,0,0,0,425,
        428,1,0,0,0,426,424,1,0,0,0,426,427,1,0,0,0,427,432,1,0,0,0,428,
        426,1,0,0,0,429,431,3,70,35,0,430,429,1,0,0,0,431,434,1,0,0,0,432,
        430,1,0,0,0,432,433,1,0,0,0,433,435,1,0,0,0,434,432,1,0,0,0,435,
        436,3,52,26,0,436,67,1,0,0,0,437,441,5,55,0,0,438,439,5,80,0,0,439,
        440,5,63,0,0,440,442,5,81,0,0,441,438,1,0,0,0,441,442,1,0,0,0,442,
        446,1,0,0,0,443,445,5,69,0,0,444,443,1,0,0,0,445,448,1,0,0,0,446,
        444,1,0,0,0,446,447,1,0,0,0,447,452,1,0,0,0,448,446,1,0,0,0,449,
        451,3,70,35,0,450,449,1,0,0,0,451,454,1,0,0,0,452,450,1,0,0,0,452,
        453,1,0,0,0,453,455,1,0,0,0,454,452,1,0,0,0,455,456,3,52,26,0,456,
        69,1,0,0,0,457,460,5,62,0,0,458,460,3,72,36,0,459,457,1,0,0,0,459,
        458,1,0,0,0,460,464,1,0,0,0,461,463,5,69,0,0,462,461,1,0,0,0,463,
        466,1,0,0,0,464,462,1,0,0,0,464,465,1,0,0,0,465,71,1,0,0,0,466,464,
        1,0,0,0,467,468,8,4,0,0,468,73,1,0,0,0,52,77,87,95,109,115,119,128,
        132,141,149,158,166,170,179,187,203,213,220,230,235,249,255,265,
        272,277,288,297,303,308,318,324,330,339,345,351,359,365,371,380,
        386,392,400,406,412,421,426,432,441,446,452,459,464
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!ClarionData.__ATN) {
            ClarionData.__ATN = new antlr.ATNDeserializer().deserialize(ClarionData._serializedATN);
        }

        return ClarionData.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(ClarionData.literalNames, ClarionData.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return ClarionData.vocabulary;
    }

    private static readonly decisionsToDFA = ClarionData._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class GlobalDataSectionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public globalEntry(): GlobalEntryContext[];
    public globalEntry(i: number): GlobalEntryContext | null;
    public globalEntry(i?: number): GlobalEntryContext[] | GlobalEntryContext | null {
        if (i === undefined) {
            return this.getRuleContexts(GlobalEntryContext);
        }

        return this.getRuleContext(i, GlobalEntryContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_globalDataSection;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterGlobalDataSection) {
             listener.enterGlobalDataSection(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitGlobalDataSection) {
             listener.exitGlobalDataSection(this);
        }
    }
}


export class GlobalEntryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public includeDirective(): IncludeDirectiveContext | null {
        return this.getRuleContext(0, IncludeDirectiveContext);
    }
    public equateDefinition(): EquateDefinitionContext | null {
        return this.getRuleContext(0, EquateDefinitionContext);
    }
    public windowDefinition(): WindowDefinitionContext | null {
        return this.getRuleContext(0, WindowDefinitionContext);
    }
    public globalVariable(): GlobalVariableContext | null {
        return this.getRuleContext(0, GlobalVariableContext);
    }
    public groupBlock(): GroupBlockContext | null {
        return this.getRuleContext(0, GroupBlockContext);
    }
    public queueBlock(): QueueBlockContext | null {
        return this.getRuleContext(0, QueueBlockContext);
    }
    public classDeclaration(): ClassDeclarationContext | null {
        return this.getRuleContext(0, ClassDeclarationContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_globalEntry;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterGlobalEntry) {
             listener.enterGlobalEntry(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitGlobalEntry) {
             listener.exitGlobalEntry(this);
        }
    }
}


export class IncludeDirectiveContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public INCLUDE(): antlr.TerminalNode {
        return this.getToken(ClarionData.INCLUDE, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionData.LPAREN, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionData.STRING, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionData.RPAREN, 0)!;
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.COMMA, 0);
    }
    public ONCE(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.ONCE, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_includeDirective;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterIncludeDirective) {
             listener.enterIncludeDirective(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitIncludeDirective) {
             listener.exitIncludeDirective(this);
        }
    }
}


export class EquateDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public EQUATE(): antlr.TerminalNode {
        return this.getToken(ClarionData.EQUATE, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionData.LPAREN, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionData.STRING, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionData.RPAREN, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_equateDefinition;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterEquateDefinition) {
             listener.enterEquateDefinition(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitEquateDefinition) {
             listener.exitEquateDefinition(this);
        }
    }
}


export class GlobalVariableContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public fieldReference(): FieldReferenceContext {
        return this.getRuleContext(0, FieldReferenceContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public argumentList(): ArgumentListContext | null {
        return this.getRuleContext(0, ArgumentListContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_globalVariable;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterGlobalVariable) {
             listener.enterGlobalVariable(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitGlobalVariable) {
             listener.exitGlobalVariable(this);
        }
    }
}


export class FieldReferenceContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public fieldType(): FieldTypeContext {
        return this.getRuleContext(0, FieldTypeContext)!;
    }
    public AMPERSAND(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.AMPERSAND, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_fieldReference;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterFieldReference) {
             listener.enterFieldReference(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitFieldReference) {
             listener.exitFieldReference(this);
        }
    }
}


export class GroupBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public GROUP(): antlr.TerminalNode {
        return this.getToken(ClarionData.GROUP, 0)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionData.END, 0)!;
    }
    public fieldList(): FieldListContext | null {
        return this.getRuleContext(0, FieldListContext);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_groupBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterGroupBlock) {
             listener.enterGroupBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitGroupBlock) {
             listener.exitGroupBlock(this);
        }
    }
}


export class QueueBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public QUEUE(): antlr.TerminalNode {
        return this.getToken(ClarionData.QUEUE, 0)!;
    }
    public fieldList(): FieldListContext {
        return this.getRuleContext(0, FieldListContext)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionData.END, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_queueBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterQueueBlock) {
             listener.enterQueueBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitQueueBlock) {
             listener.exitQueueBlock(this);
        }
    }
}


export class FieldListContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public fieldDefinition(): FieldDefinitionContext[];
    public fieldDefinition(i: number): FieldDefinitionContext | null;
    public fieldDefinition(i?: number): FieldDefinitionContext[] | FieldDefinitionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(FieldDefinitionContext);
        }

        return this.getRuleContext(i, FieldDefinitionContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_fieldList;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterFieldList) {
             listener.enterFieldList(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitFieldList) {
             listener.exitFieldList(this);
        }
    }
}


export class FieldDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public fieldType(): FieldTypeContext {
        return this.getRuleContext(0, FieldTypeContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public fieldOptions(): FieldOptionsContext[];
    public fieldOptions(i: number): FieldOptionsContext | null;
    public fieldOptions(i?: number): FieldOptionsContext[] | FieldOptionsContext | null {
        if (i === undefined) {
            return this.getRuleContexts(FieldOptionsContext);
        }

        return this.getRuleContext(i, FieldOptionsContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_fieldDefinition;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterFieldDefinition) {
             listener.enterFieldDefinition(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitFieldDefinition) {
             listener.exitFieldDefinition(this);
        }
    }
}


export class FieldTypeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public NUMERIC(): antlr.TerminalNode[];
    public NUMERIC(i: number): antlr.TerminalNode | null;
    public NUMERIC(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.NUMERIC);
    	} else {
    		return this.getToken(ClarionData.NUMERIC, i);
    	}
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.COMMA, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_fieldType;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterFieldType) {
             listener.enterFieldType(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitFieldType) {
             listener.exitFieldType(this);
        }
    }
}


export class FieldOptionsContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_fieldOptions;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterFieldOptions) {
             listener.enterFieldOptions(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitFieldOptions) {
             listener.exitFieldOptions(this);
        }
    }
}


export class ArgumentListContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public NUMERIC(): antlr.TerminalNode[];
    public NUMERIC(i: number): antlr.TerminalNode | null;
    public NUMERIC(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.NUMERIC);
    	} else {
    		return this.getToken(ClarionData.NUMERIC, i);
    	}
    }
    public STRING(): antlr.TerminalNode[];
    public STRING(i: number): antlr.TerminalNode | null;
    public STRING(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.STRING);
    	} else {
    		return this.getToken(ClarionData.STRING, i);
    	}
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_argumentList;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterArgumentList) {
             listener.enterArgumentList(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitArgumentList) {
             listener.exitArgumentList(this);
        }
    }
}


export class ClassDeclarationContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public CLASS(): antlr.TerminalNode {
        return this.getToken(ClarionData.CLASS, 0)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionData.END, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_classDeclaration;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterClassDeclaration) {
             listener.enterClassDeclaration(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitClassDeclaration) {
             listener.exitClassDeclaration(this);
        }
    }
}


export class ReturnTypeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public NUMERIC(): antlr.TerminalNode[];
    public NUMERIC(i: number): antlr.TerminalNode | null;
    public NUMERIC(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.NUMERIC);
    	} else {
    		return this.getToken(ClarionData.NUMERIC, i);
    	}
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.COMMA, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_returnType;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterReturnType) {
             listener.enterReturnType(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitReturnType) {
             listener.exitReturnType(this);
        }
    }
}


export class ProcedureAttributeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_procedureAttribute;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterProcedureAttribute) {
             listener.enterProcedureAttribute(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitProcedureAttribute) {
             listener.exitProcedureAttribute(this);
        }
    }
}


export class DeclarationParameterListContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionData.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionData.RPAREN, 0)!;
    }
    public declarationParameterListNonEmpty(): DeclarationParameterListNonEmptyContext | null {
        return this.getRuleContext(0, DeclarationParameterListNonEmptyContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_declarationParameterList;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterDeclarationParameterList) {
             listener.enterDeclarationParameterList(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitDeclarationParameterList) {
             listener.exitDeclarationParameterList(this);
        }
    }
}


export class DeclarationParameterListNonEmptyContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public declarationParameter(): DeclarationParameterContext[];
    public declarationParameter(i: number): DeclarationParameterContext | null;
    public declarationParameter(i?: number): DeclarationParameterContext[] | DeclarationParameterContext | null {
        if (i === undefined) {
            return this.getRuleContexts(DeclarationParameterContext);
        }

        return this.getRuleContext(i, DeclarationParameterContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_declarationParameterListNonEmpty;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterDeclarationParameterListNonEmpty) {
             listener.enterDeclarationParameterListNonEmpty(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitDeclarationParameterListNonEmpty) {
             listener.exitDeclarationParameterListNonEmpty(this);
        }
    }
}


export class DeclarationParameterContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_declarationParameter;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterDeclarationParameter) {
             listener.enterDeclarationParameter(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitDeclarationParameter) {
             listener.exitDeclarationParameter(this);
        }
    }
}


export class IgnoredAttributeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public attributeName(): AttributeNameContext {
        return this.getRuleContext(0, AttributeNameContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public ignoredAttributeContent(): IgnoredAttributeContentContext | null {
        return this.getRuleContext(0, IgnoredAttributeContentContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_ignoredAttribute;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterIgnoredAttribute) {
             listener.enterIgnoredAttribute(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitIgnoredAttribute) {
             listener.exitIgnoredAttribute(this);
        }
    }
}


export class IgnoredAttributeContentContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_ignoredAttributeContent;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterIgnoredAttributeContent) {
             listener.enterIgnoredAttributeContent(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitIgnoredAttributeContent) {
             listener.exitIgnoredAttributeContent(this);
        }
    }
}


export class AttributeNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.ID, 0);
    }
    public FONT(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.FONT, 0);
    }
    public ICON(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.ICON, 0);
    }
    public AT(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.AT, 0);
    }
    public STATUS(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.STATUS, 0);
    }
    public CENTER(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.CENTER, 0);
    }
    public SYSTEM(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.SYSTEM, 0);
    }
    public MAX(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.MAX, 0);
    }
    public MIN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.MIN, 0);
    }
    public IMM(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.IMM, 0);
    }
    public RESIZE(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RESIZE, 0);
    }
    public MDI(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.MDI, 0);
    }
    public MODAL(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.MODAL, 0);
    }
    public STD(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.STD, 0);
    }
    public MSG(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.MSG, 0);
    }
    public USE(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.USE, 0);
    }
    public COLON(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.COLON, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_attributeName;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterAttributeName) {
             listener.enterAttributeName(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitAttributeName) {
             listener.exitAttributeName(this);
        }
    }
}


export class WindowDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionData.ID, 0)!;
    }
    public windowType(): WindowTypeContext {
        return this.getRuleContext(0, WindowTypeContext)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionData.LPAREN, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionData.STRING, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionData.RPAREN, 0)!;
    }
    public windowBody(): WindowBodyContext {
        return this.getRuleContext(0, WindowBodyContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public ignoredAttribute(): IgnoredAttributeContext[];
    public ignoredAttribute(i: number): IgnoredAttributeContext | null;
    public ignoredAttribute(i?: number): IgnoredAttributeContext[] | IgnoredAttributeContext | null {
        if (i === undefined) {
            return this.getRuleContexts(IgnoredAttributeContext);
        }

        return this.getRuleContext(i, IgnoredAttributeContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_windowDefinition;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterWindowDefinition) {
             listener.enterWindowDefinition(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitWindowDefinition) {
             listener.exitWindowDefinition(this);
        }
    }
}


export class WindowTypeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public APPLICATION(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.APPLICATION, 0);
    }
    public WINDOW(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.WINDOW, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_windowType;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterWindowType) {
             listener.enterWindowType(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitWindowType) {
             listener.exitWindowType(this);
        }
    }
}


export class WindowBodyContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public windowElement(): WindowElementContext[];
    public windowElement(i: number): WindowElementContext | null;
    public windowElement(i?: number): WindowElementContext[] | WindowElementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(WindowElementContext);
        }

        return this.getRuleContext(i, WindowElementContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_windowBody;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterWindowBody) {
             listener.enterWindowBody(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitWindowBody) {
             listener.exitWindowBody(this);
        }
    }
}


export class WindowElementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public menubarBlock(): MenubarBlockContext | null {
        return this.getRuleContext(0, MenubarBlockContext);
    }
    public toolbarBlock(): ToolbarBlockContext | null {
        return this.getRuleContext(0, ToolbarBlockContext);
    }
    public sheetBlock(): SheetBlockContext | null {
        return this.getRuleContext(0, SheetBlockContext);
    }
    public groupBlock(): GroupBlockContext | null {
        return this.getRuleContext(0, GroupBlockContext);
    }
    public optionBlock(): OptionBlockContext | null {
        return this.getRuleContext(0, OptionBlockContext);
    }
    public LINEBREAK(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LINEBREAK, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_windowElement;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterWindowElement) {
             listener.enterWindowElement(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitWindowElement) {
             listener.exitWindowElement(this);
        }
    }
}


export class EndMarkerContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public END(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.END, 0);
    }
    public STATEMENT_END(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.STATEMENT_END, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_endMarker;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterEndMarker) {
             listener.enterEndMarker(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitEndMarker) {
             listener.exitEndMarker(this);
        }
    }
}


export class MenubarBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MENUBAR(): antlr.TerminalNode {
        return this.getToken(ClarionData.MENUBAR, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public menuBlock(): MenuBlockContext[];
    public menuBlock(i: number): MenuBlockContext | null;
    public menuBlock(i?: number): MenuBlockContext[] | MenuBlockContext | null {
        if (i === undefined) {
            return this.getRuleContexts(MenuBlockContext);
        }

        return this.getRuleContext(i, MenuBlockContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_menubarBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterMenubarBlock) {
             listener.enterMenubarBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitMenubarBlock) {
             listener.exitMenubarBlock(this);
        }
    }
}


export class MenuBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MENU(): antlr.TerminalNode {
        return this.getToken(ClarionData.MENU, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public itemDefinition(): ItemDefinitionContext[];
    public itemDefinition(i: number): ItemDefinitionContext | null;
    public itemDefinition(i?: number): ItemDefinitionContext[] | ItemDefinitionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ItemDefinitionContext);
        }

        return this.getRuleContext(i, ItemDefinitionContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_menuBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterMenuBlock) {
             listener.enterMenuBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitMenuBlock) {
             listener.exitMenuBlock(this);
        }
    }
}


export class ItemDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ITEM(): antlr.TerminalNode {
        return this.getToken(ClarionData.ITEM, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_itemDefinition;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterItemDefinition) {
             listener.enterItemDefinition(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitItemDefinition) {
             listener.exitItemDefinition(this);
        }
    }
}


export class ToolbarBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public TOOLBAR(): antlr.TerminalNode {
        return this.getToken(ClarionData.TOOLBAR, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public ignoredAttribute(): IgnoredAttributeContext[];
    public ignoredAttribute(i: number): IgnoredAttributeContext | null;
    public ignoredAttribute(i?: number): IgnoredAttributeContext[] | IgnoredAttributeContext | null {
        if (i === undefined) {
            return this.getRuleContexts(IgnoredAttributeContext);
        }

        return this.getRuleContext(i, IgnoredAttributeContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_toolbarBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterToolbarBlock) {
             listener.enterToolbarBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitToolbarBlock) {
             listener.exitToolbarBlock(this);
        }
    }
}


export class ButtonDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public BUTTON(): antlr.TerminalNode {
        return this.getToken(ClarionData.BUTTON, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_buttonDefinition;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterButtonDefinition) {
             listener.enterButtonDefinition(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitButtonDefinition) {
             listener.exitButtonDefinition(this);
        }
    }
}


export class SheetBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SHEET(): antlr.TerminalNode {
        return this.getToken(ClarionData.SHEET, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.COMMA);
    	} else {
    		return this.getToken(ClarionData.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.ID);
    	} else {
    		return this.getToken(ClarionData.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public tabBlock(): TabBlockContext[];
    public tabBlock(i: number): TabBlockContext | null;
    public tabBlock(i?: number): TabBlockContext[] | TabBlockContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TabBlockContext);
        }

        return this.getRuleContext(i, TabBlockContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_sheetBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterSheetBlock) {
             listener.enterSheetBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitSheetBlock) {
             listener.exitSheetBlock(this);
        }
    }
}


export class TabBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public TAB(): antlr.TerminalNode {
        return this.getToken(ClarionData.TAB, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public controlBlock(): ControlBlockContext[];
    public controlBlock(i: number): ControlBlockContext | null;
    public controlBlock(i?: number): ControlBlockContext[] | ControlBlockContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ControlBlockContext);
        }

        return this.getRuleContext(i, ControlBlockContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_tabBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterTabBlock) {
             listener.enterTabBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitTabBlock) {
             listener.exitTabBlock(this);
        }
    }
}


export class OptionBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public OPTION(): antlr.TerminalNode {
        return this.getToken(ClarionData.OPTION, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public controlBlock(): ControlBlockContext[];
    public controlBlock(i: number): ControlBlockContext | null;
    public controlBlock(i?: number): ControlBlockContext[] | ControlBlockContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ControlBlockContext);
        }

        return this.getRuleContext(i, ControlBlockContext);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_optionBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterOptionBlock) {
             listener.enterOptionBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitOptionBlock) {
             listener.exitOptionBlock(this);
        }
    }
}


export class ControlBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.ID, 0);
    }
    public unknownContent(): UnknownContentContext | null {
        return this.getRuleContext(0, UnknownContentContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionData.LINEBREAK);
    	} else {
    		return this.getToken(ClarionData.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_controlBlock;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterControlBlock) {
             listener.enterControlBlock(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitControlBlock) {
             listener.exitControlBlock(this);
        }
    }
}


export class UnknownContentContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public END(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.END, 0);
    }
    public STATEMENT_END(): antlr.TerminalNode | null {
        return this.getToken(ClarionData.STATEMENT_END, 0);
    }
    public override get ruleIndex(): number {
        return ClarionData.RULE_unknownContent;
    }
    public override enterRule(listener: ClarionDataListener): void {
        if(listener.enterUnknownContent) {
             listener.enterUnknownContent(this);
        }
    }
    public override exitRule(listener: ClarionDataListener): void {
        if(listener.exitUnknownContent) {
             listener.exitUnknownContent(this);
        }
    }
}
