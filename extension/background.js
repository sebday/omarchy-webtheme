const HOST = "com.evo.webtheme";

let port = null;
let reconnectTimer = null;
let nextId = 1;
const pending = new Map();
const cssCache = new Map();

function patternHost(pattern) {
  const match = String(pattern || "").match(/^[^:]+:\/\/([^/]+)/);
  return match ? match[1] : "";
}

function hostMatches(pattern, hostname) {
  const hostPat = patternHost(pattern);
  if (!hostPat) return false;
  if (hostPat === "*") return true;
  if (hostPat.startsWith("*.")) {
    const suffix = hostPat.slice(1);
    const bare = hostPat.slice(2);
    return hostname === bare || hostname.endsWith(suffix);
  }
  return hostname === hostPat;
}

function siteForHost(catalog, hostname) {
  const sites = catalog && Array.isArray(catalog.sites) ? catalog.sites : [];
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    if (!site || site.enabled === false) continue;
    const matches = Array.isArray(site.matches) ? site.matches : [];
    for (let j = 0; j < matches.length; j++) {
      if (hostMatches(matches[j], hostname)) return site;
    }
  }
  return null;
}

function sendNative(msg) {
  return new Promise((resolve, reject) => {
    if (!port) connect();
    if (!port) {
      reject(new Error("native host not connected"));
      return;
    }
    const id = String(nextId++);
    pending.set(id, { resolve, reject });
    try {
      port.postMessage(Object.assign({ id }, msg));
    } catch (err) {
      pending.delete(id);
      reject(err);
      return;
    }
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error("native host timeout"));
    }, 12000);
  });
}

function applyBadge(payload) {
  const enabled = payload && payload.enabled !== false;
  const sites = payload && Array.isArray(payload.sites) ? payload.sites : [];
  let count = 0;
  for (let i = 0; i < sites.length; i++) {
    if (sites[i] && sites[i].enabled !== false) count += 1;
  }
  const text = enabled && count > 0 ? String(count) : "";
  chrome.action.setBadgeBackgroundColor({ color: "#7aa2f7" });
  chrome.action.setBadgeText({ text });
}

function extText(path, bust) {
  return fetch(chrome.runtime.getURL(path) + "?v=" + bust, { cache: "reload" }).then((response) => {
    if (!response.ok) throw new Error(path + " " + response.status);
    return response.text();
  });
}

async function readCatalog() {
  const catalog = JSON.parse(await extText("catalog.json", Date.now()));
  applyBadge(catalog);
  await resolveThemeJobs(catalog);
  return catalog;
}

async function cssForTab(catalog, colors, tab, bust) {
  if (!catalog || catalog.enabled === false || !tab || !tab.url) return "";
  let hostname;
  try {
    if (!/^https?:/i.test(tab.url)) return "";
    hostname = new URL(tab.url).hostname;
  } catch {
    return "";
  }
  const site = siteForHost(catalog, hostname);
  if (!site || !site.css) return "";
  let siteCss = cssCache.get(site.css);
  if (!siteCss) {
    siteCss = await extText(site.css, bust).catch(() => "");
    cssCache.set(site.css, siteCss);
  }
  return [colors, siteCss].filter(Boolean).join("\n");
}

function pingTab(tabId, payload) {
  chrome.tabs.sendMessage(tabId, payload, () => {
    void chrome.runtime.lastError;
  });
}

function paintTab(tabId, css, key) {
  pingTab(tabId, { type: "omarchy-webtheme-reload", css, key });
  if (!chrome.scripting || typeof chrome.scripting.executeScript !== "function") return;
  chrome.scripting
    .executeScript({
      target: { tabId },
      func: (nextCss) => {
        const id = "omarchy-webtheme-style";
        let el = document.getElementById(id);
        if (!nextCss) {
          if (el) el.remove();
          return;
        }
        if (!el) {
          el = document.createElement("style");
          el.id = id;
        }
        el.textContent = nextCss;
        (document.head || document.documentElement).appendChild(el);
      },
      args: [css],
    })
    .catch(() => {});
}

async function broadcastReload() {
  const bust = String(Date.now());
  cssCache.clear();
  let catalog;
  try {
    catalog = await readCatalog();
  } catch (err) {
    console.warn("omarchy webtheme: catalog", err);
    return;
  }
  const colors = await extText("colors.css", bust).catch(() => "");
  const revision = await extText("revision", bust).catch(() => bust);

  chrome.tabs.query({}, async (tabs) => {
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      if (!tab.url || !/^https?:/i.test(tab.url)) {
        pingTab(tab.id, { type: "omarchy-webtheme-reload" });
        continue;
      }
      const css = await cssForTab(catalog, colors, tab, bust);
      let site = null;
      try {
        site = siteForHost(catalog, new URL(tab.url).hostname);
      } catch {
        site = null;
      }
      paintTab(tab.id, css, revision + "\n" + (site ? site.id + "\n" + site.css : ""));
    }
  });
}

function refreshBadge() {
  readCatalog().catch(() => chrome.action.setBadgeText({ text: "" }));
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function themeJobId(host) {
  return "webtheme-theme-" + host;
}

async function loadThemeJobs() {
  try {
    const data = await chrome.storage.session.get("themeJobs");
    if (Array.isArray(data.themeJobs)) return data.themeJobs;
  } catch {
    /* storage.session may be unavailable until the permission is granted */
  }
  return [];
}

async function saveThemeJobs(jobs) {
  try {
    await chrome.storage.session.set({ themeJobs: jobs });
  } catch {
    /* ignore */
  }
}

function notifyChrome(id, title, message) {
  if (!chrome.notifications || typeof chrome.notifications.create !== "function") return;
  chrome.notifications.create(
    id,
    {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title,
      message,
      priority: 1,
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

async function startThemeJob(msg, reply) {
  const url = (reply && reply.url) || msg.url || "";
  const host = (reply && reply.host) || hostFromUrl(url);
  if (!host) return;
  const jobs = (await loadThemeJobs()).filter((job) => job.host !== host);
  jobs.push({ host, url, title: msg.title || host, startedAt: Date.now() });
  await saveThemeJobs(jobs);
  notifyChrome(
    themeJobId(host),
    "Theming " + host,
    "The default agent is writing a personal package in the background."
  );
}

async function resolveThemeJobs(catalog) {
  const jobs = await loadThemeJobs();
  if (!jobs.length) return;
  const kept = [];
  const now = Date.now();
  for (const job of jobs) {
    if (siteForHost(catalog, job.host)) {
      notifyChrome(themeJobId(job.host), "Themed " + job.host, "The personal package is on.");
      continue;
    }
    if (now - (job.startedAt || 0) > 45 * 60 * 1000) continue;
    kept.push(job);
  }
  await saveThemeJobs(kept);
}

function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (err) {
    console.warn("omarchy webtheme: native host missing", err);
    port = null;
    reconnectTimer = setTimeout(connect, 2000);
    return;
  }
  port.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.id && pending.has(String(msg.id))) {
      const waiter = pending.get(String(msg.id));
      pending.delete(String(msg.id));
      waiter.resolve(msg);
      return;
    }
    if (msg.type === "reload") {
      broadcastReload();
    }
  });
  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
    port = null;
    for (const waiter of pending.values()) waiter.reject(new Error(err || "native host disconnected"));
    pending.clear();
    reconnectTimer = setTimeout(connect, 2000);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") {
    sendResponse({ ok: false, error: "invalid message" });
    return false;
  }
  if (msg.type === "list") {
    readCatalog()
      .then((catalog) => sendResponse(Object.assign({ ok: true, type: "list" }, catalog)))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  }
  if (msg.type === "theme-jobs") {
    readCatalog()
      .then(() => loadThemeJobs())
      .then((jobs) => sendResponse({ ok: true, jobs }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  }
  sendNative(msg)
    .then((reply) => {
      if (msg.type === "set-enabled" || msg.type === "enabled") broadcastReload();
      const done = msg.type === "theme-site" && reply && reply.ok !== false ? startThemeJob(msg, reply) : Promise.resolve();
      return done.then(() => sendResponse(reply));
    })
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
  return true;
});

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
refreshBadge();
