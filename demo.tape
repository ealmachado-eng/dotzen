Output "docs/assets/demo.gif"

Set FontSize 15
Set Width 1100
Set Height 1300
Set Padding 24
Set Theme "Dracula"

# Fast setup (hidden from the viewer).
# Pre-warm the npx cache with the EXACT visible command (same CWD + args)
# so the visible run hits a warm cache: no download, no warn, no prompt.
# Pre-warm uses --yes so the cold install doesn't hang on its own prompt.
Set TypingSpeed 0.01
Hide
Type "cd demo"
Enter
Type "PS1='$ '"
Enter
Type "export BAT_THEME=Dracula"
Enter
Type "alias bat='bat --paging=never'"
Enter
# npm 11's npx can re-install (and, on a TTY, prompt) even on a warm cache
# for range specs — auto-yes + quiet loglevel make the visible run clean
# regardless of cache state.
Type "export npm_config_yes=true npm_config_loglevel=error"
Enter
Type "npx --yes @erkos/pluvian@2 check >/dev/null 2>&1"
Enter
Sleep 30s
Type "clear"
Enter
Sleep 500ms
Show

# Visible demo
Set TypingSpeed 0.04

# 1. The Terraform infrastructure (DBs + internet route land at the bottom).
Type "bat -p --language=hcl terraform/main.tf"
Enter
Sleep 8s
Ctrl+l
Sleep 500ms

# 2. The governance rule (multi-hop graph layer).
Type "bat -p .pluvian/spec.ts"
Enter
Sleep 4s

# 3. The catch: public DB flagged, private DB clean.
# (--yes on-camera: npm 11's npx interactive "Ok to proceed?" prompt only
# honors the flag, not npm_config_yes — this keeps the visible run clean.)
Type "npx --yes @erkos/pluvian@2 check"
Sleep 500ms
Enter
Sleep 1s
Enter
Sleep 5s

Sleep 2s
