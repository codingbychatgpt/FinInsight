import Taro from '@tarojs/taro'

export interface AIInterpretation {
  id?: string
  core_summary: string
  banker_perspective: string
  public_perspective: string
  impact_score: number
  keywords: string[]
}

export interface ArticleItem {
  id: string
  article_id?: string
  title: string
  source: string
  publish_date: string
  raw_content: string
  url: string
  status?: 'pending' | 'parsed' | 'failed'
  interpretation: AIInterpretation
}

export interface ArticleListResponse {
  articles: ArticleItem[]
}

export interface SyncArticleItem {
  article_id: string
  title: string
  url: string
  source: string
  impact_score: number
  keywords: string[]
}

export interface SyncResult {
  candidate_count?: number
  attempted_count?: number
  processed_count: number
  skipped_count?: number
  articles: SyncArticleItem[]
  failed_count?: number
  failed_articles?: Array<{
    title: string
    url: string
    reason: string
  }>
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'

function getBaseUrl(): string {
  return process.env.TARO_APP_API_BASE_URL || DEFAULT_BASE_URL
}

async function request<T>(options: Taro.request.Option): Promise<T> {
  try {
    const response = await Taro.request({
      timeout: 15000,
      ...options,
      url: `${getBaseUrl()}${options.url}`,
      header: {
        'content-type': 'application/json',
        ...options.header
      }
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Request failed with status ${response.statusCode}`)
    }

    return response.data as T
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    Taro.showToast({
      title: message,
      icon: 'none'
    })
    throw error
  }
}

function normalizeArticle(item: Partial<ArticleItem> & Record<string, any>): ArticleItem {
  const interpretation = item.interpretation || item.ai_interpretation || item

  return {
    id: String(item.id || item.article_id || ''),
    article_id: item.article_id,
    title: String(item.title || ''),
    source: String(item.source || ''),
    publish_date: String(item.publish_date || ''),
    raw_content: String(item.raw_content || ''),
    url: String(item.url || ''),
    status: item.status,
    interpretation: {
      id: interpretation.id,
      core_summary: String(interpretation.core_summary || ''),
      banker_perspective: String(interpretation.banker_perspective || ''),
      public_perspective: String(interpretation.public_perspective || ''),
      impact_score: Number(interpretation.impact_score || 0),
      keywords: Array.isArray(interpretation.keywords) ? interpretation.keywords : []
    }
  }
}

export async function getArticles(limit = 15, offset = 0): Promise<ArticleItem[]> {
  const data = await request<ArticleItem[] | ArticleListResponse>({
    url: `/api/v1/articles?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
    method: 'GET'
  })

  const list = Array.isArray(data) ? data : data.articles
  return list.map((item) => normalizeArticle(item))
}

export async function syncArticles(): Promise<SyncResult> {
  const data = await request<SyncResult>({
    url: '/api/v1/sync',
    method: 'POST',
    timeout: 180000
  })

  return {
    processed_count: data.processed_count,
    skipped_count: data.skipped_count,
    failed_count: data.failed_count,
    failed_articles: data.failed_articles,
    articles: data.articles || []
  }
}

export const triggerSync = syncArticles

export async function analyzeArticle(articleId: string): Promise<ArticleItem> {
  const data = await request<ArticleItem>({
    url: `/api/v1/articles/${encodeURIComponent(articleId)}/analyze`,
    method: 'POST',
    timeout: 30000
  })

  return normalizeArticle(data)
}
