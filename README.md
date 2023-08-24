# clarion-extension README

Welcome to the README for the "clarion-extension" project!

## Features

The "clarion-extension" is designed as an addition to the [fushnisoft.clarion](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion) extension. It offers various snippets and code folding for efficient Clarion coding.

You can find a handy [Cheat Sheet here](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md). We also provide initial code folding, which will be expanded upon. A special thanks to [Mark Goldberg](https://github.com/MarkGoldberg) for his contribution.

Document Outline is supported, thanks to a generous contribution from [Allen Zhu](https://github.com/celeron533).

## Workspace Settings and Configuration

We've introduced helpful workspace settings and commands:

- **Command: Clarion Configure ClarionProperties.xml File**
  Use this command to configure the `ClarionProperties.xml` file for your workspace. To access the settings:

  1. Go to "File" > "Preferences" > "Settings".
  2. Search for "clarion" to find the workspace settings related to the extension.
  3. Manually edit the settings or use the provided command to configure them.

- **Command: Clarion Select Application Solution File**
  This command assists in selecting your application's solution file.

  To activate these commands:
  
  1. Press `Ctrl + Shift + P` (or `Cmd + Shift + P` on macOS) to open the command palette.
  2. Search for "Clarion" to see the available commands.
  3. Select the desired command to execute.

Please ensure that you have a workspace set up and the required settings configured for the extension's features to work as intended.

## Go To Definition for Included Files

**This requires the settings described above to work**

A standout feature of this extension is the enhanced "Go To Definition" functionality. It smartly handles `INCLUDE('FileName.clw')` or `Class MODULE('FileName.clw')` statements. The extension uses your Redirection file logic to locate and open the specified file in the editor, regardless of whether it's in the workspace or not.

## Getting Started

To maximize the "clarion-extension," ensure you have the VS Code extension for Clarion installed. You can obtain it [from the marketplace](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion) or directly within Visual Studio Code.

## Contributing and Feedback

As the "clarion-extension" project is in beta, we eagerly welcome your feedback and contributions. If you encounter issues or have improvement ideas, please don't hesitate to share them. Together, we can refine and enhance this extension to better serve Clarion developers.

## Acknowledgments

This extension builds upon the groundwork laid by [Mark Goldberg](https://github.com/MarkGoldberg) for code folding, and benefits from the contributions of [Allen Zhu](https://github.com/celeron533) for Document Outline support.

We also acknowledge the invaluable contribution of **Brahn Partridge**, who passed away in October 2021. A great friend and contributor to the Clarion community, Brahn's early work on the textmate language definition laid the foundation for this extension. Without his efforts, this extension would not have been possible.

## Additional Resources

For quick reference, consult the [Cheat Sheet](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md) to unlock the full potential of the extension.

Thank you for choosing the "clarion-extension." Happy coding!


