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

## Discord notifications

새 문의가 들어왔을 때 디스코드 웹훅으로 학번, 이름, 문의 제목, 어드민 바로가기 링크를 보낼 수 있습니다.

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```
