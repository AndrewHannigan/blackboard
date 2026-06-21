<div align="left">

# Blackboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/v/release/AndrewHannigan/blackboard?color=blue)](https://github.com/AndrewHannigan/blackboard/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/AndrewHannigan/blackboard/releases)
[![GitHub Downloads](https://img.shields.io/github/downloads/AndrewHannigan/blackboard/total?color=green)](https://github.com/AndrewHannigan/blackboard/releases)

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

## Installation
```
brew install --cask andrewhannigan/tap/blackboard
```

## Features

- **Clickable links** — URLs, emails, and phone numbers are auto-detected. ⌘+Click to open.
- **CLI integration** — Pipe anything to your blackboard with `echo "hello" | bb`. A local HTTP server syncs content instantly.
- **Sub-100ms startup** — No framework, no virtual DOM, no build step. Just vanilla JS over Electron. The window shows the moment it's ready.
- **Tabs** — Drag to reorder. Double-click to rename. Hidden until you need them.
- **Tab history** — Closed tabs live on. Hit ⌘⇧H to browse a grid of previews, click to restore.


