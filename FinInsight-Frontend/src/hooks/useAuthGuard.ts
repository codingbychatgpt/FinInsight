import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'

import { CurrentUser, getCurrentUser } from '../api'

export function useAuthGuard(role: 'user' | 'admin') {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    getCurrentUser().then((currentUser) => {
      if (!active) return
      if (!currentUser) {
        void Taro.reLaunch({ url: '/pages/login/index' })
        return
      }
      if (currentUser.role !== role) {
        void Taro.reLaunch({
          url: currentUser.role === 'admin' ? '/pages/admin/index' : '/pages/index/index'
        })
        return
      }
      setUser(currentUser)
      setChecking(false)
    })
    return () => {
      active = false
    }
  }, [role])

  return { user, checking }
}
