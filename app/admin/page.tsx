// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase'

const POSITION_FIELDS = {
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

export default function AdminPage() {
  const [tab, setTab] = useState('staff')
  const [staffList, setStaffList] = useState([])
  const [editData, setEditData] = useState({})
  const [kpiMonth, setKpiMonth] = useState('')
  const [kpiData, setKpiData] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase
        .from('staff_profiles').select('position').eq('user_id', user.id).single()
      if (prof?.position !== 'admin') { router.push('/'); return }
      setKpiMonth(defaultMonth)
      fetchStaff()
      fetchKpiTargets(defaultMonth)
    }
    init()
  }, [])

  const fetchStaff = async () => {
    const { data } = await supabase.from('staff_profiles').select('*').order('name')
    if (data) {
      setStaffList(data)
      const ed = {}
      data.forEach(s => {
        ed[s.user_id] = {
          hourly_rate: s.hourly_rate ?? 0,
          dependents: s.dependents ?? 0,
          position: s.position ?? '',
          is_active: s.is_active ?? true,
        }
      })
      setEditData(ed)
    }
  }

  const fetchKpiTargets = async (month) => {
    const { data } = await supabase.from('kpi_targets').select('*').eq('month', month)
    if (data) {
      const kd = {}
      data.forEach(row => {
        if (!kd[row.user_id]) kd[row.user_id] = {}
        kd[row.user_id][row.metric_name] = row.target_value
      })
      setKpiData(kd)
    }
  }

  const saveStaff = async () => {
    setSaving(true)
    for (const [userId, data] of Object.entries(editData)) {
      await supabase.from('staff_profiles').update(data).eq('user_id', userId)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const saveKpi = async () => {
    setSaving(true)
    const upserts = []
    staffList.filter(s => s.position !== 'admin').forEach(staff => {
      const fields = POSITION_FIELDS[staff.position] ?? []
      fields.forEach(field => {
        const val = kpiData[staff.user_id]?.[field.key]
        if (val !== undefined && val !== '') {
          upserts.push({
            user_id: staff.user_id,
            month: kpiMonth,
            metric_name: field.key,
            target_value: parseInt(val) || 0,
          })
        }
      })
    })
    if (upserts.length > 0) {
      await supabase.from('kpi_targets')
        .upsert(upserts, { onConflict: 'user_id,month,metric_name' })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const nonAdminStaff = staffList.filter(s => s.position !== 'admin')

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">管理</h1>
          <button onClick={() => router.push('/')} className="text-base text-gray-400 hover:text-black">← 戻る</button>
        </div>

        <div className="flex gap-2 mb-6">
          {['staff', 'kpi'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-base px-4 py-2 rounded font-extrabold border transition-colors ${tab === t ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
            >
              {t === 'staff' ? 'スタッフ管理' : 'KPI目標設定'}
            </button>
          ))}
        </div>

        {tab === 'staff' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="space-y-4">
              {staffList.map(staff => (
                <div key={staff.user_id} className="border-b border-gray-100 pb-4 last:border-0">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-base font-extrabold">{staff.name}</p>
                    <span className={`text-sm px-2 py-0.5 rounded-full border ${editData[staff.user_id]?.is_active ? 'border-green-400 text-green-600' : 'border-gray-300 text-gray-400'}`}>
                      {editData[staff.user_id]?.is_active ? '在籍中' : '退職'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">役職</label>
                      <select
                        value={editData[staff.user_id]?.position ?? ''}
                        onChange={e => setEditData(prev => ({ ...prev, [staff.user_id]: { ...prev[staff.user_id], position: e.target.value } }))}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-base text-gray-900"
                      >
                        <option value="admin">代表</option>
                        <option value="sales">セールス</option>
                        <option value="designer">デザイナー</option>
                        <option value="pm">PM</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">時給（円）</label>
                      <input type="number"
                        value={editData[staff.user_id]?.hourly_rate ?? 0}
                        onChange={e => setEditData(prev => ({ ...prev, [staff.user_id]: { ...prev[staff.user_id], hourly_rate: parseInt(e.target.value) || 0 } }))}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-base text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">扶養人数</label>
                      <input type="number" min="0"
                        value={editData[staff.user_id]?.dependents ?? 0}
                        onChange={e => setEditData(prev => ({ ...prev, [staff.user_id]: { ...prev[staff.user_id], dependents: parseInt(e.target.value) || 0 } }))}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-base text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">ステータス</label>
                      <select
                        value={editData[staff.user_id]?.is_active ? 'true' : 'false'}
                        onChange={e => setEditData(prev => ({ ...prev, [staff.user_id]: { ...prev[staff.user_id], is_active: e.target.value === 'true' } }))}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-base text-gray-900"
                      >
                        <option value="true">在籍中</option>
                        <option value="false">退職</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={saveStaff} disabled={saving}
                className="bg-black text-white px-6 py-2 rounded text-base font-extrabold hover:bg-gray-800 disabled:opacity-50"
              >
                {saved ? '保存しました ✓' : saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        )}

        {tab === 'kpi' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <label className="text-base font-extrabold">対象月</label>
              <input type="month" value={kpiMonth}
                onChange={e => { setKpiMonth(e.target.value); fetchKpiTargets(e.target.value) }}
                className="border border-gray-200 rounded px-3 py-1.5 text-base text-gray-900"
              />
            </div>
            <div className="space-y-4">
              {nonAdminStaff.map(staff => {
                const fields = POSITION_FIELDS[staff.position] ?? []
                return (
                  <div key={staff.user_id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-base font-extrabold mb-3">{staff.name}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {fields.map(field => (
                        <div key={field.key}>
                          <label className="block text-sm text-gray-500 mb-1">{field.label}</label>
                          <input type="number" min="0" placeholder="目標値"
                            value={kpiData[staff.user_id]?.[field.key] ?? ''}
                            onChange={e => setKpiData(prev => ({
                              ...prev,
                              [staff.user_id]: { ...prev[staff.user_id], [field.key]: e.target.value }
                            }))}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-base text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={saveKpi} disabled={saving}
                className="bg-black text-white px-6 py-2 rounded text-base font-extrabold hover:bg-gray-800 disabled:opacity-50"
              >
                {saved ? '保存しました ✓' : saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}