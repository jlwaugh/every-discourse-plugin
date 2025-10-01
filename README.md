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

### Quick Start

Fetch a single topic:

```bash
bun run index.ts
```

Stream topics with historical backfill:

```bash
MODE=stream bun run index.ts
```

Search topics and posts:

```bash
MODE=search bun run index.ts
```

### Config

#### Variables

- baseUrl (string, required) - Your Discourse forum URL
- timeout (number, default: 10000) - Request timeout in ms
- batchSize (number, default: 20) - Topics per page (1-100)
- category (string, optional) - Filter by category slug

#### Secrets (Optional)

- apiKey (string) - Discourse API key for authentication
- apiUsername (string) - Username for the API key

## Features

- **Fetch** - get content of any topic (discussion thread) with all posts and metadata
- **Search** - text-based queries with various filters (username, date, and likes)
- **Monitoring** - real-time data streaming with historical backfill and live updates

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

## Testing

### Unit Tests

```bash
bun test
```

Coverage:

- Initialization - Config setup and plugin metadata
- Topic Parsing - Valid data, optional fields, error handling
- Post Parsing - Content parsing, missing fields, filtering
- Router - Procedure registration and handler setup

### Integration Tests

Test against live Discourse instances:

#### Fetch

```bash
bun run index.ts
```

#### Monitor

```bash
MODE=stream bun run index.ts
```

#### Search

```bash
MODE=search bun run index.ts
```

## Procedures

_See `index.ts` for complete setup examples. Code snippets below assume plugin runtime is initialized._

### getTopic

```typescript
const result = await executePlugin(plugin, {
  procedure: "getTopic",
  input: { id: 123 },
  state: null,
});

// Returns: { topic: Topic | null, posts: Post[] }
```

### monitor

```typescript
const stream = await streamPlugin(
  "discourse",
  config,
  {
    procedure: "monitor",
    input: { category: "announcements" },
    state: null,
  },
  {
    maxItems: 100,
    onStateChange: (state, items) =>
      Effect.sync(() => {
        console.log(`Phase: ${state?.phase}, Items: ${items.length}`);
      }),
  }
);
```

### search

```typescript
const result = await executePlugin(plugin, {
  procedure: "search",
  input: {
    query: "governance",
    filters: {
      username: "admin",
      minLikes: 5,
      after: "2025-01-01T00:00:00Z",
    },
  },
  state: null,
});

// Returns: { topics: Topic[], posts: Post[], nextState: State | null }
```

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
