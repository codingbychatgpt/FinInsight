import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'

import { analyzeArticle, ArticleItem } from '../../api'
import { getCurrentArticle, setCurrentArticle } from '../../store/article'

import './index.scss'

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

function getRiskLabel(score: number): string {
  if (score >= 8) {
    return '高冲击'
  }
  if (score >= 5) {
    return '重点观察'
  }
  return '低波动'
}

export default function DetailPage() {
  const [analyzing, setAnalyzing] = useState<boolean>(false)
  const [article, setArticle] = useState<ArticleItem | null>(() => getCurrentArticle())

  const goHome = () => {
    Taro.reLaunch({
      url: '/pages/index/index'
    })
  }

  if (!article) {
    return (
      <View className='detailPage'>
        <View className='empty'>
          <Text>未找到文章数据，请返回列表重新进入</Text>
          <Button className='homeButton' onClick={goHome}>返回主页</Button>
        </View>
      </View>
    )
  }

  const score = Math.max(0, Math.min(10, article.interpretation.impact_score))
  const scoreDeg = `${score * 36}deg`
  const scoreLevel = getScoreLevel(score)
  const hasAnalyzed = article.status === 'parsed' && score > 0
  const keywordCount = article.interpretation.keywords.length
  const rawLength = article.raw_content.length
  const bankerLength = article.interpretation.banker_perspective.length
  const publicLength = article.interpretation.public_perspective.length
  const articleCode = String(article.id || article.article_id || 'NA').slice(0, 10)

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const nextArticle = await analyzeArticle(article.id)
      setCurrentArticle(nextArticle)
      setArticle(nextArticle)
      Taro.showToast({
        title: '解析完成',
        icon: 'success'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI解析失败'
      Taro.showToast({
        title: message.includes('aborted') ? '解析超时，请稍后重试' : message,
        icon: 'none'
      })
    } finally {
      setAnalyzing(false)
    }
  }

  const openOriginal = () => {
    if (typeof window !== 'undefined') {
      window.open(article.url, '_blank', 'noopener,noreferrer')
      return
    }

    Taro.setClipboardData({
      data: article.url
    })
  }

  return (
    <View className={`detailPage detailScore-${scoreLevel}`}>
      <View className='detailAmbient detailAmbientOne' />
      <View className='detailAmbient detailAmbientTwo' />

      <View className='detailLayout'>
        <View className='topPanel'>
          <View className='topPanelGlow' />
          <View className='titleBlock'>
            <Text className='source'>
              {article.source} · {formatDate(article.publish_date)}
            </Text>
            <Text className='detailTitle'>{article.title}</Text>
          </View>

          <View className='metaMatrix'>
            <View className='metaCell'>
              <Text className='metaCellLabel'>状态</Text>
              <Text className='metaCellValue'>{article.status || 'pending'}</Text>
            </View>
            <View className='metaCell'>
              <Text className='metaCellLabel'>编号</Text>
              <Text className='metaCellValue'>#{articleCode}</Text>
            </View>
            <View className='metaCell'>
              <Text className='metaCellLabel'>标签</Text>
              <Text className='metaCellValue'>{keywordCount}</Text>
            </View>
            <View className='metaCell'>
              <Text className='metaCellLabel'>原文字符</Text>
              <Text className='metaCellValue'>{rawLength}</Text>
            </View>
          </View>

          <View className='articleMetaPanel'>
            <View
              className={`scoreRing scoreRing-${scoreLevel}`}
              style={{ background: `conic-gradient(var(--score-ring-color) ${scoreDeg}, rgba(148, 163, 184, 0.16) 0deg)` }}
            >
              <View className='scoreInner'>
                <Text className='scoreValue'>{score}</Text>
                <Text className='scoreUnit'>/10</Text>
              </View>
            </View>
            <Text className='scoreCaption'>Impact Dashboard</Text>
            <View className='riskMeter'>
              <View className='riskMeterFill' style={{ width: `${score * 10}%` }} />
            </View>
            <Text className={`riskLabel riskLabel-${scoreLevel}`}>{getRiskLabel(score)}</Text>
          </View>

          <View className='detailActions'>
            <Button className='homeButton' onClick={goHome}>返回主页</Button>
            <Button className='sourceButton' onClick={openOriginal}>查看原文</Button>
          </View>
        </View>

        <View className='detailStream'>
          <View className='terminalStrip'>
            <View className='terminalCell'>
              <Text className='terminalLabel'>SOURCE</Text>
              <Text className='terminalValue'>{article.source || '未知来源'}</Text>
            </View>
            <View className='terminalCell'>
              <Text className='terminalLabel'>PUBLISH DATE</Text>
              <Text className='terminalValue'>{formatDate(article.publish_date)}</Text>
            </View>
            <View className='terminalCell'>
              <Text className='terminalLabel'>RISK LANE</Text>
              <Text className='terminalValue'>{getRiskLabel(score)}</Text>
            </View>
            <View className='terminalCell'>
              <Text className='terminalLabel'>AI STATE</Text>
              <Text className='terminalValue'>{hasAnalyzed ? 'PARSED' : 'PENDING'}</Text>
            </View>
          </View>

          <View className='summaryPanel'>
            <View className='analysisHeader'>
              <Text className='sectionLabel'>AI 解读</Text>
              <Button className='analyzeButton' loading={analyzing} disabled={analyzing} onClick={handleAnalyze}>
                {hasAnalyzed ? '重新解析' : 'AI解析'}
              </Button>
            </View>
            <Text className='sectionLabel'>核心结论</Text>
            <Text className='coreSummary'>{article.interpretation.core_summary}</Text>
          </View>

          <View className='detailSignalGrid'>
            <View className='signalTile signalTileBlue'>
              <Text className='signalLabel'>Public Lens</Text>
              <Text className='signalValue'>{publicLength}</Text>
              <Text className='signalDesc'>大众视角字符密度</Text>
            </View>
            <View className='signalTile signalTileGreen'>
              <Text className='signalLabel'>Banker Lens</Text>
              <Text className='signalValue'>{bankerLength}</Text>
              <Text className='signalDesc'>同业视角字符密度</Text>
            </View>
            <View className='signalTile signalTileAmber'>
              <Text className='signalLabel'>Keyword Depth</Text>
              <Text className='signalValue'>{keywordCount}</Text>
              <Text className='signalDesc'>结构化标签数量</Text>
            </View>
          </View>

          <View className='perspectiveGrid'>
            <View className='publicPanel'>
              <Text className='panelTitle'>大众操作指南</Text>
              <Text className='panelContent'>{article.interpretation.public_perspective}</Text>
            </View>

            <View className='bankerPanel'>
              <Text className='bankerTitle'>银行同业视角</Text>
              <Text className='bankerContent'>{article.interpretation.banker_perspective}</Text>
            </View>
          </View>

          <View className='keywordPanel'>
            <View className='boardHeader'>
              <Text className='boardTitle'>结构化关键词</Text>
              <Text className='boardMeta'>Signal extraction</Text>
            </View>
            <View className='keywords'>
              {article.interpretation.keywords.map((keyword) => (
                <Text className='keyword' key={keyword}>
                  {keyword}
                </Text>
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
