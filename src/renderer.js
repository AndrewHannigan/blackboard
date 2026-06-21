const Autolinker = require('autolinker');
const { shell } = require('electron');

// Configure Autolinker for plaintext mode
const autolinker = new Autolinker({
  urls: true,
  email: true,
  phone: true,
  mention: false,
  hashtag: false,
  stripPrefix: false,
  stripTrailingSlash: false,
  newWindow: false,
  className: 'autolink'
});

// ===== STORAGE KEYS =====
const KEY = 'blackboard-content';
const TABS_KEY = 'blackboard-tabs';
const ACTIVE_TAB_KEY = 'blackboard-active-tab';
const HISTORY_KEY = 'blackboard-history';

// ===== HISTORY CONFIGURATION =====
const HISTORY_MAX_ENTRIES = 100;
const HISTORY_JUST_CLOSED_MS = 10000; // 10 seconds
const HISTORY_MAX_PREVIEW_LINES = 50;

// ===== PLATFORM DETECTION =====
const isMac = process.platform === 'darwin';
const historyHotkey = isMac ? '⌘<span class="shift">⇧</span>H' : 'Ctrl+Shift+H';
document.querySelectorAll('.history-hotkey').forEach(el => el.innerHTML = historyHotkey);

// ===== HISTORY MANAGEMENT =====
// Load history from localStorage
function loadHistory() {
  const stored = localStorage.getItem(HISTORY_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }
  return [];
}

// Save history to localStorage
function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// Add a closed tab to history (or update existing entry if tab was previously restored)
function addToHistory(tab) {
  const now = Date.now();

  // Check if this tab already exists in history (was previously restored and is now being closed again)
  const existingIndex = history.findIndex(h => h.id === tab.id);

  if (existingIndex !== -1) {
    // Update existing entry and move to top
    const existingEntry = history[existingIndex];
    existingEntry.name = tab.name || '';
    existingEntry.content = tab.content || '';
    existingEntry.closedAt = now;

    // Remove from current position and add to beginning
    history.splice(existingIndex, 1);
    history.unshift(existingEntry);
  } else {
    // Create new entry with the tab's own ID (persistent identity)
    const entry = {
      id: tab.id,
      name: tab.name || '',
      content: tab.content || '',
      closedAt: now
    };

    // Add to the beginning (most recent first)
    history.unshift(entry);
  }

  // Limit history size
  if (history.length > HISTORY_MAX_ENTRIES) {
    history = history.slice(0, HISTORY_MAX_ENTRIES);
  }

  saveHistory();
}

// Restore a tab from history (reopens it with the same identity)
function restoreFromHistory(historyId) {
  const entryIndex = history.findIndex(h => h.id === historyId);
  if (entryIndex === -1) return;

  const entry = history[entryIndex];

  // Save current tab content first
  const currentTab = getActiveTab();
  if (currentTab) {
    currentTab.content = editor.value;
  }

  // Restore tab with the same ID it had before (persistent identity)
  tabs.push({
    id: entry.id,
    name: entry.name,
    content: entry.content
  });
  activeTabId = entry.id;

  // Remove from history (it's now an open tab again)
  history.splice(entryIndex, 1);
  saveHistory();

  // Update editor
  editor.value = entry.content;

  saveTabs();
  renderTabs();
  renderContent();
  closeHistoryOverlay();
  editor.focus();
}

// Initialize history
let history = loadHistory();

const tabBar = document.getElementById('tab-bar');
const addTabBtn = document.getElementById('add-tab');

// Load tabs from localStorage or create default
function loadTabs() {
  const stored = localStorage.getItem(TABS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Clear old auto-generated single-letter names
      return parsed.map(tab => ({
        id: tab.id,
        name: (tab.name && tab.name.length > 1) ? tab.name : '',
        content: tab.content || ''
      }));
    } catch (e) {
      return [{ id: 'tab-0', name: '', content: localStorage.getItem('blackboard-content') || '' }];
    }
  }
  // Migrate existing content to first tab
  return [{ id: 'tab-0', name: '', content: localStorage.getItem('blackboard-content') || '' }];
}

// Save tabs to localStorage
function saveTabs() {
  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
}

// Initialize tabs state
let tabs = loadTabs();
let activeTabId = localStorage.getItem(ACTIVE_TAB_KEY) || tabs[0]?.id || 'tab-0';

// Ensure activeTabId exists in tabs
if (!tabs.find(t => t.id === activeTabId)) {
  activeTabId = tabs[0]?.id || 'tab-0';
}

// Render the tab bar
function renderTabs() {
  // Remove existing tab buttons (but keep the add button)
  const existingTabs = tabBar.querySelectorAll('.tab');
  existingTabs.forEach(t => t.remove());

  // Show/hide tab bar based on tab count or if any tab has a name
  const anyTabHasName = tabs.some(t => t.name && t.name.trim());
  if (tabs.length <= 1 && !anyTabHasName) {
    tabBar.classList.remove('visible');
  } else {
    tabBar.classList.add('visible');
  }

  // Create tab buttons
  tabs.forEach((tab, index) => {
    const tabEl = document.createElement('button');
    tabEl.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    tabEl.dataset.tabId = tab.id;

    // Add name span if tab has a name
    if (tab.name) {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'tab-name';
      nameSpan.textContent = tab.name;
      tabEl.appendChild(nameSpan);
    }

    // Add close button (only if more than one tab)
    if (tabs.length > 1) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      tabEl.appendChild(closeBtn);
    }

    tabEl.addEventListener('click', () => {
      // Don't switch if we just finished dragging
      if (wasDragging) return;
      switchToTab(tab.id);
    });

    // Double-click to edit name (only on active tab)
    tabEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (tab.id === activeTabId) {
        startEditingTabName(tab.id, tabEl);
      }
    });

    // Drag to reorder
    tabEl.addEventListener('mousedown', (e) => {
      startTabDrag(e, tabEl, tab.id);
    });

    // Insert before the add button
    tabBar.insertBefore(tabEl, addTabBtn);
  });
}

// Start editing a tab's name
function startEditingTabName(tabId, tabEl) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Remove existing content
  const existingName = tabEl.querySelector('.tab-name');
  if (existingName) existingName.remove();

  // Create input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-name-input';
  input.value = tab.name || '';
  input.placeholder = '...';

  // Insert at the beginning (before close button)
  tabEl.insertBefore(input, tabEl.firstChild);
  input.focus();
  input.select();

  // Save on blur or enter
  const saveAndClose = () => {
    tab.name = input.value.trim();
    saveTabs();
    renderTabs();
    editor.focus();
  };

  input.addEventListener('blur', saveAndClose);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveAndClose();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      renderTabs();
      editor.focus();
    }
  });

  // Prevent click from bubbling
  input.addEventListener('click', (e) => e.stopPropagation());
}

// Get active tab data
function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) || tabs[0];
}

// Switch to a tab
function switchToTab(tabId) {
  // Don't do anything if already on this tab (allows double-click to work)
  if (tabId === activeTabId) return;

  // Save current tab content
  const currentTab = getActiveTab();
  if (currentTab) {
    currentTab.content = editor.value;
  }

  // Switch to new tab
  activeTabId = tabId;
  const newTab = getActiveTab();

  if (newTab) {
    editor.value = newTab.content || '';
  }

  saveTabs();
  renderTabs();
  renderContent();
  editor.focus();
}

// Create a new tab
function createNewTab() {
  // Save current tab content first
  const currentTab = getActiveTab();
  if (currentTab) {
    currentTab.content = editor.value;
  }

  // Create new tab
  const newId = 'tab-' + Date.now();
  tabs.push({ id: newId, name: '', content: '' });
  activeTabId = newId;

  // Clear editor
  editor.value = '';

  saveTabs();
  renderTabs();
  renderContent();
  editor.focus();
}

// Close a tab
function closeTab(tabId) {
  if (tabs.length <= 1) return; // Don't close last tab

  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  // Get the tab being closed
  const closingTab = tabs[index];
  // If closing the active tab, make sure to capture current editor content
  if (tabId === activeTabId) {
    closingTab.content = editor.value;
  }

  // Only save to history if tab has non-empty content (not just whitespace)
  if (closingTab.content && closingTab.content.trim()) {
    addToHistory(closingTab);
  }

  tabs.splice(index, 1);

  // If we closed the active tab, switch to another
  if (tabId === activeTabId) {
    // Switch to the tab at the same index, or the last tab if we closed the last one
    const newIndex = Math.min(index, tabs.length - 1);
    activeTabId = tabs[newIndex].id;
    const newTab = tabs[newIndex];
    editor.value = newTab.content || '';
    renderContent();
  }

  saveTabs();
  renderTabs();
  editor.focus();
}

// Add tab button handler
addTabBtn.addEventListener('click', createNewTab);

// ===== TAB DRAG REORDERING =====
let dragState = null;
let wasDragging = false;

function startTabDrag(e, tabEl, tabId) {
  // Only start drag on left mouse button
  if (e.button !== 0) return;

  // Don't start drag if clicking close button or input
  if (e.target.closest('.tab-close') || e.target.closest('.tab-name-input')) return;

  const tabRect = tabEl.getBoundingClientRect();
  const tabBarRect = tabBar.getBoundingClientRect();

  // Get all tab elements and their positions
  const tabEls = Array.from(tabBar.querySelectorAll('.tab'));
  const tabIndex = tabEls.indexOf(tabEl);

  dragState = {
    tabId,
    tabEl,
    tabIndex,
    startX: e.clientX,
    tabStartLeft: tabRect.left,
    tabWidth: tabRect.width,
    tabBarLeft: tabBarRect.left,
    tabBarRight: tabBarRect.right - (addTabBtn.getBoundingClientRect().width),
    offsetX: e.clientX - tabRect.left,
    hasMoved: false,
    tabElements: tabEls.map(t => ({
      el: t,
      left: t.getBoundingClientRect().left,
      width: t.getBoundingClientRect().width,
      center: t.getBoundingClientRect().left + t.getBoundingClientRect().width / 2
    }))
  };

  e.preventDefault();
}

function handleTabDrag(e) {
  if (!dragState) return;

  const { tabEl, tabIndex, startX, tabWidth, tabBarLeft, tabBarRight, tabElements } = dragState;

  // Calculate how far we've moved
  const deltaX = e.clientX - startX;

  // Only start visual drag after moving 3px (to distinguish from clicks)
  if (!dragState.hasMoved && Math.abs(deltaX) < 3) return;

  // Initialize drag visuals on first significant move
  if (!dragState.hasMoved) {
    dragState.hasMoved = true;
    tabEl.classList.add('dragging');
    tabBar.classList.add('dragging');
    tabEl.style.zIndex = '10';
    tabEl.style.position = 'relative';

    // Add transitions to other tabs for smooth visual
    tabElements.forEach((t, i) => {
      if (i !== tabIndex) {
        t.el.style.transition = 'transform 0.15s ease';
      }
    });
  }

  // Calculate the new left position, constrained to the tab bar
  const newLeft = dragState.tabStartLeft + deltaX;
  const minLeft = tabBarLeft;
  const maxLeft = tabBarRight - tabWidth;
  const constrainedLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));

  // Calculate the offset from the original position
  const translateX = constrainedLeft - dragState.tabStartLeft;
  tabEl.style.transform = `translateX(${translateX}px)`;

  // Calculate the edges of the dragged tab
  const dragLeft = constrainedLeft;
  const dragRight = constrainedLeft + tabWidth;

  // Find where we should insert based on drag position
  // Trigger swap when the edge of dragged tab enters ~25% into the adjacent tab
  let newIndex = tabIndex;
  tabElements.forEach((t, i) => {
    if (i === tabIndex) return;

    if (i < tabIndex && dragLeft < t.left + t.width * 0.75) {
      // Moving left: trigger when our left edge is 25% into the tab
      newIndex = Math.min(newIndex, i);
    } else if (i > tabIndex && dragRight > t.left + t.width * 0.25) {
      // Moving right: trigger when our right edge is 25% into the tab
      newIndex = Math.max(newIndex, i);
    }
  });

  dragState.currentIndex = newIndex;

  // Shift other tabs to make room
  tabElements.forEach((t, i) => {
    if (i === tabIndex) return;

    if (tabIndex < newIndex) {
      // Dragging right: shift tabs left if they're between old and new position
      if (i > tabIndex && i <= newIndex) {
        t.el.style.transform = `translateX(${-tabWidth}px)`;
      } else {
        t.el.style.transform = '';
      }
    } else if (tabIndex > newIndex) {
      // Dragging left: shift tabs right if they're between new and old position
      if (i >= newIndex && i < tabIndex) {
        t.el.style.transform = `translateX(${tabWidth}px)`;
      } else {
        t.el.style.transform = '';
      }
    } else {
      t.el.style.transform = '';
    }
  });
}

function endTabDrag(e) {
  if (!dragState) return;

  const { tabEl, tabId, tabIndex, tabElements, hasMoved, tabStartLeft } = dragState;
  const newIndex = dragState.currentIndex !== undefined ? dragState.currentIndex : tabIndex;

  // Track if we were actually dragging (for click prevention)
  wasDragging = hasMoved;

  if (hasMoved) {
    // Calculate where the tab should animate to
    let targetLeft;
    if (newIndex !== tabIndex) {
      // Moving to a new position - animate to where that slot is
      targetLeft = tabElements[newIndex].left;
    } else {
      // Returning to original position
      targetLeft = tabStartLeft;
    }

    const currentTransform = tabEl.style.transform;
    const currentX = currentTransform ? parseFloat(currentTransform.replace(/[^-\d.]/g, '')) || 0 : 0;
    const targetX = targetLeft - tabStartLeft;

    // Animate the dragged tab to its final position
    tabEl.style.transition = 'transform 0.15s ease';
    tabEl.style.transform = `translateX(${targetX}px)`;

    // After animation completes, reset and re-render
    setTimeout(() => {
      tabEl.classList.remove('dragging');
      tabBar.classList.remove('dragging');
      tabEl.style.zIndex = '';
      tabEl.style.position = '';
      tabEl.style.transform = '';
      tabEl.style.transition = '';

      tabElements.forEach(t => {
        t.el.style.transform = '';
        t.el.style.transition = '';
      });

      // If position changed, reorder the tabs array
      if (newIndex !== tabIndex) {
        const tabData = tabs.find(t => t.id === tabId);
        if (tabData) {
          const oldIdx = tabs.indexOf(tabData);
          tabs.splice(oldIdx, 1);
          tabs.splice(newIndex, 0, tabData);
          saveTabs();
          renderTabs();
        }
      }
    }, 150);
  } else {
    // No drag happened, just clean up
    tabEl.classList.remove('dragging');
    tabBar.classList.remove('dragging');
    tabEl.style.zIndex = '';
    tabEl.style.position = '';
    tabEl.style.transform = '';

    tabElements.forEach(t => {
      t.el.style.transform = '';
      t.el.style.transition = '';
    });
  }

  dragState = null;

  // Reset wasDragging after a short delay to allow click event to check it
  setTimeout(() => { wasDragging = false; }, 0);
}

// Global mouse event listeners for drag
document.addEventListener('mousemove', handleTabDrag);
document.addEventListener('mouseup', endTabDrag);

// Keyboard shortcuts for tabs
document.addEventListener('keydown', (e) => {
  // Cmd+T to create new tab
  if ((e.metaKey || e.ctrlKey) && e.key === 't') {
    e.preventDefault();
    createNewTab();
  }
  // Cmd+W to close current tab
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    e.preventDefault();
    if (tabs.length > 1) {
      closeTab(activeTabId);
    }
  }
  // Cmd+Shift+] to go to next tab
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ']') {
    e.preventDefault();
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    switchToTab(tabs[nextIndex].id);
  }
  // Cmd+Shift+[ to go to previous tab
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '[') {
    e.preventDefault();
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    switchToTab(tabs[prevIndex].id);
  }
});

// ===== END TAB MANAGEMENT =====

const editor = document.getElementById('editor');
const highlightLayer = document.getElementById('highlight-layer').querySelector('code');

// Escape HTML to prevent XSS and display issues
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Apply autolinker to plaintext (escapes HTML first, then adds links)
function applyAutolinker(text) {
  // First escape HTML, then let Autolinker find and link URLs, emails, phones
  const escaped = escapeHtml(text);
  return autolinker.link(escaped);
}

// Update pointer-events on highlight layer based on whether we have links
function updateHighlightLayerPointerEvents() {
  const hasLinks = highlightLayer.querySelector('a.autolink') !== null;
  const highlightPre = document.getElementById('highlight-layer');
  if (hasLinks) {
    highlightPre.classList.add('has-links');
  } else {
    highlightPre.classList.remove('has-links');
  }
}

// Handle Cmd+Click (Mac) or Ctrl+Click (Windows/Linux) to open links
editor.addEventListener('click', (e) => {
  // Only handle if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
  if (!(isMac ? e.metaKey : e.ctrlKey)) return;

  const text = editor.value;
  if (!text.trim()) return;

  // Get cursor position at click
  const cursorPos = editor.selectionStart;

  // Use Autolinker.parse to find all matches
  const matches = Autolinker.parse(text, {
    urls: true,
    email: true,
    phone: true
  });

  // Check if cursor is within any match
  for (const match of matches) {
    const start = match.offset;
    const end = match.offset + match.matchedText.length;

    if (cursorPos >= start && cursorPos <= end) {
      e.preventDefault();
      shell.openExternal(match.getAnchorHref());
      return;
    }
  }
});

// Render the highlight layer: plaintext with clickable autolinks
function renderContent() {
  const text = editor.value;

  if (!text.trim()) {
    highlightLayer.innerHTML = '';
    updateHighlightLayerPointerEvents();
    return;
  }

  highlightLayer.innerHTML = applyAutolinker(text);
  updateHighlightLayerPointerEvents();
}

// Sync scroll between editor and highlight layer
function syncScroll() {
  const pre = document.getElementById('highlight-layer');
  pre.scrollTop = editor.scrollTop;
  pre.scrollLeft = editor.scrollLeft;
}

// Help menu
const helpBtn = document.getElementById('help-btn');
const helpMenu = document.getElementById('help-menu');

helpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  helpMenu.classList.toggle('open');
});

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  if (!helpMenu.contains(e.target) && e.target !== helpBtn) {
    helpMenu.classList.remove('open');
  }
});

// Close help menu and history overlay on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (historyOverlayOpen) {
      closeHistoryOverlay();
      return;
    }
    helpMenu.classList.remove('open');
  }
});

// Cmd/Ctrl+Shift+H to open history overlay
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    toggleHistoryOverlay();
  }
});

// ===== HISTORY OVERLAY =====
const historyBtn = document.getElementById('history-btn');
const historyOverlay = document.getElementById('history-overlay');
const historyGrid = document.getElementById('history-grid');
let historyOverlayOpen = false;
let historyOpenedAt = null; // Timestamp when overlay was opened (for "just closed" calculation)

// Open history overlay
function openHistoryOverlay() {
  if (historyOverlayOpen) return;
  historyOverlayOpen = true;
  historyOpenedAt = Date.now();
  renderHistoryCards();
  historyOverlay.classList.add('open');
}

// Close history overlay
function closeHistoryOverlay() {
  if (!historyOverlayOpen) return;
  historyOverlayOpen = false;
  historyOverlay.classList.remove('open');
}

// Toggle history overlay
function toggleHistoryOverlay() {
  if (historyOverlayOpen) {
    closeHistoryOverlay();
  } else {
    openHistoryOverlay();
  }
}

// Delete an entry from history permanently
function deleteFromHistory(historyId) {
  const entryIndex = history.findIndex(h => h.id === historyId);
  if (entryIndex === -1) return;

  history.splice(entryIndex, 1);
  saveHistory();
  renderHistoryCards();
}

// Render history cards
function renderHistoryCards() {
  historyGrid.innerHTML = '';

  if (history.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'history-empty';
    emptyMsg.textContent = 'No closed tabs yet';
    historyGrid.appendChild(emptyMsg);
    return;
  }

  history.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.dataset.historyId = entry.id;

    // Header with title and badge
    const header = document.createElement('div');
    header.className = 'history-card-header';

    // Title
    const title = document.createElement('div');
    title.className = 'history-card-title';
    if (entry.name) {
      title.textContent = entry.name;
    } else if (!entry.content.trim()) {
      title.textContent = 'Empty tab';
      title.classList.add('empty');
    } else {
      title.textContent = 'Untitled';
      title.classList.add('untitled');
    }
    header.appendChild(title);

    // "Just closed" badge
    const timeSinceClosed = historyOpenedAt - entry.closedAt;
    if (timeSinceClosed < HISTORY_JUST_CLOSED_MS) {
      const badge = document.createElement('span');
      badge.className = 'history-just-closed';
      badge.textContent = 'just closed';
      header.appendChild(badge);
    }

    // Delete button
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'history-card-delete';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    deleteBtn.title = 'Delete from history';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFromHistory(entry.id);
    });
    header.appendChild(deleteBtn);

    card.appendChild(header);

    // Content preview
    const preview = document.createElement('div');
    preview.className = 'history-card-preview';

    if (entry.content.trim()) {
      const previewCode = document.createElement('code');

      // Limit to first 50 lines
      const lines = entry.content.split('\n');
      const truncatedContent = lines.slice(0, HISTORY_MAX_PREVIEW_LINES).join('\n');
      const lineCount = Math.min(lines.length, HISTORY_MAX_PREVIEW_LINES);

      previewCode.textContent = truncatedContent;

      preview.appendChild(previewCode);

      // Dynamic font sizing based on line count
      // Fewer lines = larger font, more lines = smaller font
      const baseFontSize = 10;
      const minFontSize = 6;
      const fontScale = Math.max(minFontSize, baseFontSize - Math.floor(lineCount / 10));
      previewCode.style.fontSize = `${fontScale}px`;
    } else {
      preview.classList.add('empty-content');
    }

    card.appendChild(preview);

    // Click handler to restore
    card.addEventListener('click', () => {
      restoreFromHistory(entry.id);
    });

    historyGrid.appendChild(card);
  });
}

// History button click handler
historyBtn.addEventListener('click', toggleHistoryOverlay);

// Close overlay when clicking outside cards
historyOverlay.addEventListener('click', (e) => {
  if (e.target === historyOverlay || e.target === historyGrid) {
    closeHistoryOverlay();
  }
});

// Initialize from active tab
const initialTab = getActiveTab();
if (initialTab) {
  editor.value = initialTab.content || '';
}

renderTabs();
renderContent();

editor.addEventListener('input', () => {
  // Save to current tab
  const currentTab = getActiveTab();
  if (currentTab) {
    currentTab.content = editor.value;
    saveTabs();
  }
  // Also save to legacy key for compatibility with CLI
  localStorage.setItem(KEY, editor.value);
  renderContent();
});

editor.addEventListener('scroll', syncScroll);
