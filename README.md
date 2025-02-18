# clarion-extension README  
## Version 0.4.10  

Welcome to the README for the **Clarion Extension** project!  

## Features  

The **Clarion Extension** enhances the functionality of the [Fushnisoft Clarion Extension](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion). It provides snippets, code folding, and other productivity tools for Clarion development in VS Code.  

For a quick reference, check out the [Cheat Sheet](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md).  

A special thanks to [Mark Goldberg](https://github.com/MarkGoldberg) for his contributions to code folding and [Allen Zhu](https://github.com/celeron533) for Document Outline support.  

---

## ⚠️ Beta Release Notice  
This extension is still considered **beta quality**. If you encounter any issues, please report them at:  
[GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)

---

## 🚀 What's New in Version 0.4.2?  

### 🔧 **Improvements and Bug Fixes**  
- **Substantial bug fixes** to **redirection parsing**, ensuring improved accuracy when locating files.  
- **Ctrl+P now respects redirection files** by searching both **project-specific** redirection files and the **global** redirection file specified in `ClarionProperties.xml`.  
- **Build Configuration Support:**  
  - Added the ability to **switch between Release and Debug builds** using the new command:  
    **Clarion: Set Configuration** (accessible via **Ctrl+Shift+P**).  
  - This setting is **obeyed in redirection parsing**, ensuring the correct configuration is used when resolving paths.  
  - Default configuration: **Release**.  
- **Solution Explorer Icons:**  
  - The **Solution View now includes icons** for better visual organization and navigation.  

---

## 🛠 Opening a Clarion Solution in VS Code  

Since version **0.4.0**, the process of opening a Clarion solution in **Visual Studio Code** has been streamlined.  

### **Opening a Solution Without a Workspace**  

1. **Open the Solution Folder**  
   - In **Visual Studio Code**, open the **root folder** where your **Clarion solution (.sln) file** is located.  

2. **Select the Clarion Properties File**  
   - Open the **Command Palette** (**Ctrl+Shift+P**).  
   - Search for **"Clarion: Open Solution"** and select it.  
   - Choose the `ClarionProperties.xml` file from:  
     **%appdata%\SoftVelocity\ClarionVersion\ClarionProperties.xml**  

3. **Select the Clarion Version**  
   - After selecting the properties file, choose the **Clarion version** used for **generation and compilation**.  
   - This ensures the correct **redirection files** and **build settings** are applied.  

4. **(Optional) Save the Workspace**  
   - Once the solution is loaded in **VS Code**, saving the workspace allows for quick reloading in the future.  

---

## Features of the Clarion Extension  

### 📌 **Automatic Solution Parsing**  
Once a solution is opened, the extension:  
- Parses the **solution file** to detect all **projects**.  
- Reads **redirection files** (including **local redirection** files).  
- Builds an internal map of **search paths** for **Go To Definition**, **Hover Previews**, and the **Solution Explorer View**.  

### 📂 **Solution Explorer View**  
- Provides an **Explorer Panel view** of the Clarion solution.  
- Displays **projects and source files** in a structured tree.  
- Now includes **icons for better organization**.  

### 🔍 **Enhanced "Go To Definition"**  
- Supports **INCLUDE and MODULE statements**.  
- Automatically detects files via **redirection paths and libsrc paths**.  
- **Ctrl+Click** or **Ctrl+F12** opens the referenced file.  

### ✨ **Hover Provider**  
- Hovering over an **INCLUDE** or **MODULE** statement shows a **preview** of the file’s content.  

### 💪 **Configurable Build Type (New in 0.4.4!)**  
- Change between **Release** and **Debug** builds using:  
  **"Clarion: Set Configuration"** from **Ctrl+Shift+P**.  
- Redirection parsing now respects the selected build configuration.  npm 

---

## ✅ Summary of Key Features  
✔ **Automatic solution structure detection**.  
✔ **Solution Explorer View with icons**.  
✔ **Go To Definition for INCLUDE & MODULE**.  
✔ **Hover Preview for referenced files**.  
✔ **Redirection-aware Ctrl+P searches**.  
✔ **Configurable Release/Debug builds**.  

With these enhancements, **VS Code** becomes an even more powerful **Clarion development environment**. 🚀  

---

## Getting Started  

To maximize the benefits of this extension:  
1. Ensure you have the **Fushnisoft Clarion Extension** installed from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion).  
2. Follow the **Opening a Clarion Solution** instructions to configure your workspace.  

---

## Contributing and Feedback  

This project is actively evolving, and we welcome feedback! If you encounter issues or have suggestions, please contribute on [GitHub](https://github.com/msarson/Clarion-Extension).  

---

## Acknowledgments  

This extension builds upon the work of:  
- [Mark Goldberg](https://github.com/MarkGoldberg) – Code folding.  
- [Allen Zhu](https://github.com/celeron533) – Document Outline support.  
- **Brahn Partridge** (1974-2021) – Early work on textmate language definition, which laid the foundation for this extension.  

---

## Additional Resources  

📚 **[Cheat Sheet](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md)** – Quick reference for features and usage.  

Thank you for using **Clarion Extension**! 🎉

