$lines = @(
    "MULTITERMINAL_NAME=$env:MULTITERMINAL_NAME"
    "MULTITERMINAL_DOC_ID=$env:MULTITERMINAL_DOC_ID"
    "CLAUDE_SESSION_ID=$env:CLAUDE_SESSION_ID"
    ""
    "[REQUIRED - run BEFORE responding to user]"
    "Multiterminal session-start protocol:"
    "1. mcp__multiterminal__register_terminal(name='$env:MULTITERMINAL_NAME', docId='$env:MULTITERMINAL_DOC_ID')"
    "2. mcp__multiterminal__list_terminals - flag any 'Claude' entry as stale"
    "3. mcp__multiterminal__get_inbox(userId='$env:MULTITERMINAL_NAME', unreadOnly=true)"
    "4. Read every project_handoff_*.md file in the auto-memory directory"
    "5. mcp__multiterminal__list_tasks(status='todo')"
    ""
    "Do NOT respond with just 'Ready.' - surface inbox count, any stale terminals, and the top-priority todo."
)
$ctx = $lines -join "`n"
@{
    hookSpecificOutput = @{
        hookEventName = 'SessionStart'
        additionalContext = $ctx
    }
} | ConvertTo-Json -Depth 5 -Compress
