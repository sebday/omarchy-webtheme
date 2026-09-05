const globalToggle = document.getElementById("global");
const meta = document.getElementById("meta");
const errorEl = document.getElementById("error");
const noticeEl = document.getElementById("notice");
const currentCard = document.getElementById("current");
const currentHost = document.getElementById("current-host");
const currentStatus = document.getElementById("current-status");
const themeBtn = document.getElementById("theme-site");

let tabUrl = "";
let tabTitle = "";
let tabHost = "";
let desktopTheme = "Omarchy";

WebthemeUI.injectColors();

function openAllSites(event) {
  if (event) event.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("sites.html") });
}

function showError(text) {
  errorEl.hidden = !text;
  errorEl.textContent = text || "";
}

function showNotice(text) {
  noticeEl.hidden = !text;
  noticeEl.textContent = text || "";
}

function jobForHost(jobs, hostname) {
  return (jobs || []).find((job) => job && job.host === hostname) || null;
}

function render(reply, jobs) {
  const sites = Array.isArray(reply.sites) ? reply.sites : [];
  const on = reply.enabled !== false;
  const enabledCount = sites.filter((site) => site.enabled !== false).length;
  globalToggle.checked = on;
  meta.textContent = on ? enabledCount + " enabled" : "Paused";

  const current = tabHost ? WebthemeUI.siteForHost(sites, tabHost) : null;
  const pending = tabHost ? jobForHost(jobs, tabHost) : null;

  const otherJobs = (jobs || []).filter((job) => job && job.host && job.host !== tabHost);
  if (pending) {
    showNotice("Theming " + pending.host + " in the background.");
  } else if (otherJobs.length) {
    showNotice("Theming " + otherJobs.map((job) => job.host).join(", ") + " in the background.");
  } else {
    showNotice("");
  }

  if (!tabHost) {
    currentCard.hidden = true;
    return;
  }

  currentCard.hidden = false;
  currentHost.textContent = tabHost;
  if (current && current.enabled !== false && on) {
    currentStatus.textContent = desktopTheme;
    themeBtn.hidden = true;
  } else if (current && !on) {
    currentStatus.textContent = "Package exists, theming is paused";
    themeBtn.hidden = true;
  } else if (current) {
    currentStatus.textContent = "Package exists but is disabled";
    themeBtn.hidden = true;
  } else if (pending) {
    currentStatus.textContent = "The default agent is theming this site";
    themeBtn.hidden = true;
  } else {
    currentStatus.textContent = "No package for this host";
    themeBtn.hidden = false;
  }
}

async function load() {
  try {
    desktopTheme = await WebthemeUI.themeName();
    const [catalog, jobsReply] = await Promise.all([
      WebthemeUI.catalogPayload(),
      WebthemeUI.call({ type: "theme-jobs" }),
    ]);
    const jobs = jobsReply && jobsReply.ok !== false && Array.isArray(jobsReply.jobs) ? jobsReply.jobs : [];
    render(catalog, jobs);
  } catch (err) {
    meta.textContent = "Failed to load";
    showError(String(err && err.message ? err.message : err));
  }
}

globalToggle.addEventListener("change", async () => {
  showError("");
  const reply = await WebthemeUI.call({ type: "enabled", enabled: globalToggle.checked });
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
  const reply = await WebthemeUI.call({ type: "theme-site", url: tabUrl, title: tabTitle });
  themeBtn.disabled = false;
  if (!reply || reply.ok === false) {
    showError((reply && reply.error) || "Could not launch the agent");
    return;
  }
  await load();
});

document.getElementById("all-sites").addEventListener("click", openAllSites);
meta.addEventListener("click", openAllSites);
meta.title = "Open all sites";
meta.style.cursor = "pointer";

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
