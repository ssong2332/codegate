# Planner Memory Index

- [AC 번호 예약 금지](project_ac_number_reservation.md) — 미리 못박은 AC/T 번호는 반드시 소진된다(이 저장소에서 3회 발생)
- [AC·완료 증거 작성 형식](project_ac_verifiability.md) — 판정 불가 문장 금지, 역방향 확인·before/after 수치 필수, 추적성 갭 처리 절차
- [편집만 하고 커밋 금지](feedback_edit_only_handoff.md) — 브랜치·커밋은 오케스트레이터 몫, 신규 행은 append만, 집행 패스는 재검토 금지
- [AC 문면 수정의 소급 영향](project_ac_amendment_retroactivity.md) — 실질 판정은 안 뒤집혀도 제출된 증거가 무효가 된다, 그래서 신설이 기본
- [후속 결함과 게이트 fixture 충돌](project_followup_fixture_collision.md) — 신고 발화가 선행 게이트의 "정상 샘플"로 박혀 있는지 등재 전 grep
- [사용자의 범위 좁히기 정정](feedback_user_scope_narrowing.md) — "그건 A에서 말한 거고 B는 아니야"는 새 요구가 아니라 범위 정정, 제외 범위와 담당 태스크를 명시
- [셸 없이 실측하는 법](project_no_shell_measurement.md) — base 커밋은 `.git/logs/refs/heads/main` 마지막 줄, 러너 제약은 package.json으로 대체하고 그 사실을 명시
- [점유된 행은 통째로 회피](feedback_row_ownership_conflict.md) — 다른 브랜치가 만지는 Tasks.md 행은 한 글자도 안 건드린다, 편집 후 열 수 8 재검증
- [수치 정정 규칙](project_baseline_correction.md) — 현재형 기준선만 고치고 과거 기록은 보존, 정정 전 전수 grep(부분 정정이 반복 실패 양식)
