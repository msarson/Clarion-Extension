# Clarion Build Settings

This document describes the build output configuration options available in the Clarion Extension v0.7.1 and later.

## Overview

The Clarion Extension provides several configuration options that allow you to control how build output is displayed and managed. These settings give you more flexibility when debugging build issues or when you want more visibility into the build process.

## Available Settings

### Build Output Visibility

Controls when the build output terminal is shown during the build process.

```json
"clarion.build.revealOutput": "never" | "always" | "onError"
```

- **never** (default): The build terminal is never shown, keeping the UI clean.
- **always**: The build terminal is always shown when a build starts.
- **onError**: The build terminal is only shown when a build fails.

### Log File Preservation

Controls whether the build output log file is preserved after the build completes.

```json
"clarion.build.preserveLogFile": false | true
```

- **false** (default): The log file is automatically deleted after the build completes and errors are processed.
- **true**: The log file is preserved, allowing you to inspect it after the build.

### Custom Log File Path

Specifies a custom path for the build output log file.

```json
"clarion.build.logFilePath": ""
```

- **""** (default): The log file is created in the solution directory with the name "build_output.log".
- **Custom path**: Specify a full path to use a different location or filename.

### Output Panel Integration

Controls whether build output is also shown in the Output panel.

```json
"clarion.build.showInOutputPanel": false | true
```

- **false** (default): Build output is only processed for the Problems panel.
- **true**: Build output is also shown in a dedicated "Clarion Build" channel in the Output panel.

## How to Configure

You can configure these settings in your VS Code settings.json file:

```json
{
  "clarion.build.revealOutput": "onError",
  "clarion.build.preserveLogFile": true,
  "clarion.build.logFilePath": "C:\\BuildLogs\\clarion_build.log",
  "clarion.build.showInOutputPanel": true
}
```

Or use the VS Code Settings UI:

1. Open VS Code Settings (File > Preferences > Settings or Ctrl+,)
2. Search for "clarion.build"
3. Adjust the settings as needed

## Use Cases

### Debugging Build Issues

When you're having trouble with builds failing:

```json
{
  "clarion.build.revealOutput": "always",
  "clarion.build.preserveLogFile": true,
  "clarion.build.showInOutputPanel": true
}
```

This configuration shows you the build process in real-time, preserves the log file for inspection, and displays the output in both the Problems panel and Output panel.

### Clean UI for Regular Development

For day-to-day development when builds are working well:

```json
{
  "clarion.build.revealOutput": "never",
  "clarion.build.preserveLogFile": false,
  "clarion.build.showInOutputPanel": false
}
```

This is the default configuration, which keeps the UI clean and only shows errors in the Problems panel when they occur.

### Conditional Terminal Display

If you want to see the terminal only when there are errors:

```json
{
  "clarion.build.revealOutput": "onError",
  "clarion.build.preserveLogFile": false,
  "clarion.build.showInOutputPanel": false
}
```

This configuration keeps the UI clean during successful builds but shows the terminal when errors occur.

## Troubleshooting

If you're not seeing any build output or errors:

1. Set `clarion.build.revealOutput` to "always" to see the raw build output
2. Set `clarion.build.preserveLogFile` to true to inspect the log file
3. Check if the build output matches the expected patterns for the problem matcher

If the build seems to succeed but you can't see any output:

1. Set `clarion.build.showInOutputPanel` to true to see if output is being captured
2. Check the Problems panel (View > Problems) for any errors or warnings