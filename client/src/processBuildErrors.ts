import path = require("path");
import { DiagnosticCollection, languages, Diagnostic, Uri, Position, Range, DiagnosticSeverity, window } from "vscode";
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ProcessBuildErrors");

const diagnosticCollection: DiagnosticCollection = languages.createDiagnosticCollection("clarion");

function processBuildErrors(
    buildOutput: string
): { errorCount: number; warningCount: number; diagnostics: Map<string, Diagnostic[]> } {
    logger.info("🔍 Processing build output for errors and warnings...");
    logger.info("📝 Raw Build Output:\n" + buildOutput);

    // Single-line: 3> C:\...\Foo.Clw(123,4): error : Message [C:\...\Bar.cwproj]
    const errorPattern =
        /^.*?>\s*([A-Za-z]:\\.*?\.(?:[cC][lL][wW]|[iI][nN][cC]|[eE][qQ][uU]|[iI][nN][tT]))\((\d+),(\d+)\):\s+(error|warning)\s*:?\s*(.*?)(?:\s+\[([^\]]+)\])?$/gm;

    // Wrapped: 3> C:\...\Foo.Clw(123,\n    4): error : Message [C:\...\Bar.cwproj]
    const wrappedErrorPattern =
        /^.*?>\s*([A-Za-z]:\\.*?\.(?:[cC][lL][wW]|[iI][nN][cC]|[eE][qQ][uU]|[iI][nN][tT]))\((\d+),\s*$\r?\n^\s*(\d+)\):\s+(error|warning)\s*:?\s*(.*?)(?:\s+\[([^\]]+)\])?/gm;

    // Generic MSBuild lines without a file:  MSBUILD : error MSB1009: ...
    const fallbackPattern =
        /^\s*(?:MSBUILD|.+?)\s*:\s+(error|warning)\s+([A-Z0-9]+)?:?\s*(.+)$/gm;

    const diagnostics: Map<string, Diagnostic[]> = new Map();
    const seenDiagnostics = new Set<string>();        // dedupe actual diagnostics
    const coveredFallbackMsgs = new Set<string>();    // messages covered by file-based matches
    let errorCount = 0;
    let warningCount = 0;

    const processFileBased = (
        filePath: string,
        line: string,
        column: string,
        type: string,
        message: string,
        projTail?: string
    ) => {
        const absFilePath = path.resolve(filePath);
        const lineNum = parseInt(line, 10) - 1;
        const colNum = parseInt(column, 10) - 1;

        const diagKey = `${absFilePath}:${lineNum}:${colNum}:${type}:${message}`;
        if (seenDiagnostics.has(diagKey)) return;
        seenDiagnostics.add(diagKey);

        // Mark fallback coverage
        coveredFallbackMsgs.add(`${type}:${message}`);
        if (projTail) coveredFallbackMsgs.add(`${type}:${message} [${projTail}]`);

        const severity =
            type.toLowerCase() === "error"
                ? DiagnosticSeverity.Error
                : DiagnosticSeverity.Warning;
        const diagnostic = new Diagnostic(
            new Range(
                new Position(lineNum, Math.max(colNum, 0)),
                new Position(lineNum, Math.max(colNum, 0) + 50)
            ),
            `Clarion ${type}: ${message}`,
            severity
        );
        diagnostic.source = "Clarion";

        if (!diagnostics.has(absFilePath)) diagnostics.set(absFilePath, []);
        diagnostics.get(absFilePath)!.push(diagnostic);

        if (severity === DiagnosticSeverity.Error) errorCount++;
        else warningCount++;
    };

    const processFallback = (type: string, msg: string) => {
        const baseMsg = msg.replace(/\s+\[[^\]]+\]\s*$/, "");
        if (
            coveredFallbackMsgs.has(`${type}:${msg}`) ||
            coveredFallbackMsgs.has(`${type}:${baseMsg}`)
        ) {
            return;
        }

        const absFilePath = path.resolve("BuildOutput.log");
        const lineNum = 0,
            colNum = 0;
        const diagKey = `${absFilePath}:${lineNum}:${colNum}:${type}:${msg}`;
        if (seenDiagnostics.has(diagKey)) return;
        seenDiagnostics.add(diagKey);

        const severity =
            type.toLowerCase() === "error"
                ? DiagnosticSeverity.Error
                : DiagnosticSeverity.Warning;
        const diagnostic = new Diagnostic(
            new Range(new Position(lineNum, colNum), new Position(lineNum, colNum + 50)),
            `Clarion ${type}: ${msg}`,
            severity
        );
        diagnostic.source = "Clarion";

        if (!diagnostics.has(absFilePath)) diagnostics.set(absFilePath, []);
        diagnostics.get(absFilePath)!.push(diagnostic);

        if (severity === DiagnosticSeverity.Error) errorCount++;
        else warningCount++;
    };

    // Apply regex passes
    for (let m; (m = errorPattern.exec(buildOutput)) !== null;) {
        const [, filePath, line, column, type, message, projTail] = m;
        processFileBased(filePath, line, column, type, message, projTail);
    }

    for (let m; (m = wrappedErrorPattern.exec(buildOutput)) !== null;) {
        const [, filePath, line1, col, type, message, projTail] = m;
        processFileBased(filePath, line1, col, type, message, projTail);
    }

    for (let m; (m = fallbackPattern.exec(buildOutput)) !== null;) {
        const [, type, code, message] = m;
        const msg = code ? `${code}: ${message}` : message;
        processFallback(type, msg);
    }

    logger.info(`✅ Processed ${errorCount} errors and ${warningCount} warnings.`);

    return { errorCount, warningCount, diagnostics };
}






export default processBuildErrors;
