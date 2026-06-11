// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase'

const getWeekStart = () => {
  // JST基準で当該週の月曜日
  const jst = new Date(Date.now() + 9 * 3600 * 1000)
  const day = jst.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  jst.setUTCDate(jst.getUTCDate() + diff)
  return jst.toISOString().slice(0, 10)
}

const FIELDS = [
  { key: 'went_well', label: '今週うまくいったこと' },
  { key: 'reflection', label: '反省点' },
  { key: 'next_week_goal', label: '来週の目標' },
]

export default function WeeklyReportPage() {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ went_well: '', reflection: '', next_week_goal: '' })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const weekStart = getWeekStart()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data: existing } = await supabase
        .from('weekly_reflections').select('*')
        .eq('user_id', user.id).eq('week_start', weekStart).single()
      if (existing) {
        setForm({
          went_well: existing.went_well ?? '',
          reflection: existing.reflection ?? '',
          next_week_goal: existing.next_week_goal ?? '',
        })
        setSubmitted(true)
      }
    }
    init()
  }, [])

  const handleSubmit = async () => {
    if (!user) return
    setLoading(true)
    setSubmitError('')
    const { error } = await supabase.from('weekly_reflections').upsert({
      user_id: user.id, week_start: weekStart, ...form, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,week_start' })
    if (error) {
      setSubmitError(`保存に失敗しました: ${error.message}`)
    } else {
      setSubmitted(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">週次振り返り</h1>
          <button onClick={() => router.push('/')} className="text-base text-gray-400 hover:text-black">← 戻る</button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-base font-extrabold mb-4">今週の振り返り（{weekStart} の週）</h2>
          {FIELDS.map(field => (
            <div key={field.key} className="mb-4">
              <label className="block text-base font-extrabold mb-1">{field.label}</label>
              <textarea
                value={form[field.key]}
                onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                rows={3}
                className="w-full border border-gray-200 rounded px-3 py-2 text-base text-gray-900"
              />
            </div>
          ))}
          <button
            onClick={handleSubmit} disabled={loading}
            className="w-full bg-black text-white py-2 rounded text-base font-extrabold hover:bg-gray-800 disabled:opacity-50"
          >
            {submitted ? '更新する' : '提出する'}
          </button>
          {submitted && !submitError && <p className="text-center text-green-600 mt-2 font-extrabold text-base">提出済み ✓</p>}
          {submitError && <p className="text-center text-red-500 mt-2 font-extrabold text-sm">{submitError}</p>}
        </div>
      </div>
    </div>
  )
}
