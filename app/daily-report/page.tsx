// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { createClient } from '@/utils/supabase'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const POSITION_FIELDS = {
  sales: [
    { key: 'attack_count', label: 'アタック数' },
    { key: 'mtg_count', label: 'MTG確定数' },
    { key: 'x_dm_count', label: 'X-DM数' },
    { key: 'x_follower_count', label: 'Xフォロワー数', snapshot: true },
  ],
  designer: [
    { key: 'attack_count', label: 'アタック数' },
    { key: 'mtg_count', label: 'MTG確定数' },
    { key: 'design_delivery_count', label: 'デザイン納品件数' },
  ],
  pm: [
    { key: 'comparative_biz_mtg_count', label: 'MTG件数' },
    { key: 'x_dm_count', label: 'X-DM送付数' },
    { key: 'x_post_count', label: 'X投稿数' },
    { key: 'x_follower_count', label: 'Xフォロワー数', snapshot: true },
    { key: 'task_count', label: '対応タスク数' },
  ],
  admin: [],
}

const CHART_COLORS = {
  attack_count: '#1D9E75',
  mtg_count: '#7F77DD',
  x_dm_count: '#378ADD',
  design_delivery_count: '#D85A30',
  comparative_biz_mtg_count: '#1D9E75',
  x_post_count: '#BA7517',
  task_count: '#D4537E',
}

const getWeekStart = () => {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}

const calcTotals = (data, fields) => {
  const totals = {}
  fields.forEach(field => {
    if (field.snapshot) {
      const sorted = [...data].sort((a, b) => b.report_date.localeCompare(a.report_date))
      totals[field.key] = sorted[0]?.[field.key] ?? 0
    } else {
      totals[field.key] = data.reduce((sum, row) => sum + (row[field.key] ?? 0), 0)
    }
  })
  return totals
}

export default function DailyReportPage() {
  const [profile, setProfile] = useState(null)
  const [formData, setFormData] = useState({})
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [weeklyTotals, setWeeklyTotals] = useState({})
  const [monthlyTotals, setMonthlyTotals] = useState({})
  const [targets, setTargets] = useState({})
  const [halfYearData, setHalfYearData] = useState({})
  const [selectedMetric, setSelectedMetric] = useState(null)
  const router = useRouter()
  const supabase = createClient()

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('staff_profiles').select('*').eq('user_id', user.id).single()
      setProfile({ ...prof, authId: user.id })

      const fields = POSITION_FIELDS[prof?.position ?? ''] ?? []
      const chartFields = fields.filter(f => !f.snapshot)
      if (chartFields.length > 0) setSelectedMetric(chartFields[0].key)

      const { data: existing } = await supabase
        .from('daily_reports').select('*')
        .eq('user_id', user.id).eq('report_date', today).single()
      if (existing) {
        const d = {}
        fields.forEach(f => { d[f.key] = existing[f.key] ?? 0 })
        setFormData(d)
        setNotes(existing.notes ?? '')
        setSubmitted(true)
      }

      const { data: targetData } = await supabase
        .from('kpi_targets').select('*')
        .eq('user_id', user.id).eq('month', currentMonth)
      if (targetData) {
        const t = {}
        targetData.forEach(row => { t[row.metric_name] = row.target_value })
        setTargets(t)
      }

      const { data: weekData } = await supabase
        .from('daily_reports').select('*')
        .eq('user_id', user.id).gte('report_date', getWeekStart())
      if (weekData) setWeeklyTotals(calcTotals(weekData, fields))

      const { data: monthData } = await supabase
        .from('daily_reports').select('*')
        .eq('user_id', user.id).gte('report_date', `${currentMonth}-01`)
        .order('report_date', { ascending: false })
      if (monthData) setMonthlyTotals(calcTotals(monthData, fields))

      const sixAgo = new Date()
      sixAgo.setMonth(sixAgo.getMonth() - 5)
      const startMonth = `${sixAgo.getFullYear()}-${String(sixAgo.getMonth() + 1).padStart(2, '0')}-01`
      const { data: halfData } = await supabase
        .from('daily_reports').select('*')
        .eq('user_id', user.id).gte('report_date', startMonth)
      if (halfData) {
        const byMonth = {}
        halfData.forEach(row => {
          const m = row.report_date.substring(0, 7)
          if (!byMonth[m]) byMonth[m] = {}
          fields.filter(f => !f.snapshot).forEach(f => {
            byMonth[m][f.key] = (byMonth[m][f.key] ?? 0) + (row[f.key] ?? 0)
          })
        })
        setHalfYearData(byMonth)
      }
    }
    init()
  }, [])

  const handleSubmit = async () => {
    if (!profile) return
    setLoading(true)
    setSubmitError('')
    const { error } = await supabase.from('daily_reports').upsert({
      user_id: profile.authId, report_date: today, ...formData, notes
    }, { onConflict: 'user_id,report_date' })
    if (error) {
      setSubmitError(`保存に失敗しました: ${error.message}`)
    } else {
      setSubmitted(true)
    }
    setLoading(false)
  }

  const fields = POSITION_FIELDS[profile?.position ?? ''] ?? []
  const chartFields = fields.filter(f => !f.snapshot)
  const weeklyTarget = (key) => targets[key] ? Math.round(targets[key] / 4) : null
  const monthlyExceeded = fields.filter(f => targets[f.key] && monthlyTotals[f.key] >= targets[f.key]).length
  const sortedMonths = Object.keys(halfYearData).sort()
  const selectedField = chartFields.find(f => f.key === selectedMetric)
  const color = CHART_COLORS[selectedMetric] ?? '#1D9E75'

  const chartData = {
    labels: sortedMonths.map(m => `${parseInt(m.split('-')[1])}月`),
    datasets: [{
      label: selectedField?.label ?? '',
      data: sortedMonths.map(m => halfYearData[m]?.[selectedMetric] ?? 0),
      backgroundColor: color + '33',
      borderColor: color,
      borderWidth: 1.5,
      borderRadius: 4,
    }]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 11 } }, beginAtZero: true }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">日報</h1>
          <button onClick={() => router.push('/')} className="text-base text-gray-400 hover:text-black">← 戻る</button>
        </div>

        {profile?.position === 'admin' ? (
          <p className="text-base text-gray-400">管理者は日報の入力不要です</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

              {/* 左：日報入力 */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-base font-extrabold mb-4">本日の報告　{today}</h2>
                {fields.map(field => (
                  <div key={field.key} className="mb-3">
                    <label className="block text-base font-extrabold mb-1">{field.label}</label>
                    <input
                      type="number" min="0"
                      value={formData[field.key] ?? 0}
                      onChange={e => setFormData(prev => ({ ...prev, [field.key]: parseInt(e.target.value) || 0 }))}
                      className="w-full border border-gray-200 rounded px-3 py-2 text-base text-gray-900"
                    />
                  </div>
                ))}
                <div className="mb-3">
                  <label className="block text-base font-extrabold mb-1">コメント</label>
                  <textarea
                    value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-base text-gray-900"
                  />
                </div>
                <button
                  onClick={handleSubmit} disabled={loading}
                  className="w-full bg-black text-white py-2 rounded text-base font-extrabold hover:bg-gray-800 disabled:opacity-50"
                >
                  {submitted ? '更新する' : '提出する'}
                </button>
                {submitted && !submitError && <p className="text-center text-green-600 mt-2 font-extrabold text-base">提出済み ✓</p>}
                {submitError && <p className="text-center text-red-500 mt-2 font-extrabold text-sm">{submitError}</p>}
              </div>

              {/* 中：週次進捗 */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-base font-extrabold mb-4">今週の進捗</h2>
                <div className="space-y-3">
                  {fields.map(field => {
                    const total = weeklyTotals[field.key] ?? 0
                    const target = weeklyTarget(field.key)
                    const diff = target != null ? total - target : null
                    return (
                      <div key={field.key} className="border-b border-gray-100 pb-2">
                        <div className="flex justify-between">
                          <span className="text-base font-extrabold">{field.label}</span>
                          {diff != null && diff >= 0 && <span className="text-sm text-green-600 font-extrabold">✓</span>}
                        </div>
                        <div className="flex gap-3 text-base text-gray-500 mt-1">
                          <span>累計 <span className="text-black font-extrabold">{total}</span></span>
                          <span>目標 <span className="text-black font-extrabold">{target ?? '—'}</span></span>
                          {diff != null && (
                            <span className={diff >= 0 ? 'text-green-600 font-extrabold' : 'text-red-500 font-extrabold'}>
                              {diff >= 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 右：月次進捗 */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-base font-extrabold mb-4">{now.getMonth() + 1}月の進捗</h2>
                <div className="space-y-3">
                  {fields.map(field => {
                    const total = monthlyTotals[field.key] ?? 0
                    const target = targets[field.key]
                    const diff = target != null ? total - target : null
                    const exceeded = diff != null && diff >= 0
                    return (
                      <div key={field.key} className="border-b border-gray-100 pb-2">
                        <div className="flex justify-between">
                          <span className="text-base font-extrabold">{field.label}</span>
                          {exceeded && <span className="text-sm text-green-600 font-extrabold">✓ +¥5,000</span>}
                        </div>
                        <div className="flex gap-3 text-base text-gray-500 mt-1">
                          <span>累計 <span className="text-black font-extrabold">{total}</span></span>
                          <span>目標 <span className="text-black font-extrabold">{target ?? '未設定'}</span></span>
                          {diff != null && (
                            <span className={diff >= 0 ? 'text-green-600 font-extrabold' : 'text-red-500 font-extrabold'}>
                              {diff >= 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {monthlyExceeded > 0 && (
                  <div className="mt-4 p-3 bg-black text-white rounded-lg text-center">
                    <p className="text-base font-extrabold">インセンティブ ¥{(monthlyExceeded * 5000).toLocaleString()}</p>
                    <p className="text-sm">{monthlyExceeded}項目達成</p>
                  </div>
                )}
              </div>
            </div>

            {/* 半年実績 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-base font-extrabold mb-3">半年の実績</h2>
              {sortedMonths.length === 0 ? (
                <p className="text-base text-gray-400">データがありません</p>
              ) : (
                <>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {chartFields.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setSelectedMetric(f.key)}
                        className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                          selectedMetric === f.key
                            ? 'bg-black text-white border-black'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="h-36 mb-4">
                    <Bar data={chartData} options={chartOptions} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-base">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 font-extrabold">月</th>
                          {chartFields.map(f => (
                            <th key={f.key} className="text-right py-2 font-extrabold">{f.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMonths.map(month => (
                          <tr key={month} className="border-b border-gray-100">
                            <td className="py-2 text-gray-500">{month}</td>
                            {chartFields.map(f => (
                              <td key={f.key} className="text-right py-2 font-extrabold">
                                {halfYearData[month]?.[f.key] ?? 0}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}