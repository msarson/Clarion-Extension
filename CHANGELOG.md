# Change Log
All notable changes to the "clarionsnippets" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Initial release
## [0.0.1]
- Initial release, including a few snippets to get started
## [0.0.2]
- Corrected ICON Issue
## [0.0.3]
- Fixed README.md
## [0.1.0]
- Large refactor of code
- Added Procedure Reference Variables
- New Definitions for Classes, Procedures and More
- Added MS Build task snippet to compile code from within VS Code.
## [0.1.1]
- Fixes to documentation 
- Fixes to Procedure Reference Vars
## [0.1.2]
- Added extension dependenceis on "fushnisoft.clarion"
## [0.2.0]
- Added pragrammatic code folding
## [0.2.1]
  Security update detected by GitHub dependabot.
## [0.2.2]
  12 May 2021 - Updated to latest packages.  
## [0.2.5]
  13 September 2021 - Thanks to the kind contribution of Allen Zhu who has provided a document outline addition. Ctrl+Shift+O 
# Change Log
All notable changes to the "clarionsnippets" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Initial release
## [0.0.1]
- Initial release, including a few snippets to get started
## [0.0.2]
- Corrected ICON Issue
## [0.0.3]
- Fixed README.md
## [0.1.0]
- Large refactor of code
- Added Procedure Reference Variables
- New Definitions for Classes, Procedures and More
- Added MS Build task snippet to compile code from within VS Code.
## [0.1.1]
- Fixes to documentation 
- Fixes to Procedure Reference Vars
## [0.1.2]
- Added extension dependenceis on "fushnisoft.clarion"
## [0.2.0]
- Added pragrammatic code folding
## [0.2.1]
  Security update detected by GitHub dependabot.
## [0.2.2]
  12 May 2021 - Updated to latest packages.  
## [0.2.5]
  13 September 2021 - Thanks to the kind contribution of Allen Zhu who has provided a document outline addition. Ctrl+Shift+O
## [0.3.0]
  24 August 2023
### Added

- Enhanced "Go To Definition" functionality for included files (`INCLUDE('FileName.clw')` or class`MODULE('FileName.clw')`). The extension uses the Redirection file logic to locate and open the specified file in the editor, regardless of whether it's in the workspace or not.

- Workspace settings and commands:
  - **Command: Clarion Configure ClarionProperties.xml File**
    Use this command to configure the `ClarionProperties.xml` file for your workspace. Access settings via "File" > "Preferences" > "Settings".
  - **Command: Clarion Select Application Solution File**
    This command assists in selecting your application's solution file.

### Changed

- Updated documentation and README with detailed usage instructions for the new features.

### Fixed

- Various fixes based on GitHub Dependabot updates.

### Acknowledgments

- Added acknowledgment of the contribution of **Brahn Partridge**, who passed away in October 2021. Brahn's early work on the textmate language definition was instrumental in making this extension possible.
- ## [0.3.2]
- Unreleased
- ## [0.3.3]
  26 August 2023
### Fixes

- The redirection parsing could fail on local files.

### New Features
### Go To Definition for Included Files

**This requires the settings described above to work**

The "clarion-extension" now includes an advanced feature that enhances the "Go To Definition" functionality for `INCLUDE` and `MODULE` statements. With the new link provider and hover provider, the extension intelligently handles these statements and provides a more informative experience.

Here's how it works:

- When you use an `INCLUDE('FileName.clw')` or `Class MODULE('FileName.clw')` statement, the extension will check the Clarion workspace settings to locate the specified file.

- If the file is found based on the settings, VS Code will highlight the file name by underlining it to indicate that it was found.

- When you hover your mouse over the underlined link, a hover will appear displaying the first few lines of the code from the linked file.

- For `INCLUDE` statements with sections, such as `INCLUDE('myFile.clw', 'SectionName')`, hovering over the section name will display the first few lines at that specific section location.

To open the linked file directly:
- **Ctrl+Click** on the underlined link.
- Or, press **Ctrl+F12** to open the file.

Please note that the previous functionality of this feature has been removed in favor of this more streamlined and informative experience.

Make sure to have your workspace settings configured as described above to enable this feature.

## [0.3.4]
### Fixes
Activation could try to take place even if workspace not trusted

### Optomisations
Only parse RED entries for CLW INC and EQU files.

## [0.3.5]

##Fixes
Bug introduced where the commands couldn't be found