# Unpolished: privacy

Unpolished collects nothing. It has no server, no analytics, no account and no telemetry.

**Your text** is read only when you ask: when you click the stamp, choose *Unpolish this*, press the shortcut, or paste into the side panel. What happens to it depends on the engine you choose in Settings:

- *Chrome's built-in model*: corrected on your computer. It is not sent anywhere.
- *Your own API key*: sent from your browser directly to the provider you chose (Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, OpenRouter, xAI, Together AI, or the address you gave), with your key, under that provider's terms.
- *Ollama*: sent to the Ollama server at the address you gave.
- *Polish check only*: nothing is sent; the check runs on your computer.

**Your settings and API keys** are stored in Chrome's local extension storage on your computer. They are not synced and not sent to us; we have nowhere to send them.

**Permissions.** The extension reaches a web page only when you ask it to (Chrome's `activeTab`). The permission to run on all sites is asked for only if you turn on the stamp in every text box, and even then a text box is read only when you click the stamp.

Questions: open an issue at the project's GitHub repository.
