// Generated from f:/github/Clarion-Extension/Clarion-Extension/server/antlr/ClarionExpressions.g4 by ANTLR 4.13.1
import org.antlr.v4.runtime.atn.*;
import org.antlr.v4.runtime.dfa.DFA;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.misc.*;
import org.antlr.v4.runtime.tree.*;
import java.util.List;
import java.util.Iterator;
import java.util.ArrayList;

@SuppressWarnings({"all", "warnings", "unchecked", "unused", "cast", "CheckReturnValue"})
public class ClarionExpressions extends Parser {
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
		RULE_expression = 0, RULE_term = 1, RULE_factor = 2, RULE_propertyAccess = 3, 
		RULE_functionCall = 4, RULE_dottedIdentifier = 5, RULE_argumentList = 6, 
		RULE_expressionLike = 7, RULE_parameterList = 8, RULE_parameter = 9, RULE_returnType = 10;
	private static String[] makeRuleNames() {
		return new String[] {
			"expression", "term", "factor", "propertyAccess", "functionCall", "dottedIdentifier", 
			"argumentList", "expressionLike", "parameterList", "parameter", "returnType"
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
	public String getGrammarFileName() { return "ClarionExpressions.g4"; }

	@Override
	public String[] getRuleNames() { return ruleNames; }

	@Override
	public String getSerializedATN() { return _serializedATN; }

	@Override
	public ATN getATN() { return _ATN; }

	public ClarionExpressions(TokenStream input) {
		super(input);
		_interp = new ParserATNSimulator(this,_ATN,_decisionToDFA,_sharedContextCache);
	}

	@SuppressWarnings("CheckReturnValue")
	public static class ExpressionContext extends ParserRuleContext {
		public ExpressionContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_expression; }
	 
		public ExpressionContext() { }
		public void copyFrom(ExpressionContext ctx) {
			super.copyFrom(ctx);
		}
	}
	@SuppressWarnings("CheckReturnValue")
	public static class AdditiveExpressionContext extends ExpressionContext {
		public ExpressionContext expression() {
			return getRuleContext(ExpressionContext.class,0);
		}
		public TerminalNode PLUS() { return getToken(ClarionExpressions.PLUS, 0); }
		public TermContext term() {
			return getRuleContext(TermContext.class,0);
		}
		public TerminalNode MINUS() { return getToken(ClarionExpressions.MINUS, 0); }
		public AdditiveExpressionContext(ExpressionContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class TermExpressionContext extends ExpressionContext {
		public TermContext term() {
			return getRuleContext(TermContext.class,0);
		}
		public TermExpressionContext(ExpressionContext ctx) { copyFrom(ctx); }
	}

	public final ExpressionContext expression() throws RecognitionException {
		return expression(0);
	}

	private ExpressionContext expression(int _p) throws RecognitionException {
		ParserRuleContext _parentctx = _ctx;
		int _parentState = getState();
		ExpressionContext _localctx = new ExpressionContext(_ctx, _parentState);
		ExpressionContext _prevctx = _localctx;
		int _startState = 0;
		enterRecursionRule(_localctx, 0, RULE_expression, _p);
		try {
			int _alt;
			enterOuterAlt(_localctx, 1);
			{
			{
			_localctx = new TermExpressionContext(_localctx);
			_ctx = _localctx;
			_prevctx = _localctx;

			setState(23);
			term(0);
			}
			_ctx.stop = _input.LT(-1);
			setState(33);
			_errHandler.sync(this);
			_alt = getInterpreter().adaptivePredict(_input,1,_ctx);
			while ( _alt!=2 && _alt!=org.antlr.v4.runtime.atn.ATN.INVALID_ALT_NUMBER ) {
				if ( _alt==1 ) {
					if ( _parseListeners!=null ) triggerExitRuleEvent();
					_prevctx = _localctx;
					{
					setState(31);
					_errHandler.sync(this);
					switch ( getInterpreter().adaptivePredict(_input,0,_ctx) ) {
					case 1:
						{
						_localctx = new AdditiveExpressionContext(new ExpressionContext(_parentctx, _parentState));
						pushNewRecursionContext(_localctx, _startState, RULE_expression);
						setState(25);
						if (!(precpred(_ctx, 3))) throw new FailedPredicateException(this, "precpred(_ctx, 3)");
						setState(26);
						match(PLUS);
						setState(27);
						term(0);
						}
						break;
					case 2:
						{
						_localctx = new AdditiveExpressionContext(new ExpressionContext(_parentctx, _parentState));
						pushNewRecursionContext(_localctx, _startState, RULE_expression);
						setState(28);
						if (!(precpred(_ctx, 2))) throw new FailedPredicateException(this, "precpred(_ctx, 2)");
						setState(29);
						match(MINUS);
						setState(30);
						term(0);
						}
						break;
					}
					} 
				}
				setState(35);
				_errHandler.sync(this);
				_alt = getInterpreter().adaptivePredict(_input,1,_ctx);
			}
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			unrollRecursionContexts(_parentctx);
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class TermContext extends ParserRuleContext {
		public TermContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_term; }
	 
		public TermContext() { }
		public void copyFrom(TermContext ctx) {
			super.copyFrom(ctx);
		}
	}
	@SuppressWarnings("CheckReturnValue")
	public static class FactorExpressionContext extends TermContext {
		public FactorContext factor() {
			return getRuleContext(FactorContext.class,0);
		}
		public FactorExpressionContext(TermContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class MultiplicativeExpressionContext extends TermContext {
		public TermContext term() {
			return getRuleContext(TermContext.class,0);
		}
		public TerminalNode STAR() { return getToken(ClarionExpressions.STAR, 0); }
		public FactorContext factor() {
			return getRuleContext(FactorContext.class,0);
		}
		public TerminalNode SLASH() { return getToken(ClarionExpressions.SLASH, 0); }
		public MultiplicativeExpressionContext(TermContext ctx) { copyFrom(ctx); }
	}

	public final TermContext term() throws RecognitionException {
		return term(0);
	}

	private TermContext term(int _p) throws RecognitionException {
		ParserRuleContext _parentctx = _ctx;
		int _parentState = getState();
		TermContext _localctx = new TermContext(_ctx, _parentState);
		TermContext _prevctx = _localctx;
		int _startState = 2;
		enterRecursionRule(_localctx, 2, RULE_term, _p);
		try {
			int _alt;
			enterOuterAlt(_localctx, 1);
			{
			{
			_localctx = new FactorExpressionContext(_localctx);
			_ctx = _localctx;
			_prevctx = _localctx;

			setState(37);
			factor();
			}
			_ctx.stop = _input.LT(-1);
			setState(47);
			_errHandler.sync(this);
			_alt = getInterpreter().adaptivePredict(_input,3,_ctx);
			while ( _alt!=2 && _alt!=org.antlr.v4.runtime.atn.ATN.INVALID_ALT_NUMBER ) {
				if ( _alt==1 ) {
					if ( _parseListeners!=null ) triggerExitRuleEvent();
					_prevctx = _localctx;
					{
					setState(45);
					_errHandler.sync(this);
					switch ( getInterpreter().adaptivePredict(_input,2,_ctx) ) {
					case 1:
						{
						_localctx = new MultiplicativeExpressionContext(new TermContext(_parentctx, _parentState));
						pushNewRecursionContext(_localctx, _startState, RULE_term);
						setState(39);
						if (!(precpred(_ctx, 3))) throw new FailedPredicateException(this, "precpred(_ctx, 3)");
						setState(40);
						match(STAR);
						setState(41);
						factor();
						}
						break;
					case 2:
						{
						_localctx = new MultiplicativeExpressionContext(new TermContext(_parentctx, _parentState));
						pushNewRecursionContext(_localctx, _startState, RULE_term);
						setState(42);
						if (!(precpred(_ctx, 2))) throw new FailedPredicateException(this, "precpred(_ctx, 2)");
						setState(43);
						match(SLASH);
						setState(44);
						factor();
						}
						break;
					}
					} 
				}
				setState(49);
				_errHandler.sync(this);
				_alt = getInterpreter().adaptivePredict(_input,3,_ctx);
			}
			}
		}
		catch (RecognitionException re) {
			_localctx.exception = re;
			_errHandler.reportError(this, re);
			_errHandler.recover(this, re);
		}
		finally {
			unrollRecursionContexts(_parentctx);
		}
		return _localctx;
	}

	@SuppressWarnings("CheckReturnValue")
	public static class FactorContext extends ParserRuleContext {
		public FactorContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_factor; }
	 
		public FactorContext() { }
		public void copyFrom(FactorContext ctx) {
			super.copyFrom(ctx);
		}
	}
	@SuppressWarnings("CheckReturnValue")
	public static class FunctionCallFactorContext extends FactorContext {
		public FunctionCallContext functionCall() {
			return getRuleContext(FunctionCallContext.class,0);
		}
		public FunctionCallFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class FieldEquateFactorContext extends FactorContext {
		public TerminalNode FEQ() { return getToken(ClarionExpressions.FEQ, 0); }
		public FieldEquateFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class IntegerFactorContext extends FactorContext {
		public TerminalNode NUMERIC() { return getToken(ClarionExpressions.NUMERIC, 0); }
		public IntegerFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class PropertyAccessFactorContext extends FactorContext {
		public PropertyAccessContext propertyAccess() {
			return getRuleContext(PropertyAccessContext.class,0);
		}
		public PropertyAccessFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class StringFactorContext extends FactorContext {
		public TerminalNode STRING() { return getToken(ClarionExpressions.STRING, 0); }
		public StringFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class DottedIdentifierFactorContext extends FactorContext {
		public DottedIdentifierContext dottedIdentifier() {
			return getRuleContext(DottedIdentifierContext.class,0);
		}
		public DottedIdentifierFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class ParenthesizedFactorContext extends FactorContext {
		public TerminalNode LPAREN() { return getToken(ClarionExpressions.LPAREN, 0); }
		public ExpressionContext expression() {
			return getRuleContext(ExpressionContext.class,0);
		}
		public TerminalNode RPAREN() { return getToken(ClarionExpressions.RPAREN, 0); }
		public ParenthesizedFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}

	public final FactorContext factor() throws RecognitionException {
		FactorContext _localctx = new FactorContext(_ctx, getState());
		enterRule(_localctx, 4, RULE_factor);
		try {
			setState(60);
			_errHandler.sync(this);
			switch ( getInterpreter().adaptivePredict(_input,4,_ctx) ) {
			case 1:
				_localctx = new FunctionCallFactorContext(_localctx);
				enterOuterAlt(_localctx, 1);
				{
				setState(50);
				functionCall();
				}
				break;
			case 2:
				_localctx = new DottedIdentifierFactorContext(_localctx);
				enterOuterAlt(_localctx, 2);
				{
				setState(51);
				dottedIdentifier();
				}
				break;
			case 3:
				_localctx = new PropertyAccessFactorContext(_localctx);
				enterOuterAlt(_localctx, 3);
				{
				setState(52);
				propertyAccess();
				}
				break;
			case 4:
				_localctx = new FieldEquateFactorContext(_localctx);
				enterOuterAlt(_localctx, 4);
				{
				setState(53);
				match(FEQ);
				}
				break;
			case 5:
				_localctx = new IntegerFactorContext(_localctx);
				enterOuterAlt(_localctx, 5);
				{
				setState(54);
				match(NUMERIC);
				}
				break;
			case 6:
				_localctx = new StringFactorContext(_localctx);
				enterOuterAlt(_localctx, 6);
				{
				setState(55);
				match(STRING);
				}
				break;
			case 7:
				_localctx = new ParenthesizedFactorContext(_localctx);
				enterOuterAlt(_localctx, 7);
				{
				setState(56);
				match(LPAREN);
				setState(57);
				expression(0);
				setState(58);
				match(RPAREN);
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
	public static class PropertyAccessContext extends ParserRuleContext {
		public List<TerminalNode> ID() { return getTokens(ClarionExpressions.ID); }
		public TerminalNode ID(int i) {
			return getToken(ClarionExpressions.ID, i);
		}
		public TerminalNode LBRACE() { return getToken(ClarionExpressions.LBRACE, 0); }
		public TerminalNode RBRACE() { return getToken(ClarionExpressions.RBRACE, 0); }
		public List<TerminalNode> COLON() { return getTokens(ClarionExpressions.COLON); }
		public TerminalNode COLON(int i) {
			return getToken(ClarionExpressions.COLON, i);
		}
		public PropertyAccessContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_propertyAccess; }
	}

	public final PropertyAccessContext propertyAccess() throws RecognitionException {
		PropertyAccessContext _localctx = new PropertyAccessContext(_ctx, getState());
		enterRule(_localctx, 6, RULE_propertyAccess);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(62);
			match(ID);
			setState(63);
			match(LBRACE);
			setState(64);
			match(ID);
			setState(69);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==COLON) {
				{
				{
				setState(65);
				match(COLON);
				setState(66);
				match(ID);
				}
				}
				setState(71);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			setState(72);
			match(RBRACE);
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
	public static class FunctionCallContext extends ParserRuleContext {
		public DottedIdentifierContext dottedIdentifier() {
			return getRuleContext(DottedIdentifierContext.class,0);
		}
		public TerminalNode LPAREN() { return getToken(ClarionExpressions.LPAREN, 0); }
		public TerminalNode RPAREN() { return getToken(ClarionExpressions.RPAREN, 0); }
		public ArgumentListContext argumentList() {
			return getRuleContext(ArgumentListContext.class,0);
		}
		public FunctionCallContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_functionCall; }
	}

	public final FunctionCallContext functionCall() throws RecognitionException {
		FunctionCallContext _localctx = new FunctionCallContext(_ctx, getState());
		enterRule(_localctx, 8, RULE_functionCall);
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(74);
			dottedIdentifier();
			setState(75);
			match(LPAREN);
			setState(77);
			_errHandler.sync(this);
			switch ( getInterpreter().adaptivePredict(_input,6,_ctx) ) {
			case 1:
				{
				setState(76);
				argumentList();
				}
				break;
			}
			setState(79);
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
	public static class DottedIdentifierContext extends ParserRuleContext {
		public List<TerminalNode> DOT() { return getTokens(ClarionExpressions.DOT); }
		public TerminalNode DOT(int i) {
			return getToken(ClarionExpressions.DOT, i);
		}
		public List<TerminalNode> ID() { return getTokens(ClarionExpressions.ID); }
		public TerminalNode ID(int i) {
			return getToken(ClarionExpressions.ID, i);
		}
		public TerminalNode SELF() { return getToken(ClarionExpressions.SELF, 0); }
		public TerminalNode PARENT() { return getToken(ClarionExpressions.PARENT, 0); }
		public DottedIdentifierContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_dottedIdentifier; }
	}

	public final DottedIdentifierContext dottedIdentifier() throws RecognitionException {
		DottedIdentifierContext _localctx = new DottedIdentifierContext(_ctx, getState());
		enterRule(_localctx, 10, RULE_dottedIdentifier);
		int _la;
		try {
			int _alt;
			setState(92);
			_errHandler.sync(this);
			switch (_input.LA(1)) {
			case SELF:
			case PARENT:
				enterOuterAlt(_localctx, 1);
				{
				setState(81);
				_la = _input.LA(1);
				if ( !(_la==SELF || _la==PARENT) ) {
				_errHandler.recoverInline(this);
				}
				else {
					if ( _input.LA(1)==Token.EOF ) matchedEOF = true;
					_errHandler.reportMatch(this);
					consume();
				}
				setState(82);
				match(DOT);
				setState(83);
				match(ID);
				}
				break;
			case ID:
				enterOuterAlt(_localctx, 2);
				{
				setState(84);
				match(ID);
				setState(89);
				_errHandler.sync(this);
				_alt = getInterpreter().adaptivePredict(_input,7,_ctx);
				while ( _alt!=2 && _alt!=org.antlr.v4.runtime.atn.ATN.INVALID_ALT_NUMBER ) {
					if ( _alt==1 ) {
						{
						{
						setState(85);
						match(DOT);
						setState(86);
						match(ID);
						}
						} 
					}
					setState(91);
					_errHandler.sync(this);
					_alt = getInterpreter().adaptivePredict(_input,7,_ctx);
				}
				}
				break;
			default:
				throw new NoViableAltException(this);
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
	public static class ArgumentListContext extends ParserRuleContext {
		public List<ExpressionLikeContext> expressionLike() {
			return getRuleContexts(ExpressionLikeContext.class);
		}
		public ExpressionLikeContext expressionLike(int i) {
			return getRuleContext(ExpressionLikeContext.class,i);
		}
		public List<TerminalNode> COMMA() { return getTokens(ClarionExpressions.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionExpressions.COMMA, i);
		}
		public ArgumentListContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_argumentList; }
	}

	public final ArgumentListContext argumentList() throws RecognitionException {
		ArgumentListContext _localctx = new ArgumentListContext(_ctx, getState());
		enterRule(_localctx, 12, RULE_argumentList);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(102);
			_errHandler.sync(this);
			_la = _input.LA(1);
			if ((((_la) & ~0x3f) == 0 && ((1L << _la) & -2L) != 0) || ((((_la - 64)) & ~0x3f) == 0 && ((1L << (_la - 64)) & 33419231L) != 0)) {
				{
				setState(94);
				expressionLike();
				setState(99);
				_errHandler.sync(this);
				_la = _input.LA(1);
				while (_la==COMMA) {
					{
					{
					setState(95);
					match(COMMA);
					setState(96);
					expressionLike();
					}
					}
					setState(101);
					_errHandler.sync(this);
					_la = _input.LA(1);
				}
				}
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
	public static class ExpressionLikeContext extends ParserRuleContext {
		public List<TerminalNode> RPAREN() { return getTokens(ClarionExpressions.RPAREN); }
		public TerminalNode RPAREN(int i) {
			return getToken(ClarionExpressions.RPAREN, i);
		}
		public List<TerminalNode> COMMA() { return getTokens(ClarionExpressions.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionExpressions.COMMA, i);
		}
		public List<TerminalNode> LINEBREAK() { return getTokens(ClarionExpressions.LINEBREAK); }
		public TerminalNode LINEBREAK(int i) {
			return getToken(ClarionExpressions.LINEBREAK, i);
		}
		public ExpressionLikeContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_expressionLike; }
	}

	public final ExpressionLikeContext expressionLike() throws RecognitionException {
		ExpressionLikeContext _localctx = new ExpressionLikeContext(_ctx, getState());
		enterRule(_localctx, 14, RULE_expressionLike);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(105); 
			_errHandler.sync(this);
			_la = _input.LA(1);
			do {
				{
				{
				setState(104);
				_la = _input.LA(1);
				if ( _la <= 0 || (((((_la - 69)) & ~0x3f) == 0 && ((1L << (_la - 69)) & 4225L) != 0)) ) {
				_errHandler.recoverInline(this);
				}
				else {
					if ( _input.LA(1)==Token.EOF ) matchedEOF = true;
					_errHandler.reportMatch(this);
					consume();
				}
				}
				}
				setState(107); 
				_errHandler.sync(this);
				_la = _input.LA(1);
			} while ( (((_la) & ~0x3f) == 0 && ((1L << _la) & -2L) != 0) || ((((_la - 64)) & ~0x3f) == 0 && ((1L << (_la - 64)) & 33419231L) != 0) );
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
	public static class ParameterListContext extends ParserRuleContext {
		public TerminalNode LPAREN() { return getToken(ClarionExpressions.LPAREN, 0); }
		public TerminalNode RPAREN() { return getToken(ClarionExpressions.RPAREN, 0); }
		public List<ParameterContext> parameter() {
			return getRuleContexts(ParameterContext.class);
		}
		public ParameterContext parameter(int i) {
			return getRuleContext(ParameterContext.class,i);
		}
		public List<TerminalNode> COMMA() { return getTokens(ClarionExpressions.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionExpressions.COMMA, i);
		}
		public ParameterListContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_parameterList; }
	}

	public final ParameterListContext parameterList() throws RecognitionException {
		ParameterListContext _localctx = new ParameterListContext(_ctx, getState());
		enterRule(_localctx, 16, RULE_parameterList);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(109);
			match(LPAREN);
			setState(118);
			_errHandler.sync(this);
			_la = _input.LA(1);
			if (_la==ID || _la==STRING) {
				{
				setState(110);
				parameter();
				setState(115);
				_errHandler.sync(this);
				_la = _input.LA(1);
				while (_la==COMMA) {
					{
					{
					setState(111);
					match(COMMA);
					setState(112);
					parameter();
					}
					}
					setState(117);
					_errHandler.sync(this);
					_la = _input.LA(1);
				}
				}
			}

			setState(120);
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
	public static class ParameterContext extends ParserRuleContext {
		public TerminalNode ID() { return getToken(ClarionExpressions.ID, 0); }
		public TerminalNode STRING() { return getToken(ClarionExpressions.STRING, 0); }
		public ParameterContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_parameter; }
	}

	public final ParameterContext parameter() throws RecognitionException {
		ParameterContext _localctx = new ParameterContext(_ctx, getState());
		enterRule(_localctx, 18, RULE_parameter);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(122);
			_la = _input.LA(1);
			if ( !(_la==ID || _la==STRING) ) {
			_errHandler.recoverInline(this);
			}
			else {
				if ( _input.LA(1)==Token.EOF ) matchedEOF = true;
				_errHandler.reportMatch(this);
				consume();
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
	public static class ReturnTypeContext extends ParserRuleContext {
		public TerminalNode ID() { return getToken(ClarionExpressions.ID, 0); }
		public ReturnTypeContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_returnType; }
	}

	public final ReturnTypeContext returnType() throws RecognitionException {
		ReturnTypeContext _localctx = new ReturnTypeContext(_ctx, getState());
		enterRule(_localctx, 20, RULE_returnType);
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(124);
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

	public boolean sempred(RuleContext _localctx, int ruleIndex, int predIndex) {
		switch (ruleIndex) {
		case 0:
			return expression_sempred((ExpressionContext)_localctx, predIndex);
		case 1:
			return term_sempred((TermContext)_localctx, predIndex);
		}
		return true;
	}
	private boolean expression_sempred(ExpressionContext _localctx, int predIndex) {
		switch (predIndex) {
		case 0:
			return precpred(_ctx, 3);
		case 1:
			return precpred(_ctx, 2);
		}
		return true;
	}
	private boolean term_sempred(TermContext _localctx, int predIndex) {
		switch (predIndex) {
		case 2:
			return precpred(_ctx, 3);
		case 3:
			return precpred(_ctx, 2);
		}
		return true;
	}

	public static final String _serializedATN =
		"\u0004\u0001X\u007f\u0002\u0000\u0007\u0000\u0002\u0001\u0007\u0001\u0002"+
		"\u0002\u0007\u0002\u0002\u0003\u0007\u0003\u0002\u0004\u0007\u0004\u0002"+
		"\u0005\u0007\u0005\u0002\u0006\u0007\u0006\u0002\u0007\u0007\u0007\u0002"+
		"\b\u0007\b\u0002\t\u0007\t\u0002\n\u0007\n\u0001\u0000\u0001\u0000\u0001"+
		"\u0000\u0001\u0000\u0001\u0000\u0001\u0000\u0001\u0000\u0001\u0000\u0001"+
		"\u0000\u0005\u0000 \b\u0000\n\u0000\f\u0000#\t\u0000\u0001\u0001\u0001"+
		"\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001"+
		"\u0001\u0001\u0001\u0005\u0001.\b\u0001\n\u0001\f\u00011\t\u0001\u0001"+
		"\u0002\u0001\u0002\u0001\u0002\u0001\u0002\u0001\u0002\u0001\u0002\u0001"+
		"\u0002\u0001\u0002\u0001\u0002\u0001\u0002\u0003\u0002=\b\u0002\u0001"+
		"\u0003\u0001\u0003\u0001\u0003\u0001\u0003\u0001\u0003\u0005\u0003D\b"+
		"\u0003\n\u0003\f\u0003G\t\u0003\u0001\u0003\u0001\u0003\u0001\u0004\u0001"+
		"\u0004\u0001\u0004\u0003\u0004N\b\u0004\u0001\u0004\u0001\u0004\u0001"+
		"\u0005\u0001\u0005\u0001\u0005\u0001\u0005\u0001\u0005\u0001\u0005\u0005"+
		"\u0005X\b\u0005\n\u0005\f\u0005[\t\u0005\u0003\u0005]\b\u0005\u0001\u0006"+
		"\u0001\u0006\u0001\u0006\u0005\u0006b\b\u0006\n\u0006\f\u0006e\t\u0006"+
		"\u0003\u0006g\b\u0006\u0001\u0007\u0004\u0007j\b\u0007\u000b\u0007\f\u0007"+
		"k\u0001\b\u0001\b\u0001\b\u0001\b\u0005\br\b\b\n\b\f\bu\t\b\u0003\bw\b"+
		"\b\u0001\b\u0001\b\u0001\t\u0001\t\u0001\n\u0001\n\u0001\n\u0000\u0002"+
		"\u0000\u0002\u000b\u0000\u0002\u0004\u0006\b\n\f\u000e\u0010\u0012\u0014"+
		"\u0000\u0003\u0001\u0000;<\u0003\u0000EELLQQ\u0001\u0000>?\u0086\u0000"+
		"\u0016\u0001\u0000\u0000\u0000\u0002$\u0001\u0000\u0000\u0000\u0004<\u0001"+
		"\u0000\u0000\u0000\u0006>\u0001\u0000\u0000\u0000\bJ\u0001\u0000\u0000"+
		"\u0000\n\\\u0001\u0000\u0000\u0000\ff\u0001\u0000\u0000\u0000\u000ei\u0001"+
		"\u0000\u0000\u0000\u0010m\u0001\u0000\u0000\u0000\u0012z\u0001\u0000\u0000"+
		"\u0000\u0014|\u0001\u0000\u0000\u0000\u0016\u0017\u0006\u0000\uffff\uffff"+
		"\u0000\u0017\u0018\u0003\u0002\u0001\u0000\u0018!\u0001\u0000\u0000\u0000"+
		"\u0019\u001a\n\u0003\u0000\u0000\u001a\u001b\u0005H\u0000\u0000\u001b"+
		" \u0003\u0002\u0001\u0000\u001c\u001d\n\u0002\u0000\u0000\u001d\u001e"+
		"\u0005I\u0000\u0000\u001e \u0003\u0002\u0001\u0000\u001f\u0019\u0001\u0000"+
		"\u0000\u0000\u001f\u001c\u0001\u0000\u0000\u0000 #\u0001\u0000\u0000\u0000"+
		"!\u001f\u0001\u0000\u0000\u0000!\"\u0001\u0000\u0000\u0000\"\u0001\u0001"+
		"\u0000\u0000\u0000#!\u0001\u0000\u0000\u0000$%\u0006\u0001\uffff\uffff"+
		"\u0000%&\u0003\u0004\u0002\u0000&/\u0001\u0000\u0000\u0000\'(\n\u0003"+
		"\u0000\u0000()\u0005J\u0000\u0000).\u0003\u0004\u0002\u0000*+\n\u0002"+
		"\u0000\u0000+,\u0005K\u0000\u0000,.\u0003\u0004\u0002\u0000-\'\u0001\u0000"+
		"\u0000\u0000-*\u0001\u0000\u0000\u0000.1\u0001\u0000\u0000\u0000/-\u0001"+
		"\u0000\u0000\u0000/0\u0001\u0000\u0000\u00000\u0003\u0001\u0000\u0000"+
		"\u00001/\u0001\u0000\u0000\u00002=\u0003\b\u0004\u00003=\u0003\n\u0005"+
		"\u00004=\u0003\u0006\u0003\u00005=\u0005=\u0000\u00006=\u0005@\u0000\u0000"+
		"7=\u0005?\u0000\u000089\u0005P\u0000\u00009:\u0003\u0000\u0000\u0000:"+
		";\u0005Q\u0000\u0000;=\u0001\u0000\u0000\u0000<2\u0001\u0000\u0000\u0000"+
		"<3\u0001\u0000\u0000\u0000<4\u0001\u0000\u0000\u0000<5\u0001\u0000\u0000"+
		"\u0000<6\u0001\u0000\u0000\u0000<7\u0001\u0000\u0000\u0000<8\u0001\u0000"+
		"\u0000\u0000=\u0005\u0001\u0000\u0000\u0000>?\u0005>\u0000\u0000?@\u0005"+
		"R\u0000\u0000@E\u0005>\u0000\u0000AB\u0005N\u0000\u0000BD\u0005>\u0000"+
		"\u0000CA\u0001\u0000\u0000\u0000DG\u0001\u0000\u0000\u0000EC\u0001\u0000"+
		"\u0000\u0000EF\u0001\u0000\u0000\u0000FH\u0001\u0000\u0000\u0000GE\u0001"+
		"\u0000\u0000\u0000HI\u0005S\u0000\u0000I\u0007\u0001\u0000\u0000\u0000"+
		"JK\u0003\n\u0005\u0000KM\u0005P\u0000\u0000LN\u0003\f\u0006\u0000ML\u0001"+
		"\u0000\u0000\u0000MN\u0001\u0000\u0000\u0000NO\u0001\u0000\u0000\u0000"+
		"OP\u0005Q\u0000\u0000P\t\u0001\u0000\u0000\u0000QR\u0007\u0000\u0000\u0000"+
		"RS\u0005M\u0000\u0000S]\u0005>\u0000\u0000TY\u0005>\u0000\u0000UV\u0005"+
		"M\u0000\u0000VX\u0005>\u0000\u0000WU\u0001\u0000\u0000\u0000X[\u0001\u0000"+
		"\u0000\u0000YW\u0001\u0000\u0000\u0000YZ\u0001\u0000\u0000\u0000Z]\u0001"+
		"\u0000\u0000\u0000[Y\u0001\u0000\u0000\u0000\\Q\u0001\u0000\u0000\u0000"+
		"\\T\u0001\u0000\u0000\u0000]\u000b\u0001\u0000\u0000\u0000^c\u0003\u000e"+
		"\u0007\u0000_`\u0005L\u0000\u0000`b\u0003\u000e\u0007\u0000a_\u0001\u0000"+
		"\u0000\u0000be\u0001\u0000\u0000\u0000ca\u0001\u0000\u0000\u0000cd\u0001"+
		"\u0000\u0000\u0000dg\u0001\u0000\u0000\u0000ec\u0001\u0000\u0000\u0000"+
		"f^\u0001\u0000\u0000\u0000fg\u0001\u0000\u0000\u0000g\r\u0001\u0000\u0000"+
		"\u0000hj\b\u0001\u0000\u0000ih\u0001\u0000\u0000\u0000jk\u0001\u0000\u0000"+
		"\u0000ki\u0001\u0000\u0000\u0000kl\u0001\u0000\u0000\u0000l\u000f\u0001"+
		"\u0000\u0000\u0000mv\u0005P\u0000\u0000ns\u0003\u0012\t\u0000op\u0005"+
		"L\u0000\u0000pr\u0003\u0012\t\u0000qo\u0001\u0000\u0000\u0000ru\u0001"+
		"\u0000\u0000\u0000sq\u0001\u0000\u0000\u0000st\u0001\u0000\u0000\u0000"+
		"tw\u0001\u0000\u0000\u0000us\u0001\u0000\u0000\u0000vn\u0001\u0000\u0000"+
		"\u0000vw\u0001\u0000\u0000\u0000wx\u0001\u0000\u0000\u0000xy\u0005Q\u0000"+
		"\u0000y\u0011\u0001\u0000\u0000\u0000z{\u0007\u0002\u0000\u0000{\u0013"+
		"\u0001\u0000\u0000\u0000|}\u0005>\u0000\u0000}\u0015\u0001\u0000\u0000"+
		"\u0000\u000e\u001f!-/<EMY\\cfksv";
	public static final ATN _ATN =
		new ATNDeserializer().deserialize(_serializedATN.toCharArray());
	static {
		_decisionToDFA = new DFA[_ATN.getNumberOfDecisions()];
		for (int i = 0; i < _ATN.getNumberOfDecisions(); i++) {
			_decisionToDFA[i] = new DFA(_ATN.getDecisionState(i), i);
		}
	}
}