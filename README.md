# Fabled

A minimal, hackable roleplay chat frontend in the spirit of SillyTavern.

- **Streaming chat** with any OpenAI-compatible API: OpenRouter, Ollama, LM Studio, KoboldCpp, llama.cpp, vLLM, OpenAI
- **Clean shadcn/ui interface:** light and dark themes, works on phones, character search, toast notifications
- **Character cards:** import Tavern Card V1/V2/V3 as PNG or JSON; alternate greetings become swipes, and a lorebook embedded in the card comes with it
- **Character editor:** write a card from scratch or edit any imported one, avatar included
- **User card:** your own name, persona and picture, on their own Settings tab; the persona is sent with every prompt, and a vision model can write your appearance from your picture
- **Expandable profiles:** click any avatar or name to see the full card picture and its fields
- **Swipes:** step through past replies, or press › on the latest reply to generate a new version
- **Edit, copy, regenerate, delete (with confirmation) and Stop:** if you stop a reply midway, the partial text is kept
- **Prompt post-processing** for backends that insist on one system block and alternating turns: merge, alternating, alternating-user-first, or flatten to a single message
- **Prompt builder** with `{{char}}` / `{{user}}` macros, card system prompt override (`{{original}}`), post-history instructions and a context budget that drops the oldest messages first
- **Model thinking:** reasoning is streamed into a fold-away panel above the reply, whether the provider sends it as `reasoning_content`, `reasoning` or `<think>` tags in the text
- **Lorebooks:** World Info in the SillyTavern tradition - keyword and regex triggers, optional filters with AND ANY / AND ALL / NOT ANY / NOT ALL, constant and selective entries, recursion, inclusion groups, sticky / cooldown / delay, a token budget, and import of SillyTavern exports
- **Chat memory:** when older messages fall out of the window they are summarised into a rolling summary, sent with every reply and editable by hand
- **Generation details:** every reply keeps a record - the prompt exactly as sent, how much of the history fit, token counts, timings and why the model stopped
- **Safe markdown:** raw HTML from cards or models is escaped, and only http(s)/mailto links are allowed. `"dialogue"` is highlighted and `*actions*` are italicised
- **Private API key:** it's stored server-side and never sent to the browser
- **Plain-file storage:** JSON and JSONL you can read, diff and edit by hand - no database

## Stack

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript, Vite, **Tailwind CSS v4**, **shadcn/ui** (new-york style, zinc + violet), lucide icons, sonner toasts |
| Markdown | `marked` with custom safe renderers |
| Server | Node 22.18+ (`node:http`, native TS type stripping); **no runtime dependencies** |
| Storage | JSON + JSONL files under `data/` (see below) |

The UI has light and dark themes. Use the sun/moon button to switch; dark is the default. To change the look, edit the colors in `web/index.css`. You can use the [shadcn theme builder](https://ui.shadcn.com/themes) and paste its `:root` / `.dark` blocks there.

`components.json` is already set up, so you can add more shadcn components with:

```bash
npx shadcn@latest add sheet select command
```

## Run it

Requires **Node 22.18 or newer** (Node 24 LTS recommended).

```bash
npm install
npm run dev          # server on :3001 + Vite on :5173
```

Open http://localhost:5173, then:

1. Pick a provider in **Settings**, add your key if the provider needs one, then click **Fetch models** and choose a model.
2. A starter character, Sable Emberwright, is already waiting on your first run. Add your own with **New character**, or the upload button beside it to import a card (`.png` or `.json`). Samples are in `samples/`.
3. Fill in your own name and persona under **Settings -> User**, then start chatting.

Production build (one process serves both the UI and the API):

```bash
npm run build
npm start            # http://localhost:3001
```

The server only listens on `127.0.0.1` by default, because it holds your API key. Set `HOST=0.0.0.0` only on a network you trust. Other environment variables: `PORT` and `RP_DATA_DIR`.

## Your data

Everything is kept in plain files under `data/` (or `RP_DATA_DIR`), so you can read it, grep it, diff it in git, or edit it in any text editor while the server is stopped:

```
data/
  settings.json              provider, model, sampling, your user card - and your API key
  characters.json            every character card
  chats.json                 one line per chat: which character, title, message count
  counters.json              the next id for each kind of record
  chats/12.jsonl             the chat log - one JSON message per line, appended as you talk
  chats/12.prompts.jsonl     the prompt and thinking behind each reply, appended and never rewritten
  chats/12.memory.json       what that chat remembers: the summary and how far it covers
  chats/12.lore.json         which lorebook entries are sticky or cooling down in that chat
  lorebooks.json             every lorebook and its entries
  avatars/                   character and user pictures
```

Prompts are kept beside the log rather than inside it. They are by far the largest thing stored, and the log itself is rewritten whenever you edit or swipe a message - keeping them apart leaves the chat log small and readable.

Writes go through a temp file and a rename, so an interrupted write can't leave a half-written file behind. `settings.json` holds your API key in plain text, exactly as the old database did - it never leaves the machine, but don't commit it.

**Coming from the SQLite version?** Leave your old `data/rp.db` where it is and start the server: it imports characters, chats, messages and settings into the new files on first run, keeping the original timestamps, and never writes to the database. Once you've checked everything arrived, delete `rp.db*` and `server/migrate-sqlite.ts`.

## Tests

```bash
npm test          # node --test, no test framework to install
npm run typecheck
npm run check     # both
```

The suite covers the parts where a quiet bug does real damage: the prompt
builder's context budget and trimming, Tavern card normalization and the PNG
`tEXt` reader, the file store (including prompt sidecars, cascading deletes and
a torn JSONL line), and the markdown sanitiser - which is the only thing between
untrusted card or model text and `dangerouslySetInnerHTML`.

## Layout

```
tests/              node:test suites for the logic above
server/
  index.ts          routes + SSE generation endpoint
  seed.ts           adds the starter character on a first run
  lorebook.ts       World Info: matching, recursion, groups, timed effects, budget
  lorebook-import.ts  reads a SillyTavern World Info export
  memory.ts         folds forgotten messages into a rolling summary
  store.ts          JSON/JSONL storage, settings, generation records
  migrate-sqlite.ts one-time import of an older data/rp.db
  cards.ts          PNG tEXt chunk reader, card normalization
  prompt.ts         prompt builder, macros, context trimming
  post-process.ts   reshapes the finished prompt for fussy backends
  llm.ts            OpenAI-compatible streaming client
web/
  App.tsx           app state + layout
  api.ts            REST client + SSE reader
  markdown.ts       safe markdown renderer
  index.css         Tailwind + theme tokens + chat typography
  hooks/            use-theme (light/dark), use-confirm (promise-based AlertDialog)
  components/
    app-sidebar.tsx     characters, search, chats, settings, theme toggle
    chat-view.tsx       header, message list, composer, profile dialogs
    message-item.tsx    message, hover toolbar, swipes, inline edit
    character-dialog.tsx  create or edit a card (profile / chat / prompt tabs)
    profile-dialog.tsx    the expanded card behind an avatar
    generation-dialog.tsx what happened when a reply was generated
    avatar-picker.tsx     shared picture picker for cards and the user
    settings-dialog.tsx connection / user / generation / prompt tabs
    empty-state.tsx     first-run checklist
    ui/                 shadcn/ui components
```

## API

| Method | Path | |
|---|---|---|
| GET/PUT | `/api/settings` | the key is write-only |
| GET | `/api/models` | proxied from the provider |
| GET | `/api/characters` | |
| POST | `/api/characters/import` | raw PNG/JSON bytes in the body |
| POST | `/api/characters` | a card as JSON, from the in-app editor |
| PUT/DELETE | `/api/characters/:id` | |
| POST/DELETE | `/api/characters/:id/avatar` | raw image bytes (PNG/JPEG/WebP/GIF) |
| POST/DELETE | `/api/user/avatar` | the same, for your user card |
| GET | `/api/user/vision` | whether the current model can read images (probed once, then cached) |
| POST | `/api/user/describe` | describes your picture for the persona field |
| GET/POST | `/api/characters/:id/chats` | |
| DELETE | `/api/chats/:id` | |
| GET/POST | `/api/chats/:id/messages` | |
| PATCH/DELETE | `/api/messages/:id` | `{content}` or `{swipe_index}` |
| POST | `/api/chats/:id/messages/delete` | `{ids}`: removes several at once |
| GET | `/api/messages/:id/meta/:swipe` | the generation record for one version, with its prompt |
| GET/POST | `/api/lorebooks` | list, or make a new one |
| GET/PUT/DELETE | `/api/lorebooks/:id` | |
| POST | `/api/lorebooks/import` | raw JSON: ours, a SillyTavern export, or a V2 `character_book` |
| GET/PUT/DELETE | `/api/chats/:id/memory` | read, edit or forget what a chat remembers |
| POST | `/api/chats/:id/memory/fold` | summarise now instead of waiting for an overflow |
| POST | `/api/chats/:id/generate` | `{mode: "new" \| "swipe"}` → SSE `{delta}` … `{done, message}` |

## Next steps

- **Accurate token counts:** replace `estimateTokens` in `server/prompt.ts` with a real tokenizer. Generation details already show the provider's own counts next to the estimate, so you can see how far off it is
- **PNG card export:** write the edited card back into a `chara` chunk so it can be shared
- **Multiple personas, group chats, regex scripts, presets, themes**
- **Native Claude / Gemini adapters** alongside `server/llm.ts`
