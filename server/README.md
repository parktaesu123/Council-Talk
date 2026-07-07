## Server Architecture

The server is being reorganized around DDD and clean architecture:

- `bootstrap/`: app startup, config, dependency wiring
- `domain/`: entities, policies, domain events
- `application/`: use cases and ports
- `infrastructure/`: persistence, notifications, SSE, adapters
- `interfaces/`: HTTP routes and request/response mapping

The design goal is to keep domain rules independent from Express and persistence
details so we can evolve durability and event delivery without rewriting business
logic.

## Test Coverage Notes

- `application/services/createCouncilService.test.js`: chat flow, DaiSu flow, reactions, pagination
- `bootstrap/config.test.js`: environment defaulting and bounds
- `domain/**.test.js`: small policy and normalization helpers
- `infrastructure/**.test.js`: SSE, emoji client, typing presence, durable dispatcher, state store
- `interfaces/http/createHttpApp.test.js`: lightweight HTTP harness checks such as `healthz`
