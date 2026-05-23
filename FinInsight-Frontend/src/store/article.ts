import type { ArticleItem } from '../api'

let currentArticle: ArticleItem | null = null

export function setCurrentArticle(article: ArticleItem): void {
  currentArticle = article
}

export function getCurrentArticle(): ArticleItem | null {
  return currentArticle
}
