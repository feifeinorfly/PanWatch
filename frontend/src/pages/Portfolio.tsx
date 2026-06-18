import { useCallback, useEffect, useMemo, useState } from 'react'
import { PieChart, RefreshCw, AlertTriangle } from 'lucide-react'
import {
  dashboardApi,
  portfolioApi,
  type DashboardPortfolioSummary,
  type PortfolioDiagnostics,
  type PortfolioBenchmark,
  type BenchmarkCurvePoint,
} from '@panwatch/api'
import { Button } from '@panwatch/base-ui/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@panwatch/base-ui/components/ui/select'
import { useToast } from '@panwatch/base-ui/components/ui/toast'
import StockInsightModal from '@panwatch/biz-ui/components/stock-insight-modal'

const BENCHMARKS = [
  { code: '000300', label: '沪深300' },
  { code: '000905', label: '中证500' },
  { code: '399006', label: '创业板指' },
  { code: '000001', label: '上证指数' },
]

function wan(v?: number | null): string {
  if (v == null || !isFinite(v)) return '--'
  return `${(v / 10000).toFixed(2)}万`
}
function pct(v?: number | null, digits = 2): string {
  if (v == null || !isFinite(v)) return '--'
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`
}
function pnlColor(v?: number | null): string {
  if (v == null) return 'text-muted-foreground'
  return v > 0 ? 'text-rose-500' : v < 0 ? 'text-emerald-500' : 'text-muted-foreground'
}

function BenchmarkChart({ curve, benchLabel }: { curve: BenchmarkCurvePoint[]; benchLabel: string }) {
  if (!curve || curve.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center text-[12px] text-muted-foreground">
        数据不足,无法绘制净值曲线
      </div>
    )
  }
  const width = 600
  const height = 200
  const pad = { top: 16, right: 16, bottom: 24, left: 40 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const all = curve.flatMap((p) => [p.portfolio, p.benchmark])
  const minV = Math.min(...all)
  const maxV = Math.max(...all)
  const range = maxV - minV || 1
  const xy = (v: number, i: number) => ({
    x: pad.left + (i / (curve.length - 1)) * w,
    y: pad.top + h - ((v - minV) / range) * h,
  })
  const pathOf = (key: 'portfolio' | 'benchmark') =>
    curve
      .map((p, i) => {
        const { x, y } = xy(p[key], i)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  const yTicks = 4
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => ({
    v: minV + (range / yTicks) * i,
    y: pad.top + h - (i / yTicks) * h,
  }))
  const xIdx = [0, Math.floor(curve.length / 2), curve.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        {yLabels.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={t.y} y2={t.y} stroke="hsl(var(--border))" strokeWidth={0.5} />
            <text x={pad.left - 4} y={t.y + 3} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={9}>
              {t.v.toFixed(0)}
            </text>
          </g>
        ))}
        <path d={pathOf('benchmark')} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.4} strokeDasharray="4 3" />
        <path d={pathOf('portfolio')} fill="none" stroke="#6366f1" strokeWidth={2} />
        {xIdx.map((i) => {
          const { x } = xy(curve[i].portfolio, i)
          return (
            <text key={i} x={x} y={height - 6} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={9}>
              {curve[i].date.slice(5)}
            </text>
          )
        })}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4" style={{ background: '#6366f1' }} />组合
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-muted-foreground" />
          {benchLabel}
        </span>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<DashboardPortfolioSummary | null>(null)
  const [diag, setDiag] = useState<PortfolioDiagnostics | null>(null)
  const [bench, setBench] = useState<PortfolioBenchmark | null>(null)
  const [benchCode, setBenchCode] = useState('000300')
  const [modal, setModal] = useState<{ open: boolean; symbol: string; market: string; name: string }>({
    open: false,
    symbol: '',
    market: 'CN',
    name: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [s, d, b] = await Promise.allSettled([
      dashboardApi.portfolioSummary({ include_quotes: true }),
      portfolioApi.diagnostics(),
      portfolioApi.benchmark({ days: 60, benchmark: benchCode }),
    ])
    if (s.status === 'fulfilled') setSummary(s.value)
    if (d.status === 'fulfilled') setDiag(d.value)
    if (b.status === 'fulfilled') setBench(b.value)
    if (s.status === 'rejected') toast('加载持仓失败', 'error')
    setLoading(false)
  }, [benchCode, toast])

  useEffect(() => {
    load()
  }, [load])

  const holdings = useMemo(() => {
    const map = new Map<
      string,
      { symbol: string; name: string; market: string; quantity: number; cost: number; marketValue: number; pnl: number }
    >()
    for (const acc of summary?.accounts ?? []) {
      for (const p of acc.positions ?? []) {
        const key = `${p.market}:${p.symbol}`
        const mv = p.current_price != null ? p.current_price * p.quantity : p.cost_price * p.quantity
        const cost = p.cost_price * p.quantity
        const ex = map.get(key)
        if (ex) {
          ex.quantity += p.quantity
          ex.cost += cost
          ex.marketValue += mv
          ex.pnl += mv - cost
        } else {
          map.set(key, { symbol: p.symbol, name: p.name, market: p.market, quantity: p.quantity, cost, marketValue: mv, pnl: mv - cost })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.marketValue - a.marketValue)
  }, [summary])

  const total = summary?.total
  const benchEmpty = !bench || bench.empty || !bench.curve

  return (
    <div className="page-container pb-10">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-bold tracking-tight text-foreground md:text-[22px]">
            <PieChart className="h-5 w-5 text-primary" />
            组合
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">整体持仓的绩效、相对大盘表现与风险诊断</p>
        </div>
        <Button onClick={load} disabled={loading} size="sm">
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 总览 KPI */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card p-3">
          <div className="text-[11px] text-muted-foreground">总资产</div>
          <div className="mt-1 text-[18px] font-bold">{wan(total?.total_assets)}</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] text-muted-foreground">持仓市值</div>
          <div className="mt-1 text-[18px] font-bold">{wan(total?.total_market_value)}</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] text-muted-foreground">浮动盈亏</div>
          <div className={`mt-1 text-[18px] font-bold ${pnlColor(total?.total_pnl)}`}>{wan(total?.total_pnl)}</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] text-muted-foreground">盈亏比例</div>
          <div className={`mt-1 text-[18px] font-bold ${pnlColor(total?.total_pnl_pct)}`}>{pct(total?.total_pnl_pct)}</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] text-muted-foreground">可用资金</div>
          <div className="mt-1 text-[18px] font-bold">{wan(total?.available_funds)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 基准对比 */}
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">相对基准表现（近 60 交易日）</h2>
            <Select value={benchCode} onValueChange={setBenchCode}>
              <SelectTrigger className="h-8 w-28 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BENCHMARKS.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {benchEmpty ? (
            <div className="flex h-44 items-center justify-center text-[12px] text-muted-foreground">
              {loading ? '加载中…' : '暂无足够持仓/行情数据生成基准对比'}
            </div>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-accent/15 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground">超额收益</div>
                  <div className={`font-mono text-[15px] font-semibold ${pnlColor(bench!.excess_return)}`}>
                    {pct(bench!.excess_return)}
                  </div>
                </div>
                <div className="rounded bg-accent/15 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground">信息比率</div>
                  <div className="font-mono text-[15px] font-semibold">{bench!.information_ratio?.toFixed(2) ?? '--'}</div>
                </div>
                <div className="rounded bg-accent/15 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground">相对回撤</div>
                  <div className="font-mono text-[15px] font-semibold text-emerald-500">{pct(bench!.relative_drawdown)}</div>
                </div>
              </div>
              <div className="mb-2 text-[11px] text-muted-foreground">
                组合 {pct(bench!.portfolio_return)} · {bench!.benchmark_label} {pct(bench!.benchmark_return)}
              </div>
              <BenchmarkChart curve={bench!.curve!} benchLabel={bench!.benchmark_label || '基准'} />
              <p className="mt-2 text-[10px] text-muted-foreground">
                * 按当前持仓量重构净值(忽略区间内加减仓),仅供参考。
              </p>
            </>
          )}
        </div>

        {/* 组合诊断 */}
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">组合诊断</h2>
          {!diag || diag.position_count === 0 ? (
            <div className="text-[12px] text-muted-foreground">{loading ? '加载中…' : '暂无持仓'}</div>
          ) : (
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">持仓只数</span>
                <span className="font-mono">{diag.position_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">集中度 HHI</span>
                <span className={`font-mono ${diag.hhi >= 0.5 ? 'text-amber-600' : ''}`}>{diag.hhi.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">最大单仓</span>
                <span className={`font-mono ${diag.max_weight >= 0.4 ? 'text-amber-600' : ''}`}>
                  {(diag.max_weight * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <div className="mb-1 text-[10px] text-muted-foreground">市场分布</div>
                {Object.entries(diag.by_market).map(([m, v]) => {
                  const w = diag.total_market_value > 0 ? (v / diag.total_market_value) * 100 : 0
                  return (
                    <div key={m} className="mb-1">
                      <div className="flex justify-between text-[11px]">
                        <span>{m}</span>
                        <span className="font-mono">{w.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded bg-accent/40">
                        <div className="h-1.5 rounded bg-primary/60" style={{ width: `${Math.min(100, w)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {diag.alerts.length > 0 && (
                <div className="space-y-1 pt-1">
                  {diag.alerts.map((a, i) => (
                    <div key={i} className="flex items-start gap-1 text-[11px] text-amber-600">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 持仓明细 */}
      <div className="card mt-3 p-4">
        <h2 className="mb-3 text-sm font-semibold">持仓明细</h2>
        {holdings.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-muted-foreground">{loading ? '加载中…' : '暂无持仓'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border/60 text-[11px] text-muted-foreground">
                  <th className="py-1.5 text-left font-normal">标的</th>
                  <th className="py-1.5 text-right font-normal">数量</th>
                  <th className="py-1.5 text-right font-normal">市值</th>
                  <th className="py-1.5 text-right font-normal">盈亏</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr
                    key={`${h.market}:${h.symbol}`}
                    className="cursor-pointer border-b border-border/30 hover:bg-accent/30"
                    onClick={() => setModal({ open: true, symbol: h.symbol, market: h.market, name: h.name })}
                  >
                    <td className="py-1.5">
                      <span className="font-medium">{h.name}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {h.market}:{h.symbol}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-mono">{h.quantity}</td>
                    <td className="py-1.5 text-right font-mono">{wan(h.marketValue)}</td>
                    <td className={`py-1.5 text-right font-mono ${pnlColor(h.pnl)}`}>
                      {h.pnl > 0 ? '+' : ''}
                      {wan(h.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StockInsightModal
        open={modal.open}
        onOpenChange={(o) => setModal((m) => ({ ...m, open: o }))}
        symbol={modal.symbol}
        market={modal.market}
        stockName={modal.name}
        hasPosition
      />
    </div>
  )
}
