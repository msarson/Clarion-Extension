# Clarion Extension v0.7.2 Released 🎉

We're excited to announce version 0.7.2 of the Clarion VS Code Extension is now available on the Visual Studio Marketplace!

## What's New in 0.7.1/0.7.2

This release includes numerous improvements and new features developed over November and early December. Highlights include:

### Major Features
- **Solution Explorer Tree View** - Browse Clarion solutions (.sln) with a dedicated tree view showing applications, source files, and dependencies
- **Application Generation** - Right-click context menus to generate APPs using ClarionCl.exe (Generate All Applications or individual apps)
- **Enhanced Structure Support** - Improved handling of unlabeled GROUPs, nested structures, and QUEUE definitions
- **Better Diagnostics** - More accurate error detection for CASE statements, structure terminators, and syntax validation

### Language Server Improvements
- Fixed CASE statement validation (empty CASE blocks now valid)
- Improved EQUATE handling and constant resolution
- Better error messages and diagnostic positioning
- Performance optimizations for large files

### Developer Experience
- Comprehensive knowledge base for Clarion syntax rules
- Improved testing infrastructure
- Better handling of OMIT statements
- Various bug fixes and stability improvements

## Installation

Install directly from VS Code:
1. Open Extensions (Ctrl+Shift+X)
2. Search for "Clarion"
3. Click Install

Or download from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)

## Known Issues

Please report any issues on our [GitHub repository](https://github.com/msarson/Clarion-Extension/issues).

## Acknowledgments

Thanks to everyone who provided feedback and testing during development!

---

**Note:** Versions 0.7.1 and 0.7.2 were released in quick succession to address documentation updates. The functionality is identical between these versions.
