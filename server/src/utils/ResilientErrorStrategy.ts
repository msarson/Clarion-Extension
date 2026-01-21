import { DefaultErrorStrategy, Parser, RecognitionException, Token } from 'antlr4ng';

/**
 * Enhanced error recovery strategy for folding provider
 * 
 * This strategy is more aggressive about continuing after errors than the default.
 * The goal is to build as much of the parse tree as possible even when there are
 * syntax errors, so that folding ranges can be computed for the valid parts of the file.
 * 
 * Key differences from DefaultErrorStrategy:
 * 1. Never bails out - always attempts recovery
 * 2. More aggressive single-token deletion
 * 3. Synchronizes to common statement/declaration boundaries
 */
export class ResilientErrorStrategy extends DefaultErrorStrategy {
    /**
     * Override to prevent bail-out on errors
     * The default strategy bails out after too many errors, but we want to continue
     * parsing to provide folding for as much of the file as possible
     */
    public override reportError(recognizer: Parser, e: RecognitionException): void {
        // Still report the error but don't bail out
        if (!this.inErrorRecoveryMode(recognizer)) {
            this.beginErrorCondition(recognizer);
            
            // Report to error listeners (for diagnostics) but continue
            const token = e.offendingToken;
            if (token) {
                recognizer.notifyErrorListeners(
                    e.message || "Syntax error",
                    token,
                    e
                );
            }
        }
    }

    /**
     * Override to be more aggressive about recovering
     * Try to sync to the next valid statement/declaration boundary
     */
    public override recover(recognizer: Parser, e: RecognitionException): void {
        // If we're already in error recovery mode, don't try again
        if (this.inErrorRecoveryMode(recognizer)) {
            return;
        }

        // Mark that we're in error recovery
        this.beginErrorCondition(recognizer);

        // Try single-token deletion first (most common fix)
        if (this.singleTokenDeletion(recognizer) !== null) {
            return;
        }

        // Try single-token insertion
        if (this.singleTokenInsertion(recognizer)) {
            return;
        }

        // Last resort: sync to next statement/declaration
        this.sync(recognizer);
    }

    /**
     * Synchronize to next valid statement/declaration boundary
     * This is called when other recovery attempts fail
     */
    public override sync(recognizer: Parser): void {
        // If already in error recovery, consume until we find a sync point
        if (this.inErrorRecoveryMode(recognizer)) {
            return;
        }

        // Get current token
        const tokenStream = recognizer.inputStream;
        const la = tokenStream.LA(1);

        // Don't sync if we're at EOF or already at a sync point
        if (la === Token.EOF || this.isValidSyncPoint(recognizer, la)) {
            return;
        }

        // Consume tokens until we find a sync point
        do {
            tokenStream.consume();
            const nextToken = tokenStream.LA(1);
            
            if (nextToken === Token.EOF || this.isValidSyncPoint(recognizer, nextToken)) {
                break;
            }
        } while (true);
    }

    /**
     * Check if current token is a good synchronization point
     * These are tokens that typically start new statements or declarations
     */
    private isValidSyncPoint(recognizer: Parser, tokenType: number): boolean {
        const parser = recognizer;
        const vocabulary = parser.vocabulary;
        
        // Get token name
        const tokenName = vocabulary.getSymbolicName(tokenType);
        if (!tokenName) {
            return false;
        }

        // Common statement/declaration starters in Clarion
        const syncTokens = [
            'IF', 'LOOP', 'CASE', 'EXECUTE', 'DO', 'OF',
            'PROCEDURE', 'FUNCTION', 'ROUTINE', 'CODE', 'DATA',
            'MAP', 'MODULE', 'SECTION', 'MEMBER',
            'CLASS', 'INTERFACE',
            'RETURN', 'EXIT', 'BREAK', 'CYCLE',
            'END',  // Often terminates blocks
            'ELSIF', 'ELSE'  // Alternative paths
        ];

        return syncTokens.includes(tokenName);
    }

    /**
     * Override to be more aggressive about single-token deletion
     */
    public override singleTokenDeletion(recognizer: Parser): Token | null {
        const nextTokenType = recognizer.inputStream.LA(2);
        const expecting = this.getExpectedTokens(recognizer);
        
        if (expecting.contains(nextTokenType)) {
            this.reportUnwantedToken(recognizer);
            
            // Consume the erroneous token
            recognizer.consume();
            
            // Return the next token (which we expect)
            const matchedSymbol = recognizer.getCurrentToken();
            this.reportMatch(recognizer);
            return matchedSymbol;
        }
        
        return null;
    }

    /**
     * Override to report unwanted tokens without bailing
     */
    public reportUnwantedToken(recognizer: Parser): void {
        if (this.inErrorRecoveryMode(recognizer)) {
            return;
        }

        this.beginErrorCondition(recognizer);
        
        const token = recognizer.getCurrentToken();
        const expecting = this.getExpectedTokens(recognizer);
        const msg = `extraneous input ${this.getTokenErrorDisplay(token)} expecting ${expecting.toString()}`;
        
        recognizer.notifyErrorListeners(msg, token, null);
    }
}
