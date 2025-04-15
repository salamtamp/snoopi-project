document.getElementById("executeBtn").addEventListener("click", async () => {
  const url = document.getElementById("urlInput").value.trim();
  const errorMsg = document.getElementById("errorMsg");

  if (!/^https:\/\/shopee\.co\.th\/.+/.test(url)) {
    errorMsg.textContent = "Please enter a valid Shopee URL.";
    return;
  }

  errorMsg.textContent = "";

  const result = await chrome.storage.local.get("shopeeUrls");
  const existingUrls = result.shopeeUrls || { urls: [] };

  if (!existingUrls.urls.includes(url)) {
    existingUrls.urls.push(url);
    await chrome.storage.local.set({ shopeeUrls: existingUrls });
  }

  chrome.tabs.create({ url }, (tab) => {
    const checkTabReady = () => {
      chrome.tabs.get(tab.id, (updatedTab) => {
        if (updatedTab.status === "complete") {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          });
        } else {
          setTimeout(checkTabReady, 500);
        }
      });
    };

    checkTabReady();
  });
});
