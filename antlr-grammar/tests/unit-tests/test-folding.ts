// Test script for folding ranges using ANTLR parser

import { CharStream, CommonTokenStream } from 'antlr4ng';
import { ClarionLexer } from './generated/ClarionLexer.js';
import { ClarionParser, WindowDeclarationContext, GroupDeclarationContext, 
         QueueDeclarationContext, ClassDeclarationContext, FileDeclarationContext,
         ProcedureDeclarationContext, IfStatementContext, LoopStatementContext,
         CaseStatementContext, MapSectionContext, CodeSectionContext,
         SheetControlContext, OptionControlContext, GroupControlContext,
         MenubarDeclarationContext, TabControlContext, RoutineDeclarationContext,
         RoutineDataSectionContext, RoutineCodeSectionContext,
         RecordDeclarationContext, ViewDeclarationContext, ReportDeclarationContext,
         ReportBandContext, MenuDeclarationContext, ApplicationDeclarationContext,
         OleControlContext, MethodDeclarationContext, ModuleReferenceContext } from './generated/ClarionParser.js';
import { AbstractParseTreeVisitor } from 'antlr4ng/tree';
import { ClarionParserVisitor } from './generated/ClarionParserVisitor.js';
import * as fs from 'fs';

interface FoldingRange {
    startLine: number;
    endLine: number;
    kind: string;
    label: string;
}

// Visitor to collect folding ranges
class FoldingVisitor extends AbstractParseTreeVisitor<void> implements ClarionParserVisitor<void> {
    private foldings: FoldingRange[] = [];

    protected defaultResult(): void {
        return;
    }

    getFoldings(): FoldingRange[] {
        return this.foldings.sort((a, b) => a.startLine - b.startLine);
    }

    private addFolding(ctx: any, kind: string, label: string) {
        if (ctx.start && ctx.stop) {
            const startLine = ctx.start.line;
            const endLine = ctx.stop.line;
            
            // Only add if spans multiple lines
            if (endLine > startLine) {
                this.foldings.push({
                    startLine,
                    endLine,
                    kind,
                    label
                });
            }
        }
    }

    // Map section
    visitMapSection(ctx: MapSectionContext): void {
        this.addFolding(ctx, 'MAP', 'MAP...END');
        this.visitChildren(ctx);
        return;
    }

    // Code section
    visitCodeSection(ctx: CodeSectionContext): void {
        this.addFolding(ctx, 'CODE', 'CODE section');
        this.visitChildren(ctx);
        return;
    }

    // Procedure
    visitProcedureDeclaration(ctx: ProcedureDeclarationContext): void {
        const name = ctx.IDENTIFIER()?.text || ctx.LABEL()?.text || 'Procedure';
        this.addFolding(ctx, 'PROCEDURE', `PROCEDURE ${name}`);
        this.visitChildren(ctx);
        return;
    }

    // Window
    visitWindowDeclaration(ctx: WindowDeclarationContext): void {
        const labelNode = ctx.LABEL() || ctx.IDENTIFIER();
        const label = labelNode?.text || 'Window';
        this.addFolding(ctx, 'WINDOW', `WINDOW ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // Group
    visitGroupDeclaration(ctx: GroupDeclarationContext): void {
        const label = ctx.label()?.text || 'Group';
        this.addFolding(ctx, 'GROUP', `GROUP ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // Queue
    visitQueueDeclaration(ctx: QueueDeclarationContext): void {
        const label = ctx.label()?.text || 'Queue';
        this.addFolding(ctx, 'QUEUE', `QUEUE ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // File
    visitFileDeclaration(ctx: FileDeclarationContext): void {
        const label = ctx.label()?.text || 'File';
        this.addFolding(ctx, 'FILE', `FILE ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // Class
    visitClassDeclaration(ctx: ClassDeclarationContext): void {
        const label = ctx.label()?.text || 'Class';
        this.addFolding(ctx, 'CLASS', `CLASS ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // Sheet control
    visitSheetControl(ctx: SheetControlContext): void {
        const label = ctx.label()?.text || 'Sheet';
        this.addFolding(ctx, 'SHEET', `SHEET ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // Option control
    visitOptionControl(ctx: OptionControlContext): void {
        const label = ctx.label()?.text || 'Option';
        this.addFolding(ctx, 'OPTION', `OPTION ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // Group control
    visitGroupControl(ctx: GroupControlContext): void {
        const label = ctx.label()?.text || 'Group';
        this.addFolding(ctx, 'GROUP', `GROUP ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // Menubar
    visitMenubarDeclaration(ctx: MenubarDeclarationContext): void {
        this.addFolding(ctx, 'MENUBAR', 'MENUBAR');
        this.visitChildren(ctx);
        return;
    }

    // IF statement
    visitIfStatement(ctx: IfStatementContext): void {
        this.addFolding(ctx, 'IF', 'IF...END');
        this.visitChildren(ctx);
        return;
    }

    // LOOP statement
    visitLoopStatement(ctx: LoopStatementContext): void {
        this.addFolding(ctx, 'LOOP', 'LOOP...END');
        this.visitChildren(ctx);
        return;
    }

    // CASE statement
    visitCaseStatement(ctx: CaseStatementContext): void {
        this.addFolding(ctx, 'CASE', 'CASE...END');
        this.visitChildren(ctx);
        return;
    }

    // TAB control (inside SHEET)
    visitTabControl(ctx: TabControlContext): void {
        // Get tab label if available
        const tabLabel = ctx.label()?.text || 'Tab';
        this.addFolding(ctx, 'TAB', `TAB ${tabLabel}`);
        this.visitChildren(ctx);
        return;
    }

    // ROUTINE declaration
    visitRoutineDeclaration(ctx: RoutineDeclarationContext): void {
        const label = ctx.IDENTIFIER()?.text || ctx.LABEL()?.text || 'Routine';
        this.addFolding(ctx, 'ROUTINE', `ROUTINE ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // ROUTINE DATA section
    visitRoutineDataSection(ctx: RoutineDataSectionContext): void {
        this.addFolding(ctx, 'DATA', 'ROUTINE DATA');
        this.visitChildren(ctx);
        return;
    }

    // ROUTINE CODE section
    visitRoutineCodeSection(ctx: RoutineCodeSectionContext): void {
        this.addFolding(ctx, 'CODE', 'ROUTINE CODE');
        this.visitChildren(ctx);
        return;
    }

    // RECORD declaration
    visitRecordDeclaration(ctx: RecordDeclarationContext): void {
        this.addFolding(ctx, 'RECORD', 'RECORD');
        this.visitChildren(ctx);
        return;
    }

    // VIEW declaration
    visitViewDeclaration(ctx: ViewDeclarationContext): void {
        const label = ctx.label()?.text || 'View';
        this.addFolding(ctx, 'VIEW', `VIEW ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // REPORT declaration
    visitReportDeclaration(ctx: ReportDeclarationContext): void {
        const label = ctx.label()?.text || 'Report';
        this.addFolding(ctx, 'REPORT', `REPORT ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // REPORT band (DETAIL, HEADER, FOOTER, BREAK)
    visitReportBand(ctx: ReportBandContext): void {
        // Determine band type
        let bandType = 'BAND';
        if (ctx.DETAIL()) bandType = 'DETAIL';
        else if (ctx.HEADER()) bandType = 'HEADER';
        else if (ctx.FOOTER()) bandType = 'FOOTER';
        else if (ctx.BREAK()) bandType = 'BREAK';
        
        this.addFolding(ctx, bandType, bandType);
        this.visitChildren(ctx);
        return;
    }

    // MENU declaration
    visitMenuDeclaration(ctx: MenuDeclarationContext): void {
        this.addFolding(ctx, 'MENU', 'MENU');
        this.visitChildren(ctx);
        return;
    }

    // APPLICATION declaration
    visitApplicationDeclaration(ctx: ApplicationDeclarationContext): void {
        const label = ctx.label()?.text || 'Application';
        this.addFolding(ctx, 'APPLICATION', `APPLICATION ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // OLE control
    visitOleControl(ctx: OleControlContext): void {
        const label = ctx.label()?.text || 'OLE';
        this.addFolding(ctx, 'OLE', `OLE ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // METHOD declaration (in classes)
    visitMethodDeclaration(ctx: MethodDeclarationContext): void {
        const label = ctx.label()?.text || 'Method';
        this.addFolding(ctx, 'METHOD', `METHOD ${label}`);
        this.visitChildren(ctx);
        return;
    }

    // MODULE reference (in MAP)
    visitModuleReference(ctx: ModuleReferenceContext): void {
        this.addFolding(ctx, 'MODULE', 'MODULE');
        this.visitChildren(ctx);
        return;
    }
}

// Main test function
function testFolding(filename: string) {
    console.log('================================================================================');
    console.log(`Testing Folding for: ${filename}`);
    console.log('================================================================================\n');

    // Read file
    const input = fs.readFileSync(filename, 'utf-8');
    console.log(`File size: ${input.length} characters`);
    console.log(`Lines: ${input.split('\n').length}\n`);

    // Create lexer and parser
    const inputStream = CharStream.fromString(input);
    const lexer = new ClarionLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new ClarionParser(tokenStream);

    // Parse
    const tree = parser.compilationUnit();

    // Visit and collect foldings
    const visitor = new FoldingVisitor();
    visitor.visit(tree);
    const foldings = visitor.getFoldings();

    console.log(`Found ${foldings.length} folding regions:\n`);
    console.log('┌─────────────┬──────────┬──────────┬────────────────────────────────────┐');
    console.log('│ Kind        │ Start    │ End      │ Label                              │');
    console.log('├─────────────┼──────────┼──────────┼────────────────────────────────────┤');

    foldings.forEach(f => {
        const kind = f.kind.padEnd(11);
        const start = f.startLine.toString().padStart(8);
        const end = f.endLine.toString().padStart(8);
        const label = f.label.substring(0, 36).padEnd(36);
        console.log(`│ ${kind} │ ${start} │ ${end} │ ${label} │`);
    });

    console.log('└─────────────┴──────────┴──────────┴────────────────────────────────────┘\n');

    // Show a few example regions with their actual content
    console.log('Example folding regions with content:\n');
    const lines = input.split('\n');
    
    foldings.slice(0, 5).forEach((f, i) => {
        console.log(`${i + 1}. ${f.label} (lines ${f.startLine}-${f.endLine}):`);
        console.log('   ' + '─'.repeat(70));
        
        const startLine = Math.max(0, f.startLine - 1);
        const endLine = Math.min(lines.length - 1, f.endLine - 1);
        
        for (let lineNum = startLine; lineNum <= Math.min(startLine + 5, endLine); lineNum++) {
            const lineContent = lines[lineNum].substring(0, 66);
            console.log(`   ${(lineNum + 1).toString().padStart(4)}: ${lineContent}`);
        }
        
        if (endLine - startLine > 5) {
            console.log(`        ... (${endLine - startLine - 5} more lines) ...`);
            console.log(`   ${(endLine + 1).toString().padStart(4)}: ${lines[endLine].substring(0, 66)}`);
        }
        console.log();
    });

    return foldings;
}

// Run tests
const args = process.argv.slice(2);
const filename = args[0] || 'test-column0-labels.clw';

try {
    testFolding(filename);
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
}
