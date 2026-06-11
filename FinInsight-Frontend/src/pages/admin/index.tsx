import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'

import {
  createAdminUser,
  CurrentUser,
  getAdminSummary,
  getAdminUsers,
  logout,
  setAdminUserActive
} from '../../api'
import { useAuthGuard } from '../../hooks/useAuthGuard'

import './index.scss'

export default function AdminPage() {
  const { user, checking } = useAuthGuard('admin')
  const [users, setUsers] = useState<CurrentUser[]>([])
  const [summary, setSummary] = useState({ users: 0, active_users: 0, articles: 0 })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [loading, setLoading] = useState(false)

  const loadAdminData = useCallback(async () => {
    const [nextUsers, nextSummary] = await Promise.all([getAdminUsers(), getAdminSummary()])
    setUsers(nextUsers)
    setSummary(nextSummary)
  }, [])

  useEffect(() => {
    if (!checking) void loadAdminData()
  }, [checking, loadAdminData])

  if (checking) return <View className='adminPage'><Text>验证管理员身份...</Text></View>

  const handleCreate = async () => {
    if (!username.trim() || password.length < 8 || loading) return
    setLoading(true)
    try {
      await createAdminUser(username.trim(), password, role)
      setUsername('')
      setPassword('')
      await loadAdminData()
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    void Taro.reLaunch({ url: '/pages/login/index' })
  }

  return (
    <View className='adminPage'>
      <View className='adminHeader'>
        <View>
          <Text className='adminEyebrow'>FININSIGHT CONTROL PLANE</Text>
          <Text className='adminTitle'>管理后台</Text>
          <Text className='adminIdentity'>管理员：{user?.username}</Text>
        </View>
        <Button className='adminLogout' onClick={handleLogout}>退出登录</Button>
      </View>

      <View className='adminMetrics'>
        <View className='adminMetric'><Text className='metricLabel'>用户总数</Text><Text className='metricValue'>{summary.users}</Text></View>
        <View className='adminMetric'><Text className='metricLabel'>活跃账号</Text><Text className='metricValue'>{summary.active_users}</Text></View>
        <View className='adminMetric'><Text className='metricLabel'>文章数量</Text><Text className='metricValue'>{summary.articles}</Text></View>
      </View>

      <View className='adminGrid'>
        <View className='adminPanel'>
          <Text className='panelTitle'>创建账号</Text>
          <View className='adminForm'>
            <input className='adminInput' value={username} placeholder='用户名' onChange={(e) => setUsername(e.currentTarget.value)} />
            <input className='adminInput' type='password' value={password} placeholder='密码（至少 8 位）' onChange={(e) => setPassword(e.currentTarget.value)} />
            <View className='roleSwitch'>
              <Button className={`roleButton ${role === 'user' ? 'roleActive' : ''}`} onClick={() => setRole('user')}>USER</Button>
              <Button className={`roleButton ${role === 'admin' ? 'roleActive' : ''}`} onClick={() => setRole('admin')}>ADMIN</Button>
            </View>
            <Button className='createButton' loading={loading} onClick={handleCreate}>创建账号</Button>
          </View>
        </View>

        <View className='adminPanel'>
          <Text className='panelTitle'>账号管理</Text>
          <View className='userTable'>
            {users.map((item) => (
              <View className='userRow' key={item.id}>
                <View>
                  <Text className='userName'>{item.username}</Text>
                  <Text className='userRole'>{item.role.toUpperCase()}</Text>
                </View>
                <Button
                  className={`statusButton ${item.is_active ? 'statusActive' : ''}`}
                  onClick={async () => {
                    await setAdminUserActive(item.id, !item.is_active)
                    await loadAdminData()
                  }}
                >
                  {item.is_active ? '已启用' : '已禁用'}
                </Button>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}
