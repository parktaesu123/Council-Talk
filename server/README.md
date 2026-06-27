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
