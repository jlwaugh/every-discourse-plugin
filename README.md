# Discourse Plugin System

Connect applications to Discourse forums via public [APIs](https://docs.discourse.org).

> Built with [every-plugin](https://github.com/near-everything/every-plugin), a composable runtime for loading, initializing, and executing remote plugins through Module Federation. Read the [docs](https://every-plugin-docs.netlify.app/docs) for more information.

## Development

### Clone

```bash
git clone https://github.com/jlwaugh/every-discourse-plugin.git
```

### Setup

Install dependencies:

```bash
bun install
```

### Test

Run all tests:

```bash
bun test
```

### Build

```bash
bun run build
```

**Outputs:**

- `dist/index.js` - Compiled plugin
- `dist/remoteEntry.js` - Module Federation entry
- `dist/*.d.ts` - TypeScript definitions

## Examples

See working examples in [`examples/index.ts`](./examples/index.ts):

### Fetch latest topic

```bash
bun run example:fetch
```

### Monitor for new topics

```bash
bun run example:monitor
```

### Search topics and posts

```bash
bun run example:search
```

## Config

### Variables

| Variable    | Type   | Default    | Description                     |
| ----------- | ------ | ---------- | ------------------------------- |
| `baseUrl`   | string | _required_ | Your Discourse forum URL        |
| `timeout`   | number | 10000      | Request timeout in milliseconds |
| `batchSize` | number | 20         | Topics per page (1-100)         |
| `category`  | string | -          | Filter by category slug         |

### Secrets (Optional)

| Secret        | Description                          |
| ------------- | ------------------------------------ |
| `apiKey`      | Discourse API key for authentication |
| `apiUsername` | Username associated with the API key |

Use secrets only if you need to access private forums or perform authenticated actions.

## Features

### 📥 Fetch Topics

Get complete topic data with all posts and metadata:

```typescript
const result = await Effect.runPromise(handleGetTopic(context, topicId));
// Returns: { topic: Topic | null, posts: Post[] }
```

### 🔍 Search

Text-based queries with filtering by username and date:

```typescript
const result = await Effect.runPromise(
  handleSearch(
    context,
    {
      query: "governance",
      filters: {
        username: "alice",
        after: "2024-01-01T00:00:00Z",
      },
    },
    null
  )
);
// Returns: { topics: Topic[], posts: Post[], nextState: State | null }
```

### 📊 Monitor

Real-time streaming with historical backfill:

```typescript
let state = null;

// First call: Historical phase
const result1 = await Effect.runPromise(
  handleMonitor(context, { category: "announcements" }, state)
);
state = result1.nextState;

// Subsequent calls: Continues pagination or switches to realtime
const result2 = await Effect.runPromise(handleMonitor(context, {}, state));
// Returns: { items: Topic[], nextState: State | null }
```

## How It Works

The plugin implements a three-stage data pipeline:

### 1. Source Layer

Fetches data from Discourse REST API endpoints:

- `/latest.json` - Recent topics with pagination
- `/t/{id}.json` - Single topic with all posts
- `/search.json` - Query-based retrieval

Rate limiting is handled automatically with exponential backoff (1s, 2s, 4s).

### 2. Processing Layer

Transforms raw API responses into typed data:

- **Validation** - Zod schemas ensure data integrity
- **Filtering** - Malformed records are logged and skipped
- **State management** - Tracks pagination and phase transitions

The monitor procedure operates as a state machine:

- **Historical phase** - Paginate through existing topics until complete
- **Real-time phase** - Poll for new topics created after last check

### 3. Output Layer

Exposes data through three typed procedures:

- `getTopic` - Single topic with all posts
- `monitor` - Continuous stream with historical backfill
- `search` - Paginated search results

**Data flow:** Discourse API → HTTP Client → Schema Validation → State Machine → Effect Stream → Your Application

## API

### Available Procedures

**getTopic** - Fetch a single topic with all posts

- Input: `{ id: number }`
- Output: `{ topic: Topic | null, posts: Post[] }`

**monitor** - Stream topics with historical backfill

- Input: `{ category?: string, tags?: string[] }`
- Output: `{ items: Topic[], nextState: State | null }`
- State machine: historical → realtime phases

**search** - Query topics and posts

- Input: `{ query: string, filters?: { username?, after? } }`
- Output: `{ topics: Topic[], posts: Post[], nextState: State | null }`

For usage examples, see the [test files](./src/__tests__/).

## Type Definitions

```typescript
type DiscourseTopic = {
  id: number;
  title: string;
  slug: string;
  posts_count: number;
  views?: number;
  like_count: number;
  created_at: string;
  last_posted_at: string | null;
  category_id?: number;
  tags?: string[];
};

type DiscoursePost = {
  id: number;
  topic_id: number;
  username: string;
  cooked?: string; // HTML content
  created_at: string;
  like_count: number;
};
```

## Learn More

[every-plugin](https://every-plugin-docs.netlify.app/docs) is a framework for building composable, type-safe plugin systems. It combines [Effect](https://effect.website) for async composition, [Module Federation](https://module-federation.io) for remote loading, and [oRPC](https://orpc.io) for type-safe contracts.
