# Council-Talk

학생회에서 운영하는 문의/상담 채널 서비스 프로토타입입니다.

일반 학생은 학번, 이름, 질문 제목, 질문 내용을 입력해 문의를 등록하고 채팅을 이어갈 수 있습니다. 어드민은 접수된 문의를 확인하고 학생에게 답변할 수 있습니다.

## Email notifications

어드민 알림 설정에 이메일을 등록해도 SMTP 환경변수가 없으면 메일은 발송되지 않고 서버 로그에 `[mail skipped]`가 남습니다.

홈서버의 `.env` 예시:

```env
PUBLIC_BASE_URL=https://your-council-talk-url.example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Council Talk <your-email@gmail.com>
```

Gmail을 사용할 경우 일반 계정 비밀번호가 아니라 Google 계정의 앱 비밀번호를 사용해야 합니다.

필수 SMTP 환경변수:

- `PUBLIC_BASE_URL`: 메일 안에 들어갈 서비스 주소입니다. 예: `https://married-dim-futures-dubai.trycloudflare.com`
- `SMTP_HOST`: SMTP 서버 주소입니다. Gmail은 `smtp.gmail.com`입니다.
- `SMTP_PORT`: SMTP 포트입니다. TLS 시작 방식은 보통 `587`, SSL 방식은 보통 `465`입니다.
- `SMTP_SECURE`: `SMTP_PORT=465`면 `true`, `587`이면 보통 `false`입니다.
- `SMTP_USER`: 발신 이메일 계정입니다.
- `SMTP_PASS`: SMTP 비밀번호입니다. Gmail은 계정 비밀번호가 아니라 앱 비밀번호를 넣어야 합니다.
- `SMTP_FROM`: 받는 사람에게 보이는 발신자입니다. 예: `Council Talk <your-email@gmail.com>`

## Discord notifications

새 문의가 들어왔을 때 디스코드 웹훅으로 학번, 이름, 문의 제목, 어드민 바로가기 링크를 보낼 수 있습니다.

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## DaiSu conversational AI

따이수를 생성형 대화형 AI처럼 동작시키려면 OpenAI 호환 Chat Completions API를 연결할 수 있습니다.

```env
DAISU_AI_ENABLED=true
DAISU_AI_API_KEY=your-api-key
DAISU_AI_API_URL=https://api.openai.com/v1/chat/completions
DAISU_AI_MODEL=gpt-4.1-mini
```

API 키가 없으면 따이수는 내부 fallback 규칙과 lesson memory 중심으로 동작합니다.
