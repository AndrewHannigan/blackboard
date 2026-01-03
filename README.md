# Blackboard

Blackboard is the minimum text editor. 

It's for editing scratch text on the fly, and that's about it.

Text persists between sessions. 

Write a SQL snippet, draft a slack message, modify a unix command, etc.


No startup menus.  
No exit confirmations.  
No open/save.  
No donation requests.  
No formatting.  
No syncing.  

Just a little blackboard on your laptop.

<img src="assets/image.png" alt="Blackboard app screenshot" width="50%">

## Install (macOS)

### Binary
1. Download the latest `.dmg` from [Releases](https://github.com/AndrewHannigan/blackboard/releases)
2. Open the DMG and drag Blackboard to Applications
3. Run this once in a terminal to bypass Gatekeeper
   ```bash
   xattr -cr /Applications/Blackboard.app
   ```
4. Open Blackboard


### Homebrew

1. Run `brew install --cask andrewhannigan/tap/blackboard`
2. Run this once in a terminal to bypass Gatekeeper
   ```bash
   xattr -cr /Applications/Blackboard.app
   ```
3. Open Blackboard

## What it does

- Edits text
- Persists text between sessions

## What it doesn't do

- Save files
- Open files
- Format text
- Ask for donations
- Anything else


