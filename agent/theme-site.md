Theme the current website to follow the active Omarchy palette.

## Target

- URL: {{URL}}
- Title: {{TITLE}}
- Suggested id: {{SLUG}}
- Host: {{HOST}}

Create **one user site package** (not a bundled default):

- `{{USER_SITES}}/{{SLUG}}/site.json`
- `{{USER_SITES}}/{{SLUG}}/style.css` (omit this file if you use `themeCss` below)

## site.json

```json
{
  "id": "{{SLUG}}",
  "name": "{{TITLE}}",
  "matches": ["https://{{HOST}}/*"],
  "enabled": true
}
```

- `id` must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- If the live site also serves `www.{{HOST}}`, add that match too.
- Do not add unrelated hosts.

## CSS contract

Map the site’s own design tokens onto Omarchy web variables from `{{COLORS_TPL}}`:

- `--bg-primary`, `--bg-secondary`
- `--text-primary`, `--text-accent`
- `--blue`, `--cyan`, `--purple`, `--pink`, `--green`, `--orange`, `--red`

Read bundled examples under `{{PLUGIN_DIR}}/sites/` (GitHub, YouTube). Copy that style: remap existing variables, do not restyle every pixel, do not invent a parallel palette.

If the page is Shoelace (`sl-*` elements or `--sl-color-*` tokens), skip `style.css` and use:

```json
"themeCss": "shoelace-hex.css"
```

## Do not

- Edit `{{PLUGIN_DIR}}/sites/` or anything under `/usr/share/omarchy/`
- Add packages, daemons, or browser flags
- Duplicate a host that already has a package (update that user package instead)

## Finish

Run:

```
{{WEBTHEME}} assemble
```

That hotloads CSS in open Brave/Chromium tabs. No browser restart.
