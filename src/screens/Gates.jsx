// The two full-screen "gates" shown outside the normal tab navigation:
// first-run onboarding, and the month-changed wrap-up summary.
import { useState } from "react";
import { X } from "lucide-react";
import { useTheme, THEMES, THEME_ORDER, F, inputSty, primaryBtn } from "../lib/theme";
import { PALETTE } from "../lib/constants";
import { monthKey, monthLabel, fixedInfo, fmtWon } from "../lib/data";
import { MoneyInput, QuickAmountButtons, OnboardStep } from "../components/common";

export function Onboarding({ data, persist }) {
  const [step, setStep] = useState(0);
  const [useCard, setUseCard] = useState(true);
  const [cardName, setCardName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [startBalance, setStartBalance] = useState("");
  const [categories, setCategories] = useState(data.categories);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(PALETTE[0]);
  const [spendingGoal, setSpendingGoal] = useState("");
  const [themeId, setThemeId] = useState("dark");
  const T = THEMES[themeId] || THEMES.dark;

  const TOTAL = 8;

  const addCat = () => {
    if (!newCatName.trim()) return;
    setCategories([...categories, { id: "c" + Date.now(), name: newCatName.trim(), color: newCatColor }]);
    setNewCatName("");
  };
  const removeCat = (id) => setCategories(categories.filter((c) => c.id !== id));

  const finish = () => {
    const cards = useCard ? [{ id: "card1", name: cardName.trim() || "카드", bill: 0 }] : [];
    const accounts = [{ id: "acc1", name: accountName.trim() || "통장", initialBalance: Number(startBalance) || 0 }];
    persist({
      ...data,
      onboarded: true,
      lastSeenMonth: monthKey(new Date()),
      cards,
      accounts,
      categories,
      spendingGoal: Number(spendingGoal) || 0,
      theme: themeId,
    });
  };

  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const navBtnStyle = { flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 15.5, cursor: "pointer" };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: F.body, transition: "background 0.3s" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 24px 100px" }}>
        {step > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
            {Array.from({ length: TOTAL - 1 }, (_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i <= step - 1 ? T.gold : T.border }} />
            ))}
          </div>
        )}

        {step === 0 && (
          <OnboardStep>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: T.gold, fontFamily: F.display, fontSize: 26, fontWeight: 700, marginBottom: 10 }}>내 돈 챙겨줘</div>
              <div style={{ color: T.muted, fontSize: 16, lineHeight: 1.6, marginBottom: 30 }}>
                카드값, 할부, 통장 잔액을 한 곳에서 관리하는<br />개인 가계부예요.<br /><br />
                간단한 질문 몇 개로 시작할게요.
              </div>
              <button onClick={next} style={{ ...primaryBtn(T), padding: "14px 28px", fontSize: 16.5, width: "auto" }}>시작하기</button>
            </div>
          </OnboardStep>
        )}

        {step === 1 && (
          <OnboardStep>
            <div style={{ color: T.cream, fontFamily: F.display, fontSize: 18.5, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>카드를 쓰시나요?</div>
            <div style={{ color: T.muted, fontSize: 14.5, marginBottom: 20, textAlign: "center" }}>지출을 카드로도 기록하고 싶으면 선택하세요.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button onClick={() => setUseCard(true)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: useCard ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: useCard ? T.gold + "22" : "transparent", color: T.cream, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>카드 써요</button>
              <button onClick={() => setUseCard(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: !useCard ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: !useCard ? T.gold + "22" : "transparent", color: T.cream, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>안 써요</button>
            </div>
            {useCard && (
              <div style={{ width: "100%", marginBottom: 20 }}>
                <div style={{ color: T.muted, fontSize: 13.5, marginBottom: 6 }}>카드 이름 (나중에 여러 개 추가 가능)</div>
                <input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button onClick={back} style={navBtnStyle}>이전</button>
              <button onClick={next} style={{ flex: 2, ...primaryBtn(T), padding: "12px 0", fontSize: 15.5 }}>다음</button>
            </div>
          </OnboardStep>
        )}

        {step === 2 && (
          <OnboardStep>
            <div style={{ color: T.cream, fontFamily: F.display, fontSize: 18.5, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>통장 정보를 알려주세요</div>
            <div style={{ color: T.muted, fontSize: 14.5, marginBottom: 20, textAlign: "center" }}>여러 통장은 나중에 설정에서 추가할 수 있어요.</div>
            <div style={{ width: "100%", marginBottom: 14 }}>
              <div style={{ color: T.muted, fontSize: 13.5, marginBottom: 6 }}>통장 이름</div>
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
            </div>
            <div style={{ width: "100%", marginBottom: 20 }}>
              <div style={{ color: T.muted, fontSize: 13.5, marginBottom: 6 }}>지금 잔액 (선택, 나중에 수정 가능)</div>
              <MoneyInput value={startBalance} onChange={setStartBalance} />
              <QuickAmountButtons amount={startBalance} setAmount={setStartBalance} />
            </div>
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button onClick={back} style={navBtnStyle}>이전</button>
              <button onClick={next} style={{ flex: 2, ...primaryBtn(T), padding: "12px 0", fontSize: 15.5 }}>다음</button>
            </div>
          </OnboardStep>
        )}

        {step === 3 && (
          <OnboardStep>
            <div style={{ color: T.cream, fontFamily: F.display, fontSize: 18.5, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>카테고리를 확인해주세요</div>
            <div style={{ color: T.muted, fontSize: 14.5, marginBottom: 16, textAlign: "center" }}>필요하면 지금 추가하고, 나중에 기록 탭에서도 추가할 수 있어요.</div>
            <div style={{ width: "100%", background: T.bg2, borderRadius: 10, padding: 10, marginBottom: 14 }}>
              {categories.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
                  <span style={{ flex: 1, color: T.cream, fontSize: 15.5 }}>{c.name}</span>
                  <button onClick={() => removeCat(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={14} /></button>
                </div>
              ))}
            </div>
            <div style={{ width: "100%", marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
                <button onClick={addCat} style={{ ...primaryBtn(T), width: 60 }}>추가</button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PALETTE.map((col) => (
                  <button key={col} onClick={() => setNewCatColor(col)}
                    style={{ width: 22, height: 22, borderRadius: "50%", background: col, border: newCatColor === col ? `2px solid ${T.cream}` : "2px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button onClick={back} style={navBtnStyle}>이전</button>
              <button onClick={next} style={{ flex: 2, ...primaryBtn(T), padding: "12px 0", fontSize: 15.5 }}>다음</button>
            </div>
          </OnboardStep>
        )}

        {step === 4 && (
          <OnboardStep>
            <div style={{ color: T.cream, fontFamily: F.display, fontSize: 18.5, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>이번 달 목표 지출액</div>
            <div style={{ color: T.muted, fontSize: 14.5, marginBottom: 20, textAlign: "center" }}>홈 화면의 원형 게이지 기준이 돼요. 나중에 바꿀 수 있고, 안 정해도 괜찮아요.</div>
            <div style={{ width: "100%", marginBottom: 20 }}>
              <MoneyInput value={spendingGoal} onChange={setSpendingGoal} />
              <QuickAmountButtons amount={spendingGoal} setAmount={setSpendingGoal} />
            </div>
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button onClick={back} style={navBtnStyle}>이전</button>
              <button onClick={next} style={{ flex: 2, ...primaryBtn(T), padding: "12px 0", fontSize: 15.5 }}>다음</button>
            </div>
          </OnboardStep>
        )}

        {step === 5 && (
          <OnboardStep>
            <div style={{ color: T.cream, fontFamily: F.display, fontSize: 18.5, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>화면 테마를 골라주세요</div>
            <div style={{ color: T.muted, fontSize: 14.5, marginBottom: 20, textAlign: "center" }}>눌러보면 바로 이 화면에 적용돼서 느낌을 볼 수 있어요.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", rowGap: 16, columnGap: 4, width: "100%", marginBottom: 24 }}>
              {THEME_ORDER.map((id) => {
                const th = THEMES[id];
                const active = themeId === id;
                return (
                  <button key={id} onClick={() => setThemeId(id)}
                    style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 32, height: 32, borderRadius: "50%", background: th.swatch, border: active ? `3px solid ${T.gold}` : `1px solid ${T.border}` }} />
                    <span style={{ color: active ? T.gold : T.muted, fontSize: 11.5, fontWeight: active ? 700 : 500 }}>{th.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button onClick={back} style={navBtnStyle}>이전</button>
              <button onClick={next} style={{ flex: 2, ...primaryBtn(T), padding: "12px 0", fontSize: 15.5 }}>다음</button>
            </div>
          </OnboardStep>
        )}

        {step === 6 && (
          <OnboardStep>
            <div style={{ color: T.cream, fontFamily: F.display, fontSize: 18.5, fontWeight: 700, marginBottom: 14, textAlign: "center" }}>이렇게 쓰시면 돼요</div>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}>
              {[
                ["기록", "지출은 '기록' 탭에서 카드/현금/할부 중 골라 남겨요."],
                ["카드·통장", "설정에서 언제든 추가·삭제하고, 어느 카드·통장인지도 바꿀 수 있어요."],
                ["홈", "홈에서 카드값 결제, 대리결제 정산까지 바로 처리해요."],
                ["달력", "달력 탭에서 하루하루 얼마 썼는지 한눈에 볼 수 있어요."],
              ].map(([title, desc]) => (
                <div key={title} style={{ background: T.bg2, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ color: T.gold, fontSize: 14.5, fontWeight: 700, marginBottom: 3 }}>{title}</div>
                  <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button onClick={back} style={navBtnStyle}>이전</button>
              <button onClick={next} style={{ flex: 2, ...primaryBtn(T), padding: "12px 0", fontSize: 15.5 }}>다음</button>
            </div>
          </OnboardStep>
        )}

        {step === 7 && (
          <OnboardStep>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: T.gold, fontFamily: F.display, fontSize: 20, fontWeight: 700, marginBottom: 14 }}>준비됐어요!</div>
              <div style={{ color: T.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 28, textAlign: "left" }}>
                {useCard && <div>· 카드: {cardName.trim() || "카드"}</div>}
                <div>· 통장: {accountName.trim() || "통장"}{startBalance ? ` (${Number(startBalance).toLocaleString("ko-KR")}원)` : ""}</div>
                <div>· 카테고리: {categories.map((c) => c.name).join(", ")}</div>
                <div>· 목표 지출액: {spendingGoal ? `${Number(spendingGoal).toLocaleString("ko-KR")}원` : "나중에 설정"}</div>
                <div>· 테마: {THEMES[themeId]?.label}</div>
              </div>
              <button onClick={finish} style={{ ...primaryBtn(T), padding: "14px 28px", fontSize: 16.5, width: "auto" }}>시작하기</button>
            </div>
          </OnboardStep>
        )}
      </div>
    </div>
  );
}

export function MonthWrapUp({ data, persist, wrapKey }) {
  const T = useTheme();
  const monthExpenses = data.expenses.filter((e) => !e.isReceivable && e.date.slice(0, 7) === wrapKey);
  const total = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const catTotals = {};
  monthExpenses.forEach((e) => { catTotals[e.categoryId] = (catTotals[e.categoryId] || 0) + Number(e.amount); });
  const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const unpaidCount = data.fixedExpenses.filter((f) => {
    const info = fixedInfo(f, wrapKey);
    const isRealInstallment = (f.paymentMethod || "cash") === "card" && f.totalMonths > 0;
    return info.active && !isRealInstallment && !(f.paidMonths && f.paidMonths[wrapKey]);
  }).length;
  const unsettledCount = data.expenses.filter((e) => e.isReceivable && !e.settled).length;

  const dismiss = () => persist({ ...data, lastSeenMonth: monthKey(new Date()) });

  return (
    <div style={{ background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: F.body }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 24px 60px" }}>
        <div style={{ color: T.gold, fontFamily: F.display, fontSize: 15, letterSpacing: 1, marginBottom: 6 }}>{monthLabel(wrapKey)} 마무리</div>
        <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 30, fontWeight: 700, marginBottom: 4 }}>{fmtWon(total)}</div>
        <div style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>총 지출</div>

        {topCats.length > 0 && (
          <div style={{ width: "100%", background: T.bg2, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 8 }}>많이 쓴 카테고리</div>
            {topCats.map(([catId, amt]) => (
              <div key={catId} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: T.cream, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: catMap[catId]?.color || T.muted }} />
                  {catMap[catId]?.name || "미분류"}
                </span>
                <span style={{ color: T.muted, fontFamily: F.mono, fontSize: 14 }}>{fmtWon(amt)}</span>
              </div>
            ))}
          </div>
        )}

        {(unpaidCount > 0 || unsettledCount > 0) && (
          <div style={{ width: "100%", background: T.warn + "18", border: `1px solid ${T.warn}66`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            {unpaidCount > 0 && <div style={{ color: T.warn, fontSize: 13.5, marginBottom: unsettledCount > 0 ? 4 : 0 }}>지난달 출금처리 안 된 고정지출 {unpaidCount}건이 있어요</div>}
            {unsettledCount > 0 && <div style={{ color: T.warn, fontSize: 13.5 }}>미정산 대리결제 {unsettledCount}건이 있어요</div>}
          </div>
        )}

        <button onClick={dismiss} style={{ ...primaryBtn(T), padding: "14px 32px", fontSize: 15, width: "auto", marginTop: 10 }}>
          {monthLabel(monthKey(new Date()))}로 넘어가기
        </button>
      </div>
    </div>
  );
}

