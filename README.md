<div align="center">


# Blackboard

Blackboard is a minimal scratchpad for code and thoughts.

There's no save mechanism. Text just persists between sessions.

Write a SQL snippet, draft a slack message, tweak a unix command, etc.

No startup menus.  
No exit confirmations.  
No "unsaved" dot.  
No syncing.  

Just a little blackboard that's always the way you left it.

<img src="assets/demo.gif" alt="Blackboard demo" width="70%">



</div>

## Install 

### Homebrew (MacOS)

1. Run `brew install --cask andrewhannigan/tap/blackboard`
2. Run this once in a terminal to bypass Gatekeeper
   ```bash
   xattr -cr /Applications/Blackboard.app
   ```
3. Open Blackboard

### Disk image installer (MacOS and Windows)
1. Download the latest `.dmg` from [Releases](https://github.com/AndrewHannigan/blackboard/releases)
2. Open the DMG and drag Blackboard to Applications
3. Run this once in a terminal to bypass Gatekeeper
   ```bash
   xattr -cr /Applications/Blackboard.app
   ```
4. Open Blackboard
