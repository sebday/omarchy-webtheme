(function () {
  "use strict";

  const STYLE_ID = "omarchy-webtheme-style";

  let lastKey = "";
  let lastRevision = "";
  let appliedCss = "";

  const match = globalThis.omarchyWebthemeMatch || {};
  const siteForHost = match.siteForHost;

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

  function checkForUpdate(force) {
    const hostname = location.hostname;
    const token = String(Date.now());

    Promise.all([
      fetchText(extUrl("catalog.json", token)),
      fetchText(extUrl("revision", token)).catch(() => token),
    ])
      .then(([catalogText, revision]) => {
        lastRevision = revision;
        const catalog = JSON.parse(catalogText);
        if (catalog && catalog.enabled === false) {
          removeCSS();
          return;
        }
        const site = siteForHost ? siteForHost(catalog, hostname) : null;
        if (!site || !site.css) {
          removeCSS();
          return;
        }
        const key = revision + "\n" + site.id + "\n" + site.css;
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate(true);
  });

  if (window === window.top) {
    setInterval(pollRevision, 800);
  }

  checkForUpdate(true);
})();
