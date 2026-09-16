# Fabled

A minimal, hackable roleplay chat frontend in the spirit of SillyTavern.

- **Streaming chat** with any OpenAI-compatible API: OpenRouter, Ollama, LM Studio, KoboldCpp, llama.cpp, vLLM, OpenAI
- **Clean shadcn/ui interface:** light and dark themes, works on phones, character search, toast notifications
- **Character cards:** import Tavern Card V1/V2/V3 as PNG or JSON; alternate greetings become swipes, and a lorebook embedded in the card comes with it
- **Character editor:** write a card from scratch or edit any imported one, avatar included
- **User card:** your own name, persona and picture, on their own Settings tab; the persona is sent with every prompt, and a vision model can write your appearance from your picture
- **Expandable profiles:** click any avatar or name to see the full card picture and its fields
- **Impersonate:** have the model write your own message, in your voice, from the conversation so far
- **Branching:** split a chat at any reply and carry on down a different road, with the original left where it was
- **Swipes:** step through past replies, or press › on the latest reply to generate a new version
- **Edit, copy, regenerate, delete (with confirmation) and Stop:** if you stop a reply midway, the partial text is kept
- **Prompt post-processing** for backends that insist on one system block and alternating turns: merge, alternating, alternating-user-first, or flatten to a single message
- **Prompt builder** with `{{char}}` / `{{user}}` macros, card system prompt override (`{{original}}`), post-history instructions and a context budget that drops the oldest messages first
- **Model thinking:** reasoning is streamed into a fold-away panel above the reply, whether the provider sends it as `reasoning_content`, `reasoning` or `<think>` tags in the text
- **Lorebooks:** World Info in the SillyTavern tradition - keyword and regex triggers, optional filters with AND ANY / AND ALL / NOT ANY / NOT ALL, constant and selective entries, recursion, inclusion groups, sticky / cooldown / delay, a token budget, and import of SillyTavern exports
- **Chat memory:** when older messages fall out of the window they are summarised into a rolling summary, sent with every reply and editable by hand
- **Generation details:** every reply keeps a record - the prompt exactly as sent, how much of the history fit, token counts, timings and why the model stopped
- **Safe markdown:** raw HTML from cards or models is escaped, and only http(s)/mailto links are allowed. `"dialogue"` is highlighted and `*actions*` are italicised
- **Local-first:** no server and no accounts. Characters, chats, lorebooks, pictures, settings and your API key stay in your own browser, and messages go straight from the page to the provider you chose
- **Backups:** export everything to one file and restore it in any browser; the API key is left out unless you ask for it

## Stack

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript, Vite, **Tailwind CSS v4**, **shadcn/ui** (new-york style, zinc + violet), lucide icons, sonner toasts |
| Markdown | `marked` with custom safe renderers |
| Storage | IndexedDB in the browser, through [`idb`](https://github.com/jakearchibald/idb) |
| Server | none - the build is static files |

The UI has light and dark themes. Use the sun/moon button to switch; dark is the default. To change the look, edit the colors in `web/index.css`. You can use the [shadcn theme builder](https://ui.shadcn.com/themes) and paste its `:root` / `.dark` blocks there.

`components.json` is already set up, so you can add more shadcn components with:

```bash
npx shadcn@latest add sheet select command
```

## Run it

Requires **Node 22.18 or newer** to build (Node 24 LTS recommended). The app itself needs only a browser.

```bash
npm install
npm run dev          # http://localhost:5173
```

Then:

1. Pick a provider in **Settings**, add your key if the provider needs one, then click **Fetch models** and choose a model.
2. A starter character, Sable Emberwright, is already waiting. Add your own with **New character**, or the upload button beside it to import a card (`.png` or `.json`). Samples are in `samples/`.
3. Fill in your own name and persona under **Settings -> User**, then start chatting.

## Hosting

```bash
npm run build        # static files in dist/
npm run preview      # try the build at http://localhost:4173
```

`dist/` can go on any static host: GitHub Pages, Cloudflare Pages, Netlify, Vercel, or a plain web server. There is nothing to run and nothing to keep secret on the host - every visitor brings their own key, and their data never reaches it.

## Your data

Everything lives in this browser's IndexedDB, in a database called `fabled`:

| Store | Holds |
|---|---|
| `kv` | settings (including the API key), and whether the starter character was added |
| `characters` | cards, and the id of each avatar |
| `chats` | title, character, and the chat it was branched from |
| `messages` | swipes and a light generation record per swipe |
| `records` | the prompt and thinking behind each swipe, kept apart because they are large |
| `memory` | each chat's rolling summary |
| `lore_state` | which lorebook entries are sticky or cooling down in each chat |
| `lorebooks` | books and their entries |
| `images` | avatars and chat backgrounds |

What that means in practice:

- **Nothing is shared between browsers or devices.** Move with **Settings -> Data -> Export backup**, then **Restore from backup** on the other side.
- **Browsers can clear site data.** Fabled asks for persistent storage; if the browser declines, the Data tab says so. Safari removes data from sites you have not visited for a while unless the site is added to the home screen. Export a backup now and then.
- **Backups leave the API key out** unless you tick the box. A backup that has it gives the key to whoever holds the file.
- **Clear all data** on the Data tab removes everything, the key included.

## Security

With no server, the thing to protect against is a script on the page, which could read the key and every chat. So:

- Markdown from cards and models is sanitised: raw HTML is escaped, and only http(s)/mailto links are allowed.
- The build ships a Content Security Policy that lets the page run only its own scripts. `connect-src` stays open because the provider is whatever URL you type.
- The key is sent only to the provider URL in Settings. OpenRouter's attribution headers are sent only to OpenRouter.

## Providers and CORS

The browser talks to the provider directly, so the provider must allow requests from web pages (CORS). OpenRouter and OpenAI do.

Local servers usually need it switched on:

- **Ollama:** set `OLLAMA_ORIGINS` to the site's origin (or `*`) and restart it.
- **LM Studio:** turn on *Enable CORS* in the server settings.
- **KoboldCpp / llama.cpp:** both allow it by default in recent versions.

A page served over HTTPS may also be blocked from reaching `http://localhost` by the browser. Running Fabled locally with `npm run dev` or `npm run preview` avoids that. If a connection fails, the error says when CORS is the likely cause.

## Tests

```bash
npm test          # node --test, no test framework to install
npm run typecheck
npm run check     # both
```

The suite covers the parts where a quiet bug does real damage: the prompt
builder's context budget and trimming, Tavern card normalization and the PNG
`tEXt` reader, the IndexedDB store (run on `fake-indexeddb`: records per swipe,
cascading deletes, and backups that restore everything and leave the key out),
and the markdown sanitiser - which is the only thing between
untrusted card or model text and `dangerouslySetInnerHTML`.

## Layout

```
tests/              node:test suites for the logic above
public/
  theme-init.js     applies the saved theme before the first paint
web/
  App.tsx           app state + layout
  api.ts            everything the UI asks for, and generation, answered in the browser
  types.ts          shared types
  markdown.ts       safe markdown renderer
  index.css         Tailwind + theme tokens + chat typography
  core/
    db.ts             IndexedDB storage, settings, generation records, backups
    lorebook.ts       World Info: matching, recursion, groups, timed effects, budget
    lorebook-import.ts  reads a SillyTavern World Info export
    memory.ts         folds forgotten messages into a rolling summary
    cards.ts          PNG tEXt chunk reader, card normalization
    prompt.ts         prompt builder, macros, context trimming
    post-process.ts   reshapes the finished prompt for fussy backends
    llm.ts            OpenAI-compatible streaming client
  hooks/            use-theme, use-confirm, use-image-url (stored pictures as object URLs)
  components/
    app-sidebar.tsx     characters, search, chats, settings, theme toggle
    chat-view.tsx       message list, composer, profile dialogs
    message-item.tsx    message, hover toolbar, swipes, inline edit
    character-dialog.tsx  create or edit a card (profile / chat / prompt tabs)
    profile-dialog.tsx    the expanded card behind an avatar
    generation-dialog.tsx what happened when a reply was generated
    avatar-picker.tsx     shared picture picker for cards and the user
    settings-dialog.tsx connection / user / customize / generation / prompt / data tabs
    data-panel.tsx      backup, restore, clear all, storage status
    empty-state.tsx     first-run checklist
    ui/                 shadcn/ui components
```

## Next steps

- **Accurate token counts:** replace `estimateTokens` in `web/core/prompt.ts` with a real tokenizer. Generation details already show the provider's own counts next to the estimate, so you can see how far off it is
- **PNG card export:** write the edited card back into a `chara` chunk so it can be shared
- **Multiple personas, group chats, regex scripts, presets, themes**
- **Native Claude / Gemini adapters** alongside `web/core/llm.ts`
- **Sync between devices**, for example through a file in the user's own cloud storage
