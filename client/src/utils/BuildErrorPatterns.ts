/**
 * #672 — the build-log patterns processBuildErrors reads Problems from, vscode-free so they can be
 * tested. The source-file extensions live in one place, so the three file-located patterns cannot
 * drift apart. Each call returns fresh /gm regexes (exec loops keep state in lastIndex).
 */

/** Source files a Clarion compile reports errors in: `.clw`, `.inc`, `.equ` and `.eq` (#672), `.int`. */
const SOURCE_EXT = String.raw`(?:[cC][lL][wW]|[iI][nN][cC]|[eE][qQ][uU]?|[iI][nN][tT])`;

/** #678 — a build message as Problems shows it. */
export function cleanBuildMessage(message: string): string {
    // MSBuild writes a carriage return or newline in a tool's output as the two characters `\r` / `\n`;
    // drop those, and whitespace, from the end. A backslash inside the message (a path) is kept.
    return message.replace(/(?:\\[rn]|\s)+$/, '');
}

export function buildErrorPatterns(): { single: RegExp; wrapped: RegExp; native: RegExp } {
    const file = String.raw`([A-Za-z]:\\.*?\.${SOURCE_EXT})`;
    return {
        // Single-line: C:\...\Foo.Clw(123,4): error : Message [C:\...\Bar.cwproj], also after an N> prefix
        single: new RegExp(String.raw`^(?:.*?>\s*)?${file}\((\d+),(\d+)\):\s+(error|warning)\s*:?\s*(.*?)(?:\s+\[([^\]]+)\])?$`, 'gm'),
        // Wrapped: C:\...\Foo.Clw(123,\n    4): error : Message [C:\...\Bar.cwproj]
        wrapped: new RegExp(String.raw`^(?:.*?>\s*)?${file}\((\d+),\s*$\r?\n^\s*(\d+)\):\s+(error|warning)\s*:?\s*(.*?)(?:\s+\[([^\]]+)\])?`, 'gm'),
        // Clarion compiler native format: "Message - C:\path\to\file.clw:line,col"
        native: new RegExp(String.raw`^(.+?)\s+-\s+${file}:(\d+),(\d+)\s*$`, 'gm'),
    };
}
