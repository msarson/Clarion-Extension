# clarion-extensions README

This is the README for the extension "clarion-extension". 

## Features

This extension is desigend to be used as an addition to the [fushnisoft.clarion](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion) extension.

The extension provides various snippets and code folding for use coding in clarion..

A cheat sheat [can be found here](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md)

Codefolding is provided using a language client developed in typescript using vs code programmatic language features.
    
## Requirements

This extension require the VS Code extension for Clarion, this can either be downloaded from the [market place](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion) or directly from within the Visual Studio Code IDE

## Build and Create Package

Make sure you have "Visual Studio Code Extensions" CLI installed
```
npm install -g vsce
```
Then run
```
vsce package
```
You will have `clarion-extensions-*.vsix` in project's folder.