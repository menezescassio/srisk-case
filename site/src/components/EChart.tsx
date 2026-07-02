import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
])

/** Shared defaults: recessive grid, mono numerals, dark tooltip. */
export const CHART_TEXT = {
  fontFamily: "'Spline Sans Mono', ui-monospace, monospace",
  color: '#6d7681',
  fontSize: 11,
}

export const TOOLTIP_STYLE = {
  backgroundColor: '#1b2128',
  borderColor: '#39434f',
  textStyle: { color: '#e8e4dc', fontSize: 12 },
  extraCssText: 'box-shadow: 0 10px 30px rgba(0,0,0,.45); border-radius: 8px;',
}

interface Props {
  option: EChartsCoreOption
  height?: number
  onClick?: (params: unknown) => void
}

export function EChart({ option, height = 300, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chart.current = echarts.init(ref.current)
    const obs = new ResizeObserver(() => chart.current?.resize())
    obs.observe(ref.current)
    return () => {
      obs.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  useEffect(() => {
    const c = chart.current
    if (!c || !onClick) return
    c.on('click', onClick)
    return () => {
      c.off('click', onClick)
    }
  }, [onClick])

  return <div ref={ref} style={{ width: '100%', height }} />
}
