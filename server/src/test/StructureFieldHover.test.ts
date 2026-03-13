/**
 * Tests for hover resolution of structure field access (e.g., QZipF.ZipFileName)
 * where the type is a QUEUE/GROUP defined in an INCLUDE file, or via LIKE(TypeName).
 *
 * These tests use ClarionTokenizer directly to validate the token-searching logic
 * in findFieldInTypeIncludes without requiring file I/O or a running solution.
 */

import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

/**
 * Extracted/mirrored logic from StructureFieldResolver.findFieldInTypeIncludes.
 * Given tokens from an INC file, find a field by name within a named type structure.
 */
function findFieldInTokens(
    incTokens: ReturnType<ClarionTokenizer['tokenize']>,
    typeName: string,
    fieldName: string
): { found: boolean; line?: number; declaration?: string; fieldType?: string } {
    const labelToken = incTokens.find(t =>
        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
        t.start === 0 &&
        t.value.toLowerCase() === typeName.toLowerCase()
    );
    if (!labelToken) return { found: false };

    // Find the structure keyword (QUEUE/GROUP/CLASS) to get finishesAt
    const labelIdx = incTokens.indexOf(labelToken);
    let structureEndLine = Number.MAX_VALUE;
    for (let i = labelIdx + 1; i < incTokens.length; i++) {
        const t = incTokens[i];
        if (t.line !== labelToken.line) break;
        if (t.type === TokenType.Structure && t.finishesAt !== undefined) {
            structureEndLine = t.finishesAt;
            break;
        }
    }

    // Fields are at start === 0, between the structure label line and finishesAt
    const fieldToken = incTokens.find(t =>
        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
        t.start === 0 &&
        t.value.toLowerCase() === fieldName.toLowerCase() &&
        t.line > labelToken.line &&
        t.line < structureEndLine
    );
    if (!fieldToken) return { found: false };

    const lineTokens = incTokens.filter(t => t.line === fieldToken.line);
    const declaration = lineTokens.map(t => t.value).join('  ').trim();
    const typeToken = lineTokens.find(t => t.start > fieldToken.start);
    const fieldType = typeToken?.value ?? 'UNKNOWN';
    return { found: true, line: fieldToken.line, declaration, fieldType };
}

suite('StructureFieldHover - field lookup in tokenized INC content', () => {

    test('finds a CSTRING field in a QUEUE,TYPE structure', () => {
        const incContent = [
            'ZipQueueType    QUEUE,TYPE',
            'ZipFileName     CSTRING(256)',
            'ZipDateTime     STRING(20)',
            '                END'
        ].join('\n');

        const tokens = new ClarionTokenizer(incContent).tokenize();
        const result = findFieldInTokens(tokens, 'ZipQueueType', 'ZipFileName');

        assert.strictEqual(result.found, true, 'Should find ZipFileName field');
        assert.strictEqual(result.fieldType, 'CSTRING', `Expected CSTRING, got ${result.fieldType}`);
        assert.ok(result.declaration?.includes('ZipFileName'), 'Declaration should include field name');
    });

    test('finds second field in a QUEUE,TYPE structure', () => {
        const incContent = [
            'ZipQueueType    QUEUE,TYPE',
            'ZipFileName     CSTRING(256)',
            'ZipDateTime     STRING(20)',
            '                END'
        ].join('\n');

        const tokens = new ClarionTokenizer(incContent).tokenize();
        const result = findFieldInTokens(tokens, 'ZipQueueType', 'ZipDateTime');

        assert.strictEqual(result.found, true, 'Should find ZipDateTime field');
        assert.strictEqual(result.fieldType, 'STRING', `Expected STRING, got ${result.fieldType}`);
    });

    test('does not find a field in the wrong type', () => {
        const incContent = [
            'TypeA           QUEUE,TYPE',
            'FieldA          LONG',
            '                END',
            'TypeB           QUEUE,TYPE',
            'FieldB          STRING(10)',
            '                END'
        ].join('\n');

        const tokens = new ClarionTokenizer(incContent).tokenize();
        const result = findFieldInTokens(tokens, 'TypeA', 'FieldB');

        assert.strictEqual(result.found, false, 'Should NOT find FieldB in TypeA');
    });

    test('finds field in second structure when file has multiple types', () => {
        const incContent = [
            'TypeA           QUEUE,TYPE',
            'FieldA          LONG',
            '                END',
            'TypeB           QUEUE,TYPE',
            'FieldB          STRING(10)',
            '                END'
        ].join('\n');

        const tokens = new ClarionTokenizer(incContent).tokenize();
        const result = findFieldInTokens(tokens, 'TypeB', 'FieldB');

        assert.strictEqual(result.found, true, 'Should find FieldB in TypeB');
        assert.strictEqual(result.fieldType, 'STRING', `Expected STRING, got ${result.fieldType}`);
    });

    test('field lookup is case-insensitive', () => {
        const incContent = [
            'ZipQueueType    QUEUE,TYPE',
            'ZipFileName     CSTRING(256)',
            '                END'
        ].join('\n');

        const tokens = new ClarionTokenizer(incContent).tokenize();
        const result = findFieldInTokens(tokens, 'ZIPQUEUETYPE', 'ZIPFILENAME');

        assert.strictEqual(result.found, true, 'Field lookup should be case-insensitive');
    });

    test('returns not found for nonexistent type', () => {
        const incContent = [
            'ZipQueueType    QUEUE,TYPE',
            'ZipFileName     CSTRING(256)',
            '                END'
        ].join('\n');

        const tokens = new ClarionTokenizer(incContent).tokenize();
        const result = findFieldInTokens(tokens, 'NoSuchType', 'ZipFileName');

        assert.strictEqual(result.found, false, 'Should return not found for missing type');
    });

    test('returns not found for nonexistent field', () => {
        const incContent = [
            'ZipQueueType    QUEUE,TYPE',
            'ZipFileName     CSTRING(256)',
            '                END'
        ].join('\n');

        const tokens = new ClarionTokenizer(incContent).tokenize();
        const result = findFieldInTokens(tokens, 'ZipQueueType', 'NoSuchField');

        assert.strictEqual(result.found, false, 'Should return not found for missing field');
    });

    test('resolveVariableClassType: QUEUE(TypeName) returns isClass=false', () => {
        // This mirrors the logic in resolveVariableClassType in StructureFieldResolver
        const clwContent = [
            'WindowsZipTest  PROCEDURE()',
            'QZipF               QUEUE(ZipQueueType).',
            'CODE',
            '  RETURN'
        ].join('\n');

        const tokens = new ClarionTokenizer(clwContent).tokenize();
        const varName = 'QZipF';

        const varToken = tokens.find(t =>
            t.start === 0 &&
            t.value.toLowerCase() === varName.toLowerCase()
        );
        assert.ok(varToken, 'Should find QZipF token');

        const idx = tokens.indexOf(varToken!);
        const nextToken = tokens[idx + 1];
        assert.ok(nextToken, 'Should have a token after QZipF');
        assert.strictEqual(nextToken.type, TokenType.Structure,
            `Expected Structure token after QZipF, got type ${nextToken.type} value "${nextToken.value}"`);

        const keyword = nextToken.value.toUpperCase();
        const isClass = keyword === 'CLASS';
        assert.strictEqual(isClass, false, 'QUEUE should have isClass=false');

        const lineTokens = tokens.filter(t => t.line === varToken!.line && t.start > nextToken.start);
        const typeArg = lineTokens.find(t =>
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.value !== '(' && t.value !== ')'
        );
        assert.ok(typeArg, 'Should find type arg ZipQueueType');
        assert.strictEqual(typeArg!.value, 'ZipQueueType', `Expected ZipQueueType, got ${typeArg!.value}`);
    });
});

suite('LIKE type reference tokenization and resolution', () => {

    test('LIKE tokenizes as TypeReference, not Function', () => {
        const content = 'uzOptions    LIKE(UnzipOptionsType)';
        const tokens = new ClarionTokenizer(content).tokenize();

        const likeToken = tokens.find(t => t.value.toUpperCase() === 'LIKE');
        assert.ok(likeToken, 'Should find LIKE token');
        assert.strictEqual(likeToken!.type, TokenType.TypeReference,
            `Expected TypeReference (${TokenType.TypeReference}), got ${likeToken!.type}`);
    });

    test('LIKE type arg tokenizes as Variable', () => {
        const content = 'uzOptions    LIKE(UnzipOptionsType)';
        const tokens = new ClarionTokenizer(content).tokenize();

        const typeArg = tokens.find(t => t.value === 'UnzipOptionsType');
        assert.ok(typeArg, 'Should find UnzipOptionsType token');
        assert.ok(
            typeArg!.type === TokenType.Variable || typeArg!.type === TokenType.Label,
            `Expected Variable or Label, got type ${typeArg!.type}`
        );
    });

    test('LIKE type arg is extractable (mirrors resolveVariableClassType logic)', () => {
        const content = 'uzOptions    LIKE(UnzipOptionsType)';
        const tokens = new ClarionTokenizer(content).tokenize();

        const varToken = tokens.find(t => t.start === 0 && t.value === 'uzOptions');
        assert.ok(varToken, 'Should find uzOptions label token');

        const idx = tokens.indexOf(varToken!);
        const nextToken = tokens[idx + 1];
        assert.ok(nextToken, 'Should have token after uzOptions');
        assert.strictEqual(nextToken.type, TokenType.TypeReference,
            `Expected TypeReference, got type ${nextToken.type} "${nextToken.value}"`);

        const lineTokens = tokens.filter(t => t.line === varToken!.line && t.start > nextToken.start);
        const typeArg = lineTokens.find(t =>
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.value !== '(' && t.value !== ')'
        );
        assert.ok(typeArg, 'Should extract type arg from LIKE(...)');
        assert.strictEqual(typeArg!.value, 'UnzipOptionsType',
            `Expected UnzipOptionsType, got "${typeArg!.value}"`);
    });

    test('LIKE with dot terminator still resolves type', () => {
        const content = 'uzOptions    LIKE(UnzipOptionsType).';
        const tokens = new ClarionTokenizer(content).tokenize();

        const likeToken = tokens.find(t => t.value.toUpperCase() === 'LIKE');
        assert.ok(likeToken, 'Should find LIKE token');
        assert.strictEqual(likeToken!.type, TokenType.TypeReference,
            `Expected TypeReference, got type ${likeToken!.type}`);

        const typeArg = tokens.find(t => t.value === 'UnzipOptionsType');
        assert.ok(typeArg, 'Should find type arg even with dot terminator');
    });

    test('field lookup in LIKE type definition works same as QUEUE type', () => {
        // The INC file content for the type that LIKE references
        const incContent = [
            'UnzipOptionsType    QUEUE,TYPE',
            'TargetFolder        STRING(260)',
            'OverwriteExisting   BYTE',
            '                    END'
        ].join('\n');

        const incTokens = new ClarionTokenizer(incContent).tokenize();

        // Same findFieldInTokens logic applies — LIKE just points to the same type
        const labelToken = incTokens.find(t =>
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.start === 0 &&
            t.value.toLowerCase() === 'unzipoptionstype'
        );
        assert.ok(labelToken, 'Should find UnzipOptionsType in INC tokens');

        const labelIdx = incTokens.indexOf(labelToken!);
        let structureEndLine = Number.MAX_VALUE;
        for (let i = labelIdx + 1; i < incTokens.length; i++) {
            const t = incTokens[i];
            if (t.line !== labelToken!.line) break;
            if (t.type === TokenType.Structure && t.finishesAt !== undefined) {
                structureEndLine = t.finishesAt;
                break;
            }
        }

        const fieldToken = incTokens.find(t =>
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.start === 0 &&
            t.value.toLowerCase() === 'targetfolder' &&
            t.line > labelToken!.line &&
            t.line < structureEndLine
        );
        assert.ok(fieldToken, 'Should find TargetFolder field via same logic as QUEUE type');
    });
});
