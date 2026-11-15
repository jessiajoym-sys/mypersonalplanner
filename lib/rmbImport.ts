// Alipay / WeChat Pay statement parsing (CSV or Excel exports). Pure functions, no network.
export type Platform = 'alipay' | 'wechat'
export type Kind = 'expense' | 'income' | 'refund' | 'skip'
export type RmbRow = {
  id: string; platform: Platform; date: string; time: string; counterparty: string; item: string; sourceCategory: string
  amount: number; method: string; status: string; orderId: string; kind: Kind; skipReason?: string; original: string
}

/** Minimal CSV parser (quotes, commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

const clean = (v: any) => String(v ?? '').replace(/\t/g, '').trim()
const num = (v: any) => Number(String(v ?? '').replace(/[¥,\s元]/g, ''))
const dateOf = (s: string) => (s.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || ''

export function detect(rows: string[][]): { platform: Platform; headerAt: number } | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i].map(clean)
    if (r[0] === '交易时间' && r.includes('交易订单号') && r.includes('收/支')) return { platform: 'alipay', headerAt: i }
    if (r[0] === '交易时间' && r.includes('交易单号') && r.includes('当前状态')) return { platform: 'wechat', headerAt: i }
  }
  return null
}

/** Rows → normalized transactions. Anything that did not really happen (closed trades) is marked skip with a reason. */
export function parseRmb(rows: string[][], idPrefix = ''): { platform: Platform; rows: RmbRow[]; problems: string[] } | { error: string } {
  const d = detect(rows)
  if (!d) return { error: 'This does not look like an Alipay or WeChat Pay export. Expected a header row starting with 交易时间 (Alipay: 交易订单号 / WeChat: 交易单号). Use the CSV or Excel export from the app (the PDF “证明” is not supported).' }
  const head = rows[d.headerAt].map(clean), col = (n: string) => head.indexOf(n)
  const c = { time: col('交易时间'), cat: col(d.platform === 'alipay' ? '交易分类' : '交易类型'), who: col('交易对方'), item: col(d.platform === 'alipay' ? '商品说明' : '商品'), dir: col('收/支'), amt: col(d.platform === 'alipay' ? '金额' : '金额(元)'), method: col(d.platform === 'alipay' ? '收/付款方式' : '支付方式'), status: col(d.platform === 'alipay' ? '交易状态' : '当前状态'), order: col(d.platform === 'alipay' ? '交易订单号' : '交易单号') }
  const missing = Object.entries(c).filter(([, v]) => v < 0).map(([k]) => k)
  if (missing.length) return { error: 'The file is missing expected columns: ' + missing.join(', ') }
  const out: RmbRow[] = [], problems: string[] = []
  rows.slice(d.headerAt + 1).forEach((raw, i) => {
    const r = raw.map(clean)
    if (r.length < 6 || !/^\d{4}-\d{2}-\d{2}/.test(r[c.time] || '')) return
    const amount = Math.abs(num(r[c.amt])), dir = r[c.dir], status = r[c.status], cat = r[c.cat], orderId = r[c.order]
    if (!orderId) { problems.push(`Row ${d.headerAt + 2 + i}: no order number, skipped.`); return }
    if (!Number.isFinite(amount)) { problems.push(`Row ${d.headerAt + 2 + i}: amount is not a number, skipped.`); return }
    if (amount === 0) { problems.push(`Row ${d.headerAt + 2 + i}: amount is 0 (free ride / voucher), skipped.`); return }
    let kind: Kind = 'skip', skipReason: string | undefined
    const refundish = /退款/.test(cat) || /^退款-/.test(r[c.item] || '')
    if (d.platform === 'alipay') {
      if (/交易关闭|已关闭/.test(status)) skipReason = 'Closed — the payment did not happen'
      else if (refundish) kind = 'refund'
      else if (dir === '收入') kind = 'income'
      else if (dir === '支出') kind = 'expense'
      else skipReason = 'Marked “not counted” by Alipay'
    } else {
      if (/-退款$|退款$/.test(cat) && dir === '收入') kind = 'refund'
      else if (dir === '收入') kind = 'income'
      else if (dir === '支出') kind = 'expense'
      else skipReason = 'Neutral transaction (e.g. top-up / withdrawal)'
    }
    const who = r[c.who], item = r[c.item] === '/' ? '' : r[c.item]
    out.push({ id: `${idPrefix}${out.length}`, platform: d.platform, date: dateOf(r[c.time]), time: r[c.time], counterparty: who, item, sourceCategory: cat, amount, method: r[c.method] || '', status, orderId, kind, skipReason, original: [who, item].filter(Boolean).join(' · ') })
  })
  return { platform: d.platform, rows: out, problems }
}

/** Method text → what it is: the platform wallet, or an external card/bank ("(5133)", "(1582)"). */
export function methodInfo(platform: Platform, method: string): { key: string; wallet: boolean; last4?: string; label: string } {
  const m = method.trim()
  const wallet = m === '' || m === '/' || m === '零钱' || m === '零钱通' || /^账户余额/.test(m) || /^余额/.test(m)
  if (wallet) return { key: platform === 'alipay' ? 'wallet' : 'wallet', wallet: true, label: platform === 'alipay' ? 'Alipay balance' : 'WeChat balance (零钱)' }
  const last4 = (m.match(/\((\d{4})\)/) || [])[1]
  const base = m.split('&')[0]          // "工商银行储蓄卡(1582)&工商银行立减金" → card part only
  return { key: base, wallet: false, last4, label: base }
}

const CAT: Record<string, string> = { 餐饮美食: 'Food', 日用百货: 'Daily Necessities', 交通出行: 'Transportation', 文化休闲: 'Entertainment', 数码电器: 'Shopping', 服饰装扮: 'Shopping', 家居家装: 'Housing', 美容美发: 'Daily Necessities', 医疗健康: 'Healthcare', 酒店旅游: 'Travel', 旅游出行: 'Travel', 运动户外: 'Shopping', 充值缴费: 'Daily Necessities', 保险: 'Insurance', 商户消费: 'Other' }
/** Suggest one of YOUR categories (only returns names that exist in `available`). */
export function suggestCategory(sourceCategory: string, text: string, available: string[]): string {
  const has = (n: string) => available.find(a => a.toLowerCase() === n.toLowerCase())
  let g = CAT[sourceCategory]
  if (/美团外卖|饿了么|餐|咖啡|奶茶|烧烤|火锅|面馆|食/.test(text)) g = 'Food'
  else if (/地铁|公交|打车|滴滴|高铁|铁路|12306|机票|骑行|单车|出行/.test(text)) g = 'Transportation'
  else if (/酒店|民宿|住宿|机票/.test(text) && !g) g = 'Travel'
  return (g && has(g)) || has('Other') || ''
}
