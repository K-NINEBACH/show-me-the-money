import { useTheme, F } from "../lib/theme";
import { fmtWon, parsePaymentText } from "../lib/data";
import { hasNotificationAccess, openNotificationSettings } from "../lib/native";
import { isCancelText } from "../lib/auto-record";

/*
  껍데기 앱이 잡아 왔는데 **자동으로 넣지 못한** 결제 알림을 보여주는 자리
  (기록 탭 맨 위). 확실한 것은 auto-record.js가 이미 기록으로 넣었고, 여기 남는
  것은 사람이 봐야 하는 것들이다.

  **여기 남는 이유는 대개 이렇다.** 취소·누적 안내처럼 지출이 아닌 문구, 어느
  카드·통장인지 문구로 못 고른 경우, 금액이 같은 고정지출이 여럿이라 어느
  것인지 못 가른 경우, 할부 회차와 금액이 같아 카드값이 두 배가 될 수 있는 경우.
  잘못 읽은 값이 조용히 기록으로 남으면 합계가 어긋나는데 나중에 어느 줄이
  가짜인지 알 방법이 없다 — 이 앱에서 이미 여러 번 겪은 병이라, 애매하면
  넣지 않고 여기로 보낸다.

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
            color: T.onGold,
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
        /*
          취소 알림은 결제 알림과 똑같은 모양이라, 예전엔 '36,280원 쿠팡페이'가
          두 줄 뜨면 결제가 두 번 잡힌 것처럼 보였고 둘 다 '채우기'가 있었다.
          취소는 표시를 붙이고 '채우기'를 뺀다 — 채우면 결제로 들어가 버린다.
        */
        const cancel = isCancelText(item.text);
        const amountText = r.amount ? fmtWon(Number(r.amount)) : "금액 못 읽음";
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
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, color: T.cream, fontFamily: F.mono, fontSize: 15.5, fontWeight: 700 }}>
                  <span style={cancel ? { textDecoration: "line-through", color: T.muted } : undefined}>{amountText}</span>
                  {cancel && <span style={{ fontFamily: "inherit", fontSize: 12.5, color: T.danger, whiteSpace: "nowrap" }}>결제 취소</span>}
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
              {!cancel && <button
                onClick={() => {
                  onPick(item.text);
                  dismissInbox(i);
                }}
                aria-label={`${amountText} ${r.merchant || ""} 기록 화면에 채우기`}
                style={{
                  minHeight: 36,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "none",
                  background: T.gold,
                  color: T.onGold,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                채우기
              </button>}
              <button
                onClick={() => dismissInbox(i)}
                aria-label={`${amountText} ${r.merchant || ""} ${cancel ? "취소 알림" : "알림"} 버리기`}
                style={{
                  minHeight: 36,
                  padding: "0 10px",
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
