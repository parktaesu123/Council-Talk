# DaiSu Admin Operations

## 목적

- 따이수 운영자가 오늘 기준으로 바로 사용할 수 있는 관리 흐름을 짧게 정리한다.
- 생성형 응답, 학습 lesson, 답변 로그, 미리보기 기능을 점검할 때 참고한다.

## 점검 순서

1. 어드민 `따이수 관리` 탭으로 이동한다.
2. `AI 연결`이 `연결 준비됨`인지, 아니면 `비활성화` 또는 `API 키 필요`인지 먼저 확인한다.
3. `모델`, `Provider`, `타임아웃`, `학습 답변 수`, `자동 응답 로그` 수치를 확인한다.
4. `답변 참고 내용`에 학생회 기준 문구를 저장한다.
5. `답변 미리보기`에 테스트 질문을 넣고 응답 모드와 내용을 확인한다.

## lesson 관리

- 잘 학습된 답변은 최근 lesson 목록에 표시된다.
- lesson 목록은 최근 100개 기준으로 불러오며 질문/답변 검색이 가능하다.
- 잘못 학습된 답변은 `학습 삭제`로 제거할 수 있다.
- 너무 짧거나 모호한 학생회 답변은 자동으로 lesson으로 학습되지 않는다.

## 로그 관리

- 답변 로그는 최근 50개만 관리자 화면에서 불러온다.
- 로그 요약에서 `생성형`, `학습답변`, `문서기반`, `fallback` 비율을 빠르게 볼 수 있다.
- `all`, `generative`, `lesson`, `retrieval-template`, `auto-fallback` 기준으로 로그를 필터링할 수 있다.
- 각 로그 항목에서 바로 실제 문의방으로 이동할 수 있다.
- 필요하면 `로그 비우기`로 운영 화면을 정리할 수 있다.

## 미리보기 해석

- 답변 미리보기는 실제 메시지를 저장하지 않고 현재 설정만으로 응답을 시험한다.
- 경고 문구에 생성형 모델 실패 사유가 보이면, 현재는 생성형 답변이 아니라 참고 문서 기반 폴백을 보고 있는 상태다.
- 미리보기 아래의 근거 칩은 따이수가 참고한 문서 제목과 카테고리를 보여준다.
- 근거가 기대와 다르면 `답변 참고 내용`이나 학습 lesson을 먼저 정리한 뒤 다시 시험한다.

## 환경 변수

```env
DAISU_AI_ENABLED=true
DAISU_AI_PROVIDER=openai
DAISU_AI_API_KEY=sk-...
DAISU_AI_API_URL=https://api.openai.com/v1/chat/completions
DAISU_AI_MODEL=gpt-4.1-mini
DAISU_AI_TIMEOUT_MS=10000
```

Claude를 쓸 때는 아래처럼 바꾼다.

```env
DAISU_AI_PROVIDER=anthropic
DAISU_AI_API_URL=https://api.anthropic.com/v1/messages
DAISU_AI_MODEL=claude-sonnet-4-20250514
DAISU_AI_API_KEY=sk-ant-...
```

## 장애 대응 메모

- `provider-error`가 반복되면 서버 로그에서 실제 응답 코드를 먼저 확인한다.
- Anthropic에서 `401 invalid x-api-key`가 보이면 키 형식이 아니라 실제 발급된 유효 키인지 다시 확인한다.
- `provider-timeout`가 잦으면 `DAISU_AI_TIMEOUT_MS`를 늘리기 전에 네트워크 상태와 모델 응답 시간을 먼저 확인한다.
- `provider-disabled`는 `DAISU_AI_ENABLED=false` 상태이므로 생성형 호출 자체를 하지 않는다.

## 해석 기준

- `generative`: 외부 생성형 모델이 실제 응답을 생성했다.
- `lesson`: 이전 학생회 답변을 학습한 내용으로 응답했다.
- `retrieval-template`: 저장된 참고 문서를 바탕으로 템플릿 답변을 만들었다.
- `auto-fallback` 또는 `fallback`: 확실한 근거가 부족해 모른다고 답했다.
