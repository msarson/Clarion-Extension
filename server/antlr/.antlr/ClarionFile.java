// Generated from f:/github/Clarion-Extension/Clarion-Extension/server/antlr/ClarionFile.g4 by ANTLR 4.13.1
import org.antlr.v4.runtime.atn.*;
import org.antlr.v4.runtime.dfa.DFA;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.misc.*;
import org.antlr.v4.runtime.tree.*;
import java.util.List;
import java.util.Iterator;
import java.util.ArrayList;

@SuppressWarnings({"all", "warnings", "unchecked", "unused", "cast", "CheckReturnValue"})
public class ClarionFile extends Parser {
	static { RuntimeMetaData.checkVersion("4.13.1", RuntimeMetaData.VERSION); }

	protected static final DFA[] _decisionToDFA;
	protected static final PredictionContextCache _sharedContextCache =
		new PredictionContextCache();
	public static final int
		STATEMENT_END=1, APPLICATION=2, WINDOW=3, PROCEDURE=4, CLASS=5, ROUTINE=6, 
		IF=7, THEN=8, ELSE=9, LOOP=10, CASE=11, OF=12, END=13, SYSTEM=14, CENTER=15, 
		AT=16, MAX=17, MIN=18, RESIZE=19, MODAL=20, FONT=21, ICON=22, STATUS=23, 
		MDI=24, IMM=25, MENUBAR=26, TOOLBAR=27, BUTTON=28, MENU=29, USE=30, MSG=31, 
		STD=32, ITEM=33, SEPARATOR=34, NOMERGE=35, MAP=36, MODULE=37, DATA=38, 
		CODE=39, RETURN=40, FILE=41, RECORD=42, KEY=43, PRE=44, GROUP=45, QUEUE=46, 
		EQUATE=47, INCLUDE=48, ONCE=49, PROGRAM=50, MEMBER=51, THREAD=52, SHEET=53, 
		TAB=54, OPTION=55, DO=56, ACCEPTED=57, ELSIF=58, SELF=59, PARENT=60, FEQ=61, 
		ID=62, STRING=63, NUMERIC=64, COMMENT=65, CONTINUED_LINE_LF=66, CONTINUED_LINE_CRLF=67, 
		CONTINUED_LINE_CR=68, LINEBREAK=69, WHITESPACE=70, AMPERSAND_EQUALS=71, 
		PLUS=72, MINUS=73, STAR=74, SLASH=75, COMMA=76, DOT=77, COLON=78, ARROW=79, 
		LPAREN=80, RPAREN=81, LBRACE=82, RBRACE=83, EQUALS=84, SEMI=85, AMPERSAND=86, 
		QUESTION=87, UNHANDLED=88;
	public static final int
		RULE_fileDeclaration = 0, RULE_fileAttributes = 1, RULE_fileStructure = 2, 
		RULE_recordBlock = 3, RULE_recordAttribute = 4, RULE_fieldList = 5, RULE_fieldDefinition = 6, 
		RULE_fieldType = 7, RULE_fieldOptions = 8, RULE_keyDefinition = 9, RULE_keyFields = 10;
	private static String[] makeRuleNames() {
		return new String[] {
			"fileDeclaration", "fileAttributes", "fileStructure", "recordBlock", 
			"recordAttribute", "fieldList", "fieldDefinition", "fieldType", "fieldOptions", 
			"keyDefinition", "keyFields"
		};
	}
	public static final String[] ruleNames = makeRuleNames();

	private static String[] makeLiteralNames() {
		return new String[] {
			null, null, "'APPLICATION'", "'WINDOW'", "'PROCEDURE'", "'CLASS'", "'ROUTINE'", 
			"'IF'", "'THEN'", "'ELSE'", "'LOOP'", "'CASE'", "'OF'", "'END'", "'SYSTEM'", 
			"'CENTER'", "'AT'", "'MAX'", "'MIN'", "'RESIZE'", "'MODAL'", "'FONT'", 
			"'ICON'", "'STATUS'", "'MDI'", "'IMM'", "'MENUBAR'", "'TOOLBAR'", "'BUTTON'", 
			"'MENU'", "'USE'", "'MSG'", "'STD'", "'ITEM'", "'SEPARATOR'", "'NOMERGE'", 
			"'MAP'", "'MODULE'", "'DATA'", "'CODE'", "'RETURN'", "'FILE'", "'RECORD'", 
			"'KEY'", "'PRE'", "'GROUP'", "'QUEUE'", "'EQUATE'", "'INCLUDE'", "'ONCE'", 
			"'PROGRAM'", "'MEMBER'", "'THREAD'", "'SHEET'", "'TAB'", "'OPTION'", 
			"'DO'", "'ACCEPTED'", "'ELSIF'", "'SELF'", "'PARENT'", null, null, null, 
			null, null, null, null, null, null, null, "'&='", "'+'", "'-'", "'*'", 
			"'/'", "','", "'.'", "':'", "'=>'", "'('", "')'", "'{'", "'}'", "'='", 
			"';'", "'&'", "'?'"
		};
	}
	private static final String[] _LITERAL_NAMES = makeLiteralNames();
	private static String[] makeSymbolicNames() {
		return new String[] {
			null, "STATEMENT_END", "APPLICATION", "WINDOW", "PROCEDURE", "CLASS", 
			"ROUTINE", "IF", "THEN", "ELSE", "LOOP", "CASE", "OF", "END", "SYSTEM", 
			"CENTER", "AT", "MAX", "MIN", "RESIZE", "MODAL", "FONT", "ICON", "STATUS", 
			"MDI", "IMM", "MENUBAR", "TOOLBAR", "BUTTON", "MENU", "USE", "MSG", "STD", 
			"ITEM", "SEPARATOR", "NOMERGE", "MAP", "MODULE", "DATA", "CODE", "RETURN", 
			"FILE", "RECORD", "KEY", "PRE", "GROUP", "QUEUE", "EQUATE", "INCLUDE", 
			"ONCE", "PROGRAM", "MEMBER", "THREAD", "SHEET", "TAB", "OPTION", "DO", 
			"ACCEPTED", "ELSIF", "SELF", "PARENT", "FEQ", "ID", "STRING", "NUMERIC", 
			"COMMENT", "CONTINUED_LINE_LF", "CONTINUED_LINE_CRLF", "CONTINUED_LINE_CR", 
			"LINEBREAK", "WHITESPACE", "AMPERSAND_EQUALS", "PLUS", "MINUS", "STAR", 
			"SLASH", "COMMA", "DOT", "COLON", "ARROW", "LPAREN", "RPAREN", "LBRACE", 
			"RBRACE", "EQUALS", "SEMI", "AMPERSAND", "QUESTION", "UNHANDLED"
		};
	}
	private static final String[] _SYMBOLIC_NAMES = makeSymbolicNames();
	public static final Vocabulary VOCABULARY = new VocabularyImpl(_LITERAL_NAMES, _SYMBOLIC_NAMES);

	/**
	 * @deprecated Use {@link #VOCABULARY} instead.
	 */
	@Deprecated
	public static final String[] tokenNames;
	static {
		tokenNames = new String[_SYMBOLIC_NAMES.length];
		for (int i = 0; i < tokenNames.length; i++) {
			tokenNames[i] = VOCABULARY.getLiteralName(i);
			if (tokenNames[i] == null) {
				tokenNames[i] = VOCABULARY.getSymbolicName(i);
			}

			if (tokenNames[i] == null) {
				tokenNames[i] = "<INVALID>";
			}
		}
	}

	@Override
	@Deprecated
	public String[] getTokenNames() {
		return tokenNames;
	}

	@Override

	public Vocabulary getVocabulary() {
		return VOCABULARY;
	}

	@Override
	public String getGrammarFileName() { return "ClarionFile.g4"; }

	@Override
	public String[] getRuleNames() { return ruleNames; }

	@Override
	public String getSerializedATN() { return _serializedATN; }

	@Override
	public ATN getATN() { return _ATN; }

	public ClarionFile(TokenStream input) {
		super(input);
		_interp = new ParserATNSimulator(this,_ATN,_decisionToDFA,_sharedContextCache);
	}

	@SuppressWarnings("CheckReturnValue")
	public static class FileDeclarationContext extends ParserRuleContext {
		public TerminalNode ID() { return getToken(ClarionFile.ID, 0); }
		public TerminalNode FILE() { return getToken(ClarionFile.FILE, 0); }
		public FileStructureContext fileStructure() {
			return getRuleContext(FileStructureContext.class,0);
		}
		public TerminalNode END() { return getToken(ClarionFile.END, 0); }
		public List<FileAttributesContext> fileAttributes() {
			return getRuleContexts(FileAttributesContext.class);
		}
		public FileAttributesContext fileAttributes(int i) {
			return getRuleContext(FileAttributesContext.class,i);
		}
		public List<TerminalNode> COMMA() { return getTokens(ClarionFile.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionFile.COMMA, i);
		}
		public FileDeclarationContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_fileDeclaration; }
	}

	public final FileDeclarationContext fileDeclaration() throws RecognitionException {
		FileDeclarationContext _localctx = new FileDeclarationContext(_ctx, getState());
		enterRule(_localctx, 0, RULE_fileDeclaration);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(22);
			match(ID);
			setState(23);
			match(FILE);
			setState(25);
			_errHandler.sync(this);
			switch ( getInterpreter().adaptivePredict(_input,0,_ctx) ) {
			case 1:
				{
				setState(24);
				fileAttributes();
				}
				break;
			}
			setState(31);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==COMMA) {
				{
				{
				setState(27);
				match(COMMA);
				setState(28);
				fileAttributes();
				}
				}
				setState(33);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			setState(34);
			fileStructure();
			setState(35);
			match(END);
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class FileAttributesContext extends ParserRuleContext {
		public TerminalNode ID() { return getToken(ClarionFile.ID, 0); }
		public TerminalNode LPAREN() { return getToken(ClarionFile.LPAREN, 0); }
		public TerminalNode STRING() { return getToken(ClarionFile.STRING, 0); }
		public TerminalNode RPAREN() { return getToken(ClarionFile.RPAREN, 0); }
		public FileAttributesContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_fileAttributes; }
	}

	public final FileAttributesContext fileAttributes() throws RecognitionException {
		FileAttributesContext _localctx = new FileAttributesContext(_ctx, getState());
		enterRule(_localctx, 2, RULE_fileAttributes);
		try {
			setState(42);
			_errHandler.sync(this);
			switch ( getInterpreter().adaptivePredict(_input,2,_ctx) ) {
			case 1:
				enterOuterAlt(_localctx, 1);
				{
				setState(37);
				match(ID);
				setState(38);
				match(LPAREN);
				setState(39);
				match(STRING);
				setState(40);
				match(RPAREN);
				}
				break;
			case 2:
				enterOuterAlt(_localctx, 2);
				{
				setState(41);
				match(ID);
				}
				break;
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class FileStructureContext extends ParserRuleContext {
		public List<KeyDefinitionContext> keyDefinition() {
			return getRuleContexts(KeyDefinitionContext.class);
		}
		public KeyDefinitionContext keyDefinition(int i) {
			return getRuleContext(KeyDefinitionContext.class,i);
		}
		public List<RecordBlockContext> recordBlock() {
			return getRuleContexts(RecordBlockContext.class);
		}
		public RecordBlockContext recordBlock(int i) {
			return getRuleContext(RecordBlockContext.class,i);
		}
		public FileStructureContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_fileStructure; }
	}

	public final FileStructureContext fileStructure() throws RecognitionException {
		FileStructureContext _localctx = new FileStructureContext(_ctx, getState());
		enterRule(_localctx, 4, RULE_fileStructure);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(48);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==RECORD || _la==ID) {
				{
				setState(46);
				_errHandler.sync(this);
				switch (_input.LA(1)) {
				case ID:
					{
					setState(44);
					keyDefinition();
					}
					break;
				case RECORD:
					{
					setState(45);
					recordBlock();
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				}
				setState(50);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class RecordBlockContext extends ParserRuleContext {
		public TerminalNode RECORD() { return getToken(ClarionFile.RECORD, 0); }
		public FieldListContext fieldList() {
			return getRuleContext(FieldListContext.class,0);
		}
		public TerminalNode END() { return getToken(ClarionFile.END, 0); }
		public List<TerminalNode> COMMA() { return getTokens(ClarionFile.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionFile.COMMA, i);
		}
		public List<RecordAttributeContext> recordAttribute() {
			return getRuleContexts(RecordAttributeContext.class);
		}
		public RecordAttributeContext recordAttribute(int i) {
			return getRuleContext(RecordAttributeContext.class,i);
		}
		public RecordBlockContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_recordBlock; }
	}

	public final RecordBlockContext recordBlock() throws RecognitionException {
		RecordBlockContext _localctx = new RecordBlockContext(_ctx, getState());
		enterRule(_localctx, 6, RULE_recordBlock);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(51);
			match(RECORD);
			setState(56);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==COMMA) {
				{
				{
				setState(52);
				match(COMMA);
				setState(53);
				recordAttribute();
				}
				}
				setState(58);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			setState(59);
			fieldList();
			setState(60);
			match(END);
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class RecordAttributeContext extends ParserRuleContext {
		public TerminalNode PRE() { return getToken(ClarionFile.PRE, 0); }
		public TerminalNode LPAREN() { return getToken(ClarionFile.LPAREN, 0); }
		public TerminalNode ID() { return getToken(ClarionFile.ID, 0); }
		public TerminalNode RPAREN() { return getToken(ClarionFile.RPAREN, 0); }
		public RecordAttributeContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_recordAttribute; }
	}

	public final RecordAttributeContext recordAttribute() throws RecognitionException {
		RecordAttributeContext _localctx = new RecordAttributeContext(_ctx, getState());
		enterRule(_localctx, 8, RULE_recordAttribute);
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(62);
			match(PRE);
			setState(63);
			match(LPAREN);
			setState(64);
			match(ID);
			setState(65);
			match(RPAREN);
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class FieldListContext extends ParserRuleContext {
		public List<FieldDefinitionContext> fieldDefinition() {
			return getRuleContexts(FieldDefinitionContext.class);
		}
		public FieldDefinitionContext fieldDefinition(int i) {
			return getRuleContext(FieldDefinitionContext.class,i);
		}
		public FieldListContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_fieldList; }
	}

	public final FieldListContext fieldList() throws RecognitionException {
		FieldListContext _localctx = new FieldListContext(_ctx, getState());
		enterRule(_localctx, 10, RULE_fieldList);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(70);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==ID) {
				{
				{
				setState(67);
				fieldDefinition();
				}
				}
				setState(72);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class FieldDefinitionContext extends ParserRuleContext {
		public TerminalNode ID() { return getToken(ClarionFile.ID, 0); }
		public FieldTypeContext fieldType() {
			return getRuleContext(FieldTypeContext.class,0);
		}
		public List<TerminalNode> COMMA() { return getTokens(ClarionFile.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionFile.COMMA, i);
		}
		public List<FieldOptionsContext> fieldOptions() {
			return getRuleContexts(FieldOptionsContext.class);
		}
		public FieldOptionsContext fieldOptions(int i) {
			return getRuleContext(FieldOptionsContext.class,i);
		}
		public FieldDefinitionContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_fieldDefinition; }
	}

	public final FieldDefinitionContext fieldDefinition() throws RecognitionException {
		FieldDefinitionContext _localctx = new FieldDefinitionContext(_ctx, getState());
		enterRule(_localctx, 12, RULE_fieldDefinition);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(73);
			match(ID);
			setState(74);
			fieldType();
			setState(79);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==COMMA) {
				{
				{
				setState(75);
				match(COMMA);
				setState(76);
				fieldOptions();
				}
				}
				setState(81);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class FieldTypeContext extends ParserRuleContext {
		public TerminalNode ID() { return getToken(ClarionFile.ID, 0); }
		public TerminalNode LPAREN() { return getToken(ClarionFile.LPAREN, 0); }
		public List<TerminalNode> NUMERIC() { return getTokens(ClarionFile.NUMERIC); }
		public TerminalNode NUMERIC(int i) {
			return getToken(ClarionFile.NUMERIC, i);
		}
		public TerminalNode RPAREN() { return getToken(ClarionFile.RPAREN, 0); }
		public TerminalNode COMMA() { return getToken(ClarionFile.COMMA, 0); }
		public FieldTypeContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_fieldType; }
	}

	public final FieldTypeContext fieldType() throws RecognitionException {
		FieldTypeContext _localctx = new FieldTypeContext(_ctx, getState());
		enterRule(_localctx, 14, RULE_fieldType);
		int _la;
		try {
			setState(91);
			_errHandler.sync(this);
			switch ( getInterpreter().adaptivePredict(_input,9,_ctx) ) {
			case 1:
				enterOuterAlt(_localctx, 1);
				{
				setState(82);
				match(ID);
				setState(83);
				match(LPAREN);
				setState(84);
				match(NUMERIC);
				setState(87);
				_errHandler.sync(this);
				_la = _input.LA(1);
				if (_la==COMMA) {
					{
					setState(85);
					match(COMMA);
					setState(86);
					match(NUMERIC);
					}
				}

				setState(89);
				match(RPAREN);
				}
				break;
			case 2:
				enterOuterAlt(_localctx, 2);
				{
				setState(90);
				match(ID);
				}
				break;
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class FieldOptionsContext extends ParserRuleContext {
		public TerminalNode ID() { return getToken(ClarionFile.ID, 0); }
		public FieldOptionsContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_fieldOptions; }
	}

	public final FieldOptionsContext fieldOptions() throws RecognitionException {
		FieldOptionsContext _localctx = new FieldOptionsContext(_ctx, getState());
		enterRule(_localctx, 16, RULE_fieldOptions);
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(93);
			match(ID);
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class KeyDefinitionContext extends ParserRuleContext {
		public List<TerminalNode> ID() { return getTokens(ClarionFile.ID); }
		public TerminalNode ID(int i) {
			return getToken(ClarionFile.ID, i);
		}
		public TerminalNode KEY() { return getToken(ClarionFile.KEY, 0); }
		public TerminalNode LPAREN() { return getToken(ClarionFile.LPAREN, 0); }
		public KeyFieldsContext keyFields() {
			return getRuleContext(KeyFieldsContext.class,0);
		}
		public TerminalNode RPAREN() { return getToken(ClarionFile.RPAREN, 0); }
		public List<TerminalNode> COMMA() { return getTokens(ClarionFile.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionFile.COMMA, i);
		}
		public KeyDefinitionContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_keyDefinition; }
	}

	public final KeyDefinitionContext keyDefinition() throws RecognitionException {
		KeyDefinitionContext _localctx = new KeyDefinitionContext(_ctx, getState());
		enterRule(_localctx, 18, RULE_keyDefinition);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(95);
			match(ID);
			setState(96);
			match(KEY);
			setState(97);
			match(LPAREN);
			setState(98);
			keyFields();
			setState(99);
			match(RPAREN);
			setState(104);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==COMMA) {
				{
				{
				setState(100);
				match(COMMA);
				setState(101);
				match(ID);
				}
				}
				setState(106);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class KeyFieldsContext extends ParserRuleContext {
		public List<TerminalNode> ID() { return getTokens(ClarionFile.ID); }
		public TerminalNode ID(int i) {
			return getToken(ClarionFile.ID, i);
		}
		public List<TerminalNode> COMMA() { return getTokens(ClarionFile.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionFile.COMMA, i);
		}
		public KeyFieldsContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_keyFields; }
	}

	public final KeyFieldsContext keyFields() throws RecognitionException {
		KeyFieldsContext _localctx = new KeyFieldsContext(_ctx, getState());
		enterRule(_localctx, 20, RULE_keyFields);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(107);
			match(ID);
			setState(112);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==COMMA) {
				{
				{
				setState(108);
				match(COMMA);
				setState(109);
				match(ID);
				}
				}
				setState(114);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			exitRule();
		}
		return _localctx;
	}

	public static final String _serializedATN =
		"\u0004\u0001Xt\u0002\u0000\u0007\u0000\u0002\u0001\u0007\u0001\u0002\u0002"+
		"\u0007\u0002\u0002\u0003\u0007\u0003\u0002\u0004\u0007\u0004\u0002\u0005"+
		"\u0007\u0005\u0002\u0006\u0007\u0006\u0002\u0007\u0007\u0007\u0002\b\u0007"+
		"\b\u0002\t\u0007\t\u0002\n\u0007\n\u0001\u0000\u0001\u0000\u0001\u0000"+
		"\u0003\u0000\u001a\b\u0000\u0001\u0000\u0001\u0000\u0005\u0000\u001e\b"+
		"\u0000\n\u0000\f\u0000!\t\u0000\u0001\u0000\u0001\u0000\u0001\u0000\u0001"+
		"\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0003\u0001+\b"+
		"\u0001\u0001\u0002\u0001\u0002\u0005\u0002/\b\u0002\n\u0002\f\u00022\t"+
		"\u0002\u0001\u0003\u0001\u0003\u0001\u0003\u0005\u00037\b\u0003\n\u0003"+
		"\f\u0003:\t\u0003\u0001\u0003\u0001\u0003\u0001\u0003\u0001\u0004\u0001"+
		"\u0004\u0001\u0004\u0001\u0004\u0001\u0004\u0001\u0005\u0005\u0005E\b"+
		"\u0005\n\u0005\f\u0005H\t\u0005\u0001\u0006\u0001\u0006\u0001\u0006\u0001"+
		"\u0006\u0005\u0006N\b\u0006\n\u0006\f\u0006Q\t\u0006\u0001\u0007\u0001"+
		"\u0007\u0001\u0007\u0001\u0007\u0001\u0007\u0003\u0007X\b\u0007\u0001"+
		"\u0007\u0001\u0007\u0003\u0007\\\b\u0007\u0001\b\u0001\b\u0001\t\u0001"+
		"\t\u0001\t\u0001\t\u0001\t\u0001\t\u0001\t\u0005\tg\b\t\n\t\f\tj\t\t\u0001"+
		"\n\u0001\n\u0001\n\u0005\no\b\n\n\n\f\nr\t\n\u0001\n\u0000\u0000\u000b"+
		"\u0000\u0002\u0004\u0006\b\n\f\u000e\u0010\u0012\u0014\u0000\u0000t\u0000"+
		"\u0016\u0001\u0000\u0000\u0000\u0002*\u0001\u0000\u0000\u0000\u00040\u0001"+
		"\u0000\u0000\u0000\u00063\u0001\u0000\u0000\u0000\b>\u0001\u0000\u0000"+
		"\u0000\nF\u0001\u0000\u0000\u0000\fI\u0001\u0000\u0000\u0000\u000e[\u0001"+
		"\u0000\u0000\u0000\u0010]\u0001\u0000\u0000\u0000\u0012_\u0001\u0000\u0000"+
		"\u0000\u0014k\u0001\u0000\u0000\u0000\u0016\u0017\u0005>\u0000\u0000\u0017"+
		"\u0019\u0005)\u0000\u0000\u0018\u001a\u0003\u0002\u0001\u0000\u0019\u0018"+
		"\u0001\u0000\u0000\u0000\u0019\u001a\u0001\u0000\u0000\u0000\u001a\u001f"+
		"\u0001\u0000\u0000\u0000\u001b\u001c\u0005L\u0000\u0000\u001c\u001e\u0003"+
		"\u0002\u0001\u0000\u001d\u001b\u0001\u0000\u0000\u0000\u001e!\u0001\u0000"+
		"\u0000\u0000\u001f\u001d\u0001\u0000\u0000\u0000\u001f \u0001\u0000\u0000"+
		"\u0000 \"\u0001\u0000\u0000\u0000!\u001f\u0001\u0000\u0000\u0000\"#\u0003"+
		"\u0004\u0002\u0000#$\u0005\r\u0000\u0000$\u0001\u0001\u0000\u0000\u0000"+
		"%&\u0005>\u0000\u0000&\'\u0005P\u0000\u0000\'(\u0005?\u0000\u0000(+\u0005"+
		"Q\u0000\u0000)+\u0005>\u0000\u0000*%\u0001\u0000\u0000\u0000*)\u0001\u0000"+
		"\u0000\u0000+\u0003\u0001\u0000\u0000\u0000,/\u0003\u0012\t\u0000-/\u0003"+
		"\u0006\u0003\u0000.,\u0001\u0000\u0000\u0000.-\u0001\u0000\u0000\u0000"+
		"/2\u0001\u0000\u0000\u00000.\u0001\u0000\u0000\u000001\u0001\u0000\u0000"+
		"\u00001\u0005\u0001\u0000\u0000\u000020\u0001\u0000\u0000\u000038\u0005"+
		"*\u0000\u000045\u0005L\u0000\u000057\u0003\b\u0004\u000064\u0001\u0000"+
		"\u0000\u00007:\u0001\u0000\u0000\u000086\u0001\u0000\u0000\u000089\u0001"+
		"\u0000\u0000\u00009;\u0001\u0000\u0000\u0000:8\u0001\u0000\u0000\u0000"+
		";<\u0003\n\u0005\u0000<=\u0005\r\u0000\u0000=\u0007\u0001\u0000\u0000"+
		"\u0000>?\u0005,\u0000\u0000?@\u0005P\u0000\u0000@A\u0005>\u0000\u0000"+
		"AB\u0005Q\u0000\u0000B\t\u0001\u0000\u0000\u0000CE\u0003\f\u0006\u0000"+
		"DC\u0001\u0000\u0000\u0000EH\u0001\u0000\u0000\u0000FD\u0001\u0000\u0000"+
		"\u0000FG\u0001\u0000\u0000\u0000G\u000b\u0001\u0000\u0000\u0000HF\u0001"+
		"\u0000\u0000\u0000IJ\u0005>\u0000\u0000JO\u0003\u000e\u0007\u0000KL\u0005"+
		"L\u0000\u0000LN\u0003\u0010\b\u0000MK\u0001\u0000\u0000\u0000NQ\u0001"+
		"\u0000\u0000\u0000OM\u0001\u0000\u0000\u0000OP\u0001\u0000\u0000\u0000"+
		"P\r\u0001\u0000\u0000\u0000QO\u0001\u0000\u0000\u0000RS\u0005>\u0000\u0000"+
		"ST\u0005P\u0000\u0000TW\u0005@\u0000\u0000UV\u0005L\u0000\u0000VX\u0005"+
		"@\u0000\u0000WU\u0001\u0000\u0000\u0000WX\u0001\u0000\u0000\u0000XY\u0001"+
		"\u0000\u0000\u0000Y\\\u0005Q\u0000\u0000Z\\\u0005>\u0000\u0000[R\u0001"+
		"\u0000\u0000\u0000[Z\u0001\u0000\u0000\u0000\\\u000f\u0001\u0000\u0000"+
		"\u0000]^\u0005>\u0000\u0000^\u0011\u0001\u0000\u0000\u0000_`\u0005>\u0000"+
		"\u0000`a\u0005+\u0000\u0000ab\u0005P\u0000\u0000bc\u0003\u0014\n\u0000"+
		"ch\u0005Q\u0000\u0000de\u0005L\u0000\u0000eg\u0005>\u0000\u0000fd\u0001"+
		"\u0000\u0000\u0000gj\u0001\u0000\u0000\u0000hf\u0001\u0000\u0000\u0000"+
		"hi\u0001\u0000\u0000\u0000i\u0013\u0001\u0000\u0000\u0000jh\u0001\u0000"+
		"\u0000\u0000kp\u0005>\u0000\u0000lm\u0005L\u0000\u0000mo\u0005>\u0000"+
		"\u0000nl\u0001\u0000\u0000\u0000or\u0001\u0000\u0000\u0000pn\u0001\u0000"+
		"\u0000\u0000pq\u0001\u0000\u0000\u0000q\u0015\u0001\u0000\u0000\u0000"+
		"rp\u0001\u0000\u0000\u0000\f\u0019\u001f*.08FOW[hp";
	public static final ATN _ATN =
		new ATNDeserializer().deserialize(_serializedATN.toCharArray());
	static {
		_decisionToDFA = new DFA[_ATN.getNumberOfDecisions()];
		for (int i = 0; i < _ATN.getNumberOfDecisions(); i++) {
			_decisionToDFA[i] = new DFA(_ATN.getDecisionState(i), i);
		}
	}
}