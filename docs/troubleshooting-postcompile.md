# Troubleshooting PostCompile.CMD Not Running

## Overview
PostCompile.CMD (or PostBuildEvent) is controlled by MSBuild, not the VS Code extension. It only runs when MSBuild considers the build **successful**.

## Why PostCompile Doesn't Run

From your build log, we can see:
- MSBuild exit code was **non-zero** (build failed)
- 0 warnings, 0 errors shown in terminal
- But 29 problems appear in Problems panel
- Red error flash at start about FileLogger syntax

## The Issue
MSBuild thinks the build failed (hence no PostCompile), but the actual compilation succeeded. This mismatch happens because:

1. **FileLogger syntax error** - The red flash at start means MSBuild had trouble with the logging configuration
2. **Conditional OMIT/COMPILE file definitions** - These are causing validation warnings that MSBuild may be treating as errors

## Solution 1: Check Your .cwproj File

Open your `.cwproj` file and look for the `<PostBuildEvent>` section. You can configure it to run even on failures:

```xml
<PostBuildEvent>
  <Command>PostCompile.cmd</Command>
  <ExecuteOn>Always</ExecuteOn>  <!-- Options: OnSuccess, OnError, Always -->
</PostBuildEvent>
```

Or in PropertyGroup:
```xml
<PropertyGroup>
  <PostBuildEvent>PostCompile.cmd</PostBuildEvent>
  <RunPostBuildEvent>Always</RunPostBuildEvent>  <!-- Options: OnBuildSuccess, OnOutputUpdated, Always -->
</PropertyGroup>
```

## Solution 2: Disable File Logger Temporarily

The extension uses a file logger to capture build output. Try disabling it temporarily:

1. Open VS Code Settings (Ctrl+,)
2. Search for "clarion build"
3. Change `Clarion: Build > Reveal Output` to **"always"**
4. Change `Clarion: Build > Show In Output Panel` to **checked**
5. Build again and check if PostCompile runs

## Solution 3: Check OMIT/COMPILE Issues

The 29 problems related to conditional OMIT/COMPILE file definitions need investigation:

1. Open the Problems panel (Ctrl+Shift+M)
2. Look at the specific errors
3. These might be false positives from the language server validation
4. Share the exact error messages so we can fix the validation logic

## Getting More Information

To help us diagnose, please:

1. **Enable verbose build output:**
   - Settings → Search "clarion build"
   - Check `Clarion: Build > Show In Output Panel`
   - Check `Clarion: Build > Preserve Log File`
   
2. **Build again** and collect:
   - The `build_output.log` file from your solution directory
   - Screenshot of the Problems panel showing the 29 errors
   - The exact red error message that flashes (you may need to record screen)

3. **Check if PostBuild would run:**
   - Open terminal in your solution directory
   - Run: `msbuild YourProject.cwproj /t:build /p:Configuration=Debug`
   - See if PostCompile.cmd runs with direct MSBuild

## Workaround

Until this is fixed, you can:
1. Run PostCompile.cmd manually after builds
2. Create a VS Code task that runs both build and PostCompile
3. Add the PostCompile logic directly in the build process

## Next Steps

Based on the red FileLogger error you're seeing, we need to:
1. Fix the FileLogger command line syntax in the extension
2. Investigate why OMIT/COMPILE structures trigger false validation errors
3. Possibly add a setting to run PostCompile commands from the extension itself
