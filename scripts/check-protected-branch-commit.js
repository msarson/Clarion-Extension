const { execFileSync } = require("child_process");

const PROTECTED_BRANCH_PATTERNS = [/^main$/, /^master$/, /^version-\d+\.\d+\.\d+$/];
const ALWAYS_ALLOWED_FILES = new Set([
    "CHANGELOG.md",
    ".gitignore",
    ".vscode/launch.json"
]);
const RELEASE_ALLOWED_PATTERNS = [
    /^\.github\/workflows\/release\.ya?ml$/i
];

function runGit(args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function getCurrentBranch() {
    return runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function getStagedFiles() {
    const raw = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    if (!raw) return [];
    return raw.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
}

function isProtectedBranch(branchName) {
    return PROTECTED_BRANCH_PATTERNS.some((pattern) => pattern.test(branchName));
}

function isReleaseAllowed(filePath) {
    return RELEASE_ALLOWED_PATTERNS.some((pattern) => pattern.test(filePath));
}

function getPackageJsonChangedLines() {
    const raw = runGit(["diff", "--cached", "--unified=0", "--", "package.json"]);
    return raw
        .split(/\r?\n/)
        .filter((line) => /^[+-]/.test(line))
        .filter((line) => !/^[+-]{3}/.test(line))
        .map((line) => line.slice(1).trim())
        .filter(Boolean);
}

function isPackageJsonVersionOnlyChange() {
    const changedLines = getPackageJsonChangedLines();
    if (changedLines.length === 0) {
        return false;
    }
    return changedLines.every((line) => /^"version"\s*:\s*"[^"]+"\s*,?$/.test(line));
}

function printBlockMessage(branchName, blockedFiles) {
    console.error("");
    console.error("❌ Commit blocked on protected branch");
    console.error(`Current branch: ${branchName}`);
    console.error("");
    console.error("The staged changes include files that are not allowed on protected branches:");
    blockedFiles.forEach((file) => console.error(`  - ${file}`));
    console.error("");
    console.error("Allowed on protected branches:");
    console.error("  - CHANGELOG.md");
    console.error("  - package.json (version field change only)");
    console.error("  - .gitignore");
    console.error("  - .vscode/launch.json");
    console.error("  - .github/workflows/release.yml");
    console.error("");
    console.error("Recovery:");
    console.error("  1. git switch -c <feature-branch-name>");
    console.error("  2. git commit");
    console.error("");
}

function main() {
    let branchName;
    let stagedFiles;

    try {
        branchName = getCurrentBranch();
        stagedFiles = getStagedFiles();
    } catch (error) {
        console.error(`pre-commit branch guard failed to inspect git state: ${error.message}`);
        process.exit(1);
    }

    if (!isProtectedBranch(branchName) || stagedFiles.length === 0) {
        return;
    }

    const blockedFiles = [];
    for (const filePath of stagedFiles) {
        if (ALWAYS_ALLOWED_FILES.has(filePath) || isReleaseAllowed(filePath)) {
            continue;
        }
        if (filePath === "package.json") {
            if (isPackageJsonVersionOnlyChange()) {
                continue;
            }
        }
        blockedFiles.push(filePath);
    }

    if (blockedFiles.length > 0) {
        printBlockMessage(branchName, blockedFiles);
        process.exit(1);
    }
}

main();
