const meta = document.getElementById("meta");
const errorEl = document.getElementById("error");
const bundledEl = document.getElementById("bundled");
const bundledEmpty = document.getElementById("bundled-empty");
const personalEl = document.getElementById("personal");
const personalEmpty = document.getElementById("personal-empty");

WebthemeUI.injectColors();
WebthemeUI.keepAlive();

function showError(text) {
  errorEl.hidden = !text;
  errorEl.textContent = text || "";
}

function isPersonal(site) {
  return site && site.source === "user";
}

function render(reply, themeName) {
  const sites = Array.isArray(reply.sites) ? reply.sites : [];
  const on = reply.enabled !== false;
  const enabledCount = sites.filter((site) => site.enabled !== false).length;
  meta.textContent = (themeName || "Omarchy") + (on ? " · " + enabledCount + " enabled" : " · Paused");

  const bundled = sites.filter((site) => !isPersonal(site));
  const personal = sites.filter(isPersonal);
  const rowOpts = { onError: showError, onChanged: load };

  bundledEl.replaceChildren(...bundled.map((site) => WebthemeUI.row(site, null, rowOpts)));
  personalEl.replaceChildren(...personal.map((site) => WebthemeUI.row(site, null, rowOpts)));
  bundledEmpty.hidden = bundled.length > 0;
  personalEmpty.hidden = personal.length > 0;
}

async function load() {
  try {
    const [themeName, catalog] = await Promise.all([WebthemeUI.themeName(), WebthemeUI.catalogPayload()]);
    render(catalog, themeName);
  } catch (err) {
    meta.textContent = "Failed to load";
    showError(String(err && err.message ? err.message : err));
  }
}

load();
