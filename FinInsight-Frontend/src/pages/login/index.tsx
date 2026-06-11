import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'

import { getCurrentUser, login } from '../../api'

import './index.scss'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (user) {
        void Taro.reLaunch({ url: user.role === 'admin' ? '/pages/admin/index' : '/pages/index/index' })
      }
    })
  }, [])

  const handleLogin = async () => {
    if (!username.trim() || password.length < 8 || submitting) return
    setSubmitting(true)
    try {
      const user = await login(username.trim(), password)
      void Taro.reLaunch({ url: user.role === 'admin' ? '/pages/admin/index' : '/pages/index/index' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='loginPage'>
      <View className='loginGrid' />
      <View className='loginPanel'>
        <Text className='loginBrand'>FinInsight 智汇金融</Text>
        <Text className='loginLabel'>PRIVATE POLICY INTELLIGENCE</Text>
        <View className='loginForm'>
          <input
            className='loginInput'
            value={username}
            placeholder='用户名'
            onChange={(event) => setUsername(event.currentTarget.value)}
          />
          <input
            className='loginInput'
            value={password}
            type='password'
            placeholder='密码'
            onChange={(event) => setPassword(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleLogin()
            }}
          />
          <Button
            className={`loginButton ${username.trim() && password.length >= 8 ? 'loginButtonReady' : ''}`}
            disabled={!username.trim() || password.length < 8 || submitting}
            loading={submitting}
            onClick={handleLogin}
          >
            登录
          </Button>
        </View>
      </View>
    </View>
  )
}
