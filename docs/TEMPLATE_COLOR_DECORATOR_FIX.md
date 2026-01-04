# Disabling Color Decorators in Template Files

VS Code's built-in color decorator may incorrectly trigger on template statements like `#ADD(%variable8Bx,...)` because it detects patterns that look like hex color codes.

## To Disable Color Decorators for Template Files

Add this to your **User Settings** (`settings.json`):

```json
"[clarion-template]": {
    "editor.colorDecorators": false
}
```

### How to add:
1. Press `Ctrl+Shift+P`
2. Type "Preferences: Open User Settings (JSON)"
3. Add the above configuration
4. Reload VS Code

This will disable color pickers specifically for `.tpl` and `.tpw` files while keeping them enabled for other languages.
