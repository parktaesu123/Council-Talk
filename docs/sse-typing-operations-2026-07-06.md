# SSE Typing Operations

## 목적

- Council Talk의 SSE 이벤트와 typing 동작을 운영 중 빠르게 확인하기 위한 메모다.

## 주요 엔드포인트

- `GET /api/events`
- `POST /api/threads/:id/typing`
- `GET /healthz`

## 확인 포인트

- `GET /healthz`가 `ok`를 반환하는지 먼저 본다.
- 관리자/학생 화면에서 SSE 연결이 살아 있으면 새 메시지와 typing 이벤트가 즉시 반영된다.
- typing 표시는 마지막 heartbeat 이후 약 8초 뒤 자동 정리된다.

## 장애 체크

- typing이 계속 남아 있으면 브라우저 탭이 비정상 종료되었는지 먼저 의심한다.
- SSE가 안 붙으면 프록시나 터널이 `text/event-stream`을 그대로 통과시키는지 확인한다.
- 메시지는 오는데 typing만 안 보이면 `POST /api/threads/:id/typing` 호출 여부를 Network 탭에서 본다.
