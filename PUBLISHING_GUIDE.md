# Publishing Guide for Clarion Extensions

This guide walks you through publishing the extension to the VS Code Marketplace using GitHub Actions.

## Prerequisites

You need two things:
1. **VS Code Marketplace Personal Access Token (PAT)** - To publish to marketplace
2. **GitHub Actions Secret** - To store the token securely

---

## Step 1: Get Your VS Code Marketplace Token

### A. Check if you already have a token

If you published v0.5.6 in April 2025, you might already have a valid token!

**To check:**
1. Go to: https://dev.azure.com/msarson/_usersSettings/tokens
   (Replace `msarson` with your Azure DevOps username if different)
2. Look for an existing token named something like "vscode-publish" or "marketplace"
3. If you find one that's still valid (not expired), **use that token** and skip to Step 2

### B. Create a new token (if needed)

If you don't have a token or it expired:

1. **Sign in to Azure DevOps**:
   - Go to: https://dev.azure.com
   - Sign in with the Microsoft account associated with your VS Code publisher (msarson)

2. **Create a Personal Access Token**:
   - Click your profile icon (top right) → **User settings** → **Personal access tokens**
   - Or go directly to: https://dev.azure.com/msarson/_usersSettings/tokens
   
3. **Click "New Token"**:
   - **Name**: `vscode-marketplace-publish` (or any name you'll remember)
   - **Organization**: Select your organization (or "All accessible organizations")
   - **Expiration**: Choose expiration (recommend 90 days or custom)
   - **Scopes**: Click "Show all scopes" and select:
     - ✅ **Marketplace** → **Manage** (this is the important one!)
   
4. **Click "Create"**:
   - ⚠️ **IMPORTANT**: Copy the token immediately! It won't be shown again.
   - Save it temporarily in a secure location (you'll add it to GitHub next)

---

## Step 2: Add Token to GitHub Secrets

Now add the token to your GitHub repository:

1. **Go to your repository settings**:
   - https://github.com/msarson/Clarion-Extension/settings/secrets/actions

2. **Create a new secret**:
   - Click **"New repository secret"**
   - **Name**: `VSCE_PAT` (must be exactly this - the workflow expects it)
   - **Secret**: Paste the token you copied from Azure DevOps
   - Click **"Add secret"**

---

## Step 3: Publish Using GitHub Actions

Now you're ready to publish!

### Option A: Publish Current Version (v0.5.8)

1. Go to: https://github.com/msarson/Clarion-Extension/actions/workflows/publish-extension.yml

2. Click **"Run workflow"** (top right)

3. Leave **"Version to publish"** empty (it will use v0.5.8 from package.json)

4. Click **"Run workflow"**

5. Watch it run! It will:
   - ✅ Build the extension
   - ✅ Package it as a .vsix file
   - ✅ Publish to VS Code Marketplace
   - ✅ Create a GitHub release (v0.5.8)
   - ✅ Upload the .vsix to the release

### Option B: Publish a Different Version

1. Go to: https://github.com/msarson/Clarion-Extension/actions/workflows/publish-extension.yml

2. Click **"Run workflow"**

3. Enter a version number like `0.5.9` in **"Version to publish"**

4. Click **"Run workflow"**

---

## Step 4: Manual Publishing (Alternative)

If the GitHub Action doesn't work or you prefer manual control:

### A. Install vsce (one-time)
```bash
npm install -g @vscode/vsce
```

### B. Login to marketplace (one-time)
```bash
vsce login msarson
```
- It will ask for your Personal Access Token
- Paste the token from Step 1

### C. Publish
```bash
# Make sure you're on master with latest changes
git pull origin master

# Build
npm run compile

# Publish (this uses the version from package.json)
vsce publish
```

Or build and publish manually:
```bash
# Package only (creates .vsix file)
vsce package

# Then publish the .vsix
vsce publish clarion-extensions-0.5.8.vsix
```

---

## Troubleshooting

### "Authentication failed" or "401 Unauthorized"
- Your token might be expired or invalid
- Go back to Step 1 and create a new token
- Update the GitHub secret in Step 2

### "Publisher 'msarson' not found"
- Make sure you're signed in with the correct Microsoft account
- Verify your publisher name at: https://marketplace.visualstudio.com/manage/publishers/msarson

### "This extension is already published"
- You're trying to publish a version that already exists
- Either:
  - Bump the version in package.json
  - Or use the workflow with a new version number

### Workflow fails on "Create GitHub Release"
- We already created the v0.5.8 release manually earlier
- The workflow might fail at this step (that's okay!)
- The important part (publishing to marketplace) should still work
- You can:
  - Ignore the error (extension is published)
  - Or comment out the GitHub Release steps in the workflow

---

## Current Status

✅ **Token needed**: VSCE_PAT (Personal Access Token)  
✅ **Workflow ready**: `.github/workflows/publish-extension.yml`  
✅ **Version ready**: v0.5.8 in package.json  
✅ **Release created**: v0.5.8 tag already exists on GitHub

---

## Quick Reference

**VS Code Marketplace**: https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions  
**Azure DevOps Tokens**: https://dev.azure.com/msarson/_usersSettings/tokens  
**GitHub Secrets**: https://github.com/msarson/Clarion-Extension/settings/secrets/actions  
**GitHub Actions**: https://github.com/msarson/Clarion-Extension/actions/workflows/publish-extension.yml  
**Publisher Management**: https://marketplace.visualstudio.com/manage/publishers/msarson

---

## Notes

- The workflow is set to **manual trigger only** (`workflow_dispatch`)
- It won't run automatically on push or merge
- You control exactly when to publish
- The token should be kept secret and rotated periodically (every 90 days recommended)

---

**Last Updated**: November 17, 2025  
**Current Version**: v0.5.8
