const hljs = require('highlight.js');
const Autolinker = require('autolinker');
const { exec, spawn } = require('child_process');
const { ipcRenderer, shell } = require('electron');

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
const LANG_KEY = 'blackboard-language';
const HIGHLIGHT_KEY = 'blackboard-highlighting';
const TABS_KEY = 'blackboard-tabs';
const ACTIVE_TAB_KEY = 'blackboard-active-tab';
const DEV_MODE_KEY = 'blackboard-dev-mode';

// ===== PLATFORM DETECTION =====
const isMac = process.platform === 'darwin';
const formatHotkey = isMac ? '⌘F' : 'Ctrl+F';
document.querySelectorAll('.format-hotkey').forEach(el => el.textContent = formatHotkey);

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
        ...tab,
        name: (tab.name && tab.name.length > 1) ? tab.name : ''
      }));
    } catch (e) {
      return [{ id: 'tab-0', name: '', content: localStorage.getItem('blackboard-content') || '', language: null }];
    }
  }
  // Migrate existing content to first tab
  return [{ id: 'tab-0', name: '', content: localStorage.getItem('blackboard-content') || '', language: localStorage.getItem('blackboard-language') || null }];
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
    currentTab.language = manualLanguage;
  }
  
  // Switch to new tab
  activeTabId = tabId;
  const newTab = getActiveTab();
  
  if (newTab) {
    editor.value = newTab.content || '';
    manualLanguage = newTab.language;
    if (manualLanguage) {
      localStorage.setItem(LANG_KEY, manualLanguage);
    } else {
      localStorage.removeItem(LANG_KEY);
    }
  }
  
  saveTabs();
  renderTabs();
  applyHighlighting();
  editor.focus();
}

// Create a new tab
function createNewTab() {
  // Save current tab content first
  const currentTab = getActiveTab();
  if (currentTab) {
    currentTab.content = editor.value;
    currentTab.language = manualLanguage;
  }
  
  // Create new tab
  const newId = 'tab-' + Date.now();
  tabs.push({ id: newId, name: '', content: '', language: null });
  activeTabId = newId;
  
  // Clear editor
  editor.value = '';
  manualLanguage = null;
  localStorage.removeItem(LANG_KEY);
  
  saveTabs();
  renderTabs();
  applyHighlighting();
  editor.focus();
}

// Close a tab
function closeTab(tabId) {
  if (tabs.length <= 1) return; // Don't close last tab
  
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;
  
  tabs.splice(index, 1);
  
  // If we closed the active tab, switch to another
  if (tabId === activeTabId) {
    // Switch to the tab at the same index, or the last tab if we closed the last one
    const newIndex = Math.min(index, tabs.length - 1);
    activeTabId = tabs[newIndex].id;
    const newTab = tabs[newIndex];
    editor.value = newTab.content || '';
    manualLanguage = newTab.language;
    if (manualLanguage) {
      localStorage.setItem(LANG_KEY, manualLanguage);
    } else {
      localStorage.removeItem(LANG_KEY);
    }
    applyHighlighting();
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
  // Cmd+D to toggle developer mode
  if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
    e.preventDefault();
    toggleDevMode();
  }
  // Cmd+J to toggle syntax highlighting
  if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
    e.preventDefault();
    toggleHighlighting();
  }
});

// ===== END TAB MANAGEMENT =====

// Limit auto-detection to these languages only
hljs.configure({
  languages: [
    'javascript',
    'typescript',
    'python',
    'html',
    'css',
    'json',
    'bash',
    'shell',
    'sql',
    'go',
    'rust',
    'java',
    'c',
    'cpp',
    'ruby',
    'php',
    'swift',
    'kotlin',
    'yaml',
    'markdown',
    'scala',
    'haskell',
    'lua',
    'r',
    'perl'
  ]
});

const editor = document.getElementById('editor');
const highlightLayer = document.getElementById('highlight-layer').querySelector('code');
const languageIndicator = document.getElementById('language-indicator');
const languagePicker = document.getElementById('language-picker');
const highlightToggle = document.getElementById('highlight-toggle');

// Highlighting enabled state
let highlightingEnabled = localStorage.getItem(HIGHLIGHT_KEY) !== 'false';

// Minimum thresholds to apply syntax highlighting
const RELEVANCE_THRESHOLD = 5;
const RELEVANCE_PER_CHAR_THRESHOLD = 0.02;

// Check if detected language meets confidence threshold
function meetsConfidenceThreshold(relevance, text) {
  const charCount = text.length;
  if (charCount === 0) return false;
  const relevancePerChar = relevance / charCount;
  return relevance >= RELEVANCE_THRESHOLD && relevancePerChar > RELEVANCE_PER_CHAR_THRESHOLD;
}

// Developer mode state
let developerMode = localStorage.getItem(DEV_MODE_KEY) === 'true';
const devMetrics = document.getElementById('dev-metrics');
const metricLanguage = document.getElementById('metric-language');
const metricRelevance = document.getElementById('metric-relevance');
const metricPerChar = document.getElementById('metric-per-char');
const metricThreshold = document.getElementById('metric-threshold');
const metricSecondBest = document.getElementById('metric-second-best');
const metricSecondRelevance = document.getElementById('metric-second-relevance');
const metricSecondPerChar = document.getElementById('metric-second-per-char');
const metricIllegal = document.getElementById('metric-illegal');
const metricChars = document.getElementById('metric-chars');

// Current metrics from last highlight result
let lastMetrics = {
  language: null,
  relevance: null,
  relevancePerChar: null,
  meetsThreshold: null,
  secondBest: null,
  secondRelevance: null,
  secondPerChar: null,
  illegal: null,
  charCount: null
};

// Update developer metrics display
function updateDevMetrics(result, text) {
  const charCount = text.length;
  const relevance = result.relevance || 0;
  const relevancePerChar = charCount > 0 ? relevance / charCount : 0;
  const meetsThreshold = relevancePerChar >= RELEVANCE_PER_CHAR_THRESHOLD;
  const secondRelevance = result.secondBest?.relevance || null;
  const secondPerChar = (secondRelevance !== null && charCount > 0) ? secondRelevance / charCount : null;
  
  lastMetrics = {
    language: result.language || null,
    relevance: relevance,
    relevancePerChar: relevancePerChar,
    meetsThreshold: meetsThreshold,
    secondBest: result.secondBest?.language || null,
    secondRelevance: secondRelevance,
    secondPerChar: secondPerChar,
    illegal: result.illegal || false,
    charCount: charCount
  };
  
  if (developerMode) {
    refreshDevMetricsDisplay();
  }
}

// Refresh the dev metrics display from lastMetrics
function refreshDevMetricsDisplay() {
  metricLanguage.textContent = lastMetrics.language || '—';
  metricRelevance.textContent = lastMetrics.relevance !== null ? lastMetrics.relevance.toFixed(1) : '—';
  metricPerChar.textContent = lastMetrics.relevancePerChar !== null ? lastMetrics.relevancePerChar.toFixed(4) : '—';
  metricThreshold.textContent = lastMetrics.meetsThreshold !== null ? (lastMetrics.meetsThreshold ? '✓ pass' : '✗ fail') : '—';
  metricSecondBest.textContent = lastMetrics.secondBest || '—';
  metricSecondRelevance.textContent = lastMetrics.secondRelevance !== null ? lastMetrics.secondRelevance.toFixed(1) : '—';
  metricSecondPerChar.textContent = lastMetrics.secondPerChar !== null ? lastMetrics.secondPerChar.toFixed(4) : '—';
  metricIllegal.textContent = lastMetrics.illegal ? 'yes' : 'no';
  metricChars.textContent = lastMetrics.charCount !== null ? lastMetrics.charCount.toLocaleString() : '—';
}

// Settings menu elements
const settingsMenu = document.getElementById('settings-menu');
const devModeToggle = document.getElementById('dev-mode-toggle');
const devModeToggleSwitch = devModeToggle.querySelector('.settings-toggle');

// Update developer mode UI
function updateDevModeUI() {
  if (developerMode) {
    devModeToggleSwitch.classList.add('on');
    devMetrics.classList.add('visible');
    // Refresh metrics display
    refreshDevMetricsDisplay();
  } else {
    devModeToggleSwitch.classList.remove('on');
    devMetrics.classList.remove('visible');
  }
}

// Toggle developer mode
function toggleDevMode() {
  developerMode = !developerMode;
  localStorage.setItem(DEV_MODE_KEY, developerMode ? 'true' : 'false');
  updateDevModeUI();
}

// Dev mode toggle click handler
devModeToggle.addEventListener('click', () => {
  toggleDevMode();
});

// Help menu
const helpBtn = document.getElementById('help-btn');
const helpMenu = document.getElementById('help-menu');

helpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  helpMenu.classList.toggle('open');
  settingsMenu.classList.remove('open');
});

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  if (!settingsMenu.contains(e.target)) {
    settingsMenu.classList.remove('open');
  }
  if (!helpMenu.contains(e.target) && e.target !== helpBtn) {
    helpMenu.classList.remove('open');
  }
});

// Listen for settings menu command from main process (Blackboard > Settings)
ipcRenderer.on('open-settings', () => {
  settingsMenu.classList.toggle('open');
});

// Initialize developer mode UI
updateDevModeUI();

// Available languages for the picker (alphabetical)
const AVAILABLE_LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'css',
  'go',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'markdown',
  'perl',
  'php',
  'plaintext',
  'python',
  'r',
  'ruby',
  'rust',
  'scala',
  'shell',
  'sql',
  'swift',
  'typescript',
  'yaml'
];

// Manual language override (null = auto-detect)
let manualLanguage = localStorage.getItem(LANG_KEY) || null;

// Ruff availability
let ruffAvailable = false;
const ruffFormatBtn = document.getElementById('ruff-format');

// Check if ruff is available on system
function checkRuffAvailable() {
  // Try common paths including user's local bin directories
  const pathsToTry = [
    process.env.HOME + '/.local/bin',
    process.env.HOME + '/.cargo/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ].join(':') + ':' + (process.env.PATH || '');

  exec('ruff --version', { env: { ...process.env, PATH: pathsToTry } }, (error, stdout, stderr) => {
    ruffAvailable = !error;
    updateRuffButton();
  });
}

// Update ruff button visibility
function updateRuffButton() {
  const isPython = currentLanguage === 'python' || manualLanguage === 'python';
  if (isPython && editor.value.trim()) {
    ruffFormatBtn.classList.add('visible');
    if (ruffAvailable) {
      ruffFormatBtn.classList.remove('unavailable');
      ruffFormatBtn.title = `Format with Ruff (${formatHotkey})`;
    } else {
      ruffFormatBtn.classList.add('unavailable');
      ruffFormatBtn.title = 'Ruff not installed - click for info';
    }
  } else {
    ruffFormatBtn.classList.remove('visible');
    ruffFormatBtn.classList.remove('unavailable');
  }
}

// Format code with ruff
function formatWithRuff() {
  if (!ruffAvailable) return;
  
  const code = editor.value;
  if (!code.trim()) return;

  ruffFormatBtn.classList.add('formatting');

  // Build PATH with common locations
  const pathsToTry = [
    process.env.HOME + '/.local/bin',
    process.env.HOME + '/.cargo/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ].join(':') + ':' + (process.env.PATH || '');

  const ruff = spawn('ruff', ['format', '-'], {
    env: { ...process.env, PATH: pathsToTry }
  });

  let formattedCode = '';
  let errorOutput = '';

  ruff.stdout.on('data', (data) => {
    formattedCode += data.toString();
  });

  ruff.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  ruff.on('close', (exitCode) => {
    ruffFormatBtn.classList.remove('formatting');

    if (exitCode === 0 && formattedCode) {
      // Preserve cursor position roughly
      const cursorPos = editor.selectionStart;
      const ratio = cursorPos / code.length;
      
      editor.value = formattedCode;
      localStorage.setItem(KEY, formattedCode);
      
      // Save to current tab
      const currentTab = getActiveTab();
      if (currentTab) {
        currentTab.content = formattedCode;
        saveTabs();
      }
      
      // Restore cursor position proportionally
      const newPos = Math.round(ratio * formattedCode.length);
      editor.setSelectionRange(newPos, newPos);
      
      applyHighlighting();
    }
  });

  ruff.stdin.write(code);
  ruff.stdin.end();
}

// Ruff button click handler
ruffFormatBtn.addEventListener('click', () => {
  if (ruffAvailable) {
    formatWithRuff();
  } else {
    showFormatterTooltip('ruff', null, 'https://docs.astral.sh/ruff/installation/');
  }
});

// Check for ruff on startup
checkRuffAvailable();

// sqlformat availability
let sqlformatAvailable = false;
const sqlFormatBtn = document.getElementById('sql-format');

// Formatter tooltip
const formatterTooltip = document.getElementById('formatter-tooltip');
let tooltipTimeout = null;

function showFormatterTooltip(formatter, installCmd, docUrl, altInstallCmd) {
  clearTimeout(tooltipTimeout);
  let installInstructions;
  if (docUrl) {
    installInstructions = `<div>See installation instructions:</div>
       <div style="margin-top: 6px;"><a href="${docUrl}" style="color: #6bb3ff; text-decoration: underline;">${docUrl}</a></div>`;
  } else if (altInstallCmd) {
    installInstructions = `<div>To enable formatting, install with uv (recommended):</div>
       <div style="margin-top: 6px;"><code>${installCmd}</code></div>
       <div style="margin-top: 10px;">Or with pip:</div>
       <div style="margin-top: 6px;"><code>${altInstallCmd}</code></div>`;
  } else {
    installInstructions = `<div>To enable formatting, run:</div>
       <div style="margin-top: 6px;"><code>${installCmd}</code></div>`;
  }
  formatterTooltip.innerHTML = `
    <div class="formatter-tooltip-title">
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      ${formatter} not installed
    </div>
    ${installInstructions}
  `;
  formatterTooltip.classList.add('open');
  
  // Auto-hide after 5 seconds
  tooltipTimeout = setTimeout(() => {
    formatterTooltip.classList.remove('open');
  }, 5000);
}

function hideFormatterTooltip() {
  clearTimeout(tooltipTimeout);
  formatterTooltip.classList.remove('open');
}

// Check if sqlformat is available on system
function checkSqlformatAvailable() {
  const pathsToTry = [
    process.env.HOME + '/.local/bin',
    process.env.HOME + '/.pyenv/shims',
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ].join(':') + ':' + (process.env.PATH || '');

  exec('sqlformat --version', { env: { ...process.env, PATH: pathsToTry } }, (error, stdout, stderr) => {
    sqlformatAvailable = !error;
    updateSqlFormatButton();
  });
}

// Update sqlformat button visibility
function updateSqlFormatButton() {
  const isSQL = currentLanguage === 'sql' || manualLanguage === 'sql';
  if (isSQL && editor.value.trim()) {
    sqlFormatBtn.classList.add('visible');
    if (sqlformatAvailable) {
      sqlFormatBtn.classList.remove('unavailable');
      sqlFormatBtn.title = `Format with sqlformat (${formatHotkey})`;
    } else {
      sqlFormatBtn.classList.add('unavailable');
      sqlFormatBtn.title = 'sqlformat not installed - click for info';
    }
  } else {
    sqlFormatBtn.classList.remove('visible');
    sqlFormatBtn.classList.remove('unavailable');
  }
}

// Format code with sqlformat
function formatWithSqlformat() {
  if (!sqlformatAvailable) return;
  
  const code = editor.value;
  if (!code.trim()) return;

  sqlFormatBtn.classList.add('formatting');

  const pathsToTry = [
    process.env.HOME + '/.local/bin',
    process.env.HOME + '/.pyenv/shims',
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ].join(':') + ':' + (process.env.PATH || '');

  // sqlformat options: -r for reindent, -k upper for uppercase keywords
  const sqlformat = spawn('sqlformat', ['-r', '-k', 'upper', '-'], {
    env: { ...process.env, PATH: pathsToTry }
  });

  let formattedCode = '';
  let errorOutput = '';

  sqlformat.stdout.on('data', (data) => {
    formattedCode += data.toString();
  });

  sqlformat.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  sqlformat.on('close', (exitCode) => {
    sqlFormatBtn.classList.remove('formatting');

    if (exitCode === 0 && formattedCode) {
      const cursorPos = editor.selectionStart;
      const ratio = cursorPos / code.length;
      
      editor.value = formattedCode;
      localStorage.setItem(KEY, formattedCode);
      
      // Save to current tab
      const currentTab = getActiveTab();
      if (currentTab) {
        currentTab.content = formattedCode;
        saveTabs();
      }
      
      const newPos = Math.round(ratio * formattedCode.length);
      editor.setSelectionRange(newPos, newPos);
      
      applyHighlighting();
    }
  });

  sqlformat.stdin.write(code);
  sqlformat.stdin.end();
}

// sqlformat button click handler
sqlFormatBtn.addEventListener('click', () => {
  if (sqlformatAvailable) {
    formatWithSqlformat();
  } else {
    showFormatterTooltip('sqlformat', 'uv tool install --from sqlparse sqlformat', null, 'pip install sqlparse');
  }
});

// Check for sqlformat on startup
checkSqlformatAvailable();

// Prettier (bundled with app - always available)
// Lazy load to avoid blocking startup
let prettierModule = null;
let prettierPlugins = {};

const prettierFormatBtn = document.getElementById('prettier-format');

// Languages supported by Prettier and their parser names + plugin names
const PRETTIER_CONFIG = {
  'javascript': { parser: 'babel', pluginNames: ['babel', 'estree'] },
  'typescript': { parser: 'typescript', pluginNames: ['typescript', 'estree'] },
  'json': { parser: 'json', pluginNames: ['babel', 'estree'] },
  'html': { parser: 'html', pluginNames: ['html'] },
  'css': { parser: 'css', pluginNames: ['postcss'] },
  'markdown': { parser: 'markdown', pluginNames: ['markdown'] },
  'yaml': { parser: 'yaml', pluginNames: ['yaml'] }
};

// Lazy load prettier and required plugins
function getPrettierPlugins(pluginNames) {
  if (!prettierModule) {
    prettierModule = require('prettier/standalone');
  }
  const plugins = [];
  for (const name of pluginNames) {
    if (!prettierPlugins[name]) {
      prettierPlugins[name] = require(`prettier/plugins/${name}`);
    }
    plugins.push(prettierPlugins[name]);
  }
  return plugins;
}

// Update prettier button visibility
function updatePrettierButton() {
  const lang = manualLanguage || currentLanguage;
  const config = PRETTIER_CONFIG[lang];
  
  if (config && editor.value.trim()) {
    prettierFormatBtn.classList.add('visible');
    prettierFormatBtn.title = `Format with Prettier (${formatHotkey})`;
  } else {
    prettierFormatBtn.classList.remove('visible');
  }
}

// Format code with Prettier
async function formatWithPrettier() {
  const code = editor.value;
  if (!code.trim()) return;

  const lang = manualLanguage || currentLanguage;
  const config = PRETTIER_CONFIG[lang];
  if (!config) return;

  prettierFormatBtn.classList.add('formatting');

  try {
    const plugins = getPrettierPlugins(config.pluginNames);
    const formattedCode = await prettierModule.format(code, {
      parser: config.parser,
      plugins: plugins,
      tabWidth: 2,
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 100
    });

    // Preserve cursor position roughly
    const cursorPos = editor.selectionStart;
    const ratio = cursorPos / code.length;

    editor.value = formattedCode;
    localStorage.setItem(KEY, formattedCode);

    // Save to current tab
    const currentTab = getActiveTab();
    if (currentTab) {
      currentTab.content = formattedCode;
      saveTabs();
    }

    // Restore cursor position proportionally
    const newPos = Math.round(ratio * formattedCode.length);
    editor.setSelectionRange(newPos, newPos);

    applyHighlighting();
  } catch (err) {
    // Formatting failed (likely syntax error) - just ignore
    console.error('Prettier error:', err);
  } finally {
    prettierFormatBtn.classList.remove('formatting');
  }
}

// Prettier button click handler
prettierFormatBtn.addEventListener('click', formatWithPrettier);

// Build the language picker dropdown
function buildLanguagePicker() {
  languagePicker.innerHTML = '';
  
  // Auto-detect option
  const autoOption = document.createElement('div');
  autoOption.className = 'language-option auto-detect' + (manualLanguage === null ? ' selected' : '');
  autoOption.textContent = 'Auto-detect';
  autoOption.addEventListener('click', () => selectLanguage(null));
  languagePicker.appendChild(autoOption);

  // Language options
  AVAILABLE_LANGUAGES.forEach(lang => {
    const option = document.createElement('div');
    option.className = 'language-option' + (manualLanguage === lang ? ' selected' : '');
    option.textContent = lang;
    option.addEventListener('click', () => selectLanguage(lang));
    languagePicker.appendChild(option);
  });
}

// Select a language
function selectLanguage(lang) {
  manualLanguage = lang;
  if (lang) {
    localStorage.setItem(LANG_KEY, lang);
  } else {
    localStorage.removeItem(LANG_KEY);
  }
  // Save language to current tab
  const currentTab = getActiveTab();
  if (currentTab) {
    currentTab.language = lang;
    saveTabs();
  }
  closePicker();
  applyHighlighting();
}

// Toggle picker visibility
function togglePicker() {
  const isOpen = languagePicker.classList.contains('open');
  if (isOpen) {
    closePicker();
  } else {
    buildLanguagePicker();
    languagePicker.classList.add('open');
  }
}

function closePicker() {
  languagePicker.classList.remove('open');
}

// Language indicator click handler
languageIndicator.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePicker();
});

// Close picker when clicking outside
document.addEventListener('click', (e) => {
  if (!languagePicker.contains(e.target) && e.target !== languageIndicator) {
    closePicker();
  }
  // Close formatter tooltip when clicking outside
  if (!formatterTooltip.contains(e.target) && 
      !ruffFormatBtn.contains(e.target) && 
      !sqlFormatBtn.contains(e.target)) {
    hideFormatterTooltip();
  }
});

// Close picker, tooltip, and help menu on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePicker();
    hideFormatterTooltip();
    helpMenu.classList.remove('open');
  }
});

// Cmd+F to format (if a formatter is available)
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    const lang = manualLanguage || currentLanguage;
    
    // Check if we have an available formatter for this language
    if (lang === 'python' && ruffAvailable) {
      e.preventDefault();
      formatWithRuff();
    } else if (lang === 'sql' && sqlformatAvailable) {
      e.preventDefault();
      formatWithSqlformat();
    } else if (PRETTIER_CONFIG[lang]) {
      e.preventDefault();
      formatWithPrettier();
    }
    // Otherwise, let default behavior (browser find) happen
  }
});

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

// Check if current mode should use autolinker (plaintext mode)
function shouldUseAutolinker() {
  return manualLanguage === 'plaintext' || 
         (manualLanguage === null && currentLanguage === null);
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
  
  // Only works in plaintext mode
  if (!shouldUseAutolinker()) return;
  
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

// Debounce function for performance
function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Track current detected language
let currentLanguage = null;

// Update highlight toggle button state
function updateHighlightToggle() {
  const span = highlightToggle.querySelector('span');
  if (highlightingEnabled) {
    highlightToggle.classList.remove('disabled');
    highlightToggle.title = 'Disable syntax highlighting';
    span.textContent = 'syntax on';
  } else {
    highlightToggle.classList.add('disabled');
    highlightToggle.title = 'Enable syntax highlighting';
    span.textContent = 'syntax off';
  }
}

// Toggle syntax highlighting
function toggleHighlighting() {
  highlightingEnabled = !highlightingEnabled;
  localStorage.setItem(HIGHLIGHT_KEY, highlightingEnabled ? 'true' : 'false');
  updateHighlightToggle();
  applyHighlighting();
}

// Highlight toggle click handler
highlightToggle.addEventListener('click', toggleHighlighting);

// Apply highlighting based on current language (manual or detected)
function applyHighlighting() {
  const text = editor.value;
  
  if (!text.trim()) {
    highlightLayer.innerHTML = '';
    highlightLayer.className = '';
    currentLanguage = null;
    updateIndicator('plaintext');
    updateHighlightLayerPointerEvents();
    return;
  }

  // If highlighting is disabled, show plain text (with autolinker if applicable)
  if (!highlightingEnabled) {
    // Still detect language for indicator but don't highlight
    if (manualLanguage) {
      if (manualLanguage === 'plaintext') {
        highlightLayer.innerHTML = applyAutolinker(text);
      } else {
        highlightLayer.innerHTML = escapeHtml(text);
      }
      highlightLayer.className = '';
      updateIndicator(manualLanguage);
    } else {
      try {
        const result = hljs.highlightAuto(text);
        if (meetsConfidenceThreshold(result.relevance, text) && result.language) {
          currentLanguage = result.language;
          highlightLayer.innerHTML = escapeHtml(text);
          updateIndicator(result.language);
        } else {
          currentLanguage = null;
          highlightLayer.innerHTML = applyAutolinker(text);
          updateIndicator('plaintext');
        }
      } catch (e) {
        currentLanguage = null;
        highlightLayer.innerHTML = applyAutolinker(text);
        updateIndicator('plaintext');
      }
    }
    highlightLayer.className = '';
    updateHighlightLayerPointerEvents();
    return;
  }

  if (manualLanguage) {
    // Use manually selected language
    if (manualLanguage === 'plaintext') {
      // Plaintext with autolinker
      highlightLayer.innerHTML = applyAutolinker(text);
      highlightLayer.className = '';
      currentLanguage = null;
      updateIndicator('plaintext');
    } else {
      try {
        const result = hljs.highlight(text, { language: manualLanguage });
        currentLanguage = manualLanguage;
        highlightLayer.innerHTML = result.value;
        highlightLayer.className = `hljs language-${manualLanguage}`;
        updateIndicator(manualLanguage);
      } catch (e) {
        highlightLayer.innerHTML = applyAutolinker(text);
        highlightLayer.className = '';
        updateIndicator('plaintext');
      }
    }
  } else {
    // Auto-detect
    detectAndHighlight();
  }
  updateHighlightLayerPointerEvents();
}

// Update the language indicator display
function updateIndicator(lang) {
  // Show "auto: LANGUAGE" when in auto-detect mode and a language was detected
  if (manualLanguage === null && lang !== 'plaintext') {
    languageIndicator.textContent = 'auto: ' + lang;
  } else {
    languageIndicator.textContent = lang;
  }
  languageIndicator.classList.add('visible');
  
  if (lang === 'plaintext') {
    highlightToggle.classList.remove('visible');
  } else {
    highlightToggle.classList.add('visible');
  }
  
  // darkToggle.classList.add('visible');
  updateRuffButton();
  updateSqlFormatButton();
  updatePrettierButton();
}

// Immediately update display (plain text or re-apply current highlighting)
function updateDisplayImmediate() {
  const text = editor.value;
  
  if (!text.trim()) {
    highlightLayer.innerHTML = '';
    highlightLayer.className = '';
    currentLanguage = null;
    updateIndicator('plaintext');
    updateHighlightLayerPointerEvents();
    return;
  }

  // If highlighting is disabled, show plain text (with autolinker for plaintext)
  if (!highlightingEnabled) {
    if (shouldUseAutolinker()) {
      highlightLayer.innerHTML = applyAutolinker(text);
    } else {
      highlightLayer.innerHTML = escapeHtml(text);
    }
    updateHighlightLayerPointerEvents();
    return;
  }

  const langToUse = manualLanguage || currentLanguage;
  if (langToUse && langToUse !== 'plaintext') {
    // Re-apply known language highlighting immediately
    try {
      const result = hljs.highlight(text, { language: langToUse });
      highlightLayer.innerHTML = result.value;
    } catch (e) {
      highlightLayer.innerHTML = applyAutolinker(text);
    }
  } else {
    // No language detected yet or plaintext, use autolinker
    highlightLayer.innerHTML = applyAutolinker(text);
  }
  updateHighlightLayerPointerEvents();
}

// Expensive language detection (debounced)
function detectAndHighlight() {
  const text = editor.value;
  
  if (!text.trim()) {
    currentLanguage = null;
    updateIndicator('plaintext');
    updateDevMetrics({}, '');
    updateHighlightLayerPointerEvents();
    return;
  }

  // If manual language is set, show metrics for that language
  if (manualLanguage) {
    try {
      const result = hljs.highlight(text, { language: manualLanguage });
      // For manual highlighting, add language to result since it's not auto-detected
      result.language = manualLanguage;
      updateDevMetrics(result, text);
    } catch (e) {
      updateDevMetrics({ language: manualLanguage }, text);
    }
    updateHighlightLayerPointerEvents();
    return;
  }

  try {
    const result = hljs.highlightAuto(text);
    updateDevMetrics(result, text);
    
    if (meetsConfidenceThreshold(result.relevance, text) && result.language) {
      currentLanguage = result.language;
      highlightLayer.innerHTML = result.value;
      highlightLayer.className = `hljs language-${result.language}`;
      updateIndicator(result.language);
    } else {
      currentLanguage = null;
      highlightLayer.innerHTML = applyAutolinker(text);
      highlightLayer.className = '';
      updateIndicator('plaintext');
    }
  } catch (e) {
    currentLanguage = null;
    highlightLayer.innerHTML = applyAutolinker(text);
    highlightLayer.className = '';
    updateIndicator('plaintext');
    updateDevMetrics({}, text);
  }
  updateHighlightLayerPointerEvents();
}

// Sync scroll between editor and highlight layer
function syncScroll() {
  const pre = document.getElementById('highlight-layer');
  pre.scrollTop = editor.scrollTop;
  pre.scrollLeft = editor.scrollLeft;
}

// Debounced language detection
const debouncedDetect = debounce(detectAndHighlight, 300);

// Initialize from active tab
const initialTab = getActiveTab();
if (initialTab) {
  editor.value = initialTab.content || '';
  manualLanguage = initialTab.language;
  if (manualLanguage) {
    localStorage.setItem(LANG_KEY, manualLanguage);
  }
}

updateHighlightToggle();
renderTabs();
applyHighlighting();

editor.addEventListener('input', () => {
  // Save to current tab
  const currentTab = getActiveTab();
  if (currentTab) {
    currentTab.content = editor.value;
    saveTabs();
  }
  // Also save to legacy key for compatibility with CLI
  localStorage.setItem(KEY, editor.value);
  updateDisplayImmediate();  // Instant text update
  debouncedDetect();         // Delayed language detection
});

editor.addEventListener('scroll', syncScroll);

