# clarion-extension README
## Version 0.4.0

Welcome to the README for the "clarion-extension" project!

## Features

The "clarion-extension" is designed as an addition to the [fushnisoft.clarion](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion) extension. It offers various snippets and code folding for efficient Clarion coding.

You can find a handy [Cheat Sheet here](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md). We also provide initial code folding, which will be expanded upon. A special thanks to [Mark Goldberg](https://github.com/MarkGoldberg) for his contribution.

Document Outline is supported, thanks to a generous contribution from [Allen Zhu](https://github.com/celeron533).

## Workspace Settings and Configuration

### Opening a Clarion Solution in VS Code (Version 4.0)

In version **4.0**, we have simplified the process of opening a Clarion solution in **Visual Studio Code**.

> **NOTE:** Workspace settings from earlier versions have been **deprecated**.

### How It Works (Opening a Solution Without a Workspace)

1. **Open the Solution Folder**  
   - In **Visual Studio Code**, open the **root folder** where your **Clarion solution (.sln) file** is located.

2. **Select the Clarion Properties File**  
   - Press `Ctrl+Shift+P` to open the **Command Palette**.
   - Search for **"Clarion: Open Solution"** and select it.
   - A **file dialog** will appear, prompting you to select the **ClarionProperties.xml** file in use.
   - This file is typically located in:  
     **`%appdata%\SoftVelocity\ClarionVersion\ClarionProperties.xml`**

3. **Select the Clarion Version**  
   - After selecting the properties file, another dialog will appear asking you to **select the Clarion version** that the solution is using for **generation and compilation**.
   - This ensures the correct **redirection files** and **build settings** are applied.

4. **Workspace Configuration (Optional but Recommended)**  
   - Once the solution is loaded in **VS Code**, it is recommended to **save the workspace**.
   - This allows for quick access to the solution in the future without repeating the setup process.

---

## Features of the Clarion Extension

### 🛠 **Automatic Solution Parsing**
Once the solution is opened, the **Clarion Language Extension** automatically:
- Parses the **solution file** to detect all **projects**.
- Reads **redirection files** (including **local redirection** files).
- Builds an internal map of **search paths** where files in your projects should be located.

This enables various **advanced features** such as **Go To Definition**, **Hover Previews**, and the **Solution Explorer View**.

---

## 🖥 **Solution Explorer View**
- The extension provides a **Solution View** in VS Code's **Explorer Panel**.
- This allows you to **navigate your projects**, view **source files**, and open files **directly from the tree**.

---

## 🔍 **Enhanced "Go To Definition" Support**
The extension enhances **Go To Definition** for `INCLUDE` and `MODULE` statements with **intelligent link detection**.

### **Link Provider**
- When VS Code encounters statements like:
  ```clarion
  INCLUDE('FileName.clw')
  ```
  or  
  ```clarion
  Class MODULE('FileName.clw')
  ```
  - It **searches the redirection paths** and **libsrc paths**.
  - If the file is **found**, the filename will be **underlined**, indicating that VS Code has created a **clickable link**.

- You can **navigate** to the linked file using:
  - `Ctrl+Click` on the filename  
  - `Ctrl+F12` to open the file in **VS Code**.

---

## ✨ **Hover Provider**
- When hovering over an **INCLUDE** or **MODULE** statement, VS Code will display a **preview** of the file’s **starting content**.
- This allows you to **quickly inspect** the contents of a referenced file **without opening it**.

---

## 🔄 **Manual Solution Refresh**
### **Keeping the Solution Up-to-Date**
When working with **Clarion’s AppGen**, developers often:
- Add new projects.
- Remove or rename existing projects.
- Modify `cwproj` files.
- Change redirection file settings.

To ensure the **solution view** and **file links** remain accurate, you can **manually refresh the solution**.

### **How to Refresh the Solution**
1. Open the **Command Palette** (`Ctrl+Shift+P`).
2. Search for **"Clarion: Refresh Solution"**.
3. Select it to **reload the solution**.

**What This Does:**
- **Re-parses** the **solution file** (`.sln`) and all **projects** (`.cwproj`).
- **Updates the Solution Explorer View** with any **new, removed, or modified** files.
- Ensures **Go To Definition** and **Hover Previews** work correctly with any newly added files.

---

## 🚀 **Summary of Key Features**
✅ **Automatic detection of solution structure.**  
✅ **Solution Explorer View for easy file navigation.**  
✅ **Go To Definition for INCLUDE & MODULE statements.**  
✅ **Hover Preview for referenced files.**  
✅ **Manual solution refresh to sync changes.**  

With these features, **VS Code** becomes a powerful **Clarion development environment**. 🚀

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


