import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'

import { ArticleItem, getArticles, syncArticles } from '../../api'
import { setCurrentArticle } from '../../store/article'

import './index.scss'

const PAGE_SIZE = 15
const LAST_SYNC_DATE_KEY = 'fininsight:last-sync-date'

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

function getScoreLevel(score: number, evaluated = true): string {
  if (!evaluated) {
    return 'unevaluated'
  }
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

function getRiskLabel(score: number, evaluated = true): string {
  if (!evaluated) {
    return '未评估'
  }
  if (score >= 8) {
    return '高冲击'
  }
  if (score >= 5) {
    return '中性观察'
  }
  return '低波动'
}

export default function IndexPage() {
  const [articles, setArticles] = useState<ArticleItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [syncing, setSyncing] = useState<boolean>(false)
  const [syncPulse, setSyncPulse] = useState<boolean>(false)
  const [leaving, setLeaving] = useState<boolean>(false)
  const [lastSyncDate, setLastSyncDate] = useState<string>(() => {
    try {
      return Taro.getStorageSync(LAST_SYNC_DATE_KEY) || ''
    } catch {
      return ''
    }
  })

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

  const dashboard = useMemo(() => {
    const evaluatedArticles = articles.filter((article) => article.status === 'parsed')
    const scores = evaluatedArticles.map((article) => Math.max(0, Math.min(10, article.interpretation.impact_score || 0)))
    const totalScore = scores.reduce((sum, score) => sum + score, 0)
    const highCount = scores.filter((score) => score >= 8).length
    const mediumCount = scores.filter((score) => score >= 5 && score < 8).length
    const lowCount = Math.max(0, evaluatedArticles.length - highCount - mediumCount)
    const parsedCount = evaluatedArticles.length
    const pendingCount = Math.max(0, articles.length - parsedCount)
    const sourceCounts = new Map<string, number>()
    const keywordCounts = new Map<string, number>()

    articles.forEach((article) => {
      const source = article.source || '未知来源'
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1)
      article.interpretation.keywords.forEach((keyword) => {
        keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1)
      })
    })

    return {
      avgScore: evaluatedArticles.length > 0 ? totalScore / evaluatedArticles.length : 0,
      highCount,
      mediumCount,
      lowCount,
      pendingCount,
      parsedCount,
      parsedRatio: articles.length > 0 ? Math.round((parsedCount / articles.length) * 100) : 0,
      sourceCount: sourceCounts.size,
      latestDate: lastSyncDate || '等待同步',
      sourceLeaders: Array.from(sourceCounts.entries()).sort((left, right) => right[1] - left[1]).slice(0, 4),
      topKeywords: Array.from(keywordCounts.entries()).sort((left, right) => right[1] - left[1]).slice(0, 10),
      riskBuckets: [
        { className: 'riskHigh', count: highCount, label: '高冲击' },
        { className: 'riskMedium', count: mediumCount, label: '观察区' },
        { className: 'riskLow', count: lowCount, label: '低波动' },
        { className: 'riskUnevaluated', count: pendingCount, label: '未评估' }
      ],
      qualityRows: [
        { label: '解析覆盖', value: `${articles.length > 0 ? Math.round((parsedCount / articles.length) * 100) : 0}%` },
        { label: '来源数量', value: `${sourceCounts.size}` },
        { label: '待解析', value: `${Math.max(0, articles.length - parsedCount)}` }
      ]
    }
  }, [articles, lastSyncDate])

  const handleSync = async () => {
    setSyncing(true)
    Taro.showLoading({
      title: '同步中'
    })

    try {
      const result = await syncArticles()
      const syncedDate = formatDate(new Date().toISOString())
      setArticles(result.articles)
      setLastSyncDate(syncedDate)
      Taro.setStorageSync(LAST_SYNC_DATE_KEY, syncedDate)
      Taro.showToast({
        title: `已抓取 ${result.processed_count} 条今日热点`,
        icon: 'success'
      })
      setSyncPulse(true)
      setTimeout(() => setSyncPulse(false), 680)
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
    setLeaving(true)
    setTimeout(() => {
      void Taro.reLaunch({
        url: `/pages/detail/index?id=${encodeURIComponent(article.id)}`
      }).catch(() => {
        setLeaving(false)
      })
    }, 180)
  }

  return (
    <View className={`page ${leaving ? 'pageLeaving' : ''}`}>
      <View className='ambient ambientOne' />
      <View className='ambient ambientTwo' />
      <View className='ambient ambientThree' />

      <View className='pageShell'>
        <View className='console'>
          <View className='header'>
            <View className='headerMeta'>
              <Text className='title'>FinInsight 智汇金融</Text>
            </View>
            <Text className='subtitle'>政策资讯与智能结构化解读</Text>
            <View className='headerStats'>
              <View className='headerStat'>
                <Text className='headerStatLabel'>风险均值</Text>
                <Text className='headerStatValue'>{dashboard.parsedCount > 0 ? dashboard.avgScore.toFixed(1) : '未评估'}</Text>
              </View>
              <View className='headerStat'>
                <Text className='headerStatLabel'>解析覆盖</Text>
                <Text className='headerStatValue'>{dashboard.parsedRatio}%</Text>
              </View>
              <View className='headerStat'>
                <Text className='headerStatLabel'>来源数量</Text>
                <Text className='headerStatValue'>{dashboard.sourceCount}</Text>
              </View>
            </View>
            <View className='tickerTape'>
              <Text className='tickerItem'>最新 {dashboard.latestDate}</Text>
            </View>
          </View>

          <View className='actionBar'>
            <Button
              className={`syncButton ${syncing ? 'syncButtonSyncing' : ''} ${syncPulse ? 'syncButtonPulse' : ''}`}
              disabled={syncing}
              onClick={handleSync}
            >
              <View className='syncButtonShimmer' />
              <View className='syncButtonInner'>
                <View className='syncOrb'>
                  {syncing && <View className='syncSpinner' />}
                </View>
                <Text className='syncButtonText'>{syncing ? '同步中' : '同步今日热点'}</Text>
              </View>
            </Button>
            <View className='syncTelemetry'>
              <Text className='syncTelemetryItem'>样本 {articles.length}</Text>
              <Text className='syncTelemetryItem'>已解析 {dashboard.parsedCount}</Text>
              <Text className='syncTelemetryItem'>待观察 {dashboard.pendingCount}</Text>
            </View>
          </View>
        </View>

        <View className='dashboardGrid'>
          <View className='sourceBoard'>
            <View className='boardHeader'>
              <Text className='boardTitle'>来源权重</Text>
            </View>
            {dashboard.sourceLeaders.length > 0 ? (
              dashboard.sourceLeaders.map(([source, count]) => (
                <View className='sourceRow' key={source}>
                  <Text className='sourceName'>{source}</Text>
                  <View className='sourceTrack'>
                    <View
                      className='sourceFill'
                      style={{ width: `${Math.max(12, Math.round((count / Math.max(articles.length, 1)) * 100))}%` }}
                    />
                  </View>
                  <Text className='sourceCount'>{count}</Text>
                </View>
              ))
            ) : (
              <Text className='boardEmpty'>等待同步数据</Text>
            )}
          </View>
          <View className='riskBoard'>
            <View className='boardHeader'>
              <Text className='boardTitle'>风险分层</Text>
            </View>
            <View className='riskStack'>
              {dashboard.riskBuckets.map((bucket) => (
                <View className='riskRow' key={bucket.label}>
                  <View className={`riskDot ${bucket.className}`} />
                  <Text className='riskName'>{bucket.label}</Text>
                  <View className='riskTrack'>
                    <View
                      className={`riskFill ${bucket.className}`}
                      style={{ width: `${articles.length > 0 ? Math.max(8, Math.round((bucket.count / articles.length) * 100)) : 0}%` }}
                    />
                  </View>
                  <Text className='riskCount'>{bucket.count}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className='keywordBoard'>
            <View className='boardHeader'>
              <Text className='boardTitle'>关键词热区</Text>
            </View>
            <View className='keywordCloud'>
              {dashboard.topKeywords.length > 0 ? (
                dashboard.topKeywords.map(([keyword, count]) => (
                  <Text className='hotKeyword' key={keyword}>
                    {keyword} ×{count}
                  </Text>
                ))
              ) : (
                <Text className='boardEmpty'>暂无关键词</Text>
              )}
            </View>
          </View>
          <View className='qualityBoard'>
            <View className='boardHeader'>
              <Text className='boardTitle'>数据质量</Text>
            </View>
            <View className='qualityRows'>
              {dashboard.qualityRows.map((row) => (
                <View className='qualityRow' key={row.label}>
                  <Text className='qualityLabel'>{row.label}</Text>
                  <Text className='qualityValue'>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View className='sectionHeader'>
          <Text className='sectionTitle'>政策流</Text>
          <Text className='sectionMeta'>政策信号队列</Text>
        </View>

        <View className='list'>
          {loading ? (
            <View className='skeletonList'>
              {[0, 1, 2].map((item) => (
                <View className='skeletonCard' key={item}>
                  <View className='skeletonLine skeletonTitle' />
                  <View className='skeletonLine skeletonText' />
                  <View className='skeletonMeta'>
                    <View className='skeletonChip' />
                    <View className='skeletonDate' />
                  </View>
                </View>
              ))}
            </View>
          ) : articles.length === 0 ? (
            <View className='empty'>
              <Text className='emptyTitle'>暂无历史政策资讯</Text>
              <Text className='emptyDesc'>点击“同步今日热点”抓取并保存最新数据</Text>
            </View>
          ) : (
            articles.map((article, index) => {
              const score = Math.max(0, Math.min(10, article.interpretation.impact_score || 0))
              const evaluated = article.status === 'parsed'
              const scoreLevel = getScoreLevel(score, evaluated)
              const staggerStyle = {
                '--stagger-index': Math.min(index, 4),
                '--score-width': `${evaluated ? score * 10 : 0}%`
              } as CSSProperties
              const articleKeywords = article.interpretation.keywords.slice(0, 3)

              return (
                <View
                  className={`card score-${scoreLevel}`}
                  key={article.id || article.url}
                  style={staggerStyle}
                  onClick={() => openDetail(article)}
                >
                  <View className='cardGlow' />
                  <View className='cardTop'>
                    <Text className='cardTitle'>{article.title}</Text>
                    <View className={`scorePill scorePill-${scoreLevel}`}>
                      <View className='scoreAura' />
                      <Text className='scoreValue'>{evaluated ? score : 0}</Text>
                    </View>
                  </View>
                  <View className='cardTelemetry'>
                    <Text className={`riskBadge riskBadge-${scoreLevel}`}>{getRiskLabel(score, evaluated)}</Text>
                    <Text className='statusBadge'>{evaluated ? '已解析' : '待解析'}</Text>
                  </View>
                  <View className='scoreTrack'>
                    <View className={`scoreTrackFill scoreTrackFill-${scoreLevel}`} />
                  </View>
                  <View className='cardKeywordRow'>
                    {articleKeywords.length > 0 ? (
                      articleKeywords.map((keyword) => (
                        <Text className='cardKeyword' key={keyword}>
                          {keyword}
                        </Text>
                      ))
                    ) : (
                      <Text className='cardKeyword mutedKeyword'>等待标签</Text>
                    )}
                  </View>
                  <View className='metaRow'>
                    <Text className={`sourceBadge ${getSourceClass(article.source)}`}>
                      {article.source || '未知来源'}
                    </Text>
                    <Text className='metaDate'>{formatDate(article.publish_date)}</Text>
                  </View>
                  <Text className='cardArrow'>›</Text>
                </View>
              )
            })
          )}
        </View>
      </View>
    </View>
  )
}
