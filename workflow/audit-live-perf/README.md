# Workflow: audit-live-perf

Workflow audit hiệu năng và lifecycle pipeline Live Translate của Viezan.

## Cách dùng

```text
Dùng workflow audit-live-perf để kiểm tra useLiveTranslate.ts và subtitle pipeline.
```

```text
Dùng workflow audit-live-perf trước release để chắc chắn không leak audio/listener.
```

## Quy trình

1. Xác định scope (mặc định useLiveTranslate.ts + subtitle + transcribe).
2. Static search: AudioContext/MediaStream, mountedRef/AbortController, useEffect cleanup, threshold magic number, streaming IPC, console logs.
3. Đọc theo 8 stage pipeline.
4. Phân loại findings theo skill `viezan-live-perf-audit`.
5. Cross-check security với skill `viezan-ipc-security-audit` nếu scope chạm IPC/preload audio.
6. Ưu tiên fix Critical/High.
7. Verify: build, test, manual smoke (start/stop live, đổi language, đổi nguồn audio).
8. Lưu báo cáo `live-perf-report-YYYYMMDD-HHmm.md` nếu user yêu cầu.

## Báo cáo mặc định

`viezanagent/report/live-perf-report-YYYYMMDD-HHmm.md`
