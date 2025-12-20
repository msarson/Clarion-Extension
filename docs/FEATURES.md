# Clarion Extension Features

Complete feature documentation for the Clarion Extension for Visual Studio Code.

## Table of Contents

- [Language Support](#language-support)
- [Solution Management](#solution-management)
- [Code Navigation](#code-navigation)
- [Build & Generation](#build--generation)
- [Code Intelligence](#code-intelligence)
- [Diagnostics & Validation](#diagnostics--validation)
- [Code Editing](#code-editing)
- [Workspace Features](#workspace-features)

---

## Language Support

### Syntax Highlighting
- **Complete coverage** for all Clarion file types (.clw, .inc, .txa, .tpl, .tpw, .equ)
- **Keyword recognition** for all Clarion keywords and built-in functions
- **Comment styles** supported (!, |, <!---->)
- **String literals** with proper escape sequences
- **Numeric literals** including decimals, hex, and binary

### Bracket Matching
- **Auto-closing pairs** for parentheses, brackets, braces, quotes
- **Matching bracket highlighting** when cursor positioned
- **Smart bracket completion** respects Clarion syntax

### File Type Recognition
- `.clw` - Source files
- `.inc` - Include files
- `.equ` - Equate files
- `.txa` - Template Application files
- `.tpl` - Template files
- `.tpw` - Template Wizard files

---

## Solution Management

### Solution Explorer View
- **Navigate Clarion projects** directly inside VS Code
- **Hierarchical display** of solution → projects → files
- **Redirection file support** (local and global)
- **Multi-solution workspace** support

### Automatic Solution Parsing
- **Detects all projects** and redirection files in your solution
- **Auto-refreshes** when solution files change
- **Smart file watching** for project modifications

### Folder-Based Workflow
- **No workspace files needed** - Just open folder
- **Settings stored** in `.vscode/settings.json` within solution folder
- **Team-friendly** - Commit settings with your solution
- **Recent Solutions** - Global history remembers your last 20 solutions
- **One-click access** - Click recent solution to instantly reopen it

### Solution History
- **Global tracking** - Remembers solutions across all folders
- **Quick reopening** - Click recent solution in Solution View
- **Smart validation** - Automatically cleans up invalid references
- **Last opened timestamp** - See when you last worked on each solution

---

## Code Navigation

### Go To Definition (F12)
- **INCLUDE statements** - Navigate to included files
- **MODULE statements** - Jump to module source files
- **GROUP PREFIX declarations** - Full support for prefixed variables (e.g., `LOC:MyVar`, `MyGroup.MyVar`)
- **Method overload support** - Navigates to correct overload based on parameters
- **SECTION-aware** - INCLUDE with section name navigates to specific SECTION block
- **Redirection-aware** - Respects local and global redirection files

### Go To Implementation (Ctrl+F12)
- **CLASS method implementations** - From declaration to implementation
- **Single-file class support** - Works when CLASS and implementations in same file
- **Module-based classes** - Handles MODULE('file') declarations
- **Parameter matching** - Correctly matches implementations with spaces in parameters

### Document Outlining
- **Structure View** - Complete code structure in sidebar
- **Breadcrumbs** - Navigate within large files
- **Hierarchical display** of:
  - PROCEDUREs and ROUTINEs
  - FILEs with KEY/INDEX/RECORD/MEMO/BLOB
  - VIEWs with JOIN nesting and PROJECT fields
  - GROUPs with OVER and DIM attributes
  - CLASSes with methods and properties
  - Local variables organized by scope

### Follow Cursor
- **Auto-selects symbol** at cursor position in Structure View
- **Toggle in view** - Right-click to enable/disable
- **Smart activation** - Only works when Structure View visible (won't steal focus)

---

## Build & Generation

### ClarionCl.exe Integration
- **Generate applications** directly from solution tree
- **Right-click generation**:
  - Applications node → Generate all APPs in solution
  - Individual APP → Generate single application
- **Live output streaming** to "Clarion Generator" channel
- **Success/error notifications** on completion
- **Smart path resolution** - Auto-detects ClarionCl.exe location

### Build Configuration Support
- **Switch between builds** with `Clarion: Set Configuration`
- **Release and Debug** configurations
- **Per-solution settings** - Each solution remembers its configuration

---

## Code Intelligence

### Hover Provider
- **INCLUDE/MODULE statements** - Preview file contents on hover
- **Method signatures** - Shows correct overload based on parameters
- **SECTION-aware** - Shows only specified section in hover preview
- **Parameter information** - Displays parameter names and types

### Method Overload Support
- **Smart overload resolution** - Correctly identifies which method overload matches your call
- **Parameter counting** - Automatically counts parameters in calls
- **Matches all overloads** - Searches CLASS and MAP declarations
- **Handles optional parameters** - Intelligently handles `<Long Param>` and `Long Param=1`
- **Works everywhere** - Hover, Go to Definition, Go to Implementation

### IntelliSense
- **Code completion** for Clarion keywords
- **Snippet expansion** for common patterns
- **Context-aware suggestions**

---

## Diagnostics & Validation

### Real-Time Error Detection

#### Structure Termination Validation
- **Unterminated IF statements** - Missing END or `.`
- **Unterminated LOOP statements** - Missing END, WHILE, or UNTIL
- **Unterminated CLASS structures** - Missing END
- **OMIT/COMPILE blocks** - Validates directive terminator matching

#### FILE Structure Validation
- **Missing DRIVER attribute** - Error if FILE lacks DRIVER
- **Missing RECORD section** - Error if FILE lacks RECORD

#### CASE Statement Validation
- **OF clause validation** - CASE can have zero or more OF clauses
- **OROF placement** - Must follow OF in CASE (error if misplaced)

#### EXECUTE Statement Validation
- **Expression type checking** - Warns if expression should be numeric

#### RETURN Statement Validation
- **Missing RETURN statements** - Validates procedures/methods with return types
- **Empty RETURN validation** - Flags procedures where all RETURN statements are empty
- **Declaration/implementation split** - Correctly handles Clarion's syntax
- **Return type extraction** - Finds return type anywhere in attribute list

### Diagnostic Features
- **Error highlighting** in editor
- **Problems pane** integration
- **Quick fixes** (where applicable)
- **Severity levels** - Errors, warnings, information

---

## Code Editing

### Code Folding
- **Tokenizer-based folding** for improved accuracy
- **Fold structures**: IF, LOOP, CASE, EXECUTE, CLASS, FILE, GROUP, etc.
- **Collapse/expand** all or individual blocks
- **Persist folding** across sessions

### Document Formatter
- **Format document** with `Shift+Alt+F`
- **Configurable indentation**
- **Respects Clarion syntax rules**

### Snippets
- **Common patterns** available via IntelliSense
- **Custom snippets** can be added
- **Tab stops** for efficient editing

### Variable Prefix Highlighting
- **Automatically highlights** variables with user-defined prefixes
- **Configurable colors** (e.g., LOCS:, GLOS:)
- **Requires color customization** in settings

---

## Workspace Features

### Extension Status
- **Status Command** - Check extension health on-demand
  - Press `Ctrl+Shift+P` → "Clarion: Show Extension Status"
  - View language server status, workspace configuration, solution status
  - See navigation capabilities and build task availability
  - Get contextual tips for resolving configuration issues
  - Displays in Output panel with clean formatting

### View Filtering
- **Solution View filtering** - Find files quickly in large projects
- **Structure View filtering** - Navigate to specific symbols

### File Management
- **Add files to projects** - Right-click to add CLW files
- **Remove files from projects** - Right-click to remove files
- **Direct from Solution View** - No need to edit project files manually

### Redirection-Aware File Searching
- **Ctrl+P respects** local and global redirection files
- **Finds files** in redirected directories
- **Smart search** with proper precedence

### Multi-Solution Support
- **Open multiple solutions** in same workspace
- **Switch between solutions** easily
- **Independent configurations** per solution

---

## Performance Features

### Caching System
- **Symbol caching** - Document symbols cached during editing
- **Folding range caching** - Instant recomputation after 500ms debounce
- **Token cache** with change detection
- **Eliminates redundant tokenization**

### Optimizations
- **Per-document debouncing** (500ms) prevents typing lag
- **Reduced duplicate tokenizations** (3-4x → 1x per edit)
- **Hot-path optimization** - Removed excessive logging
- **Smooth editing** even in large files (14K+ lines)

---

## Additional Resources

- [Cheat Sheet](CheatSheet.md) - Quick reference guide
- [Build Settings](BuildSettings.md) - Detailed build configuration
- [Clarion Knowledge Base](clarion-knowledge-base.md) - Language reference
- [GitHub Repository](https://github.com/msarson/Clarion-Extension)
- [Issues & Feature Requests](https://github.com/msarson/Clarion-Extension/issues)

---

For complete feature architecture details, see [ClarionExtensionFeatures.md](../ClarionExtensionFeatures.md) in the repository root.
