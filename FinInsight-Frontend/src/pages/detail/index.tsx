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

function splitRawContent(content: string): string[] {
  return content
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export default function DetailPage() {
  const [expanded, setExpanded] = useState<boolean>(false)
  const [analyzing, setAnalyzing] = useState<boolean>(false)
  const [article, setArticle] = useState<ArticleItem | null>(() => getCurrentArticle())

  if (!article) {
    return (
      <View className='detailPage'>
        <View className='empty'>未找到文章数据，请返回列表重新进入</View>
      </View>
    )
  }

  const score = Math.max(0, Math.min(10, article.interpretation.impact_score))
  const scoreDeg = `${score * 36}deg`
  const hasAnalyzed = article.status === 'parsed' && score > 0
  const rawParagraphs = splitRawContent(article.raw_content)

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
    <View className='detailPage'>
      <View className='topPanel'>
        <View className='titleBlock'>
          <Text className='source'>
            {article.source} · {formatDate(article.publish_date)}
          </Text>
          <Text className='detailTitle'>{article.title}</Text>
        </View>

        <View className='articleMetaPanel'>
          <View className='scoreRing' style={{ background: `conic-gradient(#1A56DB ${scoreDeg}, #E5E7EB 0deg)` }}>
            <View className='scoreInner'>
              <Text className='scoreValue'>{score}</Text>
              <Text className='scoreUnit'>/10</Text>
            </View>
          </View>
          <Button className='sourceButton' onClick={openOriginal}>查看原文</Button>
        </View>

        <View className='sourcePanel'>
          <Text className='sourceLabel'>新闻原文</Text>
          <Text className='sourceUrl'>{article.url}</Text>
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

      <View className='publicPanel'>
        <Text className='panelTitle'>大众操作指南</Text>
        <Text className='panelContent'>{article.interpretation.public_perspective}</Text>
      </View>

      <View className='bankerPanel'>
        <Text className='bankerTitle'>银行同业视角</Text>
        <Text className='bankerContent'>{article.interpretation.banker_perspective}</Text>
      </View>

      <View className='keywords'>
        {article.interpretation.keywords.map((keyword) => (
          <Text className='keyword' key={keyword}>
            {keyword}
          </Text>
        ))}
      </View>

      <View className='rawSection'>
        <View className='rawHeader' onClick={() => setExpanded((value) => !value)}>
          <Text className='rawTitle'>原始政策文本</Text>
          <Text className='rawToggle'>{expanded ? '收起' : '展开'}</Text>
        </View>
        {expanded && (
          <View className='rawContent'>
            {rawParagraphs.map((paragraph, index) => (
              <Text className='rawParagraph' key={`${index}-${paragraph.slice(0, 12)}`}>
                {paragraph}
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
