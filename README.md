# NJ News Hub → Instagram Post Creator

Apify Actor that picks an article from [njnewshub.com](https://njnewshub.com) and formats it into an Instagram-ready post:

- **Caption** — headline, summary, key points, source/city, article link, and hashtags
- **Image** — 1080×1080 square composed from the article’s picture with an optional headline overlay

## Input

The Apify Console form is defined in `.actor/input_schema.json` and is grouped into three sections:

### Article selection
| Field | Description | Default |
| --- | --- | --- |
| `articleUrl` | Specific njnewshub.com article URL. Leave empty to auto-pick. | _(empty)_ |
| `selection` | `featured` / `latest` / `random` when auto-picking | `featured` |

### Caption
| Field | Description | Default |
| --- | --- | --- |
| `includeKeyPoints` | Include bullet key points in the caption | `true` |
| `maxCaptionLength` | Soft cap for caption length | `2100` |
| `extraHashtags` | Extra hashtags to append | `NewJersey`, `NJNews`, `NJNewsHub` |
| `includeArticleLink` | Append a “Read more: …” line | `true` |
| `ctaText` | Short CTA line before hashtags | `Via NJ News Hub` |

### Instagram image
| Field | Description | Default |
| --- | --- | --- |
| `generateImage` | Build the square Instagram image | `true` |
| `imageStyle` | `bottom-gradient` / `full-overlay` / `image-only` | `bottom-gradient` |
| `brandLabel` | Brand line on the generated image | `NJ NEWS HUB` |

### Post to Instagram
| Field | Description | Default |
| --- | --- | --- |
| `postToInstagram` | Upload the generated image + caption to Instagram | `false` |
| `instagramSessionId` | Secret `sessionid` cookie (required when posting) | _(empty)_ |
| `instagramCsrfToken` | Optional `csrftoken` cookie (recommended) | _(empty)_ |
| `instagramCookies` | Optional full Cookie header from a logged-in request | _(empty)_ |
| `instagramUsername` | Optional username for logs | _(empty)_ |

**How to get cookies:** open Instagram in a browser while logged in → DevTools → Application → Cookies → `https://www.instagram.com` → copy `sessionid` (and ideally `csrftoken`). Or copy the full `Cookie` header from any logged-in network request. Treat these like passwords.

Publishing uses Instagram’s **web upload API**. Browser `sessionid` cookies do not work with the Android private API.

## Output

Each run pushes one dataset item and also stores `OUTPUT` in the default key-value store:

- `caption` — copy/paste Instagram caption
- `hashtags` — array of hashtags used
- `imageUrl` — original article image
- `instagramImageKey` — KV store key for the generated PNG (e.g. `instagram-<slug>.png`)
- `instagramImageUrl` — Apify API URL for the generated image (when running on platform)
- Article metadata: `headline`, `summary`, `city`, `category`, `source`, `keyPoints`, etc.

## Deploy to Apify (required for the Console form)

The Input tab only shows the form after Apify loads `.actor/actor.json` → `inputSchema`.

1. Push / merge this branch, or connect the Actor’s GitHub integration to it
2. In Apify Console open the Actor → **Build** (or `apify push` from this repo)
3. Hard-refresh the **Input** tab — you should see sections for article selection, caption, image, and Instagram posting

If you still see a raw JSON box, the Actor is likely building from a branch that does not contain `.actor/INPUT_SCHEMA.json` (for example an old `main`).

## Local development

```bash
npm install
# optional: write storage/key_value_stores/default/INPUT.json
npm start
```

Or with Apify CLI:

```bash
npx apify-cli run
```

## Example caption

```
Hudson County Executive Craig Guy Breaks Ground on Hudson Community Market Food Pantry in Bayonne

Hudson County Executive Craig Guy and Bayonne Mayor Sharon Ashe Nadrowski celebrated the groundbreaking…

• First county-run food pantry in Hudson County uses a consumer-choice model…
• …

Bayonne · River View Observer

Read more: https://njnewshub.com/bayonne/hudson-county-community-market-bayonne-food-pantry

Via NJ News Hub

#HudsonCounty #FoodPantry #Bayonne #NewJersey #NJNews #NJNewsHub
```
