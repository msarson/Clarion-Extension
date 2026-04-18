import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';

export function validateClassInterfaceImplementation(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CLASS') {
            let implementsInterface: string | null = null;

            for (let j = i + 1; j < tokens.length && tokens[j].line === token.line; j++) {
                const nextToken = tokens[j];
                if (nextToken.value.toUpperCase() === 'IMPLEMENTS') {
                    if (j + 1 < tokens.length && tokens[j + 1].value === '(') {
                        let parenDepth = 1;
                        let interfaceName = '';
                        for (let k = j + 2; k < tokens.length && parenDepth > 0; k++) {
                            if (tokens[k].value === '(') parenDepth++;
                            else if (tokens[k].value === ')') {
                                parenDepth--;
                                if (parenDepth === 0) break;
                            }
                            if (parenDepth > 0) interfaceName += tokens[k].value;
                        }
                        implementsInterface = interfaceName.trim();
                        break;
                    }
                }
            }

            // Full interface method validation would require a complete symbol table.
            // The variable is retained for future use.
            void implementsInterface;
        }
    }

    return diagnostics;
}

export function validateClassProperties(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== TokenType.Structure) continue;

        const structureType = token.value.toUpperCase();

        if (structureType === 'CLASS' && token.children) {
            for (const child of token.children) {
                if (child.type === TokenType.Structure && child.value.toUpperCase() === 'QUEUE') {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: { line: child.line, character: child.start },
                            end: { line: child.line, character: child.start + child.value.length }
                        },
                        message: 'QUEUE structures are not allowed as direct CLASS properties. Use a QUEUE reference (&QUEUE) instead.',
                        source: 'clarion'
                    });
                }
            }
        }

        if (structureType === 'QUEUE' && token.children) {
            for (const child of token.children) {
                if (child.type === TokenType.Structure && child.value.toUpperCase() === 'QUEUE') {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: { line: child.line, character: child.start },
                            end: { line: child.line, character: child.start + child.value.length }
                        },
                        message: 'QUEUE structures cannot be nested inside other QUEUE structures. Use a QUEUE reference (&QUEUE) instead.',
                        source: 'clarion'
                    });
                }
            }
        }
    }

    return diagnostics;
}
