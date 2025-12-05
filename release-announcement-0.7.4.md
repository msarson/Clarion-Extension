# Clarion Extension v0.7.4 Release Announcements

## Discord Message

```
🎉 **Clarion Extension v0.7.4 Released!**

**Bug Fix:**
🐛 Fixed auto-reveal issue where Follow Cursor would steal focus from the editor - now only works when Structure View is visible

**⚠️ BREAKING CHANGE:**
Folder-based workflow introduced in v0.7.3 - workspace files (`.code-workspace`) are no longer used. If upgrading from v0.7.2 or earlier, please review the migration guide.

📚 **Documentation:**
• Getting Started: https://github.com/msarson/Clarion-Extension/blob/master/docs/getting-started.md
• Migration Guide: https://github.com/msarson/Clarion-Extension/blob/master/README.md#-breaking-changes-in-073
• Full Changelog: https://github.com/msarson/Clarion-Extension/blob/master/CHANGELOG.md

Available now on VS Code Marketplace! 🚀
```

## Discourse Post

### Title
```
Clarion Extension v0.7.4 Released - Focus Fix
```

### Body
```markdown
Hello Clarion Community! 👋

I'm pleased to announce the release of **Clarion Extension v0.7.4** for Visual Studio Code.

## 🐛 What's Fixed

**Follow Cursor Auto-Reveal Issue** - The extension was stealing focus from the editor when the "Follow Cursor" feature was enabled. This has been fixed - Follow Cursor now only activates when the Structure View pane is visible, preventing unwanted focus changes.

### Technical Details
The root cause was `treeView.reveal()` being called even when the Clarion Tools sidebar wasn't visible, bringing it into focus. Now the reveal only happens when you're actually viewing the Structure View, giving you the best of both worlds.

## ⚠️ Breaking Change from v0.7.3

If you're upgrading from **v0.7.2 or earlier**, please note that v0.7.3 introduced a **folder-based workflow**:

- **No more workspace files** (`.code-workspace`) - just open the folder containing your solution
- Settings are now stored in `.vscode/settings.json` within your solution folder
- Recent solutions are tracked globally for quick access

### Migration
Most users will experience automatic migration, but if you encounter issues:
1. Open the folder containing your Clarion solution
2. Let the extension detect your `.sln` file (or browse to select it)
3. Your settings will be saved in the folder's `.vscode/settings.json`

## 📚 Documentation

- [Getting Started Guide](https://github.com/msarson/Clarion-Extension/blob/master/docs/getting-started.md)
- [Migration Guide](https://github.com/msarson/Clarion-Extension/blob/master/README.md#-breaking-changes-in-073)
- [Full Changelog](https://github.com/msarson/Clarion-Extension/blob/master/CHANGELOG.md)
- [GitHub Repository](https://github.com/msarson/Clarion-Extension)

## 🚀 Installation

Available now on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extension)!

As always, feedback and bug reports are welcome on [GitHub Issues](https://github.com/msarson/Clarion-Extension/issues).

Happy coding! 🎊
```

---

## Twitter/X (if you use it)

```
🎉 Clarion Extension v0.7.4 is live!

🐛 Fixed: Follow Cursor no longer steals editor focus
⚠️ Note: v0.7.3 introduced folder-based workflow (breaking change)

Get it now: https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extension

Docs: https://github.com/msarson/Clarion-Extension

#Clarion #VSCode #Programming
```

---

## Quick Announcement (Short Version)

For quick channels/threads:

```
📢 Clarion Extension v0.7.4 released!

Fixed the auto-reveal focus issue with Follow Cursor. Note: v0.7.3 introduced breaking changes (folder-based workflow).

Docs: https://github.com/msarson/Clarion-Extension
Marketplace: https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extension
```
