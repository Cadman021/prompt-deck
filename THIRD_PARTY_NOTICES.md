# Third-party assets

## Fonts

PromptDeck bundles three variable fonts through `@fontsource-variable/*` so the
UI renders identically on every machine instead of depending on what the OS has
installed. All three are licensed under the **SIL Open Font License 1.1**, which
permits bundling and redistribution inside a GPL-3.0 application.

| Font           | Use                                    | Licence | Upstream                                   |
| -------------- | -------------------------------------- | ------- | ------------------------------------------ |
| Inter          | UI text                                | OFL 1.1 | https://github.com/rsms/inter              |
| JetBrains Mono | Metrics, code and model ids            | OFL 1.1 | https://github.com/JetBrains/JetBrainsMono |
| Vazirmatn      | Persian (فارسی) text and RTL rendering | OFL 1.1 | https://github.com/rastikerdar/vazirmatn   |

Each package ships its own `LICENSE` file under
`node_modules/@fontsource-variable/<family>/`; the OFL text is reproduced there
and at https://openfontlicense.org/.

The vendored license files are copied into the build output next to the font
assets by `scripts/copy-font-licenses.cjs` (run from `npm run build`), so a
downloaded installer carries the notices it is required to carry.

## Provider icons

`public/providers/*.png` are the trademarks of their respective providers and
are used only to identify the provider a connection belongs to. They are not
covered by this project's GPL licence.
