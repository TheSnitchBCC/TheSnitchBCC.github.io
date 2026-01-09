/* create-article.js
   Readable & commented.
   Key focus: font/font-size reliability (no flicker during typing), menus stay open,
   marker-based insert for images/tables, autosave 5s.
*/

/* -------------------- Configuration -------------------- */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = "https://roqlhnyveyzjriawughf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcWxobnl2ZXl6anJpYXd1Z2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3ODUwNTQsImV4cCI6MjA3NTM2MTA1NH0.VPie8b5quLIeSc_uEUheJhMXaupJWgxzo3_ib3egMJk";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const IMAGE_BUCKET = "Images";
const AUTOSAVE_MS = 5000; // 5 seconds

/* -------------------- DOM references -------------------- */
const editor = document.getElementById("editor");
const titleInput = document.getElementById("titleInput");
const statusEl = document.getElementById("status");
const lastSavedEl = document.getElementById("lastSaved");
const backBtn = document.getElementById("backBtn");
const publishBtn = document.getElementById("publishBtn");
const toolbar = document.getElementById("toolbar");
const imageInput = document.getElementById("imageInput");
const docImport = document.getElementById("docImport");
const fontSelect = document.getElementById("fontSelect");
const fontSizeBtn = document.getElementById("fontSizeBtn");
const fontSizeMenu = document.getElementById("fontSizeMenu");
const sizeItems = Array.from(document.querySelectorAll(".size-item"));
const linkBtn = document.getElementById("linkBtn");
const supBtn = document.getElementById("supBtn");
const subBtn = document.getElementById("subBtn");
const tableBtn = document.getElementById("tableBtn");
const tableMenu = document.getElementById("tableMenu");
const tableGrid = document.getElementById("tableGrid");
const gridHint = document.getElementById("gridHint");
const editors = document.getElementById("editors");

/* -------------------- Local state -------------------- */
let savedRange = null;              // last saved Range (clone)
let quickSaveTimer = null;
let saveLock = false;
let currentUser = null;
let currentDraftId = localStorage.getItem("editingArticleId") || null;

/* Tracks last interaction type to decide when to sync toolbar.
   - 'pointer' when the user clicked/tapped
   - 'nav' when using arrow/home/end/page keys
   - 'typing' for regular character keys
*/
let lastInteraction = null;

/* Undo/Redo state management */
const MAX_HISTORY = 100;
const HISTORY_BATCH_DELAY = 1000; // 1 second batching delay, similar to Google Docs
const history = {
  undoStack: [],
  redoStack: [],
  currentContent: '',
  isProcessing: false,
  batchTimer: null,
  lastKeyTime: 0,
  lastWordBreak: false,
  
  // Helper to check if this is a word-breaking character
  isWordBreak(e) {
    return (
      e.key === ' ' || 
      e.key === '.' || 
      e.key === ',' || 
      e.key === '!' || 
      e.key === '?' || 
      e.key === ';' || 
      e.key === ':' || 
      e.key === 'Enter' ||
      e.key === 'Tab'
    );
  },
  
  // Save current state to undo stack
  saveState(immediate = false) {
    if (this.isProcessing) return;
    
    const content = editor.innerHTML;
    if (content === this.currentContent) return;
    
    // Clear any pending batch save
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    const save = () => {
      this.undoStack.push(this.currentContent);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.currentContent = content;
      this.redoStack = []; // Clear redo stack when new change is made
      this.updateButtons();
    };
    
    if (immediate) {
      save();
    } else {
      // Schedule a batched save
      this.batchTimer = setTimeout(save, HISTORY_BATCH_DELAY);
    }
  },
  
  // Restore state from undo stack
  undo() {
    if (this.isProcessing || this.undoStack.length === 0) return;
    this.isProcessing = true;
    
    this.redoStack.push(this.currentContent);
    const content = this.undoStack.pop();
    editor.innerHTML = content;
    this.currentContent = content;
    
    this.isProcessing = false;
    this.updateButtons();
    editor.focus();
  },
  
  // Restore state from redo stack
  redo() {
    if (this.isProcessing || this.redoStack.length === 0) return;
    this.isProcessing = true;
    
    this.undoStack.push(this.currentContent);
    const content = this.redoStack.pop();
    editor.innerHTML = content;
    this.currentContent = content;
    
    this.isProcessing = false;
    this.updateButtons();
    editor.focus();
  },
  
  // Update undo/redo button states
  updateButtons() {
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }
};

/* -------------------- Small helpers -------------------- */
function setStatus(t) { if (statusEl) statusEl.textContent = t || ""; }
function setLastSaved(ts) { if (lastSavedEl) lastSavedEl.textContent = ts ? `Last saved: ${new Date(ts).toLocaleTimeString()}` : "—"; }
function escapeHtml(s) { return String(s || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function nowId(prefix='x'){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

/* -------------------- Selection save / restore -------------------- */
/* Save a clone of the current selection range (or null) */
function saveSelection(){
  try {
    const s = window.getSelection();
    if (s && s.rangeCount) savedRange = s.getRangeAt(0).cloneRange();
    else savedRange = null;
  } catch (e){
    savedRange = null;
  }
}

/* Restore the previously saved range if still valid; otherwise, place caret at end */
function restoreSelection(){
  try {
    const s = window.getSelection();
    s.removeAllRanges();
    if (savedRange) {
      const sc = savedRange.startContainer;
      if (sc && document.contains(sc)) {
        s.addRange(savedRange);
      } else {
        // fallback: put caret at end of editor
        const r = document.createRange();
        if (editor.lastChild) { r.setStartAfter(editor.lastChild); r.collapse(true); s.addRange(r); }
        else editor.focus();
      }
    }
    editor.focus();
  } catch (e) {
    try { editor.focus(); } catch (__) {}
  }
}

/* Place caret helpers used after inserting content */
function placeCaretAt(node, offset = 0){
  try {
    const r = document.createRange();
    if (node.nodeType === Node.TEXT_NODE) r.setStart(node, Math.min(offset, node.length));
    else if (node.childNodes && node.childNodes[0]) r.setStart(node.childNodes[0], 0);
    else r.setStartAfter(node);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    editor.focus();
  } catch (e) {}
}
function placeCaretAfterNode(node){
  try {
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    editor.focus();
  } catch (e) {}
}

/* Extract HTML for the current selection */
function getSelectionHtml(){
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const range = sel.getRangeAt(0);
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  return container.innerHTML;
}

/* -------------------- Typing-span (when selection is collapsed) --------------------
   When the selection is collapsed and the user chooses a style (font/f-size),
   we insert a zero-width span with that style and place the caret inside it.
   This guarantees the next typed character inherits the style immediately
   (no flicker of the old font while typing).
*/
function insertTypingSpanHtml(styleObj){
  const id = nowId('ts');
  const style = Object.entries(styleObj || {}).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${v};`).join('');
  const html = `<span id="${id}" class="typing-span" style="${style}">\u200B</span>`;
  document.execCommand('insertHTML', false, html);

  const el = editor.querySelector(`#${id}`);
  if (el) {
    // If there's a text node (the zero-width space), put caret after it so typing replaces it and inherits style
    if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
      // place caret after the zero-width character (offset 1)
      placeCaretAt(el.firstChild, 1);
    } else if (el.firstChild) {
      // fallback: place caret inside first child
      placeCaretAt(el.firstChild, 0);
    } else {
      // empty span — place caret inside it
      placeCaretAfterNode(el);
    }
    // remove id so future queries don't find it
    el.removeAttribute('id');
    return el;
  }
  return null;
}

/* Apply style to current selection or insert typing span if selection collapsed */
function applyStyle(styleObj){
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      insertTypingSpanHtml(styleObj);
      scheduleQuickSave();
      return;
    }

    const range = sel.getRangeAt(0);

    // collapsed => keep typing-span behavior (but that function now places caret correctly)
    if (range.collapsed) {
      insertTypingSpanHtml(styleObj);
      scheduleQuickSave();
      return;
    }

    // Non-collapsed selection: replace with a real span and ensure caret sits inside it before a zwsp
    const style = Object.entries(styleObj || {})
      .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v};`)
      .join('');

    // Extract the selected contents
    const contents = range.extractContents();

    // Create the styled span and move extracted contents into it
    const span = document.createElement('span');
    if (style) span.setAttribute('style', style);
    span.appendChild(contents);

    // Append a zero-width space sentinel so we can place caret reliably inside the span
    const zw = document.createTextNode('\u200B');
    span.appendChild(zw);

    // Insert the span where the selection was
    range.insertNode(span);

    // Normalize to merge text nodes if necessary
    span.normalize();

    // Place caret just before the zero-width sentinel (i.e., inside the span)
    const s2 = window.getSelection();
    const r2 = document.createRange();
    // zw is a text node we just appended, so set caret at offset 0 of zw (before it) -> inside span
    r2.setStart(zw, 0);
    r2.collapse(true);
    s2.removeAllRanges();
    s2.addRange(r2);

    scheduleQuickSave();
  } catch (err) {
    // fallback to previous execCommand approach if anything fails
    try {
      const sel = window.getSelection();
      const style = Object.entries(styleObj || {}).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${v};`).join('');
      const selHtml = getSelectionHtml();
      const wrapped = `<span style="${style}">${selHtml}</span>`;
      document.execCommand('insertHTML', false, wrapped);
      scheduleQuickSave();
    } catch (e) {
      console.error('applyStyle fallback failed', e);
    }
  }
}


/* -------------------- Toolbar wiring -------------------- */

/* Save selection when interacting with toolbar controls (so we can restore later) */
if (toolbar) {
  toolbar.addEventListener('pointerdown', (e) => {
    // if user interacts with selects or menus, preserve selection
    if (e.target.closest("select")) { saveSelection(); return; }
    saveSelection();
  });

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest("[data-cmd]");
    if (!btn) return;
    e.preventDefault();
    const cmd = btn.dataset.cmd;
    const val = btn.dataset.val ?? null;

    try {
      if (cmd === 'createLink') openLinkPrompt();
      else if (cmd === 'undo') execCommandWithRestore(()=>document.execCommand('undo'));
      else if (cmd === 'redo') execCommandWithRestore(()=>document.execCommand('redo'));
      else if (cmd === 'superscript') execCommandWithRestore(()=>document.execCommand('superscript'));
      else if (cmd === 'subscript') execCommandWithRestore(()=>document.execCommand('subscript'));
      else execCommandWithRestore(()=> {
        if (/justifyFull/i.test(cmd)) return;
        if (val !== null && val !== "null") document.execCommand(cmd, false, val);
        else document.execCommand(cmd);
      });
    } catch (err) {
      console.warn('toolbar cmd failed', err);
    }

    updateToolbarState();
    scheduleQuickSave();
    editor.focus();
  });
}

/* Update visual active state for simple toggle buttons (bold/italic/etc) */
function updateToolbarState(){
  if (!toolbar) return;
  toolbar.querySelectorAll('.tb').forEach(el => {
    const cmd = el.dataset.cmd;
    if (!cmd) return;
    try {
      const active = document.queryCommandState(cmd);
      el.classList.toggle('active', !!active);
    } catch {
      el.classList.remove('active');
    }
  });
}

/* -------------------- Font family & Font size behavior --------------------
   Goal: font and font-size should:
     - Save the selection when the menu/button is engaged
     - Restore selection and apply the chosen style
     - If selection was collapsed, create typing-span so next character uses style immediately
     - Avoid toolbar-sync that runs during typing (we only sync on pointer/nav)
*/

/* FONT family */
if (fontSelect) {
  fontSelect.addEventListener('pointerdown', () => saveSelection());
  fontSelect.addEventListener('change', (e) => {
    restoreSelection();
    // Get current styles to preserve
    const el = getElementAtCaret();
    const cs = el && el.nodeType === 1 ? window.getComputedStyle(el) : null;
    
    // Create style object with new font family while preserving other styles
    const style = { fontFamily: e.target.value };
    if (cs) {
      if (cs.fontSize) style.fontSize = cs.fontSize;
      if (cs.fontWeight !== 'normal') style.fontWeight = cs.fontWeight;
      if (cs.fontStyle !== 'normal') style.fontStyle = cs.fontStyle;
      
      // Preserve text decorations
      const decorations = [];
      if (cs.textDecoration.includes('underline')) decorations.push('underline');
      if (cs.textDecoration.includes('line-through')) decorations.push('line-through');
      if (decorations.length > 0) style.textDecoration = decorations.join(' ');
    }
    
    applyStyle(style);

    // Restore the exact cursor position after font change
    if (cursorInfo.isCollapsed) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(cursorInfo.startContainer, cursorInfo.startOffset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    editor.focus();
  });
}

/* FONT SIZE */
/* Keep the font-size dropdown open while interacting. Use pointerdown to save the selection
   so the subsequent click on a size will use that saved range.
*/
if (fontSizeBtn && fontSizeMenu) {
  fontSizeBtn.addEventListener('click', (e) => { e.stopPropagation(); saveSelection(); fontSizeMenu.classList.toggle('open'); });

  // Close menu only when clicking outside the dropdown (so it stays open while interacting)
  document.addEventListener('click', (ev) => {
    const inside = ev.target.closest && ev.target.closest('#fontSizeDropdown');
    if (!inside) fontSizeMenu.classList.remove('open');
  });

  // Each size button: pointerdown saves, click applies
  sizeItems.forEach(item => {
    item.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); saveSelection(); });
    item.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const pt = item.dataset.size;
      if (!pt) return;
      
      // restore selection then apply style (typing-span inserted when needed)
      restoreSelection();
      
      // Get current styles to preserve
      const el = getElementAtCaret();
      const cs = el && el.nodeType === 1 ? window.getComputedStyle(el) : null;
      
      // Create style object with new font size while preserving other styles
      const style = { fontSize: `${pt}pt` };
      if (cs) {
        if (cs.fontFamily) style.fontFamily = cs.fontFamily;
        if (cs.fontWeight !== 'normal') style.fontWeight = cs.fontWeight;
        if (cs.fontStyle !== 'normal') style.fontStyle = cs.fontStyle;
        
        // Preserve text decorations
        const decorations = [];
        if (cs.textDecoration.includes('underline')) decorations.push('underline');
        if (cs.textDecoration.includes('line-through')) decorations.push('line-through');
        if (decorations.length > 0) style.textDecoration = decorations.join(' ');
      }
      
      applyStyle(style);

      // update UI
      fontSizeBtn.textContent = `${pt}pt ▾`;
      sizeItems.forEach(x => x.classList.toggle('active', x === item));
      editor.focus();

      // close the menu now that choice is made
      fontSizeMenu.classList.remove('open');
    });
  });
}

/* -------------------- Sup/Sub and Undo/Redo -------------------- */
function executeScriptCommand(isSuper) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const elementType = isSuper ? 'sup' : 'sub';
  
  // Get the current sup/sub element if we're in one
  const currentScriptEl = getElementAtCaret().closest('sup,sub');
  const isInSameType = currentScriptEl?.tagName.toLowerCase() === elementType;
  
  // If we're in a script element
  if (currentScriptEl) {
    if (range.collapsed) {
      if (isInSameType) {
        // If we're in the same type (sup in sup or sub in sub), move cursor out
        // but keep the formatting of existing text
        const newTextNode = document.createTextNode('\u200B');
        currentScriptEl.parentNode.insertBefore(newTextNode, currentScriptEl.nextSibling);
        
        // Place cursor in new text node
        const newRange = document.createRange();
        // Move cursor one position to the right after exiting
        newRange.setStart(newTextNode, 1);
        sel.removeAllRanges();
        sel.addRange(newRange);
        
        // Clean up any empty text nodes
        if (currentScriptEl.textContent === '\u200B') {
          currentScriptEl.remove();
        }
      } else {
        // If we're in a different type (sub in sup or vice versa), switch types
        // Create new script element for typing
        const newScriptEl = document.createElement(elementType);
        newScriptEl.textContent = '\u200B';
        currentScriptEl.parentNode.insertBefore(newScriptEl, currentScriptEl.nextSibling);
        
        // Place cursor in new element
        const newRange = document.createRange();
        newRange.setStart(newScriptEl.firstChild, 1);
        sel.removeAllRanges();
        sel.addRange(newRange);
        
        // Clean up any empty previous script elements
        if (currentScriptEl.textContent === '\u200B') {
          currentScriptEl.remove();
        }
      }
    } else {
      // If there's a selection and we're in a script element
      if (isInSameType) {
        // If same type, remove formatting
        const text = range.toString();
        const newText = document.createTextNode(text);
        range.deleteContents();
        range.insertNode(newText);
        
        // Select the new text
        range.selectNode(newText);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // If different type, switch formatting
        const text = range.toString();
        const newScriptEl = document.createElement(elementType);
        newScriptEl.textContent = text;
        range.deleteContents();
        range.insertNode(newScriptEl);
        
        // Select the new content
        range.selectNodeContents(newScriptEl);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  } else {
    // We're not in any script element
    if (range.collapsed) {
      // Creating new script element for typing
      const scriptEl = document.createElement(elementType);
      scriptEl.textContent = '\u200B';
      range.insertNode(scriptEl);
      
      // Place cursor inside the element after the zero-width space
      const newRange = document.createRange();
      newRange.setStart(scriptEl.firstChild, 1);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      // Wrapping selected text in script element
      const scriptEl = document.createElement(elementType);
      range.surroundContents(scriptEl);
      
      // Keep selection
      range.selectNodeContents(scriptEl);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  
  // Save state and update UI
  history.saveState(true);
  updateToolbarFromCaret();
  scheduleQuickSave();
}

if (supBtn) {
  supBtn.addEventListener('click', () => {
    executeScriptCommand(true);
  });
}

if (subBtn) {
  subBtn.addEventListener('click', () => {
    executeScriptCommand(false);
  });
}

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    history.undo();
    scheduleQuickSave();
  });
}
if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    history.redo();
    scheduleQuickSave();
  });
}

/* -------------------- Supabase helper to upload files -------------------- */
async function uploadFileToBucket(bucket, file, destPrefix = ""){
  if (!supabase) throw new Error('Supabase client unavailable');
  const safe = (file.name || 'file').replace(/\s+/g,'_');
  const fileName = `${destPrefix}${Date.now()}_${Math.random().toString(36).slice(2,8)}_${safe}`;
  const { data, error } = await supabase.storage.from(bucket).upload(fileName, file);
  if (error) throw error;
  const { data: urlData } = await supabase.storage.from(bucket).getPublicUrl(data.path || fileName);
  return urlData?.publicUrl || urlData?.public_url || null;
}

/* -------------------- Marker helpers (insert at saved caret) --------------------
   When the user clicks Insert image/table, we immediately create a tiny marker element
   at the savedRange. After upload / table build completes, we replace that marker with HTML.
*/
function createMarkerAtSavedRange(){
  try {
    const id = nowId('m');
    const span = document.createElement('span');
    span.id = id;
    span.style.display = 'inline-block';
    span.style.width = '0px';
    span.style.height = '0px';
    span.style.overflow = 'hidden';
    span.setAttribute('data-marker', '1');

    if (savedRange) {
      const r = savedRange.cloneRange();
      r.collapse(true);
      r.insertNode(span);
    } else {
      // fallback
      editor.appendChild(span);
    }
    return id;
  } catch (e) {
    return null;
  }
}
function findMarker(id){ if (!id) return null; return editor.querySelector(`#${id}`); }
function replaceMarkerWithHtml(id, html){
  const marker = findMarker(id);
  if (!marker) { document.execCommand('insertHTML', false, html); return null; }
  const frag = document.createRange().createContextualFragment(html);
  marker.parentNode.insertBefore(frag, marker);
  const next = marker.nextSibling;
  marker.parentNode.removeChild(marker);
  return next;
}

/* -------------------- Image insertion (marker-based) --------------------
   - When the label/button for the file input is pressed we save the selection and insert a marker.
   - After upload completes we replace marker with <img>.
*/
let pendingImageMarkerId = null;
if (imageInput) {
  // try to find the visual label to capture pointerdown
  const label = imageInput.closest('label');
  if (label) {
    label.addEventListener('pointerdown', () => { saveSelection(); pendingImageMarkerId = createMarkerAtSavedRange(); });
  } else {
    imageInput.addEventListener('pointerdown', () => { saveSelection(); pendingImageMarkerId = createMarkerAtSavedRange(); });
  }

  imageInput.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) {
      // cleanup marker if no file chosen
      if (pendingImageMarkerId) { const m = findMarker(pendingImageMarkerId); if (m) m.remove(); pendingImageMarkerId = null; }
      return;
    }

    setStatus('Uploading image...');
    try {
      const url = await uploadFileToBucket(IMAGE_BUCKET, f, currentUser?.id ? `${currentUser.id}_` : '');
      if (!url) throw new Error('No URL returned');
      const html = `<img src="${url}" style="max-width:100%;margin:8px 0;border-radius:6px">`;
      const inserted = replaceMarkerWithHtml(pendingImageMarkerId, html);

      // place caret after the inserted image (best-effort)
      if (inserted) {
        if (inserted.nodeType === Node.ELEMENT_NODE && inserted.tagName === 'IMG') placeCaretAfterNode(inserted);
        else placeCaretAfterNode(inserted.previousSibling || inserted);
      }

      scheduleQuickSave();
      setStatus('Image uploaded');
    } catch (err) {
      // cleanup marker
      const m = findMarker(pendingImageMarkerId);
      if (m) m.remove();
      console.error('Image upload failed', err);
      setStatus('Image upload failed');
      alert('Image upload failed: ' + err);
    } finally {
      pendingImageMarkerId = null;
      imageInput.value = '';
    }
  });
}

/* -------------------- Paste & drop image handlers (insert at current caret) -------------------- */
if (editor) {
  editor.addEventListener('paste', async (ev) => {
    const items = ev.clipboardData?.items;
    if (items) {
      for (const it of items) {
        if (it.type && it.type.indexOf('image') !== -1) {
          ev.preventDefault();
          const f = it.getAsFile();
          setStatus('Uploading image...');
          try {
            const url = await uploadFileToBucket(IMAGE_BUCKET, f, currentUser?.id ? `${currentUser.id}_` : '');
            document.execCommand('insertHTML', false, `<img src="${url}" style="max-width:100%;margin:8px 0;border-radius:6px">`);
            scheduleQuickSave();
            setStatus('Image uploaded');
          } catch (err) {
            console.error('paste upload failed', err);
            setStatus('Image upload failed');
          }
        }
      }
    }
    setTimeout(() => { autoLinkifyInEditor(); scheduleQuickSave(); }, 40);
  });

  editor.addEventListener('dragover', e => e.preventDefault());
  editor.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const f of files) {
      if (f.type && f.type.indexOf('image') !== -1) {
        setStatus('Uploading image...');
        try {
          const url = await uploadFileToBucket(IMAGE_BUCKET, f, currentUser?.id ? `${currentUser.id}_` : '');
          document.execCommand('insertHTML', false, `<img src="${url}" style="max-width:100%;margin:8px 0;border-radius:6px">`);
          scheduleQuickSave();
          setStatus('Image uploaded');
        } catch (err) {
          console.error('drop upload failed', err);
          setStatus('Image upload failed');
        }
      }
    }
  });
}

/* -------------------- Table hover-grid insertion (marker-based) -------------------- */
let pendingTableMarkerId = null;
(function buildTableGrid(){
  if (!tableGrid) return;
  tableGrid.innerHTML = '';
  const MAX = 8;
  for (let r = 1; r <= MAX; r++) {
    for (let c = 1; c <= MAX; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      tableGrid.appendChild(cell);
    }
  }

  // hover highlighting & hint
  tableGrid.addEventListener('mousemove', (ev) => {
    const cell = ev.target.closest('.cell');
    if (!cell) return;
    const r = parseInt(cell.dataset.r, 10), c = parseInt(cell.dataset.c, 10);
    Array.from(tableGrid.children).forEach(ch => {
      const rr = parseInt(ch.dataset.r, 10), cc = parseInt(ch.dataset.c, 10);
      ch.classList.toggle('active', rr <= r && cc <= c);
    });
    gridHint.textContent = `${r} × ${c}`;
  });

  tableGrid.addEventListener('mouseleave', () => {
    Array.from(tableGrid.children).forEach(ch => ch.classList.remove('active'));
    gridHint.textContent = '0 × 0';
  });

  // clicking a cell inserts the table at the saved marker
  tableGrid.addEventListener('click', (ev) => {
    const cell = ev.target.closest('.cell');
    if (!cell) return;
    const r = parseInt(cell.dataset.r, 10), c = parseInt(cell.dataset.c, 10);
    const id = nowId('tbl');
    const markerId = pendingTableMarkerId || createMarkerAtSavedRange();

    // build table html (black grid lines)
    let html = `<table class="inserted-table" data-ins="${id}" style="border-collapse:collapse;width:100%;border:1px solid #000;border-radius:6px;overflow:hidden;">`;
    for (let i = 0; i < r; i++) {
      html += '<tr>';
      for (let j = 0; j < c; j++) {
        html += '<td style="border:1px solid #000;padding:10px;"><p><br></p></td>';
      }
      html += '</tr>';
    }
    html += '</table><p><br></p>';

    replaceMarkerWithHtml(markerId, html);

    // place caret in first cell
    setTimeout(() => {
      const tbl = editor.querySelector(`table[data-ins="${id}"]`);
      if (tbl) {
        tbl.removeAttribute('data-ins');
        const firstTd = tbl.querySelector('td');
        if (firstTd) {
          const p = firstTd.querySelector('p');
          if (p && p.firstChild) placeCaretAt(p.firstChild, 0);
          else placeCaretAfterNode(firstTd);
        }
      }
      scheduleQuickSave();
    }, 10);

    pendingTableMarkerId = null;
    if (tableMenu) tableMenu.classList.remove('open');
  });

  // when the table button is pressed create marker so insert location is preserved
  if (tableBtn) {
    tableBtn.addEventListener('pointerdown', () => { saveSelection(); pendingTableMarkerId = createMarkerAtSavedRange(); });
    tableBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!pendingTableMarkerId) pendingTableMarkerId = createMarkerAtSavedRange();
      tableMenu.classList.toggle('open');
    });
  }

  document.addEventListener('click', () => { if (tableMenu) tableMenu.classList.remove('open'); });
})();

/* -------------------- Link insertion -------------------- */
function openLinkPrompt(){
  saveSelection();
  const url = prompt('Enter URL (include https://):', '');
  if (!url) return;
  restoreSelection();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    const html = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
    document.execCommand('insertHTML', false, html);
    scheduleQuickSave();
    return;
  }
  const range = sel.getRangeAt(0);
  if (range.collapsed) {
    const html = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
    document.execCommand('insertHTML', false, html);
    scheduleQuickSave();
    return;
  }
  try {
    document.execCommand('createLink', false, url);
  } catch (e) {
    const selHtml = getSelectionHtml();
    const wrapped = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${selHtml}</a>`;
    document.execCommand('insertHTML', false, wrapped);
  }
  scheduleQuickSave();
}
if (linkBtn) linkBtn.addEventListener('click', (e) => { e.preventDefault(); openLinkPrompt(); });

/* Long-lived link popup (unchanged behavior) */
(function buildLinkPopup(){
  if (!editor) return;
  const existing = document.getElementById('editor-link-popup'); if (existing) existing.remove();
  const popup = document.createElement('div');
  popup.id = 'editor-link-popup';
  popup.textContent = 'Open link';
  Object.assign(popup.style, { position:'fixed', zIndex:99999, padding:'8px 12px', borderRadius:'10px', background:'var(--card)', color:'var(--text)', display:'none', boxShadow:'0 12px 34px rgba(0,0,0,0.6)', cursor:'pointer', fontSize:'13px', border:'1px solid rgba(255,255,255,0.1)' });
  document.body.appendChild(popup);
  let currentAnchor = null, hideTimer = null;
  const HIDE_DELAY = 2200, LEAVE_DELAY = 1500;
  document.addEventListener('mouseover', (ev) => {
    const a = ev.target.closest && ev.target.closest('a');
    if (!a || !editor.contains(a)) return;
    currentAnchor = a;
    const rect = a.getBoundingClientRect();
    const left = Math.min(window.innerWidth - popup.offsetWidth - 10, rect.right + 8);
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(8, rect.top)}px`;
    popup.style.display = 'block';
    if (hideTimer) clearTimeout(hideTimer);
  });
  document.addEventListener('mouseout', (ev) => {
    if (ev.relatedTarget === popup || (ev.relatedTarget && popup.contains(ev.relatedTarget))) return;
    hideTimer = setTimeout(()=>{ popup.style.display = 'none'; currentAnchor = null; }, HIDE_DELAY);
  });
  popup.addEventListener('mouseenter', ()=>{ if (hideTimer) clearTimeout(hideTimer); });
  popup.addEventListener('mouseleave', ()=>{ hideTimer = setTimeout(()=>{ popup.style.display = 'none'; currentAnchor = null; }, LEAVE_DELAY); });
  popup.addEventListener('click', ()=>{ if (currentAnchor && currentAnchor.href) window.open(currentAnchor.href, '_blank', 'noopener'); popup.style.display = 'none'; currentAnchor = null; });
})();

/* -------------------- Auto-linkify -------------------- */
function autoLinkifyInEditor(){
  if (!editor) return;
  const urlRegex = /(?:(https?:\/\/)[^\s<]+)/g;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(tn => {
    if (!tn.nodeValue) return;
    const parent = tn.parentNode;
    if (parent && parent.nodeName === 'A') return;
    const matches = tn.nodeValue.match(urlRegex);
    if (!matches) return;
    const html = tn.nodeValue.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
    const frag = document.createRange().createContextualFragment(html);
    parent.replaceChild(frag, tn);
  });
}

/* -------------------- DOCX import (docx-preview) -------------------- */
async function hashBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleDocImport(file) {
  if (!file) return;
  setStatus('Importing document...');
  const name = (file.name || '').toLowerCase();

  function escapeHtml(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  try {
    let html = '';

    if (/\.txt$/i.test(name)) {
      const text = await file.text();
      html = `<div>${escapeHtml(text).replace(/\n/g,'<br>')}</div>`;
    } else if (/\.docx$/i.test(name)) {
      if (window.mammoth && window.mammoth.convertToHtml) {
        const buf = await file.arrayBuffer();
        const r = await window.mammoth.convertToHtml({ arrayBuffer: buf });
        html = r.value || '';
      } else {
        throw new Error('DOCX requires mammoth.js');
      }
    } else {
      throw new Error('Unsupported file type');
    }

    const clean = sanitize(html);
    setStatus(`Imported ${file.name}`);
    return clean;
  } catch (e) {
    setStatus('Failed to import document');
    throw e;
  }
}

if (docImport) docImport.addEventListener('change', (ev) => { const f = ev.target.files?.[0]; if (f) handleDocImport(f).finally(()=> docImport.value=''); });

async function loadDraft() {
  if (!currentDraftId) {
    try {
      const payload = {
        html: '<h1>Untitled</h1><p></p>',
        updated_at: new Date().toISOString(),
        title_image: null,
        editors: null
      };
      const { data, error } = await supabase
        .from('articles_in_progress')
        .insert([payload])
        .select('id')
        .single();
      if (error) throw error;
      currentDraftId = data.id;
      localStorage.setItem('editingArticleId', currentDraftId);
    } catch (err) {
      console.error('create draft failed', err);
      alert('Could not create draft');
      return;
    }
  }

  try {
    const { data, error } = await supabase
      .from('articles_in_progress')
      .select('id, html, updated_at, title_image, editors')
      .eq('id', currentDraftId)
      .single();

    if (error) throw error;

    const tmp = document.createElement('div');
    tmp.innerHTML = data.html || '<h1>Untitled</h1><p></p>';
    const h1 = tmp.querySelector('h1');
    if (h1) {
      titleInput.value = h1.textContent;
      h1.remove();
    } else titleInput.value = 'Untitled';
    editor.innerHTML = tmp.innerHTML || '<p></p>';

    // 💬 Load title image if available
    if (data.title_image) {
      previewImg.src = data.title_image;
      previewContainer.style.display = 'block';
      uploadText.textContent = '✅ Image Loaded';
      window.titleImage = data.title_image;
    } else {
      previewContainer.style.display = 'none';
      window.titleImage = null;
      uploadText.textContent = '📸 Upload or Drop Title Image';
    }

    editors.value = data.editors;

    setStatus('Loaded');
    setLastSaved(data.updated_at);
    autoLinkifyInEditor();
  } catch (e) {
    console.error('loadDraft error', e);
    alert('Failed to load draft');
  }
}

async function saveDraft() {
  if (saveLock) return;
  saveLock = true;
  try {
    const title = (titleInput.value || '').trim() || 'Untitled';
    const body = editor.innerHTML || '<p></p>';
    const savedHtml = `<h1>${escapeHtml(title)}</h1>${body}`;
    if (!savedHtml.trim()) { setStatus('Empty — not saved'); saveLock = false; return; }

    const payload = {
      html: savedHtml,
      updated_at: new Date().toISOString(),
      title_image: window.titleImage || null,   // 💬 add image field
      editors: editors.value
    };

    if (!currentDraftId) {
      const { data, error } = await supabase
        .from('articles_in_progress')
        .insert([payload])
        .select('id')
        .single();
      if (error) throw error;
      currentDraftId = data.id;
      localStorage.setItem('editingArticleId', currentDraftId);
    } else {
      const { error } = await supabase
        .from('articles_in_progress')
        .update({
          html: savedHtml,
          updated_at: payload.updated_at,
          title_image: payload.title_image,
          editors: editors.value
        })
        .eq('id', currentDraftId);
      if (error) throw error;
    }

    setStatus('Saved');
    setLastSaved(Date.now());
  } catch (e) {
    console.error('saveDraft error', e);
    setStatus('Error saving');
  } finally {
    saveLock = false;
  }
}

function scheduleQuickSave(){ if (quickSaveTimer) clearTimeout(quickSaveTimer); quickSaveTimer = setTimeout(()=>saveDraft(), 700); }

/* Autosave + save on close */
setInterval(()=>saveDraft(), AUTOSAVE_MS);
window.addEventListener('beforeunload', ()=>{ try { saveDraft(); } catch(_) {} });

async function publishArticle() {
  try {
    await saveDraft();

    const title = (titleInput.value || '').trim() || 'Untitled';
    const body = editor.innerHTML || '<p></p>';
    const savedHtml = `<h1>${escapeHtml(title)}</h1>${body}`;

    const { error } = await supabase.from('articles').insert([
      {
        created_at: new Date().toISOString(),
        visits: 0,
        html: savedHtml,
        title_image: window.titleImage,
        editors: editors.value,
      },
    ]);

    if (error) throw error;

    if (currentDraftId) {
      await supabase.from('articles_in_progress').delete().eq('id', currentDraftId);
      localStorage.removeItem('editingArticleId');
      currentDraftId = null;
    }

    publishBtn.classList.add('pressed');
    setTimeout(() => publishBtn.classList.remove('pressed'), 140);
    alert('Article published successfully!');
    window.location.href = '/drafts-view/';

  } catch (e) {
    console.error('Publish error:', e);
    alert('Publish failed: ' + (e?.message || e));
  }
}

if (backBtn) backBtn.addEventListener('click', async ()=>{ await saveDraft(); window.location.href = '/drafts-view/'; });
if (publishBtn) publishBtn.addEventListener('click', (e)=>{ e.preventDefault(); publishArticle(); });

/* -------------------- Toolbar sync (limited to pointer + navigation) --------------------
   Problem seen previously: syncing toolbar on every tiny selection change (e.g. while typing)
   causes race/flicker. To avoid that, we only run updateToolbarFromCaret when:
     - the user clicked / released pointer inside editor (pointerup)
     - the user used navigation keys (arrow/home/end/page up/down)
     - the editor receives focus
   We ignore selectionchange events that aren't preceded by a pointer or nav event.
*/
function getElementAtCaret(){
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return editor;
  let node = sel.focusNode || sel.anchorNode;
  if (!node) return editor;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!node) return editor;
  if (!editor.contains(node)) return editor;
  return node;
}

/* map px size to nearest pt button */
function findClosestSizeItem(pxSize){
  if (!pxSize) return null;
  const px = parseFloat(pxSize);
  if (!px) return null;
  // 1pt ≈ 1.333333px at 96dpi
  const conv = (pt) => pt * 1.3333333333;
  let best = null, bestDiff = Infinity;
  sizeItems.forEach(item => {
    const pt = parseInt(item.dataset.size, 10);
    const diff = Math.abs(conv(pt) - px);
    if (diff < bestDiff) { bestDiff = diff; best = item; }
  });
  return best;
}

/* update toolbar state from the current caret location */
function updateToolbarFromCaret(){
  try {
    // Get current element for sup/sub checks
    const currentEl = getElementAtCaret();
    
    // simple command toggles (bold/italic/etc)
    ['bold','italic','underline','strikeThrough','superscript','subscript','insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight'].forEach(cmd => {
      const el = toolbar.querySelector(`[data-cmd="${cmd}"]`);
      if (!el) return;
      // Add click handler if not already added
      if (!el.hasEventListener) {
        el.hasEventListener = true;
        el.addEventListener('click', (e) => {
          e.preventDefault();
          if (['bold','italic','underline','strikeThrough'].includes(cmd)) {
            executeFormatCommand(cmd);
          } else if (cmd === 'superscript') {
            executeScriptCommand(true);
          } else if (cmd === 'subscript') {
            executeScriptCommand(false);
          } else {
            document.execCommand(cmd);
          }
          updateToolbarFromCaret();
        });
      }
      try {
        let active = false;
        if (cmd === 'superscript' || cmd === 'subscript') {
          const targetTag = cmd === 'superscript' ? 'sup' : 'sub';
          const sel = window.getSelection();
          
          if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            
            // Get the exact node we're in
            let node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) {
              node = node.parentNode;
            }
            
            // Find the closest script element
            const scriptEl = node.closest('sup,sub');
            
            // Active if we're in the right type of element and it's not an empty marker
            // or if we're about to type in this format
            if (scriptEl) {
              const isMatchingType = scriptEl.tagName.toLowerCase() === targetTag;
              const hasContent = scriptEl.textContent !== '\u200B';
              active = isMatchingType && (hasContent || document.activeElement === editor);
            } else {
              // Also check if we have a zero-width marker right before our cursor
              const prevNode = range.startContainer.previousSibling;
              if (prevNode && prevNode.nodeType === Node.TEXT_NODE && prevNode.textContent === '\u200B') {
                const prevScriptEl = prevNode.parentNode;
                if (prevScriptEl && prevScriptEl.tagName.toLowerCase() === targetTag) {
                  active = true;
                }
              }
            }
          }
        } else {
          active = document.queryCommandState(cmd);
        }
        el.classList.toggle('active', !!active);
      } catch { el.classList.remove('active'); }
    });
  } catch(e){}

  // computed style at caret parent element
  const el = getElementAtCaret();
  const cs = el && el.nodeType === 1 ? window.getComputedStyle(el) : null;

  // font family: try to find the matching option
  if (fontSelect && cs) {
    const fam = cs.fontFamily || '';
    let matched = null;
    for (const opt of Array.from(fontSelect.options)) {
      if (!opt.value) continue;
      const v = opt.value.toLowerCase().replace(/['"]/g,'').trim();
      if (fam.toLowerCase().includes(v)) { matched = opt.value; break; }
    }
    if (matched) fontSelect.value = matched;
  }

  // font-size: find closest button and update the label
  if (fontSizeBtn && cs) {
    const fontSizePx = cs.fontSize; // ex: "16px"
    const closest = findClosestSizeItem(fontSizePx);
    if (closest) {
      sizeItems.forEach(x => x.classList.toggle('active', x === closest));
      fontSizeBtn.textContent = `${closest.dataset.size}pt ▾`;
    } else {
      sizeItems.forEach(x => x.classList.remove('active'));
    }
  }

  // ensure toggles consistent
  updateToolbarState();
}

/* Handle formatting commands */
function executeFormatCommand(cmd) {
  // Get the current element's styles before executing command
  const el = getElementAtCaret();
  const cs = el && el.nodeType === 1 ? window.getComputedStyle(el) : null;
  
  // Store current font and size
  const currentStyles = {};
  if (cs) {
    if (cs.fontFamily) currentStyles.fontFamily = cs.fontFamily;
    if (cs.fontSize) currentStyles.fontSize = cs.fontSize;
  }
  
  // Get the current state of all format commands
  const formatStates = {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    strikeThrough: document.queryCommandState('strikeThrough')
  };
  
  // Execute the requested command
  document.execCommand(cmd);
  
  // After executing command, insert a typing span if selection is collapsed
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.getRangeAt(0).collapsed) {
    // Update the state for the executed command
    formatStates[cmd] = !formatStates[cmd];
    
    // Create style object maintaining all active states
    let style = { ...currentStyles }; // Start with current font/size
    
    // Add formatting styles
    if (formatStates.bold) style.fontWeight = 'bold';
    if (formatStates.italic) style.fontStyle = 'italic';
    
    // Handle text decorations separately to allow multiple
    let textDecorations = [];
    if (formatStates.underline) textDecorations.push('underline');
    if (formatStates.strikeThrough) textDecorations.push('line-through');
    if (textDecorations.length > 0) style.textDecoration = textDecorations.join(' ');
    
    // Insert typing span with combined styles
    insertTypingSpanHtml(style);
  }
  scheduleQuickSave();
}

/* Install event listeners that decide when to run toolbar sync */
document.addEventListener('selectionchange', () => {
  // only sync if lastInteraction indicates pointer or navigation; this prevents typing races.
  if (lastInteraction === 'pointer' || lastInteraction === 'nav') {
    // schedule after microtask to ensure selection is settled
    setTimeout(() => updateToolbarFromCaret(), 0);
  }
  // Always keep last selection snapshot updated
  saveSelection();
});

/* pointer interactions => update toolbar */
editor.addEventListener('pointerup', () => {
  lastInteraction = 'pointer';
  setTimeout(() => updateToolbarFromCaret(), 0);
  saveSelection();
});

/* focus => update once */
editor.addEventListener('focus', () => {
  lastInteraction = 'pointer';
  setTimeout(() => updateToolbarFromCaret(), 0);
  saveSelection();
});

/* keyboard navigation keys => update toolbar */
editor.addEventListener('keydown', (ev) => {
  const navKeys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'];
  if (navKeys.includes(ev.key)) {
    lastInteraction = 'nav';
    // let the browser move the caret first then sync
    setTimeout(() => updateToolbarFromCaret(), 0);
    saveSelection();
  } else {
    // other keys are normal typing
    lastInteraction = 'typing';
  }
});


/* -------------------- Initialization -------------------- */
(async function init(){
  setStatus('Loading…');
  const ok = await checkAuthAndRole();
  if (!ok) return;

  await loadDraft();
  setStatus('Ready');
  updateToolbarState();

  if (editor) {
    // Initialize undo/redo history
    history.currentContent = editor.innerHTML;
    history.updateButtons();

    // Add input listener for autosave and clear redo stack
    editor.addEventListener('input', (e) => {
      scheduleQuickSave();
      // Clear redo stack immediately when typing occurs
      if (!history.isProcessing) {
        history.redoStack = [];
        history.updateButtons();
      }
    });

    // Handle keyboard events for history management
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        history.undo();
        scheduleQuickSave();
        return;
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        history.redo();
        scheduleQuickSave();
        return;
      }

      // Check for word breaks or long pauses
      const now = Date.now();
      const timeSinceLastKey = now - history.lastKeyTime;
      const isWordBreak = history.isWordBreak(e);

      // Save state immediately on word breaks or after long pauses
      if (isWordBreak || timeSinceLastKey > HISTORY_BATCH_DELAY) {
        history.saveState(true);
      } else {
        // For regular typing, use batched saves
        history.saveState(false);
      }

      history.lastKeyTime = now;
      history.lastWordBreak = isWordBreak;
    });

    // Save state immediately for formatting commands and other non-typing changes
    const formatCommands = ['bold', 'italic', 'underline', 'strikeThrough', 
                          'insertUnorderedList', 'insertOrderedList',
                          'justifyLeft', 'justifyCenter', 'justifyRight'];
                          
    formatCommands.forEach(cmd => {
      const button = toolbar.querySelector(`[data-cmd="${cmd}"]`);
      if (button) {
        const originalClick = button.onclick;
        button.onclick = (e) => {
          if (originalClick) originalClick.call(button, e);
          history.saveState(true);
        };
      }
    });

    // Save state immediately when focus is lost
    editor.addEventListener('blur', () => {
      if (history.batchTimer) {
        clearTimeout(history.batchTimer);
        history.batchTimer = null;
        history.saveState(true);
      }
    });
  }
})();

async function getSessionUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user ?? null;
}
async function checkAuthAndRole() {
  const user = await getSessionUser();
  if (!user) { window.location.href = '/'; return false; }
  currentUser = user;
  try {
    const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', currentUser.id);
    if (error) throw error;
    if (!data || data.length === 0) { alert('Access denied'); window.location.href = '/'; return false; }
    if (!data.some(r => r.role === 'Writer' || r.role === 'Admin')) { alert('Access denied'); window.location.href = '/'; return false; }
  } catch (err) { console.error(err); alert('Permission check failed'); return false; }
  return true;
}

/* --- Always sync toolbar state with current cursor/selection --- */
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || !editor.contains(sel.anchorNode)) return;
  updateToolbarState();
});

editor.addEventListener('input', () => {
  updateToolbarState();
});

editor.addEventListener('keyup', () => {
  updateToolbarState();
});

editor.addEventListener('mouseup', () => {
  updateToolbarState();
});

// ---- Title Image Upload Logic ----
const titleImageInput = document.getElementById('titleImage');
const dropArea = document.getElementById('drop-area');
const previewContainer = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const uploadText = document.getElementById('upload-text');

window.titleImage = null;

dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.classList.add('dragover');
});
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
dropArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) await handleImageUpload(file);
});

titleImageInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await handleImageUpload(file);
});

async function handleImageUpload(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    previewContainer.style.display = 'block';
  };
  reader.readAsDataURL(file);

  const fileName = `title_${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage
    .from('Images')
    .upload(fileName, file, { upsert: true });

  if (error) {
    console.error('Upload failed:', error);
    alert('Image upload failed.');
    return;
  }

  const { data: publicUrlData } = supabase.storage
    .from('Images')
    .getPublicUrl(fileName);

  const publicUrl = publicUrlData?.publicUrl;
  console.log('Image uploaded:', publicUrl);

  window.titleImage = publicUrl;
  uploadText.textContent = '✅ Image Uploaded';
}

function sanitizeColors(node) {
    node.querySelectorAll("*").forEach(el => {
      el.style.removeProperty("color");
      el.style.removeProperty("background-color");
      el.removeAttribute("color");
      el.removeAttribute("bgcolor");
      sanitizeColors(el);
    });
}

async function sanitize(html) {
  console.log(window.getSelection());
  restoreSelection()
  const temp = document.createElement("div");
  temp.style.display = "none";
  temp.innerHTML = html;
  sanitizeColors(temp);
  restoreSelection()

  const imgs = Array.from(temp.querySelectorAll("img"));
  const hashMap = {};
  let imgIndex = 0;

  for (const img of imgs) {
    try {
      const src = img.src;
      if (!src.startsWith("data:")) continue; // skip non-inline images

      // convert data URL to Blob
      const res = await fetch(src);
      const blob = await res.blob();

      // hash to deduplicate
      const hash = await hashBlob(blob);
      if (hashMap[hash]) {
        img.src = hashMap[hash];
        continue;
      }

      // detect mime type from blob type
      let type = blob.type || "application/octet-stream";
      let ext = type.split("/")[1] || "bin";

      const fileName = `${hash}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("Images")
        .upload(fileName, blob, { upsert: true });

      if (uploadErr) {
        console.error("Upload failed for", fileName, uploadErr);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from("Images")
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData?.publicUrl || "";
      hashMap[hash] = publicUrl;
      img.src = publicUrl;
      imgIndex++;
    } catch (err) {
      console.error("Image processing failed", err);
    }
  }

  document.execCommand("insertHTML", false, `<div style="color:white;">${temp.innerHTML}</div>`);
  scheduleQuickSave();
}

editor.addEventListener("paste", (e) => {
  e.preventDefault();
  let html = e.clipboardData.getData("text/html") || e.clipboardData.getData("text/plain");
  sanitize(html);
});