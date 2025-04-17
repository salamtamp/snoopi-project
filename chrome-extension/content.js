// Configuration constants
const LOG_LEVELS = {
  error: 0,
  info: 1,
  debug: 2,
};

const LOG_METHODS = {
  error: console.error,
  info: console.info,
  debug: console.debug,
};

const CONFIG = {
  // General settings
  MAX_RETRIES: 30,
  RETRY_INTERVAL_MS: 300,
  ADD_ITEM_TO_CART_DELAY_MS: 300,
  INCREASE_QUANTITY_ON_ITEM_DELAY_MS: 200,
  CHECKOUT_CART_DELAY_MS: 500,
  SEQUENCE_DELAY_MS: 500,
  PLACE_ORDER_DELAY_MS: 900,

  // Button text configurations
  BUTTONS: {
    BUY: ["Buy With Voucher", "Buy Now"],
    QUANTITY: ["Increase"],
    CHECKOUT: ["Check Out"],
    PAYMENT: {
      METHOD: "ShopeePay",
      OPTION: "QR PromptPay",
      CONFIRM: "Place Order",
    },
  },
  LOG_LEVEL: 2, // error: 0, info: 1, debug: 2
  STORAGE_KEYS: "shopeeTasks",
  SCHEDULED_URL_INTERVAL_MS: 1000,
  DEBUG: false,
};

const displayLog = (level, msg) => {
  const logMethod = LOG_METHODS[level];
  logMethod(`[${level}]: ${msg}`);
};

const findAndClickButton = (texts) => {
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    for (const text of texts) {
      if (btn.innerText?.includes(text) || btn.ariaLabel?.includes(text)) {
        btn.click();
        return true;
      }
    }
  }
  return false;
};

function getCurrentUnixTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function formatShopeeUrl(url) {
  return url.split("?")[0];
}

const performActionWithRetries = (actionName, actionFn, delay, maxRetries) => {
  return new Promise((resolve) => {
    let retries = 0;

    const attempt = () => {
      try {
        displayLog("info", `${actionName} retries: ${retries}`);

        if (actionFn()) {
          resolve(true);
        } else if (retries < maxRetries) {
          retries++;
          displayLog("debug", `Retry: ${retries}/${maxRetries}`);
          setTimeout(attempt, delay);
        } else {
          displayLog("error", "Max retries reached without success.");
          resolve(false);
        }
      } catch (error) {
        displayLog("error", error);
        resolve(false);
      }
    };

    attempt();
  });
};

// Step 1: Select item (if keyword is exist)
const selectItemByKeyword = (keyword) => {
  if (keyword) {
    displayLog("info", `Select item with keyword: ${keyword}`);
    return performActionWithRetries(
      "selectItemByKeyword",
      () => findAndClickButton([keyword]),
      CONFIG.ADD_ITEM_TO_CART_DELAY_MS,
      CONFIG.MAX_RETRIES
    );
  } else {
    return true;
  }
};

// Step 2: Increase quantity
const increaseQuantity = async (quantity) => {
  if (!quantity || quantity === 1) {
    return true;
  }

  displayLog("info", `Attempting to increase quantity by ${quantity}...`);
  for (let i = 0; i < quantity - 1; i++) {
    const success = await performActionWithRetries(
      `increaseQuantity_${i + 1}`, // Unique name for logging
      () => findAndClickButton(CONFIG.BUTTONS.QUANTITY),
      CONFIG.INCREASE_QUANTITY_ON_ITEM_DELAY_MS,
      CONFIG.MAX_RETRIES
    );

    if (!success) {
      displayLog("error", `Failed to increase quantity at step ${i + 1}.`);
      return false;
    }
    displayLog(
      "debug",
      `Quantity increased step ${i + 1}/${quantity} succeeded.`
    );
  }

  displayLog("info", `Successfully increased quantity by ${quantity}.`);
  return true;
};

// Step 3: Add item to cart
const addItemToCart = () => {
  displayLog("info", "Attempting to add item to cart...");
  return performActionWithRetries(
    "addItemToCart",
    () => findAndClickButton(CONFIG.BUTTONS.BUY),
    CONFIG.ADD_ITEM_TO_CART_DELAY_MS,
    CONFIG.MAX_RETRIES
  );
};

// Step 4: Checkout cart
const checkoutCart = () => {
  displayLog("info", "Attempting to checkout cart...");
  return performActionWithRetries(
    "checkoutCart",
    () => findAndClickButton(CONFIG.BUTTONS.CHECKOUT),
    CONFIG.CHECKOUT_CART_DELAY_MS,
    CONFIG.MAX_RETRIES
  );
};

// Step 5: Purchase item
const purchaseItem = async () => {
  displayLog("info", "Attempting to purchase item...");

  const selectPaymentMethod = await performActionWithRetries(
    "selectPaymentMethod",
    () => findAndClickButton([CONFIG.BUTTONS.PAYMENT.METHOD]),
    CONFIG.RETRY_INTERVAL_MS,
    CONFIG.MAX_RETRIES
  );

  if (!selectPaymentMethod) return false;

  await new Promise((res) => setTimeout(res, CONFIG.SEQUENCE_DELAY_MS));

  const selectPaymentOption = await performActionWithRetries(
    "selectPaymentOption",
    () => findAndClickButton([CONFIG.BUTTONS.PAYMENT.OPTION]),
    CONFIG.RETRY_INTERVAL_MS,
    CONFIG.MAX_RETRIES
  );

  if (!selectPaymentOption) return false;

  if (CONFIG.DEBUG) {
    return true;
  }

  await new Promise((res) => setTimeout(res, CONFIG.PLACE_ORDER_DELAY_MS));

  const confirmPurchase = await performActionWithRetries(
    "confirmPurchase",
    () => findAndClickButton([CONFIG.BUTTONS.PAYMENT.CONFIRM]),
    CONFIG.RETRY_INTERVAL_MS,
    CONFIG.MAX_RETRIES
  );

  return confirmPurchase;
};

const waitForContentLoaded = () => {
  return new Promise((resolve) => {
    if (document.readyState === "complete") {
      resolve();
    } else {
      window.addEventListener("load", resolve);
    }
  });
};

// Helper to update task status in storage
const updateTaskStatus = async (taskId, status) => {
  try {
    const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS);
    const shopeeTasks = result.shopeeTasks || { tasks: [] };
    const updatedTasks = shopeeTasks.tasks.map((task) => {
      if (task.id === taskId) {
        displayLog("info", `Updating task ${taskId} status to ${status}`);
        return { ...task, status };
      }
      return task;
    });
    await chrome.storage.local.set({ shopeeTasks: { tasks: updatedTasks } });
    displayLog("debug", `Task ${taskId} status updated successfully.`);
    return true;
  } catch (error) {
    displayLog("error", `Failed to update task ${taskId} status: ${error}`);
    return false;
  }
};

// Function to execute the purchase sequence
const runPurchaseFlow = async (task) => {
  displayLog("info", `Running purchase flow for task ${task.id}`);

  const selectedItem = await selectItemByKeyword(task.keyword);
  if (!selectedItem) {
    displayLog("error", "Failed to select item.");
    await updateTaskStatus(task.id, "failed");
    return false;
  }

  const increasedQuantity = await increaseQuantity(task.quantity || 1);
  if (!increasedQuantity) {
    displayLog("error", "Failed to increase quantity.");
    await updateTaskStatus(task.id, "failed");
    return false;
  }

  const addedToCart = await addItemToCart();
  if (!addedToCart) {
    displayLog("error", "Failed to add item to cart.");
    await updateTaskStatus(task.id, "failed");
    return false;
  }

  // Short delay before checkout might be needed if cart updates are slow
  await new Promise((res) => setTimeout(res, CONFIG.SEQUENCE_DELAY_MS));

  const checkedOut = await checkoutCart();
  if (!checkedOut) {
    displayLog("error", "Failed to checkout cart.");
    await updateTaskStatus(task.id, "failed");
    return false;
  }

  // Short delay before purchase might be needed
  await new Promise((res) => setTimeout(res, CONFIG.SEQUENCE_DELAY_MS));

  const purchased = await purchaseItem();
  if (!purchased) {
    displayLog("error", "Failed to complete purchase.");
    await updateTaskStatus(task.id, "failed");
    return false;
  }

  await updateTaskStatus(task.id, "completed");
  displayLog("info", `Task ${task.id} completed successfully!`);
  return true;
};

// Main function to check and run scheduled tasks
const checkAndRunTask = async () => {
  displayLog("info", "Checking for scheduled tasks...");

  const currentURL = formatShopeeUrl(window.location.href);
  displayLog("info", `Processing URL: ${currentURL}`);

  let result;
  try {
    result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS);
  } catch (error) {
    displayLog("error", `Error getting tasks from storage: ${error}`);
    return; // Exit if storage is inaccessible
  }

  const shopeeTasks = result.shopeeTasks || { tasks: [] };

  // Find the task matching the current URL that is not completed or failed
  const scheduledTask = shopeeTasks.tasks.find(
    (task) =>
      task.url === currentURL &&
      task.status !== "completed" &&
      task.status !== "failed"
  );

  if (!scheduledTask) {
    displayLog("info", "No active scheduled task found for this URL.");
    return;
  }

  displayLog(
    "info",
    `Found task ${scheduledTask.id} with status ${scheduledTask.status}`
  );

  const now = getCurrentUnixTimestamp();
  const scheduledTime = scheduledTask.runAt;

  if (now < scheduledTime) {
    const delay = (scheduledTime - now) * 1000;
    displayLog(
      "info",
      `Task ${
        scheduledTask.id
      } scheduled for ${scheduledTime}. Waiting for ${Math.round(
        delay / 1000
      )} seconds.`
    );

    setTimeout(checkAndRunTask, Math.max(delay + 100, 1000));
    return;
  }

  // Time is up, process the task based on status
  if (scheduledTask.status === "scheduled") {
    displayLog(
      "info",
      `Task ${scheduledTask.id} time is up. Updating status to processing and reloading.`
    );
    const statusUpdated = await updateTaskStatus(
      scheduledTask.id,
      "processing"
    );
    if (statusUpdated) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      location.reload();
    } else {
      displayLog(
        "error",
        "Failed to update task status before reload. Aborting."
      );
    }
  } else if (scheduledTask.status === "processing") {
    displayLog(
      "info",
      `Task ${scheduledTask.id} is in processing state. Running purchase flow.`
    );

    await waitForContentLoaded();
    displayLog("info", "Page content loaded successfully after reload.");
    await runPurchaseFlow(scheduledTask);
  } else {
    displayLog(
      "warning",
      `Task ${scheduledTask.id} has unexpected status: ${scheduledTask.status}`
    );
  }
};

displayLog("info", "Script executed!");
checkAndRunTask();
