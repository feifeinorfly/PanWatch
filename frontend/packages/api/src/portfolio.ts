import { fetchAPI } from './client'

export interface PortfolioDiagnostics {
  position_count: number
  total_market_value: number
  hhi: number
  max_weight: number
  by_market: Record<string, number>
  by_strategy: Record<string, number>
  total_unrealized_pnl: number
  alerts: string[]
}

export interface BenchmarkCurvePoint {
  date: string
  portfolio: number
  benchmark: number
}

export interface PortfolioBenchmark {
  empty?: boolean
  reason?: string
  portfolio_return?: number
  benchmark_return?: number
  excess_return?: number
  information_ratio?: number
  relative_drawdown?: number
  days?: number
  benchmark_code?: string
  benchmark_label?: string
  curve?: BenchmarkCurvePoint[]
}

export const portfolioApi = {
  /** 真实持仓组合诊断(集中度/分布/风险提示)。 */
  diagnostics: () => fetchAPI<PortfolioDiagnostics>('/portfolio/diagnostics'),

  /** 组合 vs 基准(超额/信息比率/相对回撤 + 归一化曲线)。 */
  benchmark: (params?: { days?: number; benchmark?: string }) =>
    fetchAPI<PortfolioBenchmark>(
      `/portfolio/benchmark?days=${params?.days ?? 60}&benchmark=${encodeURIComponent(params?.benchmark ?? '000300')}`,
      { timeoutMs: 40000 },
    ),
}
