import path = require("path");
import { DiagnosticCollection, languages, Diagnostic, Uri, Position, Range, DiagnosticSeverity, window } from "vscode";
import logger from "./logger";

const diagnosticCollection: DiagnosticCollection = languages.createDiagnosticCollection("clarion");

function processBuildErrors(buildOutput: string) {
    logger.info("🔍 Processing build output for errors and warnings...");
    logger.info("📝 Raw Build Output:\n", buildOutput);

    // ✅ Updated regex to capture both errors and warnings without breaking existing matches
    const errorPattern = /^.*?>([A-Z]:\\.*?\.clw)\((\d+),(\d+)\):\s+(error|warning)\s*:\s*(.*?)\s+\[.*\]$/gm;

    const diagnostics: Map<string, Diagnostic[]> = new Map();
    const seenMessages = new Set<string>(); // ✅ Prevent duplicates

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

        const startPosition = new Position(parseInt(line, 10) - 1, parseInt(column, 10) - 1);
        const endPosition = new Position(parseInt(line, 10) - 1, parseInt(column, 10) + 10);

        // ✅ Determine severity (Error or Warning)
        const severity = type === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
        const diagnostic = new Diagnostic(new Range(startPosition, endPosition), message, severity);

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
        logger.info("✅ Errors and warnings processed and added to Problems panel.");
    }, 100);
}

export default processBuildErrors;
