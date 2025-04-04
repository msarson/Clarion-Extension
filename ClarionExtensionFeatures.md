# Clarion Extension Features

This document provides an overview of the features available in the Clarion Extension for Visual Studio Code.

## General Information

- **Name**: Clarion Extensions
- **Description**: Extension for Clarion Language
- **Version**: 0.5.6
- **Publisher**: msarson
- **Repository**: [GitHub](https://github.com/msarson/Clarion-Extension)

## Core Features

### Solution Management

The extension provides comprehensive solution management capabilities:

- **Solution Opening/Closing**: Open and close Clarion solutions (.sln files)
- **Solution List**: Quick access to recently used solutions
- **Configuration Selection**: Switch between different build configurations
- **File Watchers**: Automatic monitoring of solution, project, and redirection files for changes

### Code Navigation and Structure

- **Quick Open**: Navigate to files within the solution, including those in redirection paths (Ctrl+P)
- **Structure View**: Hierarchical view of the code structure (procedures, classes, methods)
- **Go to Definition**: Navigate to symbol definitions (Ctrl+F12)
- **Document Symbols**: Outline view of the current document's structure

### Code Editing and Formatting

- **Syntax Highlighting**: Clarion-specific syntax highlighting
- **Code Formatting**: Automatic formatting of Clarion code
- **Variable Prefix Highlighting**: Direct highlighting for variables with user-defined prefixes (e.g., LOCS:, GLOS:) with configurable styling options including colors, font styles, and decorations
- **Comment Pattern Highlighting**: Direct highlighting for comment lines with user-defined patterns (e.g., `! TODO`, `! FIXME`) with configurable styling options
- **Snippets**: Pre-defined code snippets for common Clarion constructs
  - Variables, reference variables
  - Classes and methods
  - Procedures and procedure variables
  - Common statements
  - Override methods

### Build Integration

- **Build Solution**: Build the entire solution (Ctrl+Shift+B)
- **Build Project**: Build individual projects
- **Problem Matchers**: Parse and display Clarion-specific build errors and warnings

### File Management

- **Add Source Files**: Add new source files to projects
- **Remove Source Files**: Remove source files from projects with optional recycling

## UI Components

### Activity Bar and Views

- **Clarion Tools**: Dedicated activity bar icon for Clarion-specific tools
- **Solution View**: Tree view of the solution structure showing:
  - Solution
  - Projects
  - Source files
- **Structure View**: Hierarchical view of the code structure in the current file

### Context Menus

- **Solution Context Menu**: Actions for the solution (build, close)
- **Project Context Menu**: Actions for projects (build, add source file)
- **File Context Menu**: Actions for files (build containing project, remove)

### Status Bar

- **Configuration Indicator**: Shows the current Clarion configuration in the status bar
- **Quick Configuration Change**: Click to change the active configuration

## Language Server Features

The extension uses a Language Server Protocol implementation to provide rich language features:

- **Document Symbols**: Provides symbol information for the outline view and navigation
- **Folding Ranges**: Smart code folding for procedures, classes, and blocks
- **Color Provider**: Color highlighting and picker for color values in code
- **Definition Provider**: Go to definition support
- **Formatting Provider**: Code formatting according to Clarion conventions
- **Clarion Decorator**: Provides highlighting for various Clarion code elements:
  - **Variable Prefix Highlighting**:
    - Scans documents for variables with configured prefixes (e.g., LOCS:MyVar, GLOS:CustomerName)
    - Supports advanced styling options including colors, font styles, backgrounds, and decorations
    - Applies styles directly from the `clarion.prefixHighlighting` configuration
  - **Comment Pattern Highlighting**:
    - Scans documents for comment lines starting with configured patterns (e.g., `! TODO`, `! FIXME`)
    - Supports the same advanced styling options as variable prefix highlighting
    - Applies styles directly from the `clarion.commentHighlighting` configuration
  - Updates highlighting in real-time as documents or settings change

## Configuration Options

The extension provides several configuration options:

- **File Search Extensions**: Configure which file extensions are included in searches
- **Default Lookup Extensions**: File extensions used for document linking and hover previews
- **Solution Settings**: Path to solution file, properties file, and selected configuration
- **Formatting Options**: Configure spacing for class and method names in snippets
- **Highlighting**: Configure styling for various Clarion code elements:
  ```json
  "clarion.highlighting": {
    // Enable/disable all highlighting features
    "enabled": true,
    
    // Variable prefix highlighting settings
    "prefix": {
      
      // Define prefixes with simple colors or advanced styling
      "patterns": {
        // Simple color
        "LOCS": "#ffffcc",
        
        // Advanced styling
        "GLOS": {
          "color": "#ccffff",
          "fontWeight": "bold",
          "backgroundColor": "#f0f0f0",
          "before": {
            "contentText": "→",
            "color": "#888888"
          },
          "after": {
            "contentText": "←",
            "color": "#888888"
          }
        }
      }
    },
    "comment": {
      
      // Define comment patterns with simple colors or advanced styling
      "patterns": {
        // Simple color
        "TODO": "#ff8c00",
        
        // Advanced styling
        "FIXME": {
          "color": "#ff0000",
          "fontWeight": "bold",
          "backgroundColor": "#fff0f0",
          "before": {
            "contentText": "⚠️ ",
            "color": "#ff0000"
          }
        }
      }
    }
  }
  ```
  Colors can be selected using VS Code's built-in color picker by clicking on the color values in the settings UI. Advanced styling options include font weight, font style, text decoration, background color, and before/after decorations.
  
  Any comment line starting with `!` followed by one of your defined patterns (with or without a space) will be highlighted with the specified styling.

## Integration

- **Redirection Support**: Full support for Clarion's redirection system
- **Build Task Integration**: Custom problem matchers for Clarion build output
- **Dependency**: Requires the fushnisoft.clarion extension for basic language support

## Location of Features

### Client-Side (extension.ts)

The client-side code handles:
- Extension activation and initialization
- UI components (Solution View, Structure View, status bar)
- Command registration and handling
- File system watchers
- Solution management
- Build task integration
- Clarion decorator for highlighting prefixed variables and comment patterns

### Server-Side (server.ts)

The language server handles:
- Document parsing and tokenization
- Symbol extraction
- Code formatting
- Folding range calculation
- Color detection
- Definition resolution

### Configuration (package.json)

The package.json file defines:
- Extension metadata
- Contributed commands
- UI components
- Keybindings
- Menus and context menus
- Configuration options
- Snippets