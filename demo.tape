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
# npm 11's npx can re-install range specs (and, on a TTY, interactively
# prompt) even on a warm cache. Ground-truthed with `script` (pseudo-TTY):
# npm_config_yes + loglevel=error keep the visible run pristine — no prompt,
# no "npm warn exec" line. The hidden pre-warm below is extra insurance.
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
# (Prompt suppression is the hidden `export npm_config_yes=true` above —
# ground-truthed via pseudo-TTY — so the visible command stays pristine.)
Type "npx @erkos/pluvian@2 check"
Sleep 500ms
Enter
Sleep 1s
Enter
Sleep 5s

Sleep 2s
