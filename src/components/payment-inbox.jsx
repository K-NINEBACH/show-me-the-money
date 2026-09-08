import { useTheme, F } from "../lib/theme";
import { fmtWon, parsePaymentText } from "../lib/data";
import { hasNotificationAccess, openNotificationSettings } from "../lib/native";

/*
  껍데기 앱이 잡아 온 결제 알림을 보여주는 자리 (기록 탭 맨 위).

  **자동으로 등록하지 않는 이유.** 카드사·은행마다 문구가 다르고, 취소 문자나
  누적 사용액 안내처럼 지출이 아닌 것도 같은 모양으로 온다. 잘못 읽은 값이
  조용히 기록으로 남으면 합계가 어긋나는데, 나중에 어느 줄이 가짜인지 알
  방법이 없다 — 이 앱에서 이미 세 번 겪은 병이다. 그래서 읽어서 보여만 주고
  '이걸로 채우기'를 누른 것만 폼에 올린다.

  **버리기를 같이 둔다.** 취소 문자나 광고가 섞여 들어오는 건 막을 수 없으니,
  한 번에 지울 수 있어야 목록이 쌓이지 않는다.
*/
export function PaymentInbox({ ctx, onPick }) {
  const T = useTheme();
  const { inbox, dismissInbox } = ctx;

  const access = hasNotificationAccess();

  /*
    권한이 꺼져 있으면 그 얘기부터 한다. 알림이 안 잡히는 이유가 이것뿐인데
    화면이 그냥 비어 있으면 "이 기능 고장 났나" 하고 만다.
    껍데기 앱이 아닐 때(access === null)는 아예 안 그린다 — 크롬에서는
    있을 수 없는 기능이라 안내조차 소음이다.
  */
  if (access === false) {
    return (
      <div
        style={{
          border: `1px dashed ${T.gold}`,
          borderRadius: 12,
          padding: "12px 14px",
          marginBottom: 14,
        }}
      >
        <div style={{ color: T.cream, fontSize: 15, fontWeight: 700 }}>
          결제 알림을 아직 못 읽어요
        </div>
        <div style={{ color: T.muted, fontSize: 13.5, marginTop: 4, lineHeight: 1.5 }}>
          알림 접근을 켜면 카드 결제가 올 때마다 여기로 올라와요. 이 권한은 앱이
          대신 켤 수 없어서 직접 허용하셔야 해요.
        </div>
        <button
          onClick={openNotificationSettings}
          style={{
            marginTop: 8,
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: T.gold,
            color: "#23190C",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          설정 열기
        </button>
      </div>
    );
  }

  if (!inbox || inbox.length === 0) return null;

  return (
    <div
      style={{
        border: `1px solid ${T.goldSoft}55`,
        borderRadius: 12,
        padding: "10px 12px",
        marginBottom: 14,
      }}
    >
      <div style={{ color: T.goldSoft, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
        받은 결제 알림 {inbox.length}건
      </div>

      {inbox.map((item, i) => {
        const r = parsePaymentText(item.text || "");
        return (
          <div
            key={`${item.at}-${i}`}
            style={{
              padding: "8px 0",
              borderTop: i === 0 ? "none" : `1px dashed ${T.paperLine || T.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 15.5, fontWeight: 700 }}>
                  {r.amount ? fmtWon(Number(r.amount)) : "금액 못 읽음"}
                </div>
                <div
                  style={{
                    color: T.muted,
                    fontSize: 12.5,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.merchant || item.text}
                </div>
              </div>
              <button
                onClick={() => {
                  onPick(item.text);
                  dismissInbox(i);
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: T.gold,
                  color: "#23190C",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                채우기
              </button>
              <button
                onClick={() => dismissInbox(i)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: "transparent",
                  color: T.muted,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                버리기
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
