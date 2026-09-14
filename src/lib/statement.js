import { fixedInfo, monthKeyOffset } from "./data";

/*
  **카드 명세서로 맞추기**(2026-09-14).

  카드사 앱의 '결제 예정' 이용내역을 한 줄씩 붙여 넣으면, 앱의 카드 기록과 대조해서
    · 앱에 있는 것(같은 금액, 날짜 ±2일)은 그대로 두고
    · 앱에 없는 것은 새로 넣고(fromStatement — 내역에서 '명세서' 표시)
    · 명세서에 없는데 앱에만 있는 것은 목록으로 보여 준다(사람이 지울지 정한다 — 중복일 수도,
      카드 앱에 아직 안 올라온 것일 수도 있다)
    · 카드값(bill)을 명세서 금액에 맞춘다.

  왜 필요했나 — 알림 자동 등록이 자리 잡기 전(9월 초)의 결제와 하이패스 통행료는 알림이 없어서
  앱에 없었다. 현대카드 9월분이 명세서 1,411,274원인데 앱은 1,299,322원이었고, 날짜별 기록은
  그보다 훨씬 적었다('맞추기'로 금액만 넣어서). 그러면 '이번 달 카드값'이 날짜로 셀 때 모자란다.

  **이 명세서 전의 청구는 이미 낸 것으로 본다.** 붙여 넣는 건 '다음 결제일 예정' 내역이라, 그
  앞 청구는 빠져나갔다. 그래서 카드값 = 명세서 일시불 합 + 명세서 끝 날짜 뒤의 앱 기록 +
  명세서에 아직 안 올라온 정기결제 카드반영. 할부는 앱의 할부(고정지출)가 따로 센다.

  줄 형식: "09/13 아동파크그린주유소 86,491" — 날짜 · 가맹점 · 금액. '할부'가 든 줄은 할부로 본다.
  금액 앞에 '-'가 붙은 줄(취소)은 같은 금액 결제와 서로 지운다.
*/

const pad = (n) => String(n).padStart(2, "0");
const dayMs = (iso) => new Date(`${iso}T12:00:00`).getTime();
const gap = (a, b) => Math.round((dayMs(a) - dayMs(b)) / 864e5);

export function parseStatement(text, today = new Date()) {
  const rows = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = raw.trim().match(/^(\d{1,2})[/.](\d{1,2})\.?\s+(.+?)\s+(-?)\s*([\d,]+)\s*원?$/);
    if (!m) continue;
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    // 1월에 "12/28"을 읽으면 작년이다 — 이번 달보다 두 달 넘게 뒤면 작년으로 본다
    const y = mo > today.getMonth() + 2 ? today.getFullYear() - 1 : today.getFullYear();
    const amount = Number(m[5].replace(/,/g, "")) * (m[4] ? -1 : 1);
    if (!amount) continue;
    const merchant = m[3].trim();
    rows.push({ date: `${y}-${pad(mo)}-${pad(d)}`, merchant, amount, installment: /할부/.test(merchant) });
  }
  return rows;
}

/* 통행료·택시는 누가 봐도 교통이다. 그 밖엔 짐작하지 않는다(틀린 카테고리가 조용히 쌓인다) */
function guessCategory(categories, merchant) {
  const find = (re) => (categories || []).find((c) => re.test(c.name))?.id || null;
  if (/고속도로|도로공사|터널|고속화도로|인프라웨이|하이패스|택시/.test(merchant)) return find(/교통/);
  if (/주유소|오일|에너지/.test(merchant)) return find(/주유/) || find(/교통/);
  return null;
}

export function reconcileStatement(data, cardId, rowsIn, nowMs = Date.now()) {
  // 명세서 안의 결제·취소 짝은 서로 지운다
  const rows = [...rowsIn];
  for (const neg of rowsIn.filter((r) => r.amount < 0)) {
    const i = rows.findIndex((r) => r.amount === -neg.amount && !r.installment);
    const j = rows.indexOf(neg);
    if (i >= 0 && j >= 0) { rows.splice(Math.max(i, j), 1); rows.splice(Math.min(i, j), 1); }
  }
  const buys = rows.filter((r) => r.amount > 0 && !r.installment).sort((a, b) => a.date.localeCompare(b.date));
  const refunds = rows.filter((r) => r.amount < 0);
  const installs = rows.filter((r) => r.installment && r.amount > 0);
  if (!buys.length) return null;
  const from = buys[0].date;
  const to = buys[buys.length - 1].date;
  const key = (iso) => iso.slice(0, 7);

  const onCard = (e) => (e.paymentMethod || "cash") === "card" && e.cardId === cardId && !e.isReceivable;
  const pool = (data.expenses || []).filter((e) => onCard(e) && gap(e.date, from) >= -2 && gap(e.date, to) <= 2);
  const used = new Set();
  const matched = [];
  const toAdd = [];
  for (const r of buys) {
    const pick = pool
      .filter((e) => !used.has(e.id) && Number(e.amount) === r.amount && Math.abs(gap(e.date, r.date)) <= 2)
      .sort((a, b) => Math.abs(gap(a.date, r.date)) - Math.abs(gap(b.date, r.date)))[0];
    if (pick) { used.add(pick.id); matched.push({ row: r, expense: pick }); }
    else toAdd.push(r);
  }
  /*
    **정기결제 '카드반영' 기록은 날짜가 결제일이 아니다** — '완료'를 누른 날로 적힌다. 유튜브
    13,900원을 10일에 눌렀으면 3일 명세서 줄과 날짜가 안 맞아 두 번 들어간다. 그래서 남은 줄을
    같은 달·같은 금액의 카드반영 기록과 한 번 더 짝짓는다.
  */
  for (const r of [...toAdd]) {
    const adj = (data.expenses || []).find((e) => onCard(e) && e.isCardAdjustment && !used.has(e.id)
      && Number(e.amount) === r.amount && key(e.date) === key(r.date));
    if (adj) { used.add(adj.id); matched.push({ row: r, expense: adj }); toAdd.splice(toAdd.indexOf(r), 1); }
  }

  // 명세서 기간 안인데 명세서에 없는 앱 기록. 정기결제 카드반영은 아직 청구 전일 수 있어 뺀다
  const extra = (data.expenses || []).filter((e) => onCard(e) && !used.has(e.id) && !e.isCardAdjustment && e.date >= from && e.date <= to);
  const pendingAdj = (data.expenses || []).filter((e) => onCard(e) && !used.has(e.id) && e.isCardAdjustment && e.date >= from && e.date <= to);
  const afterEnd = (data.expenses || []).filter((e) => onCard(e) && !used.has(e.id) && e.date > to);

  /*
    새로 넣는 결제가 카드 정기결제(매달반복)와 금액이 같고 그 달 아직 처리 전이면 정기결제로 넣는다 —
    안 그러면 '이번 달 카드값'에서 일시불과 정기결제 예정으로 두 번 센다.
  */
  /*
    **할부 금액을 명세서대로 고친다**(2026-09-14, 사용자 요청 — "자동으로 되게 하는 게 목적이야").

    유이자 할부는 원금은 매달 같고 수수료가 남은 원금에 붙어서 **매달 줄어든다**. 앱엔 첫 달
    금액(데스크탑 할부 100,316원)이 매달 그대로 적혀 있었는데 4회차 실제 청구는 96,418원이었다.
    그래서 명세서의 "할부(4/12) 96,418" 줄로 같은 카드·같은 개월 수·같은 회차의 할부를 찾아 그 달
    금액을 고친다(overrides — 지난 달 기록은 안 건드린다). 줄에 '이용금액 972,000'과 '수수료
    15,418'이 있으면 남은 회차도 계산해 넣는다:
      원금 = 이용금액 ÷ 개월(끝수는 마지막 회차), 수수료율 = 이번 수수료 ÷ 이번 회차 전 남은 원금,
      다음 회차 = 원금 + 남은 원금 × 수수료율.
    수수료가 없으면(무이자) 남은 회차도 이번 금액으로 둔다.
  */
  let fixedExpenses = data.fixedExpenses || [];
  const installFixes = [];
  const installMissing = [];
  for (const r of installs) {
    const m = r.merchant.match(/\((\d{1,2})\s*\/\s*(\d{1,2})\)/);
    if (!m) { installMissing.push(r); continue; }
    const k = Number(m[1]);
    const n = Number(m[2]);
    let hit = null;
    let hitKey = null;
    for (const mk of [key(to), monthKeyOffset(key(to), -1), monthKeyOffset(key(to), 1)]) {
      const cands = fixedExpenses.filter((f) => (f.paymentMethod || "cash") === "card" && f.cardId === cardId
        && Number(f.totalMonths) === n && fixedInfo(f, mk).installment === k);
      if (cands.length) {
        hit = cands.sort((a, b) => Math.abs(fixedInfo(a, mk).amount - r.amount) - Math.abs(fixedInfo(b, mk).amount - r.amount))[0];
        hitKey = mk;
        break;
      }
    }
    if (!hit) { installMissing.push(r); continue; }
    const num = (re) => { const x = r.merchant.match(re); return x ? Number(x[1].replace(/,/g, "")) : 0; };
    const total = num(/이용\s*금액\s*([\d,]+)/);
    const fee = num(/수수료\s*([\d,]+)/);
    const overrides = { ...(hit.overrides || {}), [hitKey]: r.amount };
    const P = total ? Math.floor(total / n) : 0;
    const remainingBefore = total - P * (k - 1);
    const rate = total && fee && remainingBefore > 0 ? fee / remainingBefore : 0;
    for (let j = 1; k + j <= n; j++) {
      const principal = k + j === n ? total - P * (n - 1) : P;
      overrides[monthKeyOffset(hitKey, j)] = rate ? principal + Math.round((total - P * (k - 1 + j)) * rate) : r.amount;
    }
    const before = fixedInfo(hit, hitKey).amount;
    fixedExpenses = fixedExpenses.map((f) => (f.id === hit.id ? { ...f, overrides } : f));
    const nextAmt = k < n ? overrides[monthKeyOffset(hitKey, 1)] : null;
    installFixes.push({ name: hit.name, month: hitKey, label: `${k}/${n}`, before, after: r.amount, nextAmt, projected: !!rate });
  }

  /*
    같은 금액 줄이 그달에 여럿이면(구글 30,000원과 주유 30,000원) 가맹점 이름에 정기결제 이름
    조각이 든 줄만 잇는다. 금액만 보고 아무 줄이나 이으면 주유가 '구글 정기결제'가 된다.
  */
  const frag = (name) => String(name || "").replace(/[^가-힣A-Za-z0-9]/g, "").slice(0, 2).toLowerCase();
  const recurFor = (r, fixedList) => fixedList.find((x) => {
    if ((x.paymentMethod || "cash") !== "card" || x.totalMonths || x.cardId !== cardId) return false;
    if (x.paidMonths && x.paidMonths[key(r.date)]) return false;
    const info = fixedInfo(x, key(r.date));
    if (!info.active || Number(info.amount) !== r.amount) return false;
    const f2 = frag(x.name);
    if (f2.length >= 2 && r.merchant.toLowerCase().replace(/[^가-힣a-z0-9]/g, "").includes(f2)) return true;
    return toAdd.filter((o) => o.amount === r.amount && key(o.date) === key(r.date)).length === 1;
  });
  const added = toAdd.map((r, i) => {
    const id = "e" + (nowMs + i + 1);
    const f = recurFor(r, fixedExpenses);
    if (f) fixedExpenses = fixedExpenses.map((x) => (x.id === f.id ? { ...x, paidMonths: { ...(x.paidMonths || {}), [key(r.date)]: id } } : x));
    return {
      id, amount: r.amount, categoryId: f ? null : guessCategory(data.categories, r.merchant), date: r.date,
      memo: f ? `${f.name} · 정기결제 카드반영` : r.merchant, paymentMethod: "card", cardId, linkedBalanceId: null,
      fromStatement: true, ...(f ? { isCardAdjustment: true } : {}),
    };
  });

  const sum = (list, get = (x) => Number(x.amount)) => list.reduce((s, x) => s + get(x), 0);
  const statementBill = sum(buys) + sum(refunds);
  const bill = Math.max(0, statementBill + sum(afterEnd) + sum(pendingAdj));
  const card = (data.cards || []).find((c) => c.id === cardId);

  return {
    summary: {
      rows: rows.length, from, to, statementTotal: sum(rows), statementBill, installTotal: sum(installs),
      matched: matched.length, added: added.length, addedSum: sum(added),
      extra, afterEndSum: sum(afterEnd), pendingAdjSum: sum(pendingAdj), billBefore: Number(card?.bill || 0), billAfter: bill,
      installFixes, installMissing,
    },
    next: {
      ...data,
      expenses: [...(data.expenses || []), ...added],
      fixedExpenses,
      // 카드값을 확정한 시각 — 이보다 먼저 만든 기록을 지우거나 고쳐도 카드값을 안 흔든다(Ledger paidBefore)
      cards: (data.cards || []).map((c) => (c.id === cardId ? { ...c, bill, paidAtMs: nowMs } : c)),
    },
  };
}
