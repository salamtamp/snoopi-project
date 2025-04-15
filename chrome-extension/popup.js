function generateTaskID() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

document.getElementById("executeBtn").addEventListener("click", async () => {
  const url = document.getElementById("urlInput").value.trim();
  const errorMsg = document.getElementById("errorMsg");

  if (!/^https:\/\/shopee\.co\.th\/.+/.test(url)) {
    errorMsg.textContent = "Please enter a valid Shopee URL.";
    return;
  }

  errorMsg.textContent = "";

  const result = await chrome.storage.local.get("shopeeTasks");
  const shopeeTasks = result.shopeeTasks || { tasks: [] };
  const scheduledUrls = shopeeTasks.tasks
    .filter(({ status }) => status !== "completed")
    .map(({ url }) => url);

  console.log("scheduledUrls:", scheduledUrls);
  // { tasks: [ { id: "123", url: "https://shopee.co.th/...", status: "scheduled", runAt: 1744705482 }] }

  if (!scheduledUrls.includes(url)) {
    updatedShopeeTasks = {
      tasks: [
        ...shopeeTasks.tasks,
        {
          id: generateTaskID(),
          url,
          status: "scheduled",
          runAt: Math.floor((Date.now() + 2 * 60 * 1000) / 1000),
        },
      ],
    };

    console.log("updatedShopeeTasks:", updatedShopeeTasks);

    await chrome.storage.local.set({ shopeeTasks: updatedShopeeTasks });
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
