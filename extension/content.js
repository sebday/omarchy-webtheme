(function () {
  "use strict";

  const STYLE_ID = "omarchy-webtheme-style";
  const match = globalThis.omarchyWebthemeMatch || {};
  const siteForHost = match.siteForHost;

  let lastKey = "";
  let lastRevision = "";
  let appliedCss = "";

  function injectCSS(css) {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
    }
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function removeCSS() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
    appliedCss = "";
    lastKey = "";
  }

  function applyPayload(css, key) {
    if (!css) {
      removeCSS();
      return;
    }
    if (key && key === lastKey && css === appliedCss) return;
    appliedCss = css;
    lastKey = key || "";
    injectCSS(css);
  }

  function fetchText(url) {
    return fetch(url, { cache: "reload" }).then((response) => {
      if (!response.ok) throw new Error(url + " " + response.status);
      return response.text();
    });
  }

  function extUrl(path, token) {
    return chrome.runtime.getURL(path) + "?v=" + encodeURIComponent(token);
  }

  function applyOverlay(catalog, overlay) {
    if (!catalog || !overlay) return catalog;
    if (typeof overlay.enabled === "boolean") catalog.enabled = overlay.enabled;
    const map = overlay.siteEnabled && typeof overlay.siteEnabled === "object" ? overlay.siteEnabled : {};
    const sites = Array.isArray(catalog.sites) ? catalog.sites : [];
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      if (!site || !site.id || !Object.prototype.hasOwnProperty.call(map, site.id)) continue;
      site.enabled = map[site.id] !== false;
    }
    return catalog;
  }

  function loadOverlay() {
    if (!chrome.storage || !chrome.storage.local) {
      return Promise.resolve({ enabled: true, siteEnabled: {} });
    }
    return chrome.storage.local.get("enabledOverlay").then((data) => {
      const overlay = data && data.enabledOverlay;
      if (overlay && typeof overlay === "object") return overlay;
      return { enabled: true, siteEnabled: {} };
    }).catch(() => ({ enabled: true, siteEnabled: {} }));
  }

  function checkForUpdate(force) {
    const hostname = location.hostname;
    const token = String(Date.now());

    Promise.all([
      fetchText(extUrl("catalog.json", token)),
      fetchText(extUrl("revision", token)).catch(() => token),
      loadOverlay(),
    ])
      .then(([catalogText, revision, overlay]) => {
        lastRevision = revision;
        const catalog = applyOverlay(JSON.parse(catalogText), overlay);
        if (catalog && catalog.enabled === false) {
          removeCSS();
          return;
        }
        const site = siteForHost ? siteForHost(catalog, hostname) : null;
        if (!site || !site.css) {
          removeCSS();
          return;
        }
        const key = revision + "\n" + site.id + "\n" + site.css + "\n" + String(site.enabled !== false);
        if (!force && key === lastKey && appliedCss) return;
        return Promise.all([
          fetchText(extUrl("colors.css", revision || token)).catch(() => ""),
          fetchText(extUrl(site.css, revision || token)),
        ]).then(([colors, siteCss]) => {
          applyPayload([colors, siteCss].filter(Boolean).join("\n"), key);
        });
      })
      .catch((err) => {
        console.warn("omarchy webtheme:", err && err.message ? err.message : err);
      });
  }

  function pollRevision() {
    if (window !== window.top) return;
    if (document.visibilityState !== "visible") return;
    fetchText(extUrl("revision", Date.now()))
      .then((rev) => {
        if (rev === lastRevision) return;
        lastRevision = rev;
        checkForUpdate(true);
      })
      .catch(() => {});
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "omarchy-webtheme-reload") return;
    if (typeof msg.css === "string") {
      applyPayload(msg.css, msg.key || String(Date.now()));
      return;
    }
    checkForUpdate(true);
  });

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.enabledOverlay) checkForUpdate(true);
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate(true);
  });

  if (window === window.top) {
    setInterval(pollRevision, 800);
  }

  checkForUpdate(true);
})();
