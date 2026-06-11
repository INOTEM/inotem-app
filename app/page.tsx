// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase'

const ACTIONS = ['出勤', '離席', '戻り', '退勤']

const ALLOWED_ACTIONS = {
  '未出勤': ['出勤'],
  '出勤': ['離席', '退勤'],
  '戻り': ['離席', '退勤'],
  '離席': ['戻り'],
  '退勤': [],
}

const STATUS_COLORS = {
  '未出勤': 'bg-gray-300',
  '出勤': 'bg-green-400',
  '戻り': 'bg-green-400',
  '離席': 'bg-yellow-400',
  '退勤': 'bg-gray-900',
}

const TZ = 'Asia/Tokyo'
// JST基準の "YYYY-MM-DD"
const jstDateStr = (d = new Date()) =>
  new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
// JSTのその日0時をUTC ISO文字列で（クエリ境界用）
const jstDayStartISO = (d = new Date()) =>
  new Date(jstDateStr(d) + 'T00:00:00+09:00').toISOString()
// JSTの当月1日0時をUTC ISO文字列で
const jstMonthStartISO = (d = new Date()) => {
  const [y, m] = jstDateStr(d).split('-')
  return new Date(`${y}-${m}-01T00:00:00+09:00`).toISOString()
}

const getWeekStart = () => {
  // JST基準で当該週の月曜日を返す
  const jst = new Date(Date.now() + 9 * 3600 * 1000)
  const day = jst.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  jst.setUTCDate(jst.getUTCDate() + diff)
  return jst.toISOString().slice(0, 10)
}

const calcDailyHours = (dayLogs) => {
  const sorted = [...dayLogs].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  let clockIn = null, clockOut = null, breakMs = 0, breakStart = null
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
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('未出勤')
  const [todayLogs, setTodayLogs] = useState([])
  const [monthlyLogs, setMonthlyLogs] = useState([])
  const [teamStatus, setTeamStatus] = useState([])
  const [loading, setLoading] = useState(false)
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const [weeklySubmitted, setWeeklySubmitted] = useState(false)
  const [userPosition, setUserPosition] = useState('')
  const [blockError, setBlockError] = useState(null)
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
        .from('staff_profiles').select('position').eq('user_id', user.id).single()
      if (prof) setUserPosition(prof.position)

      const todayStr = jstDateStr()
      const { data: report } = await supabase
        .from('daily_reports').select('id')
        .eq('user_id', user.id).eq('report_date', todayStr).single()
      if (report) setReportSubmitted(true)

      const { data: weekly } = await supabase
        .from('weekly_reflections').select('id')
        .eq('user_id', user.id).eq('week_start', getWeekStart()).single()
      if (weekly) setWeeklySubmitted(true)
    }
    getUser()
  }, [])

  const fetchTodayLogs = async (userId) => {
    const { data } = await supabase
      .from('attendance_logs').select('*')
      .eq('user_id', userId).gte('created_at', jstDayStartISO())
      .order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setTodayLogs(data)
      setStatus(data[data.length - 1].action)
    }
  }

  const fetchMonthlyLogs = async (userId) => {
    const { data } = await supabase
      .from('attendance_logs').select('*')
      .eq('user_id', userId).gte('created_at', jstMonthStartISO())
      .order('created_at', { ascending: true })
    if (data) setMonthlyLogs(data)
  }

  const fetchTeamStatus = async () => {
    const { data: staff } = await supabase.from('staff_profiles').select('user_id, name')
    const { data: logs } = await supabase
      .from('attendance_logs').select('user_id, action, created_at')
      .gte('created_at', jstDayStartISO()).order('created_at', { ascending: false })
    if (staff && logs) {
      setTeamStatus(staff.map(member => ({
        name: member.name,
        status: logs.find(l => l.user_id === member.user_id)?.action ?? '未出勤'
      })))
    }
  }

  const handleAction = async (action) => {
    if (!user) return

    setBlockError(null)

    // 退勤前チェック（管理者は対象外）
    if (action === '退勤' && userPosition !== 'admin') {
      if (!reportSubmitted) {
        setBlockError({
          message: '退勤前に日報を提出してください',
          label: '日報を提出する',
          route: '/daily-report',
        })
        return
      }
      // 金曜は週報の提出も必須
      if (new Date(Date.now() + 9 * 3600 * 1000).getUTCDay() === 5 && !weeklySubmitted) {
        setBlockError({
          message: '退勤前に週次振り返りを提出してください',
          label: '週報を提出する',
          route: '/weekly-report',
        })
        return
      }
    }

    setLoading(true)
    const { error } = await supabase.from('attendance_logs').insert({ user_id: user.id, action })
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

  const groupedByDate = monthlyLogs.reduce((acc, log) => {
    const date = new Date(log.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: TZ })
    if (!acc[date]) acc[date] = []
    acc[date].push(log)
    return acc
  }, {})

  const totalHours = Object.values(groupedByDate)
    .map(logs => calcDailyHours(logs)?.hours ?? 0)
    .reduce((a, b) => a + b, 0)

  const jstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const jstWeekday = jstNow.getUTCDay()   // 0=日 .. 5=金
  const jstMonth = jstNow.getUTCMonth() + 1

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">INOTEM APP</h1>
          <div className="flex gap-2">
            {userPosition === 'admin' && (
              <button
                onClick={() => router.push('/admin')}
                className="text-base bg-black text-white px-3 py-1 rounded border border-black hover:bg-white hover:text-black transition-colors"
              >
                管理
              </button>
            )}
            <button
              onClick={() => router.push('/daily-report')}
              className="text-base bg-black text-white px-3 py-1 rounded border border-black hover:bg-white hover:text-black transition-colors"
            >
              報告
            </button>
            {jstWeekday === 5 && (
              <button
                onClick={() => router.push('/weekly-report')}
                className="text-base bg-black text-white px-3 py-1 rounded border border-black hover:bg-white hover:text-black transition-colors"
              >
                週報
              </button>
            )}
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
            <div className="grid grid-cols-2 gap-3 mb-4">
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
            {blockError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-base text-red-600 font-extrabold">{blockError.message}</p>
                <button
                  onClick={() => router.push(blockError.route)}
                  className="text-sm text-red-500 underline mt-1"
                >
                  {blockError.label}
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
                      {new Date(log.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-extrabold">{jstMonth}月の勤務表</h2>
              <span className="text-base font-extrabold">合計 {totalHours.toFixed(2)}h</span>
            </div>
            {Object.keys(groupedByDate).length === 0 ? (
              <p className="text-gray-400 text-base">データがありません</p>
            ) : (
              Object.entries(groupedByDate).map(([date, logs]) => {
                const result = calcDailyHours(logs)
                const timeStr = result
                  ? result.clockIn.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
                    + ' - '
                    + result.clockOut.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
                  : '-'
                return (
                  <div key={date} className="flex justify-between text-base py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-500">{date}</span>
                    <span>{timeStr}</span>
                    <span className="font-extrabold">{result ? result.hours.toFixed(2) + 'h' : '-'}</span>
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
                <div className={['w-3 h-3 rounded-full flex-shrink-0', STATUS_COLORS[member.status] ?? 'bg-gray-300'].join(' ')} />
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