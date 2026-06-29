# CouncilTalk Chat Performance & Architecture Plan

## 1. 현재 시스템의 잠재적 병목 지점 분석

### 서버
- 채팅방 목록 응답에 전체 메시지 배열이 포함되면 요청 1회당 직렬화 비용이 급격히 증가한다.
- 메시지 저장 응답이 전체 채팅방 목록을 다시 반환하면 쓰기 트래픽이 커질수록 응답 시간이 늘어난다.
- 실시간 이벤트가 채팅방 전체 스냅샷을 자주 밀어내면 CPU, 네트워크, 브라우저 파싱 비용이 함께 증가한다.
- 메시지 저장, 실시간 전달, 이메일/외부 알림을 같은 요청 경로에서 처리하면 p95/p99 지연이 급격히 커진다.

### 데이터베이스
- `room_id + created_at` 기준 정렬 조회가 느리면 채팅방 진입 지연이 바로 체감된다.
- `OFFSET/LIMIT` 기반 페이징은 메시지가 많을수록 뒤 페이지로 갈수록 느려진다.
- 마지막 메시지, 메시지 개수, 미읽음 수를 조회할 때 매번 집계하면 채팅방 목록 성능이 나빠진다.

### 네트워크
- Polling/Long Polling은 동시 사용자가 늘수록 불필요한 HTTP 왕복이 많아진다.
- SSE/WebSocket 메시지 페이로드가 크면 연결 방식이 좋아도 체감 성능은 계속 나빠진다.

### 프론트엔드
- 채팅방 목록이 전체 메시지 배열을 품고 있으면 상태 비교와 렌더링 비용이 커진다.
- 열린 채팅방에서 수백~수천 개 메시지를 한 번에 DOM으로 렌더링하면 스크롤 렉이 생긴다.
- 새 메시지 수신 시 전체 스레드 배열을 갈아끼우면 React reconciliation 비용이 증가한다.

## 2. 가장 먼저 확인해야 할 성능 지표 및 로그

### 서버 지표
- `/api/thread-summaries`, `/api/threads/:id/messages`, 메시지 전송 API의 p50/p95/p99 응답 시간
- SSE/WebSocket 연결 수, 재연결 빈도, 초당 수신/송신 메시지 수
- 직렬화 시간, 응답 바이트 크기, GC 시간, event loop delay

### DB 지표
- 메시지 조회 쿼리 실행 시간
- 채팅방 목록 조회 쿼리 실행 시간
- 인덱스 hit ratio
- slow query log

### 프론트 지표
- 채팅방 진입 후 첫 메시지 렌더링 시간
- 스크롤 FPS 저하 구간
- 메모리 사용량
- React commit duration

### 반드시 남길 로그
- 메시지 저장 성공/실패
- 실시간 브로드캐스트 실패
- 재전송/중복 전송 감지
- 외부 알림 큐 지연

## 3. 단기 개선안 (빠르게 적용 가능한 개선)

### 이미 적용한 방향
- 채팅방 목록을 summary 기반으로 분리
- 메시지 조회를 cursor 기반 페이지네이션으로 분리
- SSE 초기 동기화와 mutation 응답의 페이로드 경량화
- 열린 채팅방만 상세 메시지를 로드하도록 프론트 상태 분리

### Spring Boot + MySQL 기준 즉시 권장
- `/rooms` 목록 API는 `last_message`, `message_count`, `updated_at`만 반환
- `/rooms/{id}/messages?before=<cursor>&limit=30` 형태로 최근 메시지부터 조회
- 메시지 저장 API에서 알림 전송 제거, 비동기 이벤트 발행으로 분리
- 채팅방 상세는 처음 30~50개만 로드

## 4. 중기 개선안 (구조 개선)

### 실시간 통신 방식 선택
- Polling: 구현은 쉽지만 불필요한 요청이 많아 채팅에는 비효율적
- Long Polling: Polling보다는 낫지만 연결 유지 비용이 크고 서버 부하가 높다
- SSE: 서버→클라이언트 단방향 알림에는 좋고 구현도 단순하다. 관리자 콘솔 알림용으로 적합하다
- WebSocket: 양방향 저지연 통신에 가장 적합하다. 실제 채팅 본 채널에 가장 추천된다

### 권장 선택
- 학생/학생회 실시간 채팅 본문: `WebSocket`
- 운영 콘솔 이벤트, 경량 알림 스트림: `SSE` 또는 WebSocket 내부 서브채널

### 데이터베이스 설계
- `chat_room`
  - `id PK`
  - `student_id`
  - `status`
  - `last_message_id`
  - `last_message_at`
  - `message_count`
  - `created_at`
  - `updated_at`
- `chat_message`
  - `id PK`
  - `room_id`
  - `sender_type`
  - `sender_id`
  - `client_message_id`
  - `body`
  - `reply_to_message_id`
  - `created_at`
  - `edited_at`

### 추천 인덱스
- `chat_message(room_id, created_at desc, id desc)`
- `chat_message(room_id, id desc)`
- `chat_message(client_message_id)` unique
- `chat_room(student_id, updated_at desc)`
- `chat_room(status, updated_at desc)`
- `chat_room(last_message_at desc)`

### 조회 전략
- 메시지 페이징은 `WHERE room_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
- 채팅방 목록은 room 테이블의 denormalized 컬럼으로 조회
- 마지막 메시지/개수는 room row에 반영

## 5. 장기 개선안 (대규모 서비스 대응)

### 서버 아키텍처
- API 서버와 실시간 게이트웨이 분리
- 메시지 저장은 DB 트랜잭션으로 완료
- 저장 후 이벤트를 MQ로 발행
- 알림, 이메일, 감사 로그는 소비자 서비스로 분리

### Redis 사용
- WebSocket 세션/room membership 관리
- 최근 메시지 캐시
- 미읽음 카운터 캐시
- 서버 간 fan-out coordination

### Redis Pub/Sub vs MQ
- Redis Pub/Sub: 실시간 fan-out에는 좋지만 durable하지 않다
- Kafka/RabbitMQ: 유실 방지, 재처리, 백프레셔 제어에 적합하다

### 추천
- 실시간 배달: `Redis Pub/Sub` 또는 Redis Streams
- 영속 이벤트/비동기 워크플로: `Kafka` 또는 `RabbitMQ`

## 6. 추천 아키텍처 다이어그램 (텍스트 기반)

```text
[React Client]
   | \
   |  \-- HTTP: room summaries / message history
   |
   +----- WebSocket Gateway
              |
              +-- Redis (session, pub/sub, cache)
              |
              +-- Chat API / Application Service
                       |
                       +-- MySQL (rooms, messages)
                       |
                       +-- Message Queue
                               |
                               +-- Notification Worker
                               +-- Email Worker
                               +-- Audit / Analytics Worker
```

## 7. 실제 운영 환경에서 추천하는 최종 아키텍처

### 1단계
- Spring Boot API
- MySQL
- Redis
- WebSocket(STOMP보다 raw/ws 또는 lightweight broker 우선)

### 2단계
- API 서버와 WebSocket 게이트웨이 분리
- Redis Cluster
- Kafka/RabbitMQ 도입
- 읽기 전용 replica로 조회 분산

### 3단계
- Room summary cache
- CQRS 성격의 read model
- 메시지 보관 정책과 cold storage 분리

## 8. 예상 성능 개선 효과

- 채팅방 목록 응답 크기: 전체 메시지 포함 대비 크게 감소
- 채팅방 진입 시간: 전체 로딩 대신 최근 페이지 로딩으로 단축
- 메시지 전송 응답: 전체 목록 재반환 제거 시 지연 감소
- 프론트 렌더링: 전체 메시지 상태 보관 제거로 메모리와 렌더링 비용 감소
- 실시간 안정성: 저장/알림 분리로 tail latency 감소

## 현재 저장소 기준 적용 메모

- 현재 저장소는 Spring Boot가 아니라 Node/Express 기반이지만, 이번 변경은 동일한 원칙을 먼저 적용했다.
- 실제 Spring Boot 전환 시에도 핵심은 동일하다:
  - room summary 분리
  - cursor pagination
  - 실시간 이벤트 경량화
  - 저장과 알림의 비동기 분리
