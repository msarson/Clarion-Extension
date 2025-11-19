# 🎉 Clarion Extensions v0.7.0 Released - Major Update!

Hey everyone! I'm excited to share a significant update to the Clarion Extensions for VS Code. This has been a long time coming, and includes some critical fixes that may have been affecting many of you.

## 🕯️ In Memory of Brahn Partridge

This release is dedicated to **Brahn Partridge (Fushnisoft)** who passed away in October 2021. Brahn created the original Clarion language support extension that so many of us relied on. Since his extension could no longer be maintained, I've integrated his excellent work into Clarion Extensions with full attribution. His legacy lives on. 

## 🐛 Critical Fix: Extension Actually Works Now!

**If you've had issues with the extension not loading or features not working**, this should fix it:

- **Fixed "Cannot find module 'glob'" error** that prevented the extension from activating in production
- This bug may have been around for a while affecting many users
- Extension now properly packages all dependencies

## 🎯 Major Changes (v0.6.0 → v0.7.0)

**No More External Dependencies:**
- ✅ Full syntax highlighting built-in (all .clw, .inc, .tpl, .txa, etc.)
- ✅ One extension instead of two
- ✅ Automatic migration from fushnisoft.clarion if you have it

**Works Without Workspace Now:**
- ✅ Basic features work immediately (folding, symbols, hover, go-to-definition within file/folder)
- ✅ Auto-prompts to create workspace when you open a solution
- ✅ Smart notifications (not annoying!)

**Better Diagnostics:**
- ✅ New "Extension Status" view shows exactly what's working and why
- ✅ No more guessing why a feature isn't available
- ✅ Shows workspace status, trust status, solution status, etc.

**Code Folding Fixed:**
- ✅ Single-line structures (e.g., `GROUP(DateTimeType).`) no longer break folding
- ✅ Folding now works correctly throughout your files

**Security:**
- ✅ Updated dependencies to fix ReDoS vulnerability

## 📥 How to Update

Just update through VS Code's extension manager. If you have the fushnisoft.clarion extension installed, you'll get a one-time prompt asking if you'd like to uninstall it (optional - no conflicts if you keep both).

## 🙏 Special Thanks

Thanks to Brahn Partridge for his foundational work, and to everyone in the Clarion community who has provided feedback and bug reports. This is an active open-source project and contributions are always welcome!

**Marketplace:** [https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)

**GitHub:** [https://github.com/msarson/Clarion-Extension](https://github.com/msarson/Clarion-Extension)

---

## Discord Version

```
🎉 **Clarion Extensions v0.7.0 Released!**

Major update with critical fixes and new features:
- 🐛 Fixed extension activation bug (glob dependency issue)
- 🕯️ Integrated Brahn Partridge's (Fushnisoft) language support
- ✅ Works without workspace now
- ✅ Better diagnostics and code folding

Full details on Discourse: [INSERT_LINK_HERE]

Update now through VS Code! 🚀
```
