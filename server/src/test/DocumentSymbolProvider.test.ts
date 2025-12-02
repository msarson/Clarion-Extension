import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { SymbolKind } from 'vscode-languageserver-types';
import { setServerInitialized } from '../serverState';

suite('ClarionDocumentSymbolProvider - Structure View Tests', () => {
    
    // Set serverInitialized to true before tests
    setup(() => {
        setServerInitialized(true);
    });
    
    /**
     * Helper to create a formatted tree structure for debugging
     */
    function formatSymbolTree(symbols: ClarionDocumentSymbol[], indent: string = ''): string {
        let output = '';
        for (const symbol of symbols) {
            const kindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === symbol.kind) || String(symbol.kind);
            const flags = [];
            if (symbol._isMethodImplementation) flags.push('MethodImpl');
            if (symbol._isMethodDeclaration) flags.push('MethodDecl');
            if (symbol._isGlobalProcedure) flags.push('GlobalProc');
            if (symbol._isMapProcedure) flags.push('MapProc');
            if (symbol._isInterface) flags.push('Interface');
            
            const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
            output += `${indent}${symbol.name} (${kindName})${flagStr}\n`;
            
            if (symbol.children && symbol.children.length > 0) {
                output += formatSymbolTree(symbol.children, indent + '  ');
            }
        }
        return output;
    }

    /**
     * Helper to find a symbol by name in the tree (partial match)
     */
    function findSymbol(symbols: ClarionDocumentSymbol[], name: string): ClarionDocumentSymbol | undefined {
        for (const symbol of symbols) {
            if (symbol.name.includes(name) || symbol.name === name) {
                return symbol;
            }
            if (symbol.children) {
                const found = findSymbol(symbol.children, name);
                if (found) return found;
            }
        }
        return undefined;
    }

    /**
     * Helper to get all symbols of a specific kind
     */
    function getSymbolsByKind(symbols: ClarionDocumentSymbol[], kind: SymbolKind): ClarionDocumentSymbol[] {
        const results: ClarionDocumentSymbol[] = [];
        for (const symbol of symbols) {
            if (symbol.kind === kind) {
                results.push(symbol);
            }
            if (symbol.children) {
                results.push(...getSymbolsByKind(symbol.children, kind));
            }
        }
        return results;
    }

    /**
     * Enhanced debug output - shows all symbol properties in detail
     */
    function formatSymbolTreeVerbose(symbols: ClarionDocumentSymbol[], indent: string = ''): string {
        let output = '';
        for (const symbol of symbols) {
            const kindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === symbol.kind) || String(symbol.kind);
            
            // Collect all flags and properties
            const flags = [];
            if (symbol._isMethodImplementation) flags.push('MethodImpl');
            if (symbol._isMethodDeclaration) flags.push('MethodDecl');
            if (symbol._isGlobalProcedure) flags.push('GlobalProc');
            if (symbol._isMapProcedure) flags.push('MapProc');
            if (symbol._isInterface) flags.push('Interface');
            
            const properties = [];
            if (symbol.detail) properties.push(`detail="${symbol.detail}"`);
            if (symbol.sortText) properties.push(`sort="${symbol.sortText}"`);
            if ((symbol as any).$clarionFunctions) properties.push('hasFunctionsContainer');
            if ((symbol as any).$clarionProperties) properties.push('hasPropertiesContainer');
            if ((symbol as any).$clarionMethods) properties.push('hasMethodsContainer');
            
            const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
            const propStr = properties.length > 0 ? ` {${properties.join(', ')}}` : '';
            const childCount = symbol.children ? ` (${symbol.children.length} children)` : '';
            
            output += `${indent}${symbol.name} (${kindName})${flagStr}${propStr}${childCount}\n`;
            
            if (symbol.children && symbol.children.length > 0) {
                output += formatSymbolTreeVerbose(symbol.children, indent + '  ');
            }
        }
        return output;
    }

    /**
     * Get symbol tree as JSON for detailed inspection
     */
    function symbolTreeToJSON(symbols: ClarionDocumentSymbol[]): string {
        const simplify = (sym: ClarionDocumentSymbol): any => {
            const kindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === sym.kind);
            return {
                name: sym.name,
                kind: kindName,
                detail: sym.detail,
                sortText: sym.sortText,
                flags: {
                    isMethodImpl: sym._isMethodImplementation || false,
                    isMethodDecl: sym._isMethodDeclaration || false,
                    isGlobalProc: sym._isGlobalProcedure || false,
                    isMapProc: sym._isMapProcedure || false,
                    isInterface: sym._isInterface || false
                },
                containers: {
                    functions: (sym as any).$clarionFunctions ? 'yes' : 'no',
                    properties: (sym as any).$clarionProperties ? 'yes' : 'no',
                    methods: (sym as any).$clarionMethods ? 'yes' : 'no'
                },
                childCount: sym.children ? sym.children.length : 0,
                children: sym.children ? sym.children.map(simplify) : []
            };
        };
        return JSON.stringify(symbols.map(simplify), null, 2);
    }

    /**
     * Filter symbols by name pattern (regex)
     */
    function filterSymbolsByName(symbols: ClarionDocumentSymbol[], pattern: string): ClarionDocumentSymbol[] {
        const regex = new RegExp(pattern, 'i');
        const results: ClarionDocumentSymbol[] = [];
        
        for (const symbol of symbols) {
            if (regex.test(symbol.name)) {
                results.push(symbol);
            }
            if (symbol.children) {
                results.push(...filterSymbolsByName(symbol.children, pattern));
            }
        }
        return results;
    }

    /**
     * Get flattened list of all symbols with their path
     */
    function flattenSymbolTree(symbols: ClarionDocumentSymbol[], parentPath: string = ''): Array<{path: string, symbol: ClarionDocumentSymbol}> {
        const results: Array<{path: string, symbol: ClarionDocumentSymbol}> = [];
        
        for (const symbol of symbols) {
            const path = parentPath ? `${parentPath} > ${symbol.name}` : symbol.name;
            results.push({ path, symbol });
            
            if (symbol.children) {
                results.push(...flattenSymbolTree(symbol.children, path));
            }
        }
        return results;
    }

    /**
     * Print symbol counts by kind
     */
    function printSymbolStats(symbols: ClarionDocumentSymbol[]): string {
        const stats = new Map<string, number>();
        
        const count = (syms: ClarionDocumentSymbol[]) => {
            for (const sym of syms) {
                const kindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === sym.kind) || 'Unknown';
                stats.set(kindName, (stats.get(kindName) || 0) + 1);
                if (sym.children) count(sym.children);
            }
        };
        
        count(symbols);
        
        let output = 'Symbol Statistics:\n';
        for (const [kind, count] of Array.from(stats.entries()).sort()) {
            output += `  ${kind}: ${count}\n`;
        }
        return output;
    }

    suite('CLASS Structure Tests', () => {
        
        test('Should parse CLASS with method declarations', () => {
            const code = `
  PROGRAM
MyClass CLASS
Value     LONG
Init      PROCEDURE()
Destroy   PROCEDURE()
  END
  CODE
  RETURN
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== CLASS with method declarations ===');
            console.log(formatSymbolTree(symbols));
            
            // Find the class
            const classSymbol = findSymbol(symbols, 'MyClass');
            assert.ok(classSymbol, 'Should find MyClass');
            assert.strictEqual(classSymbol.kind, SymbolKind.Class, 'Should be a Class');
            
            // Check for children
            assert.ok(classSymbol.children, 'Class should have children');
            assert.ok(classSymbol.children.length > 0, 'Class should have at least one child');
            
            // Find Init method
            const initMethod = findSymbol(classSymbol.children, 'Init');
            assert.ok(initMethod, 'Should find Init method');
            const initKindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === initMethod.kind);
            console.log(`Init method kind: ${initKindName}, flags: ${initMethod._isMethodDeclaration ? 'MethodDecl' : 'NOT SET'}`);
            
            // Find Destroy method
            const destroyMethod = findSymbol(classSymbol.children, 'Destroy');
            assert.ok(destroyMethod, 'Should find Destroy method');
            const destroyKindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === destroyMethod.kind);
            console.log(`Destroy method kind: ${destroyKindName}, flags: ${destroyMethod._isMethodDeclaration ? 'MethodDecl' : 'NOT SET'}`);
        });

        test('Should parse CLASS with method that has parameters', () => {
            const code = `
  PROGRAM
StringTheory CLASS
value         &STRING,PRIVATE
Append        PROCEDURE(STRING pValue)
GetValue      PROCEDURE(),STRING
  END
  CODE
  RETURN
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== CLASS with parameterized methods ===');
            console.log(formatSymbolTree(symbols));
            
            // Find the class
            const classSymbol = findSymbol(symbols, 'StringTheory');
            assert.ok(classSymbol, 'Should find StringTheory class');
            
            // Find Append method
            const appendMethod = findSymbol(symbols, 'Append');
            assert.ok(appendMethod, 'Should find Append method');
            console.log(`Append: ${appendMethod.name}, detail: ${appendMethod.detail || 'NO DETAIL'}`);
            
            // Find GetValue method
            const getValueMethod = findSymbol(symbols, 'GetValue');
            assert.ok(getValueMethod, 'Should find GetValue method');
            console.log(`GetValue: ${getValueMethod.name}, detail: ${getValueMethod.detail || 'NO DETAIL'}`);
        });

        test('Should parse CLASS with complex method signature', () => {
            const code = `
  PROGRAM
MyClass CLASS
Flush  PROCEDURE (StringTheory pStr),long, proc, virtual
  END
  CODE
  RETURN
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== CLASS with complex method signature ===');
            console.log(formatSymbolTree(symbols));
            
            // Find the class
            const classSymbol = findSymbol(symbols, 'MyClass');
            assert.ok(classSymbol, 'Should find MyClass');
            
            // Find Flush method
            const flushMethod = findSymbol(symbols, 'Flush');
            console.log(`Flush found: ${!!flushMethod}`);
            if (flushMethod) {
                const flushKindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === flushMethod.kind);
                console.log(`  Name: ${flushMethod.name}`);
                console.log(`  Kind: ${flushKindName}`);
                console.log(`  Detail: ${flushMethod.detail || 'NO DETAIL'}`);
                console.log(`  _isMethodDeclaration: ${flushMethod._isMethodDeclaration || 'NOT SET'}`);
            }
            
            // Check what children the class has
            if (classSymbol.children) {
                console.log(`Class has ${classSymbol.children.length} children:`);
                for (const child of classSymbol.children) {
                    const childKindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === child.kind);
                    console.log(`  - ${child.name} (${childKindName})`);
                }
            }
            
            assert.ok(flushMethod, 'Should find Flush method (not as StringTheory variable)');
        });

        test('Should distinguish between properties and methods in CLASS', () => {
            const code = `
  PROGRAM
MyClass CLASS
Count     LONG
Name      STRING(50)
Init      PROCEDURE()
Process   PROCEDURE(LONG pValue)
  END
  CODE
  RETURN
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== CLASS with properties and methods ===');
            console.log(formatSymbolTree(symbols));
            
            const classSymbol = findSymbol(symbols, 'MyClass');
            assert.ok(classSymbol, 'Should find MyClass');
            
            // Check all children
            const variables = getSymbolsByKind(symbols, SymbolKind.Variable);
            const functions = getSymbolsByKind(symbols, SymbolKind.Function);
            
            console.log(`Variables found: ${variables.map(v => v.name).join(', ')}`);
            console.log(`Functions found: ${functions.map(f => f.name).join(', ')}`);
            
            // Should have properties
            const countProp = findSymbol(symbols, 'Count');
            const nameProp = findSymbol(symbols, 'Name');
            
            // Should have methods
            const initMethod = findSymbol(symbols, 'Init');
            const processMethod = findSymbol(symbols, 'Process');
            
            assert.ok(countProp, 'Should find Count property');
            assert.ok(nameProp, 'Should find Name property');
            assert.ok(initMethod, 'Should find Init method');
            assert.ok(processMethod, 'Should find Process method');
        });
    });

    suite('MAP Structure Tests', () => {
        
        test('Should parse MAP with procedure declarations', () => {
            const code = `
  PROGRAM
  MAP
LoadData    PROCEDURE()
SaveData    PROCEDURE(STRING pFilename)
  END
  CODE
  RETURN
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== MAP with procedure declarations ===');
            console.log(formatSymbolTree(symbols));
            
            // Find MAP structure
            const mapSymbol = findSymbol(symbols, 'MAP');
            console.log(`MAP found: ${!!mapSymbol}`);
            
            // Find procedures
            const loadData = findSymbol(symbols, 'LoadData');
            const saveData = findSymbol(symbols, 'SaveData');
            
            console.log(`LoadData found: ${!!loadData}, flags: ${loadData?._isMapProcedure ? 'MapProc' : 'NOT SET'}`);
            console.log(`SaveData found: ${!!saveData}, flags: ${saveData?._isMapProcedure ? 'MapProc' : 'NOT SET'}`);
        });

        test('Should parse MAP with MODULE declarations', () => {
            const code = `
  PROGRAM
  MAP
    MODULE('KERNEL32')
      GetTickCount PROCEDURE(),ULONG
    END
    HelperProc PROCEDURE()
  END
  CODE
  RETURN
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== MAP with MODULE - Basic Tree ===');
            console.log(formatSymbolTree(symbols));
            
            console.log('\n=== MAP with MODULE - Verbose Output ===');
            console.log(formatSymbolTreeVerbose(symbols));
            
            console.log('\n=== Symbol Statistics ===');
            console.log(printSymbolStats(symbols));
            
            console.log('\n=== Flattened Symbol Paths ===');
            const flattened = flattenSymbolTree(symbols);
            flattened.forEach(({path, symbol}) => {
                const kindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === symbol.kind);
                console.log(`  ${path} (${kindName})`);
            });
            
            console.log('\n=== MAP Children Details ===');
            const mapSymbol = findSymbol(symbols, 'MAP');
            if (mapSymbol && mapSymbol.children) {
                console.log(`MAP has ${mapSymbol.children.length} direct children:`);
                mapSymbol.children.forEach((child, index) => {
                    const kindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === child.kind);
                    const childCount = child.children ? child.children.length : 0;
                    console.log(`  [${index}] ${child.name} (${kindName}) - ${childCount} children`);
                });
            }
            
            // Verify MAP exists
            assert.ok(mapSymbol, 'MAP should exist');
            
            // Verify MODULE exists as child of MAP
            const moduleSymbol = findSymbol(mapSymbol.children || [], 'MODULE');
            assert.ok(moduleSymbol, 'MODULE should exist as child of MAP');
            
            // Verify GetTickCount exists
            const getTickCount = findSymbol(symbols, 'GetTickCount');
            assert.ok(getTickCount, 'GetTickCount should exist somewhere');
        });

        test('Should parse complex MAP with multiple MODULEs and attributes', () => {
            const code = `
PROGRAM
MAP
  SortCaseSensitive(*LinesGroupType p1,*LinesGroupType p2),Long
  stMemCpyLeft (long dest, long src,  unsigned count)
  Module ('')
    ToUpper (byte char), byte, name('Cla$isftoupper'),dll(DLL_Mode)
    MemCmp(long buf1, long buf2, unsigned count), long, name('_memcmp'),dll(DLL_Mode)
  end
  MODULE('Zlib')
    stDeflateInit2_(ulong pStream, long pLevel),long,Pascal,raw,dll(_fp_)
    stDeflate(ulong pStream, long pFlush),long,Pascal,raw,dll(_fp_)
  End
end
CODE
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            console.log('\n=== All Structure Tokens ===');
            tokens.forEach((t, idx) => {
                if (t.type === TokenType.Structure) {
                    console.log(`[${idx}] Line ${t.line}: ${t.value} (finishesAt: ${t.finishesAt})`);
                }
            });
            
            console.log('\n=== All Tokens (first 30) ===');
            tokens.slice(0, 30).forEach((t, idx) => {
                console.log(`[${idx}] Line ${t.line}: "${t.value}" (type: ${TokenType[t.type]})`);
            });
            
            console.log('\n=== MapProcedure Tokens ===');
            tokens.forEach((t, idx) => {
                if (t.subType === TokenType.MapProcedure) {
                    console.log(`[${idx}] Line ${t.line}: ${t.value} (type: ${TokenType[t.type]}, label: ${t.label})`);
                }
            });
            
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== COMPLEX MAP - Basic Tree ===');
            console.log(formatSymbolTree(symbols));
            
            console.log('\n=== COMPLEX MAP - Verbose Output ===');
            console.log(formatSymbolTreeVerbose(symbols));
            
            console.log('\n=== Symbol Statistics ===');
            console.log(printSymbolStats(symbols));
            
            console.log('\n=== All Procedures (MapProc flag) ===');
            const allProcs = filterSymbolsByName(symbols, '');
            allProcs.forEach(sym => {
                if (sym._isMapProcedure || sym.kind === SymbolKind.Function) {
                    const kindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === sym.kind);
                    const mapProc = sym._isMapProcedure ? 'YES' : 'no';
                    console.log(`  ${sym.name} (${kindName}) - MapProc: ${mapProc}`);
                }
            });
            
            // Verify we have all expected procedures
            const sortCaseSensitive = findSymbol(symbols, 'SortCaseSensitive');
            const stMemCpyLeft = findSymbol(symbols, 'stMemCpyLeft');
            const toUpper = findSymbol(symbols, 'ToUpper');
            const memCmp = findSymbol(symbols, 'MemCmp');
            
            console.log('\n=== Missing Procedures Check ===');
            console.log(`SortCaseSensitive: ${sortCaseSensitive ? 'FOUND' : 'MISSING'}`);
            console.log(`stMemCpyLeft: ${stMemCpyLeft ? 'FOUND' : 'MISSING'}`);
            console.log(`ToUpper: ${toUpper ? 'FOUND' : 'MISSING'}`);
            console.log(`MemCmp: ${memCmp ? 'FOUND' : 'MISSING'}`);
            
            console.log('\n=== Flattened Symbol Paths ===');
            const flattened = flattenSymbolTree(symbols);
            flattened.forEach(({path, symbol}) => {
                const kindName = Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === symbol.kind);
                console.log(`  ${path} (${kindName})`);
            });
        });
    });

    suite('PROCEDURE Tests', () => {
        
        test('Should parse global PROCEDURE', () => {
            const code = `
  PROGRAM
  CODE
  
MyProc PROCEDURE()
LocalVar LONG
  CODE
  RETURN
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== Global PROCEDURE ===');
            console.log(formatSymbolTree(symbols));
            
            const proc = findSymbol(symbols, 'MyProc');
            assert.ok(proc, 'Should find MyProc');
            console.log(`MyProc flags: ${proc._isGlobalProcedure ? 'GlobalProc' : 'NOT SET'}`);
        });

        test('Should parse PROCEDURE with ROUTINE', () => {
            const code = `
  PROGRAM
  CODE
  
MyProc PROCEDURE()
LocalVar LONG
  CODE
  DO MyRoutine
  RETURN
  
MyRoutine ROUTINE
  LocalVar = 10
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== PROCEDURE with ROUTINE ===');
            console.log(formatSymbolTree(symbols));
            
            const proc = findSymbol(symbols, 'MyProc');
            const routine = findSymbol(symbols, 'MyRoutine');
            
            assert.ok(proc, 'Should find MyProc');
            assert.ok(routine, 'Should find MyRoutine');
            
            // Routine should be child of procedure
            if (proc?.children) {
                const routineInProc = proc.children.find(c => c.name.includes('MyRoutine'));
                assert.ok(routineInProc, 'Routine should be child of procedure');
            }
        });
    });

    suite('Real-world Example - StringTheory', () => {
        
        test('Should correctly parse StringTheory CLASS excerpt', () => {
            // Simplified version of the actual StringTheory.inc
            const code = `
  PROGRAM
StringTheory          Class(), type, Module('StringTheory.clw'), Link('StringTheory.clw')
value                   &string,PRIVATE
streamFileName          &string,PRIVATE
Append                  Procedure (String pValue)
Clip                    Procedure (),String
Flush                   Procedure (StringTheory pStr),long, proc, virtual
GetValue                Procedure (),String
                      End
  CODE
  RETURN
`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionDocumentSymbolProvider();
            const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');
            
            console.log('\n=== StringTheory CLASS (Real-world) ===');
            console.log(formatSymbolTree(symbols));
            
            const classSymbol = findSymbol(symbols, 'StringTheory');
            assert.ok(classSymbol, 'Should find StringTheory class');
            
            // Check for methods
            const append = findSymbol(symbols, 'Append');
            const clip = findSymbol(symbols, 'Clip');
            const flush = findSymbol(symbols, 'Flush');
            const getValue = findSymbol(symbols, 'GetValue');
            
            console.log(`\nMethods found:`);
            console.log(`  Append: ${!!append}`);
            console.log(`  Clip: ${!!clip}`);
            const flushKindName = flush ? Object.keys(SymbolKind).find(key => SymbolKind[key as keyof typeof SymbolKind] === flush.kind) : '';
            console.log(`  Flush: ${!!flush} ${flush ? `(${flushKindName})` : ''}`);
            console.log(`  GetValue: ${!!getValue}`);
            
            // Check for properties
            const value = findSymbol(symbols, 'value');
            const streamFileName = findSymbol(symbols, 'streamFileName');
            
            console.log(`\nProperties found:`);
            console.log(`  value: ${!!value}`);
            console.log(`  streamFileName: ${!!streamFileName}`);
            
            assert.ok(append, 'Should find Append method');
            assert.ok(flush, 'Should find Flush method (not StringTheory variable)');
        });
    });
});
