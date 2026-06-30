# DaiSu AI Assistant Architecture Plan

## Goal

`따이수`는 학생회가 직접 지식과 답변 원칙을 입력해 운영하는 실시간 상담 보조 AI다.

현재 CouncilTalk 구조에서는 아래 세 가지 역할을 먼저 지원하는 것이 현실적이다.

1. 학생회 어드민이 따이수의 답변 기준, 말투, 금지사항을 설정한다.
2. 학생회 어드민이 FAQ, 규정, 공지, 일정 같은 지식 문서를 등록한다.
3. 학생이 문의를 남기면 따이수가 등록된 지식 중 관련도가 높은 내용을 바탕으로 자동 답변한다.

## Scope Of Phase 1

Phase 1은 외부 LLM 의존성을 강제하지 않고도 돌아가는 구조를 만든다.

- knowledge base CRUD
- assistant settings CRUD
- deterministic retrieval answer generation
- auto reply on student message
- answer metadata 저장
- admin visibility

Phase 1의 핵심은 "운영 가능한 구조"다.

- 어드민이 무엇을 학습시켰는지 저장된다.
- 어떤 지식이 답변에 사용됐는지 추적 가능하다.
- 답변 정책을 바꿀 수 있다.
- 나중에 OpenAI, Claude, Gemini 같은 LLM provider로 쉽게 교체 가능해야 한다.

## Phase 2

Phase 2에서 외부 LLM provider를 붙인다.

- retrieval 결과를 prompt context로 주입
- model provider abstraction
- safety instruction / system prompt
- confidence threshold based fallback
- source grounded answer with citations

## Core Principles

1. 학생 질문 원문은 그대로 저장한다.
2. 따이수 답변도 일반 메시지처럼 thread messages에 저장한다.
3. 답변 생성 근거가 된 지식 문서 id를 함께 남긴다.
4. 지식이 부족하면 확답하지 않고 학생회 연결 메시지를 보낸다.
5. 관리자만 따이수 설정과 지식 문서를 수정할 수 있다.
6. 자동응답은 켜고 끌 수 있어야 한다.
7. 특정 태그 또는 특정 채팅방 상태에서만 따이수를 동작시킬 수 있어야 한다.

## Domain Model

### `daisuAssistant`

전역 봇 설정을 담는다.

```text
id
name
description
tone
guardrails[]
fallbackMessage
autoReplyEnabled
autoReplyTags[]
confidenceThreshold
updatedAt
```

### `daisuKnowledgeDocument`

어드민이 입력한 지식 원문 문서다.

```text
id
title
category
tags[]
content
keywords[]
status (draft|published|archived)
createdAt
updatedAt
```

### `daisuAnswerLog`

자동응답 결과를 추적한다.

```text
id
threadId
studentMessageId
assistantMessageId
matchedDocumentIds[]
score
mode (auto|manual-preview)
createdAt
```

## Retrieval Strategy For Phase 1

외부 벡터 DB 없이도 현재 코드베이스에서 바로 붙일 수 있도록 lexical retrieval을 먼저 쓴다.

### Steps

1. 학생 질문 normalize
2. 질문에서 token 추출
3. published 상태 문서만 조회
4. title, keywords, tags, content 일치 점수 계산
5. 점수 높은 상위 3개 문서 선택
6. threshold 이상이면 답변 생성
7. threshold 미만이면 fallback

### Scoring Example

```text
exact keyword match: +5
title token match: +4
tag match: +3
content token match: +1
recently updated doc bonus: +1
```

## Answer Generation Strategy For Phase 1

Phase 1은 LLM이 아니라 template + extraction 기반으로 답한다.

답변 구성:

1. opening
2. best matched answer summary
3. important caveat / deadline / exception
4. fallback guidance if ambiguity remains

예시:

```text
안녕하세요, 학생회 AI 도우미 따이수입니다.

등록된 안내 기준으로 보면:
- 수강 정정 문의는 개강 첫 주 금요일 18:00까지 접수 가능합니다.
- 신청은 학생회실 방문 또는 공지된 폼 링크를 통해 진행합니다.

세부 상황이 다를 수 있으니 필요하면 학생회 담당자가 이어서 확인해드릴게요.
```

## Answer Safety Rules

따이수는 아래 상황에서 확답하지 않는다.

- 지식 점수가 낮을 때
- 상충하는 문서가 동시에 잡힐 때
- 개인정보/민감정보를 요청할 때
- 징계/법률/의학처럼 고위험 판단이 필요한 질문일 때

이 경우 fallback:

```text
현재 등록된 안내만으로는 정확한 답변이 어려워 학생회 담당자에게 연결하는 것이 안전합니다.
문의 내용을 조금 더 구체적으로 남겨주시면 학생회가 이어서 확인해드릴게요.
```

## Admin UX

새 어드민 섹션:

- `따이수 관리`

하위 블록:

1. 기본 설정
   - 이름
   - 소개
   - 말투
   - fallback message
   - 자동응답 on/off
   - confidence threshold

2. 답변 원칙
   - 하지 말아야 할 답변
   - 반드시 포함할 주의 문구
   - 학생회 연결 기준

3. 지식 문서
   - 제목
   - 카테고리
   - 태그
   - 키워드
   - 본문
   - 게시 상태

4. 답변 로그
   - 어떤 학생 메시지에 답변했는지
   - 어떤 문서를 근거로 썼는지
   - score

## Runtime Flow

### Student message path

```text
student sends message
-> message saved
-> thread.messageAdded event committed
-> DaiSu auto reply hook checks:
   - author == student
   - assistant auto reply enabled
   - thread/tag matches policy
-> retrieval finds top docs
-> answer generated
-> assistant message appended as admin-authored bot message
-> answer log stored
-> SSE broadcasts new assistant message
```

### Why bot message uses `author=admin`

현재 클라이언트 렌더링은 `student` / `admin` 이원 구조다.
따라서 Phase 1에서는 아래처럼 저장하는 것이 가장 안전하다.

- `author: "admin"`
- `authorLabel: "따이수"`
- `meta.assistant = { ... }`

이렇게 하면 기존 UI를 깨지 않으면서 "학생회 소속 봇"처럼 표시할 수 있다.

## Persistence Design For Current Codebase

현재 state에는 아래를 추가한다.

```text
daisuAssistant
daisuKnowledgeDocuments[]
daisuAnswerLogs[]
```

이벤트 예시:

```text
daisu.settingsUpdated
daisu.documentCreated
daisu.documentUpdated
daisu.documentDeleted
daisu.answerLogged
```

## Service API Plan

### Admin APIs

- `GET /api/daisu`
- `PUT /api/daisu/settings`
- `GET /api/daisu/documents`
- `POST /api/daisu/documents`
- `PATCH /api/daisu/documents/:id`
- `DELETE /api/daisu/documents/:id`
- `GET /api/daisu/answer-logs`

### Internal service methods

- `getDaiSuState()`
- `updateDaiSuSettings(payload)`
- `createDaiSuDocument(payload)`
- `updateDaiSuDocument(id, payload)`
- `deleteDaiSuDocument(id)`
- `listDaiSuAnswerLogs()`
- `generateDaiSuReplyForThread(threadId, studentMessageId)`

## Future Provider Abstraction

Phase 2를 위해 provider abstraction을 미리 둔다.

```text
createDaiSuResponder({
  queryKnowledge,
  settingsProvider,
  llmProvider optional
})
```

provider modes:

- `rules-only`
- `retrieval-template`
- `retrieval-llm`

## Observability

반드시 로그로 남겨야 할 것:

- auto reply skipped reason
- matched document ids
- generated score
- fallback used reason
- answer persisted successfully

## Incremental Delivery Plan

1. 설계 문서 추가
2. domain state / reducer에 따이수 모델 추가
3. service layer에 settings/document CRUD 추가
4. retrieval + auto reply engine 추가
5. HTTP routes 추가
6. admin UI 추가
7. chat UI에 따이수 메시지 시각 구분 추가
8. tests 추가

## Success Criteria

- 어드민이 따이수 지식 문서를 저장할 수 있다.
- 학생이 질문하면 관련 지식이 있을 때 자동응답한다.
- 관련 지식이 없으면 안전한 fallback을 보낸다.
- 사용한 문서와 score를 answer log에 남긴다.
- 기존 학생/학생회 실시간 채팅 흐름을 깨지 않는다.
