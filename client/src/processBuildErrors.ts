import path = require("path");
import { DiagnosticCollection, languages, Diagnostic, Position, Range, DiagnosticSeverity } from "vscode";
import LoggerManager from './utils/LoggerManager';
import { parseBuildOutput } from './utils/BuildErrorPatterns'; // #672, #678, #693
const logger = LoggerManager.getLogger("ProcessBuildErrors");
logger.setLevel("error");

const diagnosticCollection: DiagnosticCollection = languages.createDiagnosticCollection("clarion");

function processBuildErrors(
    buildOutput: string
): { errorCount: number; warningCount: number; diagnostics: Map<string, Diagnostic[]> } {
    logger.info("🔍 Processing build output for errors and warnings...");
    logger.info("📝 Raw Build Output:\n" + buildOutput);

    const diagnostics: Map<string, Diagnostic[]> = new Map();
    let errorCount = 0;
    let warningCount = 0;

    // #693: the parsing is vscode-free (utils/BuildErrorPatterns) so the tests can drive it.
    for (const problem of parseBuildOutput(buildOutput)) {
        const absFilePath = problem.file ?? path.resolve("BuildOutput.log");
        const severity =
            problem.type === "error"
                ? DiagnosticSeverity.Error
                : DiagnosticSeverity.Warning;
        const diagnostic = new Diagnostic(
            new Range(
                new Position(problem.line, problem.column),
                new Position(problem.line, problem.column + 50)
            ),
            `Clarion ${problem.type}: ${problem.message}`,
            severity
        );
        diagnostic.source = "Clarion";

        if (!diagnostics.has(absFilePath)) diagnostics.set(absFilePath, []);
        diagnostics.get(absFilePath)!.push(diagnostic);

        if (severity === DiagnosticSeverity.Error) errorCount++;
        else warningCount++;
    }

    logger.info(`✅ Processed ${errorCount} errors and ${warningCount} warnings.`);

    return { errorCount, warningCount, diagnostics };
}

export default processBuildErrors;
