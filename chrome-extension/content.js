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
  MAX_RETRIES: 15,
  RETRY_INTERVAL_MS: 300,
  ADD_ITEM_TO_CART_DELAY_MS: 300,
  CHECKOUT_CART_DELAY_MS: 300,
  SEQUENCE_DELAY_MS: 300,
  PLACE_ORDER_DELAY_MS: 900,

  // Button text configurations
  BUTTONS: {
    BUY: ["Buy With Voucher", "Buy Now", "Buy"],
    CHECKOUT: ["Check Out"],
    PAYMENT: {
      METHOD: "ShopeePay",
      OPTION: "QR PromptPay",
      CONFIRM: "Place Order",
    },
  },
  LOG_LEVEL: 2, // error: 0, info: 1, debug: 2
  STORAGE_KEYS: "shopeeTasks",
  SCHEDULED_URL_INTERVAL_MS: 3000,
  DEBUG: true,
};

const displayLog = (level, msg) => {
  const logMethod = LOG_METHODS[level];
  logMethod(`[${level}]: ${msg}`);
};

const findAndClickButton = (texts) => {
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    for (const text of texts) {
      if (btn.innerText.includes(text)) {
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

const performActionWithRetries = (actionFn, delay, maxRetries) => {
  return new Promise((resolve) => {
    let retries = 0;

    const attempt = () => {
      try {
        displayLog("info", `retries: ${retries}`);

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

// Step 1: Add item to cart
const addItemToCart = () => {
  displayLog("info", "Attempting to add item to cart...");
  return performActionWithRetries(
    () => findAndClickButton(CONFIG.BUTTONS.BUY),
    CONFIG.ADD_ITEM_TO_CART_DELAY_MS,
    CONFIG.MAX_RETRIES
  );
};

// Step 2: Checkout cart
const checkoutCart = () => {
  displayLog("info", "Attempting to checkout cart...");
  return performActionWithRetries(
    () => findAndClickButton(CONFIG.BUTTONS.CHECKOUT),
    CONFIG.CHECKOUT_CART_DELAY_MS,
    CONFIG.MAX_RETRIES
  );
};

// Step 3: Purchase item
const purchaseItem = async () => {
  displayLog("info", "Attempting to purchase item...");

  const selectPaymentMethod = await performActionWithRetries(
    () => findAndClickButton([CONFIG.BUTTONS.PAYMENT.METHOD]),
    CONFIG.RETRY_INTERVAL_MS,
    CONFIG.MAX_RETRIES
  );

  if (!selectPaymentMethod) return false;

  await new Promise((res) => setTimeout(res, CONFIG.SEQUENCE_DELAY_MS));

  const selectPaymentOption = await performActionWithRetries(
    () => findAndClickButton([CONFIG.BUTTONS.PAYMENT.OPTION]),
    CONFIG.RETRY_INTERVAL_MS,
    CONFIG.MAX_RETRIES
  );

  if (CONFIG.DEBUG) {
    return selectPaymentOption;
  }

  if (!selectPaymentOption) return false;

  await new Promise((res) => setTimeout(res, CONFIG.PLACE_ORDER_DELAY_MS));

  const confirmPurchase = await performActionWithRetries(
    () => findAndClickButton([CONFIG.BUTTONS.PAYMENT.CONFIRM]),
    CONFIG.RETRY_INTERVAL_MS,
    CONFIG.MAX_RETRIES
  );

  return confirmPurchase;
};

const main = async () => {
  displayLog("info", "Starting Shopee checkout automation...");

  const currentURL = window.location.href;
  displayLog("info", `Processing URL: ${currentURL}`);

  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS);
  const shopeeTasks = result.shopeeTasks;

  console.log("shopeeTasks:", shopeeTasks);
  // { tasks: [ { url: "https://shopee.co.th/...", status: "scheduled", runAt: 1744705482 }] }

  const scheduledUrls = shopeeTasks.tasks
    .filter(({ status }) => status !== "completed")
    .map(({ url }) => url);

  if (!scheduledUrls || !scheduledUrls.includes(currentURL)) {
    displayLog(
      "info",
      "Ignore this URL because it is not in the scheduled list."
    );
    return;
  }

  const scheduledTask = shopeeTasks.tasks
    .filter((task) => task.status === "scheduled")
    .find((task) => task.url === currentURL);

  if (scheduledTask && scheduledTask.status === "scheduled") {
    const interval = setInterval(async () => {
      const now = getCurrentUnixTimestamp();
      const scheduledTime = scheduledTask.runAt;

      if (now < scheduledTime) {
        displayLog(
          "info",
          `Waiting for scheduled time: ${scheduledTime} remain: ${
            scheduledTime - now
          } seconds`
        );
      } else {
        const addedToCart = await addItemToCart();
        if (!addedToCart) {
          displayLog("error", "Failed to add item to cart.");
          return;
        }

        const checkedOut = await checkoutCart();
        if (!checkedOut) {
          displayLog("error", "Failed to checkout cart.");
          return;
        }

        const purchased = await purchaseItem();
        if (!purchased) {
          displayLog("error", "Failed to complete purchase.");
          return;
        }

        await chrome.storage.local.set({
          shopeeTasks: {
            tasks: shopeeTasks.tasks.map((task) => {
              if (task.id === scheduledTask.id) {
                return { ...task, status: "completed" };
              }
              return task;
            }),
          },
        });

        clearInterval(interval);
        displayLog("info", "Purchase completed successfully!");
      }
    }, CONFIG.SCHEDULED_URL_INTERVAL_MS);
  }
};

console.log("script executed!");
main();
