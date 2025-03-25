// Generated from server/antlr/ClarionParser.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { ClarionParserListener } from "./ClarionParserListener.js";
// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class ClarionParser extends antlr.Parser {
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
    public static readonly RULE_clarionFile = 0;
    public static readonly RULE_program = 1;
    public static readonly RULE_memberModule = 2;
    public static readonly RULE_moduleBody = 3;
    public static readonly RULE_moduleElement = 4;
    public static readonly RULE_mapSection = 5;
    public static readonly RULE_moduleBlock = 6;
    public static readonly RULE_prototypeList = 7;
    public static readonly RULE_prototype = 8;
    public static readonly RULE_procedureDefinition = 9;
    public static readonly RULE_localDataSection = 10;
    public static readonly RULE_localDataEntry = 11;
    public static readonly RULE_executableStatement = 12;
    public static readonly RULE_functionCallStatement = 13;
    public static readonly RULE_expressionStatement = 14;
    public static readonly RULE_doStatement = 15;
    public static readonly RULE_returnStatement = 16;
    public static readonly RULE_classDefinition = 17;
    public static readonly RULE_classBody = 18;
    public static readonly RULE_methodDefinition = 19;
    public static readonly RULE_variableDeclaration = 20;
    public static readonly RULE_routineDefinition = 21;
    public static readonly RULE_controlStructure = 22;
    public static readonly RULE_ifStatement = 23;
    public static readonly RULE_elsifClause = 24;
    public static readonly RULE_loopStatement = 25;
    public static readonly RULE_caseStatement = 26;
    public static readonly RULE_caseBranch = 27;
    public static readonly RULE_caseBlock = 28;
    public static readonly RULE_label = 29;
    public static readonly RULE_expression = 30;
    public static readonly RULE_term = 31;
    public static readonly RULE_factor = 32;
    public static readonly RULE_propertyAccess = 33;
    public static readonly RULE_functionCall = 34;
    public static readonly RULE_dottedIdentifier = 35;
    public static readonly RULE_argumentList = 36;
    public static readonly RULE_expressionLike = 37;
    public static readonly RULE_parameterList = 38;
    public static readonly RULE_parameter = 39;
    public static readonly RULE_returnType = 40;
    public static readonly RULE_assignmentStatement = 41;
    public static readonly RULE_assignable = 42;
    public static readonly RULE_assignmentOperator = 43;
    public static readonly RULE_statementTerminator = 44;
    public static readonly RULE_ignoredAttribute = 45;
    public static readonly RULE_ignoredAttributeContent = 46;
    public static readonly RULE_attributeName = 47;
    public static readonly RULE_windowDefinition = 48;
    public static readonly RULE_windowType = 49;
    public static readonly RULE_windowBody = 50;
    public static readonly RULE_windowElement = 51;
    public static readonly RULE_endMarker = 52;
    public static readonly RULE_menubarBlock = 53;
    public static readonly RULE_menuBlock = 54;
    public static readonly RULE_itemDefinition = 55;
    public static readonly RULE_toolbarBlock = 56;
    public static readonly RULE_buttonDefinition = 57;
    public static readonly RULE_sheetBlock = 58;
    public static readonly RULE_tabBlock = 59;
    public static readonly RULE_groupBlock = 60;
    public static readonly RULE_optionBlock = 61;
    public static readonly RULE_controlBlock = 62;
    public static readonly RULE_unknownContent = 63;
    public static readonly RULE_globalDataSection = 64;
    public static readonly RULE_globalEntry = 65;
    public static readonly RULE_includeDirective = 66;
    public static readonly RULE_equateDefinition = 67;
    public static readonly RULE_globalVariable = 68;
    public static readonly RULE_fieldReference = 69;
    public static readonly RULE_queueBlock = 70;
    public static readonly RULE_fieldList = 71;
    public static readonly RULE_fieldDefinition = 72;
    public static readonly RULE_fieldType = 73;
    public static readonly RULE_fieldOptions = 74;
    public static readonly RULE_classDeclaration = 75;
    public static readonly RULE_procedureAttribute = 76;
    public static readonly RULE_declarationParameterList = 77;
    public static readonly RULE_declarationParameterListNonEmpty = 78;
    public static readonly RULE_declarationParameter = 79;
    public static readonly RULE_fileDeclaration = 80;
    public static readonly RULE_fileAttributes = 81;
    public static readonly RULE_fileStructure = 82;
    public static readonly RULE_recordBlock = 83;
    public static readonly RULE_recordAttribute = 84;
    public static readonly RULE_keyDefinition = 85;
    public static readonly RULE_keyFields = 86;

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
        "clarionFile", "program", "memberModule", "moduleBody", "moduleElement", 
        "mapSection", "moduleBlock", "prototypeList", "prototype", "procedureDefinition", 
        "localDataSection", "localDataEntry", "executableStatement", "functionCallStatement", 
        "expressionStatement", "doStatement", "returnStatement", "classDefinition", 
        "classBody", "methodDefinition", "variableDeclaration", "routineDefinition", 
        "controlStructure", "ifStatement", "elsifClause", "loopStatement", 
        "caseStatement", "caseBranch", "caseBlock", "label", "expression", 
        "term", "factor", "propertyAccess", "functionCall", "dottedIdentifier", 
        "argumentList", "expressionLike", "parameterList", "parameter", 
        "returnType", "assignmentStatement", "assignable", "assignmentOperator", 
        "statementTerminator", "ignoredAttribute", "ignoredAttributeContent", 
        "attributeName", "windowDefinition", "windowType", "windowBody", 
        "windowElement", "endMarker", "menubarBlock", "menuBlock", "itemDefinition", 
        "toolbarBlock", "buttonDefinition", "sheetBlock", "tabBlock", "groupBlock", 
        "optionBlock", "controlBlock", "unknownContent", "globalDataSection", 
        "globalEntry", "includeDirective", "equateDefinition", "globalVariable", 
        "fieldReference", "queueBlock", "fieldList", "fieldDefinition", 
        "fieldType", "fieldOptions", "classDeclaration", "procedureAttribute", 
        "declarationParameterList", "declarationParameterListNonEmpty", 
        "declarationParameter", "fileDeclaration", "fileAttributes", "fileStructure", 
        "recordBlock", "recordAttribute", "keyDefinition", "keyFields",
    ];

    public get grammarFileName(): string { return "ClarionParser.g4"; }
    public get literalNames(): (string | null)[] { return ClarionParser.literalNames; }
    public get symbolicNames(): (string | null)[] { return ClarionParser.symbolicNames; }
    public get ruleNames(): string[] { return ClarionParser.ruleNames; }
    public get serializedATN(): number[] { return ClarionParser._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, ClarionParser._ATN, ClarionParser.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public clarionFile(): ClarionFileContext {
        let localContext = new ClarionFileContext(this.context, this.state);
        this.enterRule(localContext, 0, ClarionParser.RULE_clarionFile);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 177;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 174;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 179;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 182;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ClarionParser.PROGRAM:
                {
                this.state = 180;
                this.program();
                }
                break;
            case ClarionParser.MEMBER:
                {
                this.state = 181;
                this.memberModule();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            this.state = 187;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 184;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 189;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 190;
            this.match(ClarionParser.EOF);
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
    public program(): ProgramContext {
        let localContext = new ProgramContext(this.context, this.state);
        this.enterRule(localContext, 2, ClarionParser.RULE_program);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 192;
            this.match(ClarionParser.PROGRAM);
            this.state = 196;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 193;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 198;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 199;
            this.mapSection();
            this.state = 203;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 4, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 200;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 205;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 4, this.context);
            }
            this.state = 207;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 5, this.context) ) {
            case 1:
                {
                this.state = 206;
                this.globalDataSection();
                }
                break;
            }
            this.state = 212;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 6, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 209;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 214;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 6, this.context);
            }
            this.state = 218;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 62) {
                {
                {
                this.state = 215;
                this.procedureDefinition();
                }
                }
                this.state = 220;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 224;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 8, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 221;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 226;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 8, this.context);
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
    public memberModule(): MemberModuleContext {
        let localContext = new MemberModuleContext(this.context, this.state);
        this.enterRule(localContext, 4, ClarionParser.RULE_memberModule);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 227;
            this.match(ClarionParser.MEMBER);
            this.state = 233;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 228;
                this.match(ClarionParser.LPAREN);
                this.state = 230;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 63) {
                    {
                    this.state = 229;
                    this.match(ClarionParser.STRING);
                    }
                }

                this.state = 232;
                this.match(ClarionParser.RPAREN);
                }
            }

            this.state = 238;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 11, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 235;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 240;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 11, this.context);
            }
            this.state = 242;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 36) {
                {
                this.state = 241;
                this.mapSection();
                }
            }

            this.state = 247;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 13, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 244;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 249;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 13, this.context);
            }
            this.state = 250;
            this.moduleBody();
            this.state = 254;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 251;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 256;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 14, this.context);
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
    public moduleBody(): ModuleBodyContext {
        let localContext = new ModuleBodyContext(this.context, this.state);
        this.enterRule(localContext, 6, ClarionParser.RULE_moduleBody);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 272;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 17, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 260;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 69) {
                        {
                        {
                        this.state = 257;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                        this.state = 262;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 263;
                    this.moduleElement();
                    this.state = 267;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 264;
                            this.match(ClarionParser.LINEBREAK);
                            }
                            }
                        }
                        this.state = 269;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
                    }
                    }
                    }
                }
                this.state = 274;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 17, this.context);
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
    public moduleElement(): ModuleElementContext {
        let localContext = new ModuleElementContext(this.context, this.state);
        this.enterRule(localContext, 8, ClarionParser.RULE_moduleElement);
        try {
            this.state = 285;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 18, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 275;
                this.windowDefinition();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 276;
                this.procedureDefinition();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 277;
                this.routineDefinition();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 278;
                this.classDeclaration();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 279;
                this.queueBlock();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 280;
                this.groupBlock();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 281;
                this.variableDeclaration();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 282;
                this.includeDirective();
                }
                break;
            case 9:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 283;
                this.equateDefinition();
                }
                break;
            case 10:
                this.enterOuterAlt(localContext, 10);
                {
                this.state = 284;
                this.executableStatement();
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
    public mapSection(): MapSectionContext {
        let localContext = new MapSectionContext(this.context, this.state);
        this.enterRule(localContext, 10, ClarionParser.RULE_mapSection);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 287;
            this.match(ClarionParser.MAP);
            this.state = 291;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 19, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 288;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 293;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 19, this.context);
            }
            this.state = 295;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 20, this.context) ) {
            case 1:
                {
                this.state = 294;
                this.prototypeList();
                }
                break;
            }
            this.state = 300;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 21, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 297;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 302;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 21, this.context);
            }
            this.state = 306;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 37) {
                {
                {
                this.state = 303;
                this.moduleBlock();
                }
                }
                this.state = 308;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 312;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 309;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 314;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 315;
            this.match(ClarionParser.END);
            this.state = 319;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 24, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 316;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 321;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 24, this.context);
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
    public moduleBlock(): ModuleBlockContext {
        let localContext = new ModuleBlockContext(this.context, this.state);
        this.enterRule(localContext, 12, ClarionParser.RULE_moduleBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 322;
            this.match(ClarionParser.MODULE);
            this.state = 323;
            this.match(ClarionParser.LPAREN);
            this.state = 324;
            this.match(ClarionParser.STRING);
            this.state = 325;
            this.match(ClarionParser.RPAREN);
            this.state = 329;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 25, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 326;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 331;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 25, this.context);
            }
            this.state = 332;
            this.prototypeList();
            this.state = 336;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 333;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 338;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 339;
            this.match(ClarionParser.END);
            this.state = 343;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 27, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 340;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 345;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 27, this.context);
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
    public prototypeList(): PrototypeListContext {
        let localContext = new PrototypeListContext(this.context, this.state);
        this.enterRule(localContext, 14, ClarionParser.RULE_prototypeList);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 359;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
                switch (alternative) {
                case 1:
                    {
                    {
                    this.state = 349;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 69) {
                        {
                        {
                        this.state = 346;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                        this.state = 351;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 352;
                    this.prototype();
                    this.state = 356;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 29, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 353;
                            this.match(ClarionParser.LINEBREAK);
                            }
                            }
                        }
                        this.state = 358;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 29, this.context);
                    }
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 361;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 30, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
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
    public prototype(): PrototypeContext {
        let localContext = new PrototypeContext(this.context, this.state);
        this.enterRule(localContext, 16, ClarionParser.RULE_prototype);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 363;
            this.label();
            this.state = 364;
            this.match(ClarionParser.PROCEDURE);
            this.state = 377;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 365;
                this.match(ClarionParser.LPAREN);
                this.state = 374;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 62 || _la === 63) {
                    {
                    this.state = 366;
                    this.parameter();
                    this.state = 371;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 76) {
                        {
                        {
                        this.state = 367;
                        this.match(ClarionParser.COMMA);
                        this.state = 368;
                        this.parameter();
                        }
                        }
                        this.state = 373;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    }
                }

                this.state = 376;
                this.match(ClarionParser.RPAREN);
                }
            }

            this.state = 381;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76) {
                {
                this.state = 379;
                this.match(ClarionParser.COMMA);
                this.state = 380;
                this.returnType();
                }
            }

            this.state = 384;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 85) {
                {
                this.state = 383;
                this.match(ClarionParser.SEMI);
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
    public procedureDefinition(): ProcedureDefinitionContext {
        let localContext = new ProcedureDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 18, ClarionParser.RULE_procedureDefinition);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 386;
            this.label();
            this.state = 387;
            this.match(ClarionParser.PROCEDURE);
            this.state = 389;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 388;
                this.parameterList();
                }
            }

            this.state = 393;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76) {
                {
                this.state = 391;
                this.match(ClarionParser.COMMA);
                this.state = 392;
                this.returnType();
                }
            }

            this.state = 398;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 38, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 395;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 400;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 38, this.context);
            }
            this.state = 402;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 39, this.context) ) {
            case 1:
                {
                this.state = 401;
                this.localDataSection();
                }
                break;
            }
            this.state = 417;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 39) {
                {
                this.state = 404;
                this.match(ClarionParser.CODE);
                this.state = 408;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 40, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 405;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                    }
                    this.state = 410;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 40, this.context);
                }
                this.state = 414;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 41, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 411;
                        this.executableStatement();
                        }
                        }
                    }
                    this.state = 416;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 41, this.context);
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
    public localDataSection(): LocalDataSectionContext {
        let localContext = new LocalDataSectionContext(this.context, this.state);
        this.enterRule(localContext, 20, ClarionParser.RULE_localDataSection);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 434;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 45, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 422;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 69) {
                        {
                        {
                        this.state = 419;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                        this.state = 424;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 425;
                    this.localDataEntry();
                    this.state = 429;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 44, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 426;
                            this.match(ClarionParser.LINEBREAK);
                            }
                            }
                        }
                        this.state = 431;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 44, this.context);
                    }
                    }
                    }
                }
                this.state = 436;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 45, this.context);
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
    public localDataEntry(): LocalDataEntryContext {
        let localContext = new LocalDataEntryContext(this.context, this.state);
        this.enterRule(localContext, 22, ClarionParser.RULE_localDataEntry);
        try {
            this.state = 445;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 46, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 437;
                this.windowDefinition();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 438;
                this.variableDeclaration();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 439;
                this.includeDirective();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 440;
                this.equateDefinition();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 441;
                this.groupBlock();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 442;
                this.queueBlock();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 443;
                this.classDeclaration();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 444;
                this.mapSection();
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
    public executableStatement(): ExecutableStatementContext {
        let localContext = new ExecutableStatementContext(this.context, this.state);
        this.enterRule(localContext, 24, ClarionParser.RULE_executableStatement);
        try {
            this.state = 457;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 48, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 447;
                this.returnStatement();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 448;
                this.assignmentStatement();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 449;
                this.routineDefinition();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 450;
                this.functionCallStatement();
                this.state = 452;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 47, this.context) ) {
                case 1:
                    {
                    this.state = 451;
                    this.statementTerminator();
                    }
                    break;
                }
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 454;
                this.controlStructure();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 455;
                this.includeDirective();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 456;
                this.doStatement();
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
    public functionCallStatement(): FunctionCallStatementContext {
        let localContext = new FunctionCallStatementContext(this.context, this.state);
        this.enterRule(localContext, 26, ClarionParser.RULE_functionCallStatement);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 459;
            this.functionCall();
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
    public expressionStatement(): ExpressionStatementContext {
        let localContext = new ExpressionStatementContext(this.context, this.state);
        this.enterRule(localContext, 28, ClarionParser.RULE_expressionStatement);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 461;
            this.expression(0);
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
    public doStatement(): DoStatementContext {
        let localContext = new DoStatementContext(this.context, this.state);
        this.enterRule(localContext, 30, ClarionParser.RULE_doStatement);
        try {
            this.state = 470;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 49, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 463;
                this.match(ClarionParser.DO);
                this.state = 464;
                this.label();
                this.state = 465;
                this.statementTerminator();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 467;
                this.match(ClarionParser.DO);
                this.state = 468;
                this.match(ClarionParser.ID);
                this.state = 469;
                this.statementTerminator();
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
    public returnStatement(): ReturnStatementContext {
        let localContext = new ReturnStatementContext(this.context, this.state);
        this.enterRule(localContext, 32, ClarionParser.RULE_returnStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 472;
            this.match(ClarionParser.RETURN);
            this.state = 474;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 59)) & ~0x1F) === 0 && ((1 << (_la - 59)) & 2097215) !== 0)) {
                {
                this.state = 473;
                this.expression(0);
                }
            }

            this.state = 476;
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
    public classDefinition(): ClassDefinitionContext {
        let localContext = new ClassDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 34, ClarionParser.RULE_classDefinition);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 478;
            this.label();
            this.state = 479;
            this.match(ClarionParser.CLASS);
            this.state = 481;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 77) {
                {
                this.state = 480;
                this.match(ClarionParser.DOT);
                }
            }

            this.state = 486;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 52, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 483;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 488;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 52, this.context);
            }
            this.state = 489;
            this.classBody();
            this.state = 493;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 490;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 495;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 496;
            this.match(ClarionParser.END);
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
    public classBody(): ClassBodyContext {
        let localContext = new ClassBodyContext(this.context, this.state);
        this.enterRule(localContext, 36, ClarionParser.RULE_classBody);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 516;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 57, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 501;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 69) {
                        {
                        {
                        this.state = 498;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                        this.state = 503;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 506;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 55, this.context) ) {
                    case 1:
                        {
                        this.state = 504;
                        this.methodDefinition();
                        }
                        break;
                    case 2:
                        {
                        this.state = 505;
                        this.variableDeclaration();
                        }
                        break;
                    }
                    this.state = 511;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 56, this.context);
                    while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                        if (alternative === 1) {
                            {
                            {
                            this.state = 508;
                            this.match(ClarionParser.LINEBREAK);
                            }
                            }
                        }
                        this.state = 513;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 56, this.context);
                    }
                    }
                    }
                }
                this.state = 518;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 57, this.context);
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
    public methodDefinition(): MethodDefinitionContext {
        let localContext = new MethodDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 38, ClarionParser.RULE_methodDefinition);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 519;
            this.label();
            this.state = 520;
            this.match(ClarionParser.PROCEDURE);
            this.state = 522;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 521;
                this.parameterList();
                }
            }

            this.state = 526;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76) {
                {
                this.state = 524;
                this.match(ClarionParser.COMMA);
                this.state = 525;
                this.returnType();
                }
            }

            this.state = 531;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 60, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 528;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 533;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 60, this.context);
            }
            this.state = 535;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 61, this.context) ) {
            case 1:
                {
                this.state = 534;
                this.localDataSection();
                }
                break;
            }
            this.state = 550;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 39) {
                {
                this.state = 537;
                this.match(ClarionParser.CODE);
                this.state = 541;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 62, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 538;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                    }
                    this.state = 543;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 62, this.context);
                }
                this.state = 547;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 63, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 544;
                        this.executableStatement();
                        }
                        }
                    }
                    this.state = 549;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 63, this.context);
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
    public variableDeclaration(): VariableDeclarationContext {
        let localContext = new VariableDeclarationContext(this.context, this.state);
        this.enterRule(localContext, 40, ClarionParser.RULE_variableDeclaration);
        let _la: number;
        try {
            this.state = 576;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 68, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 552;
                this.label();
                this.state = 553;
                this.label();
                this.state = 558;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 76) {
                    {
                    {
                    this.state = 554;
                    this.match(ClarionParser.COMMA);
                    this.state = 555;
                    this.label();
                    }
                    }
                    this.state = 560;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 561;
                this.label();
                this.state = 562;
                this.fieldReference();
                this.state = 567;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 80) {
                    {
                    this.state = 563;
                    this.match(ClarionParser.LPAREN);
                    this.state = 564;
                    this.argumentList();
                    this.state = 565;
                    this.match(ClarionParser.RPAREN);
                    }
                }

                this.state = 573;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 76) {
                    {
                    {
                    this.state = 569;
                    this.match(ClarionParser.COMMA);
                    this.state = 570;
                    this.label();
                    }
                    }
                    this.state = 575;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
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
    public routineDefinition(): RoutineDefinitionContext {
        let localContext = new RoutineDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 42, ClarionParser.RULE_routineDefinition);
        let _la: number;
        try {
            let alternative: number;
            this.state = 649;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 78, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 578;
                this.label();
                this.state = 579;
                this.match(ClarionParser.ROUTINE);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 581;
                this.label();
                this.state = 582;
                this.match(ClarionParser.ROUTINE);
                this.state = 586;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 69) {
                    {
                    {
                    this.state = 583;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                    this.state = 588;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 590;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 589;
                        this.executableStatement();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 592;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 70, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 594;
                this.label();
                this.state = 595;
                this.match(ClarionParser.ROUTINE);
                this.state = 596;
                this.match(ClarionParser.DATA);
                this.state = 600;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 71, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 597;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                    }
                    this.state = 602;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 71, this.context);
                }
                this.state = 603;
                this.localDataSection();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 605;
                this.label();
                this.state = 606;
                this.match(ClarionParser.ROUTINE);
                this.state = 607;
                this.match(ClarionParser.CODE);
                this.state = 611;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 72, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 608;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                    }
                    this.state = 613;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 72, this.context);
                }
                this.state = 617;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 73, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 614;
                        this.executableStatement();
                        }
                        }
                    }
                    this.state = 619;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 73, this.context);
                }
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 620;
                this.label();
                this.state = 621;
                this.match(ClarionParser.ROUTINE);
                this.state = 622;
                this.match(ClarionParser.DATA);
                this.state = 626;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 74, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 623;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                    }
                    this.state = 628;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 74, this.context);
                }
                this.state = 629;
                this.localDataSection();
                this.state = 633;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 69) {
                    {
                    {
                    this.state = 630;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                    this.state = 635;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 636;
                this.match(ClarionParser.CODE);
                this.state = 640;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 76, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 637;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                    }
                    this.state = 642;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 76, this.context);
                }
                this.state = 646;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 77, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 643;
                        this.executableStatement();
                        }
                        }
                    }
                    this.state = 648;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 77, this.context);
                }
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
    public controlStructure(): ControlStructureContext {
        let localContext = new ControlStructureContext(this.context, this.state);
        this.enterRule(localContext, 44, ClarionParser.RULE_controlStructure);
        try {
            this.state = 654;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ClarionParser.IF:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 651;
                this.ifStatement();
                }
                break;
            case ClarionParser.LOOP:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 652;
                this.loopStatement();
                }
                break;
            case ClarionParser.CASE:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 653;
                this.caseStatement();
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
    public ifStatement(): IfStatementContext {
        let localContext = new IfStatementContext(this.context, this.state);
        this.enterRule(localContext, 46, ClarionParser.RULE_ifStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 656;
            this.match(ClarionParser.IF);
            this.state = 657;
            this.expression(0);
            this.state = 659;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 8) {
                {
                this.state = 658;
                this.match(ClarionParser.THEN);
                }
            }

            this.state = 708;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 89, this.context) ) {
            case 1:
                {
                this.state = 661;
                this.executableStatement();
                }
                break;
            case 2:
                {
                this.state = 665;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 69) {
                    {
                    {
                    this.state = 662;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                    this.state = 667;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 677;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3200) !== 0) || ((((_la - 40)) & ~0x1F) === 0 && ((1 << (_la - 40)) & 5832961) !== 0) || _la === 87) {
                    {
                    {
                    this.state = 668;
                    this.executableStatement();
                    this.state = 672;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 69) {
                        {
                        {
                        this.state = 669;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                        this.state = 674;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    }
                    }
                    this.state = 679;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 683;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 58) {
                    {
                    {
                    this.state = 680;
                    this.elsifClause();
                    }
                    }
                    this.state = 685;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 705;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 9) {
                    {
                    this.state = 686;
                    this.match(ClarionParser.ELSE);
                    this.state = 690;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 69) {
                        {
                        {
                        this.state = 687;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                        this.state = 692;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 702;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3200) !== 0) || ((((_la - 40)) & ~0x1F) === 0 && ((1 << (_la - 40)) & 5832961) !== 0) || _la === 87) {
                        {
                        {
                        this.state = 693;
                        this.executableStatement();
                        this.state = 697;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        while (_la === 69) {
                            {
                            {
                            this.state = 694;
                            this.match(ClarionParser.LINEBREAK);
                            }
                            }
                            this.state = 699;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                        }
                        }
                        }
                        this.state = 704;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    }
                }

                this.state = 707;
                this.match(ClarionParser.END);
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
    public elsifClause(): ElsifClauseContext {
        let localContext = new ElsifClauseContext(this.context, this.state);
        this.enterRule(localContext, 48, ClarionParser.RULE_elsifClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 710;
            this.match(ClarionParser.ELSIF);
            this.state = 711;
            this.expression(0);
            this.state = 713;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 8) {
                {
                this.state = 712;
                this.match(ClarionParser.THEN);
                }
            }

            this.state = 718;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 715;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 720;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 724;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3200) !== 0) || ((((_la - 40)) & ~0x1F) === 0 && ((1 << (_la - 40)) & 5832961) !== 0) || _la === 87) {
                {
                {
                this.state = 721;
                this.executableStatement();
                }
                }
                this.state = 726;
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
    public loopStatement(): LoopStatementContext {
        let localContext = new LoopStatementContext(this.context, this.state);
        this.enterRule(localContext, 50, ClarionParser.RULE_loopStatement);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 727;
            this.match(ClarionParser.LOOP);
            this.state = 731;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 93, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 728;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 733;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 93, this.context);
            }
            this.state = 737;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3200) !== 0) || ((((_la - 40)) & ~0x1F) === 0 && ((1 << (_la - 40)) & 5832961) !== 0) || _la === 87) {
                {
                {
                this.state = 734;
                this.executableStatement();
                }
                }
                this.state = 739;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 743;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 740;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 745;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 746;
            this.match(ClarionParser.END);
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
    public caseStatement(): CaseStatementContext {
        let localContext = new CaseStatementContext(this.context, this.state);
        this.enterRule(localContext, 52, ClarionParser.RULE_caseStatement);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 748;
            this.match(ClarionParser.CASE);
            this.state = 752;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 96, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 749;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 754;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 96, this.context);
            }
            this.state = 769;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 12) {
                {
                {
                this.state = 755;
                this.match(ClarionParser.OF);
                this.state = 759;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 69) {
                    {
                    {
                    this.state = 756;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                    this.state = 761;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 763;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 762;
                        this.caseBranch();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 765;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 98, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                }
                this.state = 771;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 785;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 9) {
                {
                this.state = 772;
                this.match(ClarionParser.ELSE);
                this.state = 776;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 69) {
                    {
                    {
                    this.state = 773;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                    this.state = 778;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 782;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3200) !== 0) || ((((_la - 40)) & ~0x1F) === 0 && ((1 << (_la - 40)) & 5832961) !== 0) || _la === 87) {
                    {
                    {
                    this.state = 779;
                    this.executableStatement();
                    }
                    }
                    this.state = 784;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 787;
            this.match(ClarionParser.END);
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
    public caseBranch(): CaseBranchContext {
        let localContext = new CaseBranchContext(this.context, this.state);
        this.enterRule(localContext, 54, ClarionParser.RULE_caseBranch);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 789;
            this.match(ClarionParser.OF);
            this.state = 793;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 103, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 790;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 795;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 103, this.context);
            }
            this.state = 799;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 796;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 801;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 805;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3200) !== 0) || ((((_la - 40)) & ~0x1F) === 0 && ((1 << (_la - 40)) & 5832961) !== 0) || _la === 87) {
                {
                {
                this.state = 802;
                this.executableStatement();
                }
                }
                this.state = 807;
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
    public caseBlock(): CaseBlockContext {
        let localContext = new CaseBlockContext(this.context, this.state);
        this.enterRule(localContext, 56, ClarionParser.RULE_caseBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 808;
            this.label();
            this.state = 809;
            this.match(ClarionParser.ARROW);
            this.state = 813;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 810;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 815;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 819;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3200) !== 0) || ((((_la - 40)) & ~0x1F) === 0 && ((1 << (_la - 40)) & 5832961) !== 0) || _la === 87) {
                {
                {
                this.state = 816;
                this.executableStatement();
                }
                }
                this.state = 821;
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
    public label(): LabelContext {
        let localContext = new LabelContext(this.context, this.state);
        this.enterRule(localContext, 58, ClarionParser.RULE_label);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 822;
            this.match(ClarionParser.ID);
            this.state = 827;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 78) {
                {
                {
                this.state = 823;
                this.match(ClarionParser.COLON);
                this.state = 824;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 829;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 832;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 77) {
                {
                this.state = 830;
                this.match(ClarionParser.DOT);
                this.state = 831;
                this.match(ClarionParser.ID);
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
        let _startState = 60;
        this.enterRecursionRule(localContext, 60, ClarionParser.RULE_expression, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            localContext = new TermExpressionContext(localContext);
            this.context = localContext;
            previousContext = localContext;

            this.state = 835;
            this.term(0);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 845;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 111, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 843;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 110, this.context) ) {
                    case 1:
                        {
                        localContext = new AdditiveExpressionContext(new ExpressionContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionParser.RULE_expression);
                        this.state = 837;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 838;
                        this.match(ClarionParser.PLUS);
                        this.state = 839;
                        this.term(0);
                        }
                        break;
                    case 2:
                        {
                        localContext = new AdditiveExpressionContext(new ExpressionContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionParser.RULE_expression);
                        this.state = 840;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 841;
                        this.match(ClarionParser.MINUS);
                        this.state = 842;
                        this.term(0);
                        }
                        break;
                    }
                    }
                }
                this.state = 847;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 111, this.context);
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
        let _startState = 62;
        this.enterRecursionRule(localContext, 62, ClarionParser.RULE_term, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            localContext = new FactorExpressionContext(localContext);
            this.context = localContext;
            previousContext = localContext;

            this.state = 849;
            this.factor();
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 859;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 113, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 857;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 112, this.context) ) {
                    case 1:
                        {
                        localContext = new MultiplicativeExpressionContext(new TermContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionParser.RULE_term);
                        this.state = 851;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 852;
                        this.match(ClarionParser.STAR);
                        this.state = 853;
                        this.factor();
                        }
                        break;
                    case 2:
                        {
                        localContext = new MultiplicativeExpressionContext(new TermContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, ClarionParser.RULE_term);
                        this.state = 854;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 855;
                        this.match(ClarionParser.SLASH);
                        this.state = 856;
                        this.factor();
                        }
                        break;
                    }
                    }
                }
                this.state = 861;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 113, this.context);
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
        this.enterRule(localContext, 64, ClarionParser.RULE_factor);
        try {
            this.state = 872;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 114, this.context) ) {
            case 1:
                localContext = new FunctionCallFactorContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 862;
                this.functionCall();
                }
                break;
            case 2:
                localContext = new DottedIdentifierFactorContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 863;
                this.dottedIdentifier();
                }
                break;
            case 3:
                localContext = new PropertyAccessFactorContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 864;
                this.propertyAccess();
                }
                break;
            case 4:
                localContext = new FieldEquateFactorContext(localContext);
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 865;
                this.match(ClarionParser.FEQ);
                }
                break;
            case 5:
                localContext = new IntegerFactorContext(localContext);
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 866;
                this.match(ClarionParser.NUMERIC);
                }
                break;
            case 6:
                localContext = new StringFactorContext(localContext);
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 867;
                this.match(ClarionParser.STRING);
                }
                break;
            case 7:
                localContext = new ParenthesizedFactorContext(localContext);
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 868;
                this.match(ClarionParser.LPAREN);
                this.state = 869;
                this.expression(0);
                this.state = 870;
                this.match(ClarionParser.RPAREN);
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
        this.enterRule(localContext, 66, ClarionParser.RULE_propertyAccess);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 874;
            this.match(ClarionParser.ID);
            this.state = 875;
            this.match(ClarionParser.LBRACE);
            this.state = 876;
            this.match(ClarionParser.ID);
            this.state = 881;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 78) {
                {
                {
                this.state = 877;
                this.match(ClarionParser.COLON);
                this.state = 878;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 883;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 884;
            this.match(ClarionParser.RBRACE);
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
        this.enterRule(localContext, 68, ClarionParser.RULE_functionCall);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 886;
            this.dottedIdentifier();
            this.state = 887;
            this.match(ClarionParser.LPAREN);
            this.state = 889;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 116, this.context) ) {
            case 1:
                {
                this.state = 888;
                this.argumentList();
                }
                break;
            }
            this.state = 891;
            this.match(ClarionParser.RPAREN);
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
        this.enterRule(localContext, 70, ClarionParser.RULE_dottedIdentifier);
        let _la: number;
        try {
            let alternative: number;
            this.state = 904;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ClarionParser.SELF:
            case ClarionParser.PARENT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 893;
                _la = this.tokenStream.LA(1);
                if(!(_la === 59 || _la === 60)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 894;
                this.match(ClarionParser.DOT);
                this.state = 895;
                this.match(ClarionParser.ID);
                }
                break;
            case ClarionParser.ID:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 896;
                this.match(ClarionParser.ID);
                this.state = 901;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 117, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 897;
                        this.match(ClarionParser.DOT);
                        this.state = 898;
                        this.match(ClarionParser.ID);
                        }
                        }
                    }
                    this.state = 903;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 117, this.context);
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
        this.enterRule(localContext, 72, ClarionParser.RULE_argumentList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 914;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294967294) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33419231) !== 0)) {
                {
                this.state = 906;
                this.expressionLike();
                this.state = 911;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 76) {
                    {
                    {
                    this.state = 907;
                    this.match(ClarionParser.COMMA);
                    this.state = 908;
                    this.expressionLike();
                    }
                    }
                    this.state = 913;
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
        this.enterRule(localContext, 74, ClarionParser.RULE_expressionLike);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 917;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
                {
                {
                this.state = 916;
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
                this.state = 919;
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
        this.enterRule(localContext, 76, ClarionParser.RULE_parameterList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 921;
            this.match(ClarionParser.LPAREN);
            this.state = 930;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 62 || _la === 63) {
                {
                this.state = 922;
                this.parameter();
                this.state = 927;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 76) {
                    {
                    {
                    this.state = 923;
                    this.match(ClarionParser.COMMA);
                    this.state = 924;
                    this.parameter();
                    }
                    }
                    this.state = 929;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 932;
            this.match(ClarionParser.RPAREN);
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
        this.enterRule(localContext, 78, ClarionParser.RULE_parameter);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 934;
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
        this.enterRule(localContext, 80, ClarionParser.RULE_returnType);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 936;
            this.match(ClarionParser.ID);
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
    public assignmentStatement(): AssignmentStatementContext {
        let localContext = new AssignmentStatementContext(this.context, this.state);
        this.enterRule(localContext, 82, ClarionParser.RULE_assignmentStatement);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 938;
            this.assignable();
            this.state = 939;
            this.assignmentOperator();
            this.state = 940;
            this.expression(0);
            this.state = 941;
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
        this.enterRule(localContext, 84, ClarionParser.RULE_assignable);
        try {
            this.state = 956;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 124, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 943;
                this.dottedIdentifier();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 944;
                this.match(ClarionParser.ID);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 945;
                this.match(ClarionParser.QUESTION);
                this.state = 946;
                this.match(ClarionParser.ID);
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 947;
                this.match(ClarionParser.QUESTION);
                this.state = 948;
                this.match(ClarionParser.ID);
                this.state = 949;
                this.match(ClarionParser.LBRACE);
                this.state = 950;
                this.match(ClarionParser.ID);
                this.state = 951;
                this.match(ClarionParser.RBRACE);
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 952;
                this.match(ClarionParser.ID);
                this.state = 953;
                this.match(ClarionParser.LBRACE);
                this.state = 954;
                this.match(ClarionParser.ID);
                this.state = 955;
                this.match(ClarionParser.RBRACE);
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
        this.enterRule(localContext, 86, ClarionParser.RULE_assignmentOperator);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 958;
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
        this.enterRule(localContext, 88, ClarionParser.RULE_statementTerminator);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 960;
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
    public ignoredAttribute(): IgnoredAttributeContext {
        let localContext = new IgnoredAttributeContext(this.context, this.state);
        this.enterRule(localContext, 90, ClarionParser.RULE_ignoredAttribute);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 962;
            this.attributeName();
            this.state = 967;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 125, this.context) ) {
            case 1:
                {
                this.state = 963;
                this.match(ClarionParser.LPAREN);
                this.state = 964;
                this.ignoredAttributeContent();
                this.state = 965;
                this.match(ClarionParser.RPAREN);
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
        this.enterRule(localContext, 92, ClarionParser.RULE_ignoredAttributeContent);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 972;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 126, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 969;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 974;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 126, this.context);
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
        this.enterRule(localContext, 94, ClarionParser.RULE_attributeName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 975;
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
        this.enterRule(localContext, 96, ClarionParser.RULE_windowDefinition);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 977;
            this.match(ClarionParser.ID);
            this.state = 978;
            this.windowType();
            this.state = 979;
            this.match(ClarionParser.LPAREN);
            this.state = 980;
            this.match(ClarionParser.STRING);
            this.state = 981;
            this.match(ClarionParser.RPAREN);
            this.state = 986;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 127, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 982;
                    this.match(ClarionParser.COMMA);
                    this.state = 983;
                    this.ignoredAttribute();
                    }
                    }
                }
                this.state = 988;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 127, this.context);
            }
            this.state = 992;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 128, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 989;
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
                this.state = 994;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 128, this.context);
            }
            this.state = 995;
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
        this.enterRule(localContext, 98, ClarionParser.RULE_windowType);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 997;
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
        this.enterRule(localContext, 100, ClarionParser.RULE_windowBody);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1002;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 129, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 999;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 1004;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 129, this.context);
            }
            this.state = 1014;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 26 || _la === 27 || ((((_la - 45)) & ~0x1F) === 0 && ((1 << (_la - 45)) & 16778497) !== 0)) {
                {
                {
                this.state = 1005;
                this.windowElement();
                this.state = 1009;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 130, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 1006;
                        this.match(ClarionParser.LINEBREAK);
                        }
                        }
                    }
                    this.state = 1011;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 130, this.context);
                }
                }
                }
                this.state = 1016;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1017;
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
        this.enterRule(localContext, 102, ClarionParser.RULE_windowElement);
        try {
            this.state = 1025;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ClarionParser.MENUBAR:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1019;
                this.menubarBlock();
                }
                break;
            case ClarionParser.TOOLBAR:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1020;
                this.toolbarBlock();
                }
                break;
            case ClarionParser.SHEET:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1021;
                this.sheetBlock();
                }
                break;
            case ClarionParser.GROUP:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1022;
                this.groupBlock();
                }
                break;
            case ClarionParser.OPTION:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1023;
                this.optionBlock();
                }
                break;
            case ClarionParser.LINEBREAK:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1024;
                this.match(ClarionParser.LINEBREAK);
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
        this.enterRule(localContext, 104, ClarionParser.RULE_endMarker);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1027;
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
        this.enterRule(localContext, 106, ClarionParser.RULE_menubarBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1029;
            this.match(ClarionParser.MENUBAR);
            this.state = 1034;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1030;
                this.match(ClarionParser.COMMA);
                this.state = 1031;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 1036;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1045;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 1038;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                do {
                    {
                    {
                    this.state = 1037;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                    this.state = 1040;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                } while (_la === 69);
                this.state = 1042;
                this.menuBlock();
                }
                }
                this.state = 1047;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1048;
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
        this.enterRule(localContext, 108, ClarionParser.RULE_menuBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1050;
            this.match(ClarionParser.MENU);
            this.state = 1055;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1051;
                this.match(ClarionParser.COMMA);
                this.state = 1052;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 1057;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1061;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 1058;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 1063;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1067;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 33) {
                {
                {
                this.state = 1064;
                this.itemDefinition();
                }
                }
                this.state = 1069;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1070;
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
        this.enterRule(localContext, 110, ClarionParser.RULE_itemDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1072;
            this.match(ClarionParser.ITEM);
            this.state = 1076;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 1073;
                this.match(ClarionParser.LPAREN);
                this.state = 1074;
                this.match(ClarionParser.STRING);
                this.state = 1075;
                this.match(ClarionParser.RPAREN);
                }
            }

            this.state = 1082;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1078;
                this.match(ClarionParser.COMMA);
                this.state = 1079;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 1084;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1088;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 1085;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 1090;
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
        this.enterRule(localContext, 112, ClarionParser.RULE_toolbarBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1091;
            this.match(ClarionParser.TOOLBAR);
            this.state = 1096;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 142, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1092;
                    this.match(ClarionParser.COMMA);
                    this.state = 1093;
                    this.ignoredAttribute();
                    }
                    }
                }
                this.state = 1098;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 142, this.context);
            }
            this.state = 1102;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 143, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1099;
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
                this.state = 1104;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 143, this.context);
            }
            this.state = 1108;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 144, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 1105;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 1110;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 144, this.context);
            }
            this.state = 1111;
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
        this.enterRule(localContext, 114, ClarionParser.RULE_buttonDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1113;
            this.match(ClarionParser.BUTTON);
            this.state = 1117;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 1114;
                this.match(ClarionParser.LPAREN);
                this.state = 1115;
                this.match(ClarionParser.STRING);
                this.state = 1116;
                this.match(ClarionParser.RPAREN);
                }
            }

            this.state = 1123;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1119;
                this.match(ClarionParser.COMMA);
                this.state = 1120;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 1125;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1129;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 1126;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 1131;
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
        this.enterRule(localContext, 116, ClarionParser.RULE_sheetBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1132;
            this.match(ClarionParser.SHEET);
            this.state = 1137;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1133;
                this.match(ClarionParser.COMMA);
                this.state = 1134;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 1139;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1143;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 1140;
                this.match(ClarionParser.LINEBREAK);
                }
                }
                this.state = 1145;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1149;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 54) {
                {
                {
                this.state = 1146;
                this.tabBlock();
                }
                }
                this.state = 1151;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1152;
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
        this.enterRule(localContext, 118, ClarionParser.RULE_tabBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1154;
            this.match(ClarionParser.TAB);
            this.state = 1158;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 151, this.context) ) {
            case 1:
                {
                this.state = 1155;
                this.match(ClarionParser.LPAREN);
                this.state = 1156;
                this.match(ClarionParser.STRING);
                this.state = 1157;
                this.match(ClarionParser.RPAREN);
                }
                break;
            }
            this.state = 1163;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 152, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1160;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 1165;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 152, this.context);
            }
            this.state = 1169;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294959100) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33554431) !== 0)) {
                {
                {
                this.state = 1166;
                this.controlBlock();
                }
                }
                this.state = 1171;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1172;
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
    public groupBlock(): GroupBlockContext {
        let localContext = new GroupBlockContext(this.context, this.state);
        this.enterRule(localContext, 120, ClarionParser.RULE_groupBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1174;
            this.match(ClarionParser.GROUP);
            this.state = 1178;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 154, this.context) ) {
            case 1:
                {
                this.state = 1175;
                this.match(ClarionParser.LPAREN);
                this.state = 1176;
                this.match(ClarionParser.STRING);
                this.state = 1177;
                this.match(ClarionParser.RPAREN);
                }
                break;
            }
            this.state = 1183;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 155, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1180;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 1185;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 155, this.context);
            }
            this.state = 1189;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294959100) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33554431) !== 0)) {
                {
                {
                this.state = 1186;
                this.controlBlock();
                }
                }
                this.state = 1191;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1192;
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
        this.enterRule(localContext, 122, ClarionParser.RULE_optionBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1194;
            this.match(ClarionParser.OPTION);
            this.state = 1198;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 157, this.context) ) {
            case 1:
                {
                this.state = 1195;
                this.match(ClarionParser.LPAREN);
                this.state = 1196;
                this.match(ClarionParser.STRING);
                this.state = 1197;
                this.match(ClarionParser.RPAREN);
                }
                break;
            }
            this.state = 1203;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 158, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1200;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 1205;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 158, this.context);
            }
            this.state = 1209;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294959100) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33554431) !== 0)) {
                {
                {
                this.state = 1206;
                this.controlBlock();
                }
                }
                this.state = 1211;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1212;
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
        this.enterRule(localContext, 124, ClarionParser.RULE_controlBlock);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1216;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 160, this.context) ) {
            case 1:
                {
                this.state = 1214;
                this.match(ClarionParser.ID);
                }
                break;
            case 2:
                {
                this.state = 1215;
                this.unknownContent();
                }
                break;
            }
            this.state = 1221;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 161, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1218;
                    this.match(ClarionParser.LINEBREAK);
                    }
                    }
                }
                this.state = 1223;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 161, this.context);
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
        this.enterRule(localContext, 126, ClarionParser.RULE_unknownContent);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1224;
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
    public globalDataSection(): GlobalDataSectionContext {
        let localContext = new GlobalDataSectionContext(this.context, this.state);
        this.enterRule(localContext, 128, ClarionParser.RULE_globalDataSection);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1229;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 162, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 1226;
                    this.globalEntry();
                    }
                    }
                }
                this.state = 1231;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 162, this.context);
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
        this.enterRule(localContext, 130, ClarionParser.RULE_globalEntry);
        try {
            this.state = 1239;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 163, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1232;
                this.includeDirective();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1233;
                this.equateDefinition();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1234;
                this.windowDefinition();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1235;
                this.globalVariable();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1236;
                this.groupBlock();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1237;
                this.queueBlock();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1238;
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
        this.enterRule(localContext, 132, ClarionParser.RULE_includeDirective);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1241;
            this.match(ClarionParser.INCLUDE);
            this.state = 1242;
            this.match(ClarionParser.LPAREN);
            this.state = 1243;
            this.match(ClarionParser.STRING);
            this.state = 1244;
            this.match(ClarionParser.RPAREN);
            this.state = 1247;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76) {
                {
                this.state = 1245;
                this.match(ClarionParser.COMMA);
                this.state = 1246;
                this.match(ClarionParser.ONCE);
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
        this.enterRule(localContext, 134, ClarionParser.RULE_equateDefinition);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1249;
            this.match(ClarionParser.ID);
            this.state = 1250;
            this.match(ClarionParser.EQUATE);
            this.state = 1251;
            this.match(ClarionParser.LPAREN);
            this.state = 1252;
            this.match(ClarionParser.STRING);
            this.state = 1253;
            this.match(ClarionParser.RPAREN);
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
        this.enterRule(localContext, 136, ClarionParser.RULE_globalVariable);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1255;
            this.match(ClarionParser.ID);
            this.state = 1256;
            this.fieldReference();
            this.state = 1261;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 1257;
                this.match(ClarionParser.LPAREN);
                this.state = 1258;
                this.argumentList();
                this.state = 1259;
                this.match(ClarionParser.RPAREN);
                }
            }

            this.state = 1267;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1263;
                this.match(ClarionParser.COMMA);
                this.state = 1264;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 1269;
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
        this.enterRule(localContext, 138, ClarionParser.RULE_fieldReference);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1271;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 86) {
                {
                this.state = 1270;
                this.match(ClarionParser.AMPERSAND);
                }
            }

            this.state = 1273;
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
    public queueBlock(): QueueBlockContext {
        let localContext = new QueueBlockContext(this.context, this.state);
        this.enterRule(localContext, 140, ClarionParser.RULE_queueBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1275;
            this.match(ClarionParser.ID);
            this.state = 1276;
            this.match(ClarionParser.QUEUE);
            this.state = 1280;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 1277;
                this.match(ClarionParser.LPAREN);
                this.state = 1278;
                this.match(ClarionParser.ID);
                this.state = 1279;
                this.match(ClarionParser.RPAREN);
                }
            }

            this.state = 1282;
            this.fieldList();
            this.state = 1283;
            this.match(ClarionParser.END);
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
        this.enterRule(localContext, 142, ClarionParser.RULE_fieldList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1288;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 62) {
                {
                {
                this.state = 1285;
                this.fieldDefinition();
                }
                }
                this.state = 1290;
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
        this.enterRule(localContext, 144, ClarionParser.RULE_fieldDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1291;
            this.match(ClarionParser.ID);
            this.state = 1292;
            this.fieldType();
            this.state = 1297;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1293;
                this.match(ClarionParser.COMMA);
                this.state = 1294;
                this.fieldOptions();
                }
                }
                this.state = 1299;
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
        this.enterRule(localContext, 146, ClarionParser.RULE_fieldType);
        let _la: number;
        try {
            this.state = 1309;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 172, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1300;
                this.match(ClarionParser.ID);
                this.state = 1301;
                this.match(ClarionParser.LPAREN);
                this.state = 1302;
                this.match(ClarionParser.NUMERIC);
                this.state = 1305;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 76) {
                    {
                    this.state = 1303;
                    this.match(ClarionParser.COMMA);
                    this.state = 1304;
                    this.match(ClarionParser.NUMERIC);
                    }
                }

                this.state = 1307;
                this.match(ClarionParser.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1308;
                this.match(ClarionParser.ID);
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
        this.enterRule(localContext, 148, ClarionParser.RULE_fieldOptions);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1311;
            this.match(ClarionParser.ID);
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
        this.enterRule(localContext, 150, ClarionParser.RULE_classDeclaration);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1313;
            this.match(ClarionParser.ID);
            this.state = 1314;
            this.match(ClarionParser.CLASS);
            this.state = 1318;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 173, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 1315;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 1320;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 173, this.context);
            }
            this.state = 1321;
            this.match(ClarionParser.END);
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
        this.enterRule(localContext, 152, ClarionParser.RULE_procedureAttribute);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1323;
            this.match(ClarionParser.ID);
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
        this.enterRule(localContext, 154, ClarionParser.RULE_declarationParameterList);
        try {
            this.state = 1331;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 174, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1325;
                this.match(ClarionParser.LPAREN);
                this.state = 1326;
                this.match(ClarionParser.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1327;
                this.match(ClarionParser.LPAREN);
                this.state = 1328;
                this.declarationParameterListNonEmpty();
                this.state = 1329;
                this.match(ClarionParser.RPAREN);
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
        this.enterRule(localContext, 156, ClarionParser.RULE_declarationParameterListNonEmpty);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1333;
            this.declarationParameter();
            this.state = 1338;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1334;
                this.match(ClarionParser.COMMA);
                this.state = 1335;
                this.declarationParameter();
                }
                }
                this.state = 1340;
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
        this.enterRule(localContext, 158, ClarionParser.RULE_declarationParameter);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1341;
            this.match(ClarionParser.ID);
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
    public fileDeclaration(): FileDeclarationContext {
        let localContext = new FileDeclarationContext(this.context, this.state);
        this.enterRule(localContext, 160, ClarionParser.RULE_fileDeclaration);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1343;
            this.match(ClarionParser.ID);
            this.state = 1344;
            this.match(ClarionParser.FILE);
            this.state = 1346;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 176, this.context) ) {
            case 1:
                {
                this.state = 1345;
                this.fileAttributes();
                }
                break;
            }
            this.state = 1352;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1348;
                this.match(ClarionParser.COMMA);
                this.state = 1349;
                this.fileAttributes();
                }
                }
                this.state = 1354;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1355;
            this.fileStructure();
            this.state = 1356;
            this.match(ClarionParser.END);
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
    public fileAttributes(): FileAttributesContext {
        let localContext = new FileAttributesContext(this.context, this.state);
        this.enterRule(localContext, 162, ClarionParser.RULE_fileAttributes);
        try {
            this.state = 1363;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 178, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1358;
                this.match(ClarionParser.ID);
                this.state = 1359;
                this.match(ClarionParser.LPAREN);
                this.state = 1360;
                this.match(ClarionParser.STRING);
                this.state = 1361;
                this.match(ClarionParser.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1362;
                this.match(ClarionParser.ID);
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
    public fileStructure(): FileStructureContext {
        let localContext = new FileStructureContext(this.context, this.state);
        this.enterRule(localContext, 164, ClarionParser.RULE_fileStructure);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1369;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 42 || _la === 62) {
                {
                this.state = 1367;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ClarionParser.ID:
                    {
                    this.state = 1365;
                    this.keyDefinition();
                    }
                    break;
                case ClarionParser.RECORD:
                    {
                    this.state = 1366;
                    this.recordBlock();
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                }
                this.state = 1371;
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
    public recordBlock(): RecordBlockContext {
        let localContext = new RecordBlockContext(this.context, this.state);
        this.enterRule(localContext, 166, ClarionParser.RULE_recordBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1372;
            this.match(ClarionParser.RECORD);
            this.state = 1377;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1373;
                this.match(ClarionParser.COMMA);
                this.state = 1374;
                this.recordAttribute();
                }
                }
                this.state = 1379;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 1380;
            this.fieldList();
            this.state = 1381;
            this.match(ClarionParser.END);
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
    public recordAttribute(): RecordAttributeContext {
        let localContext = new RecordAttributeContext(this.context, this.state);
        this.enterRule(localContext, 168, ClarionParser.RULE_recordAttribute);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1383;
            this.match(ClarionParser.PRE);
            this.state = 1384;
            this.match(ClarionParser.LPAREN);
            this.state = 1385;
            this.match(ClarionParser.ID);
            this.state = 1386;
            this.match(ClarionParser.RPAREN);
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
    public keyDefinition(): KeyDefinitionContext {
        let localContext = new KeyDefinitionContext(this.context, this.state);
        this.enterRule(localContext, 170, ClarionParser.RULE_keyDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1388;
            this.match(ClarionParser.ID);
            this.state = 1389;
            this.match(ClarionParser.KEY);
            this.state = 1390;
            this.match(ClarionParser.LPAREN);
            this.state = 1391;
            this.keyFields();
            this.state = 1392;
            this.match(ClarionParser.RPAREN);
            this.state = 1397;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1393;
                this.match(ClarionParser.COMMA);
                this.state = 1394;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 1399;
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
    public keyFields(): KeyFieldsContext {
        let localContext = new KeyFieldsContext(this.context, this.state);
        this.enterRule(localContext, 172, ClarionParser.RULE_keyFields);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1400;
            this.match(ClarionParser.ID);
            this.state = 1405;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 1401;
                this.match(ClarionParser.COMMA);
                this.state = 1402;
                this.match(ClarionParser.ID);
                }
                }
                this.state = 1407;
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

    public override sempred(localContext: antlr.ParserRuleContext | null, ruleIndex: number, predIndex: number): boolean {
        switch (ruleIndex) {
        case 30:
            return this.expression_sempred(localContext as ExpressionContext, predIndex);
        case 31:
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
        4,1,88,1409,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,
        7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,
        13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,
        20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,
        26,2,27,7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,32,2,
        33,7,33,2,34,7,34,2,35,7,35,2,36,7,36,2,37,7,37,2,38,7,38,2,39,7,
        39,2,40,7,40,2,41,7,41,2,42,7,42,2,43,7,43,2,44,7,44,2,45,7,45,2,
        46,7,46,2,47,7,47,2,48,7,48,2,49,7,49,2,50,7,50,2,51,7,51,2,52,7,
        52,2,53,7,53,2,54,7,54,2,55,7,55,2,56,7,56,2,57,7,57,2,58,7,58,2,
        59,7,59,2,60,7,60,2,61,7,61,2,62,7,62,2,63,7,63,2,64,7,64,2,65,7,
        65,2,66,7,66,2,67,7,67,2,68,7,68,2,69,7,69,2,70,7,70,2,71,7,71,2,
        72,7,72,2,73,7,73,2,74,7,74,2,75,7,75,2,76,7,76,2,77,7,77,2,78,7,
        78,2,79,7,79,2,80,7,80,2,81,7,81,2,82,7,82,2,83,7,83,2,84,7,84,2,
        85,7,85,2,86,7,86,1,0,5,0,176,8,0,10,0,12,0,179,9,0,1,0,1,0,3,0,
        183,8,0,1,0,5,0,186,8,0,10,0,12,0,189,9,0,1,0,1,0,1,1,1,1,5,1,195,
        8,1,10,1,12,1,198,9,1,1,1,1,1,5,1,202,8,1,10,1,12,1,205,9,1,1,1,
        3,1,208,8,1,1,1,5,1,211,8,1,10,1,12,1,214,9,1,1,1,5,1,217,8,1,10,
        1,12,1,220,9,1,1,1,5,1,223,8,1,10,1,12,1,226,9,1,1,2,1,2,1,2,3,2,
        231,8,2,1,2,3,2,234,8,2,1,2,5,2,237,8,2,10,2,12,2,240,9,2,1,2,3,
        2,243,8,2,1,2,5,2,246,8,2,10,2,12,2,249,9,2,1,2,1,2,5,2,253,8,2,
        10,2,12,2,256,9,2,1,3,5,3,259,8,3,10,3,12,3,262,9,3,1,3,1,3,5,3,
        266,8,3,10,3,12,3,269,9,3,5,3,271,8,3,10,3,12,3,274,9,3,1,4,1,4,
        1,4,1,4,1,4,1,4,1,4,1,4,1,4,1,4,3,4,286,8,4,1,5,1,5,5,5,290,8,5,
        10,5,12,5,293,9,5,1,5,3,5,296,8,5,1,5,5,5,299,8,5,10,5,12,5,302,
        9,5,1,5,5,5,305,8,5,10,5,12,5,308,9,5,1,5,5,5,311,8,5,10,5,12,5,
        314,9,5,1,5,1,5,5,5,318,8,5,10,5,12,5,321,9,5,1,6,1,6,1,6,1,6,1,
        6,5,6,328,8,6,10,6,12,6,331,9,6,1,6,1,6,5,6,335,8,6,10,6,12,6,338,
        9,6,1,6,1,6,5,6,342,8,6,10,6,12,6,345,9,6,1,7,5,7,348,8,7,10,7,12,
        7,351,9,7,1,7,1,7,5,7,355,8,7,10,7,12,7,358,9,7,4,7,360,8,7,11,7,
        12,7,361,1,8,1,8,1,8,1,8,1,8,1,8,5,8,370,8,8,10,8,12,8,373,9,8,3,
        8,375,8,8,1,8,3,8,378,8,8,1,8,1,8,3,8,382,8,8,1,8,3,8,385,8,8,1,
        9,1,9,1,9,3,9,390,8,9,1,9,1,9,3,9,394,8,9,1,9,5,9,397,8,9,10,9,12,
        9,400,9,9,1,9,3,9,403,8,9,1,9,1,9,5,9,407,8,9,10,9,12,9,410,9,9,
        1,9,5,9,413,8,9,10,9,12,9,416,9,9,3,9,418,8,9,1,10,5,10,421,8,10,
        10,10,12,10,424,9,10,1,10,1,10,5,10,428,8,10,10,10,12,10,431,9,10,
        5,10,433,8,10,10,10,12,10,436,9,10,1,11,1,11,1,11,1,11,1,11,1,11,
        1,11,1,11,3,11,446,8,11,1,12,1,12,1,12,1,12,1,12,3,12,453,8,12,1,
        12,1,12,1,12,3,12,458,8,12,1,13,1,13,1,14,1,14,1,15,1,15,1,15,1,
        15,1,15,1,15,1,15,3,15,471,8,15,1,16,1,16,3,16,475,8,16,1,16,1,16,
        1,17,1,17,1,17,3,17,482,8,17,1,17,5,17,485,8,17,10,17,12,17,488,
        9,17,1,17,1,17,5,17,492,8,17,10,17,12,17,495,9,17,1,17,1,17,1,18,
        5,18,500,8,18,10,18,12,18,503,9,18,1,18,1,18,3,18,507,8,18,1,18,
        5,18,510,8,18,10,18,12,18,513,9,18,5,18,515,8,18,10,18,12,18,518,
        9,18,1,19,1,19,1,19,3,19,523,8,19,1,19,1,19,3,19,527,8,19,1,19,5,
        19,530,8,19,10,19,12,19,533,9,19,1,19,3,19,536,8,19,1,19,1,19,5,
        19,540,8,19,10,19,12,19,543,9,19,1,19,5,19,546,8,19,10,19,12,19,
        549,9,19,3,19,551,8,19,1,20,1,20,1,20,1,20,5,20,557,8,20,10,20,12,
        20,560,9,20,1,20,1,20,1,20,1,20,1,20,1,20,3,20,568,8,20,1,20,1,20,
        5,20,572,8,20,10,20,12,20,575,9,20,3,20,577,8,20,1,21,1,21,1,21,
        1,21,1,21,1,21,5,21,585,8,21,10,21,12,21,588,9,21,1,21,4,21,591,
        8,21,11,21,12,21,592,1,21,1,21,1,21,1,21,5,21,599,8,21,10,21,12,
        21,602,9,21,1,21,1,21,1,21,1,21,1,21,1,21,5,21,610,8,21,10,21,12,
        21,613,9,21,1,21,5,21,616,8,21,10,21,12,21,619,9,21,1,21,1,21,1,
        21,1,21,5,21,625,8,21,10,21,12,21,628,9,21,1,21,1,21,5,21,632,8,
        21,10,21,12,21,635,9,21,1,21,1,21,5,21,639,8,21,10,21,12,21,642,
        9,21,1,21,5,21,645,8,21,10,21,12,21,648,9,21,3,21,650,8,21,1,22,
        1,22,1,22,3,22,655,8,22,1,23,1,23,1,23,3,23,660,8,23,1,23,1,23,5,
        23,664,8,23,10,23,12,23,667,9,23,1,23,1,23,5,23,671,8,23,10,23,12,
        23,674,9,23,5,23,676,8,23,10,23,12,23,679,9,23,1,23,5,23,682,8,23,
        10,23,12,23,685,9,23,1,23,1,23,5,23,689,8,23,10,23,12,23,692,9,23,
        1,23,1,23,5,23,696,8,23,10,23,12,23,699,9,23,5,23,701,8,23,10,23,
        12,23,704,9,23,3,23,706,8,23,1,23,3,23,709,8,23,1,24,1,24,1,24,3,
        24,714,8,24,1,24,5,24,717,8,24,10,24,12,24,720,9,24,1,24,5,24,723,
        8,24,10,24,12,24,726,9,24,1,25,1,25,5,25,730,8,25,10,25,12,25,733,
        9,25,1,25,5,25,736,8,25,10,25,12,25,739,9,25,1,25,5,25,742,8,25,
        10,25,12,25,745,9,25,1,25,1,25,1,26,1,26,5,26,751,8,26,10,26,12,
        26,754,9,26,1,26,1,26,5,26,758,8,26,10,26,12,26,761,9,26,1,26,4,
        26,764,8,26,11,26,12,26,765,5,26,768,8,26,10,26,12,26,771,9,26,1,
        26,1,26,5,26,775,8,26,10,26,12,26,778,9,26,1,26,5,26,781,8,26,10,
        26,12,26,784,9,26,3,26,786,8,26,1,26,1,26,1,27,1,27,5,27,792,8,27,
        10,27,12,27,795,9,27,1,27,5,27,798,8,27,10,27,12,27,801,9,27,1,27,
        5,27,804,8,27,10,27,12,27,807,9,27,1,28,1,28,1,28,5,28,812,8,28,
        10,28,12,28,815,9,28,1,28,5,28,818,8,28,10,28,12,28,821,9,28,1,29,
        1,29,1,29,5,29,826,8,29,10,29,12,29,829,9,29,1,29,1,29,3,29,833,
        8,29,1,30,1,30,1,30,1,30,1,30,1,30,1,30,1,30,1,30,5,30,844,8,30,
        10,30,12,30,847,9,30,1,31,1,31,1,31,1,31,1,31,1,31,1,31,1,31,1,31,
        5,31,858,8,31,10,31,12,31,861,9,31,1,32,1,32,1,32,1,32,1,32,1,32,
        1,32,1,32,1,32,1,32,3,32,873,8,32,1,33,1,33,1,33,1,33,1,33,5,33,
        880,8,33,10,33,12,33,883,9,33,1,33,1,33,1,34,1,34,1,34,3,34,890,
        8,34,1,34,1,34,1,35,1,35,1,35,1,35,1,35,1,35,5,35,900,8,35,10,35,
        12,35,903,9,35,3,35,905,8,35,1,36,1,36,1,36,5,36,910,8,36,10,36,
        12,36,913,9,36,3,36,915,8,36,1,37,4,37,918,8,37,11,37,12,37,919,
        1,38,1,38,1,38,1,38,5,38,926,8,38,10,38,12,38,929,9,38,3,38,931,
        8,38,1,38,1,38,1,39,1,39,1,40,1,40,1,41,1,41,1,41,1,41,1,41,1,42,
        1,42,1,42,1,42,1,42,1,42,1,42,1,42,1,42,1,42,1,42,1,42,1,42,3,42,
        957,8,42,1,43,1,43,1,44,1,44,1,45,1,45,1,45,1,45,1,45,3,45,968,8,
        45,1,46,5,46,971,8,46,10,46,12,46,974,9,46,1,47,1,47,1,48,1,48,1,
        48,1,48,1,48,1,48,1,48,5,48,985,8,48,10,48,12,48,988,9,48,1,48,5,
        48,991,8,48,10,48,12,48,994,9,48,1,48,1,48,1,49,1,49,1,50,5,50,1001,
        8,50,10,50,12,50,1004,9,50,1,50,1,50,5,50,1008,8,50,10,50,12,50,
        1011,9,50,5,50,1013,8,50,10,50,12,50,1016,9,50,1,50,1,50,1,51,1,
        51,1,51,1,51,1,51,1,51,3,51,1026,8,51,1,52,1,52,1,53,1,53,1,53,5,
        53,1033,8,53,10,53,12,53,1036,9,53,1,53,4,53,1039,8,53,11,53,12,
        53,1040,1,53,5,53,1044,8,53,10,53,12,53,1047,9,53,1,53,1,53,1,54,
        1,54,1,54,5,54,1054,8,54,10,54,12,54,1057,9,54,1,54,5,54,1060,8,
        54,10,54,12,54,1063,9,54,1,54,5,54,1066,8,54,10,54,12,54,1069,9,
        54,1,54,1,54,1,55,1,55,1,55,1,55,3,55,1077,8,55,1,55,1,55,5,55,1081,
        8,55,10,55,12,55,1084,9,55,1,55,5,55,1087,8,55,10,55,12,55,1090,
        9,55,1,56,1,56,1,56,5,56,1095,8,56,10,56,12,56,1098,9,56,1,56,5,
        56,1101,8,56,10,56,12,56,1104,9,56,1,56,5,56,1107,8,56,10,56,12,
        56,1110,9,56,1,56,1,56,1,57,1,57,1,57,1,57,3,57,1118,8,57,1,57,1,
        57,5,57,1122,8,57,10,57,12,57,1125,9,57,1,57,5,57,1128,8,57,10,57,
        12,57,1131,9,57,1,58,1,58,1,58,5,58,1136,8,58,10,58,12,58,1139,9,
        58,1,58,5,58,1142,8,58,10,58,12,58,1145,9,58,1,58,5,58,1148,8,58,
        10,58,12,58,1151,9,58,1,58,1,58,1,59,1,59,1,59,1,59,3,59,1159,8,
        59,1,59,5,59,1162,8,59,10,59,12,59,1165,9,59,1,59,5,59,1168,8,59,
        10,59,12,59,1171,9,59,1,59,1,59,1,60,1,60,1,60,1,60,3,60,1179,8,
        60,1,60,5,60,1182,8,60,10,60,12,60,1185,9,60,1,60,5,60,1188,8,60,
        10,60,12,60,1191,9,60,1,60,1,60,1,61,1,61,1,61,1,61,3,61,1199,8,
        61,1,61,5,61,1202,8,61,10,61,12,61,1205,9,61,1,61,5,61,1208,8,61,
        10,61,12,61,1211,9,61,1,61,1,61,1,62,1,62,3,62,1217,8,62,1,62,5,
        62,1220,8,62,10,62,12,62,1223,9,62,1,63,1,63,1,64,5,64,1228,8,64,
        10,64,12,64,1231,9,64,1,65,1,65,1,65,1,65,1,65,1,65,1,65,3,65,1240,
        8,65,1,66,1,66,1,66,1,66,1,66,1,66,3,66,1248,8,66,1,67,1,67,1,67,
        1,67,1,67,1,67,1,68,1,68,1,68,1,68,1,68,1,68,3,68,1262,8,68,1,68,
        1,68,5,68,1266,8,68,10,68,12,68,1269,9,68,1,69,3,69,1272,8,69,1,
        69,1,69,1,70,1,70,1,70,1,70,1,70,3,70,1281,8,70,1,70,1,70,1,70,1,
        71,5,71,1287,8,71,10,71,12,71,1290,9,71,1,72,1,72,1,72,1,72,5,72,
        1296,8,72,10,72,12,72,1299,9,72,1,73,1,73,1,73,1,73,1,73,3,73,1306,
        8,73,1,73,1,73,3,73,1310,8,73,1,74,1,74,1,75,1,75,1,75,5,75,1317,
        8,75,10,75,12,75,1320,9,75,1,75,1,75,1,76,1,76,1,77,1,77,1,77,1,
        77,1,77,1,77,3,77,1332,8,77,1,78,1,78,1,78,5,78,1337,8,78,10,78,
        12,78,1340,9,78,1,79,1,79,1,80,1,80,1,80,3,80,1347,8,80,1,80,1,80,
        5,80,1351,8,80,10,80,12,80,1354,9,80,1,80,1,80,1,80,1,81,1,81,1,
        81,1,81,1,81,3,81,1364,8,81,1,82,1,82,5,82,1368,8,82,10,82,12,82,
        1371,9,82,1,83,1,83,1,83,5,83,1376,8,83,10,83,12,83,1379,9,83,1,
        83,1,83,1,83,1,84,1,84,1,84,1,84,1,84,1,85,1,85,1,85,1,85,1,85,1,
        85,1,85,5,85,1396,8,85,10,85,12,85,1399,9,85,1,86,1,86,1,86,5,86,
        1404,8,86,10,86,12,86,1407,9,86,1,86,5,752,793,972,1108,1318,2,60,
        62,87,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,
        42,44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,74,76,78,80,82,84,
        86,88,90,92,94,96,98,100,102,104,106,108,110,112,114,116,118,120,
        122,124,126,128,130,132,134,136,138,140,142,144,146,148,150,152,
        154,156,158,160,162,164,166,168,170,172,0,9,1,0,59,60,3,0,69,69,
        76,76,81,81,1,0,62,63,2,0,71,71,84,84,3,0,1,1,13,13,69,69,4,0,14,
        25,30,32,62,62,78,78,2,0,69,69,76,76,1,0,2,3,2,0,1,1,13,13,1545,
        0,177,1,0,0,0,2,192,1,0,0,0,4,227,1,0,0,0,6,272,1,0,0,0,8,285,1,
        0,0,0,10,287,1,0,0,0,12,322,1,0,0,0,14,359,1,0,0,0,16,363,1,0,0,
        0,18,386,1,0,0,0,20,434,1,0,0,0,22,445,1,0,0,0,24,457,1,0,0,0,26,
        459,1,0,0,0,28,461,1,0,0,0,30,470,1,0,0,0,32,472,1,0,0,0,34,478,
        1,0,0,0,36,516,1,0,0,0,38,519,1,0,0,0,40,576,1,0,0,0,42,649,1,0,
        0,0,44,654,1,0,0,0,46,656,1,0,0,0,48,710,1,0,0,0,50,727,1,0,0,0,
        52,748,1,0,0,0,54,789,1,0,0,0,56,808,1,0,0,0,58,822,1,0,0,0,60,834,
        1,0,0,0,62,848,1,0,0,0,64,872,1,0,0,0,66,874,1,0,0,0,68,886,1,0,
        0,0,70,904,1,0,0,0,72,914,1,0,0,0,74,917,1,0,0,0,76,921,1,0,0,0,
        78,934,1,0,0,0,80,936,1,0,0,0,82,938,1,0,0,0,84,956,1,0,0,0,86,958,
        1,0,0,0,88,960,1,0,0,0,90,962,1,0,0,0,92,972,1,0,0,0,94,975,1,0,
        0,0,96,977,1,0,0,0,98,997,1,0,0,0,100,1002,1,0,0,0,102,1025,1,0,
        0,0,104,1027,1,0,0,0,106,1029,1,0,0,0,108,1050,1,0,0,0,110,1072,
        1,0,0,0,112,1091,1,0,0,0,114,1113,1,0,0,0,116,1132,1,0,0,0,118,1154,
        1,0,0,0,120,1174,1,0,0,0,122,1194,1,0,0,0,124,1216,1,0,0,0,126,1224,
        1,0,0,0,128,1229,1,0,0,0,130,1239,1,0,0,0,132,1241,1,0,0,0,134,1249,
        1,0,0,0,136,1255,1,0,0,0,138,1271,1,0,0,0,140,1275,1,0,0,0,142,1288,
        1,0,0,0,144,1291,1,0,0,0,146,1309,1,0,0,0,148,1311,1,0,0,0,150,1313,
        1,0,0,0,152,1323,1,0,0,0,154,1331,1,0,0,0,156,1333,1,0,0,0,158,1341,
        1,0,0,0,160,1343,1,0,0,0,162,1363,1,0,0,0,164,1369,1,0,0,0,166,1372,
        1,0,0,0,168,1383,1,0,0,0,170,1388,1,0,0,0,172,1400,1,0,0,0,174,176,
        5,69,0,0,175,174,1,0,0,0,176,179,1,0,0,0,177,175,1,0,0,0,177,178,
        1,0,0,0,178,182,1,0,0,0,179,177,1,0,0,0,180,183,3,2,1,0,181,183,
        3,4,2,0,182,180,1,0,0,0,182,181,1,0,0,0,183,187,1,0,0,0,184,186,
        5,69,0,0,185,184,1,0,0,0,186,189,1,0,0,0,187,185,1,0,0,0,187,188,
        1,0,0,0,188,190,1,0,0,0,189,187,1,0,0,0,190,191,5,0,0,1,191,1,1,
        0,0,0,192,196,5,50,0,0,193,195,5,69,0,0,194,193,1,0,0,0,195,198,
        1,0,0,0,196,194,1,0,0,0,196,197,1,0,0,0,197,199,1,0,0,0,198,196,
        1,0,0,0,199,203,3,10,5,0,200,202,5,69,0,0,201,200,1,0,0,0,202,205,
        1,0,0,0,203,201,1,0,0,0,203,204,1,0,0,0,204,207,1,0,0,0,205,203,
        1,0,0,0,206,208,3,128,64,0,207,206,1,0,0,0,207,208,1,0,0,0,208,212,
        1,0,0,0,209,211,5,69,0,0,210,209,1,0,0,0,211,214,1,0,0,0,212,210,
        1,0,0,0,212,213,1,0,0,0,213,218,1,0,0,0,214,212,1,0,0,0,215,217,
        3,18,9,0,216,215,1,0,0,0,217,220,1,0,0,0,218,216,1,0,0,0,218,219,
        1,0,0,0,219,224,1,0,0,0,220,218,1,0,0,0,221,223,5,69,0,0,222,221,
        1,0,0,0,223,226,1,0,0,0,224,222,1,0,0,0,224,225,1,0,0,0,225,3,1,
        0,0,0,226,224,1,0,0,0,227,233,5,51,0,0,228,230,5,80,0,0,229,231,
        5,63,0,0,230,229,1,0,0,0,230,231,1,0,0,0,231,232,1,0,0,0,232,234,
        5,81,0,0,233,228,1,0,0,0,233,234,1,0,0,0,234,238,1,0,0,0,235,237,
        5,69,0,0,236,235,1,0,0,0,237,240,1,0,0,0,238,236,1,0,0,0,238,239,
        1,0,0,0,239,242,1,0,0,0,240,238,1,0,0,0,241,243,3,10,5,0,242,241,
        1,0,0,0,242,243,1,0,0,0,243,247,1,0,0,0,244,246,5,69,0,0,245,244,
        1,0,0,0,246,249,1,0,0,0,247,245,1,0,0,0,247,248,1,0,0,0,248,250,
        1,0,0,0,249,247,1,0,0,0,250,254,3,6,3,0,251,253,5,69,0,0,252,251,
        1,0,0,0,253,256,1,0,0,0,254,252,1,0,0,0,254,255,1,0,0,0,255,5,1,
        0,0,0,256,254,1,0,0,0,257,259,5,69,0,0,258,257,1,0,0,0,259,262,1,
        0,0,0,260,258,1,0,0,0,260,261,1,0,0,0,261,263,1,0,0,0,262,260,1,
        0,0,0,263,267,3,8,4,0,264,266,5,69,0,0,265,264,1,0,0,0,266,269,1,
        0,0,0,267,265,1,0,0,0,267,268,1,0,0,0,268,271,1,0,0,0,269,267,1,
        0,0,0,270,260,1,0,0,0,271,274,1,0,0,0,272,270,1,0,0,0,272,273,1,
        0,0,0,273,7,1,0,0,0,274,272,1,0,0,0,275,286,3,96,48,0,276,286,3,
        18,9,0,277,286,3,42,21,0,278,286,3,150,75,0,279,286,3,140,70,0,280,
        286,3,120,60,0,281,286,3,40,20,0,282,286,3,132,66,0,283,286,3,134,
        67,0,284,286,3,24,12,0,285,275,1,0,0,0,285,276,1,0,0,0,285,277,1,
        0,0,0,285,278,1,0,0,0,285,279,1,0,0,0,285,280,1,0,0,0,285,281,1,
        0,0,0,285,282,1,0,0,0,285,283,1,0,0,0,285,284,1,0,0,0,286,9,1,0,
        0,0,287,291,5,36,0,0,288,290,5,69,0,0,289,288,1,0,0,0,290,293,1,
        0,0,0,291,289,1,0,0,0,291,292,1,0,0,0,292,295,1,0,0,0,293,291,1,
        0,0,0,294,296,3,14,7,0,295,294,1,0,0,0,295,296,1,0,0,0,296,300,1,
        0,0,0,297,299,5,69,0,0,298,297,1,0,0,0,299,302,1,0,0,0,300,298,1,
        0,0,0,300,301,1,0,0,0,301,306,1,0,0,0,302,300,1,0,0,0,303,305,3,
        12,6,0,304,303,1,0,0,0,305,308,1,0,0,0,306,304,1,0,0,0,306,307,1,
        0,0,0,307,312,1,0,0,0,308,306,1,0,0,0,309,311,5,69,0,0,310,309,1,
        0,0,0,311,314,1,0,0,0,312,310,1,0,0,0,312,313,1,0,0,0,313,315,1,
        0,0,0,314,312,1,0,0,0,315,319,5,13,0,0,316,318,5,69,0,0,317,316,
        1,0,0,0,318,321,1,0,0,0,319,317,1,0,0,0,319,320,1,0,0,0,320,11,1,
        0,0,0,321,319,1,0,0,0,322,323,5,37,0,0,323,324,5,80,0,0,324,325,
        5,63,0,0,325,329,5,81,0,0,326,328,5,69,0,0,327,326,1,0,0,0,328,331,
        1,0,0,0,329,327,1,0,0,0,329,330,1,0,0,0,330,332,1,0,0,0,331,329,
        1,0,0,0,332,336,3,14,7,0,333,335,5,69,0,0,334,333,1,0,0,0,335,338,
        1,0,0,0,336,334,1,0,0,0,336,337,1,0,0,0,337,339,1,0,0,0,338,336,
        1,0,0,0,339,343,5,13,0,0,340,342,5,69,0,0,341,340,1,0,0,0,342,345,
        1,0,0,0,343,341,1,0,0,0,343,344,1,0,0,0,344,13,1,0,0,0,345,343,1,
        0,0,0,346,348,5,69,0,0,347,346,1,0,0,0,348,351,1,0,0,0,349,347,1,
        0,0,0,349,350,1,0,0,0,350,352,1,0,0,0,351,349,1,0,0,0,352,356,3,
        16,8,0,353,355,5,69,0,0,354,353,1,0,0,0,355,358,1,0,0,0,356,354,
        1,0,0,0,356,357,1,0,0,0,357,360,1,0,0,0,358,356,1,0,0,0,359,349,
        1,0,0,0,360,361,1,0,0,0,361,359,1,0,0,0,361,362,1,0,0,0,362,15,1,
        0,0,0,363,364,3,58,29,0,364,377,5,4,0,0,365,374,5,80,0,0,366,371,
        3,78,39,0,367,368,5,76,0,0,368,370,3,78,39,0,369,367,1,0,0,0,370,
        373,1,0,0,0,371,369,1,0,0,0,371,372,1,0,0,0,372,375,1,0,0,0,373,
        371,1,0,0,0,374,366,1,0,0,0,374,375,1,0,0,0,375,376,1,0,0,0,376,
        378,5,81,0,0,377,365,1,0,0,0,377,378,1,0,0,0,378,381,1,0,0,0,379,
        380,5,76,0,0,380,382,3,80,40,0,381,379,1,0,0,0,381,382,1,0,0,0,382,
        384,1,0,0,0,383,385,5,85,0,0,384,383,1,0,0,0,384,385,1,0,0,0,385,
        17,1,0,0,0,386,387,3,58,29,0,387,389,5,4,0,0,388,390,3,76,38,0,389,
        388,1,0,0,0,389,390,1,0,0,0,390,393,1,0,0,0,391,392,5,76,0,0,392,
        394,3,80,40,0,393,391,1,0,0,0,393,394,1,0,0,0,394,398,1,0,0,0,395,
        397,5,69,0,0,396,395,1,0,0,0,397,400,1,0,0,0,398,396,1,0,0,0,398,
        399,1,0,0,0,399,402,1,0,0,0,400,398,1,0,0,0,401,403,3,20,10,0,402,
        401,1,0,0,0,402,403,1,0,0,0,403,417,1,0,0,0,404,408,5,39,0,0,405,
        407,5,69,0,0,406,405,1,0,0,0,407,410,1,0,0,0,408,406,1,0,0,0,408,
        409,1,0,0,0,409,414,1,0,0,0,410,408,1,0,0,0,411,413,3,24,12,0,412,
        411,1,0,0,0,413,416,1,0,0,0,414,412,1,0,0,0,414,415,1,0,0,0,415,
        418,1,0,0,0,416,414,1,0,0,0,417,404,1,0,0,0,417,418,1,0,0,0,418,
        19,1,0,0,0,419,421,5,69,0,0,420,419,1,0,0,0,421,424,1,0,0,0,422,
        420,1,0,0,0,422,423,1,0,0,0,423,425,1,0,0,0,424,422,1,0,0,0,425,
        429,3,22,11,0,426,428,5,69,0,0,427,426,1,0,0,0,428,431,1,0,0,0,429,
        427,1,0,0,0,429,430,1,0,0,0,430,433,1,0,0,0,431,429,1,0,0,0,432,
        422,1,0,0,0,433,436,1,0,0,0,434,432,1,0,0,0,434,435,1,0,0,0,435,
        21,1,0,0,0,436,434,1,0,0,0,437,446,3,96,48,0,438,446,3,40,20,0,439,
        446,3,132,66,0,440,446,3,134,67,0,441,446,3,120,60,0,442,446,3,140,
        70,0,443,446,3,150,75,0,444,446,3,10,5,0,445,437,1,0,0,0,445,438,
        1,0,0,0,445,439,1,0,0,0,445,440,1,0,0,0,445,441,1,0,0,0,445,442,
        1,0,0,0,445,443,1,0,0,0,445,444,1,0,0,0,446,23,1,0,0,0,447,458,3,
        32,16,0,448,458,3,82,41,0,449,458,3,42,21,0,450,452,3,26,13,0,451,
        453,3,88,44,0,452,451,1,0,0,0,452,453,1,0,0,0,453,458,1,0,0,0,454,
        458,3,44,22,0,455,458,3,132,66,0,456,458,3,30,15,0,457,447,1,0,0,
        0,457,448,1,0,0,0,457,449,1,0,0,0,457,450,1,0,0,0,457,454,1,0,0,
        0,457,455,1,0,0,0,457,456,1,0,0,0,458,25,1,0,0,0,459,460,3,68,34,
        0,460,27,1,0,0,0,461,462,3,60,30,0,462,29,1,0,0,0,463,464,5,56,0,
        0,464,465,3,58,29,0,465,466,3,88,44,0,466,471,1,0,0,0,467,468,5,
        56,0,0,468,469,5,62,0,0,469,471,3,88,44,0,470,463,1,0,0,0,470,467,
        1,0,0,0,471,31,1,0,0,0,472,474,5,40,0,0,473,475,3,60,30,0,474,473,
        1,0,0,0,474,475,1,0,0,0,475,476,1,0,0,0,476,477,3,88,44,0,477,33,
        1,0,0,0,478,479,3,58,29,0,479,481,5,5,0,0,480,482,5,77,0,0,481,480,
        1,0,0,0,481,482,1,0,0,0,482,486,1,0,0,0,483,485,5,69,0,0,484,483,
        1,0,0,0,485,488,1,0,0,0,486,484,1,0,0,0,486,487,1,0,0,0,487,489,
        1,0,0,0,488,486,1,0,0,0,489,493,3,36,18,0,490,492,5,69,0,0,491,490,
        1,0,0,0,492,495,1,0,0,0,493,491,1,0,0,0,493,494,1,0,0,0,494,496,
        1,0,0,0,495,493,1,0,0,0,496,497,5,13,0,0,497,35,1,0,0,0,498,500,
        5,69,0,0,499,498,1,0,0,0,500,503,1,0,0,0,501,499,1,0,0,0,501,502,
        1,0,0,0,502,506,1,0,0,0,503,501,1,0,0,0,504,507,3,38,19,0,505,507,
        3,40,20,0,506,504,1,0,0,0,506,505,1,0,0,0,507,511,1,0,0,0,508,510,
        5,69,0,0,509,508,1,0,0,0,510,513,1,0,0,0,511,509,1,0,0,0,511,512,
        1,0,0,0,512,515,1,0,0,0,513,511,1,0,0,0,514,501,1,0,0,0,515,518,
        1,0,0,0,516,514,1,0,0,0,516,517,1,0,0,0,517,37,1,0,0,0,518,516,1,
        0,0,0,519,520,3,58,29,0,520,522,5,4,0,0,521,523,3,76,38,0,522,521,
        1,0,0,0,522,523,1,0,0,0,523,526,1,0,0,0,524,525,5,76,0,0,525,527,
        3,80,40,0,526,524,1,0,0,0,526,527,1,0,0,0,527,531,1,0,0,0,528,530,
        5,69,0,0,529,528,1,0,0,0,530,533,1,0,0,0,531,529,1,0,0,0,531,532,
        1,0,0,0,532,535,1,0,0,0,533,531,1,0,0,0,534,536,3,20,10,0,535,534,
        1,0,0,0,535,536,1,0,0,0,536,550,1,0,0,0,537,541,5,39,0,0,538,540,
        5,69,0,0,539,538,1,0,0,0,540,543,1,0,0,0,541,539,1,0,0,0,541,542,
        1,0,0,0,542,547,1,0,0,0,543,541,1,0,0,0,544,546,3,24,12,0,545,544,
        1,0,0,0,546,549,1,0,0,0,547,545,1,0,0,0,547,548,1,0,0,0,548,551,
        1,0,0,0,549,547,1,0,0,0,550,537,1,0,0,0,550,551,1,0,0,0,551,39,1,
        0,0,0,552,553,3,58,29,0,553,558,3,58,29,0,554,555,5,76,0,0,555,557,
        3,58,29,0,556,554,1,0,0,0,557,560,1,0,0,0,558,556,1,0,0,0,558,559,
        1,0,0,0,559,577,1,0,0,0,560,558,1,0,0,0,561,562,3,58,29,0,562,567,
        3,138,69,0,563,564,5,80,0,0,564,565,3,72,36,0,565,566,5,81,0,0,566,
        568,1,0,0,0,567,563,1,0,0,0,567,568,1,0,0,0,568,573,1,0,0,0,569,
        570,5,76,0,0,570,572,3,58,29,0,571,569,1,0,0,0,572,575,1,0,0,0,573,
        571,1,0,0,0,573,574,1,0,0,0,574,577,1,0,0,0,575,573,1,0,0,0,576,
        552,1,0,0,0,576,561,1,0,0,0,577,41,1,0,0,0,578,579,3,58,29,0,579,
        580,5,6,0,0,580,650,1,0,0,0,581,582,3,58,29,0,582,586,5,6,0,0,583,
        585,5,69,0,0,584,583,1,0,0,0,585,588,1,0,0,0,586,584,1,0,0,0,586,
        587,1,0,0,0,587,590,1,0,0,0,588,586,1,0,0,0,589,591,3,24,12,0,590,
        589,1,0,0,0,591,592,1,0,0,0,592,590,1,0,0,0,592,593,1,0,0,0,593,
        650,1,0,0,0,594,595,3,58,29,0,595,596,5,6,0,0,596,600,5,38,0,0,597,
        599,5,69,0,0,598,597,1,0,0,0,599,602,1,0,0,0,600,598,1,0,0,0,600,
        601,1,0,0,0,601,603,1,0,0,0,602,600,1,0,0,0,603,604,3,20,10,0,604,
        650,1,0,0,0,605,606,3,58,29,0,606,607,5,6,0,0,607,611,5,39,0,0,608,
        610,5,69,0,0,609,608,1,0,0,0,610,613,1,0,0,0,611,609,1,0,0,0,611,
        612,1,0,0,0,612,617,1,0,0,0,613,611,1,0,0,0,614,616,3,24,12,0,615,
        614,1,0,0,0,616,619,1,0,0,0,617,615,1,0,0,0,617,618,1,0,0,0,618,
        650,1,0,0,0,619,617,1,0,0,0,620,621,3,58,29,0,621,622,5,6,0,0,622,
        626,5,38,0,0,623,625,5,69,0,0,624,623,1,0,0,0,625,628,1,0,0,0,626,
        624,1,0,0,0,626,627,1,0,0,0,627,629,1,0,0,0,628,626,1,0,0,0,629,
        633,3,20,10,0,630,632,5,69,0,0,631,630,1,0,0,0,632,635,1,0,0,0,633,
        631,1,0,0,0,633,634,1,0,0,0,634,636,1,0,0,0,635,633,1,0,0,0,636,
        640,5,39,0,0,637,639,5,69,0,0,638,637,1,0,0,0,639,642,1,0,0,0,640,
        638,1,0,0,0,640,641,1,0,0,0,641,646,1,0,0,0,642,640,1,0,0,0,643,
        645,3,24,12,0,644,643,1,0,0,0,645,648,1,0,0,0,646,644,1,0,0,0,646,
        647,1,0,0,0,647,650,1,0,0,0,648,646,1,0,0,0,649,578,1,0,0,0,649,
        581,1,0,0,0,649,594,1,0,0,0,649,605,1,0,0,0,649,620,1,0,0,0,650,
        43,1,0,0,0,651,655,3,46,23,0,652,655,3,50,25,0,653,655,3,52,26,0,
        654,651,1,0,0,0,654,652,1,0,0,0,654,653,1,0,0,0,655,45,1,0,0,0,656,
        657,5,7,0,0,657,659,3,60,30,0,658,660,5,8,0,0,659,658,1,0,0,0,659,
        660,1,0,0,0,660,708,1,0,0,0,661,709,3,24,12,0,662,664,5,69,0,0,663,
        662,1,0,0,0,664,667,1,0,0,0,665,663,1,0,0,0,665,666,1,0,0,0,666,
        677,1,0,0,0,667,665,1,0,0,0,668,672,3,24,12,0,669,671,5,69,0,0,670,
        669,1,0,0,0,671,674,1,0,0,0,672,670,1,0,0,0,672,673,1,0,0,0,673,
        676,1,0,0,0,674,672,1,0,0,0,675,668,1,0,0,0,676,679,1,0,0,0,677,
        675,1,0,0,0,677,678,1,0,0,0,678,683,1,0,0,0,679,677,1,0,0,0,680,
        682,3,48,24,0,681,680,1,0,0,0,682,685,1,0,0,0,683,681,1,0,0,0,683,
        684,1,0,0,0,684,705,1,0,0,0,685,683,1,0,0,0,686,690,5,9,0,0,687,
        689,5,69,0,0,688,687,1,0,0,0,689,692,1,0,0,0,690,688,1,0,0,0,690,
        691,1,0,0,0,691,702,1,0,0,0,692,690,1,0,0,0,693,697,3,24,12,0,694,
        696,5,69,0,0,695,694,1,0,0,0,696,699,1,0,0,0,697,695,1,0,0,0,697,
        698,1,0,0,0,698,701,1,0,0,0,699,697,1,0,0,0,700,693,1,0,0,0,701,
        704,1,0,0,0,702,700,1,0,0,0,702,703,1,0,0,0,703,706,1,0,0,0,704,
        702,1,0,0,0,705,686,1,0,0,0,705,706,1,0,0,0,706,707,1,0,0,0,707,
        709,5,13,0,0,708,661,1,0,0,0,708,665,1,0,0,0,709,47,1,0,0,0,710,
        711,5,58,0,0,711,713,3,60,30,0,712,714,5,8,0,0,713,712,1,0,0,0,713,
        714,1,0,0,0,714,718,1,0,0,0,715,717,5,69,0,0,716,715,1,0,0,0,717,
        720,1,0,0,0,718,716,1,0,0,0,718,719,1,0,0,0,719,724,1,0,0,0,720,
        718,1,0,0,0,721,723,3,24,12,0,722,721,1,0,0,0,723,726,1,0,0,0,724,
        722,1,0,0,0,724,725,1,0,0,0,725,49,1,0,0,0,726,724,1,0,0,0,727,731,
        5,10,0,0,728,730,5,69,0,0,729,728,1,0,0,0,730,733,1,0,0,0,731,729,
        1,0,0,0,731,732,1,0,0,0,732,737,1,0,0,0,733,731,1,0,0,0,734,736,
        3,24,12,0,735,734,1,0,0,0,736,739,1,0,0,0,737,735,1,0,0,0,737,738,
        1,0,0,0,738,743,1,0,0,0,739,737,1,0,0,0,740,742,5,69,0,0,741,740,
        1,0,0,0,742,745,1,0,0,0,743,741,1,0,0,0,743,744,1,0,0,0,744,746,
        1,0,0,0,745,743,1,0,0,0,746,747,5,13,0,0,747,51,1,0,0,0,748,752,
        5,11,0,0,749,751,9,0,0,0,750,749,1,0,0,0,751,754,1,0,0,0,752,753,
        1,0,0,0,752,750,1,0,0,0,753,769,1,0,0,0,754,752,1,0,0,0,755,759,
        5,12,0,0,756,758,5,69,0,0,757,756,1,0,0,0,758,761,1,0,0,0,759,757,
        1,0,0,0,759,760,1,0,0,0,760,763,1,0,0,0,761,759,1,0,0,0,762,764,
        3,54,27,0,763,762,1,0,0,0,764,765,1,0,0,0,765,763,1,0,0,0,765,766,
        1,0,0,0,766,768,1,0,0,0,767,755,1,0,0,0,768,771,1,0,0,0,769,767,
        1,0,0,0,769,770,1,0,0,0,770,785,1,0,0,0,771,769,1,0,0,0,772,776,
        5,9,0,0,773,775,5,69,0,0,774,773,1,0,0,0,775,778,1,0,0,0,776,774,
        1,0,0,0,776,777,1,0,0,0,777,782,1,0,0,0,778,776,1,0,0,0,779,781,
        3,24,12,0,780,779,1,0,0,0,781,784,1,0,0,0,782,780,1,0,0,0,782,783,
        1,0,0,0,783,786,1,0,0,0,784,782,1,0,0,0,785,772,1,0,0,0,785,786,
        1,0,0,0,786,787,1,0,0,0,787,788,5,13,0,0,788,53,1,0,0,0,789,793,
        5,12,0,0,790,792,9,0,0,0,791,790,1,0,0,0,792,795,1,0,0,0,793,794,
        1,0,0,0,793,791,1,0,0,0,794,799,1,0,0,0,795,793,1,0,0,0,796,798,
        5,69,0,0,797,796,1,0,0,0,798,801,1,0,0,0,799,797,1,0,0,0,799,800,
        1,0,0,0,800,805,1,0,0,0,801,799,1,0,0,0,802,804,3,24,12,0,803,802,
        1,0,0,0,804,807,1,0,0,0,805,803,1,0,0,0,805,806,1,0,0,0,806,55,1,
        0,0,0,807,805,1,0,0,0,808,809,3,58,29,0,809,813,5,79,0,0,810,812,
        5,69,0,0,811,810,1,0,0,0,812,815,1,0,0,0,813,811,1,0,0,0,813,814,
        1,0,0,0,814,819,1,0,0,0,815,813,1,0,0,0,816,818,3,24,12,0,817,816,
        1,0,0,0,818,821,1,0,0,0,819,817,1,0,0,0,819,820,1,0,0,0,820,57,1,
        0,0,0,821,819,1,0,0,0,822,827,5,62,0,0,823,824,5,78,0,0,824,826,
        5,62,0,0,825,823,1,0,0,0,826,829,1,0,0,0,827,825,1,0,0,0,827,828,
        1,0,0,0,828,832,1,0,0,0,829,827,1,0,0,0,830,831,5,77,0,0,831,833,
        5,62,0,0,832,830,1,0,0,0,832,833,1,0,0,0,833,59,1,0,0,0,834,835,
        6,30,-1,0,835,836,3,62,31,0,836,845,1,0,0,0,837,838,10,3,0,0,838,
        839,5,72,0,0,839,844,3,62,31,0,840,841,10,2,0,0,841,842,5,73,0,0,
        842,844,3,62,31,0,843,837,1,0,0,0,843,840,1,0,0,0,844,847,1,0,0,
        0,845,843,1,0,0,0,845,846,1,0,0,0,846,61,1,0,0,0,847,845,1,0,0,0,
        848,849,6,31,-1,0,849,850,3,64,32,0,850,859,1,0,0,0,851,852,10,3,
        0,0,852,853,5,74,0,0,853,858,3,64,32,0,854,855,10,2,0,0,855,856,
        5,75,0,0,856,858,3,64,32,0,857,851,1,0,0,0,857,854,1,0,0,0,858,861,
        1,0,0,0,859,857,1,0,0,0,859,860,1,0,0,0,860,63,1,0,0,0,861,859,1,
        0,0,0,862,873,3,68,34,0,863,873,3,70,35,0,864,873,3,66,33,0,865,
        873,5,61,0,0,866,873,5,64,0,0,867,873,5,63,0,0,868,869,5,80,0,0,
        869,870,3,60,30,0,870,871,5,81,0,0,871,873,1,0,0,0,872,862,1,0,0,
        0,872,863,1,0,0,0,872,864,1,0,0,0,872,865,1,0,0,0,872,866,1,0,0,
        0,872,867,1,0,0,0,872,868,1,0,0,0,873,65,1,0,0,0,874,875,5,62,0,
        0,875,876,5,82,0,0,876,881,5,62,0,0,877,878,5,78,0,0,878,880,5,62,
        0,0,879,877,1,0,0,0,880,883,1,0,0,0,881,879,1,0,0,0,881,882,1,0,
        0,0,882,884,1,0,0,0,883,881,1,0,0,0,884,885,5,83,0,0,885,67,1,0,
        0,0,886,887,3,70,35,0,887,889,5,80,0,0,888,890,3,72,36,0,889,888,
        1,0,0,0,889,890,1,0,0,0,890,891,1,0,0,0,891,892,5,81,0,0,892,69,
        1,0,0,0,893,894,7,0,0,0,894,895,5,77,0,0,895,905,5,62,0,0,896,901,
        5,62,0,0,897,898,5,77,0,0,898,900,5,62,0,0,899,897,1,0,0,0,900,903,
        1,0,0,0,901,899,1,0,0,0,901,902,1,0,0,0,902,905,1,0,0,0,903,901,
        1,0,0,0,904,893,1,0,0,0,904,896,1,0,0,0,905,71,1,0,0,0,906,911,3,
        74,37,0,907,908,5,76,0,0,908,910,3,74,37,0,909,907,1,0,0,0,910,913,
        1,0,0,0,911,909,1,0,0,0,911,912,1,0,0,0,912,915,1,0,0,0,913,911,
        1,0,0,0,914,906,1,0,0,0,914,915,1,0,0,0,915,73,1,0,0,0,916,918,8,
        1,0,0,917,916,1,0,0,0,918,919,1,0,0,0,919,917,1,0,0,0,919,920,1,
        0,0,0,920,75,1,0,0,0,921,930,5,80,0,0,922,927,3,78,39,0,923,924,
        5,76,0,0,924,926,3,78,39,0,925,923,1,0,0,0,926,929,1,0,0,0,927,925,
        1,0,0,0,927,928,1,0,0,0,928,931,1,0,0,0,929,927,1,0,0,0,930,922,
        1,0,0,0,930,931,1,0,0,0,931,932,1,0,0,0,932,933,5,81,0,0,933,77,
        1,0,0,0,934,935,7,2,0,0,935,79,1,0,0,0,936,937,5,62,0,0,937,81,1,
        0,0,0,938,939,3,84,42,0,939,940,3,86,43,0,940,941,3,60,30,0,941,
        942,3,88,44,0,942,83,1,0,0,0,943,957,3,70,35,0,944,957,5,62,0,0,
        945,946,5,87,0,0,946,957,5,62,0,0,947,948,5,87,0,0,948,949,5,62,
        0,0,949,950,5,82,0,0,950,951,5,62,0,0,951,957,5,83,0,0,952,953,5,
        62,0,0,953,954,5,82,0,0,954,955,5,62,0,0,955,957,5,83,0,0,956,943,
        1,0,0,0,956,944,1,0,0,0,956,945,1,0,0,0,956,947,1,0,0,0,956,952,
        1,0,0,0,957,85,1,0,0,0,958,959,7,3,0,0,959,87,1,0,0,0,960,961,7,
        4,0,0,961,89,1,0,0,0,962,967,3,94,47,0,963,964,5,80,0,0,964,965,
        3,92,46,0,965,966,5,81,0,0,966,968,1,0,0,0,967,963,1,0,0,0,967,968,
        1,0,0,0,968,91,1,0,0,0,969,971,9,0,0,0,970,969,1,0,0,0,971,974,1,
        0,0,0,972,973,1,0,0,0,972,970,1,0,0,0,973,93,1,0,0,0,974,972,1,0,
        0,0,975,976,7,5,0,0,976,95,1,0,0,0,977,978,5,62,0,0,978,979,3,98,
        49,0,979,980,5,80,0,0,980,981,5,63,0,0,981,986,5,81,0,0,982,983,
        5,76,0,0,983,985,3,90,45,0,984,982,1,0,0,0,985,988,1,0,0,0,986,984,
        1,0,0,0,986,987,1,0,0,0,987,992,1,0,0,0,988,986,1,0,0,0,989,991,
        7,6,0,0,990,989,1,0,0,0,991,994,1,0,0,0,992,990,1,0,0,0,992,993,
        1,0,0,0,993,995,1,0,0,0,994,992,1,0,0,0,995,996,3,100,50,0,996,97,
        1,0,0,0,997,998,7,7,0,0,998,99,1,0,0,0,999,1001,5,69,0,0,1000,999,
        1,0,0,0,1001,1004,1,0,0,0,1002,1000,1,0,0,0,1002,1003,1,0,0,0,1003,
        1014,1,0,0,0,1004,1002,1,0,0,0,1005,1009,3,102,51,0,1006,1008,5,
        69,0,0,1007,1006,1,0,0,0,1008,1011,1,0,0,0,1009,1007,1,0,0,0,1009,
        1010,1,0,0,0,1010,1013,1,0,0,0,1011,1009,1,0,0,0,1012,1005,1,0,0,
        0,1013,1016,1,0,0,0,1014,1012,1,0,0,0,1014,1015,1,0,0,0,1015,1017,
        1,0,0,0,1016,1014,1,0,0,0,1017,1018,3,104,52,0,1018,101,1,0,0,0,
        1019,1026,3,106,53,0,1020,1026,3,112,56,0,1021,1026,3,116,58,0,1022,
        1026,3,120,60,0,1023,1026,3,122,61,0,1024,1026,5,69,0,0,1025,1019,
        1,0,0,0,1025,1020,1,0,0,0,1025,1021,1,0,0,0,1025,1022,1,0,0,0,1025,
        1023,1,0,0,0,1025,1024,1,0,0,0,1026,103,1,0,0,0,1027,1028,7,8,0,
        0,1028,105,1,0,0,0,1029,1034,5,26,0,0,1030,1031,5,76,0,0,1031,1033,
        5,62,0,0,1032,1030,1,0,0,0,1033,1036,1,0,0,0,1034,1032,1,0,0,0,1034,
        1035,1,0,0,0,1035,1045,1,0,0,0,1036,1034,1,0,0,0,1037,1039,5,69,
        0,0,1038,1037,1,0,0,0,1039,1040,1,0,0,0,1040,1038,1,0,0,0,1040,1041,
        1,0,0,0,1041,1042,1,0,0,0,1042,1044,3,108,54,0,1043,1038,1,0,0,0,
        1044,1047,1,0,0,0,1045,1043,1,0,0,0,1045,1046,1,0,0,0,1046,1048,
        1,0,0,0,1047,1045,1,0,0,0,1048,1049,3,104,52,0,1049,107,1,0,0,0,
        1050,1055,5,29,0,0,1051,1052,5,76,0,0,1052,1054,5,62,0,0,1053,1051,
        1,0,0,0,1054,1057,1,0,0,0,1055,1053,1,0,0,0,1055,1056,1,0,0,0,1056,
        1061,1,0,0,0,1057,1055,1,0,0,0,1058,1060,5,69,0,0,1059,1058,1,0,
        0,0,1060,1063,1,0,0,0,1061,1059,1,0,0,0,1061,1062,1,0,0,0,1062,1067,
        1,0,0,0,1063,1061,1,0,0,0,1064,1066,3,110,55,0,1065,1064,1,0,0,0,
        1066,1069,1,0,0,0,1067,1065,1,0,0,0,1067,1068,1,0,0,0,1068,1070,
        1,0,0,0,1069,1067,1,0,0,0,1070,1071,3,104,52,0,1071,109,1,0,0,0,
        1072,1076,5,33,0,0,1073,1074,5,80,0,0,1074,1075,5,63,0,0,1075,1077,
        5,81,0,0,1076,1073,1,0,0,0,1076,1077,1,0,0,0,1077,1082,1,0,0,0,1078,
        1079,5,76,0,0,1079,1081,5,62,0,0,1080,1078,1,0,0,0,1081,1084,1,0,
        0,0,1082,1080,1,0,0,0,1082,1083,1,0,0,0,1083,1088,1,0,0,0,1084,1082,
        1,0,0,0,1085,1087,5,69,0,0,1086,1085,1,0,0,0,1087,1090,1,0,0,0,1088,
        1086,1,0,0,0,1088,1089,1,0,0,0,1089,111,1,0,0,0,1090,1088,1,0,0,
        0,1091,1096,5,27,0,0,1092,1093,5,76,0,0,1093,1095,3,90,45,0,1094,
        1092,1,0,0,0,1095,1098,1,0,0,0,1096,1094,1,0,0,0,1096,1097,1,0,0,
        0,1097,1102,1,0,0,0,1098,1096,1,0,0,0,1099,1101,7,6,0,0,1100,1099,
        1,0,0,0,1101,1104,1,0,0,0,1102,1100,1,0,0,0,1102,1103,1,0,0,0,1103,
        1108,1,0,0,0,1104,1102,1,0,0,0,1105,1107,9,0,0,0,1106,1105,1,0,0,
        0,1107,1110,1,0,0,0,1108,1109,1,0,0,0,1108,1106,1,0,0,0,1109,1111,
        1,0,0,0,1110,1108,1,0,0,0,1111,1112,3,104,52,0,1112,113,1,0,0,0,
        1113,1117,5,28,0,0,1114,1115,5,80,0,0,1115,1116,5,63,0,0,1116,1118,
        5,81,0,0,1117,1114,1,0,0,0,1117,1118,1,0,0,0,1118,1123,1,0,0,0,1119,
        1120,5,76,0,0,1120,1122,5,62,0,0,1121,1119,1,0,0,0,1122,1125,1,0,
        0,0,1123,1121,1,0,0,0,1123,1124,1,0,0,0,1124,1129,1,0,0,0,1125,1123,
        1,0,0,0,1126,1128,5,69,0,0,1127,1126,1,0,0,0,1128,1131,1,0,0,0,1129,
        1127,1,0,0,0,1129,1130,1,0,0,0,1130,115,1,0,0,0,1131,1129,1,0,0,
        0,1132,1137,5,53,0,0,1133,1134,5,76,0,0,1134,1136,5,62,0,0,1135,
        1133,1,0,0,0,1136,1139,1,0,0,0,1137,1135,1,0,0,0,1137,1138,1,0,0,
        0,1138,1143,1,0,0,0,1139,1137,1,0,0,0,1140,1142,5,69,0,0,1141,1140,
        1,0,0,0,1142,1145,1,0,0,0,1143,1141,1,0,0,0,1143,1144,1,0,0,0,1144,
        1149,1,0,0,0,1145,1143,1,0,0,0,1146,1148,3,118,59,0,1147,1146,1,
        0,0,0,1148,1151,1,0,0,0,1149,1147,1,0,0,0,1149,1150,1,0,0,0,1150,
        1152,1,0,0,0,1151,1149,1,0,0,0,1152,1153,3,104,52,0,1153,117,1,0,
        0,0,1154,1158,5,54,0,0,1155,1156,5,80,0,0,1156,1157,5,63,0,0,1157,
        1159,5,81,0,0,1158,1155,1,0,0,0,1158,1159,1,0,0,0,1159,1163,1,0,
        0,0,1160,1162,5,69,0,0,1161,1160,1,0,0,0,1162,1165,1,0,0,0,1163,
        1161,1,0,0,0,1163,1164,1,0,0,0,1164,1169,1,0,0,0,1165,1163,1,0,0,
        0,1166,1168,3,124,62,0,1167,1166,1,0,0,0,1168,1171,1,0,0,0,1169,
        1167,1,0,0,0,1169,1170,1,0,0,0,1170,1172,1,0,0,0,1171,1169,1,0,0,
        0,1172,1173,3,104,52,0,1173,119,1,0,0,0,1174,1178,5,45,0,0,1175,
        1176,5,80,0,0,1176,1177,5,63,0,0,1177,1179,5,81,0,0,1178,1175,1,
        0,0,0,1178,1179,1,0,0,0,1179,1183,1,0,0,0,1180,1182,5,69,0,0,1181,
        1180,1,0,0,0,1182,1185,1,0,0,0,1183,1181,1,0,0,0,1183,1184,1,0,0,
        0,1184,1189,1,0,0,0,1185,1183,1,0,0,0,1186,1188,3,124,62,0,1187,
        1186,1,0,0,0,1188,1191,1,0,0,0,1189,1187,1,0,0,0,1189,1190,1,0,0,
        0,1190,1192,1,0,0,0,1191,1189,1,0,0,0,1192,1193,3,104,52,0,1193,
        121,1,0,0,0,1194,1198,5,55,0,0,1195,1196,5,80,0,0,1196,1197,5,63,
        0,0,1197,1199,5,81,0,0,1198,1195,1,0,0,0,1198,1199,1,0,0,0,1199,
        1203,1,0,0,0,1200,1202,5,69,0,0,1201,1200,1,0,0,0,1202,1205,1,0,
        0,0,1203,1201,1,0,0,0,1203,1204,1,0,0,0,1204,1209,1,0,0,0,1205,1203,
        1,0,0,0,1206,1208,3,124,62,0,1207,1206,1,0,0,0,1208,1211,1,0,0,0,
        1209,1207,1,0,0,0,1209,1210,1,0,0,0,1210,1212,1,0,0,0,1211,1209,
        1,0,0,0,1212,1213,3,104,52,0,1213,123,1,0,0,0,1214,1217,5,62,0,0,
        1215,1217,3,126,63,0,1216,1214,1,0,0,0,1216,1215,1,0,0,0,1217,1221,
        1,0,0,0,1218,1220,5,69,0,0,1219,1218,1,0,0,0,1220,1223,1,0,0,0,1221,
        1219,1,0,0,0,1221,1222,1,0,0,0,1222,125,1,0,0,0,1223,1221,1,0,0,
        0,1224,1225,8,8,0,0,1225,127,1,0,0,0,1226,1228,3,130,65,0,1227,1226,
        1,0,0,0,1228,1231,1,0,0,0,1229,1227,1,0,0,0,1229,1230,1,0,0,0,1230,
        129,1,0,0,0,1231,1229,1,0,0,0,1232,1240,3,132,66,0,1233,1240,3,134,
        67,0,1234,1240,3,96,48,0,1235,1240,3,136,68,0,1236,1240,3,120,60,
        0,1237,1240,3,140,70,0,1238,1240,3,150,75,0,1239,1232,1,0,0,0,1239,
        1233,1,0,0,0,1239,1234,1,0,0,0,1239,1235,1,0,0,0,1239,1236,1,0,0,
        0,1239,1237,1,0,0,0,1239,1238,1,0,0,0,1240,131,1,0,0,0,1241,1242,
        5,48,0,0,1242,1243,5,80,0,0,1243,1244,5,63,0,0,1244,1247,5,81,0,
        0,1245,1246,5,76,0,0,1246,1248,5,49,0,0,1247,1245,1,0,0,0,1247,1248,
        1,0,0,0,1248,133,1,0,0,0,1249,1250,5,62,0,0,1250,1251,5,47,0,0,1251,
        1252,5,80,0,0,1252,1253,5,63,0,0,1253,1254,5,81,0,0,1254,135,1,0,
        0,0,1255,1256,5,62,0,0,1256,1261,3,138,69,0,1257,1258,5,80,0,0,1258,
        1259,3,72,36,0,1259,1260,5,81,0,0,1260,1262,1,0,0,0,1261,1257,1,
        0,0,0,1261,1262,1,0,0,0,1262,1267,1,0,0,0,1263,1264,5,76,0,0,1264,
        1266,5,62,0,0,1265,1263,1,0,0,0,1266,1269,1,0,0,0,1267,1265,1,0,
        0,0,1267,1268,1,0,0,0,1268,137,1,0,0,0,1269,1267,1,0,0,0,1270,1272,
        5,86,0,0,1271,1270,1,0,0,0,1271,1272,1,0,0,0,1272,1273,1,0,0,0,1273,
        1274,3,146,73,0,1274,139,1,0,0,0,1275,1276,5,62,0,0,1276,1280,5,
        46,0,0,1277,1278,5,80,0,0,1278,1279,5,62,0,0,1279,1281,5,81,0,0,
        1280,1277,1,0,0,0,1280,1281,1,0,0,0,1281,1282,1,0,0,0,1282,1283,
        3,142,71,0,1283,1284,5,13,0,0,1284,141,1,0,0,0,1285,1287,3,144,72,
        0,1286,1285,1,0,0,0,1287,1290,1,0,0,0,1288,1286,1,0,0,0,1288,1289,
        1,0,0,0,1289,143,1,0,0,0,1290,1288,1,0,0,0,1291,1292,5,62,0,0,1292,
        1297,3,146,73,0,1293,1294,5,76,0,0,1294,1296,3,148,74,0,1295,1293,
        1,0,0,0,1296,1299,1,0,0,0,1297,1295,1,0,0,0,1297,1298,1,0,0,0,1298,
        145,1,0,0,0,1299,1297,1,0,0,0,1300,1301,5,62,0,0,1301,1302,5,80,
        0,0,1302,1305,5,64,0,0,1303,1304,5,76,0,0,1304,1306,5,64,0,0,1305,
        1303,1,0,0,0,1305,1306,1,0,0,0,1306,1307,1,0,0,0,1307,1310,5,81,
        0,0,1308,1310,5,62,0,0,1309,1300,1,0,0,0,1309,1308,1,0,0,0,1310,
        147,1,0,0,0,1311,1312,5,62,0,0,1312,149,1,0,0,0,1313,1314,5,62,0,
        0,1314,1318,5,5,0,0,1315,1317,9,0,0,0,1316,1315,1,0,0,0,1317,1320,
        1,0,0,0,1318,1319,1,0,0,0,1318,1316,1,0,0,0,1319,1321,1,0,0,0,1320,
        1318,1,0,0,0,1321,1322,5,13,0,0,1322,151,1,0,0,0,1323,1324,5,62,
        0,0,1324,153,1,0,0,0,1325,1326,5,80,0,0,1326,1332,5,81,0,0,1327,
        1328,5,80,0,0,1328,1329,3,156,78,0,1329,1330,5,81,0,0,1330,1332,
        1,0,0,0,1331,1325,1,0,0,0,1331,1327,1,0,0,0,1332,155,1,0,0,0,1333,
        1338,3,158,79,0,1334,1335,5,76,0,0,1335,1337,3,158,79,0,1336,1334,
        1,0,0,0,1337,1340,1,0,0,0,1338,1336,1,0,0,0,1338,1339,1,0,0,0,1339,
        157,1,0,0,0,1340,1338,1,0,0,0,1341,1342,5,62,0,0,1342,159,1,0,0,
        0,1343,1344,5,62,0,0,1344,1346,5,41,0,0,1345,1347,3,162,81,0,1346,
        1345,1,0,0,0,1346,1347,1,0,0,0,1347,1352,1,0,0,0,1348,1349,5,76,
        0,0,1349,1351,3,162,81,0,1350,1348,1,0,0,0,1351,1354,1,0,0,0,1352,
        1350,1,0,0,0,1352,1353,1,0,0,0,1353,1355,1,0,0,0,1354,1352,1,0,0,
        0,1355,1356,3,164,82,0,1356,1357,5,13,0,0,1357,161,1,0,0,0,1358,
        1359,5,62,0,0,1359,1360,5,80,0,0,1360,1361,5,63,0,0,1361,1364,5,
        81,0,0,1362,1364,5,62,0,0,1363,1358,1,0,0,0,1363,1362,1,0,0,0,1364,
        163,1,0,0,0,1365,1368,3,170,85,0,1366,1368,3,166,83,0,1367,1365,
        1,0,0,0,1367,1366,1,0,0,0,1368,1371,1,0,0,0,1369,1367,1,0,0,0,1369,
        1370,1,0,0,0,1370,165,1,0,0,0,1371,1369,1,0,0,0,1372,1377,5,42,0,
        0,1373,1374,5,76,0,0,1374,1376,3,168,84,0,1375,1373,1,0,0,0,1376,
        1379,1,0,0,0,1377,1375,1,0,0,0,1377,1378,1,0,0,0,1378,1380,1,0,0,
        0,1379,1377,1,0,0,0,1380,1381,3,142,71,0,1381,1382,5,13,0,0,1382,
        167,1,0,0,0,1383,1384,5,44,0,0,1384,1385,5,80,0,0,1385,1386,5,62,
        0,0,1386,1387,5,81,0,0,1387,169,1,0,0,0,1388,1389,5,62,0,0,1389,
        1390,5,43,0,0,1390,1391,5,80,0,0,1391,1392,3,172,86,0,1392,1397,
        5,81,0,0,1393,1394,5,76,0,0,1394,1396,5,62,0,0,1395,1393,1,0,0,0,
        1396,1399,1,0,0,0,1397,1395,1,0,0,0,1397,1398,1,0,0,0,1398,171,1,
        0,0,0,1399,1397,1,0,0,0,1400,1405,5,62,0,0,1401,1402,5,76,0,0,1402,
        1404,5,62,0,0,1403,1401,1,0,0,0,1404,1407,1,0,0,0,1405,1403,1,0,
        0,0,1405,1406,1,0,0,0,1406,173,1,0,0,0,1407,1405,1,0,0,0,184,177,
        182,187,196,203,207,212,218,224,230,233,238,242,247,254,260,267,
        272,285,291,295,300,306,312,319,329,336,343,349,356,361,371,374,
        377,381,384,389,393,398,402,408,414,417,422,429,434,445,452,457,
        470,474,481,486,493,501,506,511,516,522,526,531,535,541,547,550,
        558,567,573,576,586,592,600,611,617,626,633,640,646,649,654,659,
        665,672,677,683,690,697,702,705,708,713,718,724,731,737,743,752,
        759,765,769,776,782,785,793,799,805,813,819,827,832,843,845,857,
        859,872,881,889,901,904,911,914,919,927,930,956,967,972,986,992,
        1002,1009,1014,1025,1034,1040,1045,1055,1061,1067,1076,1082,1088,
        1096,1102,1108,1117,1123,1129,1137,1143,1149,1158,1163,1169,1178,
        1183,1189,1198,1203,1209,1216,1221,1229,1239,1247,1261,1267,1271,
        1280,1288,1297,1305,1309,1318,1331,1338,1346,1352,1363,1367,1369,
        1377,1397,1405
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!ClarionParser.__ATN) {
            ClarionParser.__ATN = new antlr.ATNDeserializer().deserialize(ClarionParser._serializedATN);
        }

        return ClarionParser.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(ClarionParser.literalNames, ClarionParser.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return ClarionParser.vocabulary;
    }

    private static readonly decisionsToDFA = ClarionParser._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class ClarionFileContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EOF(): antlr.TerminalNode {
        return this.getToken(ClarionParser.EOF, 0)!;
    }
    public program(): ProgramContext | null {
        return this.getRuleContext(0, ProgramContext);
    }
    public memberModule(): MemberModuleContext | null {
        return this.getRuleContext(0, MemberModuleContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_clarionFile;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterClarionFile) {
             listener.enterClarionFile(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitClarionFile) {
             listener.exitClarionFile(this);
        }
    }
}


export class ProgramContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public PROGRAM(): antlr.TerminalNode {
        return this.getToken(ClarionParser.PROGRAM, 0)!;
    }
    public mapSection(): MapSectionContext {
        return this.getRuleContext(0, MapSectionContext)!;
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public globalDataSection(): GlobalDataSectionContext | null {
        return this.getRuleContext(0, GlobalDataSectionContext);
    }
    public procedureDefinition(): ProcedureDefinitionContext[];
    public procedureDefinition(i: number): ProcedureDefinitionContext | null;
    public procedureDefinition(i?: number): ProcedureDefinitionContext[] | ProcedureDefinitionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ProcedureDefinitionContext);
        }

        return this.getRuleContext(i, ProcedureDefinitionContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_program;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterProgram) {
             listener.enterProgram(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitProgram) {
             listener.exitProgram(this);
        }
    }
}


export class MemberModuleContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MEMBER(): antlr.TerminalNode {
        return this.getToken(ClarionParser.MEMBER, 0)!;
    }
    public moduleBody(): ModuleBodyContext {
        return this.getRuleContext(0, ModuleBodyContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public mapSection(): MapSectionContext | null {
        return this.getRuleContext(0, MapSectionContext);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STRING, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_memberModule;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterMemberModule) {
             listener.enterMemberModule(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitMemberModule) {
             listener.exitMemberModule(this);
        }
    }
}


export class ModuleBodyContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public moduleElement(): ModuleElementContext[];
    public moduleElement(i: number): ModuleElementContext | null;
    public moduleElement(i?: number): ModuleElementContext[] | ModuleElementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ModuleElementContext);
        }

        return this.getRuleContext(i, ModuleElementContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_moduleBody;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterModuleBody) {
             listener.enterModuleBody(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitModuleBody) {
             listener.exitModuleBody(this);
        }
    }
}


export class ModuleElementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public windowDefinition(): WindowDefinitionContext | null {
        return this.getRuleContext(0, WindowDefinitionContext);
    }
    public procedureDefinition(): ProcedureDefinitionContext | null {
        return this.getRuleContext(0, ProcedureDefinitionContext);
    }
    public routineDefinition(): RoutineDefinitionContext | null {
        return this.getRuleContext(0, RoutineDefinitionContext);
    }
    public classDeclaration(): ClassDeclarationContext | null {
        return this.getRuleContext(0, ClassDeclarationContext);
    }
    public queueBlock(): QueueBlockContext | null {
        return this.getRuleContext(0, QueueBlockContext);
    }
    public groupBlock(): GroupBlockContext | null {
        return this.getRuleContext(0, GroupBlockContext);
    }
    public variableDeclaration(): VariableDeclarationContext | null {
        return this.getRuleContext(0, VariableDeclarationContext);
    }
    public includeDirective(): IncludeDirectiveContext | null {
        return this.getRuleContext(0, IncludeDirectiveContext);
    }
    public equateDefinition(): EquateDefinitionContext | null {
        return this.getRuleContext(0, EquateDefinitionContext);
    }
    public executableStatement(): ExecutableStatementContext | null {
        return this.getRuleContext(0, ExecutableStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_moduleElement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterModuleElement) {
             listener.enterModuleElement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitModuleElement) {
             listener.exitModuleElement(this);
        }
    }
}


export class MapSectionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MAP(): antlr.TerminalNode {
        return this.getToken(ClarionParser.MAP, 0)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public prototypeList(): PrototypeListContext | null {
        return this.getRuleContext(0, PrototypeListContext);
    }
    public moduleBlock(): ModuleBlockContext[];
    public moduleBlock(i: number): ModuleBlockContext | null;
    public moduleBlock(i?: number): ModuleBlockContext[] | ModuleBlockContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ModuleBlockContext);
        }

        return this.getRuleContext(i, ModuleBlockContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_mapSection;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterMapSection) {
             listener.enterMapSection(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitMapSection) {
             listener.exitMapSection(this);
        }
    }
}


export class ModuleBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MODULE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.MODULE, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionParser.STRING, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public prototypeList(): PrototypeListContext {
        return this.getRuleContext(0, PrototypeListContext)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_moduleBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterModuleBlock) {
             listener.enterModuleBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitModuleBlock) {
             listener.exitModuleBlock(this);
        }
    }
}


export class PrototypeListContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public prototype(): PrototypeContext[];
    public prototype(i: number): PrototypeContext | null;
    public prototype(i?: number): PrototypeContext[] | PrototypeContext | null {
        if (i === undefined) {
            return this.getRuleContexts(PrototypeContext);
        }

        return this.getRuleContext(i, PrototypeContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_prototypeList;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterPrototypeList) {
             listener.enterPrototypeList(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitPrototypeList) {
             listener.exitPrototypeList(this);
        }
    }
}


export class PrototypeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public label(): LabelContext {
        return this.getRuleContext(0, LabelContext)!;
    }
    public PROCEDURE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.PROCEDURE, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public returnType(): ReturnTypeContext | null {
        return this.getRuleContext(0, ReturnTypeContext);
    }
    public SEMI(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.SEMI, 0);
    }
    public parameter(): ParameterContext[];
    public parameter(i: number): ParameterContext | null;
    public parameter(i?: number): ParameterContext[] | ParameterContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ParameterContext);
        }

        return this.getRuleContext(i, ParameterContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_prototype;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterPrototype) {
             listener.enterPrototype(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitPrototype) {
             listener.exitPrototype(this);
        }
    }
}


export class ProcedureDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public label(): LabelContext {
        return this.getRuleContext(0, LabelContext)!;
    }
    public PROCEDURE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.PROCEDURE, 0)!;
    }
    public parameterList(): ParameterListContext | null {
        return this.getRuleContext(0, ParameterListContext);
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.COMMA, 0);
    }
    public returnType(): ReturnTypeContext | null {
        return this.getRuleContext(0, ReturnTypeContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public localDataSection(): LocalDataSectionContext | null {
        return this.getRuleContext(0, LocalDataSectionContext);
    }
    public CODE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.CODE, 0);
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_procedureDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterProcedureDefinition) {
             listener.enterProcedureDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitProcedureDefinition) {
             listener.exitProcedureDefinition(this);
        }
    }
}


export class LocalDataSectionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public localDataEntry(): LocalDataEntryContext[];
    public localDataEntry(i: number): LocalDataEntryContext | null;
    public localDataEntry(i?: number): LocalDataEntryContext[] | LocalDataEntryContext | null {
        if (i === undefined) {
            return this.getRuleContexts(LocalDataEntryContext);
        }

        return this.getRuleContext(i, LocalDataEntryContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_localDataSection;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterLocalDataSection) {
             listener.enterLocalDataSection(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitLocalDataSection) {
             listener.exitLocalDataSection(this);
        }
    }
}


export class LocalDataEntryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public windowDefinition(): WindowDefinitionContext | null {
        return this.getRuleContext(0, WindowDefinitionContext);
    }
    public variableDeclaration(): VariableDeclarationContext | null {
        return this.getRuleContext(0, VariableDeclarationContext);
    }
    public includeDirective(): IncludeDirectiveContext | null {
        return this.getRuleContext(0, IncludeDirectiveContext);
    }
    public equateDefinition(): EquateDefinitionContext | null {
        return this.getRuleContext(0, EquateDefinitionContext);
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
    public mapSection(): MapSectionContext | null {
        return this.getRuleContext(0, MapSectionContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_localDataEntry;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterLocalDataEntry) {
             listener.enterLocalDataEntry(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitLocalDataEntry) {
             listener.exitLocalDataEntry(this);
        }
    }
}


export class ExecutableStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public returnStatement(): ReturnStatementContext | null {
        return this.getRuleContext(0, ReturnStatementContext);
    }
    public assignmentStatement(): AssignmentStatementContext | null {
        return this.getRuleContext(0, AssignmentStatementContext);
    }
    public routineDefinition(): RoutineDefinitionContext | null {
        return this.getRuleContext(0, RoutineDefinitionContext);
    }
    public functionCallStatement(): FunctionCallStatementContext | null {
        return this.getRuleContext(0, FunctionCallStatementContext);
    }
    public statementTerminator(): StatementTerminatorContext | null {
        return this.getRuleContext(0, StatementTerminatorContext);
    }
    public controlStructure(): ControlStructureContext | null {
        return this.getRuleContext(0, ControlStructureContext);
    }
    public includeDirective(): IncludeDirectiveContext | null {
        return this.getRuleContext(0, IncludeDirectiveContext);
    }
    public doStatement(): DoStatementContext | null {
        return this.getRuleContext(0, DoStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_executableStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterExecutableStatement) {
             listener.enterExecutableStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitExecutableStatement) {
             listener.exitExecutableStatement(this);
        }
    }
}


export class FunctionCallStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public functionCall(): FunctionCallContext {
        return this.getRuleContext(0, FunctionCallContext)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_functionCallStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFunctionCallStatement) {
             listener.enterFunctionCallStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitFunctionCallStatement) {
             listener.exitFunctionCallStatement(this);
        }
    }
}


export class ExpressionStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_expressionStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterExpressionStatement) {
             listener.enterExpressionStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitExpressionStatement) {
             listener.exitExpressionStatement(this);
        }
    }
}


export class DoStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public DO(): antlr.TerminalNode {
        return this.getToken(ClarionParser.DO, 0)!;
    }
    public label(): LabelContext | null {
        return this.getRuleContext(0, LabelContext);
    }
    public statementTerminator(): StatementTerminatorContext {
        return this.getRuleContext(0, StatementTerminatorContext)!;
    }
    public ID(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.ID, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_doStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterDoStatement) {
             listener.enterDoStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitDoStatement) {
             listener.exitDoStatement(this);
        }
    }
}


export class ReturnStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public RETURN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RETURN, 0)!;
    }
    public statementTerminator(): StatementTerminatorContext {
        return this.getRuleContext(0, StatementTerminatorContext)!;
    }
    public expression(): ExpressionContext | null {
        return this.getRuleContext(0, ExpressionContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_returnStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterReturnStatement) {
             listener.enterReturnStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitReturnStatement) {
             listener.exitReturnStatement(this);
        }
    }
}


export class ClassDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public label(): LabelContext {
        return this.getRuleContext(0, LabelContext)!;
    }
    public CLASS(): antlr.TerminalNode {
        return this.getToken(ClarionParser.CLASS, 0)!;
    }
    public classBody(): ClassBodyContext {
        return this.getRuleContext(0, ClassBodyContext)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public DOT(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.DOT, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_classDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterClassDefinition) {
             listener.enterClassDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitClassDefinition) {
             listener.exitClassDefinition(this);
        }
    }
}


export class ClassBodyContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public methodDefinition(): MethodDefinitionContext[];
    public methodDefinition(i: number): MethodDefinitionContext | null;
    public methodDefinition(i?: number): MethodDefinitionContext[] | MethodDefinitionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(MethodDefinitionContext);
        }

        return this.getRuleContext(i, MethodDefinitionContext);
    }
    public variableDeclaration(): VariableDeclarationContext[];
    public variableDeclaration(i: number): VariableDeclarationContext | null;
    public variableDeclaration(i?: number): VariableDeclarationContext[] | VariableDeclarationContext | null {
        if (i === undefined) {
            return this.getRuleContexts(VariableDeclarationContext);
        }

        return this.getRuleContext(i, VariableDeclarationContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_classBody;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterClassBody) {
             listener.enterClassBody(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitClassBody) {
             listener.exitClassBody(this);
        }
    }
}


export class MethodDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public label(): LabelContext {
        return this.getRuleContext(0, LabelContext)!;
    }
    public PROCEDURE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.PROCEDURE, 0)!;
    }
    public parameterList(): ParameterListContext | null {
        return this.getRuleContext(0, ParameterListContext);
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.COMMA, 0);
    }
    public returnType(): ReturnTypeContext | null {
        return this.getRuleContext(0, ReturnTypeContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public localDataSection(): LocalDataSectionContext | null {
        return this.getRuleContext(0, LocalDataSectionContext);
    }
    public CODE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.CODE, 0);
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_methodDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterMethodDefinition) {
             listener.enterMethodDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitMethodDefinition) {
             listener.exitMethodDefinition(this);
        }
    }
}


export class VariableDeclarationContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public label(): LabelContext[];
    public label(i: number): LabelContext | null;
    public label(i?: number): LabelContext[] | LabelContext | null {
        if (i === undefined) {
            return this.getRuleContexts(LabelContext);
        }

        return this.getRuleContext(i, LabelContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public fieldReference(): FieldReferenceContext | null {
        return this.getRuleContext(0, FieldReferenceContext);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public argumentList(): ArgumentListContext | null {
        return this.getRuleContext(0, ArgumentListContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_variableDeclaration;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterVariableDeclaration) {
             listener.enterVariableDeclaration(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitVariableDeclaration) {
             listener.exitVariableDeclaration(this);
        }
    }
}


export class RoutineDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public label(): LabelContext {
        return this.getRuleContext(0, LabelContext)!;
    }
    public ROUTINE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.ROUTINE, 0)!;
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public DATA(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.DATA, 0);
    }
    public localDataSection(): LocalDataSectionContext | null {
        return this.getRuleContext(0, LocalDataSectionContext);
    }
    public CODE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.CODE, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_routineDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterRoutineDefinition) {
             listener.enterRoutineDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitRoutineDefinition) {
             listener.exitRoutineDefinition(this);
        }
    }
}


export class ControlStructureContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ifStatement(): IfStatementContext | null {
        return this.getRuleContext(0, IfStatementContext);
    }
    public loopStatement(): LoopStatementContext | null {
        return this.getRuleContext(0, LoopStatementContext);
    }
    public caseStatement(): CaseStatementContext | null {
        return this.getRuleContext(0, CaseStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_controlStructure;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterControlStructure) {
             listener.enterControlStructure(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitControlStructure) {
             listener.exitControlStructure(this);
        }
    }
}


export class IfStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public IF(): antlr.TerminalNode {
        return this.getToken(ClarionParser.IF, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public END(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.END, 0);
    }
    public THEN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.THEN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public elsifClause(): ElsifClauseContext[];
    public elsifClause(i: number): ElsifClauseContext | null;
    public elsifClause(i?: number): ElsifClauseContext[] | ElsifClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ElsifClauseContext);
        }

        return this.getRuleContext(i, ElsifClauseContext);
    }
    public ELSE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.ELSE, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_ifStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterIfStatement) {
             listener.enterIfStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitIfStatement) {
             listener.exitIfStatement(this);
        }
    }
}


export class ElsifClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ELSIF(): antlr.TerminalNode {
        return this.getToken(ClarionParser.ELSIF, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public THEN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.THEN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_elsifClause;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterElsifClause) {
             listener.enterElsifClause(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitElsifClause) {
             listener.exitElsifClause(this);
        }
    }
}


export class LoopStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public LOOP(): antlr.TerminalNode {
        return this.getToken(ClarionParser.LOOP, 0)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_loopStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterLoopStatement) {
             listener.enterLoopStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitLoopStatement) {
             listener.exitLoopStatement(this);
        }
    }
}


export class CaseStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CASE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.CASE, 0)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public OF(): antlr.TerminalNode[];
    public OF(i: number): antlr.TerminalNode | null;
    public OF(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.OF);
    	} else {
    		return this.getToken(ClarionParser.OF, i);
    	}
    }
    public ELSE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.ELSE, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public caseBranch(): CaseBranchContext[];
    public caseBranch(i: number): CaseBranchContext | null;
    public caseBranch(i?: number): CaseBranchContext[] | CaseBranchContext | null {
        if (i === undefined) {
            return this.getRuleContexts(CaseBranchContext);
        }

        return this.getRuleContext(i, CaseBranchContext);
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_caseStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterCaseStatement) {
             listener.enterCaseStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitCaseStatement) {
             listener.exitCaseStatement(this);
        }
    }
}


export class CaseBranchContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public OF(): antlr.TerminalNode {
        return this.getToken(ClarionParser.OF, 0)!;
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_caseBranch;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterCaseBranch) {
             listener.enterCaseBranch(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitCaseBranch) {
             listener.exitCaseBranch(this);
        }
    }
}


export class CaseBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public label(): LabelContext {
        return this.getRuleContext(0, LabelContext)!;
    }
    public ARROW(): antlr.TerminalNode {
        return this.getToken(ClarionParser.ARROW, 0)!;
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public executableStatement(): ExecutableStatementContext[];
    public executableStatement(i: number): ExecutableStatementContext | null;
    public executableStatement(i?: number): ExecutableStatementContext[] | ExecutableStatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExecutableStatementContext);
        }

        return this.getRuleContext(i, ExecutableStatementContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_caseBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterCaseBlock) {
             listener.enterCaseBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitCaseBlock) {
             listener.exitCaseBlock(this);
        }
    }
}


export class LabelContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public COLON(): antlr.TerminalNode[];
    public COLON(i: number): antlr.TerminalNode | null;
    public COLON(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COLON);
    	} else {
    		return this.getToken(ClarionParser.COLON, i);
    	}
    }
    public DOT(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.DOT, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_label;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterLabel) {
             listener.enterLabel(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitLabel) {
             listener.exitLabel(this);
        }
    }
}


export class ExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_expression;
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
        return this.getToken(ClarionParser.PLUS, 0);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public MINUS(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.MINUS, 0);
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterAdditiveExpression) {
             listener.enterAdditiveExpression(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterTermExpression) {
             listener.enterTermExpression(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return ClarionParser.RULE_term;
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
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFactorExpression) {
             listener.enterFactorExpression(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.STAR, 0);
    }
    public factor(): FactorContext {
        return this.getRuleContext(0, FactorContext)!;
    }
    public SLASH(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.SLASH, 0);
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterMultiplicativeExpression) {
             listener.enterMultiplicativeExpression(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return ClarionParser.RULE_factor;
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
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFunctionCallFactor) {
             listener.enterFunctionCallFactor(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.FEQ, 0)!;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFieldEquateFactor) {
             listener.enterFieldEquateFactor(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.NUMERIC, 0)!;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterIntegerFactor) {
             listener.enterIntegerFactor(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterPropertyAccessFactor) {
             listener.enterPropertyAccessFactor(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.STRING, 0)!;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterStringFactor) {
             listener.enterStringFactor(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterDottedIdentifierFactor) {
             listener.enterDottedIdentifierFactor(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterParenthesizedFactor) {
             listener.enterParenthesizedFactor(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public LBRACE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.LBRACE, 0)!;
    }
    public RBRACE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RBRACE, 0)!;
    }
    public COLON(): antlr.TerminalNode[];
    public COLON(i: number): antlr.TerminalNode | null;
    public COLON(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COLON);
    	} else {
    		return this.getToken(ClarionParser.COLON, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_propertyAccess;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterPropertyAccess) {
             listener.enterPropertyAccess(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public argumentList(): ArgumentListContext | null {
        return this.getRuleContext(0, ArgumentListContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_functionCall;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFunctionCall) {
             listener.enterFunctionCall(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    		return this.getTokens(ClarionParser.DOT);
    	} else {
    		return this.getToken(ClarionParser.DOT, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public SELF(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.SELF, 0);
    }
    public PARENT(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.PARENT, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_dottedIdentifier;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterDottedIdentifier) {
             listener.enterDottedIdentifier(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_argumentList;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterArgumentList) {
             listener.enterArgumentList(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    		return this.getTokens(ClarionParser.RPAREN);
    	} else {
    		return this.getToken(ClarionParser.RPAREN, i);
    	}
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_expressionLike;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterExpressionLike) {
             listener.enterExpressionLike(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
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
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_parameterList;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterParameterList) {
             listener.enterParameterList(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STRING, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_parameter;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterParameter) {
             listener.enterParameter(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_returnType;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterReturnType) {
             listener.enterReturnType(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitReturnType) {
             listener.exitReturnType(this);
        }
    }
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
        return ClarionParser.RULE_assignmentStatement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterAssignmentStatement) {
             listener.enterAssignmentStatement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public QUESTION(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.QUESTION, 0);
    }
    public LBRACE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LBRACE, 0);
    }
    public RBRACE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RBRACE, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_assignable;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterAssignable) {
             listener.enterAssignable(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.EQUALS, 0);
    }
    public AMPERSAND_EQUALS(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.AMPERSAND_EQUALS, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_assignmentOperator;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterAssignmentOperator) {
             listener.enterAssignmentOperator(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.STATEMENT_END, 0);
    }
    public LINEBREAK(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LINEBREAK, 0);
    }
    public END(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.END, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_statementTerminator;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterStatementTerminator) {
             listener.enterStatementTerminator(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitStatementTerminator) {
             listener.exitStatementTerminator(this);
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
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public ignoredAttributeContent(): IgnoredAttributeContentContext | null {
        return this.getRuleContext(0, IgnoredAttributeContentContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_ignoredAttribute;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterIgnoredAttribute) {
             listener.enterIgnoredAttribute(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return ClarionParser.RULE_ignoredAttributeContent;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterIgnoredAttributeContent) {
             listener.enterIgnoredAttributeContent(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0);
    }
    public FONT(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.FONT, 0);
    }
    public ICON(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.ICON, 0);
    }
    public AT(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.AT, 0);
    }
    public STATUS(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STATUS, 0);
    }
    public CENTER(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.CENTER, 0);
    }
    public SYSTEM(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.SYSTEM, 0);
    }
    public MAX(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.MAX, 0);
    }
    public MIN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.MIN, 0);
    }
    public IMM(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.IMM, 0);
    }
    public RESIZE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RESIZE, 0);
    }
    public MDI(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.MDI, 0);
    }
    public MODAL(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.MODAL, 0);
    }
    public STD(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STD, 0);
    }
    public MSG(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.MSG, 0);
    }
    public USE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.USE, 0);
    }
    public COLON(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.COLON, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_attributeName;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterAttributeName) {
             listener.enterAttributeName(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public windowType(): WindowTypeContext {
        return this.getRuleContext(0, WindowTypeContext)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionParser.STRING, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public windowBody(): WindowBodyContext {
        return this.getRuleContext(0, WindowBodyContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
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
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_windowDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterWindowDefinition) {
             listener.enterWindowDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.APPLICATION, 0);
    }
    public WINDOW(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.WINDOW, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_windowType;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterWindowType) {
             listener.enterWindowType(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
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
        return ClarionParser.RULE_windowBody;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterWindowBody) {
             listener.enterWindowBody(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.LINEBREAK, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_windowElement;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterWindowElement) {
             listener.enterWindowElement(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.END, 0);
    }
    public STATEMENT_END(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STATEMENT_END, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_endMarker;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterEndMarker) {
             listener.enterEndMarker(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.MENUBAR, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
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
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_menubarBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterMenubarBlock) {
             listener.enterMenubarBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.MENU, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
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
        return ClarionParser.RULE_menuBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterMenuBlock) {
             listener.enterMenuBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ITEM, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_itemDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterItemDefinition) {
             listener.enterItemDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.TOOLBAR, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
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
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_toolbarBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterToolbarBlock) {
             listener.enterToolbarBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.BUTTON, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_buttonDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterButtonDefinition) {
             listener.enterButtonDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.SHEET, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
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
        return ClarionParser.RULE_sheetBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterSheetBlock) {
             listener.enterSheetBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.TAB, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
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
        return ClarionParser.RULE_tabBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterTabBlock) {
             listener.enterTabBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitTabBlock) {
             listener.exitTabBlock(this);
        }
    }
}


export class GroupBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public GROUP(): antlr.TerminalNode {
        return this.getToken(ClarionParser.GROUP, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
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
        return ClarionParser.RULE_groupBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterGroupBlock) {
             listener.enterGroupBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitGroupBlock) {
             listener.exitGroupBlock(this);
        }
    }
}


export class OptionBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public OPTION(): antlr.TerminalNode {
        return this.getToken(ClarionParser.OPTION, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
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
        return ClarionParser.RULE_optionBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterOptionBlock) {
             listener.enterOptionBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0);
    }
    public unknownContent(): UnknownContentContext | null {
        return this.getRuleContext(0, UnknownContentContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.LINEBREAK);
    	} else {
    		return this.getToken(ClarionParser.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_controlBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterControlBlock) {
             listener.enterControlBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.END, 0);
    }
    public STATEMENT_END(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STATEMENT_END, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_unknownContent;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterUnknownContent) {
             listener.enterUnknownContent(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitUnknownContent) {
             listener.exitUnknownContent(this);
        }
    }
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
        return ClarionParser.RULE_globalDataSection;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterGlobalDataSection) {
             listener.enterGlobalDataSection(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return ClarionParser.RULE_globalEntry;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterGlobalEntry) {
             listener.enterGlobalEntry(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.INCLUDE, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionParser.STRING, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.COMMA, 0);
    }
    public ONCE(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.ONCE, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_includeDirective;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterIncludeDirective) {
             listener.enterIncludeDirective(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public EQUATE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.EQUATE, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionParser.STRING, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_equateDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterEquateDefinition) {
             listener.enterEquateDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public fieldReference(): FieldReferenceContext {
        return this.getRuleContext(0, FieldReferenceContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public argumentList(): ArgumentListContext | null {
        return this.getRuleContext(0, ArgumentListContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_globalVariable;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterGlobalVariable) {
             listener.enterGlobalVariable(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.AMPERSAND, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_fieldReference;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFieldReference) {
             listener.enterFieldReference(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitFieldReference) {
             listener.exitFieldReference(this);
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
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public QUEUE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.QUEUE, 0)!;
    }
    public fieldList(): FieldListContext {
        return this.getRuleContext(0, FieldListContext)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_queueBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterQueueBlock) {
             listener.enterQueueBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return ClarionParser.RULE_fieldList;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFieldList) {
             listener.enterFieldList(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public fieldType(): FieldTypeContext {
        return this.getRuleContext(0, FieldTypeContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
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
        return ClarionParser.RULE_fieldDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFieldDefinition) {
             listener.enterFieldDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public NUMERIC(): antlr.TerminalNode[];
    public NUMERIC(i: number): antlr.TerminalNode | null;
    public NUMERIC(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.NUMERIC);
    	} else {
    		return this.getToken(ClarionParser.NUMERIC, i);
    	}
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.COMMA, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_fieldType;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFieldType) {
             listener.enterFieldType(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_fieldOptions;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFieldOptions) {
             listener.enterFieldOptions(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitFieldOptions) {
             listener.exitFieldOptions(this);
        }
    }
}


export class ClassDeclarationContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public CLASS(): antlr.TerminalNode {
        return this.getToken(ClarionParser.CLASS, 0)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_classDeclaration;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterClassDeclaration) {
             listener.enterClassDeclaration(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitClassDeclaration) {
             listener.exitClassDeclaration(this);
        }
    }
}


export class ProcedureAttributeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_procedureAttribute;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterProcedureAttribute) {
             listener.enterProcedureAttribute(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public declarationParameterListNonEmpty(): DeclarationParameterListNonEmptyContext | null {
        return this.getRuleContext(0, DeclarationParameterListNonEmptyContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_declarationParameterList;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterDeclarationParameterList) {
             listener.enterDeclarationParameterList(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_declarationParameterListNonEmpty;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterDeclarationParameterListNonEmpty) {
             listener.enterDeclarationParameterListNonEmpty(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
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
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_declarationParameter;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterDeclarationParameter) {
             listener.enterDeclarationParameter(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitDeclarationParameter) {
             listener.exitDeclarationParameter(this);
        }
    }
}


export class FileDeclarationContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public FILE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.FILE, 0)!;
    }
    public fileStructure(): FileStructureContext {
        return this.getRuleContext(0, FileStructureContext)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public fileAttributes(): FileAttributesContext[];
    public fileAttributes(i: number): FileAttributesContext | null;
    public fileAttributes(i?: number): FileAttributesContext[] | FileAttributesContext | null {
        if (i === undefined) {
            return this.getRuleContexts(FileAttributesContext);
        }

        return this.getRuleContext(i, FileAttributesContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_fileDeclaration;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFileDeclaration) {
             listener.enterFileDeclaration(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitFileDeclaration) {
             listener.exitFileDeclaration(this);
        }
    }
}


export class FileAttributesContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionParser.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_fileAttributes;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFileAttributes) {
             listener.enterFileAttributes(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitFileAttributes) {
             listener.exitFileAttributes(this);
        }
    }
}


export class FileStructureContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public keyDefinition(): KeyDefinitionContext[];
    public keyDefinition(i: number): KeyDefinitionContext | null;
    public keyDefinition(i?: number): KeyDefinitionContext[] | KeyDefinitionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(KeyDefinitionContext);
        }

        return this.getRuleContext(i, KeyDefinitionContext);
    }
    public recordBlock(): RecordBlockContext[];
    public recordBlock(i: number): RecordBlockContext | null;
    public recordBlock(i?: number): RecordBlockContext[] | RecordBlockContext | null {
        if (i === undefined) {
            return this.getRuleContexts(RecordBlockContext);
        }

        return this.getRuleContext(i, RecordBlockContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_fileStructure;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterFileStructure) {
             listener.enterFileStructure(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitFileStructure) {
             listener.exitFileStructure(this);
        }
    }
}


export class RecordBlockContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public RECORD(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RECORD, 0)!;
    }
    public fieldList(): FieldListContext {
        return this.getRuleContext(0, FieldListContext)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionParser.END, 0)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public recordAttribute(): RecordAttributeContext[];
    public recordAttribute(i: number): RecordAttributeContext | null;
    public recordAttribute(i?: number): RecordAttributeContext[] | RecordAttributeContext | null {
        if (i === undefined) {
            return this.getRuleContexts(RecordAttributeContext);
        }

        return this.getRuleContext(i, RecordAttributeContext);
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_recordBlock;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterRecordBlock) {
             listener.enterRecordBlock(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitRecordBlock) {
             listener.exitRecordBlock(this);
        }
    }
}


export class RecordAttributeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public PRE(): antlr.TerminalNode {
        return this.getToken(ClarionParser.PRE, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionParser.ID, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_recordAttribute;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterRecordAttribute) {
             listener.enterRecordAttribute(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitRecordAttribute) {
             listener.exitRecordAttribute(this);
        }
    }
}


export class KeyDefinitionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public KEY(): antlr.TerminalNode {
        return this.getToken(ClarionParser.KEY, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.LPAREN, 0)!;
    }
    public keyFields(): KeyFieldsContext {
        return this.getRuleContext(0, KeyFieldsContext)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionParser.RPAREN, 0)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_keyDefinition;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterKeyDefinition) {
             listener.enterKeyDefinition(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitKeyDefinition) {
             listener.exitKeyDefinition(this);
        }
    }
}


export class KeyFieldsContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.ID);
    	} else {
    		return this.getToken(ClarionParser.ID, i);
    	}
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionParser.COMMA);
    	} else {
    		return this.getToken(ClarionParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionParser.RULE_keyFields;
    }
    public override enterRule(listener: ClarionParserListener): void {
        if(listener.enterKeyFields) {
             listener.enterKeyFields(this);
        }
    }
    public override exitRule(listener: ClarionParserListener): void {
        if(listener.exitKeyFields) {
             listener.exitKeyFields(this);
        }
    }
}
