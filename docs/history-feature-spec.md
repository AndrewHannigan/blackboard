# Tab History Feature - Technical Specification

## Overview

Add a "History" button to the lower-left corner of the application. When clicked, it opens a full-screen overlay showing all previously closed tabs as a grid of mini-preview windows with syntax highlighting, sorted by most recently closed first. Users can click any history item to restore it.

**Key concept**: Tabs and history entries are the same entity. A tab has a persistent identity—when closed, it appears in history; when restored, it's the same tab (same ID). Closing it again updates its history entry rather than creating a duplicate.

---

## User Interface

### History Button

- Location: Fixed position, bottom-left corner (separate from the status bar in bottom-right)
- Appearance: Small button labeled "history" matching the existing UI style (same font, colors, opacity as other controls)
- Always visible (unlike some controls that only appear contextually)

### History Overlay (Full-Screen View)

When the History button is clicked:

- **Layout**: Full-screen overlay covering the entire editor area
- **Grid structure**: Responsive grid of "cards" (mini-preview windows)
  - Top-left = most recently closed tab
  - Flows left-to-right, then wraps to next row
  - Cards should be as large as possible while fitting multiple per row (responsive)
- **Scrolling**: Vertical scroll when history items exceed viewport height
- **Close mechanism**: Escape key or clicking outside a card dismisses the overlay

### History Card (Each Grid Item)

Each card represents a closed tab and displays:

1. **Tab Title** (if present): Displayed at the top of the card
2. **"just closed" Label**: A badge/label shown for tabs closed within the last 10 seconds
3. **Content Preview**: A mini-view of the actual tab content with:
   - Syntax highlighting preserved (matching how it appeared in the editor)
   - Shows up to 50 lines, dynamically sized to fit the card
   - Readable enough to identify the "shape" of the code (functions, structure, etc.)
4. **Click action**: Clicking the card restores that tab (reopens it with the same identity)

---

## Data Model

### Unified Tab Identity

Tabs and history entries are the **same entity** in different states:

- **Open tab**: Currently visible in the tab bar, editable
- **Closed tab**: Stored in history, viewable in the history overlay

Each tab has a **persistent unique ID** that remains constant throughout its lifecycle, whether it's open, closed, restored, edited, or closed again.

### Tab Entity

Each tab (whether open or closed) has:

- **Unique identifier**: Persistent across open/close cycles (e.g., `tab-1736612345678`)
- **Name**: User-assigned tab name (may be empty)
- **Content**: Full text content
- **Language**: Language setting (auto-detect or manually set)
- **Closed timestamp** (only for closed tabs): When the tab was last closed, used for sorting and "just closed" calculation

### History Storage

- Persisted to localStorage (survives app restarts)
- Contains only closed tabs (open tabs are stored separately)
- Ordered by most recently closed first
- Limited to 100 entries to prevent unbounded growth

---

## Behaviors

### When a Tab is Closed

- If this tab ID already exists in history (i.e., it was previously restored): **update** that existing entry with current content, name, language, and new timestamp
- If this tab ID is new to history: **create** a new entry
- The updated/new entry moves to the top of history (most recently closed)
- Oldest entries are removed when the limit is reached

### When a History Item is Clicked

- The tab is restored with the **same ID** it had before
- The entry is removed from history (it's now an open tab again)
- The user is switched to the restored tab
- The history overlay closes
- If closed again later, it will update its existing history slot (or create one if history was cleared)

### "Just Closed" Indicator

- Tabs closed within the last 10 seconds display a special "just closed" badge
- This helps users quickly find accidentally closed tabs
- Calculated once when the overlay opens (does not update in real-time while overlay is visible)

### Keyboard Support

- `Cmd/Ctrl+Shift+H`: Open the history overlay
- `Escape`: Close the history overlay and return to editor

---

## Visual Design

### Grid Layout

- Responsive grid that adjusts number of columns based on window width
- Cards should be as large as possible while showing multiple per row
- Suggested card aspect ratio: approximately 4:3 or 16:10 (similar to editor proportions)
- Comfortable spacing between cards and around the edges

### Card Styling

- Background: Slightly lighter than the main app background
- Rounded corners matching the existing UI style
- Hover state: Subtle highlight to indicate interactivity
- Title area: Top of card, truncated if too long
- "just closed" badge: Small label in a contrasting/accent color
- Content area: Monospace font matching the editor, scaled down to fit

### Content Preview Rendering

- Same syntax highlighting as the main editor
- Show up to 50 lines of content
- **Dynamic text sizing**: Text should be as large as possible while fitting all displayed lines within the card (no scrolling within the card)
- Preserve the visual "shape" of the code (line breaks, indentation)

---

## Edge Cases

1. **Empty history**: Show a centered message like "No closed tabs yet"
2. **Empty tab content**: Card shows title only (if named) or indicates "Empty tab"
3. **Very long content**: Truncated to first 50 lines, adjusting text size for each card as needed
4. **Very long titles**: Truncated with ellipsis
5. **History full**: Oldest entries automatically removed when limit reached
6. **No title and no content**: Still show the card (user may want to restore an empty tab they were about to use)
7. **Tab restored, history cleared, then tab closed**: Creates a new history entry (the old entry no longer exists to update)
