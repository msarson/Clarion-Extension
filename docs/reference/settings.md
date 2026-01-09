# Settings Reference

[← Back to Documentation Home](../../README.md)

Complete reference for all Clarion Extension configuration settings.

## Configuration Location

Settings are stored in `.vscode/settings.json` within your solution folder:

```json
{
  "clarion.clarionPath": "C:\\Clarion11\\Bin",
  "clarion.propertiesPath": "C:\\MyProject\\.clarion.properties",
  "clarion.configuration": "Release|Win32"
}
```

---

## Essential Settings

### `clarion.clarionPath`
**Type:** `string`  
**Default:** `null`

Path to your Clarion BIN directory containing `ClarionCl.exe`.

**Example:**
```json
{
  "clarion.clarionPath": "C:\\Clarion11\\Bin"
}
```

**Set via UI:**
- `Ctrl+Shift+P` → "Clarion: Set Clarion Path"
- Click status bar (bottom-right)

---

### `clarion.propertiesPath`
**Type:** `string`  
**Default:** `null`

Path to your `.clarion.properties` file for redirection configuration.

**Example:**
```json
{
  "clarion.propertiesPath": "C:\\MyProject\\.clarion.properties"
}
```

**Set via UI:**
- `Ctrl+Shift+P` → "Clarion: Set Clarion Properties"

---

### `clarion.configuration`
**Type:** `string`  
**Default:** `"Release|Win32"`

Build configuration (Debug/Release and platform).

**Example:**
```json
{
  "clarion.configuration": "Debug|Win32"
}
```

**Set via UI:**
- Click configuration in status bar
- `Ctrl+Shift+P` → "Clarion: Set Configuration"

---

## Feature Settings

### `clarion.unreachableCode.enabled`
**Type:** `boolean`  
**Default:** `true`

Enable/disable visual dimming of unreachable code after RETURN/EXIT/HALT statements.

**Example:**
```json
{
  "clarion.unreachableCode.enabled": false
}
```

---

### `clarion.diagnostics.enabled`
**Type:** `boolean`  
**Default:** `true`

Enable/disable all diagnostic features (error detection).

**Example:**
```json
{
  "clarion.diagnostics.enabled": true
}
```

---

### `clarion.diagnostics.validateStructures`
**Type:** `boolean`  
**Default:** `true`

Validate structure blocks (IF/END, LOOP/END, CASE/END, etc.) are properly terminated.

---

### `clarion.diagnostics.validateFiles`
**Type:** `boolean`  
**Default:** `true`

Validate FILE declarations have required DRIVER and RECORD attributes.

---

### `clarion.pasteAsClarionString.lineTerminator`
**Type:** `string`  
**Default:** `"space"`  
**Options:** `"space"`, `"crlf"`, `"none"`

Line terminator to use when pasting as Clarion string.

**Examples:**
```json
// Space continuation (default)
{
  "clarion.pasteAsClarionString.lineTerminator": "space"
}
// Output: 'Line 1' & |
//         'Line 2'

// CRLF continuation
{
  "clarion.pasteAsClarionString.lineTerminator": "crlf"
}
// Output: 'Line 1' & |
//         '<13,10>' & |
//         'Line 2'

// No line breaks
{
  "clarion.pasteAsClarionString.lineTerminator": "none"
}
// Output: 'Line 1Line 2'
```

---

### `clarion.pasteAsClarionString.trimLeading`
**Type:** `boolean`  
**Default:** `true`

Trim leading whitespace from each line when pasting as Clarion string.

---

## Editor Integration Settings

### `editor.quickSuggestions`
Recommended settings for Clarion IntelliSense:

```json
{
  "editor.quickSuggestions": {
    "comments": false,
    "strings": true,
    "other": true
  }
}
```

---

### `editor.acceptSuggestionOnCommitCharacter`
**Recommended:** `true`

Accept IntelliSense suggestions with commit characters like `(`, `.`, etc.

---

### `editor.acceptSuggestionOnEnter`
**Recommended:** `"on"`

Accept IntelliSense suggestions with Enter key.

---

## Advanced Settings

### Build System

#### `clarion.build.showOutputOnError`
**Type:** `boolean`  
**Default:** `true`

Automatically show build output panel when build errors occur.

---

#### `clarion.build.clearOutputOnBuild`
**Type:** `boolean`  
**Default:** `true`

Clear previous build output before starting new build.

---

### Solution Management

#### `clarion.solution.autoRefresh`
**Type:** `boolean`  
**Default:** `true`

Automatically refresh solution view when files change.

---

#### `clarion.solution.maxRecentSolutions`
**Type:** `number`  
**Default:** `20`

Maximum number of recent solutions to remember.

---

## Example Full Configuration

```json
{
  // Essential
  "clarion.clarionPath": "C:\\Clarion11\\Bin",
  "clarion.propertiesPath": "C:\\MyProject\\.clarion.properties",
  "clarion.configuration": "Release|Win32",
  
  // Features
  "clarion.unreachableCode.enabled": true,
  "clarion.diagnostics.enabled": true,
  "clarion.diagnostics.validateStructures": true,
  "clarion.diagnostics.validateFiles": true,
  
  // Paste as String
  "clarion.pasteAsClarionString.lineTerminator": "space",
  "clarion.pasteAsClarionString.trimLeading": true,
  
  // Editor Integration
  "editor.quickSuggestions": {
    "comments": false,
    "strings": true,
    "other": true
  },
  "editor.acceptSuggestionOnCommitCharacter": true,
  "editor.acceptSuggestionOnEnter": "on",
  
  // Build
  "clarion.build.showOutputOnError": true,
  "clarion.build.clearOutputOnBuild": true,
  
  // Solution
  "clarion.solution.autoRefresh": true,
  "clarion.solution.maxRecentSolutions": 20
}
```

---

## Workspace vs User Settings

### User Settings
Global settings that apply to all solutions:
- **File → Preferences → Settings** (`Ctrl+,`)
- Stored in `%APPDATA%\Code\User\settings.json`

**Use for:**
- Clarion path (same for all projects)
- Editor preferences
- UI customization

### Workspace Settings
Settings specific to your solution:
- Stored in `.vscode/settings.json` within solution folder
- Can be committed to version control

**Use for:**
- Solution-specific configuration
- Properties file path
- Build configuration
- Team-shared settings

---

## Related Documentation

- **[Commands Reference](commands.md)** - All available commands
- **[Installation Guide](../guides/installation.md)** - Setup instructions
- **[Common Tasks](../guides/common-tasks.md)** - How-to recipes

