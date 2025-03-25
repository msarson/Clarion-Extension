// Generated from f:/github/Clarion-Extension/Clarion-Extension/server/antlr/ClarionStructureLexer.g4 by ANTLR 4.13.1
import org.antlr.v4.runtime.Lexer;
import org.antlr.v4.runtime.CharStream;
import org.antlr.v4.runtime.Token;
import org.antlr.v4.runtime.TokenStream;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.atn.*;
import org.antlr.v4.runtime.dfa.DFA;
import org.antlr.v4.runtime.misc.*;

@SuppressWarnings({"all", "warnings", "unchecked", "unused", "cast", "CheckReturnValue", "this-escape"})
public class ClarionStructureLexer extends Lexer {
	static { RuntimeMetaData.checkVersion("4.13.1", RuntimeMetaData.VERSION); }

	protected static final DFA[] _decisionToDFA;
	protected static final PredictionContextCache _sharedContextCache =
		new PredictionContextCache();
	public static final int
		PROGRAM=1, MEMBER=2, MAP=3, MODULE=4, END=5, CODE=6, CLASS=7, ROUTINE=8, 
		PROCEDURE=9, GROUP=10, QUEUE=11, RECORD=12, FILE=13, WINDOW=14, APPLICATION=15, 
		MENUBAR=16, TOOLBAR=17, SHEET=18, TAB=19, RETURN=20, LPAREN=21, RPAREN=22, 
		COMMA=23, DOT=24, EXCLAMATION=25, EQUALS=26, ARROW=27, ID=28, STRING=29, 
		NUMERIC=30, WS=31, COMMENT=32;
	public static String[] channelNames = {
		"DEFAULT_TOKEN_CHANNEL", "HIDDEN"
	};

	public static String[] modeNames = {
		"DEFAULT_MODE"
	};

	private static String[] makeRuleNames() {
		return new String[] {
			"PROGRAM", "MEMBER", "MAP", "MODULE", "END", "CODE", "CLASS", "ROUTINE", 
			"PROCEDURE", "GROUP", "QUEUE", "RECORD", "FILE", "WINDOW", "APPLICATION", 
			"MENUBAR", "TOOLBAR", "SHEET", "TAB", "RETURN", "LPAREN", "RPAREN", "COMMA", 
			"DOT", "EXCLAMATION", "EQUALS", "ARROW", "ID", "STRING", "NUMERIC", "WS", 
			"COMMENT"
		};
	}
	public static final String[] ruleNames = makeRuleNames();

	private static String[] makeLiteralNames() {
		return new String[] {
			null, "'PROGRAM'", "'MEMBER'", "'MAP'", "'MODULE'", "'END'", "'CODE'", 
			"'CLASS'", "'ROUTINE'", "'PROCEDURE'", "'GROUP'", "'QUEUE'", "'RECORD'", 
			"'FILE'", "'WINDOW'", "'APPLICATION'", "'MENUBAR'", "'TOOLBAR'", "'SHEET'", 
			"'TAB'", "'RETURN'", "'('", "')'", "','", "'.'", "'!'", "'='", "'=>'"
		};
	}
	private static final String[] _LITERAL_NAMES = makeLiteralNames();
	private static String[] makeSymbolicNames() {
		return new String[] {
			null, "PROGRAM", "MEMBER", "MAP", "MODULE", "END", "CODE", "CLASS", "ROUTINE", 
			"PROCEDURE", "GROUP", "QUEUE", "RECORD", "FILE", "WINDOW", "APPLICATION", 
			"MENUBAR", "TOOLBAR", "SHEET", "TAB", "RETURN", "LPAREN", "RPAREN", "COMMA", 
			"DOT", "EXCLAMATION", "EQUALS", "ARROW", "ID", "STRING", "NUMERIC", "WS", 
			"COMMENT"
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


	public ClarionStructureLexer(CharStream input) {
		super(input);
		_interp = new LexerATNSimulator(this,_ATN,_decisionToDFA,_sharedContextCache);
	}

	@Override
	public String getGrammarFileName() { return "ClarionStructureLexer.g4"; }

	@Override
	public String[] getRuleNames() { return ruleNames; }

	@Override
	public String getSerializedATN() { return _serializedATN; }

	@Override
	public String[] getChannelNames() { return channelNames; }

	@Override
	public String[] getModeNames() { return modeNames; }

	@Override
	public ATN getATN() { return _ATN; }

	public static final String _serializedATN =
		"\u0004\u0000 \u00fe\u0006\uffff\uffff\u0002\u0000\u0007\u0000\u0002\u0001"+
		"\u0007\u0001\u0002\u0002\u0007\u0002\u0002\u0003\u0007\u0003\u0002\u0004"+
		"\u0007\u0004\u0002\u0005\u0007\u0005\u0002\u0006\u0007\u0006\u0002\u0007"+
		"\u0007\u0007\u0002\b\u0007\b\u0002\t\u0007\t\u0002\n\u0007\n\u0002\u000b"+
		"\u0007\u000b\u0002\f\u0007\f\u0002\r\u0007\r\u0002\u000e\u0007\u000e\u0002"+
		"\u000f\u0007\u000f\u0002\u0010\u0007\u0010\u0002\u0011\u0007\u0011\u0002"+
		"\u0012\u0007\u0012\u0002\u0013\u0007\u0013\u0002\u0014\u0007\u0014\u0002"+
		"\u0015\u0007\u0015\u0002\u0016\u0007\u0016\u0002\u0017\u0007\u0017\u0002"+
		"\u0018\u0007\u0018\u0002\u0019\u0007\u0019\u0002\u001a\u0007\u001a\u0002"+
		"\u001b\u0007\u001b\u0002\u001c\u0007\u001c\u0002\u001d\u0007\u001d\u0002"+
		"\u001e\u0007\u001e\u0002\u001f\u0007\u001f\u0001\u0000\u0001\u0000\u0001"+
		"\u0000\u0001\u0000\u0001\u0000\u0001\u0000\u0001\u0000\u0001\u0000\u0001"+
		"\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001"+
		"\u0001\u0001\u0002\u0001\u0002\u0001\u0002\u0001\u0002\u0001\u0003\u0001"+
		"\u0003\u0001\u0003\u0001\u0003\u0001\u0003\u0001\u0003\u0001\u0003\u0001"+
		"\u0004\u0001\u0004\u0001\u0004\u0001\u0004\u0001\u0005\u0001\u0005\u0001"+
		"\u0005\u0001\u0005\u0001\u0005\u0001\u0006\u0001\u0006\u0001\u0006\u0001"+
		"\u0006\u0001\u0006\u0001\u0006\u0001\u0007\u0001\u0007\u0001\u0007\u0001"+
		"\u0007\u0001\u0007\u0001\u0007\u0001\u0007\u0001\u0007\u0001\b\u0001\b"+
		"\u0001\b\u0001\b\u0001\b\u0001\b\u0001\b\u0001\b\u0001\b\u0001\b\u0001"+
		"\t\u0001\t\u0001\t\u0001\t\u0001\t\u0001\t\u0001\n\u0001\n\u0001\n\u0001"+
		"\n\u0001\n\u0001\n\u0001\u000b\u0001\u000b\u0001\u000b\u0001\u000b\u0001"+
		"\u000b\u0001\u000b\u0001\u000b\u0001\f\u0001\f\u0001\f\u0001\f\u0001\f"+
		"\u0001\r\u0001\r\u0001\r\u0001\r\u0001\r\u0001\r\u0001\r\u0001\u000e\u0001"+
		"\u000e\u0001\u000e\u0001\u000e\u0001\u000e\u0001\u000e\u0001\u000e\u0001"+
		"\u000e\u0001\u000e\u0001\u000e\u0001\u000e\u0001\u000e\u0001\u000f\u0001"+
		"\u000f\u0001\u000f\u0001\u000f\u0001\u000f\u0001\u000f\u0001\u000f\u0001"+
		"\u000f\u0001\u0010\u0001\u0010\u0001\u0010\u0001\u0010\u0001\u0010\u0001"+
		"\u0010\u0001\u0010\u0001\u0010\u0001\u0011\u0001\u0011\u0001\u0011\u0001"+
		"\u0011\u0001\u0011\u0001\u0011\u0001\u0012\u0001\u0012\u0001\u0012\u0001"+
		"\u0012\u0001\u0013\u0001\u0013\u0001\u0013\u0001\u0013\u0001\u0013\u0001"+
		"\u0013\u0001\u0013\u0001\u0014\u0001\u0014\u0001\u0015\u0001\u0015\u0001"+
		"\u0016\u0001\u0016\u0001\u0017\u0001\u0017\u0001\u0018\u0001\u0018\u0001"+
		"\u0019\u0001\u0019\u0001\u001a\u0001\u001a\u0001\u001a\u0001\u001b\u0001"+
		"\u001b\u0005\u001b\u00da\b\u001b\n\u001b\f\u001b\u00dd\t\u001b\u0001\u001c"+
		"\u0001\u001c\u0001\u001c\u0001\u001c\u0005\u001c\u00e3\b\u001c\n\u001c"+
		"\f\u001c\u00e6\t\u001c\u0001\u001c\u0001\u001c\u0001\u001d\u0004\u001d"+
		"\u00eb\b\u001d\u000b\u001d\f\u001d\u00ec\u0001\u001e\u0004\u001e\u00f0"+
		"\b\u001e\u000b\u001e\f\u001e\u00f1\u0001\u001e\u0001\u001e\u0001\u001f"+
		"\u0001\u001f\u0005\u001f\u00f8\b\u001f\n\u001f\f\u001f\u00fb\t\u001f\u0001"+
		"\u001f\u0001\u001f\u0000\u0000 \u0001\u0001\u0003\u0002\u0005\u0003\u0007"+
		"\u0004\t\u0005\u000b\u0006\r\u0007\u000f\b\u0011\t\u0013\n\u0015\u000b"+
		"\u0017\f\u0019\r\u001b\u000e\u001d\u000f\u001f\u0010!\u0011#\u0012%\u0013"+
		"\'\u0014)\u0015+\u0016-\u0017/\u00181\u00193\u001a5\u001b7\u001c9\u001d"+
		";\u001e=\u001f? \u0001\u0000\u0006\u0003\u0000AZ__az\u0004\u00000:AZ_"+
		"_az\u0003\u0000\n\n\r\r\'\'\u0001\u000009\u0003\u0000\t\n\r\r  \u0002"+
		"\u0000\n\n\r\r\u0103\u0000\u0001\u0001\u0000\u0000\u0000\u0000\u0003\u0001"+
		"\u0000\u0000\u0000\u0000\u0005\u0001\u0000\u0000\u0000\u0000\u0007\u0001"+
		"\u0000\u0000\u0000\u0000\t\u0001\u0000\u0000\u0000\u0000\u000b\u0001\u0000"+
		"\u0000\u0000\u0000\r\u0001\u0000\u0000\u0000\u0000\u000f\u0001\u0000\u0000"+
		"\u0000\u0000\u0011\u0001\u0000\u0000\u0000\u0000\u0013\u0001\u0000\u0000"+
		"\u0000\u0000\u0015\u0001\u0000\u0000\u0000\u0000\u0017\u0001\u0000\u0000"+
		"\u0000\u0000\u0019\u0001\u0000\u0000\u0000\u0000\u001b\u0001\u0000\u0000"+
		"\u0000\u0000\u001d\u0001\u0000\u0000\u0000\u0000\u001f\u0001\u0000\u0000"+
		"\u0000\u0000!\u0001\u0000\u0000\u0000\u0000#\u0001\u0000\u0000\u0000\u0000"+
		"%\u0001\u0000\u0000\u0000\u0000\'\u0001\u0000\u0000\u0000\u0000)\u0001"+
		"\u0000\u0000\u0000\u0000+\u0001\u0000\u0000\u0000\u0000-\u0001\u0000\u0000"+
		"\u0000\u0000/\u0001\u0000\u0000\u0000\u00001\u0001\u0000\u0000\u0000\u0000"+
		"3\u0001\u0000\u0000\u0000\u00005\u0001\u0000\u0000\u0000\u00007\u0001"+
		"\u0000\u0000\u0000\u00009\u0001\u0000\u0000\u0000\u0000;\u0001\u0000\u0000"+
		"\u0000\u0000=\u0001\u0000\u0000\u0000\u0000?\u0001\u0000\u0000\u0000\u0001"+
		"A\u0001\u0000\u0000\u0000\u0003I\u0001\u0000\u0000\u0000\u0005P\u0001"+
		"\u0000\u0000\u0000\u0007T\u0001\u0000\u0000\u0000\t[\u0001\u0000\u0000"+
		"\u0000\u000b_\u0001\u0000\u0000\u0000\rd\u0001\u0000\u0000\u0000\u000f"+
		"j\u0001\u0000\u0000\u0000\u0011r\u0001\u0000\u0000\u0000\u0013|\u0001"+
		"\u0000\u0000\u0000\u0015\u0082\u0001\u0000\u0000\u0000\u0017\u0088\u0001"+
		"\u0000\u0000\u0000\u0019\u008f\u0001\u0000\u0000\u0000\u001b\u0094\u0001"+
		"\u0000\u0000\u0000\u001d\u009b\u0001\u0000\u0000\u0000\u001f\u00a7\u0001"+
		"\u0000\u0000\u0000!\u00af\u0001\u0000\u0000\u0000#\u00b7\u0001\u0000\u0000"+
		"\u0000%\u00bd\u0001\u0000\u0000\u0000\'\u00c1\u0001\u0000\u0000\u0000"+
		")\u00c8\u0001\u0000\u0000\u0000+\u00ca\u0001\u0000\u0000\u0000-\u00cc"+
		"\u0001\u0000\u0000\u0000/\u00ce\u0001\u0000\u0000\u00001\u00d0\u0001\u0000"+
		"\u0000\u00003\u00d2\u0001\u0000\u0000\u00005\u00d4\u0001\u0000\u0000\u0000"+
		"7\u00d7\u0001\u0000\u0000\u00009\u00de\u0001\u0000\u0000\u0000;\u00ea"+
		"\u0001\u0000\u0000\u0000=\u00ef\u0001\u0000\u0000\u0000?\u00f5\u0001\u0000"+
		"\u0000\u0000AB\u0005P\u0000\u0000BC\u0005R\u0000\u0000CD\u0005O\u0000"+
		"\u0000DE\u0005G\u0000\u0000EF\u0005R\u0000\u0000FG\u0005A\u0000\u0000"+
		"GH\u0005M\u0000\u0000H\u0002\u0001\u0000\u0000\u0000IJ\u0005M\u0000\u0000"+
		"JK\u0005E\u0000\u0000KL\u0005M\u0000\u0000LM\u0005B\u0000\u0000MN\u0005"+
		"E\u0000\u0000NO\u0005R\u0000\u0000O\u0004\u0001\u0000\u0000\u0000PQ\u0005"+
		"M\u0000\u0000QR\u0005A\u0000\u0000RS\u0005P\u0000\u0000S\u0006\u0001\u0000"+
		"\u0000\u0000TU\u0005M\u0000\u0000UV\u0005O\u0000\u0000VW\u0005D\u0000"+
		"\u0000WX\u0005U\u0000\u0000XY\u0005L\u0000\u0000YZ\u0005E\u0000\u0000"+
		"Z\b\u0001\u0000\u0000\u0000[\\\u0005E\u0000\u0000\\]\u0005N\u0000\u0000"+
		"]^\u0005D\u0000\u0000^\n\u0001\u0000\u0000\u0000_`\u0005C\u0000\u0000"+
		"`a\u0005O\u0000\u0000ab\u0005D\u0000\u0000bc\u0005E\u0000\u0000c\f\u0001"+
		"\u0000\u0000\u0000de\u0005C\u0000\u0000ef\u0005L\u0000\u0000fg\u0005A"+
		"\u0000\u0000gh\u0005S\u0000\u0000hi\u0005S\u0000\u0000i\u000e\u0001\u0000"+
		"\u0000\u0000jk\u0005R\u0000\u0000kl\u0005O\u0000\u0000lm\u0005U\u0000"+
		"\u0000mn\u0005T\u0000\u0000no\u0005I\u0000\u0000op\u0005N\u0000\u0000"+
		"pq\u0005E\u0000\u0000q\u0010\u0001\u0000\u0000\u0000rs\u0005P\u0000\u0000"+
		"st\u0005R\u0000\u0000tu\u0005O\u0000\u0000uv\u0005C\u0000\u0000vw\u0005"+
		"E\u0000\u0000wx\u0005D\u0000\u0000xy\u0005U\u0000\u0000yz\u0005R\u0000"+
		"\u0000z{\u0005E\u0000\u0000{\u0012\u0001\u0000\u0000\u0000|}\u0005G\u0000"+
		"\u0000}~\u0005R\u0000\u0000~\u007f\u0005O\u0000\u0000\u007f\u0080\u0005"+
		"U\u0000\u0000\u0080\u0081\u0005P\u0000\u0000\u0081\u0014\u0001\u0000\u0000"+
		"\u0000\u0082\u0083\u0005Q\u0000\u0000\u0083\u0084\u0005U\u0000\u0000\u0084"+
		"\u0085\u0005E\u0000\u0000\u0085\u0086\u0005U\u0000\u0000\u0086\u0087\u0005"+
		"E\u0000\u0000\u0087\u0016\u0001\u0000\u0000\u0000\u0088\u0089\u0005R\u0000"+
		"\u0000\u0089\u008a\u0005E\u0000\u0000\u008a\u008b\u0005C\u0000\u0000\u008b"+
		"\u008c\u0005O\u0000\u0000\u008c\u008d\u0005R\u0000\u0000\u008d\u008e\u0005"+
		"D\u0000\u0000\u008e\u0018\u0001\u0000\u0000\u0000\u008f\u0090\u0005F\u0000"+
		"\u0000\u0090\u0091\u0005I\u0000\u0000\u0091\u0092\u0005L\u0000\u0000\u0092"+
		"\u0093\u0005E\u0000\u0000\u0093\u001a\u0001\u0000\u0000\u0000\u0094\u0095"+
		"\u0005W\u0000\u0000\u0095\u0096\u0005I\u0000\u0000\u0096\u0097\u0005N"+
		"\u0000\u0000\u0097\u0098\u0005D\u0000\u0000\u0098\u0099\u0005O\u0000\u0000"+
		"\u0099\u009a\u0005W\u0000\u0000\u009a\u001c\u0001\u0000\u0000\u0000\u009b"+
		"\u009c\u0005A\u0000\u0000\u009c\u009d\u0005P\u0000\u0000\u009d\u009e\u0005"+
		"P\u0000\u0000\u009e\u009f\u0005L\u0000\u0000\u009f\u00a0\u0005I\u0000"+
		"\u0000\u00a0\u00a1\u0005C\u0000\u0000\u00a1\u00a2\u0005A\u0000\u0000\u00a2"+
		"\u00a3\u0005T\u0000\u0000\u00a3\u00a4\u0005I\u0000\u0000\u00a4\u00a5\u0005"+
		"O\u0000\u0000\u00a5\u00a6\u0005N\u0000\u0000\u00a6\u001e\u0001\u0000\u0000"+
		"\u0000\u00a7\u00a8\u0005M\u0000\u0000\u00a8\u00a9\u0005E\u0000\u0000\u00a9"+
		"\u00aa\u0005N\u0000\u0000\u00aa\u00ab\u0005U\u0000\u0000\u00ab\u00ac\u0005"+
		"B\u0000\u0000\u00ac\u00ad\u0005A\u0000\u0000\u00ad\u00ae\u0005R\u0000"+
		"\u0000\u00ae \u0001\u0000\u0000\u0000\u00af\u00b0\u0005T\u0000\u0000\u00b0"+
		"\u00b1\u0005O\u0000\u0000\u00b1\u00b2\u0005O\u0000\u0000\u00b2\u00b3\u0005"+
		"L\u0000\u0000\u00b3\u00b4\u0005B\u0000\u0000\u00b4\u00b5\u0005A\u0000"+
		"\u0000\u00b5\u00b6\u0005R\u0000\u0000\u00b6\"\u0001\u0000\u0000\u0000"+
		"\u00b7\u00b8\u0005S\u0000\u0000\u00b8\u00b9\u0005H\u0000\u0000\u00b9\u00ba"+
		"\u0005E\u0000\u0000\u00ba\u00bb\u0005E\u0000\u0000\u00bb\u00bc\u0005T"+
		"\u0000\u0000\u00bc$\u0001\u0000\u0000\u0000\u00bd\u00be\u0005T\u0000\u0000"+
		"\u00be\u00bf\u0005A\u0000\u0000\u00bf\u00c0\u0005B\u0000\u0000\u00c0&"+
		"\u0001\u0000\u0000\u0000\u00c1\u00c2\u0005R\u0000\u0000\u00c2\u00c3\u0005"+
		"E\u0000\u0000\u00c3\u00c4\u0005T\u0000\u0000\u00c4\u00c5\u0005U\u0000"+
		"\u0000\u00c5\u00c6\u0005R\u0000\u0000\u00c6\u00c7\u0005N\u0000\u0000\u00c7"+
		"(\u0001\u0000\u0000\u0000\u00c8\u00c9\u0005(\u0000\u0000\u00c9*\u0001"+
		"\u0000\u0000\u0000\u00ca\u00cb\u0005)\u0000\u0000\u00cb,\u0001\u0000\u0000"+
		"\u0000\u00cc\u00cd\u0005,\u0000\u0000\u00cd.\u0001\u0000\u0000\u0000\u00ce"+
		"\u00cf\u0005.\u0000\u0000\u00cf0\u0001\u0000\u0000\u0000\u00d0\u00d1\u0005"+
		"!\u0000\u0000\u00d12\u0001\u0000\u0000\u0000\u00d2\u00d3\u0005=\u0000"+
		"\u0000\u00d34\u0001\u0000\u0000\u0000\u00d4\u00d5\u0005=\u0000\u0000\u00d5"+
		"\u00d6\u0005>\u0000\u0000\u00d66\u0001\u0000\u0000\u0000\u00d7\u00db\u0007"+
		"\u0000\u0000\u0000\u00d8\u00da\u0007\u0001\u0000\u0000\u00d9\u00d8\u0001"+
		"\u0000\u0000\u0000\u00da\u00dd\u0001\u0000\u0000\u0000\u00db\u00d9\u0001"+
		"\u0000\u0000\u0000\u00db\u00dc\u0001\u0000\u0000\u0000\u00dc8\u0001\u0000"+
		"\u0000\u0000\u00dd\u00db\u0001\u0000\u0000\u0000\u00de\u00e4\u0005\'\u0000"+
		"\u0000\u00df\u00e0\u0005\'\u0000\u0000\u00e0\u00e3\u0005\'\u0000\u0000"+
		"\u00e1\u00e3\b\u0002\u0000\u0000\u00e2\u00df\u0001\u0000\u0000\u0000\u00e2"+
		"\u00e1\u0001\u0000\u0000\u0000\u00e3\u00e6\u0001\u0000\u0000\u0000\u00e4"+
		"\u00e2\u0001\u0000\u0000\u0000\u00e4\u00e5\u0001\u0000\u0000\u0000\u00e5"+
		"\u00e7\u0001\u0000\u0000\u0000\u00e6\u00e4\u0001\u0000\u0000\u0000\u00e7"+
		"\u00e8\u0005\'\u0000\u0000\u00e8:\u0001\u0000\u0000\u0000\u00e9\u00eb"+
		"\u0007\u0003\u0000\u0000\u00ea\u00e9\u0001\u0000\u0000\u0000\u00eb\u00ec"+
		"\u0001\u0000\u0000\u0000\u00ec\u00ea\u0001\u0000\u0000\u0000\u00ec\u00ed"+
		"\u0001\u0000\u0000\u0000\u00ed<\u0001\u0000\u0000\u0000\u00ee\u00f0\u0007"+
		"\u0004\u0000\u0000\u00ef\u00ee\u0001\u0000\u0000\u0000\u00f0\u00f1\u0001"+
		"\u0000\u0000\u0000\u00f1\u00ef\u0001\u0000\u0000\u0000\u00f1\u00f2\u0001"+
		"\u0000\u0000\u0000\u00f2\u00f3\u0001\u0000\u0000\u0000\u00f3\u00f4\u0006"+
		"\u001e\u0000\u0000\u00f4>\u0001\u0000\u0000\u0000\u00f5\u00f9\u0005!\u0000"+
		"\u0000\u00f6\u00f8\b\u0005\u0000\u0000\u00f7\u00f6\u0001\u0000\u0000\u0000"+
		"\u00f8\u00fb\u0001\u0000\u0000\u0000\u00f9\u00f7\u0001\u0000\u0000\u0000"+
		"\u00f9\u00fa\u0001\u0000\u0000\u0000\u00fa\u00fc\u0001\u0000\u0000\u0000"+
		"\u00fb\u00f9\u0001\u0000\u0000\u0000\u00fc\u00fd\u0006\u001f\u0000\u0000"+
		"\u00fd@\u0001\u0000\u0000\u0000\u0007\u0000\u00db\u00e2\u00e4\u00ec\u00f1"+
		"\u00f9\u0001\u0006\u0000\u0000";
	public static final ATN _ATN =
		new ATNDeserializer().deserialize(_serializedATN.toCharArray());
	static {
		_decisionToDFA = new DFA[_ATN.getNumberOfDecisions()];
		for (int i = 0; i < _ATN.getNumberOfDecisions(); i++) {
			_decisionToDFA[i] = new DFA(_ATN.getDecisionState(i), i);
		}
	}
}