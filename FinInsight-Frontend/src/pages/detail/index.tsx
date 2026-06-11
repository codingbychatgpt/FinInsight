import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'

import { analyzeArticle, askArticleQuestion, ArticleItem, getArticle } from '../../api'
import { getCurrentArticle, setCurrentArticle } from '../../store/article'

import './index.scss'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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

function getRiskLabel(score: number, evaluated = true): string {
  if (!evaluated) {
    return '未评估'
  }
  if (score >= 8) {
    return '高冲击'
  }
  if (score >= 5) {
    return '重点观察'
  }
  return '低波动'
}

function renderPerspectiveContent(content: string, active: boolean) {
  const lead = content.slice(0, 1)
  const rest = content.slice(1)

  return (
    <Text className={active ? 'panelContent' : 'bankerContent'}>
      {lead ? <Text className={`leadChar ${active ? 'leadCharActive' : 'leadCharMuted'}`}>{lead}</Text> : null}
      {rest}
    </Text>
  )
}

function isAnalysisFailed(article: ArticleItem): boolean {
  return (
    article.status === 'failed' ||
    article.interpretation.core_summary === '解析失败' ||
    article.interpretation.keywords.includes('解析失败')
  )
}

export default function DetailPage() {
  const [analyzing, setAnalyzing] = useState<boolean>(false)
  const [article, setArticle] = useState<ArticleItem | null>(() => getCurrentArticle())
  const [leaving, setLeaving] = useState<boolean>(false)
  const [activePerspective, setActivePerspective] = useState<'public' | 'banker'>('public')
  const [chatQuestion, setChatQuestion] = useState<string>('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [asking, setAsking] = useState<boolean>(false)
  const [loadingArticle, setLoadingArticle] = useState<boolean>(() => getCurrentArticle() === null)

  useEffect(() => {
    if (article) {
      setLoadingArticle(false)
      return
    }

    const articleId = Taro.getCurrentInstance().router?.params?.id
    if (!articleId) {
      setLoadingArticle(false)
      return
    }

    let active = true
    getArticle(articleId)
      .then((loadedArticle) => {
        if (!active) {
          return
        }
        setCurrentArticle(loadedArticle)
        setArticle(loadedArticle)
      })
      .catch(() => {
        if (active) {
          Taro.showToast({
            title: '文章加载失败，请返回主页重试',
            icon: 'none'
          })
        }
      })
      .finally(() => {
        if (active) {
          setLoadingArticle(false)
        }
      })

    return () => {
      active = false
    }
  }, [article])

  const goHome = () => {
    Taro.reLaunch({
      url: '/pages/index/index'
    })
  }

  const goBack = () => {
    setLeaving(true)
    setTimeout(() => {
      goHome()
    }, 180)
  }

  if (!article) {
    return (
      <View className={`detailPage ${leaving ? 'detailPageLeaving' : ''}`}>
        <Button className='backButton' onClick={goBack}>&lt; 返回</Button>
        <View className='empty'>
          <Text>{loadingArticle ? '正在加载文章...' : '未找到文章数据，请返回列表重新进入'}</Text>
        </View>
      </View>
    )
  }

  const score = Math.max(0, Math.min(10, article.interpretation.impact_score))
  const evaluated = article.status === 'parsed'
  const scoreDeg = `${evaluated ? score * 36 : 0}deg`
  const scoreLevel = getScoreLevel(score, evaluated)

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const nextArticle = await analyzeArticle(article.id)
      setCurrentArticle(nextArticle)
      setArticle(nextArticle)
      if (isAnalysisFailed(nextArticle)) {
        Taro.showToast({
          title: '解析失败，请检查模型 API 或网络',
          icon: 'none'
        })
        return
      }

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

  const handleAskQuestion = async () => {
    const question = chatQuestion.trim()
    if (!question || asking) {
      return
    }

    setChatMessages((messages) => [
      ...messages,
      {
        id: createMessageId(),
        role: 'user',
        content: question
      }
    ])
    setChatQuestion('')
    setAsking(true)

    try {
      const answer = await askArticleQuestion(article.id, question)
      setChatMessages((messages) => [
        ...messages,
        {
          id: createMessageId(),
          role: 'assistant',
          content: answer || '暂时没有生成有效回答，请稍后重试。'
        }
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI问答失败'
      setChatMessages((messages) => [
        ...messages,
        {
          id: createMessageId(),
          role: 'assistant',
          content: message.includes('aborted') ? 'AI问答超时，请换一个更具体的问题后重试。' : 'AI问答暂不可用，请稍后重试。'
        }
      ])
    } finally {
      setAsking(false)
    }
  }

  return (
    <View className={`detailPage detailScore-${scoreLevel} ${leaving ? 'detailPageLeaving' : ''}`}>
      <View className='detailAmbient detailAmbientOne' />
      <View className='detailAmbient detailAmbientTwo' />
      <Button className='backButton' onClick={goBack}>&lt; 返回</Button>

      <View className='detailLayout'>
        <View className='topPanel'>
          <View className='topPanelGlow' />
          <View className='titleBlock'>
            <Text className='source'>
              {article.source} · {formatDate(article.publish_date)}
            </Text>
            <Text className='detailTitle'>{article.title}</Text>
          </View>

          <View className='articleMetaPanel'>
            <View
              className={`scoreRing scoreRing-${scoreLevel}`}
              style={{ background: `conic-gradient(var(--score-ring-color) ${scoreDeg}, rgba(148, 163, 184, 0.16) 0deg)` }}
            >
              <View className='scoreInner'>
                <Text className={`scoreValue ${evaluated ? '' : 'scorePendingText'}`}>{evaluated ? score : '未评估'}</Text>
                {evaluated && <Text className='scoreUnit'>/10</Text>}
              </View>
            </View>
            <Text className='scoreCaption'>风险评估</Text>
            <View className='riskMeter'>
              <View className='riskMeterFill' style={{ width: `${evaluated ? score * 10 : 0}%` }} />
            </View>
            <Text className={`riskLabel riskLabel-${scoreLevel}`}>{getRiskLabel(score, evaluated)}</Text>
          </View>

          <View className='detailActions'>
            <Button className='sourceButton' onClick={openOriginal}>查看原文</Button>
          </View>
        </View>

        <View className='detailStream'>
          <View className='terminalStrip'>
            <View className='terminalCell'>
              <Text className='terminalLabel'>来源</Text>
              <Text className='terminalValue'>{article.source || '未知来源'}</Text>
            </View>
            <View className='terminalCell'>
              <Text className='terminalLabel'>发布日期</Text>
              <Text className='terminalValue'>{formatDate(article.publish_date)}</Text>
            </View>
            <View className='terminalCell'>
              <Text className='terminalLabel'>风险状态</Text>
              <Text className='terminalValue'>{getRiskLabel(score, evaluated)}</Text>
            </View>
            <View className='terminalCell'>
              <Text className='terminalLabel'>解析状态</Text>
              <Text className='terminalValue'>{evaluated ? '已解析' : '待解析'}</Text>
            </View>
          </View>

          <View className='summaryPanel'>
            <View className='analysisHeader'>
              <Text className='sectionLabel'>AI解读</Text>
              <Button className='analyzeButton' loading={analyzing} disabled={analyzing} onClick={handleAnalyze}>
                {evaluated ? '重新解析' : 'AI解析'}
              </Button>
            </View>
            <Text className='sectionLabel'>核心结论</Text>
            <Text className='coreSummary'>{article.interpretation.core_summary}</Text>
          </View>

          <View className='perspectiveGrid'>
            <View
              className={`perspectivePanel ${activePerspective === 'public' ? 'publicPanel' : 'bankerPanel'}`}
              onClick={() => setActivePerspective('public')}
            >
              <Text className={activePerspective === 'public' ? 'panelTitle' : 'bankerTitle'}>大众操作指南</Text>
              {renderPerspectiveContent(article.interpretation.public_perspective, activePerspective === 'public')}
            </View>

            <View
              className={`perspectivePanel ${activePerspective === 'banker' ? 'publicPanel' : 'bankerPanel'}`}
              onClick={() => setActivePerspective('banker')}
            >
              <Text className={activePerspective === 'banker' ? 'panelTitle' : 'bankerTitle'}>银行同业视角</Text>
              {renderPerspectiveContent(article.interpretation.banker_perspective, activePerspective === 'banker')}
            </View>
          </View>

          <View className='keywordPanel'>
            <View className='boardHeader'>
              <Text className='boardTitle'>结构化关键词</Text>
            </View>
            <View className='keywords'>
              {article.interpretation.keywords.map((keyword) => (
                <Text className='keyword' key={keyword}>
                  {keyword}
                </Text>
              ))}
            </View>
          </View>

          <View className='chatPanel'>
            <View className='chatHeader'>
              <View className='chatTitleBlock'>
                <Text className='chatTitle'>AI助手</Text>
              </View>
              <Text className='chatStatus'>{asking ? '生成中' : '基于当前新闻'}</Text>
            </View>

            <View className='chatMessages'>
              {chatMessages.length === 0 ? (
                <View className='chatEmptyState'>
                  <Text className='chatEmptyTitle'>围绕这篇新闻继续追问</Text>
                  <Text className='chatEmptyText'>例如：这条政策对银行理财有什么影响？普通投资者需要注意什么风险？</Text>
                </View>
              ) : (
                chatMessages.map((message) => (
                  <View className={`chatMessage chatMessage-${message.role}`} key={message.id}>
                    <Text className='chatRole'>{message.role === 'user' ? '你' : 'AI'}</Text>
                    <Text className='chatBubbleText'>{message.content}</Text>
                  </View>
                ))
              )}
              {asking && (
                <View className='chatMessage chatMessage-assistant chatMessageLoading'>
                  <Text className='chatRole'>AI</Text>
                  <Text className='chatBubbleText'>正在结合当前新闻和AI解读生成回答...</Text>
                </View>
              )}
            </View>

            <View className='chatComposer'>
              <input
                type='text'
                className='chatInputNative'
                value={chatQuestion}
                disabled={asking}
                placeholder='输入你想追问的问题'
                onChange={(event) => setChatQuestion(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleAskQuestion()
                  }
                }}
              />
              <Button
                className={`chatSendButton ${chatQuestion.trim() ? 'chatSendButtonReady' : 'chatSendButtonIdle'}`}
                disabled={asking || !chatQuestion.trim()}
                loading={asking}
                onClick={handleAskQuestion}
              >
                发送
              </Button>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
