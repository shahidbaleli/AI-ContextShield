document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('autoSaveToggle');
  const popupSection = document.getElementById('popupInjectSection');
  const popupInjectBtn = document.getElementById('popupInjectBtn');
  const showOnPageBtn = document.getElementById('showOnPageBtn');
  const floatingHint = document.getElementById('floatingHint');

  chrome.storage.local.get(["isAutoSaveOn", "buttonInPopup"], (result) => {
    toggleBtn.checked = result.isAutoSaveOn !== false;

    if (result.buttonInPopup) {
      popupSection.style.display = 'block';
      floatingHint.style.display = 'none';
    } else {
      popupSection.style.display = 'none';
      floatingHint.style.display = 'block';
    }
  });

  toggleBtn.addEventListener('change', () => {
    chrome.storage.local.set({ "isAutoSaveOn": toggleBtn.checked });
  });

  popupInjectBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'injectContext' });
      }
    });
    window.close();
  });

  showOnPageBtn.addEventListener('click', () => {
    chrome.storage.local.set({ buttonInPopup: false }, () => {
      window.close();
    });
  });
});
