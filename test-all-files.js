#!/usr/bin/env node

/**
 * Systematic Grammar Testing Script
 * Tests all *.clw and *.inc files in a directory alphabetically
 * Saves progress and resumes from last position on next run
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const TEST_DIRECTORY = 'C:\\Clarion\\Clarion11.1\\accessory\\libsrc\\win';
const PROGRESS_FILE = 'test-progress.json';
const DIAGNOSTIC_SCRIPT = 'diagnose-folding.js';

// ANSI colors for output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
            // Ensure skipped array exists
            if (!data.skipped) {
                data.skipped = [];
            }
            return data;
        } catch (e) {
            log(`Warning: Could not load progress file: ${e.message}`, 'yellow');
        }
    }
    return { lastTestedFile: null, passedFiles: [], failedFile: null, skipped: [] };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

function getAllTestFiles(directory) {
    try {
        const files = fs.readdirSync(directory);
        const testFiles = files
            .filter(f => f.endsWith('.clw') || f.endsWith('.inc'))
            .map(f => path.join(directory, f))
            .sort(); // Alphabetical order
        return testFiles;
    } catch (e) {
        log(`Error reading directory: ${e.message}`, 'red');
        process.exit(1);
    }
}

function testFile(filePath) {
    const fileName = path.basename(filePath);
    
    try {
        log(`\nTesting: ${fileName}`, 'cyan');
        
        // Run diagnostic script
        const output = execSync(`node ${DIAGNOSTIC_SCRIPT} "${filePath}"`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        // Parse output for errors
        const errorMatch = output.match(/Errors:\s*(\d+)/);
        const errorCount = errorMatch ? parseInt(errorMatch[1]) : null;
        
        if (errorCount === null) {
            log(`  ⚠ Could not determine error count`, 'yellow');
            return { success: false, errorLine: 'unknown', errorCount: 'unknown' };
        }
        
        if (errorCount === 0) {
            // Extract stats
            const linesMatch = output.match(/Total lines:\s*(\d+)/);
            const foldingMatch = output.match(/Total folding ranges found:\s*(\d+)/);
            const lines = linesMatch ? linesMatch[1] : '?';
            const folding = foldingMatch ? foldingMatch[1] : '?';
            
            log(`  ✓ PASSED (${lines} lines, ${folding} folding ranges)`, 'green');
            return { success: true, lines, folding };
        } else {
            // Extract first error line
            const errorLineMatch = output.match(/First error at line:\s*(\d+)/);
            const errorLine = errorLineMatch ? errorLineMatch[1] : 'unknown';
            
            log(`  ✗ FAILED (${errorCount} error${errorCount > 1 ? 's' : ''} at line ${errorLine})`, 'red');
            
            // Extract error details
            const errorDetailMatch = output.match(/═══ Parse Errors ═══\n.*?Line (\d+), Col (\d+)\n.*?(.+?)\n/s);
            if (errorDetailMatch) {
                const [, line, col, message] = errorDetailMatch;
                log(`\n  Error Details:`, 'yellow');
                log(`    Line ${line}, Column ${col}`, 'dim');
                const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '').trim();
                log(`    ${cleanMessage}`, 'dim');
            }
            
            return { success: false, errorLine, errorCount };
        }
    } catch (e) {
        log(`  ✗ ERROR running test: ${e.message}`, 'red');
        return { success: false, errorLine: 'exception', errorCount: 1, error: e.message };
    }
}

function main() {
    log('═══════════════════════════════════════════════════════════', 'cyan');
    log('  Systematic Grammar Testing Script', 'bright');
    log('═══════════════════════════════════════════════════════════', 'cyan');
    
    // Load progress
    const progress = loadProgress();
    const allFiles = getAllTestFiles(TEST_DIRECTORY);
    
    log(`\nDirectory: ${TEST_DIRECTORY}`, 'blue');
    log(`Total files: ${allFiles.length}`, 'blue');
    
    if (progress.lastTestedFile) {
        log(`Resuming from: ${path.basename(progress.lastTestedFile)}`, 'yellow');
        log(`Previously passed: ${progress.passedFiles.length} files`, 'green');
    } else {
        log('Starting fresh test run', 'blue');
    }
    
    // Find starting point
    let startIndex = 0;
    if (progress.lastTestedFile) {
        startIndex = allFiles.findIndex(f => f === progress.lastTestedFile);
        if (startIndex !== -1) {
            startIndex++; // Start from next file
        } else {
            log('Warning: Last tested file not found, starting from beginning', 'yellow');
            startIndex = 0;
        }
    }
    
    // Test files
    let passedCount = progress.passedFiles.length;
    let failedFile = null;
    
    for (let i = startIndex; i < allFiles.length; i++) {
        const file = allFiles[i];
        const fileName = path.basename(file);
        
        // Skip files in the skipped list
        if (progress.skipped && progress.skipped.includes(fileName)) {
            log(`\n[${i + 1}/${allFiles.length}] ${fileName}`, 'bright');
            log(`  ⊘ SKIPPED (in skip list)`, 'yellow');
            progress.lastTestedFile = file;
            saveProgress(progress);
            continue;
        }
        
        log(`\n[${i + 1}/${allFiles.length}] ${fileName}`, 'bright');
        
        const result = testFile(file);
        
        if (result.success) {
            passedCount++;
            progress.passedFiles.push(fileName);
            progress.lastTestedFile = file;
            saveProgress(progress);
        } else {
            // Test failed - stop here
            failedFile = file;
            progress.failedFile = {
                file: fileName,
                path: file,
                errorLine: result.errorLine,
                errorCount: result.errorCount,
            };
            saveProgress(progress);
            break;
        }
    }
    
    // Summary
    log('\n═══════════════════════════════════════════════════════════', 'cyan');
    if (failedFile) {
        log('  Test Run: STOPPED AT FAILURE', 'red');
        log('═══════════════════════════════════════════════════════════', 'cyan');
        log(`\nFailed File: ${path.basename(failedFile)}`, 'red');
        log(`Full Path: ${failedFile}`, 'dim');
        log(`Error at line: ${progress.failedFile.errorLine}`, 'yellow');
        log(`\nFix the error and run this script again to continue testing.`, 'blue');
        process.exit(1);
    } else {
        log('  Test Run: COMPLETE ✓', 'green');
        log('═══════════════════════════════════════════════════════════', 'cyan');
        log(`\nAll ${allFiles.length} files passed!`, 'green');
        log(`Total passed: ${passedCount}`, 'green');
        
        // Clear progress on complete success
        if (fs.existsSync(PROGRESS_FILE)) {
            fs.unlinkSync(PROGRESS_FILE);
            log('\nProgress file cleared.', 'dim');
        }
        process.exit(0);
    }
}

// Run
main();
