function generateTaskID() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

document.addEventListener("DOMContentLoaded", function () {
  const scheduleTimeInput = document.getElementById("scheduleTimeInput");

  const formatDateTimeLocal = (date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const now = new Date();
  scheduleTimeInput.min = formatDateTimeLocal(now);

  const daysLater = new Date(now);
  daysLater.setDate(now.getDate() + 1);
  scheduleTimeInput.max = formatDateTimeLocal(daysLater);
});

document.getElementById("executeBtn").addEventListener("click", async () => {
  const url = document.getElementById("urlInput").value.trim();
  const scheduleTimeInput = document.getElementById("scheduleTimeInput").value;
  const errorMsg = document.getElementById("errorMsg");
  const scheduleErrorMsg = document.getElementById("scheduleErrorMsg");

  errorMsg.textContent = "";
  scheduleErrorMsg.textContent = "";

  if (!/^https:\/\/shopee\.co\.th\/.+/.test(url)) {
    errorMsg.textContent = "Please enter a valid Shopee URL.";
    return;
  }

  let runAtTimestamp;
  if (scheduleTimeInput) {
    const selectedDate = new Date(scheduleTimeInput);
    if (isNaN(selectedDate.getTime())) {
      scheduleErrorMsg.textContent = "Invalid date/time selected.";
      return;
    }
    if (selectedDate.getTime() <= Date.now()) {
      scheduleErrorMsg.textContent = "Scheduled time must be in the future.";
      return;
    }
    runAtTimestamp = Math.floor(selectedDate.getTime() / 1000);
  } else {
    runAtTimestamp = Math.floor(Date.now() / 1000);
  }

  const keyword = document.getElementById("keywordInput").value.trim();
  const result = await chrome.storage.local.get("shopeeTasks");
  const shopeeTasks = result.shopeeTasks || { tasks: [] };
  const scheduledUrls = shopeeTasks.tasks
    .filter(({ status }) => status !== "completed")
    .map(({ url }) => url);

  if (!scheduledUrls.includes(url)) {
    const updatedShopeeTasks = {
      tasks: [
        ...shopeeTasks.tasks,
        {
          id: generateTaskID(),
          url,
          status: "scheduled",
          runAt: runAtTimestamp,
          keyword: keyword || "",
        },
      ],
    };

    await chrome.storage.local.set({ shopeeTasks: updatedShopeeTasks });
  } else {
    errorMsg.textContent = "This URL is already scheduled.";
  }

  if (!scheduledUrls.includes(url)) {
    chrome.tabs.create({ url }, (tab) => {
      const checkTabReady = () => {
        try {
          chrome.tabs.get(tab.id, (updatedTab) => {
            if (chrome.runtime.lastError || !updatedTab) {
              console.log(`Tab ${tab.id} closed or unavailable.`);
              return;
            }

            if (updatedTab.status === "complete") {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["content.js"],
              });
            } else {
              setTimeout(checkTabReady, 500);
            }
          });
        } catch (error) {
          console.error("Error checking tab readiness:", error);
        }
      };
      checkTabReady();
    });
  }
});
