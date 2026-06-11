import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'

import {
  confirmImport,
  getArticle,
  ImportPreview,
  previewImport,
  searchWeb,
  WebSearchResult
} from '../../api'
import { useAuthGuard } from '../../hooks/useAuthGuard'
import { setCurrentArticle } from '../../store/article'

import './index.scss'

export default function ImportPage() {
  const { checking } = useAuthGuard('user')
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [results, setResults] = useState<WebSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [method, setMethod] = useState<'url_import' | 'web_search'>('url_import')

  if (checking) return <View className='importPage'><Text className='importLoading'>验证登录状态...</Text></View>

  const loadPreview = async (targetUrl: string, nextMethod: 'url_import' | 'web_search') => {
    if (!targetUrl.trim() || loading) return
    setLoading(true)
    try {
      const nextPreview = await previewImport(targetUrl.trim())
      if (nextPreview.existing_article_id) {
        Taro.showToast({ title: '该文章已存在，正在打开', icon: 'none' })
        const article = await getArticle(nextPreview.existing_article_id)
        setCurrentArticle(article)
        void Taro.reLaunch({ url: `/pages/detail/index?id=${encodeURIComponent(article.id)}` })
        return
      }
      setPreview(nextPreview)
      setMethod(nextMethod)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (query.trim().length < 2 || loading) return
    setLoading(true)
    try {
      setResults(await searchWeb(query.trim()))
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview || loading) return
    setLoading(true)
    try {
      const result = await confirmImport(preview, method)
      setCurrentArticle(result.article)
      Taro.showToast({ title: result.created ? '导入成功' : '文章已存在', icon: 'success' })
      void Taro.reLaunch({ url: `/pages/detail/index?id=${encodeURIComponent(result.article.id)}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='importPage'>
      <View className='importTopbar'>
        <Button className='topbarButton' onClick={() => Taro.reLaunch({ url: '/pages/index/index' })}>&lt; 返回主页</Button>
        <Text className='importTitle'>信息发现与导入</Text>
      </View>

      <View className='importWorkspace'>
        <View className='importColumn'>
          <Text className='panelLabel'>URL IMPORT</Text>
          <Text className='panelTitle'>导入新闻链接</Text>
          <View className='inlineComposer'>
            <input className='workspaceInput' value={url} placeholder='https://...' onChange={(e) => setUrl(e.currentTarget.value)} />
            <Button className='workspaceButton' loading={loading} onClick={() => loadPreview(url, 'url_import')}>抓取预览</Button>
          </View>
        </View>

        <View className='importColumn'>
          <Text className='panelLabel'>WEB SEARCH</Text>
          <Text className='panelTitle'>网络搜索</Text>
          <View className='inlineComposer'>
            <input className='workspaceInput' value={query} placeholder='输入政策或财经关键词' onChange={(e) => setQuery(e.currentTarget.value)} />
            <Button className='workspaceButton' loading={loading} onClick={handleSearch}>搜索</Button>
          </View>
          <View className='searchResults'>
            {results.map((result) => (
              <View className='searchResult' key={result.url} onClick={() => loadPreview(result.url, 'web_search')}>
                <Text className='resultTitle'>{result.title}</Text>
                <Text className='resultSummary'>{result.summary || result.url}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {preview && (
        <View className='previewPanel'>
          <View className='previewHeader'>
            <View>
              <Text className='panelLabel'>IMPORT PREVIEW</Text>
              <Text className='panelTitle'>确认导入内容</Text>
            </View>
            <Button className='confirmButton' loading={loading} onClick={handleConfirm}>确认入库</Button>
          </View>
          <View className='previewFields'>
            <input className='previewInput' value={preview.title} onChange={(e) => setPreview({ ...preview, title: e.currentTarget.value })} />
            <input className='previewInput' value={preview.source} onChange={(e) => setPreview({ ...preview, source: e.currentTarget.value })} />
            <input className='previewInput' value={preview.publish_date} onChange={(e) => setPreview({ ...preview, publish_date: e.currentTarget.value })} />
          </View>
          <textarea className='previewContent' value={preview.raw_content} onChange={(e) => setPreview({ ...preview, raw_content: e.currentTarget.value })} />
        </View>
      )}
    </View>
  )
}
