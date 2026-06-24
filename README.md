# Council-Talk

학생회에서 운영하는 문의/상담 채널 서비스 프로토타입입니다.

일반 학생은 학번, 이름, 질문 제목, 질문 내용을 입력해 문의를 등록하고 채팅을 이어갈 수 있습니다. 어드민은 접수된 문의를 확인하고 학생에게 답변할 수 있습니다.

## 개발

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## 배포

```bash
docker compose up -d --build
```

어드민 화면은 `/admin`에서 접속합니다.
기본 비밀번호는 `counciltalk`이며, 배포 시 `ADMIN_PASSWORD` 환경 변수로 바꿀 수 있습니다.
