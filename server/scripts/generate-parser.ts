const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Define paths
const grammarFile = path.resolve(__dirname, "../grammar/Clarion.g4");
const outputDir = path.resolve(__dirname, "../src/parser");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log("🚀 Generating ANTLR parser...");
try {
    // Use antlr4ng instead of antlr4
    execSync(`npx antlr4ng -Dlanguage=TypeScript -o ${outputDir} ${grammarFile}`, { stdio: "inherit" });
    console.log("✅ ANTLR parser generated successfully!");
} catch (error) {
    console.error("❌ Failed to generate parser:", error);
}
