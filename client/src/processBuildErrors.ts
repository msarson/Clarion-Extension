import path = require("path");
import { DiagnosticCollection, languages, Diagnostic, Uri, Position, Range, DiagnosticSeverity, window } from "vscode";
import LoggerManager from './logger';
import { globalSolutionFile } from "./globals";
const logger = LoggerManager.getLogger("ProcessBuildErrors");

// Create a single diagnostic collection for all errors
const diagnosticCollection: DiagnosticCollection = languages.createDiagnosticCollection("clarion-build");

// Clear all diagnostic collections to ensure a clean slate
export function clearAllDiagnostics() {
    // Clear our main diagnostic collection
    diagnosticCollection.clear();
    
    // Also clear any other collections that might exist
    languages.createDiagnosticCollection("clarion").clear();
    languages.createDiagnosticCollection("msbuild-errors").clear();
}

// Global set to track all errors across the entire build process
export const globalSeenErrors = new Set<string>();

// Reset the global error tracking
export function resetErrorTracking() {
    globalSeenErrors.clear();
}

function processBuildErrors(buildOutput: string): { errorCount: number, warningCount: number } {
    logger.info("🔍 Processing build output for errors and warnings...");
    logger.info("📝 Raw Build Output:\n", buildOutput);
    
    // Clear previous diagnostics before processing new ones
    diagnosticCollection.clear();

    // ✅ Updated regex patterns to capture different error formats
    // Original Clarion error pattern
    const clarionErrorPattern = /^.*?>([A-Z]:\\.*?\.clw)\((\d+),(\d+)\):\s+(error|warning)\s*:\s*(.*?)\s+\[.*\]$/gm;
    
    // MSBuild error pattern (more generic)
    const msBuildErrorPattern = /^.*?([A-Z]:\\.*?\.(clw|inc|tpl|tpw|cwproj))\((\d+)(?:,(\d+))?\):\s+(error|warning)\s+([A-Z0-9]+):\s+(.*?)$/gm;
    
    // Compiler error pattern (even more generic)
    const compilerErrorPattern = /^.*?([A-Z]:\\.*?\.[a-zA-Z0-9]+)\((\d+)(?:,(\d+))?\):\s+(error|warning)(?:\s+[A-Z0-9]+)?:\s+(.*?)$/gm;
    
    // Specific Clarion compiler error pattern from the build output
    const clarionBuildErrorPattern = /^\s*\d+>([A-Z]:\\.*?\.[a-zA-Z0-9]+)\((\d+),(\d+)\):\s+(error|warning)\s*:\s*(.*?)\s+\[([A-Z]:\\.*?\.cwproj)\]$/gmi;
    
    // Generic error pattern for Clarion errors without specific file/line info
    const genericErrorPattern = /^\s*\d+>.*?(error|warning)\s*:\s*(.*?)$/gmi;
    
    // Pattern for syntax errors that might not have the standard format
    const syntaxErrorPattern = /^\s*\d+>.*?(Syntax error|Invalid statement|Expected:|Unknown identifier|Field not found|No matching prototype)\s*:\s*(.*?)$/gmi;

    const diagnostics: Map<string, Diagnostic[]> = new Map();
    const seenMessages = new Set<string>(); // ✅ Prevent duplicates
    let errorCount = 0;
    let warningCount = 0;

    // Process each error pattern
    function processErrorMatch(match: RegExpExecArray, pattern: string) {
        logger.info(`✅ Match Found (${pattern}):`, match); // 🔍 Log each match

        let filePath, line, column, type, message, projectPath;
        
        if (pattern === 'clarion') {
            [, filePath, line, column, type, message] = match;
        } else if (pattern === 'msbuild') {
            [, filePath, , line, column = "1", type, , message] = match;
        } else if (pattern === 'compiler') {
            [, filePath, line, column = "1", type, message] = match;
        } else if (pattern === 'clarion_build') {
            // Format: 2>c:\path\file.clw(242,4): error : Message [c:\path\project.cwproj]
            [, filePath, line, column, type, message, projectPath] = match;
            logger.info(`📌 Clarion build error in project: ${projectPath}`);
        } else if (pattern === 'syntax') {
            // Format: 2>Syntax error: Message
            [, type, message] = match;
            
            // For syntax errors without file info, use the active file or solution file
            const activeEditor = window.activeTextEditor;
            if (activeEditor) {
                filePath = activeEditor.document.uri.fsPath;
                line = "1";
                column = "1";
            } else {
                filePath = globalSolutionFile;
                line = "1";
                column = "1";
            }
            
            logger.info(`📌 Syntax error detected: ${message}`);
        } else if (pattern === 'generic') {
            // Format: 2>error: Message
            [, type, message] = match;
            
            // For generic errors without file info, use the active file or solution file
            const activeEditor = window.activeTextEditor;
            if (activeEditor) {
                filePath = activeEditor.document.uri.fsPath;
                line = "1";
                column = "1";
            } else {
                filePath = globalSolutionFile;
                line = "1";
                column = "1";
            }
            
            logger.info(`📌 Generic error detected: ${message}`);
        } else {
            return; // Unknown pattern
        }

        // Skip if we couldn't determine a file path
        if (!filePath) {
            logger.warn(`⚠️ No file path for error: ${message}`);
            return;
        }

        const absFilePath = path.resolve(filePath);
        const fileUri = Uri.file(absFilePath);

        // ✅ Deduplicate messages using file, line, column, and a simplified message
        // Remove the cwproj reference from the message for cleaner error display
        const cleanMessage = message.replace(/\s+\[.*?\.cwproj\]$/, '');
        
        // Create a global unique key that works across all error patterns
        const globalKey = `${absFilePath}:${line}:${column}:${cleanMessage}`;
        if (globalSeenErrors.has(globalKey)) {
            logger.warn(`⚠️ Skipping globally duplicate message: ${globalKey}`);
            return;
        }
        globalSeenErrors.add(globalKey);
        
        // Filter out .cwproj errors at line 1, column 1 if we already have a more specific error
        // These are typically redundant project-level errors
        if (absFilePath.toLowerCase().endsWith('.cwproj') && line === "1" && column === "1") {
            // Look for any errors with the same message in .clw files or with specific line numbers
            const hasMoreSpecificError = Array.from(globalSeenErrors).some(key => {
                // Skip comparing to itself
                if (key === globalKey) return false;
                
                // If it's the same message but in a .clw file or at a specific line number
                if (key.endsWith(`:${cleanMessage}`)) {
                    const keyParts = key.split(':');
                    const keyFile = keyParts[0];
                    const keyLine = keyParts[1];
                    
                    // If it's a .clw file or has a line number > 1, consider it more specific
                    if (keyFile.toLowerCase().endsWith('.clw') ||
                        (parseInt(keyLine, 10) > 1 && !keyFile.toLowerCase().endsWith('.cwproj'))) {
                        return true;
                    }
                }
                return false;
            });
            
            if (hasMoreSpecificError) {
                logger.warn(`⚠️ Skipping generic cwproj error at line 1, column 1: ${globalKey}`);
                return;
            }
        }
        
        // Also check local duplicates
        const uniqueKey = `${absFilePath}:${line}:${column}:${type}:${cleanMessage}`;
        if (seenMessages.has(uniqueKey)) {
            logger.warn(`⚠️ Skipping duplicate message: ${uniqueKey}`);
            return;
        }
        seenMessages.add(uniqueKey);

        const startPosition = new Position(parseInt(line, 10) - 1, parseInt(column, 10) - 1);
        const endPosition = new Position(parseInt(line, 10) - 1, parseInt(column, 10) + 10);

        // ✅ Determine severity (Error or Warning)
        const severity = type.toLowerCase() === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
        
        // Use the cleaned message for the diagnostic
        const diagnostic = new Diagnostic(new Range(startPosition, endPosition), cleanMessage, severity);

        // Increment the appropriate counter
        if (type.toLowerCase() === "error") {
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

    // Try each error pattern
    let match;
    
    // Try specific Clarion build error pattern first (most specific)
    while ((match = clarionBuildErrorPattern.exec(buildOutput)) !== null) {
        processErrorMatch(match, 'clarion_build');
    }
    
    // Try Clarion error pattern
    while ((match = clarionErrorPattern.exec(buildOutput)) !== null) {
        processErrorMatch(match, 'clarion');
    }
    
    // Try MSBuild error pattern
    while ((match = msBuildErrorPattern.exec(buildOutput)) !== null) {
        processErrorMatch(match, 'msbuild');
    }
    
    // Try compiler error pattern
    while ((match = compilerErrorPattern.exec(buildOutput)) !== null) {
        processErrorMatch(match, 'compiler');
    }
    
    // Try syntax error pattern
    while ((match = syntaxErrorPattern.exec(buildOutput)) !== null) {
        processErrorMatch(match, 'syntax');
    }
    
    // Try generic error pattern
    while ((match = genericErrorPattern.exec(buildOutput)) !== null) {
        processErrorMatch(match, 'generic');
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
