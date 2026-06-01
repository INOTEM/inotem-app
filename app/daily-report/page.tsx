'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase'

const POSITION_FIELDS: Record<string, { key: string; label: string }[]> = {
  sales: [
    { key: 'attack_count', label: 'アタック数' },
    { key: 'mtg_count', label: 'MTG確定数' },
    { key: 'x_dm_count', label: 'X-DM数' },
    { key: 'x_follower_count', label: 'Xフォロワー数' },
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
    { key: 'x_follower_count', label: 'Xフォロワー数' },
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
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split('T')[0]

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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-sm mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">日報</h1>
          <button
            onClick={() => router.push('/')}
            className="text-base text-gray-400 hover:text-black"
          >
            ← 戻る
          </button>
        </div>

        <p className="text-base text-gray-500 mb-6">{today}</p>

        {profile?.position === 'admin' ? (
          <p className="text-base text-gray-400">管理者は日報の入力不要です</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {fields.map(field => (
              <div key={field.key} className="mb-4">
                <label className="block text-base font-extrabold mb-1">
                  {field.label}
                </label>
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
              <p className="text-center text-base text-green-600 mt-3 font-extrabold">
                提出済み ✓
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}