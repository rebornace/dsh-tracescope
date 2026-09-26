/**
 * Yunxiao catalog routes: list organizations, projects, workitem types,
 * members and workitems for the tracker/agile panels.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  isMaskedSecret,
  loadRememberedYunxiaoAccess,
  loadTrackerConfig,
  listYunxiaoMembers,
  listYunxiaoOrganizations,
  listYunxiaoProjects,
  listYunxiaoWorkitems,
  listYunxiaoWorkitemTypes,
} from '@rebornace/tracescope-core'

export function registerYunxiaoCatalogRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/yunxiao-catalog',
    method: 'POST',
    run: async (body) => {
      const action = String(body.action ?? '')
      const existing = await loadTrackerConfig()
      const remembered = await loadRememberedYunxiaoAccess()
      const endpoint =
        typeof body.endpoint === 'string' && body.endpoint.trim()
          ? body.endpoint.trim()
          : existing.yunxiao?.endpoint || remembered.endpoint || 'https://openapi-rdc.aliyuncs.com'
      const tokenRaw = typeof body.token === 'string' ? body.token.trim() : ''
      const token = !isMaskedSecret(tokenRaw) ? tokenRaw : remembered.token
      if (!token) throw new Error('请先填写云效访问令牌并保存，或在本次请求中传入 token')

      const organizationId =
        typeof body.organizationId === 'string'
          ? body.organizationId.trim()
          : existing.yunxiao?.organizationId || remembered.organizationId || ''
      const spaceId =
        typeof body.spaceId === 'string' ? body.spaceId.trim() : existing.yunxiao?.spaceId || ''

      const wantDebug = Boolean(body.debug)
      const withDebug = (payload: Record<string, unknown>, debug: unknown) =>
        wantDebug ? { ...payload, debug } : payload

      if (action === 'organizations') {
        const result = await listYunxiaoOrganizations(endpoint, token)
        if (!result.ok) {
          if (wantDebug) return withDebug({ options: [], error: result.error }, result.debug)
          throw new Error(result.error || '获取企业列表失败')
        }
        return withDebug({ options: result.options }, result.debug)
      }
      if (action === 'projects') {
        const result = await listYunxiaoProjects(endpoint, token, organizationId)
        if (!result.ok) {
          if (wantDebug) return withDebug({ options: [], error: result.error }, result.debug)
          throw new Error(result.error || '获取项目列表失败')
        }
        return withDebug({ options: result.options, warning: result.error }, result.debug)
      }
      if (action === 'workitemTypes') {
        const category = typeof body.category === 'string' ? body.category : 'Bug'
        const result = await listYunxiaoWorkitemTypes(
          endpoint,
          token,
          organizationId,
          spaceId,
          category,
        )
        if (!result.ok) {
          if (wantDebug) return withDebug({ options: [], error: result.error }, result.debug)
          throw new Error(result.error || '获取缺陷类型失败')
        }
        return withDebug({ options: result.options }, result.debug)
      }
      if (action === 'members') {
        const result = await listYunxiaoMembers(endpoint, token, organizationId)
        if (!result.ok) {
          if (wantDebug) return withDebug({ options: [], error: result.error }, result.debug)
          throw new Error(result.error || '获取成员列表失败')
        }
        return withDebug({ options: result.options }, result.debug)
      }
      if (action === 'workitems') {
        const categoriesRaw = body.categories
        const categories = Array.isArray(categoriesRaw)
          ? categoriesRaw.map((c) => String(c).trim()).filter(Boolean)
          : typeof body.category === 'string' && body.category.trim()
            ? body.category.split(',').map((c: string) => c.trim()).filter(Boolean)
            : ['Req', 'Bug', 'Task']
        const result = await listYunxiaoWorkitems(
          endpoint,
          token,
          organizationId,
          spaceId,
          categories,
        )
        if (!result.ok) throw new Error(result.error || '获取工作项失败')
        return { items: result.items }
      }
      throw new Error('action 必须是 organizations|projects|workitemTypes|members|workitems')
    },
  })
}
