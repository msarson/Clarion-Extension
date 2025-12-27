/**
 * Utility for checking if tokens represent procedure/function declarations
 * Clarion now treats PROCEDURE and FUNCTION identically (both can return values)
 */

import { Token, TokenType } from '../ClarionTokenizer';

export class ProcedureUtils {
    /**
     * Check if a token value is a procedure/function keyword
     * @param value Token value to check
     * @returns true if value is PROCEDURE or FUNCTION (case-insensitive)
     */
    public static isProcedureKeyword(value: string | undefined): boolean {
        if (!value) return false;
        const upper = value.toUpperCase();
        return upper === 'PROCEDURE' || upper === 'FUNCTION';
    }

    /**
     * Check if a token is a procedure/function declaration keyword
     * @param token Token to check
     * @returns true if token is a PROCEDURE or FUNCTION keyword
     */
    public static isProcedureToken(token: Token): boolean {
        if (!token.value) return false;
        return (token.type === TokenType.Keyword || token.type === TokenType.Procedure) &&
               this.isProcedureKeyword(token.value);
    }

    /**
     * Check if a token represents any kind of procedure (declaration, implementation, or map procedure)
     * @param token Token to check
     * @returns true if token is a procedure-related token
     */
    public static isAnyProcedureType(token: Token): boolean {
        if (token.type === TokenType.Procedure) return true;
        if (token.subType === TokenType.MethodDeclaration) return true;
        if (token.subType === TokenType.InterfaceMethod) return true;
        if (token.subType === TokenType.MapProcedure) return true;
        if (token.subType === TokenType.MethodImplementation) return true;
        if (token.subType === TokenType.GlobalProcedure) return true;
        return this.isProcedureToken(token);
    }
}
