// @ts-nocheck 
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase'

const ACTIONS = ['出勤', '離席', '戻り', '退勤']

const ALLOWED_ACTIONS: Record<string, string[]> = {
  '未出勤': ['出勤'],
  '出勤': ['離席', '退勤'],
  '戻り': ['離席', '退勤'],
  '離席': ['戻り'],
  '退勤': [],
}

const STATUS_COLORS: Record<string, string> = {
  '未出勤': 'bg-gray-300',
  '出勤': 'bg-green-400',
  '戻り': 'bg-green-400',
  '離席': 'bg-yellow-400',
  '退勤': 'bg-gray-900',
}

const calcDailyHours = (dayLogs: any[]) => {
  const sorted = [...dayLogs].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  let clockIn: Date | null = null
  let clockOut: Date | null = null
  let breakMs = 0
  let breakStart: Date | null = null
  for (const log of sorted) {
    const ts = new Date(log.created_at)
    if (log.action === '出勤') clockIn = ts
    else if (log.action === '離席') breakStart = ts
    else if (log.action === '戻り' && breakStart) {
      breakMs += ts.getTime() - breakStart.getTime()
      breakStart = null
    }
    else if (log.action === '退勤') clockOut = ts
  }
  if (!clockIn || !clockOut) return null
  return {
    clockIn,
    clockOut,
    hours: (clockOut.getTime() - clockIn.getTime() - breakMs) / 3600000
  }
}

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [status, setStatus] = useState('未出勤')
  const [todayLogs, setTodayLogs] = useState<any[]>([])
  const [monthlyLogs, setMonthlyLogs] = useState<any[]>([])
  const [teamStatus, setTeamStatus] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const [userPosition, setUserPosition] = useState('')
  const [reportError, setReportError] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      fetchTodayLogs(user.id)
      fetchMonthlyLogs(user.id)
      fetchTeamStatus()
      const { data: prof } = await supabase
      .from('staff_profiles')
      .select('position')
      .eq('user_id', user.id)
      .single()
      if (prof) setUserPosition(prof.position)

      const todayStr = new Date().toISOString().split('T')[0]
      const { data: report } = await supabase
      .from('daily_reports')
      .select('id')
      .eq('user_id', user.id)
      .eq('report_date', todayStr)
      .single()
      if (report) setReportSubmitted(true)
    }
    getUser()
  }, [])

  const fetchTodayLogs = async (userId: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setTodayLogs(data)
      setStatus(data[data.length - 1].action)
    }
  }

  const fetchMonthlyLogs = async (userId: string) => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', firstDay.toISOString())
      .order('created_at', { ascending: true })
    if (data) setMonthlyLogs(data)
  }

  const fetchTeamStatus = async () => {
    const { data: staff } = await supabase
      .from('staff_profiles')
      .select('user_id, name')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('user_id, action, created_at')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
    if (staff && logs) {
      const result = staff.map(member => {
        const latest = logs.find(l => l.user_id === member.user_id)
        return { name: member.name, status: latest?.action ?? '未出勤' }
      })
      setTeamStatus(result)
    }
  }

  const handleAction = async (action: string) => {
    if (!user) return
    if (action === '退勤' && userPosition !== 'admin' && !reportSubmitted) {
      setReportError(true)
      setLoading(false)
      return
    }
    setReportError(false)
    setLoading(true)
    const { error } = await supabase
      .from('attendance_logs')
      .insert({ user_id: user.id, action })
    if (!error) {
      setStatus(action)
      fetchTodayLogs(user.id)
      fetchMonthlyLogs(user.id)
      fetchTeamStatus()
    }
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const groupedByDate = monthlyLogs.reduce((acc: Record<string, any[]>, log) => {
    const date = new Date(log.created_at).toLocaleDateString('ja-JP', {
      month: 'numeric', day: 'numeric'
    })
    if (!acc[date]) acc[date] = []
    acc[date].push(log)
    return acc
  }, {} as Record<string, any[]>)

  const totalHours = Object.values(groupedByDate)
    .map(logs => calcDailyHours(logs)?.hours ?? 0)
    .reduce((a, b) => a + b, 0)

  const now = new Date()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">INOTEM APP</h1>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/daily-report')}
              className="text-base bg-black text-white px-3 py-1 rounded border border-black hover:bg-white hover:text-black transition-colors"
            >
              報告
            </button>
            <button
              onClick={handleLogout}
              className="text-base bg-black text-white px-3 py-1 rounded border border-black hover:bg-white hover:text-black transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-gray-500 text-base mb-4">
              ステータス: <span className="font-extrabold text-black">{status}</span>
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {ACTIONS.map(action => (
                <button
                  key={action}
                  onClick={() => handleAction(action)}
                  disabled={loading || !ALLOWED_ACTIONS[status]?.includes(action)}
                  className="bg-white border border-gray-200 rounded-lg py-4 text-base font-extrabold hover:bg-black hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {action}
                </button>
              ))}
            </div>
            {reportError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
                <p className="text-base text-red-600 font-extrabold">退勤前に日報を提出してください</p>
                <button
                  onClick={() => router.push('/daily-report')}
                  className="text-sm text-red-500 underline mt-1"
                >
                  日報を提出する →
                </button>
              </div>
            )}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-base font-extrabold mb-3">本日のログ</h2>
              {todayLogs.length === 0 ? (
                <p className="text-gray-400 text-base">まだ打刻がありません</p>
              ) : (
                todayLogs.map((log, i) => (
                  <div key={i} className="flex justify-between text-base py-1 border-b border-gray-100 last:border-0">
                    <span>{log.action}</span>
                    <span className="text-gray-400">
                      {new Date(log.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-extrabold">{now.getMonth() + 1}月の勤務表</h2>
              <span className="text-base font-extrabold">合計 {totalHours.toFixed(2)}h</span>
            </div>
            {Object.keys(groupedByDate).length === 0 ? (
              <p className="text-gray-400 text-base">データがありません</p>
            ) : (
              Object.entries(groupedByDate).map(([date, logs]) => {
                const result = calcDailyHours(logs)
                return (
                  <div key={date} className="flex justify-between text-base py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-500">{date}</span>
                    <span>
                      {result
                        ? `${result.clockIn.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${result.clockOut.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                        : '—'}
                    </span>
                    <span className="font-extrabold">
                      {result ? `${result.hours.toFixed(2)}h` : '—'}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-base font-extrabold mb-4">チームの状況</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {teamStatus.map((member, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${STATUS_COLORS[member.status] ?? 'bg-gray-300'}`} />
                <div>
                  <p className="text-base font-extrabold">{member.name}</p>
                  <p className="text-sm text-gray-400">{member.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}