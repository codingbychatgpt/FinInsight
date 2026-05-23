import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'

import { ArticleItem, getArticles, syncArticles } from '../../api'
import { setCurrentArticle } from '../../store/article'

import './index.scss'

const PAGE_SIZE = 15

function formatDate(value: string): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function getScoreLevel(score: number): string {
  if (score >= 8) {
    return 'high'
  }
  if (score >= 5) {
    return 'medium'
  }
  return 'low'
}

function getSourceClass(source: string): string {
  if (source.includes('新浪')) {
    return 'sourceSina'
  }
  if (source.includes('中新')) {
    return 'sourceChinaNews'
  }
  return 'sourceDefault'
}

export default function IndexPage() {
  const [articles, setArticles] = useState<ArticleItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [syncing, setSyncing] = useState<boolean>(false)

  const loadArticles = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getArticles(PAGE_SIZE, 0)
      setArticles(list)
    } catch (error) {
      const message = error instanceof Error ? error.message : '历史数据加载失败'
      Taro.showToast({
        title: message,
        icon: 'none'
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadArticles()
  }, [loadArticles])

  const handleSync = async () => {
    setSyncing(true)
    Taro.showLoading({
      title: '同步中'
    })

    try {
      const result = await syncArticles()
      const list = await getArticles(PAGE_SIZE, 0)
      setArticles(list)
      Taro.showToast({
        title: `已抓取并解析 ${result.processed_count} 条新政策`,
        icon: 'success'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步失败，请稍后重试'
      Taro.showToast({
        title: message.includes('aborted') ? '同步超时，请稍后刷新' : message,
        icon: 'none'
      })
    } finally {
      Taro.hideLoading()
      setSyncing(false)
    }
  }

  const openDetail = (article: ArticleItem) => {
    setCurrentArticle(article)
    Taro.navigateTo({
      url: `/pages/detail/index?id=${encodeURIComponent(article.id)}`
    })
  }

  return (
    <View className='page'>
      <View className='header'>
        <Text className='title'>FinInsight 智汇金融</Text>
        <Text className='subtitle'>政策资讯与 AI 结构化解读</Text>
      </View>

      <View className='actionBar'>
        <Button className='syncButton' loading={syncing} disabled={syncing} onClick={handleSync}>
          同步最新政策
        </Button>
      </View>

      <View className='list'>
        {loading ? (
          <View className='empty'>加载中</View>
        ) : articles.length === 0 ? (
          <View className='empty'>
            <Text className='emptyTitle'>暂无历史政策资讯</Text>
            <Text className='emptyDesc'>点击“同步最新政策”抓取并保存最新数据</Text>
          </View>
        ) : (
          articles.map((article) => {
            const score = Math.max(0, Math.min(10, article.interpretation.impact_score || 0))
            const scoreLevel = getScoreLevel(score)

            return (
              <View
                className={`card score-${scoreLevel}`}
                key={article.id || article.url}
                onClick={() => openDetail(article)}
              >
                <View className='cardTop'>
                  <Text className='cardTitle'>{article.title}</Text>
                  <View className={`scorePill scorePill-${scoreLevel}`}>
                    <Text className='scoreValue'>{score}</Text>
                  </View>
                </View>
                <Text className='summary'>
                  {article.interpretation.core_summary || '已获取资讯，等待 AI 解析。'}
                </Text>
                <View className='metaRow'>
                  <Text className={`sourceBadge ${getSourceClass(article.source)}`}>
                    {article.source || '未知来源'}
                  </Text>
                  <Text className='metaDate'>{formatDate(article.publish_date)}</Text>
                </View>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}
