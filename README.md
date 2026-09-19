# 법무법인 호경 상담 신청

Node.js 24 + Supabase Auth/PostgreSQL 기반 상담 랜딩페이지입니다. 외부 npm 의존성은 없습니다.

## 신청 및 관리

- `/lp/hokyung`: 안내 → 채무액 → 월 소득 → 회원가입/로그인 → 상담 신청 완료
- 질문은 다음 버튼을 누르면 저장됩니다. 완료 전 방문·답변도 DB에 남습니다.
- 이메일이 아이디입니다. 비밀번호는 Supabase Auth로만 전달하며 관리자 목록과 CSV에 포함하지 않습니다.
- 이메일 인증을 마친 사용자만 신청을 완료할 수 있습니다. 같은 브라우저에서 인증 링크를 열어 주세요.
- `/admin`: 회원·상담 조회, 30분 이상 미완료 필터, 페이지별 CSV 다운로드
- 관리자 권한은 검증한 app_metadata.role=admin으로만 판별합니다.
- Google Sheets·웹훅 연동은 포함하지 않습니다.

## Supabase 초기 설정

1. Supabase 프로젝트를 생성합니다.
2. `supabase/migrations/202609190001_auth_and_consultations.sql`을 한 번 적용합니다.
3. `.env.example`을 `.env`로 복사해 URL, publishable key, secret key를 입력합니다. 이전 anon/service_role 키도 지원합니다.
4. Auth 이메일 가입과 이메일 인증을 활성화합니다. Site URL은 배포 주소로 설정합니다. Redirect URLs에는 `https://배포주소/auth/callback**` 및 개발용 `http://127.0.0.1:5173/auth/callback**`를 등록합니다.
5. 고객 인증메일 발송용 자체 SMTP를 연결하고 발신 도메인을 인증합니다. 기본 메일 서비스는 운영 발송에 제약이 있습니다.
6. 로컬 `.env`의 ADMIN_EMAIL 및 8자 이상 ADMIN_PASSWORD를 입력하고 `node scripts/create-admin.mjs`를 실행합니다. 일반 사용자 계정을 자동 승격하지 않습니다.

.env·secret key·관리자 비밀번호는 GitHub에 올리지 않습니다. 관리자 비밀번호는 Vercel에도 필요하지 않습니다. 생성 후 로컬 ADMIN_PASSWORD를 비워도 됩니다.

## 실행과 테스트

```sh
node scripts/serve.mjs
node --test test/*.test.mjs
```

랜딩: http://127.0.0.1:5173/lp/hokyung / 관리자: http://127.0.0.1:5173/admin

Supabase 미연결 상태에서는 저장 성공을 표시하지 않습니다. 자동 테스트는 모의 공급자를 사용한 인증·권한 검증이며 실제 DB/RLS 검증은 연결 후 별도로 수행합니다.

## Vercel

GitHub 저장소를 가져와 프로젝트의 vercel.json과 Node.js 24 런타임을 사용합니다. 환경변수는 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, PUBLIC_ORIGIN=https://최종배포주소 입니다. Preview 환경은 별도 테스트 Supabase와 해당 출처를 사용하세요.

모든 경로는 서버리스 API로 연결됩니다. 비밀 파일이나 서버 소스를 정적 배포 폴더에 복사하지 않습니다. DB는 Supabase에 저장됩니다.

## 1년 보관

`node scripts/purge.mjs`는 1년이 지난 상담과 가입 후 1년이 지난 일반 회원을 삭제합니다. 관리자 계정은 제외합니다. 운영 시 신뢰할 수 있는 스케줄러에서 매일 실행해야 합니다. 스크립트 자체가 스케줄러를 등록하지는 않습니다. 삭제는 되돌릴 수 없으므로 백업 보관 정책도 함께 관리하세요.

기존 SQLite 자료는 원본을 보존하며 자동 이전하지 않습니다. 새 신청부터 Supabase에 저장합니다. 기존 자료 이전은 별도 작업이 필요합니다.
