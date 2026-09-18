# Unpolished

**Correct English that still sounds like you.**

A Chrome extension for people who write in English as a second language. It fixes the mistakes, keeps your words, your sentences and your tone, and shows you when a tool has polished your text into something that reads as machine-written.

- **Fix, not rewrite.** Grammar, spelling, tense, articles, prepositions and word order. One sentence out for each sentence in. If the model adds a sentence you did not write, it is asked again; if it does it twice, you are told.
- **Red pen.** Every change is shown the way a teacher marks a page: crossed out in red, written in above in blue.
- **Polish check.** Which habits in the text readers take as machine-written, measured, not guessed: each one is in far more of the models' texts than of people's in the same documents ([Is it really an AI tell?](https://github.com/barbarkaragul-oss/is-it-really-an-ai-tell)). It also says which of the usual suspects are not tells at all: people use dashes and "moreover" at least as often as the models do. It runs without any model, on this computer.

## Where your text goes

| Engine | Where it runs | Needs |
|---|---|---|
| Chrome's built-in model (Gemini Nano, Prompt API) | on this computer; nothing is sent | Chrome 138+ on a desktop, 22 GB free, a GPU with more than 4 GB or 16 GB of RAM; downloads once |
| Claude, with your key | straight from the extension to Anthropic | your Anthropic API key |
| OpenAI, with your key | straight from the extension to OpenAI | your OpenAI key and a model name |
| Ollama | your own Ollama server | Ollama and a model |
| Polish check only | on this computer | nothing |

There is no server of ours. Keys are kept in `chrome.storage.local`, on this computer, never in sync storage. Nothing is collected.

## Permissions

At install: `storage`, `contextMenus`, `activeTab`, `scripting`, `sidePanel`. That is enough for the side panel (the toolbar button), the right-click **Unpolish this** and the shortcut <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>, which reach only the tab you are in, only then.

Asked for later, only if you turn it on: the Anthropic or OpenAI address when you save a key, your Ollama address, and all sites if you want the stamp in every text box.

## Build

```bash
npm install
npm run sync      # copy the marker catalogue and the measured rates from ../is-it-really-an-ai-tell
npm test
npm run build     # dist/ and release/unpolished-<version>.zip
```

`npm run dev` builds into `dev-dist/` with a playground page and serves it: the page script and the panel run in a plain tab against a stand-in for the extension APIs. Add `?ollama=http://127.0.0.1:11434` to its address to correct with a local Ollama.

To try the real extension: `chrome://extensions` → Developer mode → Load unpacked → `dist/`.

## License

MIT. Fraunces is under the SIL Open Font License (`dist/fonts/LICENSE-Fraunces.txt`).
