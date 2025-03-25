// Generated from f:/github/Clarion-Extension/Clarion-Extension/server/antlr/ClarionAssignment.g4 by ANTLR 4.13.1
import org.antlr.v4.runtime.atn.*;
import org.antlr.v4.runtime.dfa.DFA;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.misc.*;
import org.antlr.v4.runtime.tree.*;
import java.util.List;
import java.util.Iterator;
import java.util.ArrayList;

@SuppressWarnings({"all", "warnings", "unchecked", "unused", "cast", "CheckReturnValue"})
public class ClarionAssignment extends Parser {
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
		RULE_assignmentStatement = 0, RULE_assignable = 1, RULE_assignmentOperator = 2, 
		RULE_statementTerminator = 3, RULE_expression = 4, RULE_term = 5, RULE_factor = 6, 
		RULE_propertyAccess = 7, RULE_functionCall = 8, RULE_dottedIdentifier = 9, 
		RULE_argumentList = 10, RULE_expressionLike = 11, RULE_parameterList = 12, 
		RULE_parameter = 13, RULE_returnType = 14;
	private static String[] makeRuleNames() {
		return new String[] {
			"assignmentStatement", "assignable", "assignmentOperator", "statementTerminator", 
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
	public String getGrammarFileName() { return "ClarionAssignment.g4"; }

	@Override
	public String[] getRuleNames() { return ruleNames; }

	@Override
	public String getSerializedATN() { return _serializedATN; }

	@Override
	public ATN getATN() { return _ATN; }

	public ClarionAssignment(TokenStream input) {
		super(input);
		_interp = new ParserATNSimulator(this,_ATN,_decisionToDFA,_sharedContextCache);
	}

	@SuppressWarnings("CheckReturnValue")
	public static class AssignmentStatementContext extends ParserRuleContext {
		public AssignableContext assignable() {
			return getRuleContext(AssignableContext.class,0);
		}
		public AssignmentOperatorContext assignmentOperator() {
			return getRuleContext(AssignmentOperatorContext.class,0);
		}
		public ExpressionContext expression() {
			return getRuleContext(ExpressionContext.class,0);
		}
		public StatementTerminatorContext statementTerminator() {
			return getRuleContext(StatementTerminatorContext.class,0);
		}
		public AssignmentStatementContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_assignmentStatement; }
	}

	public final AssignmentStatementContext assignmentStatement() throws RecognitionException {
		AssignmentStatementContext _localctx = new AssignmentStatementContext(_ctx, getState());
		enterRule(_localctx, 0, RULE_assignmentStatement);
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(30);
			assignable();
			setState(31);
			assignmentOperator();
			setState(32);
			expression(0);
			setState(33);
			statementTerminator();
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
	public static class AssignableContext extends ParserRuleContext {
		public DottedIdentifierContext dottedIdentifier() {
			return getRuleContext(DottedIdentifierContext.class,0);
		}
		public List<TerminalNode> ID() { return getTokens(ClarionAssignment.ID); }
		public TerminalNode ID(int i) {
			return getToken(ClarionAssignment.ID, i);
		}
		public TerminalNode QUESTION() { return getToken(ClarionAssignment.QUESTION, 0); }
		public TerminalNode LBRACE() { return getToken(ClarionAssignment.LBRACE, 0); }
		public TerminalNode RBRACE() { return getToken(ClarionAssignment.RBRACE, 0); }
		public AssignableContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_assignable; }
	}

	public final AssignableContext assignable() throws RecognitionException {
		AssignableContext _localctx = new AssignableContext(_ctx, getState());
		enterRule(_localctx, 2, RULE_assignable);
		try {
			setState(48);
			_errHandler.sync(this);
			switch ( getInterpreter().adaptivePredict(_input,0,_ctx) ) {
			case 1:
				enterOuterAlt(_localctx, 1);
				{
				setState(35);
				dottedIdentifier();
				}
				break;
			case 2:
				enterOuterAlt(_localctx, 2);
				{
				setState(36);
				match(ID);
				}
				break;
			case 3:
				enterOuterAlt(_localctx, 3);
				{
				setState(37);
				match(QUESTION);
				setState(38);
				match(ID);
				}
				break;
			case 4:
				enterOuterAlt(_localctx, 4);
				{
				setState(39);
				match(QUESTION);
				setState(40);
				match(ID);
				setState(41);
				match(LBRACE);
				setState(42);
				match(ID);
				setState(43);
				match(RBRACE);
				}
				break;
			case 5:
				enterOuterAlt(_localctx, 5);
				{
				setState(44);
				match(ID);
				setState(45);
				match(LBRACE);
				setState(46);
				match(ID);
				setState(47);
				match(RBRACE);
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
	public static class AssignmentOperatorContext extends ParserRuleContext {
		public TerminalNode EQUALS() { return getToken(ClarionAssignment.EQUALS, 0); }
		public TerminalNode AMPERSAND_EQUALS() { return getToken(ClarionAssignment.AMPERSAND_EQUALS, 0); }
		public AssignmentOperatorContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_assignmentOperator; }
	}

	public final AssignmentOperatorContext assignmentOperator() throws RecognitionException {
		AssignmentOperatorContext _localctx = new AssignmentOperatorContext(_ctx, getState());
		enterRule(_localctx, 4, RULE_assignmentOperator);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(50);
			_la = _input.LA(1);
			if ( !(_la==AMPERSAND_EQUALS || _la==EQUALS) ) {
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
	public static class StatementTerminatorContext extends ParserRuleContext {
		public TerminalNode STATEMENT_END() { return getToken(ClarionAssignment.STATEMENT_END, 0); }
		public TerminalNode LINEBREAK() { return getToken(ClarionAssignment.LINEBREAK, 0); }
		public TerminalNode END() { return getToken(ClarionAssignment.END, 0); }
		public StatementTerminatorContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_statementTerminator; }
	}

	public final StatementTerminatorContext statementTerminator() throws RecognitionException {
		StatementTerminatorContext _localctx = new StatementTerminatorContext(_ctx, getState());
		enterRule(_localctx, 6, RULE_statementTerminator);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(52);
			_la = _input.LA(1);
			if ( !(_la==STATEMENT_END || _la==END || _la==LINEBREAK) ) {
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
		public TerminalNode PLUS() { return getToken(ClarionAssignment.PLUS, 0); }
		public TermContext term() {
			return getRuleContext(TermContext.class,0);
		}
		public TerminalNode MINUS() { return getToken(ClarionAssignment.MINUS, 0); }
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
		int _startState = 8;
		enterRecursionRule(_localctx, 8, RULE_expression, _p);
		try {
			int _alt;
			enterOuterAlt(_localctx, 1);
			{
			{
			_localctx = new TermExpressionContext(_localctx);
			_ctx = _localctx;
			_prevctx = _localctx;

			setState(55);
			term(0);
			}
			_ctx.stop = _input.LT(-1);
			setState(65);
			_errHandler.sync(this);
			_alt = getInterpreter().adaptivePredict(_input,2,_ctx);
			while ( _alt!=2 && _alt!=org.antlr.v4.runtime.atn.ATN.INVALID_ALT_NUMBER ) {
				if ( _alt==1 ) {
					if ( _parseListeners!=null ) triggerExitRuleEvent();
					_prevctx = _localctx;
					{
					setState(63);
					_errHandler.sync(this);
					switch ( getInterpreter().adaptivePredict(_input,1,_ctx) ) {
					case 1:
						{
						_localctx = new AdditiveExpressionContext(new ExpressionContext(_parentctx, _parentState));
						pushNewRecursionContext(_localctx, _startState, RULE_expression);
						setState(57);
						if (!(precpred(_ctx, 3))) throw new FailedPredicateException(this, "precpred(_ctx, 3)");
						setState(58);
						match(PLUS);
						setState(59);
						term(0);
						}
						break;
					case 2:
						{
						_localctx = new AdditiveExpressionContext(new ExpressionContext(_parentctx, _parentState));
						pushNewRecursionContext(_localctx, _startState, RULE_expression);
						setState(60);
						if (!(precpred(_ctx, 2))) throw new FailedPredicateException(this, "precpred(_ctx, 2)");
						setState(61);
						match(MINUS);
						setState(62);
						term(0);
						}
						break;
					}
					} 
				}
				setState(67);
				_errHandler.sync(this);
				_alt = getInterpreter().adaptivePredict(_input,2,_ctx);
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
		public TerminalNode STAR() { return getToken(ClarionAssignment.STAR, 0); }
		public FactorContext factor() {
			return getRuleContext(FactorContext.class,0);
		}
		public TerminalNode SLASH() { return getToken(ClarionAssignment.SLASH, 0); }
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
		int _startState = 10;
		enterRecursionRule(_localctx, 10, RULE_term, _p);
		try {
			int _alt;
			enterOuterAlt(_localctx, 1);
			{
			{
			_localctx = new FactorExpressionContext(_localctx);
			_ctx = _localctx;
			_prevctx = _localctx;

			setState(69);
			factor();
			}
			_ctx.stop = _input.LT(-1);
			setState(79);
			_errHandler.sync(this);
			_alt = getInterpreter().adaptivePredict(_input,4,_ctx);
			while ( _alt!=2 && _alt!=org.antlr.v4.runtime.atn.ATN.INVALID_ALT_NUMBER ) {
				if ( _alt==1 ) {
					if ( _parseListeners!=null ) triggerExitRuleEvent();
					_prevctx = _localctx;
					{
					setState(77);
					_errHandler.sync(this);
					switch ( getInterpreter().adaptivePredict(_input,3,_ctx) ) {
					case 1:
						{
						_localctx = new MultiplicativeExpressionContext(new TermContext(_parentctx, _parentState));
						pushNewRecursionContext(_localctx, _startState, RULE_term);
						setState(71);
						if (!(precpred(_ctx, 3))) throw new FailedPredicateException(this, "precpred(_ctx, 3)");
						setState(72);
						match(STAR);
						setState(73);
						factor();
						}
						break;
					case 2:
						{
						_localctx = new MultiplicativeExpressionContext(new TermContext(_parentctx, _parentState));
						pushNewRecursionContext(_localctx, _startState, RULE_term);
						setState(74);
						if (!(precpred(_ctx, 2))) throw new FailedPredicateException(this, "precpred(_ctx, 2)");
						setState(75);
						match(SLASH);
						setState(76);
						factor();
						}
						break;
					}
					} 
				}
				setState(81);
				_errHandler.sync(this);
				_alt = getInterpreter().adaptivePredict(_input,4,_ctx);
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
		public TerminalNode FEQ() { return getToken(ClarionAssignment.FEQ, 0); }
		public FieldEquateFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}
	@SuppressWarnings("CheckReturnValue")
	public static class IntegerFactorContext extends FactorContext {
		public TerminalNode NUMERIC() { return getToken(ClarionAssignment.NUMERIC, 0); }
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
		public TerminalNode STRING() { return getToken(ClarionAssignment.STRING, 0); }
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
		public TerminalNode LPAREN() { return getToken(ClarionAssignment.LPAREN, 0); }
		public ExpressionContext expression() {
			return getRuleContext(ExpressionContext.class,0);
		}
		public TerminalNode RPAREN() { return getToken(ClarionAssignment.RPAREN, 0); }
		public ParenthesizedFactorContext(FactorContext ctx) { copyFrom(ctx); }
	}

	public final FactorContext factor() throws RecognitionException {
		FactorContext _localctx = new FactorContext(_ctx, getState());
		enterRule(_localctx, 12, RULE_factor);
		try {
			setState(92);
			_errHandler.sync(this);
			switch ( getInterpreter().adaptivePredict(_input,5,_ctx) ) {
			case 1:
				_localctx = new FunctionCallFactorContext(_localctx);
				enterOuterAlt(_localctx, 1);
				{
				setState(82);
				functionCall();
				}
				break;
			case 2:
				_localctx = new DottedIdentifierFactorContext(_localctx);
				enterOuterAlt(_localctx, 2);
				{
				setState(83);
				dottedIdentifier();
				}
				break;
			case 3:
				_localctx = new PropertyAccessFactorContext(_localctx);
				enterOuterAlt(_localctx, 3);
				{
				setState(84);
				propertyAccess();
				}
				break;
			case 4:
				_localctx = new FieldEquateFactorContext(_localctx);
				enterOuterAlt(_localctx, 4);
				{
				setState(85);
				match(FEQ);
				}
				break;
			case 5:
				_localctx = new IntegerFactorContext(_localctx);
				enterOuterAlt(_localctx, 5);
				{
				setState(86);
				match(NUMERIC);
				}
				break;
			case 6:
				_localctx = new StringFactorContext(_localctx);
				enterOuterAlt(_localctx, 6);
				{
				setState(87);
				match(STRING);
				}
				break;
			case 7:
				_localctx = new ParenthesizedFactorContext(_localctx);
				enterOuterAlt(_localctx, 7);
				{
				setState(88);
				match(LPAREN);
				setState(89);
				expression(0);
				setState(90);
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
		public List<TerminalNode> ID() { return getTokens(ClarionAssignment.ID); }
		public TerminalNode ID(int i) {
			return getToken(ClarionAssignment.ID, i);
		}
		public TerminalNode LBRACE() { return getToken(ClarionAssignment.LBRACE, 0); }
		public TerminalNode RBRACE() { return getToken(ClarionAssignment.RBRACE, 0); }
		public List<TerminalNode> COLON() { return getTokens(ClarionAssignment.COLON); }
		public TerminalNode COLON(int i) {
			return getToken(ClarionAssignment.COLON, i);
		}
		public PropertyAccessContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_propertyAccess; }
	}

	public final PropertyAccessContext propertyAccess() throws RecognitionException {
		PropertyAccessContext _localctx = new PropertyAccessContext(_ctx, getState());
		enterRule(_localctx, 14, RULE_propertyAccess);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(94);
			match(ID);
			setState(95);
			match(LBRACE);
			setState(96);
			match(ID);
			setState(101);
			_errHandler.sync(this);
			_la = _input.LA(1);
			while (_la==COLON) {
				{
				{
				setState(97);
				match(COLON);
				setState(98);
				match(ID);
				}
				}
				setState(103);
				_errHandler.sync(this);
				_la = _input.LA(1);
			}
			setState(104);
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
		public TerminalNode LPAREN() { return getToken(ClarionAssignment.LPAREN, 0); }
		public TerminalNode RPAREN() { return getToken(ClarionAssignment.RPAREN, 0); }
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
		enterRule(_localctx, 16, RULE_functionCall);
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(106);
			dottedIdentifier();
			setState(107);
			match(LPAREN);
			setState(109);
			_errHandler.sync(this);
			switch ( getInterpreter().adaptivePredict(_input,7,_ctx) ) {
			case 1:
				{
				setState(108);
				argumentList();
				}
				break;
			}
			setState(111);
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
		public List<TerminalNode> DOT() { return getTokens(ClarionAssignment.DOT); }
		public TerminalNode DOT(int i) {
			return getToken(ClarionAssignment.DOT, i);
		}
		public List<TerminalNode> ID() { return getTokens(ClarionAssignment.ID); }
		public TerminalNode ID(int i) {
			return getToken(ClarionAssignment.ID, i);
		}
		public TerminalNode SELF() { return getToken(ClarionAssignment.SELF, 0); }
		public TerminalNode PARENT() { return getToken(ClarionAssignment.PARENT, 0); }
		public DottedIdentifierContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_dottedIdentifier; }
	}

	public final DottedIdentifierContext dottedIdentifier() throws RecognitionException {
		DottedIdentifierContext _localctx = new DottedIdentifierContext(_ctx, getState());
		enterRule(_localctx, 18, RULE_dottedIdentifier);
		int _la;
		try {
			int _alt;
			setState(124);
			_errHandler.sync(this);
			switch (_input.LA(1)) {
			case SELF:
			case PARENT:
				enterOuterAlt(_localctx, 1);
				{
				setState(113);
				_la = _input.LA(1);
				if ( !(_la==SELF || _la==PARENT) ) {
				_errHandler.recoverInline(this);
				}
				else {
					if ( _input.LA(1)==Token.EOF ) matchedEOF = true;
					_errHandler.reportMatch(this);
					consume();
				}
				setState(114);
				match(DOT);
				setState(115);
				match(ID);
				}
				break;
			case ID:
				enterOuterAlt(_localctx, 2);
				{
				setState(116);
				match(ID);
				setState(121);
				_errHandler.sync(this);
				_alt = getInterpreter().adaptivePredict(_input,8,_ctx);
				while ( _alt!=2 && _alt!=org.antlr.v4.runtime.atn.ATN.INVALID_ALT_NUMBER ) {
					if ( _alt==1 ) {
						{
						{
						setState(117);
						match(DOT);
						setState(118);
						match(ID);
						}
						} 
					}
					setState(123);
					_errHandler.sync(this);
					_alt = getInterpreter().adaptivePredict(_input,8,_ctx);
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
		public List<TerminalNode> COMMA() { return getTokens(ClarionAssignment.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionAssignment.COMMA, i);
		}
		public ArgumentListContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_argumentList; }
	}

	public final ArgumentListContext argumentList() throws RecognitionException {
		ArgumentListContext _localctx = new ArgumentListContext(_ctx, getState());
		enterRule(_localctx, 20, RULE_argumentList);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(134);
			_errHandler.sync(this);
			_la = _input.LA(1);
			if ((((_la) & ~0x3f) == 0 && ((1L << _la) & -2L) != 0) || ((((_la - 64)) & ~0x3f) == 0 && ((1L << (_la - 64)) & 33419231L) != 0)) {
				{
				setState(126);
				expressionLike();
				setState(131);
				_errHandler.sync(this);
				_la = _input.LA(1);
				while (_la==COMMA) {
					{
					{
					setState(127);
					match(COMMA);
					setState(128);
					expressionLike();
					}
					}
					setState(133);
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
		public List<TerminalNode> RPAREN() { return getTokens(ClarionAssignment.RPAREN); }
		public TerminalNode RPAREN(int i) {
			return getToken(ClarionAssignment.RPAREN, i);
		}
		public List<TerminalNode> COMMA() { return getTokens(ClarionAssignment.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionAssignment.COMMA, i);
		}
		public List<TerminalNode> LINEBREAK() { return getTokens(ClarionAssignment.LINEBREAK); }
		public TerminalNode LINEBREAK(int i) {
			return getToken(ClarionAssignment.LINEBREAK, i);
		}
		public ExpressionLikeContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_expressionLike; }
	}

	public final ExpressionLikeContext expressionLike() throws RecognitionException {
		ExpressionLikeContext _localctx = new ExpressionLikeContext(_ctx, getState());
		enterRule(_localctx, 22, RULE_expressionLike);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(137); 
			_errHandler.sync(this);
			_la = _input.LA(1);
			do {
				{
				{
				setState(136);
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
				setState(139); 
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
		public TerminalNode LPAREN() { return getToken(ClarionAssignment.LPAREN, 0); }
		public TerminalNode RPAREN() { return getToken(ClarionAssignment.RPAREN, 0); }
		public List<ParameterContext> parameter() {
			return getRuleContexts(ParameterContext.class);
		}
		public ParameterContext parameter(int i) {
			return getRuleContext(ParameterContext.class,i);
		}
		public List<TerminalNode> COMMA() { return getTokens(ClarionAssignment.COMMA); }
		public TerminalNode COMMA(int i) {
			return getToken(ClarionAssignment.COMMA, i);
		}
		public ParameterListContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_parameterList; }
	}

	public final ParameterListContext parameterList() throws RecognitionException {
		ParameterListContext _localctx = new ParameterListContext(_ctx, getState());
		enterRule(_localctx, 24, RULE_parameterList);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(141);
			match(LPAREN);
			setState(150);
			_errHandler.sync(this);
			_la = _input.LA(1);
			if (_la==ID || _la==STRING) {
				{
				setState(142);
				parameter();
				setState(147);
				_errHandler.sync(this);
				_la = _input.LA(1);
				while (_la==COMMA) {
					{
					{
					setState(143);
					match(COMMA);
					setState(144);
					parameter();
					}
					}
					setState(149);
					_errHandler.sync(this);
					_la = _input.LA(1);
				}
				}
			}

			setState(152);
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
		public TerminalNode ID() { return getToken(ClarionAssignment.ID, 0); }
		public TerminalNode STRING() { return getToken(ClarionAssignment.STRING, 0); }
		public ParameterContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_parameter; }
	}

	public final ParameterContext parameter() throws RecognitionException {
		ParameterContext _localctx = new ParameterContext(_ctx, getState());
		enterRule(_localctx, 26, RULE_parameter);
		int _la;
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(154);
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
		public TerminalNode ID() { return getToken(ClarionAssignment.ID, 0); }
		public ReturnTypeContext(ParserRuleContext parent, int invokingState) {
			super(parent, invokingState);
		}
		@Override public int getRuleIndex() { return RULE_returnType; }
	}

	public final ReturnTypeContext returnType() throws RecognitionException {
		ReturnTypeContext _localctx = new ReturnTypeContext(_ctx, getState());
		enterRule(_localctx, 28, RULE_returnType);
		try {
			enterOuterAlt(_localctx, 1);
			{
			setState(156);
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
		case 4:
			return expression_sempred((ExpressionContext)_localctx, predIndex);
		case 5:
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
		"\u0004\u0001X\u009f\u0002\u0000\u0007\u0000\u0002\u0001\u0007\u0001\u0002"+
		"\u0002\u0007\u0002\u0002\u0003\u0007\u0003\u0002\u0004\u0007\u0004\u0002"+
		"\u0005\u0007\u0005\u0002\u0006\u0007\u0006\u0002\u0007\u0007\u0007\u0002"+
		"\b\u0007\b\u0002\t\u0007\t\u0002\n\u0007\n\u0002\u000b\u0007\u000b\u0002"+
		"\f\u0007\f\u0002\r\u0007\r\u0002\u000e\u0007\u000e\u0001\u0000\u0001\u0000"+
		"\u0001\u0000\u0001\u0000\u0001\u0000\u0001\u0001\u0001\u0001\u0001\u0001"+
		"\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001"+
		"\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0003\u00011\b\u0001"+
		"\u0001\u0002\u0001\u0002\u0001\u0003\u0001\u0003\u0001\u0004\u0001\u0004"+
		"\u0001\u0004\u0001\u0004\u0001\u0004\u0001\u0004\u0001\u0004\u0001\u0004"+
		"\u0001\u0004\u0005\u0004@\b\u0004\n\u0004\f\u0004C\t\u0004\u0001\u0005"+
		"\u0001\u0005\u0001\u0005\u0001\u0005\u0001\u0005\u0001\u0005\u0001\u0005"+
		"\u0001\u0005\u0001\u0005\u0005\u0005N\b\u0005\n\u0005\f\u0005Q\t\u0005"+
		"\u0001\u0006\u0001\u0006\u0001\u0006\u0001\u0006\u0001\u0006\u0001\u0006"+
		"\u0001\u0006\u0001\u0006\u0001\u0006\u0001\u0006\u0003\u0006]\b\u0006"+
		"\u0001\u0007\u0001\u0007\u0001\u0007\u0001\u0007\u0001\u0007\u0005\u0007"+
		"d\b\u0007\n\u0007\f\u0007g\t\u0007\u0001\u0007\u0001\u0007\u0001\b\u0001"+
		"\b\u0001\b\u0003\bn\b\b\u0001\b\u0001\b\u0001\t\u0001\t\u0001\t\u0001"+
		"\t\u0001\t\u0001\t\u0005\tx\b\t\n\t\f\t{\t\t\u0003\t}\b\t\u0001\n\u0001"+
		"\n\u0001\n\u0005\n\u0082\b\n\n\n\f\n\u0085\t\n\u0003\n\u0087\b\n\u0001"+
		"\u000b\u0004\u000b\u008a\b\u000b\u000b\u000b\f\u000b\u008b\u0001\f\u0001"+
		"\f\u0001\f\u0001\f\u0005\f\u0092\b\f\n\f\f\f\u0095\t\f\u0003\f\u0097\b"+
		"\f\u0001\f\u0001\f\u0001\r\u0001\r\u0001\u000e\u0001\u000e\u0001\u000e"+
		"\u0000\u0002\b\n\u000f\u0000\u0002\u0004\u0006\b\n\f\u000e\u0010\u0012"+
		"\u0014\u0016\u0018\u001a\u001c\u0000\u0005\u0002\u0000GGTT\u0003\u0000"+
		"\u0001\u0001\r\rEE\u0001\u0000;<\u0003\u0000EELLQQ\u0001\u0000>?\u00a6"+
		"\u0000\u001e\u0001\u0000\u0000\u0000\u00020\u0001\u0000\u0000\u0000\u0004"+
		"2\u0001\u0000\u0000\u0000\u00064\u0001\u0000\u0000\u0000\b6\u0001\u0000"+
		"\u0000\u0000\nD\u0001\u0000\u0000\u0000\f\\\u0001\u0000\u0000\u0000\u000e"+
		"^\u0001\u0000\u0000\u0000\u0010j\u0001\u0000\u0000\u0000\u0012|\u0001"+
		"\u0000\u0000\u0000\u0014\u0086\u0001\u0000\u0000\u0000\u0016\u0089\u0001"+
		"\u0000\u0000\u0000\u0018\u008d\u0001\u0000\u0000\u0000\u001a\u009a\u0001"+
		"\u0000\u0000\u0000\u001c\u009c\u0001\u0000\u0000\u0000\u001e\u001f\u0003"+
		"\u0002\u0001\u0000\u001f \u0003\u0004\u0002\u0000 !\u0003\b\u0004\u0000"+
		"!\"\u0003\u0006\u0003\u0000\"\u0001\u0001\u0000\u0000\u0000#1\u0003\u0012"+
		"\t\u0000$1\u0005>\u0000\u0000%&\u0005W\u0000\u0000&1\u0005>\u0000\u0000"+
		"\'(\u0005W\u0000\u0000()\u0005>\u0000\u0000)*\u0005R\u0000\u0000*+\u0005"+
		">\u0000\u0000+1\u0005S\u0000\u0000,-\u0005>\u0000\u0000-.\u0005R\u0000"+
		"\u0000./\u0005>\u0000\u0000/1\u0005S\u0000\u00000#\u0001\u0000\u0000\u0000"+
		"0$\u0001\u0000\u0000\u00000%\u0001\u0000\u0000\u00000\'\u0001\u0000\u0000"+
		"\u00000,\u0001\u0000\u0000\u00001\u0003\u0001\u0000\u0000\u000023\u0007"+
		"\u0000\u0000\u00003\u0005\u0001\u0000\u0000\u000045\u0007\u0001\u0000"+
		"\u00005\u0007\u0001\u0000\u0000\u000067\u0006\u0004\uffff\uffff\u0000"+
		"78\u0003\n\u0005\u00008A\u0001\u0000\u0000\u00009:\n\u0003\u0000\u0000"+
		":;\u0005H\u0000\u0000;@\u0003\n\u0005\u0000<=\n\u0002\u0000\u0000=>\u0005"+
		"I\u0000\u0000>@\u0003\n\u0005\u0000?9\u0001\u0000\u0000\u0000?<\u0001"+
		"\u0000\u0000\u0000@C\u0001\u0000\u0000\u0000A?\u0001\u0000\u0000\u0000"+
		"AB\u0001\u0000\u0000\u0000B\t\u0001\u0000\u0000\u0000CA\u0001\u0000\u0000"+
		"\u0000DE\u0006\u0005\uffff\uffff\u0000EF\u0003\f\u0006\u0000FO\u0001\u0000"+
		"\u0000\u0000GH\n\u0003\u0000\u0000HI\u0005J\u0000\u0000IN\u0003\f\u0006"+
		"\u0000JK\n\u0002\u0000\u0000KL\u0005K\u0000\u0000LN\u0003\f\u0006\u0000"+
		"MG\u0001\u0000\u0000\u0000MJ\u0001\u0000\u0000\u0000NQ\u0001\u0000\u0000"+
		"\u0000OM\u0001\u0000\u0000\u0000OP\u0001\u0000\u0000\u0000P\u000b\u0001"+
		"\u0000\u0000\u0000QO\u0001\u0000\u0000\u0000R]\u0003\u0010\b\u0000S]\u0003"+
		"\u0012\t\u0000T]\u0003\u000e\u0007\u0000U]\u0005=\u0000\u0000V]\u0005"+
		"@\u0000\u0000W]\u0005?\u0000\u0000XY\u0005P\u0000\u0000YZ\u0003\b\u0004"+
		"\u0000Z[\u0005Q\u0000\u0000[]\u0001\u0000\u0000\u0000\\R\u0001\u0000\u0000"+
		"\u0000\\S\u0001\u0000\u0000\u0000\\T\u0001\u0000\u0000\u0000\\U\u0001"+
		"\u0000\u0000\u0000\\V\u0001\u0000\u0000\u0000\\W\u0001\u0000\u0000\u0000"+
		"\\X\u0001\u0000\u0000\u0000]\r\u0001\u0000\u0000\u0000^_\u0005>\u0000"+
		"\u0000_`\u0005R\u0000\u0000`e\u0005>\u0000\u0000ab\u0005N\u0000\u0000"+
		"bd\u0005>\u0000\u0000ca\u0001\u0000\u0000\u0000dg\u0001\u0000\u0000\u0000"+
		"ec\u0001\u0000\u0000\u0000ef\u0001\u0000\u0000\u0000fh\u0001\u0000\u0000"+
		"\u0000ge\u0001\u0000\u0000\u0000hi\u0005S\u0000\u0000i\u000f\u0001\u0000"+
		"\u0000\u0000jk\u0003\u0012\t\u0000km\u0005P\u0000\u0000ln\u0003\u0014"+
		"\n\u0000ml\u0001\u0000\u0000\u0000mn\u0001\u0000\u0000\u0000no\u0001\u0000"+
		"\u0000\u0000op\u0005Q\u0000\u0000p\u0011\u0001\u0000\u0000\u0000qr\u0007"+
		"\u0002\u0000\u0000rs\u0005M\u0000\u0000s}\u0005>\u0000\u0000ty\u0005>"+
		"\u0000\u0000uv\u0005M\u0000\u0000vx\u0005>\u0000\u0000wu\u0001\u0000\u0000"+
		"\u0000x{\u0001\u0000\u0000\u0000yw\u0001\u0000\u0000\u0000yz\u0001\u0000"+
		"\u0000\u0000z}\u0001\u0000\u0000\u0000{y\u0001\u0000\u0000\u0000|q\u0001"+
		"\u0000\u0000\u0000|t\u0001\u0000\u0000\u0000}\u0013\u0001\u0000\u0000"+
		"\u0000~\u0083\u0003\u0016\u000b\u0000\u007f\u0080\u0005L\u0000\u0000\u0080"+
		"\u0082\u0003\u0016\u000b\u0000\u0081\u007f\u0001\u0000\u0000\u0000\u0082"+
		"\u0085\u0001\u0000\u0000\u0000\u0083\u0081\u0001\u0000\u0000\u0000\u0083"+
		"\u0084\u0001\u0000\u0000\u0000\u0084\u0087\u0001\u0000\u0000\u0000\u0085"+
		"\u0083\u0001\u0000\u0000\u0000\u0086~\u0001\u0000\u0000\u0000\u0086\u0087"+
		"\u0001\u0000\u0000\u0000\u0087\u0015\u0001\u0000\u0000\u0000\u0088\u008a"+
		"\b\u0003\u0000\u0000\u0089\u0088\u0001\u0000\u0000\u0000\u008a\u008b\u0001"+
		"\u0000\u0000\u0000\u008b\u0089\u0001\u0000\u0000\u0000\u008b\u008c\u0001"+
		"\u0000\u0000\u0000\u008c\u0017\u0001\u0000\u0000\u0000\u008d\u0096\u0005"+
		"P\u0000\u0000\u008e\u0093\u0003\u001a\r\u0000\u008f\u0090\u0005L\u0000"+
		"\u0000\u0090\u0092\u0003\u001a\r\u0000\u0091\u008f\u0001\u0000\u0000\u0000"+
		"\u0092\u0095\u0001\u0000\u0000\u0000\u0093\u0091\u0001\u0000\u0000\u0000"+
		"\u0093\u0094\u0001\u0000\u0000\u0000\u0094\u0097\u0001\u0000\u0000\u0000"+
		"\u0095\u0093\u0001\u0000\u0000\u0000\u0096\u008e\u0001\u0000\u0000\u0000"+
		"\u0096\u0097\u0001\u0000\u0000\u0000\u0097\u0098\u0001\u0000\u0000\u0000"+
		"\u0098\u0099\u0005Q\u0000\u0000\u0099\u0019\u0001\u0000\u0000\u0000\u009a"+
		"\u009b\u0007\u0004\u0000\u0000\u009b\u001b\u0001\u0000\u0000\u0000\u009c"+
		"\u009d\u0005>\u0000\u0000\u009d\u001d\u0001\u0000\u0000\u0000\u000f0?"+
		"AMO\\emy|\u0083\u0086\u008b\u0093\u0096";
	public static final ATN _ATN =
		new ATNDeserializer().deserialize(_serializedATN.toCharArray());
	static {
		_decisionToDFA = new DFA[_ATN.getNumberOfDecisions()];
		for (int i = 0; i < _ATN.getNumberOfDecisions(); i++) {
			_decisionToDFA[i] = new DFA(_ATN.getDecisionState(i), i);
		}
	}
}