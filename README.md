# NJ News Hub → Instagram Post Creator

Apify Actor that picks an article from [njnewshub.com](https://njnewshub.com) and formats it into an Instagram-ready post:

- **Caption** — headline, summary, key points, source/city, article link, and hashtags
- **Image** — 1080×1080 square composed from the article’s picture with an optional headline overlay

## Input

| Field | Description | Default |
| --- | --- | --- |
| `articleUrl` | Specific njnewshub.com article URL. Leave empty to auto-pick. | _(empty)_ |
| `selection` | `featured` / `latest` / `random` when auto-picking | `featured` |
| `includeKeyPoints` | Include bullet key points in the caption | `true` |
| `maxCaptionLength` | Soft cap for caption length | `2100` |
| `extraHashtags` | Extra hashtags to append | `NewJersey`, `NJNews`, `NJNewsHub` |
| `generateImage` | Build the square Instagram image | `true` |
| `imageStyle` | `bottom-gradient` / `full-overlay` / `image-only` | `bottom-gradient` |

## Output

Each run pushes one dataset item and also stores `OUTPUT` in the default key-value store:

- `caption` — copy/paste Instagram caption
- `hashtags` — array of hashtags used
- `imageUrl` — original article image
- `instagramImageKey` — KV store key for the generated PNG (e.g. `instagram-<slug>.png`)
- `instagramImageUrl` — Apify API URL for the generated image (when running on platform)
- Article metadata: `headline`, `summary`, `city`, `category`, `source`, `keyPoints`, etc.

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
