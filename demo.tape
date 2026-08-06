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
Type "cd /Users/ealmachado/projects/dotzen/demo"
Enter
Type "PS1='$ '"
Enter
Type "export BAT_THEME=Dracula"
Enter
Type "alias bat='bat --paging=never'"
Enter
Type "npx --yes @dotzen/dotzen@1 check >/dev/null 2>&1"
Enter
Sleep 10s
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
Type "bat -p .zen/spec.ts"
Enter
Sleep 4s

# 3. The catch: public DB flagged, private DB clean.
Type "npx @dotzen/dotzen@1 check"
Sleep 500ms
Enter
Sleep 1s
Enter
Sleep 5s

Sleep 2s
