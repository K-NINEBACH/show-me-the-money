import { autoRecordPayments, balanceOf, dealKey } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
const local = (d) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const now = new Date(); const iso = local(now);
const md = iso.slice(5).replace("-", "/");
const KB = "com.kbstar.kbbank";
const bal = (d, id) => d.balanceEntries.filter((b) => b.accountId === id).reduce((s, b) => s + (b.type === "in" ? 1 : -1) * Number(b.amount), Number(d.accounts.find((a) => a.id === id).initialBalance || 0));
const base = () => ({ accounts: [{ id: "a1", name: "국민은행", initialBalance: 0 }, { id: "a2", name: "기업은행", initialBalance: 500000 }], cards: [{ id: "c1", name: "현대카드", bill: 0 }], categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] });
const kbOut = (amt, t, b) => ({ text: `출금 ${amt.toLocaleString()}원 김*혁님 ${md} ${t} 카카오페이 FBS출금 ${amt.toLocaleString()} 잔액${b.toLocaleString()}`, pkg: KB });
const kbIn = (amt, t, b) => ({ text: `입금 ${amt.toLocaleString()}원 김*혁님 ${md} ${t} 급여 입금 ${amt.toLocaleString()} 잔액${b.toLocaleString()}`, pkg: KB });

console.log("[1] 잔액 읽기");
check("잔액1,392,375", balanceOf("출금 30,000 잔액1,392,375"), 1392375);
check("잔액 : 12,000원", balanceOf("잔액 : 12,000원"), 12000);
check("마이너스 통장", balanceOf("잔액-120,000"), -120000);
check("잔액부족은 잔액 아님", balanceOf("잔액부족으로 출금 실패"), null);

console.log("\n[2] 처음 온 KB 출금 — 기록하고 잔액을 은행과 맞춘다");
let d = base();
let r = autoRecordPayments(d, [kbOut(30000, "10:00", 1392375)]);
d = r.next;
check("출금 기록 1건 + 맞춤 1건", d.balanceEntries.length, 2);
check("앱 잔액 = 은행 잔액", bal(d, "a1"), 1392375);
check("맞춤 기록은 isAdjustment·auto", d.balanceEntries.filter((b) => b.isAdjustment && b.auto).length, 1);
check("bankSync 시점", d.accounts[0].bankSync.at, `${iso} 10:00`);
check("알림 문구용 차액", r.synced[0].diff, 1422375);
check("기업은행은 그대로", d.accounts[1].bankSync, undefined);

console.log("\n[3] 다음 알림이 잔액과 맞으면 맞춤 기록을 안 만든다");
r = autoRecordPayments(d, [kbOut(12000, "11:00", 1380375)]);
d = r.next;
check("출금만 1건 늘어남", d.balanceEntries.length, 3);
check("synced 없음", r.synced.length, 0);
check("잔액", bal(d, "a1"), 1380375);

console.log("\n[4] 앞선 거래 알림이 뒤늦게 옴 — 기록은 넣되 잔액은 그대로");
r = autoRecordPayments(d, [kbOut(5000, "10:30", 1387375)]);
d = r.next;
check("늦게 온 출금이 기록됨", d.balanceEntries.some((b) => b.amount === 5000 && !b.isAdjustment), true);
check("되돌림 기록이 붙음", d.balanceEntries.some((b) => b.isAdjustment && b.type === "in" && b.amount === 5000), true);
check("잔액은 마지막 은행 잔액 그대로", bal(d, "a1"), 1380375);
check("bankSync는 11:00 그대로", d.accounts[0].bankSync.at, `${iso} 11:00`);

console.log("\n[5] 한 번에 순서가 뒤집혀 옴 — 결과는 가장 늦은 잔액");
d = base();
r = autoRecordPayments(d, [kbOut(20000, "15:05", 980000), kbOut(10000, "15:00", 1000000)]);
d = r.next;
check("잔액 = 15:05 잔액", bal(d, "a1"), 980000);
check("거래 2건 다 기록", d.balanceEntries.filter((b) => !b.isAdjustment).length, 2);

console.log("\n[6] 시각이 없는 알림은 맞추지 않는다");
d = base();
r = autoRecordPayments(d, [{ text: `출금 30,000원 김*혁님 ${md} 카카오페이 잔액1,392,375`, pkg: KB }]);
check("출금만 기록", r.next.balanceEntries.length, 1);
check("잔액 맞춤 없음", r.synced.length, 0);

console.log("\n[7] 카드값 '결제하기'를 실제 출금보다 먼저 누름 — 다음 알림에 저절로 바로잡힌다");
d = base();
d.accounts[0].initialBalance = 1000000;
d.balanceEntries = [{ id: "p1", accountId: "a1", type: "out", amount: 500000, date: iso, memo: "현대카드 카드값 결제" }];
// 은행은 아직 안 빠짐: 1,000,000 → 급여 아닌 소액 입금 후 1,010,000
r = autoRecordPayments(d, [kbIn(10000, "12:00", 1010000)]);
d = r.next;
check("앱 잔액이 은행 잔액으로", bal(d, "a1"), 1010000);
const tm = new Date(now.getTime() + 864e5); const isoT = local(tm); const mdT = isoT.slice(5).replace("-", "/");
r = autoRecordPayments(d, [{ text: `출금 500,000원 김*혁님 ${mdT} 09:00 현대카드 잔액510,000`, pkg: KB }]);
d = r.next;
check("실제 출금 날 잔액", bal(d, "a1"), 510000);
check("그날 맞춤 기록은 없음(이미 맞음)", r.synced.length, 0);

console.log("\n[8] 맞춤 기록과 같은 금액의 진짜 입금은 새로 넣는다");
d = base();
d.balanceEntries = [{ id: "adj", accountId: "a1", type: "in", amount: 30000, date: iso, memo: "은행 잔액에 맞춤", isAdjustment: true, auto: true }];
r = autoRecordPayments(d, [kbIn(30000, "13:00", 60000)]);
check("입금이 기록됨", r.registered.length, 1);
check("잔액", bal(r.next, "a1"), 60000);

console.log("\n[9] 이미 적힌 거래(넘김)여도 잔액은 맞춘다");
d = base();
d.balanceEntries = [{ id: "m", accountId: "a1", type: "out", amount: 7000, date: iso, memo: "점심" }];
r = autoRecordPayments(d, [kbOut(7000, "12:30", 93000)]);
check("넘김", r.skipped.length, 1);
check("잔액", bal(r.next, "a1"), 93000);

console.log("\n[10] 같은 거래 열쇠 — 문자 앱 알림과 문자함 본문");
const body = `[Web발신]\n현대카드 현대 코스트코 승인\n김*혁\n8,800원 일시불\n${md} 11:02\n이마트24\n누적1,100,000원`;
check("알림(보낸 사람+본문)과 문자함 본문이 같은 열쇠", dealKey(`현대카드 ${body}`), dealKey(body));
check("취소는 다른 열쇠", dealKey(body.replace("승인", "승인취소")) === dealKey(body), false);
check("시각 없으면 열쇠 없음", dealKey(`현대카드 승인 8,800원 ${md}`), null);
check("KB 출금 금액은 거래액(잔액 아님)", dealKey(kbOut(57000, "09:10", 1392375).text)?.split("|")[2], 57000);

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
