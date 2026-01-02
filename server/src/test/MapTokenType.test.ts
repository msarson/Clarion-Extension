import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../tokenizer/TokenTypes';
import { DocumentStructure } from '../DocumentStructure';
import * as fs from 'fs';
import * as path from 'path';

suite('MAP Token Type Investigation', () => {
    let tokenCache: TokenCache;

    setup(() => {
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    test('MAP in MEMBER file should be Structure type', () => {
        const memberCode = `   MEMBER('py1.clw')

   MAP
     INCLUDE('MAIN_PY1.INC'),ONCE
     INCLUDE('STARTPROC_PY1.INC'),ONCE
   END

TestProc PROCEDURE()
CODE
  StartProc(1)
  RETURN
`;

        const doc = TextDocument.create('file:///test/Main_py1.clw', 'clarion', 1, memberCode);
        const tokens = tokenCache.getTokens(doc);
        
        console.log('\n=== MEMBER File Token Analysis ===');
        console.log(`Total tokens: ${tokens.length}`);
        
        // Find all MAP tokens
        const mapTokens = tokens.filter(t => t.value.toUpperCase() === 'MAP');
        console.log(`\nFound ${mapTokens.length} MAP token(s):`);
        
        mapTokens.forEach((t, i) => {
            console.log(`  MAP ${i + 1}:`);
            console.log(`    Line: ${t.line}`);
            console.log(`    Type: ${t.type} (${TokenType[t.type]})`);
            console.log(`    SubType: ${t.subType} (${t.subType !== undefined ? TokenType[t.subType] : 'undefined'})`);
            console.log(`    FinishesAt: ${t.finishesAt}`);
        });
        
        // Check with DocumentStructure
        const docStructure = new DocumentStructure(tokens);
        const mapBlocks = docStructure.getMapBlocks();
        console.log(`\nDocumentStructure found ${mapBlocks.length} MAP block(s)`);
        
        mapBlocks.forEach((m, i) => {
            console.log(`  MAP Block ${i + 1}: line ${m.line}, finishesAt ${m.finishesAt}`);
        });
        
        // The MAP should be type 16 (Structure)
        assert.ok(mapTokens.length > 0, 'Should find at least one MAP token');
        const mapToken = mapTokens[0];
        
        console.log(`\n🔍 MAP token type: ${mapToken.type} (expecting ${TokenType.Structure} for Structure)`);
        console.log(`   Type name: ${TokenType[mapToken.type]}`);
        
        if (mapToken.type !== TokenType.Structure) {
            console.log(`\n❌ ISSUE: MAP is type ${TokenType[mapToken.type]} instead of Structure!`);
            console.log(`   This explains why findMapDeclaration doesn't find it.`);
        }
        
        assert.strictEqual(mapToken.type, TokenType.Structure, 
            `MAP should be type ${TokenType.Structure} (Structure), but got ${mapToken.type} (${TokenType[mapToken.type]})`);
    });

    test('MAP in PROGRAM file should be Structure type', () => {
        const programCode = `PROGRAM

   MAP
     INCLUDE('startproc.inc'),ONCE
   END

GlobalCounter LONG

CODE
  StartProc(1)
`;

        const doc = TextDocument.create('file:///test/main.clw', 'clarion', 1, programCode);
        const tokens = tokenCache.getTokens(doc);
        
        console.log('\n=== PROGRAM File Token Analysis ===');
        console.log(`Total tokens: ${tokens.length}`);
        
        // Find all MAP tokens
        const mapTokens = tokens.filter(t => t.value.toUpperCase() === 'MAP');
        console.log(`\nFound ${mapTokens.length} MAP token(s):`);
        
        mapTokens.forEach((t, i) => {
            console.log(`  MAP ${i + 1}:`);
            console.log(`    Line: ${t.line}`);
            console.log(`    Type: ${t.type} (${TokenType[t.type]})`);
            console.log(`    SubType: ${t.subType} (${t.subType !== undefined ? TokenType[t.subType] : 'undefined'})`);
            console.log(`    FinishesAt: ${t.finishesAt}`);
        });
        
        // Check with DocumentStructure
        const docStructure = new DocumentStructure(tokens);
        const mapBlocks = docStructure.getMapBlocks();
        console.log(`\nDocumentStructure found ${mapBlocks.length} MAP block(s)`);
        
        // The MAP should be type 16 (Structure)
        assert.ok(mapTokens.length > 0, 'Should find at least one MAP token');
        const mapToken = mapTokens[0];
        
        console.log(`\n🔍 MAP token type: ${mapToken.type} (expecting ${TokenType.Structure} for Structure)`);
        assert.strictEqual(mapToken.type, TokenType.Structure, 
            `MAP should be type ${TokenType.Structure} (Structure), but got ${mapToken.type} (${TokenType[mapToken.type]})`);
    });

    test('MAP with heavy indentation (like real file)', () => {
        const memberCode = `   MEMBER('py1.clw')

                     MAP
                       INCLUDE('MAIN_PY1.INC'),ONCE        !Local module procedure declarations
                       INCLUDE('STARTPROC_PY1.INC'),ONCE        !Req'd for module callout resolution
                     END

TestProc PROCEDURE()
CODE
  StartProc(1)
  RETURN
`;

        // DON'T use cache - tokenize directly to test fresh tokenization
        const { ClarionTokenizer } = require('../ClarionTokenizer');
        const tokenizer = new ClarionTokenizer(memberCode);
        const tokens = tokenizer.tokenize();
        
        console.log('\n=== HEAVILY INDENTED MAP Token Analysis ===');
        console.log(`Total tokens: ${tokens.length}`);
        
        // Find all MAP tokens
        const mapTokens = tokens.filter((t: any) => t.value.toUpperCase() === 'MAP');
        console.log(`\nFound ${mapTokens.length} MAP token(s):`);
        
        mapTokens.forEach((t: any, i: number) => {
            console.log(`  MAP ${i + 1}:`);
            console.log(`    Line: ${t.line}`);
            console.log(`    Type: ${t.type} (${TokenType[t.type]})`);
            console.log(`    SubType: ${t.subType} (${t.subType !== undefined ? TokenType[t.subType] : 'undefined'})`);
            console.log(`    FinishesAt: ${t.finishesAt}`);
            console.log(`    Start column: ${t.start}`);
        });
        
        // Check with DocumentStructure
        const docStructure = new DocumentStructure(tokens);
        const mapBlocks = docStructure.getMapBlocks();
        console.log(`\nDocumentStructure found ${mapBlocks.length} MAP block(s)`);
        
        if (mapTokens.length > 0) {
            const mapToken = mapTokens[0];
            console.log(`\n🔍 MAP token type: ${mapToken.type} (expecting ${TokenType.Structure} for Structure)`);
            
            if (mapToken.type !== TokenType.Structure) {
                console.log(`\n❌ ISSUE: Heavily indented MAP is type ${TokenType[mapToken.type]} instead of Structure!`);
                console.log(`   This matches the issue in the real file.`);
            } else {
                console.log(`\n✅ Heavily indented MAP is correctly tokenized as Structure`);
            }
        }
        
        assert.ok(mapTokens.length > 0, 'Should find at least one MAP token');
    });

    test('Compare MEMBER vs PROGRAM MAP tokenization', () => {
        const memberCode = `   MEMBER('py1.clw')
   MAP
   END
`;
        const programCode = `PROGRAM
   MAP
   END
`;

        const memberDoc = TextDocument.create('file:///test/member.clw', 'clarion', 1, memberCode);
        const programDoc = TextDocument.create('file:///test/program.clw', 'clarion', 1, programCode);
        
        const memberTokens = tokenCache.getTokens(memberDoc);
        const programTokens = tokenCache.getTokens(programDoc);
        
        const memberMap = memberTokens.find(t => t.value.toUpperCase() === 'MAP');
        const programMap = programTokens.find(t => t.value.toUpperCase() === 'MAP');
        
        console.log('\n=== MEMBER vs PROGRAM Comparison ===');
        console.log(`MEMBER MAP: type=${memberMap?.type} (${memberMap ? TokenType[memberMap.type] : 'N/A'})`);
        console.log(`PROGRAM MAP: type=${programMap?.type} (${programMap ? TokenType[programMap.type] : 'N/A'})`);
        
        if (memberMap && programMap && memberMap.type !== programMap.type) {
            console.log(`\n⚠️ DIFFERENCE FOUND!`);
            console.log(`   MEMBER files tokenize MAP as: ${TokenType[memberMap.type]}`);
            console.log(`   PROGRAM files tokenize MAP as: ${TokenType[programMap.type]}`);
        }
    });
});
