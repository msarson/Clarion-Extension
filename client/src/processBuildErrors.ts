import path = require("path");
import { DiagnosticCollection, languages, Diagnostic, Uri, Position, Range, DiagnosticSeverity, window } from "vscode";
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ProcessBuildErrors");

const diagnosticCollection: DiagnosticCollection = languages.createDiagnosticCollection("clarion");

function processBuildErrors(buildOutput: string): { errorCount: number, warningCount: number } {
    logger.info("🔍 Processing build output for errors and warnings...");
    logger.info("📝 Raw Build Output:\n", buildOutput);

    // ✅ Updated regex to capture both errors and warnings without breaking existing matches
    const errorPattern = /^.*?>([A-Za-z]:\\.*?\.clw)\((\d+),(\d+)\):\s+(error|warning)\s*:?\s*(.*?)(?:\s+\[.*\])?$/gm;

    const diagnostics: Map<string, Diagnostic[]> = new Map();
    const seenMessages = new Set<string>(); // ✅ Prevent duplicates
    let errorCount = 0;
    let warningCount = 0;

    let match;
    while ((match = errorPattern.exec(buildOutput)) !== null) {
        logger.info("✅ Match Found:", match); // 🔍 Log each match

        const [, filePath, line, column, type, message] = match;
        const absFilePath = path.resolve(filePath);
        const fileUri = Uri.file(absFilePath);

        // ✅ Deduplicate messages using file, line, column, and message content
        const uniqueKey = `${absFilePath}:${line}:${column}:${type}:${message}`;
        if (seenMessages.has(uniqueKey)) {
            logger.warn(`⚠️ Skipping duplicate message: ${uniqueKey}`);
            continue;
        }
        seenMessages.add(uniqueKey);
        // Convert line and column to zero-based indices for VS Code
        const lineNum = parseInt(line, 10) - 1;
        const colNum = parseInt(column, 10) - 1;

        // Create a range that covers the entire line for better visibility
        const startPosition = new Position(lineNum, colNum);
        const endPosition = new Position(lineNum, colNum + 50); // Extend range to make error more visible

        // ✅ Determine severity (Error or Warning)
        const severity = type === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;

        // Create a more descriptive message that includes the error type
        const formattedMessage = `Clarion ${type}: ${message}`;
        const diagnostic = new Diagnostic(new Range(startPosition, endPosition), formattedMessage, severity);

        // Set the source to "Clarion" for better identification in the Problems panel
        diagnostic.source = "Clarion";

        // Increment the appropriate counter
        if (type === "error") {
            errorCount++;
        } else {
            warningCount++;
        }

        logger.info(`📌 Creating ${type.toUpperCase()} diagnostic for file: ${filePath}`);
        logger.info(`🔹 Line: ${line}, Column: ${column}`);
        logger.info(`💬 Message: ${message}`);
        logger.info(`🗂 Absolute File Path: ${absFilePath}`);

        if (!diagnostics.has(absFilePath)) {
            diagnostics.set(absFilePath, []);
        }
        diagnostics.get(absFilePath)?.push(diagnostic);
    }

    logger.info("🧹 Resetting diagnostics...");
    // ✅ Clear and reset diagnostics with a delay to ensure VS Code updates properly
    setTimeout(() => {
        diagnosticCollection.clear();
        logger.info("📌 Adding new diagnostics...");
        diagnostics.forEach((diagArray, file) => {
            logger.info(`📌 Adding ${diagArray.length} diagnostics for ${file}`);
            diagnosticCollection.set(Uri.file(file), diagArray);
        });
        logger.info(`✅ Processed ${errorCount} errors and ${warningCount} warnings and added to Problems panel.`);
    }, 100);
    
    return { errorCount, warningCount };
}

export default processBuildErrors;
