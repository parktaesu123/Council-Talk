# CouncilTalk Chat Optimization Review (2026-06-30)

현재 저장소는 `Spring Boot + MySQL`이 아니라 `Express + append-only event store + React` 구조다.  
그래서 이 문서는 두 축으로 정리한다.

- 현재 CouncilTalk 코드에서 실제로 보이는 병목과 즉시 수정 방향
- 이후 Spring Boot + MySQL + WebSocket으로 확장할 때의 권장 설계

## 1. 현재 코드에서 가장 의심되는 병목 지점

### 서버

- `server/infrastructure/persistence/stateStore.js`
  - 현재 `stateStore.read()`는 메모리 캐시를 쓰지만, 스냅샷 단위 전체 상태를 복제해서 반환한다.
  - 스레드 수와 메시지 수가 늘수록 `structuredClone()` 비용이 커진다.
- `server/application/services/createCouncilService.js`
  - 메시지 전송은 append-only event 저장 후 전체 thread state를 다시 만들기 때문에 데이터량이 커질수록 쓰기 비용이 증가한다.
  - 현재는 DB JOIN/N+1 문제는 없지만, “스레드 전체 배열 + 메시지 배열” 중심 구조라 규모가 커지면 메모리 복사 비용이 병목이 된다.
- `server/interfaces/http/createHttpApp.js`
  - 알림, SSE fan-out, typing update, summary merge가 모두 같은 프로세스 안에서 일어난다.
  - 아직 MQ나 Redis가 없어서 프로세스 1대 기준으로는 단순하지만 scale-out에는 불리하다.

### 프론트엔드

- `src/App.jsx`
  - 거의 모든 상태가 `App` 하나에 몰려 있다.
  - 입력창 타이핑, 실시간 이벤트, 필터 변경, reply 상태 변경이 한 컴포넌트 트리 전체를 다시 평가하게 만든다.
- 이전 구조에서 열린 채팅방 메시지 조회 effect가 `threads` 배열 전체 변경에 반응했다.
  - 새 메시지/SSE/summary 갱신 때마다 열린 방을 다시 조회할 수 있는 구조였다.
  - 이번 수정으로 `threadId` 기준으로만 재조회되도록 줄였다.
- 메시지 리스트는 아직 virtualization이 없다.
  - 최근 30개만 가져오더라도 과거 메시지를 계속 prepend하면 DOM 수가 누적된다.

### 현재 구조 판정

- Polling: 아님
- SSE: 사용 중
- WebSocket: 아직 없음

판단:

- 현재는 SSE로 “서버 → 클라이언트” 이벤트를 밀고 있다.
- 학생/학생회가 양방향 실시간 채팅을 하는 구조라 장기적으로는 WebSocket이 더 적합하다.
- 단기적으로는 현재 SSE도 “새 메시지만 전달”하도록 잘 쓰면 충분히 버틸 수 있다.

## 2. 백엔드 개선 설계

### 현재 코드 기준 즉시 개선 포인트

1. 메시지 전송 시 전체 메시지 목록 재조회 금지
   - 현재 프론트는 optimistic append 후 서버 응답으로 해당 메시지만 치환하는 방향이 이미 들어가 있다.
   - 이 원칙은 유지해야 한다.

2. 채팅방 상세 재조회 조건 축소
   - 열린 방의 상세 조회는 `threadId` 변경 또는 첫 진입 때만 수행한다.
   - summary 업데이트만으로 상세 API를 다시 호출하지 않는다.

3. 쓰기 후 부가 작업 분리
   - 현재도 `durableDispatcher`가 있어 외부 알림 분리에 가까운 구조가 있다.
   - 이후에는 아래처럼 더 명확히 나누는 것이 좋다.

```text
message POST
-> message persist
-> commit success
-> publish domain event
-> async notification / email / analytics
```

4. room summary denormalization 유지
   - 현재 `createThreadSummary()`가 `latestMessage`, `messageCount`, `updatedAt`를 summary로 제공한다.
   - 이 방향은 MySQL에서도 동일하게 가져가야 한다.

### 현재 Node 구조에서 추천 리팩터링

- `stateStore.read()` 전체 clone 대신 read model 분리
  - `thread summaries`
  - `thread detail by id`
  - `messages by cursor`
- 메시지 저장은 append-only 유지 가능
- 조회는 별도 read projection JSON 또는 SQLite/MySQL로 분리

### Spring Boot 전환 시 권장 백엔드 플로우

```text
POST /api/chat/rooms/{roomId}/messages
-> room membership check
-> message insert
-> room.last_message_* update
-> transaction commit
-> publish ChatMessageCreatedEvent
-> WebSocket send
-> async notification worker
```

## 3. DB 인덱스 및 쿼리 개선안

현재 저장소에는 RDBMS가 없지만, MySQL 기준으로는 아래 구조를 권장한다.

### 테이블 역할

#### `chat_room`

- 채팅방 메타데이터
- 마지막 메시지 미리보기
- 정렬용 시간
- 상태

추천 컬럼:

```sql
create table chat_room (
  id bigint primary key auto_increment,
  student_id bigint not null,
  status varchar(20) not null,
  title varchar(200) not null,
  last_message_id bigint null,
  last_message_content varchar(500) null,
  last_message_sender_type varchar(20) null,
  last_message_at datetime(3) null,
  message_count int not null default 0,
  created_at datetime(3) not null,
  updated_at datetime(3) not null
);
```

인덱스:

```sql
create index idx_chat_room_student_updated_at
  on chat_room (student_id, updated_at desc);

create index idx_chat_room_status_updated_at
  on chat_room (status, updated_at desc);

create index idx_chat_room_last_message_at
  on chat_room (last_message_at desc);
```

#### `chat_message`

추천 컬럼:

```sql
create table chat_message (
  id bigint primary key auto_increment,
  room_id bigint not null,
  sender_id bigint not null,
  sender_type varchar(20) not null,
  client_message_id varchar(80) null,
  content text not null,
  reply_to_message_id bigint null,
  created_at datetime(3) not null,
  edited_at datetime(3) null,
  constraint uk_chat_message_client_message_id unique (client_message_id)
);
```

핵심 인덱스:

```sql
create index idx_chat_message_room_id_id_desc
  on chat_message (room_id, id desc);

create index idx_chat_message_room_id_created_at_desc
  on chat_message (room_id, created_at desc, id desc);
```

#### `chat_participant`

```sql
create table chat_participant (
  room_id bigint not null,
  user_id bigint not null,
  user_type varchar(20) not null,
  last_read_message_id bigint null,
  joined_at datetime(3) not null,
  primary key (room_id, user_id, user_type)
);
```

### 나쁜 예

```sql
select *
from chat_message
where room_id = ?
order by created_at asc;
```

- 방 입장마다 전체 메시지를 읽는다.
- 메시지가 늘수록 응답 시간과 payload 크기가 같이 커진다.

### 좋은 예: 최근 30개만 cursor pagination

첫 진입:

```sql
select id, room_id, sender_id, sender_type, content, reply_to_message_id, created_at, edited_at
from chat_message
where room_id = ?
order by id desc
limit 30;
```

이전 메시지 로딩:

```sql
select id, room_id, sender_id, sender_type, content, reply_to_message_id, created_at, edited_at
from chat_message
where room_id = ?
  and id < ?
order by id desc
limit 30;
```

채팅방 목록:

```sql
select id, student_id, status, title,
       last_message_content, last_message_sender_type,
       last_message_at, message_count, updated_at
from chat_room
where status = ?
order by updated_at desc
limit 50;
```

## 4. WebSocket 기반 실시간 채팅 구조

### 최종 권장 구조

```text
Client send message
-> HTTP or WS publish
-> DB transaction save
-> commit
-> publish realtime event
-> receiver gets only the new message
-> frontend append only
```

### 왜 WebSocket인가

- 학생 ↔ 학생회가 양방향으로 메시지를 주고받는다.
- typing, read receipt, delivered event가 붙기 쉽다.
- SSE보다 브라우저당 연결 전략과 메시지 업링크가 자연스럽다.

### Spring Boot WebSocket 설정 예시

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/chat")
                .setAllowedOriginPatterns("*");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/pub");
        registry.setUserDestinationPrefix("/user");
    }
}
```

### 발행/구독 경로 예시

- 구독: `/topic/chat.rooms.{roomId}`
- 발행: `/pub/chat.rooms.{roomId}.messages`

### Controller 예시

```java
@Controller
@RequiredArgsConstructor
public class ChatMessageWsController {

    private final ChatMessageService chatMessageService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat.rooms.{roomId}.messages")
    public void sendMessage(
            @DestinationVariable Long roomId,
            ChatMessageSendRequest request,
            Principal principal
    ) {
        ChatMessageResponse saved = chatMessageService.save(roomId, principal.getName(), request);
        messagingTemplate.convertAndSend("/topic/chat.rooms." + roomId, saved);
    }
}
```

### JWT 인증 처리

핸드셰이크 단계:

```java
public class JwtChannelInterceptor implements ChannelInterceptor {
    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        String bearerToken = accessor.getFirstNativeHeader("Authorization");
        // JWT parse -> Authentication 생성
        // accessor.setUser(authentication)
        return message;
    }
}
```

### 접근 검증

- 메시지 저장 service에서 `roomId` participant인지 검증
- admin/student 권한을 room membership 테이블 기준으로 확인

## 5. React 프론트엔드 최적화 설계

### 현재 코드 기준 병목

- `src/App.jsx` 단일 파일에 상태 집중
- 메시지 리스트 virtualization 없음
- 입력창 상태와 목록 상태가 같은 컴포넌트에 있다
- derived state 계산이 많다
- 메시지 row가 많아질수록 DOM이 누적된다

### 이번에 반영한 빠른 개선

- 열린 채팅방 상세 API 재호출 조건 축소
- `useMemo`로 summary/filtered list/count 재계산 축소
- `MessageBubble` memoization 적용

### 다음 단계 권장

1. React Query 도입

```tsx
const messagesQuery = useInfiniteQuery({
  queryKey: ["thread-messages", threadId],
  queryFn: ({ pageParam }) =>
    api.get(`/api/threads/${threadId}/messages`, {
      params: { before: pageParam, limit: 30 },
    }),
  initialPageParam: null,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});
```

2. 새 메시지는 append

```tsx
queryClient.setQueryData(["thread-messages", threadId], (old) => {
  if (!old) return old;
  const lastPageIndex = old.pages.length - 1;
  const pages = old.pages.map((page, index) =>
    index === lastPageIndex
      ? { ...page, messages: [...page.messages, incomingMessage] }
      : page
  );
  return { ...old, pages };
});
```

3. 이전 메시지는 prepend

```tsx
queryClient.setQueryData(["thread-messages", threadId], (old) => {
  if (!old) return old;
  const pages = [...old.pages];
  pages[0] = {
    ...pages[0],
    messages: [...olderMessages, ...pages[0].messages],
  };
  return { ...old, pages };
});
```

4. Virtual scrolling

```tsx
<Virtuoso
  data={messages}
  itemContent={(index, message) => (
    <MessageRow key={message.id} message={message} />
  )}
/>
```

### 컴포넌트 분리 권장

- `ChatRoomList`
- `ChatMessagePane`
- `ChatMessageList`
- `ChatMessageComposer`
- `ChatMessageItem`
- `AdminThreadFilters`

## 6. 적용 순서

### 1단계: 현재 병목 확인

- 브라우저 Network 탭에서 아래 확인
  - `/api/thread-summaries`
  - `/api/threads/:id/messages`
  - `/api/threads/:id/messages POST`
- React DevTools Profiler
- 서버 응답 payload 크기
- 현재 열린 방 상세 API가 summary 변경 때 재호출되는지 확인

### 2단계: 빠른 개선

- 최근 30개 조회 유지
- cursor pagination 유지
- 열린 방 재조회 조건 축소
- `useMemo` / `memo` 적용
- 전체 refetch 금지

### 3단계: 실시간 구조 개선

- SSE 유지 시:
  - 새 메시지만 push
  - message update event 분리
- WebSocket 전환 시:
  - room subscribe
  - append-only cache update

### 4단계: 구조 개선

- `App.jsx` 분리
- React Query 도입
- read model 분리
- room summary denormalization

### 5단계: 대규모 대응

- Redis Pub/Sub
- WebSocket scale-out
- durable queue
- 읽기 모델 DB 분리

## 7. 수정해야 할 파일 목록 예시

### 현재 저장소 기준

- `src/App.jsx`
  - 상태 분리
  - query 도입
  - virtualization
- `src/components/EmojiPicker.jsx`
  - lazy load / 검색 debounce
- `server/interfaces/http/createHttpApp.js`
  - 메시지/summary API 경량화
- `server/application/services/createCouncilService.js`
  - 쓰기 후 async event publish 명확화
- `server/application/services/councilService/createGetThreadMessages.js`
  - cursor page contract 유지
- `server/infrastructure/sse/createSseHub.js`
  - connection metrics / backpressure

### Spring Boot 전환 기준

- `ChatRoomController.java`
- `ChatMessageController.java`
- `ChatWebSocketConfig.java`
- `ChatMessageService.java`
- `ChatMessageRepository.java`
- `ChatRoomRepository.java`
- `ChatParticipantRepository.java`

## 8. Spring Boot 코드 예시

### 메시지 조회 API

```java
@GetMapping("/api/chat/rooms/{roomId}/messages")
public CursorPage<ChatMessageDto> getMessages(
        @PathVariable Long roomId,
        @RequestParam(required = false) Long before,
        @RequestParam(defaultValue = "30") int limit,
        @AuthenticationPrincipal CustomUserPrincipal principal
) {
    return chatQueryService.getMessages(roomId, principal.getUserId(), before, limit);
}
```

### Repository 예시

```java
@Query("""
    select new com.example.chat.ChatMessageDto(
        m.id, m.roomId, m.senderId, m.senderType, m.content, m.createdAt, m.editedAt
    )
    from ChatMessage m
    where m.roomId = :roomId
      and (:before is null or m.id < :before)
    order by m.id desc
""")
List<ChatMessageDto> findRecentMessages(
    @Param("roomId") Long roomId,
    @Param("before") Long before,
    Pageable pageable
);
```

### 메시지 저장 service 예시

```java
@Transactional
public ChatMessageResponse save(Long roomId, Long userId, ChatMessageSendRequest request) {
    ChatRoom room = chatRoomRepository.findById(roomId)
        .orElseThrow(() -> new NotFoundException("room not found"));

    verifyParticipant(roomId, userId);

    ChatMessage message = chatMessageRepository.save(
        ChatMessage.create(roomId, userId, request.content(), request.replyToMessageId())
    );

    room.updateLastMessage(message.getId(), request.content(), message.getCreatedAt(), message.getSenderType());

    applicationEventPublisher.publishEvent(new ChatMessageCreatedEvent(message.getId(), roomId));

    return ChatMessageResponse.from(message);
}
```

## 9. React 코드 예시

### 무한 스크롤 메시지 훅

```tsx
export function useThreadMessages(threadId: string) {
  return useInfiniteQuery({
    queryKey: ["thread-messages", threadId],
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      api.get(`/api/threads/${threadId}/messages`, {
        params: { before: pageParam, limit: 30 },
      }).then((res) => res.data),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(threadId),
  });
}
```

### 메모이즈된 메시지 row

```tsx
export const MessageRow = React.memo(function MessageRow({
  message,
  onReply,
}: {
  message: ChatMessage;
  onReply: (message: ChatMessage) => void;
}) {
  return (
    <div>
      <p>{message.content}</p>
      <button onClick={() => onReply(message)}>답장</button>
    </div>
  );
});
```

### WebSocket 수신 시 append only

```tsx
socket.onmessage = (event) => {
  const incoming = JSON.parse(event.data);
  queryClient.setQueryData(["thread-messages", incoming.roomId], (old) => {
    if (!old) return old;
    const pages = [...old.pages];
    const lastIndex = pages.length - 1;
    pages[lastIndex] = {
      ...pages[lastIndex],
      messages: [...pages[lastIndex].messages, incoming],
    };
    return { ...old, pages };
  });
};
```

## 10. 최종 추천 아키텍처

### 단기

```text
React
  -> HTTP: room summaries / cursor messages
  -> SSE: new message / message update / typing summary
Express API
  -> append-only event store
  -> snapshot state
  -> async notification dispatcher
```

### 중기

```text
React + React Query + Virtualized Message List
  -> HTTP: room summaries / paged messages
  -> WebSocket: message append / typing / read receipt
Spring Boot API
  -> MySQL
  -> Redis
  -> async domain events
```

### 장기

```text
Client
  -> API Gateway
  -> WebSocket Gateway
Gateway
  -> Redis Pub/Sub
Chat Service
  -> MySQL primary / read replica
  -> Kafka or RabbitMQ
Workers
  -> Notification / email / audit / analytics
```

## 이번 작업에서 실제 반영한 내용

- 열린 채팅방 상세 재조회가 summary 변경마다 다시 발생하던 구조 축소
- `useMemo`로 thread summary / filtered list / count 계산 캐싱
- `MessageBubble` memoization 적용

이 세 가지는 “전체 메시지 다시 읽기”와 “입력할 때 전체가 버벅이는 문제”를 줄이는 첫 단계다.
