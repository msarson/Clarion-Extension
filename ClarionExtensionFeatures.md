# Clarion Extension Features

This document provides an overview of the features available in the Clarion Extension for Visual Studio Code.

## Table of Contents

- [General Information](#general-information)
- [Core Features](#core-features)
  - [Solution Management](#solution-management)
  - [Code Navigation and Structure](#code-navigation-and-structure)
  - [Code Editing and Formatting](#code-editing-and-formatting)
  - [Build Integration](#build-integration)
  - [File Management](#file-management)
- [UI Components](#ui-components)
  - [Activity Bar and Views](#activity-bar-and-views)
  - [Context Menus](#context-menus)
  - [Status Bar](#status-bar)
- [Language Server Features](#language-server-features)
- [Configuration Options](#configuration-options)
  - [Highlighting Configuration Reference](#highlighting-configuration-reference)
    - [Configuration Structure](#configuration-structure)
    - [Global Options](#global-options)
    - [Styling Options](#styling-options)
    - [Variable Prefix Highlighting](#variable-prefix-highlighting)
    - [Comment Pattern Highlighting](#comment-pattern-highlighting)
    - [Examples](#examples)
    - [Tips and Best Practices](#tips-and-best-practices)
- [Integration](#integration)
- [Location of Features](#location-of-features)
  - [Client-Side](#client-side-extensionts)
  - [Server-Side](#server-side-serverts)
  - [Configuration](#configuration-packagejson)

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
- **Go to Definition (F12)**: Navigate to symbol definitions
  - Local variables: Jump from usage to declaration in DATA section
  - Parameters: Jump to parameter definition in procedure/method signature
  - Class members: Jump from `self.property` or typed variable access to class definition in INCLUDE files
  - Method implementations: F12 on method implementation line navigates to CLASS declaration
  - Supports parameters with default values
  - Scope-aware within current procedure/method
  - Automatically resolves INCLUDE files using solution-wide redirection
- **Go to Implementation (Ctrl+F12)**: Navigate to implementations
  - Methods: Jump to method implementation
  - Routines: Jump to routine implementation from DO statements
- **Document Symbols**: Outline view of the current document's structure
- **Enhanced Hover Information**: Intelligent hover displays with rich context
  - **Method implementations**: Shows up to 15 lines of actual implementation code after the CODE statement
    - Works for both method declarations and method calls (e.g., `self.SetLength(...)`)
    - Includes clickable line number link to navigate directly to implementation
    - Displays keyboard shortcut hint (Ctrl+F12) for quick navigation
    - Smart boundary detection stops before nested methods/routines
    - Parameter-aware matching for method calls
    - Only triggers on method name, not on parameters inside parentheses
  - **Local variables**: Shows type, declaration location, and navigation hint
  - **Parameters**: Shows type, parameter name, and declaring procedure
  - **Class members**: Shows property/method distinction, full type with attributes, class name, and file location
    - Displays full type declaration including PRIVATE, name(), etc.
    - Shows declaring file and line number
    - Long types displayed in code block for readability
  - **Method implementation lines**: Hover on method implementation shows declaration signature with return type
    - Displays full declaration from CLASS definition
    - Shows declaring file and line number
    - F12 navigation hint to jump to declaration
  - **Routines**: Preview of routine code with navigation link
- **Routine Navigation**: Complete navigation support for routines in DO statements
  - Hover over routine names in DO statements to see code preview
  - Ctrl+F12 or click hover link to navigate to routine implementation
  - Shows up to 10 lines of code preview starting from the routine
  - Scope-aware navigation prioritizes routines within current procedure

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
          },
          "after": {
            "contentText": " ⚠️",
            "color": "#ff0000"
          }
        }
      }
    }
  }
  ```
  Colors can be selected using VS Code's built-in color picker by clicking on the color values in the settings UI. Advanced styling options include font weight, font style, text decoration, background color, and before/after decorations.
  
  Any comment line starting with `!` followed by one of your defined patterns (with or without a space) will be highlighted with the specified styling.

### Highlighting Configuration Reference

The `clarion.highlighting` configuration provides a powerful and flexible way to customize how Clarion code elements are displayed in the editor. Below is a detailed reference of all available options:

#### Configuration Structure

```json
"clarion.highlighting": {
  "enabled": true,              // Master switch for all highlighting features
  "prefix": {                   // Variable prefix highlighting settings
    "patterns": {               // Define prefixes to highlight
      "PREFIX1": "#color",      // Simple color definition
      "PREFIX2": { ... }        // Advanced styling options
    }
  },
  "comment": {                  // Comment highlighting settings
    "patterns": {               // Define comment patterns to highlight
      "PATTERN1": "#color",     // Simple color definition
      "PATTERN2": { ... }       // Advanced styling options
    }
  }
}
```

#### Global Options

- **enabled** (boolean): Master switch to enable or disable all highlighting features
  - `true`: All highlighting features are enabled (default)
  - `false`: All highlighting features are disabled

#### Styling Options

Both prefix and comment patterns support the following styling options:

##### Simple Color Definition

The simplest form is to specify just a color:

```json
"LOCS": "#ffffcc"
```

This will change the text color of the matched pattern to the specified color.

##### Advanced Styling Object

For more control, you can use an object with the following properties:

```json
"GLOS": {
  "color": "#ccffff",                // Text color
  "backgroundColor": "#f0f0f0",      // Background color
  "fontWeight": "bold",              // Font weight: "normal" or "bold"
  "fontStyle": "italic",             // Font style: "normal" or "italic"
  "textDecoration": "underline",     // Text decoration: "none", "underline", "line-through", or "overline"
  "before": {                        // Content to insert before the match
    "contentText": "→",              // Text to insert
    "color": "#888888"               // Color of the inserted text
  },
  "after": {                         // Content to insert after the match
    "contentText": "←",              // Text to insert
    "color": "#888888"               // Color of the inserted text
  }
}
```

###### Text Styling Properties

- **color** (string): The text color in CSS format (hex, rgb, rgba, hsl, etc.)
- **backgroundColor** (string): The background color in CSS format
- **fontWeight** (string): The font weight, can be "normal" or "bold"
- **fontStyle** (string): The font style, can be "normal" or "italic"
- **textDecoration** (string): The text decoration, can be "none", "underline", "line-through", or "overline"

###### Before/After Decorations

The `before` and `after` properties allow you to insert content before or after the matched text:

- **contentText** (string): The text to insert
- **color** (string): The color of the inserted text

#### Variable Prefix Highlighting

The `prefix.patterns` object defines which variable prefixes should be highlighted and how:

```json
"prefix": {
  "patterns": {
    "LOCS": "#ffffcc",        // Highlight LOCS:Variable in yellow
    "GLOS": { ... },          // Advanced styling for GLOS:Variable
    "PROP": "#aaffaa"         // Highlight PROP:Variable in green
  }
}
```

- Each key in the `patterns` object is a prefix (without the colon)
- The extension will highlight any variable with the format `PREFIX:Name`
- The highlighting is applied to the entire variable (prefix and name)

#### Comment Pattern Highlighting

The `comment.patterns` object defines which comment patterns should be highlighted and how:

```json
"comment": {
  "patterns": {
    "TODO": "#ff8c00",        // Highlight "! TODO" comments in orange
    "FIXME": { ... },         // Advanced styling for "! FIXME" comments
    "NOTE": "#aaaaff"         // Highlight "! NOTE" comments in light blue
  }
}
```

- Each key in the `patterns` object is a pattern to match in comment lines
- The extension will highlight any comment line starting with `!` followed by the pattern
- The highlighting is applied from the pattern to the end of the line

#### Examples

##### Example 1: Simple Color Highlighting

```json
"clarion.highlighting": {
  "prefix": {
    "patterns": {
      "LOCS": "#ffffcc",
      "GLOS": "#ccffff",
      "PROP": "#aaffaa"
    }
  },
  "comment": {
    "patterns": {
      "TODO": "#ff8c00",
      "FIXME": "#ff0000",
      "NOTE": "#aaaaff"
    }
  }
}
```

##### Example 2: Advanced Styling for Important Elements

```json
"clarion.highlighting": {
  "prefix": {
    "patterns": {
      "LOCS": "#ffffcc",
      "GLOS": {
        "color": "#ccffff",
        "fontWeight": "bold",
        "backgroundColor": "#f0f0f0",
        "before": {
          "contentText": "→",
          "color": "#888888"
        }
      }
    }
  },
  "comment": {
    "patterns": {
      "TODO": "#ff8c00",
      "FIXME": {
        "color": "#ff0000",
        "fontWeight": "bold",
        "backgroundColor": "#fff0f0",
        "before": {
          "contentText": "⚠️ ",
          "color": "#ff0000"
        },
        "after": {
          "contentText": " ⚠️",
          "color": "#ff0000"
        }
      }
    }
  }
}
```

##### Example 3: Using Text Decorations

```json
"clarion.highlighting": {
  "prefix": {
    "patterns": {
      "LOCS": {
        "color": "#ffffcc",
        "textDecoration": "underline"
      },
      "GLOS": {
        "color": "#ccffff",
        "textDecoration": "underline dotted"
      }
    }
  },
  "comment": {
    "patterns": {
      "DEPRECATED": {
        "color": "#ff0000",
        "textDecoration": "line-through",
        "fontStyle": "italic"
      }
    }
  }
}
```

#### Tips and Best Practices

1. **Use Color Picker**: Click on any color value in the settings UI to use VS Code's built-in color picker
2. **Consistent Color Scheme**: Use a consistent color scheme for related prefixes or patterns
3. **Avoid Overuse**: Too many different styles can make the code harder to read
4. **Consider Contrast**: Ensure good contrast between text and background colors
5. **Use Icons Sparingly**: Before/after decorations with icons can be helpful for important patterns like warnings, but overuse can clutter the editor
6. **Test in Different Themes**: Your highlighting may look different in light vs. dark themes

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