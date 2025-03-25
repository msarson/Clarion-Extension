// Generated from server/antlr/ClarionUI.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { ClarionUIListener } from "./ClarionUIListener.js";
// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class ClarionUI extends antlr.Parser {
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
    public static readonly RULE_ignoredAttribute = 0;
    public static readonly RULE_ignoredAttributeContent = 1;
    public static readonly RULE_attributeName = 2;
    public static readonly RULE_windowDefinition = 3;
    public static readonly RULE_windowType = 4;
    public static readonly RULE_windowBody = 5;
    public static readonly RULE_windowElement = 6;
    public static readonly RULE_endMarker = 7;
    public static readonly RULE_menubarBlock = 8;
    public static readonly RULE_menuBlock = 9;
    public static readonly RULE_itemDefinition = 10;
    public static readonly RULE_toolbarBlock = 11;
    public static readonly RULE_buttonDefinition = 12;
    public static readonly RULE_sheetBlock = 13;
    public static readonly RULE_tabBlock = 14;
    public static readonly RULE_groupBlock = 15;
    public static readonly RULE_optionBlock = 16;
    public static readonly RULE_controlBlock = 17;
    public static readonly RULE_unknownContent = 18;

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
        "ignoredAttribute", "ignoredAttributeContent", "attributeName", 
        "windowDefinition", "windowType", "windowBody", "windowElement", 
        "endMarker", "menubarBlock", "menuBlock", "itemDefinition", "toolbarBlock", 
        "buttonDefinition", "sheetBlock", "tabBlock", "groupBlock", "optionBlock", 
        "controlBlock", "unknownContent",
    ];

    public get grammarFileName(): string { return "ClarionUI.g4"; }
    public get literalNames(): (string | null)[] { return ClarionUI.literalNames; }
    public get symbolicNames(): (string | null)[] { return ClarionUI.symbolicNames; }
    public get ruleNames(): string[] { return ClarionUI.ruleNames; }
    public get serializedATN(): number[] { return ClarionUI._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, ClarionUI._ATN, ClarionUI.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public ignoredAttribute(): IgnoredAttributeContext {
        let localContext = new IgnoredAttributeContext(this.context, this.state);
        this.enterRule(localContext, 0, ClarionUI.RULE_ignoredAttribute);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 38;
            this.attributeName();
            this.state = 43;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 0, this.context) ) {
            case 1:
                {
                this.state = 39;
                this.match(ClarionUI.LPAREN);
                this.state = 40;
                this.ignoredAttributeContent();
                this.state = 41;
                this.match(ClarionUI.RPAREN);
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
        this.enterRule(localContext, 2, ClarionUI.RULE_ignoredAttributeContent);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 48;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 1, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 45;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 50;
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
            this.exitRule();
        }
        return localContext;
    }
    public attributeName(): AttributeNameContext {
        let localContext = new AttributeNameContext(this.context, this.state);
        this.enterRule(localContext, 4, ClarionUI.RULE_attributeName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 51;
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
        this.enterRule(localContext, 6, ClarionUI.RULE_windowDefinition);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 53;
            this.match(ClarionUI.ID);
            this.state = 54;
            this.windowType();
            this.state = 55;
            this.match(ClarionUI.LPAREN);
            this.state = 56;
            this.match(ClarionUI.STRING);
            this.state = 57;
            this.match(ClarionUI.RPAREN);
            this.state = 62;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 2, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 58;
                    this.match(ClarionUI.COMMA);
                    this.state = 59;
                    this.ignoredAttribute();
                    }
                    }
                }
                this.state = 64;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 2, this.context);
            }
            this.state = 68;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 3, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 65;
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
                this.state = 70;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 3, this.context);
            }
            this.state = 71;
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
        this.enterRule(localContext, 8, ClarionUI.RULE_windowType);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 73;
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
        this.enterRule(localContext, 10, ClarionUI.RULE_windowBody);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 78;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 4, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 75;
                    this.match(ClarionUI.LINEBREAK);
                    }
                    }
                }
                this.state = 80;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 4, this.context);
            }
            this.state = 90;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 26 || _la === 27 || ((((_la - 45)) & ~0x1F) === 0 && ((1 << (_la - 45)) & 16778497) !== 0)) {
                {
                {
                this.state = 81;
                this.windowElement();
                this.state = 85;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 5, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 82;
                        this.match(ClarionUI.LINEBREAK);
                        }
                        }
                    }
                    this.state = 87;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 5, this.context);
                }
                }
                }
                this.state = 92;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 93;
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
        this.enterRule(localContext, 12, ClarionUI.RULE_windowElement);
        try {
            this.state = 101;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ClarionUI.MENUBAR:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 95;
                this.menubarBlock();
                }
                break;
            case ClarionUI.TOOLBAR:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 96;
                this.toolbarBlock();
                }
                break;
            case ClarionUI.SHEET:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 97;
                this.sheetBlock();
                }
                break;
            case ClarionUI.GROUP:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 98;
                this.groupBlock();
                }
                break;
            case ClarionUI.OPTION:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 99;
                this.optionBlock();
                }
                break;
            case ClarionUI.LINEBREAK:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 100;
                this.match(ClarionUI.LINEBREAK);
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
        this.enterRule(localContext, 14, ClarionUI.RULE_endMarker);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 103;
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
        this.enterRule(localContext, 16, ClarionUI.RULE_menubarBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 105;
            this.match(ClarionUI.MENUBAR);
            this.state = 110;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 106;
                this.match(ClarionUI.COMMA);
                this.state = 107;
                this.match(ClarionUI.ID);
                }
                }
                this.state = 112;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 121;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 114;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                do {
                    {
                    {
                    this.state = 113;
                    this.match(ClarionUI.LINEBREAK);
                    }
                    }
                    this.state = 116;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                } while (_la === 69);
                this.state = 118;
                this.menuBlock();
                }
                }
                this.state = 123;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 124;
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
        this.enterRule(localContext, 18, ClarionUI.RULE_menuBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 126;
            this.match(ClarionUI.MENU);
            this.state = 131;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 127;
                this.match(ClarionUI.COMMA);
                this.state = 128;
                this.match(ClarionUI.ID);
                }
                }
                this.state = 133;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 137;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 134;
                this.match(ClarionUI.LINEBREAK);
                }
                }
                this.state = 139;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 143;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 33) {
                {
                {
                this.state = 140;
                this.itemDefinition();
                }
                }
                this.state = 145;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 146;
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
        this.enterRule(localContext, 20, ClarionUI.RULE_itemDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 148;
            this.match(ClarionUI.ITEM);
            this.state = 152;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 149;
                this.match(ClarionUI.LPAREN);
                this.state = 150;
                this.match(ClarionUI.STRING);
                this.state = 151;
                this.match(ClarionUI.RPAREN);
                }
            }

            this.state = 158;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 154;
                this.match(ClarionUI.COMMA);
                this.state = 155;
                this.match(ClarionUI.ID);
                }
                }
                this.state = 160;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 164;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 161;
                this.match(ClarionUI.LINEBREAK);
                }
                }
                this.state = 166;
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
        this.enterRule(localContext, 22, ClarionUI.RULE_toolbarBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 167;
            this.match(ClarionUI.TOOLBAR);
            this.state = 172;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 17, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 168;
                    this.match(ClarionUI.COMMA);
                    this.state = 169;
                    this.ignoredAttribute();
                    }
                    }
                }
                this.state = 174;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 17, this.context);
            }
            this.state = 178;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 18, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 175;
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
                this.state = 180;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 18, this.context);
            }
            this.state = 184;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 19, this.context);
            while (alternative !== 1 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1 + 1) {
                    {
                    {
                    this.state = 181;
                    this.matchWildcard();
                    }
                    }
                }
                this.state = 186;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 19, this.context);
            }
            this.state = 187;
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
        this.enterRule(localContext, 24, ClarionUI.RULE_buttonDefinition);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 189;
            this.match(ClarionUI.BUTTON);
            this.state = 193;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 80) {
                {
                this.state = 190;
                this.match(ClarionUI.LPAREN);
                this.state = 191;
                this.match(ClarionUI.STRING);
                this.state = 192;
                this.match(ClarionUI.RPAREN);
                }
            }

            this.state = 199;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 195;
                this.match(ClarionUI.COMMA);
                this.state = 196;
                this.match(ClarionUI.ID);
                }
                }
                this.state = 201;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 205;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 202;
                this.match(ClarionUI.LINEBREAK);
                }
                }
                this.state = 207;
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
        this.enterRule(localContext, 26, ClarionUI.RULE_sheetBlock);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 208;
            this.match(ClarionUI.SHEET);
            this.state = 213;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 76) {
                {
                {
                this.state = 209;
                this.match(ClarionUI.COMMA);
                this.state = 210;
                this.match(ClarionUI.ID);
                }
                }
                this.state = 215;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 219;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 69) {
                {
                {
                this.state = 216;
                this.match(ClarionUI.LINEBREAK);
                }
                }
                this.state = 221;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 225;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 54) {
                {
                {
                this.state = 222;
                this.tabBlock();
                }
                }
                this.state = 227;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 228;
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
        this.enterRule(localContext, 28, ClarionUI.RULE_tabBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 230;
            this.match(ClarionUI.TAB);
            this.state = 234;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 26, this.context) ) {
            case 1:
                {
                this.state = 231;
                this.match(ClarionUI.LPAREN);
                this.state = 232;
                this.match(ClarionUI.STRING);
                this.state = 233;
                this.match(ClarionUI.RPAREN);
                }
                break;
            }
            this.state = 239;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 27, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 236;
                    this.match(ClarionUI.LINEBREAK);
                    }
                    }
                }
                this.state = 241;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 27, this.context);
            }
            this.state = 245;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294959100) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33554431) !== 0)) {
                {
                {
                this.state = 242;
                this.controlBlock();
                }
                }
                this.state = 247;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 248;
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
        this.enterRule(localContext, 30, ClarionUI.RULE_groupBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 250;
            this.match(ClarionUI.GROUP);
            this.state = 254;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 29, this.context) ) {
            case 1:
                {
                this.state = 251;
                this.match(ClarionUI.LPAREN);
                this.state = 252;
                this.match(ClarionUI.STRING);
                this.state = 253;
                this.match(ClarionUI.RPAREN);
                }
                break;
            }
            this.state = 259;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 30, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 256;
                    this.match(ClarionUI.LINEBREAK);
                    }
                    }
                }
                this.state = 261;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 30, this.context);
            }
            this.state = 265;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294959100) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33554431) !== 0)) {
                {
                {
                this.state = 262;
                this.controlBlock();
                }
                }
                this.state = 267;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 268;
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
        this.enterRule(localContext, 32, ClarionUI.RULE_optionBlock);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 270;
            this.match(ClarionUI.OPTION);
            this.state = 274;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 32, this.context) ) {
            case 1:
                {
                this.state = 271;
                this.match(ClarionUI.LPAREN);
                this.state = 272;
                this.match(ClarionUI.STRING);
                this.state = 273;
                this.match(ClarionUI.RPAREN);
                }
                break;
            }
            this.state = 279;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 33, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 276;
                    this.match(ClarionUI.LINEBREAK);
                    }
                    }
                }
                this.state = 281;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 33, this.context);
            }
            this.state = 285;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 4294959100) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & 33554431) !== 0)) {
                {
                {
                this.state = 282;
                this.controlBlock();
                }
                }
                this.state = 287;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 288;
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
        this.enterRule(localContext, 34, ClarionUI.RULE_controlBlock);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 292;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 35, this.context) ) {
            case 1:
                {
                this.state = 290;
                this.match(ClarionUI.ID);
                }
                break;
            case 2:
                {
                this.state = 291;
                this.unknownContent();
                }
                break;
            }
            this.state = 297;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 36, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 294;
                    this.match(ClarionUI.LINEBREAK);
                    }
                    }
                }
                this.state = 299;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 36, this.context);
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
        this.enterRule(localContext, 36, ClarionUI.RULE_unknownContent);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 300;
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
        4,1,88,303,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,
        6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,13,
        2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,1,0,1,0,1,0,1,
        0,1,0,3,0,44,8,0,1,1,5,1,47,8,1,10,1,12,1,50,9,1,1,2,1,2,1,3,1,3,
        1,3,1,3,1,3,1,3,1,3,5,3,61,8,3,10,3,12,3,64,9,3,1,3,5,3,67,8,3,10,
        3,12,3,70,9,3,1,3,1,3,1,4,1,4,1,5,5,5,77,8,5,10,5,12,5,80,9,5,1,
        5,1,5,5,5,84,8,5,10,5,12,5,87,9,5,5,5,89,8,5,10,5,12,5,92,9,5,1,
        5,1,5,1,6,1,6,1,6,1,6,1,6,1,6,3,6,102,8,6,1,7,1,7,1,8,1,8,1,8,5,
        8,109,8,8,10,8,12,8,112,9,8,1,8,4,8,115,8,8,11,8,12,8,116,1,8,5,
        8,120,8,8,10,8,12,8,123,9,8,1,8,1,8,1,9,1,9,1,9,5,9,130,8,9,10,9,
        12,9,133,9,9,1,9,5,9,136,8,9,10,9,12,9,139,9,9,1,9,5,9,142,8,9,10,
        9,12,9,145,9,9,1,9,1,9,1,10,1,10,1,10,1,10,3,10,153,8,10,1,10,1,
        10,5,10,157,8,10,10,10,12,10,160,9,10,1,10,5,10,163,8,10,10,10,12,
        10,166,9,10,1,11,1,11,1,11,5,11,171,8,11,10,11,12,11,174,9,11,1,
        11,5,11,177,8,11,10,11,12,11,180,9,11,1,11,5,11,183,8,11,10,11,12,
        11,186,9,11,1,11,1,11,1,12,1,12,1,12,1,12,3,12,194,8,12,1,12,1,12,
        5,12,198,8,12,10,12,12,12,201,9,12,1,12,5,12,204,8,12,10,12,12,12,
        207,9,12,1,13,1,13,1,13,5,13,212,8,13,10,13,12,13,215,9,13,1,13,
        5,13,218,8,13,10,13,12,13,221,9,13,1,13,5,13,224,8,13,10,13,12,13,
        227,9,13,1,13,1,13,1,14,1,14,1,14,1,14,3,14,235,8,14,1,14,5,14,238,
        8,14,10,14,12,14,241,9,14,1,14,5,14,244,8,14,10,14,12,14,247,9,14,
        1,14,1,14,1,15,1,15,1,15,1,15,3,15,255,8,15,1,15,5,15,258,8,15,10,
        15,12,15,261,9,15,1,15,5,15,264,8,15,10,15,12,15,267,9,15,1,15,1,
        15,1,16,1,16,1,16,1,16,3,16,275,8,16,1,16,5,16,278,8,16,10,16,12,
        16,281,9,16,1,16,5,16,284,8,16,10,16,12,16,287,9,16,1,16,1,16,1,
        17,1,17,3,17,293,8,17,1,17,5,17,296,8,17,10,17,12,17,299,9,17,1,
        18,1,18,1,18,2,48,184,0,19,0,2,4,6,8,10,12,14,16,18,20,22,24,26,
        28,30,32,34,36,0,4,4,0,14,25,30,32,62,62,78,78,2,0,69,69,76,76,1,
        0,2,3,2,0,1,1,13,13,324,0,38,1,0,0,0,2,48,1,0,0,0,4,51,1,0,0,0,6,
        53,1,0,0,0,8,73,1,0,0,0,10,78,1,0,0,0,12,101,1,0,0,0,14,103,1,0,
        0,0,16,105,1,0,0,0,18,126,1,0,0,0,20,148,1,0,0,0,22,167,1,0,0,0,
        24,189,1,0,0,0,26,208,1,0,0,0,28,230,1,0,0,0,30,250,1,0,0,0,32,270,
        1,0,0,0,34,292,1,0,0,0,36,300,1,0,0,0,38,43,3,4,2,0,39,40,5,80,0,
        0,40,41,3,2,1,0,41,42,5,81,0,0,42,44,1,0,0,0,43,39,1,0,0,0,43,44,
        1,0,0,0,44,1,1,0,0,0,45,47,9,0,0,0,46,45,1,0,0,0,47,50,1,0,0,0,48,
        49,1,0,0,0,48,46,1,0,0,0,49,3,1,0,0,0,50,48,1,0,0,0,51,52,7,0,0,
        0,52,5,1,0,0,0,53,54,5,62,0,0,54,55,3,8,4,0,55,56,5,80,0,0,56,57,
        5,63,0,0,57,62,5,81,0,0,58,59,5,76,0,0,59,61,3,0,0,0,60,58,1,0,0,
        0,61,64,1,0,0,0,62,60,1,0,0,0,62,63,1,0,0,0,63,68,1,0,0,0,64,62,
        1,0,0,0,65,67,7,1,0,0,66,65,1,0,0,0,67,70,1,0,0,0,68,66,1,0,0,0,
        68,69,1,0,0,0,69,71,1,0,0,0,70,68,1,0,0,0,71,72,3,10,5,0,72,7,1,
        0,0,0,73,74,7,2,0,0,74,9,1,0,0,0,75,77,5,69,0,0,76,75,1,0,0,0,77,
        80,1,0,0,0,78,76,1,0,0,0,78,79,1,0,0,0,79,90,1,0,0,0,80,78,1,0,0,
        0,81,85,3,12,6,0,82,84,5,69,0,0,83,82,1,0,0,0,84,87,1,0,0,0,85,83,
        1,0,0,0,85,86,1,0,0,0,86,89,1,0,0,0,87,85,1,0,0,0,88,81,1,0,0,0,
        89,92,1,0,0,0,90,88,1,0,0,0,90,91,1,0,0,0,91,93,1,0,0,0,92,90,1,
        0,0,0,93,94,3,14,7,0,94,11,1,0,0,0,95,102,3,16,8,0,96,102,3,22,11,
        0,97,102,3,26,13,0,98,102,3,30,15,0,99,102,3,32,16,0,100,102,5,69,
        0,0,101,95,1,0,0,0,101,96,1,0,0,0,101,97,1,0,0,0,101,98,1,0,0,0,
        101,99,1,0,0,0,101,100,1,0,0,0,102,13,1,0,0,0,103,104,7,3,0,0,104,
        15,1,0,0,0,105,110,5,26,0,0,106,107,5,76,0,0,107,109,5,62,0,0,108,
        106,1,0,0,0,109,112,1,0,0,0,110,108,1,0,0,0,110,111,1,0,0,0,111,
        121,1,0,0,0,112,110,1,0,0,0,113,115,5,69,0,0,114,113,1,0,0,0,115,
        116,1,0,0,0,116,114,1,0,0,0,116,117,1,0,0,0,117,118,1,0,0,0,118,
        120,3,18,9,0,119,114,1,0,0,0,120,123,1,0,0,0,121,119,1,0,0,0,121,
        122,1,0,0,0,122,124,1,0,0,0,123,121,1,0,0,0,124,125,3,14,7,0,125,
        17,1,0,0,0,126,131,5,29,0,0,127,128,5,76,0,0,128,130,5,62,0,0,129,
        127,1,0,0,0,130,133,1,0,0,0,131,129,1,0,0,0,131,132,1,0,0,0,132,
        137,1,0,0,0,133,131,1,0,0,0,134,136,5,69,0,0,135,134,1,0,0,0,136,
        139,1,0,0,0,137,135,1,0,0,0,137,138,1,0,0,0,138,143,1,0,0,0,139,
        137,1,0,0,0,140,142,3,20,10,0,141,140,1,0,0,0,142,145,1,0,0,0,143,
        141,1,0,0,0,143,144,1,0,0,0,144,146,1,0,0,0,145,143,1,0,0,0,146,
        147,3,14,7,0,147,19,1,0,0,0,148,152,5,33,0,0,149,150,5,80,0,0,150,
        151,5,63,0,0,151,153,5,81,0,0,152,149,1,0,0,0,152,153,1,0,0,0,153,
        158,1,0,0,0,154,155,5,76,0,0,155,157,5,62,0,0,156,154,1,0,0,0,157,
        160,1,0,0,0,158,156,1,0,0,0,158,159,1,0,0,0,159,164,1,0,0,0,160,
        158,1,0,0,0,161,163,5,69,0,0,162,161,1,0,0,0,163,166,1,0,0,0,164,
        162,1,0,0,0,164,165,1,0,0,0,165,21,1,0,0,0,166,164,1,0,0,0,167,172,
        5,27,0,0,168,169,5,76,0,0,169,171,3,0,0,0,170,168,1,0,0,0,171,174,
        1,0,0,0,172,170,1,0,0,0,172,173,1,0,0,0,173,178,1,0,0,0,174,172,
        1,0,0,0,175,177,7,1,0,0,176,175,1,0,0,0,177,180,1,0,0,0,178,176,
        1,0,0,0,178,179,1,0,0,0,179,184,1,0,0,0,180,178,1,0,0,0,181,183,
        9,0,0,0,182,181,1,0,0,0,183,186,1,0,0,0,184,185,1,0,0,0,184,182,
        1,0,0,0,185,187,1,0,0,0,186,184,1,0,0,0,187,188,3,14,7,0,188,23,
        1,0,0,0,189,193,5,28,0,0,190,191,5,80,0,0,191,192,5,63,0,0,192,194,
        5,81,0,0,193,190,1,0,0,0,193,194,1,0,0,0,194,199,1,0,0,0,195,196,
        5,76,0,0,196,198,5,62,0,0,197,195,1,0,0,0,198,201,1,0,0,0,199,197,
        1,0,0,0,199,200,1,0,0,0,200,205,1,0,0,0,201,199,1,0,0,0,202,204,
        5,69,0,0,203,202,1,0,0,0,204,207,1,0,0,0,205,203,1,0,0,0,205,206,
        1,0,0,0,206,25,1,0,0,0,207,205,1,0,0,0,208,213,5,53,0,0,209,210,
        5,76,0,0,210,212,5,62,0,0,211,209,1,0,0,0,212,215,1,0,0,0,213,211,
        1,0,0,0,213,214,1,0,0,0,214,219,1,0,0,0,215,213,1,0,0,0,216,218,
        5,69,0,0,217,216,1,0,0,0,218,221,1,0,0,0,219,217,1,0,0,0,219,220,
        1,0,0,0,220,225,1,0,0,0,221,219,1,0,0,0,222,224,3,28,14,0,223,222,
        1,0,0,0,224,227,1,0,0,0,225,223,1,0,0,0,225,226,1,0,0,0,226,228,
        1,0,0,0,227,225,1,0,0,0,228,229,3,14,7,0,229,27,1,0,0,0,230,234,
        5,54,0,0,231,232,5,80,0,0,232,233,5,63,0,0,233,235,5,81,0,0,234,
        231,1,0,0,0,234,235,1,0,0,0,235,239,1,0,0,0,236,238,5,69,0,0,237,
        236,1,0,0,0,238,241,1,0,0,0,239,237,1,0,0,0,239,240,1,0,0,0,240,
        245,1,0,0,0,241,239,1,0,0,0,242,244,3,34,17,0,243,242,1,0,0,0,244,
        247,1,0,0,0,245,243,1,0,0,0,245,246,1,0,0,0,246,248,1,0,0,0,247,
        245,1,0,0,0,248,249,3,14,7,0,249,29,1,0,0,0,250,254,5,45,0,0,251,
        252,5,80,0,0,252,253,5,63,0,0,253,255,5,81,0,0,254,251,1,0,0,0,254,
        255,1,0,0,0,255,259,1,0,0,0,256,258,5,69,0,0,257,256,1,0,0,0,258,
        261,1,0,0,0,259,257,1,0,0,0,259,260,1,0,0,0,260,265,1,0,0,0,261,
        259,1,0,0,0,262,264,3,34,17,0,263,262,1,0,0,0,264,267,1,0,0,0,265,
        263,1,0,0,0,265,266,1,0,0,0,266,268,1,0,0,0,267,265,1,0,0,0,268,
        269,3,14,7,0,269,31,1,0,0,0,270,274,5,55,0,0,271,272,5,80,0,0,272,
        273,5,63,0,0,273,275,5,81,0,0,274,271,1,0,0,0,274,275,1,0,0,0,275,
        279,1,0,0,0,276,278,5,69,0,0,277,276,1,0,0,0,278,281,1,0,0,0,279,
        277,1,0,0,0,279,280,1,0,0,0,280,285,1,0,0,0,281,279,1,0,0,0,282,
        284,3,34,17,0,283,282,1,0,0,0,284,287,1,0,0,0,285,283,1,0,0,0,285,
        286,1,0,0,0,286,288,1,0,0,0,287,285,1,0,0,0,288,289,3,14,7,0,289,
        33,1,0,0,0,290,293,5,62,0,0,291,293,3,36,18,0,292,290,1,0,0,0,292,
        291,1,0,0,0,293,297,1,0,0,0,294,296,5,69,0,0,295,294,1,0,0,0,296,
        299,1,0,0,0,297,295,1,0,0,0,297,298,1,0,0,0,298,35,1,0,0,0,299,297,
        1,0,0,0,300,301,8,3,0,0,301,37,1,0,0,0,37,43,48,62,68,78,85,90,101,
        110,116,121,131,137,143,152,158,164,172,178,184,193,199,205,213,
        219,225,234,239,245,254,259,265,274,279,285,292,297
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!ClarionUI.__ATN) {
            ClarionUI.__ATN = new antlr.ATNDeserializer().deserialize(ClarionUI._serializedATN);
        }

        return ClarionUI.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(ClarionUI.literalNames, ClarionUI.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return ClarionUI.vocabulary;
    }

    private static readonly decisionsToDFA = ClarionUI._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class IgnoredAttributeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public attributeName(): AttributeNameContext {
        return this.getRuleContext(0, AttributeNameContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.LPAREN, 0);
    }
    public ignoredAttributeContent(): IgnoredAttributeContentContext | null {
        return this.getRuleContext(0, IgnoredAttributeContentContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_ignoredAttribute;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterIgnoredAttribute) {
             listener.enterIgnoredAttribute(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return ClarionUI.RULE_ignoredAttributeContent;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterIgnoredAttributeContent) {
             listener.enterIgnoredAttributeContent(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.ID, 0);
    }
    public FONT(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.FONT, 0);
    }
    public ICON(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.ICON, 0);
    }
    public AT(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.AT, 0);
    }
    public STATUS(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STATUS, 0);
    }
    public CENTER(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.CENTER, 0);
    }
    public SYSTEM(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.SYSTEM, 0);
    }
    public MAX(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.MAX, 0);
    }
    public MIN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.MIN, 0);
    }
    public IMM(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.IMM, 0);
    }
    public RESIZE(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.RESIZE, 0);
    }
    public MDI(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.MDI, 0);
    }
    public MODAL(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.MODAL, 0);
    }
    public STD(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STD, 0);
    }
    public MSG(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.MSG, 0);
    }
    public USE(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.USE, 0);
    }
    public COLON(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.COLON, 0);
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_attributeName;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterAttributeName) {
             listener.enterAttributeName(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.ID, 0)!;
    }
    public windowType(): WindowTypeContext {
        return this.getRuleContext(0, WindowTypeContext)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionUI.LPAREN, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ClarionUI.STRING, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ClarionUI.RPAREN, 0)!;
    }
    public windowBody(): WindowBodyContext {
        return this.getRuleContext(0, WindowBodyContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.COMMA);
    	} else {
    		return this.getToken(ClarionUI.COMMA, i);
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
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_windowDefinition;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterWindowDefinition) {
             listener.enterWindowDefinition(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.APPLICATION, 0);
    }
    public WINDOW(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.WINDOW, 0);
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_windowType;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterWindowType) {
             listener.enterWindowType(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
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
        return ClarionUI.RULE_windowBody;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterWindowBody) {
             listener.enterWindowBody(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.LINEBREAK, 0);
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_windowElement;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterWindowElement) {
             listener.enterWindowElement(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.END, 0);
    }
    public STATEMENT_END(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STATEMENT_END, 0);
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_endMarker;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterEndMarker) {
             listener.enterEndMarker(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.MENUBAR, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.COMMA);
    	} else {
    		return this.getToken(ClarionUI.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.ID);
    	} else {
    		return this.getToken(ClarionUI.ID, i);
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
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_menubarBlock;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterMenubarBlock) {
             listener.enterMenubarBlock(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.MENU, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.COMMA);
    	} else {
    		return this.getToken(ClarionUI.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.ID);
    	} else {
    		return this.getToken(ClarionUI.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
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
        return ClarionUI.RULE_menuBlock;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterMenuBlock) {
             listener.enterMenuBlock(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.ITEM, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.COMMA);
    	} else {
    		return this.getToken(ClarionUI.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.ID);
    	} else {
    		return this.getToken(ClarionUI.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_itemDefinition;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterItemDefinition) {
             listener.enterItemDefinition(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.TOOLBAR, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.COMMA);
    	} else {
    		return this.getToken(ClarionUI.COMMA, i);
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
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_toolbarBlock;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterToolbarBlock) {
             listener.enterToolbarBlock(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.BUTTON, 0)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.COMMA);
    	} else {
    		return this.getToken(ClarionUI.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.ID);
    	} else {
    		return this.getToken(ClarionUI.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_buttonDefinition;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterButtonDefinition) {
             listener.enterButtonDefinition(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.SHEET, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.COMMA);
    	} else {
    		return this.getToken(ClarionUI.COMMA, i);
    	}
    }
    public ID(): antlr.TerminalNode[];
    public ID(i: number): antlr.TerminalNode | null;
    public ID(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.ID);
    	} else {
    		return this.getToken(ClarionUI.ID, i);
    	}
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
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
        return ClarionUI.RULE_sheetBlock;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterSheetBlock) {
             listener.enterSheetBlock(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.TAB, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
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
        return ClarionUI.RULE_tabBlock;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterTabBlock) {
             listener.enterTabBlock(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.GROUP, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
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
        return ClarionUI.RULE_groupBlock;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterGroupBlock) {
             listener.enterGroupBlock(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.OPTION, 0)!;
    }
    public endMarker(): EndMarkerContext {
        return this.getRuleContext(0, EndMarkerContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.LPAREN, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STRING, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.RPAREN, 0);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
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
        return ClarionUI.RULE_optionBlock;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterOptionBlock) {
             listener.enterOptionBlock(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.ID, 0);
    }
    public unknownContent(): UnknownContentContext | null {
        return this.getRuleContext(0, UnknownContentContext);
    }
    public LINEBREAK(): antlr.TerminalNode[];
    public LINEBREAK(i: number): antlr.TerminalNode | null;
    public LINEBREAK(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ClarionUI.LINEBREAK);
    	} else {
    		return this.getToken(ClarionUI.LINEBREAK, i);
    	}
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_controlBlock;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterControlBlock) {
             listener.enterControlBlock(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
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
        return this.getToken(ClarionUI.END, 0);
    }
    public STATEMENT_END(): antlr.TerminalNode | null {
        return this.getToken(ClarionUI.STATEMENT_END, 0);
    }
    public override get ruleIndex(): number {
        return ClarionUI.RULE_unknownContent;
    }
    public override enterRule(listener: ClarionUIListener): void {
        if(listener.enterUnknownContent) {
             listener.enterUnknownContent(this);
        }
    }
    public override exitRule(listener: ClarionUIListener): void {
        if(listener.exitUnknownContent) {
             listener.exitUnknownContent(this);
        }
    }
}
