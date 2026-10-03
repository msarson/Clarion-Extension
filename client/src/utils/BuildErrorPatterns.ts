/**
 * #672 — the build-log patterns processBuildErrors reads Problems from, vscode-free so they can be
 * tested. The source-file extensions live in one place, so the three file-located patterns cannot
 * drift apart. Each call returns fresh /gm regexes (exec loops keep state in lastIndex).
 */
import * as path from 'path';

/** Source files a Clarion compile reports errors in: `.clw`, `.inc`, `.equ` and `.eq` (#672), `.int`. */
const SOURCE_EXT = String.raw`(?:[cC][lL][wW]|[iI][nN][cC]|[eE][qQ][uU]?|[iI][nN][tT])`;

/** #678 — a build message as Problems shows it. */
export function cleanBuildMessage(message: string): string {
    // MSBuild writes a carriage return or newline in a tool's output as the two characters `\r` / `\n`;
    // drop those, and whitespace, from the end. A backslash inside the message (a path) is kept.
    return message.replace(/(?:\\[rn]|\s)+$/, '');
}

/** #693 — one Problems entry from a build log. `file` null: the log names no source file. Line and column are 0-based. */
export interface BuildProblem {
    file: string | null;
    line: number;
    column: number;
    type: 'error' | 'warning';
    message: string;
}

/** #693 — the problems in a build log, in the order processBuildErrors reports them, deduplicated. */
export function parseBuildOutput(buildOutput: string): BuildProblem[] {
    // #672: the file-located patterns (single-line, wrapped, compiler-native) share one
    // source-extension list.
    const { single: errorPattern, wrapped: wrappedErrorPattern, native: clarionNativePattern, fileOnly: fileOnlyPattern } = buildErrorPatterns();

    // Generic MSBuild lines without a file:  MSBUILD : error MSB1009: ...
    const fallbackPattern =
        /^\s*(?:MSBUILD|.+?)\s*:\s+(error|warning)\s+([A-Z0-9]+)?:?\s*(.+)$/gm;

    const problems: BuildProblem[] = [];
    const seenDiagnostics = new Set<string>();        // dedupe actual diagnostics
    const coveredFallbackMsgs = new Set<string>();    // messages covered by file-based matches
    const kind = (type: string): 'error' | 'warning' => type.toLowerCase() === 'error' ? 'error' : 'warning';

    const processFileBased = (
        filePath: string,
        line: string,
        column: string,
        type: string,
        message: string,
        projTail?: string
    ) => {
        message = cleanBuildMessage(message); // #678
        // #693 — a continuation line carrying only MSBuild's escaped \r and the project reports nothing.
        if (!message) return;
        const absFilePath = path.resolve(filePath);
        const lineNum = parseInt(line, 10) - 1;
        const colNum = parseInt(column, 10) - 1;

        const diagKey = `${absFilePath}:${lineNum}:${colNum}:${type}:${message}`;
        if (seenDiagnostics.has(diagKey)) return;
        seenDiagnostics.add(diagKey);

        // Mark fallback coverage
        coveredFallbackMsgs.add(`${type}:${message}`);
        if (projTail) coveredFallbackMsgs.add(`${type}:${message} [${projTail}]`);

        problems.push({ file: absFilePath, line: lineNum, column: Math.max(colNum, 0), type: kind(type), message });
    };

    const processFallback = (type: string, msg: string) => {
        // #693 — clean the message before the project tail, not the end of the line: MSBuild's
        // escaped \r sits before " [App.cwproj]", so the tail hid it from #678's cleaning, and the
        // coverage check below missed a line the file-located passes had already reported.
        const tail = /\s*\[[^\]]+\]\s*$/.exec(msg);
        const baseMsg = cleanBuildMessage(tail ? msg.slice(0, tail.index) : msg); // #678
        if (!baseMsg) return;
        msg = tail ? `${baseMsg} ${tail[0].trim()}` : baseMsg;
        if (
            coveredFallbackMsgs.has(`${type}:${msg}`) ||
            coveredFallbackMsgs.has(`${type}:${baseMsg}`)
        ) {
            return;
        }

        const diagKey = `BuildOutput.log:0:0:${type}:${msg}`;
        if (seenDiagnostics.has(diagKey)) return;
        seenDiagnostics.add(diagKey);

        problems.push({ file: null, line: 0, column: 0, type: kind(type), message: msg });
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

    // Clarion native format: treat all matches as errors (non-zero exit code confirms failure)
    for (let m; (m = clarionNativePattern.exec(buildOutput)) !== null;) {
        const [, message, filePath, line, column] = m;
        processFileBased(filePath, line, column, 'error', message);
    }

    // #693 — a file but no position: the file's first line, rather than the fallback's BuildOutput.log.
    for (let m; (m = fileOnlyPattern.exec(buildOutput)) !== null;) {
        const [, filePath, type, message, projTail] = m;
        processFileBased(filePath, '1', '1', type, message, projTail);
    }

    for (let m; (m = fallbackPattern.exec(buildOutput)) !== null;) {
        const [, type, code, message] = m;
        const msg = code ? `${code}: ${message}` : message;
        processFallback(type, msg);
    }

    return problems;
}

export function buildErrorPatterns(): { single: RegExp; wrapped: RegExp; native: RegExp; fileOnly: RegExp } {
    const file = String.raw`([A-Za-z]:\\.*?\.${SOURCE_EXT})`;
    return {
        // Single-line: C:\...\Foo.Clw(123,4): error : Message [C:\...\Bar.cwproj], also after an N> prefix
        single: new RegExp(String.raw`^(?:.*?>\s*)?${file}\((\d+),(\d+)\):\s+(error|warning)\s*:?\s*(.*?)(?:\s+\[([^\]]+)\])?$`, 'gm'),
        // Wrapped: C:\...\Foo.Clw(123,\n    4): error : Message [C:\...\Bar.cwproj]
        wrapped: new RegExp(String.raw`^(?:.*?>\s*)?${file}\((\d+),\s*$\r?\n^\s*(\d+)\):\s+(error|warning)\s*:?\s*(.*?)(?:\s+\[([^\]]+)\])?`, 'gm'),
        // Clarion compiler native format: "Message - C:\path\to\file.clw:line,col"
        native: new RegExp(String.raw`^(.+?)\s+-\s+${file}:(\d+),(\d+)\s*$`, 'gm'),
        // #693 — a file but no position: C:\...\Foo.clw : error : Message [C:\...\Bar.cwproj]
        // (the compiler failing to open a MEMBER program). Also indented, as MSBuild's summary repeats it.
        fileOnly: new RegExp(String.raw`^(?:.*?>)?\s*${file}\s*:\s+(error|warning)\s*:?\s*(.*?)(?:\s*\[([^\]]+)\])?\s*$`, 'gm'),
    };
}
