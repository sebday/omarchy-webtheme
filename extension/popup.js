const globalToggle = document.getElementById("global");
const meta = document.getElementById("meta");
const errorEl = document.getElementById("error");
const currentCard = document.getElementById("current");
const currentHost = document.getElementById("current-host");
const currentStatus = document.getElementById("current-status");
const themeBtn = document.getElementById("theme-site");
const bundledEl = document.getElementById("bundled");
const mineEl = document.getElementById("mine");
const mineEmpty = document.getElementById("mine-empty");

let tabUrl = "";
let tabTitle = "";
let tabHost = "";

fetch(chrome.runtime.getURL("colors.css") + "?v=" + Date.now(), { cache: "reload" })
  .then((response) => (response.ok ? response.text() : ""))
  .then((css) => {
    if (!css) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  })
  .catch(() => {});

function hostOf(match) {
  const found = String(match || "").match(/^[^:]+:\/\/([^/]+)/);
  return found ? found[1] : "";
}

function hostMatches(pattern, hostname) {
  const hostPat = hostOf(pattern);
  if (!hostPat) return false;
  if (hostPat === "*") return true;
  if (hostPat.startsWith("*.")) {
    const suffix = hostPat.slice(1);
    const bare = hostPat.slice(2);
    return hostname === bare || hostname.endsWith(suffix);
  }
  return hostname === hostPat;
}

function siteForHost(sites, hostname) {
  for (const site of sites || []) {
    for (const pattern of site.matches || []) {
      if (hostMatches(pattern, hostname)) return site;
    }
  }
  return null;
}

function hostsLabel(site) {
  return (site.matches || [])
    .map((item) => String(item).replace(/^https?:\/\//, "").replace(/\/\*$/, ""))
    .join(", ");
}

function showError(text) {
  errorEl.hidden = !text;
  errorEl.textContent = text || "";
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label || "timeout")), ms);
    }),
  ]);
}

async function call(msg) {
  try {
    return await withTimeout(Promise.resolve(chrome.runtime.sendMessage(msg)), 5000, "native host timeout");
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function catalogPayload() {
  const catalog = await fetch(chrome.runtime.getURL("catalog.json") + "?v=" + Date.now(), {
    cache: "reload",
  }).then((response) => {
    if (!response.ok) throw new Error("catalog " + response.status);
    return response.json();
  });
  return {
    ok: true,
    enabled: catalog.enabled !== false,
    sites: Array.isArray(catalog.sites) ? catalog.sites : [],
  };
}

function row(site, currentId) {
  const el = document.createElement("label");
  el.className = "row" + (site.id === currentId ? " current" : "");
  el.innerHTML = "<div><strong></strong><span></span></div><input type='checkbox' />";
  el.querySelector("strong").textContent = site.name || site.id;
  el.querySelector("span").textContent = hostsLabel(site);
  const box = el.querySelector("input");
  box.checked = site.enabled !== false;
  box.addEventListener("change", async () => {
    showError("");
    const reply = await call({
      type: "set-enabled",
      siteId: site.id,
      enabled: box.checked,
    });
    if (!reply || reply.ok === false) {
      box.checked = !box.checked;
      showError((reply && reply.error) || "Could not update site");
      return;
    }
    await load();
  });
  return el;
}

function render(reply) {
  const sites = Array.isArray(reply.sites) ? reply.sites : [];
  const on = reply.enabled !== false;
  const enabledCount = sites.filter((site) => site.enabled !== false).length;
  globalToggle.checked = on;
  meta.textContent = on ? enabledCount + " enabled" : "Paused";

  const bundled = sites.filter((site) => site.source !== "user");
  const mine = sites.filter((site) => site.source === "user");
  const current = tabHost ? siteForHost(sites, tabHost) : null;

  bundledEl.replaceChildren(...bundled.map((site) => row(site, current && current.id)));
  mineEl.replaceChildren(...mine.map((site) => row(site, current && current.id)));
  mineEmpty.hidden = mine.length > 0;

  if (!tabHost) {
    currentCard.hidden = true;
    return;
  }

  currentCard.hidden = false;
  currentHost.textContent = tabHost;
  if (current && current.enabled !== false && on) {
    currentStatus.textContent = "Themed by " + (current.name || current.id);
    themeBtn.hidden = true;
  } else if (current && !on) {
    currentStatus.textContent = "Package exists, theming is paused";
    themeBtn.hidden = true;
  } else if (current) {
    currentStatus.textContent = "Package exists but is disabled";
    themeBtn.hidden = true;
  } else {
    currentStatus.textContent = "No package for this host";
    themeBtn.hidden = false;
  }
}

async function load() {
  try {
    render(await catalogPayload());
  } catch (err) {
    meta.textContent = "Failed to load";
    showError(String(err && err.message ? err.message : err));
  }
}

globalToggle.addEventListener("change", async () => {
  showError("");
  const reply = await call({ type: "enabled", enabled: globalToggle.checked });
  if (!reply || reply.ok === false) {
    globalToggle.checked = !globalToggle.checked;
    showError((reply && reply.error) || "Could not update theming");
    return;
  }
  await load();
});

themeBtn.addEventListener("click", async () => {
  showError("");
  themeBtn.disabled = true;
  const reply = await call({ type: "theme-site", url: tabUrl, title: tabTitle });
  themeBtn.disabled = false;
  if (!reply || reply.ok === false) {
    showError((reply && reply.error) || "Could not launch the agent");
    return;
  }
  currentStatus.textContent = "Opening the default agent…";
  themeBtn.hidden = true;
});

async function init() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    tabUrl = tab && tab.url ? tab.url : "";
    tabTitle = tab && tab.title ? tab.title : "";
    tabHost = tabUrl && /^https?:/i.test(tabUrl) ? new URL(tabUrl).hostname : "";
  } catch {
    tabHost = "";
  }
  await load();
}

init();
