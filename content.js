// === GLOBAL VARIABLES ===
let activeSessionId = null; 
let sessionLocked = false;
let injectedSessionId = null;
let hasUserInteracted = false; 
let hasSentMessage = false;
let lastEnterTime = 0;
let interactionPending = false;
let saveArmed = false;
let silenceTimer = null;
let silenceObserver = null;
let currentUrl = location.href;
let saveInProgress = false;
const SILENCE_MS = 3000;

// 🧺 FILTER BASKET — items to strip from saved messages (add more later)
const FILTER_LIST = ["💬"];

function applyMessageFilter(messages) {
  return messages.map(msg => {
    let cleaned = msg;
    FILTER_LIST.forEach(item => { cleaned = cleaned.replaceAll(item, ""); });
    cleaned = cleaned.trim();
    return cleaned.length > 0 ? cleaned : null;
  }).filter(m => m !== null);
}

function clearPendingSave() {
  saveArmed = false;
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

// === 0. THE TITANIUM LOCK (Mouse & Keyboard Proof) ===

function resetChatTracking() {
  hasUserInteracted = false;
  interactionPending = false;
  clearPendingSave();
  activeSessionId = null;
  currentUrl = location.href;
}

function activateExtension(e) {
    // e.isTrusted check karta hai ke action asal insaan ne kiya hai (kisi auto-load script ne nahi)
    if (e && e.isTrusted) {
        hasUserInteracted = true;
        interactionPending = true;
        saveArmed = false;
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
    }
}

// 1. Keyboard Typing (Normal keys, Ctrl+V, aur Enter)
document.addEventListener('keydown', (e) => {
    let isNormalTyping = (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey);
    let isPasting = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';
    if (isNormalTyping || isPasting || e.key === 'Enter') {
      activateExtension(e);
      if (e.key === 'Enter') {
        hasSentMessage = true;
        lastEnterTime = Date.now();
      }
    }
}, { capture: true });

// 2. Mouse Right-Click -> Paste
document.addEventListener('paste', activateExtension, { capture: true });

// === 1. GET AI PLATFORM NAME ===
function getAiPlatformName() {
  let host = window.location.hostname;
  if (host.includes("chatgpt")) return "ChatGPT";
  if (host.includes("claude")) return "Claude";
  if (host.includes("gemini")) return "Gemini";
  if (host.includes("qwen")) return "Qwen";
  if (host.includes("perplexity")) return "Perplexity";
  if (host.includes("deepseek")) return "DeepSeek";
  if (host.includes("mistral")) return "Mistral";
  if (host.includes("huggingface")) return "HuggingFace";
  if (host.includes("moonshot")) return "Kimi";
  if (host.includes("poe.com")) return "Poe";
  if (host.includes("meta.ai")) return "Meta AI";
  if (host.includes("copilot")) return "Copilot";
  if (host.includes("pi.ai")) return "Pi";
  if (host.includes("chatglm")) return "ChatGLM";
  if (host.includes("you.com")) return "You.com";
  if (host.includes("phind")) return "Phind";
  return "AI Bot";
}

// === 2. PURE EXTRACTION (Typing Box Hidden) ===
// === 2. SAFE EXTRACTION (SIDEBARS HIDDEN TO PREVENT HISTORY BLEEDING) ===
function extractFormattedMessages() {
  let hiddenElements = [];
  // nav aur aside ko wapas shamil kiya hai taake sidebar ki purani fihrist copy na ho
  // Standard WAI-ARIA roles — not site-specific, pure web standard
  let selectorsToHide = ['nav', 'aside', '[role="navigation"]', '[role="complementary"]', 'textarea', '[contenteditable="true"]', '#context-modal-overlay', '#context-floating-btn'];
  
  selectorsToHide.forEach(selector => {
     document.querySelectorAll(selector).forEach(el => {
         if (el.style.display !== 'none') {
             hiddenElements.push({ element: el, originalDisplay: el.style.display || '' });
             el.style.display = 'none';
         }
     });
  });

  let container = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
  let rawText = container.innerText.trim();

  hiddenElements.forEach(item => {
      item.element.style.display = item.originalDisplay;
  });

  if (!rawText) return [];

  let injectStart = rawText.indexOf("SYSTEM INSTRUCTION: Below");
  let injectEnd = rawText.indexOf("[PREVIOUS CHAT DATA ENDS HERE]");
  if (injectStart !== -1 && injectEnd !== -1) {
      rawText = rawText.substring(0, injectStart) + rawText.substring(injectEnd + 30);
  }

  let chunks = rawText.split(/\n{2,}/);
  let cleanChunks = [];

  chunks.forEach(chunk => {
    let text = chunk.trim();
    if (text.length < 1) return; 
    cleanChunks.push("💬 " + text);
  });

  return applyMessageFilter(cleanChunks);
}

// === SILENCE DETECTOR (MutationObserver — no blind interval) ===
function stopSilenceDetector() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  if (silenceObserver) {
    silenceObserver.disconnect();
    silenceObserver = null;
  }
}

function scheduleSaveAfterSilence() {
  if (!hasUserInteracted || !saveArmed) return;
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    silenceTimer = null;
    if (hasUserInteracted && saveArmed) autoSaveChat();
  }, SILENCE_MS);
}

function isExtensionMutation(mutations) {
  for (let i = 0; i < mutations.length; i++) {
    let node = mutations[i].target;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node && node.closest && node.closest('#context-floating-btn, #context-modal-overlay')) {
      return true;
    }
  }
  return false;
}

function onDomMutation(mutations) {
  if (!hasUserInteracted || isExtensionMutation(mutations)) return;
  interactionPending = false;
  saveArmed = true;
  scheduleSaveAfterSilence();
}

function initSilenceDetector() {
  if (silenceObserver || !document.body) return;

  silenceObserver = new MutationObserver(onDomMutation);

  silenceObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function onNavigation() {
  const newUrl = location.href;
  if (newUrl === currentUrl) return;

  currentUrl = newUrl;
  activeSessionId = null;
  sessionLocked = false;
  injectedSessionId = null;
  hasSentMessage = false;
  lastEnterTime = 0;
  hasUserInteracted = false;
  interactionPending = false;
  clearPendingSave();
}

(function hookHistoryForNavigation() {
  const wrap = (original) => function(...args) {
    const result = original.apply(this, args);
    onNavigation();
    return result;
  };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
  window.addEventListener('popstate', onNavigation);
})();

window.addEventListener('pageshow', (event) => {
  if (event.persisted) resetChatTracking();
});

if (document.body) {
  initSilenceDetector();
} else {
  document.addEventListener('DOMContentLoaded', initSilenceDetector);
}

// === 3. AUTO-SAVE & DYNAMIC TITLE LOGIC ===
// === 3. AUTO-SAVE WITH CALLBACK SUPPORT ===
// === 3. AUTO-SAVE WITH NEW CHAT DETECTION ===
// === 3. AUTO-SAVE (Zero Duplication & Smart Replace Logic) ===
function autoSaveChat(callback) {
  if (saveInProgress) {
    if (callback) callback();
    return;
  }
  saveInProgress = true;
  
  function done() {
    saveInProgress = false;
    if (callback) callback();
  }

  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      stopSilenceDetector();
      done();
      return;
    }

    if (!hasUserInteracted) {
      done();
      return;
    }

    chrome.storage.local.get(["isAutoSaveOn", "chatSessions"], (result) => {
      if (result.isAutoSaveOn === false) {
        done();
        return;
      }

      let visibleMessages = extractFormattedMessages();
      if (visibleMessages.length === 0) {
        done();
        return;
      }

      let looksReal = visibleMessages.length >= 2 && visibleMessages.some(m => m.length > 25);
      let sentRecently = hasSentMessage && (Date.now() - lastEnterTime < 120000);

      if (!hasSentMessage) {
        if (looksReal) {
          hasSentMessage = true;
          lastEnterTime = Date.now();
        } else {
          done();
          return;
        }
      }

      let sessions = result.chatSessions || {};
      let isNewSession = false;

      if (!activeSessionId) {
        activeSessionId = "session_" + Date.now();
        isNewSession = true;
      }

      let currentSession = sessions[activeSessionId] || { title: "New Chat...", data: [], date: "", model: "" , isRenamed: false };
      let savedMessages = currentSession.data; 

      // 🧠 THE "NO-BLEED" SMART OVERWRITE FIX (Zero Duplication & No Mixing)
      if (savedMessages.length === 0) {
          savedMessages = visibleMessages;
      } else {
          let matchFound = false;
          let dbMatchIndex = -1;
          let visibleMatchIndex = -1;

          // Screen ki kisi lambi line ko DB mein dhoondne ki koshish karo
          for (let i = 0; i < visibleMessages.length; i++) {
              let msg = visibleMessages[i];
              if (msg.length < 15) continue; 
              
              let dbIndex = savedMessages.lastIndexOf(msg);
              if (dbIndex !== -1) {
                  matchFound = true;
                  dbMatchIndex = dbIndex;
                  visibleMatchIndex = i;
                  break;
              }
          }
          
          if (matchFound) {
              savedMessages = savedMessages.slice(0, dbMatchIndex).concat(visibleMessages.slice(visibleMatchIndex));
          } else if (sessionLocked) {
              // Check if the old conversation is STILL on screen or completely gone
              let oldOnScreen = false;
              if (savedMessages.length > 0) {
                let container = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
                let currentText = container.innerText;
                for (let sm of savedMessages) {
                  if (sm.length > 30 && currentText.includes(sm)) {
                    oldOnScreen = true;
                    break;
                  }
                }
              }
              if (!oldOnScreen && savedMessages.length > 0) {
                // Old content gone — user clicked "New Chat", start fresh
                activeSessionId = "session_" + Date.now();
                savedMessages = visibleMessages;
              } else {
                let newOnes = visibleMessages.filter(m => !savedMessages.includes(m));
                if (newOnes.length > 0) savedMessages = savedMessages.concat(newOnes);
              }
          } else if (sentRecently || looksReal) {
              activeSessionId = "session_" + Date.now();
              savedMessages = visibleMessages;
          } else {
              done();
              return;
          }
      }

      // Title logic
      let title = currentSession.title;
      if (!currentSession.isRenamed && savedMessages.length > 0) {
        let totalLines = savedMessages.length;
        let targetLine = "";

        if (totalLines < 10) {
            let midIndex = Math.floor(totalLines / 2);
            for (let i = midIndex; i < totalLines; i++) {
                if (savedMessages[i].length > 20) { targetLine = savedMessages[i]; break; }
            }
            if (!targetLine) targetLine = savedMessages[midIndex]; 
        } else {
            let skipCount = Math.floor(totalLines * 0.3); 
            for (let i = skipCount; i < totalLines; i++) {
                if (savedMessages[i].length > 20) { targetLine = savedMessages[i]; break; }
            }
            if (!targetLine) targetLine = savedMessages[skipCount]; 
        }

        if (targetLine) {
            title = targetLine.replace("💬 ", "").trim().split(" ").slice(0, 6).join(" ") + "...";
        }
      }

      sessions[activeSessionId] = { 
        title: title, 
        data: savedMessages, 
        date: new Date().toLocaleString(),
        model: getAiPlatformName(),
        isRenamed: currentSession.isRenamed 
      };

      chrome.storage.local.set({ "chatSessions": sessions }, () => {
         done();
      });
    });
  } catch (error) {
    saveInProgress = false;
    stopSilenceDetector();
    if (callback) callback();
  }
}

// === 4. UI: FLOATING BUTTON ===
// === 4. UI: SMART FLOATING BUTTON ===
function createFloatingButton() {
  if (document.getElementById('context-floating-btn')) return;
  
  chrome.storage.local.get(["buttonInPopup"], (result) => {
    if (result.buttonInPopup) return;

    let btnContainer = document.createElement('div');
    btnContainer.id = 'context-floating-btn';
    
    btnContainer.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      height: 50px; width: 50px; border-radius: 25px;
      background-color: #28a745; color: white; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: flex-start;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3); overflow: hidden;
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease;
    `;
    
    btnContainer.innerHTML = `
      <div style="min-width: 50px; text-align: center; font-size: 20px; flex-shrink:0;">⚡</div>
      <div class="inject-text" style="white-space: nowrap; font-family: Arial, sans-serif; font-weight: bold; font-size: 14px; opacity: 0; transition: opacity 0.25s ease 0.05s; padding-right: 4px;">Inject Context</div>
      <div class="shift-gear" title="Move to popup" style="font-size: 9px; opacity: 0; transition: opacity 0.25s ease 0.05s; padding:0 6px 0 2px; cursor: pointer; color: #a3d9a5; user-select:none; line-height:1;">⚙</div>
    `;

    let textDiv = btnContainer.querySelector('.inject-text');
    let gearDiv = btnContainer.querySelector('.shift-gear');

    btnContainer.addEventListener('mouseenter', () => {
        btnContainer.style.width = 'auto';
        btnContainer.style.paddingRight = '4px';
        setTimeout(() => {
          textDiv.style.opacity = '1';
          gearDiv.style.opacity = '0.35';
        }, 80);
    });
    
    btnContainer.addEventListener('mouseleave', (e) => {
        if (e.relatedTarget && (e.relatedTarget === gearDiv || btnContainer.contains(e.relatedTarget))) return;
        textDiv.style.opacity = '0';
        gearDiv.style.opacity = '0';
        setTimeout(() => {
          btnContainer.style.width = '50px';
          btnContainer.style.paddingRight = '0';
        }, 200);
    });

    gearDiv.addEventListener('mouseenter', () => { gearDiv.style.opacity = '1'; });
    gearDiv.addEventListener('mouseleave', (e) => {
        if (e.relatedTarget && btnContainer.contains(e.relatedTarget)) return;
        gearDiv.style.opacity = '0.35';
    });
    gearDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      btnContainer.style.transform = 'translateY(-350px) scale(0.3)';
      btnContainer.style.opacity = '0';
      setTimeout(() => {
        btnContainer.remove();
        chrome.storage.local.set({ buttonInPopup: true });
      }, 500);
    });

    btnContainer.addEventListener('click', (e) => {
      if (e.target === gearDiv) return;
      e.preventDefault();
      openCenterModal();
    });
    
    document.body.appendChild(btnContainer);
  });
}

// Listen for inject requests from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'injectContext') {
    openCenterModal();
  }
});

// Watch for buttonInPopup changes (e.g. popup sets it back to false)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.buttonInPopup) {
    if (!changes.buttonInPopup.newValue) {
      createFloatingButton();
    } else {
      let existing = document.getElementById('context-floating-btn');
      if (existing) existing.remove();
    }
  }
});

// === 5. UI: CENTER MODAL ===
// === 5. UI: CENTER MODAL WITH TIPS & REDESIGNED EDIT BUTTON ===
// === 5. UI: CENTER MODAL (FORCED IMMEDIATE SAVE) ===
function openCenterModal() {
  if (document.getElementById('context-modal-overlay')) return;

  // ⚡ THE MASTER TRICK: Modal khulney sae pehley fauran current chat save karo, phir list dikhao!
  autoSaveChat(() => {
    let overlay = document.createElement('div');
    overlay.id = 'context-modal-overlay';
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999999; display: flex; justify-content: center; align-items: center;`;

    let modal = document.createElement('div');
    modal.style.cssText = `width: 520px; max-height: 85vh; background: #fff; border-radius: 12px; padding: 25px; overflow-y: auto; font-family: Arial, sans-serif; color: #333; position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.5);`;

    let headerContainer = document.createElement('div');
    headerContainer.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      position: sticky; top: 0; z-index: 10; background: #fff;
      padding-bottom: 15px; border-radius: 12px 12px 0 0;
    `;

    let header = document.createElement('h2');
    header.innerText = "Select Previous Chat";
    header.style.margin = "0";
    
    let closeBtn = document.createElement('button');
    closeBtn.innerText = "✕ Close";
    closeBtn.style.cssText = "padding: 6px 12px; cursor: pointer; background: #dc3545; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 13px;";
    
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      let m = document.getElementById('context-modal-overlay');
      if (m) m.remove();
    });

    headerContainer.appendChild(header);
    headerContainer.appendChild(closeBtn);
    modal.appendChild(headerContainer);

    let tipsDiv = document.createElement('div');
    tipsDiv.style.cssText = `background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px; padding: 12px 15px; margin-bottom: 20px; font-size: 13px; color: #495057; line-height: 1.6;`;
    tipsDiv.innerHTML = `
      <strong style="color:#007bff; font-size:14px;">💡 Important Tricks:</strong>
      <ul style="margin: 5px 0 0 0; padding-left: 20px;">
          <li><strong>Privacy First (Most Important):</strong> Always open a <em>Temporary Chat</em> or <em>Incognito Tab</em> in the AI app before starting a conversation.</li>
          <li><strong>Auto-Save Control:</strong> Data is saved automatically on your device.To stop this, click the extension icon and turn the switch <em>OFF</em>.</li>
          <li><strong>Stay Organized:</strong> We highly recommend renaming your chat session when you finish your work so it's easy to find later.</li>
           <li><strong>For queries, updates, or custom personalization, please  contact:</strong>  axisai.contact@gmail.com</li>
      </ul>
    `;
    modal.appendChild(tipsDiv);

    chrome.storage.local.get(["chatSessions"], (result) => {
      let sessions = result.chatSessions || {};
      let sessionKeys = Object.keys(sessions).reverse();

      if (sessionKeys.length === 0) {
        let errorMsg = document.createElement('p');
        errorMsg.innerText = "No saved chats found yet.";
        errorMsg.style.color = "#777";
        modal.appendChild(errorMsg);
      } else {
        sessionKeys.forEach(key => {
          let session = sessions[key];
          let itemDiv = document.createElement('div');
          itemDiv.style.cssText = "border-bottom: 1px solid #e9ecef; padding: 12px 0; display: flex; justify-content: space-between; align-items: center;";
          
          let modelName = session.model || "AI Bot";
          let modelBadge = `<span style="background:#f1f3f5; border: 1px solid #dee2e6; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:8px; color:#495057;">🤖 ${modelName}</span>`;

          let titleContainer = document.createElement('div');
          titleContainer.style.flex = "1";
          
          let editContainer = document.createElement('span');
          editContainer.style.cssText = "position: relative; display: inline-block; margin-left: 10px;";
          editContainer.innerHTML = `
            <span class="edit-trigger" style="cursor:pointer; background:#e9ecef; color:#495057; padding:2px 8px; border-radius:12px; font-size:11px; border: 1px solid #ced4da; transition: 0.2s; user-select:none;">⋮ Edit</span>
            <div class="edit-dropdown" style="display:none; position:absolute; top:100%; left:0; margin-top:4px; background:#fff; border:1px solid #ddd; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:10; min-width:100px; overflow:hidden;">
              <div class="drop-item rename-item" style="padding:8px 14px; cursor:pointer; font-size:12px; color:#333; transition:0.15s; display:flex; align-items:center; gap:6px;">✏️ Rename</div>
              <div class="drop-item delete-item" style="padding:8px 14px; cursor:pointer; font-size:12px; color:#d32f2f; transition:0.15s; display:flex; align-items:center; gap:6px; border-top:1px solid #eee;">🗑 Delete</div>
            </div>
          `;

          titleContainer.innerHTML = `
              <strong style="font-size: 15px; color:#212529;">${session.title}</strong> 
              ${editContainer.outerHTML}
              <br> 
              <div style="margin-top: 6px;">${modelBadge} <small style="color:#868e96;">🕒 ${session.date}</small></div>
          `;

          let editTrigger = titleContainer.querySelector('.edit-trigger');
          let dropdown = titleContainer.querySelector('.edit-dropdown');

          editTrigger.addEventListener('mouseenter', () => { editTrigger.style.background = '#dee2e6'; });
          editTrigger.addEventListener('mouseleave', () => { editTrigger.style.background = '#e9ecef'; });

          editTrigger.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            let isOpen = dropdown.style.display === 'block';
            document.querySelectorAll('.edit-dropdown').forEach(d => d.style.display = 'none');
            dropdown.style.display = isOpen ? 'none' : 'block';
          });

          document.addEventListener('click', () => { dropdown.style.display = 'none'; }, { capture: true });

          titleContainer.querySelector('.rename-item').addEventListener('click', (e) => {
              e.stopPropagation();
              dropdown.style.display = 'none';
              let newTitle = prompt("Enter new name for this chat:", session.title);
              if (newTitle && newTitle.trim() !== "") {
                sessions[key].title = newTitle;
                sessions[key].isRenamed = true; 
                chrome.storage.local.set({ "chatSessions": sessions }, () => {
                   overlay.remove(); 
                   openCenterModal(); 
                });
              }
          });

          titleContainer.querySelector('.delete-item').addEventListener('click', (e) => {
              e.stopPropagation();
              dropdown.style.display = 'none';
              if (confirm(`Delete "${session.title}" permanently?`)) {
                delete sessions[key];
                chrome.storage.local.set({ "chatSessions": sessions }, () => {
                   overlay.remove();
                   openCenterModal();
                });
              }
          });

          let injectBtn = document.createElement('button');
          injectBtn.innerText = "Inject Context";
          injectBtn.style.cssText = "padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s;";
          injectBtn.addEventListener('mouseenter', () => { injectBtn.style.background = '#0056b3'; });
          injectBtn.addEventListener('mouseleave', () => { injectBtn.style.background = '#007bff'; });
          
          injectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            activeSessionId = key;
            sessionLocked = true;
            injectedSessionId = key;
            let savedText = session.data.join("\n\n");
            let prefix = "SYSTEM INSTRUCTION: Below is the raw data of our previous conversation...\n\n[PREVIOUS CHAT DATA BEGINS HERE]\n\n";
            let suffix = "\n\n[PREVIOUS CHAT DATA ENDS HERE]\n\n";
            
            let inputBox = document.getElementById('prompt-textarea') || document.querySelector('div[contenteditable="true"]');
            
            if (inputBox) {
              let finalPayload = prefix + savedText + suffix;
              if (inputBox.tagName.toLowerCase() === 'textarea') {
                inputBox.value = finalPayload;
              } else {
                inputBox.innerText = finalPayload;
              }
              inputBox.dispatchEvent(new Event('input', { bubbles: true }));
              document.getElementById('context-modal-overlay').remove();
            } else {
              alert("Input box not found!");
            }
          });

          itemDiv.appendChild(titleContainer);
          itemDiv.appendChild(injectBtn);
          modal.appendChild(itemDiv);
        });
      }
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

setTimeout(createFloatingButton, 2000);