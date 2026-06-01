'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase'

const POSITION_FIELDS: Record<string, { key: string; label: string; snapshot?: boolean }[]> = {
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
    { key: 'comparative_biz_mtg_count', label: '比較BizMTG件数' },
    { key: 'x_dm_count', label: 'X-DM送付数' },
    { key: 'x_post_count', label: 'X投稿数' },
    { key: 'x_follower_count', label: 'Xフォロワー数', snapshot: true },
    { key: 'task_count', label: '対応タスク数' },
  ],
  admin: [],
}

export default function DailyReportPage() {
  const [profile, setProfile] = useState<any>(null)
  const [formData, setFormData] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [monthlyTotals, setMonthlyTotals] = useState<Record<string, number>>({})
  const [targets, setTargets] = useState<Record<string, number>>({})
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      setProfile({ ...prof, authId: user.id })

      const { data: existing } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('user_id', user.id)
        .eq('report_date', today)
        .single()

      if (existing) {
        const fields = POSITION_FIELDS[prof?.position ?? ''] ?? []
        const data: Record<string, number> = {}
        fields.forEach(f => { data[f.key] = existing[f.key] ?? 0 })
        setFormData(data)
        setNotes(existing.notes ?? '')
        setSubmitted(true)
      }

      // 月次累計を取得
      const firstDay = `${currentMonth}-01`
      const { data: monthlyData } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('user_id', user.id)
        .gte('report_date', firstDay)
        .order('report_date', { ascending: false })

      if (monthlyData) {
        const fields = POSITION_FIELDS[prof?.position ?? ''] ?? []
        const totals: Record<string, number> = {}
        fields.forEach(field => {
          if (field.snapshot) {
            totals[field.key] = monthlyData[0]?.[field.key] ?? 0
          } else {
            totals[field.key] = monthlyData.reduce((sum: number, row: any) => sum + (row[field.key] ?? 0), 0)
          }
        })
        setMonthlyTotals(totals)
      }

      // 目標値を取得
      const { data: targetData } = await supabase
        .from('kpi_targets')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', currentMonth)

      if (targetData) {
        const t: Record<string, number> = {}
        targetData.forEach((row: any) => { t[row.metric_name] = row.target_value })
        setTargets(t)
      }
    }
    init()
  }, [])

  const handleSubmit = async () => {
    if (!profile) return
    setLoading(true)
    const { error } = await supabase
      .from('daily_reports')
      .upsert({
        user_id: profile.authId,
        report_date: today,
        ...formData,
        notes
      }, { onConflict: 'user_id,report_date' })
    if (!error) setSubmitted(true)
    setLoading(false)
  }

  const fields = POSITION_FIELDS[profile?.position ?? ''] ?? []

  const exceededCount = fields.filter(f => {
    const target = targets[f.key]
    if (!target) return false
    return monthlyTotals[f.key] >= target
  }).length

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">日報</h1>
          <button onClick={() => router.push('/')} className="text-base text-gray-400 hover:text-black">
            ← 戻る
          </button>
        </div>

        {profile?.position === 'admin' ? (
          <p className="text-base text-gray-400">管理者は日報の入力不要です</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* 左：今日の入力 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-base font-extrabold mb-4">{today}　本日の報告</h2>
              {fields.map(field => (
                <div key={field.key} className="mb-4">
                  <label className="block text-base font-extrabold mb-1">{field.label}</label>
                  <input
                    type="number"
                    min="0"
                    value={formData[field.key] ?? 0}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      [field.key]: parseInt(e.target.value) || 0
                    }))}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-base text-gray-900"
                  />
                </div>
              ))}
              <div className="mb-4">
                <label className="block text-base font-extrabold mb-1">コメント</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-base text-gray-900"
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-black text-white py-3 rounded text-base font-extrabold hover:bg-gray-800 disabled:opacity-50"
              >
                {submitted ? '更新する' : '提出する'}
              </button>
              {submitted && (
                <p className="text-center text-base text-green-600 mt-3 font-extrabold">提出済み ✓</p>
              )}
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
                    <div key={field.key} className="border-b border-gray-100 pb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-extrabold">{field.label}</span>
                        {exceeded && (
                          <span className="text-sm text-green-600 font-extrabold">✓ +¥5,000</span>
                        )}
                      </div>
                      <div className="flex gap-4 mt-1 text-base text-gray-500">
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
              {exceededCount > 0 && (
                <div className="mt-4 p-3 bg-black text-white rounded-lg text-center">
                  <p className="text-base font-extrabold">
                    インセンティブ ¥{(exceededCount * 5000).toLocaleString()}
                  </p>
                  <p className="text-sm">{exceededCount}項目達成</p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}