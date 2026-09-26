import { Range } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../tokenizer/TokenTypes';

/**
 * #689 — the range of a procedure's NAME, for a location that points at a procedure: an
 * implementation (`Name PROCEDURE` at column 0) or a MAP declaration (`Name(...)`, or
 * `Name PROCEDURE(...)` indented). The sites this replaces used `0 .. token.value.length`, and on
 * an implementation or a keyword-form MAP line the token is the PROCEDURE keyword, so a long name
 * came back as 0-9, and an indented MAP line's range started at column 0.
 *
 * `lineText` finds an indented label in the keyword form; without it the label is taken to start
 * the line, which is right for an implementation.
 */
export function procedureNameRange(token: Token, lineText?: string): Range {
    const line = token.line;
    const name = token.label ?? token.value;
    const span = (start: number): Range => ({ start: { line, character: start }, end: { line, character: start + name.length } });

    // The token is the name itself: the shorthand MAP form `Name(...)`.
    if (token.value.toLowerCase() === name.toLowerCase()) return span(token.start);
    // An implementation's label is at column 0.
    if (token.subType === TokenType.GlobalProcedure || lineText === undefined) return span(0);
    // A keyword-form MAP line: the label is the first thing on the line.
    const indent = /^\s*/.exec(lineText)![0].length;
    return lineText.substr(indent, name.length).toLowerCase() === name.toLowerCase() ? span(indent) : span(0);
}
