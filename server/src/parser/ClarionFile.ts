// Generated from server/antlr/ClarionFile.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { ClarionFileListener } from "./ClarionFileListener.js";
// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class ClarionFile extends antlr.Parser {
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
    public static readonly RULE_fileDeclaration = 0;
    public static readonly RULE_fileAttributes = 1;
    public static readonly RULE_fileStructure = 2;
    public static readonly RULE_recordBlock = 3;
    public static readonly RULE_recordAttribute = 4;
    public static readonly RULE_fieldList = 5;
    public static readonly RULE_fieldDefinition = 6;
    public static readonly RULE_fieldType = 7;
    public static readonly RULE_fieldOptions = 8;
    public static readonly RULE_keyDefinition = 9;
    public static readonly RULE_keyFields = 10;

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
        "fileDeclaration", "fileAttributes", "fileStructure", "recordBlock", 
        "recordAttribute", "fieldList", "fieldDefinition", "fieldType", 
        "fieldOptions", "keyDefinition", "keyFields",
    ];

    public get grammarFileName(): string { return "ClarionFile.g4"; }
    public get literalNames(): (string | null)[] { return ClarionFile.literalNames; }
    public get symbolicNames(): (string | null)[] { return ClarionFile.symbolicNames; }
    public get ruleNames(): string[] { return ClarionFile.ruleNames; }
    public get serializedATN(): number[] { return ClarionFile._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, ClarionFile._ATN, ClarionFile.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public fileDeclaration(): FileDeclarationContext {
        let localContext = new FileDeclarationContext(this.context, this.state);
        this.enterRule(localContext, 0, ClarionFile.RULE_fileDeclaration);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 22;
            this.match(ClarionFile.ID);
            this.state = 23;
            this.match(ClarionFile.FILE);
            this.state = 25;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 0, this.context) ) {
            case 1:
                {
                this.state = 24;
                this.fileAttributes();
                }
                break;
            }
            this.state = 31;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 27;
                this.match(ClarionFile.COMMA);
                this.state = 28;
                this.fileAttributes();
                }
                }
                this.state = 33;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 34;
            this.fileStructure();
            this.state = 35;
            this.match(ClarionFile.END);
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
        this.enterRule(localContext, 2, ClarionFile.RULE_fileAttributes);
        try {
            this.state = 42;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 2, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 37;
                this.match(ClarionFile.ID);
                this.state = 38;
                this.match(ClarionFile.LPAREN);
                this.state = 39;
                this.match(ClarionFile.STRING);
                this.state = 40;
                this.match(ClarionFile.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 41;
                this.match(ClarionFile.ID);
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
        this.enterRule(localContext, 4, ClarionFile.RULE_fileStructure);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 48;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 42 || _la === 62) {
                {
                this.state = 46;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ClarionFile.ID:
                    {
                    this.state = 44;
                    this.keyDefinition();
                    }
                    break;
                case ClarionFile.RECORD:
                    {
                    this.state = 45;
                    this.recordBlock();
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                }
                this.state = 50;
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
        this.enterRule(localContext, 6, ClarionFile.RULE_recordBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 51;
            this.match(ClarionFile.RECORD);
            this.state = 56;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 52;
                this.match(ClarionFile.COMMA);
                this.state = 53;
                this.recordAttribute();
                }
                }
                this.state = 58;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 59;
            this.fieldList();
            this.state = 60;
            this.match(ClarionFile.END);
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
        this.enterRule(localContext, 8, ClarionFile.RULE_recordAttribute);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 62;
            this.match(ClarionFile.PRE);
            this.state = 63;
            this.match(ClarionFile.LPAREN);
            this.state = 64;
            this.match(ClarionFile.ID);
            this.state = 65;
            this.match(ClarionFile.RPAREN);
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
        this.enterRule(localContext, 10, ClarionFile.RULE_fieldList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 70;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 62) {
                {
                {
                this.state = 67;
                this.fieldDefinition();
                }
                }
                this.state = 72;
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
        this.enterRule(localContext, 12, ClarionFile.RULE_fieldDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 73;
            this.match(ClarionFile.ID);
            this.state = 74;
            this.fieldType();
            this.state = 79;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 75;
                this.match(ClarionFile.COMMA);
                this.state = 76;
                this.fieldOptions();
                }
                }
                this.state = 81;
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
        this.enterRule(localContext, 14, ClarionFile.RULE_fieldType);
        let _la: number;
        try {
            this.state = 91;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 9, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 82;
                this.match(ClarionFile.ID);
                this.state = 83;
                this.match(ClarionFile.LPAREN);
                this.state = 84;
                this.match(ClarionFile.NUMERIC);
                this.state = 87;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 76) {
                    {
                    this.state = 85;
                    this.match(ClarionFile.COMMA);
                    this.state = 86;
                    this.match(ClarionFile.NUMERIC);
                    }
                }

                this.state = 89;
                this.match(ClarionFile.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 90;
                this.match(ClarionFile.ID);
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
        this.enterRule(localContext, 16, ClarionFile.RULE_fieldOptions);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 93;
            this.match(ClarionFile.ID);
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
        this.enterRule(localContext, 18, ClarionFile.RULE_keyDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 95;
            this.match(ClarionFile.ID);
            this.state = 96;
            this.match(ClarionFile.KEY);
            this.state = 97;
            this.match(ClarionFile.LPAREN);
            this.state = 98;
            this.keyFields();
            this.state = 99;
            this.match(ClarionFile.RPAREN);
            this.state = 104;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 100;
                this.match(ClarionFile.COMMA);
                this.state = 101;
                this.match(ClarionFile.ID);
                }
                }
                this.state = 106;
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
        this.enterRule(localContext, 20, ClarionFile.RULE_keyFields);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 107;
            this.match(ClarionFile.ID);
            this.state = 112;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 108;
                this.match(ClarionFile.COMMA);
                this.state = 109;
                this.match(ClarionFile.ID);
                }
                }
                this.state = 114;
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

    public static readonly _serializedATN: number[] = [
        4,1,88,116,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,
        6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,1,0,1,0,1,0,3,0,26,8,0,1,0,1,
        0,5,0,30,8,0,10,0,12,0,33,9,0,1,0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,3,
        1,43,8,1,1,2,1,2,5,2,47,8,2,10,2,12,2,50,9,2,1,3,1,3,1,3,5,3,55,
        8,3,10,3,12,3,58,9,3,1,3,1,3,1,3,1,4,1,4,1,4,1,4,1,4,1,5,5,5,69,
        8,5,10,5,12,5,72,9,5,1,6,1,6,1,6,1,6,5,6,78,8,6,10,6,12,6,81,9,6,
        1,7,1,7,1,7,1,7,1,7,3,7,88,8,7,1,7,1,7,3,7,92,8,7,1,8,1,8,1,9,1,
        9,1,9,1,9,1,9,1,9,1,9,5,9,103,8,9,10,9,12,9,106,9,9,1,10,1,10,1,
        10,5,10,111,8,10,10,10,12,10,114,9,10,1,10,0,0,11,0,2,4,6,8,10,12,
        14,16,18,20,0,0,116,0,22,1,0,0,0,2,42,1,0,0,0,4,48,1,0,0,0,6,51,
        1,0,0,0,8,62,1,0,0,0,10,70,1,0,0,0,12,73,1,0,0,0,14,91,1,0,0,0,16,
        93,1,0,0,0,18,95,1,0,0,0,20,107,1,0,0,0,22,23,5,62,0,0,23,25,5,41,
        0,0,24,26,3,2,1,0,25,24,1,0,0,0,25,26,1,0,0,0,26,31,1,0,0,0,27,28,
        5,76,0,0,28,30,3,2,1,0,29,27,1,0,0,0,30,33,1,0,0,0,31,29,1,0,0,0,
        31,32,1,0,0,0,32,34,1,0,0,0,33,31,1,0,0,0,34,35,3,4,2,0,35,36,5,
        13,0,0,36,1,1,0,0,0,37,38,5,62,0,0,38,39,5,80,0,0,39,40,5,63,0,0,
        40,43,5,81,0,0,41,43,5,62,0,0,42,37,1,0,0,0,42,41,1,0,0,0,43,3,1,
        0,0,0,44,47,3,18,9,0,45,47,3,6,3,0,46,44,1,0,0,0,46,45,1,0,0,0,47,
        50,1,0,0,0,48,46,1,0,0,0,48,49,1,0,0,0,49,5,1,0,0,0,50,48,1,0,0,
        0,51,56,5,42,0,0,52,53,5,76,0,0,53,55,3,8,4,0,54,52,1,0,0,0,55,58,
        1,0,0,0,56,54,1,0,0,0,56,57,1,0,0,0,57,59,1,0,0,0,58,56,1,0,0,0,
        59,60,3,10,5,0,60,61,5,13,0,0,61,7,1,0,0,0,62,63,5,44,0,0,63,64,
        5,80,0,0,64,65,5,62,0,0,65,66,5,81,0,0,66,9,1,0,0,0,67,69,3,12,6,
        0,68,67,1,0,0,0,69,72,1,0,0,0,70,68,1,0,0,0,70,71,1,0,0,0,71,11,
        1,0,0,0,72,70,1,0,0,0,73,74,5,62,0,0,74,79,3,14,7,0,75,76,5,76,0,
        0,76,78,3,16,8,0,77,75,1,0,0,0,78,81,1,0,0,0,79,77,1,0,0,0,79,80,
        1,0,0,0,80,13,1,0,0,0,81,79,1,0,0,0,82,83,5,62,0,0,83,84,5,80,0,
        0,84,87,5,64,0,0,85,86,5,76,0,0,86,88,5,64,0,0,87,85,1,0,0,0,87,
        88,1,0,0,0,88,89,1,0,0,0,89,92,5,81,0,0,90,92,5,62,0,0,91,82,1,0,
        0,0,91,90,1,0,0,0,92,15,1,0,0,0,93,94,5,62,0,0,94,17,1,0,0,0,95,
        96,5,62,0,0,96,97,5,43,0,0,97,98,5,80,0,0,98,99,3,20,10,0,99,104,
        5,81,0,0,100,101,5,76,0,0,101,103,5,62,0,0,102,100,1,0,0,0,103,106,
        1,0,0,0,104,102,1,0,0,0,104,105,1,0,0,0,105,19,1,0,0,0,106,104,1,
        0,0,0,107,112,5,62,0,0,108,109,5,76,0,0,109,111,5,62,0,0,110,108,
        1,0,0,0,111,114,1,0,0,0,112,110,1,0,0,0,112,113,1,0,0,0,113,21,1,
        0,0,0,114,112,1,0,0,0,12,25,31,42,46,48,56,70,79,87,91,104,112
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!ClarionFile.__ATN) {
            ClarionFile.__ATN = new antlr.ATNDeserializer().deserialize(ClarionFile._serializedATN);
        }

        return ClarionFile.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(ClarionFile.literalNames, ClarionFile.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return ClarionFile.vocabulary;
    }

    private static readonly decisionsToDFA = ClarionFile._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class FileDeclarationContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionFile.ID, 0)!;
    }
    public FILE(): antlr.TerminalNode {
        return this.getToken(ClarionFile.FILE, 0)!;
    }
    public fileStructure(): FileStructureContext {
        return this.getRuleContext(0, FileStructureContext)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionFile.END, 0)!;
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
    		return this.getTokens(ClarionFile.COMMA);
    	} else {
    		return this.getToken(ClarionFile.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionFile.RULE_fileDeclaration;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterFileDeclaration) {
             listener.enterFileDeclaration(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
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
        return this.getToken(ClarionFile.ID, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionFile.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionFile.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionFile.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionFile.RULE_fileAttributes;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterFileAttributes) {
             listener.enterFileAttributes(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
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
        return ClarionFile.RULE_fileStructure;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterFileStructure) {
             listener.enterFileStructure(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
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
        return this.getToken(ClarionFile.RECORD, 0)!;
    }
    public fieldList(): FieldListContext {
        return this.getRuleContext(0, FieldListContext)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ClarionFile.END, 0)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionFile.COMMA);
    	} else {
    		return this.getToken(ClarionFile.COMMA, i);
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
        return ClarionFile.RULE_recordBlock;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterRecordBlock) {
             listener.enterRecordBlock(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
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
        return this.getToken(ClarionFile.PRE, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionFile.LPAREN, 0)!;
    }
    public ID(): antlr.TerminalNode {
        return this.getToken(ClarionFile.ID, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionFile.RPAREN, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionFile.RULE_recordAttribute;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterRecordAttribute) {
             listener.enterRecordAttribute(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
        if(listener.exitRecordAttribute) {
             listener.exitRecordAttribute(this);
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
        return ClarionFile.RULE_fieldList;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterFieldList) {
             listener.enterFieldList(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
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
        return this.getToken(ClarionFile.ID, 0)!;
    }
    public fieldType(): FieldTypeContext {
        return this.getRuleContext(0, FieldTypeContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionFile.COMMA);
    	} else {
    		return this.getToken(ClarionFile.COMMA, i);
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
        return ClarionFile.RULE_fieldDefinition;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterFieldDefinition) {
             listener.enterFieldDefinition(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
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
        return this.getToken(ClarionFile.ID, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionFile.LPAREN, 0);
    }
    public NUMERIC(): antlr.TerminalNode[];
    public NUMERIC(i: number): antlr.TerminalNode | null;
    public NUMERIC(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionFile.NUMERIC);
    	} else {
    		return this.getToken(ClarionFile.NUMERIC, i);
    	}
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionFile.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ClarionFile.COMMA, 0);
    }
    public override get ruleIndex(): number {
        return ClarionFile.RULE_fieldType;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterFieldType) {
             listener.enterFieldType(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
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
        return this.getToken(ClarionFile.ID, 0)!;
    }
    public override get ruleIndex(): number {
        return ClarionFile.RULE_fieldOptions;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterFieldOptions) {
             listener.enterFieldOptions(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
        if(listener.exitFieldOptions) {
             listener.exitFieldOptions(this);
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
    		return this.getTokens(ClarionFile.ID);
    	} else {
    		return this.getToken(ClarionFile.ID, i);
    	}
    }
    public KEY(): antlr.TerminalNode {
        return this.getToken(ClarionFile.KEY, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionFile.LPAREN, 0)!;
    }
    public keyFields(): KeyFieldsContext {
        return this.getRuleContext(0, KeyFieldsContext)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionFile.RPAREN, 0)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionFile.COMMA);
    	} else {
    		return this.getToken(ClarionFile.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionFile.RULE_keyDefinition;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterKeyDefinition) {
             listener.enterKeyDefinition(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
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
    		return this.getTokens(ClarionFile.ID);
    	} else {
    		return this.getToken(ClarionFile.ID, i);
    	}
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionFile.COMMA);
    	} else {
    		return this.getToken(ClarionFile.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionFile.RULE_keyFields;
    }
    public override enterRule(listener: ClarionFileListener): void {
        if(listener.enterKeyFields) {
             listener.enterKeyFields(this);
        }
    }
    public override exitRule(listener: ClarionFileListener): void {
        if(listener.exitKeyFields) {
             listener.exitKeyFields(this);
        }
    }
}
