const WebthemeUI = {
  injectColors() {
    fetch(chrome.runtime.getURL("colors.css") + "?v=" + Date.now(), { cache: "reload" })
      .then((response) => (response.ok ? response.text() : ""))
      .then((css) => {
        if (!css) return;
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      })
      .catch(() => {});
  },

  async themeName() {
    try {
      const data = await fetch(chrome.runtime.getURL("theme.json") + "?v=" + Date.now(), {
        cache: "reload",
      }).then((response) => (response.ok ? response.json() : null));
      return data && data.name ? data.name : "Omarchy";
    } catch {
      return "Omarchy";
    }
  },

  async catalogPayload() {
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
  },

  hostOf(match) {
    const found = String(match || "").match(/^[^:]+:\/\/([^/]+)/);
    return found ? found[1] : "";
  },

  hostMatches(pattern, hostname) {
    const hostPat = this.hostOf(pattern);
    if (!hostPat) return false;
    if (hostPat === "*") return true;
    if (hostPat.startsWith("*.")) {
      const suffix = hostPat.slice(1);
      const bare = hostPat.slice(2);
      return hostname === bare || hostname.endsWith(suffix);
    }
    return hostname === hostPat;
  },

  siteForHost(sites, hostname) {
    for (const site of sites || []) {
      for (const pattern of site.matches || []) {
        if (this.hostMatches(pattern, hostname)) return site;
      }
    }
    return null;
  },

  hostsLabel(site) {
    return (site.matches || [])
      .map((item) => String(item).replace(/^https?:\/\//, "").replace(/\/\*$/, ""))
      .join(", ");
  },

  withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(label || "timeout")), ms);
      }),
    ]);
  },

  sendMessageOnce(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (reply) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          resolve(reply);
        });
      } catch (err) {
        reject(err);
      }
    });
  },

  async call(msg) {
    try {
      return await this.withTimeout(this.sendMessageOnce(msg), 12000, "native host timeout");
    } catch (err) {
      const text = String(err && err.message ? err.message : err);
      if (!/Receiving end does not exist|Could not establish connection/i.test(text)) {
        return { ok: false, error: text };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        return await this.withTimeout(this.sendMessageOnce(msg), 12000, "native host timeout");
      } catch (retryErr) {
        return { ok: false, error: String(retryErr && retryErr.message ? retryErr.message : retryErr) };
      }
    }
  },

  row(site, currentId, opts) {
    const el = document.createElement("label");
    el.className = "row" + (site.id === currentId ? " current" : "");
    el.innerHTML = "<div><strong></strong><span></span></div><input type='checkbox' />";
    el.querySelector("strong").textContent = site.name || site.id;
    el.querySelector("span").textContent = this.hostsLabel(site);
    const box = el.querySelector("input");
    box.checked = site.enabled !== false;
    box.addEventListener("change", async () => {
      if (opts && opts.onError) opts.onError("");
      const reply = await this.call({
        type: "set-enabled",
        siteId: site.id,
        enabled: box.checked,
      });
      if (!reply || reply.ok === false) {
        box.checked = !box.checked;
        if (opts && opts.onError) opts.onError((reply && reply.error) || "Could not update site");
        return;
      }
      if (opts && opts.onChanged) await opts.onChanged();
    });
    return el;
  },
};
